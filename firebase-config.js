// Projet Firebase « les-mimichats » (ces clés peuvent être publiques : la sécurité vient des règles Firebase).
export const firebaseConfig = {
  apiKey: "AIzaSyA7x3KLGCIVF8fWZrZ_JwJnSRKAyI0WEA0",
  authDomain: "les-mimichats.firebaseapp.com",
  projectId: "les-mimichats",
  storageBucket: "les-mimichats.firebasestorage.app",
  messagingSenderId: "564623606130",
  appId: "1:564623606130:web:463f4d42b7e3748f2a5deb"
};

// Vous deux. Les adresses e-mail ne sont pas écrites en clair (le dépôt GitHub est public) :
// seule leur empreinte SHA-256 est ici, pour reconnaître qui se connecte.
export const MEMBRES = {
  thib: { nom: "Thib", hash: "37e16c817be85362689b16f6c6e0451aefbe7e9a51d57d9437079263a05703a8" },
  eva:  { nom: "Eva",  hash: "9a6e67c7fe64c17353e4a59594b0e4cd580c8359428f9516224366c7037730a4" }
};

// Clé pour les notifications (étape 9 du guide, facultative).
// Firebase → Paramètres du projet → Cloud Messaging → Certificats Web push → « Générer une paire de clés ».
export const VAPID_KEY = "A_REMPLIR";
