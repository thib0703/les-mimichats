// Les mimichats — version 1 : courses, agenda, tâches.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, increment, getDocs, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, MEMBRES } from "./firebase-config.js";
import { initPlus } from "./plus.js";
import { initNotif } from "./notif.js";
import { initWidget } from "./widget.js";
import { initRecettes } from "./recettes.js";
import { initCycle } from "./cycle.js";
import { createUI } from "./ui.js";
import { occurrences, eventsOn, spanOf, diffDays, EV_RECUR, EV_REMIND } from "./occurrences.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const FOYER = "foyer/main";
const col = name => collection(db, FOYER + "/" + name);
const ref = (name, id) => doc(db, FOYER + "/" + name + "/" + id);
const foyerDoc = doc(db, FOYER);
// Données privées de chaque personne (idées cadeaux) : invisibles pour l'autre.
const pcol = name => collection(db, "prive/" + me + "/" + name);
const pref = (name, id) => doc(db, "prive/" + me + "/" + name + "/" + id);

// ---------- Utilitaires ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
const CATS = ["Fruits & légumes", "Frais", "Épicerie", "Boissons", "Surgelés", "Maison & hygiène", "Animaux", "Autre"];
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => new Date(s + "T12:00:00");
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d); };
const FMT_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const FMT_SHORT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const FMT_DM = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

let me = null; // "thib" | "eva"
const whoName = w => w === "deux" ? "Les deux" : (MEMBRES[w]?.nom || "?");
const WHO = ["deux", "thib", "eva"];

function write(promise) {
  // Hors ligne, Firebase garde l'écriture et l'envoie au retour du réseau : on n'attend pas.
  promise.catch(err => { console.error(err); setSync("off", "Échec de l'enregistrement : " + (err.code || "erreur")); });
}

const ui = createUI({ $, esc, write, setDoc, deleteDoc, MEMBRES });
const toast = (m, a, ms) => ui.toast(m, a, ms);

// ---------- Thème ----------
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  document.querySelectorAll("[data-theme-choice]").forEach(b => b.setAttribute("aria-pressed", b.dataset.themeChoice === t));
}
let theme = "auto"; try { theme = localStorage.getItem("mimi-theme") || "auto"; } catch (e) {}
applyTheme(theme);
$("themeChips").onclick = e => { const b = e.target.closest("[data-theme-choice]"); if (!b) return;
  theme = b.dataset.themeChoice; applyTheme(theme); try { localStorage.setItem("mimi-theme", theme); } catch (e) {} };

// ---------- Onglets ----------
let tab = "aujourdhui"; try { tab = localStorage.getItem("mimi-tab") || "aujourdhui"; } catch (e) {}
function showTab(t) {
  tab = t; document.body.dataset.tab = t;
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t || (t === "envies" && b.dataset.tab === "plus")));
  for (const v of ["aujourdhui", "courses", "agenda", "repas", "taches", "envies", "plus"]) $("v-" + v).hidden = v !== t;
  if (t === "aujourdhui") renderToday();
  try { localStorage.setItem("mimi-tab", t); } catch (e) {}
  window.scrollTo(0, 0);
}
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { if (b.dataset.tab === "plus" && plusApi) plusApi.showMenuRoot(); showTab(b.dataset.tab); });
$("enviesBack").onclick = () => showTab("plus");

