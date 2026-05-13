// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { ensureDir } from './files';

export const credentialStoreModeSchema = z.enum(['auto', 'keychain', 'file', 'ephemeral']);
export type CredentialStoreMode = z.infer<typeof credentialStoreModeSchema>;
export type CredentialStoreBackend = 'keychain' | 'file' | 'ephemeral';
export const DEFAULT_CREDENTIAL_PROFILE = 'default';

const SERVICE_NAME = 'viking-cli';
const LLM_SERVICE_NAME = 'viking-cli-llm';
const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), '.viking', 'credentials.json.enc');
const DEFAULT_LLM_CREDENTIALS_PATH = path.join(os.homedir(), '.viking', 'llm-credentials.json.enc');
const DEFAULT_MASTER_KEY_PATH = path.join(os.homedir(), '.viking', 'credentials.key');

const serviceCredentialsSchema = z.object({
  accessKeyId: z.string().min(1),
  secretKey: z.string().min(1),
  updatedAt: z.string().min(1)
});

const llmApiCredentialsSchema = z.object({
  provider: z.literal('openai-compatible'),
  apiKey: z.string().min(1),
  updatedAt: z.string().min(1)
});

const encryptedFileSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal('aes-256-gcm'),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1)
});

export type ServiceCredentials = z.infer<typeof serviceCredentialsSchema>;
export type LlmApiCredentials = z.infer<typeof llmApiCredentialsSchema>;

export interface CredentialStoreStatus {
  profile: string;
  serviceAccount: string;
  preferredMode: CredentialStoreMode;
  resolvedMode: CredentialStoreBackend;
  keychainSupported: boolean;
  credentialPath: string;
  masterKeyPath: string;
}

export interface CredentialLookupResult {
  credentials?: ServiceCredentials;
  backend: CredentialStoreBackend;
}

export interface LlmCredentialLookupResult {
  credentials?: LlmApiCredentials;
  backend: CredentialStoreBackend;
}

const ephemeralServiceCredentials = new Map<string, ServiceCredentials>();
const ephemeralLlmCredentials = new Map<string, LlmApiCredentials>();

export function parseCredentialStoreMode(rawValue: string): CredentialStoreMode {
  const normalized = rawValue.trim().toLowerCase();
  return credentialStoreModeSchema.parse(normalized);
}

export function resolveCredentialStoreMode(rawValue?: string): CredentialStoreMode {
  if (!rawValue || rawValue.trim().length === 0) return 'auto';
  return parseCredentialStoreMode(rawValue);
}

export function getCredentialStoreStatus(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): CredentialStoreStatus {
  const normalizedProfile = normalizeCredentialProfile(profile);
  const serviceAccount = getServiceAccount(normalizedProfile);
  const keychainSupported = isMacOsKeychainAvailable();
  return {
    profile: normalizedProfile,
    serviceAccount,
    preferredMode,
    resolvedMode: preferredMode === 'auto' ? (keychainSupported ? 'keychain' : 'file') : preferredMode,
    keychainSupported,
    credentialPath: DEFAULT_CREDENTIALS_PATH,
    masterKeyPath: DEFAULT_MASTER_KEY_PATH
  };
}

export function getLlmCredentialStoreStatus(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): CredentialStoreStatus {
  const normalizedProfile = normalizeCredentialProfile(profile);
  const serviceAccount = getLlmServiceAccount(normalizedProfile);
  const keychainSupported = isMacOsKeychainAvailable();
  return {
    profile: normalizedProfile,
    serviceAccount,
    preferredMode,
    resolvedMode: preferredMode === 'auto' ? (keychainSupported ? 'keychain' : 'file') : preferredMode,
    keychainSupported,
    credentialPath: DEFAULT_LLM_CREDENTIALS_PATH,
    masterKeyPath: DEFAULT_MASTER_KEY_PATH
  };
}

