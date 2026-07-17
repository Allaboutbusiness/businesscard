import { SUB_SIGNALS, MAJOR_SIGNALS, AGNOSTIC_SIGNALS, AGENCY_NOISE, SUB_TO_MAJOR, INDUSTRY_SUB_EXCLUSION, INDUSTRY_MAJOR_CAUTION, parseIndustry, } from './industries.js?v=20260718';
export const REGION_KW = {
    '서울': ['서울'], '경기': ['경기'], '인천': ['인천'], '강원': ['강원'],
    '충북': ['충북', '충청북도'], '충남': ['충남', '충청남도'],
    '대전': ['대전'], '세종': ['세종'],
    '전북': ['전북', '전라북도'], '전남': ['전남', '전라남도'], '광주': ['광주'],
    '경북': ['경북', '경상북도'], '경남': ['경남', '경상남도'],
    '대구': ['대구'], '울산': ['울산'], '부산': ['부산'], '제주': ['제주'],
};
export const SIZE_BOOST_KW = {
    '소상공인': ['소상공인', '자영업', '소규모', '생계형'],
    '소기업': ['소기업', '소상공인', '중소기업', '소규모기업'],
    '소기업 (벤처인증)': ['소기업', '중소기업', '벤처', '벤처기업', '이노비즈', '메인비즈', '벤처확인'],
    '중소기업': ['중소기업', '중소', '강소기업', '히든챔피언'],
    '중소기업 (벤처인증)': ['중소기업', '벤처', '벤처기업', '이노비즈', '강소기업', '글로벌강소'],
    '중견기업': ['중견기업', '글로벌강소', '히든챔피언'],
};
export const KW_MAP = {
    '자금 부족': ['자금', '융자', '정책자금', '금융'],
    '마케팅 역량 부족': ['마케팅', '홍보', '브랜드'],
    '기술 개발 어려움': ['기술', 'R&D', '연구개발', '기술개발'],
    '디지털 전환 필요': ['디지털', 'DX', '스마트', 'IT'],
    '판로 개척 어려움': ['판로', '유통', '판매', '수요처'],
    '해외 진출 어려움': ['해외', '수출', '글로벌', '수출바우처'],
    '투자 유치 어려움': ['투자', 'IR', 'VC', '엔젤'],
    '사업화 역량 부족': ['사업화', '창업', '스타트업', '창업패키지'],
    '매출 증대': ['매출', '판로', '마케팅'],
    '수출 확대': ['수출', '해외', '수출바우처', 'KOTRA'],
    '해외 진출': ['해외진출', '수출지원', '글로벌', 'K-스타트업'],
    '기술 개발 · R&D': ['R&D', '기술개발', '연구', '혁신'],
    '디지털 전환': ['디지털', '스마트', 'DX', '디지털전환'],
    '자금 확보': ['자금', '융자', '보조금', '정책자금'],
    '융자 · 정책자금': ['융자', '정책자금', '대출', '자금'],
    '보조금': ['보조금', '지원금', '바우처'],
    '컨설팅': ['컨설팅', '멘토링', '자문'],
    '마케팅 지원': ['마케팅', '홍보', '판로'],
    'R&D 지원': ['R&D', '연구개발', '기술개발'],
    '인력 · 교육': ['인력', '교육', '훈련', '채용'],
    '해외 진출 지원': ['해외', '수출', 'KOTRA', '수출바우처'],
    'IR': ['IR', '투자', 'VC', '데모데이'],
    '투자 연계': ['투자', 'VC', '액셀러레이터', '데모데이'],
};
const METRO_REGIONS = new Set(['서울', '경기', '인천']);
// 해시태그 토큰 → 표준 지역명 맵. REGION_KW 토큰에 행정구역 접미사(도/시/광역시/특별자치도 등)
// 변형을 더해 '충청남도'·'울산광역시'·'강원특별자치도' 같은 해시태그도 정확매칭으로 잡는다.
// 정확(comma-split) 토큰 매칭이라 '대전환'(→대전)·'지역경기'(→경기) 같은 prose 오탐은 안 생긴다.
const REGION_ADMIN_SUFFIXES = ['', '도', '시', '특별시', '광역시', '특별자치도', '특별자치시'];
const REGION_TOKEN_MAP = (() => {
    const map = {};
    for (const [region, tokens] of Object.entries(REGION_KW)) {
        for (const t of tokens)
            for (const sfx of REGION_ADMIN_SUFFIXES)
                map[t + sfx] = region;
    }
    return map;
})();
// 이만큼 많은 서로 다른 지역이 해시태그에 나열되면 전국 공고로 간주.
// 실측(BizInfo 300공고): 진짜 전국 공고는 17개 지역을 전부 태깅하고, 지역 클러스터(수도권 3·
// 충청권 4·영남권 5 등)는 최대 5개, 그 사이 8~15개는 과기원·팹리스·비수도권 등 '특정 다지역'
// 공고였다. 따라서 16으로 잡아 8~15개 다지역 공고는 (사용자 지역 미포함 시) 지역공고로 제외한다.
const NATIONWIDE_REGION_COUNT = 16;
// 주관기관명 → 지역. '충남테크노파크'·'경기도경제과학진흥원'처럼 "{지역}+기관" 명명을 이용.
// 해시태그에 지역을 누락한 지역공고를 보강 감지한다(전국 공고는 17개 태깅→nationwide가 우선).
const AGENCY_REGION_PREFIXES = Object.entries(REGION_KW)
    .flatMap(([region, tokens]) => tokens.map(t => [t, region]))
    .sort((a, b) => b[0].length - a[0].length); // 긴 토큰(충청남도) 우선
