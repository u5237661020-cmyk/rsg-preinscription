// ═══════════════════════════════════════════════════════════════════
// API serveur — RSG Préinscription (hébergement o2switch, PHP + MySQL)
// ═══════════════════════════════════════════════════════════════════
// Ce fichier centralise tous les échanges avec le serveur (dossier api/).
// Il remplace l'ancien firebase.js : les noms de fonctions (fb…) sont
// conservés pour ne rien changer dans le reste de l'application.
//
// Adresse de l'API : par défaut <site>/api/index.php. Pour la changer,
// définir VITE_API_URL au moment du build.
// ═══════════════════════════════════════════════════════════════════

const API_URL = (import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL || "/"}api/index.php`).trim();
const TOKEN_KEY = "rsg_admin_token";
const POLL_INTERVAL_MS = 4000;

// ── Session bureau ───────────────────────────────────────────────────

const readToken = () => {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
};
const writeToken = (token) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* stockage indisponible */ }
};

const authListeners = new Set();
const adminUser = () => ({
  uid: "rsg-admin",
  getIdTokenResult: async () => ({ claims: { admin: true, role: "bureau", club: "rsg" } }),
});
const notifyAuth = (user) => authListeners.forEach((cb) => { try { cb(user); } catch (e) { console.error(e); } });

const hasAdminSession = () => !!readToken();

// ── Appel générique ──────────────────────────────────────────────────

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "ApiError";
    this.code = `functions/${code}`;
    this.status = status;
  }
}

async function call(action, payload = {}, { auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = auth ? readToken() : "";
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch (err) {
    throw new ApiError("unavailable", "Serveur injoignable. Vérifiez votre connexion internet.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || data?.error) {
    const code = data?.error?.code || (res.status === 413 ? "invalid-argument" : "internal");
    const message = data?.error?.message || (res.status === 413 ? "Données trop volumineuses pour le serveur." : `Erreur serveur (${res.status}).`);
    if (token && code === "permission-denied" && /session/i.test(message)) {
      writeToken("");
      notifyAuth(null);
    }
    throw new ApiError(code, message, res.status);
  }
  return data;
}

const withoutUndefined = (value) => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)])
    );
  }
  return value;
};

// ═══════════════════════════════════════════════════════════════════
// Préinscriptions par saison
// ═══════════════════════════════════════════════════════════════════

/** Sauvegarde une préinscription (création publique, ou modification par le bureau). */
export async function fbSaveInscription(saison, entry) {
  if (!entry?.id) throw new Error("Préinscription sans id");
  await call("saveInscription", { saison, entry: withoutUndefined(entry) });
  kickWatchers(saison);
}

/** Récupère toutes les préinscriptions d'une saison (session bureau requise). */
export async function fbGetAllInscriptions(saison) {
  const result = await call("getAllInscriptions", { saison });
  return Array.isArray(result?.items) ? result.items : [];
}

export async function fbDeleteInscription(saison, id) {
  await call("adminDeleteInscription", { saison, id });
  kickWatchers(saison);
}

// ── Suivi « temps réel » : interrogation légère du serveur ───────────
// Le serveur renvoie une empreinte (version) ; la liste complète n'est
// rechargée que lorsqu'elle a changé.

const watchers = new Set();

function kickWatchers(saison) {
  watchers.forEach((w) => { if (!saison || w.saison === saison) w.poll(true); });
}

export function fbWatchInscriptions(saison, onUpdate, onError) {
  let stopped = false;
  let version = null;
  let timer = null;
  let running = false;
  let pending = false;
  let inError = false;

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => poll(false), POLL_INTERVAL_MS);
  };

  const poll = async (force) => {
    if (stopped) return;
    if (running) { pending = pending || force; return; }
    running = true;
    try {
      let changed = force || version === null || inError;
      if (!changed) {
        const v = await call("inscriptionsVersion", { saison });
        changed = v?.version !== version;
      }
      if (changed && !stopped) {
        const result = await call("getAllInscriptions", { saison });
        version = result?.version ?? null;
        if (!stopped) onUpdate(Array.isArray(result?.items) ? result.items : []);
      }
      inError = false;
    } catch (err) {
      console.error("Suivi des préinscriptions :", err);
      if (!inError && onError) onError(err);
      inError = true;
    } finally {
      running = false;
      if (pending && !stopped) { pending = false; poll(true); } else schedule();
    }
  };

  const watcher = { saison, poll };
  watchers.add(watcher);
  const onVisible = () => { if (document.visibilityState === "visible") poll(false); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  poll(true);

  return () => {
    stopped = true;
    clearTimeout(timer);
    watchers.delete(watcher);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  };
}

// ═══════════════════════════════════════════════════════════════════
// Tarifs, base licenciés, configuration
// ═══════════════════════════════════════════════════════════════════

export async function fbSaveTarifs(saison, tarifs) {
  await call("adminSaveTarifs", { saison, tarifs: withoutUndefined(tarifs) });
}

export async function fbGetTarifs(saison) {
  if (!hasAdminSession()) {
    const cfg = await fbGetPublicConfig(saison);
    return cfg?.tarifs || null;
  }
  return await call("getTarifs", { saison });
}

export async function fbSaveLicencies(saison, licencies) {
  await call("adminSaveLicencies", { saison, licencies: withoutUndefined(licencies) });
}

export async function fbGetLicencies(saison) {
  const result = await call("getLicencies", { saison });
  return Array.isArray(result?.licencies) ? result.licencies : [];
}

export async function fbSaveGlobalConfig(config) {
  await call("adminSaveGlobalConfig", { config: withoutUndefined(config) });
}

export async function fbGetGlobalConfig() {
  return await call("getGlobalConfig", {}, { auth: false });
}

export async function fbGetPublicConfig(saison = "") {
  return await call("getPublicConfig", { saison }, { auth: false });
}

// ═══════════════════════════════════════════════════════════════════
// Accès bureau
// ═══════════════════════════════════════════════════════════════════

export async function fbAdminLogin({ saison, code }) {
  const result = await call("adminLogin", { saison, code }, { auth: false });
  if (!result?.token) throw new Error("Session admin non reçue.");
  writeToken(result.token);
  notifyAuth(adminUser());
  return result;
}

export async function fbChangeAdminPassword({ saison, currentCode, newCode }) {
  return await call("changeAdminPassword", { saison, currentCode, newCode });
}

/** Prévient l'application des connexions / déconnexions du bureau. */
export function fbWatchAuth(callback) {
  authListeners.add(callback);
  let cancelled = false;
  (async () => {
    if (!hasAdminSession()) { if (!cancelled) callback(null); return; }
    try {
      await call("session", {});
      if (!cancelled) callback(adminUser());
    } catch {
      writeToken("");
      if (!cancelled) callback(null);
    }
  })();
  return () => { cancelled = true; authListeners.delete(callback); };
}

export async function fbLogout() {
  writeToken("");
  notifyAuth(null);
}

// ═══════════════════════════════════════════════════════════════════
// Licences, e-mails
// ═══════════════════════════════════════════════════════════════════

export async function fbLookupLicence({ saison, numLicenceFFF }) {
  const result = await call("lookupLicence", { saison, numLicenceFFF }, { auth: false });
  return result?.licencie || null;
}

export async function fbSendAttestationEmail({ saison, id, force = false }) {
  return await call("sendAttestationEmail", { saison, id, force });
}

export async function fbSendBulkEmail({ saison, subject, html, recipients, meta, attachments }) {
  return await call("sendBulkEmail", { saison, subject, html, recipients, meta, attachments });
}

// ═══════════════════════════════════════════════════════════════════
// Indicateur de disponibilité du serveur
// ═══════════════════════════════════════════════════════════════════

export const isServerAvailable = () => !!API_URL;
export const isFirebaseAvailable = isServerAvailable;
