# Sécurité de la plateforme Frère Flow

Ce document décrit les protections en place et la procédure de mise en production.
Chaque protection est vérifiée par des tests automatiques (`npm test` : 91 tests API ;
test navigateur du site, `npm run test:integration` : 48 vérifications).

## 1. Comptes et connexion
| Protection | Détail |
|---|---|
| Mots de passe chiffrés | scrypt + sel aléatoire ; jamais stockés en clair, jamais envoyés au navigateur |
| Mot de passe fort obligatoire | 8 caractères min., lettres + chiffres, sans espace (ex. `Ferme2026`) |
| Anti-force brute | 8 échecs sur un compte → blocage 15 min ; 30 tentatives / 15 min par adresse IP |
| Pas de découverte des comptes | même message et même temps de réponse que l'email existe ou non |
| Comptes de démonstration | désactivés par défaut en production (`DEMO_LOGIN`) ; alerte au démarrage si un compte utilise encore « demo » |

## 1 bis. Modes de sécurité de la connexion (au choix du directeur, compte par compte)
Dans **Utilisateurs & rôles → modifier un utilisateur → « وضع حماية الدخول »** :

| Mode | Ce que vit l'utilisateur | Pour qui |
|---|---|---|
| Mot de passe seul | email + mot de passe | comptes peu sensibles |
| **Code de l'application** (recommandé) | 1ʳᵉ fois : scanner un QR code avec Google Authenticator ; ensuite taper le code à 6 chiffres du téléphone | directeur, administrateurs, caisse |
| Code PIN | 1ʳᵉ fois : choisir 4–6 chiffres ; ensuite les taper après le mot de passe | employés sans smartphone |
| Code par email | un code à 6 chiffres arrive par email (valable 10 min) | nécessite SMTP dans `.env` |
| Appareils approuvés | un nouvel ordinateur/téléphone attend l'accord du directeur | postes fixes du dépôt |

Protections : 5 essais par étape puis retour au mot de passe, code de l'application utilisable une seule fois,
PIN faciles refusés (1234, 0000…), secrets jamais envoyés au navigateur, la connexion de démonstration ne
contourne jamais un mode. Le tout premier appareil d'un administrateur est approuvé automatiquement.
**Téléphone perdu / PIN oublié** : le directeur clique « إعادة تعيين الحماية ». Si c'est le directeur lui-même :
sur le serveur, `npm run debloquer -- direction@frere-mahjoub.tn` (ou ajouter un nouveau mot de passe à la fin).

## 2. Sessions
| Protection | Détail |
|---|---|
| Cookie HttpOnly | la session est illisible par JavaScript : un script malveillant ne peut pas la voler |
| SameSite=Strict + vérification de l'origine + JSON obligatoire | aucun autre site ne peut agir à la place de l'utilisateur (CSRF) |
| Secure (HTTPS) | automatique en production |
| Durée limitée | 8 h maximum (`SESSION_HOURS`) |
| Déconnexion après inactivité | 30 min (`IDLE_MINUTES`), côté site ET côté serveur ; les mises à jour automatiques ne prolongent pas la session |
| Fermeture immédiate | à la déconnexion, au changement de mot de passe, à la désactivation du compte |
| Clé secrète unique | générée automatiquement à l'installation (jamais livrée dans le zip) |

## 3. Droits et confidentialité
| Protection | Détail |
|---|---|
| Droits vérifiés par le serveur | chaque opération exige la permission du rôle (ventes, caisse, administration…) |
| Cloisonnement des Figos | un employé rattaché à un Figo n'agit **et ne reçoit** que les ventes, crédits, paiements, caisse, caisses clients et marchés de son Figo |
| Données personnelles | sans « administration » : pas d'email ni de téléphone des autres utilisateurs |
| Historique | sans « historique » : seulement les éléments visibles ; le journal de sécurité est réservé |
| Directeur général | ses permissions ne peuvent pas être retirées ; personne ne peut désactiver son propre compte |
| Protection du directeur | un administrateur (non directeur) ne peut ni modifier/supprimer le directeur, ni donner le rôle de directeur, ni modifier les rôles ; il reste toujours au moins un directeur actif |
| Compte « اطلاع فقط » | refusé par le serveur pour **toute** modification (pas seulement des boutons masqués) |
| Compte « مسؤول السوق » | ne reçoit que les clients, ventes, dettes et caisses des marchés ; aucune caisse ni client normal |
| Marchés séparés | une dette de marché ne s'encaisse qu'avec la permission « الأسواق » ; un client de marché ne peut pas recevoir une vente ou une dette normale |

## 4. Saisies et données
| Protection | Détail |
|---|---|
| Contrôle de tous les formulaires | mêmes règles dans le site et sur le serveur (`validation.ts`) : impossible à contourner |
| Champs filtrés | champs inconnus supprimés, identifiants vérifiés, `__proto__` sans effet |
| Injection | aucune requête construite à partir des saisies ; HTML/formules Excel (`= + @`) refusés |
| Faille corrigée | une vente ne peut plus contourner le contrôle du stock (champ `marketTripId` refusé) |
| Transactions | chaque opération est entièrement enregistrée ou pas du tout ; une à la fois (aucune perte) |
| Limites | 1 Mo par requête, 600 requêtes/min par IP, 100 lignes par document |

