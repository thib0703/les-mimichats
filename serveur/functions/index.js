// Les mimichats — envoi des notifications (tourne sur les serveurs Firebase).
// Prévient l'autre personne quand quelque chose est ajouté, et rappelle les factures la veille.
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const NOMS = { thib: "Thib", eva: "Eva", deux: "vous deux" };
const REGION = "europe-west9"; // même région que la base Firestore (Paris)

const fmtDay = s => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" })
  .format(new Date(s + "T12:00:00Z"));
const euros = c => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format((c || 0) / 100);

// Envoie à tous les appareils inscrits, sauf ceux de `exclude` (l'auteur).
async function sendTo(exclude, message) {
  const snap = await db.collection("foyer/main/appareils").get();
  const devices = snap.docs.filter(d => d.get("who") !== exclude && d.get("token"));
  if (!devices.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens: devices.map(d => d.get("token")),
    data: { title: message.title, body: message.body || "", url: "./", tag: message.tag || "" },
    webpush: { headers: { Urgency: "high", TTL: "86400" } }
  });
  // Nettoie les appareils qui ne répondent plus (appli supprimée, autorisation retirée).
  await Promise.all(res.responses.map((r, i) => {
    const code = r.error && r.error.code;
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument") return devices[i].ref.delete();
    return null;
  }));
}

// Pour les courses, on regroupe : une seule alerte par personne toutes les 3 minutes.
async function throttled(key, ms) {
  const ref = db.doc("foyer/main/meta/notif");
  return db.runTransaction(async t => {
    const doc = await t.get(ref);
    const last = (doc.exists && doc.get(key)) || 0;
    if (Date.now() - last < ms) return true;
    t.set(ref, { [key]: Date.now() }, { merge: true });
    return false;
  });
}

exports.nouveaute = onDocumentCreated({ document: "foyer/main/{liste}/{id}", region: REGION }, async event => {
  const liste = event.params.liste;
  const d = event.data ? event.data.data() : null;
  if (!d) return;
  const by = d.by || d.from || d.paidBy;
  const nom = NOMS[by] || "Quelqu'un";

  if (liste === "courses") {
    if (await throttled("courses_" + by, 3 * 60 * 1000)) return;
    return sendTo(by, { title: "Courses", body: `${nom} a ajouté ${d.name} à la liste`, tag: "courses" });
  }
  if (liste === "events") {
    return sendTo(by, { title: "Nouvel événement", body: `${d.title} · ${fmtDay(d.date)}${d.time ? " à " + d.time : ""}`, tag: "agenda" });
  }
  if (liste === "taches") {
    const pour = d.who === "deux" ? "pour vous deux" : "pour " + (NOMS[d.who] || "?");
    return sendTo(by, { title: "Nouvelle tâche", body: `${d.title} (${pour})`, tag: "taches" });
  }
  if (liste === "mots") {
    return sendTo(by, { title: `${nom} t'a laissé un mot`, body: d.text, tag: "mots" });
  }
  if (liste === "depenses") {
    return sendTo(by, { title: "Nouvelle dépense", body: `${nom} : ${d.title} (${euros(d.amount)})`, tag: "depenses" });
  }
});

// ---------- Quelqu'un coche les courses ----------
// Premier article coché (après 30 min sans rien cocher) : « Thib est aux courses », pour que l'autre ajoute ce qui manque.
// Ensuite, plus rien… jusqu'au dernier article : « Courses terminées ». Pas une notif par article.
exports.coursesCochees = onDocumentUpdated({ document: "foyer/main/courses/{id}", region: REGION }, async event => {
  const before = event.data.before.data() || {}, after = event.data.after.data() || {};
  if (before.done || !after.done) return;
  const by = after.doneBy;
  if (by !== "thib" && by !== "eva") return;
  const nom = NOMS[by];
  const ref = db.doc("foyer/main/meta/notif");
  const debut = await db.runTransaction(async t => {
    const doc = await t.get(ref);
    const last = (doc.exists && doc.get("coche_" + by)) || 0;
    t.set(ref, { ["coche_" + by]: Date.now() }, { merge: true });
    return Date.now() - last > 30 * 60 * 1000;
  });
  const reste = await db.collection("foyer/main/courses").where("done", "==", false).get();
  if (reste.empty) {
    return sendTo(by, { title: "Courses terminées ✓", body: `${nom} a tout pris, la liste est vide.`, tag: "panier" });
  }
  if (debut) {
    const n = reste.size;
    return sendTo(by, { title: `${nom} est aux courses 🛒`,
      body: `${after.name} est dans le panier, encore ${n} article${n > 1 ? "s" : ""}. Ajoute vite ce qui manque !`, tag: "panier" });
  }
});

