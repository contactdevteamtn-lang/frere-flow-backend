/**
 * Résilience et abus : boucle d'événements jamais bloquée, saturation, tailles, injections,
 * rafales, codes d'erreur (400/401/403/404/413/415/429/503) et arrêt propre.
 *
 *   npm test   (exécuté après test/api.test.js, stockage en mémoire)
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

process.env.JWT_SECRET = 'secret-de-test-0123456789-0123456789-0123456789';
process.env.DEMO_LOGIN = 'false';
process.env.ALLOW_DEMO_RESET = 'false';
process.env.LOGIN_IP_LIMIT = '100000';
process.env.OPS_USER_LIMIT = '100000';
process.env.SCRYPT_CONCURRENCE = '2'; // file d'attente max = 8 calculs de mot de passe simultanés

const { createApp } = await import('../src/server.js');
const { createMemoryStore } = await import('../src/db/memory.js');
const { compteurs, limite } = await import('../src/middlewares/http.js');

let server; let base; let app; let port;
const T = {};

before(async () => {
  app = await createApp({ store: createMemoryStore() });
  server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}/api`;
});
after(async () => {
  server?.close();
  await app?.close();
});

async function call(method, chemin, body, token, headers = {}) {
  const res = await fetch(base + chemin, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `ff_session=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  const cookie = /ff_session=([^;]*)/.exec(res.headers.get('set-cookie') || '')?.[1];
  return { status: res.status, body: data, cookie, headers: res.headers };
}
const connexion = async (email, password = 'Demo2026') => {
  const r = await call('POST', '/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.cookie;
};
/** Requête HTTP brute (pour envoyer ce qu'un navigateur n'enverrait jamais) */
function brut(texte) {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(texte));
    let out = '';
    s.on('data', (c) => { out += c; });
    s.on('end', () => resolve(out));
    s.on('error', reject);
    s.setTimeout(5000, () => { s.destroy(); resolve(out); });
  });
}

describe('Boucle d’événements et saturation', () => {
  it('des connexions en rafale ne bloquent pas la boucle d’événements (scrypt asynchrone)', async () => {
    const h = monitorEventLoopDelay({ resolution: 5 });
    h.enable();
    const t0 = Date.now();
    const tentatives = Array.from({ length: 8 }, (_, i) => call('POST', '/auth/login', { email: `inconnu${i}@exemple.tn`, password: 'Mauvais2026' }));
    // pendant les calculs, le serveur répond toujours vite
    const sante = Date.now();
    assert.equal((await call('GET', '/health')).status, 200);
    const latence = Date.now() - sante;
    const statuts = (await Promise.all(tentatives)).map((r) => r.status);
    h.disable();
    assert.ok(statuts.every((s) => s === 401), JSON.stringify(statuts));
    // en synchrone : 8 × ~40 ms = ~320 ms de blocage d'un seul tenant
    assert.ok(h.max / 1e6 < 150, `boucle bloquée ${Math.round(h.max / 1e6)} ms`);
    assert.ok(latence < 250, `/health a mis ${latence} ms pendant ${Date.now() - t0} ms de connexions`);
  });

  it('trop de vérifications simultanées → 503 + Retry-After (jamais 500), puis le serveur répond', async () => {
    const r = await Promise.all(Array.from({ length: 40 }, (_, i) => call('POST', '/auth/login', { email: `x${i}@exemple.tn`, password: 'Mauvais2026' })));
    const statuts = r.map((x) => x.status);
    assert.ok(statuts.includes(503), `au moins un refus « occupé » : ${statuts}`);
    assert.ok(statuts.every((s) => s === 401 || s === 503), JSON.stringify(statuts));
    assert.equal(r.find((x) => x.status === 503).headers.get('retry-after'), '5');
    assert.equal((await call('GET', '/health')).status, 200);
  });

  it('le limiteur reste borné sous une rafale (pas de croissance mémoire ni coût quadratique)', () => {
    const cle = `test:${Math.random()}`;
    const t = performance.now();
    for (let i = 0; i < 50000; i++) limite(cle, 10, 60000);
    assert.equal(compteurs.get(cle).length, 11);
    assert.ok(performance.now() - t < 1000, `${Math.round(performance.now() - t)} ms pour 50 000 appels`);
    compteurs.delete(cle);
  });

  it('rafale de 200 requêtes simultanées : toutes servies, sans dégradation', async () => {
    const t = Date.now();
    const r = await Promise.all(Array.from({ length: 200 }, () => call('GET', '/health')));
    assert.ok(r.every((x) => x.status === 200));
    assert.ok(Date.now() - t < 5000, `${Date.now() - t} ms`);
  });
});

