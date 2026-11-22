# Créer la base MongoDB (Atlas, gratuit) — pas à pas

Noms proposés (utilisez-les tels quels, tout le reste du projet y fait référence) :

| Élément | Nom |
|---|---|
| Organisation | `Freres-Mahjoub` |
| Projet | `ferme-erp` |
| Cluster | `ferme-cluster` (offre gratuite **M0**) |
| Base de données | `ferme` (créée automatiquement au premier démarrage) |
| Utilisateur de la base | `ferme_app` |

> Les libellés exacts de l'interface Atlas peuvent légèrement changer : cherchez l'équivalent le plus proche.

## 1. Compte et projet
1. Ouvrir **https://cloud.mongodb.com** → créer un compte (ou « Sign in with Google »).
2. Nom de l'organisation : `Freres-Mahjoub`. Créer un projet : `ferme-erp`.

## 2. Cluster
1. **Create** (ou « Build a Database ») → offre **M0 / Free**.
2. Fournisseur : AWS — Région : la plus proche de la Tunisie (ex. **Paris eu-west-3** ou **Frankfurt eu-central-1**).
3. Nom du cluster : `ferme-cluster` → **Create Deployment**. Attendre 1 à 3 minutes.

## 3. Utilisateur de la base (Database Access)
1. Menu **Security → Database Access → Add New Database User**.
2. Méthode : *Password*. Utilisateur : `ferme_app`.
3. Mot de passe : cliquer **Autogenerate** et le **copier dans un endroit sûr**
   (lettres et chiffres uniquement : évitez `@ : / ? # %`, sinon il faudrait les encoder dans l'URI).
4. Droits : **Read and write to any database** → **Add User**.

## 4. Accès réseau (Network Access)
1. Menu **Security → Network Access → Add IP Address**.
2. Sur votre PC : **Add Current IP Address**.
3. Plus tard, sur le serveur de production : ajouter l'adresse IP du serveur.
   (`0.0.0.0/0` = accès depuis partout : uniquement pour un test rapide, jamais en production.)

## 5. Récupérer l'URI de connexion
1. **Database → Clusters → `ferme-cluster` → Connect → Drivers** (Node.js).
2. Copier l'URI, qui ressemble à :
   ```
   mongodb+srv://ferme_app:<db_password>@ferme-cluster.abc12.mongodb.net/?retryWrites=true&w=majority&appName=ferme-cluster
   ```
3. Remplacer `<db_password>` par le mot de passe et **ajouter `ferme` juste avant le `?`** :
   ```
   mongodb+srv://ferme_app:MonMotDePasse@ferme-cluster.abc12.mongodb.net/ferme?retryWrites=true&w=majority&appName=ferme-cluster
   ```

## 6. Brancher le projet
Dans `frere-flow-backend/.env`, remplacer la ligne `MONGO_URI=...` par votre URI :
```
MONGO_URI=mongodb+srv://ferme_app:MonMotDePasse@ferme-cluster.abc12.mongodb.net/ferme?retryWrites=true&w=majority&appName=ferme-cluster
```
Puis vérifier la connexion :
```bash
cd frere-flow-backend
npm install
npm run verifier
```
Résultat attendu : `✔ Connecté — base « ferme »`, `✔ Transactions opérationnelles`, `Tout est prêt ✔`.

## 7. Démarrer l'application
Voir le `README.md` : fenêtre 1 `npm run dev` dans `frere-flow-backend`, fenêtre 2 `npm run dev` dans `frere-flow`.
Au premier démarrage la base est vide → les données de démonstration sont créées (`SEED_MODE=demo`).
Pour le client : `SEED_MODE=propre`, `DEMO_LOGIN=false`, `ALLOW_DEMO_RESET=false`.

> Vous avez déjà une base Atlas (celle de l'ancien backend) ? Réutilisez la même adresse :
> ce serveur range ses données dans des collections `ff_…`, séparées des anciennes.

## Problèmes fréquents
| Message | Cause / solution |
|---|---|
| `bad auth : authentication failed` | Mauvais utilisateur/mot de passe dans l'URI (étape 3) |
| `Server selection timed out` / `ENOTFOUND` | IP non autorisée (étape 4) ou URI mal copiée |
| Base nommée `test` | Il manque `/ferme` avant le `?` dans l'URI |
| Caractère spécial dans le mot de passe | Le remplacer par son code : `@`→`%40`, `#`→`%23`, `/`→`%2F`, `:`→`%3A` |