// ---------- Widget de l'écran d'accueil (appli Scriptable) ----------
// Renvoie le dernier mot doux, les courses et les prochains événements. Protégé par une clé
// propre à chacun, créée dans les réglages de l'appli et rangée dans foyer/main/meta/widget.
exports.widget = onRequest({ region: REGION }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const who = String(req.query.who || ""), k = String(req.query.k || "");
  if ((who !== "thib" && who !== "eva") || k.length < 20) return res.status(400).json({ error: "Lien incomplet" });
  const keys = await db.doc("foyer/main/meta/widget").get();
  if (!keys.exists || keys.get(who) !== k) return res.status(403).json({ error: "Clé refusée : recrée le widget dans les réglages" });
  const other = who === "thib" ? "eva" : "thib";
  const nowL0 = parisLocal(new Date()), day0 = nowL0.slice(0, 10);

  // Cocher (ou décocher pour annuler) depuis le widget : ?action=check|uncheck&type=courses|taches&id=…
  const action = String(req.query.action || "");
  if (action === "check" || action === "uncheck") {
    const type = String(req.query.type || ""), id = String(req.query.id || "");
    if ((type !== "courses" && type !== "taches") || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return res.status(400).json({ error: "Élément inconnu" });
    const ref = db.doc(`foyer/main/${type}/${id}`);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Déjà retiré de la liste" });
    const x = snap.data(), name = x.name || x.title || "";
    if (type === "courses") {
      if (action === "check") {
        if (x.done) return res.json({ ok: true, name, already: true });
        const aid = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await db.doc("foyer/main/achats/" + aid).set({ name, cat: x.cat || "Autre", qty: x.qty || "", by: who, at: Date.now(), day: day0 });
        await ref.update({ done: true, doneBy: who, rangement: null, achatId: aid });
      } else {
        if (x.achatId) await db.doc("foyer/main/achats/" + x.achatId).delete();
        await ref.update({ done: false, rangement: null, achatId: null });
      }
      return res.json({ ok: true, name });
    }
    // Tâche : une tâche qui revient passe à sa prochaine date, comme dans l'appli.
    const recur = x.recur && x.recur !== "none";
    if (action === "check") {
      if (x.done) return res.json({ ok: true, name, already: true });
      if (recur) {
        const prevDue = x.due || "";
        await ref.update({ due: nextDue(prevDue, x.recur, day0), lastDoneBy: who, lastDoneAt: Date.now() });
        return res.json({ ok: true, name, prevDue });
      }
      await ref.update({ done: true, lastDoneBy: who, lastDoneAt: Date.now() });
      return res.json({ ok: true, name });
    }
    const prev = String(req.query.prevDue || "");
    if (recur && /^\d{4}-\d{2}-\d{2}$/.test(prev)) await ref.update({ due: prev });
    else await ref.update({ done: false });
    return res.json({ ok: true, name });
  }

  const [cs, ms, es, ts] = await Promise.all([
    db.collection("foyer/main/courses").where("done", "==", false).get(),
    db.collection("foyer/main/mots").where("from", "==", other).get(),
    db.collection("foyer/main/events").get(),
    db.collection("foyer/main/taches").where("done", "==", false).get()
  ]);
  const items = cs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.at || 0) - (b.at || 0)).map(c => ({ id: c.id, name: c.name }));
  const courses = items.map(c => c.name);
  const mots = ms.docs.map(d => d.data()).sort((a, b) => (b.at || 0) - (a.at || 0));
  const mot = mots.find(m => m.pinned) || mots[0] || null;

  const nowL = parisLocal(new Date()), day = nowL.slice(0, 10), hm = nowL.slice(11);
  const evs = [];
  for (const doc of es.docs) {
    const e = doc.data();
    if (e.who && e.who !== "deux" && e.who !== who) continue;
    for (const s of startsBetween(e, day, addDays(day, 14))) {
      if (s === day && e.time && e.time < hm) continue;
      evs.push({ title: e.title || "", date: s, time: e.time || "", who: e.who || "deux" });
    }
  }
  evs.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const quand = s => s === day ? "Aujourd'hui" : s === addDays(day, 1) ? "Demain"
    : new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", timeZone: "Europe/Paris" }).format(new Date(s + "T12:00:00Z"));

  // Tâches à faire de la personne (et celles « pour vous deux ») : en retard et aujourd'hui d'abord.
  const taches = ts.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.who === who || x.who === "deux" || !x.who)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (b.at || 0) - (a.at || 0))
    .map(x => ({ id: x.id, who: x.who || "deux", title: x.title || "", late: !!(x.due && x.due < day), today: x.due === day,
      when: !x.due ? "" : x.due < day ? "En retard" : quand(x.due) }));

  res.json({
    other: NOMS[other],
    mot: mot ? { text: mot.text || "", at: mot.at || 0, pinned: !!mot.pinned } : null,
    mots: mots.slice(0, 4).map(m => ({ text: m.text || "", at: m.at || 0, pinned: !!m.pinned })), from: other,
    courses: { n: courses.length, names: courses.slice(0, 30), items: items.slice(0, 30) },
    taches: { n: taches.length, urgent: taches.filter(x => x.late || x.today).length, list: taches.slice(0, 14) },
    events: evs.slice(0, 10).map(e => ({ title: e.title, who: e.who, today: e.date === day, time: e.time ? e.time.replace(":", "h") : "",
      when: quand(e.date) + (e.time ? " " + e.time.replace(":", "h") : "") })),
    today: { weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "Europe/Paris" }).format(new Date()),
      day: Number(day.slice(8, 10)), month: new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "Europe/Paris" }).format(new Date()) },
    me: who
  });
});

