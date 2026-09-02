"""
local_images · 本地图片上传 API

编辑器「插图」按钮：上传图片文件到 public/images/，
返回可直接插入 markdown 的 URL（/images/xxx.png）。
"""
import os
import re
import time

from fastapi import APIRouter, UploadFile, File

from api.image_validation import ALLOWED_EXTENSIONS, validate_image_content

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PUBLIC_IMAGES_DIR = os.path.join(BLOG_ROOT, "public", "images")

MAX_SIZE = 10 * 1024 * 1024
NAME_SAFE = re.compile(r"[^a-zA-Z0-9_.\-]")


@router.post("/upload")
async def upload_local(file: UploadFile = File(...)):
    original = file.filename or "image.png"
    ext = os.path.splitext(original)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return {"success": False, "message": f"不支持的图片类型: {ext or '(无扩展名)'}"}
    data = await file.read(MAX_SIZE + 1)
    if not data:
        return {"success": False, "message": "空文件"}
    if len(data) > MAX_SIZE:
        return {"success": False, "message": "图片超过 10MB 限制"}

    valid, message = validate_image_content(original, data)
    if not valid:
        return {"success": False, "message": message}

    os.makedirs(PUBLIC_IMAGES_DIR, exist_ok=True)
    base = NAME_SAFE.sub("_", os.path.splitext(original)[0])[:40] or "image"
    name = f"{int(time.time() * 1000)}-{base}{ext}"
    path = os.path.join(PUBLIC_IMAGES_DIR, name)
    try:
        with open(path, "wb") as f:
            f.write(data)
    except Exception as e:
        return {"success": False, "message": f"写入失败: {e}"}

    return {"success": True, "message": "图片已上传", "url": f"/images/{name}", "filename": name}
