// Les mimichats — affichage des widgets (exécuté par l'appli Scriptable, pas par le site).
// Le petit code collé dans Scriptable télécharge ce fichier à chaque mise à jour du widget :
// une modification ici arrive donc toute seule sur les écrans d'accueil.
// Variables fournies : API (adresse des données, avec la clé) et APP (adresse de l'appli).

// ---------- Couleurs (les mêmes que l'appli, en clair et en sombre) ----------
const C = (light, dark) => Color.dynamic(new Color(light), new Color(dark));
const fond = C("#FFFFFF", "#171717");
const encre = C("#111111", "#F2F2F2");
const gris = C("#8A8A8A", "#8F8F8F");
const trait = C("#C9C9C9", "#4A4A4A");
const pastille = C("#111111", "#F2F2F2"), surPastille = C("#FFFFFF", "#111111");
const retard = C("#B45309", "#F0A33A");
const PERSO = { thib: C("#1E3A8A", "#4A6FD8"), eva: C("#7C3AED", "#9B6BF2"), deux: C("#C62828", "#E5484D") };
const PERSO_FONCE = { thib: new Color("#152a66"), eva: new Color("#5b21b6"), deux: new Color("#8e1c1c") };
const PERSO_CLAIR = { thib: new Color("#2b4fb3"), eva: new Color("#8b4cf0"), deux: new Color("#d43a3a") };

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

// ---------- Quel widget ? ----------
// Champ « Parameter » du widget : courses, taches, mots, agenda. Vide : un peu de tout.
let P = String(args.widgetParameter || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
let fam = config.widgetFamily || "medium";
if (!config.runsInWidget) {
  // Lancé depuis Scriptable : on choisit l'aperçu à afficher.
  const a = new Alert(); a.title = "Aperçu du widget";
  ["Un peu de tout", "courses", "taches", "mots", "agenda"].forEach(x => a.addAction(x));
  a.addCancelAction("Annuler");
  const i = await a.presentSheet(); if (i < 0) return Script.complete();
  P = ["", "courses", "taches", "mots", "agenda"][i];
  const t = new Alert(); t.title = "Taille";
  ["Petit", "Moyen", "Grand"].forEach(x => t.addAction(x));
  fam = ["small", "medium", "large"][Math.max(0, await t.presentSheet())];
}
const mode = /^cour/.test(P) ? "courses" : /^(tach|todo|to do|fair)/.test(P) ? "taches"
  : /^(mot|mess)/.test(P) ? "mots" : /^(agen|cal|even)/.test(P) ? "agenda" : "tout";
const grand = fam === "large", petit = fam === "small";

let d = null, err = "";
try { d = await new Request(API).loadJSON(); if (d.error) { err = d.error; d = null; } } catch (e) { err = "Pas de réseau pour le moment"; }

const w = new ListWidget();
w.backgroundColor = fond;
w.setPadding(16, 16, 14, 16);
// Toucher le widget (ailleurs que sur une ligne) ouvre l'appli sur la bonne page.
w.url = APP + ({ courses: "#courses", taches: "#taches", mots: "#mots", agenda: "#agenda" }[mode] || "");

// ---------- Petits outils de mise en page ----------
const F = {
  titre: s => Font.boldRoundedSystemFont(s), demi: s => Font.semiboldRoundedSystemFont(s),
  texte: s => Font.regularRoundedSystemFont(s), moyen: s => Font.mediumRoundedSystemFont(s)
};
function txt(parent, s, font, color, lines) {
  const t = parent.addText(String(s)); t.font = font; t.textColor = color || encre; t.lineLimit = lines || 1; return t;
}
function symbole(parent, nom, taille, couleur) {
  const sym = SFSymbol.named(nom); if (!sym) return null;
  sym.applyFont(Font.systemFont(taille));
  const im = parent.addImage(sym.image); im.imageSize = new Size(taille, taille); im.tintColor = couleur || encre; return im;
}
function point(parent, couleur, taille) {
  const p = parent.addStack(); p.size = new Size(taille, taille); p.cornerRadius = taille / 2; p.backgroundColor = couleur; return p;
}
// En-tête : icône dans une pastille noire, titre, et le nombre à droite.
function entete(icone, titre, compte) {
  const h = w.addStack(); h.centerAlignContent();
  const b = h.addStack(); b.size = new Size(24, 24); b.cornerRadius = 7; b.backgroundColor = pastille; b.centerAlignContent();
  symbole(b, icone, 13, surPastille);
  h.addSpacer(8);
  txt(h, titre, F.titre(15));
  h.addSpacer();
  if (compte) txt(h, compte, F.titre(15), gris);
  w.addSpacer(petit ? 10 : 12);
}
function vide(icone, s) {
  w.addSpacer();
  const l1 = w.addStack(); l1.addSpacer(); symbole(l1, icone, 26, trait); l1.addSpacer();
  w.addSpacer(6);
  const l2 = w.addStack(); l2.addSpacer(); txt(l2, s, F.moyen(13), gris, 2).centerAlignText(); l2.addSpacer();
  w.addSpacer();
}
// En bas des grands widgets : rappel discret qu'on peut cocher en touchant.
function astuce() { if (grand) txt(w, "Touche une ligne pour la cocher", F.moyen(11), gris); }
function reste(n) { if (n > 0) { w.addSpacer(6); txt(w, `+ ${n} autre${n > 1 ? "s" : ""}`, F.demi(12), gris); } }
function ilya(at) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24); return j === 1 ? "hier" : `il y a ${j} jours`;
}
// Une ligne cochable : rond vide, texte, et éventuellement un petit élément à droite.
function ligneCoche(parent, texte, url, couleur, droite) {
  const r = parent.addStack(); r.centerAlignContent(); if (url && !petit) r.url = url;
  symbole(r, "circle", 16, trait);
  r.addSpacer(8);
  txt(r, texte, F.texte(petit ? 14 : 15), couleur || encre);
  r.addSpacer();
  if (droite) droite(r);
  return r;
}

