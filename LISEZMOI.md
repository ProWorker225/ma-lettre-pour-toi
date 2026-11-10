# Une lettre pour toi : installation et fonctionnement

Le site a trois côtés :

- **Le propriétaire (toi)** génère des codes d'activation, les vend, et peut désactiver ou supprimer un client.
- **Les clients** créent un compte avec un code d'activation, puis préparent une ou plusieurs surprises : photos, lettre, code à 6 chiffres. Chaque client ne voit que ses propres surprises.
- **La personne qui reçoit le lien** (par exemple la copine) ouvre la surprise sans compte, après avoir tapé le bon code.

Il faut deux services gratuits : **Supabase** (comptes, données, photos et une petite fonction serveur) et **Netlify** (hébergement du site).

## Organisation du dossier

```
surprise-site/
├─ public/                  ← le site : C'EST CE DOSSIER QU'ON GLISSE SUR NETLIFY
│  ├─ index.html, app.js, style.css, config.js
│  ├─ _headers              (en-têtes de sécurité lus par Netlify)
│  ├─ vendor/               (bibliothèques supabase-js et qrcode, copiées ici)
│  └─ twemoji/              (dessins des émojis visages, licence CC BY 4.0)
├─ supabase/
│  ├─ supabase.sql          (schéma de la base, à coller dans Supabase)
│  └─ functions/open-surprise/index.ts   (fonction serveur, à coller dans Supabase)
└─ LISEZMOI.md
```

Ne glisse **jamais** le dossier `surprise-site` entier sur Netlify : `supabase.sql` et ce fichier deviendraient publics.

---

## Installation neuve

### 1. Créer le projet Supabase

1. Sur https://supabase.com, crée un projet (région **Europe**).
2. **Crée ton compte de propriétaire en premier** : **Authentication → Users → Add user → Create new user**. Mets ton e-mail et un mot de passe, et coche **Auto Confirm User**.
3. Clique sur ce compte et copie son **User UID** (du type `3f2b…-…`).

### 2. Lancer le SQL

1. Ouvre `supabase/supabase.sql` et colle ton User UID à la place de `COLLE-ICI-TON-USER-UID` (tout en haut).
2. Dans Supabase : **SQL Editor → nouveau snippet**, colle **tout** le fichier, puis clique sur **Run**.
3. Le résultat doit afficher `OK : schéma à jour, propriétaire configuré.` S'il affiche `ATTENTION`, c'est que le User UID est absent ou faux : corrige-le et relance le fichier.

Le fichier peut être relancé à tout moment sans rien effacer.

### 3. Déployer la fonction serveur `open-surprise`

C'est elle qui vérifie le code de la surprise (avec la limite d'essais) et qui crée des liens temporaires vers les photos, qui sont privées.

1. Dans Supabase : **Edge Functions → Deploy a new function → Via Editor**.
2. Nom de la fonction : `open-surprise` (exactement).
3. Remplace le code d'exemple par **tout** le contenu de `supabase/functions/open-surprise/index.ts`, puis clique sur **Deploy**.
4. Ouvre la fonction → **Details** (ou **Settings**) → désactive **Verify JWT** (ou « Enforce JWT verification »), puis enregistre. La personne qui reçoit la surprise n'a pas de compte : la fonction fait elle-même toutes les vérifications.

La fonction utilise la clé `service_role`, que Supabase lui fournit automatiquement côté serveur. Cette clé ne doit **jamais** apparaître dans `config.js` ni dans le site.

### 4. Relier le site au projet

1. **Project Settings → API Keys** : copie la **Project URL** et la **publishable key** (`sb_publishable_…`).
2. Mets-les dans `public/config.js`.
3. Dans `public/_headers`, remplace `foarpenxuqjnkhczinwi.supabase.co` par l'adresse de ton projet (3 fois).

### 5. Réglages de sécurité de Supabase

- **Confirmation des e-mails : garde-la activée** (Authentication → Sign In / Providers → Email → **Confirm email** coché).
  Sans confirmation, n'importe qui peut créer un compte au nom d'une adresse qui n'est pas la sienne et bloquer ainsi l'inscription de la vraie personne.
  Le service d'envoi gratuit de Supabase est limité à quelques e-mails par heure. Pour vendre le service, branche un envoi SMTP gratuit (Resend, Brevo…) dans **Authentication → Emails → SMTP Settings**.
- **Mot de passe** : Authentication → Sign In / Providers → Email (ou Policies) → **Minimum password length : 8**. Si ton offre le permet, active aussi la protection contre les mots de passe divulgués.
- **Authentication → URL Configuration → Site URL** : colle l'adresse Netlify (étape 6). Ça sert aux e-mails de confirmation et de mot de passe oublié.

### 6. Mettre en ligne sur Netlify

1. Va sur https://app.netlify.com/drop.
2. Glisse **le dossier `public`** (et non `surprise-site`).
3. Renomme le site si tu veux (**Project configuration → Change project name**).
4. Si un cadenas apparaît à côté du nom : **Access & security → Visitor access → No protection**.

