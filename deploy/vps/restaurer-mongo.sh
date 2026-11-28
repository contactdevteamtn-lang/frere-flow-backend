#!/usr/bin/env bash
# Restauration d'une sauvegarde chiffrée créée par sauvegarde-mongo.sh.
#   sudo ./restaurer-mongo.sh /var/backups/frere-flow/frere-flow-20261128-0230.archive.gz.gpg          → vérifie seulement
#   sudo ./restaurer-mongo.sh /var/backups/frere-flow/frere-flow-20261128-0230.archive.gz.gpg --oui    → restaure
# ⚠ --oui REMPLACE les données actuelles (option --drop). Arrêtez l'API pendant la restauration :
#   docker compose stop api   …restauration…   docker compose start api
set -euo pipefail
FICHIER="${1:?Indiquez le fichier .archive.gz.gpg}"
URI_FICHIER="${URI_FICHIER:-/etc/frere-flow/mongo.uri}"
CLE_FICHIER="${CLE_FICHIER:-/etc/frere-flow/backup.key}"

dechiffrer() { gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$CLE_FICHIER" --decrypt "$FICHIER"; }

dechiffrer | gzip -t && echo "✔ sauvegarde lisible et intacte : $(basename "$FICHIER")"
if [ "${2:-}" != "--oui" ]; then
  echo "ℹ Rien n'a été modifié. Relancez avec --oui pour remplacer les données actuelles."
  exit 0
fi
CONF="$(mktemp)"; trap 'rm -f "$CONF"' EXIT
chmod 600 "$CONF"
printf 'uri: %s\n' "$(cat "$URI_FICHIER")" > "$CONF"
dechiffrer | mongorestore --config="$CONF" --archive --gzip --drop --quiet
echo "✔ données restaurées — redémarrez l'API : docker compose start api"
