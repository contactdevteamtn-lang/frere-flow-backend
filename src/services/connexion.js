// Modes de sécurité de la connexion (choisis par le directeur pour chaque utilisateur) :
//   none   : mot de passe seul
//   totp   : code à 6 chiffres de l'application Google / Microsoft Authenticator (RFC 6238)
//   pin    : code PIN personnel (4 à 6 chiffres) en plus du mot de passe
//   email  : code à 6 chiffres envoyé par email (SMTP à configurer dans .env)
//   device : seuls les appareils approuvés par le directeur peuvent se connecter
// Uniquement node:crypto / node:net / node:tls — aucune dépendance.
import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { env } from '../config/env.js';

export const MODES = ['none', 'totp', 'pin', 'email', 'device'];

/* ───────────── Base32 (clés des applications Authenticator) ───────────── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0; let val = 0; let out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function deBase32(txt) {
  let bits = 0; let val = 0; const out = [];
  for (const c of String(txt).toUpperCase().replace(/[\s=]/g, '')) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ───────────── TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) ───────────── */
export function hotp(secret, compteur, chiffres = 6) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(compteur));
  const h = crypto.createHmac('sha1', secret).update(c).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** chiffres).padStart(chiffres, '0');
}
export const nouveauSecretTotp = () => base32(crypto.randomBytes(20));
/**
 * Vérifie un code (±30 s de décalage d'horloge toléré).
 * @returns le compteur utilisé (à mémoriser : un code ne sert qu'une fois), ou null
 */
export function verifierTotp(secretB32, code, dernier = -1, maintenant = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const secret = deBase32(secretB32);
  const t = Math.floor(maintenant / 30000);
  for (const d of [0, -1, 1]) {
    const cpt = t + d;
    if (cpt <= dernier) continue;
    const attendu = Buffer.from(hotp(secret, cpt));
    if (crypto.timingSafeEqual(attendu, Buffer.from(String(code)))) return cpt;
  }
  return null;
}
export const lienOtpauth = (email, secret, emetteur = 'Frère Flow') =>
  `otpauth://totp/${encodeURIComponent(emetteur)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=6&period=30`;

/* ───────────── QR code (mode octet, correction M, versions 1 à 10) → SVG ─────────────
   Algorithme de la norme ISO/IEC 18004 (d'après la référence « QR Code generator » de Nayuki, MIT). */
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const modulesBruts = (v) => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
const capaciteDonnees = (v) => Math.floor(modulesBruts(v) / 8) - ECC_M[v] * BLOCS_M[v];
const gfMul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; };
function diviseurRS(degre) {
  const r = new Array(degre).fill(0); r[degre - 1] = 1; let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], racine); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    racine = gfMul(racine, 2);
  }
  return r;
}
function resteRS(donnees, div) {
  const r = new Array(div.length).fill(0);
  for (const b of donnees) { const f = b ^ r.shift(); r.push(0); div.forEach((d, i) => { r[i] ^= gfMul(d, f); }); }
  return r;
}

export function qrMatrice(texte) {
  const octets = [...Buffer.from(texte, 'utf8')];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + octets.length * 8 > capaciteDonnees(v) * 8) v++;
  if (v > 10) throw new Error('Texte trop long pour le QR code');
  const cap = capaciteDonnees(v);
  // 1) flux de bits : mode octet, longueur, données, terminaison, remplissage
  const bits = [];
  const ajout = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  ajout(4, 4); ajout(octets.length, v < 10 ? 8 : 16); octets.forEach((o) => ajout(o, 8));
  ajout(0, Math.min(4, cap * 8 - bits.length));
  ajout(0, (8 - (bits.length % 8)) % 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xec; data.length < cap; p ^= 0xec ^ 0x11) data.push(p);
  // 2) correction d'erreurs et entrelacement
  const nb = BLOCS_M[v]; const ecc = ECC_M[v]; const brut = Math.floor(modulesBruts(v) / 8);
  const courts = nb - (brut % nb); const lgCourt = Math.floor(brut / nb); const div = diviseurRS(ecc);
  const blocs = []; let k = 0;
  for (let i = 0; i < nb; i++) {
    const d = data.slice(k, k + lgCourt - ecc + (i < courts ? 0 : 1)); k += d.length;
    const e = resteRS(d, div); if (i < courts) d.push(0); blocs.push(d.concat(e));
  }
  const final = [];
  for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== lgCourt - ecc || j >= courts) final.push(b[i]); });
  // 3) motifs fixes
  const n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(false));
  const f = Array.from({ length: n }, () => new Array(n).fill(false));
  const fixe = (x, y, noir) => { m[y][x] = noir; f[y][x] = true; };
  for (let i = 0; i < n; i++) { fixe(6, i, i % 2 === 0); fixe(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx; const y = cy + dy; const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < n && y >= 0 && y < n) fixe(x, y, d !== 2 && d !== 4);
    }
  }
  if (v > 1) {
    const na = Math.floor(v / 7) + 2; const pas = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
    const pos = [6]; for (let p = n - 7; pos.length < na; p -= pas) pos.splice(1, 0, p);
    pos.forEach((x, i) => pos.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixe(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  // zone de format réservée (remplie après le choix du masque)
  for (let i = 0; i < 9; i++) if (i !== 6) { fixe(8, i, false); fixe(i, 8, false); }
  for (let i = 0; i < 8; i++) { fixe(n - 1 - i, 8, false); fixe(8, n - 1 - i, false); }
  if (v >= 7) {
    let rv = v; for (let i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1f25);
    const vb = (v << 12) | rv;
    for (let i = 0; i < 18; i++) { const b = bit(vb, i); const a = n - 11 + (i % 3); const c = Math.floor(i / 3); fixe(a, c, b); fixe(c, a, b); }
  }
  // 4) placement des données en zigzag + masque
  let i = 0;
  for (let droite = n - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = droite - j; const monte = ((droite + 1) & 2) === 0; const y = monte ? n - 1 - vert : vert;
      if (!f[y][x] && i < final.length * 8) { m[y][x] = bit(final[i >>> 3], 7 - (i & 7)); i++; }
    }
  }
  // 5) choix du masque le plus lisible (règles de pénalité de la norme)
  let meilleur = null; let score = Infinity;
  for (let k = 0; k < 8; k++) {
    const q = m.map((l) => l.slice());
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!f[y][x] && MASQUES[k](x, y)) q[y][x] = !q[y][x];
    formatQr(q, n, k);
    const p = penalite(q);
    if (p < score) { score = p; meilleur = q; }
  }
  return meilleur;
}

