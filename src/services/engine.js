// Moteur : exécute les opérations métier du front (src/domain) sur l'état enregistré,
// après contrôle de la session, des permissions et de l'équipe (Figo), puis enregistre le résultat.
import { OPS, BusinessError, buildSeed, validateOp, validateSettings, isMarketCredit, isMarketClient, isReadOnly, creerFacturesManquantes, normaliserProduits, equipeDuFrigo, MARKET_ROLE, READONLY_ROLE, CLIENT_BOX_TYPE, STABLE_USER_IDS } from '../domain/domain.mjs';
import { ConflictError, diff, toStored } from '../db/common.js';
import { MANAGE_PERMISSION } from '../models/index.js';
import { hashPassword, isHash } from './auth.js';
import { emailConfigure } from './connexion.js';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

// Messages (en arabe comme le front, traduits en français par le front)
export const MSG = {
  interdit: 'ليست لديك صلاحية لهذه العملية',
  autreEquipe: 'هذه العملية تخص فريقاً آخر',
  mdpRequis: 'كلمة المرور مطلوبة',
  propreCompte: 'لا يمكنك تعطيل حسابك',
  session: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
  inactivite: 'انتهت الجلسة بسبب عدم النشاط، يرجى تسجيل الدخول من جديد',
  identifiants: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  demoOff: 'الدخول التجريبي معطل',
  resetOff: 'استعادة البيانات التجريبية معطلة على هذا الخادم',
  echec: 'تعذر تنفيذ العملية',
  lectureSeule: 'حسابك للاطلاع فقط: لا يمكنك إضافة أو تعديل البيانات',
  reserveDirecteur: 'هذا الإجراء خاص بالمدير العام',
  dernierDirecteur: 'يجب أن يبقى مدير عام واحد نشط على الأقل',
  roleUtilise: 'هذا الدور مستخدم من طرف مستخدمين: غيّر أدوارهم أولاً',
  emailNonConfigure: 'إرسال البريد غير مهيأ على الخادم: اختر وضع حماية آخر',
  appareilRetire: 'هذا الجهاز لم يعد معتمداً، تواصل مع المدير',
  appareilAttente: 'هذا الجهاز غير معتمد بعد: طلبنا موافقة المدير العام. أعد المحاولة بعد موافقته.',
  etapeExpiree: 'انتهت مهلة التحقق، أعد تسجيل الدخول',
  emailEchec: 'تعذر إرسال الرمز بالبريد، تواصل مع المدير',
  pinFormat: 'رمز PIN من 4 إلى 6 أرقام، مثال: 4827',
  pinFaible: 'رمز PIN سهل التخمين، اختر أرقاماً أخرى (مثال: 4827)',
  pinDifferent: 'الرمزان غير متطابقين',
  pinFaux: 'رمز PIN غير صحيح',
  codeFaux: 'الرمز غير صحيح، تحقق منه وأعد المحاولة',
  tropEssaisCode: 'محاولات كثيرة، أعد تسجيل الدخول بعد قليل',
  ancienFaux: 'كلمة المرور الحالية غير صحيحة',
  memeMdp: 'اختر كلمة مرور مختلفة عن الحالية',
  detteMarche: 'ديون الأسواق تُدار من قسم الأسواق',
};

// Permission(s) du front exigée(s) pour chaque opération (une seule suffit)
const OP_PERM = {
  createSale: ['ventes'], cancelSale: ['ventes'], setSaleStatus: ['ventes'], editSale: ['ventes'],
  // expédition (chargement du camion) : direction / admin uniquement ; le rôle « marché » vend et clôture
  createMarketTrip: ['administration'], createMarketSale: ['marches'], closeMarketTrip: ['marches'],
  saveMarket: ['marches'], saveMarketClient: ['marches'],
  // dette normale : crédits/paiements ; dette d'un marché : marchés (contrôlé dans controlesServeur)
  addCreditPayment: ['credits', 'paiements', 'marches'], addManualCredit: ['credits'], setCreditStatus: ['credits'],
  createDeadline: ['credits'], updateDeadline: ['credits'], payDeadline: ['credits', 'paiements', 'marches'],
  markReminder: ['credits'], cancelDeadline: ['credits'],
  addStockMovement: ['stock'], addPackMovement: ['emballages'], addCash: ['caisse'],
  // produit (+ stock dans un frigo : droit « stock » vérifié en plus dans controlesServeur)
  saveProduct: [MANAGE_PERMISSION.products],
  // facture d'une vente normale : « ventes » ; d'une vente du marché : « marchés » (contrôlé dans controlesServeur)
  setInvoiceStatus: ['ventes', 'marches'],
  saveSettings: ['parametres'],
};
// Droit pour créer / modifier / supprimer dans une collection : défini dans chaque modèle (models/*.js)
const COLL_PERM = MANAGE_PERMISSION;

