# 1.2.7 构建依赖修复

针对 GHSA-g3hv-75wg-m249，所有实际 minimatch 引擎升级并锁定为 11.0.3。没有关闭审计、修改依赖版本号伪装补丁或保留旧匹配代码。

## 兼容方式

| 组件 | 锁定版本 / 处理 | 原因 |
| --- | --- | --- |
| electron-builder | 26.18.0 | 保留当前稳定打包主流程 |
| @electron/asar | 4.3.1 | 使用命名导出的匹配接口 |
| @electron/universal | 3.0.6 | 移除旧 dir-compare/minimatch 依赖链 |
| glob | 14.0.3 | 适配 minimatch 11 的非正则匹配器 |
| EJS | 5.0.2 | 保留 compile 接口，去掉运行时无须携带的 Jake/filelist 旧链 |
| minimatch | 11.0.3 | 上游修复版本 |
| temp 0.9.4 的 rimraf | 项目精确路径清理适配器 | temp 只传入生成的绝对路径；用 fs.rm 保留回调、同步、重试行为，移除 rimraf 2 / glob 7 |

`scripts/temp-cleanup-compat` 是可直接审阅的本地构建辅助包，不是通用 rimraf 替代品。npm override 只作用于 `temp@0.9.4`；根 devDependency 用于使锁文件在干净安装中正确解析本地包。它不随 EXE 运行，不修改系统设置。禁止传入根目录和相对路径，通配符按普通文件名处理。

这些覆盖是上游稳定构建工具仍使用旧依赖时的兼容措施。未来更新 Electron Builder 后，应核对它的完整依赖树，优先去掉不再需要的 override 和临时清理适配器，然后重新运行全部检查。不要只改 minimatch 版本：旧 glob 会依赖已经改变的内部匹配对象。

## 复现检查

使用受支持的 Node.js 22.12+，CI 使用 Node 24：

```sh
npm ci
npm run build
npm test
npm run check:release
npm ls minimatch glob rimraf --all
npm audit --audit-level=low
```

Windows 打包还需 `npm exec install-electron` 和 `npm run desktop:pack`。源码归档包含本地辅助包，不能只复制 package.json/package-lock.json。

兼容测试覆盖真实 ASAR 打包/解包与 unpack 通配符、glob 遍历、Builder 文件包含/排除规则、EJS 模板、universal 与 Squirrel 入口加载、temp 同步和回调清理以及精确路径边界。Windows x64 是当前发布和成品验收平台；不把模块加载测试当成 macOS 通用二进制的实机验收。

2026-11-02 UTC 完整 npm audit：0 info / low / moderate / high / critical。CI 两个工作流均阻止任何级别的已知告警；审计数据库将来变化时需要重新处理。
