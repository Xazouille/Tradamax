# DESIGN.md — système de design de Tradamax

Direction retenue le 10/11/2026 : **« Salle des marchés »**, retouchée le même jour à la demande du gérant pour un rendu plus soigné. Un outil dense et net, qui se lit comme un terminal de trading, mais avec de la matière : papier chaud et encre le jour, encre de nuit et or lumineux le soir. Ce fichier dit quand utiliser quoi ; il s'applique à toute nouvelle interface sans demander au gérant.

Tous les composants sont visibles sur la page cachée `#styleguide` (après connexion, ou en local avec `?demo#styleguide`). Sa première section, « Aperçu d'un écran », montre les composants assemblés : c'est le modèle à suivre. Les variables et les classes sont dans le `<style>` de `index.html`.

## Principes

1. **Les chiffres d'abord.** Un écran commence par ce qui se décide (état, drawdown, résultat du jour), puis les chiffres clés, puis le détail.
2. **La couleur dit un état, jamais un décor.** Vert, rouge, orange et bleu sont réservés aux états. L'or est réservé à la marque et à l'action.
3. **Dense, avec de la matière.** Les panneaux sont posés sur le fond par un filet de 1 px et une ombre très légère. Le relief reste discret : un reflet en haut des panneaux en sombre, une ombre douce en clair. Jamais de dégradé de couleur pour décorer.
4. **L'or se travaille comme un métal.** Il est toujours en dégradé (`--g-gold`), jamais en aplat, et il reste rare : le logo, le bouton principal, l'élément sélectionné, le filet en tête du bandeau de séance, la courbe principale.
5. **Clair et sombre à égalité.** Le thème suit le système ; le bouton de l'en-tête mémorise un choix par appareil. Rien ne doit être lisible dans un seul des deux.
6. **Téléphone à 390 px.** La page ne défile jamais horizontalement.

## Couleurs

Toujours passer par les variables, jamais par un code couleur écrit dans un composant.

