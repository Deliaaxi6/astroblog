import os
import re
import json
import time
import yaml
from datetime import datetime, date
from fastapi import APIRouter, Request

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MOMENTS_DIR = os.path.join(BLOG_ROOT, "src", "content", "moments")

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)
ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")


def _parse(raw: str):
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


def _dump(fm: dict) -> str:
    lines = ["---"]
    for k in ["id", "date", "location", "images", "pinned"]:
        if k not in fm or fm[k] is None or fm[k] == "":
            continue
        v = fm[k]
        if isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, list):
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        else:
            lines.append(f"{k}: {json.dumps(str(v), ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def _scan():
    items = []
    if not os.path.isdir(MOMENTS_DIR):
        return items
    for filename in os.listdir(MOMENTS_DIR):
        if not filename.endswith(".md"):
            continue
        path = os.path.join(MOMENTS_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = f.read()
            fm, body = _parse(raw)
            items.append({
                "id": filename[:-3],
                "date": fm.get("date", ""),
                "location": fm.get("location", ""),
                "images": fm.get("images", []),
                "pinned": bool(fm.get("pinned", False)),
                "content": body.strip(),
            })
        except Exception:
            continue
    items.sort(key=lambda x: str(x.get("date") or ""), reverse=True)
    return items


@router.post("/list")
async def list_moments():
    return {"success": True, "moments": _scan()}


@router.post("/save")
async def save_moment(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = str(payload.get("id", "")).strip()
    fm = dict(payload.get("frontmatter") or {})
    content = str(payload.get("content", ""))

    if not raw_id or raw_id == "new":
        raw_id = f"moment_{int(time.time() * 1000)}"
    if not ID_RE.match(raw_id):
        return {"success": False, "message": "ID 只能包含字母、数字、下划线与连字符"}

    if not fm.get("date"):
        fm["date"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fm["id"] = raw_id

    final_text = _dump(fm) + "\n\n" + content.strip() + "\n"
    os.makedirs(MOMENTS_DIR, exist_ok=True)
    path = os.path.join(MOMENTS_DIR, f"{raw_id}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(final_text)
    return {"success": True, "message": f"说说已保存: {raw_id}", "id": raw_id}


@router.post("/delete")
async def delete_moment(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}
    raw_id = str(payload.get("id", "")).replace(".md", "")
    path = os.path.join(MOMENTS_DIR, f"{raw_id}.md")
    if os.path.exists(path):
        os.remove(path)
        return {"success": True, "message": "说说已删除"}
    return {"success": False, "message": "未找到该说说"}