// Paramètres de l'entreprise (page Paramètres : setState → saveSettings)
function saveSettings(prev, input, userId, date) {
  const s = structuredClone(prev);
  const v = validateSettings(input); // déjà nettoyé par validateOp ; re-vérifié par sécurité
  s.settings = { ...s.settings, ...v };
  s.auditLogs.unshift({ id: `log_${(++s.seq).toString(36)}`, userId, action: 'الإعدادات', entity: 'الإعدادات', details: `${v.companyName} · ${v.defaultDueDays} · ${v.packagingAlert}`, date });
  return s;
}
const ALL_OPS = { ...OPS, saveSettings };

export const permissionsOf = (state, user) => new Set(state.roles.filter((r) => user?.roleIds?.includes(r.id)).flatMap((r) => r.permissions));

/** Équipe concernée par une opération (pour bloquer un employé rattaché à un autre Figo) */
function teamsTouched(state, name, args) {
  const a = args[0];
  const byId = (list, id) => state[list].find((x) => x.id === id)?.teamId;
  switch (name) {
    // vente sans équipe choisie : équipes des frigos de ses lignes (un employé ne vend que pour la sienne)
    case 'createSale': return a?.teamId ? [a.teamId] : [...new Set((a?.items ?? []).map((i) => equipeDuFrigo(state, i.frigoId || a.frigoId)))];
    case 'addManualCredit': case 'addPackMovement': case 'addCash': case 'createDeadline': case 'createMarketTrip':
      return [a?.teamId];
    case 'cancelSale': case 'setSaleStatus': case 'editSale': return [byId('sales', a)];
    case 'setInvoiceStatus': return [byId('invoices', a)];
    case 'addCreditPayment': case 'payDeadline': case 'updateDeadline': return [byId('credits', a?.creditId)];
    case 'setCreditStatus': case 'markReminder': case 'cancelDeadline': return [byId('credits', a)];
    case 'createMarketSale': case 'closeMarketTrip': return [byId('marketTrips', a?.tripId)];
    default: return [];
  }
}

/** Mots de passe : jamais en clair en base. Vide à la modification = inchangé. */
function securiserUtilisateurs(prev, next, meId) {
  const anciens = new Map(prev.users.map((u) => [u.id, u]));
  for (const u of next.users) {
    const ancien = anciens.get(u.id);
    // mode de connexion changé : code PIN / clé Authenticator à reconfigurer
    if (ancien && (ancien.secMode || 'none') !== (u.secMode || 'none')) { delete u.totpSecret; delete u.totpLast; delete u.pinHash; }
    if (isHash(u.password)) continue;
    if (u.password) {
      u.password = hashPassword(u.password);
      // mot de passe donné par quelqu'un d'autre : à changer par l'utilisateur (bandeau de rappel)
      u.passwordInitial = u.id !== meId;
    } else if (ancien && isHash(ancien.password)) u.password = ancien.password;
    else throw new BusinessError(MSG.mdpRequis);
  }
}

const SUPER = 'role_super';
const estDirecteur = (u) => !!u?.roleIds?.includes(SUPER);
const directeursActifs = (users) => users.filter((u) => u.active && estDirecteur(u));

