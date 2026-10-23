# MiMo 一次识图与解题接入

本次提供服务端调用链：一次请求同时提取题干、核对或求解答案、生成分步解析与知识点建议。只生成供用户核对的草稿，不会直接修改错题本，也不会推断用户错因。没有真实密钥时返回配置提示，不使用模拟答案冒充在线生成。

## 已核实的官方能力

- 固定请求地址为 `https://api.xiaomimimo.com/v1/chat/completions`，通过服务端 `api-key` 请求头认证。[小米接口文档](https://mimo.mi.com/docs/en-US/api/chat)
- 默认模型为 `mimo-v2.6-flash`。官方图像能力列表还包括 `mimo-v2.6-pro`、`mimo-v2.6-pro-ultraspeed`、`mimo-v2.5`；图片使用 `image_url` 内容块，支持 base64 data URL。[小米图像理解文档](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/multimodal-understanding/image-understanding)
- 使用 `response_format: {"type":"json_object"}`。JSON模式保证JSON语法，不保证业务字段正确，因此服务端仍校验字段类型、长度和枚举，不自动重试模型调用。[小米结构化输出文档](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/structured-output)

以上为2026年10月核实的官方文档内容。代码没有使用第三方MiMo转发站，也不接受前端传入API地址、模型名称或密钥。

## 服务端配置

| 变量 | 作用 |
| --- | --- |
| `MIMO_API_KEY` | 必填，真实MiMo API密钥；仅保存在服务端环境中 |
| `MIMO_MODEL` | 可选，默认 `mimo-v2.6-flash`；仅接受上述已验证图像模型 |
| `MIMO_ENABLE` | 可选；默认随密钥存在而启用，仅显式 `false` 时关闭 |
| `MIMO_TIMEOUT_MS` | 可选，5000–90000毫秒，默认60000毫秒 |
| `SHITI_AI_PORT` | 仅本地Node服务，可选，默认8787 |

本地将密钥写入已忽略的 `.env.local`，不要提交、分享或放入部署ZIP，也不要使用 `VITE_` 前缀。不要把真实密钥粘贴到前端输入框、聊天、截图或构建日志。

```dotenv
MIMO_API_KEY=在本机文件内填写真实密钥
MIMO_MODEL=mimo-v2.6-flash
```

使用Node 22.9+或24，在项目目录启动：

```powershell
node --env-file-if-exists=.env.local scripts/serve-ai.mjs
```

或使用已配置等价命令的 `npm run dev:ai`。另开前端开发服务；H5通过Vite将 `/api/question-generate` 代理到本地8787端口。服务只绑定 `127.0.0.1`，不打印密钥。只开启前端静态预览不会产生可用的AI后端。

## 接口

`POST /api/question-generate`，请求头 `Content-Type: application/json`。

```json
{"stem":"解方程：x²−5x+6=0。","images":[],"subject":"数学","tags":["一元二次方程"]}
```

`stem` 为字符串，最多5000字；`images` 为最多3项的数组，仅支持PNG/JPEG/WebP base64 data URL，每张解码后最多2MiB；二者至少一项非空。`subject` 可选、最多20字，`tags` 可选、最多30个且每个最多32字。公共处理器的请求体上限为10MiB，不代表部署平台能接收同样大小。

成功返回且仅返回下列七项：

```json
{"title":"一元二次方程求根","subject":"数学","stem":"解方程：x²−5x+6=0。","answer":"x=2或x=3。","analysis":"1. 分解为(x−2)(x−3)=0。\n2. 分别令两个因式为0，得到x=2或x=3。\n3. 代回原式，两根均满足。","tags":["一元二次方程","因式分解"],"difficulty":"基础"}
```

此处仅为接口示例，不是实际在线调用记录。`difficulty` 只能为“基础”“进阶”“挑战”。返回中没有 `cause`。模型正文、推理字段和上游错误原文不会转发给浏览器。

失败返回 `{"error":{"code":"AI_NOT_CONFIGURED","message":"可直接展示的中文提示"}}`。主要状态为400输入错误、403来源不允许、413图片或请求过大、422题目信息不清或不足、429繁忙或限流、502上游返回异常、503未配置/关闭/额度不足、504生成超时。错误不会泄露密钥或上游原文。

图片不清、题干缺条件、含多道题无法确定目标时，模型被要求返回澄清状态；服务端转成固定中文提示，不擅自补造题目信息。模型仍可能识别或解答错误，用户需核对后再保存。

## 流式返回（H5）

H5 端在请求头带 `Accept: text/event-stream` 时，服务端按 SSE 返回。模型先输出题干，再输出解析与答案，最后补齐标题、科目、标签等整理信息；简单题精练讲解，复杂题仍保留必要推导。

- `event: open`：连接已建立。
- `event: delta`，`data: {"text":"..."}`：模型正文增量，客户端累积。
- `event: done`：`data` 为与普通接口相同的七字段对象。
- `event: error`：`data` 为 `{"error":{"code":"...","message":"..."}}`。

客户端在完整题干字符串闭合后先显示题干，再以约80毫秒的更新间隔渐进预览解析。预览标注为生成中，只有收到并校验 `done` 后才允许确认应用；输入改变、取消、错误或截断均不会将预览当成正式结果。收到有效 `done` 后立即结束读取，不再等待连接关闭。

小程序仍使用普通 JSON 响应。若上游不接受 `stream: true`，服务端自动回退为一次性 JSON，没有渐进显示。流式只改变返回时序，不改变字段校验、错误码和来源检查。

性能记录应分别测量请求到题干完整出现、解析首次出现、最终校验完成的耗时，并注明图片大小、题目复杂度与是否包含公网传输。分题识别、完整讲解和上传保存是不同操作，不能直接比较；渐进显示也不代表完整解析已经完成，不承诺固定秒数。

## H5与微信小程序

H5请求要求 `Origin` 与接口同源。本地仅额外允许loopback域名的5173开发端口；其他跨域网页的预检和POST会被拒绝。接口只接受JSON，不使用通配CORS。

微信原生请求可不含 `Origin`，但必须带 `X-Shiti-Client: mini-program`，同时不含浏览器Fetch Metadata头。这是区分原生请求的兼容标记，不是账号鉴权；可阻止普通跨站网页直接调用，不能阻止伪造HTTP请求的脚本或服务器。单个服务实例最多同时处理2个模型调用，不代表分布式全局限额；公开部署需在MiMo账户和平台侧设置合适额度与限流。

微信端还需：

1. 将前端构建变量 `VITE_SHITI_AI_URL` 设为已部署的绝对HTTPS端点，例如 `https://你的域名/api/question-generate`；这个变量只含地址，不能含密钥。
2. 在微信小程序后台将该HTTPS域名加入合法 `request` 域名，并使用满足平台要求的证书。
3. 小程序请求发送上述标记。localhost地址只能用于本机调试，不能用于手机正式环境。

## EdgeOne：ZIP可以带函数，但要遵守平台限制

官方当前文档明确：直接上传ZIP/目录支持 `edge-functions`、`cloud-functions` 和 `edgeone.json`；它并非只能上传静态文件。[官方直接上传说明](https://pages.edgeone.ai/document/direct-upload)

本项目入口 `edge-functions/api/question-generate.js` 默认导出 `onRequest(context)`，通过 `context.request` 与 `context.env` 调用共享处理器，路由为 `/api/question-generate`。这是官方支持的处理器与文件路由方式。[官方Edge Functions文档](https://pages.edgeone.ai/document/edge-functions)

入口已为上游请求配置 EdgeOne 专属 `eo.timeoutSetting`，避免平台默认15秒先于应用层截止时间结束请求。连接、读、写上限均设为90秒，实际仍受共享处理器默认60秒（可配置5–90秒）的整体截止时间约束。[官方Fetch超时说明](https://cloud.tencent.com/document/product/1552/81897)

部署产物根目录应包含静态首页及其资源、`edge-functions/`，并保证入口相对引用的 `server/mimo-question.mjs` 可被打包解析。更稳妥的发布方式是在构建时将入口和共享处理器打包为一个无外部依赖的JS函数，再将其放入产物根目录 `edge-functions/api/question-generate.js`；不能只上传普通H5构建目录而遗漏函数。手动构建后用CLI上传也需将函数相关目录放入产物目录。[官方CLI说明](https://pages.edgeone.ai/document/edgeone-cli)

在EdgeOne项目服务端环境变量中设置 `MIMO_API_KEY`，配置后按平台流程重新部署。密钥不是静态资源，不能硬编码进函数文件或放入ZIP中的 `.env` 文件。

**图片大小是实际限制：**官方Edge Functions请求体上限为1MB，Cloud Functions为6MB；它们均小于本地处理器的10MiB上限。Edge部署前端应将发往AI的图片单独压缩并将整个JSON控制在约900KiB以内，原始题图仍可保留在错题本中。直接发送3张2MiB图片会因base64膨胀超出平台限制，在函数运行前就被平台拒绝，不能靠增大代码常量解决。[官方配额说明](https://pages.edgeone.ai/document/limits-and-quotas)

2026年10月17日已使用一道简单方程题图，完成一次本地真实 MiMo 调用：识别出完整题干，正确返回 x = 4，并同时返回参考答案、分步解析和标签建议；上游状态200，总计1020 tokens。测试密钥仅在临时进程内存中使用，未写入工程或交付包，没有自动重试。

这验证了本地服务端到 MiMo 的真实调用链；腾讯 EdgeOne 线上仍需上传包含函数的更新包，并在服务端配置 `MIMO_API_KEY` 后验证。

## Sites 同源服务

Sites 使用独立的 `.sites-host` 构建目录，保留 Vue/uni-app 原有的依赖和前端资源。`server/sites-worker.mjs` 将 `/api/question-generate` 交给同一个共享处理器，其余请求通过 `ASSETS` 绑定读取原前端资源；未知 API 返回 JSON 404，不回退到首页。

首次安装主工程与 `.sites-host` 的锁定依赖后，`npm run build` 依次构建 H5、Sites Worker 与资源绑定。生成 `dist/server/index.js`、`dist/server/wrangler.json`、`dist/client/` 和 `dist/.openai/hosting.json`。部署必须整体保留这些目录，源 hosting manifest 不再带 `static` 字段，原项目 ID 保持不变。

`MIMO_API_KEY` 等运行时变量通过 Sites 的服务端密钥工具配置，不参与前端构建。Worker 适配器将上游重定向模式设为 `manual`，遇到重定向按失败处理，不将密钥发往其他地址。现有站点访问权限由 Sites 平台继续控制。线上验证与本地测试分开记录，部署成功后仍需确认真实请求返回完整七字段。
