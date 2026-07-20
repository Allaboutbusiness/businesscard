# -*- coding: utf-8 -*-
"""구성원 개인 명함 정적 페이지 생성기 (재실행 가능).
   index.html → card/<이름>.html (head OG + 본문 히어로·팀순서·담당·담당자 완전 베이크)
              + og-<eng>.jpg (1200x630 링크 미리보기 배너)
   index.html 변경 시 이 스크립트를 다시 실행하면 카드가 재생성됨.
   실행: python scripts/build-cards.py
"""
import os, re, copy
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(REPO, "index.html")
CARDDIR = os.path.join(REPO, "card")
os.makedirs(CARDDIR, exist_ok=True)
BASE = "https://ownerskr.com"
MALGUN = r"C:\Windows\Fonts\malgun.ttf"
MALGUNBD = r"C:\Windows\Fonts\malgunbd.ttf"

# ── 단일 소스: 구성원 데이터 ──
MEMBERS = {
    "조기열": dict(eng="jokiyeol", role="경영지도사", photo="/card-jokiyeol.jpg", src="card-jokiyeol.jpg",
        tagline="재무 진단부터 정책자금까지,<br>기업의 자금 조달을 설계합니다",
        ogdesc="재무 진단부터 정책자금 조달까지 — 경영지도사 조기열. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["경영지도사", "정책자금 전문팀 총괄", "재무제표 평가·분석 전문"],
        tags=["정책자금", "재무진단", "운영자금", "시설자금"]),
    "유우선": dict(eng="yuwooseon", role="수석 경영컨설턴트", photo="/card-yuwooseon.jpg", src="card-yuwooseon.jpg",
        tagline="정책자금의 시작부터 사후관리까지,<br>기업의 자금을 책임집니다",
        ogdesc="정책자금의 시작부터 사후관리까지 — 수석 경영컨설턴트 유우선. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["수석 경영컨설턴트", "정책자금 총괄 운영 관리", "자금 활용 효율 극대화"],
        tags=["정책자금", "운영관리", "자금집행", "사후관리"], order=["조기열", "유우선", "김진기"]),
    "류예주": dict(eng="ryuyeju", role="AC 대표", photo="/card-ryuyeju.jpg", src="card-ryuyeju.jpg",
        tagline="투자 유치부터 정부지원사업까지,<br>기업의 성장을 설계합니다",
        ogdesc="투자 유치부터 정부지원사업까지 — AC 대표 류예주. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["AC 대표", "투자 유치·정부지원사업 총괄", "성장단계별 투자 전략"],
        tags=["투자유치", "정부지원", "R&D", "밸류업"]),
    "이승원": dict(eng="leeseungwon", role="행정사", photo="/card-leeseungwon.jpg", src="card-leeseungwon.jpg",
        tagline="인증부터 R&D 지원금까지,<br>정부지원 성장 전략을 설계합니다",
        ogdesc="인증부터 R&D 지원금까지 — 행정사 이승원. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["행정사", "인증·사업화·R&D 지원금 총괄", "벤처·이노비즈 인증 전문"],
        tags=["기업인증", "R&D", "사업화", "정부지원"]),
    "안지수": dict(eng="anjisu", role="변리사", photo="/card-anjisu.jpg", src="card-anjisu.jpg",
        tagline="핵심 기술을 특허로,<br>기업의 지식재산을 지킵니다",
        ogdesc="핵심 기술을 특허로 — 변리사 안지수. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["변리사", "특허·지식재산권 총괄", "IP 포트폴리오 관리"],
        tags=["특허", "상표", "지식재산", "IP"]),
    "채용현": dict(eng="chaeyonghyun", role="변호사 · 세무사 · 변리사", photo="/card-chaeyonghyun.jpg", src="card-chaeyonghyun.jpg",
        tagline="법률부터 세무·IP까지,<br>기업 리스크를 통합 관리합니다",
        ogdesc="법률부터 세무·IP까지 통합 자문 — 변호사·세무사·변리사 채용현. 오너스경영연구소. 3회 무료 상담.",
        career=["변호사 · 세무사 · 변리사", "조세·법률·IP 통합 자문", "상속·기업분쟁 전문"],
        tags=["법률", "세무", "상속", "분쟁"]),
    "송기훈": dict(eng="songgihoon", role="회계사", photo="/card-songgihoon.jpg", src="card-songgihoon.jpg",
        tagline="세무기장부터 고난도 절세까지,<br>기업의 재무를 최적화합니다",
        ogdesc="세무기장부터 고난도 절세까지 — 회계사 송기훈. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["회계사", "회계·조세 전문", "세무기장·절세 솔루션"],
        tags=["회계", "절세", "세무기장", "경정청구"]),
    "김진기": dict(eng="jinki", role="사외 CFO", photo="/photo_crop.png?v716", src="photo_crop.png", vd=True,
        tagline="자금부터 절세까지,<br>기업의 모든 돈 문제를 해결합니다",
        ogdesc="자금부터 절세까지 기업의 모든 돈 문제 — 사외 CFO 김진기. 오너스경영연구소 전문 컨설팅 그룹. 3회 무료 상담.",
        career=["서울시립대학교 졸업", "대한민국 육군 중위 전역", "제조·유통 전문 컨설턴트"],
        tags=["정책자금", "투자", "R&D", "상속·증여"]),
}