export function loadServiceCredentialsSync(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): CredentialLookupResult {
  const normalizedProfile = normalizeCredentialProfile(profile);
  if (preferredMode === 'ephemeral') {
    return {
      credentials: ephemeralServiceCredentials.get(getServiceAccount(normalizedProfile)),
      backend: 'ephemeral'
    };
  }

  if (preferredMode === 'keychain') {
    return {
      credentials: loadKeychainCredentialsSync(normalizedProfile),
      backend: 'keychain'
    };
  }

  if (preferredMode === 'file') {
    return {
      credentials: loadEncryptedFileCredentialsSync(normalizedProfile),
      backend: 'file'
    };
  }

  const keychainCredentials = isMacOsKeychainAvailable() ? loadKeychainCredentialsSync(normalizedProfile) : undefined;
  if (keychainCredentials) {
    return {
      credentials: keychainCredentials,
      backend: 'keychain'
    };
  }

  return {
    credentials: loadEncryptedFileCredentialsSync(normalizedProfile),
    backend: 'file'
  };
}

export function loadLlmApiCredentialsSync(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): LlmCredentialLookupResult {
  const normalizedProfile = normalizeCredentialProfile(profile);
  if (preferredMode === 'ephemeral') {
    return {
      credentials: ephemeralLlmCredentials.get(getLlmServiceAccount(normalizedProfile)),
      backend: 'ephemeral'
    };
  }

  if (preferredMode === 'keychain') {
    return {
      credentials: loadLlmKeychainCredentialsSync(normalizedProfile),
      backend: 'keychain'
    };
  }

  if (preferredMode === 'file') {
    return {
      credentials: loadEncryptedFileLlmCredentialsSync(normalizedProfile),
      backend: 'file'
    };
  }

  const keychainCredentials = isMacOsKeychainAvailable() ? loadLlmKeychainCredentialsSync(normalizedProfile) : undefined;
  if (keychainCredentials) {
    return {
      credentials: keychainCredentials,
      backend: 'keychain'
    };
  }

  return {
    credentials: loadEncryptedFileLlmCredentialsSync(normalizedProfile),
    backend: 'file'
  };
}

export function saveServiceCredentialsSync(
  credentials: ServiceCredentials,
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): CredentialStoreBackend {
  const normalized = serviceCredentialsSchema.parse(credentials);
  const normalizedProfile = normalizeCredentialProfile(profile);

  if (preferredMode === 'ephemeral') {
    ephemeralServiceCredentials.set(getServiceAccount(normalizedProfile), normalized);
    return 'ephemeral';
  }

  if (preferredMode === 'keychain') {
    saveKeychainCredentialsSync(normalized, normalizedProfile);
    return 'keychain';
  }

  if (preferredMode === 'file') {
    saveEncryptedFileCredentialsSync(normalized, normalizedProfile);
    return 'file';
  }

  if (isMacOsKeychainAvailable()) {
    saveKeychainCredentialsSync(normalized, normalizedProfile);
    return 'keychain';
  }

  saveEncryptedFileCredentialsSync(normalized, normalizedProfile);
  return 'file';
}

export function saveLlmApiCredentialsSync(
  credentials: LlmApiCredentials,
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): CredentialStoreBackend {
  const normalized = llmApiCredentialsSchema.parse(credentials);
  const normalizedProfile = normalizeCredentialProfile(profile);

  if (preferredMode === 'ephemeral') {
    ephemeralLlmCredentials.set(getLlmServiceAccount(normalizedProfile), normalized);
    return 'ephemeral';
  }

  if (preferredMode === 'keychain') {
    saveLlmKeychainCredentialsSync(normalized, normalizedProfile);
    return 'keychain';
  }

  if (preferredMode === 'file') {
    saveEncryptedFileLlmCredentialsSync(normalized, normalizedProfile);
    return 'file';
  }

  if (isMacOsKeychainAvailable()) {
    saveLlmKeychainCredentialsSync(normalized, normalizedProfile);
    return 'keychain';
  }

  saveEncryptedFileLlmCredentialsSync(normalized, normalizedProfile);
  return 'file';
}

export function deleteServiceCredentialsSync(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): { deleted: boolean; backends: CredentialStoreBackend[] } {
  const normalizedProfile = normalizeCredentialProfile(profile);
  const deletedBackends = new Set<CredentialStoreBackend>();
  let deleted = false;

  if (preferredMode === 'ephemeral') {
    deleted = ephemeralServiceCredentials.delete(getServiceAccount(normalizedProfile));
    if (deleted) deletedBackends.add('ephemeral');
    return { deleted, backends: [...deletedBackends] };
  }

  if (preferredMode === 'keychain' || preferredMode === 'auto') {
    const removed = deleteKeychainCredentialsSync(normalizedProfile);
    deleted ||= removed;
    if (removed) deletedBackends.add('keychain');
  }

  if (preferredMode === 'file' || preferredMode === 'auto') {
    const removed = deleteEncryptedFileCredentialsSync(normalizedProfile);
    deleted ||= removed;
    if (removed) deletedBackends.add('file');
  }

  return { deleted, backends: [...deletedBackends] };
}

