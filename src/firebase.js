// ═══════════════════════════════════════════════════════════════════
// Firebase — RSG Préinscription
// ═══════════════════════════════════════════════════════════════════
// Ce fichier centralise toute la connexion à Firestore.
// Si vous changez de projet Firebase, remplacez juste firebaseConfig ci-dessous.
//
// Sécurité : ces clés sont publiques par design (elles iront dans le build).
// La vraie sécurité se fait avec les règles Firestore, voir firestore.rules
// ═══════════════════════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBMCHLYJorNQOpnMcax5ACT9EPNF4HzR6g",
  authDomain: "rsg-preinscription.firebaseapp.com",
  projectId: "rsg-preinscription",
  storageBucket: "rsg-preinscription.firebasestorage.app",
  messagingSenderId: "560072429254",
  appId: "1:560072429254:web:b11fcb5ddce5aba9b911c7",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "europe-west1");

const withoutUndefined = (value) => {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, withoutUndefined(item)])
    );
  }
  return value;
};

const stripPrivateTarifs = (tarifs = {}) => {
  const { _accessCodes, ...safeTarifs } = tarifs || {};
  return safeTarifs;
};

// ═══════════════════════════════════════════════════════════════════
// Helpers Firestore : préinscriptions par saison
// ═══════════════════════════════════════════════════════════════════
// Structure : /saisons/{saison}/preinscriptions/{id}
// Exemple : /saisons/2026-2027/preinscriptions/RSG-ABC123

const colInscriptions = (saison) =>
  collection(db, "saisons", saison, "preinscriptions");

/**
 * Sauvegarde une préinscription (création ou modification).
 * @param {string} saison - "2026-2027"
 * @param {object} entry - L'objet préinscription complet (avec .id)
 */
export async function fbSaveInscription(saison, entry) {
  if (!entry?.id) throw new Error("Préinscription sans id");
  const ref = doc(colInscriptions(saison), entry.id);
  // serverTimestamp pour avoir la date côté serveur Firebase
  await setDoc(ref, { ...withoutUndefined(entry), _updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Récupère TOUTES les préinscriptions d'une saison (lecture unique).
 * @param {string} saison
 * @returns {Promise<Array>}
 */
export async function fbGetAllInscriptions(saison) {
  const snap = await getDocs(query(colInscriptions(saison), orderBy("datePreinscription", "desc")));
  return snap.docs.map((d) => d.data());
}

/**
 * Supprime une préinscription.
 */
export async function fbDeleteInscription(saison, id) {
  await deleteDoc(doc(colInscriptions(saison), id));
}

/**
 * Écoute en TEMPS RÉEL toutes les préinscriptions d'une saison.
 * Renvoie une fonction de désinscription (à appeler quand on quitte le bureau).
 * @param {string} saison
 * @param {function} onUpdate - Callback (data: Array) => void
 * @param {function} onError - Callback (err) => void
 * @returns {function} unsubscribe
 */
export function fbWatchInscriptions(saison, onUpdate, onError) {
  const q = query(colInscriptions(saison), orderBy("datePreinscription", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const data = snap.docs.map((d) => d.data());
      onUpdate(data);
    },
    (err) => {
      console.error("Firestore watch error:", err);
      if (onError) onError(err);
    }
  );
}

// ═══════════════════════════════════════════════════════════════════
// Helpers : tarifs partagés par saison
// ═══════════════════════════════════════════════════════════════════
// Structure : /saisons/{saison}/config/tarifs

export async function fbSaveTarifs(saison, tarifs) {
  await setDoc(doc(db, "saisons", saison, "config", "tarifs"), {
    tarifs: withoutUndefined(stripPrivateTarifs(tarifs)),
    _updatedAt: serverTimestamp(),
  });
}

export async function fbGetTarifs(saison) {
  const snap = await getDoc(doc(db, "saisons", saison, "config", "tarifs"));
  return snap.exists() ? stripPrivateTarifs(snap.data().tarifs) : null;
}

// ═══════════════════════════════════════════════════════════════════
// Helpers : base licenciés partagée par saison
// ═══════════════════════════════════════════════════════════════════
// Structure : /saisons/{saison}/config/licencies
// La base licenciés est importée manuellement par saison dans Firestore.

export async function fbSaveLicencies(saison, licencies) {
  await setDoc(doc(db, "saisons", saison, "config", "licencies"), {
    licencies: withoutUndefined(licencies),
    _updatedAt: serverTimestamp(),
  });
}

export async function fbGetLicencies(saison) {
  const snap = await getDoc(doc(db, "saisons", saison, "config", "licencies"));
  return snap.exists() ? (snap.data().licencies || []) : [];
}

// ═══════════════════════════════════════════════════════════════════
// Helpers : configuration globale
// ═══════════════════════════════════════════════════════════════════

export async function fbSaveGlobalConfig(config) {
  await setDoc(doc(db, "config", "global"), {
    ...withoutUndefined(config),
    _updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function fbGetGlobalConfig() {
  const snap = await getDoc(doc(db, "config", "global"));
  return snap.exists() ? snap.data() : null;
}

export async function fbGetPublicConfig(saison = "") {
  const getPublicConfig = httpsCallable(functions, "getPublicConfig");
  const result = await getPublicConfig({ saison });
  return result.data;
}

export async function fbAdminLogin({ saison, code }) {
  await setPersistence(auth, browserSessionPersistence);
  const login = httpsCallable(functions, "adminLogin");
  const result = await login({ saison, code });
  if (!result.data?.token) throw new Error("Session admin non reçue.");
  await signInWithCustomToken(auth, result.data.token);
  return result.data;
}

export async function fbChangeAdminPassword({ saison, currentCode, newCode }) {
  const changePassword = httpsCallable(functions, "changeAdminPassword");
  const result = await changePassword({ saison, currentCode, newCode });
  return result.data;
}

export function fbWatchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function fbLogout() {
  await signOut(auth);
}

export async function fbLookupLicence({ saison, numLicenceFFF }) {
  const lookup = httpsCallable(functions, "lookupLicence");
  const result = await lookup({ saison, numLicenceFFF });
  return result.data?.licencie || null;
}

export async function fbSendAttestationEmail({ saison, id, force = false }) {
  const send = httpsCallable(functions, "sendAttestationEmail");
  const result = await send({ saison, id, force });
  return result.data;
}

// ═══════════════════════════════════════════════════════════════════
// Indicateur de connectivité Firebase
// ═══════════════════════════════════════════════════════════════════

export const isFirebaseAvailable = () => {
  try {
    return !!db && !!firebaseConfig.projectId;
  } catch {
    return false;
  }
};
