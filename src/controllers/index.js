// Contrôleurs d'entités : un fichier par entité.
// (connexion : auth.controller, données complètes : state.controller, sécurité/démo : admin.controller,
//  exécution commune des opérations : ops.controller)
import { usersController } from './users.controller.js';
import { rolesController } from './roles.controller.js';
import { teamsController } from './teams.controller.js';
import { clientsController } from './clients.controller.js';
import { productsController } from './products.controller.js';
import { frigosController } from './frigos.controller.js';
import { stockController } from './stock.controller.js';
import { salesController } from './sales.controller.js';
import { invoicesController } from './invoices.controller.js';
import { creditsController } from './credits.controller.js';
import { paymentsController } from './payments.controller.js';
import { cashController } from './cash.controller.js';
import { boxesController } from './boxes.controller.js';
import { marketsController } from './markets.controller.js';
import { settingsController } from './settings.controller.js';
import { auditController } from './audit.controller.js';

export const CONTROLEURS_ENTITES = [
  usersController, rolesController, teamsController, clientsController, productsController, frigosController,
  stockController, salesController, invoicesController, creditsController, paymentsController, cashController, boxesController,
  marketsController, settingsController, auditController,
];
