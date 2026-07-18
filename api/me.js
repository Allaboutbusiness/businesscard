const { isLoggedIn } = require('../lib/auth');
module.exports = async (req, res) => res.json({ loggedIn: isLoggedIn(req) });
