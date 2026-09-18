const crypto = require('crypto');

// 24 random bytes, base64url-encoded — high entropy, not guessable,
// and never derived from the student's own id.
function generateShareToken() {
  return crypto.randomBytes(24).toString('base64url');
}

module.exports = { generateShareToken };
