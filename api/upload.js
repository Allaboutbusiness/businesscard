// 이미지 업로드 — 세션 또는 발행토큰 필요. body: {filename, dataBase64, contentType}
const { put } = require('@vercel/blob');
const { canWrite } = require('../lib/auth');
const ALLOW = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!canWrite(req)) return res.status(401).json({ error: 'unauthorized' });
  const { filename, dataBase64, contentType } = req.body || {};
  let b64 = String(dataBase64 || '');
  let ct = contentType || '';
  const m = b64.match(/^data:([^;]+);base64,(.*)$/); // data URL도 허용
  if (m) { ct = m[1]; b64 = m[2]; }
  const ext = ALLOW[ct];
  if (!ext) return res.status(400).json({ error: '허용되지 않는 이미지 형식' });
  const buf = Buffer.from(b64, 'base64');
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: '이미지가 너무 큽니다(8MB 초과)' });
  const safe = (filename || 'img').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || 'img';
  const key = `posts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}.${ext}`;
  try {
    const { url } = await put(key, buf, { access: 'public', contentType: ct, token: process.env.BLOB_READ_WRITE_TOKEN });
    res.json({ url });
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
