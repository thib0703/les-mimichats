// Les mimichats — activation des notifications sur cet appareil.
import { getMessaging, getToken, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { VAPID_KEY } from "./firebase-config.js";

export async function initNotif({ $, fb, db, doc, setDoc, getMe, toast }) {
  const st = $("notifState"), btn = $("notifBtn");
  const say = t => { st.textContent = t; };
  btn.hidden = true;

  if (!VAPID_KEY || VAPID_KEY.includes("A_REMPLIR")) { say("Pas encore configurées (étape 9 du guide)."); return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let ok = false; try { ok = await isSupported(); } catch (e) {}
  if (!ok || !("Notification" in window) || !("serviceWorker" in navigator)) {
    say(ios && !standalone
      ? "Sur iPhone : ajoute d'abord l'appli à l'écran d'accueil, puis ouvre-la depuis son icône."
      : "Ce navigateur ne gère pas les notifications.");
    return;
  }

  async function register() {
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(fb), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) throw new Error("no-token");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const id = [...new Uint8Array(buf)].slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join("");
    await setDoc(doc(db, "foyer/main/appareils/" + id), { who: getMe(), token, at: Date.now() });
  }

  if (Notification.permission === "granted") {
    say("Activées sur cet appareil.");
    register().catch(err => { console.error(err); say("Activées, mais l'inscription a échoué. Réessaie plus tard."); });
    return;
  }
  if (Notification.permission === "denied") { say("Refusées. Autorise-les dans les réglages du téléphone, pour l'appli Mimichats."); return; }

  say("Recevez une alerte quand l'autre ajoute une course, un événement, une tâche ou un mot doux.");
  btn.hidden = false;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const p = await Notification.requestPermission();
      if (p !== "granted") { say("Notifications refusées sur cet appareil."); btn.hidden = true; return; }
      await register();
      btn.hidden = true; say("Activées sur cet appareil."); toast("Notifications activées");
    } catch (err) { console.error(err); say("L'activation a échoué. Vérifie ta connexion et réessaie."); }
    finally { btn.disabled = false; }
  };
}
