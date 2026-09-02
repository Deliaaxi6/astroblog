# AstroBlog CMS 后端（图床模块）

基于 FastAPI 的本地管理后端，图床使用 ImageKit Media Library。

## 首次配置

1. 复制 `.env.example` 为 `.env`，填写 ImageKit 凭证：

   ```powershell
   Copy-Item .env.example .env
   ```

   必须将 `CMS_API_KEY` 替换为随机长字符串。管理台首次打开时会要求输入该值，
   Key 只保存在当前浏览器会话。默认禁止跨域调用；确有需要时再配置
   `CMS_ALLOWED_ORIGINS`，多个来源以逗号分隔。示例默认允许 Astro 本地预览地址
   `http://localhost:4321`，用于相册管理页面调用 CMS。

2. 安装依赖：

   ```powershell
   pip install -r requirements.txt
   ```

3. 启动：

   ```powershell
   uvicorn main:app --port 8080
   ```

4. 浏览器打开 <http://localhost:8080> 使用图床；API 文档见 <http://localhost:8080/docs>

## ImageKit 凭证获取

1. 登录 ImageKit Dashboard，打开 **Developer options → API keys**
2. 将 Private key 和 Public key 分别填入 `IMAGEKIT_PRIVATE_KEY`、`IMAGEKIT_PUBLIC_KEY`
3. 在 **URL endpoints** 页面复制默认地址，填入 `IMAGEKIT_URL_ENDPOINT`

Private key 只允许保存在服务端 `.env` 中，不得写入前端代码或提交到 Git。

## 接口

| 接口 | 说明 |
|---|---|
| `GET /api/status` | 后端存活检查 |
| `GET /api/picbed/test` | 测试 ImageKit API 凭证 |
| `POST /api/picbed/upload` | 上传图片（form: `file`，可选 `folder`），返回 ImageKit 公网链接 |

## 安全提示

- `.env` 含密钥，请勿提交到 Git（已加入 `.gitignore`）
- 除健康检查 `GET /api/status` 和播放器只读接口 `GET /api/music` 外，所有 `/api/*` 接口都要求 `X-CMS-API-Key` 请求头
- 不要将 CMS 端口直接暴露到公网；如需远程使用，应同时配置 HTTPS 和网络访问控制
- 已在聊天、截图或日志中出现的 Private key 必须立即轮换