// ---------- Les widgets ----------
function courses() {
  const c = d.courses, items = c.items || c.names.map(name => ({ name }));
  entete("cart.fill", "Courses", c.n ? String(c.n) : "");
  if (!c.n) return vide("checkmark.circle", "Tout est dans le panier");
  const max = grand ? 10 : 4, cols = petit ? 1 : 2, place = max * cols;
  // Trop d'articles : la dernière case devient « + N autres ».
  const trop = c.n > place, shown = trop ? items.slice(0, place - 1) : items;
  const cases = trop ? [...shown, { plus: c.n - shown.length }] : shown;
  // Une seule colonne tant que ça tient, sinon deux colonnes équilibrées.
  const parCol = cols === 1 || cases.length <= max ? max : Math.ceil(cases.length / 2);
  const row = w.addStack(); row.topAlignContent();
  for (let k = 0; k < cols; k++) {
    const part = cases.slice(k * parCol, (k + 1) * parCol); if (!part.length) break;
    const col = row.addStack(); col.layoutVertically(); col.spacing = petit ? 7 : 9;
    part.forEach(it => it.plus
      ? txt(col.addStack(), `+ ${it.plus} autre${it.plus > 1 ? "s" : ""}`, F.demi(petit ? 13 : 14), gris)
      : ligneCoche(col, it.name, it.id && lien("courses", it.id)));
    if (k < cols - 1) row.addSpacer(12);
  }
  row.addSpacer();
  w.addSpacer();
  if (Math.min(parCol, cases.length) <= max - 2) astuce();
}

function taches() {
  // Seulement ce qui est pour aujourd'hui, plus ce qui est en retard.
  const jour = d.taches.list.filter(x => x.today || x.late), n = jour.length;
  entete("checklist", "Aujourd'hui", n ? String(n) : "");
  if (!n) return vide("sparkles", "Rien à faire aujourd'hui");
  const max = grand ? 11 : 4;
  const col = w.addStack(); col.layoutVertically(); col.spacing = petit ? 7 : 9;
  const trop = n > max;
  jour.slice(0, trop ? max - 1 : max).forEach(x => ligneCoche(col, x.title, x.id && lien("taches", x.id), x.late ? retard : encre,
    petit ? null : r => { if (x.late) { txt(r, "en retard", F.demi(11), retard); r.addSpacer(8); } if (x.who) point(r, PERSO[x.who] || PERSO.deux, 8); }));
  if (trop) txt(col.addStack(), `+ ${n - max + 1} autre${n - max + 1 > 1 ? "s" : ""}`, F.demi(petit ? 13 : 14), gris);
  w.addSpacer();
  if (Math.min(n, max) <= max - 2) astuce();
}

function mots() {
  // Fond à la couleur de celle ou celui qui a écrit.
  const qui = PERSO_FONCE[d.from] ? d.from : (d.other === "Thib" ? "thib" : "eva");
  const g = new LinearGradient(); g.colors = [PERSO_CLAIR[qui], PERSO_FONCE[qui]]; g.locations = [0, 1];
  g.startPoint = new Point(0, 0); g.endPoint = new Point(1, 1);
  w.backgroundGradient = g;
  const blanc = Color.white(), blanc70 = new Color("#FFFFFF", 0.75);
  const m = d.mot || d.mots[0];
  // Prénom centré en haut, heure centrée en bas, de même hauteur : le message est pile au milieu.
  const centre = () => { const r = w.addStack(); r.centerAlignContent(); r.addSpacer(); return r; };
  const h = centre(); symbole(h, "heart.fill", 12, blanc); h.addSpacer(5); txt(h, d.other, F.titre(13), blanc); h.addSpacer();
  w.addSpacer();
  const c = centre();
  const t = txt(c, m ? m.text : `Pas encore de mot de ${d.other}`, m ? F.titre(grand ? 30 : petit ? 18 : 20) : F.demi(15), m ? blanc : blanc70, grand ? 7 : petit ? 5 : 3);
  t.centerAlignText(); t.minimumScaleFactor = 0.5;
  c.addSpacer();
  w.addSpacer();
  const b = centre();
  if (m && m.pinned) { symbole(b, "pin.fill", 11, blanc70); b.addSpacer(4); }
  txt(b, m ? ilya(m.at) : " ", F.demi(13), blanc70); b.addSpacer();
}

