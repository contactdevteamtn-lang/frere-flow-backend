// Contrôleur « Utilisateurs » (modèle User) — page Utilisateurs & rôles.
// Lecture : sans mot de passe ni secrets ; un employé ne voit pas les emails/téléphones des collègues.
// Écriture : réservée au droit « administration » ; le directeur général est protégé.
import { User } from '../models/index.js';
import { controleurEntite } from './base.js';

export const usersController = (ctx) => controleurEntite(ctx, {
  nom: 'users', chemin: 'users', model: User,
  details: (v, u) => ({ roles: v.roles.filter((r) => u.roleIds?.includes(r.id)).map((r) => ({ id: r.id, name: r.name })) }),
});
