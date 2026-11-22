// Démarrage du serveur : node src/server.js  (npm run dev / npm start)
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { env } from './config/env.js';
import { verifyPassword } from './services/auth.js';
import { demarrerSauvegardes } from './services/backup.js';
import { createApp } from './app.js';

export { createApp };

/** Comptes dont le mot de passe est encore « demo » (à changer avant la mise en service) */
async function verifierMotsDePasseDemo(app) {
  const { state } = await app.engine.current();
  const faibles = state.users.filter((u) => u.active && (u.passwordInitial || verifyPassword('demo', u.password))).map((u) => u.email);
  if (faibles.length) console.warn(`⚠ Mot de passe initial encore utilisé par : ${faibles.join(', ')} — à changer (menu « Mon compte » ou « Utilisateurs & rôles »).`);
}

/**
 * Arrêt propre (SIGTERM de Docker/systemd, Ctrl+C) : plus de nouvelles connexions, les requêtes
 * en cours se terminent (10 s max), puis fermeture de MongoDB.
 * Erreur inattendue : journalisée ; une exception non rattrapée laisse le processus dans un état
 * incertain → arrêt propre puis redémarrage par le superviseur (Docker restart / systemd / pm2).
 */
export function installerArretPropre(server, app) {
  let enCours = false;
  const arreter = (raison, code = 0) => {
    if (enCours) return;
    enCours = true;
    console.log(`Arrêt du serveur (${raison})…`);
    const force = setTimeout(() => { console.error('Arrêt forcé après 10 s'); process.exit(code || 1); }, 10000);
    force.unref();
    server.close(async () => {
      try { await app.close(); } catch (e) { console.error('Fermeture MongoDB :', e.message); }
      process.exit(code);
    });
    server.closeIdleConnections?.();
  };
  process.once('SIGTERM', () => arreter('SIGTERM'));
  process.once('SIGINT', () => arreter('SIGINT'));
  process.on('unhandledRejection', (e) => console.error('Promesse rejetée non gérée :', e));
  process.on('uncaughtException', (e) => { console.error('Exception non rattrapée :', e); arreter('exception', 1); });
}

// Lancement direct : node src/server.js
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const app = await createApp().catch((e) => { console.error('Échec du démarrage :', e.message); process.exit(1); });
  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, app.handler);
  // Délais contre les connexions lentes (Slowloris) et les sockets inactives
  server.headersTimeout = 20000;   // en-têtes complets en 20 s
  server.requestTimeout = 30000;   // requête complète (corps compris) en 30 s
  server.keepAliveTimeout = 5000;  // socket keep-alive inactive fermée après 5 s
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1000;
  installerArretPropre(server, app);
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`Le port ${env.port} est déjà utilisé : un autre serveur tourne déjà (fermez l'autre fenêtre ou lancez « taskkill /F /IM node.exe »).`);
      process.exit(1);
    }
    throw e;
  });
  if (app.store.kind !== 'mongo') console.warn('⚠ MONGO_URI vide : données en MÉMOIRE, perdues à l’arrêt du serveur. Mettez votre adresse Atlas dans .env.');
  if (env.production) await verifierMotsDePasseDemo(app);
  if (app.store.kind === 'mongo') demarrerSauvegardes(app.store);
  server.listen(env.port, () => {
    console.log(`API prête sur http://localhost:${env.port}/api  (stockage : ${app.store.kind === 'mongo' ? 'MongoDB' : 'mémoire — données perdues à l’arrêt'})`);
  });
}

