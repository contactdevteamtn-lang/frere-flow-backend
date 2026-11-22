// Stockage en mémoire : pour les tests et une démonstration sans base (tout est perdu à l'arrêt).
import { ConflictError, toStored } from './common.js';

export function createMemoryStore() {
  const revoked = new Map();
  let state = null;
  let version = 0;
  return {
    kind: 'memory',
    async init() {},
    async isEmpty() { return !state; },
    async load() { return { state, version }; },
    async commit(prev, next, expected) {
      if (expected !== version) throw new ConflictError();
      state = structuredClone(toStored(next));
      version += 1;
      return version;
    },
    async replace(next) {
      state = structuredClone(toStored(next));
      version += 1;
      return version;
    },
    // Sessions fermées (déconnexion) : conservées tant que ce stockage existe
    async revoquer(sid, exp) { revoked.set(sid, exp); },
    async revoquees() { const now = Date.now() / 1000; return [...revoked].filter(([, exp]) => exp > now); },
    async close() {},
  };
}
