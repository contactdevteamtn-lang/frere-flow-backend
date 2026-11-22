// Contrôleur « Équipes » (modèle Team) : Figo 1, Figo 2.
import { Team } from '../models/index.js';
import { controleurEntite } from './base.js';

export const teamsController = (ctx) => controleurEntite(ctx, {
  nom: 'teams', chemin: 'teams', model: Team,
  details: (v, t) => ({
    membres: v.users.filter((u) => u.teamId === t.id).map((u) => ({ id: u.id, name: u.name })),
    ventes: v.sales.filter((s) => s.teamId === t.id).length,
  }),
});
