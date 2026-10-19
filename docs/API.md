# 本地 API 与语音适配

服务只监听回环地址。桌面应用启动后，本次地址保存在 work/desktop-runtime.json。所有 /api/ 请求需要 X-Fairy-Token 请求头；前端从同源 /bootstrap.js 获得启动时生成的令牌。该令牌不是服务商 API Key。

不开放跨域 CORS，Host 必须与服务地址匹配，浏览器 Origin 必须同源。不要将本地服务代理到公网。

## 路由

| 方法与路径 | 用途 |
| --- | --- |
| GET /health | 应用名称与版本 |
| GET /api/config | 公开配置、hasKey 标志；不返回密钥 |
| POST /api/config | 保存当前服务商、API 地址、模型、密钥及完整表单 |
| POST /api/preferences | 保存 voice、appearance、chat 中提供的设置项 |
| GET /api/persona | 内置原创 Fairy 提示词 |
| POST /api/models | 查询保存配置或尚未保存表单中的模型列表 |
| GET/POST /api/conversations | 会话列表 / 新建 |
| GET/DELETE /api/conversations/:id | 读取 / 删除会话 |
| POST /api/conversations/:id/draft | 保存草稿 |
| POST /api/chat | SSE 流式聊天：start/status/delta/done/error |
| POST /api/stop | 停止指定会话生成 |
| GET /api/account | 官方余额与当前 provider 的本机今日用量 |
| GET /api/voices | Windows 已安装音色 |
| POST /api/speech | 返回合成音频；断开连接会取消合成 |

## 聊天配置

POST /api/config 接受 provider（compatible 或 deepseek）、baseUrl、model、apiKey、clearKey、thinking、systemPrompt、motion、bootAnimation，以及 preferences。

apiKey 空字符串表示保留已保存密钥；clearKey=true 删除密钥。更改 baseUrl 会使旧地址绑定的密钥失效。POST /api/models 可以接收同样的服务商与地址字段进行探测，但不会保存表单，也不会把不同地址的已保存密钥转发给新地址。

上下文条数为 2–100；temperature 为 0–2 或 null；maxTokens 为正整数或 null。实际模型可能有更严格限制。includeUsage 用于请求兼容服务的 stream_options.include_usage。

## 语音服务适配

在设置中填写完整 POST 地址。当前适配器发送以下结构：

```json
{
  "input": "需要朗读的文字",
  "model": "your-tts-model",
  "voice": "your-voice-id",
  "speed": 1,
  "response_format": "mp3"
}
```

若填写独立语音密钥，服务请求使用 Authorization: Bearer。服务应直接返回 audio/mpeg、audio/wav、audio/ogg、audio/flac、audio/aac 或其他已支持的音频 Content-Type；不支持仅返回 JSON 下载地址的接口。

voice.engine 为 system 或 api。其他字段包括 enabled、autoRead、voiceId、rate、volume、skipCode、endpoint、model、apiVoice。voiceKey 和 clearVoiceKey 单独管理语音密钥。系统音色不使用外部语音密钥。

POST /api/speech 接受 text，每段 1–1800 字；前端默认约 800 字分段。preview=true 时强制试听 Windows 系统语音，可同时传 voiceId 和 rate。该试听按钮不验证外部音色接口；外部语音保存后通过消息“朗读”测试。

## 用量

GET /api/account 返回 usage 与 balance。

usage 包含 date、requests、reported、unreported、input、output、total、scope。日期按北京时间，requests 也包含失败或中断的本机请求；未获得完整用量的记录不会被视作已计量成功。历史回复首次迁移时按模型前缀推断服务类型。此账本不代表服务商整账户的用量。

balance 仅在当前地址主机为 api.deepseek.com 且已配置密钥时查询官方余额。缓存 60 秒，不向自定义主机转发官方余额请求。

## 本地测试

运行 npm test 使用模拟模型/语音服务及临时目录，不需要真实服务商密钥。npm run audit 扫描发布源码白名单。实际 Windows 语音合成及外部服务兼容性应根据目标环境另外验证。
