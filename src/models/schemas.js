// Vérification de la forme des documents. Les modèles sont un fichier par entité (User.js, Client.js, Box.js…).
// Une collection MongoDB par entité (préfixe « ff_ », ex. ff_sales).
// Chaque document garde son « id » métier ; l'ordre des listes est conservé dans ff__order.
// Les règles de saisie (formats, longueurs, références) sont dans domain.mjs (validation.ts du site) :
// ce fichier décrit la forme des documents et sert à vérifier une base (npm run verifier).
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises

import { SCHEMAS } from './index.js';

export { SCHEMAS };

const typeDe = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Vérifie la forme des documents d'un état complet.
 * @returns liste des problèmes (vide = base cohérente), au plus `max`
 */
export function verifierSchemas(state, max = 50) {
  const problemes = [];
  for (const [coll, schema] of Object.entries(SCHEMAS)) {
    const docs = state[coll];
    if (!Array.isArray(docs)) { problemes.push(`${coll} : collection absente`); continue; }
    const ids = new Set();
    for (const doc of docs) {
      if (ids.has(doc.id)) problemes.push(`${coll}/${doc.id} : identifiant en double`);
      ids.add(doc.id);
      for (const [cle, attendu] of Object.entries(schema)) {
        const facultatif = cle.endsWith('?');
        const champ = facultatif ? cle.slice(0, -1) : cle;
        const v = doc[champ];
        if (v === undefined || v === null || v === '') { if (!facultatif && v === undefined) problemes.push(`${coll}/${doc.id} : champ « ${champ} » manquant`); continue; }
        if (Array.isArray(attendu)) { if (!attendu.includes(v)) problemes.push(`${coll}/${doc.id} : « ${champ} » = ${JSON.stringify(v)} (attendu ${attendu.join('|')})`); }
        else if (typeDe(v) !== attendu) problemes.push(`${coll}/${doc.id} : « ${champ} » devrait être ${attendu}`);
      }
      if (problemes.length >= max) return problemes;
    }
  }
  return problemes;
}