export function deleteLlmApiCredentialsSync(
  preferredMode: CredentialStoreMode = 'auto',
  profile = DEFAULT_CREDENTIAL_PROFILE
): { deleted: boolean; backends: CredentialStoreBackend[] } {
  const normalizedProfile = normalizeCredentialProfile(profile);
  const deletedBackends = new Set<CredentialStoreBackend>();
  let deleted = false;

  if (preferredMode === 'ephemeral') {
    deleted = ephemeralLlmCredentials.delete(getLlmServiceAccount(normalizedProfile));
    if (deleted) deletedBackends.add('ephemeral');
    return { deleted, backends: [...deletedBackends] };
  }

  if (preferredMode === 'keychain' || preferredMode === 'auto') {
    const removed = deleteLlmKeychainCredentialsSync(normalizedProfile);
    deleted ||= removed;
    if (removed) deletedBackends.add('keychain');
  }

  if (preferredMode === 'file' || preferredMode === 'auto') {
    const removed = deleteEncryptedFileLlmCredentialsSync(normalizedProfile);
    deleted ||= removed;
    if (removed) deletedBackends.add('file');
  }

  return { deleted, backends: [...deletedBackends] };
}

function loadKeychainCredentialsSync(profile: string): ServiceCredentials | undefined {
  ensureMacOsKeychainAvailable();
  const result = spawnSync('security', ['find-generic-password', '-s', SERVICE_NAME, '-a', getServiceAccount(profile), '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    return undefined;
  }

  const raw = result.stdout.trim();
  if (!raw) return undefined;
  return parseStoredCredentialMap(raw, 'keychain')[getServiceAccount(profile)];
}

function saveKeychainCredentialsSync(credentials: ServiceCredentials, profile: string): void {
  ensureMacOsKeychainAvailable();
  const serialized = JSON.stringify(credentials);
  const result = spawnSync(
    'security',
    ['add-generic-password', '-U', '-s', SERVICE_NAME, '-a', getServiceAccount(profile), '-w', serialized],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to save credentials to macOS Keychain: ${result.stderr.trim() || result.stdout.trim() || 'unknown error'}`);
  }
}

function deleteKeychainCredentialsSync(profile: string): boolean {
  if (!isMacOsKeychainAvailable()) return false;
  const result = spawnSync('security', ['delete-generic-password', '-s', SERVICE_NAME, '-a', getServiceAccount(profile)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

function loadLlmKeychainCredentialsSync(profile: string): LlmApiCredentials | undefined {
  ensureMacOsKeychainAvailable();
  const result = spawnSync('security', ['find-generic-password', '-s', LLM_SERVICE_NAME, '-a', getLlmServiceAccount(profile), '-w'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    return undefined;
  }

  const raw = result.stdout.trim();
  if (!raw) return undefined;
  return parseStoredLlmCredentialMap(raw, 'keychain')[getLlmServiceAccount(profile)];
}

function saveLlmKeychainCredentialsSync(credentials: LlmApiCredentials, profile: string): void {
  ensureMacOsKeychainAvailable();
  const serialized = JSON.stringify(credentials);
  const result = spawnSync(
    'security',
    ['add-generic-password', '-U', '-s', LLM_SERVICE_NAME, '-a', getLlmServiceAccount(profile), '-w', serialized],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to save LLM credentials to macOS Keychain: ${result.stderr.trim() || result.stdout.trim() || 'unknown error'}`);
  }
}

