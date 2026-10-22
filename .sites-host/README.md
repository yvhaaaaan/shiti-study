# 拾题 Sites 后端构建

独立构建目录使用 Vite 8 和 Cloudflare 插件，不改变 Vue/uni-app 的 Vite 5 依赖。

先在项目根目录完成 H5 构建，再在本目录运行 `npm run build`。构建读取 `../dist/build/h5` 和 `../server/sites-worker.mjs`，输出 `dist/server/index.js`、`dist/server/wrangler.json`、`dist/client/` 及 `dist/.openai/hosting.json`。校验脚本逐文件比较 H5 资产 SHA-256，确认 OCR 模型等资源未丢失。

发布前将本目录整个 `dist` 内容作为项目根 `dist` 的最终产物，保留相对目录关系；根 `.openai/hosting.json` 也必须保留原项目 ID 并移除 `static`。Worker 的静态资源绑定为 `ASSETS`，`/api/*` 优先进入 Worker，其他现有资源使用静态托管。前端 hash 路由不需要把未知资源返回首页。

运行时密钥由 Sites 原生密钥工具配置。本目录不读取、保存或打包任何密钥。`build/sites-vite-plugin.ts` 来自 Sites 官方模板，附带原 MIT 许可证。
