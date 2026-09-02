import asyncio
import base64
import json
import os
import re
import uuid
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, File, Form, UploadFile

from api.image_validation import validate_image_content

router = APIRouter()

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
}
MAX_SIZE = 10 * 1024 * 1024
IMAGEKIT_API_URL = "https://api.imagekit.io/v1/files"
IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"


def load_env(path: str = None):
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def get_imagekit_config():
    load_env()
    private_key = os.environ.get("IMAGEKIT_PRIVATE_KEY", "").strip()
    public_key = os.environ.get("IMAGEKIT_PUBLIC_KEY", "").strip()
    url_endpoint = os.environ.get("IMAGEKIT_URL_ENDPOINT", "").strip().rstrip("/")
    missing = [
        name
        for name, value in [
            ("IMAGEKIT_PRIVATE_KEY", private_key),
            ("IMAGEKIT_PUBLIC_KEY", public_key),
            ("IMAGEKIT_URL_ENDPOINT", url_endpoint),
        ]
        if not value
    ]
    return {
        "configured": not missing,
        "missing": missing,
        "private_key": private_key,
        "public_key": public_key,
        "url_endpoint": url_endpoint,
    }


def _authorization_header(private_key: str):
    token = base64.b64encode(f"{private_key}:".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _request_json(request: Request):
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8"))
            message = payload.get("message") or payload.get("help")
        except (UnicodeDecodeError, json.JSONDecodeError):
            message = None
        raise RuntimeError(message or f"ImageKit 请求失败（HTTP {error.code}）") from error
    except URLError as error:
        raise RuntimeError(f"无法连接 ImageKit：{error.reason}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError("ImageKit 返回了无法解析的数据") from error


def _multipart_body(fields: dict, file_name: str, content_type: str, content: bytes):
    boundary = f"----AstroBlog{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("ascii"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    body.extend(f"--{boundary}\r\n".encode("ascii"))
    body.extend(
        f'Content-Disposition: form-data; name="file"; filename="{file_name}"\r\n'.encode("ascii")
    )
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("ascii"))
    body.extend(content)
    body.extend(f"\r\n--{boundary}--\r\n".encode("ascii"))
    return bytes(body), boundary


@router.get("/test")
async def test_picbed():
    cfg = get_imagekit_config()
    if not cfg["configured"]:
        message = "ImageKit 凭证未配置，缺少: " + ", ".join(cfg["missing"])
        return {"success": False, "ok": False, "message": message, "error": message}

    request = Request(
        f"{IMAGEKIT_API_URL}?limit=1",
        headers={"Authorization": _authorization_header(cfg["private_key"])},
    )
    try:
        await asyncio.to_thread(_request_json, request)
        return {
            "success": True,
            "ok": True,
            "message": "ImageKit 连接成功",
            "bucket": "ImageKit Media Library",
            "provider": "imagekit",
        }
    except RuntimeError as error:
        return {
            "success": False,
            "ok": False,
            "message": str(error),
            "error": str(error),
        }


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form("blog"),
):
    cfg = get_imagekit_config()
    if not cfg["configured"]:
        return {
            "success": False,
            "message": "ImageKit 凭证未配置，缺少: " + ", ".join(cfg["missing"]),
        }

    ext = ALLOWED_TYPES.get(file.content_type or "")
    if not ext:
        return {
            "success": False,
            "message": "仅支持 JPG / PNG / GIF / WebP / AVIF 图片",
        }

    content = await file.read(MAX_SIZE + 1)
    if not content:
        return {"success": False, "message": "空文件"}
    if len(content) > MAX_SIZE:
        return {"success": False, "message": "图片超过 10MB 限制"}
    valid, message = validate_image_content(file.filename or f"image{ext}", content)
    if not valid:
        return {"success": False, "message": message}

    folder = folder.strip().strip("/") or "blog"
    if not re.fullmatch(r"[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*", folder):
        return {"success": False, "message": "目录名只能包含字母、数字、下划线、连字符与路径分隔符"}

    file_name = f"{datetime.now().strftime('%Y-%m')}-{uuid.uuid4().hex}{ext}"
    body, boundary = _multipart_body(
        {"fileName": file_name, "folder": f"/{folder}", "useUniqueFileName": "false"},
        file_name,
        file.content_type or "application/octet-stream",
        content,
    )
    request = Request(
        IMAGEKIT_UPLOAD_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": _authorization_header(cfg["private_key"]),
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )

    try:
        payload = await asyncio.to_thread(_request_json, request)
        url = payload.get("url")
        if not url:
            return {"success": False, "message": "ImageKit 未返回图片地址"}
        return {
            "success": True,
            "message": "上传成功",
            "url": url,
            "key": payload.get("filePath", f"/{folder}/{file_name}"),
            "file_id": payload.get("fileId", ""),
            "provider": "imagekit",
        }
    except RuntimeError as error:
        return {"success": False, "message": str(error)}
