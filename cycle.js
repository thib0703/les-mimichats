// Les mimichats — suivi du cycle d'Eva.
// Eva remplit et règle tout ; Thib consulte seulement (les règles Firestore l'empêchent d'écrire).
// Données : cycle/eva (réglages), cycle/eva/regles/{id} (début, fin), cycle/eva/jours/{date} (ressenti du jour).

export const CY_SYMPTOMES = ["Crampes", "Fatigue", "Maux de tête", "Ballonnements", "Seins sensibles", "Dos", "Acné", "Envies sucrées", "Nausées"];
export const CY_HUMEURS = ["Au top", "Bien", "Bof", "Irritable", "Triste", "Stressée", "Câline"];
export const CY_FLUX = [["leger", "Léger"], ["moyen", "Moyen"], ["abondant", "Abondant"]];
export const CY_DEFAULT = { showInAgenda: true, shareSymptoms: false, remindEva: true, remindThib: false, cycleLen: 0, periodLen: 0 };

// Calcul pur (aussi utilisé par l'aperçu et les tests) : moyennes, phase du jour, prévisions.
export function cycleModel(regles, settings, today, addDays, diff) {
  const st = { ...CY_DEFAULT, ...(settings || {}) };
  const list = (regles || []).filter(r => r.start).slice().sort((a, b) => a.start.localeCompare(b.start));
  const gaps = [];
  for (let i = 1; i < list.length; i++) { const g = diff(list[i - 1].start, list[i].start); if (g >= 18 && g <= 60) gaps.push(g); }
  const lastGaps = gaps.slice(-6);
  const autoLen = lastGaps.length ? Math.round(lastGaps.reduce((a, b) => a + b, 0) / lastGaps.length) : 28;
  const durs = list.filter(r => r.end && r.end >= r.start).map(r => diff(r.start, r.end) + 1).filter(d => d <= 12).slice(-6);
  const autoP = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 5;
  const L = st.cycleLen >= 18 && st.cycleLen <= 60 ? st.cycleLen : autoLen;
  const P = st.periodLen >= 1 && st.periodLen <= 12 ? st.periodLen : autoP;
  const last = list[list.length - 1] || null;
  const regular = lastGaps.length >= 2 ? Math.max(...lastGaps) - Math.min(...lastGaps) <= 7 : null;
  const base = { L, P, auto: { L: !(st.cycleLen >= 18), P: !(st.periodLen >= 1) }, count: list.length, gaps, regular, list, settings: st };
  if (!last) return { ...base, empty: true };

  const day = diff(last.start, today) + 1;                          // jour du cycle (1 = premier jour des règles)
  const open = !last.end && day >= 1 && day <= 10;                   // règles en cours, pas encore terminées
  const periodEnd = last.end || addDays(last.start, P - 1);
  const inPeriod = day >= 1 && (open || today <= periodEnd);
  let next = addDays(last.start, L);
  const late = !inPeriod && today > next ? diff(next, today) : 0;   // jours de retard
  if (late > 14) { while (next < today) next = addDays(next, L); }   // trop ancien : on repart sur des prévisions
  const ovu = addDays(next, -14);
  const fertile = [addDays(ovu, -5), addDays(ovu, 1)];
  let phase;
  if (inPeriod) phase = "regles";
  else if (late && late <= 14) phase = "retard";
  else if (today === ovu) phase = "ovulation";
  else if (today >= fertile[0] && today <= fertile[1]) phase = "fertile";
  else if (today < fertile[0]) phase = "folliculaire";
  else if (diff(today, next) <= 4) phase = "spm";
  else phase = "luteale";
  return { ...base, empty: false, last, day, open, inPeriod, periodEnd, next, late: late <= 14 ? late : 0, ovu, fertile, phase, untilNext: diff(today, next) };
}