// Glisser le doigt vers la gauche ou la droite pour passer d'un onglet à l'autre.
const TAB_ORDER = ["aujourdhui", "courses", "agenda", "repas", "taches", "plus"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let sw = null;
$("app").addEventListener("touchstart", e => {
  if (e.touches.length !== 1) { sw = null; return; }
  // Pas de changement d'onglet depuis le calendrier (il change de mois), un champ ou une fiche ouverte.
  if (e.target.closest("input, textarea, select, #cal, .sheet, .meal-edit")) { sw = null; return; }
  sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
$("app").addEventListener("touchend", e => {
  if (!sw) return;
  const dx = e.changedTouches[0].clientX - sw.x, dy = e.changedTouches[0].clientY - sw.y, dt = Date.now() - sw.t; sw = null;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || dt > 700) return;
  if (!$("editSheet").hidden || !$("recSheet").hidden || !$("settings").hidden) return;
  const cur = TAB_ORDER.indexOf(tab === "envies" ? "plus" : tab);
  const next = cur + (dx < 0 ? 1 : -1);
  if (next < 0 || next >= TAB_ORDER.length) return;
  const name = TAB_ORDER[next];
  if (name === "plus" && plusApi) plusApi.showMenuRoot();
  showTab(name);
  if (!reduceMotion) { const el = $("v-" + name); el.classList.remove("slide-from-left", "slide-from-right"); void el.offsetWidth; el.classList.add(dx < 0 ? "slide-from-right" : "slide-from-left"); }
}, { passive: true });

// ---------- Réglages ----------
const openSheet = open => { $("settings").hidden = !open; $("sheetBg").hidden = !open; };
$("openSettings").onclick = () => openSheet(true);
$("closeSettings").onclick = () => openSheet(false);
$("sheetBg").onclick = () => openSheet(false);
$("logout").onclick = () => { openSheet(false); signOut(auth); };

function setSync(state, label) { const s = $("sync"); s.className = "sync " + state; s.title = label; }

// ================= QUOI ME NOTIFIER =================
// Chacun choisit ce que les actions de l'autre lui envoient (enregistré dans foyer/main/meta/prefs).
const NOTIF_CATS = [["courses", "Courses", "ajoute un article ou fait les courses"], ["taches", "Tâches", "ajoute ou termine une tâche"],
  ["agenda", "Agenda", "ajoute un événement"], ["repas", "Repas", "prévoit un repas"], ["argent", "Argent", "ajoute une dépense ou paie une facture"],
  ["maison", "Maison", "finit un produit du frigo ou des rangements"], ["loisirs", "Loisirs", "ajoute une envie, un film, une sortie, un souvenir"],
  ["mots", "Mots doux", "m'écrit un mot doux"]];
let notifPrefs = {};
function renderNotifPrefs() {
  const el = $("notifPrefs"); if (!el) return;
  const mine = (notifPrefs.notif || {})[me] || {}, autre = MEMBRES[me === "thib" ? "eva" : "thib"]?.nom || "l'autre";
  el.innerHTML = `<p class="small muted">Me prévenir quand ${esc(autre)}…</p>` + NOTIF_CATS.map(([k, l, d]) =>
    `<label class="np-row"><span><b>${esc(l)}</b><small>${esc(d)}</small></span><input type="checkbox" data-np="${k}"${mine[k] === false ? "" : " checked"}></label>`).join("");
}
document.addEventListener("change", e => {
  const c = e.target.closest("[data-np]"); if (!c || !me) return;
  write(setDoc(ref("meta", "prefs"), { notif: { [me]: { [c.dataset.np]: c.checked } } }, { merge: true }));
});

// ================= COURSES =================
let courses = [], habitues = {}, confirmClear = false, showCart = false, achats = [], showHist = false;

// Rayon : « auto » devine d'après les achats précédents puis le nom de l'article.
function renderCats() {
  const sel = $("courseCat"), v = sel.value || "auto";
  sel.innerHTML = `<option value="auto">Rayon auto</option>` + CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = v;
}
function guessCourseCat(name) {
  const known = habitues[name.toLowerCase()]; if (known && CATS.includes(known.cat)) return known.cat;
  const n = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(shampo|gel douche|savon|dentifrice|brosse a dent|deodorant|coton|rasoir|lessive|adoucissant|papier toilette|sopalin|essuie|eponge|liquide vaisselle|pastille|javel|nettoyant|sac poubelle|mouchoir|serviette hygien|tampon|creme hydrat)/.test(n)) return "Maison & hygiène";
  if (/(croquette|litiere|patee|friandise pour|chat|chien)/.test(n)) return "Animaux";
  if (/(surgele|glace|congel)/.test(n)) return "Surgelés";
  const g = recApi && recApi.guessCat ? recApi.guessCat(name) : "Autre";
  return CATS.includes(g) ? g : "Autre";
}

function addCourse(name, category, qty) {
  name = name.trim(); if (!name) return false;
  const key = name.toLowerCase();
  if (courses.some(c => !c.done && c.name.toLowerCase() === key)) return false; // déjà dans la liste
  write(addDoc(col("courses"), { name, cat: category, qty: qty || "", done: false, by: me, at: Date.now() }));
  write(setDoc(foyerDoc, { habitues: { [key]: { name, cat: category, n: increment(1) } } }, { merge: true }));
  courses.push({ id: "tmp" + Math.random(), name, cat: category, done: false, at: Date.now() }); // évite les doublons en rafale
  return true;
}
$("addCourse").onsubmit = e => {
  e.preventDefault();
  const n = $("courseName").value.trim(); if (!n) return;
  const chosen = $("courseCat").value;
  const c = chosen === "auto" ? guessCourseCat(n) : chosen;
  if (!addCourse(n, c)) toast(`${n} est déjà dans la liste`);
  $("courseName").value = ""; $("courseCat").value = "auto";
  $("courseName").focus();
};

// Cocher un article : il est gardé dans l'historique des achats et rangé à sa place (frigo, placard…).
// Le décocher annule les deux.
function toggleCourse(i) {
  if (!i.done) {
    const info = plusApi ? plusApi.ranger(i) : null;
    const aid = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    write(setDoc(ref("achats", aid), { name: i.name, cat: i.cat || "Autre", qty: i.qty || "", by: me, at: Date.now(), day: today() }));
    write(updateDoc(ref("courses", i.id), { done: true, doneBy: me, rangement: info || null, achatId: aid }));
    if (info) toast(`${i.name} → ${info.where}`, { label: "Pas rangé", fn: () => { plusApi && plusApi.deranger(info); write(updateDoc(ref("courses", i.id), { rangement: null })); } });
  } else {
    if (i.rangement && plusApi) plusApi.deranger(i.rangement);
    if (i.achatId) write(deleteDoc(ref("achats", i.achatId)));
    write(updateDoc(ref("courses", i.id), { done: false, rangement: null, achatId: null }));
  }
}
function histSection(todoNames) {
  const limit = addDays(today(), -30);
  const list = achats.filter(a => (a.day || "") >= limit).sort((a, b) => (b.at || 0) - (a.at || 0));
  if (!list.length) return "";
  const dayLabel = d => d === today() ? "Aujourd'hui" : d === addDays(today(), -1) ? "Hier" : cap(FMT_SHORT.format(parse(d)));
  let body = "";
  if (showHist) {
    const days = [...new Set(list.map(a => a.day))];
    body = days.map(d => `<p class="hist-day">${esc(dayLabel(d))}</p><ul class="list shop-list hist-list">${list.filter(a => a.day === d).map(a => `<li class="row">
        <span class="hist-dot ${esc(a.by || "deux")}" aria-hidden="true"></span>
        <span class="txt">${esc(a.name)}${a.qty ? `<small>${esc(a.qty)}</small>` : ""}</span>
        ${todoNames.has(a.name.toLowerCase()) ? `<span class="hist-in">dans la liste</span>` : `<button class="mini" type="button" data-readd="${esc(a.id)}" aria-label="Remettre ${esc(a.name)} dans la liste">+ liste</button>`}</li>`).join("")}</ul>`).join("");
  }
  return `<section class="aisle cart hist"><div class="toolbar"><button type="button" class="cart-toggle" data-act="hist" aria-expanded="${showHist}">Achats des 30 derniers jours<span>${list.length}</span></button></div>${body}</section>`;
}
function rowCourse(i) {
  return `<li class="row${i.done ? " done" : ""}">
    <button class="check" type="button" data-toggle="${esc(i.id)}" aria-label="${i.done ? "Remettre dans la liste" : "Mettre dans le panier"}">${CHECK}</button>
    <span class="txt" data-edit-course="${esc(i.id)}">${esc(i.name)}${i.qty ? `<small>${esc(i.qty)}</small>` : ""}</span>
    <button class="del" type="button" data-del="${esc(i.id)}" aria-label="Supprimer ${esc(i.name)}">×</button></li>`;
}
function renderCourses() {
  const todo = courses.filter(c => !c.done), done = courses.filter(c => c.done);
  $("bCourses").hidden = !todo.length; $("bCourses").textContent = todo.length;
  const total = courses.length;
  $("coursesSum").textContent = !total ? "La liste est vide" : !todo.length ? "Tout est dans le panier"
    : done.length ? `${done.length} sur ${total} dans le panier` : `${todo.length} article${todo.length > 1 ? "s" : ""} à acheter`;
  $("coursesProgress").hidden = !done.length;
  $("coursesProgress").firstElementChild.style.width = total ? Math.round(done.length / total * 100) + "%" : "0";

  // Habitués : les plus achetés qui ne sont pas déjà dans la liste.
  const inList = new Set(todo.map(c => c.name.toLowerCase()));
  const top = Object.values(habitues).filter(h => h && h.name && !inList.has(h.name.toLowerCase()))
    .sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 10);
  $("quick").hidden = !top.length;
  $("quickChips").innerHTML = top.map(h => `<button type="button" class="chip quick" data-quick="${esc(h.name)}" data-qcat="${esc(h.cat)}">${esc(h.name)}</button>`).join("");
  $("habitues").innerHTML = Object.values(habitues).filter(h => h && h.name).map(h => `<option value="${esc(h.name)}"></option>`).join("");

  if (!courses.length) {
    $("courseList").innerHTML = `<div class="empty-state"><p><strong>Rien à acheter pour l'instant.</strong></p><p>Tapez un article ci-dessus : il s'affiche aussitôt sur le téléphone de l'autre.</p></div>`;
    return;
  }
  let h = "";
  for (const c of CATS) {
    const items = todo.filter(i => (CATS.includes(i.cat) ? i.cat : "Autre") === c).sort((a, b) => a.at - b.at);
    if (!items.length) continue;
    h += `<section class="aisle"><h3 class="aisle-title">${esc(c)}<span>${items.length}</span></h3><ul class="list shop-list">${items.map(rowCourse).join("")}</ul></section>`;
  }
  if (!todo.length) h += `<div class="empty-state done-state"><p><strong>Tout est dans le panier.</strong></p><p>Bonnes courses !</p></div>`;
  if (done.length) {
    h += `<section class="aisle cart"><div class="toolbar"><button type="button" class="cart-toggle" data-act="cart" aria-expanded="${showCart || !todo.length}">
        Dans le panier<span>${done.length}</span></button>` +
      (confirmClear
        ? `<span class="confirm">Retirer ${done.length} article${done.length > 1 ? "s" : ""} ?<button class="linkbtn danger" data-act="clearyes" type="button">Oui</button><button class="linkbtn" data-act="clearno" type="button">Non</button></span>`
        : `<button class="linkbtn" data-act="clear" type="button">Vider le panier</button>`) +
      `</div>${showCart || !todo.length ? `<ul class="list shop-list">${done.map(rowCourse).join("")}</ul>` : ""}</section>`;
  }
  h += histSection(new Set(todo.map(c => c.name.toLowerCase())));
  $("courseList").innerHTML = h;
}
$("quickChips").onclick = e => { const b = e.target.closest("[data-quick]"); if (b) addCourse(b.dataset.quick, b.dataset.qcat || "Autre"); };
$("courseList").onclick = e => {
  const ed = e.target.closest("[data-edit-course]");
  if (ed && !e.target.closest("a")) { const i = courses.find(c => c.id === ed.dataset.editCourse); if (i) ui.openEditor({ title: "Modifier l'article", data: i,
    fields: [{ key: "name", label: "Article", type: "text", required: true }, { key: "qty", label: "Quantité", type: "text", placeholder: "2 paquets, 500 g…" },
      { key: "cat", label: "Rayon", type: "select", options: CATS.map(c => [c, c]) }],
    onSave: v => write(updateDoc(ref("courses", i.id), v)), extra: [{ label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(ref("courses", i.id), i, i.name) }] }); return; }
  const t = e.target.closest("[data-toggle],[data-del],[data-act]"); if (!t) return;
  if (t.dataset.toggle) { const i = courses.find(c => c.id === t.dataset.toggle); if (i) toggleCourse(i); }
  else if (t.dataset.readd) { const a = achats.find(x => x.id === t.dataset.readd); if (a && addCourse(a.name, a.cat || guessCourseCat(a.name), a.qty)) toast(`${a.name} remis dans la liste`); }
  else if (t.dataset.act === "hist") { showHist = !showHist; renderCourses(); }
  else if (t.dataset.del) { const i = courses.find(c => c.id === t.dataset.del); if (i) ui.removeWithUndo(ref("courses", i.id), i, i.name); }
  else if (t.dataset.act === "cart") { showCart = !showCart; renderCourses(); }
  else if (t.dataset.act === "clear") { confirmClear = true; renderCourses(); }
  else if (t.dataset.act === "clearno") { confirmClear = false; renderCourses(); }
  else if (t.dataset.act === "clearyes") { confirmClear = false; const done = courses.filter(c => c.done);
    ui.removeManyWithUndo(done.map(i => ({ ref: ref("courses", i.id), item: i })), `${done.length} article${done.length > 1 ? "s" : ""} retiré${done.length > 1 ? "s" : ""}`); }
};

// ================= AGENDA =================
let events = [], showPast = false;

function dayLabel(s) {
  const t = today();
  const base = FMT_DAY.format(parse(s));
  if (s === t) return "Aujourd'hui, " + base;
  if (s === addDays(t, 1)) return "Demain, " + base;
  return cap(base);
}
// --- Vue Mois ---
let calView = "mois"; try { calView = localStorage.getItem("mimi-cal") || "mois"; } catch (e) {}
let selDay = today();
let calMonth = selDay.slice(0, 7); // "AAAA-MM"
const FMT_MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const monthAdd = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };

