# 第三方组件与素材

## Fairy-DSH

- 上游：https://github.com/Chengzhibense/Fairy-DSH
- Copyright 2026 Chengzhibense
- 许可：Apache License 2.0
- 文件：mascot-geometry.js、mascot-eye-svg.js、mascot-effects-svg.js、mascot-style.js
- 上述文件保持原样；本项目增加了独立窗口、服务、渲染逻辑和样式覆盖。
- 精确 blob SHA、原许可证与 NOTICE 位于 vendor/fairy-dsh/。

## 本项目图形

assets/fairy.svg、fairy.png、fairy.ico、terminal-mark.svg、terminal-grid.svg 为代码绘制的图形。源码及自绘图形采用本项目 Apache-2.0 许可。终端标记不是游戏官方标志文件。

公开版本不包含之前个人开发环境中下载的 HDD 标志、官方指南截图、录音、游戏音频或其他许可未确认的图片。

## Electron 与开发依赖

- Electron 44.9.0：https://github.com/electron/electron
- @electron/packager 20.3.0：https://github.com/electron/packager
- Electron 包含 Chromium、Node.js 与其他第三方组件；便携包保留 LICENSE、LICENSES.chromium.html 等运行时许可文件。
- 完整开发依赖锁定在 package-lock.json；各依赖保留自己的许可，不被项目许可替代。

## 功能参考

- DeepSeek Chat Completions：https://api-docs.deepseek.com/api/create-chat-completion/
- DeepSeek 余额：https://api-docs.deepseek.com/api/get-user-balance/
- DeepSeek 计费时段：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
- 2026 年节假日：https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
- Electron safeStorage：https://www.electronjs.org/docs/latest/api/safe-storage

## 名称与角色

Fairy、HDD、绝区零、Zenless Zone Zero、HoYoverse、miHoYo、DeepSeek、OpenAI 等相关名称、角色和商标属于各自权利人。本项目代码许可不授予这些名称、角色或商标的使用权。人格提示词为原创风格化文字，不是游戏台词合集。
