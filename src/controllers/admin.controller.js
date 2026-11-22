// Administration : appareils / réinitialisation de la sécurité d'un compte, données de démonstration.
import { env } from '../config/env.js';
import { HttpError, MSG, permissionsOf, vue } from '../services/engine.js';
import { isReadOnly } from '../domain/domain.mjs';
import { cookieSession } from '../middlewares/http.js';

export function adminController({ engine, sessions }) {
  const { ouvrir, fermer, sessionDe } = sessions;
  const adminPour = (state, me, cible) => {
    const perms = permissionsOf(state, me);
    if (!perms.has('administration') || isReadOnly(state, me)) throw new HttpError(403, MSG.interdit, 'INTERDIT');
    if (cible?.roleIds?.includes('role_super') && !me.roleIds.includes('role_super')) throw new HttpError(403, MSG.reserveDirecteur, 'DIRECTEUR');
  };

  return {
    'POST /api/admin/securite': async (req, body) => {
      const { state, me } = await sessionDe(req);
      const cible = state.users.find((x) => x.id === body.userId);
      if (!cible) throw new HttpError(404, MSG.echec, 'INTROUVABLE');
      adminPour(state, me, cible);
      const action = String(body.action || '');
      const deviceId = String(body.deviceId || '');
      const labels = { approuver: 'الموافقة على جهاز', retirer: 'إزالة جهاز', reinitialiser: 'إعادة تعيين حماية الدخول' };
      if (!labels[action]) throw new HttpError(400, MSG.echec, 'ACTION');
      if (action !== 'reinitialiser' && !(cible.devices || []).some((d) => d.id === deviceId)) throw new HttpError(404, MSG.echec, 'INTROUVABLE');
      await engine.modifierUtilisateur(cible.id, (x) => {
        if (action === 'approuver') { const d = x.devices.find((y) => y.id === deviceId); d.status = 'approved'; }
        if (action === 'retirer') x.devices = x.devices.filter((y) => y.id !== deviceId);
        if (action === 'reinitialiser') { delete x.totpSecret; delete x.totpLast; delete x.pinHash; x.devices = []; }
      }, labels[action], `${me.name} → ${cible.name}`);
      const after = await engine.current();
      return { version: after.version, state: vue(after.state, after.state.users.find((x) => x.id === me.id)) };
    },

    'POST /api/admin/reset': async (req) => {
      const { state, me, jeton } = await sessionDe(req);
      if (!permissionsOf(state, me).has('parametres')) throw new HttpError(403, MSG.interdit, 'INTERDIT');
      if (!env.allowDemoReset) throw new HttpError(403, MSG.resetOff, 'RESET_OFF');
      await engine.reset('demo');
      fermer(jeton.sid, jeton.exp);
      const after = await engine.current();
      const moi = after.state.users.find((u) => u.id === me.id && u.active);
      if (!moi) return [{ version: after.version, state: null }, { 'Set-Cookie': cookieSession(req, '', 0) }];
      return [{ version: after.version, state: vue(after.state, moi) }, { 'Set-Cookie': ouvrir(req, moi) }];
    },
  };
}
