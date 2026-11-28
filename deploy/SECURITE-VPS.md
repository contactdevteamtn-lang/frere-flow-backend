# Sécurisation du serveur (VPS Ubuntu) — Frère Flow

Ordre à respecter : chaque étape est vérifiée **avant** la suivante, pour ne jamais se bloquer dehors.
Gardez **une session SSH ouverte** pendant toute la procédure ; testez dans une **deuxième** fenêtre.

Fichiers fournis dans `deploy/vps/` : `99-durcissement-ssh.conf`, `jail.local`, `frere-flow-auth.conf`,
`mongod.conf`, `sauvegarde-mongo.sh`, `restaurer-mongo.sh`.

> Restriction par adresse IP (liste blanche) : **volontairement non activée** pour l'instant.

---

## 1. Utilisateur sudo (non root)

```bash
# en root, une seule fois
adduser deploy
usermod -aG sudo deploy
```

## 2. Connexion par clé SSH

Sur **votre PC** :
```bash
ssh-keygen -t ed25519 -C "frere-flow"
ssh-copy-id deploy@IP_DU_SERVEUR
ssh deploy@IP_DU_SERVEUR        # ✔ doit entrer SANS mot de passe
```

Seulement si la commande ci-dessus marche, sur le serveur :
```bash
sudo cp deploy/vps/99-durcissement-ssh.conf /etc/ssh/sshd_config.d/99-durcissement.conf
sudo sed -i 's/^AllowUsers .*/AllowUsers deploy/' /etc/ssh/sshd_config.d/99-durcissement.conf
sudo sshd -t && sudo systemctl reload ssh     # sshd -t : vérifie la syntaxe avant de recharger
```
Vérification, depuis une **nouvelle** fenêtre de votre PC :
```bash
ssh deploy@IP_DU_SERVEUR                       # ✔ entre avec la clé
ssh -o PubkeyAuthentication=no deploy@IP_DU_SERVEUR   # ✔ doit être REFUSÉ (Permission denied)
ssh root@IP_DU_SERVEUR                         # ✔ doit être REFUSÉ
```