### 7. Vérifier

- Connecte-toi avec ton compte propriétaire : le bouton **★ Propriétaire** apparaît dans « Mes surprises ».
- Génère un code, puis crée un compte client avec un autre e-mail et ce code.
- Crée une surprise, clique sur **Voir** et tape le code.

---

## Mettre à jour une installation existante

1. Relance `supabase/supabase.sql` en entier. L'ancien propriétaire (configuré par e-mail) est conservé, et tu peux aussi coller ton User UID en haut du fichier.
2. Déploie la fonction `open-surprise` (étape 3). **Sans elle, aucune surprise ne s'ouvre**, car les photos sont maintenant privées.
3. Sur Netlify (**Deploys**), glisse le dossier **`public`**. L'ancien dossier publié contenait `supabase.sql` : le nouveau déploiement le remplace.
4. Réactive **Confirm email** et règle le mot de passe à 8 caractères (étape 5).

Les comptes, codes, surprises, photos et anciens liens continuent de marcher.

---

## Fonctionnement au quotidien

### Codes d'activation (vente)

- **Vendre un accès** : Propriétaire → **Générer** (tu peux ajouter une note, par exemple le nom du client) → **Copier** → tu envoies le code.
- **Le client** : « Créer un compte » avec son e-mail, un mot de passe et le code. Chaque code ne sert qu'une fois.
- **Désactiver un client** : il ne peut plus rien faire, et les liens de ses surprises ne s'ouvrent plus. **Réactiver** remet tout en place.
- **Supprimer un client** (ou un compte jamais activé) : efface son compte, ses surprises et ses photos.
- **Maintenance** : « Chercher les photos inutilisées » retrouve les photos envoyées mais utilisées par aucune surprise (envoi abandonné, erreur…) et permet de les supprimer.
- Un client peut aussi supprimer lui-même son compte et toutes ses données, en bas de « Mes surprises ».
- Pour afficher où acheter un code (Instagram, WhatsApp…), remplis `CONTACT` dans `public/config.js`.
- **Anciens liens avec le prénom** (du type `?s=marie-k3f9a2bq7x`) : dans « Mes surprises », le bouton **↻ Nouveau lien** les remplace par un lien entièrement aléatoire. L'ancien lien et son QR code cessent alors de marcher : il faut renvoyer le nouveau.

### Choisir le code d'une surprise

- Le code fait partie du jeu : la personne doit le **deviner grâce à l'indice**. Une date qui compte pour vous deux (JJMMAA, par exemple 140225) marche très bien.
- L'indice est visible **avant** le code.
- La personne a **5 essais**, puis une pause de 15 minutes. L'indice doit donc suffire à trouver le code en quelques tentatives.

### Ce que protège le site

- Le code est vérifié par le serveur. **Après 5 codes faux, la surprise se bloque 15 minutes**, puis 1 h, puis 24 h si les erreurs continuent.
- Avant le code, on ne reçoit que l'indice et **une seule photo** (celle du cœur).
- **Les photos sont privées** : on ne les voit qu'avec le bon code, par des liens qui expirent au bout d'une heure. Un lien de photo copié ne marche plus ensuite.
- Le code n'est pas un coffre-fort : n'y mets rien de vraiment sensible.

### Mettre à jour le site plus tard

Après une modification, retourne sur Netlify : **Deploys → glisse à nouveau le dossier `public`**. Les données ne bougent pas : elles sont dans Supabase.

---

## Limites à connaître

### Projet gratuit mis en pause

Un projet Supabase gratuit est **mis en pause après 7 jours sans activité**. Tous les liens cessent alors de marcher jusqu'à ce que tu le réactives dans le tableau de bord. Pour un service payant, c'est un vrai risque. Deux solutions :

- passer au **plan Pro** de Supabase (pas de mise en pause) ;
- ou faire « pinguer » le projet chaque jour, par exemple avec une GitHub Action gratuite (fichier `.github/workflows/ping.yml` dans un dépôt GitHub) :

```yaml
name: Garder Supabase éveillé
on:
  schedule: [{ cron: "0 8 * * *" }]   # tous les jours à 8 h (UTC)
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: >
          curl -sf -X POST "https://TON-PROJET.supabase.co/rest/v1/rpc/code_is_valid"
          -H "apikey: TA-PUBLISHABLE-KEY" -H "Content-Type: application/json"
          -d '{"p_code":"ping"}'
```

Si Supabase ne répond pas, la personne qui ouvre une surprise voit le message « Le service ne répond pas pour l'instant… recharge la page dans une minute ».

### Polices Google

Les polices (Fredoka, Nunito, Caveat, Noto Emoji) sont chargées depuis Google Fonts, qui reçoit donc l'adresse IP des visiteurs. Pour l'éviter, on peut copier les polices dans `public/` (amélioration possible).