# ── 1200x630 OG 배너 ──
def make_banner(name, m, out):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (12, 16, 13))
    d = ImageDraw.Draw(img)
    # 우측 사진(cover-crop, 상단 정렬로 얼굴 보존)
    pw, ph = 440, 560
    try:
        p = Image.open(os.path.join(REPO, m["src"])).convert("RGB")
        sw, sh = p.size
        scale = max(pw / sw, ph / sh)
        p = p.resize((round(sw * scale), round(sh * scale)), Image.LANCZOS)
        left = (p.size[0] - pw) // 2
        p = p.crop((left, 0, left + pw, ph))
        px = W - pw - 56
        py = (H - ph) // 2
        img.paste(p, (px, py))
        # 사진 좌측에 살짝 어두운 그라데이션(텍스트 가독성)
        grad = Image.new("L", (160, ph), 0)
        for x in range(160):
            for y in range(0, ph, 4):
                pass
        # 간단 좌측 페이드
        fade = Image.new("RGBA", (120, ph), (12, 16, 13, 0))
        fd = ImageDraw.Draw(fade)
        for x in range(120):
            a = int(200 * (1 - x / 120))
            fd.line([(x, 0), (x, ph)], fill=(12, 16, 13, a))
        img.paste(Image.alpha_composite(Image.new("RGBA", fade.size, (0, 0, 0, 0)), fade).convert("RGB"),
                  (px, py), fade)
    except Exception as e:
        print("   배너 사진 실패:", e)
    # 좌측 teal 액센트
    d.rectangle([0, 0, 14, H], fill=(20, 184, 166))
    x = 74
    f_co = ImageFont.truetype(MALGUN, 27)
    f_nm = ImageFont.truetype(MALGUNBD, 96)
    f_ro = ImageFont.truetype(MALGUNBD, 46)
    f_tg = ImageFont.truetype(MALGUN, 29)
    d.text((x, 120), "오너스경영연구소 전문 컨설팅 그룹", font=f_co, fill=(20, 184, 166))
    d.text((x, 172), name, font=f_nm, fill=(255, 255, 255))
    d.text((x, 300), m["role"], font=f_ro, fill=(20, 184, 166))
    # 태그라인 2줄
    tl = re.sub(r"<br\s*/?>", "\n", m["tagline"])
    yy = 386
    for line in tl.split("\n"):
        d.text((x, yy), line, font=f_tg, fill=(205, 210, 205)); yy += 42
    img.save(out, "JPEG", quality=88, optimize=True)


# ── 본문 베이크 ──
def frag(soup, html):
    return BeautifulSoup(html, "html.parser")

