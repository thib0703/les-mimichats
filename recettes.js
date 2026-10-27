// Les mimichats — recettes : idées intégrées + vos recettes, planification et liste de courses.
import { IDEES } from "./recettes-idees.js";

export function initRecettes(ctx) {
  const { $, esc, write, col, ref, addDoc, updateDoc, deleteDoc, onSnapshot, today, addDays, parse, cap, toast, addCourse } = ctx;
  const root = $("recView"), sheet = $("recSheet"), sheetBg = $("recSheetBg");
  const TAGS = ["Rapide", "Végé", "Léger", "Réconfortant", "Dimanche", "Pour les invités"];
  const FMT_DAY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  let mine = [];
  // Petits dessins pour les fiches (selon la première étiquette).
  const ICO = {
    Rapide: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    "Végé": '<path d="M5 19c0-8 6-14 15-15-1 9-7 15-15 15zM5 19l8-8"/>',
    "Léger": '<path d="M3 14c4 0 6-2 9-2s5 2 9 2M3 18c4 0 6-2 9-2s5 2 9 2M12 4v6"/>',
    "Réconfortant": '<path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM2 11h20M9 7c0-1.5 1-2 1-3.5M14 7c0-1.5 1-2 1-3.5"/>',
    Dimanche: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    "Pour les invités": '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v7M8 21h8"/>',
    _: '<path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM2 11h20M12 4v3"/>'
  };
  const TONE = { Rapide: "t-a", "Végé": "t-b", "Léger": "t-c", "Réconfortant": "t-d", Dimanche: "t-e", "Pour les invités": "t-f" };
  const icon = r => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[r.tags[0]] || ICO._}</svg>`;
  const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const UI = { mode: "list", id: null, q: "", tag: "Toutes", homeFirst: false, target: null, servings: null, confirmDel: false, draft: null };

  // ---------- Outils ----------
  const fmtQ = q => { const r = q >= 10 ? Math.round(q) : Math.round(q * 4) / 4;
    return ({ 0.25: "¼", 0.5: "½", 0.75: "¾" })[r] || String(r).replace(".", ","); };
  const qtyText = (i, f) => i.q ? (fmtQ(i.q * f) + (i.u ? " " + i.u : "")) : "";
  const ingText = (i, f) => { const q = qtyText(i, f); return q ? `${q} ${i.n}` : i.n; };
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(de|d|du|des|la|le|les|l|a|au|aux|en|frais|fraiche|fraiches|rape|rapee|boite|tranche|tranches|sachet|cube|pave|paves|filet|filets|gousse|gousses|feuille|feuilles)\b/g, " ")
    .split(/\s+/).filter(w => w.length > 1).map(w => w.replace(/(s|x)$/, "")).filter(Boolean);
  // Deux noms désignent le même produit si tous les mots du plus court sont dans l'autre.
  const same = (a, b) => { const A = norm(a), B = norm(b); if (!A.length || !B.length) return false;
    const [s, l] = A.length <= B.length ? [A, new Set(B)] : [B, new Set(A)]; return s.every(w => l.has(w)); };
  const BASICS = ["sel", "poivre", "eau"];

  // Où trouve-t-on cet ingrédient à la maison ?
  function homeStatus(name) {
    if (BASICS.some(b => same(b, name))) return { have: true, label: "basique" };
    const { frigo, stock } = ctx.home();
    const f = frigo.find(x => x.qty > 0 && same(x.name, name)); if (f) return { have: true, label: "dans le frigo" };
    const s = stock.find(x => x.level !== "vide" && same(x.name, name)); if (s) return { have: true, label: s.level === "bientot" ? "en stock (bientôt fini)" : "en stock" };
    const c = ctx.getCourses().find(x => !x.done && same(x.name, name)); if (c) return { have: true, label: "déjà dans la liste", inList: true };
    return { have: false, label: "" };
  }
  const homeCount = r => r.ingredients.filter(i => { const h = homeStatus(i.n); return h.have && !h.inList; }).length;

  const CAT_WORDS = [
    ["Fruits & légumes", "tomate oignon ail echalote carotte courgette aubergine poivron salade laitue romaine concombre citron pomme poire banane champignon poireau brocoli epinard haricot vert pomme de terre patate herbe persil basilic menthe ciboulette coriandre avocat chou radis navet fruit legume"],
    ["Frais", "poulet boeuf porc veau dinde jambon lardon saucisse viande hache steak saumon thon poisson crevette oeuf lait creme beurre fromage emmental parmesan mozzarella cheddar reblochon chevre feta yaourt pate brisee pate feuilletee pate a pizza gnocchi galette"],
    ["Surgelés", "surgele glace"],
    ["Boissons", "vin biere jus soda eau gazeuse"],
    ["Épicerie", "pate spaghetti tagliatelle penne nouille riz semoule quinoa lentille pois chiche farine sucre huile vinaigre sel poivre epice curry cumin paprika muscade bouillon sauce soja moutarde mayonnaise ketchup coulis conserve concasse lait de coco chocolat cafe the pain biscuit cereale miel confiture"]
  ];
  function guessCat(name) {
    const known = (ctx.getHabitues() || {})[String(name).toLowerCase()]; if (known?.cat) return known.cat;
    const words = norm(name);
    for (const [cat, list] of CAT_WORDS) { const L = new Set(list.split(" ").map(w => w.replace(/(s|x)$/, ""))); if (words.some(w => L.has(w))) return cat; }
    return "Autre";
  }

  // Lecture d'une ligne d'ingrédient tapée à la main : « 200 g de pâtes », « 2 gousses d'ail », « sel ».
  const UNITS = "kg|g|mg|cl|ml|dl|l|c\\. ?à ?s\\.?|c\\. ?à ?c\\.?|cs|cc|cuill[eè]res? à soupe|cuill[eè]res? à caf[ée]|pinc[ée]es?|gousses?|tranches?|bo[iî]tes?|sachets?|brins?|bouquets?|pots?|briques?|filets?|pav[ée]s?|poign[ée]es?|verres?|noix|bottes?";
  const LINE = new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?|½|¼|¾|\\d+\\/\\d+)?\\s*(?:(${UNITS})(?=\\s|$|\\.))?\\.?\\s*(?:de\\s+|d'|d’)?(.+?)\\s*$`, "i");
  function parseLine(line) {
    const m = line.match(LINE); if (!m) return { q: 0, u: "", n: line.trim() };
    let q = 0; const raw = m[1];
    if (raw) q = raw === "½" ? 0.5 : raw === "¼" ? 0.25 : raw === "¾" ? 0.75 : raw.includes("/") ? (+raw.split("/")[0] / +raw.split("/")[1]) : parseFloat(raw.replace(",", "."));
    const n = m[3].trim(); return { q: isFinite(q) ? q : 0, u: (m[2] || "").trim(), n, c: guessCat(n) };
  }

  const ideas = IDEES.map(r => ({ id: r.id, title: r.title, time: r.time, tags: r.tags, servings: 2, steps: r.steps, own: false,
    ingredients: r.ing.map(([q, u, n, c]) => ({ q, u, n, c })) }));
  const all = () => [...mine.map(r => ({ ...r, own: true, ingredients: r.ingredients || [], steps: r.steps || [], tags: r.tags || [] })), ...ideas];
  const find = id => all().find(r => r.id === id);

  // ---------- Affichage ----------
  function preserve(fn) {
    const vals = {}; root.querySelectorAll("input,textarea,select").forEach(el => { if (el.id) vals[el.id] = el.value; });
    const f = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
    const fid = f && f.id, sel = f && "selectionStart" in f ? [f.selectionStart, f.selectionEnd] : null;
    fn();
    for (const id in vals) { const el = document.getElementById(id); if (el && root.contains(el)) el.value = vals[id]; }
    if (fid && $(fid)) { const el = $(fid); el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
  }
  const slotName = t => `${cap(FMT_DAY.format(parse(t.date)))} ${t.slot === "midi" ? "midi" : "soir"}`;

  function renderList() {
    const q = norm(UI.q);
    let list = all().filter(r => {
      if (UI.tag === "Nos recettes" && !r.own) return false;
      if (UI.tag === "Idées" && r.own) return false;
      if (TAGS.includes(UI.tag) && !r.tags.includes(UI.tag)) return false;
      if (q.length) { const hay = new Set([...norm(r.title), ...r.ingredients.flatMap(i => norm(i.n))]); if (!q.every(w => [...hay].some(h => h.startsWith(w)))) return false; }
      return true;
    }).map(r => ({ r, h: homeCount(r) }));
    if (UI.homeFirst) list.sort((a, b) => (b.h / b.r.ingredients.length) - (a.h / a.r.ingredients.length) || b.h - a.h);
    else list.sort((a, b) => (b.r.own - a.r.own) || a.r.title.localeCompare(b.r.title));
    const chips = ["Toutes", "Nos recettes", "Idées", ...TAGS];
    const card = ({ r, h }) => { const n = r.ingredients.length, all = n && h === n;
      return `<li class="rec-card rec-row ${TONE[r.tags[0]] || "t-0"}" data-r="open" data-id="${esc(r.id)}" tabindex="0" role="button">
        <span class="rc-top"><span class="rc-ico">${icon(r)}</span>${r.own ? `<span class="rc-mine">À nous</span>` : ""}</span>
        <span class="rc-title">${esc(r.title)}</span>
        <span class="rc-meta">${r.time ? `${CLOCK}${esc(r.time)} min` : ""}${r.tags[0] ? `<span>${esc(r.tags[0])}</span>` : ""}</span>
        <span class="rc-pantry${all ? " full" : ""}" title="Ingrédients déjà à la maison"><span class="dots">${Array.from({ length: Math.min(n, 12) }, (_, i) => `<i${i < h ? ' class="on"' : ""}></i>`).join("")}</span>${all ? "Tout est là" : `${h}/${n} à la maison`}</span></li>`; };
    return `${UI.target ? `<div class="target-bar"><span>Choisis une recette pour <strong>${esc(slotName(UI.target))}</strong></span><button class="linkbtn" type="button" data-r="cancel-target">Annuler</button></div>` : ""}
      <div class="rec-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input type="search" id="recSearch" placeholder="Une recette, un ingrédient…" aria-label="Chercher" value="${esc(UI.q)}"><button class="btn" type="button" data-r="new">Créer</button></div>
      <div class="chips">${chips.map(c => `<button type="button" class="chip" aria-pressed="${c === UI.tag}" data-r="tag" data-v="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <div class="rec-tools"><button type="button" class="chip home-chip" aria-pressed="${UI.homeFirst}" data-r="home-first"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/></svg>Avec ce qu'on a</button>
        ${list.length > 1 ? `<button class="dice-btn" type="button" data-r="random"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/></svg>On mange quoi ?</button>` : ""}</div>
      ${list.length ? `<ul class="rec-grid">${list.map(card).join("")}</ul>`
        : `<div class="empty">Aucune recette ne correspond.<br>Créez la vôtre avec le bouton « Créer ».</div>`}
      <p class="hint">Les points : ingrédients déjà à la maison (frigo ou rangements).</p>`;
  }

  function renderDetail(r) {
    const serv = UI.servings || r.servings || 2, f = serv / (r.servings || 2);
    const h = homeCount(r), n = r.ingredients.length;
    const PERS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';
    return `<div class="sub-page-head"><button type="button" class="back-btn" data-r="back" aria-label="Retour aux recettes">‹</button><h2>Recettes</h2></div>
      <div class="rec-sheet ${TONE[r.tags[0]] || "t-0"}">
        <div class="rs-band"><span class="rc-ico big">${icon(r)}</span></div>
        <h2 class="rs-title">${esc(r.title)}</h2>
        <div class="rs-pills">${r.time ? `<span class="pill">${CLOCK}${esc(r.time)} min</span>` : ""}${r.tags.map(t => `<span class="pill">${esc(t)}</span>`).join("")}<span class="pill soft">${r.own ? "Recette à nous" : "Idée de l'appli"}</span></div>
        <div class="rs-serv"><span class="people" aria-hidden="true">${PERS.repeat(Math.min(serv, 6))}${serv > 6 ? `<b>+${serv - 6}</b>` : ""}</span>
          <span class="stepper"><button type="button" data-r="serv" data-d="-1" aria-label="Une personne de moins">−</button><span class="qty">${serv}</span><button type="button" data-r="serv" data-d="1" aria-label="Une personne de plus">+</button></span>
          <span class="small">personne${serv > 1 ? "s" : ""}</span></div>
        <button class="btn rs-plan" type="button" data-r="plan">${UI.target ? "Mettre " + esc(slotName(UI.target).toLowerCase()) : "Planifier un jour"}</button>
      </div>
      <section class="aisle"><h3 class="aisle-title">Ingrédients<span>${h}/${n} à la maison</span></h3><ul class="ing-list">${r.ingredients.map(i => { const st = homeStatus(i.n);
        return `<li class="${st.have && !st.inList ? "at-home" : st.inList ? "in-list" : ""}"><span class="ing-dot" aria-hidden="true"></span><span class="ing-name">${esc(cap(i.n))}${st.have ? `<small>${esc(st.label)}</small>` : ""}</span><span class="ing-q">${i.q ? esc(qtyText(i, f)) : "au goût"}</span></li>`; }).join("")}</ul></section>
      ${r.steps.length ? `<section class="aisle"><h3 class="aisle-title">Préparation<span>${r.steps.length} étape${r.steps.length > 1 ? "s" : ""}</span></h3><ol class="step-list">${r.steps.map((s, i) => `<li><span class="step-n">${i + 1}</span><span>${esc(s)}</span></li>`).join("")}</ol></section>` : ""}
      <div class="add-row wrap-row">
        ${r.own ? `<button class="btn ghost" type="button" data-r="edit">Modifier</button>` : `<button class="btn ghost" type="button" data-r="copy">Faire notre version</button>`}
        ${r.own ? (UI.confirmDel ? `<span class="confirm">Supprimer cette recette ?<button class="linkbtn danger" type="button" data-r="del-yes">Oui</button><button class="linkbtn" type="button" data-r="del-no">Non</button></span>`
          : `<button class="linkbtn danger" type="button" data-r="del">Supprimer</button>`) : ""}
      </div>`;
  }

  function renderEdit() {
    const d = UI.draft;
    return `<div class="sub-page-head"><button type="button" class="back-btn" data-r="back" aria-label="Annuler">‹</button><h2>${d.id ? "Modifier la recette" : "Nouvelle recette"}</h2></div>
      <form class="add card rec-form" id="recForm" autocomplete="off">
        <label class="field" for="rTitle">Nom<input type="text" id="rTitle" value="${esc(d.title || "")}" placeholder="Gratin de courgettes de Mamie" required></label>
        <div class="add-row wrap-row">
          <label class="field" for="rServ">Pour combien<input type="number" id="rServ" min="1" max="20" value="${d.servings || 2}" inputmode="numeric"></label>
          <label class="field" for="rTime">Temps (min)<input type="number" id="rTime" min="0" step="5" value="${d.time || ""}" inputmode="numeric" placeholder="30"></label>
        </div>
        <div class="chips" id="rTags">${TAGS.map(t => `<button type="button" class="chip" aria-pressed="${(d.tags || []).includes(t)}" data-r="draft-tag" data-v="${esc(t)}">${esc(t)}</button>`).join("")}</div>
        <label class="field" for="rIng">Ingrédients, un par ligne<textarea id="rIng" rows="7" placeholder="400 g de pâtes&#10;2 gousses d'ail&#10;20 cl de crème&#10;sel, poivre">${esc((d.ingredients || []).map(i => ingText(i, 1)).join("\n"))}</textarea></label>
        <label class="field" for="rSteps">Étapes, une par ligne<textarea id="rSteps" rows="6" placeholder="Faire cuire les pâtes.&#10;Faire revenir l'ail…">${esc((d.steps || []).join("\n"))}</textarea></label>
        <div class="add-row"><button class="btn" type="submit">Enregistrer la recette</button></div>
      </form>`;
  }

  function render() {
    if (root.hidden) return;
    preserve(() => {
      if (UI.mode === "edit" && UI.draft) root.innerHTML = renderEdit();
      else if (UI.mode === "detail" && find(UI.id)) root.innerHTML = renderDetail(find(UI.id));
      else { UI.mode = "list"; root.innerHTML = renderList(); }
    });
  }
  function go(mode, id) { UI.mode = mode; UI.id = id || null; UI.confirmDel = false; if (mode === "detail") UI.servings = null; render(); window.scrollTo(0, 0); }

  // ---------- Feuille « Planifier » avec vérification des ingrédients ----------
  let SH = null; // { r, date, slot, servings, have: {index: bool} }
  function openSheet(r, date, slot, servings) {
    const t = UI.target;
    SH = { r, date: date || t?.date || today(), slot: slot || t?.slot || "soir", servings: servings || UI.servings || r.servings || 2, have: {} };
    r.ingredients.forEach((i, k) => { SH.have[k] = homeStatus(i.n).have; });
    renderSheet(); sheet.hidden = false; sheetBg.hidden = false;
  }
  function closeSheet() { sheet.hidden = true; sheetBg.hidden = true; SH = null; }
  function renderSheet() {
    if (!SH) return;
    const { r } = SH, f = SH.servings / (r.servings || 2);
    const days = []; for (let i = -1; i < 21; i++) days.push(addDays(today(), i));
    if (!days.includes(SH.date)) days.push(SH.date);
    const toBuy = r.ingredients.filter((_, k) => !SH.have[k]).length;
    sheet.innerHTML = `<h2>${esc(r.title)}</h2>
      <div class="add-row wrap-row">
        <select id="shDay" aria-label="Jour">${days.map(d => `<option value="${d}"${d === SH.date ? " selected" : ""}>${esc(d === today() ? "Aujourd'hui" : d === addDays(today(), 1) ? "Demain" : cap(FMT_DAY.format(parse(d))))}</option>`).join("")}</select>
        <select id="shSlot" aria-label="Repas"><option value="midi"${SH.slot === "midi" ? " selected" : ""}>Midi</option><option value="soir"${SH.slot === "soir" ? " selected" : ""}>Soir</option></select>
        <span class="stepper"><button type="button" data-sh="serv" data-d="-1" aria-label="Une personne de moins">−</button><span class="qty">${SH.servings}</span><button type="button" data-sh="serv" data-d="1" aria-label="Une personne de plus">+</button></span>
      </div>
      <p class="sheet-sub"><strong>À acheter</strong></p>
      <p class="hint">Décochez ce que vous avez déjà. Ce qui reste coché part dans la liste de courses.</p>
      <ul class="list sheet-list">${r.ingredients.map((i, k) => { const h = homeStatus(i.n);
        return `<li class="row${SH.have[k] ? " at-home" : ""}"><button class="check" type="button" data-sh="have" data-k="${k}" aria-label="${SH.have[k] ? "À acheter" : "On l'a déjà"}" aria-pressed="${!SH.have[k]}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>
          <span class="txt">${esc(cap(i.n))}<small>${esc([qtyText(i, f), h.label].filter(Boolean).join(" · "))}</small></span></li>`; }).join("")}</ul>
      <div class="stack-s">
        <button class="btn" type="button" data-sh="go">${toBuy ? `Planifier et ajouter ${toBuy} article${toBuy > 1 ? "s" : ""} aux courses` : "Planifier (tout est à la maison)"}</button>
        <div class="add-row"><button class="linkbtn" type="button" data-sh="go-nocourses">Planifier sans toucher aux courses</button><button class="linkbtn" type="button" data-sh="close">Annuler</button></div>
      </div>`;
  }
  function confirmSheet(withCourses) {
    const { r, date, slot, servings } = SH, f = servings / (r.servings || 2);
    let added = 0;
    if (withCourses) r.ingredients.forEach((i, k) => { if (!SH.have[k] && addCourse(cap(i.n), i.c || guessCat(i.n), qtyText(i, f))) added++; });
    ctx.setMeal(date, slot, { plat: r.title, recetteId: r.id, servings, ingr: r.ingredients.map(i => i.n).join(", "), inCourses: withCourses });
    toast(`${r.title} : ${slotName({ date, slot }).toLowerCase()}${added ? ` · ${added} article${added > 1 ? "s" : ""} aux courses` : ""}`);
    closeSheet(); UI.target = null; go("list"); ctx.showWeek(date);
  }
  sheetBg.addEventListener("click", closeSheet);
  sheet.addEventListener("change", e => { if (!SH) return; if (e.target.id === "shDay") SH.date = e.target.value; if (e.target.id === "shSlot") SH.slot = e.target.value; });
  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-sh]"); if (!b || !SH) return;
    const a = b.dataset.sh;
    if (a === "have") { const k = +b.dataset.k; SH.have[k] = !SH.have[k]; renderSheet(); }
    else if (a === "serv") { SH.servings = Math.max(1, Math.min(20, SH.servings + +b.dataset.d)); renderSheet(); }
    else if (a === "go") confirmSheet(true);
    else if (a === "go-nocourses") confirmSheet(false);
    else if (a === "close") closeSheet();
  });

  // ---------- Actions ----------
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-r]"); if (!b) return;
    const a = b.dataset.r, r = UI.id ? find(UI.id) : null;
    switch (a) {
      case "open": go("detail", b.dataset.id); break;
      case "back": go(UI.mode === "edit" && UI.draft?.id ? "detail" : "list", UI.mode === "edit" ? UI.draft?.id : null); break;
      case "tag": UI.tag = b.dataset.v; render(); break;
      case "home-first": UI.homeFirst = !UI.homeFirst; render(); break;
      case "random": { const rows = [...root.querySelectorAll(".rec-row")]; if (!rows.length) break;
        const pool = UI.homeFirst ? rows.slice(0, Math.max(3, Math.ceil(rows.length / 3))) : rows;
        go("detail", pool[Math.floor(Math.random() * pool.length)].dataset.id); break; }
      case "cancel-target": UI.target = null; render(); break;
      case "serv": if (r) { UI.servings = Math.max(1, Math.min(20, (UI.servings || r.servings || 2) + +b.dataset.d)); render(); } break;
      case "plan": if (r) openSheet(r); break;
      case "new": UI.draft = { servings: 2, tags: [], ingredients: [], steps: [] }; go("edit"); break;
      case "edit": if (r) { UI.draft = JSON.parse(JSON.stringify(r)); go("edit"); } break;
      case "copy": if (r) { UI.draft = { ...JSON.parse(JSON.stringify(r)), id: null, title: r.title }; go("edit"); } break;
      case "draft-tag": { const t = b.dataset.v, tags = UI.draft.tags || (UI.draft.tags = []);
        const i = tags.indexOf(t); if (i >= 0) tags.splice(i, 1); else tags.push(t); b.setAttribute("aria-pressed", i < 0); break; }
      case "del": UI.confirmDel = true; render(); break;
      case "del-no": UI.confirmDel = false; render(); break;
      case "del-yes": if (r && r.own) { const { own, ...data } = r; ctx.ui.removeWithUndo(ref("recettes", r.id), data, r.title); go("list"); } break;
    }
  });
  root.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".rec-row")) { e.preventDefault(); go("detail", e.target.dataset.id); } });
  root.addEventListener("input", e => { if (e.target.id === "recSearch") { UI.q = e.target.value; render(); } });
  root.addEventListener("submit", e => {
    if (e.target.id !== "recForm") return; e.preventDefault();
    const title = $("rTitle").value.trim(); if (!title) return;
    const ingredients = $("rIng").value.split("\n").map(s => s.trim()).filter(Boolean).map(parseLine);
    const steps = $("rSteps").value.split("\n").map(s => s.trim()).filter(Boolean);
    const data = { title, servings: Math.max(1, parseInt($("rServ").value, 10) || 2), time: Math.max(0, parseInt($("rTime").value, 10) || 0),
      tags: UI.draft.tags || [], ingredients, steps, by: ctx.getMe(), at: Date.now() };
    if (UI.draft.id && UI.draft.own) { write(updateDoc(ref("recettes", UI.draft.id), data)); UI.draft = null; toast("Recette enregistrée"); go("detail", UI.id); }
    else {
      const p = addDoc(col("recettes"), data); write(p);
      UI.draft = null; toast("Recette ajoutée à vos recettes");
      p.then(d => { if (d && d.id) go("detail", d.id); }).catch(() => {}); go("list");
    }
  });

  const stopSnap = onSnapshot(col("recettes"), s => { mine = s.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, err => console.error("recettes", err));

  return {
    stop: () => stopSnap(),
    guessCat,
    render,
    refresh: () => { render(); if (SH) renderSheet(); },
    // Depuis une case de la semaine : choisir une recette pour ce jour-là.
    openForSlot(date, slot) { UI.target = { date, slot }; go("list"); },
    openRecipe(id, date, slot) { if (date) UI.target = { date, slot }; go("detail", id); },
    planFromSlot(id, date, slot, servings) { const r = find(id); if (r) openSheet(r, date, slot, servings); return !!r; }
  };
}
