# frere-flow-backend — serveur de Frère Flow

Serveur (API) du site **frere-flow** de la Société Frère Mahjoub.
Il enregistre toutes les données dans **MongoDB** et exécute **exactement la même logique métier que le site**
(`frere-flow/src/services`) : mêmes règles, mêmes numéros (FM-…, MK-…), mêmes messages d'erreur.

## Démarrage (Windows)

Les deux dossiers doivent être côte à côte :
```
fuulll\
  frere-flow\            ← le site
  frere-flow-backend\    ← ce serveur
```

### 1. Adresse de la base (une seule fois)
Ouvrez le fichier `.env` de ce dossier avec le Bloc-notes et collez votre adresse Atlas sur la ligne `MONGO_URI=`.
**Vous pouvez reprendre celle de l'ancien backend** : les collections de ce serveur commencent par `ff_`, rien ne se mélange.
```
MONGO_URI=mongodb+srv://ferme_app:MOTDEPASSE@ferme.xxxxx.mongodb.net/ferme?retryWrites=true&w=majority&appName=ferme
```
(Pas encore de base ? voir `GUIDE-MONGODB-ATLAS.md`.)

### 2. Lancer le serveur — fenêtre 1
```
cd C:\Users\lenovo\Downloads\fuulll\frere-flow-backend
npm install
npm run verifier
npm run dev
```
Attendez : `API prête sur http://localhost:4000/api (stockage : MongoDB)`. Laissez la fenêtre ouverte.
Au premier démarrage, les données de démonstration du site sont créées dans la base.

### 3. Lancer le site — fenêtre 2
```
cd C:\Users\lenovo\Downloads\fuulll\frere-flow
npm install
npm run dev
```
Ouvrez l'adresse affichée dans Chrome et connectez-vous (comptes de démonstration, mot de passe **demo**).

## Commandes
| Commande | Rôle |
|---|---|
| `npm run dev` | Démarre le serveur (redémarre tout seul si vous modifiez `src`) |
| `npm start` | Démarre le serveur (production) |
| `npm run verifier` | Vérifie la connexion à MongoDB (`.env`) |
| `npm run seed` | ⚠ Efface tout et remet les données de démonstration |
| `npm run seed:propre` | ⚠ Efface tout et garde seulement la configuration (rôles, équipes, frigos, produits, caisses, marchés) + le compte `direction@frere-mahjoub.tn` |
| `npm test` | 91 tests de l'API : chaque formulaire, chaque règle, sécurité (sans base) |
| `npm run test:mongo` | Les mêmes tests sur un vrai MongoDB temporaire |
| `npm run debloquer -- email [NouveauMdp]` | Secours : remet un compte en « mot de passe seul » (téléphone perdu, PIN oublié) |
| `npm run sauvegarde` | Sauvegarde immédiate dans `sauvegardes/` (chiffrée si `BACKUP_KEY`) |
| `npm run restaurer -- sauvegardes/<fichier> --oui` | ⚠ Remet la base dans l'état d'une sauvegarde |
| `npm run sync-domain` | Recopie la logique métier du site après une modification de `frere-flow/src/services` |

## Avant de livrer au client (`.env`)
```
DEMO_LOGIN=false          # plus de boutons « comptes de démonstration »
ALLOW_DEMO_RESET=false    # le bouton « restaurer les données de démonstration » ne fait plus rien
SEED_MODE=propre          # base vide au premier démarrage (+ ADMIN_PASSWORD=...)
```
Puis changez les mots de passe des comptes depuis la page **Utilisateurs & rôles**.

## Les 3 comptes de départ (identiques à chaque installation)
| Email | Mot de passe initial | Rôle | Accès |
|---|---|---|---|
| direction@frere-mahjoub.tn | `Direction2026` | المدير العام | tout, gère les comptes et la sécurité |
| marche@frere-mahjoub.tn | `Marche2026` | مسؤول السوق | **section Marchés seulement** |
| consultation@frere-mahjoub.tn | `Consultation2026` | اطلاع فقط | **voit tout, ne modifie rien** |