def bake(name, m):
    soup = BeautifulSoup(open(INDEX, encoding="utf-8").read(), "html.parser")
    url = f"{BASE}/card/{m['eng']}"   # 영문 URL(Vercel 한글 라우팅 불가 → 영문 slug)
    ogimg = f"{BASE}/og-{m['eng']}.jpg"
    title = f"{name} {m['role']} | 오너스경영연구소 전문 컨설팅 그룹"

    # head
    if soup.title: soup.title.string = title
    def setmeta(attr, key, val):
        t = soup.find("meta", {attr: key})
        if t: t["content"] = val
    setmeta("name", "description", m["ogdesc"])
    can = soup.find("link", attrs={"rel": "canonical"})
    if can: can["href"] = url
    setmeta("property", "og:title", f"{name} {m['role']} | 오너스경영연구소")
    setmeta("property", "og:description", m["ogdesc"])
    setmeta("property", "og:url", url)
    setmeta("property", "og:image", ogimg)
    setmeta("name", "twitter:title", f"{name} {m['role']} | 오너스경영연구소")
    setmeta("name", "twitter:description", m["ogdesc"])
    setmeta("name", "twitter:image", ogimg)

    # 히어로
    soup.select_one(".hero-name").string = name
    soup.select_one(".hero-cfo").string = m["role"]
    tg = soup.select_one(".hero-tagline"); tg.clear(); tg.append(frag(soup, m["tagline"]))
    ph = soup.select_one(".hero-photo")
    ph["src"] = m["photo"]; ph["alt"] = f"{name} {m['role']}"
    cls = ph.get("class", [])
    if m.get("vd"):
        if "vd" not in cls: cls.append("vd")
    else:
        cls = [c for c in cls if c != "vd"]
    ph["class"] = cls
    ce = soup.select_one(".hero-career"); ce.clear()
    for c in m["career"]:
        div = soup.new_tag("div"); div["class"] = ["hero-career-item"]; div.string = c; ce.append(div)
    te = soup.select_one(".hero-tags"); te.clear()
    for t in m["tags"]:
        sp = soup.new_tag("span"); sp["class"] = ["hero-tag"]; sp.string = t; te.append(sp)

    # 팀 재정렬 (본인 팀을 첫 team-block으로 — 제목/eyebrow 아래 유지)
    blocks = soup.select(".team-sec .team-block")
    if blocks:
        mine = None
        for b in blocks:
            if name in [n.get_text(strip=True) for n in b.select(".member-name")]:
                mine = b; break
        if mine:
            first = soup.select(".team-sec .team-block")[0]
            if mine is not first:
                mine.extract(); first.insert_before(mine)
            for i, lb in enumerate(soup.select(".team-sec .team-block .team-label")):
                lb.string = "TEAM %02d" % (i + 1)
            grid = mine.select_one(".team-grid")
            cards = grid.select(".member")
            byname = {}
            for c in cards:
                nn = c.select_one(".member-name")
                if nn: byname[nn.get_text(strip=True)] = c
            order = m.get("order")
            if order:
                order = list(order) + [n for n in byname if n not in order]
            else:
                order = [name] + [n for n in byname if n != name]
            for nm in order:
                if nm in byname: grid.append(byname[nm].extract())

    # 담당 박스
    for c in soup.select(".ap-info .ap-card"):
        k = c.select_one(".k"); v = c.select_one(".v")
        if k and v and k.get_text(strip=True) == "담당":
            v.clear(); v.append(frag(soup, f"{name} · {m['role']}<br>오너스경영연구소"))

    # 상담폼 담당자 태그
    hid = soup.find("input", {"name": "entry.1340519393"})
    if hid: hid["value"] = f"[담당자:{name}]"

    # 정적 베이크 완료 → card.js 스크립트 제거(중복 방지)
    for s in soup.find_all("script", src=True):
        if "card.js" in s["src"]: s.decompose()

    out = os.path.join(CARDDIR, f"{m['eng']}.html")   # 영문 파일명(Vercel 한글파일명 인코딩 이슈 회피)
    open(out, "w", encoding="utf-8").write(str(soup))
    return out


def main():
    import json
    rewrites = []
    for name, m in MEMBERS.items():
        make_banner(name, m, os.path.join(REPO, f"og-{m['eng']}.jpg"))
        bake(name, m)
        rewrites.append({"source": f"/card/{name}", "destination": f"/card/{m['eng']}.html"})
        print(f"  {name:5} → card/{m['eng']}.html + og-{m['eng']}.jpg")
    print(f"완료: {len(MEMBERS)}명")
    print("\n=== vercel.json rewrites(한글 URL -> 영문 파일): rewrites 배열에 추가 ===")
    print(json.dumps(rewrites, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