// Détail d'un jour : règles (notées ou prévues), jour du cycle et niveau de fertilité estimé (0 à 4).
// Le niveau suit la position du jour par rapport à l'ovulation estimée (14 jours avant les règles suivantes) :
// la fertilité est la plus haute les 2 jours avant l'ovulation et le jour même, puis décroît.
export const CY_LEVELS = ["Très faible", "Faible", "Moyenne", "Élevée", "Très élevée"];
export function cycleDayInfo(m, d, today, addDays, diff) {
  if (!m || m.empty) return null;
  const list = m.list;
  let idx = -1; for (let i = 0; i < list.length; i++) if (list[i].start <= d) idx = i;
  if (idx < 0) return null;
  let cycleStart = list[idx].start, nextStart = list[idx + 1] ? list[idx + 1].start : null, predicted = false;
  if (!nextStart) {
    // Après les dernières règles notées : prévisions, cycle après cycle.
    const base = m.late ? addDays(today, 1) : m.next;
    if (d < base) nextStart = m.late ? null : m.next;
    else { const k = Math.floor(diff(base, d) / m.L); cycleStart = addDays(base, k * m.L); nextStart = addDays(cycleStart, m.L); predicted = true; }
  }
  const r = !predicted ? list[idx] : null;
  let period = false, periodPred = false;
  if (r) {
    const isLastOpen = r === m.last && m.open;
    const end = r.end || (isLastOpen ? today : addDays(r.start, m.P - 1));
    if (d <= end) period = true;
    else if (isLastOpen && d > today && d <= addDays(r.start, m.P - 1)) periodPred = true;
  } else if (d <= addDays(cycleStart, m.P - 1)) periodPred = true;
  const ovu = nextStart ? addDays(nextStart, -14) : null, off = ovu ? diff(ovu, d) : null;
  let level = 0;
  if (!period && !periodPred && off !== null) level = off >= -2 && off <= 0 ? 4 : off >= -4 && off <= -3 ? 3 : off === -5 || off === 1 ? 2 : off === -6 || off === 2 ? 1 : 0;
  const kind = period ? "period" : periodPred ? "period-pred" : off === 0 ? "ovu" : level >= 2 ? "fertile" : "";
  return { kind, level, label: CY_LEVELS[level], cycleDay: diff(cycleStart, d) + 1, predicted: predicted || d > today, ovu, unknown: off === null };
}
export function cycleDayKind(m, d, today, addDays, diff) { const i = cycleDayInfo(m, d, today, addDays, diff); return i ? i.kind : ""; }

const PHASES = {
  regles: { name: "Règles", eva: "Écoute ton corps : repos, chaleur et douceur sont permis.", thib: "Bouillotte, plaid, son plat préféré… les petites attentions comptent." },
  folliculaire: { name: "Phase folliculaire", eva: "L'énergie remonte souvent pendant ces jours-là.", thib: "Souvent une période pleine d'énergie : bon moment pour une sortie à deux." },
  fertile: { name: "Fenêtre fertile", eva: "Période de fertilité estimée.", thib: "Période de fertilité estimée." },
  ovulation: { name: "Ovulation estimée", eva: "Jour d'ovulation estimé.", thib: "Jour d'ovulation estimé." },
  luteale: { name: "Phase lutéale", eva: "L'énergie peut baisser doucement vers la fin du cycle.", thib: "La fatigue peut revenir doucement : un peu plus d'aide à la maison fait plaisir." },
  spm: { name: "Avant les règles", eva: "Les règles approchent : pense à avoir ce qu'il faut sur toi.", thib: "Les règles approchent : patience, câlins et chocolat ne sont jamais de trop." },
  retard: { name: "En retard", eva: "Un retard de quelques jours est fréquent. Tu peux noter le début dès qu'il arrive.", thib: "Les règles ont un peu de retard sur la prévision." }
};

