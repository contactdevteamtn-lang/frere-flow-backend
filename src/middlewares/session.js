// Sessions : cookie HttpOnly signé, fermeture à la déconnexion / inactivité / changement de mot de passe,
// appareils approuvés. Une session = un identifiant (sid) suivi en mémoire.
import { env } from '../config/env.js';
import { createToken, passwordStamp, readToken } from '../services/auth.js';
import { HttpError, MSG, vue } from '../services/engine.js';
import { COOKIE_DEFI, cookie, cookieSession, ipDe, lireCookie } from './http.js';

export function createSessions(engine, store) {
  // Sessions ouvertes (sid → dernière activité) et sessions fermées (sid → expiration)
  const actives = new Map();
  const fermees = new Map();
  const nettoyer = () => {
    const now = Date.now() / 1000;
    for (const [sid, exp] of fermees) if (exp < now) fermees.delete(sid);
    for (const [sid, s] of actives) if (s.exp < now) actives.delete(sid);
  };
  const ouvrir = (req, u, dv) => {
    const t = createToken(u.id, u.password, dv);
    actives.set(t.sid, { uid: u.id, vu: Date.now(), exp: t.exp });
    return cookieSession(req, t.token, env.sessionHours * 3600);
  };
  const fermer = (sid, exp) => {
    actives.delete(sid);
    if (fermees.has(sid)) return;
    fermees.set(sid, exp);
    // enregistrée en base : reste fermée même après un redémarrage du serveur
    store?.revoquer?.(sid, exp).catch((e) => console.error('Session fermée non enregistrée :', e.message));
  };
  /** Au démarrage : recharge les sessions fermées depuis la base */
  const charger = async () => { for (const [sid, exp] of (await store?.revoquees?.()) || []) fermees.set(sid, exp); };

  async function sessionDe(req, { activite = true } = {}) {
    const jeton = readToken(lireCookie(req));
    if (!jeton || fermees.has(jeton.sid)) throw new HttpError(401, MSG.session, 'SESSION');
    const { state, version, me } = await engine.userFrom(jeton.uid);
    // compte désactivé ou mot de passe changé depuis l'ouverture de la session → reconnexion
    if (!me || jeton.pv !== passwordStamp(me.password)) { fermer(jeton.sid, jeton.exp); throw new HttpError(401, MSG.session, 'SESSION'); }
    // mode « appareils approuvés » : un appareil retiré par le directeur perd sa session
    if (me.secMode === 'device' && !(me.devices || []).some((d) => d.id === jeton.dv && d.status === 'approved')) {
      fermer(jeton.sid, jeton.exp); throw new HttpError(401, MSG.appareilRetire, 'APPAREIL');
    }
    const s = actives.get(jeton.sid) || { uid: me.id, vu: Date.now(), exp: jeton.exp };
    if (Date.now() - s.vu > env.idleMinutes * 60 * 1000) {
      fermer(jeton.sid, jeton.exp);
      engine.journal(me.id, 'انتهاء الجلسة بسبب عدم النشاط', ipDe(req));
      throw new HttpError(401, MSG.inactivite, 'INACTIVITE');
    }
    // Les mises à jour automatiques (toutes les 15 s) ne comptent pas comme activité
    if (activite) s.vu = Date.now();
    actives.set(jeton.sid, s);
    return { state, version, me, jeton };
  }

  async function connecter(req, u, action, dv, cookies = []) {
    engine.journal(u.id, action, ipDe(req));
    const after = await engine.current();
    const moi = after.state.users.find((x) => x.id === u.id);
    return [{ version: after.version, state: vue(after.state, moi) }, { 'Set-Cookie': [...cookies, cookie(req, COOKIE_DEFI, '', 0), ouvrir(req, moi, dv)] }];
  }


  return { actives, fermees, nettoyer, ouvrir, fermer, charger, sessionDe, connecter };
}
