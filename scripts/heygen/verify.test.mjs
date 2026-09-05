import { readFile } from 'node:fs/promises';
import { buildAvatarVideo, buildStudioVideo, parseInput, estimateCost } from './payload.mjs';

const schema = JSON.parse(await readFile(new URL('./schema/create-video.json', import.meta.url),'utf8'));
const variants = schema.oneOf;
const byType = { avatar: variants[0], image: variants[1], cinematic_avatar: variants[2], studio: variants[3] };

let fails = 0;
const ok = (c,m)=>{ console.log(`${c?'  ✓':'  ✗'} ${m}`); if(!c) fails++; };

function validate(body, label) {
  const v = byType[body.type];
  ok(!!v, `${label}: type "${body.type}" 이 union 에 존재`);
  if (!v) return;
  for (const r of v.required ?? []) ok(body[r] !== undefined, `${label}: 필수 "${r}" 존재`);
  const allowed = new Set(Object.keys(v.properties ?? {}));
  const unknown = Object.keys(body).filter(k => !allowed.has(k));
  ok(unknown.length===0, `${label}: 미지정 필드 없음 ${unknown.length?JSON.stringify(unknown):''}`);
  for (const [k,val] of Object.entries(body)) {
    const p = v.properties?.[k];
    if (p?.enum && !p.enum.includes(val)) ok(false, `${label}: ${k}="${val}" 가 enum ${JSON.stringify(p.enum)} 밖`);
  }
}

const config = { avatar_id:'look_abc', voice_id:'voice_xyz', avatar_type:'digital_twin', engine:'avatar_iii' };

console.log('\n[1] 단일 발화');
const a = buildAvatarVideo({ config, script:'안녕하세요, 오너스코리아 조기열입니다.', opts:{ burnCaption:true, title:'주간 업데이트' } });
validate(a, 'avatar');
ok(a.engine?.type === 'avatar_iii', 'engine 이 avatar_iii 로 고정됨(기본 avatar_iv 아님)');
ok(a.caption?.style === 'default', 'burn-caption 시 caption.style 설정');

console.log('\n[2] 다중 씬 (발화 + 정지컷 + 클립)');
const s = buildStudioVideo({ config, scenes:[
  { type:'avatar_video', script:'오늘 세 가지를 말씀드립니다.' },
  { type:'image', source:'https://example.com/a.png', duration:3 },
  { type:'image', source:'https://example.com/b.png', script:'두 번째 안건입니다.' },
  { type:'video', source:'asset_123', script:'현장 화면입니다.', playback:{ mode:'loop', volume:0.2 } },
], opts:{} });
validate(s, 'studio');
ok(s.scenes.length===4, '씬 4개');
ok(s.scenes[0].input?.type==='avatar' && s.scenes[0].input.avatar_id==='look_abc', 'avatar_video.input.type=avatar + avatar_id');
ok(s.scenes[1].source.type==='url', 'URL → {type:url}');
ok(s.scenes[1].duration===3 && s.scenes[1].script===undefined, '무음 정지컷은 duration 만');
ok(s.scenes[2].script && s.scenes[2].voice_id==='voice_xyz', '내레이션 정지컷은 script+voice_id');
ok(s.scenes[3].source.type==='asset_id', '비URL 문자열 → {type:asset_id}');
ok(s.output_format===undefined, 'studio 에 output_format 없음');

const sceneSchema = byType.studio.properties.scenes.items.oneOf;
const sByType = { avatar_video:sceneSchema[0], image:sceneSchema[1], video:sceneSchema[2] };
s.scenes.forEach((sc,i)=>{
  const v = sByType[sc.type];
  for (const r of v.required ?? []) ok(sc[r]!==undefined, `scene[${i}] 필수 "${r}"`);
  const allowed = new Set(Object.keys(v.properties));
  const unk = Object.keys(sc).filter(k=>!allowed.has(k));
  ok(unk.length===0, `scene[${i}] 미지정 필드 없음 ${unk.length?JSON.stringify(unk):''}`);
});

console.log('\n[3] 입력 해석');
ok(parseInput('그냥 대본입니다.').mode==='single', '평문 → single');
ok(parseInput('{"scenes":[{"type":"image","source":"https://x/y.png"}]}').mode==='studio', 'scenes JSON → studio');
ok(parseInput('[{"type":"avatar_video","script":"안녕"}]').mode==='studio', '배열 JSON → studio');
ok(parseInput('{ 이건 JSON 이 아님').mode==='single', '깨진 JSON → single 로 폴백');

console.log('\n[4] 비용 추정');
ok(estimateCost({engine:'avatar_iii',avatarType:'digital_twin',durationSec:60}).usd.toFixed(2)==='0.60','avatar_iii 커스텀 60초 = $0.60');
ok(estimateCost({engine:'avatar_iv',avatarType:'photo_avatar',durationSec:60}).usd.toFixed(2)==='2.31','avatar_iv 사진 60초 = $2.31');
ok(estimateCost({engine:'avatar_v',avatarType:'photo_avatar',durationSec:60})===null,'avatar_v + 사진 = 미지원(null)');

console.log('\n[5] 오류 처리');
for (const [fn,label] of [
  [()=>buildAvatarVideo({config:{},script:'x'}), 'config 없으면 거부'],
  [()=>buildStudioVideo({config,scenes:[]}), '빈 scenes 거부'],
  [()=>buildStudioVideo({config,scenes:Array(51).fill({type:'avatar_video',script:'a'})}), '51씬 거부'],
  [()=>buildStudioVideo({config,scenes:[{type:'avatar_video'}]}), 'script/audio 없는 발화 씬 거부'],
  [()=>buildStudioVideo({config,scenes:[{type:'무엇'}]}), '알 수 없는 씬 타입 거부'],
]) { let threw=false; try{fn();}catch{threw=true;} ok(threw,label); }

console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과');
process.exit(fails?1:0);
