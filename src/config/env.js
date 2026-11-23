// Configuration : lit le fichier .env (sans dépendance externe) puis les variables d'environnement.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fichier = path.join(racine, '.env');
// Ordre de priorité : variables de l'hébergeur, puis .env du dossier, puis « Secret File » .env de
// l'hébergeur (Render le place dans /etc/secrets/.env). SECRETS_ENV_FILE permet un autre chemin.
const fichiersEnv = [fichier, process.env.SECRETS_ENV_FILE || '/etc/secrets/.env'];
const charges = [];
for (const f of fichiersEnv) {
  let contenu;
  try { contenu = fs.readFileSync(f, 'utf8'); } catch { continue; }
  charges.push(f);
  for (const ligne of contenu.split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || ligne.trim().startsWith('#')) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
export const fichiersEnvCharges = charges;

// Les règles de dates (échéances, rappels) utilisent le fuseau de la Tunisie, comme le front
process.env.TZ ||= 'Africa/Tunis';

const production = process.env.NODE_ENV === 'production';
const bool = (v, def) => (v === undefined || v === '' ? def : v === 'true' || v === '1');

/**
 * Clé secrète des sessions : propre à chaque installation.
 * Absente → générée une fois et enregistrée dans .env (jamais livrée dans le zip).
 */
function cleSecrete() {
  const actuelle = process.env.JWT_SECRET;
  if (actuelle && actuelle.length >= 32 && actuelle !== 'change-moi') return actuelle;
  if (process.env.NODE_TEST_CONTEXT || process.env.STORE === 'memory') return crypto.randomBytes(48).toString('base64url');
  const nouvelle = crypto.randomBytes(48).toString('base64url');
  try {
    const contenu = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : '';
    const maj = /^\s*JWT_SECRET\s*=.*$/m.test(contenu)
      ? contenu.replace(/^\s*JWT_SECRET\s*=.*$/m, `JWT_SECRET=${nouvelle}`)
      : `${contenu.trimEnd()}\nJWT_SECRET=${nouvelle}\n`;
    fs.writeFileSync(fichier, maj, { mode: 0o600 });
    try { fs.chmodSync(fichier, 0o600); } catch { /* Windows */ }
    console.log('🔑 Clé secrète des sessions générée et enregistrée dans .env (propre à cette installation).');
    process.env.JWT_SECRET = nouvelle;
  } catch {
    console.warn('⚠ Impossible d’écrire JWT_SECRET dans .env : clé temporaire (les sessions seront fermées au redémarrage).');
  }
  return nouvelle;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  production,
  // memory = sans base (tests/démo, données perdues à l'arrêt) ; mongo = MongoDB (MONGO_URI)
  store: process.env.STORE || (process.env.MONGO_URI ? 'mongo' : 'memory'),
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: cleSecrete(),
  // Durée maximale d'une session (heures) et déconnexion après inactivité (minutes)
  sessionHours: Number(process.env.SESSION_HOURS || 8),
  idleMinutes: Number(process.env.IDLE_MINUTES || 30),
  // Origines autorisées (séparées par des virgules). Vide = http://localhost:* (développement uniquement)
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Comptes et restauration de démonstration : désactivés par défaut en production
  // (boutons de démonstration retirés de l'écran de connexion : désactivés par défaut partout)
  demoLogin: bool(process.env.DEMO_LOGIN, false),
  allowDemoReset: bool(process.env.ALLOW_DEMO_RESET, false),
  // Cookie de session « Secure » (HTTPS uniquement) : automatique en production
  cookieSecure: bool(process.env.COOKIE_SECURE, production),
  // Derrière un serveur web (Caddy, Nginx…) : lire la vraie adresse IP dans X-Forwarded-For
  trustProxy: bool(process.env.TRUST_PROXY, false),
  // Site qui relaie /api vers ce serveur (ex. Render : site et API à deux adresses) : secret partagé
  // qui l'autorise à transmettre l'adresse IP réelle du visiteur (X-Real-Client-IP). 32 caractères minimum.
  proxySecret: (process.env.PROXY_SECRET || '').length >= 32 ? process.env.PROXY_SECRET : '',
  // tentatives de connexion (mot de passe + codes) par adresse IP et par 15 minutes
  loginIpLimit: Number(process.env.LOGIN_IP_LIMIT || 30),
  // Opérations (enregistrements) par compte et par minute : bloque un script qui en enverrait en rafale
  opsUserLimit: Number(process.env.OPS_USER_LIMIT || 120),
  // Sauvegarde automatique (heures, 0 = désactivée) et chiffrement des sauvegardes
  backupHours: Number(process.env.BACKUP_HOURS ?? 24),
  backupKey: process.env.BACKUP_KEY || '',
  backupKeep: Number(process.env.BACKUP_KEEP || 14),
  // Envoi d'emails (mode de connexion « code par email ») — ex. Gmail : smtp.gmail.com, 465, mot de passe d'application
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    // ssl (port 465), starttls (port 587) ou none (relais local uniquement)
    mode: process.env.SMTP_TLS || (Number(process.env.SMTP_PORT || 465) === 465 ? 'ssl' : 'starttls'),
  },
};

if (production) {
  const problemes = [];
  if (!env.jwtSecret || env.jwtSecret.length < 32) problemes.push('JWT_SECRET (32 caractères minimum)');
  if (!process.env.JWT_SECRET) console.warn('⚠ JWT_SECRET temporaire : les sessions seront fermées à chaque redémarrage (mettez une valeur fixe dans .env).');
  if (!env.corsOrigins.length) problemes.push('CORS_ORIGIN (adresse exacte du site, ex : https://gestion.frere-mahjoub.tn)');
  if (env.corsOrigins.includes('*')) problemes.push('CORS_ORIGIN ne doit pas être « * »');
  if (env.store !== 'mongo' && process.env.STORE !== 'memory') problemes.push('MONGO_URI (sinon les données seraient perdues à chaque arrêt)');
  if (problemes.length) {
    console.error(`Configuration de production incomplète : ${problemes.join(' ; ')}`);
    console.error(`  Fichiers .env lus : ${charges.length ? charges.join(', ') : 'aucun'}.`);
    console.error('  Hébergeur (Render…) : ajoutez ces variables dans le service → Environment → Environment Variables, puis « Save, rebuild, and deploy ».');
    process.exit(1);
  }
  if (process.env.PROXY_SECRET && !env.proxySecret) console.warn('⚠ PROXY_SECRET ignoré : 32 caractères minimum.');
  if (env.demoLogin) console.warn('⚠ DEMO_LOGIN=true en production : les comptes de démonstration sont accessibles sans mot de passe.');
  if (env.allowDemoReset) console.warn('⚠ ALLOW_DEMO_RESET=true en production : la base peut être remplacée par les données de démonstration.');
  if (!env.cookieSecure) console.warn('⚠ COOKIE_SECURE=false en production : utilisez HTTPS.');
}
