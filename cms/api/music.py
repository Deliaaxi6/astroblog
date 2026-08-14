import time
import urllib.parse
import urllib.request
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()

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
    song_ids = [x.strip() for x in ids.split(",") if x.strip()]
    if not song_ids:
        return JSONResponse({"error": "Missing ids parameter"}, status_code=400)

    results = []
    for sid in song_ids:
        results.append(_fetch_song(sid))
        time.sleep(0.1)
    return JSONResponse(results)