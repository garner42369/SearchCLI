// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

export type SearchMode = 'Balanced' | 'SemanticPriority' | 'KeywordPriority' | 'UserDefined';

export interface SpellCorrectionConfig {
  mode?: 'auto' | 'suggestion_only' | 'off';
}

export interface SynonymGroup {
  words: string[];
}

export interface SortRule {
  field: string;
  order?: 'asc' | 'desc';
  enable?: boolean;
}

export interface BoostBuryRule {
  name?: string;
  field: string;
  operator: string;
  value: unknown;
  weight: number;
  enable?: boolean;
}

export interface BoostBuryConfig {
  enabled?: boolean;
  rules?: BoostBuryRule[];
}

export interface ShuffleRule {
  disable?: boolean;
  name?: string;
  window_size?: number;
  recall_max?: number;
  field_name?: string;
  shuffle_type?: string;
  shuffle_expr?: Record<string, unknown>;
}

export interface ShuffleConfig {
  rules?: ShuffleRule[];
}

export interface UserInterest {
  user_interest_id: string;
  interest_field: string;
}

export interface PersonalizedRecall {
  enabled?: boolean;
  mode?: 'strong' | 'weak' | string;
  user_interest?: UserInterest[];
}

export interface AuxiliaryPool {
  name: string;
  filter?: Record<string, unknown>;
  enable?: boolean;
}

export interface RerankDoubaoConfig {
  item_feature?: string;
  instruction?: string;
}

export interface SearchDynamic {
  rerank_enabled?: boolean;
  rerank_topk?: number;
  max_retrieved_num?: number;
  enable_image?: boolean;
  dense_weight?: number;
  mode?: SearchMode | number;
  text_weight?: number;
  sort_rules?: SortRule[];
  synonyms?: SynonymGroup[];
  boost_bury_config?: BoostBuryConfig;
  spell_correction_config?: SpellCorrectionConfig;
  auxiliary_pools?: AuxiliaryPool[];
  shuffle_config?: ShuffleConfig;
  personalized_recall?: PersonalizedRecall;
  enable_rerank_with_hot?: boolean;
  rerank_model?: string;
  rerank_doubao_config?: RerankDoubaoConfig;
}

export interface SearchCase {
  id?: string;
  query: {
    text?: string;
    image_url?: string;
    image_query_instruction?: string;
  };
  dataset_id?: string;
  page_size?: number;
  page_number?: number;
  user?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  context?: Record<string, unknown>;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  output_fields?: string[];
  conditional_boost?: unknown[];
  disable_personalize?: boolean;
  expected_ids?: string[];
  relevance_tiers?: string[][];
  notes?: string;
}

export interface SearchResultItem {
  id: string;
  score?: number;
  title?: string;
  displayFields: Record<string, unknown>;
}

export interface SearchResponseShape {
  requestId?: string;
  totalItems: number;
  spellCorrection?: Record<string, unknown>;
  results: SearchResultItem[];
  raw: unknown;
}

export interface TuningObjective {
  name: string;
  metric: 'relevance' | 'qualitative';
  description: string;
  customerGoal: string;
  themes: string[];
}

export interface CandidateStrategy {
  id: string;
  title: string;
  rationale: string;
  searchDynamic: SearchDynamic;
}

export interface CaseEvaluation {
  caseId: string;
  notes?: string;
  query: SearchCase['query'];
  expectedIds: string[];
  relevanceTiers: string[][];
  topIds: string[];
  ndcgAt10: number;
  reciprocalRank: number;
  recallAt10: number;
}

export interface QualitativeDiff {
  caseId: string;
  notes?: string;
  query: SearchCase['query'];
  baselineTopIds: string[];
  candidateTopIds: string[];
  baselineTitles: string[];
  candidateTitles: string[];
}

export interface CandidateEvaluationSummary {
  candidate: CandidateStrategy;
  labeledCount: number;
  unlabeledCount: number;
  averageNdcgAt10?: number;
  averageReciprocalRank?: number;
  averageRecallAt10?: number;
  labeledCases: CaseEvaluation[];
  unlabeledCases: QualitativeDiff[];
}

export interface TuningPlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  detail?: string;
}

export interface TuningPlanArtifact {
  id: string;
  goal: string;
  summary?: string;
  steps: TuningPlanStep[];
}

export interface RunCaseInsight {
  id: string;
  runId: string;
  caseId: string;
  issueType: 'lexical_gap' | 'rerank_gap' | 'recall_gap' | 'hotness_bias' | 'diversity_gap' | 'unknown';
  severity: 'low' | 'medium' | 'high';
  queryText: string;
  summary: string;
  recommendation?: string;
  evidence: string[];
  baselineTopIds: string[];
  candidateTopIds?: string[];
  deltaNdcg?: number;
  deltaMrr?: number;
  deltaRecall?: number;
  candidateId?: string;
}

export interface TuningArtifactManifest {
  generatedAt: string;
  runId: string;
  reportMarkdownPath: string;
  reportJsonPath: string;
  planPath?: string;
  caseInsightsPath?: string;
  recommendedCandidatePath?: string;
}

export interface TuningRunReport {
  runId: string;
  generatedAt: string;
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  objective: TuningObjective;
  feedback: string;
  plan?: TuningPlanArtifact;
  baseline?: CandidateEvaluationSummary;
  candidates: CandidateEvaluationSummary[];
  caseInsights?: RunCaseInsight[];
  artifactManifest?: TuningArtifactManifest;
  recommendedCandidateId?: string;
  notes: string[];
}

export interface FieldCatalog {
  filterableFields?: string[];
  sortableFields?: string[];
  searchableFields?: string[];
}

export interface RuntimeConfig {
  baseUrl: string;
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  accessKeyId?: string;
  secretKey?: string;
  region: string;
  timeoutMs: number;
  defaultPageSize: number;
  outputDir: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmAccessKeyId?: string;
  llmSecretKey?: string;
  llmRegion?: string;
  llmService?: string;
  llmModel?: string;
}
