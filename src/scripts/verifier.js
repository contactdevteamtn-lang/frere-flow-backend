// Vérifie la connexion MongoDB de .env (MONGO_URI) : accès, transactions, contenu.   npm run verifier
import { env } from '../config/env.js';
import { createMongoStore } from '../db/mongo.js';
import { verifierSchemas } from '../models/schemas.js';

if (!env.mongoUri) { console.error('✘ MONGO_URI est vide dans .env'); process.exit(1); }
console.log(`Connexion à ${env.mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')} …`);
const store = createMongoStore(env.mongoUri, { retries: 1 });
try {
  await store.init();
  console.log(store.transactions ? '✔ Transactions opérationnelles' : '⚠ Pas de replica set : fonctionne, mais sans transactions (utilisez Atlas)');
  if (await store.isEmpty()) {
    console.log('ℹ Base vide : les données de démonstration seront créées au premier démarrage (npm run dev).');
  } else {
    const { state, version } = await store.load();
    console.log(`  version ${version} — ${state.users.length} utilisateurs, ${state.products.length} produits, ${state.clients.length} clients, ${state.sales.length} ventes, ${state.credits.length} crédits`);
    const problemes = verifierSchemas(state);
    if (problemes.length) { console.log('⚠ Documents à vérifier :'); problemes.forEach((p) => console.log(`  - ${p}`)); }
    else console.log('✔ Tous les documents respectent les modèles (src/models/schemas.js)');
  }
  console.log('\nTout est prêt ✔');
} catch (e) {
  console.error(`✘ Échec : ${e.message}`);
  if (/auth/i.test(e.message)) console.error('  → utilisateur ou mot de passe Atlas incorrect (Database Access).');
  if (/timed out|ENOTFOUND|Server selection|querySrv|ECONNREFUSED/i.test(e.message)) console.error('  → vérifiez Internet, « Network Access » dans Atlas (votre IP) et l’adresse MONGO_URI.');
  process.exitCode = 1;
} finally {
  await store.close();
}
