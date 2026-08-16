# AstroBlog 项目状态与待办清单

> 最后更新：2026-08-16（第 16 次提交 `5eea706`）
> 项目位置：`E:\develop\AstroBlog`

## 一、项目架构

```
AstroBlog/
├── src/                 Astro 静态站点（构建产物 dist/ 可直接部署）
│   ├── pages/           页面（首页/文章/说说/画廊/友链/项目/归档/标签/关于/404/SEO 文件）
│   ├── content/         Markdown 内容（blog/ 4 篇、moments/ 3 条）
│   ├── data/            friends / projects / albums 数据（ts 文件）
│   ├── lib/             site.ts 站点配置、reading.ts 阅读时间
│   └── components/      TOC、Gitalk 等组件
├── cms/                 FastAPI 管理后端（本机按需启动，端口 8080）
│   ├── api/             posts / moments / site-data / music / picbed(R2)
│   ├── static/          管理台页面（六 tab：文章/说说/友链/项目/相册/图床）
│   └── .env             R2 凭证（未填写，已 gitignore）
└── dist/                构建产物（Pagefind 索引 24 页）
```

关键设计：**CMS 与博客同仓**，管理台直写 `src/content/*.md` 与 `src/data/*.ts`，`npm run build` 后生效。

## 二、已完成（16 个提交）

| 提交 | 内容 |
|---|---|
| `bb00f07` | 初始化仓库：XHBlogs 首页移植 + R2 图床后端骨架 |
| `1e1bb60` | SEO 基建：RSS / Sitemap / robots.txt / 404 / OG 标签 |
| `efaabde` | 文章体验：KaTeX 公式、TOC、封面图、阅读时间 |
| `9fbc999` | 说说 / 画廊 / 友链 / 项目 四个页面（原版数据迁移） |
| `0ee44de` | 归档时间线（双视图）+ 标签聚合页 |
| `c47eec4` | Pagefind 全文搜索（24 页索引，首页下拉接入） |
| `aaef0e5` | Gitalk 评论（文章页 + 友链留言板，待配置凭证） |
| `8180b7c` | CMS 内容 API：文章/说说/站点数据（写 MD/TS 文件） |
| `aa011bc` | 管理台页面（六 tab，http://localhost:8080） |
| `1cfc5d8` | 音乐真实播放（网易云代理 API + LRC 歌词 + 真实 Audio） |
| `8d3ff77` | 3 篇示例文章补封面 |
| `df9d3ce` | TODO.md 项目状态文档 |
| `dd77280` | 首页"说说轮播"接真实 moments（标题=首行、封面=首图、空态保护、点击跳 /moments） |
| `611dd0a` | 管理台编辑器 Markdown 实时预览（编辑/预览 tab，零依赖渲染器，XSS 转义） |
| `196ea0e` | 播放器线上回退：服务不可达时显示"点击卡片重试"，点击触发重连 |
| `bd935f1` | SEO 深化：canonical + bu.dusays.com 预连接 + WebSite/Article JSON-LD |
| `5eea706` | 图片懒加载收尾（首页 poster 卡片图） |

## 三、待完成 — 需用户操作（代码已就绪）

### 1. Cloudflare R2 图床凭证 ⬜ 暂缓中
- 步骤：Cloudflare 控制台 → R2 → 创建存储桶 → 创建 API 令牌（对象读写权限）→ 填写 `cms/.env`：
  ```
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=...
  R2_PUBLIC_URL=...
  ```
- 填完无需重启（`get_r2_config()` 每次请求自动加载 `.env`）
- 验证：管理台 → 图床 tab → "测试连接" → 上传一张图

### 2. Gitalk 评论配置 ⬜
- 步骤：GitHub → Settings → Developer settings → OAuth Apps → New OAuth App（callback 填本地 `http://localhost:4321` 或线上域名）
- 填写 `src/lib/site.ts` 的 `gitalk` 段：clientID / clientSecret / repo（公开仓库）/ owner / admin
- 说明：secret 暴露在前端是 Gitalk 官方设计（用于换 token），非泄露风险

### 3. 部署上线 ⬜
- 静态站：推荐 Cloudflare Pages（免费）或腾讯云轻量服务器（国内快，可同时跑 CMS）
- 需在 `astro.config.mjs` 填 `site` 域名（影响 RSS / Sitemap / OG / canonical / JSON-LD 的绝对 URL）
- Git 远程推送：用户自行执行（`git remote add origin ...` + `git push`），当前分支 `master`，未确认是否已推送

### 4. CMS 线上部署方案 ⬜ 未规划
- 音乐 API / 管理台依赖 FastAPI 后端，纯静态托管装不下
- 可选：VPS 同机部署 / PaaS（Railway、Render、Zeabur）/ 暂保持本机使用

## 四、待完成 — AI 可继续（原清单已全部完成 ✅）

原四项（说说轮播真实数据 / 编辑器 MD 预览 / 播放器回退 / 示例文章扩充）中前三项已完成，仅剩"示例文章内容扩充"——需要用户提供真实内容方向后 AI 才能代写。

## 五、后续规划（可选优化）

- 持续写作真实内容（替换示例文章）⬅ 需用户提供素材/方向
- 友链 / 项目 / 相册内容真实化（当前为原版演示数据）⬅ 需用户提供真实信息
- 音乐歌单自定义（`cloudMusicIds` 目前用原版 3 首，可做成管理台可编辑）
- SEO 已部分深化（canonical/JSON-LD/预连接），剩余：逐篇完善 description、关键词
- 性能：字体子集化、预加载关键资源（懒加载已基本覆盖）
- R2 用量监控 / 防盗链配置
- 评论数据备份策略

## 六、操作备忘

### CMS 启动 / 重启（按需启动模式）
```powershell
# 启动（workdir E:\develop\AstroBlog\cms）
Start-Process python -ArgumentList "-m","uvicorn","main:app","--port","8080" -WorkingDirectory "E:\develop\AstroBlog\cms" -RedirectStandardOutput "uvicorn.log" -RedirectStandardError "uvicorn.err.log" -WindowStyle Hidden
# 访问
http://localhost:8080   # 管理台 / 音乐 API / 图床
```
- 注意：改动 `cms/` 代码后需重启进程才生效（无 --reload）
- 本机 CMS 进程曾被外部环境多次终止（无崩溃日志），属正常现象，按需重启即可

### 构建与本地预览
```powershell
npm run build   # 构建 + Pagefind 自动索引（24 页）
npm run dev     # 开发预览（全文搜索需先 build 一次生成索引）
```

### 测试脚本
- `C:\Users\Delia\AppData\Local\Temp\opencode\test_cms_api.py` — CMS 接口回归测试（临时文件）

### 已知事件记录
- 2026-08-14：`src/content/` 下 7 个 md 文件曾从工作区消失（无删除操作记录，原因不明），已通过 `git checkout -- src/content/` 恢复，无内容丢失。**警示：工作区可能被外部因素干扰，git 是唯一可靠备份，重要内容请及时提交。**
- CMS 端口 8080 曾被旧进程占用导致新代码不生效，重启流程需先确认监听 PID。

### 环境信息
- Git：user `Deliaaxi6` / `deliaaxi6@gmail.com`，分支 `master`，共 16 个提交，无远程
- 依赖：Astro 7.2.1、FastAPI 0.141.1、boto3、pyyaml、pagefind 1.5.2、@astrojs/markdown-remark
- Python：Miniconda3（含 requests、pyyaml 等）