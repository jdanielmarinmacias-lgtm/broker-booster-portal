'use strict';
/* Hash de contraseñas con scrypt (node:crypto, sin dependencias).
 * Formato: scrypt$<n>$<r>$<p>$<saltHex>$<hashHex>
 * Jamás se guarda ni se devuelve una contraseña en claro. */
const crypto = require('crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 64;

function hash(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function isHash(v) {
  return typeof v === 'string' && v.startsWith('scrypt$');
}

function verify(password, stored) {
  try {
    if (!isHash(stored)) return false;
    const [, n, r, p, saltHex, hashHex] = stored.split('$');
    const derived = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), KEYLEN, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'));
  } catch (e) { return false; }
}

module.exports = { hash, verify, isHash };
