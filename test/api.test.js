/**
 * Tests de l'API réelle : serveur HTTP + opérations métier du front (src/domain) + stockage.
 *
 *   npm test               stockage en mémoire (rapide, sans base)
 *   npm run test:mongo     même suite sur un vrai MongoDB temporaire (mongodb-memory-server)
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.JWT_SECRET = 'secret-de-test-0123456789-0123456789-0123456789';
process.env.DEMO_LOGIN = 'true';
process.env.ALLOW_DEMO_RESET = 'true';
process.env.LOGIN_IP_LIMIT = '100000'; // la suite fait des centaines de connexions depuis la même adresse
process.env.OPS_USER_LIMIT = '100000'; // …et des centaines d'opérations par minute avec le même compte

const { createApp } = await import('../src/server.js');
const { env } = await import('../src/config/env.js');
const { createMemoryStore } = await import('../src/db/memory.js');
const { stockOf, V } = await import('../src/domain/domain.mjs');

let server; let base; let app; let replSet; let makeStore;
const T = {};

before(async () => {
  if (process.env.TEST_STORE === 'mongo') {
    const { createMongoStore } = await import('../src/db/mongo.js');
    let uri = process.env.TEST_MONGO_URI;
    if (!uri) {
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
      uri = replSet.getUri('frere-flow-test');
    }
    makeStore = () => createMongoStore(uri, { retries: 2, delayMs: 500 });
    const s = makeStore(); await s.init(); await s.db.dropDatabase(); await s.close();
  } else {
    const shared = createMemoryStore();
    makeStore = () => shared;
  }
  app = await createApp({ store: makeStore() });
  server = http.createServer(app.handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server?.close();
  await app?.close();
  await replSet?.stop();
});

/** Requête avec le cookie de session (comme le navigateur) ; renvoie aussi le nouveau cookie éventuel */
async function call(method, path, body, token, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `ff_session=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  const setCookie = res.headers.get('set-cookie');
  const cookie = setCookie ? (/ff_session=([^;]*)/.exec(setCookie)?.[1] ?? '') : undefined;
  if (data && typeof data === 'object' && cookie !== undefined) Object.defineProperty(data, 'cookie', { value: cookie, enumerable: false });
  return { status: res.status, body: data, cookie, setCookie, headers: res.headers };
}
const ok = async (p, status = 200) => { const r = await p; assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };
const op = (token, name, args, baseVersion) => call('POST', `/ops/${name}`, { args, baseVersion }, token);
const refuse = async (token, name, args, message) => {
  const r = await op(token, name, args);
  assert.equal(r.status, 422, `${name} aurait dû être refusé : ${JSON.stringify(args).slice(0, 160)}`);
  if (message) assert.equal(r.body.message, message);
};
const etat = async (token) => (await ok(call('GET', '/state', undefined, token))).state;

describe('Connexion', () => {
  it('santé et comptes de démonstration publics (sans emails ni mots de passe)', async () => {
    assert.equal((await ok(call('GET', '/health'))).ok, true);
    const p = await ok(call('GET', '/auth/public'));
    assert.equal(p.users.length, 6);
    assert.ok(p.users.every((u) => u.email === '' && u.password === ''));
    assert.equal(p.roles.length, 5);
    assert.equal(p.teams.length, 2);
  });
  it('refuse un mauvais mot de passe', async () => {
    const r = await call('POST', '/auth/login', { email: 'direction@frere-mahjoub.tn', password: 'faux' });
    assert.equal(r.status, 401);
    assert.equal(r.body.message, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });
  it('connecte avec le mot de passe de démonstration « demo »', async () => {
    const r = await ok(call('POST', '/auth/login', { email: 'DIRECTION@frere-mahjoub.tn', password: 'Direction2026' }));
    T.admin = r.cookie;
    assert.equal(r.token, undefined, 'aucun jeton dans la réponse (cookie HttpOnly uniquement)');
    assert.equal(r.state.sessionUserId, 'u_super');
    assert.ok(r.state.sales.length > 30, 'données de démonstration du front');
    assert.ok(!JSON.stringify(r.state).includes('scrypt$'), 'aucun mot de passe envoyé au navigateur');
    T.v = r.version;
  });
  it('connexion de démonstration (boutons de la page de connexion)', async () => {
    T.walid = (await ok(call('POST', '/auth/demo', { userId: 'u_x' }))).cookie;
    T.riadh = (await ok(call('POST', '/auth/demo', { userId: 'u_y' }))).cookie;
    env.demoLogin = false;
    assert.equal((await call('POST', '/auth/demo', { userId: 'u_x' })).status, 403);
    env.demoLogin = true;
  });
  it('données protégées par la session', async () => {
    assert.equal((await call('GET', '/state')).status, 401);
    assert.equal((await call('GET', '/state', undefined, 'jeton.faux.xx')).status, 401);
    const s = await ok(call('GET', '/state', undefined, T.admin));
    assert.equal((await ok(call('GET', `/state?since=${s.version}`, undefined, T.admin))).unchanged, true);
  });
});

describe('Ventes (mêmes règles que le front)', () => {
  let vente;
  it('crée une vente : stock, paiement, caisse, crédit et caisses', async () => {
    const s0 = await etat(T.admin);
    const avant = stockOf(s0, 'prd_1', 'frg_1');
    const { version } = await ok(call('GET', '/state', undefined, T.admin));
    const r = await ok(op(T.admin, 'createSale', [{
      clientId: 'cli_1', teamId: 'team_1', frigoId: 'frg_1',
      items: [{ productId: 'prd_1', quantity: 10, unitPrice: 1.2 }, { productId: 'prd_1', quantity: 5, unitPrice: 1.2 }],
      paid: 8, method: 'ESPECES', notes: 'test', packaging: [{ typeId: 'pkt_1', quantity: 3 }], dueDate: '2030-01-31',
    }], version));
    assert.equal(r.version, version + 1);
    assert.ok(r.collections.sales && r.collections.stockMovements && r.collections.cash && r.collections.credits && r.collections.packagingMovements);
    assert.equal(r.collections.users, undefined, 'seules les listes modifiées sont renvoyées');
    vente = r.collections.sales[0];
    assert.match(vente.number, /^FM-\d{4}-\d{4}$/);
    assert.equal(vente.totalAmount, 18);
    assert.equal(vente.remainingAmount, 10);
    assert.equal(vente.saleStatusId, 'ss_partial');
    const s1 = await etat(T.admin);
    assert.equal(stockOf(s1, 'prd_1', 'frg_1'), Math.round((avant - 15) * 1000) / 1000);
    const credit = s1.credits.find((c) => c.saleId === vente.id);
    assert.equal(credit.remainingAmount, 10);
    assert.equal(credit.dueDate, '2030-01-31');
    T.credit = credit.id;
  });
  it('refuse un stock insuffisant avec le message du front', async () => {
    const r = await op(T.admin, 'createSale', [{ clientId: 'cli_1', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: 'prd_6', quantity: 999999, unitPrice: 1 }], paid: 0, method: 'ESPECES', notes: '', packaging: [] }]);
    assert.equal(r.status, 422);
    assert.match(r.body.message, /مخزون غير كافٍ/);
  });
  it('version périmée → état complet renvoyé', async () => {
    const r = await ok(op(T.admin, 'addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 5, reference: 'R', description: 'Apport' }], -1));
    assert.ok(r.state && r.state.cash.length > 0);
  });
  it('encaissement du crédit puis annulation de la vente', async () => {
    const r = await ok(op(T.admin, 'addCreditPayment', [{ creditId: T.credit, amount: 10, method: 'CHEQUE', notes: '' }]));
    const s = r.state || await etat(T.admin);
    assert.equal(s.credits.find((c) => c.id === T.credit).creditStatusId, 'cs_paid');
    assert.equal(s.sales.find((x) => x.id === vente.id).saleStatusId, 'ss_paid');
    const trop = await op(T.admin, 'addCreditPayment', [{ creditId: T.credit, amount: 1, method: 'ESPECES', notes: '' }]);
    assert.equal(trop.status, 422);
    await ok(op(T.admin, 'cancelSale', [vente.id, 'Erreur']));
    const s2 = await etat(T.admin);
    assert.equal(s2.sales.find((x) => x.id === vente.id).saleStatusId, 'ss_cancelled');
    assert.equal(s2.cash[0].type, 'DECAISSEMENT');
    assert.equal(s2.cash[0].amount, 18);
  });
  it('opération inconnue / arguments invalides', async () => {
    assert.equal((await op(T.admin, 'pirater', [])).status, 404);
    assert.equal((await call('POST', '/ops/addCash', { args: 'x' }, T.admin)).status, 400);
  });
});

describe('Droits et équipes (Figo)', () => {
  it('un employé sans droit « caisse » ne peut pas faire de dépense', async () => {
    const r = await op(T.walid, 'addCash', [{ teamId: 'team_1', type: 'DECAISSEMENT', method: 'ESPECES', amount: 1, reference: '', description: 'x' }]);
    assert.equal(r.status, 403);
    assert.equal(r.body.message, 'ليست لديك صلاحية لهذه العملية');
  });
  it('un employé du Figo 1 ne peut pas vendre pour le Figo 2', async () => {
    const vente = (team) => op(T.walid, 'createSale', [{ clientId: 'cli_2', teamId: team, frigoId: 'frg_1', items: [{ productId: 'prd_1', quantity: 1, unitPrice: 1.2 }], paid: 1.2, method: 'ESPECES', notes: '', packaging: [] }]);
    const r = await vente('team_2');
    assert.equal(r.status, 403);
    assert.equal(r.body.message, 'هذه العملية تخص فريقاً آخر');
    await ok(vente('team_1'));
  });
  it('ni annuler une vente d’une autre équipe', async () => {
    const s = await etat(T.admin);
    const venteF2 = s.sales.find((x) => x.teamId === 'team_2' && x.saleStatusId !== 'ss_cancelled');
    assert.equal((await op(T.walid, 'cancelSale', [venteF2.id, 'x'])).status, 403);
  });
  it('administration réservée (utilisateurs, paramètres, restauration)', async () => {
    assert.equal((await op(T.walid, 'upsert', ['users', { name: 'X', email: 'x@x.tn', phone: '', password: 'demo', active: true, createdAt: '2026-01-01', roleIds: ['role_super'] }])).status, 403);
    assert.equal((await op(T.walid, 'saveSettings', [{ companyName: 'X', currency: 'TND', defaultDueDays: 1, packagingAlert: 1 }])).status, 403);
    assert.equal((await call('POST', '/admin/reset', {}, T.walid)).status, 403);
  });
});

describe('Utilisateurs et mots de passe', () => {
  it('crée un utilisateur : mot de passe chiffré, connexion possible', async () => {
    await ok(op(T.admin, 'upsert', ['users', { name: 'سامي', email: 'sami@frere-mahjoub.tn', phone: '', password: 'Secret2026', active: true, createdAt: '2026-11-15', roleIds: ['role_emp'], teamId: 'team_2' }]));
    const interne = (await app.engine.current()).state.users.find((u) => u.email === 'sami@frere-mahjoub.tn');
    assert.match(interne.password, /^scrypt\$/);
    const l = await ok(call('POST', '/auth/login', { email: 'sami@frere-mahjoub.tn', password: 'Secret2026' }));
    assert.equal(l.state.users.find((u) => u.id === interne.id).password, '');
    T.sami = interne.id;
  });
  it('modifier sans retaper le mot de passe le conserve', async () => {
    const s = await etat(T.admin);
    const u = s.users.find((x) => x.id === T.sami);
    await ok(op(T.admin, 'upsert', ['users', { ...u, phone: '20 333 444' }]));
    await ok(call('POST', '/auth/login', { email: 'sami@frere-mahjoub.tn', password: 'Secret2026' }));
    await ok(op(T.admin, 'upsert', ['users', { ...u, password: 'Nouveau2026' }]));
    assert.equal((await call('POST', '/auth/login', { email: 'sami@frere-mahjoub.tn', password: 'Secret2026' })).status, 401);
    await ok(call('POST', '/auth/login', { email: 'sami@frere-mahjoub.tn', password: 'Nouveau2026' }));
  });
  it('email en double, nouvel utilisateur sans mot de passe, désactivation de soi-même', async () => {
    const dup = await op(T.admin, 'upsert', ['users', { name: 'D', email: 'Walid@frere-mahjoub.tn', phone: '', password: 'x', active: true, createdAt: '', roleIds: ['role_emp'] }]);
    assert.equal(dup.body.message, 'البريد الإلكتروني مستخدم من قبل');
    const sansMdp = await op(T.admin, 'upsert', ['users', { name: 'D', email: 'd@x.tn', phone: '', password: '', active: true, createdAt: '', roleIds: ['role_emp'] }]);
    assert.equal(sansMdp.body.message, 'كلمة المرور مطلوبة');
    const s = await etat(T.admin);
    const moi = s.users.find((u) => u.id === 'u_super');
    assert.equal((await op(T.admin, 'upsert', ['users', { ...moi, active: false }])).body.message, 'لا يمكنك تعطيل حسابك');
  });
  it('un compte désactivé perd sa session', async () => {
    const tok = (await ok(call('POST', '/auth/login', { email: 'sami@frere-mahjoub.tn', password: 'Nouveau2026' }))).cookie;
    const s = await etat(T.admin);
    await ok(op(T.admin, 'upsert', ['users', { ...s.users.find((u) => u.id === T.sami), active: false }]));
    assert.equal((await call('GET', '/state', undefined, tok)).status, 401);
  });
  it('le rôle Directeur général garde toutes ses permissions', async () => {
    const s = await etat(T.admin);
    const role = s.roles.find((r) => r.id === 'role_super');
    await ok(op(T.admin, 'upsert', ['roles', { ...role, name: 'المدير العام', permissions: ['dashboard'] }]));
    assert.equal((await etat(T.admin)).roles.find((r) => r.id === 'role_super').permissions.length, 16);
    const emp = s.roles.find((r) => r.id === 'role_emp');
    await ok(op(T.admin, 'upsert', ['roles', { ...emp, permissions: [...emp.permissions, 'caisse'] }]));
    await ok(op(T.walid, 'addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 1, reference: '', description: 'Vente comptoir' }]));
  });
});

describe('Référentiels (formulaires produits, clients, frigos, caisses)', () => {
  it('produit : création, modification du prix (historique), suppression', async () => {
    const r = await ok(op(T.admin, 'upsert', ['products', { name: 'كوسة', category: 'خضروات', unit: 'kg', salePrice: 2.4, alertThreshold: 150, active: true }]));
    const p = (r.collections?.products || r.state.products).find((x) => x.name === 'كوسة');
    assert.match(p.reference, /^PDT-\d{3}$/, 'référence attribuée automatiquement');
    await ok(op(T.admin, 'upsert', ['products', { ...p, salePrice: 2.75 }]));
    const s = await etat(T.admin);
    assert.equal(s.products.find((x) => x.id === p.id).salePrice, 2.75);
    assert.equal(s.auditLogs[0].action, 'تعديل سعر المنتج');
    await ok(op(T.admin, 'remove', ['products', p.id]));
    assert.equal((await op(T.admin, 'remove', ['products', 'prd_1'])).status, 422, 'produit utilisé : désactiver plutôt');
  });
  it('client, frigo, type de caisse', async () => {
    await ok(op(T.admin, 'upsert', ['clients', { code: 'CL-0099', name: 'كريم', phone: '+216 20 111 222', address: 'صفاقس', email: '', taxId: '', active: true, createdAt: '2026-11-15' }]));
    await ok(op(T.admin, 'upsert', ['frigos', { name: 'غرفة التبريد 4', code: 'FR4', capacity: 5000, location: 'صفاقس', description: '', active: true }]));
    await ok(op(T.admin, 'upsert', ['packagingTypes', { name: 'صندوق أسود', color: 'أسود', hex: '#222222', description: '', totalAvailable: 100, active: true }]));
    const s = await etat(T.admin);
    assert.ok(s.clients.some((c) => c.code === 'CL-0099') && s.frigos.some((f) => f.code === 'FR4') && s.packagingTypes.some((t) => t.hex === '#222222'));
  });
  it('stock : entrée, transfert, sortie insuffisante refusée', async () => {
    await ok(op(T.admin, 'addStockMovement', [{ productId: 'prd_2', frigoId: 'frg_2', quantity: 100, movementType: 'ENTREE', reference: 'BR-T', notes: '' }]));
    await ok(op(T.admin, 'addStockMovement', [{ productId: 'prd_2', frigoId: 'frg_2', toFrigoId: 'frg_1', quantity: 40, movementType: 'TRANSFERT', reference: 'TR-T', notes: '' }]));
    assert.equal((await op(T.admin, 'addStockMovement', [{ productId: 'prd_2', frigoId: 'frg_2', quantity: 99999, movementType: 'SORTIE', reference: '', notes: '' }])).status, 422);
  });
  it('caisses : sortie puis retour limité au solde', async () => {
    await ok(op(T.admin, 'addPackMovement', [{ clientId: 'cli_3', packagingTypeId: 'pkt_2', teamId: 'team_1', type: 'SORTIE', quantity: 4, notes: '' }]));
    assert.equal((await op(T.admin, 'addPackMovement', [{ clientId: 'cli_3', packagingTypeId: 'pkt_3', teamId: 'team_2', type: 'RETOUR', quantity: 9999, notes: '' }])).status, 422);
  });
  it('paramètres (page Paramètres)', async () => {
    const r = await ok(op(T.admin, 'saveSettings', [{ companyName: 'شركة الإخوة محجوب', currency: 'TND', defaultDueDays: 45, packagingAlert: 50 }]));
    assert.equal((r.settings || r.state.settings).defaultDueDays, 45);
    assert.equal((await op(T.admin, 'saveSettings', [{ companyName: '', defaultDueDays: 1, packagingAlert: 1 }])).status, 422);
  });
});

describe('Marchés et échéances', () => {
  it('journée de marché complète : client du marché, départ, vente, clôture', async () => {
    await ok(op(T.admin, 'saveMarket', [{ name: 'سوق صفاقس', city: 'صفاقس' }]));
    await ok(op(T.admin, 'saveMarketClient', [{ marketId: 'mkt_sousse', name: 'عميل السوق', phone: '', address: '' }]));
    let s = await etat(T.admin);
    const client = s.clients.find((c) => c.marketId === 'mkt_sousse');
    const stock = stockOf(s, 'prd_4', 'frg_1');
    const tripId = `trip_${Date.now().toString(36)}`;
    await ok(op(T.admin, 'createMarketTrip', [{ id: tripId, marketId: 'mkt_sousse', teamId: 'team_1', loads: [{ productId: 'prd_4', frigoId: 'frg_1', quantity: 50 }], boxes: [{ typeId: 'pkt_1', quantity: 5 }], notes: '' }]));
    s = await etat(T.admin);
    assert.equal(stockOf(s, 'prd_4', 'frg_1'), Math.round((stock - 50) * 1000) / 1000);
    assert.equal(s.marketTrips.find((t) => t.id === tripId).status, 'OPEN', 'l’id choisi par le front est conservé');
    assert.equal((await op(T.admin, 'createMarketSale', [{ tripId, clientId: 'cli_1', items: [{ productId: 'prd_4', quantity: 1, unitPrice: 1.5 }], boxes: [], paid: 0, method: 'ESPECES', notes: '' }])).status, 422, 'client hors marché');
    await ok(op(T.admin, 'createMarketSale', [{ tripId, clientId: client.id, items: [{ productId: 'prd_4', quantity: 20, unitPrice: 1.5 }], boxes: [{ typeId: 'pkt_1', quantity: 2 }], paid: 10, method: 'ESPECES', notes: '' }]));
    await ok(op(T.admin, 'closeMarketTrip', [{ tripId, returns: [{ productId: 'prd_4', quantity: 28 }], boxesReturned: [{ typeId: 'pkt_1', quantity: 3 }], cashCounted: 10, chequesCounted: 0, notes: '' }]));
    s = await etat(T.admin);
    const trip = s.marketTrips.find((t) => t.id === tripId);
    assert.equal(trip.status, 'CLOSED');
    assert.equal(trip.closing.goodsGap, -2);
    assert.equal(stockOf(s, 'prd_4', 'frg_1'), Math.round((stock - 50 + 28) * 1000) / 1000);
    assert.equal((await op(T.admin, 'createMarketSale', [{ tripId, clientId: client.id, items: [{ productId: 'prd_4', quantity: 1, unitPrice: 1 }], boxes: [], paid: 0, method: 'ESPECES', notes: '' }])).body.message, 'يوم السوق مغلق');
  });
  it('échéance manuelle : création, rappel, paiement, modification, annulation', async () => {
    const r = await ok(op(T.admin, 'createDeadline', [{ clientId: 'cli_4', teamId: 'team_2', frigoId: 'frg_2', amount: 300, dueDate: '2031-03-31', reminderDays: 5, notes: 'ancienne dette' }]));
    const c = (r.collections?.credits || r.state.credits)[0];
    assert.equal(c.reminderDays, 5);
    await ok(op(T.admin, 'markReminder', [c.id]));
    await ok(op(T.admin, 'payDeadline', [{ creditId: c.id, amount: 100, method: 'ESPECES', notes: '' }]));
    assert.equal((await op(T.admin, 'updateDeadline', [{ creditId: c.id, dueDate: '2031-04-30', amount: 300, reminderDays: 3, notes: '', reason: '' }])).status, 422, 'motif obligatoire');
    await ok(op(T.admin, 'updateDeadline', [{ creditId: c.id, dueDate: '2031-04-30', amount: 300, reminderDays: 3, notes: '', reason: 'demande du client' }]));
    await ok(op(T.admin, 'cancelDeadline', [c.id, 'accord']));
    const fin = (await etat(T.admin)).credits.find((x) => x.id === c.id);
    assert.deepEqual([fin.dueDate, fin.remainingAmount, fin.deadlineCancelled, fin.reminderHistory.length], ['2031-04-30', 200, true, 1]);
  });
  it('crédit manuel et changement de statut', async () => {
    await ok(op(T.admin, 'addManualCredit', [{ clientId: 'cli_5', teamId: 'team_1', amount: 50, dueDate: '2031-01-01', notes: '' }]));
    const c = (await etat(T.admin)).credits[0];
    await ok(op(T.admin, 'setCreditStatus', [c.id, 'cs_cancelled']));
    assert.equal((await etat(T.admin)).credits.find((x) => x.id === c.id).creditStatusId, 'cs_cancelled');
  });
});


describe('Contrôle de chaque formulaire (exemples dans les messages)', () => {
  const C = { code: '', name: 'كريم السعيدي', phone: '', address: '', email: '', taxId: '', active: true, createdAt: '2026-11-15' };
  it('Clients : nom, téléphone, email, matricule fiscal, adresse', async () => {
    await refuse(T.admin, 'upsert', ['clients', { ...C, name: 'A' }], V.name);
    await refuse(T.admin, 'upsert', ['clients', { ...C, name: '12345' }], V.name);
    await refuse(T.admin, 'upsert', ['clients', { ...C, name: '<script>alert(1)</script>' }], V.name);
    await refuse(T.admin, 'upsert', ['clients', { ...C, name: '=HYPERLINK("http://x")' }], V.formula);
    for (const tel of ['12345', '9812345', '981234567', '18123456', '+33 6 12 34 56 78', 'abc']) await refuse(T.admin, 'upsert', ['clients', { ...C, phone: tel }], V.phone);
    for (const mail of ['ahmed', 'ahmed@', 'a@b', 'a b@x.tn']) await refuse(T.admin, 'upsert', ['clients', { ...C, email: mail }], V.email);
    for (const mf of ['123', '1234567', '12345678/A', 'ABCDEFG/A', '1234567/A/Z/000']) await refuse(T.admin, 'upsert', ['clients', { ...C, taxId: mf }], V.taxId);
    await refuse(T.admin, 'upsert', ['clients', { ...C, address: 'x'.repeat(201) }], V.address);
  });
  it('Clients : formats corrigés automatiquement et champs inconnus ignorés', async () => {
    const r = await ok(op(T.admin, 'upsert', ['clients', { ...C, phone: '0021698123456', email: ' Karim@Mail.TN ', taxId: '1234567 a a m 000', isAdmin: true }]));
    const c = (r.collections?.clients || r.state.clients)[0];
    assert.deepEqual([c.phone, c.email, c.taxId], ['+216 98 123 456', 'karim@mail.tn', '1234567/A/A/M/000']);
    assert.equal(c.isAdmin, undefined);
    assert.match(c.code, /^CL-\d{4}$/);
  });
  it('Clients : un identifiant inventé est refusé', async () => {
    await refuse(T.admin, 'upsert', ['clients', { ...C, id: 'cli_inexistant' }], V.unknown);
  });
  it('Produits : nom, référence, catégorie, prix, unité, seuil', async () => {
    const P = { reference: '', name: 'كوسة', category: 'خضروات', unit: 'kg', salePrice: 2.4, alertThreshold: 150, active: true };
    await refuse(T.admin, 'upsert', ['products', { ...P, salePrice: 0 }], V.price);
    await refuse(T.admin, 'upsert', ['products', { ...P, salePrice: -1 }], V.price);
    await refuse(T.admin, 'upsert', ['products', { ...P, salePrice: 1.2345 }], V.price);
    await refuse(T.admin, 'upsert', ['products', { ...P, salePrice: 'abc' }], V.price);
    await refuse(T.admin, 'upsert', ['products', { ...P, alertThreshold: 1.5 }], V.threshold);
    await refuse(T.admin, 'upsert', ['products', { ...P, unit: 'k g 1' }], V.unit);
    await refuse(T.admin, 'upsert', ['products', { ...P, category: 'x' }], V.category);
    // référence jamais saisie : toute valeur envoyée (invalide, en double, personnalisée) est remplacée par PDT-xxx
    const refs = [];
    for (const reference of ['pdt 001!', 'XYZ-1', 'PDT-001', '<b>']) {
      const r = await ok(op(T.admin, 'upsert', ['products', { ...P, reference, name: `منتج ${refs.length + 1}` }]));
      const ref = (r.collections?.products || r.state.products)[0].reference;
      assert.match(ref, /^PDT-\d{3}$/, reference);
      refs.push(ref);
    }
    assert.equal(new Set(refs).size, refs.length, 'jamais deux fois la même référence');
  });
  it('Frigos et types de caisses', async () => {
    const F = { name: 'غرفة التبريد 5', code: 'FR5', capacity: 9000, location: '', description: '', active: true };
    await refuse(T.admin, 'upsert', ['frigos', { ...F, capacity: 0 }], V.capacity);
    await refuse(T.admin, 'upsert', ['frigos', { ...F, capacity: 10.5 }], V.capacity);
    await refuse(T.admin, 'upsert', ['frigos', { ...F, code: 'FR 5 !' }], V.code);
    await refuse(T.admin, 'upsert', ['frigos', { ...F, code: 'fawzi' }], V.codeUsed);
    const K = { name: 'صندوق رمادي', color: 'رمادي', hex: '#777777', description: '', totalAvailable: 50, active: true };
    await refuse(T.admin, 'upsert', ['packagingTypes', { ...K, hex: 'red' }], V.hex);
    await refuse(T.admin, 'upsert', ['packagingTypes', { ...K, totalAvailable: -3 }], V.total);
    await refuse(T.admin, 'upsert', ['packagingTypes', { ...K, color: '123' }], V.color);
  });
  it('Utilisateurs et rôles', async () => {
    const U = { name: 'منير', email: 'mounir@frere-mahjoub.tn', phone: '', password: 'Mounir2026', active: true, createdAt: '2026-11-15', roleIds: ['role_emp'], teamId: 'team_1' };
    for (const pw of ['court1', 'sanschiffre', '12345678', 'avec espace1']) await refuse(T.admin, 'upsert', ['users', { ...U, password: pw }], V.password);
    await refuse(T.admin, 'upsert', ['users', { ...U, email: '' }], V.emailRequired);
    await refuse(T.admin, 'upsert', ['users', { ...U, roleIds: [] }], V.roles);
    await refuse(T.admin, 'upsert', ['users', { ...U, roleIds: ['role_pirate'] }], V.unknown);
    await refuse(T.admin, 'upsert', ['users', { ...U, teamId: 'team_9' }], V.unknown);
    await refuse(T.admin, 'upsert', ['roles', { name: 'محاسب', description: '', permissions: ['tout'] }], V.permission);
    await refuse(T.admin, 'upsert', ['roles', { name: 'م', description: '', permissions: [] }], V.roleName);
  });
  it('Ventes : quantités, prix, paiement, échéance, lignes', async () => {
    const S = { clientId: 'cli_1', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: 'prd_1', quantity: 1, unitPrice: 1.2 }], paid: 0, method: 'ESPECES', notes: '', packaging: [] };
    await refuse(T.admin, 'createSale', [{ ...S, items: [{ productId: 'prd_1', quantity: 0, unitPrice: 1 }] }], V.quantity);
    await refuse(T.admin, 'createSale', [{ ...S, items: [{ productId: 'prd_1', quantity: -5, unitPrice: 1 }] }], V.quantity);
    await refuse(T.admin, 'createSale', [{ ...S, items: [{ productId: 'prd_1', quantity: 1, unitPrice: -1 }] }], V.price);
    await refuse(T.admin, 'createSale', [{ ...S, paid: -1 }], V.paid);
    await refuse(T.admin, 'createSale', [{ ...S, method: 'BITCOIN' }], V.method);
    await refuse(T.admin, 'createSale', [{ ...S, dueDate: '2026-02-30' }], V.date);
    await refuse(T.admin, 'createSale', [{ ...S, dueDate: '2020-01-01' }], V.dueBeforeToday);
    await refuse(T.admin, 'createSale', [{ ...S, packaging: [{ typeId: 'pkt_1', quantity: 1.5 }] }], V.boxes);
    await refuse(T.admin, 'createSale', [{ ...S, clientId: 'cli_x' }], V.unknown);
    await refuse(T.admin, 'createSale', [{ ...S, items: Array.from({ length: 101 }, () => ({ productId: 'prd_1', quantity: 1, unitPrice: 1 })) }], V.rows);
    await refuse(T.admin, 'createSale', [{ ...S, notes: 'x'.repeat(501) }], V.text);
  });
  it('faille corrigée : marketTripId ne permet plus de vendre sans stock', async () => {
    const r = await op(T.admin, 'createSale', [{ clientId: 'cli_1', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: 'prd_6', quantity: 999999, unitPrice: 1 }], paid: 0, method: 'ESPECES', notes: '', packaging: [], marketTripId: 'x' }]);
    assert.equal(r.status, 422);
    assert.match(r.body.message, /مخزون غير كافٍ/);
  });
  it('Crédits, paiements, échéances', async () => {
    const c = (await etat(T.admin)).credits.find((x) => x.remainingAmount > 1 && x.creditStatusId !== 'cs_cancelled');
    await refuse(T.admin, 'addCreditPayment', [{ creditId: c.id, amount: 0, method: 'ESPECES', notes: '' }], V.amount);
    await refuse(T.admin, 'addCreditPayment', [{ creditId: c.id, amount: 1.0001, method: 'ESPECES', notes: '' }], V.amount);
    await refuse(T.admin, 'addManualCredit', [{ clientId: 'cli_1', teamId: 'team_1', amount: 10, dueDate: '31/12/2026', notes: '' }], V.date);
    await refuse(T.admin, 'createDeadline', [{ clientId: 'cli_1', teamId: 'team_1', amount: 10, dueDate: '2031-01-01', reminderDays: 400, notes: '' }], V.reminderDays);
    await refuse(T.admin, 'updateDeadline', [{ creditId: c.id, dueDate: '2031-01-01', amount: 10, reminderDays: 3, notes: '', reason: 'x'.repeat(201) }], V.shortText);
  });
  it('Caisse, stock, caisses clients, marchés, paramètres', async () => {
    await refuse(T.admin, 'addCash', [{ teamId: 'team_1', type: 'DECAISSEMENT', method: 'ESPECES', amount: 10, reference: '', description: 'ab' }], V.description);
    await refuse(T.admin, 'addCash', [{ teamId: 'team_1', type: 'VOL', method: 'ESPECES', amount: 10, reference: '', description: 'Gasoil' }], V.type);
    // référence de caisse : attribuée automatiquement (une saisie, même invalide, est ignorée)
    await refuse(T.admin, 'addStockMovement', [{ productId: 'prd_1', frigoId: 'frg_1', quantity: 0, movementType: 'ENTREE', reference: '', notes: '' }], V.quantity);
    await refuse(T.admin, 'addStockMovement', [{ productId: 'prd_1', frigoId: 'frg_1', quantity: 0, movementType: 'AJUSTEMENT', reference: '', notes: '' }], V.adjust);
    await refuse(T.admin, 'addPackMovement', [{ clientId: 'cli_1', packagingTypeId: 'pkt_1', teamId: 'team_1', type: 'SORTIE', quantity: 0, notes: '' }], V.boxes);
    await refuse(T.admin, 'saveMarket', [{ name: 'س', city: 'صفاقس' }], V.marketName);
    await refuse(T.admin, 'saveMarketClient', [{ marketId: 'mkt_sousse', name: 'عميل', phone: '123', address: '' }], V.phone);
    await refuse(T.admin, 'createMarketTrip', [{ id: '../../admin', marketId: 'mkt_sousse', teamId: 'team_1', loads: [], boxes: [], notes: '' }], V.invalid);
    await refuse(T.admin, 'saveSettings', [{ companyName: 'شركة', currency: 'EUR', defaultDueDays: 0, packagingAlert: 1 }], V.days);
    await refuse(T.admin, 'saveSettings', [{ companyName: 'شركة', currency: 'TND', defaultDueDays: 30, packagingAlert: -1 }], V.alert);
  });
});

describe('Rôles marché / consultation, séparation des marchés, caisses des clients', () => {
  let M; let C;
  before(async () => {
    M = (await ok(call('POST', '/auth/demo', { userId: 'u_m' }))).cookie;
    C = (await ok(call('POST', '/auth/demo', { userId: 'u_l' }))).cookie;
  });
  it('compte « اطلاع فقط » : voit tout, ne peut rien modifier', async () => {
    const s = await etat(C);
    assert.ok(s.sales.length > 10 && s.credits.length > 0 && s.cash.length > 0);
    for (const [name, args] of [
      ['addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 5, reference: 'X', description: 'essai' }]],
      ['addCreditPayment', [{ creditId: s.credits[0].id, amount: 1, method: 'ESPECES', notes: '' }]],
      ['upsert', ['clients', { name: 'Test Lecture', phone: '98123456', address: '', email: '', taxId: '', active: true }]],
    ]) {
      const r = await op(C, name, args);
      assert.equal(r.status, 403, name);
      assert.equal(r.body.code, 'LECTURE_SEULE');
    }
  });
  it('compte « مسؤول السوق » : reçoit seulement les données des marchés', async () => {
    const s = await etat(M);
    assert.ok(s.clients.length > 0 && s.clients.every((c) => c.marketId), 'seulement des clients de marché');
    assert.equal(s.sales.filter((x) => !x.marketTripId).length, 0);
    assert.equal(s.cash.length, 0);
    assert.ok(s.products.length > 0 && s.frigos.length > 0, 'produits et chambres froides pour charger le camion');
    assert.ok(s.users.every((u) => !u.email || u.id === 'u_m'));
  });
  it('marché : sortie, vente avec caisses du client, encaissement de la dette du marché', async () => {
    const tripId = 'trip_testmarche1';
    const s0 = await etat(T.admin);
    const pid = s0.products.find((x) => x.active && stockOf(s0, x.id, 'frg_1') >= 40).id;
    // l'expédition est créée par la direction (le rôle « marché » ne peut pas en créer : 403)
    assert.equal((await op(M, 'createMarketTrip', [{ id: 'trip_refuse0001', marketId: 'mkt_sousse', teamId: 'team_1', loads: [{ productId: pid, frigoId: 'frg_1', quantity: 1 }], boxes: [], notes: '' }])).status, 403);
    await ok(op(T.admin, 'createMarketTrip', [{ id: tripId, marketId: 'mkt_sousse', teamId: 'team_1', loads: [{ productId: pid, frigoId: 'frg_1', quantity: 40 }], boxes: [{ typeId: 'pkt_1', quantity: 10 }, { typeId: 'pkt_client', quantity: 99 }], notes: '' }]));
    let s = await etat(M);
    assert.deepEqual(s.marketTrips.find((t) => t.id === tripId).boxes, [{ typeId: 'pkt_1', quantity: 10 }], 'caisses client jamais dans le camion');
    await ok(op(M, 'createMarketSale', [{ tripId, clientId: 'mc_1', items: [{ productId: pid, quantity: 10, unitPrice: 2 }], boxes: [{ typeId: 'pkt_1', quantity: 2 }, { typeId: 'pkt_client', quantity: 4 }], paid: 5, method: 'ESPECES', notes: '' }]));
    s = await etat(M);
    const sale = s.sales.find((x) => x.marketTripId === tripId);
    const mv = s.packagingMovements.filter((m) => m.saleId === sale.id);
    assert.deepEqual(mv.map((m) => [m.packagingTypeId, m.type, m.quantity]).sort(), [['pkt_1', 'SORTIE', 2], ['pkt_client', 'RETOUR', 4]]);
    const dette = s.credits.find((c) => c.saleId === sale.id);
    assert.equal(dette.remainingAmount, 15);
    await ok(op(M, 'addCreditPayment', [{ creditId: dette.id, amount: 15, method: 'ESPECES', notes: '' }]));
    assert.equal((await etat(M)).credits.find((c) => c.id === dette.id).remainingAmount, 0);
  });
  it('marché : interdit hors des marchés (vente normale, dette normale, caisse)', async () => {
    const s = await etat(T.admin);
    const normale = s.credits.find((c) => c.remainingAmount > 0 && !c.saleId?.startsWith('x') && !s.clients.find((x) => x.id === c.clientId)?.marketId);
    assert.equal((await op(M, 'addCreditPayment', [{ creditId: normale.id, amount: 1, method: 'ESPECES', notes: '' }])).status, 403);
    assert.equal((await op(M, 'createSale', [{ clientId: s.clients[0].id, teamId: 'team_1', frigoId: 'frg_1', items: [], paid: 0, method: 'ESPECES', notes: '', packaging: [] }])).status, 403);
    assert.equal((await op(M, 'addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 5, reference: 'X', description: 'essai' }])).status, 403);
  });
  it('séparation : un client de marché ne passe pas par les ventes / dettes normales', async () => {
    const s = await etat(T.admin);
    await refuse(T.admin, 'createSale', [{ clientId: 'mc_1', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: s.products[0].id, quantity: 1, unitPrice: 1 }], paid: 1, method: 'ESPECES', notes: '', packaging: [] }], 'هذا العميل تابع لسوق: سجّل البيع من قسم الأسواق');
    await refuse(T.admin, 'addManualCredit', [{ clientId: 'mc_1', teamId: 'team_1', amount: 10, dueDate: '2030-01-01', notes: '' }], 'هذا العميل تابع لسوق: ديونه تُدار من قسم الأسواق');
  });
  it('caisses du client : reçues à la vente, rendues sans dépasser le solde, hors stock de nos caisses', async () => {
    const s0 = await etat(T.admin);
    const client = s0.clients.find((c) => !c.marketId && c.active);
    const p = s0.products.find((x) => stockOf(s0, x.id, 'frg_1') > 5);
    const nosCaissesAvant = s0.packagingMovements.filter((m) => m.packagingTypeId !== 'pkt_client' && m.clientId === client.id).length;
    await ok(op(T.admin, 'createSale', [{ clientId: client.id, teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: p.id, quantity: 1, unitPrice: 1 }], paid: 1, method: 'ESPECES', notes: '', packaging: [{ typeId: 'pkt_client', quantity: 6 }] }]));
    const s = await etat(T.admin);
    const recu = s.packagingMovements.filter((m) => m.packagingTypeId === 'pkt_client' && m.clientId === client.id && m.teamId === 'team_1');
    const du = recu.reduce((a, m) => a + (m.type === 'RETOUR' ? m.quantity : -m.quantity), 0);
    assert.ok(du >= 6);
    assert.equal(s.packagingMovements.filter((m) => m.packagingTypeId !== 'pkt_client' && m.clientId === client.id).length, nosCaissesAvant);
    const r = await op(T.admin, 'addPackMovement', [{ clientId: client.id, packagingTypeId: 'pkt_client', teamId: 'team_1', type: 'SORTIE', quantity: du + 1, notes: '' }]);
    assert.equal(r.status, 422);
    assert.equal(r.body.message, `لدينا فقط ${du} من صناديق هذا العميل لهذا الفريق`);
    await ok(op(T.admin, 'addPackMovement', [{ clientId: client.id, packagingTypeId: 'pkt_client', teamId: 'team_1', type: 'SORTIE', quantity: du, notes: 'رجعت للعميل' }]));
    // le type « caisses du client » ne peut pas être transformé en caisses de la société
    const t = s.packagingTypes.find((x) => x.id === 'pkt_client');
    await ok(op(T.admin, 'upsert', ['packagingTypes', { ...t, clientOwned: false }]));
    assert.equal((await etat(T.admin)).packagingTypes.find((x) => x.id === 'pkt_client').clientOwned, true);
  });
  it('mise à niveau d\'une ancienne base : rôles et caisses client ajoutés, une seule fois', async () => {
    const { migrer } = await import('../src/services/engine.js');
    const ancien = structuredClone(await etat(T.admin));
    ancien.roles = ancien.roles.filter((r) => !['role_marche', 'role_lecture'].includes(r.id)).map((r) => ({ ...r, permissions: r.permissions.filter((p) => p !== 'marches' && p !== 'lecture') }));
    ancien.packagingTypes = ancien.packagingTypes.filter((t) => !t.clientOwned);
    const neuf = migrer(ancien);
    assert.ok(neuf.roles.find((r) => r.id === 'role_emp').permissions.includes('marches'));
    assert.ok(neuf.roles.find((r) => r.id === 'role_super').permissions.includes('marches'));
    assert.ok(neuf.roles.some((r) => r.id === 'role_marche') && neuf.roles.some((r) => r.id === 'role_lecture'));
    assert.ok(neuf.packagingTypes.some((t) => t.clientOwned));
    assert.equal(neuf.sales.length, ancien.sales.length, 'aucune donnée perdue');
    assert.equal(migrer(neuf), null);
  });
});

/** Requête avec plusieurs cookies (session, 2e étape, appareil) ; renvoie les cookies posés */
async function appel(method, path, body, jar = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ') },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); jar[k] = v.join('='); }
  return { status: res.status, body: data, jar };
}
const sansSecrets = (s) => s.users.every((u) => !('totpSecret' in u) && !('pinHash' in u) && !('totpLast' in u) && (u.devices || []).every((d) => !('jeton' in d)));

describe('Comptes stables, mot de passe, protection du directeur', () => {
  it('3 comptes stables avec leurs mots de passe initiaux (bandeau « à changer »)', async () => {
    for (const [email, mdp, role] of [['direction@frere-mahjoub.tn', 'Direction2026', 'role_super'], ['marche@frere-mahjoub.tn', 'Marche2026', 'role_marche'], ['consultation@frere-mahjoub.tn', 'Consultation2026', 'role_lecture']]) {
      const r = await appel('POST', '/auth/login', { email, password: mdp }, {});
      assert.equal(r.status, 200, email);
      const moi = r.body.state.users.find((u) => u.id === r.body.state.sessionUserId);
      assert.ok(moi.roleIds.includes(role));
    }
    const { seedState } = await import('../src/services/engine.js');
    const propre = seedState('propre');
    assert.deepEqual(propre.users.map((u) => u.email).sort(), ['consultation@frere-mahjoub.tn', 'direction@frere-mahjoub.tn', 'marche@frere-mahjoub.tn']);
    assert.ok(propre.users.every((u) => u.passwordInitial && u.password.startsWith('scrypt$')));
  });
  it('un administrateur (non directeur) ne peut ni toucher au directeur ni aux rôles', async () => {
    await ok(op(T.admin, 'upsert', ['roles', { id: undefined, name: 'مسؤول المستخدمين', description: '', permissions: ['administration', 'dashboard'] }]));
    let s = await etat(T.admin);
    const role = s.roles.find((r) => r.name === 'مسؤول المستخدمين');
    await ok(op(T.admin, 'upsert', ['users', { name: 'كريم', email: 'karim@frere-mahjoub.tn', phone: '', password: 'Karim2026x', active: true, createdAt: '2026-11-16', roleIds: [role.id] }]));
    const K = (await appel('POST', '/auth/login', { email: 'karim@frere-mahjoub.tn', password: 'Karim2026x' }, {})).jar;
    s = (await appel('GET', '/state', undefined, K)).body.state;
    const dir = s.users.find((u) => u.id === 'u_super');
    for (const [name, args] of [
      ['upsert', ['users', { ...dir, password: 'Pirate2026x' }]],
      ['upsert', ['users', { ...dir, active: false }]],
      ['remove', ['users', 'u_super']],
      ['upsert', ['users', { name: 'Pirate', email: 'p@x.tn', phone: '', password: 'Pirate2026x', active: true, createdAt: '2026-11-16', roleIds: ['role_super'] }]],
      ['upsert', ['roles', { ...role, permissions: ['administration', 'parametres', 'caisse'] }]],
    ]) {
      const r = await appel('POST', `/ops/${name}`, { args }, K);
      assert.equal(r.status, 403, `${name} ${JSON.stringify(args).slice(0, 80)}`);
    }
    // il peut gérer un compte ordinaire
    assert.equal((await appel('POST', '/ops/upsert', { args: ['users', { name: 'هالة', email: 'hela@frere-mahjoub.tn', phone: '', password: 'Hela2026xx', active: true, createdAt: '2026-11-16', roleIds: ['role_emp'] }] }, K)).status, 200);
  });
  it('le dernier directeur général ne peut pas être retiré, et un rôle utilisé ne peut pas être supprimé', async () => {
    const s = await etat(T.admin);
    const dir = s.users.find((u) => u.id === 'u_super');
    const autre = await op(T.admin, 'upsert', ['users', { ...dir, roleIds: ['role_admin'] }]);
    assert.equal(autre.status, 422);
    assert.equal(autre.body.message, 'يجب أن يبقى مدير عام واحد نشط على الأقل');
    assert.equal((await op(T.admin, 'remove', ['roles', 'role_emp'])).status, 422);
  });
  it('changer son propre mot de passe : ancien vérifié, règles, ancienne session fermée', async () => {
    const jar = (await appel('POST', '/auth/login', { email: 'consultation@frere-mahjoub.tn', password: 'Consultation2026' }, {})).jar;
    const avant = { ...jar };
    assert.equal((await appel('POST', '/auth/mot-de-passe', { actuel: 'faux', nouveau: 'Lecture2027' }, jar)).status, 422);
    assert.equal((await appel('POST', '/auth/mot-de-passe', { actuel: 'Consultation2026', nouveau: 'court' }, jar)).status, 422);
    const r = await appel('POST', '/auth/mot-de-passe', { actuel: 'Consultation2026', nouveau: 'Lecture2027' }, jar);
    assert.equal(r.status, 200);
    assert.equal(r.body.state.users.find((u) => u.id === 'u_l').passwordInitial, false);
    assert.equal((await appel('GET', '/state', undefined, avant)).status, 401, 'ancienne session fermée');
    assert.equal((await appel('GET', '/state', undefined, r.jar)).status, 200);
    assert.equal((await appel('POST', '/auth/login', { email: 'consultation@frere-mahjoub.tn', password: 'Lecture2027' }, {})).status, 200);
  });
});

const { hotp, deBase32 } = await import('../src/services/connexion.js');
describe('Modes de sécurité de la connexion', () => {
  const codeDe = (cle, decalage = 0) => hotp(deBase32(cle.replace(/ /g, '')), Math.floor(Date.now() / 30000) + decalage);
  let n = 0;
  async function compte(secMode) {
    n += 1;
    const email = `mfa${n}@frere-mahjoub.tn`;
    await ok(op(T.admin, 'upsert', ['users', { name: `حساب ${n}`, email, phone: '', password: 'Secure2026x', active: true, createdAt: '2026-11-16', roleIds: ['role_emp'], teamId: 'team_1', secMode }]));
    const s = await etat(T.admin);
    return { email, user: s.users.find((u) => u.email === email) };
  }
  it('Authenticator : QR à scanner, code vérifié, code non réutilisable, secret jamais envoyé', async () => {
    const { email, user } = await compte('totp');
    assert.equal(user.secMode, 'totp');
    let r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal(r.body.etape, 'totp-setup');
    assert.ok(r.body.qr.startsWith('<svg') && /^[A-Z2-7 ]+$/.test(r.body.cle) && r.body.lien.startsWith('otpauth://totp/'));
    assert.equal(r.body.state, undefined, 'aucune donnée avant la 2e étape');
    assert.equal((await appel('GET', '/state', undefined, r.jar)).status, 401);
    assert.equal((await appel('POST', '/auth/verifier', { code: '000000' }, r.jar)).status, 401);
    const v = await appel('POST', '/auth/verifier', { code: codeDe(r.body.cle) }, r.jar);
    assert.equal(v.status, 200);
    assert.ok(sansSecrets(v.body.state) && sansSecrets(await etat(T.admin)));
    assert.equal((await etat(T.admin)).users.find((u) => u.email === email).secSetup, true);
    // connexion suivante : le même code (déjà utilisé) est refusé, le suivant est accepté
    r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal(r.body.etape, 'totp');
    assert.equal(r.body.qr, undefined);
    assert.equal((await appel('POST', '/auth/verifier', { code: codeDe(r.body.cle ?? 'AAAA') }, r.jar)).status, 401);
    const cle = (await app.engine.current()).state.users.find((u) => u.email === email).totpSecret;
    assert.equal((await appel('POST', '/auth/verifier', { code: hotp(deBase32(cle), Math.floor(Date.now() / 30000)) }, r.jar)).status, 401, 'code déjà utilisé');
    assert.equal((await appel('POST', '/auth/verifier', { code: hotp(deBase32(cle), Math.floor(Date.now() / 30000) + 1) }, r.jar)).status, 200);
    // téléphone perdu : le directeur réinitialise → nouveau QR à la prochaine connexion
    await ok(call('POST', '/admin/securite', { userId: user.id, action: 'reinitialiser' }, T.admin));
    assert.equal((await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {})).body.etape, 'totp-setup');
  });
  it('code PIN : création (refus des PIN faciles), vérification, blocage après 5 erreurs', async () => {
    const { email } = await compte('pin');
    let r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal(r.body.etape, 'pin-setup');
    assert.equal((await appel('POST', '/auth/verifier', { pin: '1234', pin2: '1234' }, r.jar)).status, 422);
    assert.equal((await appel('POST', '/auth/verifier', { pin: '7777', pin2: '7777' }, r.jar)).status, 422);
    assert.equal((await appel('POST', '/auth/verifier', { pin: '4827', pin2: '4828' }, r.jar)).status, 422);
    assert.equal((await appel('POST', '/auth/verifier', { pin: '4827', pin2: '4827' }, r.jar)).status, 200);
    r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal(r.body.etape, 'pin');
    for (let i = 0; i < 4; i++) assert.equal((await appel('POST', '/auth/verifier', { pin: '0001' }, r.jar)).status, 401);
    assert.equal((await appel('POST', '/auth/verifier', { pin: '0001' }, r.jar)).status, 429);
    assert.equal((await appel('POST', '/auth/verifier', { pin: '4827' }, r.jar)).status, 401, 'étape annulée après 5 erreurs');
    r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal((await appel('POST', '/auth/verifier', { pin: '4827' }, r.jar)).status, 200);
  });
  it('code par email : refusé si l\'envoi n\'est pas configuré, puis code reçu et vérifié', async () => {
    const { user } = await compte('none');
    const refus = await op(T.admin, 'upsert', ['users', { ...user, secMode: 'email' }]);
    assert.equal(refus.status, 422);
    // faux serveur SMTP local
    const net = await import('node:net');
    const recus = [];
    const smtp = net.createServer((sock) => {
      let data = false; let msg = '';
      sock.write('220 test\r\n');
      sock.on('data', (c) => {
        for (const ligne of c.toString().split('\r\n').filter((x, i, a) => i < a.length - 1 || x)) {
          if (data) { if (ligne === '.') { data = false; recus.push(msg); sock.write('250 ok\r\n'); } else msg += `${ligne}\n`; continue; }
          if (/^EHLO/.test(ligne)) sock.write('250-test\r\n250 AUTH LOGIN\r\n');
          else if (/^DATA/.test(ligne)) { data = true; msg = ''; sock.write('354 go\r\n'); }
          else if (/^QUIT/.test(ligne)) sock.end('221 bye\r\n');
          else sock.write('250 ok\r\n');
        }
      });
    });
    await new Promise((res) => smtp.listen(0, res));
    const avant = { ...env.smtp };
    Object.assign(env.smtp, { host: '127.0.0.1', port: smtp.address().port, mode: 'none', from: 'Frere Flow <noreply@frere-mahjoub.tn>', user: '', pass: '' });
    try {
      await ok(op(T.admin, 'upsert', ['users', { ...user, secMode: 'email' }]));
      const r = await appel('POST', '/auth/login', { email: user.email, password: 'Secure2026x' }, {});
      assert.equal(r.body.etape, 'email');
      assert.match(r.body.email, /^m\*+\d@frere-mahjoub\.tn$/);
      const corps = Buffer.from(recus.at(-1).split('\n\n').slice(1).join('').replace(/\s/g, ''), 'base64').toString();
      const code = corps.match(/(\d{6})/)[1];
      assert.equal((await appel('POST', '/auth/verifier', { code: code === '000000' ? '111111' : '000000' }, r.jar)).status, 401);
      assert.equal((await appel('POST', '/auth/verifier', { code }, r.jar)).status, 200);
    } finally {
      Object.assign(env.smtp, avant);
      smtp.close();
    }
  });
  it('appareils approuvés : nouvel appareil en attente, approuvé par le directeur, retiré = session fermée', async () => {
    const { email, user } = await compte('device');
    let r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {});
    assert.equal(r.status, 403);
    assert.equal(r.body.etape, 'appareil');
    const telephone = r.jar;
    assert.ok(telephone.ff_device && !telephone.ff_session);
    let s = await etat(T.admin);
    const dev = s.users.find((u) => u.id === user.id).devices;
    assert.equal(dev.length, 1); assert.equal(dev[0].status, 'pending');
    // un autre appareil (sans le cookie) reste refusé
    assert.equal((await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, {})).status, 403);
    // l'employé lui-même ne peut pas s'approuver
    assert.equal((await call('POST', '/admin/securite', { userId: user.id, action: 'approuver', deviceId: dev[0].id }, T.walid)).status, 403);
    await ok(call('POST', '/admin/securite', { userId: user.id, action: 'approuver', deviceId: dev[0].id }, T.admin));
    r = await appel('POST', '/auth/login', { email, password: 'Secure2026x' }, telephone);
    assert.equal(r.status, 200);
    assert.equal((await appel('GET', '/state', undefined, r.jar)).status, 200);
    await ok(call('POST', '/admin/securite', { userId: user.id, action: 'retirer', deviceId: dev[0].id }, T.admin));
    const apres = await appel('GET', '/state', undefined, r.jar);
    assert.equal(apres.status, 401);
    assert.equal(apres.body.code, 'APPAREIL');
    s = await etat(T.admin);
    assert.ok(sansSecrets(s));
  });
  it('limite par adresse IP : trop de tentatives → 429 (même avec un faux X-Forwarded-For)', async () => {
    const avant = env.loginIpLimit;
    env.loginIpLimit = 3;
    try {
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await call('POST', '/auth/login', { email: `x${i}@x.tn`, password: 'faux' }, undefined, { 'X-Forwarded-For': `10.0.0.${i}` })).status);
      assert.deepEqual(codes.slice(-2), [429, 429]);
    } finally { env.loginIpLimit = avant; }
  });
  it('la connexion de démonstration ne contourne jamais un mode de sécurité', async () => {
    const s = await etat(T.admin);
    const walid = s.users.find((u) => u.id === 'u_x');
    await ok(op(T.admin, 'upsert', ['users', { ...walid, secMode: 'pin' }]));
    assert.equal((await call('POST', '/auth/demo', { userId: 'u_x' })).status, 401);
    await ok(op(T.admin, 'upsert', ['users', { ...walid, secMode: 'none' }]));
  });
});

describe('Noms en français et en arabe', () => {
  it('le nom dans l\'autre langue est enregistré, contrôlé et envoyé aux collègues', async () => {
    await ok(op(T.admin, 'upsert', ['clients', { name: 'منير بن علي', nameAlt: 'Mounir Ben Ali', phone: '98123456', address: '', email: '', taxId: '', active: true }]));
    let s = await etat(T.admin);
    const c = s.clients.find((x) => x.name === 'منير بن علي');
    assert.equal(c.nameAlt, 'Mounir Ben Ali');
    // facultatif
    await ok(op(T.admin, 'upsert', ['products', { reference: 'PRD-NA1', name: 'بطاطا حلوة', nameAlt: '', category: 'خضر', unit: 'kg', salePrice: 2, alertThreshold: 10, active: true }]));
    // contrôlé comme un nom (pas de balises, 2 caractères minimum)
    await refuse(T.admin, 'upsert', ['clients', { ...c, nameAlt: '<script>' }], V.nameAlt);
    await refuse(T.admin, 'upsert', ['clients', { ...c, nameAlt: 'x' }], V.nameAlt);
    // marchés et clients des marchés
    await ok(op(T.admin, 'saveMarket', [{ name: 'سوق نابل', nameAlt: 'Marché de Nabeul', city: 'نابل' }]));
    s = await etat(T.admin);
    assert.equal(s.markets.find((m) => m.name === 'سوق نابل').nameAlt, 'Marché de Nabeul');
    // un employé voit le nom français de ses collègues
    const walid = s.users.find((u) => u.id === 'u_x');
    await ok(op(T.admin, 'upsert', ['users', { ...walid, nameAlt: 'Walid Kammoun' }]));
    const vueWalid = await etat(T.riadh ?? T.walid);
    assert.equal(vueWalid.users.find((u) => u.id === 'u_x').nameAlt, 'Walid Kammoun');
  });
});

describe('Modèles de données', () => {
  it('les données de démonstration et après opérations respectent les schémas', async () => {
    const { verifierSchemas } = await import('../src/models/schemas.js');
    const { seedState } = await import('../src/services/engine.js');
    assert.deepEqual(verifierSchemas(seedState('demo')), []);
    assert.deepEqual(verifierSchemas(seedState('propre')), []);
    assert.deepEqual(verifierSchemas((await app.engine.current()).state), []);
  });
});

describe('Sécurité', () => {
  it('en-têtes de sécurité', async () => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
  });
  it('requêtes non JSON refusées (415)', async () => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a&password=b' });
    assert.equal(r.status, 415);
  });
  it('pollution de prototype (__proto__) sans effet', async () => {
    const corps = '{"args":["clients",{"name":"كريم","__proto__":{"pirate":1},"constructor":{"prototype":{"pirate":2}}}]}';
    const r = await fetch(`${base}/ops/upsert`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `ff_session=${T.admin}` }, body: corps });
    assert.equal(r.status, 200);
    assert.equal(({}).pirate, undefined);
    const c = (await etat(T.admin)).clients[0];
    assert.equal(Object.keys(c).includes('__proto__') || Object.keys(c).includes('constructor'), false);
  });
  it('jeton falsifié refusé', async () => {
    const [h, , sig] = T.admin.split('.');
    const faux = Buffer.from(JSON.stringify({ uid: 'u_super', exp: 9999999999 })).toString('base64url');
    assert.equal((await call('GET', '/state', undefined, `${h}.${faux}.${sig}`)).status, 401);
  });
  it('changer son mot de passe : nouvelle session, les anciennes sont fermées', async () => {
    const autre = (await ok(call('POST', '/auth/login', { email: 'riadh@frere-mahjoub.tn', password: 'Demo2026' }))).cookie;
    const s = await etat(T.admin);
    const riadh = s.users.find((u) => u.id === 'u_y');
    const r0 = await op(T.admin, 'upsert', ['users', { ...riadh, password: 'Riadh2026x' }]);
    assert.equal(r0.status, 200);
    assert.equal(r0.cookie, undefined, 'pas de nouvelle session pour l’administrateur');
    assert.equal((await call('GET', '/state', undefined, autre)).status, 401, 'session de Riadh fermée');
    const moi = s.users.find((u) => u.id === 'u_super');
    const r2 = await op(T.admin, 'upsert', ['users', { ...moi, password: 'Direction2026' }]);
    assert.ok(r2.cookie, 'nouvelle session pour soi-même');
    assert.equal((await call('GET', '/state', undefined, T.admin)).status, 401, 'ancien jeton fermé');
    T.admin = r2.cookie;
    await ok(call('GET', '/state', undefined, T.admin));
  });
  it('cookie de session HttpOnly, SameSite=Strict, limité à /api ; jeton « Bearer » ignoré', async () => {
    const r = await call('POST', '/auth/login', { email: 'riadh@frere-mahjoub.tn', password: 'Riadh2026x' });
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /HttpOnly/);
    assert.match(r.setCookie, /SameSite=Strict/);
    assert.match(r.setCookie, /Path=\/api/);
    assert.equal(JSON.stringify(r.body).includes(r.cookie), false, 'le jeton n’apparaît jamais dans le corps');
    const bearer = await fetch(`${base}/state`, { headers: { Authorization: `Bearer ${r.cookie}` } });
    assert.equal(bearer.status, 401);
    T.riadh = r.cookie;
  });
  it('déconnexion : la session est fermée côté serveur', async () => {
    const r = await call('POST', '/auth/login', { email: 'riadh@frere-mahjoub.tn', password: 'Riadh2026x' });
    const out = await call('POST', '/auth/logout', {}, r.cookie);
    assert.equal(out.status, 200);
    assert.equal(out.cookie, '', 'cookie effacé');
    assert.equal((await call('GET', '/state', undefined, r.cookie)).status, 401, 'cookie réutilisé après déconnexion refusé');
  });
  it('déconnexion automatique après inactivité ; les mises à jour automatiques ne prolongent pas la session', async () => {
    const r = await call('POST', '/auth/login', { email: 'riadh@frere-mahjoub.tn', password: 'Riadh2026x' });
    const sid = JSON.parse(Buffer.from(r.cookie.split('.')[1], 'base64url').toString()).sid;
    const s = app.sessions.actives.get(sid);
    s.vu = Date.now() - 20 * 60 * 1000;
    await ok(call('GET', '/state', undefined, r.cookie, { 'X-Activite': 'auto' }));
    assert.ok(Date.now() - app.sessions.actives.get(sid).vu > 19 * 60 * 1000, 'mise à jour automatique sans effet sur l’inactivité');
    app.sessions.actives.get(sid).vu = Date.now() - (env.idleMinutes + 1) * 60 * 1000;
    const exp = await call('GET', '/state', undefined, r.cookie);
    assert.equal(exp.status, 401);
    assert.equal(exp.body.code, 'INACTIVITE');
  });
  it('anti-CSRF : requête venant d’un autre site refusée', async () => {
    const r = await call('POST', '/ops/addCash', { args: [{ teamId: 'team_1', type: 'DECAISSEMENT', method: 'ESPECES', amount: 1, reference: '', description: 'Vol par CSRF' }] }, T.admin, { Origin: 'https://site-pirate.example' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'ORIGINE');
  });
  it('trop d’échecs de connexion sur un compte → blocage temporaire (429)', async () => {
    for (let i = 0; i < 8; i++) await call('POST', '/auth/login', { email: 'walid@frere-mahjoub.tn', password: `faux${i}` });
    const r = await call('POST', '/auth/login', { email: 'walid@frere-mahjoub.tn', password: 'Demo2026' });
    assert.equal(r.status, 429);
  });
});

describe('Confidentialité : chacun ne reçoit que ce qu’il a le droit de voir', () => {
  it('employé du Figo 1 : seulement les ventes, crédits, paiements, caisse, caisses et marchés du Figo 1', async () => {
    const s = await etat(T.walid);
    for (const k of ['sales', 'payments', 'credits', 'creditPayments', 'cash', 'packagingMovements', 'marketTrips']) {
      assert.ok(s[k].every((x) => x.teamId === 'team_1'), `${k} contient des données du Figo 2`);
    }
    const ventes = new Set(s.sales.map((x) => x.id));
    assert.ok(s.saleItems.every((i) => ventes.has(i.saleId)));
    const tout = (await app.engine.current()).state;
    assert.ok(tout.sales.some((x) => x.teamId === 'team_2'), 'le Figo 2 a bien des ventes (non envoyées à Walid)');
    assert.equal(s.stockMovements.length, tout.stockMovements.length, 'le stock reste commun');
  });
  it('sans « administration » : pas d’email ni de téléphone des autres utilisateurs', async () => {
    const s = await etat(T.walid);
    const autres = s.users.filter((u) => u.id !== 'u_x');
    assert.ok(autres.length > 0 && autres.every((u) => u.email === '' && u.phone === '' && u.roleIds.length === 0));
    assert.ok(s.users.find((u) => u.id === 'u_x').email, 'son propre profil reste complet');
  });
  it('sans « historique » : pas de journal de sécurité ni d’historique d’autres éléments', async () => {
    const s = await etat(T.walid);
    assert.ok(!s.auditLogs.some((l) => l.entity === 'الأمان'));
    const visibles = new Set([...s.sales, ...s.credits, ...s.clients, ...s.marketTrips].map((x) => x.id));
    assert.ok(s.auditLogs.every((l) => visibles.has(l.entityId)));
  });
  it('réponse d’une opération également filtrée', async () => {
    const r = await ok(op(T.walid, 'createSale', [{ clientId: 'cli_2', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: 'prd_1', quantity: 1, unitPrice: 1.2 }], paid: 1.2, method: 'ESPECES', notes: '', packaging: [] }], -1));
    assert.ok(r.state.sales.every((x) => x.teamId === 'team_1') && r.state.cash.every((x) => x.teamId === 'team_1'));
  });
  it('le directeur voit tout, y compris le journal de sécurité (connexions, échecs, blocage)', async () => {
    const s = await etat(T.admin);
    const actions = s.auditLogs.filter((l) => l.entity === 'الأمان').map((l) => l.action);
    for (const a of ['تسجيل الدخول', 'تسجيل الخروج', 'محاولة دخول فاشلة', 'حظر مؤقت بعد محاولات فاشلة', 'تغيير كلمة المرور', 'انتهاء الجلسة بسبب عدم النشاط']) {
      assert.ok(actions.includes(a), `journal : ${a}`);
    }
    assert.ok(s.sales.some((x) => x.teamId === 'team_2'));
  });
});

describe('Configuration de production et sauvegardes', () => {
  it('le serveur refuse de démarrer en production sans configuration sûre', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['src/server.js'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '', CORS_ORIGIN: '', STORE: 'memory', NODE_TEST_CONTEXT: '' }, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CORS_ORIGIN/);
    // sans MONGO_URI : refus (les données seraient perdues à chaque arrêt)
    const r2 = spawnSync(process.execPath, ['src/server.js'], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), CORS_ORIGIN: 'https://gestion.exemple.tn', STORE: '', MONGO_URI: '', NODE_TEST_CONTEXT: '' }, encoding: 'utf8', timeout: 15000 });
    assert.equal(r2.status, 1);
    assert.match(r2.stderr, /MONGO_URI/);
  });
  it('démonstration désactivée par défaut en production', async () => {
    const { spawnSync } = await import('node:child_process');
    const code = "import('./src/config/env.js').then(({env})=>console.log(JSON.stringify([env.demoLogin, env.allowDemoReset, env.cookieSecure])))";
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), CORS_ORIGIN: 'https://gestion.exemple.tn', STORE: 'memory', DEMO_LOGIN: '', ALLOW_DEMO_RESET: '', COOKIE_SECURE: '' }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(r.stdout.trim()), [false, false, true]);
  });
  it('sauvegarde chiffrée : relue avec la bonne clé, refusée avec une autre ou si modifiée', async () => {
    env.backupKey = 'cle-de-sauvegarde-tres-longue-0123456789';
    const { chiffrer, dechiffrer } = await import('../src/services/backup.js');
    const texte = JSON.stringify({ secret: 'données clients' });
    const enc = chiffrer(texte);
    assert.equal(enc.includes(Buffer.from('données')), false, 'contenu illisible');
    assert.equal(dechiffrer(enc), texte);
    const altere = Buffer.from(enc); altere[altere.length - 1] ^= 1;
    assert.throws(() => dechiffrer(altere));
    env.backupKey = 'une-autre-cle-tout-aussi-longue-9876543210';
    assert.throws(() => dechiffrer(enc));
    env.backupKey = '';
  });
});

describe('Modèles et contrôleurs par entité (API REST)', () => {
  const L = {};
  before(async () => {
    L.dir = (await ok(call('POST', '/auth/login', { email: 'direction@frere-mahjoub.tn', password: 'Direction2026' }))).cookie;
    L.lecture = (await ok(call('POST', '/auth/login', { email: 'consultation@frere-mahjoub.tn', password: 'Lecture2027' }))).cookie;
    L.riadh = (await ok(call('POST', '/auth/login', { email: 'riadh@frere-mahjoub.tn', password: 'Riadh2026x' }))).cookie;
  });
  const get = (path, tok = L.dir) => call('GET', path, undefined, tok);
  const post = (path, body, tok = L.dir) => call('POST', path, body, tok);

  it('un modèle par collection et un contrôleur pour chaque opération (aucune oubliée, aucune en double)', async () => {
    const { MODELS } = await import('../src/models/index.js');
    const { COLLECTIONS } = await import('../src/db/common.js');
    const { CONTROLEURS_ENTITES } = await import('../src/controllers/index.js');
    const { OPS } = await import('../src/domain/domain.mjs');
    assert.deepEqual(MODELS.map((m) => m.collection).sort(), [...COLLECTIONS].sort());
    for (const nom of ['User', 'Client', 'Box', 'BoxMovement', 'Product', 'Sale', 'Credit', 'Market', 'MarketTrip']) assert.ok(MODELS.some((m) => m.name === nom), nom);
    const ctls = CONTROLEURS_ENTITES.map((f) => f({ sessions: {}, executer: () => {} }));
    const ops = ctls.flatMap((c) => c.operations);
    assert.equal(new Set(ops).size, ops.length, 'opération déclarée deux fois');
    for (const op of [...Object.keys(OPS).filter((o) => o !== 'upsert' && o !== 'remove'), 'saveSettings']) assert.ok(ops.includes(op), `opération sans contrôleur : ${op}`);
    for (const m of MODELS.filter((x) => x.permission)) assert.ok(ops.includes(`upsert:${m.collection}`) && ops.includes(`remove:${m.collection}`), m.name);
    assert.ok(ctls.length >= 15);
  });

  it('lecture protégée par la session ; identifiant inconnu → 404', async () => {
    assert.equal((await call('GET', '/products')).status, 401);
    assert.equal((await get('/products/inconnu_123')).status, 404);
    assert.equal((await get('/products/..%2F..%2Fetc')).status, 404);
    assert.equal((await post('/products/inconnu_123', { data: { salePrice: 1 } })).status, 404, 'modifier un élément inexistant');
  });

  it('produits : créer, chercher, modifier, détail du stock, supprimer', async () => {
    const r = await ok(post('/products', { data: { reference: 'PDT-REST', name: 'فلفل', category: 'خضروات', unit: 'kg', salePrice: 3.2, alertThreshold: 50, active: true } }));
    const p = (r.collections?.products || r.state.products).find((x) => x.name === 'فلفل');
    assert.ok(p);
    assert.match(p.reference, /^PDT-\d{3}$/, 'référence envoyée ignorée, attribuée automatiquement');
    assert.equal((await ok(get(`/products?q=${p.reference.toLowerCase()}`))).total, 1);
    await ok(post(`/products/${p.id}`, { data: { ...p, salePrice: 3.5 } }));
    const d = await ok(get(`/products/${p.id}`));
    assert.equal(d.salePrice, 3.5);
    assert.ok(Array.isArray(d.stockParFrigo) && d.stockTotal === 0);
    await ok(post(`/products/${p.id}`, { data: { ...p, reference: 'CHANGEE' } }));
    assert.equal((await ok(get(`/products/${p.id}`))).reference, p.reference, 'référence non modifiable');
    await ok(post(`/products/${p.id}/supprimer`, {}));
    assert.equal((await get(`/products/${p.id}`)).status, 404);
  });

  it('clients : liste sans les clients des marchés, fiche avec dettes et caisses', async () => {
    const clients = (await ok(get('/clients?limit=500'))).items;
    assert.ok(clients.length > 0 && clients.every((c) => !c.marketId), 'aucun client de marché');
    const marche = (await ok(get('/markets/clients?limit=500'))).items;
    assert.ok(marche.length > 0 && marche.every((c) => c.marketId), 'seulement les clients des marchés');
    const fiche = await ok(get('/clients/cli_1'));
    assert.ok(Array.isArray(fiche.dettes) && fiche.caisses && 'remaining' in fiche.caisses && 'owed' in fiche.caissesDuClient);
    assert.equal((await get(`/clients/${marche[0].id}`)).status, 404, 'un client de marché n’est pas dans /clients');
  });

  it('dettes : celles des marchés sont séparées', async () => {
    const normales = (await ok(get('/credits?limit=500'))).items;
    const marches = (await ok(get('/markets/credits?limit=500'))).items;
    const idsMarche = new Set((await ok(get('/markets/clients?limit=500'))).items.map((c) => c.id));
    assert.ok(normales.every((c) => !idsMarche.has(c.clientId)));
    assert.ok(marches.every((c) => idsMarche.has(c.clientId)));
    assert.ok(normales.every((c) => typeof c.statut === 'string'));
  });

  it('ventes : créer, détail (lignes, paiements), annuler', async () => {
    const r = await ok(post('/sales', { data: { clientId: 'cli_2', teamId: 'team_1', frigoId: 'frg_1', items: [{ productId: 'prd_1', quantity: 1, unitPrice: 1.2 }], paid: 1.2, method: 'ESPECES', notes: 'REST', packaging: [] } }));
    const v = (r.collections?.sales || r.state.sales)[0];
    const d = await ok(get(`/sales/${v.id}`));
    assert.equal(d.lignes.length, 1);
    assert.equal(d.paiements[0].amount, 1.2);
    await ok(post(`/sales/${v.id}/annuler`, { reason: 'test REST' }));
    assert.equal((await ok(get(`/sales/${v.id}`))).saleStatusId, 'ss_cancelled');
  });

  it('stock et caisse : niveaux, mouvement, solde', async () => {
    const niveaux = (await ok(get('/stock'))).items;
    const avant = niveaux.find((l) => l.productId === 'prd_2').parFrigo.frg_2;
    await ok(post('/stock/mouvements', { data: { productId: 'prd_2', frigoId: 'frg_2', quantity: 10, movementType: 'ENTREE', reference: 'BR-REST', notes: '' } }));
    const apres = (await ok(get('/stock'))).items.find((l) => l.productId === 'prd_2').parFrigo.frg_2;
    assert.equal(Math.round((apres - avant) * 1000) / 1000, 10);
    const solde = await ok(get('/cash/solde'));
    assert.equal(typeof solde.total, 'number');
    await ok(post('/cash', { data: { teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 2, reference: 'REST', description: 'Apport REST' } }));
    assert.equal(Math.round(((await ok(get('/cash/solde'))).total - solde.total) * 1000) / 1000, 2);
  });

  it('caisses (box) : type « caisses du client », mouvement, soldes séparés', async () => {
    const types = (await ok(get('/boxes'))).items;
    const sienne = types.find((t) => t.clientOwned);
    assert.ok(sienne, 'type « صناديق العميل » présent');
    const notre = types.find((t) => !t.clientOwned && t.active);
    await ok(post('/boxes/mouvements', { data: { clientId: 'cli_3', packagingTypeId: notre.id, teamId: 'team_1', type: 'SORTIE', quantity: 2, notes: '' } }));
    await ok(post('/boxes/mouvements', { data: { clientId: 'cli_3', packagingTypeId: sienne.id, teamId: 'team_1', type: 'RETOUR', quantity: 4, notes: 'le client amène ses caisses' } }));
    const ligne = (await ok(get('/boxes/soldes'))).items.find((l) => l.clientId === 'cli_3');
    assert.ok(ligne.nosCaisses.remaining >= 2);
    assert.ok(ligne.sesCaisses.owed >= 4, 'ses caisses sont comptées à lui rendre');
    assert.ok((await ok(get('/boxes/mouvements'))).total > 0);
  });

  it('marchés : journées avec totaux et reste du camion', async () => {
    const trips = (await ok(get('/markets/trips'))).items;
    assert.ok(trips.length > 0);
    const t = await ok(get(`/markets/trips/${trips[0].id}`));
    assert.ok(t.totaux && Array.isArray(t.produits) && Array.isArray(t.caisses) && Array.isArray(t.ventes));
    assert.ok(t.produits.length > 0 && t.produits.every((x) => typeof x.loaded === 'number' && typeof x.remaining === 'number'), 'reste du camion par produit');
    assert.ok((await ok(get('/markets'))).items.length > 0);
  });

  it('consultation : lit tout, ne modifie rien', async () => {
    assert.ok((await ok(get('/sales', L.lecture))).total > 0);
    assert.ok((await ok(get('/cash', L.lecture))).total > 0);
    for (const [path, body] of [['/clients', { data: { code: 'CL-X', name: 'Test', phone: '', address: '', email: '', taxId: '', active: true, createdAt: '2026-11-21' } }],
      ['/cash', { data: { teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 1, reference: '', description: 'non' } }],
      ['/boxes/mouvements', { data: { clientId: 'cli_3', packagingTypeId: 'pkt_1', teamId: 'team_1', type: 'SORTIE', quantity: 1, notes: '' } }]]) {
      assert.equal((await post(path, body, L.lecture)).status, 403, path);
    }
  });

  it('employé du Figo 2 : ne lit que son Figo, sans les coordonnées des collègues', async () => {
    const ventes = (await ok(get('/sales?limit=500', L.riadh))).items;
    assert.ok(ventes.length > 0 && ventes.every((x) => x.teamId === 'team_2'));
    assert.ok((await ok(get('/cash?limit=500', L.riadh))).items.every((x) => x.teamId === 'team_2'));
    const users = (await ok(get('/users?limit=500', L.riadh))).items;
    assert.ok(users.filter((u) => u.id !== 'u_y').every((u) => u.email === '' && u.phone === ''));
    assert.ok(users.every((u) => !('totpSecret' in u) && !('pinHash' in u) && u.password === ''));
  });

  it('paramètres, statuts, historique ; pagination bornée ; corps invalide refusé', async () => {
    assert.equal(typeof (await ok(get('/settings'))).companyName, 'string');
    const st = await ok(get('/settings/statuts'));
    assert.ok(st.ventes.length && st.dettes.length);
    const h = await ok(get('/audit?limit=999999'));
    assert.equal(h.limit, 500, 'pas plus de 500 éléments par page');
    assert.equal((await ok(get('/sales?offset=2&limit=3'))).items.length, 3);
    assert.equal((await post('/clients', [1, 2, 3])).status, 400);
  });
});

describe('Site ouvert avec l’adresse réseau du PC (192.168.x.x)', () => {
  it('autorise l’adresse de ce PC, refuse un autre appareil du réseau', async () => {
    const { adressesDeCePc } = await import('../src/middlewares/http.js');
    const ip = [...adressesDeCePc()].find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a) && a !== '127.0.0.1') || '127.0.0.1';
    const essai = (origin) => fetch(`${base}/auth/public`, { headers: { Origin: origin } });
    const r1 = await essai(`http://${ip}:8080`);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('access-control-allow-origin'), `http://${ip}:8080`);
    const pre = await fetch(`${base}/auth/login`, { method: 'OPTIONS', headers: { Origin: `http://${ip}:8080`, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.headers.get('access-control-allow-origin'), `http://${ip}:8080`);
    const r2 = await essai('http://192.168.250.250:8080');
    assert.equal(r2.headers.get('access-control-allow-origin'), null, 'autre appareil : pas d’autorisation CORS');
  });
});

