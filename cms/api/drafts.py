import os
import re
import json
import time
import yaml
import markdown
from datetime import datetime
from fastapi import APIRouter, Request
from markdownify import markdownify as md_to_md

from api.posts import _parse_frontmatter, _dump_frontmatter, POSTS_DIR
from api.moments import _parse as _parse_moment_fm, _dump as _dump_moment_fm, MOMENTS_DIR

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DRAFTS_DIR = os.path.join(BLOG_ROOT, "manager_data", "drafts")
ID_RE = re.compile(r"^[a-zA-Z0-9_-]+$")
EMPTY_P_RE = re.compile(r"<p>&#12288;<\/p>|<p><\/p>")
BR_RE = re.compile(r"<br\s*\/?>")


def _drafts_dir():
    os.makedirs(DRAFTS_DIR, exist_ok=True)
    return DRAFTS_DIR


def _resolve_md_path(doc_type, doc_id):
    if doc_type == "chatter":
        return os.path.join(MOMENTS_DIR, f"{doc_id}.md")
    return os.path.join(POSTS_DIR, f"{doc_id}.md")


@router.post("/save")
async def save_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "后端无法解析传来的 JSON 数据"}

    draft_id = str(payload.get("id") or "").strip()
    if not draft_id or draft_id == "new":
        draft_id = f"draft_{int(time.time() * 1000)}"
    if not ID_RE.match(draft_id):
        return {"success": False, "message": "ID 只能包含字母、数字、下划线与连字符"}

    draft_data = {
        "id": draft_id,
        "type": payload.get("type", "post"),
        "title": payload.get("title", ""),
        "description": payload.get("description", ""),
        "content": payload.get("content", ""),
        "cover": payload.get("cover", ""),
        "tags": payload.get("tags", []),
        "mood": payload.get("mood", ""),
        "date": payload.get("date", ""),
        "lastModified": int(time.time() * 1000)
    }

    file_path = os.path.join(_drafts_dir(), f"{draft_id}.json")
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(draft_data, f, ensure_ascii=False, indent=2)
        return {"success": True, "message": "草稿已安全落盘", "id": draft_id}
    except Exception as e:
        return {"success": False, "message": f"草稿保存失败: {str(e)}"}


@router.post("/list")
async def list_drafts():
    drafts = []
    if not os.path.isdir(DRAFTS_DIR):
        return {"success": True, "drafts": []}

    for filename in os.listdir(DRAFTS_DIR):
        if not filename.endswith(".json"):
            continue
        file_path = os.path.join(DRAFTS_DIR, filename)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            content = data.get("content", "")
            data["contentPreview"] = content[:100] if content else ""
            if "content" in data:
                del data["content"]
            drafts.append(data)
        except Exception:
            continue
    drafts.sort(key=lambda x: x.get("lastModified", 0), reverse=True)
    return {"success": True, "drafts": drafts}


@router.post("/get")
async def get_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = str(payload.get("id", "")).replace(".md", "")
    doc_type = payload.get("type", "post")

    file_path = os.path.join(DRAFTS_DIR, f"{raw_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return {"success": True, "draft": json.load(f)}

    md_path = _resolve_md_path(doc_type, raw_id)
    if os.path.exists(md_path):
        try:
            with open(md_path, "r", encoding="utf-8") as f:
                raw = f.read()
            if doc_type == "chatter":
                fm, body = _parse_moment_fm(raw)
                draft_data = {
                    "id": raw_id,
                    "type": "chatter",
                    "title": "",
                    "content": body.strip(),
                    "tags": [],
                    "cover": "",
                    "description": "",
                    "mood": "",
                    "date": fm.get("date", "")
                }
            else:
                fm, body = _parse_frontmatter(raw)
                draft_data = {
                    "id": raw_id,
                    "type": "post",
                    "title": fm.get("title", ""),
                    "content": body.strip(),
                    "tags": fm.get("tags", []),
                    "cover": fm.get("cover", ""),
                    "description": fm.get("description", ""),
                    "mood": "",
                    "date": (fm.get("pubDate") or "").split(" ")[0]
                }
            draft_data["content"] = markdown.markdown(
                draft_data["content"], extensions=["fenced_code", "tables", "nl2br"]
            )
            return {"success": True, "draft": draft_data}
        except Exception as e:
            return {"success": False, "message": f"解析物理文件失败: {str(e)}"}

    return {"success": False, "message": "未找到相关文件"}


@router.post("/delete")
async def delete_draft(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    raw_id = str(payload.get("id", "")).replace(".md", "").replace(".json", "")
    possible_paths = [
        os.path.join(DRAFTS_DIR, f"{raw_id}.json"),
        os.path.join(POSTS_DIR, f"{raw_id}.md"),
        os.path.join(MOMENTS_DIR, f"{raw_id}.md")
    ]

    deleted_count = 0
    for p in possible_paths:
        if os.path.exists(p):
            try:
                os.remove(p)
                deleted_count += 1
            except Exception:
                continue

    if deleted_count > 0:
        return {"success": True, "message": "已彻底销毁相关文件"}
    return {"success": False, "message": "未找到相关文件"}


@router.post("/sync_local")
async def sync_local_operations(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    operations = payload.get("operations", [])
    results = []

    for op in operations:
        if op.get("type") != "publish_article":
            continue
        data = op.get("value", {})
        doc_type = data.get("type", "post")
        doc_id = str(data.get("id", "")).strip()
        if not doc_id or doc_id == "new":
            doc_id = f"{doc_type}_{int(time.time())}"
        if not ID_RE.match(doc_id):
            results.append(f"跳过非法 ID: {doc_id}")
            continue

        raw_html = data.get("content", "")
        raw_html = EMPTY_P_RE.sub("<br><br>", raw_html)
        md_content = md_to_md(raw_html, heading_style="ATX", keep=["img", "br"])
        md_content = BR_RE.sub("\n\n", md_content)

        input_date = str(data.get("date", "")).strip()
        if len(input_date) <= 10:
            current_time = datetime.now().strftime("%H:%M:%S")
            final_date = f"{input_date} {current_time}" if input_date else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        else:
            final_date = input_date

        if doc_type == "chatter":
            fm = {"id": doc_id, "date": final_date}
            final_text = _dump_moment_fm(fm) + "\n\n" + md_content.strip() + "\n"
        else:
            fm = {
                "title": data.get("title", ""),
                "description": data.get("description", ""),
                "tags": data.get("tags", []),
                "cover": data.get("cover", ""),
                "pubDate": final_date[:10]
            }
            if data.get("draft") is False:
                fm["draft"] = False
            final_text = _dump_frontmatter(fm) + "\n\n" + md_content.strip() + "\n"

        save_path = _resolve_md_path(doc_type, doc_id)
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            f.write(final_text)

        draft_path = os.path.join(DRAFTS_DIR, f"{doc_id}.json")
        if os.path.exists(draft_path):
            try:
                os.remove(draft_path)
            except Exception:
                pass

        results.append(f"已发布: {data.get('title', '') or doc_id}")

    return {"success": True, "message": "\n".join(results)}


@router.post("/all_tags")
async def get_all_historical_tags():
    post_tags = set()
    if os.path.isdir(POSTS_DIR):
        for filename in os.listdir(POSTS_DIR):
            if not filename.endswith(".md"):
                continue
            try:
                with open(os.path.join(POSTS_DIR, filename), "r", encoding="utf-8") as f:
                    fm, _ = _parse_frontmatter(f.read())
                for t in (fm.get("tags") or []):
                    post_tags.add(str(t))
            except Exception:
                continue
    return {"success": True, "postTags": sorted(post_tags), "chatterTags": []}
