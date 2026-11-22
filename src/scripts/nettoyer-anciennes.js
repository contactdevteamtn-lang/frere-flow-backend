// Nettoyage des ANCIENNES collections (sans préfixe ff_) laissées par l'ancienne version de l'application.
//   npm run nettoyer-anciennes                 → liste seulement (aucune modification)
//   npm run nettoyer-anciennes -- --exporter   → export chiffré de ces collections dans sauvegardes/ (aucune suppression)
//   npm run nettoyer-anciennes -- --oui        → export chiffré + vérification de relecture, PUIS suppression
// Les collections ff_* (données actuelles) ne sont JAMAIS touchées.
import fs from 'node:fs';
import path from 'node:path';
import { BSON, MongoClient } from 'mongodb';
import { env } from '../config/env.js';
import { chiffrer, dechiffrer } from '../services/backup.js';

const exporter = process.argv.includes('--exporter') || process.argv.includes('--oui');
const supprimer = process.argv.includes('--oui');
if (!env.mongoUri) { console.error('MONGO_URI est vide dans .env'); process.exit(1); }
if (exporter && !env.backupKey) { console.error('BACKUP_KEY est vide dans .env : export non chiffré refusé.'); process.exit(1); }

const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
try {
  await client.connect();
  const db = client.db(env.mongoDb || undefined);
  const anciennes = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('ff_') && !n.startsWith('system.'))
    .sort();
  if (!anciennes.length) { console.log('✔ Aucune ancienne collection.'); process.exit(0); }
  console.log(`Base « ${db.databaseName} » — anciennes collections :`);
  for (const n of anciennes) console.log(`  ${n.padEnd(28)} ${await db.collection(n).countDocuments()}`);
  if (!exporter) { console.log('\nAucune modification. Relancez avec --exporter (export seul) ou --oui (export puis suppression).'); process.exit(0); }

  const contenu = {};
  for (const n of anciennes) contenu[n] = await db.collection(n).find({}).toArray();
  const texte = BSON.EJSON.stringify({ format: 'frere-flow-anciennes-1', date: new Date().toISOString(), base: db.databaseName, collections: contenu }, { relaxed: false });
  const dossier = path.resolve('sauvegardes');
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const fichier = path.join(dossier, `anciennes-collections-${new Date().toISOString().replace(/[:.]/g, '-')}.json.enc`);
  fs.writeFileSync(fichier, chiffrer(texte), { mode: 0o600 });

  // Vérification : le fichier se relit et contient exactement les mêmes nombres de documents
  const relu = BSON.EJSON.parse(dechiffrer(fs.readFileSync(fichier)), { relaxed: false });
  for (const n of anciennes) {
    if (relu.collections[n]?.length !== contenu[n].length) throw new Error(`Export incomplet pour ${n} : suppression annulée`);
  }
  console.log(`\n✔ Export chiffré vérifié : ${fichier}`);
  if (!supprimer) process.exit(0);

  for (const n of anciennes) { await db.collection(n).drop(); console.log(`  supprimée : ${n}`); }
  console.log('✔ Anciennes collections supprimées. Les données actuelles (ff_*) sont intactes.');
} catch (e) {
  console.error(`✘ ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
