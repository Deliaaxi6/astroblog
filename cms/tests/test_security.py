import os
import tempfile
import unittest
from unittest.mock import patch

os.environ["CMS_API_KEY"] = "test-key-for-security-regression-32chars"
os.environ["CMS_ALLOWED_ORIGINS"] = "http://localhost:4321"

from fastapi.testclient import TestClient

from main import app
import r2_picbed
from api import music as music_api
from api import posts as posts_api


class SecurityRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.auth = {"X-CMS-API-Key": os.environ["CMS_API_KEY"]}

    def test_private_api_requires_key(self):
        response = self.client.post("/api/posts/list")
        self.assertEqual(response.status_code, 401)

    def test_untrusted_origin_is_not_allowed(self):
        response = self.client.post(
            "/api/posts/list",
            headers={**self.auth, "Origin": "https://evil.example"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_local_preview_cors_preflight_is_allowed(self):
        response = self.client.options(
            "/api/gallery/albums",
            headers={
                "Origin": "http://localhost:4321",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "x-cms-api-key",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://localhost:4321",
        )

    def test_content_ids_reject_path_traversal(self):
        cases = (
            ("/api/posts/get", {"id": "../main"}),
            ("/api/moments/delete", {"id": "..\\main"}),
            ("/api/drafts/get", {"id": "../main"}),
        )
        for path, payload in cases:
            with self.subTest(path=path):
                response = self.client.post(path, json=payload, headers=self.auth)
                self.assertFalse(response.json()["success"])

    def test_local_upload_rejects_spoofed_and_svg_files(self):
        cases = (
            ("fake.png", b"not-an-image", "image/png"),
            ("active.svg", b"<svg><script/></svg>", "image/svg+xml"),
        )
        for name, content, content_type in cases:
            with self.subTest(name=name):
                response = self.client.post(
                    "/api/local-images/upload",
                    files={"file": (name, content, content_type)},
                    headers=self.auth,
                )
                self.assertFalse(response.json()["success"])

    def test_imagekit_reports_missing_configuration(self):
        empty_config = {
            "IMAGEKIT_PRIVATE_KEY": "",
            "IMAGEKIT_PUBLIC_KEY": "",
            "IMAGEKIT_URL_ENDPOINT": "",
        }
        with patch.dict(os.environ, empty_config):
            response = self.client.get("/api/picbed/test", headers=self.auth)
        payload = response.json()
        self.assertFalse(payload["success"])
        self.assertFalse(payload["ok"])
        self.assertIn("IMAGEKIT_PRIVATE_KEY", payload["message"])

    def test_imagekit_upload_returns_public_url(self):
        config = {
            "IMAGEKIT_PRIVATE_KEY": "private_test",
            "IMAGEKIT_PUBLIC_KEY": "public_test",
            "IMAGEKIT_URL_ENDPOINT": "https://ik.imagekit.io/test",
        }
        imagekit_response = {
            "url": "https://ik.imagekit.io/test/blog/test.png",
            "filePath": "/blog/test.png",
            "fileId": "test-file-id",
        }
        with patch.dict(os.environ, config), patch.object(
            r2_picbed, "_request_json", return_value=imagekit_response
        ) as request_json:
            response = self.client.post(
                "/api/picbed/upload",
                files={"file": ("test.png", b"\x89PNG\r\n\x1a\n", "image/png")},
                data={"folder": "blog/tests"},
                headers=self.auth,
            )
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["provider"], "imagekit")
        self.assertEqual(payload["url"], imagekit_response["url"])
        request = request_json.call_args.args[0]
        self.assertIn(b'name="folder"', request.data)
        self.assertIn(b"/blog/tests", request.data)

    def test_public_music_endpoint_rejects_invalid_ids(self):
        invalid = self.client.get("/api/music?ids=abc")
        too_many = self.client.get(
            "/api/music?ids=" + ",".join(str(index) for index in range(21))
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(too_many.status_code, 400)

    def test_music_query_uses_admin_contract(self):
        with patch.object(
            music_api,
            "_fetch_song",
            return_value={"id": "123", "name": "测试歌曲", "url": "https://example.test/123.mp3"},
        ):
            response = self.client.get("/api/music?ids=123")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["music"][0]["id"], "123")

    def test_music_playlist_save_and_read_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            original_music_file = music_api.MUSIC_FILE
            music_api.MUSIC_FILE = os.path.join(directory, "music.ts")
            try:
                item = {
                    "id": "123",
                    "name": "测试歌曲",
                    "artist": "测试歌手",
                    "cover": "https://example.test/cover.jpg",
                    "url": "https://untrusted.example/audio.mp3",
                }
                saved = self.client.post(
                    "/api/music/playlist",
                    json={"items": [item]},
                    headers=self.auth,
                )
                loaded = self.client.get("/api/music/playlist", headers=self.auth)
                self.assertTrue(saved.json()["success"])
                self.assertEqual(loaded.json()["ids"], ["123"])
                self.assertEqual(loaded.json()["playlist"][0]["name"], "测试歌曲")
                self.assertEqual(
                    loaded.json()["playlist"][0]["url"],
                    "https://music.163.com/song/media/outer/url?id=123.mp3",
                )
            finally:
                music_api.MUSIC_FILE = original_music_file

    def test_article_create_and_read_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            original_posts_dir = posts_api.POSTS_DIR
            posts_api.POSTS_DIR = directory
            try:
                payload = {
                    "id": "business_round_trip",
                    "content": "# 正文",
                    "frontmatter": {
                        "title": "业务闭环测试",
                        "description": "验证管理端字段协议",
                        "pubDate": "2026-09-02",
                        "tags": ["测试"],
                        "draft": False,
                    },
                }
                saved = self.client.post("/api/posts/save", json=payload, headers=self.auth)
                loaded = self.client.post(
                    "/api/posts/get",
                    json={"id": "business_round_trip"},
                    headers=self.auth,
                )
                self.assertTrue(saved.json()["success"])
                self.assertEqual(loaded.json()["post"]["frontmatter"]["title"], "业务闭环测试")
                self.assertEqual(loaded.json()["post"]["content"], "# 正文")
            finally:
                posts_api.POSTS_DIR = original_posts_dir


if __name__ == "__main__":
    unittest.main()