describe('Requêtes malformées ou trop grosses', () => {
  it('taille annoncée > 1 Mo refusée sans lire le corps (413)', async () => {
    const rep = await brut(`POST /api/auth/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50000000\r\nConnection: close\r\n\r\n{`);
    assert.match(rep, /^HTTP\/1\.1 413/);
  });
  it('corps réel > 1 Mo refusé (413)', async () => {
    const r = await call('POST', '/auth/login', JSON.stringify({ email: 'a', password: 'x'.repeat(1.2 * 1024 * 1024) }));
    assert.equal(r.status, 413);
  });
  it('JSON invalide → 400 ; JSON très imbriqué → 400 (pas de plantage)', async () => {
    assert.equal((await call('POST', '/auth/login', '{"email":')).status, 400);
    const r = await call('POST', '/auth/login', `${'['.repeat(100000)}${']'.repeat(100000)}`);
    assert.ok([400, 401].includes(r.status), String(r.status));
    assert.equal((await call('GET', '/health')).status, 200);
  });
  it('adresse malformée → 400 et le processus reste en vie', async () => {
    const rep = await brut('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    assert.match(rep, /^HTTP\/1\.1 400/);
    assert.equal((await call('GET', '/health')).status, 200);
  });
  it('route inconnue → 404 ; non JSON → 415', async () => {
    assert.equal((await call('GET', '/inexistante')).status, 404);
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(r.status, 415);
  });
});

describe('Authentification et autorisation', () => {
  before(async () => {
    T.admin = await connexion('direction@frere-mahjoub.tn', 'Direction2026');
    T.employe = await connexion('riadh@frere-mahjoub.tn');
  });
  it('sans session → 401 ; connexion démo désactivée → 403', async () => {
    assert.equal((await call('GET', '/state')).status, 401);
    assert.equal((await call('POST', '/ops/addCash', { args: [] })).status, 401);
    assert.equal((await call('POST', '/auth/demo', { userId: 'u_super' })).status, 403);
  });
  it('écran de connexion anonyme : aucun utilisateur, rôle ni nom de responsable d’équipe', async () => {
    const r = await call('GET', '/auth/public');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.users, r.body.roles, r.body.teams], [[], [], []]);
    assert.doesNotMatch(JSON.stringify(r.body), /@|responsable|password|totp|pin/i);
  });
  it('employé sans le droit → 403 (rôles, utilisateurs, paramètres)', async () => {
    const r1 = await call('POST', '/ops/upsert', { args: ['roles', { name: 'Pirate', permissions: ['administration'] }] }, T.employe);
    assert.equal(r1.status, 403);
    const r2 = await call('POST', '/ops/upsert', { args: ['users', { name: 'Pirate', email: 'p@x.tn', password: 'Pirate2026', roleIds: ['role_super'] }] }, T.employe);
    assert.equal(r2.status, 403);
  });
  it('injection d’opérateurs NoSQL / tableaux dans la connexion → 400 (jamais 500, jamais accepté)', async () => {
    for (const corps of [{ email: { $ne: '' }, password: { $ne: '' } }, { email: 'admin@frere-mahjoub.tn', password: { $gt: '' } }, { email: ['admin@frere-mahjoub.tn'], password: ['Demo2026'] }]) {
      const r = await call('POST', '/auth/login', corps);
      assert.equal(r.status, 400, JSON.stringify(corps));
    }
    for (const corps of ['null', '42', '[1,2]', '"texte"']) assert.equal((await call('POST', '/auth/login', corps)).status, 400, corps);
  });
});

