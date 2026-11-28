// Comptes utilisés UNIQUEMENT par les tests (l'application n'a que direction, marché et consultation) :
// un rôle « مدير » et un rôle « موظف » rattaché à une équipe, pour vérifier les droits et le cloisonnement.
import { seedState } from '../src/services/engine.js';
import { hashPassword } from '../src/services/auth.js';

const ROLES = [
  {
    id: 'role_admin', name: 'مدير', description: 'compte de test',
    permissions: ['dashboard', 'clients', 'produits', 'ventes', 'marches', 'credits', 'paiements', 'caisse', 'stock', 'frigos', 'emballages', 'equipes', 'rapports'],
  },
  {
    id: 'role_emp', name: 'موظف', description: 'compte de test',
    permissions: ['dashboard', 'clients', 'ventes', 'marches', 'paiements', 'emballages', 'produits', 'stock'],
  },
];
const USERS = [
  { id: 'u_admin', name: 'نادية محجوب', email: 'admin@frere-mahjoub.tn', phone: '+216 98 300 200', roleIds: ['role_admin'], createdAt: '2025-02-11' },
  { id: 'u_x', name: 'وليد كمون', email: 'walid@frere-mahjoub.tn', phone: '+216 22 110 330', roleIds: ['role_emp'], teamId: 'team_1', createdAt: '2025-03-01' },
  { id: 'u_y', name: 'رياض شعبان', email: 'riadh@frere-mahjoub.tn', phone: '+216 55 870 441', roleIds: ['role_emp'], teamId: 'team_2', createdAt: '2025-03-01' },
];

/** Données de démonstration + comptes de test (mot de passe « Demo2026 ») */
export function etatDeTest() {
  const s = seedState('demo');
  s.roles.push(...structuredClone(ROLES));
  for (const u of USERS) s.users.push({ ...u, password: hashPassword('Demo2026'), active: true, secMode: 'none', passwordInitial: true });
  return s;
}

/** Remplit un stockage vide avec l'état de test (avant createApp, qui n'y crée alors rien) */
export async function remplir(store) {
  await store.init();
  await store.replace(etatDeTest());
  return store;
}
