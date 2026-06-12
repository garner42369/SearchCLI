# Search CLI 安装与配置引导（宿主机版）

请只在我电脑宿主机的真实终端里执行 Search CLI 相关的安装与配置命令。

## 0. 基本约定

- Search CLI 的命令前缀统一为 `vs`，安装完成后即可直接调用。
- 相关的环境变量始终以 `VIKING_` 开头，例如 `VIKING_AK`、`VIKING_SK`、`VIKING_CONTROL_PLANE_BASE_URL`、`VIKING_DATA_PLANE_BASE_URL`、`VIKING_REGION`。
- `vs` 同时维护两个 base URL：
  - **控制面 (control plane)**：OpenAPI 管控类调用，例如 `app create/list/get`、`dataset create/list`、`auth status`、`doctor` 等。
  - **数据面 (data plane)**：运行时数据类调用，例如 `search run`、`chat run`、`recommend run`、`data write/list/get/delete`、`search tune` 的实跑环节、`query_completion` 等。
- 任何 `vs` 命令（包括 `--help`、`skill install`、环境变量检查、`auth`、`doctor`）都不要在 sandbox 里执行。如果你当前拿不到宿主机真实终端权限，请先停下来说明，不要继续尝试。

## 1. 前置假设

1. 这台电脑之前没有安装过 Search CLI。
2. 宿主机已经具备以下基础环境：
   - `git`
   - Node.js **20 或更新版本**
   - `npm`
   - 如果其中任何一项缺失，请先停下来提示我安装，不要绕过。
3. 安装来源固定为 GitHub 官方仓库：`https://github.com/volcengine/SearchCLI`。
   - 不要从其他渠道下载预编译二进制文件。
   - 不要尝试手动复制 / 改名某个 `vs` 二进制。

## 2. 不同操作系统的命令风格

### 2.1 Windows PowerShell

直接调用 `vs`，安装脚本会通过 `npm install --global` 把它注册为全局命令：

```powershell
vs --help
vs skill list
```

如果 PowerShell 不识别 `vs`，请先确认 npm 全局 bin 目录已加入 PATH（参考 `npm config get prefix`）。

### 2.2 macOS / Linux

直接执行 `vs` 命令即可：

```bash
vs --help
```

如果 shell 提示 `command not found: vs`，请确认 `$(npm config get prefix)/bin` 已经在 `PATH` 中。

## 3. 部署环境预检（执行任何 `vs` 命令前必问）

在执行任何 `vs` 命令之前，请先向我确认目标环境，**不要替我猜默认值**。

### 3.1 目标环境列表

目前 Search CLI 仅支持以下三个固定环境，请问我属于哪一种：

| 编号 | 环境                       | `<CONTROL_PLANE_BASE_URL>`                                | `<DATA_PLANE_BASE_URL>`                                | `<REGION>`        |
| ---- | -------------------------- | --------------------------------------------------------- | ------------------------------------------------------ | ----------------- |
| 1    | 火山公有云 · 北京          | `https://aisearch.cn-beijing.volcengineapi.com`           | `https://aisearch.cn-beijing.volces.com`               | `cn-beijing`      |
| 2    | 火山公有云 · 柔佛          | `https://aisearch.ap-southeast-1.volcengineapi.com`       | `https://aisearch.ap-southeast-1.volces.com`           | `ap-southeast-1`  |
| 3    | BytePlus 公有云 · 柔佛     | `https://aisearch.ap-southeast-1.byteplusapi.com`         | `https://aisearch.ap-southeast-1.bytepluses.com`       | `ap-southeast-1`  |

> 旧版 `--base-url` 仍然兼容：传入任一支持的控制面或数据面域名，CLI 会按上表自动补齐另一面，并写入到 `~/.viking/config.json` 的 `controlPlaneBaseUrl` / `dataPlaneBaseUrl` 字段。

### 3.2 默认值（编号 1）

环境 **1（火山公有云 · 北京）** 与 CLI 内置默认值一致，可以省略 `--control-plane-base-url` / `--data-plane-base-url` / `--region`：

- `<CONTROL_PLANE_BASE_URL>` = `https://aisearch.cn-beijing.volcengineapi.com`
- `<DATA_PLANE_BASE_URL>`    = `https://aisearch.cn-beijing.volces.com`
- `<REGION>`                 = `cn-beijing`

### 3.3 非默认环境（编号 2、3）

