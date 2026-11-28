#!/usr/bin/env bash
# Sauvegarde MongoDB chiffrée : mongodump (compressé) → chiffrement AES-256 (gpg, avec contrôle d'intégrité)
# → fichier daté, puis suppression des sauvegardes de plus de RETENTION_JOURS jours.
# Planification (crontab de root, chaque nuit à 2 h 30) :
#   30 2 * * * /opt/frere-flow/deploy/vps/sauvegarde-mongo.sh >> /var/log/frere-flow-sauvegarde.log 2>&1
#
# Fichiers nécessaires (droits 600, propriétaire root, JAMAIS dans Git) :
#   /etc/frere-flow/mongo.uri     adresse MongoDB (ex. mongodb+srv://ferme_app:…@…/ferme)
#   /etc/frere-flow/backup.key    phrase secrète de chiffrement (40 caractères aléatoires ou plus)
set -euo pipefail
umask 077

DOSSIER="${DOSSIER:-/var/backups/frere-flow}"
RETENTION_JOURS="${RETENTION_JOURS:-14}"
URI_FICHIER="${URI_FICHIER:-/etc/frere-flow/mongo.uri}"
CLE_FICHIER="${CLE_FICHIER:-/etc/frere-flow/backup.key}"

for f in "$URI_FICHIER" "$CLE_FICHIER"; do
  [ -r "$f" ] || { echo "✘ fichier manquant ou illisible : $f" >&2; exit 1; }
  [ "$(stat -c %a "$f")" = "600" ] || { echo "✘ $f doit avoir les droits 600" >&2; exit 1; }
done
command -v mongodump >/dev/null || { echo "✘ mongodump absent (paquet mongodb-database-tools)" >&2; exit 1; }

mkdir -p "$DOSSIER"
FICHIER="$DOSSIER/frere-flow-$(date +%Y%m%d-%H%M).archive.gz.gpg"
TMP="$FICHIER.partiel"

# l'adresse MongoDB est passée par un fichier de configuration (jamais visible dans la liste des processus)
CONF="$(mktemp)"; trap 'rm -f "$CONF" "$TMP"' EXIT
printf 'uri: %s\n' "$(cat "$URI_FICHIER")" > "$CONF"

mongodump --config="$CONF" --archive --gzip --quiet \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --pinentry-mode loopback \
        --passphrase-file "$CLE_FICHIER" --output "$TMP"

# contrôle : le fichier se déchiffre (intégrité vérifiée par gpg) avant d'être gardé
gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$CLE_FICHIER" --decrypt "$TMP" \
  | gzip -t || { echo "✘ sauvegarde illisible, non conservée" >&2; exit 1; }
mv "$TMP" "$FICHIER"
echo "✔ $(date -Is) sauvegarde $(basename "$FICHIER") ($(du -h "$FICHIER" | cut -f1))"

# rétention
find "$DOSSIER" -name 'frere-flow-*.archive.gz.gpg' -type f -mtime +"$RETENTION_JOURS" -print -delete

# copie hors du serveur (recommandé) : décommentez après avoir configuré rclone (ex. Google Drive, S3)
# rclone copy "$FICHIER" sauvegardes-distantes:frere-flow/ --quiet
