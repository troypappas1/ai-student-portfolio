const crypto = require('crypto');

// Excludes visually ambiguous characters (0/O, 1/I/L).
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PIN_LENGTH = 8;

function generatePin() {
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += PIN_ALPHABET[crypto.randomInt(PIN_ALPHABET.length)];
  }
  return pin;
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin.trim().toUpperCase()).digest('hex');
}

module.exports = { generatePin, hashPin };