环境 **2、3** 与默认值不同，必须按以下规则之一显式传值：

- 推荐：在 `auth login` / `auth import-env` 中同时带上 `--control-plane-base-url <CONTROL_PLANE_BASE_URL>` 与 `--data-plane-base-url <DATA_PLANE_BASE_URL>`，再带上 `--region <REGION>`。
- 简便：只传 `--base-url`（控制面或数据面其一），CLI 会按上表自动补齐另一面。
- 环境变量：在真实终端中导出 `VIKING_CONTROL_PLANE_BASE_URL` / `VIKING_DATA_PLANE_BASE_URL` / `VIKING_REGION`（兼容老变量 `VIKING_BASE_URL`）。
- 由于环境 2、3 的 `<REGION>` 同为 `ap-southeast-1`，必须严格区分域名后缀：
  - 火山公有云控制面使用 `volcengineapi.com`，数据面使用 `volces.com`。
  - BytePlus 公有云控制面使用 `byteplusapi.com`，数据面使用 `bytepluses.com`。

### 3.4 不在列表中的环境

如果我声称的环境不在以上三个中（例如自建 / 灰度 / 私有化），请**先停下来确认**，不要继续猜测。这种情况下 `--base-url` 自动推导会失败，必须由我提供成对的 `<CONTROL_PLANE_BASE_URL>` 与 `<DATA_PLANE_BASE_URL>` 之后再继续。

记下 `<CONTROL_PLANE_BASE_URL>` / `<DATA_PLANE_BASE_URL>` 与 `<REGION>`，后续 `auth login` / `auth import-env` 都要带上。

## 4. 从 GitHub 安装 Search CLI

### 4.1 Clone 仓库并运行安装脚本

在宿主机的真实终端里执行：

```bash
git clone https://github.com/volcengine/SearchCLI.git vs
cd vs
bash ./scripts/install.sh
```

如果你更习惯使用 SSH：

```bash
git clone git@github.com:volcengine/SearchCLI.git vs
cd vs
bash ./scripts/install.sh
```

`scripts/install.sh` 会完成下列动作：

- 校验 Node.js 版本（要求 `>= 20`）。
- `npm install` 安装依赖。
- `npm run validate:skills` 与 `npm run build` 校验并构建 dist。
- `npm install --global .` 将 `vs` 注册为全局命令。

> Windows 用户请在 Git Bash / WSL 中执行 `bash ./scripts/install.sh`，或参考仓库 README 使用等价的 `npm` 步骤。

### 4.2 帮助信息自检

```bash
vs --help
```

> **macOS 注意**：若是首次安装，且该命令执行后 10 秒内仍没有任何输出，可能是被系统 Gatekeeper 拦截。请立即停止等待，并提示我进入「系统设置 → 隐私与安全性」中允许运行，等待我处理完再继续。

### 4.3 安装 skill（必须先确认安装目标）

`vs skill install` 会把 Viking skill 文件拷贝到不同 agent 客户端的 skill 目录下。**不要直接执行 `vs skill install all`，这会把 skill 写入用户用不上的 agent 目录里**。请先向我确认这台电脑上**实际在用的 agent 客户端**，再按目标显式传入 `--target`。

#### 4.3.1 询问目标客户端

请先问我：

> 「请问您希望把 Viking skill 安装给哪些 agent 客户端使用？支持以下几种，可多选：
> - `codex`：写入 `$CODEX_HOME/skills`，默认 `~/.codex/skills`
> - `agents`：写入 `$AGENTS_HOME/skills`，默认 `~/.agents/skills`
> - `trae`：写入 `$TRAE_HOME/skills`，默认 `~/.trae/skills`
> - `trae-cn`：写入 `$TRAE_CN_HOME/skills`，默认 `~/.trae-cn/skills`
> - `global`：仅安装到当前已经存在的上述目录（如果都不存在则不安装）」

如果我答不上来，请**先停下**，让我自己确认正在使用的 agent 客户端，不要替我猜。

#### 4.3.2 按选择执行安装

确认后，使用对应的 `--target` 调用：

```bash
# 单一目标示例
vs skill install all --target trae-cn --json
vs skill install all --target codex   --json
vs skill install all --target agents  --json
vs skill install all --target trae    --json

# 仅安装到当前已存在的 agent 目录（保守做法）
vs skill install all --target global --json
```

