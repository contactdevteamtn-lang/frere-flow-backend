// Mots de passe (scrypt) et jetons de session (JWT HS256) — uniquement node:crypto.
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const PREFIX = 'scrypt$';
export const isHash = (v) => typeof v === 'string' && v.startsWith(PREFIX);

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('base64url');
  return `${PREFIX}${salt}$${hash}`;
}

export function verifyPassword(plain, stored) {
  if (!isHash(stored)) return false;
  const [, salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(plain), salt, 64);
  const ref = Buffer.from(hash, 'base64url');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

/* ───── Versions asynchrones (routes HTTP) ─────
   scryptSync bloque la boucle d'événements (~40 ms) : sur les routes accessibles sans session
   (connexion, PIN), on calcule dans le pool de threads de Node et on plafonne les calculs
   simultanés pour qu'une rafale de tentatives ne sature pas le serveur. */
const MAX_CALCULS = Number(process.env.SCRYPT_CONCURRENCE || 4);
let calculsEnCours = 0;
export class OccupeError extends Error {}
function scryptAsync(plain, salt) {
  if (calculsEnCours >= MAX_CALCULS * 4) return Promise.reject(new OccupeError('occupé'));
  calculsEnCours += 1;
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(plain), salt, 64, (err, key) => {
      calculsEnCours -= 1;
      if (err) reject(err); else resolve(key);
    });
  });
}
export async function hashPasswordAsync(plain) {
  const salt = crypto.randomBytes(16).toString('base64url');
  return `${PREFIX}${salt}$${(await scryptAsync(plain, salt)).toString('base64url')}`;
}
export async function verifyPasswordAsync(plain, stored) {
  if (!isHash(stored)) return false;
  const [, salt, hash] = stored.split('$');
  const test = await scryptAsync(plain, salt);
  const ref = Buffer.from(hash, 'base64url');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', env.jwtSecret).update(data).digest('base64url');

/** Empreinte du mot de passe : un changement de mot de passe annule les sessions ouvertes */
export const passwordStamp = (hash) => crypto.createHash('sha256').update(String(hash)).digest('base64url').slice(0, 16);

/** Jeton de session signé : utilisateur, empreinte du mot de passe, identifiant de session, expiration */
export function createToken(userId, passwordHash, dv) {
  const now = Math.floor(Date.now() / 1000);
  const sid = crypto.randomBytes(18).toString('base64url');
  const exp = now + env.sessionHours * 3600;
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ uid: userId, pv: passwordStamp(passwordHash), sid, iat: now, exp, ...(dv ? { dv } : {}) })}`;
  return { token: `${data}.${sign(data)}`, sid, exp };
}

// Hachage factice : même durée de vérification que l'email existe ou non
const LEURRE = hashPassword(crypto.randomBytes(16).toString('hex'));
export function verifyLogin(user, plain) {
  const ok = verifyPassword(plain, user?.password || LEURRE);
  return !!user && ok;
}
export async function verifyLoginAsync(user, plain) {
  const ok = await verifyPasswordAsync(plain, user?.password || LEURRE);
  return !!user && ok;
}

/** Renvoie { uid, pv } ou null si le jeton est absent, falsifié ou expiré */
export function readToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = sign(`${parts[0]}.${parts[1]}`);
  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!p.exp || p.exp < Date.now() / 1000 || !p.uid || !p.sid) return null;
    return { uid: p.uid, pv: p.pv, sid: p.sid, exp: p.exp, dv: p.dv };
  } catch {
    return null;
  }
}
