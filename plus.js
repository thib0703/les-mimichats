// Les mimichats — onglet « Plus » : dépenses, factures, stock, films, sorties, cadeaux, souvenirs, mots doux.
// Reçoit les outils de l'appli principale dans `ctx`.

export function initPlus(ctx) {
  const { $, esc, write, col, ref, pcol, pref, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, ui, MEMBRES, whoName,
    today, addDays, addMonths, parse, cap, CHECK, addCourse, toast, safeUrl, host } = ctx;
  const me = () => ctx.getMe();
  const other = () => me() === "thib" ? "eva" : "thib";
  const root = $("v-plus");

  // ---------- Petits outils ----------
  const euro0 = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const euro2 = c => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(c / 100);
  const cents = v => { const n = parseFloat(String(v || "").replace(",", ".").replace(/\s/g, "")); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const FMT_DM = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const FMT_DMY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const daysUntil = s => Math.round((parse(s) - parse(today())) / 864e5);
  const rel = n => n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n === -1 ? "hier" : n < 0 ? `il y a ${-n} jours` : `dans ${n} jours`;
  const plural = (n, w) => `${n} ${w}${n > 1 ? "s" : ""}`;
  const whoOpts = (sel, withDeux = true) => (withDeux ? ["deux", "thib", "eva"] : ["thib", "eva"])
    .map(w => `<option value="${w}"${w === sel ? " selected" : ""}>${esc(whoName(w))}</option>`).join("");
  const opts = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`).join("");
  const del = (k, id, label) => `<button class="del" type="button" data-act="del" data-k="${k}" data-id="${esc(id)}" aria-label="Supprimer ${esc(label)}">×</button>`;
  const check = (k, id, on, labelOn, labelOff) => `<button class="check" type="button" data-act="toggle" data-k="${k}" data-id="${esc(id)}" aria-label="${on ? labelOn : labelOff}">${CHECK}</button>`;
  const linkHtml = u => { const x = safeUrl(u || ""); return x ? `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(host(x))}</a>` : ""; };
  const meta = parts => parts.filter(Boolean).join(" · ");
  const empty = txt => `<div class="empty">${txt}</div>`;
  const group = (title, rows) => { const m = title.match(/^(.*) · ([^·]+)$/);
    return `<section class="aisle"><h3 class="aisle-title">${m ? m[1] : title}${m ? `<span>${m[2]}</span>` : ""}</h3><ul class="list">${rows}</ul></section>`; };

  // ---------- Données ----------
  const S = { meubles: [], valise: [], depenses: [], factures: [], stock: [], frigo: [], films: [], sorties: [], cadeaux: [], souvenirs: [], mots: [] };
  const UI = { view: null, histDep: false, films: "avoir", filmType: "Tout", pick: null, sortKind: "Tout", showDoneSort: false, showGiven: false, confirmSettle: false };
  try { UI.view = sessionStorage.getItem("mimi-plus") || null; } catch (e) {}
  const pathOf = k => k === "cadeaux" ? pcol("cadeaux") : col(k);
  const refOf = (k, id) => k === "cadeaux" ? pref("cadeaux", id) : ref(k, id);

  // ================= Rubriques =================
  const R = {};

  // ----- Dépenses partagées -----
  function balance() {
    // Positif : Eva doit à Thib. Négatif : Thib doit à Eva. En centimes.
    let b = 0;
    for (const d of S.depenses) {
      if (d.settled) continue;
      const share = d.split === "autre" ? d.amount : Math.round(d.amount / 2);
      b += d.paidBy === "thib" ? share : -share;
    }
    return b;
  }
  function balanceText(b = balance()) {
    if (Math.abs(b) < 1) return "Vous êtes à égalité";
    return b > 0 ? `${MEMBRES.eva.nom} doit ${euro2(b)} à ${MEMBRES.thib.nom}` : `${MEMBRES.thib.nom} doit ${euro2(-b)} à ${MEMBRES.eva.nom}`;
  }
  R.depenses = {
    label: "Dépenses", icon: '<path d="M4 7h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 7l2-3h12l2 3M15 13h2"/>',
    summary: () => S.depenses.some(d => !d.settled) ? balanceText() : "Qui a payé quoi",
    render() {
      const open = S.depenses.filter(d => !d.settled).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.at - a.at);
      const done = S.depenses.filter(d => d.settled).sort((a, b) => (b.settledAt || 0) - (a.settledAt || 0)).slice(0, 40);
      const b = balance();
      const row = d => `<li class="row"><span class="txt">${esc(d.title)}<small>${esc(meta([d.date && FMT_DM.format(parse(d.date)),
        d.split === "autre" ? "pour " + whoName(d.paidBy === "thib" ? "eva" : "thib") : "moitié-moitié"]))}</small></span>
        <span class="amount">${esc(euro2(d.amount))}</span><span class="who ${esc(d.paidBy)}">${esc(whoName(d.paidBy))}</span>${d.settled ? "" : del("depenses", d.id, d.title)}</li>`;
      // La balance penche du côté de celui à qui on doit de l'argent.
      const ang = Math.max(-14, Math.min(14, b / 800)) * Math.PI / 180, dy = 80 * Math.sin(ang);
      const yl = 34 + dy, yr = 34 - dy;
      const pan = (x, y, who) => `<path class="chain" d="M${x} ${y}L${x - 26} ${y + 34}M${x} ${y}L${x + 26} ${y + 34}"/><path class="pan pan-${who}" d="M${x - 32} ${y + 34}h64a32 14 0 0 1-64 0z"/>
        <text class="pan-name" x="${x}" y="${y + 66}" text-anchor="middle">${esc(MEMBRES[who].nom)}</text>`;
      const scale = `<svg class="scale" viewBox="0 0 280 150" role="img" aria-label="${esc(balanceText(b))}">
        <path class="post" d="M140 30V128M108 132h64"/><circle class="pivot" cx="140" cy="30" r="6"/>
        <path class="beam" d="M60 ${yl.toFixed(1)}L220 ${yr.toFixed(1)}"/>${pan(60, yl, "thib")}${pan(220, yr, "eva")}</svg>`;
      return `<div class="balance-card">${scale}<p class="big">${esc(balanceText(b))}</p>
          ${open.length ? (UI.confirmSettle
            ? `<div class="confirm">Remettre les compteurs à zéro ?<button class="linkbtn danger" type="button" data-act="settle-yes">Oui, c'est réglé</button><button class="linkbtn" type="button" data-act="settle-no">Annuler</button></div>`
            : `<button class="btn ghost" type="button" data-act="settle">Faire les comptes</button>`) : ""}</div>
        ${open.length ? group("À régler · " + open.length, open.map(row).join("")) : empty("Aucune dépense en attente.<br>Touchez + pour noter ce que l'un paie pour les deux.")}
        ${done.length ? `<button class="linkbtn" type="button" data-act="hist-dep">${UI.histDep ? "Masquer" : "Voir"} l'historique</button>` +
          (UI.histDep ? group("Déjà réglé", done.map(row).join("")) : "") : ""}`;
    },
    submit() {
      const title = $("depTitle").value.trim(), amount = cents($("depAmount").value);
      if (!title || !amount) { toast("Indique un nom et un montant."); return; }
      write(addDoc(pathOf("depenses"), { title, amount, paidBy: $("depPaid").value, split: $("depSplit").value,
        date: $("depDate").value || today(), settled: false, by: me(), at: Date.now() }));
      $("depTitle").value = ""; $("depAmount").value = "";
    }
  };

  // ----- Abonnements & factures -----
  const FREQ = [["mensuel", "Tous les mois"], ["trimestriel", "Tous les 3 mois"], ["annuel", "Tous les ans"]];
  const perMonth = f => f.freq === "annuel" ? f.amount / 12 : f.freq === "trimestriel" ? f.amount / 3 : f.amount;
  const nextOf = (s, freq) => { const t = today(); let d = s || t; do { d = addMonths(d, freq === "annuel" ? 12 : freq === "trimestriel" ? 3 : 1); } while (d < t); return d; };
  const facturesDue = () => S.factures.filter(f => f.next && daysUntil(f.next) <= 3).length;
  R.factures = {
    label: "Factures", icon: '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M10 8h4M10 12h4"/>',
    summary: () => {
      const n = S.factures.slice().filter(f => f.next).sort((a, b) => a.next.localeCompare(b.next))[0];
      return n ? `${n.name} ${rel(daysUntil(n.next))}` : "Abonnements et échéances";
    },
    render() {
      const list = S.factures.slice().sort((a, b) => (a.next || "9").localeCompare(b.next || "9"));
      const month = list.reduce((s, f) => s + perMonth(f), 0);
      const row = f => { const n = f.next ? daysUntil(f.next) : null;
        const when = n === null ? "" : n < 0 ? `<span class="late">En retard · ${esc(FMT_DM.format(parse(f.next)))}</span>` : esc((n <= 7 ? cap(rel(n)) : FMT_DM.format(parse(f.next))));
        const d = f.next ? parse(f.next) : null;
        return `<li class="row bill"><span class="calpage${n !== null && n < 0 ? " overdue" : n !== null && n <= 3 ? " soon" : ""}"><small>${d ? esc(new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d)) : "—"}</small><b>${d ? d.getDate() : "?"}</b></span>
          <span class="txt">${esc(f.name)}<small>${meta([when, esc(FREQ.find(x => x[0] === f.freq)?.[1] || "")])}</small></span>
          <span class="amount">${esc(euro2(f.amount))}</span><button class="mini paid-btn" type="button" data-act="toggle" data-k="factures" data-id="${esc(f.id)}">Payée</button>
          <span class="who who-hidden ${esc(f.who)}">${esc(whoName(f.who))}</span>${del("factures", f.id, f.name)}</li>`; };
      return `${list.length ? `<div class="envelope"><span class="env-flap"></span><span class="env-stamp">€</span>
          <p class="env-label">Budget fixe</p><p class="big">Environ ${esc(euro0(month / 100))} par mois</p>
          <p class="muted small">Touchez « Payée » : la facture passe à sa prochaine échéance.</p></div>` : ""}
        ${list.length ? `<ul class="list">${list.map(row).join("")}</ul>` : empty("Ajoutez vos abonnements et factures<br>pour ne plus rater une échéance.")}`;
    },
    submit() {
      const name = $("facName").value.trim(), amount = cents($("facAmount").value);
      if (!name || !amount) { toast("Indique un nom et un montant."); return; }
      write(addDoc(pathOf("factures"), { name, amount, freq: $("facFreq").value, who: $("facWho").value, next: $("facNext").value || today(), by: me(), at: Date.now() }));
      $("facName").value = ""; $("facAmount").value = ""; $("facNext").value = "";
    },
    toggle(f) { write(updateDoc(refOf("factures", f.id), { next: nextOf(f.next, f.freq), paidAt: Date.now(), paidBy: me() })); toast(`${f.name} : prochaine échéance le ${FMT_DM.format(parse(nextOf(f.next, f.freq)))}`); }
  };

  // ----- Rangements : les réserves de la maison, pièce par pièce et meuble par meuble -----
  const LEVELS = [["plein", "Plein"], ["moitie", "À moitié"], ["bientot", "Bientôt fini"], ["vide", "Vide"]];
  const PLACES = ["Frigo", "Placard", "Congélateur", "Salle de bain", "Entretien", "Animaux"]; // anciennes données
  const MEUBLE_TYPES = [["placard", "Placard à étagères"], ["tiroirs", "Congélateur à tiroirs"], ["evier", "Sous l'évier"], ["wc", "Petit placard"], ["sdb", "Meuble de salle de bain"], ["douche", "Douche"]];
  const DEFAULT_MEUBLES = [
    { id: "m-congel", name: "Congélateur", room: "Cuisine", type: "tiroirs", cat: "Surgelés", order: 1, suggest: ["Légumes surgelés", "Frites", "Pizza", "Glace", "Steaks hachés"] },
    { id: "m-cuisine", name: "Meuble de la cuisine", room: "Cuisine", type: "placard", cat: "Épicerie", order: 2, suggest: ["Gâteaux", "Pâtes", "Riz", "Farine", "Sucre", "Épices", "Café", "Huile d'olive"] },
    { id: "m-evier", name: "Sous l'évier", room: "Cuisine", type: "evier", cat: "Maison & hygiène", order: 3, suggest: ["Liquide vaisselle", "Lessive", "Pastilles lave-vaisselle", "Éponges", "Nettoyant multi-surfaces", "Sacs poubelle"] },
    { id: "m-wc", name: "Placard des toilettes", room: "Toilettes", type: "wc", cat: "Maison & hygiène", order: 4, suggest: ["Papier toilette", "Nettoyant WC", "Désodorisant"] },
    { id: "m-sdb", name: "Meuble de la salle de bain", room: "Salle de bain", type: "sdb", cat: "Maison & hygiène", order: 5, suggest: ["Cotons-tiges", "Cotons", "Produits visage", "Dentifrice", "Brosses à dents"] },
    { id: "m-douche", name: "Douche", room: "Salle de bain", type: "douche", cat: "Maison & hygiène", order: 6,
      suggest: ["Gel douche", "Shampoing", ["Après-shampoing", "eva"], ["Masque cheveux", "eva"], ["Produit coiffant", "eva"]] }
  ];
  const ROOM_ORDER = ["Cuisine", "Salon", "Salle de bain", "Toilettes", "Chambre", "Cellier", "Entrée"];
  const OLD_PLACE = { Placard: "m-cuisine", Frigo: "m-cuisine", Animaux: "m-cuisine", Congélateur: "m-congel", "Salle de bain": "m-sdb", Entretien: "m-evier" };
  let meublesSeeded = false;
  const meubles = () => S.meubles.slice().sort((a, b) => (a.order || 99) - (b.order || 99) || a.name.localeCompare(b.name));
  const meubleOf = it => S.meubles.find(m => m.id === it.meuble) || S.meubles.find(m => m.id === OLD_PLACE[it.place]) || meubles()[0];
  const catOf = it => (meubleOf(it) || {}).cat || "Autre";
  const lvlIndex = it => Math.max(0, LEVELS.findIndex(l => l[0] === it.level));
  const lowCount = () => S.stock.filter(s => s.level === "bientot" || s.level === "vide").length;
  const jar = (i, bottle) => { const p = [1, .55, .22, 0][i];
    if (bottle) { const h = 11 * p;
      return `<svg class="jar" viewBox="0 0 16 20" aria-hidden="true"><rect class="jar-lid" x="5.5" y="0.5" width="5" height="4" rx="1"/><rect class="jar-fill" x="4" y="${(7.5 + 11 - h).toFixed(1)}" width="8" height="${h.toFixed(1)}" rx="1.2"/><path class="jar-glass" d="M6 4.5h4l2.5 3V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V7.5z"/></svg>`; }
    const h = 13 * p;
    return `<svg class="jar" viewBox="0 0 16 20" aria-hidden="true"><rect class="jar-lid" x="3.5" y="1" width="9" height="3" rx="1"/><rect class="jar-fill" x="4" y="${(6 + 13 - h).toFixed(1)}" width="8" height="${h.toFixed(1)}" rx="1.2"/><path class="jar-glass" d="M3 5h10v12.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 17.5z"/></svg>`; };
  R.stock = {
    label: "Rangements", icon: '<path d="M4 4h16v16H4z"/><path d="M4 10h16M4 15h16M12 4v6"/>',
    summary: () => lowCount() ? plural(lowCount(), "produit") + " à racheter" : S.stock.length ? "Tout est en réserve" : "Placards, congélateur, salle de bain",
    render() {
      const item = it => { const i = lvlIndex(it), t = (meubleOf(it) || {}).type;
        return `<button type="button" class="sitem lvl-${i} who-${esc(it.who || "deux")}" data-act="sitem" data-id="${esc(it.id)}">${jar(i, t === "douche" || t === "sdb")}<span class="sitem-name">${esc(it.name)}</span>${i >= 2 ? `<span class="sitem-lvl">${i === 3 ? "vide" : "bientôt fini"}</span>` : ""}</button>`; };
      const itemsIn = m => S.stock.filter(it => (meubleOf(it) || {}).id === m.id).sort((a, b) => lvlIndex(b) - lvlIndex(a) || a.name.localeCompare(b.name));
      const body = (m, items) => items.length ? `<div class="shelves">${items.map(item).join("")}</div>`
        : `<div class="meuble-empty"><span>Rien pour l'instant.</span>${(m.suggest || []).length ? `<button class="mini" type="button" data-act="meuble-suggest" data-id="${esc(m.id)}">Ajouter ${esc(m.suggest.slice(0, 3).map(x => Array.isArray(x) ? x[0] : x).join(", ").toLowerCase())}…</button>` : ""}</div>`;
      const meuble = m => { const items = itemsIn(m), low = items.filter(it => lvlIndex(it) >= 2).length;
        const head = `<div class="meuble-head"><span class="meuble-name">${esc(m.name)}</span><span class="meuble-count">${low ? `<b>${low} à racheter</b>` : plural(items.length, "produit")}</span></div>`;
        const add = `<button type="button" class="meuble-add" data-act="meuble-add" data-id="${esc(m.id)}">+ Ajouter ici</button>`;
        if (m.type === "tiroirs") {
          const nd = 3, drawers = [0, 1, 2].map(d => items.filter((_, i) => i % nd === d));
          return `<div class="meuble meuble-tiroirs">${head}${items.length ? drawers.map(d => `<div class="drawer"><span class="drawer-handle"></span><div class="shelves">${d.map(item).join("")}</div></div>`).join("") : body(m, items)}${add}</div>`;
        }
        if (m.type === "evier") return `<div class="meuble meuble-evier">${head}<div class="counter"><span class="basin"></span><span class="tap"></span></div><div class="cabinet"><svg class="pipe" viewBox="0 0 60 50" aria-hidden="true"><path d="M30 0v18a10 10 0 0 0 20 0v-4M30 18v32"/></svg>${body(m, items)}</div>${add}</div>`;
        if (m.type === "sdb") return `<div class="meuble meuble-sdb">${head}<div class="mirror"></div><div class="counter"><span class="basin"></span><span class="tap"></span></div><div class="cabinet">${body(m, items)}</div>${add}</div>`;
        if (m.type === "douche") return `<div class="meuble meuble-douche">${head}<div class="shower"><span class="shower-pipe"></span><span class="shower-head"></span></div><div class="caddy">${body(m, items)}</div>${add}</div>`;
        if (m.type === "wc") return `<div class="meuble meuble-wc">${head}<div class="cabinet">${body(m, items)}</div>${add}</div>`;
        return `<div class="meuble meuble-placard">${head}<div class="cabinet">${body(m, items)}</div>${add}</div>`;
      };
      const rooms = [...new Set(meubles().map(m => m.room || "Autre"))].sort((a, b) => (ROOM_ORDER.indexOf(a) + 1 || 99) - (ROOM_ORDER.indexOf(b) + 1 || 99));
      const fridgeTile = () => { const n = S.frigo.filter(f => f.qty > 0).length, u = urgentCount();
        return `<button type="button" class="mini-fridge" data-act="open" data-k="frigo"><span class="mf-art" aria-hidden="true"><span></span><span></span></span>
          <span class="mf-txt"><strong>Frigo</strong><span>${plural(n, "produit")}${u ? ` · <b>${u} à manger vite</b>` : ""}</span></span><span class="chev" aria-hidden="true">›</span></button>`; };
      const low = lowCount();
      return `${low ? `<div class="restock-bar"><span>${plural(low, "produit")} à racheter</span><button class="mini" type="button" data-act="stock-all-courses">Tout ajouter aux courses</button></div>` : ""}
        ${rooms.map(r => `<section class="room"><h3 class="room-title">${esc(r)}</h3>${r === "Cuisine" ? fridgeTile() : ""}${meubles().filter(m => (m.room || "Autre") === r).map(meuble).join("")}</section>`).join("")}
        ${!S.meubles.length ? empty("Préparation de vos rangements…") : ""}
        <button class="linkbtn manage-link" type="button" data-act="meubles-manage">Gérer les pièces et les meubles</button>`;
    }
  };
  function setLevel(s, lvl) {
    write(updateDoc(refOf("stock", s.id), { level: lvl, at: Date.now() }));
    if (lvl === "vide" && addCourse(s.name, catOf(s))) toast(`${s.name} ajouté aux courses`);
  }
  function seedMeubles() {
    if (meublesSeeded) return; meublesSeeded = true;
    DEFAULT_MEUBLES.forEach(({ id, ...m }) => write(setDoc(refOf("meubles", id), m)));
  }
  function openMeubleEditor(m) {
    ui.openEditor({ title: m ? `Modifier « ${m.name} »` : "Nouveau rangement", data: m || { room: "Cuisine", type: "placard", cat: "Épicerie" },
      fields: [{ key: "name", label: "Nom du meuble", type: "text", required: true, placeholder: "Meuble du salon, placard de l'entrée…" },
        { key: "room", label: "Pièce", type: "text", required: true, placeholder: "Cuisine, salon, salle de bain…" },
        { key: "type", label: "Dessin", type: "select", options: MEUBLE_TYPES },
        { key: "cat", label: "Rayon des courses pour ses produits", type: "select", options: ["Épicerie", "Surgelés", "Maison & hygiène", "Boissons", "Animaux", "Frais", "Autre"].map(c => [c, c]) }],
      onSave: v => { v.room = cap(v.room.trim());
        if (m) write(updateDoc(refOf("meubles", m.id), v));
        else write(addDoc(pathOf("meubles"), { ...v, order: 10 + S.meubles.length, suggest: [] })); toast(m ? "Rangement modifié" : `${v.name} ajouté`); },
      extra: m ? [{ label: "Supprimer ce rangement", danger: true, fn: () => {
        const inside = S.stock.filter(it => (meubleOf(it) || {}).id === m.id);
        if (inside.length) { toast(`Videz d'abord ${m.name} (${plural(inside.length, "produit")})`); return; }
        ui.removeWithUndo(refOf("meubles", m.id), m, m.name); } }] : [] });
  }

  // ----- Frigo : ce qu'il y a dedans, avec quantités et dates limites -----
  const FRIGO_CATS = ["Restes", "Viandes & poissons", "Produits laitiers", "Fruits & légumes", "Boissons", "Sauces & condiments", "Autre"];
  const FRIGO_TO_COURSE = { "Viandes & poissons": "Frais", "Produits laitiers": "Frais", "Fruits & légumes": "Fruits & légumes", Boissons: "Boissons", "Sauces & condiments": "Épicerie", Restes: "Autre", Autre: "Frais" };
  const urgent = f => f.qty > 0 && f.dlc && daysUntil(f.dlc) <= 1;
  const urgentCount = () => S.frigo.filter(urgent).length;
  function dlcLabel(f) {
    if (!f.dlc) return "";
    const n = daysUntil(f.dlc);
    if (n < 0) return `<span class="late">Périmé depuis ${plural(-n, "jour")}</span>`;
    if (n === 0) return `<span class="late">À manger aujourd'hui</span>`;
    if (n === 1) return `<span class="late">À manger demain</span>`;
    if (n <= 3) return `À manger ${rel(n)}`;
    return "Jusqu'au " + esc(FMT_DM.format(parse(f.dlc)));
  }
  R.frigo = {
    label: "Frigo", icon: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M5 9.5h14M8.5 5.5v1.8M8.5 12.5v3"/>',
    summary: () => urgentCount() ? plural(urgentCount(), "produit") + " à manger vite" : S.frigo.some(f => f.qty > 0) ? plural(S.frigo.filter(f => f.qty > 0).length, "produit") + " dedans" : "Ce qu'il y a dans le frigo",
    render() {
      const inside = S.frigo.filter(f => f.qty > 0);
      const finished = S.frigo.filter(f => !(f.qty > 0)).sort((a, b) => (b.at || 0) - (a.at || 0));
      const soon = inside.filter(urgent).sort((a, b) => a.dlc.localeCompare(b.dlc));
      const byCat = c => inside.filter(f => (FRIGO_CATS.includes(f.cat) ? f.cat : "Autre") === c)
        .sort((a, b) => (a.dlc || "9").localeCompare(b.dlc || "9") || a.name.localeCompare(b.name));
      const item = f => { const n = f.dlc ? daysUntil(f.dlc) : null;
        return `<button type="button" class="fitem${urgent(f) ? " urgent" : ""}" data-act="fitem" data-id="${esc(f.id)}">
          <span class="fitem-name">${esc(f.name)}</span>${f.qty > 1 ? `<span class="fitem-qty">${f.qty}</span>` : ""}
          ${n !== null && n <= 3 ? `<span class="fitem-dlc">${n < 0 ? "périmé" : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n + " j"}</span>` : ""}</button>`; };
      const shelf = (c, cls = "") => { const items = byCat(c);
        return `<div class="shelf ${cls}"><span class="shelf-label">${esc(c)}</span><div class="shelf-items">${items.length ? items.map(item).join("") : `<span class="shelf-empty">vide</span>`}</div></div>`; };
      const postit = (f, i) => { const n = daysUntil(f.dlc);
        return `<button type="button" class="postit" style="--r:${[-3, 2, -1.5, 3][i % 4]}deg" data-act="fitem" data-id="${esc(f.id)}">
          <span>À manger ${n < 0 ? "vite (périmé)" : n === 0 ? "aujourd'hui" : "demain"}</span><strong>${esc(f.name)}</strong></button>`; };
      return `<div class="fridge">
          <div class="fridge-door-top">
            <span class="fridge-handle"></span>
            ${soon.length ? `<div class="postits">${soon.slice(0, 4).map(postit).join("")}</div>` : `<p class="fridge-calm">Rien d'urgent dans le frigo.</p>`}
            <span class="fridge-brand">${inside.length} produit${inside.length > 1 ? "s" : ""}</span>
          </div>
          <div class="fridge-body">
            <div class="fridge-inside">
              ${shelf("Restes")}${shelf("Viandes & poissons")}${shelf("Produits laitiers")}${shelf("Autre")}
              ${shelf("Fruits & légumes", "crisper")}
            </div>
            <div class="fridge-door">
              <span class="door-label">Dans la porte</span>
              ${["Boissons", "Sauces & condiments"].map(c => { const items = byCat(c);
                return `<div class="bin"><span class="shelf-label">${esc(c)}</span><div class="shelf-items">${items.length ? items.map(item).join("") : `<span class="shelf-empty">vide</span>`}</div></div>`; }).join("")}
            </div>
          </div>
        </div>
        <p class="hint center">Touchez un produit pour en retirer un, en rajouter ou le modifier.</p>
        ${finished.length ? `<div class="paper"><div class="toolbar"><h3 class="aisle-title">Fini récemment<span>${finished.length}</span></h3><button class="linkbtn" type="button" data-act="frigo-clear">Effacer</button></div>
          <ul class="paper-list">${finished.map(f => { const inList = (ctx.getCourses ? ctx.getCourses() : []).some(c => !c.done && c.name.toLowerCase() === f.name.toLowerCase());
            return `<li><span>${esc(f.name)}</span>${inList ? `<span class="in-list">Dans la liste</span>` : `<button class="mini" type="button" data-act="frigo-courses" data-id="${esc(f.id)}">+ courses</button>`}<button class="linkbtn" type="button" data-act="qty" data-d="1" data-id="${esc(f.id)}">Remettre</button></li>`; }).join("")}</ul>
          ${finished.length > 1 ? `<button class="btn ghost" type="button" data-act="frigo-all-courses">Tout ajouter aux courses</button>` : ""}</div>` : ""}`;
    },
    submit() {
      const name = $("frigoName").value.trim(); if (!name) return;
      const cat = $("frigoCat").value;
      const qty = Math.max(1, parseInt($("frigoQty").value, 10) || 1);
      const dlc = $("frigoDlc").value || (cat === "Restes" ? addDays(today(), 3) : "");
      // Même produit déjà dans le frigo (sans date différente) : on augmente la quantité.
      const same = S.frigo.find(f => f.name.toLowerCase() === name.toLowerCase() && (f.dlc || "") === dlc);
      if (same) write(updateDoc(refOf("frigo", same.id), { qty: (same.qty > 0 ? same.qty : 0) + qty, cat, at: Date.now() }));
      else write(addDoc(pathOf("frigo"), { name, cat, qty, dlc, by: me(), at: Date.now() }));
      $("frigoName").value = ""; $("frigoQty").value = "1"; $("frigoDlc").value = "";
    }
  };

  // ----- Films & séries -----
  R.films = {
    label: "Films & séries", icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5l-2 4M13 5l-2 4M18 5l-2 4"/>',
    summary: () => { const n = S.films.filter(f => !f.seen).length; return n ? plural(n, "titre") + " à voir" : "Votre liste à regarder"; },
    render() {
      const types = ["Tout", "Film", "Série"];
      const base = S.films.filter(f => (UI.films === "vus") === !!f.seen && (UI.filmType === "Tout" || f.type === UI.filmType));
      base.sort((a, b) => UI.films === "vus" ? (b.seenAt || 0) - (a.seenAt || 0) : (b.at || 0) - (a.at || 0));
      const pick = UI.pick && S.films.find(f => f.id === UI.pick && !f.seen);
      const row = f => `<li class="row ticket${f.seen ? " done" : ""}">${check("films", f.id, f.seen, "Remettre à voir", "Marquer vu")}
        <span class="txt">${esc(f.title)}<small>${esc(meta([f.type, f.where, f.seen && f.seenAt ? "vu le " + FMT_DM.format(new Date(f.seenAt)) : ""]))}</small></span>
        <span class="perf" aria-hidden="true"></span><span class="who ${esc(f.who)}">${esc(whoName(f.who))}</span>${del("films", f.id, f.title)}</li>`;
      return `
        <div class="seg seg-full">${opts2([["avoir", "À voir"], ["vus", "Déjà vus"]], UI.films, "films-view")}</div>
        <div class="toolbar"><div class="chips">${types.map(t => `<button type="button" class="chip" aria-pressed="${t === UI.filmType}" data-act="film-type" data-v="${t}">${t === "Tout" ? "Tout" : t + "s"}</button>`).join("")}</div>
</div>
        <div class="cinema"><div class="marquee" aria-hidden="true">${"<i></i>".repeat(14)}</div>
          ${pick ? `<p class="screen-kicker">Ce soir, on regarde</p><p class="screen-title">${esc(pick.title)}</p><p class="screen-sub">${esc(meta([pick.type, pick.where]))}</p>
            <div class="add-row"><button class="btn screen-btn" type="button" data-act="toggle" data-k="films" data-id="${esc(pick.id)}">C'est vu</button><button class="linkbtn screen-link" type="button" data-act="pick">Relancer</button></div>`
          : `<p class="screen-kicker">Le cinéma des mimichats</p><p class="screen-title">${S.films.filter(f => !f.seen).length ? plural(S.films.filter(f => !f.seen).length, "titre") + " à voir" : "Aucun titre pour l'instant"}</p>
            ${S.films.filter(f => !f.seen).length > 1 ? `<div class="add-row"><button class="btn screen-btn" type="button" data-act="pick">Tirer au sort ce soir</button></div>` : ""}`}</div>
        ${base.length ? `<ul class="list">${base.map(row).join("")}</ul>` : empty(UI.films === "vus" ? "Rien de vu pour l'instant." : "Ajoutez les films et séries<br>que vous voulez voir ensemble.")}`;
    },
    submit() {
      const title = $("filmTitle").value.trim(); if (!title) return;
      write(addDoc(pathOf("films"), { title, type: $("filmType").value, where: $("filmWhere").value.trim(), who: $("filmWho").value, seen: false, by: me(), at: Date.now() }));
      $("filmTitle").value = ""; $("filmWhere").value = "";
    },
    toggle(f) { write(updateDoc(refOf("films", f.id), { seen: !f.seen, seenAt: f.seen ? 0 : Date.now() })); if (UI.pick === f.id) UI.pick = null; }
  };
  function opts2(list, cur, act) { return list.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${v === cur}">${esc(l)}</button>`).join(""); }

  // ----- Sorties & voyages -----
  const KINDS = ["Resto", "Bar", "Sortie", "Week-end", "Voyage"];
  R.sorties = {
    label: "Sorties & voyages", icon: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    summary: () => { const n = S.sorties.filter(s => !s.done).length; return n ? plural(n, "idée") + " à faire" : "Restos, week-ends, voyages"; },
    render() {
      const present = KINDS.filter(k => S.sorties.some(s => !s.done && s.kind === k));
      if (UI.sortKind !== "Tout" && !present.includes(UI.sortKind)) UI.sortKind = "Tout";
      const open = S.sorties.filter(s => !s.done && (UI.sortKind === "Tout" || s.kind === UI.sortKind)).sort((a, b) => (b.at || 0) - (a.at || 0));
      const done = S.sorties.filter(s => s.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
      const KICON = { Resto: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1-3 4-3 7h3v11"/>', Bar: '<path d="M5 4h14l-7 8zM12 12v8M8 20h8"/>',
        Sortie: '<path d="M4 8h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/>', "Week-end": '<path d="M3 20h18M5 20l7-13 7 13M10 20l2-4 2 4"/>', Voyage: '<path d="M2 15l20-7-6 9-4-1-3 4-1-4z"/>' };
      const row = s => `<li class="row postcard${s.done ? " done" : ""}">${check("sorties", s.id, s.done, "Remettre en idée", "Marquer fait")}
        <span class="txt">${esc(s.title)}<small>${meta([esc(s.kind), esc(s.place || ""), s.price ? "~" + esc(euro0(s.price / 100)) : "", linkHtml(s.url)])}</small></span>
        <span class="stamp-k" aria-hidden="true"><svg viewBox="0 0 24 24">${KICON[s.kind] || KICON.Sortie}</svg></span>
        <span class="who who-hidden ${esc(s.who)}">${esc(whoName(s.who))}</span>${del("sorties", s.id, s.title)}</li>`;
      return `
        ${present.length > 1 ? `<div class="chips">${["Tout", ...present].map(k => `<button type="button" class="chip" aria-pressed="${k === UI.sortKind}" data-act="sort-kind" data-v="${esc(k)}">${esc(k)}</button>`).join("")}</div>` : ""}
        ${open.length ? `<ul class="list">${open.map(row).join("")}</ul>` : empty("Notez les restos à tester,<br>les sorties et les voyages dont vous rêvez.")}
        ${done.length ? `<button class="linkbtn" type="button" data-act="show-done-sort">${UI.showDoneSort ? "Masquer" : "Voir"} ce que vous avez déjà fait (${done.length})</button>` +
          (UI.showDoneSort ? `<ul class="list">${done.map(row).join("")}</ul>` : "") : ""}`;
    },
    submit() {
      const title = $("sortTitle").value.trim(); if (!title) return;
      write(addDoc(pathOf("sorties"), { title, kind: $("sortKind").value, place: $("sortPlace").value.trim(), who: $("sortWho").value,
        price: cents($("sortPrice").value), url: safeUrl($("sortUrl").value.trim()), done: false, by: me(), at: Date.now() }));
      ["sortTitle", "sortPlace", "sortPrice", "sortUrl"].forEach(id => $(id).value = "");
    },
    toggle(s) { write(updateDoc(refOf("sorties", s.id), { done: !s.done, doneAt: s.done ? 0 : Date.now() })); }
  };

  // ----- Idées cadeaux (privées : chacun voit seulement les siennes) -----
  const OCCAS = ["Anniversaire", "Noël", "Fête", "Pour le plaisir"];
  R.cadeaux = {
    label: "Idées cadeaux", icon: '<rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/>',
    summary: () => { const n = S.cadeaux.filter(c => !c.given).length; return n ? plural(n, "idée") + " · visibles par toi seul" : "Visibles par toi seul"; },
    render() {
      const open = S.cadeaux.filter(c => !c.given);
      const given = S.cadeaux.filter(c => c.given).sort((a, b) => (b.givenAt || 0) - (a.givenAt || 0));
      const people = [...new Set(open.map(c => c.for || "Autre"))].sort((a, b) => a.localeCompare(b));
      const names = [...new Set([MEMBRES[other()].nom, ...S.cadeaux.map(c => c.for).filter(Boolean)])];
      const row = c => { const n = c.date ? daysUntil(c.date) : null;
        const f = (c.for || "").toLowerCase(), rib = f === MEMBRES.eva.nom.toLowerCase() ? "eva" : f === MEMBRES.thib.nom.toLowerCase() ? "thib" : "deux";
        return `<li class="row gift rib-${rib}${c.given ? " done" : ""}">${check("cadeaux", c.id, c.given, "Remettre en idée", "Marquer offert")}
        <span class="txt">${esc(c.title)}<small>${meta([esc(c.occasion), n !== null ? esc(n >= 0 ? FMT_DM.format(parse(c.date)) + " (" + rel(n) + ")" : FMT_DM.format(parse(c.date))) : "",
          c.price ? "~" + esc(euro0(c.price / 100)) : "", linkHtml(c.url)])}</small></span>
        <span class="ribbon" aria-hidden="true"><svg class="bow" viewBox="0 0 24 24"><path d="M12 12c-3-5-9-5-8-1s8 1 8 1zm0 0c3-5 9-5 8-1s-8 1-8 1z"/><circle cx="12" cy="12" r="2.2"/></svg></span>${del("cadeaux", c.id, c.title)}</li>`; };
      return `<p class="muted small private-note">Tes idées cadeaux restent secrètes : ${esc(MEMBRES[other()].nom)} ne les voit pas.</p>
        ${people.length ? people.map(p => group("Pour " + esc(p), open.filter(c => (c.for || "Autre") === p)
          .sort((a, b) => (a.date || "9").localeCompare(b.date || "9")).map(row).join(""))).join("") : empty("Notez une idée dès qu'elle vous vient :<br>elle sera là le jour J.")}
        ${given.length ? `<button class="linkbtn" type="button" data-act="show-given">${UI.showGiven ? "Masquer" : "Voir"} les cadeaux déjà offerts (${given.length})</button>` +
          (UI.showGiven ? `<ul class="list">${given.map(row).join("")}</ul>` : "") : ""}`;
    },
    submit() {
      const title = $("cadTitle").value.trim(); if (!title) return;
      write(addDoc(pathOf("cadeaux"), { title, for: $("cadFor").value.trim() || "Autre", occasion: $("cadOcc").value, date: $("cadDate").value || "",
        price: cents($("cadPrice").value), url: safeUrl($("cadUrl").value.trim()), given: false, at: Date.now() }));
      ["cadTitle", "cadPrice", "cadUrl", "cadDate"].forEach(id => $(id).value = "");
    },
    toggle(c) { write(updateDoc(refOf("cadeaux", c.id), { given: !c.given, givenAt: c.given ? 0 : Date.now() })); }
  };

  // ----- Souvenirs & dates importantes -----
  function nextYearly(s) {
    const t = today(); const md = s.slice(5);
    let y = +t.slice(0, 4); let d = y + "-" + md;
    if (md === "02-29") { const leap = n => (n % 4 === 0 && n % 100 !== 0) || n % 400 === 0; while (!leap(y)) y++; d = y + "-02-29"; }
    if (d < t) { y++; d = y + "-" + md; }
    return { date: d, years: y - +s.slice(0, 4) };
  }
  R.souvenirs = {
    label: "Souvenirs", icon: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
    summary: () => {
      const n = S.souvenirs.filter(s => s.yearly && s.date).map(s => ({ s, ...nextYearly(s.date) })).sort((a, b) => a.date.localeCompare(b.date))[0];
      return n ? `${n.s.title} ${rel(daysUntil(n.date))}` : "Dates importantes et journal";
    },
    render() {
      const t = today();
      const yearly = S.souvenirs.filter(s => s.yearly && s.date).map(s => ({ s, ...nextYearly(s.date) })).sort((a, b) => a.date.localeCompare(b.date));
      const journal = S.souvenirs.filter(s => !s.yearly).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      const onThisDay = journal.filter(s => s.date && s.date.slice(5) === t.slice(5) && s.date < t);
      const rowY = ({ s, date, years }) => { const n = daysUntil(date);
        return `<li class="row countdown${n === 0 ? " is-today" : ""}"><span class="cd-ring"></span><span class="cd-num">${n === 0 ? "Jour J" : n}</span><span class="cd-lbl">${n === 0 ? "c'est aujourd'hui" : n === 1 ? "jour" : "jours"}</span>
          <span class="txt">${esc(s.title)}<small>${esc(meta([FMT_DM.format(parse(date)), years > 0 ? plural(years, "an") : ""]))}</small></span>${del("souvenirs", s.id, s.title)}</li>`; };
      const photos = s => (s.photos || []).length ? `<span class="photos">${s.photos.map(ph => `<a href="${esc(ph.url)}" target="_blank" rel="noopener"><img src="${esc(ph.url)}" alt="" loading="lazy"></a>`).join("")}</span>` : "";
      const addPhoto = s => `<label class="mini photo-add" for="ph-${esc(s.id)}">+ Photo<input type="file" id="ph-${esc(s.id)}" data-souv="${esc(s.id)}" accept="image/*" multiple hidden></label>`;
      const rowJ = (s, i) => { const ph = (s.photos || [])[0];
        return `<li class="row polaroid" style="--rot:${[-2.2, 1.6, -1, 2.4][i % 4]}deg">
          <span class="pol-photo">${ph ? `<a href="${esc(ph.url)}" target="_blank" rel="noopener"><img src="${esc(ph.url)}" alt="" loading="lazy"></a>${s.photos.length > 1 ? `<span class="pol-more">+${s.photos.length - 1}</span>` : ""}`
            : `<label class="pol-empty" for="ph-${esc(s.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Ajouter une photo</span></label>`}</span>
          <span class="txt"><strong class="pol-title">${esc(s.title)}</strong><small>${esc(s.date ? FMT_DMY.format(parse(s.date)) : "")}</small>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</span>
          ${ph ? addPhoto(s) : `<input type="file" id="ph-${esc(s.id)}" data-souv="${esc(s.id)}" accept="image/*" multiple hidden>`}${del("souvenirs", s.id, s.title)}</li>`; };
      return `${onThisDay.length ? `<div class="card hero-num"><p class="eyebrow">Ce jour-là</p>${onThisDay.map(s => `<p class="big">${esc(s.title)}</p><p class="muted small">${esc(plural(+t.slice(0, 4) - +s.date.slice(0, 4), "an"))} aujourd'hui</p>`).join("")}</div>` : ""}
        <form class="add card notebook" data-form="souvenirs" autocomplete="off">
          <p class="notebook-title">Un nouveau souvenir</p>
          <input type="text" id="souvTitle" placeholder="Notre rencontre, premier voyage, soirée raclette…" aria-label="Titre">
          <textarea id="souvNote" rows="2" placeholder="Un petit mot pour s'en souvenir (facultatif)" aria-label="Note"></textarea>
          <div class="add-row wrap-row">
            <input type="date" id="souvDate" value="${t}" aria-label="Date">
            <label class="checkline" for="souvYearly"><input type="checkbox" id="souvYearly"> Revient chaque année</label>
          </div>
          <div class="add-row wrap-row">
            <label class="btn ghost file-btn" for="souvPhotos">Ajouter des photos<input type="file" id="souvPhotos" accept="image/*" multiple hidden></label>
            <span class="hint" id="souvPhotosInfo"></span>
            <button class="btn" type="submit">Ajouter</button>
          </div></form>
        ${yearly.length ? `<section class="aisle"><h3 class="aisle-title">Dates à venir</h3><ul class="count-grid">${yearly.map(rowY).join("")}</ul></section>` : ""}
        ${journal.length ? `<section class="aisle"><h3 class="aisle-title">Notre album<span>${journal.length}</span></h3><ul class="pol-grid">${journal.map(rowJ).join("")}</ul></section>` : ""}
        ${!yearly.length && !journal.length ? empty("Gardez vos dates importantes<br>et vos meilleurs moments ici.") : ""}`;
    },
    submit() {
      const title = $("souvTitle").value.trim(), date = $("souvDate").value; if (!title || !date) return;
      const files = [...($("souvPhotos").files || [])];
      const id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      write(setDoc(refOf("souvenirs", id), { title, note: $("souvNote").value.trim(), date, yearly: $("souvYearly").checked, photos: [], by: me(), at: Date.now() }));
      $("souvTitle").value = ""; $("souvNote").value = ""; $("souvYearly").checked = false; $("souvPhotos").value = ""; $("souvPhotosInfo").textContent = "";
      if (files.length) addPhotos(id, files, []);
    }
  };

  // Envoi des photos d'un souvenir, une par une.
  async function addPhotos(id, files, existing) {
    const list = existing.slice();
    for (let i = 0; i < files.length; i++) {
      toast(`Envoi des photos : ${i + 1} sur ${files.length}…`, null, 60000);
      try { list.push(await ctx.uploadPhoto(files[i], `foyer/souvenirs/${id}/${Date.now()}-${i}.jpg`)); write(updateDoc(refOf("souvenirs", id), { photos: list })); }
      catch (err) { console.error(err); toast("La photo n'a pas pu être envoyée. Les photos demandent la formule Blaze de Firebase (étape 9 du guide)."); return; }
    }
    toast(files.length > 1 ? `${files.length} photos ajoutées` : "Photo ajoutée");
  }
  root.addEventListener("change", e => {
    if (e.target.id === "souvPhotos") { const n = e.target.files.length; $("souvPhotosInfo").textContent = n ? `${n} photo${n > 1 ? "s" : ""} choisie${n > 1 ? "s" : ""}` : ""; return; }
    const sid = e.target.dataset && e.target.dataset.souv; if (!sid) return;
    const sv = S.souvenirs.find(x => x.id === sid); const files = [...e.target.files]; e.target.value = "";
    if (sv && files.length) addPhotos(sid, files, sv.photos || []);
  });

  // ----- Check-list de valise (réutilisable d'un départ à l'autre) -----
  const VALISE_CATS = ["Papiers & argent", "Vêtements", "Toilette", "Santé", "Tech & chargeurs", "Divers"];
  const VALISE_BASE = [["Carte d'identité ou passeport", "Papiers & argent"], ["Carte bancaire", "Papiers & argent"], ["Billets et réservations", "Papiers & argent"],
    ["Sous-vêtements", "Vêtements"], ["Chaussettes", "Vêtements"], ["T-shirts", "Vêtements"], ["Pantalons", "Vêtements"], ["Pull", "Vêtements"], ["Pyjama", "Vêtements"], ["Chaussures", "Vêtements"], ["Maillot de bain", "Vêtements"],
    ["Brosses à dents", "Toilette"], ["Dentifrice", "Toilette"], ["Gel douche et shampoing", "Toilette"], ["Déodorant", "Toilette"],
    ["Médicaments habituels", "Santé"], ["Trousse de secours", "Santé"],
    ["Chargeurs de téléphone", "Tech & chargeurs"], ["Écouteurs", "Tech & chargeurs"], ["Batterie externe", "Tech & chargeurs"],
    ["Lunettes de soleil", "Divers"], ["Sac pour le linge sale", "Divers"], ["Gourde", "Divers"]];
  R.valise = {
    label: "Valise", icon: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4.5h6V7M4 12h16"/>',
    summary: () => { const n = S.valise.length, p = S.valise.filter(v => v.packed).length; return n ? `${p} sur ${n} dans la valise` : "Check-list pour les départs"; },
    render() {
      const n = S.valise.length, p = S.valise.filter(v => v.packed).length;
      const row = v => `<li class="row${v.packed ? " done" : ""}">${check("valise", v.id, v.packed, "Sortir de la valise", "Mettre dans la valise")}
        <span class="txt">${esc(v.name)}</span><span class="who ${esc(v.who || "deux")}">${esc(whoName(v.who || "deux"))}</span>${del("valise", v.id, v.name)}</li>`;
      let h = "";
      for (const c of VALISE_CATS) {
        const items = S.valise.filter(v => !v.packed && (VALISE_CATS.includes(v.cat) ? v.cat : "Divers") === c).sort((a, b) => a.name.localeCompare(b.name));
        if (items.length) h += group(`${esc(c)} · ${items.length}`, items.map(row).join(""));
      }
      const packed = S.valise.filter(v => v.packed).sort((a, b) => a.name.localeCompare(b.name));
      const pct = n ? Math.round(p / n * 100) : 0;
      return `${n ? `<div class="suitcase"><span class="sc-handle"></span><div class="sc-body">
          <div class="sc-head"><span><strong>${p}</strong> sur ${n} dans la valise</span>${p === n ? `<span class="sc-ready">Prête !</span>` : ""}</div>
          <div class="sc-items">${packed.length ? packed.map(v => `<button type="button" class="sc-item who-${esc(v.who || "deux")}" data-act="toggle" data-k="valise" data-id="${esc(v.id)}">${esc(v.name)}</button>`).join("") : `<span class="sc-empty">Cochez les affaires ci-dessous : elles viennent se ranger ici.</span>`}</div>
          <div class="zip" aria-hidden="true"><span style="width:${pct}%"></span></div>
        </div></div>
        ${p ? `<button class="btn ghost" type="button" data-act="valise-reset">Nouveau départ : tout ressortir</button>` : ""}` : ""}
        ${n && p < n ? `<h3 class="room-title">Encore à prendre</h3>` : ""}
        ${h || (n ? "" : `<div class="empty">La liste est vide.<br><button class="btn" type="button" data-act="valise-base">Ajouter une liste de base</button></div>`)}
        ${h ? `<button class="linkbtn" type="button" data-act="valise-base">Compléter avec la liste de base</button>` : ""}`;
    },
    submit() {
      const name = $("valName").value.trim(); if (!name) return;
      write(addDoc(pathOf("valise"), { name, cat: $("valCat").value, who: $("valWho").value, packed: false, by: me(), at: Date.now() }));
      $("valName").value = "";
    },
    toggle(v) { write(updateDoc(refOf("valise", v.id), { packed: !v.packed })); }
  };

  // ----- Envies (l'onglet a rejoint « Plus ») -----
  R.envies = { label: "Envies", external: true, icon: '<path d="M5 8h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    summary: () => ctx.enviesSummary ? ctx.enviesSummary() : "" };

  // ----- Mots doux -----
  const newMots = () => S.mots.filter(m => m.from !== me() && !m.seen);
  R.mots = {
    label: "Mots doux", icon: '<path d="M4 5h16v11H9l-5 4z"/>',
    summary: () => newMots().length ? plural(newMots().length, "nouveau mot").replace("nouveau mots", "nouveaux mots") : "Laisser un mot à l'autre",
    render() {
      const list = S.mots.slice().sort((a, b) => a.at - b.at).slice(-60);
      return `<div class="chat">${list.length ? list.map(m => `<div class="msg ${m.from === me() ? "mine" : "theirs"}"><span class="avatar av-${esc(m.from)}">${esc((MEMBRES[m.from]?.nom || "?").charAt(0))}</span><div class="bubble ${m.from === me() ? "mine" : "theirs"} ${esc(m.from)}">
          <span>${esc(m.text)}</span><small>${esc(new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(m.at)))}${m.from === me() && m.seen ? " · lu" : ""}</small></div></div>`).join("")
          : empty("Laissez-vous des petits mots :<br>ils s'affichent en haut de l'appli chez l'autre.")}</div>
        <form class="add card" data-form="mots" autocomplete="off">
          <textarea id="motText" rows="2" maxlength="500" placeholder="Un mot pour ${esc(MEMBRES[other()].nom)}…" aria-label="Message"></textarea>
          <div class="add-row"><span class="hint">${esc(MEMBRES[other()].nom)} le verra en ouvrant l'appli.</span><button class="btn" type="submit">Envoyer</button></div>
        </form>`;
    },
    submit() {
      const text = $("motText").value.trim(); if (!text) return;
      write(addDoc(pathOf("mots"), { text, from: me(), by: me(), seen: false, at: Date.now() }));
      $("motText").value = "";
    }
  };

  // Cycle d'Eva : données et affichage gérés par cycle.js.
  R.cycle = { label: "Cycle", local: true,
    icon: '<path d="M12 3.5c-3.2 4.2-5.5 7.4-5.5 10.2a5.5 5.5 0 0 0 11 0c0-2.8-2.3-6-5.5-10.2z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.4"/>',
    summary: () => ctx.cycle ? ctx.cycle.summary() : "Suivi du cycle",
    render: () => ctx.cycle ? ctx.cycle.render() : "" };
  if (ctx.cycle) ctx.cycle.onChange(() => { if (UI.view === "cycle" || !UI.view) render(); });

  const ORDER = ["envies", "frigo", "stock", "depenses", "factures", "films", "sorties", "cadeaux", "souvenirs", "valise", "mots", "cycle"];
  const DATA = [...ORDER.filter(k => !R[k].external && !R[k].local), "meubles"];

  // ----- Fiches de modification par rubrique -----
  const EDIT = {
    depenses: { title: "Modifier la dépense", label: d => d.title, fields: [{ key: "title", label: "Dépense", type: "text", required: true }, { key: "amount", label: "Montant (€)", type: "cents", required: true },
      { key: "paidBy", label: "Payé par", type: "who2" }, { key: "split", label: "Répartition", type: "select", options: [["moitie", "Moitié-moitié"], ["autre", "Pour l'autre"]] }, { key: "date", label: "Date", type: "date" }] },
    factures: { title: "Modifier la facture", label: f => f.name, fields: [{ key: "name", label: "Nom", type: "text", required: true }, { key: "amount", label: "Montant (€)", type: "cents", required: true },
      { key: "freq", label: "Fréquence", type: "select", options: FREQ }, { key: "who", label: "Qui paie", type: "who" }, { key: "next", label: "Prochaine échéance", type: "date" }] },
    stock: { title: "Modifier le produit", label: x => x.name, fields: () => [{ key: "name", label: "Produit", type: "text", required: true },
      { key: "meuble", label: "Rangé dans", type: "select", options: meubles().map(m => [m.id, `${m.name} (${m.room})`]) },
      { key: "level", label: "Niveau", type: "select", options: LEVELS }, { key: "who", label: "À qui", type: "who" }] },
    frigo: { title: "Modifier le produit", label: x => x.name, fields: [{ key: "name", label: "Produit", type: "text", required: true }, { key: "cat", label: "Catégorie", type: "select", options: FRIGO_CATS.map(c => [c, c]) },
      { key: "qty", label: "Quantité", type: "number" }, { key: "dlc", label: "À consommer avant", type: "date" }], fix: v => { v.qty = Math.max(0, Math.round(v.qty || 0)); } },
    films: { title: "Modifier", label: x => x.title, fields: [{ key: "title", label: "Titre", type: "text", required: true }, { key: "type", label: "Type", type: "select", options: [["Film", "Film"], ["Série", "Série"]] },
      { key: "where", label: "Où le voir", type: "text" }, { key: "who", label: "Proposé par", type: "who" }] },
    sorties: { title: "Modifier l'idée", label: x => x.title, fields: [{ key: "title", label: "Idée", type: "text", required: true }, { key: "kind", label: "Type", type: "select", options: KINDS.map(k => [k, k]) },
      { key: "place", label: "Lieu", type: "text" }, { key: "who", label: "Idée de", type: "who" }, { key: "price", label: "Budget (€)", type: "cents" }, { key: "url", label: "Lien", type: "url" }], fix: v => { v.url = safeUrl(v.url || ""); } },
    cadeaux: { title: "Modifier l'idée cadeau", label: x => x.title, fields: [{ key: "title", label: "Idée", type: "text", required: true }, { key: "for", label: "Pour qui", type: "text" },
      { key: "occasion", label: "Occasion", type: "select", options: OCCAS.map(o => [o, o]) }, { key: "date", label: "Date de l'occasion", type: "date" }, { key: "price", label: "Prix (€)", type: "cents" }, { key: "url", label: "Lien", type: "url" }], fix: v => { v.url = safeUrl(v.url || ""); } },
    souvenirs: { title: "Modifier le souvenir", label: x => x.title, fields: [{ key: "title", label: "Titre", type: "text", required: true }, { key: "date", label: "Date", type: "date", required: true },
      { key: "note", label: "Petit mot", type: "textarea" }, { key: "yearly", label: "Revient chaque année", type: "checkbox" }] },
    valise: { title: "Modifier", label: x => x.name, fields: [{ key: "name", label: "Objet", type: "text", required: true }, { key: "cat", label: "Catégorie", type: "select", options: VALISE_CATS.map(c => [c, c]) },
      { key: "who", label: "Pour qui", type: "who" }] }
  };
  const GROUPS = [["La maison", ["frigo", "stock", "valise"]], ["L'argent", ["depenses", "factures"]], ["À deux", ["envies", "films", "sorties", "cadeaux", "souvenirs", "mots", "cycle"]]];
  // Ajout par fiche : mêmes champs que la modification, avec des valeurs de départ.
  const CREATE = {
    depenses: { title: "Nouvelle dépense", data: () => ({ paidBy: me(), split: "moitie", date: today() }), extra: { settled: false } },
    factures: { title: "Nouvelle facture", data: () => ({ freq: "mensuel", who: "deux", next: today() }) },
    stock: { title: "Nouveau produit", data: () => ({ meuble: UI.meuble || (meubles()[0] || {}).id, level: "plein", who: "deux" }) },
    frigo: { title: "Dans le frigo", data: () => ({ cat: "Produits laitiers", qty: 1, dlc: "" }), save: v => {
      v.qty = Math.max(1, Math.round(v.qty || 1)); if (!v.dlc && v.cat === "Restes") v.dlc = addDays(today(), 3);
      const same = S.frigo.find(f => f.name.toLowerCase() === v.name.toLowerCase() && (f.dlc || "") === (v.dlc || ""));
      if (same) write(updateDoc(refOf("frigo", same.id), { qty: (same.qty > 0 ? same.qty : 0) + v.qty, cat: v.cat, at: Date.now() }));
      else write(addDoc(pathOf("frigo"), { ...v, by: me(), at: Date.now() }));
    } },
    films: { title: "À regarder", data: () => ({ type: "Film", who: me() }), extra: { seen: false } },
    sorties: { title: "Nouvelle idée de sortie", data: () => ({ kind: "Resto", who: me() }), extra: { done: false } },
    cadeaux: { title: "Nouvelle idée cadeau", data: () => ({ for: MEMBRES[other()].nom, occasion: "Anniversaire" }), extra: { given: false } },
    valise: { title: "Ajouter à la valise", data: () => ({ cat: "Divers", who: "deux" }), extra: { packed: false } }
  };
  function openCreate(k) {
    const c = CREATE[k], cfg = EDIT[k]; if (!c || !cfg) return;
    ui.openEditor({ title: c.title, data: c.data(), fields: typeof cfg.fields === "function" ? cfg.fields() : cfg.fields, onSave: v => {
      if (cfg.fix) cfg.fix(v);
      if (c.save) c.save(v); else write(addDoc(pathOf(k), { ...v, ...(c.extra || {}), by: me(), at: Date.now() }));
      toast(`${cfg.label(v)} ajouté`);
    } });
  }
  function openEdit(k, item) {
    const cfg = EDIT[k]; if (!cfg) return;
    ui.openEditor({ title: cfg.title, data: k === "stock" ? { ...item, meuble: (meubleOf(item) || {}).id } : item, fields: typeof cfg.fields === "function" ? cfg.fields() : cfg.fields,
      onSave: v => { if (cfg.fix) cfg.fix(v); write(updateDoc(refOf(k, item.id), v)); },
      extra: [{ label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(refOf(k, item.id), item, cfg.label(item)) }] });
  }

  // ================= Affichage =================
  function preserve(fn) {
    const vals = {}; root.querySelectorAll("input,textarea,select").forEach(el => { if (el.id) vals[el.id] = el.type === "checkbox" ? el.checked : el.value; });
    const f = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
    fn();
    for (const id in vals) { const el = document.getElementById(id); if (el && root.contains(el)) { if (el.type === "checkbox") el.checked = vals[id]; else el.value = vals[id]; } }
    if (f && $(f)) $(f).focus({ preventScroll: true });
  }
  function render() {
    preserve(() => {
      if (!UI.view || !R[UI.view]) {
        const alert = k => (k === "mots" && newMots().length) || (k === "factures" && facturesDue()) || (k === "stock" && lowCount()) || (k === "frigo" && urgentCount());
        const tile = k => `<button type="button" class="tile${alert(k) ? " has-alert" : ""}" data-act="${R[k].external ? "goto" : "open"}" data-k="${k}">
          <span class="tile-ico"><svg viewBox="0 0 24 24">${R[k].icon}</svg></span><span class="tile-name">${esc(R[k].label)}</span><span class="tile-sub">${esc(R[k].summary())}</span></button>`;
        const alerts = ORDER.filter(alert).length;
        root.innerHTML = `<header class="page-head"><h2>Plus</h2><p class="page-sum">${alerts ? `${alerts} rubrique${alerts > 1 ? "s" : ""} à regarder` : "Tout le reste de votre vie à deux"}</p></header>
          ${GROUPS.map(([title, keys]) => `<section class="tile-group"><h3 class="aisle-title">${title}</h3><div class="tiles">${keys.map(tile).join("")}</div></section>`).join("")}`;
      } else {
        root.innerHTML = `<header class="sub-page-head"><button type="button" class="back-btn" data-act="back" aria-label="Retour à Plus">‹</button><h2>${esc(R[UI.view].label)}</h2>
          ${CREATE[UI.view] ? `<button type="button" class="add-btn" data-act="create" aria-label="Ajouter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>` : ""}</header>${R[UI.view].render()}`;
      }
    });
    renderBadge(); renderBanner();
  }
  function open(k) { UI.view = k; try { sessionStorage.setItem("mimi-plus", k || ""); } catch (e) {} render(); window.scrollTo(0, 0);
    if (k === "mots") newMots().forEach(m => write(updateDoc(refOf("mots", m.id), { seen: true }))); }

  function renderBadge() {
    const n = newMots().length + facturesDue() + urgentCount();
    const b = $("bPlus"); if (b) { b.hidden = !n; b.textContent = n; }
  }
  function renderBanner() {
    const m = newMots().sort((a, b) => b.at - a.at)[0];
    const el = $("motBanner"); if (!el) return;
    el.hidden = !m;
    el.className = "mot-banner" + (m ? " " + m.from : "");
    if (m) el.innerHTML = `<span class="mb-txt"><small>${esc(whoName(m.from))} t'a laissé un mot</small>${esc(m.text)}</span>
      <span class="mb-btns"><button type="button" class="btn ghost" data-mb="reply">Répondre</button><button type="button" class="btn" data-mb="seen">Lu ♥</button></span>`;
  }
  $("motBanner").addEventListener("click", e => {
    const b = e.target.closest("[data-mb]"); if (!b) return;
    newMots().forEach(m => write(updateDoc(refOf("mots", m.id), { seen: true })));
    if (b.dataset.mb === "reply") { ctx.showTab("plus"); open("mots"); setTimeout(() => $("motText") && $("motText").focus(), 50); }
  });

  // ================= Actions =================
  root.addEventListener("click", e => {
    // Appui sur le texte d'une ligne : fiche de modification.
    const txt = e.target.closest(".row .txt");
    if (txt && !e.target.closest("a, label, input") && UI.view) {
      const d = txt.parentElement.querySelector('[data-act="del"]');
      const it = d && S[d.dataset.k] ? S[d.dataset.k].find(x => x.id === d.dataset.id) : null;
      if (it) { openEdit(d.dataset.k, it); return; }
    }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, k = b.dataset.k, id = b.dataset.id;
    const item = k && id ? S[k].find(x => x.id === id) : null;
    switch (a) {
      case "open": open(k); break;
      case "back": open(null); break;
      case "goto": ctx.showTab(k); break;
      case "sitem": { const it = S.stock.find(x => x.id === id); if (!it) break; const cur = lvlIndex(it);
        ui.openEditor({ title: it.name, data: {}, fields: [], extra: [
          ...LEVELS.map(([v, l], i) => ({ label: `${i === cur ? "✓ " : ""}${l}${v === "vide" ? " (l'ajouter aux courses)" : ""}`, fn: () => setLevel(it, v) })),
          { label: "Déplacer dans un autre meuble", fn: () => ui.openEditor({ title: `Déplacer ${it.name}`, data: { meuble: (meubleOf(it) || {}).id },
            fields: [{ key: "meuble", label: "Vers", type: "select", options: meubles().map(m => [m.id, `${m.name} (${m.room})`]) }],
            onSave: v => { write(updateDoc(refOf("stock", it.id), { meuble: v.meuble, place: "" })); toast(`${it.name} déplacé`); } }) },
          { label: "Modifier", fn: () => openEdit("stock", it) },
          { label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(refOf("stock", it.id), it, it.name) }
        ] }); break; }
      case "meuble-add": UI.meuble = id; openCreate("stock"); break;
      case "meuble-suggest": { const m = S.meubles.find(x => x.id === id); if (!m) break;
        const have = new Set(S.stock.map(x => x.name.toLowerCase())); let n = 0;
        (m.suggest || []).forEach(sg => { const [name, who] = Array.isArray(sg) ? sg : [sg, "deux"];
          if (!have.has(name.toLowerCase())) { n++; write(addDoc(pathOf("stock"), { name, who, meuble: m.id, level: "plein", by: me(), at: Date.now() })); } });
        toast(`${n} produits ajoutés dans ${m.name}`); break; }
      case "stock-all-courses": { let n = 0; S.stock.filter(it => lvlIndex(it) >= 2).forEach(it => { if (addCourse(it.name, catOf(it))) n++; });
        toast(n ? `${n} produit${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} aux courses` : "Tout est déjà dans la liste"); break; }
      case "meubles-manage": ui.openEditor({ title: "Pièces et meubles", data: {}, fields: [], extra: [
          ...meubles().map(m => ({ label: `${m.name} · ${m.room}`, fn: () => openMeubleEditor(m) })),
          { label: "+ Ajouter un rangement", fn: () => openMeubleEditor(null) }] }); break;
      case "fitem": { const f = S.frigo.find(x => x.id === id); if (!f) break;
        const q = f.qty > 0 ? f.qty : 0;
        ui.openEditor({ title: f.name, data: {}, fields: [], extra: [
          { label: q > 1 ? `J'en ai utilisé 1 (il en restera ${q - 1})` : "J'ai utilisé le dernier", fn: () => {
            write(updateDoc(refOf("frigo", f.id), { qty: q - 1, at: Date.now() }));
            if (q - 1 === 0) toast(`${f.name} est dans « Fini récemment »`); } },
          { label: `J'en ai rajouté 1 (il y en aura ${q + 1})`, fn: () => write(updateDoc(refOf("frigo", f.id), { qty: q + 1, at: Date.now() })) },
          { label: "Modifier", fn: () => openEdit("frigo", f) },
          { label: "C'est fini", danger: true, fn: () => {
            write(updateDoc(refOf("frigo", f.id), { qty: 0, at: Date.now() }));
            toast(`${f.name} est dans « Fini récemment »`, { label: "Annuler", fn: () => write(updateDoc(refOf("frigo", f.id), { qty: q, at: Date.now() })) }); } }
        ] }); break; }
      case "create": openCreate(UI.view); break;
      case "del": if (item) ui.removeWithUndo(refOf(k, id), item, EDIT[k] ? EDIT[k].label(item) : "Élément"); break;
      case "valise-reset": { const before = S.valise.filter(v => v.packed);
        before.forEach(v => write(updateDoc(refOf("valise", v.id), { packed: false })));
        toast("Tout est décoché, prêt pour le prochain départ", { label: "Annuler", fn: () => before.forEach(v => write(updateDoc(refOf("valise", v.id), { packed: true }))) }); break; }
      case "valise-base": { const have = new Set(S.valise.map(v => v.name.toLowerCase())); let n = 0;
        VALISE_BASE.forEach(([name, cat]) => { if (!have.has(name.toLowerCase())) { n++; write(addDoc(pathOf("valise"), { name, cat, who: "deux", packed: false, by: me(), at: Date.now() })); } });
        toast(n ? `${n} objets ajoutés` : "Tout y est déjà"); break; }
      case "toggle": if (item && R[k].toggle) R[k].toggle(item); break;
      case "settle": UI.confirmSettle = true; render(); break;
      case "settle-no": UI.confirmSettle = false; render(); break;
      case "settle-yes": { UI.confirmSettle = false; const open = S.depenses.filter(d => !d.settled);
        open.forEach(d => write(updateDoc(refOf("depenses", d.id), { settled: true, settledAt: Date.now() })));
        toast("Comptes remis à zéro", { label: "Annuler", fn: () => open.forEach(d => write(updateDoc(refOf("depenses", d.id), { settled: false, settledAt: 0 }))) }); break; }
      case "hist-dep": UI.histDep = !UI.histDep; render(); break;
      case "level": { const s = S.stock.find(x => x.id === id); if (!s) break;
        const i = LEVELS.findIndex(l => l[0] === s.level); setLevel(s, LEVELS[(i + 1) % LEVELS.length][0]); break; }
      case "to-courses": { const s = S.stock.find(x => x.id === id);
        if (s) toast(addCourse(s.name, catOf(s)) ? `${s.name} ajouté aux courses` : "Déjà dans la liste de courses"); break; }
      case "qty": { const f = S.frigo.find(x => x.id === id); if (!f) break;
        const q = Math.max(0, (f.qty > 0 ? f.qty : 0) + (+b.dataset.d));
        write(updateDoc(refOf("frigo", f.id), { qty: q, at: Date.now() }));
        if (q === 0) toast(`Plus de ${f.name} : touche « + courses » pour en racheter`); break; }
      case "frigo-courses": { const f = S.frigo.find(x => x.id === id); if (!f) break;
        toast(addCourse(f.name, FRIGO_TO_COURSE[f.cat] || "Frais") ? `${f.name} ajouté aux courses` : "Déjà dans la liste de courses"); render(); break; }
      case "frigo-all-courses": { let n = 0; S.frigo.filter(f => !(f.qty > 0)).forEach(f => { if (addCourse(f.name, FRIGO_TO_COURSE[f.cat] || "Frais")) n++; });
        toast(n ? `${n} produit${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} aux courses` : "Tout est déjà dans la liste"); render(); break; }
      case "frigo-clear": { const fin = S.frigo.filter(f => !(f.qty > 0)); ui.removeManyWithUndo(fin.map(f => ({ ref: refOf("frigo", f.id), item: f })), "Liste des produits finis effacée"); break; }
      case "films-view": UI.films = b.dataset.v; UI.pick = null; render(); break;
      case "film-type": UI.filmType = b.dataset.v; UI.pick = null; render(); break;
      case "pick": { const pool = S.films.filter(f => !f.seen && (UI.filmType === "Tout" || f.type === UI.filmType) && f.id !== UI.pick);
        const all = pool.length ? pool : S.films.filter(f => !f.seen);
        UI.pick = all.length ? all[Math.floor(Math.random() * all.length)].id : null; render(); break; }
      case "sort-kind": UI.sortKind = b.dataset.v; render(); break;
      case "show-done-sort": UI.showDoneSort = !UI.showDoneSort; render(); break;
      case "show-given": UI.showGiven = !UI.showGiven; render(); break;
    }
  });
  root.addEventListener("submit", e => { const k = e.target.dataset.form; if (!k || !R[k]) return; e.preventDefault(); R[k].submit(); render(); });

  // ================= Synchronisation =================
  const unsubs = [];
  const toList = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
  for (const k of DATA) {
    unsubs.push(onSnapshot(pathOf(k), s => {
      S[k] = toList(s);
      if (k === "meubles" && !S.meubles.length && !(s.metadata && s.metadata.fromCache)) seedMeubles();
      // Un mot qui arrive pendant qu'on lit la conversation est marqué comme lu.
      if (k === "mots" && UI.view === "mots" && ctx.currentTab() === "plus") newMots().forEach(m => write(updateDoc(refOf("mots", m.id), { seen: true })));
      render();
      if (ctx.onChange) ctx.onChange(k);
    }, err => console.error(k, err)));
  }
  render();

  // ================= Rangement automatique des courses =================
  // Quand un article est coché dans les courses, il va là où il a sa place :
  // déjà connu (frigo ou rangement) → on le remet ; sinon d'après son rayon et son nom.
  const nrm = x => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const sameName = (a, b) => { const x = nrm(a), y = nrm(b); return x === y || x.replace(/s$/, "") === y.replace(/s$/, ""); };
  const newId = () => "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function frigoCatOf(name, cat) {
    const n = nrm(name);
    if (/(viande|poulet|boeuf|porc|veau|jambon|lardon|saucisse|steak|poisson|saumon|cabillaud|crevette|dinde|chorizo|merguez|bacon|filet)/.test(n)) return "Viandes & poissons";
    if (/(lait|yaourt|yogourt|fromage|beurre|creme|oeuf|emmental|mozzarella|comte|skyr|petit suisse|feta|chevre|ricotta)/.test(n)) return "Produits laitiers";
    if (/(sauce|ketchup|mayonnaise|moutarde|pesto|cornichon)/.test(n)) return "Sauces & condiments";
    if (cat === "Fruits & légumes") return "Fruits & légumes";
    if (cat === "Boissons") return "Boissons";
    return "Autre";
  }
  function meubleFor(name, cat) {
    const n = nrm(name), t = type => S.meubles.find(m => m.type === type);
    const bySuggest = S.meubles.find(m => (m.suggest || []).some(sg => sameName(Array.isArray(sg) ? sg[0] : sg, name)));
    if (bySuggest) return bySuggest;
    if (cat === "Surgelés") return t("tiroirs");
    if (cat === "Maison & hygiène") {
      if (/(gel douche|shampo|apres-shampo|masque cheveux|savon|soin cheveux|coiffant)/.test(n)) return t("douche") || t("sdb");
      if (/(papier toilette|wc|desodorisant|toilette)/.test(n)) return t("wc") || t("evier");
      if (/(dentifrice|brosse a dent|coton|rasoir|deodorant|creme|maquillage|demaquill|serviette hygien|tampon|parfum|visage)/.test(n)) return t("sdb");
      return t("evier");
    }
    if (cat === "Épicerie" || cat === "Animaux") return t("placard");
    return null;
  }
  function ranger(item) {
    const name = item.name, cat = item.cat;
    const f = S.frigo.find(x => sameName(x.name, name));
    if (f) {
      write(updateDoc(refOf("frigo", f.id), { qty: (f.qty > 0 ? f.qty : 0) + 1, at: Date.now() }));
      return { k: "frigo", id: f.id, prev: { qty: f.qty || 0, at: f.at || 0 }, where: "le frigo" };
    }
    const st = S.stock.find(x => sameName(x.name, name));
    if (st) {
      write(updateDoc(refOf("stock", st.id), { level: "plein", at: Date.now() }));
      const m = meubleOf(st);
      return { k: "stock", id: st.id, prev: { level: st.level || "plein", at: st.at || 0 }, where: m ? m.name : "les rangements" };
    }
    if (cat === "Frais" || cat === "Fruits & légumes" || cat === "Boissons") {
      const id = newId();
      write(setDoc(refOf("frigo", id), { name, cat: frigoCatOf(name, cat), qty: 1, dlc: "", by: me(), at: Date.now() }));
      return { k: "frigo", id, created: true, where: "le frigo" };
    }
    const m = meubleFor(name, cat);
    if (m) {
      const id = newId();
      write(setDoc(refOf("stock", id), { name, who: "deux", meuble: m.id, level: "plein", by: me(), at: Date.now() }));
      return { k: "stock", id, created: true, where: m.name };
    }
    return null;
  }
  function deranger(info) {
    if (!info || !info.k || !info.id) return;
    if (info.created) write(deleteDoc(refOf(info.k, info.id)));
    else if (info.prev) write(updateDoc(refOf(info.k, info.id), info.prev));
  }

  return {
    ranger, deranger,
    showMenu: () => { if (UI.view) open(UI.view); else render(); },
    // Appelé quand un article est coché dans les courses : le stock correspondant repasse à « Plein ».
    restock(name) {
      const s = S.stock.find(x => x.name.toLowerCase() === String(name).toLowerCase() && x.level !== "plein");
      if (s) write(updateDoc(refOf("stock", s.id), { level: "plein", at: Date.now() }));
    },
    tick: render,
    showMenuRoot: () => { UI.view = null; try { sessionStorage.removeItem("mimi-plus"); } catch (e) {} render(); },
    openView: k => open(k && R[k] && !R[k].external ? k : null),
    todayData: () => ({
      frigo: S.frigo.filter(urgent).sort((a, b) => a.dlc.localeCompare(b.dlc)).map(f => f.name),
      factures: S.factures.filter(f => f.next && daysUntil(f.next) <= 3).sort((a, b) => a.next.localeCompare(b.next))
        .map(f => ({ name: f.name, when: daysUntil(f.next) < 0 ? "En retard" : cap(rel(daysUntil(f.next))), amount: euro2(f.amount) }))
    }),
    home: () => ({ frigo: S.frigo, stock: S.stock }),
    stop: () => unsubs.forEach(u => u())
  };
}
