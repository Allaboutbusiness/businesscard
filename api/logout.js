const { clearSessionCookie } = require('../lib/auth');
module.exports = async (req, res) => { clearSessionCookie(res); res.json({ ok: true }); };
