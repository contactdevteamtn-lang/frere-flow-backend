// Outils communs aux contrôleurs d'entités.
// - Lecture : uniquement ce que l'utilisateur a le droit de voir (vue() : rôle, Figo, marchés).
// - Écriture : toujours par une opération métier (executer) → mêmes contrôles que le site :
//   session, permission, équipe, validation des saisies, transaction, journal.
import { HttpError, vue } from '../services/engine.js';

export const LIMITE_MAX = 500;
const INTROUVABLE = 'العنصر غير موجود';

/** Données visibles par l'utilisateur connecté */
export async function lire(ctx, req) {
  const { state, me, version } = await ctx.sessions.sessionDe(req);
  return { v: vue(state, me), me, version };
}

/** Liste avec recherche (?q=), filtres simples (?teamId=, ?active=) et pagination (?offset=, ?limit=) */
export function paginer(items, url) {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
  const teamId = url.searchParams.get('teamId');
  const active = url.searchParams.get('active');
  let out = items;
  if (teamId) out = out.filter((x) => x.teamId === teamId);
  if (active === 'true' || active === 'false') out = out.filter((x) => x.active === (active === 'true'));
  if (q) out = out.filter((x) => ['name', 'nameAlt', 'code', 'reference', 'number', 'email', 'phone', 'city']
    .some((k) => typeof x[k] === 'string' && x[k].toLowerCase().includes(q)));
  const offset = Math.max(0, Math.min(Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0, 1e6));
  const limit = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100, LIMITE_MAX));
  return { items: out.slice(offset, offset + limit), total: out.length, offset, limit };
}

export function trouverOu404(liste, id) {
  const x = liste.find((e) => e.id === id);
  if (!x) throw new HttpError(404, INTROUVABLE, 'INTROUVABLE');
  return x;
}

/** Exécute une opération métier depuis une route d'entité */
export const operer = (ctx, req, body, nom, args) => ctx.executer(req, { args, baseVersion: body?.baseVersion }, nom);

/** Données envoyées pour créer / modifier : { data: {...} } (ou directement l'objet) */
export const donnees = (body) => {
  const d = body && typeof body === 'object' && body.data && typeof body.data === 'object' ? body.data : body;
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new HttpError(400, 'données invalides', 'DONNEES');
  const { baseVersion, ...rest } = d;
  return rest;
};

/**
 * Contrôleur standard d'une entité :
 *   GET  /api/<chemin>                 liste (filtrée selon les droits)
 *   GET  /api/<chemin>/:id             détail (+ informations liées : details())
 *   POST /api/<chemin>                 créer / modifier          (si le modèle a une permission de gestion)
 *   POST /api/<chemin>/:id             modifier
 *   POST /api/<chemin>/:id/supprimer   supprimer (refusé si l'élément est utilisé)
 */
export function controleurEntite(ctx, { nom, chemin, model, liste, details, operations = [], routes = {} }) {
  const lister = liste || ((v) => v[model.collection]);
  const r = {
    [`GET /api/${chemin}`]: async (req, body, url) => { const { v } = await lire(ctx, req); return paginer(lister(v), url); },
    [`GET /api/${chemin}/:id`]: async (req, body, url, p) => {
      const { v } = await lire(ctx, req);
      const x = trouverOu404(lister(v), p.id);
      return details ? { ...x, ...details(v, x) } : x;
    },
  };
  const ops = [...operations];
  if (model.permission) {
    r[`POST /api/${chemin}`] = (req, body) => operer(ctx, req, body, 'upsert', [model.collection, donnees(body)]);
    r[`POST /api/${chemin}/:id`] = async (req, body, url, p) => {
      const { v } = await lire(ctx, req);
      trouverOu404(lister(v), p.id); // modification seulement : l'élément doit exister et être visible
      return operer(ctx, req, body, 'upsert', [model.collection, { ...donnees(body), id: p.id }]);
    };
    r[`POST /api/${chemin}/:id/supprimer`] = (req, body, url, p) => operer(ctx, req, body, 'remove', [model.collection, p.id]);
    ops.push(`upsert:${model.collection}`, `remove:${model.collection}`);
  }
  // routes spécifiques en premier (ex. /api/boxes/soldes avant /api/boxes/:id)
  return { nom, chemin, model, operations: ops, routes: { ...routes, ...r } };
}
