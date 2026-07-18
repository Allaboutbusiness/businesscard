// 관리자 로그인 — 자격 검증 후 세션쿠키 설정
const { verifyPassword, signSession, setSessionCookie } = require('../lib/auth');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const { username, password } = req.body || {};
  await new Promise((r) => setTimeout(r, 300)); // 무차별 완화용 지연
  if (username !== process.env.ADMIN_USER || !verifyPassword(String(password || ''))) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' });
  }
  setSessionCookie(res, signSession(username));
  res.json({ ok: true });
};
