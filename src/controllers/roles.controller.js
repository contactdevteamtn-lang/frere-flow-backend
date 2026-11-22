// Contrôleur « Rôles » (modèle Role) : permissions de chaque rôle (directeur, marché, consultation…).
import { Role } from '../models/index.js';
import { controleurEntite } from './base.js';

export const rolesController = (ctx) => controleurEntite(ctx, {
  nom: 'roles', chemin: 'roles', model: Role,
  details: (v, r) => ({ utilisateurs: v.users.filter((u) => u.roleIds?.includes(r.id)).map((u) => ({ id: u.id, name: u.name })) }),
});