// 산업 매칭 점수 가중치
const SUB_MATCH_SCORE = 2.5; // 세부업종 정확 일치
const MAJOR_MATCH_SCORE = 2.0; // 대분류 일치(세부 불일치 또는 대분류 전반 공고)
/** 3개 이상 세부업종이 함께 잡히면 "다업종 범용 공고"로 간주해 게이트를 면제 */
const BROAD_MULTISECTOR_THRESHOLD = 3;
export function extractEndDate(range) {
    if (!range)
        return null;
    // 'YYYY-MM-DD' / 'YYYY/MM/DD' / 'YYYY.MM.DD' 형식을 모두 수용하고,
    // 뒤에 시각('18:00')이나 괄호 문구가 붙어도 마지막 날짜를 마감일로 추출.
    // (bizinfo=YYYY-MM-DD, 나라장터=YYYY/MM/DD HH:MM 등 소스별 포맷 차이 흡수)
    const all = [...range.matchAll(/(20\d{2})[-/.](\d{2})[-/.](\d{2})/g)];
    if (all.length === 0)
        return null;
    const m = all[all.length - 1];
    return `${m[1]}-${m[2]}-${m[3]}`;
}
export function stripHtml(html) {
    return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
/** 마감일 없는(상시 취급) 공고가 이 일수 이상 재수집되지 않으면 종료된 것으로 간주 */
export const STALE_OPEN_ENDED_DAYS = 14;
/**
 * 공고 활성 판정. 마감일이 있으면 마감일 기준.
 * 마감일이 없는 공고(KISED·나라장터 상당수)는 fetched_at이 최근이면 활성:
 * 배치가 매일 "모집중" 피드를 재수집해 fetched_at을 갱신하므로, 피드에서 빠진 공고는
 * fetched_at이 멈춘다 → 14일 넘게 갱신 안 된 무마감 공고는 좀비로 보고 제외한다.
 * (fetchedAt 정보가 없는 라이브 BizInfo 경로는 기존대로 보존)
 */
export function isActiveProgram(p, todayIso) {
    const end = extractEndDate(p.reqstBeginEndDe);
    if (end)
        return end >= todayIso;
    if (!p.fetchedAt)
        return true;
    const cutoff = new Date(Date.now() - STALE_OPEN_ENDED_DAYS * 86400000).toISOString();
    return p.fetchedAt >= cutoff;
}
/**
 * 부분문자열 매칭. 단, 짧은 ASCII 토큰('AI','IT','PR','SI','UI','IR','VC','5G' 등)은
 * 영문 단어 내부('email'→ai, 'digital'→it, 'project'→pr)에 우연히 박혀 오탐을 내므로
 * 단어경계로 매칭한다. 한글은 ASCII 단어문자가 아니라 'AI기반' 같은 한영 인접은 정상 매칭됨.
 */
export function textIncludes(haystack, term) {
    if (!haystack)
        return false;
    const text = haystack.toLowerCase();
    const t = term.toLowerCase();
    if (!t)
        return false;
    const alnum = t.replace(/[^a-z0-9]/g, '');
    if (alnum.length > 0 && alnum.length <= 3 && /^[a-z0-9&.+\-/]+$/.test(t)) {
        const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(text);
    }
    return text.includes(t);
}
// ─── 공고 업종 분류 (Industry Profile) ────────────────────────────────────────
const SUB_SIGNAL_ENTRIES = Object.entries(SUB_SIGNALS);
const MAJOR_SIGNAL_ENTRIES = Object.entries(MAJOR_SIGNALS);
/**
 * 공고 제목·해시태그·지원대상 텍스트에서 업종 신호를 추출한다.
 * 본문(bsnsSumryCn)은 범용 키워드 노이즈가 많아 분류에는 쓰지 않는다(키워드 점수에만 사용).
 */
export function classifyIndustry(signalText) {
    // 기관·부처명을 먼저 제거(이름 속 업종 명사 오탐 방지). 예: '농림축산식품부'→'축산' 오탐 차단.
    let text = signalText;
    for (const noise of AGENCY_NOISE) {
        if (text.includes(noise))
            text = text.split(noise).join(' ');
    }
    const lower = text.toLowerCase();
    const agnostic = AGNOSTIC_SIGNALS.some(s => lower.includes(s.toLowerCase()));
    const subs = new Set();
    for (const [sub, kws] of SUB_SIGNAL_ENTRIES) {
        if (kws.some(k => textIncludes(text, k)))
            subs.add(sub);
    }
    const broadMajors = new Set();
    for (const [major, kws] of MAJOR_SIGNAL_ENTRIES) {
        if (kws.some(k => textIncludes(text, k)))
            broadMajors.add(major);
    }
    // 세부업종이 잡혔으면 그 대분류도 (세부 경유로) 대상에 포함됨을 별도 추적은 하지 않고,
    // industryEligibility 안에서 SUB_TO_MAJOR로 판정한다.
    return { agnostic, subs, broadMajors };
}
/**
 * 공고 업종 프로필 × 사용자 선택(대분류/세부업종) → 적격성 판정.
 *
 * 핵심 규칙(정밀도 우선):
 *  - 세부업종 정확 일치 → 최우선 매칭(tier 2)
 *  - 업종무관 공고 → 절대 제외하지 않음
 *  - 사용자가 세부업종을 고른 경우, 공고가 '형제 세부업종'에만 못박혀 있으면 제외
 *    (예: 화장품제조 선택 → 식품제조 전용 공고 차단 — 신고된 버그)
 *  - 공고가 대분류 전반을 대상으로 하면 세부 불일치라도 대분류 매칭(tier 1)
 *  - 3개 이상 세부업종이 함께 잡히면 다업종 범용으로 보고 보존(중립)
 *  - 아무 업종 신호도 없으면 중립(키워드·지역 점수로만 노출)
 */
export function industryEligibility(profile, selMajor, selSub) {
    const { agnostic, subs, broadMajors } = profile;
    const NEUTRAL = { kind: 'neutral', tier: 0, score: 0 };
    const EXCLUDED = { kind: 'excluded', tier: -1, score: 0 };
    const SUB = { kind: 'sub', tier: 2, score: SUB_MATCH_SCORE };
    const MAJOR = { kind: 'major', tier: 1, score: MAJOR_MATCH_SCORE };
    // 선택 대분류에 속한, 공고가 잡은 세부업종들
    const subsInSelMajor = [...subs].filter(s => SUB_TO_MAJOR[s] === selMajor);
    const majorBroad = !!selMajor && broadMajors.has(selMajor);
    const majorMatch = majorBroad || subsInSelMajor.length > 0;
    // "다업종 범용" = 서로 다른 대분류에 걸쳐(≥2) 충분히 많은(≥3) 세부업종이 잡힌 경우.
    // (한 대분류 안에서 3개가 잡힌 건 그 대분류 전용이므로 범용으로 보지 않는다)
    const distinctMajorsOfSubs = new Set([...subs].map(s => SUB_TO_MAJOR[s]));
    const broadMultiSector = distinctMajorsOfSubs.size >= 2 && subs.size >= BROAD_MULTISECTOR_THRESHOLD;
    // 1) 세부업종 정확 일치 — 최강 매칭
    if (selSub && subs.has(selSub))
        return SUB;
    // 2) 업종무관 공고는 절대 제외하지 않음
    if (agnostic)
        return majorMatch ? MAJOR : NEUTRAL;
    // 3) 사용자가 대분류만 선택(세부 미선택) — 대분류 단위로만 판정, 형제 필터링 안 함
    if (!selSub) {
        if (majorMatch)
            return MAJOR;
        if (subs.size === 0 && broadMajors.size === 0)
            return NEUTRAL;
        if (broadMultiSector)
            return NEUTRAL;
        return EXCLUDED; // 공고가 다른 대분류 전용
    }
    // 4) 세부업종을 골랐지만 정확 일치하지 않은 경우
    // 4a) 공고가 선택 대분류 '전반'을 대상으로 한다는 신호가 있음
    if (majorBroad) {
        // 단, '제조업체'·'스마트공장' 같은 범용어가 있어도 실제 특정 신호가 1~2개 세부업종에만
        // 몰려 있으면 그 세부업종 전용 공고로 보고 제외(예: '떡 산업'+제조업체 → 식품 전용).
        if (subs.size >= 1 && subs.size <= BROAD_MULTISECTOR_THRESHOLD - 1)
            return EXCLUDED;
        return MAJOR; // 특정 신호 없음(대분류 전반) 또는 3+ 세부업종(다업종 나열)
    }
    // 4b) 선택 대분류 내 형제 세부업종 신호가 있음(대분류 전반 신호는 없음)
    if (subsInSelMajor.length > 0) {
        if (broadMultiSector)
            return NEUTRAL; // 여러 대분류 걸친 범용이면 보존
        return EXCLUDED; // 형제 세부업종 전용 → 제외
    }
    // 4c) 아무 업종 신호도 없음 → 중립(보존)
    if (subs.size === 0 && broadMajors.size === 0)
        return NEUTRAL;
    // 4d) 다른 대분류/세부에만 신호 → 여러 대분류 걸친 범용이면 보존, 아니면 제외
    if (broadMultiSector)
        return NEUTRAL;
    return EXCLUDED;
}
export function hasBracketRegionMismatch(title, selectedRegion) {
    if (!title || !selectedRegion)
        return false;
    const tags = [...title.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
    if (tags.length === 0)
        return false;
    const checkTag = (tag) => {
        if (tag === '비수도권' || tag === '지방')
            return METRO_REGIONS.has(selectedRegion);
        if (tag === '수도권')
            return !METRO_REGIONS.has(selectedRegion);
        const selectedTerms = REGION_KW[selectedRegion] ?? [selectedRegion];
        if (selectedTerms.some(t => tag.includes(t)))
            return false;
        for (const terms of Object.values(REGION_KW)) {
            if (terms.some(t => t.length >= 2 && tag.includes(t)))
                return true;
        }
        return false;
    };
    // 모든 태그 중 하나라도 지역 불일치면 제외
    return tags.some(checkTag);
}
/** 해시태그(콤마구분 토큰)에서 지역 신호를 추출 */
export function detectRegions(hashtags) {
    const regions = new Set();
    let nationwide = false, metroOnly = false, nonMetro = false;
    if (hashtags) {
        for (const raw of hashtags.split(/[,\sㆍ·/()]+/)) {
            const tk = raw.trim();
            if (!tk)
                continue;
            if (tk === '전국')
                nationwide = true;
            else if (tk === '수도권')
                metroOnly = true;
            else if (tk === '비수도권' || tk === '지방')
                nonMetro = true;
            else {
                const r = REGION_TOKEN_MAP[tk];
                if (r)
                    regions.add(r);
            }
        }
    }
    if (regions.size >= NATIONWIDE_REGION_COUNT)
        nationwide = true;
    return { regions, nationwide, metroOnly, nonMetro };
}
/**
 * 주관/소관 기관명에서 지역을 추론. '충남테크노파크','경기도경제과학진흥원','대전테크노파크' 등
 * "{지역}+기관" 명명 규칙을 이용해 기관명이 지역 토큰으로 시작하면 그 지역으로 본다.
 * (한국·대한·중소·산업통상 등 중앙기관명은 지역 토큰으로 시작하지 않아 자연히 제외됨)
 */
export function detectAgencyRegion(p) {
    const names = [p.excInsttNm, p.jrsdInsttNm];
    for (const raw of names) {
        const name = (raw ?? '').trim();
        if (!name)
            continue;
        for (const [token, region] of AGENCY_REGION_PREFIXES) {
            if (name.startsWith(token))
                return region;
        }
    }
    return null;
}
// ─── 제목 평문 지역 감지 ─────────────────────────────────────────────────────
// KISED(K-Startup)·나라장터 공고는 해시태그가 비어 있고 기관명도 중앙기관(창업진흥원 등)이라
// 기존 신호로는 지역을 못 잡는다. 제목의 "울산창조경제혁신센터"·"부산 북구"·"경기 스타트업 서밋"
// 같은 평문 지역만이 유일한 신호인 공고(실측 322건)가 전 지역에 노출되던 누수를 막는다.
//
// 정밀도 우선 규칙(오탐 방지):
//  - 지역 토큰 앞은 반드시 경계(문자열 시작/공백/숫자/문장부호). '지역경기'(→경기) 차단.
//  - 지역 토큰 뒤는 ①경계, ②행정 접미사(도/시/광역시…)+경계, ③지역 소속 기관어 중 하나.
//    '대전환'(→대전), '서울국제식품산업대전'(전국 대상 박람회) 같은 합성어 오탐 차단.
const TITLE_REGION_INSTITUTIONS = [
    '창조경제혁신센터', '테크노파크', '경제진흥원', '산업진흥원', '경제과학진흥원',
    '신용보증재단', '콘텐츠기업지원센터', '콘텐츠진흥원', '정보산업진흥원', '문화산업진흥원',
    '디자인진흥원', '창업센터', '지식재산센터', '스타트업위크', '시청', '도청',
    // 실측 보강: '{지역}창업허브'·'{지역}센터'(지역 분원)·'{지역}콘텐츠코리아랩'·'{지역}RISE사업'
    // '{지역}통합관'(전시 지역관)·'{지역}창업포럼'
    '창업허브', '센터', '콘텐츠', 'RISE', '통합관', '창업포럼',
];
// 행정 접미사 + 방위 접미사('경기북부'·'충남서부' 같은 권역 표기)
const TITLE_ADMIN_SUFFIXES = ['특별자치도', '특별자치시', '특별시', '광역시', '도', '시', '북부', '남부', '동부', '서부'];
const isHangulOrAlpha = (ch) => !!ch && /[가-힣a-zA-Z]/.test(ch);
/** 제목 평문에서 (경계·기관어 규칙을 만족하는) 지역 신호를 추출 */
export function detectTitleRegions(title) {
    const found = new Set();
    if (!title)
        return found;
    // 대괄호 태그는 hasBracketRegionMismatch가 전담 — 평문 검사에선 제거
    const text = title.replace(/\[[^\]]*\]/g, ' ');
    for (const [token, region] of AGENCY_REGION_PREFIXES) {
        if (found.has(region))
            continue;
        let idx = text.indexOf(token);
        while (idx !== -1) {
            const before = text[idx - 1];
            if (!isHangulOrAlpha(before)) {
                const rest = text.slice(idx + token.length);
                // 행정 접미사가 붙으면 떼고 뒤 경계 검사 (예: '울산광역시 ')
                const sfx = TITLE_ADMIN_SUFFIXES.find(s => rest.startsWith(s));
                const afterSfx = sfx ? rest.slice(sfx.length) : rest;
                const boundaryAfter = !afterSfx[0] || !/[가-힣a-zA-Z0-9]/.test(afterSfx[0]);
                const institutionAfter = TITLE_REGION_INSTITUTIONS.some(inst => rest.startsWith(inst));
                if (boundaryAfter || institutionAfter) {
                    found.add(region);
                    break;
                }
            }
            idx = text.indexOf(token, idx + 1);
        }
    }
    return found;
}
/** 제목 대괄호에서 수도권/비수도권 스코프만 추출 ('metro' | 'nonMetro' | null) */
function bracketMetroScope(title) {
    if (!title)
        return null;
    const tags = [...title.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim());
    for (const t of tags) {
        if (t === '수도권')
            return 'metro';
        if (t === '비수도권' || t === '지방')
            return 'nonMetro';
    }
    return null;
}
/**
 * 지역 불일치 판정(하드 필터). 제목 [지역] 태그 + 해시태그 지역 신호를 함께 본다.
 * 기존엔 제목 대괄호만 검사해, '[충남]'처럼 태그가 없고 해시태그·기관명에만 지역이 박힌
 * 공고(예: 소상공인 가업승계(충남이어家))가 타 지역 사용자에게 새던 문제를 해결한다.
 */
export function hasRegionMismatch(p, selectedRegion) {
    if (!selectedRegion)
        return false;
    const { regions: hashtagRegions, nationwide, metroOnly, nonMetro } = detectRegions(p.hashtags);
    // 해시태그 지역 + 주관기관 지역을 합쳐 판정(전국 공고는 nationwide가 우선이라 영향 없음)
    const regions = new Set(hashtagRegions);
    const agencyRegion = detectAgencyRegion(p);
    if (agencyRegion)
        regions.add(agencyRegion);
    const isMetro = METRO_REGIONS.has(selectedRegion);
    // ── 수도권/비수도권 스코프(제목 대괄호 + 해시태그 마커)는 지역 나열 수보다 우선 ──────
    // (예: '[비수도권]' 공고가 해시태그에 비수도권 14~15개 지역을 전부 나열해도 수도권 사용자에겐 제외)
    const bracketScope = bracketMetroScope(p.pblancNm);
    const wantsNonMetro = nonMetro || bracketScope === 'nonMetro';
    const wantsMetroOnly = metroOnly || bracketScope === 'metro';
    if (wantsNonMetro && isMetro)
        return true; // 비수도권 전용 × 수도권 사용자
    if (wantsMetroOnly && !isMetro && !regions.has(selectedRegion))
        return true; // 수도권 전용 × 비수도권 사용자
    // ── 보존 우선 ──────────────────────────────────────────────────────────────
    if (regions.has(selectedRegion))
        return false; // 해시태그가 사용자 지역 명시(다지역 공고 포함)
    if (wantsMetroOnly && isMetro)
        return false; // 수도권 공고 × 수도권 사용자
    if (nationwide)
        return false; // 전국(8개 이상 나열 또는 '전국')
    // ── 제외 신호 ──────────────────────────────────────────────────────────────
    if (hasBracketRegionMismatch(p.pblancNm, selectedRegion))
        return true; // 제목 [특정지역] 타지역
    if (regions.size > 0)
        return true; // 특정 타 지역(들)만 명시, 사용자 지역 없음
    // ── 해시태그·기관명 신호가 전무한 공고(KISED·나라장터)는 제목 평문 지역으로 판정 ──
    const titleRegions = detectTitleRegions(p.pblancNm);
    if (titleRegions.size > 0 && !titleRegions.has(selectedRegion))
        return true;
    return false; // 지역 신호 전무 → 전국 간주, 보존
}
export function scoreForTrial(p, majorIndustryRaw, subIndustry, selectedSize, selectedKws, selectedRegion) {
    // 레거시 데이터가 "대분류 > 소분류"로 들어와도 대분류만 안전하게 추출
    const { major: majorIndustry } = parseIndustry(majorIndustryRaw);
    let score = 0;
    const matchReasons = [];
    const exclusion = subIndustry
        ? INDUSTRY_SUB_EXCLUSION[subIndustry]
        : INDUSTRY_MAJOR_CAUTION[majorIndustry];
    if (exclusion?.level === 'blocked') {
        return { ...p, score: -1, matchReasons: [] };
    }
    // ── 업종 적격성 게이트 ────────────────────────────────────────────────────
    // 공고 업종 프로필을 분류한 뒤 사용자 선택과 대조해 부적격 공고를 제외하고,
    // 적격 공고에는 적합도 점수(세부/대분류)를 부여한다.
    const signalText = [p.pblancNm, p.hashtags, p.trgetNm].filter(Boolean).join(' ');
    const profile = classifyIndustry(signalText);
    const eligibility = industryEligibility(profile, majorIndustry, subIndustry);
    if (eligibility.kind === 'excluded') {
        return { ...p, score: 0, matchReasons: [] };
    }
    if (eligibility.kind === 'sub') {
        score += eligibility.score;
        matchReasons.push('업종', '세부업종');
    }
    else if (eligibility.kind === 'major') {
        score += eligibility.score;
        matchReasons.push('업종');
    }
    if (selectedSize && SIZE_BOOST_KW[selectedSize]) {
        const sizeTerms = SIZE_BOOST_KW[selectedSize];
        const text = [p.pblancNm, p.hashtags, p.trgetNm].filter(Boolean).join(' ');
        if (sizeTerms.some(t => textIncludes(text, t))) {
            score += 1;
            if (!matchReasons.includes('기업규모'))
                matchReasons.push('기업규모');
        }
    }
    if (selectedRegion) {
        const regionTerms = REGION_KW[selectedRegion] ?? [selectedRegion];
        const text = [p.pblancNm, p.hashtags, p.trgetNm].filter(Boolean).join(' ');
        if (regionTerms.some(t => textIncludes(text, t))) {
            score += 2;
            matchReasons.push('지역');
        }
    }
    const bodyText = stripHtml(p.bsnsSumryCn);
    for (const kw of selectedKws) {
        const terms = KW_MAP[kw] ?? [kw];
        for (const t of terms) {
            if (textIncludes(p.pblancNm, t)) {
                score += 3;
                if (!matchReasons.includes('제목'))
                    matchReasons.push('제목');
                break;
            }
            if (textIncludes(p.hashtags, t)) {
                score += 2;
                if (!matchReasons.includes('해시태그'))
                    matchReasons.push('해시태그');
                break;
            }
            if (textIncludes(p.trgetNm, t)) {
                score += 1;
                if (!matchReasons.includes('지원대상'))
                    matchReasons.push('지원대상');
                break;
            }
            if (textIncludes(bodyText, t)) {
                score += 0.5;
                if (!matchReasons.includes('본문'))
                    matchReasons.push('본문');
                break;
            }
        }
    }
    if (exclusion?.level === 'caution') {
        score = score * (1 - exclusion.penalty);
    }
    return { ...p, score, matchReasons };
}
/**
 * 결과 정렬 비교자. 업종 적합도를 1차 키, 점수를 2차 키로 사용해
 * 키워드만 맞은 업종무관 공고가 업종 적합 공고보다 위로 올라오지 않게 한다.
 *   tier 2 = 세부업종 일치, 1 = 대분류 일치, 0 = 업종 신호 없음
 */
function industryTier(p) {
    if (p.matchReasons.includes('세부업종'))
        return 2;
    if (p.matchReasons.includes('업종'))
        return 1;
    return 0;
}
export function compareScored(a, b) {
    const tierDiff = industryTier(b) - industryTier(a);
    if (tierDiff !== 0)
        return tierDiff;
    return b.score - a.score;
}