function agenda() {
  // Façon calendrier : le jour en grand, puis les événements d'aujourd'hui.
  const jour = d.events.filter(e => e.today || /^Aujourd'hui/.test(e.when));
  const now = new Date();
  const T = d.today || { weekday: now.toLocaleDateString("fr-FR", { weekday: "long" }), day: now.getDate(), month: now.toLocaleDateString("fr-FR", { month: "long" }) };
  const heure = e => e.time || e.when.replace(/^Aujourd'hui ?/, "") || "Toute la journée";
  const listeEv = (parent, max) => {
    const col = parent.addStack(); col.layoutVertically(); col.spacing = 8;
    jour.slice(0, max).forEach(e => {
      const r = col.addStack(); r.centerAlignContent();
      const barre = r.addStack(); barre.size = new Size(4, 32); barre.cornerRadius = 2; barre.backgroundColor = PERSO[e.who] || PERSO.deux;
      r.addSpacer(8);
      const c = r.addStack(); c.layoutVertically();
      txt(c, e.title, F.demi(14)); txt(c, heure(e), F.texte(12), gris);
      r.addSpacer();
    });
    const n = jour.length - max;
    if (n > 0) txt(col, `+ ${n} autre${n > 1 ? "s" : ""}`, F.demi(12), gris);
  };
  const dateBloc = (parent, taille) => {
    const b = parent.addStack(); b.layoutVertically();
    txt(b, T.weekday.toUpperCase(), F.titre(12), PERSO.deux);
    txt(b, String(T.day), F.titre(taille), encre);
  };
  const rien = parent => { const c = parent.addStack(); c.layoutVertically(); txt(c, "Rien de prévu", F.demi(14), gris); txt(c, "aujourd'hui", F.texte(13), gris); };

  if (petit) {
    dateBloc(w, 30); w.addSpacer(6);
    if (jour.length) listeEv(w, 2); else rien(w);
    w.addSpacer(); return;
  }
  if (!grand) {
    const r = w.addStack(); r.topAlignContent();
    const left = r.addStack(); left.layoutVertically(); left.size = new Size(84, 120);
    dateBloc(left, 40); left.addSpacer(); txt(left, T.month, F.demi(12), gris);
    r.addSpacer(10);
    if (jour.length) listeEv(r, 3); else { const c = r.addStack(); c.layoutVertically(); c.size = new Size(0, 120); c.addSpacer(); rien(c); c.addSpacer(); }
    r.addSpacer();
    return;
  }
  txt(w, T.weekday.toUpperCase(), F.titre(13), PERSO.deux);
  const h = w.addStack(); h.bottomAlignContent();
  txt(h, String(T.day), F.titre(40)); h.addSpacer(8);
  const mo = h.addStack(); mo.layoutVertically(); txt(mo, T.month, F.demi(17), gris); mo.addSpacer(7);
  h.addSpacer();
  w.addSpacer(16);
  if (jour.length) listeEv(w, 7); else rien(w);
  w.addSpacer();
}

function tout() {
  entete("heart.fill", "Les mimichats", "");
  if (d.mot) {
    const r = w.addStack(); r.centerAlignContent();
    const barre = r.addStack(); barre.size = new Size(4, petit ? 44 : 36); barre.cornerRadius = 2; barre.backgroundColor = PERSO[d.from] || PERSO.eva;
    r.addSpacer(8);
    const c = r.addStack(); c.layoutVertically();
    txt(c, d.other, F.demi(11), gris); txt(c, d.mot.text, F.demi(petit ? 14 : 15), encre, 2);
    r.addSpacer();
    w.addSpacer(10);
  }
  if (!petit || !d.mot) {
    const ligne = (icone, s) => { const r = w.addStack(); r.centerAlignContent(); symbole(r, icone, 13, gris); r.addSpacer(8); txt(r, s, F.texte(13)); r.addSpacer(); w.addSpacer(5); };
    const c = d.courses, nt = d.taches.list.filter(x => x.today || x.late).length, ev = d.events.find(e => e.today || /^Aujourd'hui/.test(e.when));
    ligne("cart", c.n ? `${c.n} course${c.n > 1 ? "s" : ""} · ${c.names.slice(0, 4).join(", ")}` : "Liste de courses vide");
    ligne("checklist", nt ? `${nt} tâche${nt > 1 ? "s" : ""} aujourd'hui` : "Aucune tâche aujourd'hui");
    ligne("calendar", ev ? `${ev.time ? ev.time + " · " : ""}${ev.title}` : "Rien de prévu aujourd'hui");
  }
  w.addSpacer();
}

if (!d) {
  entete("exclamationmark.triangle.fill", "Les mimichats", "");
  txt(w, err || "Pas de réseau pour le moment", F.moyen(13), gris, 3);
  w.addSpacer();
} else ({ courses, taches, mots, agenda, tout })[mode]();

w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (config.runsInWidget) Script.setWidget(w);
else if (fam === "small") await w.presentSmall();
else if (fam === "large") await w.presentLarge();
else await w.presentMedium();
Script.complete();
