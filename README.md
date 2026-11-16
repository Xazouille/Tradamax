# Tradamax V1 — mise en ligne gratuite

Tradamax V1 reprend le journal actuel (tableau de bord, calendrier, R prévu, import/export) et ajoute :

- **des données partagées** : vous voyez tous les deux les mêmes trades, en direct ;
- **un onglet Prop firms** : challenges achetés, comptes financés, versements reçus, taux de réussite réel, repères du comparatif ;
- **un onglet Annonces éco** : compte rendu du jour (USD et EUR), avec les annonces qui tombent dans vos fenêtres Silver Bullet ;
- **un onglet Backtest** : import des bougies d'une minute exportées depuis MT5, gardées dans un espace privé, pour le futur backtest automatique.

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
3. Ouvrez **Réglages** (en bas du menu de gauche, ou dans la barre du bas sur téléphone) pour vérifier les marchés, puis le type (réel SAS, prop firm ou démo) et le capital de départ de chaque compte, le R prévu et le taux €/$.

Les captures d'écran de l'ancien journal ne sont pas transférées : rajoutez celles qui comptent, trade par trade.

---

## Étape 5 — Les données du backtest

1. Dans Supabase, **SQL Editor > New query** : collez le fichier `supabase/migrations/2026-11-16_backtest-historique.sql` et cliquez **Run**. Il crée l'espace privé « historique », réservé à vous deux.
2. Dans MT5 : **Affichage > Symboles** (Ctrl + U), onglet **Barres**, choisissez le symbole, la période **M1** et les dates, **Demander**, puis **Exporter les barres**.
3. Dans Tradamax, onglet **Backtest** : **Importer des bougies MT5**, choisissez le marché et le fichier. Vérifiez la ligne « Reprise après le week-end » : elle doit être identique toute l'année (sinon, changez « Heure du serveur MT5 »). Puis **Importer**.

Un nouvel export plus tard complète simplement les mois déjà importés.

MT5 ne garde souvent que quelques mois de bougies M1. Pour plusieurs années, téléchargez-les sur **histdata.com** (gratuit, sans compte) : *Download > ASCII > 1 Minute Bar Quotes*, puis le marché (`XAUUSD` pour l'or, `GRXEUR` pour le DAX, `NSXUSD` pour le Nasdaq) et l'année. Importez directement les archives .zip, plusieurs années d'un coup : Tradamax reconnaît le format, le marché et l'heure, et range ces données à part (« XAUUSD (HistData) »), sans les mélanger aux prix de votre courtier. Les fichiers Dukascopy sont aussi reconnus.

4. Collez aussi `supabase/migrations/2026-11-16_backtest-avis.sql` et `supabase/migrations/2026-11-16_backtest-controles.sql` (même méthode) : ils créent la table des avis et celle des tests de contrôle.
5. **Lancer le backtest** : choisissez le marché et la période, puis **Lancer**. Le robot applique les règles de la stratégie (simulation sur le passé, aucun ordre passé).
6. **Revue des setups** : ouvrez chaque setup, regardez le graphique et répondez « Je le prends », « Je le prends, mais autrement » ou « Je ne le prends pas » avec la raison. Le résultat s'affiche après votre réponse. **Exporter les avis** produit le fichier à donner à Claude Code pour corriger les règles. Un avis donné par erreur s'efface depuis sa fenêtre (« Effacer cet avis ») ; « Effacer mes avis » efface tous ceux que vous avez donnés, sans toucher à ceux de l'autre associé.
7. **Période de contrôle** : le backtest et la revue s'arrêtent à fin 2024. Les mois à partir de janvier 2025 sont réservés au **Test de contrôle**, qui ne se lance qu'une fois par marché et par version des règles, quand elles sont définitives. Son résultat reste enregistré et ne peut pas être effacé depuis le site.

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
| `app.js` | Le fonctionnement (journal, prop firms, annonces, backtest, connexion) |
| `backtest.js` | Le robot de backtest : règles de la stratégie appliquées aux bougies M1 (simulation uniquement) |
| `config.js` | Adresse et clé publique de votre base Supabase |
| `supabase/schema.sql` | Création des tables et des règles d'accès |
| `supabase/migrations/` | Évolutions de la base, à coller une fois chacune dans l'éditeur SQL de Supabase |
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