/** Contrôles propres au serveur avant certaines opérations */
function controlesServeur(state, me, name, args) {
  // ── Produit + entrée en stock : la quantité dans un frigo demande aussi le droit « stock » ──
  if (name === 'saveProduct' && args[1] && !permissionsOf(state, me).has('stock')) throw new HttpError(403, MSG.interdit, 'INTERDIT');
  // ── Comptes : le directeur général est protégé contre les autres administrateurs ──
  if (name === 'upsert' && args[0] === 'users') {
    const u = args[1]; const ancien = state.users.find((x) => x.id === u?.id);
    if ((estDirecteur(ancien) || u?.roleIds?.includes(SUPER)) && !estDirecteur(me)) throw new HttpError(403, MSG.reserveDirecteur, 'DIRECTEUR');
    if (ancien && estDirecteur(ancien) && (!u.roleIds?.includes(SUPER) || (u.active === false && ancien.id !== me.id))
      && directeursActifs(state.users).filter((x) => x.id !== ancien.id).length === 0) throw new BusinessError(MSG.dernierDirecteur);
    if (u?.secMode === 'email' && (ancien?.secMode !== 'email') && !emailConfigure()) throw new BusinessError(MSG.emailNonConfigure);
  }
  if (name === 'remove' && args[0] === 'users') {
    const cible = state.users.find((x) => x.id === args[1]);
    if (estDirecteur(cible) && !estDirecteur(me)) throw new HttpError(403, MSG.reserveDirecteur, 'DIRECTEUR');
    if (estDirecteur(cible) && directeursActifs(state.users).filter((x) => x.id !== cible.id).length === 0) throw new BusinessError(MSG.dernierDirecteur);
  }
  // ── Rôles : seul le directeur général peut créer/modifier/supprimer un rôle (sinon un admin s'ajouterait des droits) ──
  if ((name === 'upsert' || name === 'remove') && args[0] === 'roles') {
    if (!estDirecteur(me)) throw new HttpError(403, MSG.reserveDirecteur, 'DIRECTEUR');
    if (name === 'remove' && state.users.some((u) => u.roleIds.includes(args[1]))) throw new BusinessError(MSG.roleUtilise);
  }
  if (name === 'setInvoiceStatus') {
    const perms = permissionsOf(state, me);
    const facture = state.invoices.find((f) => f.id === args[0]);
    const vente = facture && state.sales.find((x) => x.id === facture.saleId);
    const marche = !!vente?.marketTripId;
    if (marche ? !perms.has('marches') : !perms.has('ventes')) throw new HttpError(403, MSG.interdit, 'INTERDIT');
  }
  if (name === 'addCreditPayment' || name === 'payDeadline') {
    const perms = permissionsOf(state, me);
    const credit = state.credits.find((c) => c.id === args[0]?.creditId);
    const marche = credit && isMarketCredit(state, credit);
    if (marche ? !perms.has('marches') : !(perms.has('credits') || perms.has('paiements'))) throw new HttpError(403, MSG.interdit, 'INTERDIT');
  }
  if (['createDeadline', 'updateDeadline', 'markReminder', 'cancelDeadline', 'setCreditStatus'].includes(name)) {
    // ces écrans ne concernent que les dettes normales pour un compte sans « marchés »
    const perms = permissionsOf(state, me);
    const credit = state.credits.find((c) => c.id === (typeof args[0] === 'string' ? args[0] : args[0]?.creditId));
    const marche = credit ? isMarketCredit(state, credit) : !!args[0]?.marketId || isMarketClient(state, args[0]?.clientId);
    if (marche && !perms.has('marches')) throw new HttpError(403, MSG.detteMarche, 'INTERDIT');
  }
  if (name === 'upsert' && args[0] === 'users' && args[1]?.id === me.id && args[1]?.active === false) throw new BusinessError(MSG.propreCompte);
  if (name === 'upsert' && args[0] === 'roles' && args[1]?.id === 'role_super') {
    // Le rôle « Directeur général » garde toutes les permissions (case grisée dans le front)
    const actuel = state.roles.find((r) => r.id === 'role_super');
    if (actuel) args[1] = { ...args[1], permissions: actuel.permissions };
  }
  if (name === 'remove' && args[0] === 'users' && args[1] === me.id) throw new BusinessError(MSG.propreCompte);
}

const pad = (n) => String(n).padStart(2, '0');
const aujourdhui = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export const SECURITE_ENTITE = 'الأمان';

/**
 * Données envoyées à un utilisateur : uniquement ce qu'il a le droit de voir.
 * - jamais de mot de passe (même chiffré) ;
 * - sans « administration » : pas d'email ni de téléphone des autres utilisateurs ;
 * - employé rattaché à un Figo : seulement les ventes, crédits, paiements, caisse, caisses clients
 *   et marchés de SON Figo (le stock et les fiches clients/produits restent communs) ;
 * - sans « historique » : seulement l'historique des éléments visibles, sans le journal de sécurité.
 */
