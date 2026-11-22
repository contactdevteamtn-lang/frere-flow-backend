// Réinitialise la base. ⚠ Efface toutes les données de l'application.
//   npm run seed            données de démonstration (celles du front)
//   npm run seed:propre     configuration seule (rôles, équipes, frigos, produits, caisses, marchés)
//                           + le compte direction@frere-mahjoub.tn (mot de passe ADMIN_PASSWORD ou « demo »)
import { env } from '../config/env.js';
import { createMongoStore } from '../db/mongo.js';
import { seedState } from '../services/engine.js';

const mode = process.argv.includes('--propre') ? 'propre' : 'demo';
if (!env.mongoUri) { console.error('MONGO_URI est vide dans .env'); process.exit(1); }
if (env.production && process.env.FORCE_SEED !== 'true') {
  console.error('Refusé en production (toutes les données seraient effacées). Ajoutez FORCE_SEED=true pour forcer.');
  process.exit(1);
}
const store = createMongoStore(env.mongoUri, { retries: 2 });
await store.init();
await store.replace(seedState(mode));
console.log(mode === 'demo' ? '✔ Données de démonstration installées (mot de passe : demo)' : `✔ Base propre installée — direction@frere-mahjoub.tn / ${process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD)' : 'demo'}`);
await store.close();