// ---------- Rappels d'événements ----------
// Même calcul des répétitions que dans l'appli (occurrences.js).
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseD = s => new Date(s + "T12:00:00");
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parseD(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d); };
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5);
const spanOf = e => e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;
function nth(e, n) {
  if (e.recur === "daily") return addDays(e.date, n);
  if (e.recur === "weekly") return addDays(e.date, 7 * n);
  if (e.recur === "biweekly") return addDays(e.date, 14 * n);
  if (e.recur === "monthly") return addMonths(e.date, n);
  if (e.recur === "yearly") return addMonths(e.date, 12 * n);
  return n === 0 ? e.date : null;
}
function startsBetween(e, from, to) {
  if (!e.date) return [];
  if (!e.recur || e.recur === "none") return e.date >= from && e.date <= to ? [e.date] : [];
  const ex = new Set(e.exdates || []), out = [];
  const step = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, yearly: 365 }[e.recur] || 7;
  let n = Math.max(0, Math.floor(diffDays(e.date, from) / step) - 2);
  for (let g = 0; g < 600; g++, n++) { const s = nth(e, n); if (!s || s > to) break; if (s >= from && !ex.has(s)) out.push(s); }
  return out;
}
// Heure locale de Paris au format "AAAA-MM-JJTHH:MM".
const parisLocal = d => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(" ", "T");

exports.rappelsEvenements = onSchedule({ schedule: "every 15 minutes", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
  const now = new Date(), nowL = parisLocal(now), fromL = parisLocal(new Date(now.getTime() - 16 * 60 * 1000));
  const day = nowL.slice(0, 10);
  const snap = await db.collection("foyer/main/events").where("remind", "in", ["veille", "matin", "1h"]).get();
  const metaRef = db.doc("foyer/main/meta/rappels");
  const meta = await metaRef.get();
  const sent = (meta.exists && meta.get("sent")) || {};
  const updates = {};
  for (const doc of snap.docs) {
    const e = doc.data();
    for (const s of startsBetween(e, day, addDays(day, 2))) {
      let at, body;
      if (e.remind === "veille") { at = addDays(s, -1) + "T20:00"; body = "Demain" + (e.time ? " à " + e.time : ""); }
      else if (e.remind === "matin") { at = s + "T08:00"; body = "Aujourd'hui" + (e.time ? " à " + e.time : ""); }
      else if (e.time) {
        const [h, m] = e.time.split(":").map(Number); let t = h * 60 + m - 60, d0 = s;
        if (t < 0) { t += 1440; d0 = addDays(s, -1); }
        at = d0 + "T" + pad(Math.floor(t / 60)) + ":" + pad(t % 60); body = "Dans 1 heure, à " + e.time;
      } else { at = s + "T08:00"; body = "Aujourd'hui"; }
      const key = doc.id + "_" + s + "_" + e.remind;
      if (at > fromL && at <= nowL && !sent[key]) {
        const days = spanOf(e);
        if (days) body += ` (jusqu'au ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(parseD(addDays(s, days)))})`;
        await sendToWho(e.who, { title: "Rappel : " + e.title, body, tag: "rappel-" + key });
        updates[key] = Date.now();
      }
    }
  }
  // Tâches avec rappel : le jour même ou la veille, à l'heure choisie, pour la personne qui s'en occupe.
  const tsnap = await db.collection("foyer/main/taches").where("remind", "in", ["jour", "veille"]).get();
  for (const doc of tsnap.docs) {
    const x = doc.data();
    if (!x.due || (x.done && (!x.recur || x.recur === "none"))) continue;
    const hm = /^\d{2}:\d{2}$/.test(x.remindTime || "") ? x.remindTime : "20:00";
    for (const s of startsBetween({ date: x.due, recur: x.recur }, day, addDays(day, 2))) {
      const at = (x.remind === "veille" ? addDays(s, -1) : s) + "T" + hm;
      const key = "t_" + doc.id + "_" + s;
      if (at > fromL && at <= nowL && !sent[key] && !updates[key]) {
        await sendToWho(x.who, { title: "À faire : " + x.title, body: x.remind === "veille" ? "C'est pour demain" : "C'est pour aujourd'hui", tag: "tache-" + key });
        updates[key] = Date.now();
      }
    }
  }
  // Mots doux épinglés : renvoyés chaque jour à l'heure choisie, jusqu'à ce qu'on les désépingle.
  const psnap = await db.collection("foyer/main/mots").where("pinned", "==", true).get();
  for (const doc of psnap.docs) {
    const m = doc.data();
    if (!/^\d{2}:\d{2}$/.test(m.pinTime || "")) continue;
    const at = day + "T" + m.pinTime, key = "p_" + doc.id + "_" + day;
    if (at > fromL && at <= nowL && !sent[key] && !updates[key]) {
      await sendTo(m.from, { title: `Mot épinglé de ${NOMS[m.from] || "l'autre"}`, body: m.text, tag: "pin-" + doc.id });
      updates[key] = Date.now();
    }
  }
  // Garde seulement les 4 derniers jours d'historique.
  const keep = {}; const limit = Date.now() - 4 * 864e5;
  for (const [k, v] of Object.entries({ ...sent, ...updates })) if (v > limit) keep[k] = v;
  if (Object.keys(updates).length || Object.keys(keep).length !== Object.keys(sent).length) await metaRef.set({ sent: keep });
});

