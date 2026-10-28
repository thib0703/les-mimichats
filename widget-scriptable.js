// Les mimichats — affichage des widgets (exécuté par l'appli Scriptable, pas par le site).
// Le petit code collé dans Scriptable télécharge ce fichier à chaque mise à jour du widget :
// une modification ici arrive donc toute seule sur les écrans d'accueil.
// Variables fournies : API (adresse des données, avec la clé) et APP (adresse de l'appli).

const fond = Color.dynamic(new Color("#ffffff"), new Color("#141414"));
const encre = Color.dynamic(new Color("#111111"), new Color("#f2f2f2"));
const gris = Color.dynamic(new Color("#7a7a7a"), new Color("#9a9a9a"));
const rouge = Color.dynamic(new Color("#c0392b"), new Color("#ff6b5b"));

// ---------- Cocher depuis le widget ----------
// Toucher un article ou une tâche ouvre Scriptable avec ?check=courses:ID (ou taches:ID) : on coche, on confirme.
const QP = args.queryParameters || {};
if (QP.check) {
  const [type, id] = String(QP.check).split(":");
  const call = async (action, extra) => {
    try { return await new Request(`${API}&action=${action}&type=${type}&id=${encodeURIComponent(id)}${extra || ""}`).loadJSON(); }
    catch (e) { return { error: "Pas de réseau, réessaie dans un instant" }; }
  };
  const r = await call("check");
  const a = new Alert();
  if (r.error) { a.title = "Oups"; a.message = r.error; a.addAction("OK"); await a.presentAlert(); return Script.complete(); }
  a.title = "✓ " + r.name;
  a.message = r.already ? "C'était déjà coché." : type === "courses" ? "Dans le panier !" : r.prevDue ? "Faite ! Elle revient à sa prochaine date." : "Faite !";
  a.addAction("OK");
  if (!r.already) a.addCancelAction("Annuler");
  const i = await a.presentAlert();
  if (i === -1) {
    const u = await call("uncheck", r.prevDue ? "&prevDue=" + r.prevDue : "");
    const b = new Alert(); b.title = u.error ? "Oups" : "Annulé"; b.message = u.error || `${r.name} n'est plus coché.`; b.addAction("OK"); await b.presentAlert();
  }
  return Script.complete();
}
const lien = (type, id) => `scriptable:///run/${encodeURIComponent(Script.name())}?check=${type}:${encodeURIComponent(id)}`;

// Ce que le widget affiche : le champ « Parameter » du widget (courses, taches, mots, agenda), sinon un peu de tout.
let P = String(args.widgetParameter || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
if (!config.runsInWidget) {
  // Lancé depuis Scriptable : on choisit l'aperçu à afficher.
  const a = new Alert(); a.title = "Aperçu du widget";
  ["Un peu de tout", "courses", "taches", "mots", "agenda"].forEach(x => a.addAction(x));
  a.addCancelAction("Annuler");
  const i = await a.presentSheet(); if (i < 0) return Script.complete();
  P = ["", "courses", "taches", "mots", "agenda"][i];
}
const mode = /^cour/.test(P) ? "courses" : /^(tach|todo|to do|fair)/.test(P) ? "taches"
  : /^(mot|mess)/.test(P) ? "mots" : /^(agen|cal|even)/.test(P) ? "agenda" : "tout";
const fam = config.runsInWidget ? (config.widgetFamily || "medium") : "medium";
const grand = fam === "large", petit = fam === "small";

let d = null, err = "";
try { d = await new Request(API).loadJSON(); if (d.error) { err = d.error; d = null; } } catch (e) { err = "Pas de réseau pour le moment"; }

const w = new ListWidget();
w.backgroundColor = fond; w.setPadding(14, 15, 12, 15);
// Toucher le widget ouvre l'appli sur la bonne page.
w.url = APP + ({ courses: "#courses", taches: "#taches", mots: "#mots", agenda: "#agenda" }[mode] || "");

function txt(parent, s, size, color, bold, lines) {
  const t = parent.addText(String(s)); t.font = bold ? Font.boldRoundedSystemFont(size) : Font.systemFont(size);
  t.textColor = color || encre; t.lineLimit = lines || 1; return t;
}
function entete(titre, compte) {
  const h = w.addStack(); h.centerAlignContent();
  txt(h, titre, 13, encre, true);
  h.addSpacer();
  if (compte !== undefined && compte !== "") txt(h, compte, 13, gris, true);
  w.addSpacer(petit ? 6 : 8);
}
function vide(s) { txt(w, s, 13, gris, false, 3); }
function ilya(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); return j === 1 ? "hier" : `il y a ${j} jours`;
}
// Liste en une ou deux colonnes.
function colonnes(items, ligne, max, nbCol) {
  const shown = items.slice(0, max * nbCol);
  const row = w.addStack(); row.topAlignContent();
  for (let c = 0; c < nbCol; c++) {
    const col = row.addStack(); col.layoutVertically(); col.spacing = 3;
    shown.slice(c * max, (c + 1) * max).forEach(it => ligne(col, it));
    if (c < nbCol - 1) row.addSpacer(10);
  }
  row.addSpacer();
  const reste = items.length - shown.length;
  if (reste > 0) { w.addSpacer(3); txt(w, `+ ${reste} autre${reste > 1 ? "s" : ""}`, 11, gris, true); }
}

