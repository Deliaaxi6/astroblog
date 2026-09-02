import os
import re
import json
import time
import urllib.parse
import urllib.request
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA_DIR = os.path.join(BLOG_ROOT, "src", "data")
MUSIC_FILE = os.path.join(DATA_DIR, "music.ts")
MUSIC_TS_RE = re.compile(r"export const musicIds: string\[\] = (\[[\s\S]*?\]);")
MUSIC_PLAYLIST_RE = re.compile(r"export const musicPlaylist: MusicItem\[\] = (\[[\s\S]*?\]);")

NET_EASE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    ),
    "Referer": "https://music.163.com/",
}


def _fetch_json(url: str, timeout: int = 6):
    req = urllib.request.Request(url, headers=NET_EASE_HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _fetch_song(song_id: str):
    try:
        detail_raw = _fetch_json(
            f"https://music.163.com/api/song/detail/?id={song_id}&ids=[{song_id}]"
        )
        import json

        detail = json.loads(detail_raw)
        song = (detail.get("songs") or [None])[0]
        if not song:
            return {"id": song_id, "error": "not_found"}

        lrc_text = ""
        try:
            lrc_raw = _fetch_json(f"https://music.163.com/api/song/lyric?id={song_id}&lv=-1&kv=-1&tv=-1")
            lrc_text = (json.loads(lrc_raw).get("lrc") or {}).get("lyric", "") or ""
        except Exception:
            pass

        artists = song.get("artists") or []
        artist_name = artists[0].get("name") if artists else "未知歌手"
        album = song.get("album") or {}

        return {
            "id": song_id,
            "name": song.get("name", "未知歌曲"),
            "artist": artist_name,
            "author": artist_name,
            "cover": album.get("picUrl", ""),
            "pic": album.get("picUrl", ""),
            "url": f"https://music.163.com/song/media/outer/url?id={song_id}.mp3",
            "lrc": lrc_text,
        }
    except Exception as e:
        return {"id": song_id, "error": str(e)}


@router.get("")
async def query_music(request: Request):
    ids = request.query_params.get("ids", "")
    song_ids = list(dict.fromkeys(x.strip() for x in ids.split(",") if x.strip()))
    if not song_ids:
        return JSONResponse({"error": "Missing ids parameter"}, status_code=400)
    if len(song_ids) > 20:
        return JSONResponse({"error": "Too many ids; maximum is 20"}, status_code=400)
    if not all(re.fullmatch(r"\d{1,20}", song_id) for song_id in song_ids):
        return JSONResponse({"error": "Invalid song id"}, status_code=400)

    results = []
    for sid in song_ids:
        results.append(_fetch_song(sid))
        time.sleep(0.1)
    return {"success": True, "music": results}


def _read_music_ids():
    if not os.path.exists(MUSIC_FILE):
        return []
    with open(MUSIC_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    m = MUSIC_TS_RE.search(content)
    if not m:
        return []
    try:
        ids = json.loads(m.group(1))
        return ids if isinstance(ids, list) else []
    except Exception:
        return []


def _read_music_playlist():
    if not os.path.exists(MUSIC_FILE):
        return []
    with open(MUSIC_FILE, "r", encoding="utf-8") as f:
        content = f.read()
    match = MUSIC_PLAYLIST_RE.search(content)
    if not match:
        return []
    try:
        playlist = json.loads(match.group(1))
        return playlist if isinstance(playlist, list) else []
    except Exception:
        return []


def _normalize_music_items(raw_items):
    if not isinstance(raw_items, list) or len(raw_items) > 20:
        return None
    items = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            return None
        song_id = str(raw.get("id", "")).strip()
        name = str(raw.get("name", "")).strip()
        artist = str(raw.get("artist", "")).strip()
        cover = str(raw.get("cover", "")).strip()
        if not re.fullmatch(r"\d{1,20}", song_id) or song_id in seen:
            return None
        if not name or len(name) > 200 or len(artist) > 200:
            return None
        if cover and not cover.startswith("https://"):
            return None
        seen.add(song_id)
        items.append({
            "id": song_id,
            "name": name,
            "artist": artist,
            "cover": cover,
            "url": f"https://music.163.com/song/media/outer/url?id={song_id}.mp3",
        })
    return items


@router.get("/playlist")
async def read_playlist():
    return {
        "success": True,
        "ids": _read_music_ids(),
        "playlist": _read_music_playlist(),
    }


@router.post("/playlist")
async def save_playlist(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    items = _normalize_music_items(payload.get("items"))
    if items is None:
        return {"success": False, "message": "歌单数据非法，最多保存 20 首有效歌曲"}

    ids = [item["id"] for item in items]
    os.makedirs(DATA_DIR, exist_ok=True)
    ids_json = json.dumps(ids, ensure_ascii=False, indent=1)
    playlist_json = json.dumps(items, ensure_ascii=False, indent=1)
    with open(MUSIC_FILE, "w", encoding="utf-8") as f:
        f.write(
            "// 本文件由 CMS 控制台自动生成，请勿手动修改\n"
            "export interface MusicItem {\n"
            " id: string;\n"
            " name: string;\n"
            " artist: string;\n"
            " cover: string;\n"
            " url: string;\n"
            "}\n\n"
            f"export const musicIds: string[] = {ids_json};\n\n"
            f"export const musicPlaylist: MusicItem[] = {playlist_json};\n"
        )
    return {"success": True, "message": f"已保存 {len(ids)} 首歌曲，重新构建后生效"}
