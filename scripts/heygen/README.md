# HeyGen 영상 파이프라인

대본을 넣으면 MP4 가 나온다. 의존성 없음 — Node 18+ 만 있으면 된다.

> **로컬에서 실행하세요.** 이 파이프라인은 `api.heygen.com` 과 영상 CDN 에 접근해야 합니다.
> Claude Code 웹 세션(클라우드 컨테이너)에서는 해당 도메인이 차단돼 있어 실행되지 않습니다.

## 1. 준비

```bash
export HEYGEN_API_KEY=...     # app.heygen.com/settings/api → 발급 시 한 번만 보임
```

`~/.zshrc` 나 `.bashrc` 에 넣어두면 편합니다. 프로젝트에 두려면 `.env` 를 쓰되 커밋하지 마세요
(`.gitignore` 에 이미 포함돼 있습니다).

선불 지갑에 최소 $5 가 충전돼 있어야 호출이 성공합니다. 잔액이 없으면 `402 insufficient_credit` 이 납니다.
구독 크레딧과 API 지갑은 별개입니다.

## 2. 1회성 설정

```bash
npm run heygen:setup
```

학습된 아바타와 음성 목록을 불러와 번호로 고르면 `scripts/heygen/config.json` 에 저장합니다.
비대화형 환경이면 직접 지정할 수도 있습니다.

```bash
node scripts/heygen/setup.mjs --list                          # 목록만
node scripts/heygen/setup.mjs --avatar <id> --voice <id>      # 직접 지정
node scripts/heygen/setup.mjs --lang en                       # 음성 언어 필터 (기본 ko)
```

## 3. 영상 만들기

```bash
npm run heygen -- --file 대본.txt
node scripts/heygen/create.mjs --script "안녕하세요, 오너스코리아입니다."
cat 대본.txt | node scripts/heygen/create.mjs
```

기본 저장 위치는 `out/<날짜>-<video_id>.mp4` 이고, SRT 자막이 같이 떨어집니다.

### 주요 옵션

| 옵션 | 설명 |
|---|---|
| `--out <경로>` | 저장 위치 |
| `--engine <이름>` | `avatar_iii`(기본) · `avatar_iv` · `avatar_v` |
| `--resolution <값>` | `720p` · `1080p`(기본) · `4k` |
| `--aspect <비율>` | `16:9`(기본) · `9:16` · `4:5` · `5:4` · `1:1` · `auto` |
| `--burn-caption` | 자막을 구운 영상도 추가로 받는다 |
| `--no-subtitle` | SRT 를 내려받지 않는다 |
| `--dry-run` | 요청 본문만 출력, 크레딧 소모 없음 |
| `--timeout <분>` | 완료 대기 한도 (기본 20) |

### 비용 주의

엔진 기본값을 **`avatar_iii` 로 고정**해 두었습니다. HeyGen API 의 기본값은 `avatar_iv` 인데,
커스텀 비디오 아바타 기준 8배 비쌉니다.

| 엔진 | 커스텀·스튜디오 | 사진 아바타 | 60초 1편(커스텀) |
|---|---|---|---|
| `avatar_iii` | $0.01/초 | $0.0165/초 | **$0.60** |
| `avatar_iv` | $0.0805/초 | $0.0385/초 | $4.83 |
| `avatar_v` | $0.12/초 | 미지원 | $7.20 |

*2026-09 공식 요금표 기준. 변동될 수 있으니 실제 청구는 지갑 잔액으로 확인하세요.*

먼저 `--dry-run` 으로 요청을 확인하고, 5초짜리 짧은 대본으로 한 번 돌려보는 걸 권합니다.

## 4. 다중 씬 (선택)

`type: "studio"` 를 쓰면 씬을 1~50개까지 순서대로 이어붙입니다. 대본 대신 JSON 을 넘기면 됩니다.

```json
{
  "scenes": [
    { "type": "avatar_video", "script": "오늘 세 가지를 말씀드립니다." },
    { "type": "image", "source": "https://example.com/chart.png", "duration": 3 },
    { "type": "image", "source": "https://example.com/plan.png", "script": "두 번째는 공공입찰입니다." },
    { "type": "video", "source": "https://example.com/site.mp4", "script": "현장 화면입니다.",
      "playback": { "mode": "loop", "volume": 0.2 } }
  ]
}
```

```bash
node scripts/heygen/create.mjs --file 씬구성.json
```

씬 종류는 셋입니다.

- `avatar_video` — 아바타가 말한다. `script`(+`voice_id`) 또는 `audio_url` / `audio_asset_id`.
  `background_color` 로 단색 배경 지정 가능.
- `image` — 정지컷. `duration` 초 동안 무음으로 두거나, `script` 로 내레이션을 얹는다 (둘은 배타적).
- `video` — 기존 클립. 선택적 보이스오버와 `playback.mode`(`freeze`/`loop`/`fit_to_scene`),
  `playback.volume`(0.0–1.0), `playback.mute`.

`source` 는 `https://` URL 이면 URL 로, 그 외 문자열은 HeyGen asset id 로 해석합니다.

## 5. HeyGen 이 해주지 않는 것

studio 로 **컷 순서와 B롤 삽입까지는 API 로** 되지만, 다음은 `ffmpeg` 몫입니다.

- **BGM 믹싱** — 요청 본문에 영상 레벨 오디오 필드가 없습니다.
- **자막 스타일링** — `caption.style` enum 이 `"default"` 하나뿐입니다.
  대신 SRT 가 항상 나오므로 원하는 서체·크기·위치로 직접 구우면 됩니다.
- **겹치기 합성** — 로고·하단자막 등. studio 는 전체 화면 씬만 지원하고 서버가 센터크롭합니다.
- **studio 배경** — v1 은 단색만. 이미지·영상 배경은 아직입니다.

SRT 로 자막을 굽는 예:

```bash
ffmpeg -i out/2026-09-05-vid_x.mp4 \
  -vf "subtitles=out/2026-09-05-vid_x.srt:force_style='FontName=Pretendard,FontSize=22'" \
  -c:a copy out/final.mp4
```

## 6. 스키마 검증

```bash
npm run heygen:test
```

`scripts/heygen/schema/create-video.json` 에 고정해 둔 `POST /v3/videos` 스키마에 대고
요청 본문 조립 로직을 검증합니다. 스키마 출처는 [heygen-com/heygen-cli](https://github.com/heygen-com/heygen-cli)
의 `gen/video.go` (Apache-2.0, OpenAPI 기계 생성)입니다.

HeyGen 이 API 를 바꾸면 이 파일을 갱신하고 테스트를 다시 돌리세요.

## 참고

- v1/v2 는 **2026-10-31 지원 종료**입니다. 이 코드는 v3 만 씁니다.
- 완료 통보는 폴링으로 충분합니다. 공인 HTTPS 엔드포인트(웹훅)를 열 필요가 없습니다.
- Vercel 서버리스에는 올리지 마세요. 렌더가 수 분 걸려 함수 타임아웃에 걸립니다.
  서버로 간다면 `callback_url` 웹훅 방식이어야 합니다.
- `video_url` 은 presigned URL 이라 만료됩니다. 만료되면 `GET /v3/videos/{id}` 로 새로 받으세요.