const MASQUES = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
/** Bits de format : correction M (0b00) + numéro de masque */
function formatQr(m, n, masque) {
  const dat = masque; let r = dat;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  const fmt = ((dat << 10) | r) ^ 0x5412;
  const bit = (i) => ((fmt >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
  m[n - 8][8] = true;
}
function penalite(m) {
  const n = m.length; let p = 0; let noirs = 0;
  const lignes = [...m, ...m[0].map((_, x) => m.map((l) => l[x]))];
  const motifA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]; const motifB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (const l of lignes) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && l[i] === l[i - 1]) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    for (let i = 0; i + 11 <= n; i++) {
      const seg = l.slice(i, i + 11).map((b) => (b ? 1 : 0));
      if (seg.every((b, j) => b === motifA[j]) || seg.every((b, j) => b === motifB[j])) p += 40;
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (m[y][x]) noirs++;
    if (y < n - 1 && x < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  const total = n * n;
  p += (Math.ceil(Math.abs(noirs * 20 - total * 10) / total) - 1) * 10;
  return p;
}


export function qrSvg(texte) {
  const m = qrMatrice(texte); const n = m.length; const b = 4;
  let d = '';
  m.forEach((ligne, y) => ligne.forEach((noir, x) => { if (noir) d += `M${x + b},${y + b}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * b} ${n + 2 * b}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ───────────── Email (SMTP minimal : SSL 465, STARTTLS 587 ou relais local) ───────────── */
export const emailConfigure = () => !!(env.smtp.host && env.smtp.from);
const propre = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();

export async function envoyerEmail({ a, sujet, texte }) {
  if (!emailConfigure()) throw new Error('SMTP non configuré');
  const { host, port, user, pass, from, mode } = env.smtp;
  const dest = propre(a);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(dest)) throw new Error('Adresse invalide');
  let sock = mode === 'ssl'
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  sock.setTimeout(20000, () => sock.destroy(new Error('SMTP : délai dépassé')));
  let tampon = '';
  let attente = null;
  const brancher = (s) => {
    s.setEncoding('utf8');
    s.on('data', (c) => {
      tampon += c;
      const lignes = tampon.split('\r\n');
      const fin = lignes.findIndex((l) => /^\d{3} /.test(l));
      if (fin >= 0 && attente) {
        const rep = lignes.slice(0, fin + 1).join('\n');
        tampon = lignes.slice(fin + 1).join('\r\n');
        const w = attente; attente = null; w(rep);
      }
    });
  };
  const erreur = new Promise((_, rej) => sock.on('error', rej));
  brancher(sock);
  const lire = (codeAttendu) => Promise.race([erreur, new Promise((res, rej) => {
    attente = (rep) => (rep.slice(0, 3) === String(codeAttendu) ? res(rep) : rej(new Error(`SMTP : ${rep.slice(0, 200)}`)));
  })]);
  const envoyer = (cmd, code) => { const p = lire(code); sock.write(`${cmd}\r\n`); return p; };
  try {
    await lire(220);
    await envoyer(`EHLO frere-flow`, 250);
    if (mode === 'starttls') {
      await envoyer('STARTTLS', 220);
      sock.removeAllListeners('data');
      sock = tls.connect({ socket: sock, servername: host });
      brancher(sock);
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      await envoyer('EHLO frere-flow', 250);
    }
    if (user) {
      await envoyer('AUTH LOGIN', 334);
      await envoyer(Buffer.from(user).toString('base64'), 334);
      await envoyer(Buffer.from(pass).toString('base64'), 235);
    }
    const exp = propre(from).match(/<([^>]+)>/)?.[1] || propre(from);
    await envoyer(`MAIL FROM:<${exp}>`, 250);
    await envoyer(`RCPT TO:<${dest}>`, 250);
    await envoyer('DATA', 354);
    const b64 = (s) => Buffer.from(s).toString('base64');
    const corps = b64(texte).replace(/.{1,76}/g, '$&\r\n');
    const message = [
      `From: ${propre(from)}`, `To: <${dest}>`, `Subject: =?UTF-8?B?${b64(propre(sujet))}?=`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@frere-flow>`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', corps,
    ].join('\r\n');
    await envoyer(`${message}\r\n.`, 250);
    sock.write('QUIT\r\n');
  } finally {
    sock.end();
  }
}

export const masquerEmail = (e) => String(e).replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => `${a}${'*'.repeat(Math.min(b.length, 6))}${c}`);

/* ───────────── Appareils ───────────── */
export const nouveauJetonAppareil = () => crypto.randomBytes(32).toString('base64url');
export const idAppareil = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('base64url').slice(0, 24);
export function nomAppareil(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur';
  return `${os} · ${nav}`;
}

/** Code à 6 chiffres aléatoire (email) */
export const codeAleatoire = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const empreinte = (s) => crypto.createHash('sha256').update(String(s)).digest();
