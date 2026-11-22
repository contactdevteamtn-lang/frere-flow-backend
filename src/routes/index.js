// Table des routes de l'API : « MÉTHODE /chemin » → contrôleur.
// Un contrôleur par entité (controllers/<entité>.controller.js) + connexion, données, administration.
import { authController } from '../controllers/auth.controller.js';
import { adminController } from '../controllers/admin.controller.js';
import { stateController } from '../controllers/state.controller.js';
import { opsController } from '../controllers/ops.controller.js';
import { CONTROLEURS_ENTITES } from '../controllers/index.js';

const ID_URL = '([A-Za-z0-9_-]{1,64})';

export function createRoutes(ctx) {
  const executer = opsController(ctx);
  const ctxEntites = { ...ctx, executer };
  const exactes = { ...stateController(ctx), ...authController(ctx), ...adminController(ctx) };
  const motifs = [];
  const ajouter = (cle, handler) => {
    const [methode, chemin] = cle.split(' ');
    if (!chemin.includes('/:')) {
      if (exactes[cle]) throw new Error(`Route en double : ${cle}`);
      exactes[cle] = handler;
      return;
    }
    const noms = [];
    const rx = new RegExp(`^${chemin.replace(/:([A-Za-z]+)/g, (_, n) => { noms.push(n); return ID_URL; })}$`);
    motifs.push({ methode, rx, noms, handler, cle });
  };

  const controleurs = CONTROLEURS_ENTITES.map((f) => f(ctxEntites));
  const proprietaires = new Map(); // opération → contrôleur
  for (const c of controleurs) {
    for (const [cle, h] of Object.entries(c.routes)) ajouter(cle, h);
    for (const op of c.operations) {
      if (proprietaires.has(op)) throw new Error(`Opération ${op} déclarée par ${proprietaires.get(op)} et ${c.nom}`);
      proprietaires.set(op, c.nom);
    }
  }

  /** @returns la fonction (req, body, url) à exécuter, ou null */
  function trouver(method, pathname) {
    // Le site envoie toutes ses opérations ici (mêmes contrôles que les routes d'entités)
    const op = method === 'POST' && pathname.match(/^\/api\/ops\/([A-Za-z]+)$/);
    if (op) return (req, body) => executer(req, body, op[1]);
    const exacte = exactes[`${method} ${pathname}`];
    if (exacte) return exacte;
    for (const m of motifs) {
      if (m.methode !== method) continue;
      const r = m.rx.exec(pathname);
      if (r) {
        const params = Object.fromEntries(m.noms.map((n, i) => [n, r[i + 1]]));
        return (req, body, url) => m.handler(req, body, url, params);
      }
    }
    return null;
  }
  trouver.controleurs = controleurs;
  trouver.proprietaires = proprietaires;
  trouver.routes = () => [...Object.keys(exactes), ...motifs.map((m) => m.cle)];
  return trouver;
}