describe('Anti-saturation et sessions fermées', () => {
  it('limite d’opérations par compte (script qui enverrait des opérations en rafale)', async () => {
    const l = await ok(call('POST', '/auth/login', { email: 'consultation@frere-mahjoub.tn', password: 'Lecture2027' }));
    const tok = l.cookie;
    const { compteurs } = await import('../src/middlewares/http.js');
    compteurs.delete(`op:${l.state.sessionUserId}`);
    const avant = env.opsUserLimit;
    env.opsUserLimit = 5;
    try {
      const statuts = [];
      for (let i = 0; i < 7; i += 1) statuts.push((await op(tok, 'addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 1, reference: '', description: 'rafale' }])).status);
      assert.ok(statuts.slice(0, 5).every((s) => s !== 429), JSON.stringify(statuts));
      assert.equal(statuts[6], 429, 'au-delà de la limite : 429');
      // les autres comptes ne sont pas bloqués
      assert.equal((await call('GET', '/state', undefined, T.admin)).status, 200);
    } finally {
      env.opsUserLimit = avant;
    }
  });
  it('une session déconnectée reste fermée après un redémarrage du serveur', async () => {
    const r = await ok(call('POST', '/auth/login', { email: 'direction@frere-mahjoub.tn', password: 'Direction2026' }));
    const copie = r.cookie;
    await ok(call('POST', '/auth/logout', {}, copie));
    assert.equal((await call('GET', '/state', undefined, copie)).status, 401);
    // nouveau serveur sur la même base
    const app2 = await createApp({ store: makeStore() });
    const srv2 = http.createServer(app2.handler);
    await new Promise((res) => srv2.listen(0, res));
    try {
      const res = await fetch(`http://127.0.0.1:${srv2.address().port}/api/state`, { headers: { Cookie: `ff_session=${copie}` } });
      assert.equal(res.status, 401, 'le cookie copié avant la déconnexion ne doit plus fonctionner');
    } finally {
      srv2.close();
      if (process.env.TEST_STORE === 'mongo') await app2.close();
    }
  });
});

describe('Enregistrement et plusieurs postes', () => {
  it('20 opérations simultanées : aucune perdue, numéros cohérents', async () => {
    const avant = (await etat(T.admin)).cash.length;
    await Promise.all(Array.from({ length: 20 }, (_, i) => ok(op(i % 2 ? T.admin : T.walid, 'addCash', [{ teamId: 'team_1', type: 'ENCAISSEMENT', method: 'ESPECES', amount: 1, reference: `P${i}`, description: 'parallèle' }]))));
    const s = await etat(T.admin);
    assert.equal(s.cash.length, avant + 20);
    assert.equal(new Set(s.cash.map((x) => x.id)).size, s.cash.length, 'identifiants uniques');
  });
  it('les données survivent à un redémarrage du serveur (même ordre)', async () => {
    const avant = await etat(T.admin);
    const app2 = await createApp({ store: makeStore() });
    const s2 = await app2.engine.current();
    for (const k of ['sales', 'cash', 'credits', 'stockMovements', 'auditLogs', 'users', 'marketTrips']) {
      assert.deepEqual(s2.state[k].map((x) => x.id), avant[k].map((x) => x.id), `ordre de ${k}`);
    }
    assert.equal(s2.state.seq, avant.seq);
    assert.equal(s2.state.settings.defaultDueDays, 45);
    if (process.env.TEST_STORE === 'mongo') await app2.close();
  });
  it('restauration des données de démonstration', async () => {
    env.allowDemoReset = false;
    assert.equal((await call('POST', '/admin/reset', {}, T.admin)).status, 403);
    env.allowDemoReset = true;
    const r = await ok(call('POST', '/admin/reset', {}, T.admin));
    assert.equal(r.state.sessionUserId, 'u_super');
    assert.ok(!r.state.users.some((u) => u.email === 'sami@frere-mahjoub.tn'));
    assert.equal(r.state.settings.defaultDueDays, 30);
  });
});
