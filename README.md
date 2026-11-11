# Tradamax V1 — mise en ligne gratuite

Tradamax V1 reprend le journal actuel (tableau de bord, calendrier, R prévu, import/export) et ajoute :

- **des données partagées** : vous voyez tous les deux les mêmes trades, en direct ;
- **un onglet Prop firms** : challenges achetés, comptes financés, versements reçus, taux de réussite réel, repères du comparatif ;
- **un onglet Annonces éco** : compte rendu du jour (USD et EUR), avec les annonces qui tombent dans vos fenêtres Silver Bullet.

Coût : **0 €**. Le site est publié par GitHub Pages, les données sont gardées par Supabase (offre gratuite).

Comptez environ 30 minutes la première fois. Vous n'avez rien à programmer.

---

## Étape 1 — La base de données (Supabase)

1. Créez un compte sur supabase.com, puis **New project** (région Europe, ex. Paris ou Francfort). Notez le mot de passe de la base dans un endroit sûr.
2. Ouvrez **SQL Editor > New query**. Collez tout le fichier `supabase/schema.sql`, puis, **dans l'éditeur de Supabase**, remplacez les deux adresses d'exemple (`gerant@exemple.fr`, `trader@exemple.fr`) par les vôtres et cliquez **Run**. Ne modifiez pas le fichier lui-même : il est publié, vos adresses deviendraient publiques.
3. **Authentication > Sign In / Providers** : désactivez « Allow new users to sign up ». Personne d'autre ne pourra créer de compte.
4. **Authentication > Users > Add user** : créez vos deux utilisateurs (même e-mails qu'à l'étape 2), avec un mot de passe chacun.
5. **Project Settings > API** : copiez l'**URL du projet** et la clé **anon public**.

> La clé « anon public » peut apparaître dans le code : sans connexion d'un des deux membres, la base ne renvoie rien.

## Étape 2 — Le code (GitHub)

1. Créez un compte sur github.com et activez la double authentification.
2. **New repository** → nom `tradamax` → **Public** (GitHub Pages est gratuit uniquement pour les dépôts publics ; votre code sera visible, **pas vos données**).
3. Dans le fichier `config.js`, remplacez `https://VOTRE-PROJET.supabase.co` et `VOTRE-CLE-ANON-PUBLIQUE` par les valeurs de l'étape 1.
4. Envoyez les fichiers dans le dépôt, au choix :
   - **Avec Claude Code (recommandé)** : ouvrez un terminal dans le dossier, lancez `claude` et demandez « Initialise le dépôt Git, relie-le à mon dépôt GitHub tradamax et pousse le code ». Git respecte le `.gitignore` : `docs-prives/` reste sur votre ordinateur.
   - **Par le site GitHub** : **Add file > Upload files**, glissez-déposez le contenu du dossier (y compris `.github`) **sauf le dossier `docs-prives`** : l'envoi par le site ignore le `.gitignore` et rendrait vos documents publics. Puis **Commit changes**.
   - Sur Mac, les dossiers commençant par un point sont masqués : faites Cmd + Maj + . dans le Finder pour les voir.

## Étape 3 — La publication (GitHub Pages)

1. Dans le dépôt : **Settings > Pages > Build and deployment > Source : GitHub Actions**.
2. Onglet **Actions** → « Publier Tradamax » → **Run workflow**.
3. Après 1 à 2 minutes, le site est en ligne à l'adresse `https://VOTRE-NOM.github.io/tradamax/`.
4. Retour dans Supabase : **Authentication > URL Configuration** → mettez cette adresse dans **Site URL** et dans **Redirect URLs** (nécessaire pour la connexion par lien e-mail).

Ensuite, chaque modification du dépôt republie le site automatiquement, et le calendrier économique est rafraîchi **chaque jour à 4h UTC**.

## Étape 4 — Reprendre votre journal actuel

1. Dans l'ancien journal Tradamax (claude.ai) : bouton **Exporter** → fichier CSV.
2. Dans le nouveau site : **Importer un CSV** → choisissez ce fichier → **Importer**.
3. Ouvrez **Réglages** (en bas du menu de gauche, ou dans la barre du bas sur téléphone) pour vérifier marchés, comptes, capital de référence, R prévu et taux €/$.

Les captures d'écran de l'ancien journal ne sont pas transférées : rajoutez celles qui comptent, trade par trade.

---

## Bon à savoir

- **Mise en pause Supabase** : un projet gratuit sans aucune activité pendant 7 jours est mis en pause. Il se réactive en un clic depuis le tableau de bord Supabase. Avec un usage quotidien, cela n'arrive pas.
- **Sauvegardes** : l'offre gratuite n'en fait pas automatiquement. Faites un **Exporter** chaque semaine et gardez le fichier.
- **Tâche quotidienne GitHub** : GitHub désactive les tâches planifiées d'un dépôt public sans activité pendant 60 jours. Si le calendrier n'est plus à jour, relancez « Publier Tradamax » depuis l'onglet Actions.
- **Calendrier** : source Forex Factory (semaine en cours). Les chiffres publiés (« actual ») n'y figurent pas.
- **Garder le code privé** : publiez plutôt avec Cloudflare Pages (gratuit, dépôt privé accepté) : *Workers & Pages > Create > Pages > Connect to Git*, commande de build `bash build.sh`, dossier de sortie `site`.
- **Usage interne uniquement** : ne donnez pas accès à des tiers et ne diffusez pas de signaux.

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page et son style |
| `app.js` | Le fonctionnement (journal, prop firms, annonces, connexion) |
| `config.js` | Adresse et clé publique de votre base Supabase |
| `supabase/schema.sql` | Création des tables et des règles d'accès |
| `build.sh` | Prépare le site et récupère le calendrier |
| `.github/workflows/publier.yml` | Publication automatique et rafraîchissement quotidien |
| `CLAUDE.md` | Règles lues par Claude Code à chaque session (projet, règles, contraintes) ; il importe le contexte interne de `docs-prives/contexte.md` |
| `DESIGN.md` | Règles du système de design (couleurs, typographie, composants) |
| `.claude/serveur-local.ps1` | Petit serveur pour tester le site sur votre ordinateur |
| `docs-prives/` | **Jamais publié** : contexte interne, feuille de route (`ROADMAP.md`), messages à envoyer à Claude Code (`PROMPTS-CLAUDE-CODE.md`), cahier des charges, charte, stratégie |
| `.gitignore` | Empêche Git de publier `docs-prives/` |

## Tester sur votre ordinateur, sans toucher à la base

Dans un terminal PowerShell ouvert dans le dossier :

```
powershell -ExecutionPolicy Bypass -File .claude\serveur-local.ps1
```

Puis ouvrez `http://localhost:8123/?demo`. Le mode démonstration affiche des données fictives gardées en mémoire : rien n'est envoyé à Supabase, et il ne s'active jamais sur le site en ligne. Tous les composants visuels sont sur `http://localhost:8123/?demo#styleguide` (en ligne : ajoutez `#styleguide` à l'adresse après connexion).

## Faire évoluer Tradamax avec Claude Code

Suivez `docs-prives/PROMPTS-CLAUDE-CODE.md`. Claude Code connaît déjà la suite grâce à `CLAUDE.md` et à la feuille de route `docs-prives/ROADMAP.md`, et vous proposera des options quand une décision sera à prendre.
