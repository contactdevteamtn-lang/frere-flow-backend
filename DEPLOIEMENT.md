# Mise en ligne (hébergement)

Deux dossiers à placer **côte à côte** sur le serveur : `frere-flow/` (site) et `frere-flow-backend/` (API).
Le site et l'API sont servis à la **même adresse** (`https://votre-domaine.tn` et `https://votre-domaine.tn/api`),
derrière **Caddy** qui fournit le HTTPS automatiquement. La base reste sur **MongoDB Atlas**.

## Ce qu'il faut avoir
- un serveur (VPS) Linux : 1 Go de RAM suffit (ex. Ubuntu 24.04) ;
- un nom de domaine dont l'enregistrement **A** pointe vers l'adresse IP du serveur ;
- la base MongoDB Atlas (voir GUIDE-MONGODB-ATLAS.md) avec **Network Access = IP du serveur**.

## Le fichier `.env` du serveur (frere-flow-backend/.env)
```
MONGO_URI=mongodb+srv://…            (votre adresse Atlas)
NODE_ENV=production
CORS_ORIGIN=https://votre-domaine.tn
TRUST_PROXY=true
COOKIE_SECURE=true
DEMO_LOGIN=false
ALLOW_DEMO_RESET=false
SEED_MODE=propre                       (base neuve sans données de démonstration)
BACKUP_KEY=<40 caractères aléatoires>  (gardez-la aussi hors du serveur)
JWT_SECRET=<64 caractères aléatoires>  (option B : laissez vide, elle est générée dans .env ;
                                        Docker : obligatoire, ex. résultat de « openssl rand -base64 48 »)
```

## Option A — Docker (recommandée, une seule commande)
```bash
# sur le serveur
curl -fsSL https://get.docker.com | sh
# copier les deux dossiers (ex. avec WinSCP) puis :
cd frere-flow-backend/deploy
nano Caddyfile.docker          # remplacer gestion.frere-mahjoub.tn par votre domaine
docker compose up -d --build   # API + site + HTTPS
docker compose logs -f api     # voir les messages du serveur
```
Mise à jour : recopier les dossiers puis `docker compose up -d --build`.
Commandes de secours dans le conteneur : `docker compose exec api npm run sauvegarde`,
`docker compose exec api npm run debloquer -- direction@frere-mahjoub.tn`.

## Option B — sans Docker (Node.js + PM2 + Caddy)
```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs caddy
sudo npm install -g pm2

cd frere-flow-backend && npm ci --omit=dev && npm run verifier
pm2 start src/server.js --name frere-flow-api

cd ../frere-flow && npm install && npm run build:serveur
pm2 start .output/server/index.mjs --name frere-flow-site
pm2 save && pm2 startup          # redémarrage automatique

sudo cp ../frere-flow-backend/deploy/Caddyfile /etc/caddy/Caddyfile   # remplacer le domaine
sudo systemctl reload caddy
```
Le pare-feu ne doit laisser passer que 22 (SSH), 80 et 443 : `sudo ufw allow OpenSSH; sudo ufw allow 80; sudo ufw allow 443; sudo ufw enable`.

## Option C — plateformes (Render, Railway…)
- **API** : service « Web » Node, dossier `frere-flow-backend`, commande `npm start`, variables du `.env` ci-dessus.
- **Site** : service « Web » Node, dossier `frere-flow`, build `npm install && npm run build:serveur`,
  commande `npm start`. Si l'API est sur une autre adresse : variable `VITE_API_URL=https://api.votre-domaine.tn/api`
  au moment du build, et dans l'API `CORS_ORIGIN=https://votre-domaine.tn`.
  (Le cookie de session étant `SameSite=Strict`, le site et l'API doivent être sur le **même domaine** :
  `votre-domaine.tn` et `api.votre-domaine.tn` conviennent.)

## Après la mise en ligne
1. Ouvrir `https://votre-domaine.tn`, se connecter avec `direction@frere-mahjoub.tn` / `Direction2026`.
2. Changer le mot de passe (bandeau jaune), activer « رمز من تطبيق الهاتف » pour le directeur.
3. Changer les mots de passe des comptes marché / consultation, créer les comptes des employés.
4. Vérifier qu'une sauvegarde apparaît (`sauvegardes/`) après 1 minute, et la copier ailleurs régulièrement.
