"""
sync · 同步中心 API

① rebuild  — 后台执行 npm run build，日志落盘，状态轮询
② images   — 扫描草稿 HTML 与已发布文章 markdown 中的相对路径图片，
             复制到 public/images/ 并重写引用为 /images/...
③ import   — 扫描博客物理文件（文章/说说），缺失项生成草稿 JSON 导入草稿箱
④ link     — 扫描说说文本中的 /blog/{id} 链接，校验文章存在性，报告失效引用
"""
import os
import re
import json
import time
import shutil
import threading
import subprocess
import markdown
from fastapi import APIRouter

from api.posts import _parse_frontmatter
from api.moments import _parse as _parse_moment_fm

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
POSTS_DIR = os.path.join(BLOG_ROOT, "src", "content", "blog")
MOMENTS_DIR = os.path.join(BLOG_ROOT, "src", "content", "moments")
DRAFTS_DIR = os.path.join(BLOG_ROOT, "manager_data", "drafts")
PUBLIC_IMAGES_DIR = os.path.join(BLOG_ROOT, "public", "images")
SYNC_LOGS_DIR = os.path.join(BLOG_ROOT, "manager_data", "sync-logs")

_id_re = re.compile(r"^[a-zA-Z0-9_-]+$")


# ============ ① 博客重建 ============

_build_lock = threading.Lock()
_build_proc = None
_build_state = {
    "running": False,
    "last_exit": None,
    "started_at": None,
    "finished_at": None,
    "log_file": None,
    "error": None,
}


