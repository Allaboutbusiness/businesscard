// 최초 1회 posts 테이블 생성. ?secret=INIT_SECRET 필요.
const { initSchema } = require('../lib/db');
module.exports = async (req, res) => {
  if ((req.query.secret || '') !== process.env.INIT_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try { await initSchema(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