// Calendrier du mois : les événements sont écrits dans les cases, les uns sous les autres.
// Un événement sur plusieurs jours forme une seule barre continue.
const LANES = 3;
function renderCal() {
  const t = today();
  const first = new Date(+calMonth.slice(0, 4), +calMonth.slice(5, 7) - 1, 1);
  const offset = (first.getDay() + 6) % 7; // semaine qui commence le lundi
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + daysIn) / 7);
  const start0 = new Date(first); start0.setDate(1 - offset);
  let html = "";
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(start0); ws.setDate(start0.getDate() + w * 7);
    const wStart = ymd(ws), wEnd = addDays(wStart, 6);
    // Morceaux d'événements dans cette semaine
    const segs = [];
    for (const e of events) for (const s of occurrences(e, wStart, wEnd)) {
      const end = addDays(s, spanOf(e));
      const a = s < wStart ? wStart : s, z = end > wEnd ? wEnd : end;
      segs.push({ e, c1: diffDays(wStart, a), c2: diffDays(wStart, z), contL: s < wStart, contR: end > wEnd, long: spanOf(e) > 0 });
    }
    segs.sort((x, y) => (y.c2 - y.c1) - (x.c2 - x.c1) || x.c1 - y.c1 || (x.e.time || "99").localeCompare(y.e.time || "99"));
    // Placement sur des lignes sans chevauchement
    const lanes = [], hidden = [0, 0, 0, 0, 0, 0, 0];
    for (const sg of segs) {
      let l = 0;
      while (lanes[l] && lanes[l].some(o => !(sg.c2 < o.c1 || sg.c1 > o.c2))) l++;
      (lanes[l] = lanes[l] || []).push(sg); sg.lane = l;
      if (l >= LANES) for (let c = sg.c1; c <= sg.c2; c++) hidden[c]++;
    }
    let cells = "", bars = "";
    for (let i = 0; i < 7; i++) {
      const s = addDays(wStart, i);
      const n = segs.filter(sg => sg.c1 <= i && sg.c2 >= i).length;
      const cy = cycleApi ? cycleApi.dayKind(s) : "";
      const cls = ["cal-cell", s.slice(0, 7) !== calMonth && "out", s === t && "today", s === selDay && "sel", i >= 5 && "we", cy && "cy-" + (cy === "ovu" ? "fertile" : cy)].filter(Boolean).join(" ");
      const label = FMT_DAY.format(parse(s)) + (n ? `, ${n} événement${n > 1 ? "s" : ""}` : "");
      cells += `<button type="button" class="${cls}" style="grid-column:${i + 1}" data-day="${s}" aria-label="${esc(label)}"><span class="n">${parse(s).getDate()}</span></button>`;
      if (hidden[i]) bars += `<span class="cal-more" style="grid-column:${i + 1};grid-row:5">+${hidden[i]}</span>`;
    }
    for (const sg of segs) if (sg.lane < LANES) {
      const cls = ["bar", "bar-" + sg.e.who, sg.contL && "cont-l", sg.contR && "cont-r", !sg.long && sg.e.time && "timed"].filter(Boolean).join(" ");
      bars += `<span class="${cls}" style="grid-column:${sg.c1 + 1}/${sg.c2 + 2};grid-row:${sg.lane + 2}">${esc(sg.e.title)}</span>`;
    }
    // Hauteur de la semaine selon le nombre de lignes d'événements
    const used = Math.min(LANES, lanes.length), more = hidden.some(Boolean);
    const rows = `32px${used ? ` repeat(${used},18px)` : ""}${more ? " 14px" : ""} 4px`;
    html += `<div class="cal-week" style="grid-template-rows:${rows}">${cells}${bars.replace(/grid-row:5/g, `grid-row:${used + 2}`)}</div>`;
  }
  $("cal").innerHTML = `<div class="cal-head">
      <p class="cal-title">${esc(cap(FMT_MONTH.format(first)))}</p>
      <div class="cal-nav">
        ${calMonth !== t.slice(0, 7) || selDay !== t ? `<button type="button" class="today-btn" data-cal="today">Aujourd'hui</button>` : ""}
        <button type="button" data-cal="prev" aria-label="Mois précédent">‹</button>
        <button type="button" data-cal="next" aria-label="Mois suivant">›</button>
      </div></div>
    <div class="cal-wds">${["L", "M", "M", "J", "V", "S", "D"].map(w => `<span class="cal-wd">${w}</span>`).join("")}</div>
    <div class="cal-weeks">${html}</div>
    <div class="legend"><span><span class="dot thib"></span>${esc(MEMBRES.thib.nom)}</span><span><span class="dot eva"></span>${esc(MEMBRES.eva.nom)}</span><span><span class="dot deux"></span>Les deux</span></div>
    ${cycleApi && cycleApi.agendaOn() ? `<div class="legend cy-legend"><span><span class="cy-mk period"></span>Règles</span><span><span class="cy-mk period-pred"></span>Prévues</span><span><span class="cy-mk fertile"></span>Fertile</span></div>` : ""}`;
}
function selectDay(s) {
  selDay = s; calMonth = s.slice(0, 7); renderEvents();
}
$("cal").onclick = e => {
  const d = e.target.closest("[data-day]"); if (d) { selectDay(d.dataset.day); return; }
  const n = e.target.closest("[data-cal]"); if (!n) return;
  if (n.dataset.cal === "today") selectDay(today());
  else { calMonth = monthAdd(calMonth, n.dataset.cal === "next" ? 1 : -1); renderEvents(); }
};
// Glisser le doigt à gauche ou à droite pour changer de mois.
let touchX = null, touchY = null;
$("cal").addEventListener("touchstart", e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
$("cal").addEventListener("touchend", e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY; touchX = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { calMonth = monthAdd(calMonth, dx < 0 ? 1 : -1); renderEvents(); }
});
$("calViews").onclick = e => {
  const b = e.target.closest("[data-view]"); if (!b) return;
  calView = b.dataset.view; try { localStorage.setItem("mimi-cal", calView); } catch (e) {}
  renderEvents();
};

// Une ligne d'événement. `occ` : { e, start, dayIndex, days } pour un jour précis, ou { e, start } en vue Liste.
function rowEvent(occ, inList) {
  const e = occ.e, days = spanOf(e) + 1;
  const cont = !inList && occ.dayIndex > 1;
  const meta = [
    days > 1 ? (inList ? `jusqu'au ${FMT_DM.format(parse(addDays(occ.start, days - 1)))}` : `jour ${occ.dayIndex} sur ${days}`) : "",
    EV_RECUR[e.recur || "none"], EV_REMIND[e.remind || "none"]
  ].filter(Boolean).join(" · ");
  return `<li class="row ev ev-${esc(e.who)}">
      <span class="when">${cont ? "suite" : e.time ? esc(e.time) : "—"}${!cont && !e.time ? "<small>journée</small>" : !cont && e.endTime ? `<small>→ ${esc(e.endTime)}</small>` : ""}</span>
      <span class="txt" data-edit-ev="${esc(e.id)}" data-occ="${occ.start}">${esc(e.title)}${meta ? `<small>${esc(meta)}</small>` : ""}</span>
      <span class="who ${esc(e.who)}">${esc(whoName(e.who))}</span>
      <button class="del" type="button" data-del-ev="${esc(e.id)}" data-occ="${occ.start}" aria-label="Supprimer ${esc(e.title)}">×</button></li>`;
}
function upcomingCount(from, days) {
  let n = 0; for (const e of events) n += occurrences(e, from, addDays(from, days - 1)).length; return n;
}

function renderEvents() {
  const t = today();
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === calView));
  const isMonth = calView === "mois";
  $("cal").hidden = !isMonth; $("togglePast").hidden = isMonth;
  const week = upcomingCount(t, 7);
  $("bAgenda").hidden = !week; $("bAgenda").textContent = week;
  const todayN = eventsOn(events, t).length;
  $("agendaSum").textContent = (todayN ? `${todayN} aujourd'hui` : "Rien aujourd'hui") + (week ? `, ${week} cette semaine` : "");
  if (isMonth) {
    renderCal();
    // Journées entières d'abord, puis par heure de début.
    const dayEvents = eventsOn(events, selDay).sort((a, b) => (a.dayIndex > 1 || !a.e.time ? "" : a.e.time).localeCompare(b.dayIndex > 1 || !b.e.time ? "" : b.e.time));
    $("eventList").innerHTML = `<section class="day-panel"><div class="block-head"><h3>${esc(dayLabel(selDay))}</h3></div>` + (cycleApi ? cycleApi.dayDetail(selDay) : "") +
      (dayEvents.length ? `<ul class="list ev-list">${dayEvents.map(o => rowEvent(o)).join("")}</ul>` : `<button type="button" class="empty-day" data-new-ev="${selDay}">Rien de prévu. Touchez pour ajouter un événement.</button>`) + `</section>`;
    return;
  }
  // Vue Liste : 6 mois à venir, ou l'année passée.
  const from = showPast ? addDays(t, -365) : t, to = showPast ? addDays(t, -1) : addDays(t, 183);
  let occs = [];
  for (const e of events) for (const s of occurrences(e, from, to)) {
    if (!showPast && addDays(s, spanOf(e)) < t) continue;
    if (showPast && s >= t) continue;
    occs.push({ e, start: s });
  }
  occs.sort((a, b) => (a.start + (a.e.time || "99")).localeCompare(b.start + (b.e.time || "99")) * (showPast ? -1 : 1));
  if (showPast) occs = occs.slice(0, 80);
  $("togglePast").textContent = showPast ? "Revenir aux événements à venir" : "Voir les événements passés";
  if (!occs.length) {
    $("eventList").innerHTML = `<div class="empty">${showPast ? "Aucun événement passé." : "Rien de prévu pour l'instant.<br>Ajoutez un dîner, un rendez-vous, un tournoi…"}</div>`;
    return;
  }
  const by = {}; for (const o of occs) { const k = o.start < t ? t : o.start; (by[k] = by[k] || []).push(o); }
  $("eventList").innerHTML = Object.keys(by).map(d => `<section class="day-panel">
    <h3 class="list-day${d === t ? " is-today" : ""}">${esc(dayLabel(d))}</h3>
    <ul class="list ev-list">${by[d].map(o => rowEvent(o, true)).join("")}</ul></section>`).join("");
}

