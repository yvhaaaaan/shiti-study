# 拾题服务器版

Vue 3 H5 界面与原站一致，新增账号登录、服务器题库、独立题图存储与跨设备访问。
后端为 Go + SQLite 的独立程序，无需在 VPS 安装 Node、MySQL 或 OCR 模型。

## 已部署位置

- 程序与静态文件：`/opt/shiti/current`（指向版本目录）。
- 数据库：`/var/lib/shiti/data/study.sqlite`。
- 题图：`/var/lib/shiti/data/media/<账户标识>/<内容哈希>`。
- 私有配置：`/etc/shiti.env`；仅服务器管理员可读，包含 MiMo 测试密钥、初始演示账号与邀请码。
- DeepSeek 配置：`/etc/shiti-deepseek.env`；由 `shiti.service.d/deepseek.conf` 额外加载，设置 `SHITI_AI_PROVIDER=deepseek`、`DEEPSEEK_MODEL=deepseek-flash` 和 `DEEPSEEK_API_KEY`。密钥只保存在服务器，普通网站包不包含密钥。
- HTTPS 入口校验配置：`/etc/shiti-entry.env`；与原 Sites 演示站的服务端密钥配对。
- 当前 HTTPS 地址：`/run/shiti/tunnel-url`，由 HTTPS 服务更新。

## 服务管理

```sh
systemctl status shiti.service shiti-tunnel.service shiti-entry.socket
systemctl restart shiti.service
systemctl restart shiti-tunnel.service
systemctl start shiti-backup.service
journalctl -u shiti.service -n 40 --no-pager
```

服务已配置开机自启。数据库和图片独立于程序版本目录，替换程序不会清空学习档案。
应用仅监听 `127.0.0.1:8080`，账号、题目与 AI 接口通过 HTTPS 隧道访问。
NAT 部署时，将自己的外网 HTTPS 入口端口映射到内部 `443`，该入口只负责跳转，不承接登录或题目提交；SSH 的外网端口映射到内部 `22`。公网 IP 和外网端口以服务商面板的映射规则为准，不在源码中保存具体服务器连接信息。
原 Sites 站的 `/server` 路由校验带随机数的 HMAC 签名后，跳转到当前 HTTPS 地址。

## 使用与迁移

1. 使用交付的演示账号登录；也可用课堂邀请码注册独立账号。
2. 电脑和手机登录同一账号，刷新页面读取最新档案。
3. 原演示站的数据仍在原浏览器中，不会自动搬到新域名。先在原站“备份与恢复”导出，再在服务器版导入。
4. 导出备份会将服务器图片嵌入 JSON，迁移时不依赖旧链接。恢复备份保留原图字节。
5. 多台设备同时编辑同一份旧档案时，服务器拒绝覆盖更新版本。失败页面保留修改，可先导出，再刷新查看云端档案。
6. 登录过期时，可在个人资料中使用原密码恢复登录，再重试保存；无需丢弃当前录入内容。

本地模式改用 IndexedDB。迁移完成前不开放编辑；旧 localStorage 保留为恢复副本。

## 资源与限额

- 每道题最多 3 张 PNG/JPEG/WebP 图片，每张最大 2 MiB；普通录入适度优化大图。
- 每篇知识笔记最多 6 张附图，支持图片笔记、拖入或粘贴截图；附图随档案同步，并嵌入完整备份。
- 每道题的补充说明支持 5000 字与 6 张备注附图；从题目详情可直接编辑，附图与原题分别保存，并随完整备份迁移。
- 同一账号的相同图片按哈希去重，题目与复习快照可引用同一个文件。
- 单账号题图总额 256 MiB，全服务题图 2 GiB；结构化档案单次提交最大 4 MiB。
- 完整 JSON 备份最大 50 MiB。
- 当前 AI 使用 DeepSeek 的 `deepseek-flash`，关闭思考模式；文字和题图均通过服务端请求。仅显式点击 AI 整理时调用，同时处理 1 次，每账号每日最多 60 次。可通过服务端 `SHITI_AI_PROVIDER=mimo` 切回原 MiMo 配置。
- H5 通过 SSE 先展示题干，再补全解析；完整结果通过字段和答案一致性校验后才确认完成。小程序和不请求流式的客户端继续使用 JSON；上游拒绝流式时只回退一次，忽略流式时兼容普通 JSON。
- 整页拆题也支持 SSE：每道完整题目校验后立即发送 `question` 事件，整批校验通过后发送 `done`。识别时可核对、修改已返回的题目；结束后保留用户修改，取消或失败保留已收到的完整题并提示未全部完成，保存仍由用户确认。
- AI 可以接受当前账号自己的 `/api/media/<hash>` 题图引用，由服务端校验所有权并直接读取文件。浏览器不再为已保存题图下载后重新上传；同源接口才使用引用，外部模型代理继续传图片字节。
- 云端题图上传在整个保存过程共用最多 3 个并发槽，相同图片的进行中请求只发一次。保存等待所有上传结束后才提交档案，失败重试仅补传失败图片，账号切换时停止旧上传。
- 首页以拍照/上传、文字录入为主要入口，学习统计与复习概览可展开查看。单题保存不等待 OCR 或 AI，成功后立即显示“已收录·待整理”。
- 批量录入支持每批最多 10 张独立题图，或一张整页照片拆成最多 20 道独立题。`POST /api/question-split` 仅提取题干，不生成答案、科目或解析；用户核对并勾选后保存，每题保留整页原图。该接口与智能整理共用账户权限、并发与每日限额。
- H5 选图、拖拽与粘贴截图使用统一校验和压缩，允许最多 20 MiB 的原文件，处理后每张不超过 2 MiB。批量保存先整体校验，失败后保留队列和已分配的题目 ID，重试不重复添加。
- 待会整理、手动录入、本地 OCR、检索、笔记、组卷、复习、导出均不调用模型。

## 备份与运行范围

每天自动生成一致的 SQLite 数据库副本，保留最近 14 份，位于 `data/backups`。
题图为独立的不可变文件。需要整机灾难恢复时，应备份整个 `/var/lib/shiti/data`；应用内导出可生成带图离线副本。

目前使用 Cloudflare Quick Tunnel，无需域名。它适合演示、没有可用率保证，隧道重建后 HTTPS 域名会变化；固定 NAT 跳转入口和原站 `/server` 会获取新地址。
长期上线应绑定正式域名并改为固定隧道，同时将已经停止维护的 CentOS 7 更换为受支持系统，并更新服务器登录凭据。
当前部署为网站版；微信小程序源码仍可构建，正式发布需另行配置微信后台、AppID、合法域名与登录方式。

## 从源码构建

在项目根目录构建 H5，再在当前目录交叉编译独立程序：

```sh
npm run build:static
cd server/vps
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags '-s -w' -o shiti-server .
go test ./...
```

将程序、H5 产物、官方 `cloudflared` 与 `deploy` 中的服务文件安装到上述目录，私有配置单独设置，禁止把真实密钥加入网页或源码包。