| Variable | Rôle | À ne pas faire |
| --- | --- | --- |
| `--c-bg` | Fond de page | |
| `--c-panel`, `--c-panel-2` | Panneau, panneau discret (en-tête de tableau, pied de fenêtre, case de calendrier) | |
| `--c-raise` | Surface en relief : bouton, choix actif d'un sélecteur, info-bulle | |
| `--c-inset` | Surface en creux : piste d'une barre, fond d'un sélecteur segmenté | |
| `--c-field` | Fond des champs de saisie | |
| `--c-hover` | Survol | |
| `--c-line`, `--c-line-2` | Filet, filet appuyé (bordure des boutons) | |
| `--c-ctl` | Bordure des champs et des cases (contraste 3:1) | Ne pas utiliser `--c-line` pour un champ |
| `--c-text`, `--c-text-2`, `--c-text-3` | Texte, texte secondaire, texte discret (axes de graphique, texte indicatif d'un champ) | Pas d'opacité pour griser un texte |
| `--g-gold` | Or en dégradé : logo, bouton principal, case cochée, repère de l'onglet actif | Jamais pour un état, un statut ou une alerte |
| `--c-accent-fill`, `--c-accent-hi`, `--c-accent-lo` | Les trois tons du dégradé ; `--c-accent-fill` sert seul pour un trait (courbe, filet) | |
| `--c-accent` | Or lisible en texte (sur-titre, onglet actif) | |
| `--c-on-accent` | Texte posé sur l'or | |
| `--c-focus` | Contour du focus clavier | |
| `--c-pos` | Gain, objectif atteint, état « autorisé » | |
| `--c-neg` | Perte, échec, état « stop », suppression | |
| `--c-warn` | Alerte, état « prudence », limite proche | Ne pas confondre avec l'or |
| `--c-info` | Information, état « pause », statut « en cours » | |
| `--c-*-soft` | Fond teinté de la couleur correspondante (pastille, alerte, case de calendrier) | |

Règles :

- **Un seul bouton or par écran** (l'action principale). Les autres sont neutres.
- **Une couleur d'état n'est jamais seule** : elle s'accompagne d'un libellé ou d'une icône (accessibilité).
- Un chiffre positif prend `--c-pos`, négatif `--c-neg`, nul ou neutre reste en `--c-text`. Dans `app.js`, la fonction `cls(v)` renvoie la bonne classe (`tx-pos`, `tx-neg` ou rien).

Le fond de page porte deux lueurs très légères en haut (`--glow-a`, `--glow-b`) et des anneaux gravés à peine visibles en haut à droite (`--ring`). Ils sont posés une fois pour toutes sur `body` : ne pas en ajouter ailleurs.

## Typographie

Trois polices, chacune avec un seul rôle :

- **Instrument Serif** (`--f-title`) : le nom de la page (`tx-display`) et le titre d'une fenêtre de saisie. Rien d'autre, jamais en dessous de 22 px. L'italique doré (`<em>`) sert une fois par titre au plus.
- **Geist** (`--f-sans`) : tout le texte de l'interface.
- **IBM Plex Mono** (`--f-mono`) : tout chiffre (montants, R, pourcentages, prix, heures, dates en tableau), classe `tx-num`.

Chiffres au format français (`Intl.NumberFormat("fr-FR")`), signe moins typographique « − ».

| Variable | Taille | Usage |
| --- | --- | --- |
| `--fs-1` | 11 px | Étiquette en capitales (`tx-label`), sur-titre (`tx-eyebrow`), axe de graphique. Taille minimale. |
| `--fs-2` | 12 px | Texte d'appoint (`tx-sub`), pastille |
| `--fs-3` | 13 px | Texte courant, tableau, champ |
| `--fs-4` | 15 px | Titre de panneau (`tx-title`) |
| `--fs-5` | 22 px | Chiffre clé d'une tuile ou du bandeau de séance |
| `--fs-6` | 34 px | Chiffre principal d'un écran (`tx-hero`), un seul par panneau |
| — | 30 à 44 px | Nom de la page (`tx-display`), un seul par écran |

Graisses : 400 texte, 500 étiquette et bouton, 600 titre de panneau. Les grands chiffres sont fins (300 pour `tx-hero`, 400 pour un chiffre clé) et resserrés : c'est leur taille qui les met en avant, pas leur graisse. Pas de capitales hors étiquettes.

## Espacements, formes et relief

- Espacements : `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 24, `--sp-6` 32 px. Intérieur d'un panneau : 16 px. Entre panneaux : 14 à 16 px. Entre sections : 24 px.
- Rayons : `--r-1` 6 px (étiquette, case de calendrier), `--r-2` 9 px (bouton, champ), `--r-3` 14 px (panneau, bandeau, alerte), `--r-4` 20 px (fenêtre de saisie). Les pastilles de statut et les jauges sont entièrement arrondies.
- Ombres : `--shadow-1` (panneau, bouton), `--shadow-2` (élément flottant : info-bulle, barre du bas), `--shadow-pop` (fenêtre de saisie, message court), `--shadow-gold` (bouton principal et logo uniquement).
- Reflet : `--g-sheen`, un voile clair en haut des panneaux, visible seulement en sombre.
- Hauteur des boutons : 34 px à la souris, 42 px au doigt. Champs : 36 px et 42 px. Le passage se fait tout seul.

## Mouvement

- Les survols et les changements d'état durent 0,15 s (`--ease`).
- Une jauge ou une barre se remplit à l'affichage ; une courbe se trace (attribut `pathLength="1"` sur le trait). Ces animations ne jouent qu'une fois et n'apportent aucune information.
- `prefers-reduced-motion` coupe toutes les animations et transitions.

## Composants

Préfixe `tx-`. Les variantes s'écrivent `is-…`.

| Composant | Classes | Quand l'utiliser |
| --- | --- | --- |
| En-tête de page | `tx-eyebrow` + `tx-display` | En haut de chaque écran : un sur-titre court (date, rubrique) et le nom de la page. |
| Logo | `tx-logo` | Le « T » sur fond or, en tête du rail et sur l'écran de connexion. |
| Panneau | `tx-panel`, `tx-panel-head`, `tx-title`, `tx-sub` | Tout bloc de contenu. Pas de panneau dans un panneau. |
| Liste libellé / valeur | `dl.tx-kv` | Détails chiffrés d'un panneau. Les points de conduite se posent seuls. |
| Bouton | `tx-btn` + `is-primary`, `is-ghost`, `is-danger`, `is-icon` | Principal : une fois par écran. Discret (`is-ghost`) : annuler, fermer. Un bouton à icône seule porte un `aria-label`. |
| Champ | `tx-field` > `label` + `tx-input` (+ `tx-help`) | Tout champ a un libellé visible. Erreur : `aria-invalid="true"` et `tx-help is-error`. |
| Case à cocher | `tx-check` | |
| Sélecteur segmenté | `tx-seg` avec `aria-pressed` | 2 à 5 choix exclusifs (période, jour). Au-delà : une liste. |
| Pastille de statut | `tx-badge` + `is-pos`, `is-neg`, `is-warn`, `is-info` | Statut d'un compte, respect du plan. Sans variante : neutre (clôturé). |
| Étiquette | `tx-badge is-plain` | Sens (Long en `is-pos`, Short en `is-neg`), fenêtre, marché. |
| Variation | `tx-delta` + `is-pos`, `is-neg` | Un écart chiffré à côté d'un chiffre principal (« +480 € · +3,2 % »). |
| Rail latéral | `tx-side` > `tx-logo` + `tx-navitem` | Navigation à partir de 900 px. Icône et libellé court. |
| Barre du bas | `tx-tabbar` > `tx-navitem` | Navigation sous 900 px, flottante. Cinq entrées au maximum, le reste dans « Plus ». |
| Bandeau de séance | `tx-session` | En haut de chaque page : drawdown, résultat du jour, prochaine fenêtre, annonce à risque. Quatre cases, pas plus. |
| Bandeau d'état du jour | `tx-state` + `is-ok`, `is-caution`, `is-stop`, `is-pause` | Phase 1. Un seul à l'écran, au-dessus du bandeau de séance, avec la raison en une phrase. |
| Tuiles de chiffres | `tx-stats` > `tx-stat` | Rangée de 3 à 6 chiffres clés. Prévoir un nombre de tuiles qui remplit les rangées (4 ou 6). |
| Jauge de limite | `tx-gauge-head` + `tx-gauge` (`fill`, `mark`, `mark is-end`) | Toute valeur comparée à une limite. La jauge ou son parent porte `is-ok`, `is-caution` ou `is-stop`. Donner un `aria-label` qui dit la valeur et la limite. Avec `has-names`, chaque repère porte un nom sous son seuil (`<span>−10 %<small>Vigilance</small></span>`). |
| Tableau | `tx-table-wrap` > `tx-table` (+ `is-stack`, `is-click`) | `is-stack` dès que le tableau a plus de 4 colonnes : chaque `td` porte `data-l="Libellé"` et la ligne devient une fiche au téléphone. |
| Barre gain / perte | `tx-bar` > `track` > `i.is-pos` ou `i.is-neg` | Résultat par catégorie (marché, fenêtre). La largeur du `i` va de 0 à 50 %. |
| Calendrier | `tx-cal` > `tx-day` + `is-pos`, `is-neg`, `is-today` (+ `is-off`, `is-we`, `is-click`) | Résultat par jour. Le montant reste en couleur de texte : c'est le fond qui dit gain ou perte. Avec `has-week`, une 8e colonne `tx-week` donne le total de la semaine ; les en-têtes de jour sont des `dh`. |
| Carte de graphique | `tx-panel` > `tx-chart` + `tx-legend` + `tx-tip` | Voir « Graphiques ». |
| Checklist avec score | `tx-checklist`, `tx-score`, `tx-score-bar` | Phase 1. Score en haut à droite, cases groupées par moment. |
| Calculateur | `tx-calc` (`tx-calc-in`, `tx-calc-out`) | Phase 1. Entrées à gauche, un seul résultat mis en avant à droite. C'est la seule zone teintée d'or hors bouton. |
| Carte de compte | `tx-panel tx-account` (`tx-account-head`, `tx-account-id`, `tx-avatar`, `tx-account-foot`) | Prop firms. Initiales de la firme, nom et statut en tête, jauges, solde, versements en pied. Le parent porte `is-ok`, `is-caution`, `is-stop` ou `is-pause` : un trait de cette couleur marque le haut de la carte. |
| Alerte persistante | `tx-alert` + `is-caution`, `is-stop`, `is-pause` | Reste affichée tant que la situation dure. Titre en gras, une phrase, icône. |
| Message court | `tx-toast` | Confirmation d'une action (« Trade enregistré »). Disparaît seul. |
| Fenêtre de saisie | `tx-overlay` > `tx-dialog` (`-head`, `-body`, `-foot`), `tx-group` | Formulaires. Champs groupés par thème avec `tx-group tx-label`. Bouton principal à droite. Largeurs : normale, `is-wide` (680 px), `is-media` (image). Corps : 2 colonnes, `is-4` (4 colonnes, champs larges en `c2`, pleine largeur en `c4`) ou `is-flow` (sections empilées). |
| Puces | `tx-chips` > `tx-chip` (+ `small`, bouton de retrait) | Liste modifiable (marchés, comptes du journal). Le bouton de retrait porte un `aria-label`. |
| Bloc de code, choix de fichier | `tx-code`, `tx-file` | Format attendu d'un import ; champ d'envoi de fichier. |
| Info-bulle qui suit le pointeur | `tx-tip is-float` (+ `on`) | Graphique : placée par le code au-dessus du point survolé, jamais hors de l'écran. |
| États | `tx-empty` (+ `is-compact` dans un panneau ou une ligne de tableau), `tx-skel`, `tx-alert is-stop`, `tx-help is-error` / `is-ok` | Vide : une icône, puis dire quoi faire. Chargement : traits qui scintillent. Erreur : dire quoi vérifier. |
| Rapport imprimable | `tx-report` | Phase 4. Toujours noir sur blanc, format A4. L'impression se lance avec `data-action="print-report"`. |

Icônes : uniquement celles de la planche en tête de `index.html` (`<svg class="tx-ico"><use href="#i-…"/></svg>`). Pour en ajouter une : trait de 1,75, grille de 24, sans remplissage. Une icône d'état ou d'alerte se pose dans un petit carré teinté (automatique dans `tx-state`, `tx-alert`, `tx-empty`). Aucun emoji.

## Graphiques

- Un graphique se dessine à la taille réelle de son conteneur, pour que les textes gardent leur taille (11 px). Seuls les exemples figés du guide de style sont mis à l'échelle.
- Grille : filets pleins de 1 px (`.grid line`), en retrait ; la ligne du zéro un ton plus marquée (`.zero`).
- Valeurs de l'axe à droite, en chasse fixe, en `--c-text-3`. Un texte de graphique ne prend jamais la couleur d'une série.
- Série principale : trait or de 2 px (`.line`), voile dégradé sous la courbe (`.area`, dégradé `#tx-area`), dernier point ou point survolé marqué par une pastille cerclée (`.dot`, `.halo`).
- Gain et perte : `--c-pos` et `--c-neg`. Seuil ou palier : trait pointillé de la couleur d'état (`.limit`), avec son libellé sur l'axe.
- Un seul axe vertical par graphique. Deux mesures d'échelles différentes : deux graphiques.
- Dès qu'il y a deux éléments tracés, une légende (`tx-legend`, `i.is-dash` pour un pointillé). Tout point a une info-bulle (`tx-tip`) accessible au doigt comme à la souris, avec un repère vertical (`.cross`).
- Le `<svg>` porte `role="img"` et un `aria-label` qui résume ce qu'on voit.

## Rédaction

- Français, phrases courtes, vouvoiement.
- Bouton : un verbe (« Enregistrer », « Exporter »). Pas de « OK ».
- Erreur : ce qui s'est passé, puis quoi faire.
- Montants : « 1 250 € », « −1,50 R », « 45,8 % ».

## Accessibilité

- Contrastes AA mesurés le 10/11/2026 pour chaque couleur de texte sur `--c-bg`, `--c-panel` et `--c-panel-2`, en clair et en sombre (minimum 4,8 en clair, 5,1 en sombre). À remesurer si une couleur change.
- Focus clavier visible partout (contour de 2 px en `--c-focus` ; les champs ajoutent un halo).
- `prefers-reduced-motion` respecté : aucune animation indispensable.
- Données utilisateur toujours écrites avec `textContent`.

## Coquille de l'application

Les classes `pg-` décrivent la mise en page propre à Tradamax (elles ne sont pas des composants réutilisables). Elles sont en fin du `<style>` de `index.html`.

- **Rail** (`pg-rail`, à partir de 900 px) : logo, Journal, Prop firms, Annonces, et Réglages en bas. **Barre du bas** (`pg-tabbar`, sous 900 px) : les mêmes entrées. Un bouton d'onglet porte `data-tab` ; Réglages ouvre une fenêtre de saisie (`#btn-settings` ou `data-open="settings"`).
- **Barre du haut** (`pg-top`) : heures de Paris et de New York sur ordinateur, logo sur téléphone, utilisateur, thème, déconnexion.
- **En-tête de page** (`pg-head`, commun à tous les onglets) : la date en sur-titre, le nom de la page (`#page-title`, mis à jour par `setTab`), et les actions de l'onglet (`pg-actions` avec `data-for="journal"`, `data-for="propfirms"`…).
- **Bandeau de séance** (`#session`, sous l'en-tête, sur toutes les pages) : drawdown et résultat du jour calculés sur les trades enregistrés (jamais sur les exemples), prochaine fenêtre Silver Bullet calculée avec `Intl`, prochaine annonce forte USD ou EUR du jour. Rafraîchi toutes les 30 secondes.
- **Journal des trades** (`pg-log`) : tableau sur ordinateur, fiche compacte sur trois lignes sous 640 px.
- **Annonces** : compte rendu avec une frise de la journée en heure de Paris (fenêtres Silver Bullet en creux, annonces en points de couleur, trait « maintenant »), puis la liste détaillée.

## Ajouter un écran : la marche à suivre

1. Partir de « Aperçu d'un écran » dans `#styleguide` : en-tête de page, bandeau d'état, bandeau de séance, puis les panneaux. Un nouvel onglet s'ajoute à `TABS` et `TITLES` dans `app.js`, au rail et à la barre du bas.
2. Chercher chaque composant dans `#styleguide`. S'il existe, l'utiliser tel quel.
3. S'il manque, le créer avec le préfixe `tx-`, à partir des variables, puis l'ajouter à `#styleguide` et au tableau ci-dessus.
4. Vérifier en clair et en sombre, à 1280 px et à 390 px.