export function vue(state, me) {
  const perms = permissionsOf(state, me);
  const admin = perms.has('administration');
  const out = { ...state, sessionUserId: me.id };
  out.users = state.users.map((u) => {
    // jamais envoyés : mot de passe, clé Authenticator, code PIN, jetons des appareils
    const { password, totpSecret, totpLast, pinHash, devices, passwordInitial, ...pub } = u;
    if (!(admin || u.id === me.id)) return { id: u.id, name: u.name, nameAlt: u.nameAlt, email: '', phone: '', password: '', active: u.active, createdAt: u.createdAt, roleIds: [], teamId: u.teamId };
    return {
      ...pub, password: '', secMode: u.secMode || 'none', secSetup: !!(totpSecret || pinHash),
      passwordInitial: !!passwordInitial,
      ...(admin ? { devices: (devices || []).map((d) => ({ id: d.id, name: d.name, status: d.status, createdAt: d.createdAt, lastSeen: d.lastSeen, ip: d.ip })) } : {}),
    };
  });
  if (me.teamId && !admin) {
    const sienne = (x) => x.teamId === me.teamId;
    out.sales = state.sales.filter(sienne);
    const ventes = new Set(out.sales.map((x) => x.id));
    out.saleItems = state.saleItems.filter((i) => ventes.has(i.saleId));
    out.payments = state.payments.filter(sienne);
    out.credits = state.credits.filter(sienne);
    out.creditPayments = state.creditPayments.filter(sienne);
    out.cash = state.cash.filter(sienne);
    out.packagingMovements = state.packagingMovements.filter(sienne);
    out.marketTrips = state.marketTrips.filter(sienne);
    out.invoices = (state.invoices ?? []).filter(sienne);
  }
  // Compte « marchés seulement » : uniquement les clients, ventes, dettes et caisses des marchés
  const NORMAL = ['clients', 'ventes', 'credits', 'paiements', 'caisse', 'emballages', 'rapports', 'dashboard'];
  if (perms.has('marches') && !NORMAL.some((p) => perms.has(p))) {
    out.clients = out.clients.filter((c) => c.marketId);
    out.sales = out.sales.filter((x) => x.marketTripId);
    const ventes = new Set(out.sales.map((x) => x.id));
    out.saleItems = out.saleItems.filter((i) => ventes.has(i.saleId));
    out.payments = out.payments.filter((p) => ventes.has(p.saleId));
    out.credits = out.credits.filter((c) => isMarketCredit(state, c));
    const dettes = new Set(out.credits.map((c) => c.id));
    out.creditPayments = out.creditPayments.filter((p) => dettes.has(p.creditId));
    out.cash = [];
    const clients = new Set(out.clients.map((c) => c.id));
    out.packagingMovements = out.packagingMovements.filter((m) => clients.has(m.clientId));
    out.invoices = (out.invoices ?? []).filter((f) => ventes.has(f.saleId));
    out.users = out.users.filter((u) => u.id === me.id || out.sales.some((x) => x.userId === u.id) || out.marketTrips.some((t) => t.userId === u.id));
  }
  // consultation seule : aucun historique (journal d'activité), même si le rôle a la permission
  if (isReadOnly(state, me)) out.auditLogs = [];
  else if (!perms.has('historique')) {
    const visibles = new Set([...out.sales, ...out.credits, ...out.clients, ...out.marketTrips, ...(out.invoices ?? [])].map((x) => x.id));
    out.auditLogs = state.auditLogs.filter((l) => l.entity !== SECURITE_ENTITE && l.entityId && visibles.has(l.entityId));
  }
  return out;
}

/** Comptes de démonstration (boutons de l'écran de connexion, si DEMO_LOGIN) */
export const DEMO_IDS = ['u_super', 'u_admin', 'u_x', 'u_y', 'u_m', 'u_l'];

/** Données de l'écran de connexion (avant authentification) */
export function vuePublique(state, demoLogin) {
  return {
    users: demoLogin
      ? state.users.filter((u) => DEMO_IDS.includes(u.id) && u.active).map((u) => ({ id: u.id, name: u.name, email: '', phone: '', password: '', active: true, createdAt: u.createdAt, roleIds: u.roleIds, teamId: u.teamId }))
      : [],
    // rôles et équipes : seulement pour les cartes de démonstration (sinon un visiteur anonyme verrait
    // les noms des responsables d'équipe → aide à l'hameçonnage ciblé)
    roles: demoLogin ? state.roles.map((r) => ({ ...r, permissions: [] })) : [],
    teams: demoLogin ? state.teams : [],
    settings: state.settings,
  };
}

/**
 * Mise à niveau d'une base créée avec une version précédente (sans effacer de données) :
 * permission « marchés », rôles « مسؤول السوق » / « اطلاع فقط », type « صناديق العميل ».
 * @returns l'état modifié, ou null si rien à faire
 */
