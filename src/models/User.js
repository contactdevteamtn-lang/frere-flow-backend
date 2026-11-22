// Modèle « User » — collection MongoDB ff_users
// Compte utilisateur. Mot de passe chiffré (scrypt), mode de sécurité de la connexion (secMode), appareils approuvés. Les secrets ne sont jamais envoyés au navigateur.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const User = {
  name: 'User',
  collection: 'users',
  permission: 'administration', // droit requis pour créer / modifier / supprimer
  schema: {
    id: ID, name: 'string', 'nameAlt?': 'string', email: 'string', phone: 'string', password: 'string', // scrypt$…
    active: 'boolean', createdAt: 'string', roleIds: 'array', 'teamId?': 'string',
    'secMode?': ['none', 'totp', 'pin', 'email', 'device'], 'passwordInitial?': 'boolean',
    'totpSecret?': 'string', 'totpLast?': 'number', 'pinHash?': 'string', 'devices?': 'array', // jamais envoyés au navigateur
  },
};

export default User;
