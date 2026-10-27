// Les mimichats — calcul des dates d'un événement (répétitions, plusieurs jours).
// Dates au format "AAAA-MM-JJ". Le même calcul est recopié dans functions/index.js pour les rappels.

const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => new Date(s + "T12:00:00");
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export const EV_RECUR = { none: "", weekly: "Chaque semaine", biweekly: "Toutes les 2 semaines", monthly: "Chaque mois", yearly: "Chaque année" };
export const EV_REMIND = { none: "", veille: "Rappel la veille", matin: "Rappel le matin", "1h": "Rappel 1 h avant" };

// Durée en jours en plus du premier (0 = un seul jour).
export const spanOf = e => e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;

function nth(e, n) {
  const r = e.recur;
  if (r === "weekly") return addDays(e.date, 7 * n);
  if (r === "biweekly") return addDays(e.date, 14 * n);
  if (r === "monthly") return addMonths(e.date, n);
  if (r === "yearly") return addMonths(e.date, 12 * n);
  return n === 0 ? e.date : null;
}

// Débuts des occurrences qui touchent la période [from, to].
export function occurrences(e, from, to) {
  if (!e || !e.date) return [];
  const span = spanOf(e), ex = new Set(e.exdates || []), out = [];
  if (!e.recur || e.recur === "none") return e.date <= to && addDays(e.date, span) >= from ? [e.date] : [];
  // On saute directement près de la période pour les répétitions anciennes.
  let n = 0;
  const step = { weekly: 7, biweekly: 14, monthly: 30, yearly: 365 }[e.recur] || 7;
  const gap = diffDays(e.date, from) - span;
  if (gap > step * 2) n = Math.max(0, Math.floor(gap / step) - 2);
  for (let guard = 0; guard < 600; guard++, n++) {
    const s = nth(e, n); if (!s || s > to) break;
    if (e.until && s > e.until) break;
    if (addDays(s, span) >= from && !ex.has(s)) out.push(s);
  }
  return out;
}

// Événements présents un jour donné : [{ e, start, dayIndex (1 = premier jour), days }].
export function eventsOn(events, day) {
  const res = [];
  for (const e of events) for (const s of occurrences(e, day, day)) {
    const days = spanOf(e) + 1;
    res.push({ e, start: s, dayIndex: diffDays(s, day) + 1, days });
  }
  return res.sort((a, b) => (a.dayIndex > 1 ? "00" : (a.e.time || "99")).localeCompare(b.dayIndex > 1 ? "00" : (b.e.time || "99")));
}
