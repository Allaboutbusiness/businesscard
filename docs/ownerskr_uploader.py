# ownerskr.com 자동발행 업로더 — 기존 발행 파이프라인 마지막에 호출.
# 사용: publish_to_ownerskr(title, body_markdown, image_paths=[...], category="post")
import os, base64, mimetypes, requests

BASE = "https://ownerskr.com"
TOKEN = os.environ["OWNERSKR_PUBLISH_TOKEN"]  # Vercel PUBLISH_TOKEN 값
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def _upload_image(path):
    ct = mimetypes.guess_type(path)[0] or "image/jpeg"
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    r = requests.post(f"{BASE}/api/upload", headers=H, json={
        "filename": os.path.basename(path), "contentType": ct, "dataBase64": b64}, timeout=60)
    r.raise_for_status()
    return r.json()["url"]


def publish_to_ownerskr(title, body_markdown, image_paths=None, category="post", cover_index=0):
    """image_paths[cover_index]를 대표사진으로, 나머지는 본문 끝에 첨부. 반환: 글 URL"""
    image_paths = image_paths or []
    urls = [_upload_image(p) for p in image_paths]
    cover = urls[cover_index] if urls else None
    body = body_markdown
    for i, u in enumerate(urls):
        if i == cover_index:
            continue
        body += f"\n\n![]({u})"
    r = requests.post(f"{BASE}/api/posts", headers=H, json={
        "category": category, "title": title, "body": body, "coverImage": cover}, timeout=60)
    r.raise_for_status()
    return r.json()["url"]


if __name__ == "__main__":
    print(publish_to_ownerskr("테스트 글", "## 안녕하세요\n자동발행 테스트입니다.", category="post"))
