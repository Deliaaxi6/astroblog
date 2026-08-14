import os
import uuid
from datetime import datetime

import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from fastapi import APIRouter, File, Form, UploadFile

router = APIRouter()

ALLOWED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
}
MAX_SIZE = 10 * 1024 * 1024


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


def get_r2_config():
    load_env()
    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "").strip()
    bucket = os.environ.get("R2_BUCKET", "").strip()
    public_url = os.environ.get("R2_PUBLIC_URL", "").strip()
    missing = [
        name
        for name, v in [
            ("R2_ACCOUNT_ID", account_id),
            ("R2_ACCESS_KEY_ID", access_key),
            ("R2_SECRET_ACCESS_KEY", secret_key),
            ("R2_BUCKET", bucket),
            ("R2_PUBLIC_URL", public_url),
        ]
        if not v
    ]
    return {
        "configured": not missing,
        "missing": missing,
        "account_id": account_id,
        "access_key": access_key,
        "secret_key": secret_key,
        "bucket": bucket,
        "public_url": public_url,
    }


def get_client(cfg: dict):
    return boto3.client(
        "s3",
        endpoint_url=f"https://{cfg['account_id']}.r2.cloudflarestorage.com",
        aws_access_key_id=cfg["access_key"],
        aws_secret_access_key=cfg["secret_key"],
        region_name="auto",
    )


@router.get("/test")
def test_picbed():
    cfg = get_r2_config()
    if not cfg["configured"]:
        return {
            "success": False,
            "message": "R2 凭证未配置，缺少: " + ", ".join(cfg["missing"]),
        }
    try:
        client = get_client(cfg)
        client.head_bucket(Bucket=cfg["bucket"])
        return {"success": True, "message": f"R2 连接成功，桶: {cfg['bucket']}"}
    except NoCredentialsError:
        return {"success": False, "message": "凭证无效"}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        return {"success": False, "message": f"桶访问失败 ({code}): {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"网络异常: {str(e)}"}


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form("blog"),
):
    cfg = get_r2_config()
    if not cfg["configured"]:
        return {
            "success": False,
            "message": "R2 凭证未配置，缺少: " + ", ".join(cfg["missing"]),
        }

    ext = ALLOWED_TYPES.get(file.content_type or "")
    if not ext:
        return {
            "success": False,
            "message": "仅支持 JPG / PNG / GIF / WebP / SVG / AVIF 图片",
        }

    content = await file.read()
    if len(content) > MAX_SIZE:
        return {"success": False, "message": "图片超过 10MB 限制"}

    folder = folder.strip().strip("/") or "blog"
    key = f"{folder}/{datetime.now().strftime('%Y-%m')}/{uuid.uuid4().hex}{ext}"

    try:
        client = get_client(cfg)
        client.put_object(
            Bucket=cfg["bucket"],
            Key=key,
            Body=content,
            ContentType=file.content_type,
        )
        url = f"{cfg['public_url'].rstrip('/')}/{key}"
        return {"success": True, "message": "上传成功", "url": url, "key": key}
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        return {"success": False, "message": f"上传失败 ({code}): {str(e)}"}
    except Exception as e:
        return {"success": False, "message": f"服务器异常: {str(e)}"}