if (!d) {
  entete("Les mimichats");
  vide(err || "Pas de réseau pour le moment");
} else if (mode === "courses") {
  const c = d.courses;
  entete("🛒 Courses", c.n || "");
  if (!c.n) vide("La liste est vide 🎉");
  else colonnes(c.items || c.names.map(name => ({ name })), (col, it) => {
    const r = col.addStack(); if (it.id && !petit) r.url = lien("courses", it.id);
    txt(r, "○ " + it.name, petit ? 13 : 14);
  }, grand ? 13 : 5, petit ? 1 : 2);
} else if (mode === "taches") {
  // Seulement ce qui est pour aujourd'hui (et ce qui est en retard, en rouge).
  const jour = d.taches.list.filter(x => x.today || x.late), n = d.taches.urgent ?? jour.length;
  entete("✓ Aujourd'hui", n || "");
  if (!n) vide("Rien à faire aujourd'hui, profitez-en !");
  else {
    const max = grand ? 13 : 5;
    jour.slice(0, max).forEach(x => {
      const r = w.addStack(); r.centerAlignContent(); if (x.id && !petit) r.url = lien("taches", x.id);
      txt(r, "○ " + x.title, petit ? 13 : 14, encre);
      if (!petit && x.late) { r.addSpacer(); txt(r, "En retard", 11, rouge, true); }
      w.addSpacer(3);
    });
    if (n > max) txt(w, `+ ${n - max} autre${n - max > 1 ? "s" : ""}`, 11, gris, true);
  }
} else if (mode === "mots") {
  entete("♥ " + d.other);
  if (!d.mots.length) vide(`Pas encore de mot de ${d.other}`);
  else {
    const liste = grand ? d.mots.slice(0, 3) : [d.mot || d.mots[0]];
    liste.forEach((m, i) => {
      txt(w, m.text, grand ? (i ? 15 : 18) : petit ? 15 : 17, encre, true, grand ? 4 : petit ? 5 : 3);
      w.addSpacer(2);
      txt(w, (m.pinned ? "📌 épinglé · " : "") + ilya(m.at), 11, gris);
      if (i < liste.length - 1) w.addSpacer(10);
    });
  }
} else if (mode === "agenda") {
  // Seulement les événements d'aujourd'hui.
  const jour = d.events.filter(e => /^Aujourd'hui/.test(e.when));
  entete("📅 Aujourd'hui", jour.length || "");
  if (!jour.length) vide("Rien de prévu aujourd'hui");
  else jour.slice(0, grand ? 10 : petit ? 3 : 4).forEach(e => {
    const heure = e.when.replace(/^Aujourd'hui ?/, "") || "Journée";
    if (petit) { txt(w, heure, 11, gris, true); txt(w, e.title, 13); w.addSpacer(3); return; }
    const r = w.addStack(); r.centerAlignContent();
    const q = r.addStack(); q.size = new Size(64, 0); txt(q, heure, 12, gris, true);
    txt(r, e.title, 14); r.addSpacer();
    w.addSpacer(4);
  });
} else {
  // Un peu de tout.
  entete("Les mimichats");
  if (d.mot) {
    txt(w, (d.mot.pinned ? "📌 " : "♥ ") + d.other, 11, gris, true);
    txt(w, d.mot.text, petit ? 14 : 15, encre, true, petit ? 3 : 2);
    w.addSpacer(petit ? 4 : 8);
  }
  if (!petit || !d.mot) {
    const c = d.courses;
    txt(w, c.n ? `🛒 ${c.n} course${c.n > 1 ? "s" : ""} : ${c.names.join(", ")}` : "🛒 Liste de courses vide", 12, encre, false, grand ? 2 : 1);
    w.addSpacer(3);
    if (d.taches.urgent) { txt(w, `✓ ${d.taches.urgent} tâche${d.taches.urgent > 1 ? "s" : ""} pour aujourd'hui`, 12); w.addSpacer(3); }
    if (d.events.length) txt(w, `📅 ${d.events[0].when} · ${d.events[0].title}`, 12);
  }
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(w);
else {
  // Lancé depuis Scriptable : aperçu.
  if (grand) await w.presentLarge(); else await w.presentMedium();
}
Script.complete();
