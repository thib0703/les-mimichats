# Les mimichats · guide d'installation

Courses, agenda (vue mois), repas de la semaine avec recettes, tâches, envies, et dans « Plus » : frigo, dépenses partagées, factures, stock maison, films et séries, sorties, idées cadeaux (privées), souvenirs et mots doux.

Durée : environ 1 h, sur ordinateur. Tout est gratuit.

---

## 1. Créer le projet Firebase (la base de données)

1. Va sur **console.firebase.google.com** et connecte-toi avec ton compte Google.
2. Clique sur **Créer un projet** et nomme-le `les-mimichats`. Tu peux désactiver Google Analytics, il ne sert pas ici.

## 2. Activer la connexion et créer vos deux comptes

1. Dans le menu de gauche : **Créer → Authentication → Commencer**.
2. Choisis **Adresse e-mail/Mot de passe**, active le premier interrupteur, puis **Enregistrer**.
3. Onglet **Utilisateurs → Ajouter un utilisateur** : mets ton e-mail et un mot de passe.
4. Recommence pour Eva, avec son e-mail et son mot de passe.

## 3. Créer la base et la protéger

1. Menu de gauche : **Créer → Firestore Database → Créer une base de données**.
2. Emplacement : **europe-west9 (Paris)**, puis mode **production**.
3. Onglet **Règles** : efface tout, colle le contenu du fichier `firestore.rules` **en remplaçant les deux adresses d'exemple par vos vrais e-mails (chacune apparaît 2 fois)**, puis **Publier**.

## 4. Relier l'appli à Firebase

1. Clique sur la roue crantée en haut à gauche, puis **Paramètres du projet**.
2. En bas, dans « Vos applications », clique sur l'icône **`</>`** (Web). Nomme-la `mimichats`, sans cocher Hosting, puis **Enregistrer**.
3. Firebase affiche un bloc `const firebaseConfig = { ... }`. Ouvre le fichier `firebase-config.js` et remplace chaque `A_REMPLIR` par les valeurs de ce bloc.
4. Dans le même fichier, remplace `thib@exemple.fr` et `eva@exemple.fr` par vos vrais e-mails.

Ces clés peuvent être publiques sans risque : ce sont les règles de l'étape 3 qui empêchent quiconque d'autre que vous deux de lire vos données.

## 5. Mettre l'appli en ligne avec GitHub Pages

1. Crée un compte sur **github.com** si tu n'en as pas.
2. Clique sur **+ → New repository**, nomme-le `les-mimichats`, laisse-le en **Public** et clique sur **Create repository**.
3. Clique sur **uploading an existing file** et glisse **tout le contenu** du dossier `les-mimichats` (les fichiers et les dossiers `icons` et `functions`, pas le dossier parent). Clique ensuite sur **Commit changes**.
4. Va dans **Settings → Pages**. Sous « Branch », choisis **main** et **/ (root)**, puis **Save**.
5. Attends 1 à 2 minutes. Ton adresse s'affiche : `https://TON-PSEUDO.github.io/les-mimichats/`

## 6. Autoriser cette adresse dans Firebase

Dans Firebase : **Authentication → Paramètres → Domaines autorisés → Ajouter un domaine** → `TON-PSEUDO.github.io`.

## 7. Installer sur vos téléphones

- **iPhone** : ouvre l'adresse dans **Safari**, appuie sur **Partager**, puis **Sur l'écran d'accueil**.
- **Android** : ouvre l'adresse dans **Chrome**, menu **⋮**, puis **Installer l'application**.

Connectez-vous chacun avec votre e-mail et votre mot de passe. C'est prêt.

## 8. Les mises à jour depuis ton téléphone

Pour que Claude publie les nouvelles versions directement, connecte ton compte GitHub à Claude, puis indique le nom du dépôt (`TON-PSEUDO/les-mimichats`). Il suffira ensuite de demander « ajoute les menus de la semaine » pour voir la nouveauté à la prochaine ouverture de l'appli.

## 9. Notifications, rappels et photos (facultatif, à faire une fois l'appli rodée)

L'appli fonctionne sans cette étape. Elle débloque trois choses :
- une alerte quand l'autre ajoute une course, un événement, une tâche, une dépense ou un mot doux ;
- les **rappels d'événements** (la veille, le matin ou 1 h avant) et le rappel la veille d'une facture ;
- les **photos dans les souvenirs**.

1. **Passer Firebase en formule Blaze** : en bas à gauche de la console, **Mettre à niveau → Blaze**. Il faut enregistrer une carte bancaire, mais à votre échelle (deux personnes) vous restez largement dans la partie gratuite. Tu peux fixer une alerte de budget à 1 € pour être tranquille.
2. **Activer le stockage des photos** : menu de gauche, **Créer → Storage → Commencer**, emplacement **europe-west9 (Paris)**, mode production.
3. **Générer la clé des notifications** : **Paramètres du projet → Cloud Messaging → Certificats Web push → Générer une paire de clés**. Copie la clé dans `firebase-config.js`, à la place de `A_REMPLIR` sur la ligne `VAPID_KEY`, puis remets ce fichier sur GitHub.
4. **Mettre vos e-mails dans `storage.rules`**, comme pour `firestore.rules`.
5. **Installer l'outil Firebase sur l'ordi** : installe **Node.js** (nodejs.org, version LTS), puis ouvre un terminal et tape :
   ```
   npm install -g firebase-tools
   firebase login
   ```
6. **Envoyer les règles et le programme des notifications** : dans le terminal, place-toi dans le dossier `les-mimichats`, puis tape (en remplaçant par l'identifiant de ton projet, visible dans les paramètres Firebase) :
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules,storage --project TON-ID-DE-PROJET
   ```
7. **Activer sur chaque téléphone** : ouvre l'appli depuis son icône, puis **Réglages → Activer les notifications**. Sur iPhone, l'appli doit obligatoirement être ajoutée à l'écran d'accueil (iOS 16.4 ou plus récent).

## 10. Rubrique « Cycle » (Plus → À deux)

- Eva note le début et la fin de ses règles, son ressenti du jour, et choisit ses réglages. Thib consulte seulement.
- Ce n'est pas qu'une question d'affichage : les règles de sécurité Firebase empêchent Thib d'écrire, et ne lui laissent lire le ressenti du jour que si Eva a activé « Partager mon ressenti ».
- **À faire une fois** : recopie le nouveau `firestore.rules` dans Firebase (Firestore → Règles → Publier), avec vos deux adresses.
- Le rappel « la veille » utilise la fonction `rappelCycle` : si tu as déjà déployé les fonctions (étape 9), relance `firebase deploy --only functions`. Le texte de la notification reste discret.
- Les prévisions sont des estimations : ce n'est ni un avis médical, ni une méthode de contraception.

## Bon à savoir

- **Modifier** : touche le texte d'une ligne (course, événement, tâche, envie, dépense…) pour ouvrir sa fiche.
- **Annuler** : après une suppression, le bouton « Annuler » reste quelques secondes en bas de l'écran.
- **Sauvegarde** : Réglages → Télécharger une sauvegarde. Garde le fichier dans Fichiers, iCloud ou Google Drive. « Restaurer » remet son contenu sans rien effacer.