Un bandeau jaune demande de changer le mot de passe initial (clic sur l'avatar en haut → « حسابي »).
Avec les données de démonstration (`SEED_MODE=demo`) il y a aussi admin@, walid@ et riadh@ (mot de passe `Demo2026`).
L'écran de connexion n'affiche plus aucun compte ni email.

- Les **clients des marchés** et leurs **dettes** sont séparés : ils n'apparaissent pas dans Clients / Ventes / Dettes / Paiements,
  seulement dans **Marchés** (onglet « ديون الأسواق » pour encaisser). Le serveur refuse une vente ou une dette normale pour un client de marché.
- **Figo 1 / Figo 2** : chaque vente, dette, paiement, caisse est rattaché à son Figo ; un employé rattaché à un Figo ne voit que le sien.
- **Caisses du client** (type « صناديق العميل ») : quand le client amène ses propres caisses, on les note sur la vente ;
  elles sont comptées « à lui rendre » (page Soldes : colonne « صناديق العميل عندنا ») et ne se mélangent pas avec nos caisses.
- Une base existante est **mise à niveau automatiquement** au démarrage (nouveaux rôles + type « صناديق العميل », sans perte de données).
  Créez ensuite les comptes depuis **Utilisateurs & rôles** en choisissant le rôle « مسؤول السوق » ou « اطلاع فقط ».

## Contrôle des formulaires
Toutes les saisies sont vérifiées **deux fois** avec les mêmes règles (`frere-flow/src/services/validation.ts`) :
dans le site (message immédiat, la fenêtre reste ouverte) puis par le serveur (impossible à contourner).
Chaque message donne un exemple. Les formats sont harmonisés automatiquement.

| Champ | Règle | Exemple accepté |
|---|---|---|
| Téléphone | 8 chiffres tunisiens, +216 facultatif | `98123456` → `+216 98 123 456` |
| Matricule fiscal | 7 chiffres + lettre (+ /code TVA/catégorie/000) | `1234567a` → `1234567/A` |
| Email | format valide, en minuscules | `Client@Mail.TN` → `client@mail.tn` |
| Noms | 2 à 80 caractères, au moins une lettre, pas de `< > { }` | `Ahmed Ben Salah` |
| Montants (TND) | > 0, 3 décimales max | `125.500` |
| Quantités (kg) | > 0, 3 décimales max | `25.5` |
| Caisses | nombre entier positif | `10` |
| Dates | AAAA-MM-JJ valide ; échéance d'une vente ≥ aujourd'hui | `2026-12-31` |
| Mot de passe | 8 caractères min., lettres + chiffres, sans espace | `Ferme2026` |
| Codes / références | lettres latines, chiffres, `-`, sans doublon | `FR4`, `PDT-008` |
| Textes | 500 caractères max, ne commence pas par `= + @` (formules Excel) | |

## Sécurité
Tout est détaillé dans **[SECURITE.md](SECURITE.md)** (protections + liste de contrôle de mise en production).
En bref :
- Mots de passe chiffrés (scrypt), politique de mot de passe fort, anti-force brute.
- Session dans un **cookie HttpOnly** (illisible par un script), SameSite=Strict, 8 h max,
  **déconnexion automatique après 30 min d'inactivité**, bouton Déconnexion qui ferme la session sur le serveur.
- Clé secrète des sessions **générée automatiquement** dans `.env` au premier démarrage (propre à chaque installation).
- Chaque employé ne **reçoit** que les données de son Figo ; emails/téléphones des collègues masqués.
- Journal de sécurité (connexions, échecs, blocages, changements de mot de passe) dans la page Historique.
- Sauvegardes automatiques chiffrées (`BACKUP_KEY`), 14 conservées.
- En production le serveur refuse de démarrer sans `CORS_ORIGIN` ; HTTPS prêt avec `deploy/Caddyfile`.

## Organisation du code
```
src/
├── server.js                    démarrage (npm run dev / npm start)
├── app.js                       assemble tout : stockage, règles, sessions, routes
├── config/env.js                configuration (.env), contrôles de production, clé secrète
├── routes/index.js              table des routes « MÉTHODE /chemin » → contrôleur (paramètres :id)
├── models/                      UN FICHIER PAR ENTITÉ (forme des documents + droit de gestion)
│   ├── User.js  Role.js  Team.js
│   ├── Client.js                clients (marketId = client d'un marché, séparé)
│   ├── Product.js  Frigo.js  StockMovement.js
│   ├── Sale.js  SaleItem.js  Payment.js  SaleStatus.js
│   ├── Credit.js  CreditPayment.js  CreditStatus.js
│   ├── CashEntry.js
│   ├── Box.js                   types de caisses (clientOwned = caisses du client)
│   ├── BoxMovement.js           mouvements de caisses
│   ├── Market.js  MarketTrip.js
│   ├── AuditLog.js
│   ├── index.js                 registre (MODELS, SCHEMAS, droits de gestion)
│   └── schemas.js               vérification d'une base (npm run verifier)
├── controllers/                 UN CONTRÔLEUR PAR ENTITÉ
│   ├── users.controller.js  roles.controller.js  teams.controller.js
│   ├── clients.controller.js  products.controller.js  frigos.controller.js  stock.controller.js
│   ├── sales.controller.js  credits.controller.js  payments.controller.js  cash.controller.js
│   ├── boxes.controller.js  markets.controller.js  settings.controller.js  audit.controller.js
│   ├── base.js                  liste / détail / créer / modifier / supprimer communs
│   ├── auth.controller.js       connexion, 2e étape (code, PIN, email, appareil), mot de passe
│   ├── state.controller.js      santé + toutes les données visibles (utilisé par le site)
│   ├── ops.controller.js        exécution commune des opérations (contrôles + transaction)
│   └── admin.controller.js      appareils, réinitialisation de la sécurité, démonstration
├── middlewares/  http.js (en-têtes, CORS, anti-CSRF, limites) · session.js (cookie HttpOnly)
├── services/     engine.js (droits, cloisonnement, journal) · auth.js · connexion.js · backup.js
├── db/           mongo.js (MongoDB, collections ff_*) · memory.js (tests) · common.js
├── domain/domain.mjs            règles métier du site (généré : npm run sync-domain)
└── scripts/                     seed, verifier, debloquer
deploy/                          Caddyfile, docker-compose.yml (mise en ligne)
test/                            api.test.js (91 tests), mongo.test.js (mêmes tests avec MongoDB)
```

## API par entité
Toutes les routes exigent une session. Les **lectures** ne renvoient que ce que le compte a le droit de voir
(rôle, Figo, marchés). Les **écritures** passent par les mêmes contrôles que le site (droits, équipe,
validation avec exemples, transaction, historique). Listes : `?q=` recherche, `?teamId=`, `?active=`, `?offset=`, `?limit=` (500 max).

| Entité | Lecture | Écriture |
|---|---|---|
| Utilisateurs | `GET /api/users`, `/api/users/:id` | `POST /api/users`, `/api/users/:id`, `/api/users/:id/supprimer` |
| Rôles / Équipes | `GET /api/roles`, `/api/teams` (+ `/:id`) | `POST /api/roles`, `/api/teams` (+ `/:id`) |
| Clients | `GET /api/clients`, `/api/clients/:id` (dettes, caisses) | `POST /api/clients`, `/:id`, `/:id/supprimer` |
| Produits | `GET /api/products`, `/:id` (stock par frigo) | `POST /api/products`, `/:id`, `/:id/supprimer` |
| Frigos | `GET /api/frigos`, `/:id` (stock, remplissage) | `POST /api/frigos`, `/:id`, `/:id/supprimer` |
| Stock | `GET /api/stock` (niveaux), `/api/stock/mouvements` | `POST /api/stock/mouvements` |
| Ventes | `GET /api/sales`, `/:id` (lignes, paiements, dette) | `POST /api/sales`, `/:id/annuler`, `/:id/statut` |
| Dettes | `GET /api/credits`, `/:id` | `POST /api/credits`, `/:id/paiements`, `/:id/statut`, `/api/credits/echeances`, `/:id/echeance`, `/:id/echeance/payer`, `/:id/rappel`, `/:id/echeance/annuler` |
| Paiements | `GET /api/payments`, `/api/payments/credits` | (créés par les ventes et encaissements) |
| Caisse | `GET /api/cash`, `/api/cash/solde` | `POST /api/cash` |
| Caisses (box) | `GET /api/boxes`, `/:id`, `/api/boxes/soldes`, `/api/boxes/mouvements` | `POST /api/boxes`, `/:id`, `/:id/supprimer`, `/api/boxes/mouvements` |
| Marchés | `GET /api/markets`, `/api/markets/clients`, `/api/markets/credits`, `/api/markets/trips`, `/api/markets/trips/:id` | `POST /api/markets`, `/api/markets/clients`, `/api/markets/trips`, `/trips/:id/ventes`, `/trips/:id/cloture` |
| Paramètres | `GET /api/settings`, `/api/settings/statuts` | `POST /api/settings` |
| Historique | `GET /api/audit` | — |

Corps des écritures : `{ "data": { ... } }` (mêmes champs que les formulaires du site).

## Fonctionnement
- **Opérations** : le site envoie `POST /api/ops/<nom>` (`createSale`, `addCreditPayment`, `createMarketTrip`…) ;
  le serveur revalide et exécute la même fonction que le site, dans une transaction, une opération à la fois.
- **Plusieurs postes** : chaque site se met à jour automatiquement avec les opérations des autres.
- **Noms en deux langues** : clients, utilisateurs, produits, marchés… ont un champ « nom dans l'autre langue »
  (facultatif). En français le site affiche le nom français, en arabe le nom arabe (sinon translittération automatique).

| Route | Rôle |
|---|---|
| `GET /api/health` | Santé du serveur |
| `GET /api/auth/public` | Infos de l'écran de connexion |
| `POST /api/auth/login` | Connexion `{ email, password }` → session ou 2e étape |
| `POST /api/auth/verifier` | 2e étape `{ code }` ou `{ pin, pin2 }` |
| `POST /api/auth/renvoyer` | Renvoyer le code par email |
| `POST /api/auth/mot-de-passe` | Changer son mot de passe `{ actuel, nouveau }` |
| `POST /api/auth/logout` | Déconnexion |
| `GET /api/state` | Données visibles par l'utilisateur |
| `POST /api/ops/<nom>` | Opération `{ args, baseVersion }` |
| `POST /api/admin/securite` | Approuver / retirer un appareil, réinitialiser la sécurité |
| `POST /api/auth/demo`, `POST /api/admin/reset` | Démonstration (désactivées par défaut) |

## Mise en ligne
Voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)** (Docker en une commande, ou VPS sans Docker) et **[SECURITE.md](SECURITE.md)**.

## Problèmes fréquents
| Message | Solution |
|---|---|
| « blocked by CORS policy » dans la console du navigateur | Site ouvert par une adresse non autorisée. En développement, `localhost` et les adresses de ce PC (ex. `http://192.168.100.76:8080`) sont acceptées automatiquement ; sinon mettez l'adresse exacte dans `CORS_ORIGIN` (ex. `CORS_ORIGIN=http://192.168.100.76:8080`) puis redémarrez le serveur |
| `MONGO_URI vide : données en MÉMOIRE` | Mettez votre adresse Atlas dans `.env` (sinon tout est perdu à l'arrêt) |
| `Le port 4000 est déjà utilisé` | Un autre serveur tourne : fermez l'autre fenêtre ou tapez `taskkill /F /IM node.exe` |
| `querySrv ECONNREFUSED` | Géré automatiquement (DNS publics) ; sinon vérifiez Internet |
| Le site affiche « Impossible de joindre le serveur » | La fenêtre 1 (`npm run dev` du serveur) doit être ouverte |