const EV_FIELDS = () => [
  { key: "title", label: "Événement", type: "text", required: true },
  { key: "date", label: "Date", type: "date", required: true },
  { key: "endDate", label: "Jusqu'au (plusieurs jours)", type: "date" },
  { key: "allDay", label: "Toute la journée", type: "checkbox" },
  { key: "time", label: "Début", type: "time" },
  { key: "endTime", label: "Fin (facultatif)", type: "time" },
  { key: "who", label: "Pour qui", type: "who" },
  { key: "recur", label: "Se répète", type: "select", options: Object.entries({ none: "Non", ...EV_RECUR }).filter(([k]) => k !== "none" || true).map(([k, l]) => [k, l || "Non"]) },
  { key: "remind", label: "Rappel", type: "select", options: [["none", "Aucun"], ["veille", "La veille à 20 h"], ["matin", "Le jour même à 8 h"], ["1h", "1 h avant"]] }
];
// Dans la fiche : « Toute la journée » coché grise les heures (champs ed3, ed4 et ed5).
function bindAllDay() {
  const cb = document.getElementById("ed3"), t1 = document.getElementById("ed4"), t2 = document.getElementById("ed5");
  if (!cb || !t1 || !t2) return;
  const sync = () => { for (const t of [t1, t2]) { t.disabled = cb.checked; t.closest(".field").classList.toggle("is-off", cb.checked); } };
  cb.addEventListener("change", sync); sync();
}
function cleanEvent(v) {
  if (v.endDate && v.endDate <= v.date) v.endDate = "";
  if (!v.recur) v.recur = "none"; if (!v.remind) v.remind = "none";
  // « Toute la journée » : pas d'horaire. Sans heure de début, pas d'heure de fin.
  if (v.allDay || !v.time) { v.time = ""; v.endTime = ""; v.allDay = true; }
  if (v.endTime && v.endTime <= v.time && !v.endDate) v.endTime = "";
  if (v.remind === "1h" && !v.time) v.remind = "matin";
  return v;
}
function handleEventClick(e) {
  const ed = e.target.closest("[data-edit-ev]");
  const del = e.target.closest("[data-del-ev]");
  const id = (ed || del)?.dataset.editEv || del?.dataset.delEv; if (!id) return;
  const ev = events.find(x => x.id === id); if (!ev) return;
  const occ = (ed || del).dataset.occ;
  const repeating = ev.recur && ev.recur !== "none";
  const onlyThisDay = { label: `Supprimer seulement le ${FMT_DM.format(parse(occ))}`, danger: true,
    fn: () => { const before = ev.exdates || []; write(updateDoc(ref("events", ev.id), { exdates: [...before, occ] }));
      toast(`${ev.title} retiré le ${FMT_DM.format(parse(occ))}`, { label: "Annuler", fn: () => write(updateDoc(ref("events", ev.id), { exdates: before })) }); } };
  const all = { label: repeating ? "Supprimer toute la série" : "Supprimer", danger: true, fn: () => ui.removeWithUndo(ref("events", ev.id), ev, ev.title) };
  if (del && !ed) {
    if (repeating) ui.openEditor({ title: ev.title, fields: [], data: {}, onSave: () => {}, extra: [onlyThisDay, all] });
    else ui.removeWithUndo(ref("events", ev.id), ev, ev.title);
    return;
  }
  ui.openEditor({ title: "Modifier l'événement", data: { recur: "none", remind: "none", endTime: "", ...ev, allDay: !ev.time }, fields: EV_FIELDS(),
    onSave: v => write(updateDoc(ref("events", ev.id), cleanEvent(v))), extra: repeating ? [onlyThisDay, all] : [all] });
  bindAllDay();
}
$("eventList").onclick = e => { const g = e.target.closest('[data-go="plus:cycle"]'); if (g) { if (plusApi) plusApi.openView("cycle"); showTab("plus"); return; }
  const n = e.target.closest("[data-new-ev]"); if (n) { newEvent(n.dataset.newEv); return; } handleEventClick(e); };
$("togglePast").onclick = () => { showPast = !showPast; renderEvents(); };
// Ajouter un événement : fiche réglée sur le jour sélectionné.
function newEvent(date) {
  ui.openEditor({ title: "Nouvel événement", data: { date: date || (calView === "mois" ? selDay : today()), who: "deux", recur: "none", remind: "none", allDay: false, time: "", endTime: "" },
    fields: EV_FIELDS(), onSave: v => {
      write(addDoc(col("events"), cleanEvent({ ...v, by: me, at: Date.now() })));
      toast(`${v.title} ajouté le ${FMT_DM.format(parse(v.date))}`);
      if (calView === "mois") selectDay(v.date);
    } });
  bindAllDay();
}
$("addEventBtn").onclick = () => newEvent();

// ================= TÂCHES =================
let tasks = [], taskFilter = "todo";
const RECUR = { none: "", daily: "Tous les jours", weekly: "Chaque semaine", biweekly: "Toutes les 2 semaines", monthly: "Chaque mois" };
const TASK_REMIND = [["none", "Pas de rappel"], ["jour", "Le jour même"], ["veille", "La veille"]];
const remindLabel = x => x.remind && x.remind !== "none" ? `rappel ${x.remind === "veille" ? "la veille " : ""}à ${(x.remindTime || "20:00").replace(":", "h")}` : "";
function nextDue(due, recur) {
  const t = today(); let d = due || t;
  do { d = recur === "daily" ? addDays(d, 1) : recur === "weekly" ? addDays(d, 7) : recur === "biweekly" ? addDays(d, 14) : addMonths(d, 1); } while (d <= t && recur !== "none");
  return d;
}
function dueLabel(task) {
  if (!task.due) return "";
  const t = today();
  if (task.due < t && !task.done) return `<span class="late">En retard · ${esc(FMT_SHORT.format(parse(task.due)))}</span>`;
  if (task.due === t) return "Aujourd'hui";
  if (task.due === addDays(t, 1)) return "Demain";
  return esc(FMT_SHORT.format(parse(task.due)));
}
function renderFilter() {
  const todo = tasks.filter(x => !x.done);
  const n = k => k === "done" ? tasks.filter(x => x.done).length : k === "todo" ? todo.length : todo.filter(x => x.who === k || x.who === "deux").length;
  const F = [["todo", "Tout"], ["thib", MEMBRES.thib.nom], ["eva", MEMBRES.eva.nom], ["done", "Faites"]];
  $("taskFilter").innerHTML = F.map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${k === taskFilter}">${esc(l)}<small>${n(k)}</small></button>`).join("");
}
$("taskFilter").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { taskFilter = b.dataset.f; renderFilter(); renderTasks(); } };
function renderTasks() {
  const t = today(), weekEnd = addDays(t, 6);
  const todo = tasks.filter(x => !x.done);
  const urgent = todo.filter(x => !x.due || x.due <= t).length;
  $("bTaches").hidden = !urgent; $("bTaches").textContent = urgent;
  const late = todo.filter(x => x.due && x.due < t).length, now = todo.filter(x => x.due === t).length;
  $("tachesSum").textContent = !todo.length ? "Tout est fait" : [now ? `${now} aujourd'hui` : "", late ? `${late} en retard` : "", !now && !late ? `${todo.length} à faire` : ""].filter(Boolean).join(", ");
  renderFilter();
  let list = taskFilter === "done" ? tasks.filter(x => x.done)
    : taskFilter === "todo" ? todo
    : todo.filter(x => x.who === taskFilter || x.who === "deux");
  list = list.slice().sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (b.at || 0) - (a.at || 0));
  if (!list.length) {
    $("taskList").innerHTML = `<div class="empty-state"><p><strong>${taskFilter === "done" ? "Aucune tâche terminée" : "Rien à faire"}</strong></p><p>${taskFilter === "done" ? "Les tâches cochées apparaîtront ici." : "Profitez-en, ou ajoutez une tâche avec le +."}</p></div>`;
    return;
  }
  if (taskFilter === "done") { $("taskList").innerHTML = `<ul class="list">${list.slice(0, 60).map(rowTask).join("")}</ul>`; return; }
  const groups = [["En retard", x => x.due && x.due < t], ["Aujourd'hui", x => x.due === t], ["Cette semaine", x => x.due > t && x.due <= weekEnd],
    ["Plus tard", x => x.due > weekEnd], ["Sans date", x => !x.due]];
  $("taskList").innerHTML = groups.map(([title, f]) => { const g = list.filter(f); return g.length
    ? `<section class="aisle"><h3 class="aisle-title${title === "En retard" ? " late-title" : ""}">${title}<span>${g.length}</span></h3><ul class="list">${g.map(rowTask).join("")}</ul></section>` : ""; }).join("");
}
function rowTask(x) {
  const meta = [dueLabel(x), RECUR[x.recur || "none"], remindLabel(x) ? `<span class="remind-tag">${BELL}${esc(remindLabel(x))}</span>` : ""].filter(Boolean).join(" · ");
  return `<li class="row${x.done ? " done" : ""}">
    <button class="check" type="button" data-toggle-task="${esc(x.id)}" aria-label="${x.done ? "Marquer à faire" : "Marquer faite"}">${CHECK}</button>
    <span class="txt" data-edit-task="${esc(x.id)}">${esc(x.title)}${meta ? `<small>${meta}</small>` : ""}</span>
    <span class="who ${esc(x.who)}">${esc(whoName(x.who))}</span>
    <button class="del" type="button" data-del-task="${esc(x.id)}" aria-label="Supprimer ${esc(x.title)}">×</button></li>`;
}
function handleTaskClick(e) {
  const ed = e.target.closest("[data-edit-task]");
  if (ed) { const x = tasks.find(y => y.id === ed.dataset.editTask); if (x) ui.openEditor({ title: "Modifier la tâche", data: { recur: "none", remind: "none", remindTime: "20:00", ...x },
    fields: TASK_FIELDS,
    onSave: v => { fixTask(v); write(updateDoc(ref("taches", x.id), v)); }, extra: [{ label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(ref("taches", x.id), x, x.title) }] }); return; }
  const b = e.target.closest("[data-toggle-task],[data-del-task]"); if (!b) return;
  if (b.dataset.delTask) { const x = tasks.find(y => y.id === b.dataset.delTask); if (x) ui.removeWithUndo(ref("taches", x.id), x, x.title); return; }
  const x = tasks.find(y => y.id === b.dataset.toggleTask); if (!x) return;
  if (x.recur && x.recur !== "none" && !x.done) {
    // Tâche récurrente : on la reprogramme à la prochaine échéance.
    write(updateDoc(ref("taches", x.id), { due: nextDue(x.due, x.recur), lastDoneBy: me, lastDoneAt: Date.now() }));
  } else {
    write(updateDoc(ref("taches", x.id), { done: !x.done, lastDoneBy: me, lastDoneAt: Date.now() }));
  }
}
$("taskList").onclick = handleTaskClick;
const BELL = '<svg class="bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>';
const TASK_FIELDS = [{ key: "title", label: "Tâche", type: "text", required: true, placeholder: "Sortir les poubelles, litière…" }, { key: "who", label: "Qui s'en occupe", type: "who" },
  { key: "recur", label: "Répétition", type: "select", options: [["none", "Une fois"], ["daily", "Tous les jours"], ["weekly", "Toutes les semaines"], ["biweekly", "Toutes les 2 semaines"], ["monthly", "Tous les mois"]] },
  { key: "due", label: "Date (si ça se répète : le premier jour)", type: "date" },
  { key: "remind", label: "Notification sur le téléphone", type: "select", options: TASK_REMIND },
  { key: "remindTime", label: "À quelle heure", type: "time" },
  { key: "doneMsg", label: "Quand c'est fait, l'autre reçoit (facultatif)", type: "text", placeholder: "a lancé une machine à laver" }];