describe('Validation des formulaires (serveur = source de vérité)', () => {
  const client = (x) => ({ code: '', name: 'كريم التونسي', phone: '', address: '', email: '', taxId: '', active: true, ...x });
  it('cas valide accepté', async () => {
    const r = await call('POST', '/ops/upsert', { args: ['clients', client({ name: 'Client Valide' })] }, T.admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });
  it('XSS / injection refusés (422)', async () => {
    for (const name of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '=HYPERLINK("http://x")', '{"$gt":""}']) {
      const r = await call('POST', '/ops/upsert', { args: ['clients', client({ name })] }, T.admin);
      assert.equal(r.status, 422, `${name} → ${r.status}`);
    }
  });
  it('types et formats invalides, champ obligatoire manquant (422)', async () => {
    for (const x of [{ name: { $ne: 1 } }, { name: '' }, { name: 'a'.repeat(500) }, { email: 'pas-un-email' }, { phone: '12' }, { taxId: '<b>' }]) {
      const r = await call('POST', '/ops/upsert', { args: ['clients', client(x)] }, T.admin);
      assert.equal(r.status, 422, `${JSON.stringify(x).slice(0, 60)} → ${r.status}`);
    }
  });
  it('mass assignment : champs non prévus ignorés (clé PIN, appareils, mot de passe chiffré…)', async () => {
    const r = await call('POST', '/ops/upsert', { args: ['users', {
      name: 'Nouvel Employe', email: 'nouvel@frere-mahjoub.tn', password: 'Employe2026', roleIds: ['role_emp'],
      pinHash: 'scrypt$x$y', totpSecret: 'AAAA', devices: [{ id: 'd', status: 'approved' }], passwordInitial: false, estAdmin: true,
    }] }, T.admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { state } = await app.engine.current();
    const u = state.users.find((x) => x.email === 'nouvel@frere-mahjoub.tn');
    for (const k of ['pinHash', 'totpSecret', 'devices', 'estAdmin']) assert.equal(u[k], undefined, k);
    assert.match(u.password, /^scrypt\$/, 'mot de passe chiffré par le serveur');
  });
  it('trop de lignes dans une vente → refusé', async () => {
    const items = Array.from({ length: 5000 }, () => ({ productId: 'p_1', quantity: 1, unitPrice: 1 }));
    const r = await call('POST', '/ops/createSale', { args: [{ teamId: 'team_1', clientId: 'c_1', items, paid: 0 }] }, T.admin);
    assert.ok([413, 422].includes(r.status), String(r.status));
  });
});

describe('Produit + frigo dans le même formulaire (saveProduct)', () => {
  const produit = { name: 'فلفل حار', category: 'خضروات', unit: 'kg', salePrice: 3, alertThreshold: 50, active: true };
  it('produit créé et quantité entrée dans le frigo choisi, en une seule opération', async () => {
    const { state: avant } = await app.engine.current();
    const frigo = avant.frigos.find((f) => f.active);
    const r = await call('POST', '/ops/saveProduct', { args: [produit, { frigoId: frigo.id, quantity: 120 }] }, T.admin);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { state } = await app.engine.current();
    const p = state.products.find((x) => x.name === 'فلفل حار');
    assert.ok(p, 'produit créé');
    const mv = state.stockMovements.find((m) => m.productId === p.id);
    assert.deepEqual([mv.frigoId, mv.quantity, mv.movementType], [frigo.id, 120, 'ENTREE']);
  });
  it('frigo inconnu ou quantité négative → refusé (422), rien n’est créé', async () => {
    const { state: avant } = await app.engine.current();
    for (const stock of [{ frigoId: 'frigo_inconnu', quantity: 10 }, { frigoId: avant.frigos[0].id, quantity: -3 }]) {
      const r = await call('POST', '/ops/saveProduct', { args: [{ ...produit, name: 'منتج مرفوض' }, stock] }, T.admin);
      assert.equal(r.status, 422, JSON.stringify(stock));
    }
    const { state } = await app.engine.current();
    assert.equal(state.products.some((x) => x.name === 'منتج مرفوض'), false);
  });
  it('droit « produits » sans droit « stock » : produit seul accepté, avec quantité → 403', async () => {
    const role = await call('POST', '/ops/upsert', { args: ['roles', { name: 'Catalogue seul', permissions: ['produits'] }] }, T.admin);
    assert.equal(role.status, 200, JSON.stringify(role.body));
    const { state: s1 } = await app.engine.current();
    const roleId = s1.roles.find((x) => x.name === 'Catalogue seul').id;
    const u = await call('POST', '/ops/upsert', { args: ['users', { name: 'Catalogue Seul', email: 'catalogue@frere-mahjoub.tn', password: 'Catalogue2026', roleIds: [roleId] }] }, T.admin);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    const cookie = await connexion('catalogue@frere-mahjoub.tn', 'Catalogue2026');
    const frigoId = s1.frigos.find((f) => f.active).id;
    const avecStock = await call('POST', '/ops/saveProduct', { args: [{ ...produit, name: 'منتج ب' }, { frigoId, quantity: 5 }] }, cookie);
    assert.equal(avecStock.status, 403);
    const sansStock = await call('POST', '/ops/saveProduct', { args: [{ ...produit, name: 'منتج ب' }, null] }, cookie);
    assert.equal(sansStock.status, 200, JSON.stringify(sansStock.body));
  });
  it('compte du marché (sans droit « produits ») → 403', async () => {
    const cookie = await connexion('marche@frere-mahjoub.tn', 'Marche2026');
    const r = await call('POST', '/ops/saveProduct', { args: [{ ...produit, name: 'منتج ج' }, null] }, cookie);
    assert.equal(r.status, 403);
  });
});

describe('Limite globale par adresse IP', () => {
  it('au-delà de 600 requêtes/minute → 429', async () => {
    for (const k of [...compteurs.keys()]) if (k.startsWith('req:')) compteurs.delete(k);
    let dernier = 0;
    for (let i = 0; i < 620 && dernier !== 429; i += 20) {
      const r = await Promise.all(Array.from({ length: 20 }, () => call('GET', '/health')));
      dernier = r.at(-1).status;
    }
    assert.equal(dernier, 429);
    for (const k of [...compteurs.keys()]) if (k.startsWith('req:')) compteurs.delete(k);
  });
});

describe('Arrêt propre', () => {
  it('SIGTERM : requêtes terminées, base fermée, sortie code 0', async () => {
    const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const script = `
      import http from 'node:http';
      const { createApp, installerArretPropre } = await import('./src/server.js');
      const app = await createApp();
      const origClose = app.close; app.close = async () => { console.log('BASE_FERMEE'); await origClose(); };
      const srv = http.createServer(app.handler);
      installerArretPropre(srv, app);
      srv.listen(0, () => { console.log('PRET'); process.emit('SIGTERM'); });
    `;
    const enfant = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: racine, env: { ...process.env, STORE: 'memory', JWT_SECRET: process.env.JWT_SECRET, NODE_TEST_CONTEXT: '' },
    });
    let sortie = '';
    enfant.stdout.on('data', (c) => { sortie += c; });
    enfant.stderr.on('data', (c) => { sortie += c; });
    const code = await new Promise((r) => enfant.on('exit', r));
    assert.equal(code, 0, sortie);
    assert.match(sortie, /Arrêt du serveur \(SIGTERM\)/);
    assert.match(sortie, /BASE_FERMEE/);
  });
});
