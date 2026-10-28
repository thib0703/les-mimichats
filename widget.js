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
      code = script(who, key, MEMBRES[who === "thib" ? "eva" : "thib"]?.nom || "l'autre");
      box.innerHTML = `
        <ol class="small">
          <li>Installe <a href="${SCRIPTABLE}" target="_blank" rel="noopener">Scriptable</a> (gratuit, sur l'App Store).</li>
          <li>Touche <strong>Copier le code</strong> ci-dessous.</li>
          <li>Ouvre Scriptable, touche <strong>+</strong> en haut à droite, colle le code. Touche le titre en haut pour l'appeler <strong>Mimichats</strong>, puis <strong>OK</strong>.</li>
          <li>Sur l'écran d'accueil, appuie longuement sur un espace vide → <strong>Modifier</strong> → <strong>Ajouter un widget</strong> → <strong>Scriptable</strong> → taille moyenne → <strong>Ajouter</strong>.</li>
          <li>Appuie sur le widget → <strong>Modifier le widget</strong> → Script : <strong>Mimichats</strong>.</li>
        </ol>
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

function script(who, key, otherName) {
  const api = `https://europe-west9-les-mimichats.cloudfunctions.net/widget?who=${who}&k=${key}`;
  const app = location.origin + location.pathname.replace(/[^/]*$/, "");
  return `// Les mimichats — widget (créé depuis les réglages de l'appli)
const API = "${api}";
const APP = "${app}";
const fond = Color.dynamic(new Color("#ffffff"), new Color("#141414"));
const encre = Color.dynamic(new Color("#111111"), new Color("#f2f2f2"));
const gris = Color.dynamic(new Color("#7a7a7a"), new Color("#9a9a9a"));

let d = null;
try { d = await new Request(API).loadJSON(); } catch (e) {}

const w = new ListWidget();
w.backgroundColor = fond; w.url = APP; w.setPadding(14, 16, 14, 16);
const petit = config.widgetFamily === "small";
const txt = (s, size, color, bold, lines) => {
  const t = w.addText(s); t.font = bold ? Font.boldRoundedSystemFont(size) : Font.systemFont(size);
  t.textColor = color; if (lines) t.lineLimit = lines; return t;
};

txt("Les mimichats", 12, gris, true);
w.addSpacer(6);
if (!d || d.error) {
  txt(d && d.error ? d.error : "Pas de réseau pour le moment", 13, encre, false, 3);
} else {
  if (d.mot) {
    txt((d.mot.pinned ? "📌 " : "♥ ") + "${otherName}", 11, gris, true);
    txt(d.mot.text, petit ? 14 : 15, encre, true, petit ? 4 : 2);
    w.addSpacer(petit ? 4 : 8);
  }
  if (!petit || !d.mot) {
    const c = d.courses;
    txt(c.n ? "🛒 " + c.n + (c.n > 1 ? " courses : " : " course : ") + c.names.join(", ") : "🛒 Liste de courses vide", 12, encre, false, 1);
    if (d.events.length) { w.addSpacer(3); txt("📅 " + d.events[0].when + " · " + d.events[0].title, 12, encre, false, 1); }
  }
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
Script.complete();
`;
}