// Une tâche répétée ou avec rappel a toujours une date ; l'heure par défaut est 20 h.
function fixTask(v) { if ((v.recur !== "none" || v.remind !== "none") && !v.due) v.due = today(); if (!v.remindTime) v.remindTime = "20:00"; }
$("addTaskBtn").onclick = () => ui.openEditor({ title: "Nouvelle tâche",
  data: { who: taskFilter === "thib" || taskFilter === "eva" ? taskFilter : me || "deux", recur: "none", due: today(), remind: "none", remindTime: "20:00" }, fields: TASK_FIELDS,
  onSave: v => { fixTask(v);
    write(addDoc(col("taches"), { ...v, done: false, by: me, at: Date.now() })); toast(`${v.title} ajoutée${v.remind !== "none" ? " · rappel à " + v.remindTime.replace(":", "h") : ""}`); } });

// ================= REPAS =================
// Un document par jour (id = date) avec le midi et le soir.
let repas = {}, plats = {};
const SLOTS = [["midi", "Midi"], ["soir", "Soir"]];
const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7));
let weekStart = mondayOf(today());
const FMT_WD = new Intl.DateTimeFormat("fr-FR", { weekday: "long" });
const splitIngr = s => String(s || "").split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

function renderRepas() {
  const t = today(), cur = mondayOf(t);
  const end = addDays(weekStart, 6);
  $("weekTitle").textContent = weekStart === cur ? "Cette semaine" : weekStart === addDays(cur, 7) ? "La semaine prochaine"
    : weekStart === addDays(cur, -7) ? "La semaine dernière" : "Semaine du " + FMT_DM.format(parse(weekStart));
  $("weekSub").innerHTML = esc(FMT_DM.format(parse(weekStart)) + " – " + FMT_DM.format(parse(end))) +
    (weekStart !== cur ? ` · <button type="button" class="linkbtn" data-week="0">Revenir à cette semaine</button>` : "");
  $("platsList").innerHTML = Object.values(plats).filter(p => p && p.name).map(p => `<option value="${esc(p.name)}"></option>`).join("");
  let planned = 0;
  let h = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i), r = repas[d] || {}, dd = parse(d);
    const cls = ["mday", d === t && "is-today", d < t && "past"].filter(Boolean).join(" ");
    h += `<div class="${cls}"><div class="mday-date"><span class="wd">${esc(cap(FMT_WD.format(dd)).slice(0, 3))}.</span><span class="dn">${dd.getDate()}</span>${d === t ? `<span class="tag-today">Auj.</span>` : ""}</div><div class="mday-meals">`;
    h += SLOTS.map(([k, label]) => {
      const m = r[k] || {}; if (m.plat) planned++;
      const tags = [m.recetteId ? "Recette" : "", m.inCourses ? "✓ Courses" : ""].filter(Boolean);
      return `<button type="button" class="meal${m.plat ? "" : " empty"}" data-slot="${d}|${k}">
        <span class="meal-lbl">${label}</span>
        <span class="meal-name">${m.plat ? esc(m.plat) : "Ajouter"}</span>
        ${tags.length ? `<span class="meal-tags">${tags.map(x => `<span>${esc(x)}</span>`).join("")}</span>` : ""}</button>`;
    }).join("") + `</div></div>`;
  }
  $("weekList").innerHTML = h;
  $("repasSum").textContent = planned ? `${planned} repas prévu${planned > 1 ? "s" : ""} sur 14` : "Rien de prévu cette semaine";
}
// Fiche d'un repas (midi ou soir d'un jour)
function openMealSheet(date, slot) {
  const m = (repas[date] || {})[slot] || {};
  const title = `${cap(FMT_WD.format(parse(date)))} ${FMT_DM.format(parse(date))}, ${slot === "midi" ? "midi" : "soir"}`;
  ui.openEditor({ title, data: { plat: m.plat || "", ingr: m.ingr || "" },
    fields: [{ key: "plat", label: "Plat", type: "text", list: "platsList", placeholder: "Lasagnes, salade César…" },
      { key: "ingr", label: "Ingrédients, séparés par des virgules", type: "textarea", placeholder: "Les plats déjà faits remplissent cette case tout seuls." }],
    onSave: v => saveMealValues(date, slot, v, false),
    extra: [
      m.recetteId ? { label: "Voir la recette", fn: () => { showRepasView("recettes"); recApi && recApi.openRecipe(m.recetteId, date, slot); } }
        : { label: "Choisir une recette", fn: () => { showRepasView("recettes"); recApi && recApi.openForSlot(date, slot); } },
      { label: "Enregistrer et ajouter les ingrédients aux courses", fn: v => saveMealValues(date, slot, v, true) },
      ...(m.plat ? [{ label: "Effacer ce repas", danger: true, fn: () => {
        const before = { ...m };
        write(setDoc(ref("repas", date), { [slot]: { plat: "", ingr: "", inCourses: false, recetteId: "" } }, { merge: true }));
        toast(`${before.plat} retiré`, { label: "Annuler", fn: () => write(setDoc(ref("repas", date), { [slot]: before }, { merge: true })) });
      } }] : [])
    ] });
  // Un plat déjà fait : les ingrédients se remplissent tout seuls.
  const p = $("ed0"), ing = $("ed1");
  if (p && ing) p.addEventListener("input", () => { const known = plats[p.value.trim().toLowerCase()]; if (known && !ing.value.trim()) ing.value = known.ingr || ""; });
}
function saveMealValues(date, slot, v, toCourses) {
  const plat = (v.plat || "").trim(), ingr = (v.ingr || "").trim();
  const prev = (repas[date] || {})[slot] || {};
  if (toCourses && prev.recetteId && prev.plat === plat && recApi) { recApi.planFromSlot(prev.recetteId, date, slot, prev.servings); return; }
  let inCourses = !!prev.inCourses && prev.ingr === ingr;
  if (toCourses) {
    const items = splitIngr(ingr);
    if (!items.length) toast("Ajoute d'abord des ingrédients.");
    else {
      let added = 0;
      for (const it of items) if (addCourse(it, guessCourseCat(it))) added++;
      toast(added ? `${added} ingrédient${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} aux courses` : "Tout était déjà dans la liste");
      inCourses = true;
    }
  }
  const recetteId = prev.recetteId && prev.plat === plat ? prev.recetteId : "";
  write(setDoc(ref("repas", date), { [slot]: { plat, ingr, inCourses: plat ? inCourses : false, recetteId, servings: recetteId ? prev.servings || 2 : 0 } }, { merge: true }));
  if (plat) write(setDoc(foyerDoc, { plats: { [plat.toLowerCase()]: { name: plat, ingr, n: increment(1) } } }, { merge: true }));
}
$("v-repas").addEventListener("click", e => {
  const w = e.target.closest("[data-week]");
  if (w) { const n = +w.dataset.week; weekStart = n === 0 ? mondayOf(today()) : addDays(weekStart, 7 * n); renderRepas(); return; }
  const s = e.target.closest("[data-slot]");
  if (s) { const [date, slot] = s.dataset.slot.split("|"); openMealSheet(date, slot); }
});
// Semaine / Recettes
let repasView = "semaine", recApi = null;
function showRepasView(v) {
  repasView = v;
  document.querySelectorAll("[data-rv]").forEach(b => b.setAttribute("aria-pressed", b.dataset.rv === v));
  $("weekView").hidden = v !== "semaine"; $("recView").hidden = v !== "recettes";
  if (v === "recettes" && recApi) recApi.render(); else renderRepas();
}
$("repasViews").onclick = e => { const b = e.target.closest("[data-rv]"); if (b) { showRepasView(b.dataset.rv); window.scrollTo(0, 0); } };
function setMeal(date, slot, data) {
  write(setDoc(ref("repas", date), { [slot]: { ...data, by: me } }, { merge: true }));
  if (data.plat) write(setDoc(foyerDoc, { plats: { [data.plat.toLowerCase()]: { name: data.plat, ingr: data.ingr || "", n: increment(1) } } }, { merge: true }));
}


