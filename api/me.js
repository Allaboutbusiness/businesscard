const { isLoggedIn } = require('../lib/auth');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ loggedIn: isLoggedIn(req) });
};