function deleteLlmKeychainCredentialsSync(profile: string): boolean {
  if (!isMacOsKeychainAvailable()) return false;
  const result = spawnSync('security', ['delete-generic-password', '-s', LLM_SERVICE_NAME, '-a', getLlmServiceAccount(profile)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return result.status === 0;
}

function loadEncryptedFileCredentialsSync(profile: string): ServiceCredentials | undefined {
  if (!fs.existsSync(DEFAULT_CREDENTIALS_PATH)) return undefined;
  const encrypted = encryptedFileSchema.parse(
    JSON.parse(fs.readFileSync(DEFAULT_CREDENTIALS_PATH, 'utf8')) as unknown
  );
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }

  const plaintext = decryptWithKey(encrypted, key);
  const payload = parseStoredCredentialMap(plaintext, 'encrypted file');
  return payload[getServiceAccount(profile)];
}

function saveEncryptedFileCredentialsSync(credentials: ServiceCredentials, profile: string): void {
  fs.mkdirSync(path.dirname(DEFAULT_CREDENTIALS_PATH), { recursive: true, mode: 0o700 });
  const key = loadOrCreateMasterKeySync(true);
  if (!key) {
    throw new Error(`Failed to initialize credential key file: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const current = loadEncryptedFileCredentialsMapSync();
  current[getServiceAccount(profile)] = credentials;
  const encrypted = encryptWithKey(JSON.stringify(current), key);
  fs.writeFileSync(DEFAULT_CREDENTIALS_PATH, `${JSON.stringify(encrypted, null, 2)}\n`, { mode: 0o600 });
}

function deleteEncryptedFileCredentialsSync(profile: string): boolean {
  if (!fs.existsSync(DEFAULT_CREDENTIALS_PATH)) return false;
  const current = loadEncryptedFileCredentialsMapSync();
  const keyName = getServiceAccount(profile);
  if (!(keyName in current)) return false;
  delete current[keyName];
  if (Object.keys(current).length === 0) {
    fs.unlinkSync(DEFAULT_CREDENTIALS_PATH);
    return true;
  }
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const encrypted = encryptWithKey(JSON.stringify(current), key);
  fs.writeFileSync(DEFAULT_CREDENTIALS_PATH, `${JSON.stringify(encrypted, null, 2)}\n`, { mode: 0o600 });
  return true;
}

function loadEncryptedFileLlmCredentialsSync(profile: string): LlmApiCredentials | undefined {
  if (!fs.existsSync(DEFAULT_LLM_CREDENTIALS_PATH)) return undefined;
  const encrypted = encryptedFileSchema.parse(
    JSON.parse(fs.readFileSync(DEFAULT_LLM_CREDENTIALS_PATH, 'utf8')) as unknown
  );
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }

  const plaintext = decryptWithKey(encrypted, key);
  const payload = parseStoredLlmCredentialMap(plaintext, 'encrypted file');
  return payload[getLlmServiceAccount(profile)];
}

function saveEncryptedFileLlmCredentialsSync(credentials: LlmApiCredentials, profile: string): void {
  fs.mkdirSync(path.dirname(DEFAULT_LLM_CREDENTIALS_PATH), { recursive: true, mode: 0o700 });
  const key = loadOrCreateMasterKeySync(true);
  if (!key) {
    throw new Error(`Failed to initialize credential key file: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const current = loadEncryptedFileLlmCredentialsMapSync();
  current[getLlmServiceAccount(profile)] = credentials;
  const encrypted = encryptWithKey(JSON.stringify(current), key);
  fs.writeFileSync(DEFAULT_LLM_CREDENTIALS_PATH, `${JSON.stringify(encrypted, null, 2)}\n`, { mode: 0o600 });
}

function deleteEncryptedFileLlmCredentialsSync(profile: string): boolean {
  if (!fs.existsSync(DEFAULT_LLM_CREDENTIALS_PATH)) return false;
  const current = loadEncryptedFileLlmCredentialsMapSync();
  const keyName = getLlmServiceAccount(profile);
  if (!(keyName in current)) return false;
  delete current[keyName];
  if (Object.keys(current).length === 0) {
    fs.unlinkSync(DEFAULT_LLM_CREDENTIALS_PATH);
    return true;
  }
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const encrypted = encryptWithKey(JSON.stringify(current), key);
  fs.writeFileSync(DEFAULT_LLM_CREDENTIALS_PATH, `${JSON.stringify(encrypted, null, 2)}\n`, { mode: 0o600 });
  return true;
}

function loadOrCreateMasterKeySync(createIfMissing: boolean): Buffer | undefined {
  if (!fs.existsSync(DEFAULT_MASTER_KEY_PATH)) {
    if (!createIfMissing) return undefined;
    fs.mkdirSync(path.dirname(DEFAULT_MASTER_KEY_PATH), { recursive: true, mode: 0o700 });
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(DEFAULT_MASTER_KEY_PATH, generated, { mode: 0o600 });
  }

  const raw = fs.readFileSync(DEFAULT_MASTER_KEY_PATH, 'utf8').trim();
  if (!raw) {
    throw new Error(`Credential key file is empty: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  return Buffer.from(raw, 'hex');
}

function encryptWithKey(plaintext: string, key: Buffer): z.infer<typeof encryptedFileSchema> {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex')
  };
}

function decryptWithKey(payload: z.infer<typeof encryptedFileSchema>, key: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'hex')),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}

function parseStoredCredentialMap(raw: string, sourceLabel: string): Record<string, ServiceCredentials> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isServiceCredentialRecord(parsed)) {
      return { [getServiceAccount(DEFAULT_CREDENTIAL_PROFILE)]: serviceCredentialsSchema.parse(parsed) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected object');
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, serviceCredentialsSchema.parse(value)])
    );
  } catch (error) {
    throw new Error(`Failed to parse Viking credentials from ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseStoredLlmCredentialMap(raw: string, sourceLabel: string): Record<string, LlmApiCredentials> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isLlmCredentialRecord(parsed)) {
      return { [getLlmServiceAccount(DEFAULT_CREDENTIAL_PROFILE)]: llmApiCredentialsSchema.parse(parsed) };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected object');
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, llmApiCredentialsSchema.parse(value)])
    );
  } catch (error) {
    throw new Error(`Failed to parse Viking LLM credentials from ${sourceLabel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadEncryptedFileCredentialsMapSync(): Record<string, ServiceCredentials> {
  if (!fs.existsSync(DEFAULT_CREDENTIALS_PATH)) return {};
  const encrypted = encryptedFileSchema.parse(
    JSON.parse(fs.readFileSync(DEFAULT_CREDENTIALS_PATH, 'utf8')) as unknown
  );
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const plaintext = decryptWithKey(encrypted, key);
  return parseStoredCredentialMap(plaintext, 'encrypted file');
}

function loadEncryptedFileLlmCredentialsMapSync(): Record<string, LlmApiCredentials> {
  if (!fs.existsSync(DEFAULT_LLM_CREDENTIALS_PATH)) return {};
  const encrypted = encryptedFileSchema.parse(
    JSON.parse(fs.readFileSync(DEFAULT_LLM_CREDENTIALS_PATH, 'utf8')) as unknown
  );
  const key = loadOrCreateMasterKeySync(false);
  if (!key) {
    throw new Error(`Credential key file is missing: ${DEFAULT_MASTER_KEY_PATH}`);
  }
  const plaintext = decryptWithKey(encrypted, key);
  return parseStoredLlmCredentialMap(plaintext, 'encrypted file');
}

function ensureMacOsKeychainAvailable(): void {
  if (!isMacOsKeychainAvailable()) {
    throw new Error('macOS Keychain is not available. Use --store file or set credentials-store=file.');
  }
}

function isMacOsKeychainAvailable(): boolean {
  if (process.platform !== 'darwin') return false;
  const result = spawnSync('security', ['default-keychain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });

  if (result.error || result.status !== 0 || !result.stdout) return false;
  const trimmed = result.stdout.trim();
  if (!trimmed) return false;
  const match = trimmed.match(/"(.*)"/);
  const keychainPath = match ? match[1] : trimmed;
  return Boolean(keychainPath && fs.existsSync(keychainPath));
}

export async function ensureCredentialDirectories(): Promise<void> {
  await ensureDir(path.dirname(DEFAULT_CREDENTIALS_PATH));
}

function normalizeCredentialProfile(profile?: string): string {
  const normalized = (profile ?? DEFAULT_CREDENTIAL_PROFILE).trim();
  if (!normalized) {
    throw new Error('Credential profile cannot be empty.');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error(`Invalid credential profile: ${profile}`);
  }
  return normalized;
}

function getServiceAccount(profile: string): string {
  return `service.${normalizeCredentialProfile(profile)}`;
}

function getLlmServiceAccount(profile: string): string {
  return `llm.${normalizeCredentialProfile(profile)}`;
}

function isServiceCredentialRecord(value: unknown): value is ServiceCredentials {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'accessKeyId' in value && 'secretKey' in value;
}

function isLlmCredentialRecord(value: unknown): value is LlmApiCredentials {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'provider' in value && 'apiKey' in value;
}