如果我同时使用多个客户端，请**逐个 target 分别执行一次**，而不是一次性覆盖到全部目录。

> 该命令需要联网下载，可能耗时较长，请耐心等待其完成，不要强行打断。

#### 4.3.3 仅安装少量 skill（可选）

如果我只需要其中部分 skill，可以列出名称代替 `all`，例如：

```bash
vs skill install vs-shared vs-search --target trae-cn --json
```

可以通过下列命令先查看仓库内可用的 skill：

```bash
vs skill list --json
```

#### 4.3.4 权限问题兜底（必读）

`vs skill install` 在写入 `~/.codex/skills`、`~/.agents/skills`、`~/.trae/skills`、`~/.trae-cn/skills` 等目录时，可能因为以下原因出现权限错误（常见错误关键字：`EACCES`、`permission denied`、`EPERM`、`mkdir … not permitted`）：

- 目标目录由其他用户或 `sudo` 创建，当前用户无写入权限。
- 目录归属于受系统保护的位置，或被 IDE / agent 客户端锁定。
- 在沙箱 / 受限执行环境下没有访问宿主机用户目录的权限。

遇到权限问题时**不要尝试自动 `sudo` 或修改文件归属**，必须**停下来，把命令交给我手动执行**：

1. 先把失败的完整命令原样贴出来，例如：

   ```bash
   vs skill install all --target trae-cn --json
   ```

2. 提示我「请您在自己的真实终端里手动执行上面的命令；如果仍报权限错误，可改用以下任一方式自行处理：」

   ```bash
   # 方式 A：先修复目标目录归属（按需把 trae-cn 换成你实际选择的 target 目录）
   sudo chown -R "$USER" ~/.trae-cn/skills
   vs skill install all --target trae-cn --json

   # 方式 B：用一次性的 sudo 直接执行安装
   sudo -E env "PATH=$PATH" vs skill install all --target trae-cn --json
   ```

3. 等我回复「已执行完成」后，再继续后续步骤；在我确认之前，**不要替我重试，也不要跳过 skill 安装直接进入下一步**。

如果是非交互式 / 沙箱环境，连提示都无法等到我回复，请直接停止任务并向我说明：「skill 安装因权限受阻，需要您在宿主机真实终端手动执行 `vs skill install ... --target <target>`，完成后再继续。」

## 5. 授权流程（按优先级处理）

### 5.1 检测现有环境变量

先检查当前宿主机真实终端环境里是否已有 `VIKING_AK` 和 `VIKING_SK`。

### 5.2 已存在 AK/SK：使用 `auth import-env`

如果第 3 步用户提供了非默认环境，请先指导我在真实终端中导出对应环境变量（任选其一）：

```bash
# 推荐：同时声明两面 URL
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>

# 或：使用 legacy 单地址变量，让 CLI 按内置环境表自动补齐另一面
export VIKING_BASE_URL=<CONTROL_PLANE_BASE_URL or DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
```

然后执行：

```bash
vs auth import-env
```

`auth import-env` 会一并把这些环境变量持久化进 `~/.viking/config.json`（`controlPlaneBaseUrl` / `dataPlaneBaseUrl` / `environmentId`）。

### 5.3 不存在 AK/SK：判断终端类型

继续之前，先判断当前宿主机真实终端是否为交互式 TTY。

#### 5.3.1 交互式 TTY：使用 `auth login`

```bash
vs auth login [--control-plane-base-url <CONTROL_PLANE_BASE_URL>] [--data-plane-base-url <DATA_PLANE_BASE_URL>] [--region <REGION>]
```

- 仅在第 3 步用户选择了非默认环境时才追加 `--control-plane-base-url` / `--data-plane-base-url` / `--region`。也可以只传 `--base-url <CONTROL or DATA>`，CLI 会按内置环境表自动补齐另一面。
- 然后停在输入提示处，等待我在那个真实终端里输入 AK/SK。

#### 5.3.2 非交互式终端：指导我手动设置后再 import

不要执行 `auth login`。直接告诉我应该在真实终端里输入什么命令：

```bash
export VIKING_AK=<...>
export VIKING_SK=<...>
# 推荐：同时声明两面 URL（仅非默认环境需要）
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
# 或：legacy 单地址变量
# export VIKING_BASE_URL=<CONTROL or DATA>
```

等我回复「已设置完成」后，再执行：

