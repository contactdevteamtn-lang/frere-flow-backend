// Modèle « AuditLog » — collection MongoDB ff_auditLogs
// Historique des actions et journal de sécurité (connexions, échecs, blocages).
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const AuditLog = {
  name: 'AuditLog',
  collection: 'auditLogs',
  permission: null, // créé uniquement par les opérations métier (voir son contrôleur)
  schema: { id: ID, userId: ID, action: 'string', entity: 'string', 'entityId?': ID, details: 'string', date: 'string' },
};

export default AuditLog;
