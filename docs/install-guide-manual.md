# Search CLI 安装与配置指南（手动执行版）

> 适用对象：希望自己在宿主机真实终端里逐条执行命令完成安装的用户。本文不依赖 agent 代为决策，所有需要确认的地方都改为「请你自己根据情况判断」。

## 0. 基本约定

- Search CLI 命令前缀统一为 `vs`，安装完成后直接调用。
- 环境变量统一以 `VIKING_` 开头：`VIKING_AK`、`VIKING_SK`、`VIKING_CONTROL_PLANE_BASE_URL`、`VIKING_DATA_PLANE_BASE_URL`、`VIKING_REGION`。
- `vs` 同时维护两个 base URL：
  - **控制面 (control plane)**：管控类调用，例如 `app create/list/get`、`dataset create/list`、`auth status`、`doctor`。
  - **数据面 (data plane)**：运行时数据类调用，例如 `search run`、`chat run`、`recommend run`、`data write/list/get/delete`、`query_completion`。
- 所有 `vs` 命令必须在你电脑的真实终端中执行，不要放进任何沙箱。

## 1. 前置要求

请先在终端里自查以下条件，缺什么就先装什么：

```bash
git --version
node --version   # 必须 >= 20
npm --version
```

安装来源固定为 GitHub 官方仓库 `https://github.com/volcengine/SearchCLI`，请勿从其他渠道获取二进制。

## 2. 选择你的目标环境（关键）

Search CLI 目前仅支持以下三种环境，请**先确认你属于哪一种**，把对应的三个值记下来，后续命令都会用到：

| 编号 | 环境                       | `<CONTROL_PLANE_BASE_URL>`                          | `<DATA_PLANE_BASE_URL>`                          | `<REGION>`        |
| ---- | -------------------------- | --------------------------------------------------- | ------------------------------------------------ | ----------------- |
| 1    | 火山公有云 · 北京          | `https://aisearch.cn-beijing.volcengineapi.com`     | `https://aisearch.cn-beijing.volces.com`         | `cn-beijing`      |
| 2    | 火山公有云 · 柔佛          | `https://aisearch.ap-southeast-1.volcengineapi.com` | `https://aisearch.ap-southeast-1.volces.com`     | `ap-southeast-1`  |
| 3    | BytePlus 公有云 · 柔佛     | `https://aisearch.ap-southeast-1.byteplusapi.com`   | `https://aisearch.ap-southeast-1.bytepluses.com` | `ap-southeast-1`  |

说明：

- 编号 **1** 与 CLI 内置默认值一致，所有 `--control-plane-base-url` / `--data-plane-base-url` / `--region` 参数都可以省略。
- 编号 **2、3** 必须显式传 URL 与 region；也可以只传 `--base-url <CONTROL or DATA>`，CLI 会按内置表自动补齐另一面。
- 编号 2、3 的 region 都是 `ap-southeast-1`，请严格区分域名后缀：
  - 火山公有云：控制面 `volcengineapi.com`，数据面 `volces.com`。
  - BytePlus：控制面 `byteplusapi.com`，数据面 `bytepluses.com`。
- 如果你的环境不在以上三个里（自建 / 灰度 / 私有化），需要自行准备成对的 `<CONTROL_PLANE_BASE_URL>` 与 `<DATA_PLANE_BASE_URL>`。

## 3. 从 GitHub 安装

### 3.1 Clone 仓库并执行安装脚本

```bash
git clone https://github.com/volcengine/SearchCLI.git vs
cd vs
bash ./scripts/install.sh
```

SSH 用户：

```bash
git clone git@github.com:volcengine/SearchCLI.git vs
cd vs
bash ./scripts/install.sh
```

`scripts/install.sh` 会依次完成：

1. 校验 Node.js 版本（`>= 20`）。
2. `npm install` 装依赖。
3. `npm run validate:skills` 与 `npm run build` 校验并构建 dist。
4. `npm install --global .` 把 `vs` 注册为全局命令。

> Windows 用户：在 Git Bash 或 WSL 中执行 `bash ./scripts/install.sh`，或参考仓库 README 的等价 npm 步骤。

### 3.2 自检

```bash
vs --help
```

- 若执行后长时间无输出，**macOS 首次安装**可能被 Gatekeeper 拦截。请到「系统设置 → 隐私与安全性」放行后重试。
- 若提示 `command not found: vs`：

  ```bash
  npm config get prefix
  ```

  把返回路径下的 `bin`（macOS / Linux）或安装目录（Windows）加入 `PATH` 后重开终端。

## 4. 配置授权

### 4.1 选择导入方式

