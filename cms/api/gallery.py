"""
gallery · 光影画廊 API

管理 src/content/albums/ 集合：
- POST /api/gallery/albums       新建相册（multipart：title / description? / cover 文件）
- POST /api/gallery/albums/{id}/photos  批量上传照片（multipart files[]）

目录约定：
  src/content/albums/{id}.md          相册 frontmatter（cover/photos 均为相对路径）
  src/content/albums/{id}/cover.png   封面图
  src/content/albums/{id}/photos/     照片目录
"""
import os
import re
import json
import time
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form

from api.posts import _parse_frontmatter

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ALBUMS_DIR = os.path.join(BLOG_ROOT, "src", "content", "albums")

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
MAX_SIZE = 15 * 1024 * 1024
ID_SAFE = re.compile(r"[^a-zA-Z0-9_-]")

FM_KEYS = ["id", "title", "description", "cover", "createdAt", "photos"]


def _now_date():
    return datetime.now().strftime("%Y-%m-%d")


def _dump_album_fm(fm: dict) -> str:
    lines = ["---"]
    for k in FM_KEYS:
        if k not in fm or fm[k] is None or fm[k] == "":
            continue
        v = fm[k]
        if k == "photos":
            if v:
                lines.append("photos:")
                for p in v:
                    lines.append(f"  - {p}")
        elif isinstance(v, list):
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        else:
            lines.append(f"{k}: {json.dumps(str(v), ensure_ascii=False)}")
    lines.append("---")
    return "\n".join(lines)


def _album_md_path(album_id: str) -> str:
    return os.path.join(ALBUMS_DIR, f"{album_id}.md")


@router.post("/albums")
async def create_album(
    title: str = Form(...),
    description: str = Form(""),
    cover: UploadFile = File(...),
):
    title = title.strip()
    if not title:
        return {"success": False, "message": "相册名称不能为空"}
    ext = os.path.splitext(cover.filename or "cover.png")[1].lower()
    if ext not in ALLOWED_EXT:
        return {"success": False, "message": f"不支持的封面类型: {ext or '(无扩展名)'}"}
    data = await cover.read()
    if not data:
        return {"success": False, "message": "封面为空文件"}
    if len(data) > MAX_SIZE:
        return {"success": False, "message": "封面超过 15MB 限制"}

    album_id = f"album_{int(time.time() * 1000)}"
    album_dir = os.path.join(ALBUMS_DIR, album_id)
    try:
        os.makedirs(os.path.join(album_dir, "photos"), exist_ok=True)
        cover_name = f"cover{ext}"
        with open(os.path.join(album_dir, cover_name), "wb") as f:
            f.write(data)
        fm = {
            "id": album_id,
            "title": title,
            "description": description.strip() or None,
            "cover": f"./{album_id}/{cover_name}",
            "createdAt": _now_date(),
            "photos": [],
        }
        with open(_album_md_path(album_id), "w", encoding="utf-8") as f:
            f.write(_dump_album_fm(fm) + "\n")
    except Exception as e:
        return {"success": False, "message": f"创建失败: {e}"}

    return {"success": True, "message": f"相册已创建：{title}", "id": album_id}


@router.post("/albums/{album_id}/photos")
async def upload_photos(album_id: str, files: list[UploadFile] = File(...)):
    md_path = _album_md_path(album_id)
    if not os.path.exists(md_path):
        return {"success": False, "message": "相册不存在"}

    try:
        with open(md_path, "r", encoding="utf-8") as f:
            raw = f.read()
        fm, body = _parse_frontmatter(raw)
    except Exception as e:
        return {"success": False, "message": f"读取相册失败: {e}"}

    album_dir = os.path.join(ALBUMS_DIR, album_id)
    photos_dir = os.path.join(album_dir, "photos")
    os.makedirs(photos_dir, exist_ok=True)

    saved, skipped = [], []
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXT:
            skipped.append(f"{f.filename or '?'}：类型不支持")
            continue
        data = await f.read()
        if not data:
            skipped.append(f"{f.filename or '?'}：空文件")
            continue
        if len(data) > MAX_SIZE:
            skipped.append(f"{f.filename or '?'}：超过 15MB")
            continue
        name = f"{int(time.time() * 1000)}_{len(saved)}{ext}"
        try:
            with open(os.path.join(photos_dir, name), "wb") as fh:
                fh.write(data)
        except Exception as e:
            skipped.append(f"{f.filename or '?'}：写入失败 {e}")
            continue
        saved.append(f"./{album_id}/photos/{name}")

    if saved:
        fm["photos"] = list(fm.get("photos") or []) + saved
        try:
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(_dump_album_fm(fm) + "\n" + body.strip() + ("\n" if body.strip() else ""))
        except Exception as e:
            return {"success": False, "message": f"写入相册元数据失败: {e}"}

    return {
        "success": True,
        "message": f"上传完成：新增 {len(saved)} 张，跳过 {len(skipped)} 张",
        "saved": saved,
        "skipped": skipped,
    }