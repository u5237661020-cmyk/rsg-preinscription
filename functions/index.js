const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const MAILJET_API_KEY = defineSecret("MAILJET_API_KEY");
const MAILJET_SECRET_KEY = defineSecret("MAILJET_SECRET_KEY");
const MAILJET_SENDER_EMAIL = defineSecret("MAILJET_SENDER_EMAIL");
const MAILJET_SENDER_NAME = defineSecret("MAILJET_SENDER_NAME");
const ADMIN_ACCESS_CODE = defineSecret("ADMIN_ACCESS_CODE");

const MAILJET_SECRETS = [
  MAILJET_API_KEY,
  MAILJET_SECRET_KEY,
  MAILJET_SENDER_EMAIL,
  MAILJET_SENDER_NAME,
];

const ADMIN_ACCESS_DOC = "security/adminAccess";
const ADMIN_PASSWORD_MIN_LENGTH = 8;
const ADMIN_PASSWORD_ITERATIONS = 210000;

const isValidStatus = (entry) => ["valide", "paye"].includes(entry?.statut);
const clean = (value) => String(value || "").trim();
const isAdminRequest = (request) => request.auth?.token?.admin === true;
const assertAdminAuth = (request) => {
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "Session bureau invalide ou expirée.");
  }
};
const timingSafeEqualText = (a, b) => {
  const left = Buffer.from(clean(a));
  const right = Buffer.from(clean(b));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};
const timingSafeEqualBuffer = (a, b) => {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || !a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
const getSecretValue = (secret) => {
  try {
    return clean(secret.value());
  } catch {
    return "";
  }
};
const removePrivateConfig = (tarifs = {}) => {
  const {
    _accessCodes,
    _attestationTemplate,
    _boutique,
    ...publicTarifs
  } = tarifs || {};
  return publicTarifs;
};
const publicLicencie = (licencie) => {
  if (!licencie) return null;
  return {
    n: licencie.n || licencie.nom || "",
    p: licencie.p || licencie.prenom || "",
    l: licencie.l || licencie.numLicence || licencie.numLicenceFFF || "",
    dn: licencie.dn || licencie.dateNaissance || "",
    s: licencie.s || licencie.sexe || "",
    c: licencie.c || licencie.categorie || "",
    sc: licencie.sc || licencie.sousCategorie || "",
    tl: licencie.tl || licencie.typeLicence || "",
    cm: licencie.cm,
    a: licencie.a || licencie.anneeLastCertif || "",
    em: licencie.em || licencie.email || "",
    tel: licencie.tel || licencie.telephone || "",
  };
};
const rateLimitKey = (request) => safeName(
  clean(request.rawRequest?.headers?.["x-forwarded-for"] || request.rawRequest?.ip || "unknown")
    .split(",")[0]
).slice(0, 90);
const checkLoginRateLimit = async (request) => {
  const key = rateLimitKey(request);
  const ref = admin.firestore().doc(`security/loginAttempts/ips/${key}`);
  const snap = await ref.get();
  const now = Date.now();
  const data = snap.exists ? snap.data() || {} : {};
  if (data.blockedUntil && data.blockedUntil > now) {
    throw new HttpsError("resource-exhausted", "Trop d'essais. Réessayez dans quelques minutes.");
  }
  return { ref, data, now };
};
const recordLoginAttempt = async ({ ref, data, now }, ok) => {
  if (ok) {
    await ref.set({ failures: 0, blockedUntil: null, lastSuccessAt: now }, { merge: true });
    return;
  }
  const recent = data.firstFailureAt && now - data.firstFailureAt < 10 * 60 * 1000;
  const failures = (recent ? data.failures || 0 : 0) + 1;
  const blockedUntil = failures >= 5 ? now + 15 * 60 * 1000 : null;
  await ref.set({
    failures,
    firstFailureAt: recent ? data.firstFailureAt : now,
    blockedUntil,
    lastFailureAt: now,
  }, { merge: true });
};
const safeName = (value) =>
  clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "attestation";

const getResp1 = (entry) => {
  if (Array.isArray(entry?.representants) && entry.representants.length) return entry.representants[0];
  if (entry?.resp1Nom) {
    return {
      nom: entry.resp1Nom,
      prenom: entry.resp1Prenom,
      lien: entry.resp1Lien,
      tel: entry.resp1Tel,
      email: entry.resp1Email,
    };
  }
  return null;
};

const getEmailContact = (entry) => {
  if (entry?.isMajeur && entry.email) return entry.email;
  return getResp1(entry)?.email || entry?.email || "";
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return date.toLocaleDateString("fr-FR");
};

const paymentLabel = (entry) => {
  const ids = Array.isArray(entry?.modePaiements) && entry.modePaiements.length
    ? entry.modePaiements
    : entry?.modePaiement
      ? [entry.modePaiement]
      : [];
  return ids.length ? ids.join(" + ") : "Paiement regle en permanence";
};

const renderPdfText = (entry) => [
  "REVEIL SAINT-GEREON",
  `Attestation de licence - Saison ${entry.saison || ""}`,
  "",
  "Le club du Reveil Saint-Gereon atteste que le dossier de licence suivant est regle et valide.",
  "",
  `Nom : ${entry.nom || ""}`,
  `Prenom : ${entry.prenom || ""}`,
  `Date de naissance : ${formatDate(entry.dateNaissance)}`,
  `Categorie : ${entry.categorie || ""}`,
  `Reference dossier : ${entry.id || ""}`,
  `Montant regle : ${entry.prixFinal || entry.tarifBase || 0} EUR`,
  `Mode de paiement : ${paymentLabel(entry)}`,
  `Date de validation : ${formatDate(entry.datePaiement || entry.dateValidation || new Date().toISOString())}`,
  "",
  "Cette attestation est generee automatiquement par le secretariat du Reveil Saint-Gereon.",
  "",
  "Reveil Saint-Gereon",
].join("\n");

const pdfString = (value) =>
  `(${String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")})`;

const wrapLine = (line, max = 86) => {
  const words = String(line || "").split(/\s+/);
  const out = [];
  let cur = "";
  words.forEach((word) => {
    if ((cur + " " + word).trim().length > max) {
      if (cur) out.push(cur);
      cur = word;
    } else {
      cur = (cur + " " + word).trim();
    }
  });
  if (cur || !out.length) out.push(cur);
  return out;
};

const createPdf = (text) => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .flatMap((line) => (line ? wrapLine(line) : [""]));
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.slice(0, 52).map((line) => `${pdfString(line)} Tj T*`),
    "ET",
  ].join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = [0];
  const body = objects.map((obj) => {
    xref.push(offset);
    offset += Buffer.byteLength(obj, "binary");
    return obj;
  }).join("");
  const xrefStart = offset;
  const xrefBody = xref.map((pos, i) =>
    i === 0 ? "0000000000 65535 f " : `${String(pos).padStart(10, "0")} 00000 n `
  ).join("\n");
  const pdf = `%PDF-1.4\n${body}xref\n0 ${xref.length}\n${xrefBody}\ntrailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "binary");
};

const mailHtml = (entry) => `
  <p>Bonjour,</p>
  <p>Vous trouverez en piece jointe l'attestation de licence du Reveil Saint-Gereon pour <strong>${clean(entry.prenom)} ${clean(entry.nom)}</strong>.</p>
  <p>Reference dossier : <strong>${clean(entry.id)}</strong><br>
  Saison : <strong>${clean(entry.saison)}</strong></p>
  <p>Sportivement,<br>Le secretariat du Reveil Saint-Gereon</p>
