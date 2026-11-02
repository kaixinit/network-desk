# GitHub 发布说明

适用 1.2.12。源码公开与公开个人检测报告是两回事。本文提供本地准备步骤，不代表已建立或上传仓库。

## 上传范围

将最终 `NetworkDesk-1.2.12-source.zip` 解压到新空目录，以内层 `NetworkDesk-1.2.12-source` 为仓库根目录。应直接看到 README、package.json、src、server、desktop、tests；保留隐藏的 `.github`、`.gitignore`、`.npmrc` 和 `.openai/hosting.json`。

不要上传整个开发工作区、交付目录、旧镜像、内部设计材料、QA、AppData 或个人报告。源码包含本地构建辅助包 `scripts/temp-cleanup-compat`，不能只复制 package.json 和锁文件。EXE 与运行 ZIP 放 Releases，`*-runtime.exe` 是中间文件，交付使用 `*-portable.exe`。

## 干净构建与扫描

使用受支持的 Node.js 22.12+（CI 使用 24）和系统 curl：

```sh
npm ci
npm run build
npm test
npm run check:release
npm audit --audit-level=low
```

`check:release` 检查白名单、空配置、部分凭据/私人路径格式和公开文档相对链接。它不是通用秘密识别器，新文件仍须审阅。可使用 [Gitleaks](https://github.com/gitleaks/gitleaks) 在本机扫描；不要上传源码或报告到不明扫描网站。

```sh
gitleaks dir . --redact=100
```

建议对刚解压、未安装依赖的目录扫描。若命中 `FILE-SHA256.json`，必须重新计算对应文件 SHA-256，只有完全一致的值才可判为校验值误报，不能按文件名直接忽略。许可证中的上游作者邮箱和署名应保留。

`FILE-SHA256.json` 描述 ZIP 生成时的逐文件内容。修改源码后应重新运行 `npm run package` 生成新包与清单，旧 ZIP 的整包哈希不再适用。

## Git 提交前核对

只在新解压的源码目录初始化，不在包含个人报告的上级目录初始化：

```sh
git init
git add .
git status --short
git diff --cached --stat
git diff --cached --name-only
```

检查暂存清单及差异后，再自行提交、关联 GitHub 仓库并推送。`.gitignore` 不能删除已进入 Git 历史的内容；复用旧仓库时需另查全部分支和提交。源码 ZIP 不含 `.git`，包检查不能替代旧仓库历史审计。网页上传同样使用此干净目录，不要先复制个人配置再依赖网页排除。

GitHub 公开仓库支持 Secret scanning，建立仓库后核对安全设置，在可用时启用推送保护与私密漏洞报告。范围见 [GitHub 官方文档](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)。真实密钥泄露应撤销或轮换，仅删除最新文件不足够。

## 构建与 Releases

- `source-check` 在 push / pull request 时于 Linux、Windows 安装、构建、测试、检查发布范围和完整 npm 审计。
- `windows-portable` 手动触发，在 Windows 构建并保存 Actions artifact，不自动发布 Release，不需要个人 GitHub Token。
- 两个工作流只申请 `contents: read`，Dependabot 提示依赖更新。
- 可选签名凭据放安全构建环境或 GitHub Secrets，不放源码。当前 EXE 未配置签名。

EXE 详见 [桌面构建](DESKTOP.md)。带 Node 的网页运行包可在 PowerShell 指定已解压的官方运行时：

```powershell
$env:NETWORK_DESK_NODE_DIR = 'C:\tools\node-win-x64'
npm run package
```

替换为实际目录，仅在当前终端生效。脚本不下载 Node；未指定时输出需自备 Node 的 `local-node.zip`。官方运行时许可随包保留。

## 白名单维护

公共文档采用明确名单；内部 AGENTS、设计验收、附件编号和私有测试材料不打包。EXE 构建使用同份公共文档名单。新增公开文档时同步修改 `scripts/release-policy.mjs`、`.gitignore`、`electron-builder.json` 并运行检查。

不得包含个人配置、填有密钥的示例、.env、reports、preferences、Cookie、浏览器数据、私钥、HAR、数据库或用户名路径。保留第三方许可与数据来源；MIT 不覆盖上游数据服务的使用条件。

GitHub Pages 无法运行 Node 本地服务。不要为静态部署取消来源校验、开放任意代理或暴露本机 API 到公网。
