// Données : santé de l'API et état visible par l'utilisateur connecté (filtré selon ses droits).
import { vue } from '../services/engine.js';

export function stateController({ sessions }) {
  const { sessionDe } = sessions;
  return {
    'GET /api/health': async () => ({ ok: true, time: new Date().toISOString() }),

    'GET /api/state': async (req, body, url) => {
      const { state, version, me } = await sessionDe(req, { activite: req.headers['x-activite'] !== 'auto' });
      if (url.searchParams.get('since') === String(version)) return { unchanged: true, version };
      return { version, state: vue(state, me) };
    },
  };
}
