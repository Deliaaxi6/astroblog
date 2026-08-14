# AstroBlog CMS 后端（图床模块）

基于 FastAPI 的本地管理后端，当前仅实现 Cloudflare R2 图床模块。

## 首次配置

1. 复制 `.env.example` 为 `.env`，填写 R2 凭证：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 安装依赖：

   ```powershell
   pip install -r requirements.txt
   ```

3. 启动：

   ```powershell
   uvicorn main:app --port 8080
   ```

4. 浏览器打开 <http://localhost:8080> 使用图床；API 文档见 <http://localhost:8080/docs>

## R2 凭证获取（Cloudflare 后台）

1. **创建存储桶**：Cloudflare 控制台 → R2 → Create bucket（如 `myblog-images`）
2. **启用临时域名**：进入桶 → Settings → Public access → `r2.dev` subdomain → Allow，得到形如 `https://pub-xxxx.r2.dev` 的地址，填入 `R2_PUBLIC_URL`
3. **创建 API Token**：R2 → Manage R2 API Tokens → Create API token，权限选择 `Object Read & Write`，得到 Access Key ID 与 Secret Access Key，分别填入 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
4. **Account ID**：R2 首页右侧可看到账户 ID，填入 `R2_ACCOUNT_ID`

## 接口

| 接口 | 说明 |
|---|---|
| `GET /api/status` | 后端存活检查 |
| `GET /api/picbed/test` | 测试 R2 连接与桶访问 |
| `POST /api/picbed/upload` | 上传图片（form: `file`，可选 `folder`），返回 R2 公网链接 |

## 安全提示

- `.env` 含密钥，请勿提交到 Git（已加入 `.gitignore`）
- r2.dev 域名仅作开发用途（有速率限制），正式使用建议绑定自定义域名