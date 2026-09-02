import os


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}


def _detected_extension(data: bytes):
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in (b"avif", b"avis"):
        return ".avif"
    return None


def validate_image_content(filename: str, data: bytes):
    extension = os.path.splitext(filename or "")[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        return False, f"不支持的图片类型: {extension or '(无扩展名)'}"

    detected = _detected_extension(data)
    expected = ".jpg" if extension == ".jpeg" else extension
    if detected != expected:
        return False, "文件内容与图片扩展名不匹配"
    return True, ""
