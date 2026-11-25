// Registre des modèles : un fichier par entité (User.js, Client.js, Box.js…).
import { Role } from './Role.js';
import { User } from './User.js';
import { Team } from './Team.js';
import { Client } from './Client.js';
import { Product } from './Product.js';
import { Frigo } from './Frigo.js';
import { StockMovement } from './StockMovement.js';
import { SaleStatus } from './SaleStatus.js';
import { CreditStatus } from './CreditStatus.js';
import { Sale } from './Sale.js';
import { SaleItem } from './SaleItem.js';
import { Payment } from './Payment.js';
import { Credit } from './Credit.js';
import { CreditPayment } from './CreditPayment.js';
import { CashEntry } from './CashEntry.js';
import { Box } from './Box.js';
import { BoxMovement } from './BoxMovement.js';
import { AuditLog } from './AuditLog.js';
import { Market } from './Market.js';
import { MarketTrip } from './MarketTrip.js';
import { Invoice } from './Invoice.js';

export const MODELS = [Role, User, Team, Client, Product, Frigo, StockMovement, SaleStatus, CreditStatus, Sale, SaleItem, Payment, Credit, CreditPayment, CashEntry, Box, BoxMovement, AuditLog, Market, MarketTrip, Invoice];
export { Role, User, Team, Client, Product, Frigo, StockMovement, SaleStatus, CreditStatus, Sale, SaleItem, Payment, Credit, CreditPayment, CashEntry, Box, BoxMovement, AuditLog, Market, MarketTrip, Invoice };

/** Forme des documents par collection (utilisée par verifierSchemas) */
export const SCHEMAS = Object.fromEntries(MODELS.map((m) => [m.collection, m.schema]));

/** Droit requis pour créer / modifier / supprimer dans une collection (opérations upsert / remove) */
export const MANAGE_PERMISSION = Object.fromEntries(MODELS.filter((m) => m.permission).map((m) => [m.collection, m.permission]));

export const modelOf = (collection) => MODELS.find((m) => m.collection === collection) || null;
