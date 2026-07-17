import { INDUSTRY_SUB_KW, INDUSTRY_SUB_EXCLUSION, INDUSTRY_MAJOR_CAUTION, } from './industries.js';
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
export const INDUSTRY_KW = {
    '제조업': ['제조', '제조업', '스마트공장', '공장'],
    '도매 및 소매업': ['도매', '소매', '유통', '판매'],
    '정보통신업': ['IT', '소프트웨어', '정보통신', '플랫폼', '앱', '데이터', 'AI'],
    '서비스업': ['서비스', '서비스업', '컨설팅'],
    '건설업': ['건설', '건축'],
    '농업·임업·어업': ['농업', '농산물', '수산', '임업', '농촌'],
    '의료·바이오': ['의료', '바이오', '헬스케어', '의약품'],
    '문화·예술·엔터': ['문화', '콘텐츠', '예술', '미디어', '엔터'],
    '금융·보험업': ['핀테크', '금융', '보험'],
};
const METRO_REGIONS = new Set(['서울', '경기', '인천']);
export function extractEndDate(range) {
    if (!range)
        return null;
    const match = range.match(/(\d{4}-\d{2}-\d{2})\s*$/);
    return match ? match[1] : null;
}
export function stripHtml(html) {
    return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
export function scoreForTrial(p, majorIndustry, subIndustry, selectedSize, selectedKws, selectedRegion) {
    let score = 0;
    const matchReasons = [];
    const exclusion = subIndustry
        ? INDUSTRY_SUB_EXCLUSION[subIndustry]
        : INDUSTRY_MAJOR_CAUTION[majorIndustry];
    if (exclusion?.level === 'blocked') {
        return { ...p, score: -1, matchReasons: [] };
    }
    const text = [p.pblancNm, p.hashtags, p.trgetNm, stripHtml(p.bsnsSumryCn)]
        .join(' ').toLowerCase();
    const industryTerms = INDUSTRY_KW[majorIndustry] ?? [majorIndustry];
    if (industryTerms.some(t => text.includes(t.toLowerCase()))) {
        score += 2;
        matchReasons.push('업종');
    }
    if (subIndustry) {
        const subTerms = INDUSTRY_SUB_KW[subIndustry] ?? [];
        if (subTerms.some(t => text.includes(t.toLowerCase()))) {
            score += 1.5;
            if (!matchReasons.includes('세부업종'))
                matchReasons.push('세부업종');
        }
    }
    if (selectedSize && SIZE_BOOST_KW[selectedSize]) {
        const sizeTerms = SIZE_BOOST_KW[selectedSize];
        if (sizeTerms.some(t => text.includes(t.toLowerCase()))) {
            score += 1;
            if (!matchReasons.includes('기업규모'))
                matchReasons.push('기업규모');
        }
    }
    if (selectedRegion) {
        const regionTerms = REGION_KW[selectedRegion] ?? [selectedRegion];
        if (regionTerms.some(t => text.includes(t.toLowerCase()))) {
            score += 2;
            matchReasons.push('지역');
        }
    }
    for (const kw of selectedKws) {
        const terms = KW_MAP[kw] ?? [kw];
        for (const t of terms) {
            const q = t.toLowerCase();
            if (p.pblancNm?.toLowerCase().includes(q)) {
                score += 3;
                if (!matchReasons.includes('제목'))
                    matchReasons.push('제목');
                break;
            }
            if (p.hashtags?.toLowerCase().includes(q)) {
                score += 2;
                if (!matchReasons.includes('해시태그'))
                    matchReasons.push('해시태그');
                break;
            }
            if (p.trgetNm?.toLowerCase().includes(q)) {
                score += 1;
                if (!matchReasons.includes('지원대상'))
                    matchReasons.push('지원대상');
                break;
            }
            if (stripHtml(p.bsnsSumryCn).toLowerCase().includes(q)) {
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
