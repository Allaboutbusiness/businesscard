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
async function allPublished() {
  return sql`SELECT id, category, updated_at FROM posts WHERE status='published' ORDER BY created_at DESC`;
}

module.exports = { sql, initSchema, createPost, listPosts, getPost, getPostAny, deletePost, setStatus, allPublished };
