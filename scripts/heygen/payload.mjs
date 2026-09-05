// POST /v3/videos 요청 본문 조립 + 비용 추정
//
// 스키마는 heygen-cli gen/video.go 의 RequestSchema 를 그대로 따른다.
// 최상위는 type 으로 구분되는 union: avatar | image | cinematic_avatar | studio.

/** 초당 USD. 2026-09 공식 요금표 기준 — 요금은 변경될 수 있으므로 실제 청구는 지갑 잔액으로 확인할 것. */
const RATES = {
  avatar_iii: { photo: 0.0165, custom: 0.01 },
  avatar_iv: { photo: 0.0385, custom: 0.0805 },
  avatar_v: { photo: null, custom: 0.12 }, // Avatar V 는 사진 아바타 미지원
};

export const ENGINES = Object.keys(RATES);

/** avatar_type 문자열에서 요금 구분(photo/custom)을 고른다. */
export function rateClass(avatarType) {
  return String(avatarType ?? '').toLowerCase().includes('photo') ? 'photo' : 'custom';
}

export function estimateCost({ engine, avatarType, durationSec }) {
  const rate = RATES[engine]?.[rateClass(avatarType)];
  if (!rate || !Number.isFinite(durationSec)) return null;
  return { rate, usd: rate * durationSec };
}

/** 단일 발화 영상: 대본 하나 → 영상 하나. */
export function buildAvatarVideo({ config, script, opts = {} }) {
  requireIds(config);
  const body = {
    type: 'avatar',
    avatar_id: config.avatar_id,
    voice_id: config.voice_id,
    script,
    resolution: opts.resolution ?? config.resolution ?? '1080p',
    aspect_ratio: opts.aspect ?? config.aspect_ratio ?? '16:9',
    engine: { type: opts.engine ?? config.engine ?? 'avatar_iii' },
  };
  if (opts.title) body.title = opts.title;
  applyShared(body, config, opts);
  return body;
}

/**
 * 다중 씬 영상: 씬 1~50개를 순서대로 이어붙인다.
 * 씬 종류 — avatar_video(발화) · image(정지컷) · video(클립).
 * studio 는 MP4 고정이라 output_format 을 받지 않는다.
 */
export function buildStudioVideo({ config, scenes, opts = {} }) {
  requireIds(config);
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('scenes 가 비어 있습니다.');
  if (scenes.length > 50) throw new Error(`씬은 최대 50개입니다 (현재 ${scenes.length}개).`);

  const engine = opts.engine ?? config.engine ?? 'avatar_iii';
  const body = {
    type: 'studio',
    scenes: scenes.map((s, i) => toStudioScene(s, i, config, engine)),
    resolution: opts.resolution ?? config.resolution ?? '1080p',
    aspect_ratio: opts.aspect ?? config.aspect_ratio ?? '16:9',
  };
  if (opts.title) body.title = opts.title;
  applyShared(body, config, opts);
  delete body.output_format; // studio 는 MP4 고정
  return body;
}

function applyShared(body, config, opts) {
  // 자막: style 을 주면 영상에 굽는다. 주지 않아도 SRT 사이드카(subtitle_url)는 항상 나온다.
  if (opts.burnCaption) body.caption = { file_format: 'srt', style: 'default' };
  if (config.brand_glossary_id) body.brand_glossary_id = config.brand_glossary_id;
  if (config.folder_id) body.folder_id = config.folder_id;
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;
}

function toStudioScene(scene, index, config, engine) {
  const at = `scenes[${index}]`;
  const type = scene.type ?? 'avatar_video';

  if (type === 'avatar_video') {
    if (!scene.script && !scene.audio_url && !scene.audio_asset_id) {
      throw new Error(`${at}: script 또는 audio_url/audio_asset_id 중 하나가 필요합니다.`);
    }
    const input = {
      type: 'avatar',
      avatar_id: scene.avatar_id ?? config.avatar_id,
      engine: { type: scene.engine ?? engine },
    };
    if (scene.script) {
      input.script = scene.script;
      input.voice_id = scene.voice_id ?? config.voice_id;
    } else if (scene.audio_url) input.audio_url = scene.audio_url;
    else input.audio_asset_id = scene.audio_asset_id;

    // studio v1 배경은 단색만 지원한다.
    if (scene.background_color) input.background = { type: 'color', color: scene.background_color };
    return { type: 'avatar_video', input };
  }

  if (type === 'image' || type === 'video') {
    if (!scene.source) throw new Error(`${at}: source (URL 또는 asset id) 가 필요합니다.`);
    const out = { type, source: toAssetInput(scene.source, at) };
    if (scene.script) {
      out.script = scene.script;
      out.voice_id = scene.voice_id ?? config.voice_id;
    } else if (scene.audio_url) out.audio_url = scene.audio_url;
    else if (scene.audio_asset_id) out.audio_asset_id = scene.audio_asset_id;
    else if (type === 'image') out.duration = scene.duration ?? 3; // 무음 정지컷은 duration 필수

    if (type === 'image' && scene.script && scene.duration !== undefined) {
      throw new Error(`${at}: image 씬은 script 와 duration 을 동시에 쓸 수 없습니다.`);
    }
    if (type === 'video' && scene.playback) out.playback = scene.playback;
    return out;
  }

  throw new Error(`${at}: 알 수 없는 씬 타입 "${type}" (avatar_video | image | video)`);
}

/** URL 문자열이면 {type:'url'}, 그 외 문자열은 asset id 로 본다. 객체면 그대로 통과. */
function toAssetInput(source, at) {
  if (source && typeof source === 'object') return source;
  if (typeof source !== 'string') throw new Error(`${at}: source 형식이 올바르지 않습니다.`);
  return /^https?:\/\//i.test(source)
    ? { type: 'url', url: source }
    : { type: 'asset_id', asset_id: source };
}

function requireIds(config) {
  if (!config?.avatar_id || !config?.voice_id) {
    throw new Error('config.json 에 avatar_id 와 voice_id 가 없습니다. 먼저 `npm run heygen:setup` 을 실행하세요.');
  }
}

/**
 * 입력을 해석한다.
 *  - JSON 이고 scenes 배열을 가지면 → 다중 씬
 *  - 그 외에는 전부 단일 대본 텍스트
 */
export function parseInput(raw) {
  const text = raw.trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const scenes = Array.isArray(parsed) ? parsed : parsed.scenes;
      if (Array.isArray(scenes)) return { mode: 'studio', scenes, meta: Array.isArray(parsed) ? {} : parsed };
    } catch {
      // JSON 이 아니면 그냥 대본으로 처리한다
    }
  }
  return { mode: 'single', script: text };
}
