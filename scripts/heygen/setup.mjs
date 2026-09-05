#!/usr/bin/env node
// 1회성 설정: 학습된 아바타와 음성의 ID 를 찾아 config.json 에 저장한다.
//
//   node scripts/heygen/setup.mjs              대화형으로 고르기
//   node scripts/heygen/setup.mjs --list       목록만 출력
//   node scripts/heygen/setup.mjs --lang ko    음성을 한국어로 필터

import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HeyGen, HeyGenError } from './heygen.mjs';
import { rateClass } from './payload.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'config.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const hg = new HeyGen();

// ── 잔액 ─────────────────────────────────────────────
const me = await hg.me();
console.log(`\n계정: ${me.email ?? me.username ?? '(이름 없음)'}   결제 유형: ${me.billing_type ?? '?'}`);
const balance = me.wallet?.balance ?? me.wallet?.remaining ?? null;
if (balance !== null) console.log(`지갑 잔액: $${balance}`);
else if (me.subscription) console.log(`구독 크레딧: ${JSON.stringify(me.subscription)}`);
console.log('  (API 키 인증은 선불 지갑에서 차감됩니다. 구독 크레딧과 별개입니다.)');

// ── 아바타 ───────────────────────────────────────────
console.log('\n아바타 look 을 불러오는 중…');
const looks = await hg.listLooks();
if (looks.length === 0) {
  console.error('아바타가 없습니다. app.heygen.com 에서 먼저 아바타를 만들어야 합니다.');
  process.exit(1);
}
console.log(`\n아바타 ${looks.length}개:`);
looks.forEach((l, i) => {
  const engines = (l.supported_api_engines ?? []).join(', ') || '엔진 정보 없음';
  const ready = l.status && l.status !== 'ready' ? `  [${l.status}]` : '';
  console.log(
    `  ${String(i + 1).padStart(3)}. ${l.name ?? '(이름 없음)'}${ready}\n` +
    `       id=${l.id}\n` +
    `       타입=${l.avatar_type ?? '?'} (요금구분: ${rateClass(l.avatar_type)})  지원엔진=${engines}`
  );
});

// ── 음성 ─────────────────────────────────────────────
const lang = value('lang', 'ko');
console.log(`\n음성을 불러오는 중… (language=${lang})`);
let voices = await hg.listVoices({ language: lang });
if (voices.length === 0) {
  console.log(`  language=${lang} 에 해당하는 음성이 없어 전체를 불러옵니다.`);
  voices = await hg.listVoices();
}
console.log(`\n음성 ${voices.length}개:`);
voices.slice(0, 60).forEach((v, i) => {
  console.log(
    `  ${String(i + 1).padStart(3)}. ${v.name ?? '(이름 없음)'}  [${v.language ?? '?'}/${v.gender ?? '?'}/${v.type ?? '?'}]\n` +
    `       voice_id=${v.voice_id}`
  );
});
if (voices.length > 60) console.log(`  … 외 ${voices.length - 60}개 (전체는 --list 로 확인)`);

if (flag('list')) process.exit(0);

// ── 선택 ─────────────────────────────────────────────
if (!process.stdin.isTTY) {
  console.log('\n비대화형 환경입니다. 위 목록에서 골라 직접 지정하세요:');
  console.log('  node scripts/heygen/setup.mjs --avatar <avatar_id> --voice <voice_id>');
  if (!value('avatar') || !value('voice')) process.exit(0);
}

let avatarId = value('avatar');
let voiceId = value('voice');

if (!avatarId || !voiceId) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!avatarId) avatarId = looks[(await askIndex(rl, '아바타 번호', looks.length)) - 1].id;
    if (!voiceId) voiceId = voices[(await askIndex(rl, '음성 번호', voices.length)) - 1].voice_id;
  } finally {
    rl.close();
  }
}

const chosen = looks.find((l) => l.id === avatarId);
const config = {
  avatar_id: avatarId,
  voice_id: voiceId,
  avatar_type: chosen?.avatar_type ?? null,
  avatar_name: chosen?.name ?? null,
  engine: 'avatar_iii',
  resolution: '1080p',
  aspect_ratio: '16:9',
};

await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(`\n저장했습니다 → ${CONFIG_PATH}`);
console.log(JSON.stringify(config, null, 2));
console.log(
  '\nengine 기본값을 avatar_iii 로 두었습니다. HeyGen 의 기본값은 avatar_iv 이고 커스텀 아바타 기준\n' +
  '8배 비쌉니다($0.0805/초 vs $0.01/초). 품질이 필요한 영상에서만 --engine avatar_iv 로 올리세요.\n' +
  '\n다음: node scripts/heygen/create.mjs --file 대본.txt'
);

async function askIndex(rl, label, max) {
  for (;;) {
    const raw = (await rl.question(`\n${label} (1-${max}): `)).trim();
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= max) return n;
    console.log(`  1 에서 ${max} 사이의 숫자를 입력하세요.`);
  }
}

process.on('unhandledRejection', (e) => {
  if (e instanceof HeyGenError) console.error(`\nHeyGen 오류 ${e.status} ${e.code ?? ''}: ${e.message}`);
  else console.error(`\n${e?.message ?? e}`);
  process.exit(1);
});
