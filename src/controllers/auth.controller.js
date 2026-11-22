// Connexion : mot de passe, 2e étape (code de l'application, PIN, email, appareil approuvé),
// déconnexion, changement de son propre mot de passe.
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { hashPasswordAsync, passwordStamp, readToken, verifyLoginAsync, verifyPasswordAsync } from '../services/auth.js';
import {
  codeAleatoire, emailConfigure, empreinte, envoyerEmail, idAppareil, lienOtpauth, masquerEmail, nomAppareil,
  nouveauJetonAppareil, nouveauSecretTotp, qrSvg, verifierTotp,
} from '../services/connexion.js';
import { DEMO_IDS, HttpError, MSG, permissionsOf, vue, vuePublique } from '../services/engine.js';
import { V } from '../domain/domain.mjs';
import {
  COOKIE_APPAREIL, COOKIE_DEFI, QUINZE_MIN, TROP, compteurs, cookie, cookieSession, echecsCompte, ipDe, limite, limiteConnexion, lireCookie,
} from '../middlewares/http.js';

/** Champ texte strict : un tableau ou un objet (ex. {"$ne": ""}, ["a"]) est refusé au lieu d'être converti */
const chaine = (v) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(400, MSG.echec, 'TYPE');
  return v;
};

export function authController({ engine, sessions }) {
  const { fermees, ouvrir, fermer, sessionDe, connecter } = sessions;
  /* ───── 2e étape de connexion (mode choisi par le directeur pour ce compte) ───── */
  const defis = new Map(); // identifiant → { uid, pv, etape, essais, exp, code?, secret?, envois }
  const DIX_MIN = 10 * 60 * 1000;
  const nouveauDefi = (req, u, etape, extra = {}) => {
    const id = crypto.randomBytes(24).toString('base64url');
    const d = { uid: u.id, pv: passwordStamp(u.password), etape, essais: 0, envois: 0, exp: Date.now() + DIX_MIN, ...extra };
    defis.set(id, d);
    if (defis.size > 5000) for (const [k, x] of defis) if (x.exp < Date.now()) defis.delete(k);
    return { d, cookie: cookie(req, COOKIE_DEFI, id, 600) };
  };
  const lireDefi = (req) => {
    const id = lireCookie(req, COOKIE_DEFI);
    const d = id && defis.get(id);
    if (!d || d.exp < Date.now()) { if (id) defis.delete(id); throw new HttpError(401, MSG.etapeExpiree, 'ETAPE'); }
    return { id, d };
  };
  async function envoyerCode(u, d) {
    const code = codeAleatoire();
    d.code = empreinte(code); d.envois += 1;
    try {
      await envoyerEmail({
        a: u.email, sujet: `${code} — رمز الدخول / code de connexion`,
        texte: `رمز الدخول إلى منصة الإخوة محجوب: ${code}\nصالح لمدة 10 دقائق. إن لم تطلبه، أبلغ المدير.\n\nCode de connexion Frère Flow : ${code}\nValable 10 minutes. Si vous n'avez rien demandé, prévenez le directeur.`,
      });
    } catch (e) {
      console.error('Envoi du code par email :', e.message);
      throw new HttpError(503, MSG.emailEchec, 'EMAIL');
    }
  }

  async function deuxiemeEtape(req, u) {
    const mode = u.secMode || 'none';
    if (mode === 'none') return connecter(req, u, 'تسجيل الدخول');
    if (mode === 'device') {
      let jeton = lireCookie(req, COOKIE_APPAREIL);
      const cookies = [];
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(jeton)) { jeton = nouveauJetonAppareil(); cookies.push(cookie(req, COOKIE_APPAREIL, jeton, 400 * 86400)); }
      const id = idAppareil(jeton);
      const maintenant = new Date().toISOString();
      const nom = nomAppareil(String(req.headers['user-agent'] || ''));
      const connu = (u.devices || []).find((x) => x.id === id);
      // le tout premier appareil d'un administrateur est approuvé (sinon personne ne pourrait l'approuver)
      const premierAdmin = !(u.devices || []).some((x) => x.status === 'approved') && permissionsOf((await engine.current()).state, u).has('administration');
      if (connu?.status === 'approved' || premierAdmin) {
        await engine.modifierUtilisateur(u.id, (x) => {
          x.devices = x.devices || [];
          const dd = x.devices.find((y) => y.id === id);
          if (dd) { dd.lastSeen = maintenant; dd.status = 'approved'; } else x.devices.push({ id, name: nom, status: 'approved', createdAt: maintenant, lastSeen: maintenant, ip: ipDe(req) });
        }, connu?.status === 'approved' ? null : 'اعتماد أول جهاز تلقائياً', nom);
        return connecter(req, u, 'تسجيل الدخول (جهاز معتمد)', id, cookies);
      }
      if (!connu) {
        await engine.modifierUtilisateur(u.id, (x) => {
          const approuves = (x.devices || []).filter((y) => y.status === 'approved');
          const attente = (x.devices || []).filter((y) => y.status === 'pending').slice(-9);
          x.devices = [...approuves, ...attente, { id, name: nom, status: 'pending', createdAt: maintenant, ip: ipDe(req) }];
        }, 'جهاز جديد في انتظار الموافقة', `${nom} · ${ipDe(req)}`);
      }
      return [{ etape: 'appareil', message: MSG.appareilAttente, code: 'APPAREIL_EN_ATTENTE' }, cookies.length ? { 'Set-Cookie': cookies } : {}, 403];
    }
    if (mode === 'totp') {
      if (u.totpSecret) return [{ etape: 'totp' }, { 'Set-Cookie': nouveauDefi(req, u, 'totp').cookie }];
      const secret = nouveauSecretTotp();
      const lien = lienOtpauth(u.email, secret);
      return [{ etape: 'totp-setup', qr: qrSvg(lien), cle: secret.match(/.{1,4}/g).join(' '), lien }, { 'Set-Cookie': nouveauDefi(req, u, 'totp-setup', { secret }).cookie }];
    }
    if (mode === 'pin') {
      const etape = u.pinHash ? 'pin' : 'pin-setup';
      return [{ etape }, { 'Set-Cookie': nouveauDefi(req, u, etape).cookie }];
    }
    if (mode === 'email') {
      const { d, cookie: c } = nouveauDefi(req, u, 'email');
      await envoyerCode(u, d);
      engine.journal(u.id, 'إرسال رمز الدخول بالبريد', ipDe(req));
      return [{ etape: 'email', email: masquerEmail(u.email) }, { 'Set-Cookie': c }];
    }
    throw new HttpError(400, MSG.echec, 'MODE');
  }

  const PIN_FAIBLES = new Set(['0000', '1111', '2222', '9999', '1234', '4321', '1212', '12345', '123456', '654321', '000000', '111111', '121212', '112233']);
  const pinFaible = (p) => PIN_FAIBLES.has(p) || /^(\d)\1+$/.test(p);
  const motDePasseValide = (v) => typeof v === 'string' && v.length >= 8 && v.length <= 72 && /\p{L}/u.test(v) && /\d/.test(v) && !/\s/.test(v);

  return {
    'GET /api/auth/public': async () => {
      const { state } = await engine.current();
      return { ...vuePublique(state, env.demoLogin), demoLogin: env.demoLogin, idleMinutes: env.idleMinutes, emailDisponible: emailConfigure() };
    },

    'POST /api/auth/login': async (req, body) => {
      const ip = ipDe(req);
      limiteConnexion(ip);
      const email = chaine(body.email).trim().toLowerCase().slice(0, 120);
      if (echecsCompte(email) >= 8) throw new HttpError(429, TROP, 'TROP');
      const { state } = await engine.current();
      const u = state.users.find((x) => x.email.toLowerCase() === email && x.active);
      if (!(await verifyLoginAsync(u, chaine(body.password).slice(0, 200)))) {
        limite(`echec:${email}`, 8, QUINZE_MIN);
        console.warn(`Connexion refusée : ${email || '(vide)'} depuis ${ip}`);
        if (u) {
          const n = echecsCompte(email);
          engine.journal(u.id, n >= 8 ? 'حظر مؤقت بعد محاولات فاشلة' : 'محاولة دخول فاشلة', `${ip} · ${n}/8`);
        }
        throw new HttpError(401, MSG.identifiants, 'IDENTIFIANTS');
      }
      compteurs.delete(`echec:${email}`);
      return deuxiemeEtape(req, u);
    },

    'POST /api/auth/verifier': async (req, body) => {
      const ip = ipDe(req);
      limiteConnexion(ip);
      const { id, d } = lireDefi(req);
      const { state } = await engine.current();
      const u = state.users.find((x) => x.id === d.uid && x.active);
      if (!u || passwordStamp(u.password) !== d.pv || (u.secMode || 'none') === 'none') { defis.delete(id); throw new HttpError(401, MSG.etapeExpiree, 'ETAPE'); }
      const code = chaine(body.code).replace(/\s/g, '').slice(0, 10);
      const pin = chaine(body.pin).slice(0, 10);
      let ok = false; let maj = null; let action = 'تسجيل الدخول';
      if (d.etape === 'totp') {
        const cpt = verifierTotp(u.totpSecret, code, u.totpLast ?? -1);
        if (cpt !== null) { ok = true; maj = (x) => { x.totpLast = cpt; }; action = 'تسجيل الدخول (رمز التطبيق)'; }
      } else if (d.etape === 'totp-setup') {
        const cpt = verifierTotp(d.secret, code, -1);
        if (cpt !== null) { ok = true; maj = (x) => { x.totpSecret = d.secret; x.totpLast = cpt; }; action = 'تفعيل تطبيق المصادقة'; }
      } else if (d.etape === 'pin') {
        ok = /^\d{4,6}$/.test(pin) && (await verifyPasswordAsync(pin, u.pinHash));
        action = 'تسجيل الدخول (رمز PIN)';
      } else if (d.etape === 'pin-setup') {
        if (!/^\d{4,6}$/.test(pin)) throw new HttpError(422, MSG.pinFormat, 'PIN');
        if (pinFaible(pin)) throw new HttpError(422, MSG.pinFaible, 'PIN');
        if (pin !== chaine(body.pin2)) throw new HttpError(422, MSG.pinDifferent, 'PIN');
        const pinHash = await hashPasswordAsync(pin); ok = true; maj = (x) => { x.pinHash = pinHash; }; action = 'إنشاء رمز PIN';
      } else if (d.etape === 'email') {
        ok = /^\d{6}$/.test(code) && !!d.code && crypto.timingSafeEqual(empreinte(code), d.code);
        action = 'تسجيل الدخول (رمز البريد)';
      }
      if (!ok) {
        d.essais += 1;
        limite(`echec:${u.email.toLowerCase()}`, 8, QUINZE_MIN);
        if (d.essais >= 5) {
          defis.delete(id);
          engine.journal(u.id, 'محاولات فاشلة في رمز التحقق', `${ip} · ${d.etape}`);
          throw new HttpError(429, MSG.tropEssaisCode, 'TROP');
        }
        engine.journal(u.id, 'رمز تحقق خاطئ', `${ip} · ${d.etape} · ${d.essais}/5`);
        throw new HttpError(401, d.etape.startsWith('pin') ? MSG.pinFaux : MSG.codeFaux, 'CODE');
      }
      defis.delete(id);
      compteurs.delete(`echec:${u.email.toLowerCase()}`);
      if (maj) await engine.modifierUtilisateur(u.id, maj);
      return connecter(req, u, action);
    },

    'POST /api/auth/renvoyer': async (req) => {
      limiteConnexion(ipDe(req));
      const { d } = lireDefi(req);
      if (d.etape !== 'email') throw new HttpError(400, MSG.echec, 'ETAPE');
      if (d.envois >= 3) throw new HttpError(429, MSG.tropEssaisCode, 'TROP');
      const { state } = await engine.current();
      const u = state.users.find((x) => x.id === d.uid && x.active);
      if (!u) throw new HttpError(401, MSG.etapeExpiree, 'ETAPE');
      d.essais = 0; d.exp = Date.now() + DIX_MIN;
      await envoyerCode(u, d);
      return { ok: true, email: masquerEmail(u.email) };
    },

    'POST /api/auth/mot-de-passe': async (req, body) => {
      const { me, jeton } = await sessionDe(req);
      limiteConnexion(ipDe(req));
      if (!(await verifyPasswordAsync(chaine(body.actuel).slice(0, 200), me.password))) {
        limite(`echec:${me.email.toLowerCase()}`, 8, QUINZE_MIN);
        engine.journal(me.id, 'محاولة تغيير كلمة المرور بكلمة خاطئة', ipDe(req));
        throw new HttpError(422, MSG.ancienFaux, 'MDP');
      }
      const nouveau = chaine(body.nouveau);
      if (!motDePasseValide(nouveau)) throw new HttpError(422, V.password, 'MDP');
      if (await verifyPasswordAsync(nouveau, me.password)) throw new HttpError(422, MSG.memeMdp, 'MDP');
      const nouveauHash = await hashPasswordAsync(nouveau);
      const next = await engine.modifierUtilisateur(me.id, (x) => { x.password = nouveauHash; x.passwordInitial = false; }, 'تغيير كلمة المرور', ipDe(req));
      fermer(jeton.sid, jeton.exp);
      const moi = next.users.find((x) => x.id === me.id);
      const after = await engine.current();
      return [{ version: after.version, state: vue(after.state, moi) }, { 'Set-Cookie': ouvrir(req, moi, jeton.dv) }];
    },

    'POST /api/auth/demo': async (req, body) => {
      if (!env.demoLogin) throw new HttpError(403, MSG.demoOff, 'DEMO_OFF');
      limiteConnexion(ipDe(req));
      const { state } = await engine.current();
      const u = state.users.find((x) => DEMO_IDS.includes(x.id) && x.id === body.userId && x.active);
      // jamais de contournement du mode de sécurité d'un compte
      if (!u || (u.secMode || 'none') !== 'none') throw new HttpError(401, MSG.identifiants, 'IDENTIFIANTS');
      return connecter(req, u, 'تسجيل الدخول (تجريبي)');
    },

    'POST /api/auth/logout': async (req) => {
      const jeton = readToken(lireCookie(req));
      if (jeton && !fermees.has(jeton.sid)) {
        fermer(jeton.sid, jeton.exp);
        engine.journal(jeton.uid, 'تسجيل الخروج', ipDe(req));
      }
      return [{ ok: true }, { 'Set-Cookie': cookieSession(req, '', 0) }];
    },
  };
}