export function migrer(state) {
  const s = structuredClone(state);
  let change = false;
  if (!s.roles.some((r) => r.permissions.includes('marches'))) {
    // avant : les marchés dépendaient de « ventes »
    for (const r of s.roles) if (r.id === 'role_super' || r.permissions.includes('ventes')) { r.permissions.push('marches'); change = true; }
  }
  for (const role of [MARKET_ROLE, READONLY_ROLE]) {
    if (!s.roles.some((r) => r.id === role.id)) { s.roles.push({ ...role, permissions: [...role.permissions] }); change = true; }
  }
  if (!s.packagingTypes.some((t) => t.clientOwned)) { s.packagingTypes.push({ ...CLIENT_BOX_TYPE }); change = true; }
  // factures : une par vente (bases créées avant la section Factures)
  if (creerFacturesManquantes(s) > 0) change = true;
  // produits : type (خضروات / فواكه) et unité de vente (kg, قطعة, طن, صندوق) ramenés aux valeurs permises
  if (normaliserProduits(s) > 0) change = true;
  // comptes stables « marché » et « consultation » (une seule fois : supprimés ensuite = pas recréés)
  if (!s.auditLogs.some((l) => l.action === ACTION_STABLES)) {
    const modele = buildSeed().users.filter((u) => STABLE_USER_IDS.includes(u.id) && u.id !== 'u_super');
    const ajoutes = [];
    for (const u of modele) {
      if (s.users.some((x) => x.id === u.id || x.email.toLowerCase() === u.email)) continue;
      s.users.push({ ...u, password: hashPassword(u.password) });
      ajoutes.push(u.email);
    }
    s.seq += 1;
    s.auditLogs.unshift({ id: `log_${s.seq.toString(36)}`, userId: 'system', action: ACTION_STABLES, entity: SECURITE_ENTITE, details: ajoutes.join(', ') || '—', date: new Date().toISOString() });
    change = true;
  }
  return change ? s : null;
}

const ACTION_STABLES = 'إنشاء الحسابات الثابتة';

/** Données de démonstration (mots de passe chiffrés) */
export function seedState(mode = 'demo') {
  const s = buildSeed();
  if (mode === 'propre') {
    // Configuration de l'entreprise sans opérations ni clients de démonstration
    const admin = s.users.find((u) => u.id === 'u_super');
    if (process.env.ADMIN_PASSWORD) admin.password = process.env.ADMIN_PASSWORD;
    Object.assign(s, {
      // les 3 comptes stables : directeur, marché, consultation
      users: s.users.filter((u) => STABLE_USER_IDS.includes(u.id)), clients: [], stockMovements: [], sales: [], saleItems: [], payments: [], credits: [],
      creditPayments: [], cash: [], packagingMovements: [], auditLogs: [], marketTrips: [], invoices: [],
    });
  }
  for (const u of s.users) u.password = hashPassword(u.password);
  s.seq += 1;
  s.auditLogs.unshift({ id: `log_${s.seq.toString(36)}`, userId: 'system', action: ACTION_STABLES, entity: SECURITE_ENTITE, details: s.users.filter((u) => STABLE_USER_IDS.includes(u.id)).map((u) => u.email).join(', '), date: new Date().toISOString() });
  delete s.sessionUserId;
  return toStored(s);
}

