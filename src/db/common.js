// Outils partagés par les stockages (mémoire / MongoDB).

// Listes de l'état du front (AppState) enregistrées en base — une collection MongoDB par liste
export const COLLECTIONS = [
  'roles', 'users', 'teams', 'clients', 'products', 'frigos', 'stockMovements', 'saleStatuses', 'creditStatuses',
  'sales', 'saleItems', 'payments', 'credits', 'creditPayments', 'cash', 'packagingTypes', 'packagingMovements',
  'auditLogs', 'markets', 'marketTrips', 'invoices',
];

export class ConflictError extends Error {
  constructor() { super('Conflit de version'); this.name = 'ConflictError'; }
}

/** Différences entre deux états : éléments ajoutés/modifiés, supprimés, et changement d'ordre */
export function diff(prev, next) {
  const changes = [];
  for (const key of COLLECTIONS) {
    const a = prev[key] || [];
    const b = next[key] || [];
    if (a === b) continue;
    const old = new Map(a.map((x) => [x.id, x]));
    const upserts = b.filter((x) => { const o = old.get(x.id); return !o || (o !== x && JSON.stringify(o) !== JSON.stringify(x)); });
    const ids = b.map((x) => x.id);
    const kept = new Set(ids);
    const deletes = a.filter((x) => !kept.has(x.id)).map((x) => x.id);
    const orderChanged = a.length !== b.length || a.some((x, i) => x.id !== ids[i]);
    if (upserts.length || deletes.length || orderChanged) changes.push({ key, upserts, deletes, ids, orderChanged });
  }
  const scalars = prev.seq !== next.seq || JSON.stringify(prev.settings) !== JSON.stringify(next.settings);
  return { changes, scalars, empty: !changes.length && !scalars };
}

/** État sans données de session, prêt à enregistrer */
export function toStored(state) {
  const s = {};
  for (const k of COLLECTIONS) s[k] = state[k] || [];
  s.seq = state.seq || 0;
  s.settings = state.settings;
  return s;
}