- **已有 `VIKING_AK` / `VIKING_SK` 环境变量** → 走 4.2 `auth import-env`。
- **没有环境变量，且终端是交互式 TTY** → 走 4.3 `auth login`。
- **非交互式终端（CI / 容器 / 脚本）** → 走 4.4 手动 export 后再 import。

### 4.2 已有 AK/SK：使用 `auth import-env`

非默认环境（编号 2、3）需先 export：

```bash
# 推荐：同时声明两面 URL
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>

# 或：仅 legacy 单地址变量，CLI 自动补齐另一面
export VIKING_BASE_URL=<CONTROL_PLANE_BASE_URL or DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
```

执行：

```bash
vs auth import-env
```

它会把 AK/SK 与上述 URL 持久化到 `~/.viking/config.json`。

### 4.3 交互式 TTY：使用 `auth login`

默认环境（编号 1）：

```bash
vs auth login
```

非默认环境（编号 2、3）：

```bash
vs auth login \
  --control-plane-base-url <CONTROL_PLANE_BASE_URL> \
  --data-plane-base-url <DATA_PLANE_BASE_URL> \
  --region <REGION>
```

或简写：

```bash
vs auth login --base-url <CONTROL_PLANE_BASE_URL or DATA_PLANE_BASE_URL> --region <REGION>
```

按提示在终端里输入 AK / SK 即可。

### 4.4 非交互式终端：先 export 再 import

```bash
export VIKING_AK=<...>
export VIKING_SK=<...>
# 非默认环境补充：
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>

vs auth import-env
```

> ⚠️ 安全提醒：不要把 AK/SK 粘到聊天工具、Issue、PR、日志或截图里。

## 5. 授权后验证

```bash
vs auth status --json
vs doctor --json
```

默认环境下 `auth status --json` 应类似：

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

请逐项核对 `controlPlaneBaseUrl` / `dataPlaneBaseUrl` / `region` 是否与第 2 步选择的环境**完全一致**。如果不一致，任选下面一种方式修正后重新执行 `vs auth status --json` 验证：

**方式 A · 重新登录覆盖**

```bash
vs auth login \
  --control-plane-base-url <CONTROL_PLANE_BASE_URL> \
  --data-plane-base-url <DATA_PLANE_BASE_URL> \
  --region <REGION>
```

**方式 B · 通过环境变量再 import**

```bash
export VIKING_CONTROL_PLANE_BASE_URL=<CONTROL_PLANE_BASE_URL>
export VIKING_DATA_PLANE_BASE_URL=<DATA_PLANE_BASE_URL>
export VIKING_REGION=<REGION>
vs auth import-env
```

> 如果你需要在同一台机器上同时维护多套环境（例如默认环境之外再加柔佛环境），请参考附录 A 的 profile 用法。

## 6. 升级与卸载

升级：

```bash
cd <你 clone 出来的 vs 目录>
git pull
bash ./scripts/install.sh
```

卸载：

```bash
npm uninstall --global viking-cli
# 不确定包名时可先看：
npm ls -g --depth=0
```

## 7. 常见问题排查

- **`vs` 不在 PATH** → `npm config get prefix`，把对应 `bin` 加入 `PATH`，重开终端。
- **`bash ./scripts/install.sh` 失败** → 检查 Node.js `>= 20`，以及 `npmjs.org` 与 `github.com` 是否可访问。
- **`vs doctor --json` 出现 `ok: false` 与地址或鉴权相关** → 回到第 5 步用方式 A / B 重试。
- **地址核对失败** → 视为安装未完成，先修正再继续后续业务命令。

---

## 附录 A · 多环境隔离（profile）

如果你需要在同一台机器上保留多套环境（例如默认 `cn-beijing` 之外再加一个柔佛环境），可以为每套环境分配独立的 profile，再通过 `vs auth use` 切换：

```bash
# 新建一个名为 <env-name> 的 profile（建议用环境含义命名，例如 ap-volc、ap-byteplus）
vs auth login --profile <env-name> \
  --control-plane-base-url <CONTROL_PLANE_BASE_URL> \
  --data-plane-base-url <DATA_PLANE_BASE_URL> \
  --region <REGION>

# 切换到该 profile
vs auth use <env-name>

# 查看当前激活的 profile 与所有 profile 配置
vs auth status --json
```

说明：

- 不带 `--profile` 时所有命令默认作用在 `default` profile 上。
- profile 信息持久化在 `~/.viking/config.json` 的 `profiles` 字段下，AK/SK 走系统凭据存储（`credentialStore: auto`）。
- 切换 profile 后，再次 `vs auth status --json` 应能看到 `activeProfile` 已变成你刚激活的名字，且 URL / region 与对应环境匹配。
