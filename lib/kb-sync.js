// 게시글 ↔ RAG(kb_chunks) 동기화.
// 글이 발행/수정될 때마다 임베딩 1건을 kb_chunks에 넣어, 챗봇이 최신 글
// (자동발행 공고 포함)을 근거로 답하게 한다. → rag-build 수동 재실행 불필요.
const { embed, toVectorLiteral } = require('./rag');
const { kbInsert, kbDeleteBySource } = require('./db');

function postSource(id) { return `/post/${id}`; }

// 임베딩·검색 컨텍스트용 텍스트: 제목 + 본문 평문(마크다운/이미지 제거) 앞부분.
function postText(title, body) {
  const plain = String(body || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')   // 이미지
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')     // 링크
    .replace(/[#>*`\[\]()_~|]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return `${String(title || '').trim()}\n${plain.slice(0, 1200)}`;
}

// 글 1건을 RAG에 색인(기존 동일 출처 청크를 지운 뒤 삽입 → 중복·유령 방지).
async function indexPost({ id, title, body }) {
  const source = postSource(id);
  await kbDeleteBySource(source);
  const text = postText(title, body);
  const vec = await embed(text, 'RETRIEVAL_DOCUMENT');
  await kbInsert({ category: 'post', topic: title, text, source, vecLiteral: toVectorLiteral(vec) });
}

async function unindexPost(id) { await kbDeleteBySource(postSource(id)); }

module.exports = { indexPost, unindexPost, postText, postSource };