## 3. Pare-feu UFW (SSH, 80, 443 uniquement)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH          # ⚠ AVANT d'activer, sinon la session SSH est coupée
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose         # ✔ 22, 80, 443 ALLOW ; le reste DENY
```
Docker publie ses ports en contournant UFW : seul Caddy publie des ports (80/443) dans
`docker-compose.yml`. L'API (4000), le site (3000) et MongoDB ne sont **jamais** publiés.
Vérification : `sudo ss -tlnp` ne doit montrer en écoute publique que 22, 80 et 443.

## 4. Fail2Ban (SSH + connexions refusées à l'application)

```bash
sudo apt install -y fail2ban
sudo mkdir -p /var/log/caddy
sudo cp deploy/vps/jail.local /etc/fail2ban/jail.local
sudo cp deploy/vps/frere-flow-auth.conf /etc/fail2ban/filter.d/frere-flow-auth.conf
sudo systemctl enable --now fail2ban
sudo fail2ban-client status                      # ✔ prisons : sshd, frere-flow-auth
sudo fail2ban-client status frere-flow-auth
# tester le filtre sur le journal réel de Caddy :
sudo fail2ban-regex /var/log/caddy/access.log /etc/fail2ban/filter.d/frere-flow-auth.conf
```
- Débannir une adresse : `sudo fail2ban-client set frere-flow-auth unbanip 1.2.3.4`
- Derrière **Cloudflare**, le trafic arrive depuis les adresses de Cloudflare : un bannissement côté
  serveur n'a alors pas d'effet sur le visiteur. La protection est assurée par les limites intégrées à
  l'API (30 tentatives / 15 min par IP, 8 par compte, blocage temporaire, journal) et par une règle
  de limitation Cloudflare sur `/api/auth/*`.

## 5. Mises à jour de sécurité automatiques

```bash
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades     # répondre « Oui »
cat /etc/apt/apt.conf.d/20auto-upgrades
# ✔ doit contenir :
#   APT::Periodic::Update-Package-Lists "1";
#   APT::Periodic::Unattended-Upgrade "1";
sudo unattended-upgrade --dry-run --debug | tail -5
```

## 6. MongoDB

**Option recommandée : MongoDB Atlas** (actuel). Utilisateur `ferme_app` avec le seul rôle
`readWrite` sur la base `ferme`, Network Access limité à l'IP du serveur (voir GUIDE-MONGODB-ATLAS.md).

**Option MongoDB sur le VPS** :
```bash
sudo cp deploy/vps/mongod.conf /etc/mongod.conf      # bindIp 127.0.0.1 + authorization: enabled
sudo systemctl restart mongod
mongosh --eval 'rs.initiate()'                        # replica set : nécessaire aux transactions
mongosh admin --eval 'db.createUser({user:"admin_mongo", pwd: passwordPrompt(), roles:["root"]})'
mongosh -u admin_mongo -p --authenticationDatabase admin --eval '
  db.getSiblingDB("ferme").createUser({user:"ferme_app", pwd: passwordPrompt(),
    roles:[{role:"readWrite", db:"ferme"}]})'
sudo ss -tlnp | grep 27017                            # ✔ 127.0.0.1:27017 uniquement
```
`MONGO_URI=mongodb://ferme_app:MOT_DE_PASSE@127.0.0.1:27017/ferme?replicaSet=rs0&authSource=ferme`
(si l'API tourne dans Docker, ajouter `network_mode: host` au service `api`, ou installer MongoDB
comme service Docker non publié).

## 7. Sauvegardes chiffrées automatiques (mongodump + AES-256)

L'API fait déjà une sauvegarde chiffrée (AES-256-GCM, `BACKUP_KEY`) toutes les `BACKUP_HOURS` heures.
En complément, un dump MongoDB complet chaque nuit :
```bash
sudo apt install -y mongodb-database-tools gnupg
sudo mkdir -p /etc/frere-flow && sudo chmod 700 /etc/frere-flow
echo 'mongodb+srv://ferme_app:…@…/ferme' | sudo tee /etc/frere-flow/mongo.uri >/dev/null
openssl rand -base64 48 | sudo tee /etc/frere-flow/backup.key >/dev/null
sudo chmod 600 /etc/frere-flow/mongo.uri /etc/frere-flow/backup.key
sudo chmod 700 deploy/vps/*.sh
sudo deploy/vps/sauvegarde-mongo.sh                  # ✔ « sauvegarde frere-flow-….archive.gz.gpg »
sudo crontab -e
# ajouter : 30 2 * * * /opt/frere-flow/deploy/vps/sauvegarde-mongo.sh >> /var/log/frere-flow-sauvegarde.log 2>&1
```
- Rétention : 14 jours (variable `RETENTION_JOURS`) ; copie hors serveur : ligne `rclone` à activer.
- **Copiez `/etc/frere-flow/backup.key` dans votre gestionnaire de mots de passe** : sans elle,
  aucune restauration possible.
- Restauration :
  ```bash
  sudo deploy/vps/restaurer-mongo.sh /var/backups/frere-flow/frere-flow-AAAAMMJJ-HHMM.archive.gz.gpg        # vérifie
  docker compose stop api
  sudo deploy/vps/restaurer-mongo.sh /var/backups/frere-flow/frere-flow-AAAAMMJJ-HHMM.archive.gz.gpg --oui  # remplace
  docker compose start api
  ```

## 8. Variables d'environnement (fichier `.env`, jamais dans Git)

| Variable | Rôle |
|---|---|
| `MONGO_URI` | adresse MongoDB (utilisateur `readWrite` uniquement) |
| `JWT_SECRET` | clé des sessions (48 caractères aléatoires) |
| `BACKUP_KEY` | clé de chiffrement des sauvegardes de l'API |
| `CORS_ORIGIN` | adresse exacte du site (`https://…`) |
| `NODE_ENV=production`, `TRUST_PROXY=true`, `COOKIE_SECURE=true` | production derrière Caddy |
| `DEMO_LOGIN=false`, `ALLOW_DEMO_RESET=false` | démo désactivée |
| `PROXY_SECRET` | seulement si le site relaie `/api` (hébergement à deux adresses) |

`.env`, `/etc/frere-flow/*`, `sauvegardes/` et les dumps sont exclus de Git (voir `.gitignore`).

## 9. Vérification finale

```bash
sudo ufw status && sudo fail2ban-client status && sudo ss -tlnp
curl -sI https://gestion.frere-mahjoub.tn | grep -iE 'strict-transport|content-security|x-frame'
curl -s https://gestion.frere-mahjoub.tn/api/health          # {"ok":true}
```
Puis connectez-vous avec chaque rôle (direction, admin, vente, marché, consultation) pour confirmer
que chacun voit et peut faire exactement ce qui est prévu.
