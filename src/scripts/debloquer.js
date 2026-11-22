// Secours : débloquer un compte (téléphone perdu, PIN oublié, appareil non approuvé, mot de passe oublié)
//   npm run debloquer -- direction@frere-mahjoub.tn                 → remet « mot de passe seul » et efface PIN / clé / appareils
//   npm run debloquer -- direction@frere-mahjoub.tn NouveauMdp2026  → et change aussi le mot de passe
// À lancer sur le serveur (accès au fichier .env obligatoire) : personne ne peut le faire depuis Internet.
import { env } from '../config/env.js';
import { hashPassword } from '../services/auth.js';
import { createMongoStore } from '../db/mongo.js';

const [email, mdp] = process.argv.slice(2);
if (!email) { console.error('Usage : npm run debloquer -- email@exemple.tn [NouveauMotDePasse]'); process.exit(1); }
if (mdp && !(mdp.length >= 8 && /\p{L}/u.test(mdp) && /\d/.test(mdp) && !/\s/.test(mdp))) {
  console.error('Mot de passe trop faible : 8 caractères minimum, lettres + chiffres, sans espace (ex. Ferme2026).'); process.exit(1);
}
if (!env.mongoUri) { console.error('MONGO_URI est vide dans .env'); process.exit(1); }
const store = createMongoStore(env.mongoUri, { retries: 2 });
try {
  await store.init();
  const { state, version } = await store.load();
  const next = structuredClone(state);
  const u = next.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!u) throw new Error(`Aucun compte avec l'email ${email}`);
  u.secMode = 'none'; u.active = true;
  delete u.totpSecret; delete u.totpLast; delete u.pinHash; u.devices = [];
  if (mdp) { u.password = hashPassword(mdp); u.passwordInitial = true; }
  next.seq += 1;
  next.auditLogs.unshift({ id: `log_${next.seq.toString(36)}`, userId: u.id, action: 'إلغاء قفل الحساب من الخادم', entity: 'الأمان', entityId: u.id, details: mdp ? 'mot de passe changé' : '', date: new Date().toISOString() });
  await store.commit(state, next, version);
  console.log(`✔ Compte ${u.email} débloqué : connexion par mot de passe seul${mdp ? ' (nouveau mot de passe enregistré)' : ''}. Redémarrez le serveur.`);
} catch (e) {
  console.error('✘', e.message); process.exitCode = 1;
} finally {
  await store.close?.();
}