// ================= ENVIES =================
// Achats qui ne pressent pas : meubles, déco, électroménager…
let wishes = [], wishCat = "Tout", showBought = false;
const WISH_CATS = ["Meubles", "Déco", "Électroménager", "Cuisine", "Tech", "Vêtements", "Loisirs", "Autre"];
const PRIOS = [["bientot", "Bientôt"], ["unjour", "Un jour"], ["onverra", "On verra"]];
const euro = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return "lien"; } };

let wishPerson = "tous"; try { wishPerson = localStorage.getItem("mimi-wish-who") || "tous"; } catch (e) {}
const forPerson = w => wishPerson === "tous" || w.who === wishPerson;

function renderWishPeople() {
  const openAll = wishes.filter(w => !w.bought);
  const opts = [["tous", "Tous"], ["deux", "Les deux"], ["thib", MEMBRES.thib.nom], ["eva", MEMBRES.eva.nom]];
  $("wishPeople").innerHTML = opts.map(([k, label]) => {
    const list = openAll.filter(w => k === "tous" || w.who === k);
    const sum = list.reduce((s, w) => s + (Number(w.price) || 0), 0);
    const sub = list.length ? (sum ? euro(sum) : list.length + " envie" + (list.length > 1 ? "s" : "")) : "—";
    return `<button type="button" data-wp="${k}" aria-pressed="${k === wishPerson}">${esc(label)}<small>${esc(sub)}</small></button>`;
  }).join("");
}
$("wishPeople").onclick = e => {
  const b = e.target.closest("[data-wp]"); if (!b) return;
  wishPerson = b.dataset.wp; try { localStorage.setItem("mimi-wish-who", wishPerson); } catch (e) {}
  renderWishes();
};

function renderWishFilter() {
  const cats = ["Tout", ...WISH_CATS.filter(c => wishes.some(w => !w.bought && forPerson(w) && w.cat === c))];
  if (!cats.includes(wishCat)) wishCat = "Tout";
  $("wishFilter").hidden = cats.length < 3;
  $("wishFilter").innerHTML = cats.map(c => `<button type="button" class="chip" aria-pressed="${c === wishCat}" data-wcat="${esc(c)}">${esc(c)}</button>`).join("");
}
$("wishFilter").onclick = e => { const b = e.target.closest("[data-wcat]"); if (b) { wishCat = b.dataset.wcat; renderWishes(); } };

function rowWish(w) {
  const url = safeUrl(w.url || "");
  const meta = [esc(w.cat), url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(host(url))}</a>` : ""].filter(Boolean).join(" · ");
  return `<li class="row${w.bought ? " done" : ""}">
    <button class="check" type="button" data-toggle-wish="${esc(w.id)}" aria-label="${w.bought ? "Remettre dans les envies" : "Marquer acheté"}">${CHECK}</button>
    <span class="txt" data-edit-wish="${esc(w.id)}">${esc(w.title)}<small>${meta}</small></span>
    ${w.price ? `<span class="ptag">${esc(euro(w.price))}</span>` : ""}<span class="who ${esc(w.who)}">${esc(whoName(w.who))}</span>
    <button class="del" type="button" data-del-wish="${esc(w.id)}" aria-label="Supprimer ${esc(w.title)}">×</button></li>`;
}
function renderWishes() {
  renderWishPeople();
  renderWishFilter();
  const open = wishes.filter(w => !w.bought && forPerson(w) && (wishCat === "Tout" || w.cat === wishCat));
  const bought = wishes.filter(w => w.bought && forPerson(w)).sort((a, b) => (b.boughtAt || 0) - (a.boughtAt || 0));
  const total = open.reduce((s, w) => s + (Number(w.price) || 0), 0);
  $("wishTotal").textContent = open.length
    ? `${open.length} envie${open.length > 1 ? "s" : ""}${total ? " · environ " + euro(total) + " au total" : ""}` : "";
  let h = "";
  if (!open.length) h += `<div class="empty">${wishes.length ? "Rien dans cette catégorie." : "Notez ici ce que vous voulez acheter un jour :<br>un meuble, une déco, un appareil…"}</div>`;
  for (const [k, label] of PRIOS) {
    const items = open.filter(w => (w.prio || "unjour") === k).sort((a, b) => (b.at || 0) - (a.at || 0));
    if (items.length) h += `<div class="group"><p class="eyebrow">${label} · ${items.length}</p><ul class="list">${items.map(rowWish).join("")}</ul></div>`;
  }
  if (bought.length) {
    h += `<button class="linkbtn" data-act="bought" type="button">${showBought ? "Masquer" : "Voir"} les achats faits (${bought.length})</button>`;
    if (showBought) h += `<ul class="list">${bought.map(rowWish).join("")}</ul>`;
  }
  $("wishList").innerHTML = h;
}
$("wishList").onclick = e => {
  const ed = e.target.closest("[data-edit-wish]");
  if (ed && !e.target.closest("a")) { const w = wishes.find(x => x.id === ed.dataset.editWish); if (w) ui.openEditor({ title: "Modifier l'envie", data: w,
    fields: [{ key: "title", label: "Envie", type: "text", required: true }, { key: "cat", label: "Catégorie", type: "select", options: WISH_CATS.map(c => [c, c]) },
      { key: "prio", label: "Quand", type: "select", options: PRIOS }, { key: "who", label: "Qui en a envie", type: "who" },
      { key: "price", label: "Prix indicatif (€)", type: "euros" }, { key: "url", label: "Lien", type: "url" }],
    onSave: v => { v.url = safeUrl(v.url || ""); write(updateDoc(ref("envies", w.id), v)); },
    extra: [{ label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(ref("envies", w.id), w, w.title) }] }); return; }
  const b = e.target.closest("[data-toggle-wish],[data-del-wish],[data-act]"); if (!b) return;
  if (b.dataset.act === "bought") { showBought = !showBought; renderWishes(); return; }
  if (b.dataset.delWish) { const w = wishes.find(x => x.id === b.dataset.delWish); if (w) ui.removeWithUndo(ref("envies", w.id), w, w.title); return; }
  const w = wishes.find(x => x.id === b.dataset.toggleWish);
  if (w) write(updateDoc(ref("envies", w.id), { bought: !w.bought, boughtAt: w.bought ? 0 : Date.now(), boughtBy: me }));
};
const WISH_FIELDS = [{ key: "title", label: "Envie", type: "text", required: true, placeholder: "Canapé d'angle, lampe de chevet…" },
  { key: "cat", label: "Catégorie", type: "select", options: WISH_CATS.map(c => [c, c]) }, { key: "prio", label: "Quand", type: "select", options: PRIOS },
  { key: "who", label: "Qui en a envie", type: "who" }, { key: "price", label: "Prix indicatif (€)", type: "euros" }, { key: "url", label: "Lien", type: "url" }];
$("addWishBtn").onclick = () => ui.openEditor({ title: "Nouvelle envie",
  data: { cat: "Meubles", prio: "unjour", who: wishPerson !== "tous" ? wishPerson : "deux" }, fields: WISH_FIELDS,
  onSave: v => { v.url = safeUrl(v.url || ""); write(addDoc(col("envies"), { ...v, bought: false, by: me, at: Date.now() })); toast(`${v.title} ajouté aux envies`); } });

// ================= AUJOURD'HUI =================
// Le résumé de la journée : agenda, repas, tâches, frigo, factures, courses.
function renderToday() {
  const el = $("v-aujourdhui"); if (!el || el.hidden) return;
  const t = today(), now = new Date(), hour = now.getHours();
  const evs = eventsOn(events, t), tomorrow = eventsOn(events, addDays(t, 1));
  const r = repas[t] || {};
  const dueTasks = tasks.filter(x => !x.done && x.due && x.due <= t).sort((a, b) => a.due.localeCompare(b.due));
  const todo = courses.filter(c => !c.done).length;
  const extra = plusApi ? plusApi.todayData() : { frigo: [], factures: [] };
  const nom = MEMBRES[me]?.nom || "";
  const plur = (n, w, ws) => `${n} ${n > 1 ? (ws || w + "s") : w}`;

  // Phrase d'accueil
  const parts = [evs.length ? plur(evs.length, "événement") : "", dueTasks.length ? plur(dueTasks.length, "tâche") : ""].filter(Boolean);
  const summary = parts.length ? `${parts.join(" et ")} aujourd'hui.` : "Rien d'urgent aujourd'hui, profitez-en.";
  let h = `<header class="day-hero">
      <p class="day-hero-date">${esc(cap(FMT_DAY.format(parse(t))))}</p>
      <h2 class="day-hero-hello">${hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour"}${nom ? " " + esc(nom) : ""}</h2>
      <p class="day-hero-sum">${esc(summary)}</p>
    </header>
    <button type="button" class="mot-cta" data-mot-doux>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M12 13.2s-3-1.8-3-3.6a1.5 1.5 0 0 1 3-.4 1.5 1.5 0 0 1 3 .4c0 1.8-3 3.6-3 3.6z" class="fab-heart"/></svg>
      <span>Envoyer un mot doux<small>Un petit mot pour ${esc(MEMBRES[me === "thib" ? "eva" : "thib"]?.nom || "l'autre")}</small></span><span class="chev" aria-hidden="true">›</span>
    </button>`;
  const cyLine = cycleApi ? cycleApi.todayLine() : "";
  if (cyLine) h += `<button type="button" class="cy-today" data-go="plus:cycle"><span class="cy-drop" aria-hidden="true"></span><span>${esc(cyLine)}</span><span class="chev" aria-hidden="true">›</span></button>`;

  // Raccourcis
  const shortcuts = [
    { go: "courses", n: todo, label: todo > 1 ? "courses" : "course", empty: "Liste vide" },
    { go: "taches", n: dueTasks.length, label: dueTasks.length > 1 ? "tâches" : "tâche", empty: "Rien à faire" },
    { go: "repas", n: 0, label: "", empty: "Repas de la semaine" }
  ].filter(Boolean);
  h += `<div class="shortcuts">${shortcuts.map(s => `<button type="button" class="shortcut${s.alert ? " alert" : ""}" data-go="${s.go}">
      ${s.n ? `<strong>${s.n}</strong><span>${esc(s.label)}</span>` : `<span>${esc(s.empty)}</span>`}</button>`).join("")}</div>`;

  // Frise de la journée : événements et repas dans l'ordre des heures
  const items = [];
  for (const o of evs) {
    const allDay = !o.e.time || o.dayIndex > 1;
    items.push({ key: allDay ? "00:00" : o.e.time, label: allDay ? "Journée" : o.e.time, html: `<ul class="list ev-list">${rowEvent(o)}</ul>` });
  }
  for (const [k, label, time] of [["midi", "Midi", "12:00"], ["soir", "Soir", "19:30"]]) {
    const m = r[k] || {};
    items.push({ key: time + "z", label, meal: true, html: `<button type="button" class="meal-chip${m.plat ? "" : " empty"}" data-today-slot="${k}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="12" r="6"/><circle cx="13" cy="12" r="3"/><path d="M4 4v6a1.5 1.5 0 0 0 1.5 1.5M7 4v6a1.5 1.5 0 0 1-1.5 1.5M5.5 11.5V20"/></svg>
      <span>${m.plat ? esc(m.plat) : `Choisir le repas du ${label.toLowerCase()}`}</span></button>` });
  }
  items.sort((a, b) => a.key.localeCompare(b.key));
  const nowKey = String(hour).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  h += `<section class="today-block"><div class="block-head"><h3>Votre journée</h3><button class="linkbtn" type="button" data-go="agenda">Agenda</button></div>
    <ol class="timeline">${items.map(it => `<li class="tl-item${it.meal ? " tl-meal" : ""}${it.key.slice(0, 5) < nowKey && it.key !== "00:00" ? " past" : ""}"><span class="tl-time">${esc(it.label)}</span><div class="tl-body">${it.html}</div></li>`).join("")}</ol>
    ${tomorrow.length ? `<p class="tomorrow">Demain : ${esc(tomorrow.map(o => (o.e.time && o.dayIndex === 1 ? o.e.time + " " : "") + o.e.title).join(", "))}</p>` : ""}
  </section>`;

  // Tâches du jour
  h += `<section class="today-block"><div class="block-head"><h3>À faire aujourd'hui</h3><button class="linkbtn" type="button" data-go="taches">Toutes les tâches</button></div>` +
    (dueTasks.length ? `<ul class="list">${dueTasks.map(rowTask).join("")}</ul>` : `<p class="calm">Aucune tâche pour aujourd'hui.</p>`) + `</section>`;

  // À surveiller : frigo et factures
  if (extra.frigo.length || extra.factures.length) {
    h += `<section class="today-block"><div class="block-head"><h3>À surveiller</h3></div><div class="watch">`;
    if (extra.frigo.length) h += `<button type="button" class="watch-row" data-go="plus:frigo"><span class="watch-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M5 9.5h14M8.5 5.5v1.8M8.5 12.5v3"/></svg></span>
      <span class="watch-txt"><strong>À manger vite</strong><span>${esc(extra.frigo.join(", "))}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    for (const f of extra.factures) h += `<button type="button" class="watch-row" data-go="plus:factures"><span class="watch-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M10 8h4M10 12h4"/></svg></span>
      <span class="watch-txt"><strong>${esc(f.name)} · ${esc(f.amount)}</strong><span${f.when === "En retard" ? ' class="late"' : ""}>${esc(f.when)}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    h += `</div></section>`;
  }
  el.innerHTML = h;
}
$("v-aujourdhui").addEventListener("click", e => {
  if (e.target.closest("[data-mot-doux]")) { if (plusApi) plusApi.openMotSheet(); return; }
  const g = e.target.closest("[data-go]");
  if (g) { const [tabName, sub] = g.dataset.go.split(":"); if (tabName === "plus" && plusApi) plusApi.openView(sub || null); showTab(tabName); return; }
  const sl = e.target.closest("[data-today-slot]");
  if (sl) { weekStart = mondayOf(today()); showTab("repas"); showRepasView("semaine"); openMealSheet(today(), sl.dataset.todaySlot); return; }
  if (e.target.closest("[data-edit-ev],[data-del-ev]")) { handleEventClick(e); return; }
  if (e.target.closest("[data-edit-task],[data-toggle-task],[data-del-task]")) handleTaskClick(e);
});

