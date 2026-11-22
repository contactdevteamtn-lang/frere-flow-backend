// Application : assemble stockage (models), règles (services), sessions (middlewares) et routes (controllers).
//
//   GET  /api/health
//   GET  /api/auth/public          écran de connexion (comptes de démonstration si activés)
//   POST /api/auth/login           { email, password }   → cookie de session + état
//                                  ou { etape } si le compte a un mode de sécurité (code, PIN, appareil)
//   POST /api/auth/verifier        { code } / { pin, pin2 } → 2e étape de la connexion
//   POST /api/auth/renvoyer        renvoie le code par email
//   POST /api/auth/mot-de-passe    { actuel, nouveau }   → changer son propre mot de passe
//   POST /api/admin/securite       { userId, action, deviceId } → appareils / réinitialisation
//   POST /api/auth/demo            { userId }            → cookie de session (si DEMO_LOGIN=true)
//   POST /api/auth/logout          ferme la session
//   GET  /api/state?since=<v>      données visibles par l'utilisateur (ou { unchanged: true })
//   POST /api/ops/<nom>            { args, baseVersion } → modifications
//   POST /api/admin/reset          données de démonstration (si ALLOW_DEMO_RESET=true)
//
// La session est un cookie HttpOnly (illisible par JavaScript), SameSite=Strict, signé,
// fermé après inactivité (IDLE_MINUTES), à la déconnexion, au changement de mot de passe.
import { env } from './config/env.js';
import { createEngine, HttpError, MSG } from './services/engine.js';
import { createMemoryStore } from './db/memory.js';
import { createSessions } from './middlewares/session.js';
import { SECURITE, appliquerCors, garde, json, lireCorps } from './middlewares/http.js';
import { createRoutes } from './routes/index.js';
import { OccupeError } from './services/auth.js';

export async function createApp({ store } = {}) {
  // Le pilote MongoDB n'est chargé que si on l'utilise (les tests tournent sans)
  const st = store || (env.store === 'mongo'
    ? (await import('./db/mongo.js')).createMongoStore(env.mongoUri)
    : createMemoryStore());
  await st.init();
  const engine = createEngine(st);
  // base neuve : données de démonstration en développement, configuration seule en production
  await engine.initIfEmpty(process.env.SEED_MODE || (env.production ? 'propre' : 'demo'));
  const sessions = createSessions(engine, st);
  await sessions.charger();
  const trouver = createRoutes({ engine, sessions, store: st });

  async function handler(req, res) {
    const cors = appliquerCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204, SECURITE); res.end(); return; }
    try {
      // dans le try : une adresse malformée ne doit jamais faire tomber le processus
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch { throw new HttpError(400, 'Adresse invalide', 'URL'); }
      sessions.nettoyer();
      garde(req, cors);
      const body = req.method === 'POST' ? await lireCorps(req) : {};
      const route = trouver(req.method, url.pathname);
      if (!route) throw new HttpError(404, 'Route inconnue', 'ROUTE');
      const out = await route(req, body, url);
      return Array.isArray(out) ? json(req, res, out[2] || 200, out[0], out[1]) : json(req, res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) return json(req, res, e.status, { message: e.message, code: e.code });
      // trop de vérifications de mot de passe en même temps : le client réessaie un peu plus tard
      if (e instanceof OccupeError) return json(req, res, 503, { message: MSG.echec, code: 'OCCUPE' }, { 'Retry-After': '5' });
      console.error(e);
      if (res.headersSent) { res.destroy(); return; }
      return json(req, res, 500, { message: MSG.echec, code: 'SERVEUR' });
    }
  }

  return { handler, engine, store: st, close: () => st.close(), sessions: { actives: sessions.actives, fermees: sessions.fermees } };
}
