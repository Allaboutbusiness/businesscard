// 인증: scrypt 비번검증 + HMAC 서명 세션쿠키 + 발행토큰 검증
const crypto = require('crypto');
const SESSION_COOKIE = 'okr_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

function verifyPassword(password) {
  const stored = process.env.ADMIN_PASS_HASH || '';
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const h = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function signSession(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const mac = b64url(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest());
  return payload + '.' + mac;
}
function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [payload, mac] = token.split('.');
  const expect = b64url(crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest());
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

function parseCookies(req) {
  const h = req.headers.cookie || ''; const o = {};
  h.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`);
}
function clearSessionCookie(res) {
  // 확실한 삭제: Expires 과거 + Max-Age=0, host-only·도메인 변형 모두 커버
  const exp = 'Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0';
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; Path=/; ${exp}; HttpOnly; Secure; SameSite=Lax`,
    `${SESSION_COOKIE}=; Path=/; Domain=ownerskr.com; ${exp}; HttpOnly; Secure; SameSite=Lax`,
    `${SESSION_COOKIE}=; Path=/; Domain=.ownerskr.com; ${exp}; HttpOnly; Secure; SameSite=Lax`,
  ]);
}
function isLoggedIn(req) { return !!verifySession(parseCookies(req)[SESSION_COOKIE]); }
function hasPublishToken(req) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const a = Buffer.from(m[1]); const b = Buffer.from(process.env.PUBLISH_TOKEN || '');
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function canWrite(req) { return isLoggedIn(req) || hasPublishToken(req); }

module.exports = { verifyPassword, signSession, verifySession, parseCookies,
  setSessionCookie, clearSessionCookie, isLoggedIn, hasPublishToken, canWrite, SESSION_COOKIE };