// ================= SAUVEGARDE =================
const BACKUP_COLS = ["courses", "events", "taches", "envies", "repas", "recettes", "depenses", "factures", "stock", "frigo", "films", "sorties", "souvenirs", "mots", "valise"];
$("backupBtn").onclick = async () => {
  const btn = $("backupBtn"); btn.disabled = true; btn.textContent = "Préparation…";
  try {
    const out = { app: "les-mimichats", version: 1, date: new Date().toISOString(), by: me, foyer: {}, prive: {} };
    const f = await getDoc(foyerDoc); out.foyerDoc = f.exists() ? f.data() : null;
    for (const c of BACKUP_COLS) { const snap = await getDocs(col(c)); out.foyer[c] = snap.docs.map(d => ({ id: d.id, ...d.data() })); }
    const pc = await getDocs(pcol("cadeaux")); out.prive.cadeaux = pc.docs.map(d => ({ id: d.id, ...d.data() }));
    const name = `mimichats-sauvegarde-${today()}.json`;
    const file = new File([JSON.stringify(out, null, 1)], name, { type: "application/json" });
    const n = Object.values(out.foyer).reduce((s, l) => s + l.length, 0);
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }).catch(() => {}); }
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    toast(`Sauvegarde prête : ${n} éléments`);
  } catch (err) { console.error(err); toast("La sauvegarde a échoué. Vérifie ta connexion et réessaie."); }
  finally { btn.disabled = false; btn.textContent = "Télécharger une sauvegarde"; }
};
let pendingRestore = null;
$("restoreFile").onchange = async e => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const box = $("restoreConfirm");
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== "les-mimichats" || !data.foyer) throw new Error("format");
    const n = Object.values(data.foyer).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
    pendingRestore = data;
    box.innerHTML = `<span>Remettre ${n} éléments du ${esc(new Date(data.date).toLocaleDateString("fr-FR"))} ? Rien n'est effacé, les éléments identiques sont remplacés.</span>
      <button class="linkbtn danger" type="button" id="restoreYes">Restaurer</button><button class="linkbtn" type="button" id="restoreNo">Annuler</button>`;
  } catch (err) { box.innerHTML = `<span class="error">Ce fichier n'est pas une sauvegarde des Mimichats.</span>`; pendingRestore = null; }
  box.hidden = false;
};
$("restoreConfirm").addEventListener("click", async e => {
  if (e.target.id === "restoreNo") { pendingRestore = null; $("restoreConfirm").hidden = true; return; }
  if (e.target.id !== "restoreYes" || !pendingRestore) return;
  const data = pendingRestore; pendingRestore = null; $("restoreConfirm").hidden = true;
  const ops = [];
  for (const [c, list] of Object.entries(data.foyer)) if (BACKUP_COLS.includes(c) && Array.isArray(list))
    for (const it of list) { const { id, ...rest } = it; if (id) ops.push([ref(c, id), rest]); }
  if (data.by === me && data.prive && Array.isArray(data.prive.cadeaux))
    for (const it of data.prive.cadeaux) { const { id, ...rest } = it; if (id) ops.push([pref("cadeaux", id), rest]); }
  try {
    for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(db); ops.slice(i, i + 400).forEach(([r, d]) => b.set(r, d)); await b.commit(); }
    if (data.foyerDoc) await setDoc(foyerDoc, data.foyerDoc, { merge: true });
    toast(`${ops.length} éléments restaurés`);
  } catch (err) { console.error(err); toast("La restauration a échoué. Réessaie avec une connexion stable."); }
});

// ================= PHOTOS =================
// Les photos sont réduites (1600 px max) avant l'envoi, pour aller vite et prendre peu de place.
let storage = null;
async function compressImage(file) {
  const img = await (window.createImageBitmap ? createImageBitmap(file) : new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(file); }));
  const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(b => ok(b || file), "image/jpeg", 0.82));
}
async function uploadPhoto(file, path) {
  if (!storage) storage = getStorage(fb);
  const blob = await compressImage(file);
  const r = storageRef(storage, path);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return { url: await getDownloadURL(r), path };
}