@router.post("/rebuild")
async def rebuild():
    with _build_lock:
        if _build_state["running"]:
            return {"success": True, "message": "构建已在运行中", "running": True}
        _build_state.update(
            running=True, last_exit=None, started_at=int(time.time()),
            finished_at=None, error=None,
        )
        os.makedirs(SYNC_LOGS_DIR, exist_ok=True)
        log_file = os.path.join(SYNC_LOGS_DIR, f"build-{time.strftime('%Y%m%d-%H%M%S')}.log")
        _build_state["log_file"] = log_file

    def _run():
        global _build_proc
        try:
            npm = "npm.cmd" if os.name == "nt" else "npm"
            with open(log_file, "w", encoding="utf-8") as f:
                proc = subprocess.Popen(
                    [npm, "run", "build"], cwd=BLOG_ROOT,
                    stdout=f, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace",
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
                _build_proc = proc
                code = proc.wait()
            with _build_lock:
                _build_state["last_exit"] = code
                _build_state["finished_at"] = int(time.time())
                _build_state["running"] = False
        except Exception as e:
            with _build_lock:
                _build_state["error"] = str(e)
                _build_state["last_exit"] = -1
                _build_state["finished_at"] = int(time.time())
                _build_state["running"] = False

    threading.Thread(target=_run, daemon=True).start()
    return {"success": True, "message": "已开始重建博客", "running": True}


@router.post("/status")
async def status():
    global _build_proc
    proc = _build_proc
    if _build_state["running"] and proc is not None and proc.poll() is not None:
        with _build_lock:
            _build_state["last_exit"] = proc.poll()
            _build_state["finished_at"] = int(time.time())
            _build_state["error"] = "构建进程已退出（可能被外部终止），状态已复位"
            _build_state["running"] = False
    with _build_lock:
        st = dict(_build_state)
    tail = ""
    log_file = st.get("log_file")
    if log_file and os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                lines = f.read().splitlines()
            tail = "\n".join(lines[-15:])
        except Exception:
            pass
    return {"success": True, "status": st, "logTail": tail}


# ============ ② 图片资源同步 ============

_md_img_re = re.compile(r"!\[[^\]]*\]\(([^)\s]+)")
_html_img_re = re.compile(r"<img[^>]*\bsrc\s*=\s*[\"']([^\"'>\s]+)", re.IGNORECASE)


def _is_external(src: str) -> bool:
    return src.startswith(("http://", "https://", "//", "data:", "/"))


def _extract_refs(text: str):
    """返回 [(start, end, src)]，src 为原始引用串"""
    refs = []
    for m in _md_img_re.finditer(text):
        refs.append((m.start(1), m.end(1), m.group(1)))
    for m in _html_img_re.finditer(text):
        refs.append((m.start(1), m.end(1), m.group(1)))
    return refs


def _file_same(path_a: str, path_b: str) -> bool:
    try:
        return os.path.exists(path_a) and os.path.exists(path_b) and os.path.getsize(path_a) == os.path.getsize(path_b)
    except Exception:
        return False


def _sync_images_in_source(source_kind: str, src_text: str, base_dir: str, copied, skipped, rewritten, errors):
    """处理单份源文本中的相对图片引用，返回重写后的文本"""
    text = src_text
    refs = [r for r in _extract_refs(text) if not _is_external(r[2])]
    if not refs:
        return text
    for start, end, src in sorted(refs, key=lambda x: -x[0]):
        cand = os.path.normpath(os.path.join(base_dir, src))
        if not os.path.isfile(cand):
            skipped.append(f"[{source_kind}] 文件不存在: {src}")
            continue
        name = os.path.basename(cand)
        target = os.path.join(PUBLIC_IMAGES_DIR, name)
        os.makedirs(PUBLIC_IMAGES_DIR, exist_ok=True)
        new_src = f"/images/{name}"
        if os.path.exists(target) and not _file_same(target, cand):
            skipped.append(f"[{source_kind}] public/images/{name} 已存在且内容不同: {src}")
            continue
        if not os.path.exists(target):
            try:
                shutil.copy2(cand, target)
                copied.append(name)
            except Exception as e:
                errors.append(f"复制失败 {name}: {e}")
                continue
        text = text[:start] + new_src + text[end:]
        rewritten[0] += 1
    return text


@router.post("/images")
async def sync_images():
    copied, skipped, rewritten, errors = [], [], [0], []
    files_changed = []

    # 已发布文章 markdown
    if os.path.isdir(POSTS_DIR):
        for filename in sorted(os.listdir(POSTS_DIR)):
            if not filename.endswith(".md"):
                continue
            path = os.path.join(POSTS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
            except Exception as e:
                errors.append(f"读取失败 {filename}: {e}")
                continue
            new_text = _sync_images_in_source(
                f"post/{filename}", raw, os.path.dirname(path),
                copied, skipped, rewritten, errors,
            )
            if new_text != raw:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_text)
                files_changed.append(filename)

    # 草稿 HTML
    if os.path.isdir(DRAFTS_DIR):
        for filename in sorted(os.listdir(DRAFTS_DIR)):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(DRAFTS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                errors.append(f"读取失败 {filename}: {e}")
                continue
            content = data.get("content", "")
            if not content:
                continue
            new_text = _sync_images_in_source(
                f"draft/{filename}", content, os.path.dirname(path),
                copied, skipped, rewritten, errors,
            )
            if new_text != content:
                data["content"] = new_text
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                files_changed.append(filename)

    return {
        "success": True,
        "message": f"图片同步完成：复制 {len(copied)} 张，重写引用 {rewritten[0]} 处，跳过 {len(skipped)} 项",
        "copied": copied,
        "rewritten": rewritten[0],
        "skipped": skipped,
        "changedFiles": files_changed,
        "errors": errors,
    }


# ============ ③ 博客 → 管理端导入 ============

def _scan_sources():
    """返回 [{'type','id','data'}]：data 为草稿结构（content 为 HTML）"""
    sources = []
    if os.path.isdir(POSTS_DIR):
        for filename in sorted(os.listdir(POSTS_DIR)):
            if not filename.endswith(".md"):
                continue
            path = os.path.join(POSTS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
                fm, body = _parse_frontmatter(raw)
            except Exception:
                continue
            sources.append({
                "type": "post",
                "id": filename[:-3],
                "data": {
                    "id": filename[:-3],
                    "type": "post",
                    "title": fm.get("title", ""),
                    "description": fm.get("description", ""),
                    "content": markdown.markdown(body.strip(), extensions=["fenced_code", "tables", "nl2br"]),
                    "cover": fm.get("cover", ""),
                    "tags": fm.get("tags", []),
                    "mood": "",
                    "date": str(fm.get("pubDate", "") or "")[:10],
                    "lastModified": int(os.path.getmtime(path) * 1000),
                },
            })
    if os.path.isdir(MOMENTS_DIR):
        for filename in sorted(os.listdir(MOMENTS_DIR)):
            if not filename.endswith(".md"):
                continue
            path = os.path.join(MOMENTS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
                fm, body = _parse_moment_fm(raw)
            except Exception:
                continue
            sources.append({
                "type": "chatter",
                "id": filename[:-3],
                "data": {
                    "id": filename[:-3],
                    "type": "chatter",
                    "title": "",
                    "description": "",
                    "content": markdown.markdown(body.strip(), extensions=["fenced_code", "tables", "nl2br"]),
                    "cover": "",
                    "tags": [],
                    "mood": "",
                    "date": fm.get("date", ""),
                    "lastModified": int(os.path.getmtime(path) * 1000),
                },
            })
    return sources


@router.post("/import")
async def import_local():
    os.makedirs(DRAFTS_DIR, exist_ok=True)
    existing = set()
    for filename in os.listdir(DRAFTS_DIR):
        if filename.endswith(".json"):
            existing.add(filename[:-5])

    imported, skipped = [], []
    for src in _scan_sources():
        doc_id = src["id"]
        if doc_id in existing:
            skipped.append(f"{src['type']}/{doc_id}（已有草稿）")
            continue
        data = src["data"]
        try:
            with open(os.path.join(DRAFTS_DIR, f"{doc_id}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            imported.append(f"{src['type']}/{doc_id}：{data.get('title') or '(无标题)'}")
        except Exception as e:
            skipped.append(f"{src['type']}/{doc_id}（写入失败: {e}）")

    return {
        "success": True,
        "message": f"导入完成：新增草稿 {len(imported)} 个，跳过 {len(skipped)} 个",
        "imported": imported,
        "skipped": skipped,
    }


# ============ ④ 动态 ↔ 文章关联同步 ============

_blog_link_re = re.compile(r"/blog/([a-zA-Z0-9_-]+)")


@router.post("/link")
async def link_sync():
    broken = []
    checked = 0
    if os.path.isdir(MOMENTS_DIR):
        for filename in sorted(os.listdir(MOMENTS_DIR)):
            if not filename.endswith(".md"):
                continue
            path = os.path.join(MOMENTS_DIR, filename)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    raw = f.read()
            except Exception:
                continue
            checked += 1
            for m in _blog_link_re.finditer(raw):
                doc_id = m.group(1)
                if not os.path.exists(os.path.join(POSTS_DIR, f"{doc_id}.md")):
                    broken.append(f"{filename[:-3]} → /blog/{doc_id}（文章不存在）")

    return {
        "success": True,
        "message": f"关联校验完成：检查 {checked} 篇动态，失效引用 {len(broken)} 处",
        "checked": checked,
        "broken": broken,
    }
