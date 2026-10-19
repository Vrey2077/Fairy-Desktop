# Fairy Desktop

一个以 Fairy 为灵感的独立 Windows 桌面聊天客户端。蓝色终端界面、会话管理、可配置的模型 API，以及随时可以关闭的语音朗读。

[English](README.en.md) · [更新日志](CHANGELOG.md) · [API 文档](docs/API.md) · [隐私说明](PRIVACY.md)

![Fairy 原创终端插画](assets/terminal-grid.svg)

> 非官方同人项目，与 HoYoverse、miHoYo、DeepSeek 或 OpenAI 没有隶属关系。开屏为 SVG/CSS 实现；项目不附带游戏截图、音乐、角色配音或账户密钥。

## 下载与运行

从本仓库 **Releases** 下载 `Fairy-Desktop-v0.3.1-win32-x64.zip`，完整解压到一个可写文件夹，再双击 **启动 Fairy.cmd**。

- Windows 10/11，64 位；日常运行不需要安装 Node.js 或 Codex。
- 不要直接在压缩包中运行，也不要只移动 Fairy.exe；保留解压后的目录结构。
- 程序目前没有代码签名或自动更新。下载后可使用 Release 中的 SHA256SUMS.txt 核验文件。
- 首次启动没有预填密钥、余额、个人会话或任何可用的付费账户。

## 功能

| 模块 | 支持内容 |
| --- | --- |
| 对话 | 新建、搜索、删除、JSON 导出；Markdown、表格与代码块；停止生成；草稿保留 |
| 模型连接 | 兼容 Chat Completions 的 API；DeepSeek 预设；读取模型并直接选择；手动模型 ID |
| Fairy 界面 | 左上角眼睛、输入/思考/回答动画、蓝色终端主题、可跳过和重播的开屏 |
| 账户状态 | DeepSeek 官方余额、本机今日请求和 tokens、计费时段与下次切换 |
| 语音 | Windows 系统音色、自动/手动朗读、即时停止、音量/语速、跳过代码 |
| 自定义语音 | 独立接口地址、密钥、模型和音色 ID；兼容返回音频的语音服务 |
| 设置 | 对话字号、间距、动画、扫描线、快捷键、上下文条数、生成参数、角色提示词 |

模型列表没有搜索框。聊天记录的搜索功能独立保留。

## 连接模型

1. 点击左下角 **设置 → 连接与模型**。
2. 选择 **兼容 OpenAI** 或 **DeepSeek**。
3. 填写基础地址和自己的 API Key。DeepSeek 官方地址为 `https://api.deepseek.com`。
4. 点击 **读取模型**，选择返回的模型，或手动填写模型 ID。
5. 保存后发送消息。读取模型只验证表单，不会提前保存你的配置。

聊天地址填写服务商基础 URL，程序拼接 `/chat/completions`。模型 ID 和权限以服务商实际返回为准。DeepSeek 可单独开启思考模式。默认不向普通兼容服务发送 stream_options；支持时可在生成参数中打开流式用量请求。

## 语音与自定义音色

默认使用 Windows 系统语音，优先选择已安装的中文音色。仅自动朗读新完成的回复；历史消息可手动点击“朗读”。右上角开关关闭语音，播放时可立即停止。

系统音色不是游戏原角色配音。自定义音色需要自行配置语音服务：

- 在 **语音朗读 → 自定义音色 API** 填入完整 POST 地址（例如服务商的 /v1/audio/speech）。
- 该服务应接受 input、model、voice、speed、response_format，并直接返回音频。
- 语音密钥与聊天密钥分别保存；聊天密钥不会自动发给语音服务。
- 当前不包含上传参考录音、训练音色或音色市场。非兼容协议需要适配器。
- 外部语音仅在切换并保存后调用。具体配置见 [语音接口](docs/API.md#语音服务适配)。

## 数据与隐私

程序在解压目录内创建以下文件夹：

| 目录 | 内容 | 是否应上传 GitHub |
| --- | --- | --- |
| data/ | 会话、草稿、用量、设置、加密密钥、浏览器缓存 | 否 |
| exports/ | 用户主动导出的会话 | 否 |
| work/ | 日志、运行信息和构建缓存 | 否 |
| release/ | 开发时的打包产物 | 作为审核后的 Release 附件，不能整目录提交 |

会话和草稿以本地明文保存。桌面版密钥通过 Electron safeStorage 使用 Windows 系统加密；无法使用加密时只保留在当前进程。没有账户同步或内置遥测。请求仍会按照配置发送给所选模型/语音服务，详见 [PRIVACY.md](PRIVACY.md)。

## 用量与计费时段

- “本机今日”按北京时间及当前服务类型计算，不能代表账户在其他客户端中的消耗。
- 删除聊天不会清除独立用量记录。服务未提供的 tokens 会标记为未返回，不估算成实际账单。
- 余额仅请求官方 api.deepseek.com，最多每分钟刷新一次。
- 时段是按内置规则计算的价格时段，不是实时服务负载。
- 规则核对日期为 2026-10-19；仅内置 2026 年节假日，其余年份提示估算。收费及优惠以服务商当前规则和账单为准。

## 从源码运行

需要 Node.js 24 与 npm，以及 Windows 系统语音组件。

```powershell
npm ci
npm run build
npm test
npm run audit
npm start
```

浏览器预览可以使用 npm run preview，默认监听 127.0.0.1:18438；设置 FAIRY_PORT 可更换端口。预览数据位于 work/preview-data，密钥只保留在当前进程。

### 打包

```powershell
npm ci --ignore-scripts
npm run check
npm run package
```

打包结果为 release/Fairy-win32-x64。脚本从明确的应用文件白名单创建独立 staging 目录，不会打包仓库根目录。没有本地 Electron 压缩包时，会下载锁定版本的运行时；下载与缓存保存在 work/。

Windows 便携包保留以下布局：

```text
Fairy-Desktop/
  启动 Fairy.cmd
  release/Fairy-win32-x64/Fairy.exe
  release/Fairy-win32-x64/…其余运行文件
```

源码与运行时目录的用途不同。禁止把已经日常使用过的整个文件夹直接压缩发布。发布前运行 npm run audit，再检查 app.asar 和最终 ZIP；审计是辅助检查，不能替代人工复核。

## 快捷键

- Enter：发送；Shift + Enter：换行。可改为 Ctrl + Enter 发送。
- Ctrl + N：新对话。
- F11：切换全屏。
- Esc：跳过开屏或关闭对话框。

## 已知限制

- 当前仅提供 Windows x64 便携版；系统语音依赖已安装的 Windows 桌面音色。
- 本客户端提供文字对话与朗读，没有文件执行、电脑操作或 Codex App Server 集成。
- 外部语音协议只覆盖当前适配字段；服务商可能需要额外参数。
- 长回复会分段合成，段间可能有停顿。语音质量由系统音色或服务商模型决定。
- 尚未提供自动更新与数字签名。

## 项目结构

backend/ 本地服务、会话存储、流式协议与语音；electron/ 桌面窗口与加密存储；renderer/ 原生 HTML/CSS/JS；assets/ 自绘资源；vendor/fairy-dsh/ 上游眼睛动画与许可证；scripts/ 构建、打包和审计；test/ 协议与状态测试。

## 许可证与致谢

本项目代码采用 [Apache-2.0](LICENSE.txt)。眼睛动画基于 [Chengzhibense/Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH)，保留其许可证、NOTICE 与文件来源。图标与终端插画为项目自绘图形。

依赖、来源及商标说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。开源代码许可不授予任何第三方角色、名称或商标的权利。
