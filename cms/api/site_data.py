import os
import re
import json
from fastapi import APIRouter, Request

router = APIRouter()

BLOG_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA_DIR = os.path.join(BLOG_ROOT, "src", "data")

TARGETS = {
    "friends": {
        "file": os.path.join(DATA_DIR, "friends.ts"),
        "header": (
            "export interface Friend {\n"
            "\tid: string;\n"
            "\tname: string;\n"
            "\turl: string;\n"
            "\tdescription: string;\n"
            "\tavatar: string;\n"
            "\tthemeColor: string;\n"
            "}\n\n"
        ),
        "export": "export const friendsData: Friend[] = ",
    },
    "projects": {
        "file": os.path.join(DATA_DIR, "projects.ts"),
        "header": (
            "export type Project = {\n"
            "\tid: string;\n"
            "\tname: string;\n"
            "\tdescription: string;\n"
            "\ticon: string;\n"
            "\turl: string;\n"
            "\tdate: string;\n"
            "}\n\n"
        ),
        "export": "export const projectsData: Project[] = ",
    },
    "albums": {
        "file": os.path.join(DATA_DIR, "albums.ts"),
        "header": (
            "export interface Photo {\n"
            "\turl: string;\n"
            "\tcaption?: string;\n"
            "}\n"
            "export interface Album {\n"
            "\tid: string;\n"
            "\ttitle: string;\n"
            "\tdescription: string;\n"
            "\tcover: string;\n"
            "\tdate: string;\n"
            "\tphotos: Photo[];\n"
            "}\n\n"
        ),
        "export": "export const albums: Album[] = ",
    },
}

TS_RE = re.compile(r"export const \w+: [^=]+= (\[[\s\S]*\]);")


@router.get("/all")
async def read_all():
    result = {}
    for key, t in TARGETS.items():
        if os.path.exists(t["file"]):
            with open(t["file"], "r", encoding="utf-8") as f:
                content = f.read()
            m = TS_RE.search(content)
            if m:
                try:
                    result[key] = json.loads(m.group(1))
                    continue
                except Exception:
                    pass
            result[key] = []
        else:
            result[key] = []
    return {"success": True, "data": result}


@router.post("/sync")
async def sync_data(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return {"success": False, "message": "JSON 解析失败"}

    target = str(payload.get("target", ""))
    if target not in TARGETS:
        return {"success": False, "message": "未知的数据类型，可选: friends / projects / albums"}

    items = payload.get("items", [])
    if not isinstance(items, list):
        return {"success": False, "message": "数据格式非法，预期为数组"}

    t = TARGETS[target]
    json_str = json.dumps(items, ensure_ascii=False, indent=2)
    ts_content = f"// 本文件由 CMS 控制台自动生成，请勿手动修改\n{t['header']}{t['export']}{json_str};\n"
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(t["file"], "w", encoding="utf-8") as f:
        f.write(ts_content)
    return {"success": True, "message": f"已同步 {len(items)} 条数据至 {target}.ts"}