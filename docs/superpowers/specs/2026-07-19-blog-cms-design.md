# 블로그/공지 시스템 설계 (ownerskr.com)

작성일: 2026-07-19 · 상태: 설계 확정(사용자 승인) → 구현계획 대기

## 1. 목표 / 배경
- 대표님의 **다른 PC Claude Desktop이 자동 생성한 블로그 글**을 이제 자사 사이트(ownerskr.com)에 자동 발행한다.
- 현재 사이트는 **정적 HTML + 무빌드 Vercel 서버리스(`api/*.js`, CommonJS)**. 여기에 얇은 백엔드를 추가한다.
- 이미 구글·네이버 검색 등록을 마쳤으므로 **글 페이지는 SEO(특히 네이버 색인)를 위해 서버렌더링(SSR)** 한다.

## 2. 핵심 결정(사용자 승인)
1. **자동발행 = 비밀 API 전송**: 그 PC가 완성 글을 비밀토큰과 함께 `POST /api/posts`로 전송 → 즉시 발행.
2. **저장 = 무료 DB(Neon Postgres) + 이미지(Vercel Blob)**.
3. **글 페이지 = SSR**(네이버·구글 색인).
4. **관리자 1인 전용 로그인**(아이디 `jsjs44`), **회원가입 기능 없음**.
5. 헤더에 **`공지사항`·`게시글`** 을 회사소개 같은 정식 상단 메뉴로 추가(각 분류 목록 페이지로 이동).

## 3. 아키텍처
```
[다른 PC Claude Desktop] --(비밀토큰 POST)--> /api/upload, /api/posts
[관리자 브라우저] --(세션쿠키)------------------> /api/login, /api/upload, /api/posts, /api/posts/[id]
                                                     │
                                                     ▼
                                        Neon Postgres(글) · Vercel Blob(이미지)
                                                     │
[방문자/검색봇] --GET--> /post/123, /notice, /posts, /sitemap.xml --(SSR HTML)
```
- 정적 파일(index.html 등)은 그대로 서빙. 동적 경로만 서버리스 함수가 처리.
- 프로젝트에 **package.json 신규 추가**(현재 무의존성) → Vercel이 함수용 의존성 설치.

## 4. 데이터 모델 (Postgres `posts`)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigserial PK | 글 번호(=URL) |
| category | text | `notice`(공지사항) / `post`(게시글) |
| title | text | 제목 |
| body | text | **마크다운** 본문(~3000자, 사진 인라인 가능) |
| cover_image | text null | 대표사진 Blob URL |
| status | text | `published`(기본) / `hidden` |
| created_at | timestamptz | 발행일(기본 now) |
| updated_at | timestamptz | 수정일 |

인덱스: `(category, status, created_at desc)`. 최초 1회 테이블 생성(마이그레이션은 보호된 `/api/init` 1회 호출 또는 Neon SQL 콘솔).

## 5. API 엔드포인트 (서버리스)
인증 종류: **세션쿠키**(관리자 웹) 또는 **발행토큰**(자동발행). 둘 중 하나면 쓰기 허용.

| 메서드·경로 | 인증 | 역할 |
|---|---|---|
| `POST /api/login` | 공개(자격검증) | `{username,password}` 검증 → 서명 세션쿠키 설정(약 30일). 실패는 일반화된 오류. |
| `POST /api/logout` | 세션 | 쿠키 삭제 |
| `GET /api/me` | 세션 | 로그인 여부(UI 상태용) |
| `POST /api/upload` | 세션 또는 토큰 | 이미지(base64 JSON 또는 multipart) → Blob 업로드 → `{url}`. 타입·용량 제한. |
| `POST /api/posts` | 세션 또는 토큰 | `{category,title,body,coverImage?}` → 글 생성 → `{id,url}` |
| `GET /api/posts` | 공개 | 목록(published만). `?category=&limit=&offset=` |
| `GET /api/posts/[id]` | 공개 | 단건(published) |
| `DELETE /api/posts/[id]` | 세션 | 삭제. (숨김=`PATCH status=hidden`) |

**SSR 페이지(리라이트):**
| 방문 URL | 내부 함수 | 내용 |
|---|---|---|
| `/post/:id` | `/api/render-post` | 글 완성 HTML + SEO 메타(og·JSON-LD Article) |
| `/notice` | `/api/render-list?category=notice` | 공지사항 목록(SSR) |
| `/posts` | `/api/render-list?category=post` | 게시글 목록(SSR) |
| `/sitemap.xml` | `/api/sitemap` | 정적페이지 + 전체 published 글 URL |
| `/login` | 정적 페이지 | 로그인 폼 |
| `/write` | 정적 페이지 | 글쓰기(세션 확인 후 사용, 쓰기는 서버가 재검증) |

