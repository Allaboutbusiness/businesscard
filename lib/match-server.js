// 서버용 매칭(이메일 다이제스트 전용) — pgm/matching.js의 지역 판정 + 니즈 키워드 점수를
// CommonJS로 자동 추출(업종 분류/industries.js 비의존). 업체별 URL의 정밀 매칭은 클라이언트 matching.js 담당.
/* eslint-disable */
const REGION_KW = {
    '서울': ['서울'], '경기': ['경기'], '인천': ['인천'], '강원': ['강원'],
    '충북': ['충북', '충청북도'], '충남': ['충남', '충청남도'],
    '대전': ['대전'], '세종': ['세종'],
    '전북': ['전북', '전라북도'], '전남': ['전남', '전라남도'], '광주': ['광주'],
    '경북': ['경북', '경상북도'], '경남': ['경남', '경상남도'],
    '대구': ['대구'], '울산': ['울산'], '부산': ['부산'], '제주': ['제주'],
};
const SIZE_BOOST_KW = {
    '소상공인': ['소상공인', '자영업', '소규모', '생계형'],
    '소기업': ['소기업', '소상공인', '중소기업', '소규모기업'],
    '소기업 (벤처인증)': ['소기업', '중소기업', '벤처', '벤처기업', '이노비즈', '메인비즈', '벤처확인'],
    '중소기업': ['중소기업', '중소', '강소기업', '히든챔피언'],
    '중소기업 (벤처인증)': ['중소기업', '벤처', '벤처기업', '이노비즈', '강소기업', '글로벌강소'],
    '중견기업': ['중견기업', '글로벌강소', '히든챔피언'],
};
const KW_MAP = {
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
function extractEndDate(range) {
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
function stripHtml(html) {
    return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
/** 마감일 없는(상시 취급) 공고가 이 일수 이상 재수집되지 않으면 종료된 것으로 간주 */
const STALE_OPEN_ENDED_DAYS = 14;
/**
 * 공고 활성 판정. 마감일이 있으면 마감일 기준.
 * 마감일이 없는 공고(KISED·나라장터 상당수)는 fetched_at이 최근이면 활성:
 * 배치가 매일 "모집중" 피드를 재수집해 fetched_at을 갱신하므로, 피드에서 빠진 공고는
 * fetched_at이 멈춘다 → 14일 넘게 갱신 안 된 무마감 공고는 좀비로 보고 제외한다.
 * (fetchedAt 정보가 없는 라이브 BizInfo 경로는 기존대로 보존)
 */
function isActiveProgram(p, todayIso) {
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
function textIncludes(haystack, term) {
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
function hasBracketRegionMismatch(title, selectedRegion) {
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
function detectRegions(hashtags) {
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
function detectAgencyRegion(p) {
    const names = [p.excInsttNm, p.jrsdInsttNm];
    for (const raw of names) {
        const name = (raw ?? '').trim();
        if (!name)
            continue;
        for (const [token, region] of AGENCY_REGION_PREFIXES) {
            if (name.startsWith(token))
                return region;
        }
        // 도/광역시 접두가 없으면 도시명 접두도 확인 ('창원산업진흥원'→경남, '구미전자정보기술원'→경북)
        for (const [city, region] of CITY_AGENCY_TOKENS) {
            if (name.startsWith(city))
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
function detectTitleRegions(title) {
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
// ─── 주요 도시 → 광역시/도 매핑 ───────────────────────────────────────────────
// BizInfo는 거의 모든 공고 해시태그에 15개 안팎의 지역을 기본 태깅(노이즈)하므로,
// 실제 지역은 제목의 도시명("창원시","구미시")과 주관기관명("경북테크노파크")이 더 정확하다.
// 도시명은 일반명사와 충돌할 수 있어(양산=대량양산·구미=歐美·진주=眞珠·공주=公主 등)
// 두 갈래로 쓴다: 기관명 startsWith(신뢰도 높음)엔 전체 목록, 제목 평문 스캔엔 충돌 낮은 부분집합.
const CITY_TO_REGION = {
    '수원': '경기', '성남': '경기', '용인': '경기', '부천': '경기', '안산': '경기', '평택': '경기', '시흥': '경기', '파주': '경기', '김포': '경기', '군포': '경기', '오산': '경기', '안양': '경기', '의정부': '경기', '남양주': '경기',
    '춘천': '강원', '원주': '강원', '강릉': '강원', '속초': '강원', '삼척': '강원',
    '청주': '충북', '충주': '충북', '제천': '충북',
    '천안': '충남', '아산': '충남', '서산': '충남', '당진': '충남', '논산': '충남', '공주': '충남',
    '전주': '전북', '익산': '전북', '군산': '전북', '김제': '전북', '정읍': '전북', '남원': '전북',
    '여수': '전남', '순천': '전남', '목포': '전남', '광양': '전남', '나주': '전남',
    '포항': '경북', '구미': '경북', '경주': '경북', '경산': '경북', '안동': '경북', '김천': '경북', '영천': '경북', '칠곡': '경북',
    '창원': '경남', '김해': '경남', '진주': '경남', '거제': '경남', '통영': '경남', '사천': '경남', '밀양': '경남', '양산': '경남',
};
// 제목 평문 스캔에서 제외할 '일반명사 충돌' 도시(기관명 접두 매칭엔 계속 사용)
const CITY_TITLE_UNSAFE = new Set(['양산', '구미', '진주', '공주', '경주', '사천', '서산', '원주', '수원']);
const CITY_AGENCY_TOKENS = Object.entries(CITY_TO_REGION).sort((a, b) => b[0].length - a[0].length);
const CITY_TITLE_TOKENS = CITY_AGENCY_TOKENS.filter(([c]) => !CITY_TITLE_UNSAFE.has(c));
/** 제목 평문에서 도시명(경계+선택적 '시' 규칙)으로 지역 추출 */
function detectCityRegions(title) {
    const found = new Set();
    if (!title)
        return found;
    const text = title.replace(/\[[^\]]*\]/g, ' ');
    for (const [city, region] of CITY_TITLE_TOKENS) {
        if (found.has(region))
            continue;
        let idx = text.indexOf(city);
        while (idx !== -1) {
            const before = text[idx - 1];
            if (!isHangulOrAlpha(before)) {
                const rest = text.slice(idx + city.length);
                const afterSi = rest.startsWith('시') ? rest.slice(1) : rest;
                const okSi = rest.startsWith('시') && (!afterSi[0] || !/[가-힣a-zA-Z0-9]/.test(afterSi[0]));
                const okBoundary = !rest[0] || !/[가-힣a-zA-Z0-9]/.test(rest[0]);
                if (okSi || okBoundary) {
                    found.add(region);
                    break;
                }
            }
            idx = text.indexOf(city, idx + 1);
        }
    }
    return found;
}
/** 제목 대괄호 태그에서 지역명 집합 추출 (수도권/비수도권/전국은 별도 처리) */
function detectBracketRegions(title) {
    const found = new Set();
    if (!title)
        return found;
    const tags = [...title.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
    for (const tag of tags) {
        for (const [region, tokens] of Object.entries(REGION_KW)) {
            if (tokens.some(t => tag.includes(t)))
                found.add(region);
        }
    }
    return found;
}
/** 명시적 전국 신호(해시태그 '전국' 토큰 · 대괄호 [전국] · 제목 '전국') */
function hasExplicitNationwide(p) {
    const title = p.pblancNm || '';
    if (title.includes('전국'))
        return true;
    const tokens = (p.hashtags || '').split(/[,\sㆍ·/()]+/).map(t => t.trim());
    return tokens.includes('전국');
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
function hasRegionMismatch(p, selectedRegion) {
    if (!selectedRegion)
        return false;
    const { regions: hashtagRegions, nationwide, metroOnly, nonMetro } = detectRegions(p.hashtags);
    const isMetro = METRO_REGIONS.has(selectedRegion);
    // ── 1) 수도권/비수도권 스코프(제목 대괄호 + 해시태그 마커) 최우선 ────────────────
    const bracketScope = bracketMetroScope(p.pblancNm);
    const wantsNonMetro = nonMetro || bracketScope === 'nonMetro';
    const wantsMetroOnly = metroOnly || bracketScope === 'metro';
    if (wantsNonMetro && isMetro)
        return true; // 비수도권 전용 × 수도권 사용자
    if (wantsMetroOnly && !isMetro && !hashtagRegions.has(selectedRegion))
        return true; // 수도권 전용 × 비수도권 사용자
    const explicitNationwide = hasExplicitNationwide(p);
    // ── 2) 제목 대괄호 지역([서울]·[경기])은 가장 명시적 신호 ──────────────────────
    const bracketRegions = detectBracketRegions(p.pblancNm);
    if (bracketRegions.size > 0) {
        if (bracketRegions.has(selectedRegion))
            return false; // [서울…] 사용자 지역 포함
        if (!explicitNationwide)
            return true; // [경기]·[부산] 등 타지역 전용
    }
    // ── 3) 제목 평문(도/도시명) + 주관기관 지역 = authoritative ──────────────────────
    // BizInfo 해시태그는 대부분 15개 안팎 지역을 기본 태깅한 노이즈라 신뢰하지 않는다.
    // 제목·기관이 특정 지역을 가리키면 (명시적 전국이 아닌 한) 그 지역 전용 공고로 확정.
    const authRegions = new Set([
        ...detectTitleRegions(p.pblancNm),
        ...detectCityRegions(p.pblancNm),
    ]);
    const agencyRegion = detectAgencyRegion(p);
    if (agencyRegion)
        authRegions.add(agencyRegion);
    if (authRegions.size > 0) {
        if (authRegions.has(selectedRegion))
            return false; // 제목/기관이 사용자 지역
        if (explicitNationwide)
            return false; // 지역 기관이 운영하나 명시적 전국 대상
        // 제목/기관이 타지역 → 제외(노이즈 해시태그 무시).
        // [의도된 트레이드오프] '대구창조경제혁신센터'가 운영하는 전국 공고(모두의 챌린지 등)처럼
        // 운영기관만 지역명이고 실제론 전국인 극소수 공고는 숨겨진다. 사용자 선택(엄격)에 따름:
        // 지역센터 운영 프로그램 대다수가 실제 지역 전용이라, 누수 0을 위해 이 소수 오배제를 감수.
        return true;
    }
    // ── 4) authoritative 신호 없음 → 해시태그 폴백(노이즈 관대) ───────────────────────
    if (wantsMetroOnly && isMetro)
        return false; // 수도권 공고 × 수도권 사용자
    if (nationwide)
        return false; // 전국('전국' 또는 16개 이상 나열)
    if (hashtagRegions.has(selectedRegion))
        return false; // 해시태그가 사용자 지역 명시
    if (hashtagRegions.size > 0)
        return true; // 특정 타 지역(들)만 명시, 사용자 지역 없음
    return false; // 지역 신호 전무 → 전국 간주, 보존
}

// ─── 니즈(관심 키워드) 점수 ───
function needsScore(p, needs) {
  const body = stripHtml(p.bsnsSumryCn);
  let score = 0;
  for (const kw of (needs || [])) {
    const terms = KW_MAP[kw] || [kw];
    for (const t of terms) {
      if (textIncludes(p.pblancNm, t)) { score += 3; break; }
      if (textIncludes(p.hashtags, t)) { score += 2; break; }
      if (textIncludes(p.trgetNm, t)) { score += 1; break; }
      if (textIncludes(body, t)) { score += 0.5; break; }
    }
  }
  return score;
}
// 구독자 조건(지역+니즈)으로 공고 1건 매칭. 지역 불일치면 탈락, 니즈 선택 시 니즈 점수 필수.
function matchProgram(p, opts) {
  const region = opts && opts.region, needs = (opts && opts.needs) || [];
  if (region && hasRegionMismatch(p, region)) return { ok: false, score: 0 };
  const ns = needs.length ? needsScore(p, needs) : 0;
  if (needs.length && ns <= 0) return { ok: false, score: 0 };
  let score = ns;
  if (region) {
    const rt = REGION_KW[region] || [region];
    const text = [p.pblancNm, p.hashtags, p.trgetNm].filter(Boolean).join(' ');
    if (rt.some(t => textIncludes(text, t))) score += 2;
  }
  return { ok: true, score };
}

module.exports = { matchProgram, needsScore, hasRegionMismatch, extractEndDate, isActiveProgram, REGION_KW, KW_MAP };
