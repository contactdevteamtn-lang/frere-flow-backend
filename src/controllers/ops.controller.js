// Opérations métier (ventes, paiements, stock…) : POST /api/ops/<nom>
// Le serveur revalide et réexécute chaque opération avec les mêmes règles que le site (domain.mjs).
import { diff } from '../db/common.js';
import { vue } from '../services/engine.js';
import { TROP, ipDe, limite } from '../middlewares/http.js';
import { env } from '../config/env.js';
import { HttpError } from '../services/engine.js';

export function opsController({ engine, sessions }) {
  const { ouvrir, fermer, sessionDe } = sessions;
  return async function executer(req, body, nom) {
    const { me, jeton } = await sessionDe(req);
    // Anti-saturation par compte (en plus de la limite par adresse IP)
    if (limite(`op:${me.id}`, env.opsUserLimit, 60 * 1000)) throw new HttpError(429, TROP, 'TROP');
    const r = await engine.run(me.id, nom, body.args);
    const moiApres = r.state.users.find((u) => u.id === me.id);
    const extra = {};
    // Mot de passe changé par l'utilisateur lui-même : nouvelle session, l'ancienne est fermée
    if (moiApres && moiApres.password !== me.password) {
      fermer(jeton.sid, jeton.exp);
      extra['Set-Cookie'] = ouvrir(req, moiApres);
      engine.journal(me.id, 'تغيير كلمة المرور', ipDe(req));
    }
    const v = vue(r.state, moiApres || me);
    // Le navigateur était à jour : on renvoie seulement les listes modifiées (filtrées pour lui)
    if (body.baseVersion === r.prevVersion) {
      const d = diff(r.prev, r.state);
      const collections = {};
      for (const c of d.changes) collections[c.key] = v[c.key];
      return [{ version: r.version, seq: r.state.seq, settings: r.state.settings, collections }, extra];
    }
    return [{ version: r.version, state: v }, extra];
  };
}
