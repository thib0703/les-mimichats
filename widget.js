// Les mimichats — widget pour l'écran d'accueil de l'iPhone (via l'appli gratuite Scriptable).
// Une appli web ne peut pas avoir de widget à elle : Scriptable affiche le widget et va chercher
// les données auprès de la fonction Firebase « widget », avec une clé propre à chacun.
const SCRIPTABLE = "https://apps.apple.com/fr/app/scriptable/id1405459188";

export function initWidget({ $, db, doc, getDoc, setDoc, getMe, toast, MEMBRES }) {
  const btn = $("widgetBtn"), box = $("widgetSteps");
  let code = "";

  btn.onclick = async () => {
    const who = getMe();
    if (who !== "thib" && who !== "eva") return toast("Connecte-toi d'abord");
    btn.disabled = true;
    try {
      const ref = doc(db, "foyer/main/meta/widget");
      const snap = await getDoc(ref);
      let key = snap.exists() ? snap.data()[who] : "";
      if (!key) {
        key = [...crypto.getRandomValues(new Uint8Array(18))].map(b => b.toString(16).padStart(2, "0")).join("");
        await setDoc(ref, { [who]: key }, { merge: true });
      }
      code = script(who, key);
      box.innerHTML = `
        <ol class="small">
          <li>Installe <a href="${SCRIPTABLE}" target="_blank" rel="noopener">Scriptable</a> (gratuit, sur l'App Store).</li>
          <li>Touche <strong>Copier le code</strong> ci-dessous.</li>
          <li>Ouvre Scriptable, touche <strong>+</strong> en haut à droite, colle le code. Touche le titre en haut pour l'appeler <strong>Mimichats</strong>, puis <strong>OK</strong>.</li>
          <li>Sur l'écran d'accueil, appuie longuement sur un espace vide → <strong>Modifier</strong> → <strong>Ajouter un widget</strong> → <strong>Scriptable</strong> → taille moyenne → <strong>Ajouter</strong>.</li>
          <li>Appuie sur le widget → <strong>Modifier le widget</strong> → Script : <strong>Mimichats</strong>.</li>
          <li>Dans <strong>Parameter</strong>, écris ce qu'il doit afficher : <strong>courses</strong>, <strong>taches</strong>, <strong>mots</strong> ou <strong>agenda</strong>. Laisse vide pour un peu de tout.</li>
        </ol>
        <p class="small muted">Tu veux plusieurs widgets ? Refais seulement les étapes 4 à 6, avec un autre mot dans Parameter. Le grand format affiche plus de lignes.</p>
        <button class="btn" type="button" id="widgetCopy">Copier le code</button>
        <textarea class="widget-code" readonly rows="4" aria-label="Code du widget"></textarea>`;
      box.querySelector("textarea").value = code;
      box.hidden = false; btn.hidden = true;
      $("widgetCopy").onclick = async () => {
        try { await navigator.clipboard.writeText(code); toast("Code copié, colle-le dans Scriptable"); }
        catch (e) { const t = box.querySelector("textarea"); t.focus(); t.select(); toast("Sélectionne le texte et copie-le"); }
      };
    } catch (err) {
      console.error(err); toast("Impossible de créer le widget (" + (err.code || "réseau") + ")");
    } finally { btn.disabled = false; }
  };
}

function script(who, key) {
  const api = `https://europe-west9-les-mimichats.cloudfunctions.net/widget?who=${who}&k=${key}`;
  const app = location.origin + location.pathname.replace(/[^/]*$/, "");
  return `// Les mimichats — widget. Rien à modifier ici : l'affichage se met à jour tout seul.
// Dans chaque widget, champ « Parameter » : courses, taches, mots ou agenda (vide = un peu de tout).
const API = "${api}";
const APP = "${app}";
const fm = FileManager.local(), f = fm.joinPath(fm.documentsDirectory(), "mimichats-widget.js");
let code = "";
try {
  code = await new Request(APP + "widget-scriptable.js?v=" + Date.now()).loadString();
  if (code.includes("ListWidget")) fm.writeString(f, code); else code = "";
} catch (e) {}
if (!code && fm.fileExists(f)) code = fm.readString(f);
const AF = Object.getPrototypeOf(async function () {}).constructor;
await new AF("API", "APP", code)(API, APP);
`;
}
