// Les mimichats — éléments d'interface partagés : message du bas avec « Annuler », fiche de modification.

export function createUI({ $, esc, write, setDoc, deleteDoc, MEMBRES }) {
  // ---------- Message du bas (avec action facultative) ----------
  let timer = null, action = null;
  const box = $("toast"), msg = $("toastMsg"), btn = $("toastAct");
  function toast(text, act, ms) {
    msg.textContent = text; action = act || null;
    btn.hidden = !act; if (act) btn.textContent = act.label;
    box.hidden = false;
    clearTimeout(timer); timer = setTimeout(() => { box.hidden = true; action = null; }, ms || (act ? 6000 : 2600));
  }
  btn.addEventListener("click", () => { const a = action; box.hidden = true; action = null; clearTimeout(timer); if (a) a.fn(); });

  // ---------- Supprimer avec possibilité d'annuler ----------
  const clean = item => { const d = { ...item }; delete d.id; return d; };
  function removeWithUndo(docRef, item, label) {
    const data = clean(item);
    write(deleteDoc(docRef));
    toast(`Supprimé : ${label || "élément"}`, { label: "Annuler", fn: () => write(setDoc(docRef, data)) });
  }
  function removeManyWithUndo(list, label) { // list: [{ ref, item }]
    const saved = list.map(({ ref, item }) => ({ ref, data: clean(item) }));
    saved.forEach(s => write(deleteDoc(s.ref)));
    toast(label, { label: "Annuler", fn: () => saved.forEach(s => write(setDoc(s.ref, s.data))) });
  }

  // ---------- Fiche de modification ----------
  // fields : [{ key, label, type: text|textarea|number|cents|euros|date|time|select|who|who2|checkbox, options: [[valeur, libellé]], placeholder }]
  const sheet = $("editSheet"), bg = $("editSheetBg");
  let current = null;
  const whoOpts = withDeux => (withDeux ? [["deux", "Les deux"]] : []).concat([["thib", MEMBRES.thib.nom], ["eva", MEMBRES.eva.nom]]);
  function fieldHtml(f, v, i) {
    const id = "ed" + i, lab = `<span>${esc(f.label)}</span>`;
    if (f.type === "checkbox") return `<label class="checkline" for="${id}"><input type="checkbox" id="${id}"${v ? " checked" : ""}> ${esc(f.label)}</label>`;
    if (f.type === "textarea") return `<label class="field" for="${id}">${lab}<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}">${esc(v || "")}</textarea></label>`;
    if (f.type === "select" || f.type === "who" || f.type === "who2") {
      const o = f.type === "who" ? whoOpts(true) : f.type === "who2" ? whoOpts(false) : f.options;
      return `<label class="field" for="${id}">${lab}<select id="${id}">${o.map(([val, l]) => `<option value="${esc(val)}"${String(val) === String(v ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
    }
    const type = f.type === "cents" || f.type === "euros" ? "text" : f.type;
    const val = f.type === "cents" ? (v ? String(v / 100).replace(".", ",") : "") : (v ?? "");
    const extra = f.type === "cents" || f.type === "euros" || f.type === "number" ? ' inputmode="decimal"' : "";
    const list = f.list ? ` list="${esc(f.list)}"` : "";
    return `<label class="field" for="${id}">${lab}<input type="${type}" id="${id}" value="${esc(val)}"${extra}${list} placeholder="${esc(f.placeholder || "")}"></label>`;
  }
  function readField(f, i) {
    const el = document.getElementById("ed" + i); if (!el) return undefined;
    if (f.type === "checkbox") return el.checked;
    const v = el.value.trim();
    if (f.type === "cents") { const n = parseFloat(v.replace(",", ".").replace(/\s/g, "")); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; }
    if (f.type === "euros") { const n = parseFloat(v.replace(",", ".").replace(/\s/g, "")); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
    if (f.type === "number") { const n = parseFloat(v.replace(",", ".")); return isFinite(n) ? n : 0; }
    return v;
  }
  function openEditor(cfg) {
    current = cfg;
    sheet.innerHTML = `<h2>${esc(cfg.title || "Modifier")}</h2>
      <form id="editForm" class="stack-s" autocomplete="off">
        ${cfg.fields.map((f, i) => fieldHtml(f, cfg.data[f.key], i)).join("")}
        <p class="error" id="editErr" hidden></p>
        ${cfg.fields.length ? `<div class="add-row wrap-row"><button class="btn" type="submit">Enregistrer</button><button class="linkbtn" type="button" data-ed="close">Annuler</button></div>` : ""}
        ${(cfg.extra || []).map((x, i) => `<button class="linkbtn${x.danger ? " danger" : ""}" type="button" data-ed="extra" data-i="${i}">${esc(x.label)}</button>`).join("")}
        ${cfg.fields.length ? "" : `<button class="linkbtn" type="button" data-ed="close">Annuler</button>`}
      </form>`;
    sheet.hidden = false; bg.hidden = false;
    const first = sheet.querySelector("input,textarea,select"); if (first && !matchMedia("(pointer: coarse)").matches) first.focus();
  }
  function closeEditor() { sheet.hidden = true; bg.hidden = true; current = null; }
  bg.addEventListener("click", closeEditor);
  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-ed]"); if (!b || !current) return;
    if (b.dataset.ed === "close") closeEditor();
    else if (b.dataset.ed === "extra") {
      const values = {}; current.fields.forEach((f, i) => { values[f.key] = readField(f, i); });
      const x = current.extra[+b.dataset.i]; closeEditor(); x.fn(values);
    }
  });
  sheet.addEventListener("submit", e => {
    e.preventDefault(); if (!current) return;
    const values = {}; current.fields.forEach((f, i) => { values[f.key] = readField(f, i); });
    const req = current.fields.find(f => f.required && !values[f.key]);
    if (req) { const er = $("editErr"); er.textContent = `Indique ${req.label.toLowerCase()}.`; er.hidden = false; return; }
    const cb = current.onSave; closeEditor(); cb(values);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && current) closeEditor(); });

  return { toast, removeWithUndo, removeManyWithUndo, openEditor, closeEditor };
}