## 6. 로그인 / 보안
- 아이디 `jsjs44`. **비밀번호는 저장소에 절대 안 넣음** → Vercel 환경변수에 **솔트 해시(node crypto scrypt)** 로만 저장. 평문·해시 모두 GitHub에 안 올라감.
- 로그인 성공 → **HMAC 서명 HttpOnly·Secure·SameSite 쿠키**(세션). 서버가 매 쓰기요청마다 검증.
- **회원가입 엔드포인트 자체를 만들지 않음.**
- 발행토큰(`PUBLISH_TOKEN`)은 헤더(`Authorization: Bearer …`)로 검증.
- 본문 마크다운→HTML 렌더 시 **sanitize(XSS 방지)**.
- 로그인 기본 보호(일반화 오류 + 약간의 지연). 완전 rate-limit은 후순위(단일 관리자·강한 비밀번호로 완화). 쿠키는 HttpOnly.

## 7. 화면(UI)
- **헤더 메뉴**: 기존 `.nav-link` 스타일로 `회사소개` 뒤에 **`공지사항`(→/notice)**, **`게시글`(→/posts)** 추가. 우측 끝에 작은 **`관리자`**(→/login) 링크.
- **메인 홈**: 하단에 "소식" 섹션 — 최근 글 미리보기(공지 먼저) + "더보기"로 목록 페이지.
- **목록 페이지**(/notice·/posts): 카드/리스트, 클릭 → `/post/:id`. (페이지네이션은 후순위, 우선 최근 N개.)
- **글 페이지**(/post/:id): 제목·발행일·대표사진·본문. 사이트 헤더/푸터 동일 톤.
- **글쓰기**(/write): 분류 선택(공지/게시글)·제목·본문(마크다운 textarea)·사진 업로드·발행. 목록에서 **삭제/숨김**.

## 8. ★자동발행 계약(다른 PC용)
1. (사진 있으면) `POST /api/upload` — 헤더 `Authorization: Bearer <PUBLISH_TOKEN>`, body에 이미지(base64) → `{url}` 수신.
2. `POST /api/posts` — 같은 헤더, body:
```json
{ "category": "post", "title": "제목",
  "body": "마크다운 본문 (사진은 ![](업로드url))",
  "coverImage": "업로드url(선택)" }
```
3. 성공 시 `{ "id": 123, "url": "https://ownerskr.com/post/123" }` → 즉시 사이트·사이트맵 반영.
- 대표님이 그 PC Claude Desktop에 넣을 **호출 예제(curl/파이썬 스니펫)** 를 산출물로 제공.

## 9. SEO
- 글·목록 페이지 SSR + `<title>`·description·og·canonical·JSON-LD(Article) 자동.
- **사이트맵 동적화**(`/api/sitemap`) → 새 글 자동 포함. 배포 후 구글/네이버가 주기적으로 재수집(수동 재제출 불필요).

## 10. 대표님 Vercel 계정에 붙는 것(무료)
- **Neon Postgres**(Marketplace, 무료) 연결 → `DATABASE_URL` 자동 주입.
- **Vercel Blob**(무료) 스토어 생성 → `BLOB_READ_WRITE_TOKEN` 자동 주입.
- 환경변수 추가: `ADMIN_USER=jsjs44`, `ADMIN_PASS_HASH`(솔트해시), `SESSION_SECRET`(랜덤), `PUBLISH_TOKEN`(랜덤).
- ⚠️ 통합 연결 시 **"Authorize/승인" 클릭은 대표님이** 해주셔야 할 수 있음(OAuth 동의). 그 외 세팅·코드·배포·검증은 내가 수행.

## 11. 의존성 / 라우팅
- `package.json` 신규: Neon 드라이버(`@neondatabase/serverless`), `@vercel/blob`, `marked`(마크다운), `sanitize-html`. 세션 서명/비번 해시는 node `crypto`로 무의존 처리(또는 `jose`).
- `vercel.json` 리라이트 추가: `/post/:id`, `/notice`, `/posts`, `/sitemap.xml` → 각 함수. `cleanUrls` 유지.

## 12. 범위
- **v1(이번 구현):** 로그인 · 글쓰기(웹) · 자동발행(API) · 이미지 업로드 · 메인 미리보기 · 목록 페이지(SSR) · 글 페이지(SSR) · 삭제/숨김 · 동적 사이트맵 · 자동발행 예제 제공.
- **후순위(v1.1+):** 웹에서 기존 글 수정 UI, 페이지네이션/검색, 완전 rate-limit, 댓글(안 함).

## 13. 리스크 / 오픈 이슈
- 통합 연결 OAuth 승인은 사용자 클릭 필요(자동화 불가 구간).
- 자동발행 이미지 전달 방식(사전 업로드 URL vs base64 인라인) → 계약은 `/api/upload` 선업로드로 확정.
- 마크다운 sanitize 정책(허용 태그 범위)은 구현 시 확정.
- 네이버 색인은 SSR라도 시간이 걸림(정상).
