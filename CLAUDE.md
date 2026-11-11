# CLAUDE.md — contexte permanent du projet Tradamax

Ce fichier est lu au début de chaque session. Il décrit le projet, les règles de travail et ce qui ne doit jamais casser. La suite prévue est dans `docs-prives/ROADMAP.md`.

## Le projet

Tradamax est l'outil interne d'une **SAS de trading** française, utilisé par ses deux associés : **le gérant** (gestion, comptabilité, contrôle du risque) et **le trader** (exécute la stratégie).

Usage **strictement interne** : jamais d'accès pour des tiers, jamais de diffusion de signaux, jamais de vente de l'outil (cela sortirait la SAS du cadre du trading pour compte propre).

Le contexte métier détaillé (associés, capital, stratégie, charte de risque, prop firms) est dans un fichier privé, absent du dépôt public, importé ici :

@docs-prives/contexte.md

Repères techniques :

- **Marchés** : XAUUSD, DAX, Nasdaq par défaut ; liste modifiable dans les Réglages.
- **Fenêtres de trading** : définies en heure de New York (`WINDOWS` dans `app.js`). L'écart avec Paris varie selon les changements d'heure : toujours calculer avec `Intl` et les fuseaux `America/New_York` et `Europe/Paris`, jamais avec un décalage fixe.
- **R** : résultat ÷ risque engagé ; objectif par défaut réglable.

## Architecture actuelle (V1)

- **Site statique**, sans étape de build : `index.html` (structure + CSS), `app.js` (logique et rendu, JavaScript sans framework), `config.js` (URL et clé publique Supabase).
- **Supabase** : authentification e-mail, base Postgres, stockage des captures (bucket privé `captures`), mises à jour en direct (realtime).
- **Publication** : GitHub Pages via `.github/workflows/publier.yml`, qui lance `build.sh` (copie des fichiers + téléchargement du calendrier économique Forex Factory dans `site/data/calendar.json`), au push et chaque jour à 4h UTC.
- **Design** : règles dans `DESIGN.md`, composants visibles sur la page cachée `#styleguide`.

### Données (voir `supabase/schema.sql`)

| Table | Rôle |
| --- | --- |
| `membres` | E-mails autorisés ; la fonction `est_membre()` conditionne toutes les règles d'accès |
| `trades` | Un trade par ligne (date, heure, marche, compte, sens, fenetre, entree, stop, sortie, taille, risque, r_prevu, resultat, plan, emotion, note, capture) |
| `reglages` | Une seule ligne (`id = 1`), champ `data` en JSON : marchés, comptes, capital, R prévu, taux €/$ |
| `prop_comptes` | Comptes prop firm (firme, programme, taille, devise, statut, cout, date_achat) |
| `payouts` | Versements reçus, liés à `prop_comptes` |

Dans `app.js`, `fromRow` / `toRow` font la correspondance entre les colonnes en français et les objets de la page.

## Règles de travail

1. **Toujours en français** : interface, messages, commits, documentation.
2. **Avant de coder** une fonctionnalité ou une refonte : lire les fichiers concernés, proposer un plan court, attendre l'accord. Pour une petite correction, agir directement.
3. **Le gérant ne sait pas toujours ce qu'il veut** : quand une décision est ouverte, proposer 2 ou 3 options concrètes avec une recommandation et sa raison, plutôt qu'une question ouverte.
4. **Petits commits**, un par étape, avec un message clair (« Journal : ajoute le filtre par fenêtre »).
5. **Base de données** : ne jamais modifier `schema.sql` après la mise en service. Toute évolution passe par un fichier `supabase/migrations/AAAA-MM-JJ_description.sql`, idempotent, que le gérant colle dans l'éditeur SQL de Supabase. Expliquer en une phrase ce qu'il fait et le rappeler en fin de session.
6. **Aucune valeur de la charte en dur** dans le code : elles vont dans `reglages` (ou une future table dédiée).
7. **Ne jamais perdre de données** : pas de suppression de colonne ni de table sans export préalable et accord explicite.
8. **Mettre à jour `docs-prives/ROADMAP.md`** (statuts, décisions prises) et le `README.md` quand une étape change la mise en ligne ou l'usage.
9. **Tester avant de rendre la main** : servir le dossier en local (`python3 -m http.server`, ou sous Windows `.claude/serveur-local.ps1`, port 8123) et ouvrir `?demo` pour le mode démonstration, puis vérifier connexion, ajout d'un trade, prop firms, annonces, en clair et en sombre, à 1280 px et 390 px. Dire clairement ce qui n'a pas pu être testé (par exemple ce qui dépend de la vraie base).

## Contraintes techniques

- Pas de framework ni d'étape de build tant que la feuille de route ne le décide pas. Bibliothèques autorisées uniquement via CDN avec version épinglée (jsDelivr, cdnjs). Polices : Google Fonts.
- Pas de nouveau service payant sans accord.
- Accessibilité : contrastes AA, focus clavier visible, `prefers-reduced-motion`, aucun emoji dans l'interface.
- Mobile : aucun défilement horizontal de la page à 390 px (les tableaux défilent dans leur propre conteneur).
- Chiffres : format français (`Intl.NumberFormat("fr-FR")`), police à chasse fixe pour les montants.
- Données affichées : toujours via `textContent`, jamais `innerHTML` avec des données utilisateur.

## Sécurité

- **Le dépôt est public** (GitHub Pages gratuit) : aucun secret, aucun document interne. La clé `anon` de Supabase est publique par conception ; la sécurité repose sur les règles d'accès de la base.
- Le dossier `docs-prives/` est exclu de Git (`.gitignore`) : il contient le contexte interne, la feuille de route, les prompts, la charte, la stratégie et le cahier des charges. Les lire pour le contexte, ne jamais les copier dans des fichiers suivis par Git. Vérifier avec `git status` avant chaque commit qu'aucun fichier de ce dossier n'est suivi.
- Aucune adresse e-mail réelle dans un fichier suivi : celles des associés se saisissent directement dans l'éditeur SQL de Supabase. Les commits sont signés avec l'adresse anonyme fournie par GitHub.
- Le cahier des charges a été écrit avant la V1 : pour l'architecture (Cloudflare, React, dépôt privé), **les choix de la V1 décrits ici priment**. Pour le reste (fonctions, règles métier, modèle de données cible), il sert de référence.
- Jamais de mot de passe de courtier ou de prop firm dans le code ou la base.
- Ne jamais coder d'exécution automatique d'ordres.