export function initCycle(ctx) {
  const { $, esc, write, db, doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, ui, MEMBRES, today, addDays, parse, cap } = ctx;
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const isEva = () => ctx.getMe() === "eva";
  const FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const FMT_L = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dm = s => FMT.format(parse(s));
  const evaName = MEMBRES.eva.nom;

  const setRef = doc(db, "cycle/eva"), regCol = collection(db, "cycle/eva/regles"), jourRef = d => doc(db, "cycle/eva/jours/" + d);
  let settings = {}, regles = [], jours = {}, ready = false, unsJours = null;
  const UI = { showHist: false, showSettings: false };
  const listeners = [];
  const changed = () => listeners.forEach(f => f());

  function subJours() {
    if (unsJours) { unsJours(); unsJours = null; }
    if (!isEva() && !settings.shareSymptoms) { jours = {}; return; }
    unsJours = onSnapshot(collection(db, "cycle/eva/jours"), s => { jours = {}; s.docs.forEach(d => { jours[d.id] = d.data(); }); changed(); },
      () => { jours = {}; changed(); });
  }
  const uns = [
    onSnapshot(setRef, s => { const before = !!settings.shareSymptoms; settings = s.exists() ? s.data() : {}; if (before !== !!settings.shareSymptoms || !unsJours) subJours(); changed(); },
      err => console.error("cycle", err)),
    onSnapshot(regCol, s => { regles = s.docs.map(d => ({ id: d.id, ...d.data() })); ready = true; changed(); }, err => console.error("cycle", err))
  ];

  const model = () => cycleModel(regles, settings, today(), addDays, diff);
  const st = () => ({ ...CY_DEFAULT, ...settings });

  // ---------- Anneau du cycle ----------
  function ring(m) {
    const L = m.L, R = 84, C = 100, cur = m.empty ? 0 : m.late ? L : ((m.day - 1) % L + L) % L + 1;
    const ovuDay = L - 14 + 1;
    let dots = "";
    for (let i = 1; i <= L; i++) {
      const a = (i - 1) / L * Math.PI * 2 - Math.PI / 2;
      const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
      const k = i <= m.P ? "p" : i === ovuDay ? "o" : i >= ovuDay - 5 && i <= ovuDay + 1 ? "f" : "n";
      dots += `<circle class="cy-d cy-${k}${i === cur ? " cur" : ""}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === cur ? 9 : k === "o" ? 6.5 : 5}"/>`;
    }
    let center;
    if (m.empty) center = `<text x="100" y="96" class="cy-c1">Pas encore</text><text x="100" y="118" class="cy-c1">de données</text>`;
    else center = `<text x="100" y="80" class="cy-c0">Jour</text><text x="100" y="118" class="cy-cbig">${m.day > 0 ? m.day : "–"}</text>
      <text x="100" y="142" class="cy-c0">${m.inPeriod ? "des règles : " + (m.day) : m.late ? "retard : " + m.late + " j" : "règles dans " + Math.max(0, m.untilNext) + " j"}</text>`;
    return `<svg class="cy-ring" viewBox="0 0 200 200" role="img" aria-label="${m.empty ? "Cycle non renseigné" : `Jour ${m.day} du cycle`}">${dots}${center}</svg>`;
  }

  // ---------- Vue de la rubrique ----------
  function render() {
    const m = model(), eva = isEva(), s = st(), t = today();
    if (!ready) return `<div class="empty">Chargement…</div>`;
    const ph = !m.empty ? PHASES[m.phase] : null;
    let h = `<div class="cy-hero${m.inPeriod ? " in-period" : ""}">${ring(m)}
      ${ph ? `<p class="cy-phase">${esc(ph.name)}</p><p class="cy-tip">${esc(eva ? ph.eva : ph.thib)}</p>` : `<p class="cy-tip">${eva ? "Note le premier jour de tes prochaines règles : l'appli calculera la suite." : `${esc(evaName)} n'a encore rien noté.`}</p>`}
      ${eva ? (m.open || (m.inPeriod && !m.last.end)
        ? `<button class="btn cy-main" type="button" data-cy="end">Mes règles sont finies</button>`
        : `<button class="btn cy-main" type="button" data-cy="start">Mes règles ont commencé</button>`) + `<button class="linkbtn" type="button" data-cy="start-other">C'était un autre jour</button>` : ""}
    </div>`;

    if (!m.empty) {
      const strip = Array.from({ length: 14 }, (_, k) => { const d = addDays(t, k), inf = cycleDayInfo(m, d, t, addDays, diff) || { level: 0, kind: "" };
        return `<li class="cy-day lv${inf.level}${inf.kind === "period" || inf.kind === "period-pred" ? " per" + (inf.kind === "period-pred" ? " pred" : "") : ""}${inf.kind === "ovu" ? " ovu" : ""}${k === 0 ? " now" : ""}" title="${esc(dm(d))} : ${inf.kind.startsWith("period") ? "règles" : "fertilité " + CY_LEVELS[inf.level].toLowerCase()}">
          <span class="cy-bar"><i></i></span><b>${k === 0 ? "Auj." : esc(new Intl.DateTimeFormat("fr-FR", { weekday: "narrow" }).format(parse(d)))}</b><small>${parse(d).getDate()}</small></li>`; }).join("");
      const ti = cycleDayInfo(m, t, t, addDays, diff);
      h += `<section class="aisle"><h3 class="aisle-title">Fertilité jour par jour<span>${ti && !ti.kind.startsWith("period") ? "aujourd'hui : " + esc(ti.label.toLowerCase()) : "14 prochains jours"}</span></h3>
        <div class="cy-strip-card"><ul class="cy-strip">${strip}</ul>
        <div class="cy-strip-legend"><span><i class="lg per"></i>Règles</span><span><i class="lg lv1"></i>Faible</span><span><i class="lg lv3"></i>Élevée</span><span><i class="lg lv4"></i>Très élevée</span></div></div></section>`;
      h += `<div class="cy-stats">
        <div><b>${m.inPeriod ? "En cours" : m.late ? "En retard" : esc(dm(m.next))}</b><span>${m.inPeriod ? "règles" : m.late ? `${m.late} j après la date prévue` : "prochaines règles"}</span></div>
        <div><b>${esc(dm(m.fertile[0]))} – ${esc(dm(m.fertile[1]))}</b><span>fenêtre fertile</span></div>
        <div><b>${m.L} j</b><span>cycle${m.auto.L ? (m.gaps.length ? " moyen" : " (par défaut)") : " (réglé)"}</span></div>
        <div><b>${m.P} j</b><span>règles${m.auto.P ? " en moyenne" : " (réglé)"}</span></div></div>`;
    }

    // Ressenti du jour
    const j = jours[t] || {};
    if (eva) {
      const chip = (grp, v, l, on) => `<button type="button" class="chip" aria-pressed="${on}" data-cy="tag" data-g="${grp}" data-v="${esc(v)}">${esc(l)}</button>`;
      h += `<section class="aisle"><h3 class="aisle-title">Aujourd'hui<span>${esc(cap(FMT_L.format(parse(t))))}</span></h3><div class="cy-log">
        ${m.inPeriod ? `<p class="cy-lbl">Flux</p><div class="chips">${CY_FLUX.map(([v, l]) => chip("flux", v, l, j.flux === v)).join("")}</div>` : ""}
        <p class="cy-lbl">Symptômes</p><div class="chips">${CY_SYMPTOMES.map(v => chip("symptomes", v, v, (j.symptomes || []).includes(v))).join("")}</div>
        <p class="cy-lbl">Humeur</p><div class="chips">${CY_HUMEURS.map(v => chip("humeur", v, v, j.humeur === v)).join("")}</div>
        <p class="muted small">${s.shareSymptoms ? `${esc(MEMBRES.thib.nom)} voit ton ressenti du jour.` : `Ton ressenti reste pour toi (modifiable dans les réglages en bas).`}</p></div></section>`;
    } else if (s.shareSymptoms && (j.humeur || (j.symptomes || []).length || j.flux)) {
      h += `<section class="aisle"><h3 class="aisle-title">Comment va ${esc(evaName)} aujourd'hui</h3><div class="cy-log">
        <div class="chips">${j.humeur ? `<span class="chip on">${esc(j.humeur)}</span>` : ""}${(j.symptomes || []).map(v => `<span class="chip">${esc(v)}</span>`).join("")}${j.flux ? `<span class="chip">Flux ${esc((CY_FLUX.find(f => f[0] === j.flux) || [, ""])[1].toLowerCase())}</span>` : ""}</div></div></section>`;
    }

    // Historique
    if (m.count) {
      const rows = m.list.slice().reverse();
      const shown = UI.showHist ? rows : rows.slice(0, 4);
      h += `<section class="aisle"><h3 class="aisle-title">Historique<span>${m.count}</span></h3><ul class="cy-hist">${shown.map(r => {
        const i = m.list.indexOf(r), nextR = m.list[i + 1], len = nextR ? diff(r.start, nextR.start) : null;
        const dur = r.end ? diff(r.start, r.end) + 1 : null;
        return `<li${eva ? ` data-cy="edit" data-id="${esc(r.id)}" role="button" tabindex="0"` : ""}><span class="cy-drop" aria-hidden="true"></span>
          <span class="txt">${esc(dm(r.start))}${r.end ? " – " + esc(dm(r.end)) : r === m.last && m.open ? " · en cours" : ""}<small>${[dur ? `${dur} j de règles` : "", len ? `cycle de ${len} j` : ""].filter(Boolean).join(" · ") || "&nbsp;"}</small></span>
          ${len ? `<span class="cy-len" style="--w:${Math.min(100, Math.round(len / 40 * 100))}%"><i></i></span>` : ""}</li>`; }).join("")}</ul>
        ${rows.length > 4 ? `<button class="linkbtn" type="button" data-cy="hist">${UI.showHist ? "Voir moins" : `Voir tout (${rows.length})`}</button>` : ""}</section>`;
    }

    // Réglages (Eva seulement)
    if (eva) {
      const tg = (k, l, sub) => `<label class="cy-toggle"><span>${esc(l)}${sub ? `<small>${esc(sub)}</small>` : ""}</span><input type="checkbox" data-cy="set" data-k="${k}"${s[k] ? " checked" : ""}></label>`;
      h += `<section class="aisle"><h3 class="aisle-title">Réglages</h3><div class="cy-settings">
        ${tg("showInAgenda", "Afficher dans l'agenda", "Petits repères pour vous deux : règles, fenêtre fertile")}
        ${tg("shareSymptoms", `Partager mon ressenti avec ${MEMBRES.thib.nom}`, "Symptômes et humeur du jour")}
        ${tg("remindEva", "Me prévenir la veille des règles")}
        ${tg("remindThib", `Prévenir ${MEMBRES.thib.nom} la veille des règles`)}
        <button class="linkbtn" type="button" data-cy="lens">Durées : cycle ${s.cycleLen || "auto"} · règles ${s.periodLen || "auto"}</button></div></section>`;
    } else {
      h += `<p class="muted small cy-ro">Seule ${esc(evaName)} peut modifier ces informations.</p>`;
    }
    h += `<p class="hint">Les prévisions sont des estimations basées sur les cycles notés. Ce n'est ni un avis médical, ni une méthode de contraception.</p>`;
    return h;
  }

  // ---------- Actions (Eva) ----------
  function startOn(d) {
    const m = model();
    if (m.list.some(r => r.start === d)) { ui.toast("Déjà noté pour ce jour"); return; }
    // Si des règles précédentes sont restées ouvertes, on les ferme avec la durée moyenne.
    if (m.last && !m.last.end && m.last.start < d) write(updateDoc(doc(db, "cycle/eva/regles/" + m.last.id), { end: addDays(m.last.start, Math.min(m.P, diff(m.last.start, d)) - 1) }));
    write(addDoc(regCol, { start: d, end: "", at: Date.now() }));
    ui.toast("Noté : règles le " + dm(d));
  }
  function editPeriod(r) {
    ui.openEditor({ title: "Modifier ces règles", data: { start: r.start, end: r.end || "" },
      fields: [{ key: "start", label: "Premier jour", type: "date", required: true }, { key: "end", label: "Dernier jour (vide si en cours)", type: "date" }],
      onSave: v => { if (v.end && v.end < v.start) { ui.toast("La fin doit être après le début"); return; } write(updateDoc(doc(db, "cycle/eva/regles/" + r.id), { start: v.start, end: v.end || "" })); },
      extra: [{ label: "Supprimer", danger: true, fn: () => ui.removeWithUndo(doc(db, "cycle/eva/regles/" + r.id), r, "règles du " + dm(r.start)) }] });
  }
  function onClick(e) {
    const b = e.target.closest("[data-cy]"); if (!b || !isEva() && b.dataset.cy !== "hist") return;
    const a = b.dataset.cy, t = today(), m = model();
    if (a === "start") startOn(t);
    else if (a === "start-other") ui.openEditor({ title: "Premier jour des règles", data: { d: t }, fields: [{ key: "d", label: "Date", type: "date", required: true }], onSave: v => { if (v.d > t) { ui.toast("Choisis un jour passé ou aujourd'hui"); return; } startOn(v.d); } });
    else if (a === "end" && m.last) { write(updateDoc(doc(db, "cycle/eva/regles/" + m.last.id), { end: t < m.last.start ? m.last.start : t })); ui.toast("Noté : fin des règles"); }
    else if (a === "edit") { const r = regles.find(x => x.id === b.dataset.id); if (r) editPeriod(r); }
    else if (a === "hist") { UI.showHist = !UI.showHist; changed(); }
    else if (a === "tag") {
      const j = { flux: "", symptomes: [], humeur: "", ...(jours[t] || {}) }, g = b.dataset.g, v = b.dataset.v;
      if (g === "symptomes") j.symptomes = j.symptomes.includes(v) ? j.symptomes.filter(x => x !== v) : [...j.symptomes, v];
      else j[g] = j[g] === v ? "" : v;
      jours[t] = j; changed();
      write(setDoc(jourRef(t), { ...j, at: Date.now() }));
    }
    else if (a === "lens") {
      const s = st();
      ui.openEditor({ title: "Durées", data: { cycleLen: s.cycleLen || "", periodLen: s.periodLen || "" },
        fields: [{ key: "cycleLen", label: "Durée du cycle en jours (vide = calculée)", type: "number", placeholder: String(m.auto.L ? m.L : 28) },
          { key: "periodLen", label: "Durée des règles en jours (vide = calculée)", type: "number", placeholder: String(m.auto.P ? m.P : 5) }],
        onSave: v => write(setDoc(setRef, { cycleLen: Math.round(v.cycleLen) || 0, periodLen: Math.round(v.periodLen) || 0 }, { merge: true })) });
    }
  }
  function onChangeEv(e) {
    const el = e.target.closest('[data-cy="set"]'); if (!el || !isEva()) return;
    write(setDoc(setRef, { [el.dataset.k]: el.checked }, { merge: true }));
  }
  const host = ctx.root;
  host.addEventListener("click", onClick);
  host.addEventListener("change", onChangeEv);
  host.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches('[data-cy="edit"]')) onClick(e); });

  return {
    render, model,
    onChange: f => listeners.push(f),
    summary() { const m = model(); if (!ready) return "Suivi du cycle";
      if (m.empty) return isEva() ? "Note tes règles" : "Rien de noté pour l'instant";
      return m.inPeriod ? `Règles · jour ${m.day}` : m.late ? `Retard de ${m.late} j` : `Règles ${m.untilNext <= 1 ? (m.untilNext === 1 ? "demain" : "aujourd'hui") : "dans " + m.untilNext + " j"}`; },
    // Repère pour l'agenda (vide si Eva ne veut pas l'afficher).
    dayKind(d) { if (!st().showInAgenda) return ""; return cycleDayKind(model(), d, today(), addDays, diff); },
    dayLevel(d) { if (!st().showInAgenda) return 0; const i = cycleDayInfo(model(), d, today(), addDays, diff); return i ? i.level : 0; },
    // Ligne détaillée affichée sous le calendrier pour le jour sélectionné.
    dayDetail(d) {
      if (!st().showInAgenda) return ""; const m = model(), i = cycleDayInfo(m, d, today(), addDays, diff); if (!i) return "";
      const who = isEva() ? "" : `${esc(evaName)} · `;
      const what = i.kind === "period" ? "Règles" : i.kind === "period-pred" ? "Règles prévues" : i.unknown ? "Fertilité inconnue (retard)" : `Fertilité ${esc(i.label.toLowerCase())}${i.kind === "ovu" ? " · ovulation estimée" : ""}`;
      const bars = i.kind.startsWith("period") ? "" : `<span class="cy-meter lv${i.level}" aria-hidden="true">${"<i></i>".repeat(4)}</span>`;
      return `<button type="button" class="cy-daydetail${i.kind.startsWith("period") ? " per" : ""}" data-go="plus:cycle"><span class="cy-drop" aria-hidden="true"></span>
        <span class="txt">${who}${what}<small>Jour ${i.cycleDay} du cycle${i.predicted ? " · estimation" : ""}</small></span>${bars}</button>`;
    },
    agendaOn: () => !!st().showInAgenda && !model().empty,
    // Petite carte de l'écran Aujourd'hui (seulement autour des règles).
    todayLine() { const m = model(); if (m.empty || !st().showInAgenda) return "";
      if (m.inPeriod) return isEva() ? `Règles · jour ${m.day}` : `${evaName} a ses règles · jour ${m.day}`;
      if (m.late) return isEva() ? `Règles en retard de ${m.late} j` : "";
      if (m.untilNext <= 2) return `Règles prévues ${m.untilNext === 0 ? "aujourd'hui" : m.untilNext === 1 ? "demain" : "dans 2 jours"}`;
      return ""; },
    stop() { uns.forEach(u => u()); if (unsJours) unsJours(); host.removeEventListener("click", onClick); host.removeEventListener("change", onChangeEv); }
  };
}
