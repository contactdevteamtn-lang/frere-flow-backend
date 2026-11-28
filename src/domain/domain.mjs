// FICHIER GÉNÉRÉ par scripts/sync-domain.mjs depuis frere-flow/src — ne pas modifier à la main.
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../frere-flow/src/services/ops.ts
var ops_exports = {};
__export(ops_exports, {
  BusinessError: () => BusinessError,
  addCash: () => addCash,
  addCreditPayment: () => addCreditPayment,
  addManualCredit: () => addManualCredit,
  addPackMovement: () => addPackMovement,
  addStockMovement: () => addStockMovement,
  cancelSale: () => cancelSale,
  cashBalance: () => cashBalance,
  clientBoxBalance: () => clientBoxBalance,
  clientBoxTypeIds: () => clientBoxTypeIds,
  createSale: () => createSale,
  creditStatusChoices: () => creditStatusChoices,
  creditStatusId: () => creditStatusId,
  creerFacturesManquantes: () => creerFacturesManquantes,
  editSale: () => editSale,
  effectiveCreditCode: () => effectiveCreditCode,
  invoiceOfSale: () => invoiceOfSale,
  isClientBoxType: () => isClientBoxType,
  isMarketClient: () => isMarketClient,
  isMarketCredit: () => isMarketCredit,
  isMarketSale: () => isMarketSale,
  isReadOnly: () => isReadOnly,
  manualCredit: () => manualCredit,
  nextId: () => nextId,
  packBalance: () => packBalance,
  prochaineReference: () => prochaineReference,
  remove: () => remove,
  saleStatusChoices: () => saleStatusChoices,
  saleStatusId: () => saleStatusId,
  saveProduct: () => saveProduct,
  setCreditStatus: () => setCreditStatus,
  setInvoiceStatus: () => setInvoiceStatus,
  setSaleStatus: () => setSaleStatus,
  stockOf: () => stockOf,
  stockTotal: () => stockTotal,
  upsert: () => upsert
});
var BusinessError = class extends Error {
};
var nextId = (s, p) => `${p}_${(++s.seq).toString(36)}`;
function prochaineReference(existantes, prefixe, date) {
  const debut = `${prefixe}-${date.slice(0, 4)}-`;
  const n = existantes.filter((r) => r?.startsWith(debut)).map((r) => Number(r.slice(debut.length))).filter(Number.isFinite);
  return `${debut}${String(Math.max(0, ...n) + 1).padStart(4, "0")}`;
}
var round = (n) => Math.round(n * 1e3) / 1e3;
var saleStatusId = (s, code2) => s.saleStatuses.find((x) => x.code === code2).id;
var creditStatusId = (s, code2) => s.creditStatuses.find((x) => x.code === code2).id;
function audit(s, userId, action, entity, entityId, details, date) {
  s.auditLogs.unshift({ id: nextId(s, "log"), userId, action, entity, entityId, details, date });
}
function stockOf(s, productId, frigoId) {
  let q = 0;
  for (const m of s.stockMovements) {
    if (m.productId !== productId) continue;
    if (m.movementType === "ENTREE" && m.frigoId === frigoId) q += m.quantity;
    if (m.movementType === "SORTIE" && m.frigoId === frigoId) q -= m.quantity;
    if (m.movementType === "AJUSTEMENT" && m.frigoId === frigoId) q += m.quantity;
    if (m.movementType === "TRANSFERT") {
      if (m.frigoId === frigoId) q -= m.quantity;
      if (m.toFrigoId === frigoId) q += m.quantity;
    }
  }
  return round(q);
}
var stockTotal = (s, productId) => round(s.frigos.reduce((a, f) => a + stockOf(s, productId, f.id), 0));
function packBalance(s, f) {
  let given = 0, returned = 0;
  const own = clientBoxTypeIds(s);
  for (const m of s.packagingMovements) {
    if (own.has(m.packagingTypeId)) continue;
    if (f.clientId && m.clientId !== f.clientId) continue;
    if (f.typeId && m.packagingTypeId !== f.typeId) continue;
    if (f.teamId && m.teamId !== f.teamId) continue;
    if (m.type === "SORTIE") given += m.quantity;
    else returned += m.quantity;
  }
  return { given, returned, remaining: given - returned };
}
var clientBoxTypeIds = (s) => new Set(s.packagingTypes.filter((t) => t.clientOwned).map((t) => t.id));
var isClientBoxType = (s, typeId) => !!s.packagingTypes.find((t) => t.id === typeId)?.clientOwned;
function clientBoxBalance(s, f) {
  let received = 0, returned = 0;
  const own = clientBoxTypeIds(s);
  for (const m of s.packagingMovements) {
    if (!own.has(m.packagingTypeId)) continue;
    if (f.clientId && m.clientId !== f.clientId) continue;
    if (f.teamId && m.teamId !== f.teamId) continue;
    if (m.type === "RETOUR") received += m.quantity;
    else returned += m.quantity;
  }
  return { received, returned, owed: received - returned };
}
var isMarketClient = (s, clientId) => !!s.clients.find((c) => c.id === clientId)?.marketId;
function isMarketCredit(s, c) {
  if (c.marketId || isMarketClient(s, c.clientId)) return true;
  return !!(c.saleId && s.sales.find((x) => x.id === c.saleId)?.marketTripId);
}
var isMarketSale = (s, sale) => !!sale.marketTripId || isMarketClient(s, sale.clientId);
function isReadOnly(s, user2) {
  const roles = s.roles.filter((r) => user2?.roleIds.includes(r.id));
  return roles.length > 0 && roles.every((r) => r.permissions.includes("lecture"));
}
function effectiveCreditCode(s, c, today) {
  const code2 = s.creditStatuses.find((x) => x.id === c.creditStatusId)?.code ?? "ACTIVE";
  if ((code2 === "ACTIVE" || code2 === "PARTIAL") && c.dueDate < today.slice(0, 10)) return "OVERDUE";
  return code2;
}
function createSale(prev, inp, userId, date) {
  const frigoDe = (i) => i.frigoId || inp.frigoId;
  const lignes = inp.items.filter((i) => i.productId && i.quantity > 0);
  const frigos = [...new Set(lignes.map(frigoDe))];
  if (inp.marketTripId || frigos.length <= 1)
    return creerVenteUnFrigo(prev, { ...inp, frigoId: frigos[0] ?? inp.frigoId }, userId, date);
  const totaux = frigos.map(
    (f) => lignes.filter((i) => frigoDe(i) === f).reduce((a, i) => a + i.quantity * i.unitPrice, 0)
  );
  const total = totaux.reduce((a, t) => a + t, 0);
  const paye = Math.min(Math.max(inp.paid || 0, 0), total);
  let reste = round(paye);
  let s = prev;
  frigos.forEach((f, k) => {
    const part = k === frigos.length - 1 ? reste : round(total ? paye * totaux[k] / total : 0);
    reste = round(reste - part);
    s = creerVenteUnFrigo(
      s,
      {
        ...inp,
        frigoId: f,
        items: lignes.filter((i) => frigoDe(i) === f),
        paid: part,
        packaging: k === 0 ? inp.packaging : []
      },
      userId,
      date
    );
  });
  return s;
}
function creerVenteUnFrigo(prev, inp, userId, date) {
  const s = structuredClone(prev);
  const items = inp.items.filter((i) => i.productId && i.quantity > 0);
  if (!inp.clientId || !inp.teamId || !inp.frigoId)
    throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u0648\u0641\u0631\u064A\u0642 \u0641\u064A\u063A\u0648 \u0648\u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F \u0645\u0637\u0644\u0648\u0628\u0629");
  if (!items.length) throw new BusinessError("\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
  if (!inp.marketTripId && isMarketClient(s, inp.clientId))
    throw new BusinessError("\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064A\u0644 \u062A\u0627\u0628\u0639 \u0644\u0633\u0648\u0642: \u0633\u062C\u0651\u0644 \u0627\u0644\u0628\u064A\u0639 \u0645\u0646 \u0642\u0633\u0645 \u0627\u0644\u0623\u0633\u0648\u0627\u0642");
  const need = /* @__PURE__ */ new Map();
  items.forEach((i) => need.set(i.productId, (need.get(i.productId) ?? 0) + i.quantity));
  for (const [pid, q] of need) {
    if (inp.marketTripId) break;
    const av = stockOf(s, pid, inp.frigoId);
    if (av < q) {
      const p = s.products.find((x) => x.id === pid);
      throw new BusinessError(
        `\u0645\u062E\u0632\u0648\u0646 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0644\u0645\u0646\u062A\u062C ${p?.name} (${av} ${p?.unit} \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F)`
      );
    }
  }
  const total = round(items.reduce((a, i) => a + i.quantity * i.unitPrice, 0));
  const paid2 = round(Math.min(Math.max(inp.paid || 0, 0), total));
  const remaining = round(total - paid2);
  const id = nextId(s, "sale");
  const number = prochaineReference(
    s.sales.map((x) => x.number),
    "FM",
    date
  );
  const statusCode = remaining === 0 ? "PAID" : paid2 > 0 ? "PARTIAL" : "PENDING";
  s.sales.unshift({
    id,
    ...inp.marketTripId ? { marketTripId: inp.marketTripId } : {},
    number,
    clientId: inp.clientId,
    teamId: inp.teamId,
    frigoId: inp.frigoId,
    userId,
    saleStatusId: saleStatusId(s, statusCode),
    saleDate: date,
    totalAmount: total,
    paidAmount: paid2,
    remainingAmount: remaining,
    paymentType: inp.method,
    notes: inp.notes
  });
  for (const i of items) {
    s.saleItems.push({
      id: nextId(s, "si"),
      saleId: id,
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: round(i.quantity * i.unitPrice)
    });
    if (!inp.marketTripId)
      s.stockMovements.unshift({
        id: nextId(s, "mv"),
        productId: i.productId,
        frigoId: inp.frigoId,
        quantity: i.quantity,
        movementType: "SORTIE",
        date,
        userId,
        reference: number,
        notes: "\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639"
      });
  }
  if (paid2 > 0) {
    s.payments.unshift({
      id: nextId(s, "pay"),
      saleId: id,
      clientId: inp.clientId,
      teamId: inp.teamId,
      userId,
      amount: paid2,
      paymentDate: date,
      paymentMethod: inp.method
    });
    s.cash.unshift({
      id: nextId(s, "cash"),
      teamId: inp.teamId,
      userId,
      type: "ENCAISSEMENT",
      method: inp.method,
      amount: paid2,
      reference: number,
      date,
      description: "\u062F\u0641\u0639\u0629 \u0628\u064A\u0639"
    });
  }
  if (remaining > 0) {
    const due = inp.dueDate || new Date(new Date(date).getTime() + s.settings.defaultDueDays * 864e5).toISOString().slice(0, 10);
    s.credits.unshift({
      id: nextId(s, "cr"),
      clientId: inp.clientId,
      teamId: inp.teamId,
      saleId: id,
      creditStatusId: creditStatusId(s, paid2 > 0 ? "PARTIAL" : "ACTIVE"),
      totalAmount: remaining,
      paidAmount: 0,
      remainingAmount: remaining,
      dueDate: due,
      createdAt: date
    });
  }
  for (const pk of inp.packaging.filter((p) => p.typeId && p.quantity > 0)) {
    const own = isClientBoxType(s, pk.typeId);
    s.packagingMovements.unshift({
      id: nextId(s, "pk"),
      clientId: inp.clientId,
      packagingTypeId: pk.typeId,
      teamId: inp.teamId,
      saleId: id,
      type: own ? "RETOUR" : "SORTIE",
      quantity: pk.quantity,
      date,
      userId,
      notes: own ? `\u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644 \u2014 \u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639 ${number}` : `\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639 ${number}`
    });
  }
  ajouterFacture(s, s.sales[0], "VALIDEE", date);
  audit(
    s,
    userId,
    "\u0625\u0646\u0634\u0627\u0621 \u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    "\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    id,
    `${number} \u2014 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A ${total} TND, \u0627\u0644\u0645\u062F\u0641\u0648\u0639 ${paid2} TND`,
    date
  );
  return s;
}
function editSale(prev, saleId, inp, userId, date) {
  const s = structuredClone(prev);
  const sale = s.sales.find((x) => x.id === saleId);
  if (!sale) throw new BusinessError("\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (sale.saleStatusId === saleStatusId(s, "CANCELLED"))
    throw new BusinessError("\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u0645\u0644\u063A\u0627\u0629");
  if (sale.marketTripId) throw new BusinessError("\u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0633\u0648\u0642 \u062A\u064F\u062F\u0627\u0631 \u0645\u0646 \u0642\u0633\u0645 \u0627\u0644\u0623\u0633\u0648\u0627\u0642");
  const items = inp.items.filter((i) => i.productId && i.quantity > 0);
  if (!items.length) throw new BusinessError("\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
  const anciennes = s.saleItems.filter((i) => i.saleId === saleId);
  const qte = (l, pid) => l.filter((i) => i.productId === pid).reduce((a, i) => a + i.quantity, 0);
  const produits = new Set([...anciennes, ...items].map((i) => i.productId));
  for (const pid of produits) {
    const delta = round(qte(items, pid) - qte(anciennes, pid));
    if (delta > 0 && stockOf(s, pid, sale.frigoId) < delta) {
      const p = s.products.find((x) => x.id === pid);
      throw new BusinessError(
        `\u0645\u062E\u0632\u0648\u0646 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0644\u0645\u0646\u062A\u062C ${p?.name} (${stockOf(s, pid, sale.frigoId)} ${p?.unit} \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F)`
      );
    }
    if (delta !== 0)
      s.stockMovements.unshift({
        id: nextId(s, "mv"),
        productId: pid,
        frigoId: sale.frigoId,
        quantity: Math.abs(delta),
        movementType: delta > 0 ? "SORTIE" : "ENTREE",
        date,
        userId,
        reference: sale.number,
        notes: "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"
      });
  }
  s.saleItems = s.saleItems.filter((i) => i.saleId !== saleId);
  for (const i of items)
    s.saleItems.push({
      id: nextId(s, "si"),
      saleId,
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: round(i.quantity * i.unitPrice)
    });
  const ancienTotal = sale.totalAmount;
  const total = round(items.reduce((a, i) => a + i.quantity * i.unitPrice, 0));
  const p0 = round(s.payments.filter((p) => p.saleId === saleId).reduce((a, p) => a + p.amount, 0));
  const credit = s.credits.find((c) => c.saleId === saleId);
  const cp = credit?.paidAmount ?? 0;
  const dejaPaye = round(p0 + cp);
  if (total < dejaPaye) {
    const rembourse = round(dejaPaye - total);
    s.cash.unshift({
      id: nextId(s, "cash"),
      teamId: sale.teamId,
      userId,
      type: "DECAISSEMENT",
      method: "ESPECES",
      amount: rembourse,
      reference: sale.number,
      date,
      description: "\u0625\u0631\u062C\u0627\u0639 \u0641\u0631\u0642 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"
    });
  }
  sale.totalAmount = total;
  sale.paidAmount = round(Math.min(dejaPaye, total));
  sale.remainingAmount = round(total - sale.paidAmount);
  if (inp.notes !== void 0) sale.notes = inp.notes;
  if (credit) {
    credit.totalAmount = round(Math.max(total - p0, cp));
    credit.remainingAmount = round(credit.totalAmount - credit.paidAmount);
    credit.creditStatusId = statutCalcule(s, credit);
  } else if (sale.remainingAmount > 0) {
    s.credits.unshift({
      id: nextId(s, "cr"),
      clientId: sale.clientId,
      teamId: sale.teamId,
      saleId,
      creditStatusId: creditStatusId(s, p0 > 0 ? "PARTIAL" : "ACTIVE"),
      totalAmount: sale.remainingAmount,
      paidAmount: 0,
      remainingAmount: sale.remainingAmount,
      dueDate: new Date(new Date(date).getTime() + s.settings.defaultDueDays * 864e5).toISOString().slice(0, 10),
      createdAt: date
    });
  }
  const confirmee = sale.saleStatusId === saleStatusId(s, "CONFIRMED");
  sale.saleStatusId = saleStatusId(
    s,
    sale.remainingAmount === 0 ? "PAID" : sale.paidAmount > 0 ? "PARTIAL" : confirmee ? "CONFIRMED" : "PENDING"
  );
  for (const fac of s.invoices.filter((x) => x.saleId === saleId)) {
    fac.amount = total;
    fac.status = "VALIDEE";
    fac.notes = "";
    fac.updatedAt = date;
  }
  audit(
    s,
    userId,
    "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629",
    "\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    saleId,
    `${sale.number} \u2014 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A ${ancienTotal} TND \u2192 ${total} TND`,
    date
  );
  return s;
}
function numeroFacture(s, date) {
  const prefixe = `FAC-${date.slice(0, 4)}-`;
  const n = s.invoices.filter((f) => f.number.startsWith(prefixe)).map((f) => Number(f.number.slice(prefixe.length))).filter(Number.isFinite);
  return `${prefixe}${String(Math.max(0, ...n) + 1).padStart(4, "0")}`;
}
function ajouterFacture(s, sale, status, date) {
  s.invoices.unshift({
    id: nextId(s, "fac"),
    number: numeroFacture(s, sale.saleDate || date),
    saleId: sale.id,
    clientId: sale.clientId,
    teamId: sale.teamId,
    amount: sale.totalAmount,
    status,
    date: sale.saleDate || date,
    notes: ""
  });
}
var invoiceOfSale = (s, saleId) => s.invoices.find((f) => f.saleId === saleId);
function creerFacturesManquantes(s) {
  s.invoices ??= [];
  const avec = new Set(s.invoices.map((f) => f.saleId));
  const sans = s.sales.filter((v) => !avec.has(v.id)).sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.number.localeCompare(b.number));
  const annulee = saleStatusId(s, "CANCELLED");
  for (const v of sans)
    ajouterFacture(s, v, v.saleStatusId === annulee ? "ANNULEE" : "VALIDEE", v.saleDate);
  return sans.length;
}
function setInvoiceStatus(prev, invoiceId, status, note, userId, date) {
  const f = prev.invoices.find((x) => x.id === invoiceId);
  if (!f) throw new BusinessError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (f.status === "ANNULEE") throw new BusinessError("\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0644\u063A\u0627\u0629: \u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u063A\u064A\u064A\u0631\u0647\u0627");
  if ((status === "A_VOIR" || status === "ANNULEE") && note.trim().length < 3)
    throw new BusinessError("\u0627\u0643\u062A\u0628 \u0627\u0644\u0633\u0628\u0628 (3 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644)");
  if (status === f.status && note === f.notes) return prev;
  if (status === "ANNULEE") {
    const s2 = cancelSale(prev, f.saleId, note, userId, date);
    const fac2 = s2.invoices.find((x) => x.id === invoiceId);
    fac2.notes = note;
    return s2;
  }
  const s = structuredClone(prev);
  const fac = s.invoices.find((x) => x.id === invoiceId);
  const avant = fac.status;
  fac.status = status;
  fac.notes = status === "A_VOIR" ? note.trim() : "";
  fac.updatedAt = date;
  const libelle = { VALIDEE: "\u0635\u0627\u0644\u062D\u0629", A_VOIR: "\u0644\u0644\u0645\u0631\u0627\u062C\u0639\u0629", ANNULEE: "\u0645\u0644\u063A\u0627\u0629" };
  audit(
    s,
    userId,
    "\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629",
    "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629",
    fac.id,
    `${fac.number}: ${libelle[avant]} \u2192 ${libelle[status]}${fac.notes ? ` \u2014 ${fac.notes}` : ""}`,
    date
  );
  return s;
}
function cancelSale(prev, saleId, reason2, userId, date) {
  const s = structuredClone(prev);
  const sale = s.sales.find((x) => x.id === saleId);
  if (!sale) throw new BusinessError("\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (sale.saleStatusId === saleStatusId(s, "CANCELLED")) return prev;
  const trip = sale.marketTripId ? s.marketTrips.find((t) => t.id === sale.marketTripId) : null;
  if (trip && trip.status !== "OPEN")
    throw new BusinessError("\u064A\u0648\u0645 \u0627\u0644\u0633\u0648\u0642 \u0645\u063A\u0644\u0642: \u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0644\u063A\u0627\u0621 \u0645\u0628\u064A\u0639\u0627\u062A\u0647");
  sale.saleStatusId = saleStatusId(s, "CANCELLED");
  if (!trip)
    for (const it of s.saleItems.filter((i) => i.saleId === saleId)) {
      s.stockMovements.unshift({
        id: nextId(s, "mv"),
        productId: it.productId,
        frigoId: sale.frigoId,
        quantity: it.quantity,
        movementType: "ENTREE",
        date,
        userId,
        reference: sale.number,
        notes: "\u0625\u0644\u063A\u0627\u0621 \u0628\u064A\u0639 \u2014 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062E\u0632\u0648\u0646"
      });
    }
  for (const pk of prev.packagingMovements.filter((m) => m.saleId === saleId)) {
    s.packagingMovements.unshift({
      id: nextId(s, "pk"),
      clientId: pk.clientId,
      packagingTypeId: pk.packagingTypeId,
      teamId: pk.teamId,
      saleId,
      type: pk.type === "SORTIE" ? "RETOUR" : "SORTIE",
      quantity: pk.quantity,
      date,
      userId,
      notes: `\u0625\u0644\u063A\u0627\u0621 \u0628\u064A\u0639 ${sale.number}`
    });
  }
  for (const c of s.credits.filter((c2) => c2.saleId === saleId))
    c.creditStatusId = creditStatusId(s, "CANCELLED");
  for (const f of s.invoices.filter((x) => x.saleId === saleId)) {
    f.status = "ANNULEE";
    f.notes ||= reason2;
    f.updatedAt = date;
  }
  const refunded = s.payments.filter((p) => p.saleId === saleId).reduce((a, p) => a + p.amount, 0) + s.creditPayments.filter((cp) => s.credits.find((c) => c.id === cp.creditId)?.saleId === saleId).reduce((a, p) => a + p.amount, 0);
  if (refunded > 0)
    s.cash.unshift({
      id: nextId(s, "cash"),
      teamId: sale.teamId,
      userId,
      type: "DECAISSEMENT",
      method: "ESPECES",
      amount: round(refunded),
      reference: sale.number,
      date,
      description: "\u0625\u0631\u062C\u0627\u0639 \u0645\u0628\u0644\u063A \u0628\u064A\u0639 \u0645\u0644\u063A\u0649"
    });
  audit(
    s,
    userId,
    "\u0625\u0644\u063A\u0627\u0621 \u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    "\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    saleId,
    `${sale.number} \u2014 ${reason2 || "\u0628\u062F\u0648\u0646 \u0633\u0628\u0628"}`,
    date
  );
  return s;
}
function saleStatusChoices(s, sale) {
  const code2 = s.saleStatuses.find((x) => x.id === sale.saleStatusId)?.code;
  if (code2 === "CANCELLED" || sale.paidAmount > 0) return [sale.saleStatusId];
  return [saleStatusId(s, "PENDING"), saleStatusId(s, "CONFIRMED")];
}
function setSaleStatus(prev, saleId, statusId, userId, date) {
  const s = structuredClone(prev);
  const sale = s.sales.find((x) => x.id === saleId);
  if (!sale) throw new BusinessError("\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
  if (sale.saleStatusId === statusId) return prev;
  if (sale.saleStatusId === saleStatusId(s, "CANCELLED"))
    throw new BusinessError("\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639 \u0645\u0644\u063A\u0627\u0629");
  if (!saleStatusChoices(s, sale).includes(statusId))
    throw new BusinessError(
      "\u0627\u0644\u062D\u0627\u0644\u0629 \u062A\u064F\u062D\u0633\u0628 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0645\u0646 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A: \u0633\u062C\u0651\u0644 \u062F\u0641\u0639\u0629\u060C \u0623\u0648 \u0627\u0633\u062A\u0639\u0645\u0644 \u0632\u0631 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0644\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0628\u064A\u0639"
    );
  const old = s.saleStatuses.find((x) => x.id === sale.saleStatusId)?.label;
  sale.saleStatusId = statusId;
  audit(
    s,
    userId,
    "\u062A\u063A\u064A\u064A\u0631 \u062D\u0627\u0644\u0629 \u0627\u0644\u0628\u064A\u0639",
    "\u0639\u0645\u0644\u064A\u0629 \u0628\u064A\u0639",
    saleId,
    `${sale.number}: ${old} \u2192 ${s.saleStatuses.find((x) => x.id === statusId)?.label}`,
    date
  );
  return s;
}
function addCreditPayment(prev, inp, userId, date) {
  const s = structuredClone(prev);
  const c = s.credits.find((x) => x.id === inp.creditId);
  if (!c) throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  const venteAnnulee = !!c.saleId && s.sales.find((x) => x.id === c.saleId)?.saleStatusId === saleStatusId(s, "CANCELLED");
  if (c.creditStatusId === creditStatusId(s, "CANCELLED") || venteAnnulee)
    throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u0645\u0644\u063A\u0649: \u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0633\u062C\u064A\u0644 \u062F\u0641\u0639\u0629 \u0639\u0644\u064A\u0647");
  const amount2 = round(inp.amount);
  if (!(amount2 > 0)) throw new BusinessError("\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
  if (amount2 > c.remainingAmount + 1e-9)
    throw new BusinessError(`\u0627\u0644\u0645\u0628\u0644\u063A \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0645\u062A\u0628\u0642\u064A \u0644\u0644\u0633\u062F\u0627\u062F (${c.remainingAmount} TND)`);
  c.paidAmount = round(c.paidAmount + amount2);
  c.remainingAmount = round(c.remainingAmount - amount2);
  c.creditStatusId = creditStatusId(s, c.remainingAmount === 0 ? "PAID" : "PARTIAL");
  s.creditPayments.unshift({
    id: nextId(s, "cp"),
    creditId: c.id,
    clientId: c.clientId,
    teamId: c.teamId,
    userId,
    amount: amount2,
    paymentDate: date,
    paymentMethod: inp.method,
    notes: inp.notes
  });
  if (c.saleId) {
    const sale = s.sales.find((x) => x.id === c.saleId);
    if (sale) {
      sale.paidAmount = round(sale.paidAmount + amount2);
      sale.remainingAmount = round(sale.remainingAmount - amount2);
      sale.saleStatusId = saleStatusId(s, sale.remainingAmount === 0 ? "PAID" : "PARTIAL");
    }
  }
  s.cash.unshift({
    id: nextId(s, "cash"),
    teamId: c.teamId,
    userId,
    type: "ENCAISSEMENT",
    method: inp.method,
    amount: amount2,
    reference: c.saleId ? s.sales.find((x) => x.id === c.saleId)?.number ?? "\u062F\u064A\u0646" : "\u062F\u064A\u0646",
    date,
    description: "\u0633\u062F\u0627\u062F \u062F\u064A\u0646"
  });
  audit(
    s,
    userId,
    "\u0625\u0636\u0627\u0641\u0629 \u062F\u0641\u0639\u0629",
    "\u062F\u064A\u0646",
    c.id,
    `${amount2} TND \u2014 \u0627\u0644\u0645\u062A\u0628\u0642\u064A ${c.remainingAmount} TND`,
    date
  );
  return s;
}
function addManualCredit(prev, inp, userId, date) {
  if (isMarketClient(prev, inp.clientId))
    throw new BusinessError("\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064A\u0644 \u062A\u0627\u0628\u0639 \u0644\u0633\u0648\u0642: \u062F\u064A\u0648\u0646\u0647 \u062A\u064F\u062F\u0627\u0631 \u0645\u0646 \u0642\u0633\u0645 \u0627\u0644\u0623\u0633\u0648\u0627\u0642");
  return manualCredit(prev, inp, userId, date);
}
function manualCredit(prev, inp, userId, date) {
  const s = structuredClone(prev);
  if (!inp.clientId || !inp.teamId || !(inp.amount > 0))
    throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u0648\u0641\u0631\u064A\u0642 \u0641\u064A\u063A\u0648 \u0648\u0627\u0644\u0645\u0628\u0644\u063A \u0645\u0637\u0644\u0648\u0628\u0629");
  const id = nextId(s, "cr");
  s.credits.unshift({
    id,
    clientId: inp.clientId,
    teamId: inp.teamId,
    creditStatusId: creditStatusId(s, "ACTIVE"),
    totalAmount: inp.amount,
    paidAmount: 0,
    remainingAmount: inp.amount,
    dueDate: inp.dueDate,
    createdAt: date,
    notes: inp.notes
  });
  audit(s, userId, "\u0625\u0646\u0634\u0627\u0621 \u062F\u064A\u0646", "\u062F\u064A\u0646", id, `${inp.amount} TND`, date);
  return s;
}
var statutCalcule = (s, c) => creditStatusId(s, c.remainingAmount <= 0 ? "PAID" : c.paidAmount > 0 ? "PARTIAL" : "ACTIVE");
function creditStatusChoices(s, c) {
  if (c.saleId) return [c.creditStatusId];
  if (c.creditStatusId === creditStatusId(s, "CANCELLED"))
    return [c.creditStatusId, statutCalcule(s, c)];
  return [c.creditStatusId, creditStatusId(s, "CANCELLED")];
}
function setCreditStatus(prev, creditId, statusId, userId, date) {
  const s = structuredClone(prev);
  const c = s.credits.find((x) => x.id === creditId);
  if (!c) throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (c.creditStatusId === statusId) return prev;
  if (c.saleId)
    throw new BusinessError("\u062F\u064A\u0646 \u0645\u0631\u062A\u0628\u0637 \u0628\u0628\u064A\u0639: \u064A\u064F\u0633\u062F\u064E\u0651\u062F \u0628\u062A\u0633\u062C\u064A\u0644 \u062F\u0641\u0639\u0629\u060C \u0648\u064A\u064F\u0644\u063A\u0649 \u0628\u0625\u0644\u063A\u0627\u0621 \u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0628\u064A\u0639");
  if (!creditStatusChoices(s, c).includes(statusId))
    throw new BusinessError("\u0627\u0644\u062D\u0627\u0644\u0629 \u062A\u064F\u062D\u0633\u0628 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0645\u0646 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A: \u0633\u062C\u0651\u0644 \u062F\u0641\u0639\u0629");
  c.creditStatusId = statusId;
  audit(
    s,
    userId,
    "\u062A\u0639\u062F\u064A\u0644 \u062F\u064A\u0646",
    "\u062F\u064A\u0646",
    creditId,
    `\u0627\u0644\u062D\u0627\u0644\u0629 \u2190 ${s.creditStatuses.find((x) => x.id === statusId)?.label}`,
    date
  );
  return s;
}
function addStockMovement(prev, inp, userId, date) {
  const s = structuredClone(prev);
  if (!inp.productId || !inp.frigoId || !inp.quantity)
    throw new BusinessError("\u0627\u0644\u0645\u0646\u062A\u062C \u0648\u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F \u0648\u0627\u0644\u0643\u0645\u064A\u0629 \u0645\u0637\u0644\u0648\u0628\u0629");
  if (inp.movementType !== "AJUSTEMENT" && inp.quantity < 0)
    throw new BusinessError("\u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0627\u0644\u0643\u0645\u064A\u0629 \u0645\u0648\u062C\u0628\u0629");
  if (inp.movementType === "TRANSFERT") {
    if (!inp.toFrigoId || inp.toFrigoId === inp.frigoId)
      throw new BusinessError("\u0627\u062E\u062A\u0631 \u063A\u0631\u0641\u0629 \u062A\u0628\u0631\u064A\u062F \u0648\u062C\u0647\u0629 \u0645\u062E\u062A\u0644\u0641\u0629");
  }
  const av = stockOf(s, inp.productId, inp.frigoId);
  const out = inp.movementType === "SORTIE" || inp.movementType === "TRANSFERT" ? inp.quantity : inp.movementType === "AJUSTEMENT" && inp.quantity < 0 ? -inp.quantity : 0;
  if (out > av) throw new BusinessError(`\u0645\u062E\u0632\u0648\u0646 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D (${av} \u0645\u062A\u0648\u0641\u0631\u0629)`);
  const id = nextId(s, "mv");
  const reference = inp.reference || prochaineReference(
    s.stockMovements.map((m) => m.reference),
    "MVT",
    date
  );
  s.stockMovements.unshift({ id, ...inp, reference, date, userId });
  const p = s.products.find((x) => x.id === inp.productId)?.name;
  audit(
    s,
    userId,
    "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u062E\u0632\u0648\u0646",
    "\u0627\u0644\u0645\u062E\u0632\u0648\u0646",
    id,
    `${inp.movementType} ${inp.quantity} \u2014 ${p}`,
    date
  );
  return s;
}
function saveProduct(prev, item, stock, userId, date) {
  let s = upsert(prev, "products", item, userId, date);
  if (stock && stock.quantity > 0) {
    const productId = item.id ?? s.products[0].id;
    s = addStockMovement(
      s,
      {
        productId,
        frigoId: stock.frigoId,
        quantity: stock.quantity,
        movementType: "ENTREE",
        reference: s.products.find((p) => p.id === productId)?.reference ?? "",
        notes: item.id ? "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0645\u0646\u062A\u062C" : "\u0645\u062E\u0632\u0648\u0646 \u0623\u0648\u0644\u064A"
      },
      userId,
      date
    );
  }
  return s;
}
function addPackMovement(prev, inp, userId, date) {
  const s = structuredClone(prev);
  if (!inp.clientId || !inp.packagingTypeId || !inp.teamId || !(inp.quantity > 0))
    throw new BusinessError("\u0643\u0644 \u0627\u0644\u062D\u0642\u0648\u0644 \u0645\u0637\u0644\u0648\u0628\u0629");
  const own = isClientBoxType(s, inp.packagingTypeId);
  if (own && inp.type === "SORTIE") {
    const b = clientBoxBalance(s, { clientId: inp.clientId, teamId: inp.teamId });
    if (inp.quantity > b.owed)
      throw new BusinessError(`\u0644\u062F\u064A\u0646\u0627 \u0641\u0642\u0637 ${b.owed} \u0645\u0646 \u0635\u0646\u0627\u062F\u064A\u0642 \u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064A\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0641\u0631\u064A\u0642`);
  }
  if (!own && inp.type === "RETOUR") {
    const b = packBalance(s, {
      clientId: inp.clientId,
      typeId: inp.packagingTypeId,
      teamId: inp.teamId
    });
    if (inp.quantity > b.remaining)
      throw new BusinessError(`\u0644\u062F\u0649 \u0627\u0644\u0639\u0645\u064A\u0644 \u0641\u0642\u0637 ${b.remaining} \u0635\u0646\u0627\u062F\u064A\u0642 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639 \u0644\u0647\u0630\u0627 \u0627\u0644\u0641\u0631\u064A\u0642`);
  }
  const id = nextId(s, "pk");
  s.packagingMovements.unshift({ id, ...inp, date, userId });
  const t = s.packagingTypes.find((x) => x.id === inp.packagingTypeId)?.name;
  const action = own ? inp.type === "RETOUR" ? "\u0627\u0633\u062A\u0644\u0627\u0645 \u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644" : "\u0625\u0631\u062C\u0627\u0639 \u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644 \u0625\u0644\u064A\u0647" : inp.type === "RETOUR" ? "\u0625\u0631\u062C\u0627\u0639 \u0635\u0646\u0627\u062F\u064A\u0642" : "\u062A\u0633\u0644\u064A\u0645 \u0635\u0646\u0627\u062F\u064A\u0642";
  audit(s, userId, action, "\u0635\u0646\u062F\u0648\u0642", id, `${inp.quantity} \xD7 ${t}`, date);
  return s;
}
var cashBalance = (s, teamId) => round(
  s.cash.filter((c) => c.teamId === teamId).reduce((a, c) => a + (c.type === "ENCAISSEMENT" ? c.amount : -c.amount), 0)
);
function addCash(prev, inp, userId, date) {
  const s = structuredClone(prev);
  if (!inp.teamId || !(inp.amount > 0)) throw new BusinessError("\u0641\u0631\u064A\u0642 \u0641\u064A\u063A\u0648 \u0648\u0627\u0644\u0645\u0628\u0644\u063A \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  if (inp.type === "DECAISSEMENT") {
    const solde = cashBalance(s, inp.teamId);
    if (inp.amount > solde + 1e-9)
      throw new BusinessError(`\u0631\u0635\u064A\u062F \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D (${solde} TND \u0645\u062A\u0648\u0641\u0631\u0629)`);
  }
  const id = nextId(s, "cash");
  const reference = prochaineReference(
    s.cash.map((c) => c.reference),
    "CAI",
    date
  );
  s.cash.unshift({ id, ...inp, reference, userId, date });
  audit(
    s,
    userId,
    inp.type === "ENCAISSEMENT" ? "\u0642\u0628\u0636 \u064A\u062F\u0648\u064A" : "\u0635\u0631\u0641",
    "\u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064A",
    id,
    `${inp.amount} TND \u2014 ${inp.description}`,
    date
  );
  return s;
}
var LABEL = {
  clients: "\u0627\u0644\u0639\u0645\u064A\u0644",
  products: "\u0627\u0644\u0645\u0646\u062A\u062C",
  frigos: "\u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F",
  packagingTypes: "\u0646\u0648\u0639 \u0627\u0644\u0635\u0646\u062F\u0648\u0642",
  teams: "\u0641\u064A\u063A\u0648",
  users: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645",
  roles: "\u0627\u0644\u062F\u0648\u0631"
};
function upsert(prev, coll, item, userId, date) {
  const s = structuredClone(prev);
  const list2 = s[coll];
  if (item.id) {
    const i = list2.findIndex((x) => x.id === item.id);
    const old = list2[i];
    let details = "\u062A\u062D\u062F\u064A\u062B";
    if (coll === "products" && old["salePrice"] !== item["salePrice"]) {
      details = `\u0627\u0644\u0633\u0639\u0631 ${old["salePrice"]} \u2192 ${item["salePrice"]} TND`;
      audit(s, userId, "\u062A\u0639\u062F\u064A\u0644 \u0633\u0639\u0631 \u0627\u0644\u0645\u0646\u062A\u062C", LABEL[coll], item.id, details, date);
    } else
      audit(s, userId, `\u062A\u0639\u062F\u064A\u0644 ${LABEL[coll].toLowerCase()}`, LABEL[coll], item.id, details, date);
    list2[i] = { ...list2[i], ...item };
  } else {
    const id = nextId(s, coll.slice(0, 3));
    list2.unshift({ ...item, id });
    audit(
      s,
      userId,
      `\u0625\u0646\u0634\u0627\u0621 ${LABEL[coll].toLowerCase()}`,
      LABEL[coll],
      id,
      String(item["name"] ?? ""),
      date
    );
  }
  return s;
}
function remove(prev, coll, id, userId, date) {
  const s = structuredClone(prev);
  const used = coll === "clients" && (s.sales.some((x) => x.clientId === id) || s.packagingMovements.some((x) => x.clientId === id)) || coll === "products" && s.saleItems.some((x) => x.productId === id) || coll === "frigos" && s.stockMovements.some((x) => x.frigoId === id || x.toFrigoId === id) || coll === "packagingTypes" && s.packagingMovements.some((x) => x.packagingTypeId === id) || coll === "teams" && s.sales.some((x) => x.teamId === id);
  if (used) throw new BusinessError("\u0627\u0644\u0639\u0646\u0635\u0631 \u0645\u0633\u062A\u062E\u062F\u0645 \u0641\u064A \u0639\u0645\u0644\u064A\u0627\u062A: \u0639\u0637\u0651\u0644\u0647 \u0628\u062F\u0644\u0627\u064B \u0645\u0646 \u062D\u0630\u0641\u0647");
  s[coll] = s[coll].filter((x) => x.id !== id);
  audit(s, userId, `\u062D\u0630\u0641 ${LABEL[coll].toLowerCase()}`, LABEL[coll], id, "", date);
  return s;
}

// ../frere-flow/src/services/markets.ts
var round2 = (n) => Math.round(n * 1e3) / 1e3;
function tripSales(s, tripId) {
  return s.sales.filter((x) => x.marketTripId === tripId && x.saleStatusId !== "ss_cancelled");
}
function tripProductBalance(s, trip) {
  const saleIds = new Set(tripSales(s, trip.id).map((x) => x.id));
  const map = /* @__PURE__ */ new Map();
  for (const l of trip.loads) {
    const r = map.get(l.productId) ?? { loaded: 0, sold: 0, remaining: 0 };
    r.loaded += l.quantity;
    map.set(l.productId, r);
  }
  for (const i of s.saleItems) {
    if (!saleIds.has(i.saleId)) continue;
    const r = map.get(i.productId);
    if (r) r.sold += i.quantity;
  }
  for (const r of map.values()) {
    r.loaded = round2(r.loaded);
    r.sold = round2(r.sold);
    r.remaining = round2(r.loaded - r.sold);
  }
  return map;
}
function tripBoxBalance(s, trip) {
  const saleIds = new Set(tripSales(s, trip.id).map((x) => x.id));
  const map = /* @__PURE__ */ new Map();
  for (const b of trip.boxes) {
    const r = map.get(b.typeId) ?? { loaded: 0, given: 0, remaining: 0 };
    r.loaded += b.quantity;
    map.set(b.typeId, r);
  }
  for (const m of s.packagingMovements) {
    if (m.type !== "SORTIE" || !m.saleId || !saleIds.has(m.saleId)) continue;
    const r = map.get(m.packagingTypeId);
    if (r) r.given += m.quantity;
  }
  for (const r of map.values()) r.remaining = r.loaded - r.given;
  return map;
}
function tripTotals(s, trip) {
  const sales = tripSales(s, trip.id);
  const ids = new Set(sales.map((x) => x.id));
  const creditIds = new Set(
    s.credits.filter((c) => c.saleId && ids.has(c.saleId)).map((c) => c.id)
  );
  const receipts = [
    ...s.payments.filter((p) => ids.has(p.saleId)),
    ...s.creditPayments.filter((p) => creditIds.has(p.creditId))
  ].filter((p) => !trip.closing || p.paymentDate <= trip.closing.closedAt);
  const sent = round2(trip.loads.reduce((a, l) => a + l.quantity, 0));
  const total = round2(sales.reduce((a, x) => a + x.totalAmount, 0));
  const paid2 = round2(receipts.reduce((a, x) => a + x.amount, 0));
  const cash = round2(
    receipts.filter((x) => x.paymentMethod === "ESPECES").reduce((a, x) => a + x.amount, 0)
  );
  const cheques = round2(
    receipts.filter((x) => x.paymentMethod === "CHEQUE").reduce((a, x) => a + x.amount, 0)
  );
  return { sent, total, paid: paid2, remaining: round2(total - paid2), cash, cheques, count: sales.length };
}
function saveMarket(prev, inp, userId, date) {
  if (!inp.name.trim() || !inp.city.trim()) throw new BusinessError("\u0627\u0633\u0645 \u0627\u0644\u0633\u0648\u0642 \u0648\u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  const s = structuredClone(prev);
  const existing2 = inp.id ? s.markets.find((m) => m.id === inp.id) : void 0;
  if (inp.id && !existing2) throw new BusinessError("\u0627\u0644\u0633\u0648\u0642 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  const id = existing2?.id ?? nextId(s, "mkt");
  if (existing2) {
    existing2.name = inp.name.trim();
    existing2.nameAlt = inp.nameAlt?.trim() ?? "";
    existing2.city = inp.city.trim();
  } else
    s.markets.push({
      id,
      name: inp.name.trim(),
      nameAlt: inp.nameAlt?.trim() ?? "",
      city: inp.city.trim(),
      active: true
    });
  s.auditLogs.unshift({
    id: nextId(s, "log"),
    userId,
    action: "\u062D\u0641\u0638 \u0627\u0644\u0633\u0648\u0642",
    entity: "\u0627\u0644\u0633\u0648\u0642",
    entityId: id,
    details: inp.name.trim(),
    date
  });
  return s;
}
function saveMarketClient(prev, inp, userId, date) {
  if (!prev.markets.some((m) => m.id === inp.marketId && m.active) || !inp.name.trim())
    throw new BusinessError("\u0627\u0644\u0633\u0648\u0642 \u0648\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  const s = structuredClone(prev);
  const existing2 = inp.id ? s.clients.find((c) => c.id === inp.id) : void 0;
  if (inp.id && (!existing2 || existing2.marketId !== inp.marketId))
    throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u062A\u0627\u0628\u0639 \u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0648\u0642");
  const id = existing2?.id ?? nextId(s, "mc");
  if (existing2)
    Object.assign(existing2, {
      name: inp.name.trim(),
      nameAlt: inp.nameAlt?.trim() ?? "",
      phone: inp.phone.trim(),
      address: inp.address.trim()
    });
  else
    s.clients.push({
      id,
      marketId: inp.marketId,
      code: `MC-${s.seq}`,
      name: inp.name.trim(),
      nameAlt: inp.nameAlt?.trim() ?? "",
      phone: inp.phone.trim(),
      address: inp.address.trim(),
      email: "",
      taxId: "",
      active: true,
      createdAt: date
    });
  s.auditLogs.unshift({
    id: nextId(s, "log"),
    userId,
    action: "\u062D\u0641\u0638 \u0639\u0645\u064A\u0644 \u0627\u0644\u0633\u0648\u0642",
    entity: "\u0627\u0644\u0639\u0645\u064A\u0644",
    entityId: id,
    details: inp.name.trim(),
    date
  });
  return s;
}
function createMarketTrip(prev, inp, userId, date) {
  const s = structuredClone(prev);
  let marketId = inp.marketId;
  if (!marketId && inp.newMarketName?.trim()) {
    marketId = nextId(s, "mkt");
    s.markets.push({
      id: marketId,
      name: inp.newMarketName.trim(),
      city: inp.newMarketName.trim(),
      active: true
    });
  }
  if (!s.markets.some((m) => m.id === marketId && m.active) || !s.teams.some((t) => t.id === inp.teamId && t.active))
    throw new BusinessError("\u0627\u0644\u0633\u0648\u0642 \u0648\u0641\u0631\u064A\u0642 \u0641\u064A\u063A\u0648 \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  const loads = inp.loads.filter((l) => l.productId && l.frigoId && l.quantity > 0);
  if (!loads.length) throw new BusinessError("\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
  const need = /* @__PURE__ */ new Map();
  loads.forEach(
    (l) => need.set(
      `${l.productId}|${l.frigoId}`,
      (need.get(`${l.productId}|${l.frigoId}`) ?? 0) + l.quantity
    )
  );
  for (const [k, q] of need) {
    const [pid, fid] = k.split("|");
    const av = stockOf(s, pid, fid);
    if (av < q) {
      const p = s.products.find((x) => x.id === pid);
      throw new BusinessError(
        `\u0645\u062E\u0632\u0648\u0646 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0644\u0645\u0646\u062A\u062C ${p?.name} (${av} ${p?.unit} \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F)`
      );
    }
  }
  const id = inp.id || nextId(s, "trip");
  if (s.marketTrips.some((t) => t.id === id)) throw new BusinessError("\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0639\u0645\u0644\u064A\u0629");
  const number = `MK-${date.slice(0, 4)}-${String(s.marketTrips.length + 1).padStart(4, "0")}`;
  const boxes = inp.boxes.filter(
    (b) => b.typeId && b.quantity > 0 && !isClientBoxType(s, b.typeId)
  );
  s.marketTrips.unshift({
    id,
    number,
    marketId,
    teamId: inp.teamId,
    date,
    userId,
    status: "OPEN",
    loads,
    boxes,
    notes: inp.notes
  });
  for (const l of loads) {
    s.stockMovements.unshift({
      id: nextId(s, "mv"),
      productId: l.productId,
      frigoId: l.frigoId,
      quantity: l.quantity,
      movementType: "SORTIE",
      date,
      userId,
      reference: number,
      notes: "\u0625\u0631\u0633\u0627\u0644 \u0625\u0644\u0649 \u0627\u0644\u0633\u0648\u0642"
    });
  }
  s.auditLogs.unshift({
    id: nextId(s, "log"),
    userId,
    action: "\u0625\u0631\u0633\u0627\u0644 \u0625\u0644\u0649 \u0627\u0644\u0633\u0648\u0642",
    entity: "\u0627\u0644\u0633\u0648\u0642",
    entityId: id,
    details: `${number} \u2014 ${round2(loads.reduce((a, l) => a + l.quantity, 0))} kg`,
    date
  });
  return s;
}
function createMarketSale(prev, inp, userId, date) {
  const trip = prev.marketTrips.find((t) => t.id === inp.tripId);
  if (!trip) throw new BusinessError("\u0627\u0644\u0633\u0648\u0642 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (trip.status !== "OPEN") throw new BusinessError("\u064A\u0648\u0645 \u0627\u0644\u0633\u0648\u0642 \u0645\u063A\u0644\u0642");
  const client2 = prev.clients.find((c) => c.id === inp.clientId && c.active);
  if (!client2 || client2.marketId !== trip.marketId)
    throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u062A\u0627\u0628\u0639 \u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0648\u0642");
  const items = inp.items.filter((i) => i.productId && i.quantity > 0);
  if (!items.length) throw new BusinessError("\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
  const bal = tripProductBalance(prev, trip);
  const need = /* @__PURE__ */ new Map();
  items.forEach((i) => need.set(i.productId, (need.get(i.productId) ?? 0) + i.quantity));
  for (const [pid, q] of need) {
    const av = bal.get(pid)?.remaining ?? 0;
    if (av < q) {
      const p = prev.products.find((x) => x.id === pid);
      throw new BusinessError(`\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064A\u0629 \u0641\u064A \u0627\u0644\u0634\u0627\u062D\u0646\u0629 \u0644\u0644\u0645\u0646\u062A\u062C ${p?.name} (${av} ${p?.unit})`);
    }
  }
  const boxBal = tripBoxBalance(prev, trip);
  const boxesNeed = /* @__PURE__ */ new Map();
  for (const b of inp.boxes.filter((x) => x.quantity > 0 && !isClientBoxType(prev, x.typeId)))
    boxesNeed.set(b.typeId, (boxesNeed.get(b.typeId) ?? 0) + b.quantity);
  for (const [typeId, quantity] of boxesNeed) {
    if ((boxBal.get(typeId)?.remaining ?? 0) < quantity)
      throw new BusinessError("\u0639\u062F\u062F \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u064A\u062A\u062C\u0627\u0648\u0632 \u0627\u0644\u0645\u062A\u0648\u0641\u0631 \u0641\u064A \u0627\u0644\u0634\u0627\u062D\u0646\u0629");
  }
  const source = trip.loads[0];
  if (!source) throw new BusinessError("\u0623\u0636\u0641 \u0645\u0646\u062A\u062C\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
  return createSale(
    prev,
    {
      clientId: inp.clientId,
      teamId: trip.teamId,
      frigoId: source.frigoId,
      items,
      paid: inp.paid,
      method: inp.method,
      notes: inp.notes,
      packaging: inp.boxes,
      marketTripId: trip.id
    },
    userId,
    date
  );
}
function closeMarketTrip(prev, inp, userId, date) {
  const s = structuredClone(prev);
  const trip = s.marketTrips.find((t) => t.id === inp.tripId);
  if (!trip) throw new BusinessError("\u0627\u0644\u0633\u0648\u0642 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (trip.status !== "OPEN") throw new BusinessError("\u064A\u0648\u0645 \u0627\u0644\u0633\u0648\u0642 \u0645\u063A\u0644\u0642");
  const bal = tripProductBalance(s, trip);
  const boxBal = tripBoxBalance(s, trip);
  const totals = tripTotals(s, trip);
  const returns = [];
  let goodsGap = 0;
  for (const [pid, b] of bal) {
    const q = Math.max(inp.returns.find((r) => r.productId === pid)?.quantity ?? 0, 0);
    if (q > b.remaining) {
      const p = s.products.find((x) => x.id === pid);
      throw new BusinessError(`\u0627\u0644\u0643\u0645\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u062C\u0639\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0627\u0644\u0645\u062A\u0628\u0642\u064A \u0644\u0644\u0645\u0646\u062A\u062C ${p?.name}`);
    }
    goodsGap += q - b.remaining;
    let sold = b.sold;
    let left = q;
    for (const load of trip.loads.filter((l) => l.productId === pid)) {
      const consumed = Math.min(sold, load.quantity);
      sold = round2(sold - consumed);
      const quantity = round2(Math.min(left, load.quantity - consumed));
      if (quantity > 0) returns.push({ productId: pid, frigoId: load.frigoId, quantity });
      left = round2(left - quantity);
    }
  }
  let boxesGap = 0;
  const boxesReturned = [];
  for (const [tid, b] of boxBal) {
    const q = Math.max(inp.boxesReturned.find((r) => r.typeId === tid)?.quantity ?? 0, 0);
    boxesGap += q - b.remaining;
    boxesReturned.push({ typeId: tid, quantity: q });
  }
  const cashCounted = round2(Math.max(inp.cashCounted || 0, 0));
  const chequesCounted = round2(Math.max(inp.chequesCounted || 0, 0));
  const cashGap = round2(cashCounted + chequesCounted - totals.cash - totals.cheques);
  for (const r of returns) {
    s.stockMovements.unshift({
      id: nextId(s, "mv"),
      productId: r.productId,
      frigoId: r.frigoId,
      quantity: r.quantity,
      movementType: "ENTREE",
      date,
      userId,
      reference: trip.number,
      notes: "\u0645\u0631\u062A\u062C\u0639 \u0627\u0644\u0633\u0648\u0642"
    });
  }
  trip.status = "CLOSED";
  trip.closing = {
    returns,
    boxesReturned,
    cashCounted,
    chequesCounted,
    expectedCash: totals.cash,
    expectedCheques: totals.cheques,
    goodsGap: round2(goodsGap),
    boxesGap,
    cashGap,
    notes: inp.notes,
    closedAt: date,
    closedBy: userId
  };
  s.auditLogs.unshift({
    id: nextId(s, "log"),
    userId,
    action: "\u0625\u063A\u0644\u0627\u0642 \u064A\u0648\u0645 \u0627\u0644\u0633\u0648\u0642",
    entity: "\u0627\u0644\u0633\u0648\u0642",
    entityId: trip.id,
    details: `${trip.number} \u2014 \u0641\u0627\u0631\u0642 \u0627\u0644\u0628\u0636\u0627\u0639\u0629 ${round2(goodsGap)} kg\u060C \u0641\u0627\u0631\u0642 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 ${cashGap} TND`,
    date
  });
  return s;
}

// ../frere-flow/src/services/deadlines.ts
import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
var round3 = (n) => Math.round(n * 1e3) / 1e3;
var dateKey = (date) => format(date, "yyyy-MM-dd");
function deadlineStatus(s, c, today) {
  if (c.deadlineCancelled || s.creditStatuses.find((x) => x.id === c.creditStatusId)?.code === "CANCELLED")
    return "CANCELLED";
  if (c.remainingAmount === 0) return "PAID";
  const days = differenceInCalendarDays(parseISO(c.dueDate), parseISO(today));
  return days < 0 ? "OVERDUE" : days <= 3 ? "SOON" : "UPCOMING";
}
function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValid(parseISO(date)) || dateKey(parseISO(date)) !== date)
    throw new BusinessError("\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
}
function validLead(days) {
  if (!Number.isInteger(days) || days < 0 || days > 365)
    throw new BusinessError("\u0645\u062F\u0629 \u0627\u0644\u062A\u0630\u0643\u064A\u0631 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629");
}
function audit2(s, id, userId, date, action, details) {
  s.auditLogs.unshift({
    id: nextId(s, "log"),
    userId,
    date,
    entity: "\u062F\u064A\u0646",
    entityId: id,
    action,
    details
  });
}
function createDeadline(prev, inp, userId, date) {
  validDate(inp.dueDate);
  validLead(inp.reminderDays);
  const client2 = prev.clients.find((x) => x.id === inp.clientId && x.active);
  if (!client2) throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (!prev.teams.some((x) => x.id === inp.teamId && x.active))
    throw new BusinessError("\u0641\u0631\u064A\u0642 \u0641\u064A\u063A\u0648 \u0648\u0627\u0644\u0645\u0628\u0644\u063A \u0645\u0637\u0644\u0648\u0628\u0627\u0646");
  if (!Number.isFinite(inp.amount) || round3(inp.amount) <= 0)
    throw new BusinessError("\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
  if (!!inp.frigoId === !!inp.marketId) throw new BusinessError("\u0627\u062E\u062A\u0631 \u063A\u0631\u0641\u0629 \u062A\u0628\u0631\u064A\u062F \u0623\u0648 \u0633\u0648\u0642\u0627\u064B");
  if (inp.frigoId && !prev.frigos.some((x) => x.id === inp.frigoId && x.active))
    throw new BusinessError("\u0627\u062E\u062A\u0631 \u063A\u0631\u0641\u0629 \u062A\u0628\u0631\u064A\u062F \u0623\u0648 \u0633\u0648\u0642\u0627\u064B");
  if (inp.marketId && (!prev.markets.some((x) => x.id === inp.marketId && x.active) || client2.marketId !== inp.marketId))
    throw new BusinessError("\u0627\u0644\u0639\u0645\u064A\u0644 \u063A\u064A\u0631 \u062A\u0627\u0628\u0639 \u0644\u0647\u0630\u0627 \u0627\u0644\u0633\u0648\u0642");
  const s = manualCredit(prev, { ...inp, amount: round3(inp.amount) }, userId, date);
  const c = s.credits[0];
  if (!c) throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  Object.assign(c, {
    frigoId: inp.frigoId,
    marketId: inp.marketId,
    reminderDays: inp.reminderDays
  });
  return s;
}
function updateDeadline(prev, inp, userId, date) {
  const s = structuredClone(prev);
  const c = s.credits.find((x) => x.id === inp.creditId);
  if (!c) throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (deadlineStatus(s, c, date.slice(0, 10)) === "CANCELLED")
    throw new BusinessError("\u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0645\u0644\u063A\u0649");
  validDate(inp.dueDate);
  validLead(inp.reminderDays);
  if (c.dueDate !== inp.dueDate && !inp.reason.trim())
    throw new BusinessError("\u0633\u0628\u0628 \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u062A\u0627\u0631\u064A\u062E \u0645\u0637\u0644\u0648\u0628");
  if (!Number.isFinite(inp.amount) || inp.amount <= 0 || round3(inp.amount) < c.paidAmount)
    throw new BusinessError("\u0627\u0644\u0645\u0628\u0644\u063A \u0623\u0642\u0644 \u0645\u0646 \u0627\u0644\u0645\u062F\u0641\u0648\u0639");
  if (c.saleId && round3(inp.amount) !== c.totalAmount)
    throw new BusinessError("\u0645\u0628\u0644\u063A \u0627\u0644\u0628\u064A\u0639 \u062B\u0627\u0628\u062A\u060C \u0623\u0636\u0641 \u062F\u0641\u0639\u0629");
  const before = `${c.dueDate} \xB7 ${c.totalAmount}`;
  c.dueDate = inp.dueDate;
  c.totalAmount = round3(inp.amount);
  c.remainingAmount = round3(c.totalAmount - c.paidAmount);
  c.reminderDays = inp.reminderDays;
  c.notes = inp.notes;
  const code2 = c.remainingAmount === 0 ? "PAID" : c.paidAmount > 0 ? "PARTIAL" : "ACTIVE";
  const status = s.creditStatuses.find((x) => x.code === code2);
  if (status) c.creditStatusId = status.id;
  audit2(
    s,
    c.id,
    userId,
    date,
    "\u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642",
    `${before} \u2192 ${c.dueDate} \xB7 ${c.totalAmount} \xB7 ${inp.reason}`
  );
  return s;
}
function payDeadline(prev, inp, userId, date) {
  const c = prev.credits.find((x) => x.id === inp.creditId);
  if (!c || ["PAID", "CANCELLED"].includes(deadlineStatus(prev, c, date.slice(0, 10))))
    throw new BusinessError("\u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0645\u0633\u062F\u062F \u0623\u0648 \u0645\u0644\u063A\u0649");
  if (!Number.isFinite(inp.amount)) throw new BusinessError("\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
  return addCreditPayment(prev, inp, userId, date);
}
function markReminder(prev, creditId, userId, date) {
  const s = structuredClone(prev);
  const c = s.credits.find((x) => x.id === creditId);
  if (!c || ["PAID", "CANCELLED"].includes(deadlineStatus(s, c, date.slice(0, 10))))
    throw new BusinessError("\u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0645\u0633\u062F\u062F \u0623\u0648 \u0645\u0644\u063A\u0649");
  c.reminderHistory ??= [];
  if (c.reminderHistory.some(
    (x) => x.date.slice(0, 10) === date.slice(0, 10) && x.dueDate === c.dueDate
  ))
    return prev;
  c.reminderHistory.unshift({ date, userId, dueDate: c.dueDate });
  audit2(s, c.id, userId, date, "\u062A\u0645\u062A \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0639\u0645\u064A\u0644", c.dueDate);
  return s;
}
function cancelDeadline(prev, creditId, reason2, userId, date) {
  const s = structuredClone(prev);
  const c = s.credits.find((x) => x.id === creditId);
  if (!c) throw new BusinessError("\u0627\u0644\u062F\u064A\u0646 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F");
  if (!reason2.trim()) throw new BusinessError("\u0633\u0628\u0628 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 \u0645\u0637\u0644\u0648\u0628");
  c.deadlineCancelled = true;
  audit2(s, c.id, userId, date, "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642", reason2);
  return s;
}

// ../frere-flow/src/lib/translit.ts
var hasArabic = (s) => /[؀-ۿ]/.test(s);
var DICO = {
  \u0645\u062D\u0645\u062F: "Mohamed",
  \u0623\u062D\u0645\u062F: "Ahmed",
  \u0627\u062D\u0645\u062F: "Ahmed",
  \u0645\u062D\u0645\u0648\u062F: "Mahmoud",
  \u0639\u0644\u064A: "Ali",
  \u0639\u0645\u0631: "Omar",
  \u0639\u062B\u0645\u0627\u0646: "Othman",
  \u0645\u0635\u0637\u0641\u0649: "Mustapha",
  \u064A\u0648\u0633\u0641: "Youssef",
  \u0625\u0628\u0631\u0627\u0647\u064A\u0645: "Ibrahim",
  \u0627\u0628\u0631\u0627\u0647\u064A\u0645: "Ibrahim",
  \u062E\u0627\u0644\u062F: "Khaled",
  \u0643\u0631\u064A\u0645: "Karim",
  \u0633\u0627\u0645\u064A: "Sami",
  \u0648\u0644\u064A\u062F: "Walid",
  \u0631\u064A\u0627\u0636: "Riadh",
  \u0646\u0627\u062F\u064A\u0629: "Nadia",
  \u0641\u0627\u0637\u0645\u0629: "Fatma",
  \u0623\u0645\u064A\u0631\u0629: "Amira",
  \u0627\u0645\u064A\u0631\u0629: "Amira",
  \u0633\u0646\u0627\u0621: "Sana",
  \u0633\u0646\u064A\u0629: "Sonia",
  \u0647\u0627\u062F\u064A: "Hedi",
  \u0627\u0644\u0647\u0627\u062F\u064A: "Hedi",
  \u062D\u0645\u062F\u064A: "Hamdi",
  \u0645\u0646\u064A\u0631: "Mounir",
  \u0639\u0627\u062F\u0644: "Adel",
  \u0644\u064A\u0644\u0649: "Leila",
  \u0645\u062D\u062C\u0648\u0628: "Mahjoub",
  \u0627\u0644\u0637\u0631\u0627\u0628\u0644\u0633\u064A: "Trabelsi",
  \u0637\u0631\u0627\u0628\u0644\u0633\u064A: "Trabelsi",
  \u0627\u0644\u062D\u062F\u0627\u062F: "Haddad",
  \u062D\u062F\u0627\u062F: "Haddad",
  \u0643\u0645\u0648\u0646: "Kammoun",
  \u0634\u0639\u0628\u0627\u0646: "Chaabane",
  \u0627\u0644\u0635\u063A\u064A\u0631: "Sghaier",
  \u0627\u0644\u0642\u0627\u0633\u0645\u064A: "Gasmi",
  \u0642\u0627\u0633\u0645\u064A: "Gasmi",
  \u0628\u0646: "Ben",
  \u0628\u0646\u062A: "Bent",
  \u0639\u0628\u062F: "Abdel",
  \u0627\u0644\u0644\u0647: "lah",
  \u0639\u0628\u062F\u0627\u0644\u0644\u0647: "Abdallah",
  "\u0639\u0628\u062F \u0627\u0644\u0644\u0647": "Abdallah",
  \u0635\u0627\u0644\u062D: "Salah",
  \u0635\u0644\u0627\u062D: "Salah",
  \u0646\u0648\u0631: "Nour",
  \u0645\u0631\u064A\u0645: "Meriem",
  \u062E\u062F\u064A\u062C\u0629: "Khadija",
  \u0632\u064A\u0646\u0628: "Zeineb",
  \u0647\u0627\u0644\u0629: "Hela",
  \u0631\u0627\u0646\u064A\u0629: "Rania",
  \u0625\u064A\u0645\u0627\u0646: "Imen",
  \u0627\u064A\u0645\u0627\u0646: "Imen",
  \u0623\u0646\u064A\u0633: "Anis",
  \u0627\u0646\u064A\u0633: "Anis",
  \u0637\u0627\u0631\u0642: "Tarek",
  \u062D\u0633\u0646: "Hassen",
  \u062D\u0633\u064A\u0646: "Houssem",
  \u062D\u0633\u0627\u0645: "Houssem",
  \u0628\u0644\u0627\u0644: "Bilel",
  \u0646\u0628\u064A\u0644: "Nabil",
  \u0641\u062A\u062D\u064A: "Fethi",
  \u0644\u0637\u0641\u064A: "Lotfi",
  \u0645\u0646\u0635\u0641: "Moncef",
  \u0627\u0644\u062D\u0628\u064A\u0628: "Habib",
  \u062D\u0628\u064A\u0628: "Habib",
  \u0631\u0636\u0627: "Ridha",
  \u0633\u0644\u064A\u0645: "Slim",
  \u0633\u0641\u064A\u0627\u0646: "Sofiene",
  \u064A\u0627\u0633\u064A\u0646: "Yassine",
  \u0623\u064A\u0645\u0646: "Aymen",
  \u0627\u064A\u0645\u0646: "Aymen",
  \u0645\u0647\u062F\u064A: "Mehdi",
  \u0648\u0627\u0626\u0644: "Wael",
  \u0627\u0644\u063A\u0631\u0628\u064A: "Gharbi",
  \u0627\u0644\u062C\u0644\u0627\u0635\u064A: "Jlassi",
  \u0627\u0644\u0639\u064A\u0627\u0631\u064A: "Ayari",
  \u0627\u0644\u062D\u0645\u0627\u0645\u064A: "Hammami",
  \u0627\u0644\u0641\u0631\u0634\u064A\u0634\u064A: "Ferchichi",
  \u0627\u0644\u062A\u0648\u0646\u0633\u064A: "Tounsi",
  \u0627\u0644\u0633\u0648\u064A\u0633\u064A: "Souissi",
  \u0627\u0644\u0645\u062D\u062C\u0648\u0628: "Mahjoub",
  "\u0639\u0645\u0631 \u0628\u0646": "Omar Ben",
  \u0645\u0632\u0631\u0639\u0629: "Ferme",
  \u0634\u0631\u0643\u0629: "Soci\xE9t\xE9",
  \u0633\u0648\u0642: "March\xE9",
  \u063A\u0631\u0641\u0629: "Chambre",
  \u0627\u0644\u062A\u0628\u0631\u064A\u062F: "froide",
  \u062A\u0628\u0631\u064A\u062F: "froide",
  \u0635\u0646\u062F\u0648\u0642: "Caisse",
  \u0635\u0646\u0627\u062F\u064A\u0642: "Caisses",
  \u0623\u062D\u0645\u0631: "rouge",
  \u0623\u062E\u0636\u0631: "vert",
  \u0623\u0632\u0631\u0642: "bleu",
  \u0623\u0635\u0641\u0631: "jaune",
  \u0623\u0628\u064A\u0636: "blanc",
  \u0623\u0633\u0648\u062F: "noir",
  \u0643\u0628\u064A\u0631: "grand",
  \u0635\u063A\u064A\u0631: "petit",
  \u062A\u0648\u0646\u0633: "Tunis",
  \u0633\u0648\u0633\u0629: "Sousse",
  \u0635\u0641\u0627\u0642\u0633: "Sfax",
  \u0627\u0644\u0645\u0647\u062F\u064A\u0629: "Mahdia",
  \u0627\u0644\u0645\u0646\u0633\u062A\u064A\u0631: "Monastir",
  \u0646\u0627\u0628\u0644: "Nabeul",
  \u0628\u0646\u0632\u0631\u062A: "Bizerte",
  \u0627\u0644\u0642\u064A\u0631\u0648\u0627\u0646: "Kairouan",
  \u0642\u0627\u0628\u0633: "Gab\xE8s",
  \u0645\u062F\u0646\u064A\u0646: "M\xE9denine",
  \u0628\u0627\u062C\u0629: "B\xE9ja",
  \u062C\u0646\u062F\u0648\u0628\u0629: "Jendouba",
  \u0627\u0644\u0643\u0627\u0641: "Le Kef"
};
var DICO_INV = Object.fromEntries(
  Object.entries(DICO).filter(([, fr]) => fr.length > 2).map(([ar, fr]) => [fr.toLowerCase(), ar.replace(/^ال(?=..)/, "")])
);
var AR_LETTRES = {
  \u0627: "a",
  \u0623: "a",
  \u0625: "i",
  \u0622: "a",
  \u0628: "b",
  \u062A: "t",
  \u062B: "th",
  \u062C: "j",
  \u062D: "h",
  \u062E: "kh",
  \u062F: "d",
  \u0630: "dh",
  \u0631: "r",
  \u0632: "z",
  \u0633: "s",
  \u0634: "ch",
  \u0635: "s",
  \u0636: "dh",
  \u0637: "t",
  \u0638: "dh",
  \u0639: "a",
  \u063A: "gh",
  \u0641: "f",
  \u0642: "k",
  \u0643: "k",
  \u0644: "l",
  \u0645: "m",
  \u0646: "n",
  \u0647: "h",
  \u0629: "a",
  \u0648: "ou",
  \u064A: "i",
  \u0649: "a",
  \u0626: "i",
  \u0624: "ou",
  \u0621: "",
  \u06A8: "g",
  \u067E: "p",
  \u06A4: "v",
  \u0640: "",
  "\u064B": "",
  "\u064C": "",
  "\u064D": "",
  "\u064E": "",
  "\u064F": "",
  "\u0650": "",
  "\u0651": "",
  "\u0652": "",
  "\u0660": "0",
  "\u0661": "1",
  "\u0662": "2",
  "\u0663": "3",
  "\u0664": "4",
  "\u0665": "5",
  "\u0666": "6",
  "\u0667": "7",
  "\u0668": "8",
  "\u0669": "9"
};
var majuscule = (w) => w ? w[0].toUpperCase() + w.slice(1) : w;
function motArFr(mot) {
  if (DICO[mot]) return DICO[mot];
  let w = mot;
  let prefixe = "";
  if (w.startsWith("\u0627\u0644") && w.length > 3) {
    const reste = w.slice(2);
    if (DICO[reste]) return DICO[reste];
    prefixe = "El ";
    w = reste;
  }
  let out = "";
  for (const ch of w) out += AR_LETTRES[ch] ?? ch;
  out = out.replace(/aa+/g, "a").replace(/ii+/g, "i").replace(/(ou){2,}/g, "ou");
  return prefixe + majuscule(out);
}
function arToFr(texte) {
  if (DICO[texte.trim()]) return DICO[texte.trim()];
  return texte.split(/(\s+)/).map((p) => /\s/.test(p) || !hasArabic(p) ? p : motArFr(p)).join("").replace(new RegExp("\\bEl (\\p{Lu})", "gu"), "$1").trim();
}

// ../frere-flow/src/mock/seed.ts
var ALL_PERMS = [
  "dashboard",
  "clients",
  "produits",
  "ventes",
  "marches",
  "credits",
  "paiements",
  "caisse",
  "stock",
  "frigos",
  "emballages",
  "equipes",
  "rapports",
  "administration",
  "historique",
  "parametres",
  "lecture"
];
var STABLE_USER_IDS = ["u_super", "u_m", "u_l"];
var SUPER_PERMS = ALL_PERMS.filter((p) => p !== "lecture");
var MARKET_ROLE = {
  id: "role_marche",
  name: "\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0633\u0648\u0642",
  description: "\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0641\u0642\u0637: \u0627\u0644\u0625\u0631\u0633\u0627\u0644\u064A\u0627\u062A\u060C \u0627\u0644\u0628\u064A\u0639\u060C \u0639\u0645\u0644\u0627\u0621 \u0648\u062F\u064A\u0648\u0646 \u0627\u0644\u0633\u0648\u0642",
  permissions: ["marches"]
};
var READONLY_ROLE = {
  id: "role_lecture",
  name: "\u0627\u0637\u0644\u0627\u0639 \u0641\u0642\u0637",
  description: "\u0645\u0634\u0627\u0647\u062F\u0629 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0627\u0644\u062F\u064A\u0648\u0646 \u0648\u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0648\u0627\u0644\u0645\u062E\u0632\u0648\u0646\u2026 \u062F\u0648\u0646 \u0623\u064A \u062A\u0639\u062F\u064A\u0644",
  permissions: [
    "dashboard",
    "clients",
    "produits",
    "ventes",
    "marches",
    "credits",
    "paiements",
    "caisse",
    "stock",
    "frigos",
    "emballages",
    "equipes",
    "rapports",
    "historique",
    "lecture"
  ]
};
var CLIENT_BOX_TYPE = {
  id: "pkt_client",
  name: "\u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644",
  color: "\u0645\u0644\u0643 \u0627\u0644\u0639\u0645\u064A\u0644",
  hex: "#8D6E63",
  description: "\u0635\u0646\u0627\u062F\u064A\u0642 \u064A\u062C\u0644\u0628\u0647\u0627 \u0627\u0644\u0639\u0645\u064A\u0644: \u062A\u064F\u062D\u0633\u0628 \u0644\u0625\u0631\u062C\u0627\u0639\u0647\u0627 \u0625\u0644\u064A\u0647 \u0644\u0627\u062D\u0642\u0627\u064B",
  totalAvailable: 0,
  active: true,
  clientOwned: true
};
function buildSeed() {
  let s = {
    seq: 0,
    sessionUserId: null,
    roles: [
      {
        id: "role_super",
        name: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645",
        description: "\u0635\u0644\u0627\u062D\u064A\u0629 \u0643\u0627\u0645\u0644\u0629 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0642\u0633\u0627\u0645",
        permissions: [...SUPER_PERMS]
      },
      {
        id: "role_admin",
        name: "\u0645\u062F\u064A\u0631",
        description: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u064A\u0648\u0645\u064A\u0629",
        permissions: [
          "dashboard",
          "clients",
          "produits",
          "ventes",
          "marches",
          "credits",
          "paiements",
          "caisse",
          "stock",
          "frigos",
          "emballages",
          "equipes",
          "rapports"
        ]
      },
      {
        id: "role_emp",
        name: "\u0645\u0648\u0638\u0641",
        description: "\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0645\u062D\u062F\u0648\u062F\u0629",
        permissions: [
          "dashboard",
          "clients",
          "ventes",
          "marches",
          "paiements",
          "emballages",
          "produits",
          "stock"
        ]
      },
      { ...MARKET_ROLE, permissions: [...MARKET_ROLE.permissions] },
      { ...READONLY_ROLE, permissions: [...READONLY_ROLE.permissions] }
    ],
    // 3 comptes stables (identiques à chaque installation, à changer ensuite par le client) + comptes de démonstration
    users: [
      {
        id: "u_super",
        name: "\u0645\u062D\u062C\u0648\u0628 \u0628\u0646 \u0645\u062D\u062C\u0648\u0628",
        email: "direction@frere-mahjoub.tn",
        phone: "+216 74 400 100",
        password: "Direction2026",
        active: true,
        createdAt: "2025-01-05",
        roleIds: ["role_super"],
        secMode: "none",
        passwordInitial: true
      },
      {
        id: "u_m",
        name: "\u0633\u0627\u0645\u064A \u0627\u0644\u062D\u062F\u0627\u062F",
        email: "marche@frere-mahjoub.tn",
        phone: "+216 50 220 118",
        password: "Marche2026",
        active: true,
        createdAt: "2025-04-01",
        roleIds: ["role_marche"],
        secMode: "none",
        passwordInitial: true
      },
      {
        id: "u_l",
        name: "\u0644\u064A\u0644\u0649 \u0627\u0644\u0645\u062D\u062C\u0648\u0628",
        email: "consultation@frere-mahjoub.tn",
        phone: "+216 29 640 512",
        password: "Consultation2026",
        active: true,
        createdAt: "2025-04-01",
        roleIds: ["role_lecture"],
        secMode: "none",
        passwordInitial: true
      },
      {
        id: "u_admin",
        name: "\u0646\u0627\u062F\u064A\u0629 \u0645\u062D\u062C\u0648\u0628",
        email: "admin@frere-mahjoub.tn",
        phone: "+216 98 300 200",
        password: "Demo2026",
        active: true,
        createdAt: "2025-02-11",
        roleIds: ["role_admin"],
        secMode: "none",
        passwordInitial: true
      },
      {
        id: "u_x",
        name: "\u0648\u0644\u064A\u062F \u0643\u0645\u0648\u0646",
        email: "walid@frere-mahjoub.tn",
        phone: "+216 22 110 330",
        password: "Demo2026",
        active: true,
        createdAt: "2025-03-01",
        roleIds: ["role_emp"],
        teamId: "team_1",
        secMode: "none",
        passwordInitial: true
      },
      {
        id: "u_y",
        name: "\u0631\u064A\u0627\u0636 \u0634\u0639\u0628\u0627\u0646",
        email: "riadh@frere-mahjoub.tn",
        phone: "+216 55 870 441",
        password: "Demo2026",
        active: true,
        createdAt: "2025-03-01",
        roleIds: ["role_emp"],
        teamId: "team_2",
        secMode: "none",
        passwordInitial: true
      }
    ],
    teams: [
      {
        id: "team_1",
        name: "\u0641\u064A\u063A\u0648 1",
        code: "F1",
        description: "\u0627\u0644\u0641\u0631\u064A\u0642 \u0627\u0644\u062A\u062C\u0627\u0631\u064A \u0627\u0644\u0623\u0648\u0644",
        responsable: "\u0648\u0644\u064A\u062F \u0643\u0645\u0648\u0646",
        active: true
      },
      {
        id: "team_2",
        name: "\u0641\u064A\u063A\u0648 2",
        code: "F2",
        description: "\u0627\u0644\u0641\u0631\u064A\u0642 \u0627\u0644\u062A\u062C\u0627\u0631\u064A \u0627\u0644\u062B\u0627\u0646\u064A",
        responsable: "\u0631\u064A\u0627\u0636 \u0634\u0639\u0628\u0627\u0646",
        active: true
      }
    ],
    clients: [
      ["\u0623\u062D\u0645\u062F \u0628\u0646 \u0635\u0627\u0644\u062D", "+216 98 123 456", "\u0645\u062F\u064A\u0646\u0629 \u0635\u0641\u0627\u0642\u0633", "1234567/A"],
      ["\u0645\u062D\u0645\u062F \u0627\u0644\u0637\u0631\u0627\u0628\u0644\u0633\u064A", "+216 22 456 789", "\u0633\u0627\u0642\u064A\u0629 \u0627\u0644\u0632\u064A\u062A\u060C \u0635\u0641\u0627\u0642\u0633", "2345678/B"],
      ["\u064A\u0648\u0633\u0641 \u0627\u0644\u062C\u0644\u0627\u0635\u064A", "+216 55 987 321", "\u0627\u0644\u0645\u062D\u0631\u0633", "3456789/C"],
      ["\u0633\u0627\u0645\u064A \u0628\u0646 \u0639\u0645\u0631", "+216 97 654 120", "\u0639\u0642\u0627\u0631\u0628", "4567890/D"],
      ["\u062D\u0627\u062A\u0645 \u0627\u0644\u063A\u0631\u0628\u064A", "+216 26 300 412", "\u0633\u0648\u0642 \u0627\u0644\u062C\u0645\u0644\u0629\u060C \u062A\u0648\u0646\u0633", "5678901/E"],
      ["\u0634\u0631\u0643\u0629 \u0627\u0644\u0625\u062E\u0648\u0629 \u062D\u0645\u062F\u064A", "+216 74 220 110", "\u0635\u0641\u0627\u0642\u0633 \u0627\u0644\u062C\u0646\u0648\u0628\u064A\u0629", "6789012/F"],
      ["\u0644\u064A\u0644\u0649 \u0627\u0644\u0645\u0646\u0635\u0648\u0631\u064A", "+216 50 741 963", "\u0642\u0627\u0628\u0633", "7890123/G"]
    ].map(([name, phone2, address, taxId2], i) => ({
      id: `cli_${i + 1}`,
      code: `CL-${String(i + 1).padStart(4, "0")}`,
      name,
      phone: phone2,
      address,
      email: `${arToFr(name.split(" ")[0]).normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase()}@mail.tn`,
      taxId: taxId2,
      active: true,
      createdAt: `2025-0${i % 8 + 1}-1${i}`
    })),
    products: [
      ["PDT-001", "\u0628\u0637\u0627\u0637\u0627", "\u062E\u0636\u0631\u0648\u0627\u062A", 1.2],
      ["PDT-002", "\u062C\u0632\u0631", "\u062E\u0636\u0631\u0648\u0627\u062A", 1.1],
      ["PDT-003", "\u0628\u0635\u0644", "\u062E\u0636\u0631\u0648\u0627\u062A", 0.9],
      ["PDT-004", "\u0637\u0645\u0627\u0637\u0645", "\u062E\u0636\u0631\u0648\u0627\u062A", 1.5],
      ["PDT-005", "\u0641\u0644\u0641\u0644", "\u062E\u0636\u0631\u0648\u0627\u062A", 2.2],
      ["PDT-006", "\u062A\u0641\u0627\u062D", "\u0641\u0648\u0627\u0643\u0647", 3.8],
      ["PDT-007", "\u0628\u0631\u062A\u0642\u0627\u0644 \u0645\u0627\u0644\u0637\u064A", "\u0641\u0648\u0627\u0643\u0647", 2.5]
    ].map(([reference, name, category, salePrice], i) => ({
      id: `prd_${i + 1}`,
      reference: String(reference),
      name: String(name),
      category: String(category),
      unit: "kg",
      salePrice: Number(salePrice),
      alertThreshold: 150,
      active: true
    })),
    frigos: [
      {
        id: "frg_1",
        name: "\u063A\u0631\u0641\u0629 \u062A\u0628\u0631\u064A\u062F \u0641\u0648\u0632\u064A",
        nameAlt: "Frigo Fawzi",
        code: "FAWZI",
        capacity: 2e4,
        location: "\u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0635\u0646\u0627\u0639\u064A\u0629\u060C \u0635\u0641\u0627\u0642\u0633",
        description: "\u063A\u0631\u0641\u0629 \u0627\u0644\u062A\u0628\u0631\u064A\u062F \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",
        active: true
      },
      {
        id: "frg_2",
        name: "\u063A\u0631\u0641\u0629 \u062A\u0628\u0631\u064A\u062F \u062D\u0633\u0627\u0645",
        nameAlt: "Frigo Houssem",
        code: "HOUSSEM",
        capacity: 12e3,
        location: "\u0637\u0631\u064A\u0642 \u0642\u0627\u0628\u0633 \u0643\u0644\u0645 4",
        description: "\u0627\u0644\u062E\u0636\u0631\u0648\u0627\u062A \u0627\u0644\u062C\u0630\u0631\u064A\u0629",
        active: true
      }
    ],
    stockMovements: [],
    saleStatuses: [
      { id: "ss_pending", code: "PENDING", label: "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631" },
      { id: "ss_confirmed", code: "CONFIRMED", label: "\u0645\u0624\u0643\u062F\u0629" },
      { id: "ss_paid", code: "PAID", label: "\u0645\u062F\u0641\u0648\u0639\u0629" },
      { id: "ss_partial", code: "PARTIAL", label: "\u0645\u062F\u0641\u0648\u0639\u0629 \u062C\u0632\u0626\u064A\u0627\u064B" },
      { id: "ss_cancelled", code: "CANCELLED", label: "\u0645\u0644\u063A\u0627\u0629" }
    ],
    creditStatuses: [
      { id: "cs_active", code: "ACTIVE", label: "\u0646\u0634\u0637" },
      { id: "cs_partial", code: "PARTIAL", label: "\u0645\u062F\u0641\u0648\u0639 \u062C\u0632\u0626\u064A\u0627\u064B" },
      { id: "cs_paid", code: "PAID", label: "\u0627\u0644\u0645\u062F\u0641\u0648\u0639" },
      { id: "cs_overdue", code: "OVERDUE", label: "\u0645\u062A\u0623\u062E\u0631" },
      { id: "cs_cancelled", code: "CANCELLED", label: "\u0645\u0644\u063A\u0649" }
    ],
    markets: [
      { id: "mkt_sousse", name: "\u0633\u0648\u0642 \u0633\u0648\u0633\u0629", city: "\u0633\u0648\u0633\u0629", active: true },
      { id: "mkt_mahdia", name: "\u0633\u0648\u0642 \u0627\u0644\u0645\u0647\u062F\u064A\u0629", city: "\u0627\u0644\u0645\u0647\u062F\u064A\u0629", active: true },
      { id: "mkt_monastir", name: "\u0633\u0648\u0642 \u0627\u0644\u0645\u0646\u0633\u062A\u064A\u0631", city: "\u0627\u0644\u0645\u0646\u0633\u062A\u064A\u0631", active: true }
    ],
    marketTrips: [],
    invoices: [],
    sales: [],
    saleItems: [],
    payments: [],
    credits: [],
    creditPayments: [],
    cash: [],
    packagingTypes: [
      {
        id: "pkt_1",
        name: "\u0635\u0646\u062F\u0648\u0642 \u0623\u062D\u0645\u0631",
        color: "\u0623\u062D\u0645\u0631",
        hex: "#C62828",
        description: "\u0635\u0646\u062F\u0648\u0642 \u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A 20 \u0643\u063A",
        totalAvailable: 1500,
        active: true
      },
      {
        id: "pkt_2",
        name: "\u0635\u0646\u062F\u0648\u0642 \u0623\u062E\u0636\u0631",
        color: "\u0623\u062E\u0636\u0631",
        hex: "#2E7D32",
        description: "\u0635\u0646\u062F\u0648\u0642 \u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A 25 \u0643\u063A",
        totalAvailable: 1200,
        active: true
      },
      {
        id: "pkt_3",
        name: "\u0635\u0646\u062F\u0648\u0642 \u0623\u0632\u0631\u0642",
        color: "\u0623\u0632\u0631\u0642",
        hex: "#1565C0",
        description: "\u0635\u0646\u062F\u0648\u0642 \u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A 15 \u0643\u063A",
        totalAvailable: 800,
        active: true
      },
      {
        id: "pkt_4",
        name: "\u0635\u0646\u062F\u0648\u0642 \u0623\u0635\u0641\u0631",
        color: "\u0623\u0635\u0641\u0631",
        hex: "#F9A825",
        description: "\u0635\u0646\u062F\u0648\u0642 \u0641\u0648\u0627\u0643\u0647 10 \u0643\u063A",
        totalAvailable: 600,
        active: true
      },
      { ...CLIENT_BOX_TYPE }
    ],
    packagingMovements: [],
    auditLogs: [],
    settings: {
      companyName: "\u0634\u0631\u0643\u0629 \u0627\u0644\u0625\u062E\u0648\u0629 \u0645\u062D\u062C\u0648\u0628",
      currency: "TND",
      defaultDueDays: 30,
      packagingAlert: 40,
      creditAlert: 1e3
    }
  };
  let r = 42;
  const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const day2 = (offset) => new Date(Date.UTC(2026, 9, 8, 9 + Math.floor(rnd() * 8)) - offset * 864e5).toISOString();
  const base = [6e3, 3500, 2e3];
  s.products.forEach(
    (p, pi) => s.frigos.forEach((f, fi) => {
      s = addStockMovement(
        s,
        {
          productId: p.id,
          frigoId: f.id,
          quantity: Math.round(base[fi] * (0.4 + rnd() * 0.6) / (pi % 3 + 1)),
          movementType: "ENTREE",
          reference: `BR-${100 + pi * 3 + fi}`,
          notes: "\u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0645\u062D\u0635\u0648\u0644"
        },
        "u_admin",
        day2(190)
      );
    })
  );
  s = addStockMovement(
    s,
    {
      productId: "prd_1",
      frigoId: "frg_1",
      toFrigoId: "frg_2",
      quantity: 300,
      movementType: "TRANSFERT",
      reference: "TR-001",
      notes: "\u0625\u0639\u0627\u062F\u0629 \u062A\u0648\u0632\u064A\u0639"
    },
    "u_admin",
    day2(60)
  );
  const ourTypes = s.packagingTypes.filter((t) => !t.clientOwned);
  const methods = ["ESPECES", "ESPECES", "ESPECES", "CHEQUE", "VIREMENT"];
  for (let i = 0; i < 46; i++) {
    const offset = 180 - Math.floor(i * 3.9) - Math.floor(rnd() * 3);
    const teamId = i % 2 ? "team_2" : "team_1";
    const userId = teamId === "team_1" ? "u_x" : "u_y";
    const client2 = pick(s.clients);
    const frigoId = pick(s.frigos).id;
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
      const p = pick(s.products);
      return {
        productId: p.id,
        quantity: 20 + Math.floor(rnd() * 12) * 10,
        unitPrice: p.salePrice
      };
    });
    const total = lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    const mode = rnd();
    const paid2 = mode < 0.5 ? total : mode < 0.82 ? Math.round(total * (0.3 + rnd() * 0.4)) : 0;
    const date = day2(Math.max(offset, 0));
    try {
      s = createSale(
        s,
        {
          clientId: client2.id,
          teamId,
          frigoId,
          items: lines,
          paid: paid2,
          method: pick(methods),
          notes: "",
          packaging: rnd() < 0.7 ? [{ typeId: pick(ourTypes).id, quantity: 5 + Math.floor(rnd() * 20) }] : [],
          dueDate: new Date(new Date(date).getTime() + 30 * 864e5).toISOString().slice(0, 10)
        },
        userId,
        date
      );
    } catch {
    }
  }
  for (const c of [...s.credits].reverse().slice(0, 12)) {
    const amount2 = Math.round(c.remainingAmount * (rnd() < 0.4 ? 1 : 0.5) * 1e3) / 1e3;
    const created = new Date(c.createdAt).getTime();
    const d = new Date(Math.min(created + 15 * 864e5, Date.UTC(2026, 9, 8))).toISOString();
    if (amount2 > 0)
      s = addCreditPayment(
        s,
        { creditId: c.id, amount: amount2, method: "ESPECES", notes: "\u062F\u0641\u0639\u0629" },
        c.teamId === "team_1" ? "u_x" : "u_y",
        d
      );
  }
  for (const m of [...s.packagingMovements].reverse().slice(0, 18)) {
    if (m.type !== "SORTIE") continue;
    const d = new Date(
      Math.min(new Date(m.date).getTime() + 7 * 864e5, Date.UTC(2026, 9, 8))
    ).toISOString();
    try {
      s = addPackMovement(
        s,
        {
          clientId: m.clientId,
          packagingTypeId: m.packagingTypeId,
          teamId: m.teamId,
          type: "RETOUR",
          quantity: Math.ceil(m.quantity * 0.6),
          notes: "\u0645\u0631\u062A\u062C\u0639 \u0627\u0644\u0639\u0645\u064A\u0644"
        },
        "u_x",
        d
      );
    } catch {
    }
  }
  for (const [ci, q] of [
    [0, 12],
    [2, 8]
  ]) {
    const c = s.clients[ci];
    if (c)
      s = addPackMovement(
        s,
        {
          clientId: c.id,
          packagingTypeId: CLIENT_BOX_TYPE.id,
          teamId: ci ? "team_2" : "team_1",
          type: "RETOUR",
          quantity: q,
          notes: "\u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0639\u0645\u064A\u0644"
        },
        "u_admin",
        day2(5)
      );
  }
  [
    ["mkt_sousse", "\u0639\u0627\u062F\u0644 \u0627\u0644\u0635\u063A\u064A\u0631", "+216 97 410 220", "\u0633\u0648\u0642 \u0633\u0648\u0633\u0629"],
    ["mkt_sousse", "\u0645\u0646\u064A\u0631 \u0627\u0644\u0642\u0627\u0633\u0645\u064A", "+216 24 118 903", "\u0633\u0648\u0642 \u0633\u0648\u0633\u0629"],
    ["mkt_mahdia", "\u062D\u0645\u062F\u064A \u0628\u0646 \u0639\u0645\u0631", "+216 53 707 641", "\u0633\u0648\u0642 \u0627\u0644\u0645\u0647\u062F\u064A\u0629"]
  ].forEach(
    ([marketId, name, phone2, address], i) => s.clients.push({
      id: `mc_${i + 1}`,
      marketId,
      code: `MC-${i + 1}`,
      name,
      phone: phone2,
      address,
      email: "",
      taxId: "",
      active: true,
      createdAt: "2025-05-01"
    })
  );
  const desc = (a, b) => String(b.date ?? b.saleDate ?? b.paymentDate ?? b.createdAt).localeCompare(
    String(a.date ?? a.saleDate ?? a.paymentDate ?? a.createdAt)
  );
  s.sales.sort(desc);
  s.credits.sort(desc);
  s.payments.sort(desc);
  s.creditPayments.sort(desc);
  s.cash.sort(desc);
  s.packagingMovements.sort(desc);
  s.stockMovements.sort(desc);
  s.auditLogs.sort(desc);
  return s;
}

// ../frere-flow/src/services/catalogue.ts
var sansAccents = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "");
function normaliserNom(v) {
  return sansAccents(String(v ?? "")).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase().replace(/[أإآ]/g, "\u0627").replace(/ة/g, "\u0647").replace(/ى/g, "\u064A").replace(/ـ/g, "");
}
var ALIAS_TYPE = {
  \u062E\u0636\u0631\u0648\u0627\u062A: "\u062E\u0636\u0631\u0648\u0627\u062A",
  \u062E\u0636\u0631: "\u062E\u0636\u0631\u0648\u0627\u062A",
  \u062E\u0636\u0627\u0631: "\u062E\u0636\u0631\u0648\u0627\u062A",
  legume: "\u062E\u0636\u0631\u0648\u0627\u062A",
  legumes: "\u062E\u0636\u0631\u0648\u0627\u062A",
  vegetable: "\u062E\u0636\u0631\u0648\u0627\u062A",
  \u0641\u0648\u0627\u0643\u0647: "\u0641\u0648\u0627\u0643\u0647",
  \u063A\u0644\u0627\u0644: "\u0641\u0648\u0627\u0643\u0647",
  \u0641\u0627\u0643\u0647\u0647: "\u0641\u0648\u0627\u0643\u0647",
  fruit: "\u0641\u0648\u0627\u0643\u0647",
  fruits: "\u0641\u0648\u0627\u0643\u0647"
};
function typeProduit(v) {
  return ALIAS_TYPE[normaliserNom(v)] ?? null;
}
var ALIAS_UNITE = {
  kg: "kg",
  \u0643\u063A: "kg",
  kilo: "kg",
  kilogramme: "kg",
  \u0642\u0637\u0639\u0647: "\u0642\u0637\u0639\u0629",
  piece: "\u0642\u0637\u0639\u0629",
  pieces: "\u0642\u0637\u0639\u0629",
  pc: "\u0642\u0637\u0639\u0629",
  \u0637\u0646: "\u0637\u0646",
  ton: "\u0637\u0646",
  tonne: "\u0637\u0646",
  t: "\u0637\u0646",
  \u0635\u0646\u062F\u0648\u0642: "\u0635\u0646\u062F\u0648\u0642",
  caisse: "\u0635\u0646\u062F\u0648\u0642",
  cagette: "\u0635\u0646\u062F\u0648\u0642"
};
function uniteProduit(v) {
  return ALIAS_UNITE[normaliserNom(v)] ?? null;
}
var CATALOGUE = [
  // légumes
  { ar: "\u0628\u0637\u0627\u0637\u0627", fr: "Pomme de terre", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0637\u0645\u0627\u0637\u0645", fr: "Tomate", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0635\u0644", fr: "Oignon", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0635\u0644 \u0623\u062E\u0636\u0631", fr: "Oignon vert", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u062B\u0648\u0645", fr: "Ail", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u062C\u0632\u0631", fr: "Carotte", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u0644\u0641\u0644", fr: "Piment", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u0644\u0641\u0644 \u062D\u0644\u0648", fr: "Poivron", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u0644\u0641\u0644 \u062D\u0627\u0631", fr: "Piment fort", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0643\u0648\u0633\u0629", fr: "Courgette", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0627\u0630\u0646\u062C\u0627\u0646", fr: "Aubergine", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u062E\u064A\u0627\u0631", fr: "Concombre", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0642\u0631\u0639", fr: "Potiron", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0644\u0641\u062A", fr: "Navet", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0646\u062C\u0631", fr: "Betterave", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u062C\u0644", fr: "Radis", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0643\u0631\u0646\u0628", fr: "Chou", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0642\u0646\u0628\u064A\u0637", fr: "Chou-fleur", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0631\u0648\u0643\u0644\u064A", fr: "Brocoli", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u062E\u0633", fr: "Laitue", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0633\u0628\u0627\u0646\u062E", fr: "\xC9pinard", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0633\u0644\u0642", fr: "Blette", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0642\u062F\u0648\u0646\u0633", fr: "Persil", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0643\u0633\u0628\u0631", fr: "Coriandre", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0646\u0639\u0646\u0627\u0639", fr: "Menthe", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0643\u0631\u0641\u0633", fr: "C\xE9leri", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0633\u0628\u0627\u0633", fr: "Fenouil", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0642\u0646\u0627\u0631\u064A\u0629", fr: "Artichaut", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u0648\u0644 \u0623\u062E\u0636\u0631", fr: "F\xE8ve", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u062C\u0644\u0628\u0627\u0646\u0629", fr: "Petit pois", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0644\u0648\u0628\u064A\u0627", fr: "Haricot vert", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0627\u0645\u064A\u0629", fr: "Gombo", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0628\u0637\u0627\u0637\u0627 \u062D\u0644\u0648\u0629", fr: "Patate douce", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0641\u0637\u0631", fr: "Champignon", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0630\u0631\u0629", fr: "Ma\xEFs", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  { ar: "\u0643\u0631\u0627\u062B", fr: "Poireau", type: "\u062E\u0636\u0631\u0648\u0627\u062A" },
  // fruits
  { ar: "\u062A\u0641\u0627\u062D", fr: "Pomme", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0628\u0631\u062A\u0642\u0627\u0644", fr: "Orange", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0628\u0631\u062A\u0642\u0627\u0644 \u0645\u0627\u0644\u0637\u064A", fr: "Orange maltaise", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0645\u0646\u062F\u0631\u064A\u0646", fr: "Mandarine", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0643\u0644\u064A\u0645\u0646\u062A\u064A\u0646", fr: "Cl\xE9mentine", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0644\u064A\u0645\u0648\u0646", fr: "Citron", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0642\u0627\u0631\u0635", fr: "Citron (bergamote)", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0645\u0648\u0632", fr: "Banane", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0625\u062C\u0627\u0635", fr: "Poire", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0639\u0646\u0628", fr: "Raisin", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0641\u0631\u0627\u0648\u0644\u0629", fr: "Fraise", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062F\u0644\u0627\u0639", fr: "Past\xE8que", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0628\u0637\u064A\u062E", fr: "Melon", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062E\u0648\u062E", fr: "P\xEAche", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0645\u0634\u0645\u0634", fr: "Abricot", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0628\u0631\u0642\u0648\u0642", fr: "Prune", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062A\u064A\u0646", fr: "Figue", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0647\u0646\u062F\u064A", fr: "Figue de Barbarie", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0631\u0645\u0627\u0646", fr: "Grenade", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062A\u0645\u0631", fr: "Datte", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0643\u064A\u0648\u064A", fr: "Kiwi", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0623\u0646\u0627\u0646\u0627\u0633", fr: "Ananas", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0645\u0627\u0646\u062C\u0648", fr: "Mangue", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0632\u0639\u0631\u0648\u0631", fr: "N\xE8fle", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0633\u0641\u0631\u062C\u0644", fr: "Coing", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0643\u0627\u0643\u064A", fr: "Kaki", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062D\u0628 \u0627\u0644\u0645\u0644\u0648\u0643", fr: "Cerise", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u062A\u0648\u062A", fr: "M\xFBre", type: "\u0641\u0648\u0627\u0643\u0647" },
  { ar: "\u0623\u0641\u0648\u0643\u0627\u062F\u0648", fr: "Avocat", type: "\u0641\u0648\u0627\u0643\u0647" }
];
function dansCatalogue(nom) {
  const n = normaliserNom(nom);
  return n ? CATALOGUE.find((c) => normaliserNom(c.ar) === n || normaliserNom(c.fr) === n) : void 0;
}
function normaliserProduits(s) {
  let n = 0;
  for (const p of s.products) {
    const category = typeProduit(p.category) ?? dansCatalogue(p.name)?.type ?? "\u062E\u0636\u0631\u0648\u0627\u062A";
    const unit = uniteProduit(p.unit) ?? "kg";
    if (category !== p.category || unit !== p.unit) {
      p.category = category;
      p.unit = unit;
      n++;
    }
  }
  return n;
}

// ../frere-flow/src/services/validation.ts
var V = {
  name: "\u0627\u0644\u0627\u0633\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 2 \u0625\u0644\u0649 80 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: \u0623\u062D\u0645\u062F \u0628\u0646 \u0635\u0627\u0644\u062D",
  phone: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: 8 \u0623\u0631\u0642\u0627\u0645\u060C \u0645\u062B\u0627\u0644: 98 123 456",
  email: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: client@exemple.tn",
  emailRequired: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0637\u0644\u0648\u0628\u060C \u0645\u062B\u0627\u0644: prenom@frere-mahjoub.tn",
  emailUsed: "\u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0642\u0628\u0644",
  taxId: "\u0627\u0644\u0645\u0639\u0631\u0641 \u0627\u0644\u062C\u0628\u0627\u0626\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: 1234567/A \u0623\u0648 1234567/A/M/000",
  address: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0637\u0648\u064A\u0644 \u062C\u062F\u0627\u064B: 200 \u062D\u0631\u0641 \u0643\u062D\u062F \u0623\u0642\u0635\u0649",
  text: "\u0627\u0644\u0646\u0635 \u0637\u0648\u064A\u0644 \u062C\u062F\u0627\u064B: 500 \u062D\u0631\u0641 \u0643\u062D\u062F \u0623\u0642\u0635\u0649",
  formula: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0627\u0644\u0646\u0635 \u0628\u0627\u0644\u0631\u0645\u0648\u0632 = + @",
  reference: "\u0627\u0644\u0645\u0631\u062C\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u062D\u0631\u0648\u0641 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648 - / \u0641\u0642\u0637\u060C 30 \u062D\u0631\u0641\u0627\u064B \u0643\u062D\u062F \u0623\u0642\u0635\u0649\u060C \u0645\u062B\u0627\u0644: BR-2026-001",
  productRef: "\u0645\u0631\u062C\u0639 \u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: PDT-008",
  refUsed: "\u0647\u0630\u0627 \u0627\u0644\u0645\u0631\u062C\u0639 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0642\u0628\u0644",
  code: "\u0627\u0644\u0631\u0645\u0632 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u062D\u0631\u0648\u0641 \u0644\u0627\u062A\u064A\u0646\u064A\u0629 \u0648\u0623\u0631\u0642\u0627\u0645 \u0641\u0642\u0637\u060C \u0645\u062B\u0627\u0644: FR4",
  codeUsed: "\u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0642\u0628\u0644",
  amount: "\u0627\u0644\u0645\u0628\u0644\u063A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0631\u0642\u0645 \u0623\u0643\u0628\u0631 \u0645\u0646 0 \u0628\u062B\u0644\u0627\u062B\u0629 \u0623\u0631\u0642\u0627\u0645 \u0639\u0634\u0631\u064A\u0629 \u0643\u062D\u062F \u0623\u0642\u0635\u0649\u060C \u0645\u062B\u0627\u0644: 125.500",
  paid: "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u062F\u0641\u0648\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0631\u0642\u0645 \u0645\u0648\u062C\u0628\u060C \u0645\u062B\u0627\u0644: 50.000",
  price: "\u0627\u0644\u0633\u0639\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0631\u0642\u0645 \u0645\u0648\u062C\u0628 \u0628\u062B\u0644\u0627\u062B\u0629 \u0623\u0631\u0642\u0627\u0645 \u0639\u0634\u0631\u064A\u0629 \u0643\u062D\u062F \u0623\u0642\u0635\u0649\u060C \u0645\u062B\u0627\u0644: 1.250",
  quantity: "\u0627\u0644\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: \u0631\u0642\u0645 \u0623\u0643\u0628\u0631 \u0645\u0646 0\u060C \u0645\u062B\u0627\u0644: 25.5",
  adjust: "\u0643\u0645\u064A\u0629 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: \u0631\u0642\u0645 \u063A\u064A\u0631 \u0635\u0641\u0631\u064A\u060C \u0645\u062B\u0627\u0644: -12 \u0623\u0648 30",
  boxes: "\u0639\u062F\u062F \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0645\u0648\u062C\u0628\u060C \u0645\u062B\u0627\u0644: 10",
  capacity: "\u0627\u0644\u0633\u0639\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: \u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0628\u0627\u0644\u0643\u064A\u0644\u0648\u063A\u0631\u0627\u0645\u060C \u0645\u062B\u0627\u0644: 10000",
  threshold: "\u062D\u062F \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0645\u0648\u062C\u0628\u060C \u0645\u062B\u0627\u0644: 150",
  total: "\u0627\u0644\u0639\u062F\u062F \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0645\u0648\u062C\u0628\u060C \u0645\u062B\u0627\u0644: 500",
  date: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: 2026-12-31",
  dueBeforeToday: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0644\u0627 \u064A\u0645\u0643\u0646 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0642\u0628\u0644 \u0627\u0644\u064A\u0648\u0645",
  days: "\u0639\u062F\u062F \u0627\u0644\u0623\u064A\u0627\u0645 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 1 \u0625\u0644\u0649 365\u060C \u0645\u062B\u0627\u0644: 30",
  reminderDays: "\u0623\u064A\u0627\u0645 \u0627\u0644\u062A\u0630\u0643\u064A\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: \u0645\u0646 0 \u0625\u0644\u0649 365\u060C \u0645\u062B\u0627\u0644: 3",
  password: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0636\u0639\u064A\u0641\u0629: 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0645\u0639 \u062D\u0631\u0648\u0641 \u0648\u0623\u0631\u0642\u0627\u0645\u060C \u0645\u062B\u0627\u0644: Ferme2026",
  passwordRequired: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0637\u0644\u0648\u0628\u0629",
  category: "\u0646\u0648\u0639 \u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u062E\u0636\u0631\u0648\u0627\u062A \u0623\u0648 \u0641\u0648\u0627\u0643\u0647",
  unit: "\u0648\u062D\u062F\u0629 \u0627\u0644\u0628\u064A\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: kg \u0623\u0648 \u0642\u0637\u0639\u0629 \u0623\u0648 \u0637\u0646 \u0623\u0648 \u0635\u0646\u062F\u0648\u0642",
  nameUsed: "\u064A\u0648\u062C\u062F \u0645\u0646\u062A\u062C \u0628\u0646\u0641\u0633 \u0627\u0644\u0627\u0633\u0645 \u0648\u0645\u0627 \u0632\u0627\u0644 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646: \u0639\u062F\u0651\u0644 \u0627\u0644\u0645\u0646\u062A\u062C \u0627\u0644\u0645\u0648\u062C\u0648\u062F \u0628\u062F\u0644 \u0625\u0646\u0634\u0627\u0621 \u0645\u0646\u062A\u062C \u062C\u062F\u064A\u062F",
  color: "\u0627\u0633\u0645 \u0627\u0644\u0644\u0648\u0646 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: \u0623\u062D\u0645\u0631",
  hex: "\u0631\u0645\u0632 \u0627\u0644\u0644\u0648\u0646 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u060C \u0645\u062B\u0627\u0644: #2E7D32",
  description: "\u0627\u0644\u0648\u0635\u0641 \u0645\u0637\u0644\u0648\u0628: \u0645\u0646 3 \u0625\u0644\u0649 200 \u062D\u0631\u0641\u060C \u0645\u062B\u0627\u0644: \u0648\u0642\u0648\u062F \u0627\u0644\u0634\u0627\u062D\u0646\u0629",
  shortText: "\u0627\u0644\u0646\u0635 \u0637\u0648\u064A\u0644 \u062C\u062F\u0627\u064B: 200 \u062D\u0631\u0641 \u0643\u062D\u062F \u0623\u0642\u0635\u0649",
  method: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629",
  type: "\u0627\u0644\u0646\u0648\u0639 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D",
  unknown: "\u0639\u0646\u0635\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u060C \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0641\u062D\u0629",
  rows: "\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0637\u0631 \u0643\u0628\u064A\u0631 \u062C\u062F\u0627\u064B",
  roles: "\u0627\u062E\u062A\u0631 \u062F\u0648\u0631\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644",
  company: "\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 2 \u0625\u0644\u0649 120 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: \u0634\u0631\u0643\u0629 \u0627\u0644\u0625\u062E\u0648\u0629 \u0645\u062D\u062C\u0648\u0628",
  alert: "\u062D\u062F \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0639\u062F\u062F \u0635\u062D\u064A\u062D \u0645\u0646 0 \u0625\u0644\u0649 100000\u060C \u0645\u062B\u0627\u0644: 40",
  city: "\u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629: \u0645\u0646 2 \u0625\u0644\u0649 60 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: \u0635\u0641\u0627\u0642\u0633",
  marketName: "\u0627\u0633\u0645 \u0627\u0644\u0633\u0648\u0642 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 2 \u0625\u0644\u0649 80 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: \u0633\u0648\u0642 \u0635\u0641\u0627\u0642\u0633",
  roleName: "\u0627\u0633\u0645 \u0627\u0644\u062F\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 2 \u0625\u0644\u0649 50 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: \u0645\u062D\u0627\u0633\u0628",
  nameAlt: "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0623\u062E\u0631\u0649 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D: \u0645\u0646 2 \u0625\u0644\u0649 80 \u062D\u0631\u0641\u0627\u064B\u060C \u0645\u062B\u0627\u0644: Sami Haddad",
  permission: "\u0635\u0644\u0627\u062D\u064A\u0629 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641\u0629",
  invalid: "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629"
};
var PERMS = [
  "dashboard",
  "clients",
  "produits",
  "ventes",
  "credits",
  "paiements",
  "caisse",
  "stock",
  "frigos",
  "emballages",
  "equipes",
  "rapports",
  "administration",
  "historique",
  "parametres",
  "marches",
  "lecture"
];
var METHODS = ["ESPECES", "CHEQUE", "VIREMENT", "AUTRE"];
var MAX_AMOUNT = 1e7;
var MAX_QTY = 1e6;
var MAX_ROWS = 100;
var fail = (m) => {
  throw new BusinessError(m);
};
var obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : fail(V.invalid);
var list = (v, max = MAX_ROWS) => Array.isArray(v) ? v.length <= max ? v : fail(V.rows) : fail(V.invalid);
var bool = (v) => v === true;
var INVISIBLES = new RegExp(
  "[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]",
  "g"
);
function text(v, { min = 0, max = 500, msg = V.text, noFormula = true } = {}) {
  if (v === void 0 || v === null) v = "";
  if (typeof v !== "string" && typeof v !== "number") fail(msg);
  const s = String(v).normalize("NFC").replace(INVISIBLES, " ").replace(/\s+/g, " ").trim();
  if (s.length < min || s.length > max) fail(msg);
  if (noFormula && /^[=+@]/.test(s)) fail(V.formula);
  return s;
}
var personName = (v, max = 80, msg = V.name) => {
  const s = text(v, { min: 2, max, msg });
  if (!new RegExp("\\p{L}", "u").test(s) || /[<>{}[\]\\|^`$]/.test(s)) fail(msg);
  return s;
};
function phone(v, required = false) {
  const raw = text(v, { max: 25, msg: V.phone, noFormula: false });
  if (!raw) return required ? fail(V.phone) : "";
  let d = raw.replace(/[\s.\-()/]/g, "");
  if (d.startsWith("00216")) d = d.slice(5);
  else if (d.startsWith("+216")) d = d.slice(4);
  else if (d.startsWith("216") && d.length === 11) d = d.slice(3);
  if (!/^[2-9]\d{7}$/.test(d)) fail(V.phone);
  return `+216 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}
function email(v, required = false) {
  const s = text(v, { max: 120, msg: V.email, noFormula: false }).toLowerCase();
  if (!s) return required ? fail(V.emailRequired) : "";
  if (!/^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[^\s@<>()[\]\\,;:"'.]{2,}$/u.test(s))
    fail(V.email);
  return s;
}
function taxId(v) {
  const s = text(v, { max: 25, msg: V.taxId }).toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  const m = /^(\d{7})\/?([A-Z])(?:\/?([ABDNP])\/?([CMNPE])\/?(\d{3}))?$/.exec(s);
  if (!m) return fail(V.taxId);
  return m[3] ? `${m[1]}/${m[2]}/${m[3]}/${m[4]}/${m[5]}` : `${m[1]}/${m[2]}`;
}
function num(v, msg, { min = 0, max = MAX_AMOUNT, minExclusive = false, integer = false, decimals = 3 } = {}) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return fail(msg);
  if (minExclusive ? n <= min : n < min) fail(msg);
  if (n > max) fail(msg);
  if (integer && !Number.isInteger(n)) fail(msg);
  if (!integer && Math.abs(n * 10 ** decimals - Math.round(n * 10 ** decimals)) > 1e-6) fail(msg);
  return n;
}
var amount = (v) => num(v, V.amount, { min: 0, minExclusive: true });
var paid = (v) => num(v ?? 0, V.paid, { min: 0 });
var qty = (v) => num(v, V.quantity, { min: 0, minExclusive: true, max: MAX_QTY });
var boxCount = (v) => num(v ?? 0, V.boxes, { min: 0, max: 1e5, integer: true });
function day(v, required = true) {
  const s = text(v, { max: 10, msg: V.date });
  if (!s) return required ? fail(V.date) : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fail(V.date);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 2e3 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) fail(V.date);
  return s;
}
var isoDate = (v, fallback) => typeof v === "string" && !Number.isNaN(Date.parse(v)) && v.length <= 40 ? v : fallback;
var method = (v) => METHODS.includes(String(v)) ? String(v) : fail(V.method);
var oneOf = (v, values) => values.includes(v) ? v : fail(V.type);
var code = (v, required = true) => {
  const s = text(v, { max: 10, msg: V.code }).toUpperCase().replace(/\s+/g, "");
  if (!s) return required ? fail(V.code) : "";
  if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(s)) fail(V.code);
  return s;
};
function ref(s, key, id, { optional = false, active = false } = {}) {
  if (optional && (id === void 0 || id === null || id === "")) return "";
  const items = s[key];
  const x = typeof id === "string" ? items.find((i) => i.id === id) : void 0;
  if (!x || active && x.active === false) fail(V.unknown);
  return id;
}
function existing(s, key, item) {
  if (item["id"] === void 0 || item["id"] === "") return null;
  ref(s, key, item["id"]);
  return s[key].find((x) => x["id"] === item["id"]);
}
var withId = (item, out) => item["id"] ? { id: item["id"], ...out } : out;
function nextCode(used, prefix, width) {
  const n = used.map((c) => Number(c.slice(prefix.length))).filter(Number.isFinite);
  return `${prefix}${String(Math.max(0, ...n) + 1).padStart(width, "0")}`;
}
var nomAlt = (v) => v === void 0 || v === null || String(v).trim() === "" ? "" : personName(v, 80, V.nameAlt);
function client(s, item) {
  const old = existing(s, "clients", item);
  let c = text(item["code"] ?? old?.["code"] ?? "", { max: 12, msg: V.code }).toUpperCase();
  const others = s.clients.filter((x) => x.id !== item["id"]).map((x) => x.code);
  if (!c || others.includes(c))
    c = old && !others.includes(String(old["code"])) ? String(old["code"]) : nextCode(
      others.filter((x) => x.startsWith("CL-")),
      "CL-",
      4
    );
  if (!/^[A-Z0-9][A-Z0-9-]{1,11}$/.test(c)) fail(V.code);
  return withId(item, {
    code: c,
    name: personName(item["name"]),
    nameAlt: nomAlt(item["nameAlt"]),
    phone: phone(item["phone"]),
    address: text(item["address"], { max: 200, msg: V.address }),
    email: email(item["email"]),
    taxId: taxId(item["taxId"]),
    active: item["active"] === void 0 ? true : bool(item["active"]),
    createdAt: isoDate(item["createdAt"] ?? old?.["createdAt"], (/* @__PURE__ */ new Date()).toISOString()),
    ...item["marketId"] || old?.["marketId"] ? { marketId: ref(s, "markets", item["marketId"] ?? old?.["marketId"]) } : {}
  });
}
function memeNom(s, p) {
  const noms = [p.name, p.nameAlt].map(normaliserNom).filter(Boolean);
  return s.products.find(
    (x) => x.id !== p.id && [x.name, x.nameAlt].map(normaliserNom).some((n) => n && noms.includes(n))
  );
}
function product(s, item) {
  const old = existing(s, "products", item);
  const others = s.products.filter((x) => x.id !== item["id"]).map((x) => x.reference.toUpperCase());
  const r = old ? String(old["reference"]) : nextCode(
    others.filter((x) => /^PDT-\d+$/.test(x)),
    "PDT-",
    3
  );
  const unit = uniteProduit(item["unit"] || "kg") ?? fail(V.unit);
  const name = personName(item["name"]);
  const nameAlt = nomAlt(item["nameAlt"]);
  if (memeNom(s, { id: item["id"], name, nameAlt })) fail(V.nameUsed);
  return withId(item, {
    reference: r,
    name,
    nameAlt,
    // type donné : doit être « خضروات » ou « فواكه » ; type vide : d'après le catalogue
    category: item["category"] ? typeProduit(item["category"]) ?? fail(V.category) : dansCatalogue(name)?.type ?? fail(V.category),
    unit,
    salePrice: num(item["salePrice"], V.price, { min: 0, minExclusive: true, max: 1e5 }),
    alertThreshold: num(item["alertThreshold"] ?? 0, V.threshold, {
      min: 0,
      max: MAX_QTY,
      integer: true
    }),
    active: item["active"] === void 0 ? true : bool(item["active"])
  });
}
function frigo(s, item) {
  existing(s, "frigos", item);
  const c = code(item["code"], false);
  if (c && s.frigos.some((f) => f.id !== item["id"] && f.code.toUpperCase() === c))
    fail(V.codeUsed);
  return withId(item, {
    name: personName(item["name"], 60),
    nameAlt: nomAlt(item["nameAlt"]),
    code: c,
    capacity: num(item["capacity"], V.capacity, {
      min: 0,
      minExclusive: true,
      max: 1e7,
      integer: true
    }),
    location: text(item["location"], { max: 120, msg: V.shortText }),
    description: text(item["description"], { max: 200, msg: V.shortText }),
    active: item["active"] === void 0 ? true : bool(item["active"])
  });
}
function packagingType(s, item) {
  const old = existing(s, "packagingTypes", item);
  const hex = text(item["hex"] || "#2E7D32", {
    max: 7,
    msg: V.hex,
    noFormula: false
  }).toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(hex)) fail(V.hex);
  const color = text(item["color"], { max: 30, msg: V.color });
  if (color && !new RegExp("\\p{L}", "u").test(color)) fail(V.color);
  return withId(item, {
    name: personName(item["name"], 60),
    nameAlt: nomAlt(item["nameAlt"]),
    color,
    hex,
    description: text(item["description"], { max: 200, msg: V.shortText }),
    totalAvailable: num(item["totalAvailable"], V.total, { min: 0, max: MAX_QTY, integer: true }),
    active: item["active"] === void 0 ? true : bool(item["active"]),
    // « caisses du client » : fixé à la création (le changer fausserait les soldes)
    clientOwned: old ? !!old["clientOwned"] : bool(item["clientOwned"])
  });
}
function team(s, item) {
  existing(s, "teams", item);
  const c = code(item["code"]);
  if (s.teams.some((t) => t.id !== item["id"] && t.code.toUpperCase() === c)) fail(V.codeUsed);
  return withId(item, {
    name: personName(item["name"], 60),
    nameAlt: nomAlt(item["nameAlt"]),
    code: c,
    description: text(item["description"], { max: 200, msg: V.shortText }),
    responsable: text(item["responsable"], { max: 80, msg: V.name }),
    active: item["active"] === void 0 ? true : bool(item["active"])
  });
}
function password(v) {
  if (typeof v !== "string" || v.length < 8 || v.length > 72 || !new RegExp("\\p{L}", "u").test(v) || !/\d/.test(v) || /\s/.test(v))
    fail(V.password);
  return v;
}
function user(s, item) {
  const old = existing(s, "users", item);
  const mail = email(item["email"], true);
  if (s.users.some((u) => u.id !== item["id"] && u.email.toLowerCase() === mail)) fail(V.emailUsed);
  const pwd = typeof item["password"] === "string" ? item["password"] : "";
  if (!old && !pwd) fail(V.passwordRequired);
  const roleIds = list(item["roleIds"], 10).map((r) => ref(s, "roles", r));
  if (!roleIds.length) fail(V.roles);
  const teamId = ref(s, "teams", item["teamId"], { optional: true });
  return withId(item, {
    name: personName(item["name"]),
    nameAlt: nomAlt(item["nameAlt"]),
    email: mail,
    phone: phone(item["phone"]),
    password: pwd ? password(pwd) : "",
    active: item["active"] === void 0 ? true : bool(item["active"]),
    createdAt: isoDate(item["createdAt"] ?? old?.["createdAt"], (/* @__PURE__ */ new Date()).toISOString()),
    roleIds: [...new Set(roleIds)],
    // clé toujours présente : « aucune équipe » efface bien l'ancienne
    teamId: teamId || void 0,
    secMode: oneOf(item["secMode"] ?? old?.["secMode"] ?? "none", [
      "none",
      "totp",
      "pin",
      "email",
      "device"
    ])
  });
}
function role(s, item) {
  existing(s, "roles", item);
  const perms = list(item["permissions"], 30).map(
    (p) => PERMS.includes(p) ? p : fail(V.permission)
  );
  return withId(item, {
    name: personName(item["name"], 50, V.roleName),
    nameAlt: nomAlt(item["nameAlt"]),
    description: text(item["description"], { max: 200, msg: V.shortText }),
    permissions: [...new Set(perms)]
  });
}
var COLLS = {
  clients: client,
  products: product,
  frigos: frigo,
  packagingTypes: packagingType,
  teams: team,
  users: user,
  roles: role
};
var notes = (v) => text(v, { max: 500 });
var reason = (v) => text(v, { max: 200, msg: V.shortText });
function saleItems(s, v) {
  return list(v).map((x) => obj(x)).filter((x) => x["productId"]).map((x) => ({
    productId: ref(s, "products", x["productId"], { active: true }),
    quantity: qty(x["quantity"]),
    unitPrice: num(x["unitPrice"] ?? 0, V.price, { min: 0, max: 1e5 }),
    // frigo de la ligne (vente depuis les deux frigos : une facture par frigo)
    ...x["frigoId"] ? { frigoId: ref(s, "frigos", x["frigoId"], { active: true }) } : {}
  }));
}
function boxRows(s, v, key = "typeId") {
  return list(v ?? []).map((x) => obj(x)).filter((x) => x[key] && Number(x["quantity"] ?? 0) !== 0).map((x) => ({ [key]: ref(s, "packagingTypes", x[key]), quantity: boxCount(x["quantity"]) }));
}
function validateSettings(v) {
  const x = obj(v);
  return {
    companyName: text(x["companyName"], { min: 2, max: 120, msg: V.company }),
    currency: "TND",
    defaultDueDays: num(x["defaultDueDays"], V.days, { min: 1, max: 365, integer: true }),
    packagingAlert: num(x["packagingAlert"], V.alert, { min: 0, max: 1e5, integer: true }),
    creditAlert: num(x["creditAlert"] ?? 1e3, V.alert, { min: 0, max: 1e7 })
  };
}
var RULES = {
  createSale: (s, [i], today) => {
    const x = obj(i);
    const due = day(x["dueDate"], false);
    if (due && due < today) fail(V.dueBeforeToday);
    return [
      {
        clientId: ref(s, "clients", x["clientId"], { active: true }),
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        frigoId: ref(s, "frigos", x["frigoId"], { active: true }),
        items: saleItems(s, x["items"]),
        paid: paid(x["paid"]),
        method: method(x["method"]),
        notes: notes(x["notes"]),
        ...due ? { dueDate: due } : {},
        packaging: boxRows(s, x["packaging"])
      }
    ];
  },
  cancelSale: (s, [id, r]) => [ref(s, "sales", id), reason(r)],
  setSaleStatus: (s, [id, st]) => [ref(s, "sales", id), ref(s, "saleStatuses", st)],
  editSale: (s, [id, i]) => {
    const x = obj(i);
    return [
      ref(s, "sales", id),
      {
        items: saleItems(s, x["items"]).map(({ productId, quantity, unitPrice }) => ({
          productId,
          quantity,
          unitPrice
        })),
        ...x["notes"] !== void 0 ? { notes: notes(x["notes"]) } : {}
      }
    ];
  },
  setInvoiceStatus: (s, [id, st, note]) => [
    ref(s, "invoices", id),
    oneOf(st, ["VALIDEE", "A_VOIR", "ANNULEE"]),
    reason(note)
  ],
  addCreditPayment: (s, [i]) => {
    const x = obj(i);
    return [
      {
        creditId: ref(s, "credits", x["creditId"]),
        amount: amount(x["amount"]),
        method: method(x["method"]),
        notes: notes(x["notes"])
      }
    ];
  },
  payDeadline: (s, a, t) => RULES["addCreditPayment"](s, a, t),
  addManualCredit: (s, [i]) => {
    const x = obj(i);
    return [
      {
        clientId: ref(s, "clients", x["clientId"], { active: true }),
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        amount: amount(x["amount"]),
        dueDate: day(x["dueDate"]),
        notes: notes(x["notes"])
      }
    ];
  },
  setCreditStatus: (s, [id, st]) => [ref(s, "credits", id), ref(s, "creditStatuses", st)],
  addStockMovement: (s, [i]) => {
    const x = obj(i);
    const type = oneOf(x["movementType"], ["ENTREE", "SORTIE", "TRANSFERT", "AJUSTEMENT"]);
    const quantity = type === "AJUSTEMENT" ? num(x["quantity"], V.adjust, { min: -MAX_QTY, max: MAX_QTY }) : qty(x["quantity"]);
    if (quantity === 0) fail(V.adjust);
    return [
      {
        productId: ref(s, "products", x["productId"]),
        frigoId: ref(s, "frigos", x["frigoId"], { active: true }),
        ...type === "TRANSFERT" ? { toFrigoId: ref(s, "frigos", x["toFrigoId"], { active: true }) } : {},
        quantity,
        movementType: type,
        reference: "",
        // attribuée automatiquement par l'opération
        notes: notes(x["notes"])
      }
    ];
  },
  addPackMovement: (s, [i]) => {
    const x = obj(i);
    return [
      {
        clientId: ref(s, "clients", x["clientId"]),
        packagingTypeId: ref(s, "packagingTypes", x["packagingTypeId"]),
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        type: oneOf(x["type"], ["SORTIE", "RETOUR"]),
        quantity: num(x["quantity"], V.boxes, { min: 1, max: 1e5, integer: true }),
        notes: notes(x["notes"])
      }
    ];
  },
  addCash: (s, [i]) => {
    const x = obj(i);
    return [
      {
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        type: oneOf(x["type"], ["ENCAISSEMENT", "DECAISSEMENT"]),
        method: method(x["method"]),
        amount: amount(x["amount"]),
        reference: "",
        // attribuée automatiquement par l'opération
        description: text(x["description"], { min: 3, max: 200, msg: V.description })
      }
    ];
  },
  upsert: (s, [c, item]) => {
    const rule = COLLS[c];
    if (!rule) fail(V.invalid);
    return [c, rule(s, obj(item))];
  },
  // produit + (facultatif) quantité entrée dans un frigo actif
  saveProduct: (s, [item, st]) => {
    let it = obj(item);
    if (!it["id"]) {
      const meme = memeNom(s, {
        id: void 0,
        name: String(it["name"] ?? ""),
        nameAlt: String(it["nameAlt"] ?? "")
      });
      if (meme) {
        if (stockTotal(s, meme.id) > 0) fail(V.nameUsed);
        it = { ...it, id: meme.id, active: true };
      }
    }
    const p = product(s, it);
    if (st === null || st === void 0) return [p, null];
    const x = obj(st);
    if (x["quantity"] === void 0 || x["quantity"] === null || x["quantity"] === "" || x["quantity"] === 0)
      return [p, null];
    return [
      p,
      { frigoId: ref(s, "frigos", x["frigoId"], { active: true }), quantity: qty(x["quantity"]) }
    ];
  },
  remove: (s, [c, id]) => {
    if (!(String(c) in COLLS)) fail(V.invalid);
    return [c, ref(s, c, id)];
  },
  saveMarket: (s, [i]) => {
    const x = obj(i);
    return [
      {
        ...x["id"] ? { id: ref(s, "markets", x["id"]) } : {},
        name: personName(x["name"], 80, V.marketName),
        nameAlt: nomAlt(x["nameAlt"]),
        city: personName(x["city"], 60, V.city)
      }
    ];
  },
  saveMarketClient: (s, [i]) => {
    const x = obj(i);
    return [
      {
        ...x["id"] ? { id: ref(s, "clients", x["id"]) } : {},
        marketId: ref(s, "markets", x["marketId"], { active: true }),
        name: personName(x["name"]),
        nameAlt: nomAlt(x["nameAlt"]),
        phone: phone(x["phone"]),
        address: text(x["address"], { max: 200, msg: V.address })
      }
    ];
  },
  createMarketTrip: (s, [i]) => {
    const x = obj(i);
    const id = text(x["id"], { max: 40, msg: V.invalid });
    if (!/^trip_[a-z0-9]{4,30}$/.test(id) || s.marketTrips.some((t) => t.id === id))
      fail(V.invalid);
    const marketId = x["marketId"] ? ref(s, "markets", x["marketId"], { active: true }) : "";
    return [
      {
        id,
        marketId,
        ...!marketId ? { newMarketName: personName(x["newMarketName"], 80, V.marketName) } : {},
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        loads: list(x["loads"]).map((l) => obj(l)).filter((l) => l["productId"]).map((l) => ({
          productId: ref(s, "products", l["productId"], { active: true }),
          frigoId: ref(s, "frigos", l["frigoId"], { active: true }),
          quantity: qty(l["quantity"])
        })),
        boxes: boxRows(s, x["boxes"]),
        notes: notes(x["notes"])
      }
    ];
  },
  createMarketSale: (s, [i]) => {
    const x = obj(i);
    return [
      {
        tripId: ref(s, "marketTrips", x["tripId"]),
        clientId: ref(s, "clients", x["clientId"], { active: true }),
        items: saleItems(s, x["items"]),
        boxes: boxRows(s, x["boxes"]),
        paid: paid(x["paid"]),
        method: method(x["method"]),
        notes: notes(x["notes"])
      }
    ];
  },
  closeMarketTrip: (s, [i]) => {
    const x = obj(i);
    return [
      {
        tripId: ref(s, "marketTrips", x["tripId"]),
        returns: list(x["returns"]).map((r) => obj(r)).map((r) => ({
          productId: ref(s, "products", r["productId"]),
          quantity: num(r["quantity"] ?? 0, V.quantity, { min: 0, max: MAX_QTY })
        })),
        boxesReturned: list(x["boxesReturned"]).map((b) => obj(b)).map((b) => ({
          typeId: ref(s, "packagingTypes", b["typeId"]),
          quantity: boxCount(b["quantity"])
        })),
        cashCounted: paid(x["cashCounted"]),
        chequesCounted: paid(x["chequesCounted"]),
        notes: notes(x["notes"])
      }
    ];
  },
  createDeadline: (s, [i]) => {
    const x = obj(i);
    return [
      {
        clientId: ref(s, "clients", x["clientId"], { active: true }),
        teamId: ref(s, "teams", x["teamId"], { active: true }),
        ...x["frigoId"] ? { frigoId: ref(s, "frigos", x["frigoId"]) } : {},
        ...x["marketId"] ? { marketId: ref(s, "markets", x["marketId"]) } : {},
        amount: amount(x["amount"]),
        dueDate: day(x["dueDate"]),
        reminderDays: num(x["reminderDays"] ?? 0, V.reminderDays, {
          min: 0,
          max: 365,
          integer: true
        }),
        notes: notes(x["notes"])
      }
    ];
  },
  updateDeadline: (s, [i]) => {
    const x = obj(i);
    return [
      {
        creditId: ref(s, "credits", x["creditId"]),
        dueDate: day(x["dueDate"]),
        amount: amount(x["amount"]),
        reminderDays: num(x["reminderDays"] ?? 0, V.reminderDays, {
          min: 0,
          max: 365,
          integer: true
        }),
        notes: notes(x["notes"]),
        reason: reason(x["reason"])
      }
    ];
  },
  markReminder: (s, [id]) => [ref(s, "credits", id)],
  cancelDeadline: (s, [id, r]) => [ref(s, "credits", id), reason(r)],
  saveSettings: (_s, [x]) => [validateSettings(x)]
};
function validateOp(s, name, args, today) {
  const rule = RULES[name];
  if (!rule || !Array.isArray(args)) fail(V.invalid);
  return rule(s, args, today);
}

// scripts/domain-entry.ts
var OPS = {
  createSale,
  cancelSale,
  setSaleStatus,
  setInvoiceStatus,
  editSale,
  addCreditPayment,
  addManualCredit,
  setCreditStatus,
  addStockMovement,
  addPackMovement,
  addCash,
  upsert,
  remove,
  saveProduct,
  saveMarket,
  saveMarketClient,
  createMarketTrip,
  createMarketSale,
  closeMarketTrip,
  createDeadline,
  updateDeadline,
  payDeadline,
  markReminder,
  cancelDeadline
};
var BusinessError2 = BusinessError;
var stockOf2 = stockOf;
var { isMarketCredit: isMarketCredit2, isMarketClient: isMarketClient2, isReadOnly: isReadOnly2, clientBoxTypeIds: clientBoxTypeIds2, creerFacturesManquantes: creerFacturesManquantes2, invoiceOfSale: invoiceOfSale2 } = ops_exports;
export {
  ALL_PERMS,
  BusinessError2 as BusinessError,
  CLIENT_BOX_TYPE,
  MARKET_ROLE,
  OPS,
  READONLY_ROLE,
  STABLE_USER_IDS,
  SUPER_PERMS,
  V,
  buildSeed,
  clientBoxBalance,
  clientBoxTypeIds2 as clientBoxTypeIds,
  creerFacturesManquantes2 as creerFacturesManquantes,
  effectiveCreditCode,
  invoiceOfSale2 as invoiceOfSale,
  isMarketClient2 as isMarketClient,
  isMarketCredit2 as isMarketCredit,
  isReadOnly2 as isReadOnly,
  normaliserProduits,
  packBalance,
  stockOf2 as stockOf,
  stockTotal,
  tripBoxBalance,
  tripProductBalance,
  tripSales,
  tripTotals,
  validateOp,
  validateSettings
};
