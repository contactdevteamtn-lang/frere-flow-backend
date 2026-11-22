// Stockage MongoDB : une collection par liste de l'état, l'ordre des listes et un document de version.
// Chaque opération est écrite dans une transaction (Atlas / replica set) avec contrôle de version.
import dns from 'node:dns';
import { MongoClient } from 'mongodb';
import { COLLECTIONS, ConflictError, diff, toStored } from './common.js';

let dnsPublic = false;
/** Atlas (mongodb+srv) : si le DNS du PC refuse la requête SRV, on passe sur des DNS publics */
export function basculerDnsPublic(uri, erreur) {
  if (dnsPublic || !uri.startsWith('mongodb+srv://')) return false;
  if (!/querySrv|ENOTFOUND|ECONNREFUSED|ETIMEOUT|EREFUSED/i.test(erreur?.message || '')) return false;
  dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1,8.8.4.4').split(',').map((x) => x.trim()));
  dnsPublic = true;
  console.warn('DNS du PC injoignable pour Atlas → utilisation des DNS publics (8.8.8.8, 1.1.1.1)');
  return true;
}

/** Durée maximale d'une lecture / validation de transaction côté MongoDB */
const MAX_MS = Number(process.env.MONGO_MAX_MS || 15000);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMongoStore(uri, { retries = 20, delayMs = 3000 } = {}) {
  let client;
  let db;
  let transactions = true;
  let cache = null; // { version, state }

  const strip = ({ _id, ...rest }) => rest;
  // Collections préfixées « ff_ » : aucun mélange avec d'autres applications dans la même base
  const col = (name) => db.collection(`ff_${name}`);

  async function connect() {
    for (let i = 1; ; i += 1) {
      try {
        client = new MongoClient(uri, {
          // délais bornés : une base lente ou injoignable ne bloque jamais une requête indéfiniment
          serverSelectionTimeoutMS: 8000, connectTimeoutMS: 10000, socketTimeoutMS: 45000,
          maxPoolSize: 20, waitQueueTimeoutMS: 10000, retryWrites: true,
        });
        await client.connect();
        db = client.db();
        console.log(`MongoDB connecté : ${db.databaseName}`);
        if (db.databaseName === 'test') console.warn("⚠ Pas de nom de base dans MONGO_URI : ajoutez /ferme avant le « ? »");
        return;
      } catch (e) {
        await client?.close().catch(() => {});
        if (basculerDnsPublic(uri, e)) { i -= 1; continue; }
        if (i >= retries) throw e;
        console.warn(`MongoDB indisponible (tentative ${i}/${retries}) : ${e.message} — nouvel essai dans ${delayMs / 1000}s`);
        await wait(delayMs);
      }
    }
  }

  async function readAll() {
    const meta = await col('_meta').findOne({ _id: 'state' }, { maxTimeMS: MAX_MS });
    if (!meta) return { state: null, version: 0 };
    if (cache && cache.version === meta.version) return cache;
    const orders = new Map((await col('_order').find({}, { maxTimeMS: MAX_MS }).toArray()).map((o) => [o._id, o.ids]));
    const lists = await Promise.all(COLLECTIONS.map((k) => col(k).find({}, { maxTimeMS: MAX_MS }).toArray()));
    const state = { seq: meta.seq, settings: meta.settings };
    COLLECTIONS.forEach((k, i) => {
      const byId = new Map(lists[i].map((d) => [d._id, strip(d)]));
      const ordered = [];
      for (const id of orders.get(k) || []) { const x = byId.get(id); if (x) { ordered.push(x); byId.delete(id); } }
      state[k] = [...ordered, ...byId.values()];
    });
    cache = { version: meta.version, state };
    return cache;
  }

  async function write(prev, next, expected, session) {
    const { changes } = diff(prev, next);
    const opts = session ? { session } : {};
    const r = await col('_meta').findOneAndUpdate(
      { _id: 'state', version: expected },
      { $set: { version: expected + 1, seq: next.seq, settings: next.settings, updatedAt: new Date() } },
      opts,
    );
    if (!r) throw new ConflictError();
    for (const c of changes) {
      const ops = [
        ...c.upserts.map((x) => ({ replaceOne: { filter: { _id: x.id }, replacement: { ...x, _id: x.id }, upsert: true } })),
        ...c.deletes.map((id) => ({ deleteOne: { filter: { _id: id } } })),
      ];
      if (ops.length) await col(c.key).bulkWrite(ops, { ordered: false, ...opts });
      if (c.orderChanged) await col('_order').replaceOne({ _id: c.key }, { _id: c.key, ids: c.ids }, { upsert: true, ...opts });
    }
  }

  return {
    kind: 'mongo',
    async init() {
      await connect();
      try {
        const hello = await db.admin().command({ hello: 1 });
        transactions = !!(hello.setName || hello.msg === 'isdbgrid');
      } catch { transactions = false; }
      if (!transactions) console.warn('⚠ MongoDB sans replica set : écritures sans transaction (utilisez Atlas en production).');
      // MongoDB efface tout seul les sessions fermées une fois expirées
      await col('_sessions_fermees').createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
    },
    async isEmpty() { return !(await col('_meta').findOne({ _id: 'state' }, { maxTimeMS: MAX_MS })); },
    async load() { return readAll(); },
    async commit(prev, next, expected) {
      const stored = toStored(next);
      if (transactions) {
        const session = client.startSession();
        try {
          await session.withTransaction(() => write(prev, stored, expected, session), { maxCommitTimeMS: MAX_MS });
        } finally {
          await session.endSession();
        }
      } else {
        await write(prev, stored, expected, null);
      }
      cache = { version: expected + 1, state: stored };
      return expected + 1;
    },
    async replace(next) {
      const stored = toStored(next);
      const meta = await col('_meta').findOne({ _id: 'state' }, { maxTimeMS: MAX_MS });
      const version = (meta?.version || 0) + 1;
      for (const k of COLLECTIONS) {
        await col(k).deleteMany({});
        if (stored[k].length) await col(k).insertMany(stored[k].map((x) => ({ ...x, _id: x.id })));
        await col('_order').replaceOne({ _id: k }, { _id: k, ids: stored[k].map((x) => x.id) }, { upsert: true });
      }
      await col('_meta').replaceOne({ _id: 'state' },
        { _id: 'state', version, seq: stored.seq, settings: stored.settings, updatedAt: new Date() }, { upsert: true });
      cache = { version, state: stored };
      return version;
    },
    // Sessions fermées : une déconnexion reste valable après un redémarrage du serveur
    async revoquer(sid, exp) {
      await col('_sessions_fermees').updateOne({ _id: sid }, { $set: { expireAt: new Date(exp * 1000) } }, { upsert: true });
    },
    async revoquees() {
      const now = Date.now();
      return (await col('_sessions_fermees').find({}).toArray())
        .filter((d) => d.expireAt && new Date(d.expireAt).getTime() > now)
        .map((d) => [d._id, Math.floor(new Date(d.expireAt).getTime() / 1000)]);
    },
    async close() { await client?.close(); },
    get db() { return db; },
    get transactions() { return transactions; },
  };
}