export function createEngine(store) {
  let file = Promise.resolve(); // une opération à la fois dans ce processus

  async function current() {
    const { state, version } = await store.load();
    if (!state) throw new HttpError(503, 'Base non initialisée');
    return { state, version };
  }

  async function userFrom(id) {
    const { state, version } = await current();
    const me = state.users.find((u) => u.id === id && u.active);
    return { state, version, me };
  }

  async function executer(userId, name, rawArgs) {
    const op = ALL_OPS[name];
    if (!op) throw new HttpError(404, `Opération inconnue : ${name}`, 'OP_INCONNUE');
    if (!Array.isArray(rawArgs)) throw new HttpError(400, 'args doit être un tableau', 'ARGS');
    for (let essai = 1; ; essai += 1) {
      const { state, version, me } = await userFrom(userId);
      if (!me) throw new HttpError(401, MSG.session, 'SESSION');
      const args = structuredClone(rawArgs);
      const perms = permissionsOf(state, me);
      const requis = name === 'upsert' || name === 'remove' ? [COLL_PERM[args[0]]] : OP_PERM[name];
      if (!requis || !requis[0]) throw new HttpError(400, MSG.echec, 'COLLECTION');
      if (isReadOnly(state, me)) throw new HttpError(403, MSG.lectureSeule, 'LECTURE_SEULE');
      if (!requis.some((p) => perms.has(p))) throw new HttpError(403, MSG.interdit, 'INTERDIT');
      if (me.teamId && !perms.has('administration')) {
        if (teamsTouched(state, name, args).some((t) => t && t !== me.teamId)) throw new HttpError(403, MSG.autreEquipe, 'EQUIPE');
      }
      let next;
      try {
        // 1) contrôle et nettoyage de toutes les saisies (mêmes règles que le site)
        const propres = validateOp(state, name, args, aujourdhui());
        args.splice(0, args.length, ...propres);
        controlesServeur(state, me, name, args);
        if (me.teamId && !perms.has('administration') && teamsTouched(state, name, args).some((t) => t && t !== me.teamId)) {
          throw new HttpError(403, MSG.autreEquipe, 'EQUIPE');
        }
        next = op(state, ...args, me.id, new Date().toISOString());
        if (next !== state) securiserUtilisateurs(state, next, me.id);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        if (e instanceof BusinessError) throw new HttpError(422, e.message, 'METIER');
        console.error(`Erreur dans ${name} :`, e);
        throw new HttpError(400, MSG.echec, 'ECHEC');
      }
      delete next.sessionUserId;
      if (next === state || diff(state, next).empty) return { prevVersion: version, version, prev: state, state };
      try {
        const v = await store.commit(state, next, version);
        return { prevVersion: version, version: v, prev: state, state: toStored(next) };
      } catch (e) {
        if (e instanceof ConflictError && essai < 5) continue; // un autre poste a écrit entre-temps : on rejoue
        throw e;
      }
    }
  }

  /** Journal de sécurité (connexions, échecs, blocages) visible dans « Historique » */
  async function journaliser(userId, action, details) {
    for (let essai = 1; essai <= 5; essai += 1) {
      const { state, version } = await current();
      const next = structuredClone(state);
      next.seq += 1;
      next.auditLogs.unshift({ id: `log_${next.seq.toString(36)}`, userId, action, entity: SECURITE_ENTITE, entityId: userId, details, date: new Date().toISOString() });
      try { await store.commit(state, next, version); return; } catch (e) { if (!(e instanceof ConflictError)) throw e; }
    }
  }

  /** Modification d'un compte par le serveur (code PIN, clé Authenticator, appareils…) */
  async function modifier(userId, fn, action, details) {
    for (let essai = 1; essai <= 5; essai += 1) {
      const { state, version } = await current();
      const next = structuredClone(state);
      const u = next.users.find((x) => x.id === userId);
      if (!u) throw new HttpError(404, MSG.echec, 'INTROUVABLE');
      if (fn(u, next) === false) return state;
      if (action) {
        next.seq += 1;
        next.auditLogs.unshift({ id: `log_${next.seq.toString(36)}`, userId, action, entity: SECURITE_ENTITE, entityId: userId, details: details || '', date: new Date().toISOString() });
      }
      try { await store.commit(state, next, version); return next; } catch (e) { if (!(e instanceof ConflictError)) throw e; }
    }
    throw new HttpError(503, MSG.echec, 'CONFLIT');
  }

  return {
    current,
    userFrom,
    modifierUtilisateur(userId, fn, action, details) {
      const p = file.then(() => modifier(userId, fn, action, details));
      file = p.catch(() => {});
      return p;
    },
    journal(userId, action, details) {
      const p = file.then(() => journaliser(userId, action, details));
      file = p.catch(() => {});
      return p.catch((e) => console.error('Journal de sécurité :', e.message));
    },
    /** Exécute une opération (sérialisée) */
    run(userId, name, args) {
      const p = file.then(() => executer(userId, name, args));
      file = p.catch(() => {});
      return p;
    },
    async reset(mode = 'demo') {
      const p = file.then(() => store.replace(seedState(mode)));
      file = p.catch(() => {});
      return p;
    },
    async initIfEmpty(mode = 'demo') {
      if (await store.isEmpty()) {
        await store.replace(seedState(mode));
        console.log(`Base vide : données initiales créées (${mode === 'demo' ? 'démonstration' : 'configuration seule'}).`);
        return;
      }
      const { state, version } = await current();
      const next = migrer(state);
      if (next) {
        await store.commit(state, next, version);
        console.log('Base mise à niveau (rôles, caisses des clients, factures des ventes existantes).');
      }
    },
  };
}
