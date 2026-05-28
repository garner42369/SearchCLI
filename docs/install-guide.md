# Search CLI 安装与配置引导（宿主机版）

请只在我电脑宿主机的真实终端里执行 Search CLI 相关的安装与配置命令。

## 0. 基本约定

- Search CLI 的底层二进制文件名称和命令前缀均使用 `vs`，例如 `vs-macos-arm64`、`vs-linux-x64`、`vs-win-x64.exe`。
- 相关的环境变量始终以 `VIKING_` 开头，例如 `VIKING_AK`、`VIKING_SK`、`VIKING_CONTROL_PLANE_BASE_URL`、`VIKING_DATA_PLANE_BASE_URL`、`VIKING_REGION`。
- `vs` 同时维护两个 base URL：
  - **控制面 (control plane)**：OpenAPI 管控类调用，例如 `app create/list/get`、`dataset create/list`、`auth status`、`doctor` 等。
  - **数据面 (data plane)**：运行时数据类调用，例如 `search run`、`chat run`、`recommend run`、`data write/list/get/delete`、`search tune` 的实跑环节、`query_completion` 等。
- 任何底层二进制命令（包括 `--help`、`skill install`、环境变量检查、`auth`、`doctor`）都不要在 sandbox 里执行。如果你当前拿不到宿主机真实终端权限，请先停下来说明，不要继续尝试。

## 1. 前置假设

1. 这台电脑之前没有安装过 Search CLI。
2. 我已经下载好了当前操作系统对应的底层二进制文件，文件名中包含 `vs`。
   - 如果你不知道这个二进制文件的路径，**只能先问我**，不能猜，也不能全盘搜索。
3. 在进入第 7 步「全局化建议」之前，必须**始终使用二进制的绝对路径**执行命令。
   - 不要 clone 仓库。
   - 不要修改 PATH。
   - 不要复制或重命名二进制。
   - 不要尝试把它安装成全局命令。

## 2. 不同操作系统的命令风格

### 2.1 Windows PowerShell

始终使用如下形式：

```powershell
& "<二进制绝对路径>" --help
& "<二进制绝对路径>" skill install all
```

### 2.2 macOS / Linux

直接用二进制绝对路径执行命令。在首次执行任何命令前，先确保拥有执行权限：

```bash
chmod +x <二进制绝对路径>
```

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

## 4. 基础检查与 Skill 安装

按顺序执行以下两条命令：

### 4.1 帮助信息自检

```bash
<二进制绝对路径> --help
```

> **macOS 注意**：如果该命令执行后 10 秒内没有任何输出，可能是被系统 Gatekeeper 拦截。请立即停止等待，并提示我进入「系统设置 → 隐私与安全性」中允许运行，等待我处理完再继续。

### 4.2 安装全部 skill

```bash
<二进制绝对路径> skill install all --json
```

> 该命令需要联网下载，可能耗时较长，请耐心等待其完成，不要强行打断。

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
<二进制绝对路径> auth import-env
```

`auth import-env` 会一并把这些环境变量持久化进 `~/.viking/config.json`（`controlPlaneBaseUrl` / `dataPlaneBaseUrl` / `environmentId`）。

### 5.3 不存在 AK/SK：判断终端类型

继续之前，先判断当前宿主机真实终端是否为交互式 TTY。

#### 5.3.1 交互式 TTY：使用 `auth login`

```bash
<二进制绝对路径> auth login [--control-plane-base-url <CONTROL_PLANE_BASE_URL>] [--data-plane-base-url <DATA_PLANE_BASE_URL>] [--region <REGION>]
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
<二进制绝对路径> auth import-env
```

### 5.4 环境变量读取兜底

如果你发现你的执行环境无法读取到我手动设置的环境变量，请指导我在当前真实终端里手动执行一次：

```bash
<二进制绝对路径> auth import-env
```

然后再由你接管后续流程。

### 5.5 安全约束

**绝对不要要求我把 AK/SK 发到对话里。**

## 6. 授权后的验证（必须做地址核对）

### 6.1 依次执行验证命令

```bash
<二进制绝对路径> auth status --json
<二进制绝对路径> doctor --json
<二进制绝对路径> skill list --json
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
- 如果**不一致**，立刻停下来，提示我使用下方任一方式修正，并在修正后**重新执行** `auth status --json`，直到完全一致才能继续。

#### 方式 A · 重新登录覆盖（推荐持久化）

```bash
<二进制绝对路径> auth login --control-plane-base-url <CONTROL_PLANE_BASE_URL> --data-plane-base-url <DATA_PLANE_BASE_URL> --region <REGION>
```

> 简便写法：只传 `--base-url <CONTROL or DATA>`，CLI 会按内置环境表自动补齐另一面。

#### 方式 B · 通过环境变量再导入一次

```bash
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
# 或者只导出兼容变量：export VIKING_BASE_URL=<CONTROL or DATA>
<二进制绝对路径> auth import-env
```

#### 方式 C · 多环境隔离（推荐同时维护多套环境）

```bash
<二进制绝对路径> auth login --profile <env-name> --control-plane-base-url <CONTROL_PLANE_BASE_URL> --data-plane-base-url <DATA_PLANE_BASE_URL> --region <REGION>
<二进制绝对路径> auth use <env-name>
```

## 7. 全局化建议（非常重要）

第 6 步全部验证通过后，你必须主动向我提出以下建议：

> 「目前只能通过绝对路径调用 `vs`。为了后续在其他终端或新的 AI 会话中也能直接使用 `vs` 命令，建议将该二进制移动到系统 PATH 目录（例如 macOS/Linux 下的 `/usr/local/bin/vs`）。请问是否需要我帮您执行此全局安装操作？」

### 7.1 我回答「是」

提供并执行对应操作。

#### macOS / Linux 示例

```bash
sudo mv <二进制绝对路径> /usr/local/bin/vs
sudo chmod +x /usr/local/bin/vs
```

#### Windows 示例

指导我把二进制所在目录加入 PATH，或把二进制改名为 `vs.exe` 并移入已在 PATH 中的目录。

### 7.2 我回答「否」

本轮任务结束。

## 8. 失败处理

任何一步失败时，立即停止，并告诉我：

- **失败命令**
- **完整错误输出**
- **你的判断**
- **下一步建议**

### 8.1 特别约束

- 如果 `auth status --json` 中的 `controlPlaneBaseUrl` / `dataPlaneBaseUrl` / `region` 与第 3 步声明的目标不一致，必须当作失败处理，停止后续步骤直到修正完成。
- 如果 `doctor --json` 中任何 `ok: false` 项与地址、鉴权相关，按 6.3 中的方式 A / B 重试，不要跳过。