`;

const callMailjet = async ({ to, subject, html, text, attachment }) => {
  const senderEmail = MAILJET_SENDER_EMAIL.value();
  const senderName = MAILJET_SENDER_NAME.value() || "Reveil Saint-Gereon";
  const auth = Buffer.from(`${MAILJET_API_KEY.value()}:${MAILJET_SECRET_KEY.value()}`).toString("base64");
  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: senderEmail, Name: senderName },
        To: [{ Email: to }],
        Subject: subject,
        TextPart: text,
        HTMLPart: html,
        Attachments: [attachment],
      }],
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json?.Messages?.[0]?.Errors?.[0]?.ErrorMessage || json?.ErrorMessage || response.statusText;
    throw new Error(`Mailjet ${response.status}: ${detail}`);
  }
  return json;
};

const getAccessCodes = async (saison) => {
  const secretCode = getSecretValue(ADMIN_ACCESS_CODE);
  const snap = await admin.firestore().doc(`saisons/${saison}/config/tarifs`).get();
  const tarifs = snap.exists ? snap.data()?.tarifs || {} : {};
  const codes = Array.isArray(tarifs._accessCodes) ? tarifs._accessCodes : [];
  return [secretCode, ...codes].map(clean).filter(Boolean);
};

const passwordRef = () => admin.firestore().doc(ADMIN_ACCESS_DOC);

const hashAdminCode = (code) => {
  const salt = crypto.randomBytes(24).toString("hex");
  const digest = "sha256";
  const hash = crypto
    .pbkdf2Sync(clean(code), salt, ADMIN_PASSWORD_ITERATIONS, 32, digest)
    .toString("hex");
  return {
    algorithm: "pbkdf2",
    digest,
    iterations: ADMIN_PASSWORD_ITERATIONS,
    salt,
    hash,
  };
};

const verifyStoredPassword = (code, data = {}) => {
  try {
    if (data.algorithm !== "pbkdf2" || !data.salt || !data.hash) return false;
    const digest = data.digest || "sha256";
    const iterations = Number(data.iterations) || ADMIN_PASSWORD_ITERATIONS;
    const expected = Buffer.from(String(data.hash), "hex");
    const actual = crypto.pbkdf2Sync(clean(code), data.salt, iterations, expected.length, digest);
    return timingSafeEqualBuffer(actual, expected);
  } catch {
    return false;
  }
};

const verifyAdminCode = async (saison, code) => {
  const passwordSnap = await passwordRef().get();
  const passwordData = passwordSnap.exists ? passwordSnap.data() || {} : {};
  if (passwordData.hash) {
    if (verifyStoredPassword(code, passwordData)) return { source: "app-password" };
    throw new HttpsError("permission-denied", "Code bureau invalide.");
  }
  const codes = await getAccessCodes(saison);
  if (!codes.length) {
    throw new HttpsError("failed-precondition", "Aucun code bureau n'est configure pour cette saison.");
  }
  if (!codes.some((allowed) => timingSafeEqualText(allowed, code))) {
    throw new HttpsError("permission-denied", "Code bureau invalide.");
  }
  return { source: "firebase-secret" };
};

const assertAdminCode = async (saison, code) => {
  await verifyAdminCode(saison, code);
};

exports.getPublicConfig = onCall(async (request) => {
  const globalSnap = await admin.firestore().doc("config/global").get();
  const globalConfig = globalSnap.exists ? globalSnap.data() || {} : {};
  const requestedSaison = clean(request.data?.saison);
  const publicSaison = requestedSaison || clean(globalConfig.publicSaison) || "2026-2027";
  const tarifsSnap = await admin.firestore().doc(`saisons/${publicSaison}/config/tarifs`).get();
  const tarifs = tarifsSnap.exists ? tarifsSnap.data()?.tarifs || {} : {};
  return {
    publicSaison,
    tarifs: removePrivateConfig(tarifs),
  };
});

exports.lookupLicence = onCall(async (request) => {
  const saison = clean(request.data?.saison);
  const numLicenceFFF = clean(request.data?.numLicenceFFF).replace(/\D/g, "");
  if (!saison || numLicenceFFF.length < 4) {
    throw new HttpsError("invalid-argument", "Saison et numero de licence requis.");
  }
  const snap = await admin.firestore().doc(`saisons/${saison}/config/licencies`).get();
  const licencies = snap.exists && Array.isArray(snap.data()?.licencies) ? snap.data().licencies : [];
  const match = licencies.find((licencie) => {
    const candidate = clean(licencie.l || licencie.numLicence || licencie.numLicenceFFF).replace(/\D/g, "");
    return candidate && candidate === numLicenceFFF;
  });
  return { found: !!match, licencie: publicLicencie(match) };
});

exports.adminLogin = onCall({ secrets: [ADMIN_ACCESS_CODE] }, async (request) => {
  const saison = clean(request.data?.saison) || "2026-2027";
  const code = clean(request.data?.code);
  let attempt;
  try {
    attempt = await checkLoginRateLimit(request);
    await assertAdminCode(saison, code);
    await recordLoginAttempt(attempt, true);
    const uid = "rsg-admin";
    let token;
    try {
      token = await admin.auth().createCustomToken(uid, {
        admin: true,
        role: "bureau",
        club: "rsg",
      });
    } catch (tokenError) {
      logger.error("Admin token creation failed", { saison, error: tokenError.message });
      throw new HttpsError("internal", "Connexion impossible : configuration Firebase Auth a verifier.");
    }
    return { ok: true, token };
  } catch (error) {
    if (error instanceof HttpsError && ["resource-exhausted", "internal"].includes(error.code)) throw error;
    if (attempt) {
      try {
        await recordLoginAttempt(attempt, false);
      } catch (recordError) {
        logger.error("Admin login rate-limit write failed", { saison, error: recordError.message });
      }
    }
    logger.warn("Admin login refused", { saison, reason: error.message });
    throw new HttpsError("permission-denied", "Code bureau invalide.");
  }
});

exports.changeAdminPassword = onCall({ secrets: [ADMIN_ACCESS_CODE] }, async (request) => {
  assertAdminAuth(request);
  const saison = clean(request.data?.saison) || "2026-2027";
  const currentCode = clean(request.data?.currentCode);
  const newCode = clean(request.data?.newCode);

  if (!currentCode || !newCode) {
    throw new HttpsError("invalid-argument", "Code actuel et nouveau code requis.");
  }
  if (newCode.length < ADMIN_PASSWORD_MIN_LENGTH) {
    throw new HttpsError("invalid-argument", `Le nouveau code doit contenir au moins ${ADMIN_PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (timingSafeEqualText(currentCode, newCode)) {
    throw new HttpsError("invalid-argument", "Le nouveau code doit etre different de l'ancien.");
  }

  await verifyAdminCode(saison, currentCode);
  const updatedAt = new Date().toISOString();
  await passwordRef().set({
    ...hashAdminCode(newCode),
    updatedAt,
    updatedBy: request.auth?.uid || "admin",
  }, { merge: true });
  logger.info("Admin password changed", { saison, updatedBy: request.auth?.uid || "admin" });
  return { ok: true, updatedAt };
});