## 4 bis. Analyse effectuée (novembre 2026) et corrections
| Point vérifié | Résultat |
|---|---|
| Élévation de privilèges (admin → directeur, modification des rôles) | **corrigé** (réservé au directeur) |
| Contournement des limites anti-force-brute avec un faux `X-Forwarded-For` | **corrigé** (seule l'adresse ajoutée par Caddy compte) |
| Remise à zéro des compteurs anti-force-brute par saturation | **corrigé** (purge des seuls compteurs expirés) |
| Injection de formules dans les exports Excel/CSV | **corrigé** (texte commençant par = + - @ neutralisé) |
| Boutons de démonstration / réinitialisation des données | **désactivés par défaut** |
| XSS (affichage de textes saisis), injection NoSQL, pollution de prototype, CSRF, vol de session | aucune faille trouvée (React échappe tout, aucune requête construite depuis les saisies, cookie HttpOnly + SameSite) |
| Fuite de données entre Figos / rôles / marchés | aucune (filtrage côté serveur, testé) |
| Session déconnectée réutilisable après un redémarrage du serveur | **corrigé** (sessions fermées enregistrées dans MongoDB, effacées à expiration) |
| Saturation par un compte connecté (opérations en rafale) | **corrigé** (120 opérations / minute / compte, `OPS_USER_LIMIT`, en plus de 600 requêtes / minute / adresse IP) |
| Dépendances | 2 seulement (`mongodb`, `date-fns`) : lancer `npm audit` chaque mois |

## 5. Traçabilité
Le **journal de sécurité** (page Historique, réservé au rôle « historique ») enregistre :
connexions, déconnexions, échecs de connexion, blocages, fins de session par inactivité, changements de mot de passe,
codes de vérification erronés, nouveaux appareils, approbations / retraits d'appareils, réinitialisations.
Toutes les opérations métier (ventes, paiements, caisse, stock…) sont aussi tracées avec l'utilisateur et la date.

## 6. Sauvegardes
- Automatiques toutes les 24 h (`BACKUP_HOURS`) dans `sauvegardes/`, 14 conservées (`BACKUP_KEEP`).
- **Chiffrées** (AES-256-GCM) si `BACKUP_KEY` est défini — conservez cette clé hors du serveur.
- Manuelles : `npm run sauvegarde` ; restauration : `npm run restaurer -- sauvegardes/<fichier> --oui`
  (une sauvegarde de sécurité est faite juste avant).
- Copiez régulièrement le dossier `sauvegardes/` ailleurs (clé USB, autre ordinateur, cloud).

## 7. Mise en production — liste de contrôle
1. **Serveur** : un VPS (ou PC dédié) à jour, pare-feu ouvert uniquement sur 80/443.
2. **HTTPS** : Caddy avec `deploy/Caddyfile` (certificat automatique, en-têtes de sécurité, CSP).
   Les ports 3000 et 4000 ne doivent PAS être accessibles depuis Internet.
3. **`.env` du serveur** :
   ```
   NODE_ENV=production
   CORS_ORIGIN=https://gestion.frere-mahjoub.tn
   TRUST_PROXY=true
   COOKIE_SECURE=true
   DEMO_LOGIN=false
   ALLOW_DEMO_RESET=false
   SEED_MODE=propre
   ADMIN_PASSWORD=<mot de passe fort>
   SMTP_HOST=smtp.gmail.com   # seulement pour le mode « code par email »
   SMTP_USER=...  SMTP_PASS=<mot de passe d'application>
   BACKUP_KEY=<40 caractères aléatoires>
   ```
   Le serveur **refuse de démarrer** en production si `JWT_SECRET` ou `CORS_ORIGIN` manquent.
4. **Site** : construire avec `VITE_API_URL=/api` (même adresse que le site).
5. **MongoDB Atlas** :
   - utilisateur avec le rôle **readWrite sur la base `ferme` uniquement** (pas « any database ») ;
   - **Network Access** : seulement l'adresse IP du serveur (jamais `0.0.0.0/0`) ;
   - **double authentification (MFA)** sur le compte Atlas ;
   - mot de passe de la base long et aléatoire.
6. **Comptes** : changer les mots de passe initiaux (bandeau jaune jusqu'au changement), activer « code de l'application » au moins pour le directeur, supprimer/désactiver les comptes inutiles,
   donner à chacun le rôle minimum nécessaire et le rattacher à son Figo.
7. **Mises à jour** : `npm audit` et `npm update` chaque mois (2 dépendances seulement : `mongodb`, `date-fns`).
8. **Vérification** : `npm run verifier` (base), `npm test` (sécurité), puis connexion depuis un autre poste.

## 8. Limites connues (à connaître)
- Les limites anti-abus sont par serveur : avec plusieurs serveurs, prévoir un pare-feu applicatif.
- La sécurité du poste de travail (antivirus, session Windows verrouillée) reste indispensable.
