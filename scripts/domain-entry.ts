// Point d'entrée du "domaine" partagé : la logique métier du front (src/services, src/mock),
// exécutée telle quelle par le serveur. Régénéré par : npm run sync-domain
import * as ops from "@/services/ops";
import * as markets from "@/services/markets";
import * as deadlines from "@/services/deadlines";
import { buildSeed, ALL_PERMS, SUPER_PERMS, MARKET_ROLE, READONLY_ROLE, CLIENT_BOX_TYPE, STABLE_USER_IDS } from "@/mock/seed";
import { validateOp, validateSettings, V } from "@/services/validation";

// Les noms doivent être identiques à ceux du registre dans src/store/store.tsx (front)
export const OPS = {
  createSale: ops.createSale, cancelSale: ops.cancelSale, setSaleStatus: ops.setSaleStatus,
  addCreditPayment: ops.addCreditPayment, addManualCredit: ops.addManualCredit, setCreditStatus: ops.setCreditStatus,
  addStockMovement: ops.addStockMovement, addPackMovement: ops.addPackMovement, addCash: ops.addCash,
  upsert: ops.upsert, remove: ops.remove,
  saveMarket: markets.saveMarket, saveMarketClient: markets.saveMarketClient, createMarketTrip: markets.createMarketTrip,
  createMarketSale: markets.createMarketSale, closeMarketTrip: markets.closeMarketTrip,
  createDeadline: deadlines.createDeadline, updateDeadline: deadlines.updateDeadline, payDeadline: deadlines.payDeadline,
  markReminder: deadlines.markReminder, cancelDeadline: deadlines.cancelDeadline,
};
export const BusinessError = ops.BusinessError;
export const stockOf = ops.stockOf;
export const { isMarketCredit, isMarketClient, isReadOnly, clientBoxTypeIds } = ops;
export { SUPER_PERMS, MARKET_ROLE, READONLY_ROLE, CLIENT_BOX_TYPE, STABLE_USER_IDS };
export { buildSeed, ALL_PERMS, validateOp, validateSettings, V };

// Calculs de lecture utilisés par les contrôleurs (mêmes résultats que les pages du site)
export { stockTotal, packBalance, clientBoxBalance, effectiveCreditCode } from "@/services/ops";
export { tripTotals, tripProductBalance, tripBoxBalance, tripSales } from "@/services/markets";
