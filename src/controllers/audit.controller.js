// Contrôleur « Historique » (modèle AuditLog) — page Historique.
// Sans le droit « historique » : seulement les actions sur ce que l'utilisateur voit, sans le journal de sécurité.
import { AuditLog } from '../models/index.js';
import { controleurEntite } from './base.js';

export const auditController = (ctx) => controleurEntite(ctx, { nom: 'audit', chemin: 'audit', model: AuditLog });
