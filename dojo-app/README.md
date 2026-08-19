# Le dojo de l'aïkido psychologique

Application compagnon du livre *L'Aïkido Psychologique* (Elena Sitsinska).

## Déployer sur Netlify

**Point important** : ce dossier contient le code source (pas un site déjà construit). Netlify doit d'abord l'installer et le construire (`npm install` puis `npm run build`) avant de pouvoir le mettre en ligne. Glisser-déposer directement ce dossier sur Netlify ne fonctionne donc pas, il faut passer par GitHub pour que Netlify fasse cette construction automatiquement.

### Étape 1 — Mettre le code sur GitHub

1. Aller sur [github.com](https://github.com) et créer un compte gratuit (si pas déjà fait).
2. Cliquer sur **New repository** (bouton vert), lui donner un nom (ex. `dojo-aikido-psychologique`), le laisser en **Public** ou **Private** au choix, puis **Create repository**.
3. Sur la page du nouveau dépôt vide, cliquer sur **« uploading an existing file »** (lien dans le message d'accueil).
4. Glisser-déposer **tout le contenu du dossier `dojo-app`** (les fichiers et sous-dossiers : `package.json`, `src/`, `public/`, `vite.config.js`, `index.html`, `netlify.toml`, `README.md`) dans la zone d'upload.
5. En bas de page, cliquer sur **Commit changes** pour valider l'envoi.

### Étape 2 — Connecter Netlify à ce dépôt

1. Aller sur [app.netlify.com](https://app.netlify.com) et se connecter (ou créer un compte gratuit).
2. Cliquer sur **Add new site** → **Import an existing project**.
3. Choisir **GitHub**, autoriser l'accès si demandé, puis sélectionner le dépôt créé à l'étape 1.
4. Netlify détecte automatiquement `netlify.toml` et propose déjà la bonne commande (`npm run build`) et le bon dossier de sortie (`dist`) : il suffit de cliquer sur **Deploy**.
5. Au bout d'une à deux minutes, un lien `https://....netlify.app` est généré. L'application est en ligne.
6. Chaque futur changement de fichier sur GitHub redéclenche automatiquement une nouvelle mise en ligne, sans rien refaire manuellement.

Optionnel : dans Site settings → Domain management, un nom de domaine personnalisé peut être ajouté.

## Installer l'app sur un téléphone

Une fois le site en ligne, ouvrir le lien depuis le téléphone :
- **iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮ → « Ajouter à l'écran d'accueil » (ou une bannière d'installation apparaît automatiquement).

L'app s'ouvre alors comme une app native, sans barre d'adresse, avec sa propre icône.

## Développer en local (optionnel, nécessite Node.js)

```bash
npm install
npm run dev
```
Puis ouvrir l'adresse indiquée dans le terminal (en général `http://localhost:5173`).

Cette étape permet aussi, pour qui préfère éviter GitHub, de construire le site localement (`npm run build`, qui crée un dossier `dist`) puis de glisser-déposer ce dossier `dist` (lui, déjà construit) directement sur Netlify.

## Notes techniques

- **Stockage** : les données (score, ceintures, journal d'incidents, révisions) sont sauvegardées uniquement sur l'appareil de la personne (`localStorage`), jamais envoyées à un serveur. Rien à configurer.
- **Police d'écran titre** : actuellement Playfair Display (Google Fonts), en remplacement de TT Ricordi Marmo (payante). Pour l'intégrer plus tard, ajouter les fichiers de police dans `public/fonts/` et les référencer via `@font-face` dans `src/App.jsx`.
- **Icônes** : celles fournies dans `public/icons/` sont un placeholder simple (cercle teal/turquoise). À remplacer par un vrai logo quand il sera prêt, en gardant les mêmes noms de fichiers et tailles (192×192, 512×512).
- **PWA hors-ligne** : un service worker minimal (`public/sw.js`) garde l'app utilisable sans réseau après une première visite.
