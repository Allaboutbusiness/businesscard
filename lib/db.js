// Neon Postgres 접근 레이어 — 글(posts) CRUD와 스키마 초기화
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

// posts 테이블·인덱스 생성(멱등)
async function initSchema() {
  await sql`CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('notice','post')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cover_image TEXT,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_cat ON posts (category, status, created_at DESC)`;
  // 정부지원사업 매일 매칭 이메일 구독자
  await sql`CREATE TABLE IF NOT EXISTS subscribers (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    sector TEXT, sub TEXT, region TEXT,
    needs JSONB NOT NULL DEFAULT '[]',
    seen_ids JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sub_token ON subscribers (token)`;
}

// ── 정부지원사업 매칭 구독자 CRUD ──
async function createSubscriber({ email, token, sector, sub, region, needs }) {
  const rows = await sql`INSERT INTO subscribers (email, token, sector, sub, region, needs)
    VALUES (${email}, ${token}, ${sector || null}, ${sub || null}, ${region || null}, ${JSON.stringify(needs || [])}::jsonb)
    RETURNING id`;
  return Number(rows[0].id);
}
async function getSubscriberByToken(token) {
  const rows = await sql`SELECT * FROM subscribers WHERE token=${token} AND active=true`;
  return rows[0] || null;
}
async function listActiveSubscribers() {
  return sql`SELECT * FROM subscribers WHERE active=true ORDER BY created_at`;
}
async function updateSubscriberSeen(id, seenIds) {
  await sql`UPDATE subscribers SET seen_ids=${JSON.stringify(seenIds)}::jsonb, last_sent_at=now() WHERE id=${id}`;
}
async function deactivateSubscriber(token) {
  await sql`UPDATE subscribers SET active=false WHERE token=${token}`;
}

async function createPost({ category, title, body, cover_image }) {
  const rows = await sql`INSERT INTO posts (category, title, body, cover_image)
    VALUES (${category}, ${title}, ${body}, ${cover_image || null}) RETURNING id`;
  return Number(rows[0].id);
}

// 목록(published). category 없으면 공지 먼저 정렬.
async function listPosts({ category, limit = 20, offset = 0 }) {
  if (category) {
    return sql`SELECT id, category, title, cover_image, created_at FROM posts
      WHERE status='published' AND category=${category}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return sql`SELECT id, category, title, cover_image, created_at FROM posts
    WHERE status='published'
    ORDER BY (category='notice') DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`;
}

// 그리드 목록용: 본문 앞부분(발췌·검색용)까지 포함해 조회
/**
 * 관리자 목록 — **숨김 글도 포함**한다.
 * listPosts 는 status='published' 만 돌려주기 때문에, 그걸로 관리 화면을 만들면
 * 숨긴 글이 목록에서 사라져 다시 공개할 방법이 없어진다.
 */
async function listPostsAdmin({ category, limit = 50, offset = 0 }) {
  if (category) {
    return sql`SELECT id, category, title, status, cover_image, created_at, updated_at FROM posts
      WHERE category=${category} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return sql`SELECT id, category, title, status, cover_image, created_at, updated_at FROM posts
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
}

async function listPostsForGrid({ category, limit = 60, offset = 0 }) {
  if (category) {
    return sql`SELECT id, category, title, cover_image, created_at, left(body, 400) AS body_head FROM posts
      WHERE status='published' AND category=${category}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return sql`SELECT id, category, title, cover_image, created_at, left(body, 400) AS body_head FROM posts
    WHERE status='published'
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
}

async function getPost(id) {
  const rows = await sql`SELECT * FROM posts WHERE id=${id} AND status='published'`;
  return rows[0] || null;
}
async function getPostAny(id) {
  const rows = await sql`SELECT * FROM posts WHERE id=${id}`;
  return rows[0] || null;
}
async function deletePost(id) { await sql`DELETE FROM posts WHERE id=${id}`; }
async function setStatus(id, status) {
  await sql`UPDATE posts SET status=${status}, updated_at=now() WHERE id=${id}`;
}
// 글 전체 수정(제목·본문·분류·대표사진)
async function updatePost(id, { category, title, body, cover_image }) {
  await sql`UPDATE posts SET category=${category}, title=${title}, body=${body},
    cover_image=${cover_image || null}, updated_at=now() WHERE id=${id}`;
}
async function allPublished() {
  return sql`SELECT id, category, updated_at FROM posts WHERE status='published' ORDER BY created_at DESC`;
}
// RAG 재색인용: 발행 글 전체(본문 포함)
async function postsForKb() {
  return sql`SELECT id, category, title, body FROM posts WHERE status='published' ORDER BY created_at DESC`;
}

// ── RAG 지식베이스(pgvector) ──────────────────────────────────
// 최초 1회: pgvector 확장 + kb_chunks 테이블(768차원 임베딩) + HNSW 코사인 인덱스
async function initKbSchema() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`CREATE TABLE IF NOT EXISTS kb_chunks (
    id BIGSERIAL PRIMARY KEY,
    category TEXT,
    topic TEXT,
    text TEXT NOT NULL,
    source TEXT,
    embedding vector(768),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_kb_embedding ON kb_chunks USING hnsw (embedding vector_cosine_ops)`;
}

async function kbClear() { await sql`TRUNCATE kb_chunks RESTART IDENTITY`; }
// 특정 출처(예: /post/123)의 청크 제거 — 글 재색인·삭제 시 중복/유령 제거용
async function kbDeleteBySource(source) { await sql`DELETE FROM kb_chunks WHERE source=${source}`; }

// 청크 1건 적재(임베딩 벡터 리터럴 '[...]' 문자열)
async function kbInsert({ category, topic, text, source, vecLiteral }) {
  await sql`INSERT INTO kb_chunks (category, topic, text, source, embedding)
    VALUES (${category || null}, ${topic || null}, ${text}, ${source || null}, ${vecLiteral}::vector)`;
}

async function kbCount() { const r = await sql`SELECT count(*)::int AS n FROM kb_chunks`; return r[0].n; }

// 질의 임베딩(벡터 리터럴)으로 코사인 top-k 검색
async function kbSearch(vecLiteral, k) {
  const lim = Math.max(1, Math.min(k || 4, 10));
  return sql`SELECT text, topic, category, 1 - (embedding <=> ${vecLiteral}::vector) AS score
    FROM kb_chunks
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${lim}`;
}

module.exports = { sql, initSchema, createPost, listPosts, listPostsAdmin, listPostsForGrid, getPost, getPostAny, deletePost, setStatus, updatePost, allPublished, postsForKb,
  initKbSchema, kbClear, kbDeleteBySource, kbInsert, kbCount, kbSearch,
  createSubscriber, getSubscriberByToken, listActiveSubscribers, updateSubscriberSeen, deactivateSubscriber };
