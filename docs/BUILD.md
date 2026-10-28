# 打包说明

打包基于 **electron-vite（编译）+ electron-builder（封装安装包）**，配置文件为根目录的 [electron-builder.yml](../electron-builder.yml)。

## 一、常用命令（本地打包）

```bash
# 首次准备
npm install

# macOS：同时产出 arm64 + x64 的 dmg 与 zip
npm run build:mac

# macOS：只打当前架构（更快）
npm run build:mac:arm64
npm run build:mac:x64

# macOS：强制不签名（本机没有开发者证书时用这个，避免卡在签名环节）
npm run build:mac:unsigned

# Windows：产出 nsis 安装包（x64 + arm64）
npm run build:win
npm run build:win:x64

# 只生成未压缩的 app 目录（最快，用于验证配置 / 排查 asar 内容）
npm run build:unpack

# mac + win 一起打（在 macOS 上打 win 需要 wine，见下文）
npm run build:all
```

产物统一输出到 **`release/`** 目录：

| 文件 | 说明 |
| --- | --- |
| `QQLink-H5-Bridge-1.0.0-mac-arm64.dmg` | macOS Apple 芯片安装包 |
| `QQLink-H5-Bridge-1.0.0-mac-x64.dmg` | macOS Intel 安装包 |
| `QQLink-H5-Bridge-1.0.0-mac-*.zip` | macOS 免安装压缩包（用于自动更新） |
| `QQLink-H5-Bridge-Setup-1.0.0-x64.exe` | Windows 64 位安装程序 |
| `QQLink-H5-Bridge-Setup-1.0.0-arm64.exe` | Windows ARM64 安装程序 |

## 二、各平台注意事项

### macOS

- **未签名应用**：本机没有 Apple 开发者证书时，`electron-builder` 会跳过签名，打出来的包在别人电脑上首次打开需要「右键 → 打开」，或执行：
  ```bash
  xattr -dr com.apple.quarantine "/Applications/QQLink H5 Bridge.app"
  ```
- **默认不签名**：[electron-builder.yml](../electron-builder.yml) 里显式设置了 `mac.identity: null`。这是刻意的 —— 钥匙串里如果残留已吊销/过期的证书，electron-builder 会自动拿去签名，然后 `codesign --verify` 报 `CSSMERR_TP_CERT_REVOKED` 直接中断打包。
- **需要签名分发时**：删掉 `identity: null` 那一行（或写成证书名 `identity: "Developer ID Application: XXX (TEAMID)"`）。需要公证（notarize）时同时把 `mac.notarize` 改为 `true`，并设置环境变量 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`。
- 顺带建议：在「钥匙串访问 → 登录 → 我的证书」里把已吊销的 Apple 证书删掉，能省掉后续很多签名相关的诡异报错。
- 首次打包会下载 arm64 与 x64 两份 Electron 二进制（各约 100MB 缓存在 `~/Library/Caches/electron`）。

### Windows

- **在 Windows 机器上打包**：直接 `npm run build:win`，无需额外依赖。
- **在 macOS 上交叉打包 Windows 安装包**：NSIS 目标需要 wine：
  ```bash
  brew install --cask wine-stable
  npm run build:win:x64
  ```
  如果 wine 安装麻烦，建议直接用仓库里的 GitHub Actions（见下文）出 Windows 包。
- 未签名的 exe 会被 SmartScreen 拦截，提示「更多信息 → 仍要运行」即可。

### 网络受限

Electron 二进制下载慢时，走国内镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run build:mac
```

## 三、图标

图标源文件为 `build/icon.png`（1024x1024），`build/icon.icns`（macOS）与 `build/icon.ico`（Windows）由脚本生成：

```bash
npm run icons
```

替换图标时，直接把设计稿覆盖 `build/icon.png` 后重新执行上面的命令即可（icns 的生成依赖 macOS 自带的 `iconutil`）。

## 四、GitHub Actions

工作流文件：[.github/workflows/build.yml](../.github/workflows/build.yml)

| 触发方式 | 行为 |
| --- | --- |
| 手动触发（Actions → 构建安装包 → Run workflow） | 可勾选只构建 macOS 或只构建 Windows |
| 推送 `v*` 标签（如 `v1.0.0`） | 双平台构建并自动创建 Release，附件为安装包 |
| 向 `main` 提 PR | 只跑类型检查，不打包 |

发布新版本流程：

```bash
npm version patch     # 或 minor / major，会同步改 package.json 版本号并打 tag
git push --follow-tags
```

构建完成后，安装包同时可在 Actions 页面的 Artifacts 中下载。

## 五、产物内容说明

- 打包进 `app.asar` 的只有 `out/**/*`（electron-vite 编译产物）和 `package.json`；生产依赖由 electron-builder 按依赖树自动收集，devDependencies 不会进包。
- 主进程代码通过 `externalizeDepsPlugin` 外部化了依赖（`electron-store`、`axios`、`https-proxy-agent`、`node-machine-id`、`uuid`），因此这些包必须在 `dependencies` 而非 `devDependencies` 中，迁移依赖时注意。
- 用户数据（登录态、配置）由 `electron-store` 写入系统用户目录，卸载时默认不删除（`nsis.deleteAppDataOnUninstall: false`）。