// Prochaine échéance d'une tâche qui revient (même calcul que dans l'appli).
function nextDue(due, recur, today) {
  let d = due || today;
  do { d = recur === "daily" ? addDays(d, 1) : recur === "weekly" ? addDays(d, 7) : recur === "biweekly" ? addDays(d, 14) : addMonths(d, 1); } while (d <= today);
  return d;
}

// Pour un événement de Thib ou d'Eva, seul son téléphone sonne ; « Les deux » : tout le monde.
async function sendToWho(who, message) {
  if (who === "thib" || who === "eva") return sendTo(who === "thib" ? "eva" : "thib", message);
  return sendTo(null, message);
}

// Tous les jours à 9 h : rappel des factures qui tombent demain.
exports.rappelFactures = onSchedule({ schedule: "0 9 * * *", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  now.setDate(now.getDate() + 1);
  const demain = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  const snap = await db.collection("foyer/main/factures").where("next", "==", demain).get();
  if (snap.empty) return;
  const noms = snap.docs.map(f => `${f.get("name")} (${euros(f.get("amount"))})`).join(", ");
  return sendTo(null, { title: "Facture demain", body: noms, tag: "factures" });
});


// Tous les jours à 9 h : « les règles devraient arriver demain » (selon les réglages d'Eva).
exports.rappelCycle = onSchedule({ schedule: "0 9 * * *", timeZone: "Europe/Paris", region: "europe-west1" }, async () => {
  const set = (await db.doc("cycle/eva").get()).data() || {};
  const remindEva = set.remindEva !== false, remindThib = set.remindThib === true;
  if (!remindEva && !remindThib) return;
  const snap = await db.collection("cycle/eva/regles").get();
  const list = snap.docs.map(d => d.data()).filter(r => r.start).sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) return;
  const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const gaps = [];
  for (let i = 1; i < list.length; i++) { const g = day(list[i].start) - day(list[i - 1].start); if (g >= 18 && g <= 60) gaps.push(g); }
  const last6 = gaps.slice(-6);
  const L = set.cycleLen >= 18 && set.cycleLen <= 60 ? set.cycleLen : last6.length ? Math.round(last6.reduce((a, b) => a + b, 0) / last6.length) : 28;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
  const last = list[list.length - 1];
  if (today - day(last.start) < 10 && !last.end) return; // règles en cours
  if (day(last.start) + L - today !== 1) return;          // pas demain
  // Texte discret : il peut s'afficher sur l'écran verrouillé.
  if (remindEva) await sendTo("thib", { title: "Petit rappel", body: "Ton cycle recommence sûrement demain.", tag: "cycle" });
  if (remindThib) await sendTo("eva", { title: "Petit rappel", body: "Le cycle d'Eva recommence sûrement demain.", tag: "cycle" });
});
