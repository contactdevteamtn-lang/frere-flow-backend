import os from 'node:os';
// Couche HTTP commune : en-têtes de sécurité, réponses JSON, lecture du corps, CORS / anti-CSRF,
// cookies et limites anti-abus (force brute, saturation).
import zlib from 'node:zlib';
import { env } from '../config/env.js';
import { HttpError } from '../services/engine.js';

export const COOKIE = 'ff_session';

// En-têtes de sécurité envoyés avec chaque réponse
export const SECURITE = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Derrière Caddy/Nginx : la DERNIÈRE adresse est celle ajoutée par notre serveur web (les précédentes
// peuvent être inventées par le client pour contourner les limites)
export const ipDe = (req) => (env.trustProxy && req.headers['x-forwarded-for']
  ? String(req.headers['x-forwarded-for']).split(',').map((s) => s.trim()).filter(Boolean).pop()
  : req.socket.remoteAddress) || '?';
export const enHttps = (req) => req.socket.encrypted || (env.trustProxy && req.headers['x-forwarded-proto'] === 'https');

export function json(req, res, status, body, extra = {}) {
  const data = Buffer.from(JSON.stringify(body));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITE, ...extra };
  if (enHttps(req)) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  if (data.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    // compression dans le pool de threads (gzipSync bloquerait la boucle d'événements sur un gros état)
    zlib.gzip(data, { level: 6 }, (err, gz) => {
      if (res.writableEnded || res.destroyed) return;
      if (err) { res.writeHead(status, headers); res.end(data); return; }
      res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' });
      res.end(gz);
    });
  } else {
    res.writeHead(status, headers);
    res.end(data);
  }
}

export function lireCorps(req, limite = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    // Refus immédiat si la taille annoncée dépasse la limite (sans lire le corps)
    if (Number(req.headers['content-length'] || 0) > limite) { reject(new HttpError(413, 'Requête trop volumineuse', 'TAILLE')); req.resume(); return; }
    let taille = 0;
    const morceaux = [];
    req.on('data', (c) => {
      taille += c.length;
      if (taille > limite) { reject(new HttpError(413, 'Requête trop volumineuse')); req.destroy(); return; }
      morceaux.push(c);
    });
    req.on('end', () => {
      if (!morceaux.length) return resolve({});
      let v;
      try { v = JSON.parse(Buffer.concat(morceaux).toString('utf8')); } catch { reject(new HttpError(400, 'JSON invalide', 'JSON')); return; }
      // le corps doit être un objet { … } (null, nombre, tableau → 400 au lieu d'une erreur 500 plus loin)
      if (!v || typeof v !== 'object' || Array.isArray(v)) { reject(new HttpError(400, 'JSON invalide', 'JSON')); return; }
      resolve(v);
    });
    req.on('error', reject);
  });
}

// Adresses réseau de CE PC (ex. 192.168.100.76) : relues au plus toutes les 30 s (Wi-Fi qui change d'adresse)
let adressesLocales = { quand: 0, liste: new Set() };
export function adressesDeCePc() {
  if (Date.now() - adressesLocales.quand > 30000) {
    const liste = new Set();
    for (const cartes of Object.values(os.networkInterfaces())) {
      for (const a of cartes || []) liste.add(a.family === 'IPv6' || a.family === 6 ? `[${a.address.split('%')[0]}]` : a.address);
    }
    adressesLocales = { quand: Date.now(), liste };
  }
  return adressesLocales.liste;
}

export function origineAutorisee(origin) {
  if (!origin) return false;
  if (env.corsOrigins.length) return env.corsOrigins.includes(origin);
  if (env.production) return false;
  // Développement : localhost, ou le site ouvert avec l'adresse réseau de ce PC (http://192.168.x.x:8080)
  const m = /^https?:\/\/(localhost|\[[0-9a-fA-F:]+\]|[0-9.]+)(:\d+)?$/.exec(origin);
  if (!m) return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(m[1]) || adressesDeCePc().has(m[1]);
}

export const lireCookie = (req, nom = COOKIE) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === nom) return v.join('=').slice(0, 512);
  }
  return '';
};
export const cookie = (req, nom, valeur, maxAge) =>
  `${nom}=${valeur}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${env.cookieSecure || enHttps(req) ? '; Secure' : ''}`;
export const cookieSession = (req, token, maxAge) => cookie(req, COOKIE, token, maxAge);
export const COOKIE_DEFI = 'ff_mfa';        // 2e étape de connexion en cours (10 min)
export const COOKIE_APPAREIL = 'ff_device'; // identifiant de cet appareil (mode « appareils approuvés »)

// Limites anti-abus (mémoire du processus)
export const compteurs = new Map();
export function limite(cle, max, fenetreMs) {
  const now = Date.now();
  const e = (compteurs.get(cle) || []).filter((t) => now - t < fenetreMs);
  e.push(now);
  // Plafond : sous une rafale, le tableau ne grossit pas au-delà de max+1 (sinon coût quadratique → gel du CPU)
  if (e.length > max + 1) e.splice(0, e.length - (max + 1));
  compteurs.set(cle, e);
  return e.length > max;
}
/** Purge des compteurs expirés (jamais de remise à zéro globale : elle débloquerait un attaquant) */
export function purgerCompteurs() {
  const now = Date.now();
  for (const [k, e] of compteurs) if (!e.length || now - e[e.length - 1] > 30 * 60 * 1000) compteurs.delete(k);
  if (compteurs.size > 200000) for (const k of [...compteurs.keys()].slice(0, compteurs.size - 150000)) compteurs.delete(k);
}
setInterval(purgerCompteurs, 60 * 1000).unref();
export const TROP = 'محاولات كثيرة، أعد المحاولة بعد بضع دقائق';
export const QUINZE_MIN = 15 * 60 * 1000;
export const limiteConnexion = (ip) => { if (limite(`ip:${ip}`, env.loginIpLimit, QUINZE_MIN)) throw new HttpError(429, TROP, 'TROP'); };
export const echecsCompte = (email) => (compteurs.get(`echec:${email}`) || []).filter((t) => Date.now() - t < QUINZE_MIN).length;

/** CORS : seules les adresses du site (CORS_ORIGIN) peuvent appeler l'API avec le cookie */
export function appliquerCors(req, res) {
  const origin = req.headers.origin;
  const autorisee = origineAutorisee(origin);
  if (autorisee) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Activite');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  return { origin, autorisee };
}

/** Garde générale de chaque requête : saturation, anti-CSRF (origine + JSON obligatoire) */
export function garde(req, { origin, autorisee }) {
  if (limite(`req:${ipDe(req)}`, 600, 60 * 1000)) throw new HttpError(429, TROP, 'TROP');
  if (req.method === 'POST') {
    if (origin && !autorisee) throw new HttpError(403, 'Origine non autorisée', 'ORIGINE');
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Content-Type: application/json requis', 'TYPE');
  }
}