```bash
vs auth import-env
```

### 5.4 环境变量读取兜底

如果你发现你的执行环境无法读取到我手动设置的环境变量，请指导我在当前真实终端里手动执行一次：

```bash
vs auth import-env
```

然后再由你接管后续流程。

### 5.5 安全约束

**绝对不要要求我把 AK/SK 发到对话里。**

## 6. 授权后的验证（必须做地址核对）

### 6.1 依次执行验证命令

```bash
vs auth status --json
vs doctor --json
vs skill list --json
```

并展示关键结果。

### 6.2 默认配置参考

`auth status --json` 在默认环境下应返回类似：

```json
{
  "activeProfile": "default",
  "profiles": {
    "default": {
      "controlPlaneBaseUrl": "https://aisearch.cn-beijing.volcengineapi.com",
      "dataPlaneBaseUrl": "https://aisearch.cn-beijing.volces.com",
      "region": "cn-beijing",
      "environmentId": "volc-cn-beijing",
      "credentialStore": "auto",
      "timeoutMs": 15000
    }
  },
  "credentialStore": "auto",
  "service": "aisearch"
}
```

### 6.3 地址核对硬约束

重点核对 `auth status --json` 输出中的 `controlPlaneBaseUrl`、`dataPlaneBaseUrl` 与 `region` 字段：

- 如果与第 3 步收集的 `<CONTROL_PLANE_BASE_URL>` / `<DATA_PLANE_BASE_URL>` / `<REGION>` **完全一致**，进入第 7 步。
- 如果**不一致**，立刻停下来，提示我使用下方任一方式修正，并在修正后**重新执行** `vs auth status --json`，直到完全一致才能继续。

#### 方式 A · 重新登录覆盖（推荐持久化）

```bash
vs auth login --control-plane-base-url <CONTROL_PLANE_BASE_URL> --data-plane-base-url <DATA_PLANE_BASE_URL> --region <REGION>
```

> 简便写法：只传 `--base-url <CONTROL or DATA>`，CLI 会按内置环境表自动补齐另一面。

#### 方式 B · 通过环境变量再导入一次

```bash
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
# 或者只导出兼容变量：export VIKING_BASE_URL=<CONTROL or DATA>
vs auth import-env
```

#### 方式 C · 多环境隔离（推荐同时维护多套环境）

```bash
vs auth login --profile <env-name> --control-plane-base-url <CONTROL_PLANE_BASE_URL> --data-plane-base-url <DATA_PLANE_BASE_URL> --region <REGION>
vs auth use <env-name>
```

## 7. 安装后自检与升级

`scripts/install.sh` 已经通过 `npm install --global .` 把 `vs` 注册为全局命令，正常情况下你可以在任意终端里直接调用 `vs`。

### 7.1 `vs` 不在 PATH 中

如果在新终端里执行 `vs` 显示「command not found」（或 PowerShell 不识别 `vs`），请提示我执行：

```bash
npm config get prefix
```

并把返回路径下的 `bin`（macOS / Linux）或安装目录（Windows）加入 `PATH` 后重新打开终端。

### 7.2 升级到最新版本

后续要升级时，回到 clone 出来的仓库目录执行：

```bash
git pull
bash ./scripts/install.sh
```

`install.sh` 会重新构建并通过 `npm install --global .` 覆盖旧版本。

### 7.3 卸载

```bash
npm uninstall --global viking-cli
```

> 包名取自仓库 `package.json` 中的 `name` 字段（当前为 `viking-cli`）。如果不确定，可执行 `npm ls -g --depth=0` 查看已全局安装的包。

## 8. 失败处理

任何一步失败时，立即停止，并告诉我：

- **失败命令**
- **完整错误输出**
- **你的判断**
- **下一步建议**

### 8.1 特别约束

- 如果 `vs auth status --json` 中的 `controlPlaneBaseUrl` / `dataPlaneBaseUrl` / `region` 与第 3 步声明的目标不一致，必须当作失败处理，停止后续步骤直到修正完成。
- 如果 `vs doctor --json` 中任何 `ok: false` 项与地址、鉴权相关，按 6.3 中的方式 A / B 重试，不要跳过。
- 如果 `bash ./scripts/install.sh` 失败，先检查 Node.js 版本（必须 `>= 20`）以及网络是否能访问 `npmjs.org` 与 `github.com`，再决定是否重试。
