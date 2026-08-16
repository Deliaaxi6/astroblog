import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from r2_picbed import router as picbed_router
from api.posts import router as posts_router
from api.moments import router as moments_router
from api.site_data import router as site_data_router
from api.music import router as music_router
from api.drafts import router as drafts_router
from api.sync import router as sync_router
from api.local_images import router as local_images_router
from api.gallery import router as gallery_router

app = FastAPI(title="AstroBlog CMS Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
def get_status():
    return {"status": "online", "message": "中枢神经已连接"}


app.include_router(picbed_router, prefix="/api/picbed", tags=["PicBed"])
app.include_router(posts_router, prefix="/api/posts", tags=["Posts"])
app.include_router(moments_router, prefix="/api/moments", tags=["Moments"])
app.include_router(site_data_router, prefix="/api/site-data", tags=["SiteData"])
app.include_router(music_router, prefix="/api/music", tags=["Music"])
app.include_router(drafts_router, prefix="/api/drafts", tags=["Drafts"])
app.include_router(sync_router, prefix="/api/sync", tags=["Sync"])
app.include_router(local_images_router, prefix="/api/local-images", tags=["LocalImages"])
app.include_router(gallery_router, prefix="/api/gallery", tags=["Gallery"])

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")