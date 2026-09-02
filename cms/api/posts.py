import os
import re
import json
import time
import yaml
from datetime import datetime, date
from fastapi import APIRouter, Request

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
POSTS_DIR = os.path.join(BLOG_ROOT, "src", "content", "blog")

KNOWN_KEYS = ["title", "description", "pubDate", "updatedDate", "tags", "cover", "draft"]
FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _parse_frontmatter(raw: str):
    m = FM_RE.match(raw)
    if not m:
        return {}, raw
    try:
        fm = yaml.safe_load(m.group(1)) or {}
        if not isinstance(fm, dict):
            fm = {}
    except Exception:
        fm = {}
    for k, v in list(fm.items()):
        if isinstance(v, (datetime, date)):
            fm[k] = v.isoformat()
    return fm, raw[m.end():]


def _safe_id(raw_id: str):
    value = raw_id.replace(".md", "")
    return value if ID_RE.fullmatch(value) else None


def _dump_frontmatter(fm: dict) -> str:
    lines = ["---"]
    for k in KNOWN_KEYS:
        if k not in fm or fm[k] is None or fm[k] == "":
            continue
        v = fm[k]
        if isinstance(v, list):
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        elif isinstance(v, bool):
            lines.append(f"{k}: {str(v).lower()}")
        else:
            lines.append(f"{k}: {json.dumps(str(v), ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def _scan_posts():
    posts = []
    if not os.path.isdir(POSTS_DIR):
        return posts
    for filename in os.listdir(POSTS_DIR):
        if not filename.endswith(".md"):
            continue
        path = os.path.join(POSTS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = f.read()
            fm, body = _parse_frontmatter(raw)
            posts.append({
                "id": filename[:-3],
                "title": fm.get("title", filename[:-3]),
                "description": fm.get("description", ""),
                "pubDate": fm.get("pubDate", ""),
                "tags": fm.get("tags", []),
                "cover": fm.get("cover", ""),
                "draft": fm.get("draft", False),
                "wordCount": len(body.strip()),
            })
        except Exception:
            continue
    posts.sort(key=lambda p: str(p.get("pubDate") or ""), reverse=True)
    return posts


@router.post("/list")
async def list_posts():
    return {"success": True, "posts": _scan_posts()}


@router.post("/get")
async def get_post(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}
    raw_id = _safe_id(str(payload.get("id", "")))
    if not raw_id:
        return {"success": False, "message": "ID 非法"}
    path = os.path.join(POSTS_DIR, f"{raw_id}.md")
    if not os.path.exists(path):
        return {"success": False, "message": "未找到该文章"}
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    fm, body = _parse_frontmatter(raw)
    return {"success": True, "post": {"id": raw_id, "frontmatter": fm, "content": body.strip()}}


@router.post("/save")
async def save_post(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = str(payload.get("id", "")).strip()
    fm = dict(payload.get("frontmatter") or {})
    content = str(payload.get("content", ""))

    title = fm.get("title")
    if not isinstance(title, str) or not title.strip() or len(title.strip()) > 200:
        return {"success": False, "message": "标题不能为空且不能超过 200 个字符"}
    fm["title"] = title.strip()
    description = fm.get("description", "")
    if not isinstance(description, str) or len(description) > 1000:
        return {"success": False, "message": "摘要必须是字符串且不能超过 1000 个字符"}
    tags = fm.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 20 or not all(
        isinstance(tag, str) and 0 < len(tag.strip()) <= 50 for tag in tags
    ):
        return {"success": False, "message": "标签最多 20 个，每个标签长度为 1-50 个字符"}
    fm["tags"] = [tag.strip() for tag in tags]
    if "draft" in fm and not isinstance(fm["draft"], bool):
        return {"success": False, "message": "draft 必须是布尔值"}
    if len(content.encode("utf-8")) > 2 * 1024 * 1024:
        return {"success": False, "message": "文章正文不能超过 2MB"}

    for k in KNOWN_KEYS:
        if k in fm and fm[k] is None:
            fm.pop(k, None)

    if not raw_id or raw_id == "new":
        raw_id = f"post_{int(time.time() * 1000)}"
    if not ID_RE.match(raw_id):
        return {"success": False, "message": "ID 只能包含字母、数字、下划线与连字符"}

    old_fm = {}
    path = os.path.join(POSTS_DIR, f"{raw_id}.md")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            old_fm, _ = _parse_frontmatter(f.read())
    merged = dict(old_fm)
    merged.update({k: v for k, v in fm.items() if k in KNOWN_KEYS})

    pub_date = merged.get("pubDate")
    if not pub_date:
        merged["pubDate"] = datetime.now().strftime("%Y-%m-%d")

    final_text = _dump_frontmatter(merged) + "\n\n" + content.strip() + "\n"
    os.makedirs(POSTS_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(final_text)
    return {"success": True, "message": f"文章已保存: {raw_id}", "id": raw_id}


@router.post("/delete")
async def delete_post(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}
    raw_id = _safe_id(str(payload.get("id", "")))
    if not raw_id:
        return {"success": False, "message": "ID 非法"}
    path = os.path.join(POSTS_DIR, f"{raw_id}.md")
    if os.path.exists(path):
        os.remove(path)
        return {"success": True, "message": "文章已删除"}
    return {"success": False, "message": "未找到该文章"}


@router.post("/tags")
async def all_tags():
    tags = set()
    for p in _scan_posts():
        for t in (p.get("tags") or []):
            tags.add(str(t))
    return {"success": True, "tags": sorted(tags)}
