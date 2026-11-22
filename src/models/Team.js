// Modèle « Team » — collection MongoDB ff_teams
// Équipe (Figo 1, Figo 2). Ventes, dettes, paiements, caisse et caisses clients sont rattachés à une équipe.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Team = {
  name: 'Team',
  collection: 'teams',
  permission: 'equipes', // droit requis pour créer / modifier / supprimer
  schema: { id: ID, name: 'string', 'nameAlt?': 'string', code: 'string', description: 'string', responsable: 'string', active: 'boolean' },
};

export default Team;