// ---------- Démarrage ----------
function fillWho() {
  const opts = WHO.map(w => `<option value="${w}">${esc(whoName(w))}</option>`).join("");
}
let unsub = [], plusApi = null, cycleApi = null;
function start(user) {
  me = user.__who || "deux";
  $("hello").textContent = ""; // l'accueil se fait sur l'écran Aujourd'hui
  $("whoami").textContent = "Connecté en tant que " + user.email;
  fillWho(); renderCats(); renderFilter(); renderCourses(); renderEvents(); renderTasks(); renderWishes(); renderRepas(); showTab(tab);

  const toList = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  const onErr = err => { console.error(err); setSync("off", "Accès refusé ou réseau coupé"); };
  unsub.push(onSnapshot(col("courses"), { includeMetadataChanges: true }, s => {
    setSync(s.metadata.fromCache ? "off" : "ok", s.metadata.fromCache ? "Hors ligne : les changements partiront au retour du réseau" : "Synchronisé");
    courses = toList(s); renderCourses(); recApi && recApi.refresh(); renderToday(); plusApi && plusApi.tick();
  }, onErr));
  unsub.push(onSnapshot(col("events"), s => { events = toList(s); renderEvents(); renderToday(); }, onErr));
  unsub.push(onSnapshot(col("taches"), s => { tasks = toList(s); renderTasks(); renderToday(); }, onErr));
  unsub.push(onSnapshot(ref("meta", "prefs"), s => { notifPrefs = s.exists() ? s.data() : {}; renderNotifPrefs(); }, onErr));
  renderNotifPrefs();
  unsub.push(onSnapshot(col("achats"), s => {
    achats = toList(s); renderCourses();
    // On ne garde que 4 mois d'historique.
    const old = addDays(today(), -120); achats.filter(a => a.day && a.day < old).slice(0, 50).forEach(a => write(deleteDoc(ref("achats", a.id))));
  }, onErr));
  unsub.push(onSnapshot(col("envies"), s => { wishes = toList(s); renderWishes(); plusApi && plusApi.tick(); }, onErr));
  unsub.push(onSnapshot(col("repas"), s => { repas = {}; s.docs.forEach(d => { repas[d.id] = d.data(); }); renderRepas(); renderToday(); }, onErr));
  unsub.push(onSnapshot(foyerDoc, s => {
    const d = s.exists() ? s.data() : {};
    habitues = d.habitues || {}; plats = d.plats || {};
    renderCourses(); renderRepas();
  }, onErr));

  cycleApi = initCycle({ $, esc, write, db, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, ui, MEMBRES, today, addDays, parse, cap,
    getMe: () => me, root: $("v-plus") });
  cycleApi.onChange(() => { renderEvents(); renderToday(); });
  unsub.push(cycleApi.stop);
  plusApi = initPlus({ $, esc, write, col, ref, pcol, pref, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, MEMBRES, whoName, cycle: cycleApi,
    today, addDays, addMonths, parse, cap, CHECK, addCourse, toast, safeUrl, host, ui, uploadPhoto,
    getMe: () => me, showTab, currentTab: () => tab, getCourses: () => courses,
    enviesSummary: () => { const o = wishes.filter(w => !w.bought); const sum = o.reduce((a, w) => a + (Number(w.price) || 0), 0);
      return o.length ? `${o.length} envie${o.length > 1 ? "s" : ""}${sum ? " · " + euro(sum) : ""}` : "Ce que vous voulez acheter un jour"; },
    onChange: k => { if ((k === "frigo" || k === "stock") && recApi) recApi.refresh(); renderToday(); } });
  unsub.push(plusApi.stop);
  recApi = initRecettes({ $, esc, write, col, ref, addDoc, updateDoc, deleteDoc, onSnapshot, today, addDays, parse, cap, toast, addCourse, ui,
    getMe: () => me, getCourses: () => courses, getHabitues: () => habitues, home: () => plusApi ? plusApi.home() : { frigo: [], stock: [] },
    setMeal, showWeek: date => { weekStart = mondayOf(date); showRepasView("semaine"); } });
  unsub.push(recApi.stop);
  initNotif({ $, fb, db, doc, setDoc, getMe: () => me, toast });
  initWidget({ $, db, doc, getDoc, setDoc, getMe: () => me, toast, MEMBRES });
  openFromHash();
}

// Lien depuis un widget : #courses, #taches, #agenda ou #mots ouvre directement la bonne page.
function openFromHash() {
  const h = location.hash.slice(1); if (!h) return;
  if (h === "mots" && plusApi) { plusApi.openView("mots"); showTab("plus"); }
  else if (TAB_ORDER.includes(h)) showTab(h);
  history.replaceState(null, "", location.pathname + location.search);
}
window.addEventListener("hashchange", () => { if (me) openFromHash(); });

// Qui est connecté : on compare l'empreinte de l'adresse avec celles de firebase-config.js.
async function emailHash(email) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(email || "").trim().toLowerCase()));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function whoOf(email) { const h = await emailHash(email); return Object.keys(MEMBRES).find(k => MEMBRES[k].hash === h) || null; }
onAuthStateChanged(auth, async user => {
  unsub.forEach(u => u()); unsub = []; plusApi = null;
  const verified = !!user && user.emailVerified;
  $("login").hidden = !!user; $("verify").hidden = !user || verified; $("app").hidden = !verified;
  if (user && !verified) { $("verifyText").textContent = `Un e-mail a été envoyé à ${user.email}. Touche le lien qu'il contient, puis reviens ici.`; return; }
  if (user) {
    user.__who = await whoOf(user.email);
    try { if (user.__who) localStorage.setItem("mimi-email-" + user.__who, user.email); } catch (e) {}
    start(user);
  }
});

// Création du compte (une seule fois par personne), puis vérification de l'adresse.
$("signupBtn").onclick = async () => {
  const email = $("loginEmail").value.trim(), pass = $("loginPass").value;
  $("loginErr").hidden = true; $("loginInfo").hidden = true;
  const err = t => { $("loginErr").textContent = t; $("loginErr").hidden = false; };
  if (!email || !pass) return err("Écris ton e-mail et choisis un mot de passe, puis touche « Créer mon compte ».");
  if (pass.length < 6) return err("Le mot de passe doit faire au moins 6 caractères.");
  if (!(await whoOf(email))) return err("Cette adresse n'est pas celle prévue pour l'appli. Vérifie l'orthographe.");
  try {
    auth.languageCode = "fr";
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await sendEmailVerification(cred.user);
  } catch (e) {
    err(e.code === "auth/email-already-in-use" ? "Ce compte existe déjà : touche « Se connecter »." : e.code === "auth/network-request-failed" ? "Pas de réseau. Réessaie quand tu es connecté." : "Impossible de créer le compte. Réessaie.");
  }
};
$("verifyDone").onclick = async () => {
  const u = auth.currentUser; if (!u) return;
  await u.reload();
  if (auth.currentUser.emailVerified) { await auth.currentUser.getIdToken(true); location.reload(); }
  else { $("verifyErr").textContent = "Pas encore vérifié : touche bien le lien dans l'e-mail, puis réessaie."; $("verifyErr").hidden = false; }
};
$("verifyResend").onclick = async () => {
  const u = auth.currentUser; if (!u) return;
  try { auth.languageCode = "fr"; await sendEmailVerification(u); $("verifyErr").textContent = "E-mail renvoyé."; }
  catch (e) { $("verifyErr").textContent = "Patiente une minute avant de redemander un e-mail."; }
  $("verifyErr").hidden = false;
};
$("verifyOut").onclick = () => signOut(auth);

// Choisir « Je suis Thib / Eva » remplit l'e-mail et passe au mot de passe.
document.querySelectorAll("[data-login]").forEach(b => b.addEventListener("click", () => {
  const m = MEMBRES[b.dataset.login]; if (!m) return;
  document.querySelectorAll("[data-login]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  $("login").dataset.who = b.dataset.login;
  let known = ""; try { known = localStorage.getItem("mimi-email-" + b.dataset.login) || ""; } catch (e) {}
  if (known) { $("loginEmail").value = known; $("loginPass").focus(); } else { $("loginEmail").value = ""; $("loginEmail").focus(); }
}));
// Premier mot de passe ou oubli : Firebase envoie un e-mail pour en choisir un.
$("forgotBtn").onclick = async () => {
  const email = $("loginEmail").value.trim();
  $("loginErr").hidden = true; $("loginInfo").hidden = true;
  if (!email) { $("loginErr").textContent = "Choisis « Je suis… » ou écris ton e-mail d'abord."; $("loginErr").hidden = false; return; }
  try {
    auth.languageCode = "fr";
    await sendPasswordResetEmail(auth, email);
    $("loginInfo").textContent = `E-mail envoyé à ${email}. Ouvre-le, choisis ton mot de passe, puis reviens ici. Pense à regarder dans les indésirables.`;
    $("loginInfo").hidden = false;
  } catch (err) {
    $("loginErr").textContent = err.code === "auth/network-request-failed" ? "Pas de réseau. Réessaie quand tu es connecté." : "Impossible d'envoyer l'e-mail. Vérifie l'adresse.";
    $("loginErr").hidden = false;
  }
};
$("loginForm").onsubmit = async e => {
  e.preventDefault();
  $("loginErr").hidden = true;
  try { await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPass").value); }
  catch (err) {
    $("loginErr").textContent = err.code === "auth/network-request-failed"
      ? "Pas de réseau. Réessaie quand tu es connecté."
      : "E-mail ou mot de passe incorrect.";
    $("loginErr").hidden = false;
  }
};

// Le jour change à minuit : on rafraîchit les libellés « Aujourd'hui », « En retard »…
setInterval(() => { renderEvents(); renderTasks(); renderRepas(); renderToday(); plusApi && plusApi.tick(); }, 60 * 1000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => {});
