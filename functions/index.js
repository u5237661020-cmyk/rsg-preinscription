const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const MAILJET_API_KEY = defineSecret("MAILJET_API_KEY");
const MAILJET_SECRET_KEY = defineSecret("MAILJET_SECRET_KEY");
const MAILJET_SENDER_EMAIL = defineSecret("MAILJET_SENDER_EMAIL");
const MAILJET_SENDER_NAME = defineSecret("MAILJET_SENDER_NAME");

const MAILJET_SECRETS = [
  MAILJET_API_KEY,
  MAILJET_SECRET_KEY,
  MAILJET_SENDER_EMAIL,
  MAILJET_SENDER_NAME,
];

const DEFAULT_ACCESS_CODE = "RSG2025";

const isValidStatus = (entry) => ["valide", "paye"].includes(entry?.statut);
const clean = (value) => String(value || "").trim();
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
  const snap = await admin.firestore().doc(`saisons/${saison}/config/tarifs`).get();
  const tarifs = snap.exists ? snap.data()?.tarifs || {} : {};
  const codes = Array.isArray(tarifs._accessCodes) ? tarifs._accessCodes : [];
  return codes.length ? codes.map(clean).filter(Boolean) : [DEFAULT_ACCESS_CODE];
};

const assertAdminCode = async (saison, code) => {
  const codes = await getAccessCodes(saison);
  if (!codes.includes(clean(code))) {
    throw new HttpsError("permission-denied", "Code bureau invalide.");
  }
};

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
  const { saison, id, force, adminCode } = request.data || {};
  if (!saison || !id) {
    throw new HttpsError("invalid-argument", "Saison et id dossier requis.");
  }
  await assertAdminCode(saison, adminCode);
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