const updateEmailError = async (ref, error, source) => {
  await ref.set({
    emailAttestationStatus: "erreur",
    emailAttestationErreur: clean(error.message || error),
    emailAttestationErreurLe: new Date().toISOString(),
    emailAttestationSource: source,
  }, { merge: true });
};

const sendAttestationForDoc = async ({ saison, id, force = false, source = "manual" }) => {
  const ref = admin.firestore().doc(`saisons/${saison}/preinscriptions/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Dossier introuvable.");
  const entry = snap.data();
  if (!isValidStatus(entry)) {
    throw new HttpsError("failed-precondition", "Le dossier doit etre valide/paye avant l'envoi.");
  }
  if (entry.emailAttestationEnvoyeLe && !force) {
    return { ok: true, alreadySent: true, to: entry.emailAttestationDernierDestinataire || getEmailContact(entry) };
  }
  const to = clean(getEmailContact(entry));
  if (!to) throw new HttpsError("failed-precondition", "Aucun email de contact trouve.");

  await ref.set({
    emailAttestationStatus: "envoi",
    emailAttestationErreur: null,
    emailAttestationSource: source,
  }, { merge: true });

  try {
    const pdf = createPdf(renderPdfText(entry));
    const subject = `Attestation de licence RSG - ${entry.prenom || ""} ${entry.nom || ""}`.trim();
    const result = await callMailjet({
      to,
      subject,
      html: mailHtml(entry),
      text: renderPdfText(entry),
      attachment: {
        ContentType: "application/pdf",
        Filename: `${safeName(`Attestation_RSG_${entry.prenom}_${entry.nom}_${entry.saison}`)}.pdf`,
        Base64Content: pdf.toString("base64"),
      },
    });
    const messageId = result?.Messages?.[0]?.To?.[0]?.MessageID || "";
    await ref.set({
      emailAttestationEnvoye: true,
      emailAttestationEnvoyeLe: new Date().toISOString(),
      emailAttestationDernierDestinataire: to,
      emailAttestationMessageId: messageId,
      emailAttestationStatus: "envoye",
      emailAttestationErreur: null,
      emailAttestationSource: source,
    }, { merge: true });
    return { ok: true, to, messageId };
  } catch (error) {
    await updateEmailError(ref, error, source);
    throw error;
  }
};

exports.sendAttestationEmail = onCall({ secrets: MAILJET_SECRETS }, async (request) => {
  assertAdminAuth(request);
  const { saison, id, force } = request.data || {};
  if (!saison || !id) {
    throw new HttpsError("invalid-argument", "Saison et id dossier requis.");
  }
  try {
    return await sendAttestationForDoc({ saison, id, force: !!force, source: "manual" });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = clean(error.message || error) || "Erreur inconnue pendant l'envoi.";
    logger.error("Manual attestation email failed", { saison, id, error: message });
    throw new HttpsError("internal", message);
  }
});

exports.autoSendAttestationOnValidation = onDocumentUpdated({
  document: "saisons/{saison}/preinscriptions/{id}",
  secrets: MAILJET_SECRETS,
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const wasValid = isValidStatus(before);
  const isNowValid = isValidStatus(after);
  if (!isNowValid || wasValid || after.emailAttestationEnvoyeLe) return null;
  try {
    const result = await sendAttestationForDoc({
      saison: event.params.saison,
      id: event.params.id,
      force: false,
      source: "auto-validation",
    });
    logger.info("Attestation email sent", { id: event.params.id, to: result.to });
  } catch (error) {
    logger.error("Attestation email failed", { id: event.params.id, error: error.message });
  }
  return null;
});
