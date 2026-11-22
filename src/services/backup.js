// Sauvegardes de la base (l'offre gratuite d'Atlas n'en fait pas).
//   npm run sauvegarde                      → sauvegardes/frere-flow-AAAAMMJJ-HHMM.json(.enc)
//   npm run restaurer -- <fichier> --oui    → ⚠ remplace toutes les données par la sauvegarde
// Avec BACKUP_KEY (32 caractères ou plus) les fichiers sont chiffrés (AES-256-GCM).
// Le serveur fait aussi une sauvegarde automatique toutes les BACKUP_HOURS heures (14 conservées).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { env } from '../config/env.js';
import { COLLECTIONS, toStored } from '../db/common.js';

const dossier = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sauvegardes');
const MAGIC = 'FFENC1';

function cle() {
  if (!env.backupKey) return null;
  if (env.backupKey.length < 32) throw new Error('BACKUP_KEY doit faire au moins 32 caractères');
  return crypto.createHash('sha256').update(env.backupKey).digest();
}

export function chiffrer(texte) {
  const k = cle();
  if (!k) return Buffer.from(texte, 'utf8');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from(MAGIC), iv, c.getAuthTag(), data]);
}

export function dechiffrer(buf) {
  if (buf.subarray(0, MAGIC.length).toString() !== MAGIC) return buf.toString('utf8');
  const k = cle();
  if (!k) throw new Error('Sauvegarde chiffrée : définissez BACKUP_KEY (la même que lors de la sauvegarde)');
  const iv = buf.subarray(6, 18);
  const tag = buf.subarray(18, 34);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(34)), d.final()]).toString('utf8');
}

export async function sauvegarder(store) {
  const { state, version } = await store.load();
  if (!state) throw new Error('Base vide : rien à sauvegarder');
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const nom = `frere-flow-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json${env.backupKey ? '.enc' : ''}`;
  const contenu = JSON.stringify({ format: 'frere-flow-1', date: d.toISOString(), version, state: toStored(state) });
  const fichier = path.join(dossier, nom);
  fs.writeFileSync(fichier, chiffrer(contenu), { mode: 0o600 });
  // ne garder que les plus récentes
  const tous = fs.readdirSync(dossier).filter((f) => f.startsWith('frere-flow-')).sort();
  for (const f of tous.slice(0, Math.max(0, tous.length - env.backupKeep))) fs.unlinkSync(path.join(dossier, f));
  return fichier;
}

export function lireSauvegarde(fichier) {
  const data = JSON.parse(dechiffrer(fs.readFileSync(fichier)));
  if (data.format !== 'frere-flow-1' || !data.state) throw new Error('Fichier de sauvegarde non reconnu');
  for (const k of COLLECTIONS) if (!Array.isArray(data.state[k])) throw new Error(`Sauvegarde incomplète : ${k}`);
  return data;
}

export function demarrerSauvegardes(store) {
  if (!env.backupHours) return;
  if (!env.backupKey) console.warn('ℹ Sauvegardes automatiques NON chiffrées : définissez BACKUP_KEY dans .env pour les chiffrer.');
  const tour = () => sauvegarder(store).then((f) => console.log(`Sauvegarde : ${path.basename(f)}`)).catch((e) => console.error('Sauvegarde échouée :', e.message));
  setTimeout(tour, 60 * 1000).unref();
  setInterval(tour, env.backupHours * 3600 * 1000).unref();
}

// Ligne de commande
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { createMongoStore } = await import('../db/mongo.js');
  if (!env.mongoUri) { console.error('MONGO_URI est vide dans .env'); process.exit(1); }
  const store = createMongoStore(env.mongoUri, { retries: 2 });
  try {
    await store.init();
    const [cmd, fichier] = process.argv.slice(2);
    if (cmd === 'restaurer') {
      if (!fichier) throw new Error('Indiquez le fichier : npm run restaurer -- sauvegardes/frere-flow-....json --oui');
      const data = lireSauvegarde(fichier);
      if (!process.argv.includes('--oui')) {
        console.log(`Sauvegarde du ${data.date} : ${data.state.sales.length} ventes, ${data.state.clients.length} clients.`);
        console.log('⚠ Toutes les données actuelles seront remplacées. Relancez avec --oui pour confirmer.');
      } else {
        await sauvegarder(store).then((f) => console.log(`Sauvegarde de sécurité avant restauration : ${path.basename(f)}`)).catch(() => {});
        await store.replace(data.state);
        console.log('✔ Données restaurées. Redémarrez le serveur (npm run dev).');
      }
    } else {
      console.log(`✔ Sauvegarde créée : ${await sauvegarder(store)}`);
    }
  } catch (e) {
    console.error(`✘ ${e.message}`);
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
