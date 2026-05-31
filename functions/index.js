const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const path = require("path");

admin.initializeApp();

setGlobalOptions({ region: "europe-west1", maxInstances: 3 });

const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const GMAIL_SENDER_NAME = defineSecret("GMAIL_SENDER_NAME");
const ADMIN_ACCESS_CODE = defineSecret("ADMIN_ACCESS_CODE");

const GMAIL_SECRETS = [
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  GMAIL_SENDER_NAME,
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
    np: licencie.np || licencie.numPersonne || licencie.numeroPersonne || licencie.personne || "",
    dn: licencie.dn || licencie.dateNaissance || "",
    s: licencie.s || licencie.sexe || "",
    c: licencie.c || licencie.categorie || "",
    sc: licencie.sc || licencie.sousCategorie || "",
    tl: licencie.tl || licencie.typeLicence || "",
    cm: licencie.cm,
    a: licencie.a || licencie.anneeLastCertif || "",
    em: licencie.em || licencie.email || "",
    tel: licencie.tel || licencie.telephone || "",
    em2: licencie.em2 || licencie.emailRl || "",
    tel2: licencie.tel2 || licencie.telRl || "",
    rl: licencie.rl || licencie.representant || "",
    ln: licencie.ln || licencie.lieuNaissance || "",
    nat: licencie.nat || licencie.nationalite || "",
    adr: licencie.adr || licencie.adresse || "",
    cp: licencie.cp || licencie.codePostal || "",
    ville: licencie.ville || "",
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

const PIECES_DEFAUT = [
  { id: "certifMedical", label: "Certificat medical complete par le medecin", condition: "certif" },
  { id: "photoId", label: "Piece d'identite (CNI ou passeport)", condition: "always" },
  { id: "justifDom", label: "Justificatif de domicile (- 3 mois)", condition: "always" },
  { id: "rib", label: "RIB", condition: "always" },
  { id: "livretFamille", label: "Livret de famille (obligatoire pour tarif famille)", condition: "famille" },
  { id: "acteNaissance", label: "Extrait d'acte de naissance", condition: "etranger" },
  { id: "residenceParents", label: "Justificatif de residence des parents", condition: "etranger" },
  { id: "nationaliteParents", label: "Justificatif de nationalite des parents", condition: "etranger" },
];
const PERMANENCES_DEFAUT = [{ date: "", debut: "", fin: "", lieu: "Stade du RSG", message: "" }];
const CONFIRMATION_EMAIL_SUBJECT_DEFAUT = "Votre preinscription RSG est bien recue - Saison {saison}";
const CONFIRMATION_EMAIL_TEMPLATE_DEFAUT = `<p>Bonjour <strong>{prenom}</strong>,</p>

<p>Merci pour votre preinscription au <strong>Reveil Saint-Gereon</strong> pour la saison <strong>{saison}</strong>.</p>

<p>Nous avons bien recu le dossier de <strong>{prenom} {nom}</strong>.</p>

<p>
  <strong>Reference dossier :</strong> {reference}<br>
  <strong>Categorie :</strong> {categorie}<br>
  <strong>Montant licence :</strong> {montant} EUR<br>
  <strong>Paiement :</strong> {modePaiement}
</p>

<p><strong>Important :</strong> cette preinscription ne valide pas encore definitivement l'inscription.</p>

<p>La validation finale sera faite par le club lors d'une permanence licence, apres verification du dossier et reception du paiement. Elle reste egalement sous reserve des places disponibles, notamment pour les nouveaux joueurs.</p>

<p>Pour preparer votre passage en permanence, merci d'apporter si necessaire :</p>
{documents}

<p><strong>Permanences licence :</strong></p>
{permanences}

<p>A tres bientot au club,</p>

<p>Sportivement,<br><strong>Le Reveil Saint-Gereon</strong></p>`;

const escapeHtml = (value) => clean(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
const getTarifs = async (saison) => {
  const snap = await admin.firestore().doc(`saisons/${saison}/config/tarifs`).get();
  return snap.exists ? snap.data()?.tarifs || {} : {};
};
const getPieces = (tarifs = {}) => {
  const pieces = tarifs._pieces;
  return Array.isArray(pieces) && pieces.length ? pieces : PIECES_DEFAUT;
};
const normalizeNationalite = (value) => clean(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z]/g, "");
const isNationaliteFrancaise = (value) => {
  const n = normalizeNationalite(value);
  return !n || ["f", "fr", "fra", "france", "francais", "francaise"].includes(n);
};
const isNationaliteEtrangere = (entry) => {
  const values = [
    entry?.nationalite,
    ...(Array.isArray(entry?.freresSoeurs) ? entry.freresSoeurs.map((m) => m?.nationalite) : []),
    ...(Array.isArray(entry?.adultesFamille) ? entry.adultesFamille.map((m) => m?.nationalite) : []),
  ].filter((value) => clean(value));
  return values.length ? values.some((value) => !isNationaliteFrancaise(value)) : false;
};
const hasFamilyMembers = (entry) => (Array.isArray(entry?.freresSoeurs) && entry.freresSoeurs.length > 0) || (Array.isArray(entry?.adultesFamille) && entry.adultesFamille.length > 0);
const pieceDejaFournie = (piece, entry = {}) => {
  const id = piece?.id;
  if (!id) return false;
  if (entry?.piecesFournies?.[id] === true) return true;
  if (entry?.[id] === true) return true;
  if (id === "certifMedical" && entry?.certifMedical === true) return true;
  return false;
};
const pieceVisible = (piece, entry) => {
  if (piece.condition === "certif") return !!entry?.certifNeeded;
  if (piece.condition === "famille") return hasFamilyMembers(entry);
  if (piece.condition === "etranger") return isNationaliteEtrangere(entry);
  return true;
};
const docsHtml = (entry, tarifs) => {
  const docs = getPieces(tarifs).filter((piece) => pieceVisible(piece, entry) && !pieceDejaFournie(piece, entry)).map((piece) => clean(piece.label)).filter(Boolean);
  return docs.length ? `<ul>${docs.map((doc) => `<li>${escapeHtml(doc)}</li>`).join("")}</ul>` : "<p>Aucune piece complementaire indiquee.</p>";
};
const getPermanences = (tarifs = {}) => {
  const rows = tarifs._permanences;
  return Array.isArray(rows) && rows.length ? rows : PERMANENCES_DEFAUT;
};
const fmtPermanence = (p = {}) => {
  const date = p.date ? formatDate(p.date) : "Date a preciser";
  const horaires = p.debut || p.fin ? ` de ${p.debut || "?"} a ${p.fin || "?"}` : "";
  return `${date}${horaires}${p.lieu ? ` - ${p.lieu}` : ""}`;
};
const permanenceMessage = (p = {}) => clean(p.message || p.info || p.commentaire);
const permanencesHtml = (tarifs) => {
  const permanences = getPermanences(tarifs);
  return permanences.length ? `<ul>${permanences.map((p) => {
    const msg = permanenceMessage(p);
    return `<li>${escapeHtml(fmtPermanence(p))}${msg ? `<br><span style="color:#92400e;font-weight:700;white-space:pre-line">${escapeHtml(msg)}</span>` : ""}</li>`;
  }).join("")}</ul>` : "<p>Dates communiquees prochainement.</p>";
};
const modePaiementLabel = (entry, tarifs = {}) => {
  const modes = Array.isArray(tarifs._modesPaiement) ? tarifs._modesPaiement : [];
  const ids = Array.isArray(entry?.modePaiements) && entry.modePaiements.length ? entry.modePaiements : entry?.modePaiement ? [entry.modePaiement] : [];
  const labels = ids.map((id) => modes.find((mode) => mode.id === id)?.l || id).filter(Boolean);
  return labels.join(" + ") || "A choisir en permanence";
};
const renderConfirmationTemplate = (tpl, entry, tarifs) => {
  const replacements = {
    "{prenom}": escapeHtml(entry?.prenom),
    "{nom}": escapeHtml(entry?.nom),
    "{dateNaissance}": escapeHtml(formatDate(entry?.dateNaissance)),
    "{saison}": escapeHtml(entry?.saison),
    "{categorie}": escapeHtml(entry?.categorie),
    "{reference}": escapeHtml(entry?.id),
    "{montant}": escapeHtml(entry?.prixFinal || entry?.tarifBase || 0),
    "{modePaiement}": escapeHtml(modePaiementLabel(entry, tarifs)),
    "{documents}": docsHtml(entry, tarifs),
    "{permanences}": permanencesHtml(tarifs),
  };
  return Object.entries(replacements).reduce((html, [key, value]) => html.split(key).join(value), String(tpl || ""));
};
const htmlToText = (html) => String(html || "")
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/p>/gi, "\n\n")
  .replace(/<li>/gi, "- ")
  .replace(/<\/li>/gi, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .trim();

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

const canonicalCat = (cat) => clean(cat);
const isDirigeantCategory = (cat) => ["Dirigeant", "Dirigeants"].includes(canonicalCat(cat));
const shouldCreateAttestation = (member) => !isDirigeantCategory(member?.categorie);
const countMembres = (entry) => entry ? 1 + (Array.isArray(entry.freresSoeurs) ? entry.freresSoeurs.length : 0) + (Array.isArray(entry.adultesFamille) ? entry.adultesFamille.length : 0) + (entry.doubleLicenceDirigeant ? 1 : 0) : 0;
const attestationsForEntry = (entry) => {
  const detail = Array.isArray(entry?.detailPrix) ? entry.detailPrix : [];
  const mk = (member, idx, role) => ({
    ...entry,
    ...member,
    id: entry.id,
    dossierId: entry.id,
    role,
    idx,
    nom: member.nom || entry.nom || "",
    prenom: member.prenom || entry.prenom || "",
    categorie: canonicalCat(member.categorie || entry.categorie || ""),
    dateNaissance: member.dateNaissance || entry.dateNaissance || "",
    prixFinal: detail[idx]?.prix ?? member.prix ?? (idx === 0 ? entry.prixFinal : entry.tarifBase) ?? 0,
    tarifBase: detail[idx]?.prix ?? member.prix ?? entry.tarifBase ?? 0,
  });
  const members = [
    mk(entry, 0, "Joueur principal"),
    ...(Array.isArray(entry.freresSoeurs) ? entry.freresSoeurs : []).map((member, index) => mk(member, index + 1, "Famille")),
    ...(Array.isArray(entry.adultesFamille) ? entry.adultesFamille : []).map((member, index) => mk(member, 1 + (entry.freresSoeurs?.length || 0) + index, "Famille adulte")),
  ];
  if (entry.doubleLicenceDirigeant) {
    members.push(mk({ ...entry, categorie: "Dirigeant" }, members.length, "Double licence dirigeant"));
  }
  return members.filter(shouldCreateAttestation);
};

const assetPath = (name) => path.join(__dirname, "assets", name);

const createAttestationPdf = (entry) => new Promise((resolve, reject) => {
  const chunks = [];
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);

  const yellow = "#F5C800";
  const dark = "#111827";
  const left = 24;
  const contentWidth = doc.page.width - 48;
  const now = formatDate(new Date().toISOString());
  const datePaiement = formatDate(entry.datePaiement || entry.dateValidation || new Date().toISOString());
  const fullName = `${clean(entry.prenom)} ${clean(entry.nom)}`.trim();
  const saison = clean(entry.saison);
  const categorie = clean(entry.categorie);
  const montant = entry.prixFinal || entry.tarifBase || 0;

  doc.info.Title = `Attestation licence RSG - ${fullName}`;
  doc.info.Author = "Reveil Saint-Gereon";

  try { doc.image(assetPath("rsg-logo.png"), left, 22, { width: 48, height: 48, fit: [48, 48] }); } catch {}
  doc.fillColor(dark).font("Helvetica-Bold").fontSize(15).text("R\u00c9VEIL SAINT-G\u00c9R\u00c9ON", left + 62, 29);
  doc.font("Helvetica").fontSize(11).text(`Attestation de licence \u00b7 Saison ${saison}`, left + 62, 48);
  doc.moveTo(left, 86).lineTo(left + contentWidth, 86).lineWidth(4).strokeColor(yellow).stroke();

  doc.fillColor("#000").font("Helvetica-Bold").fontSize(18).text("Attestation de r\u00e8glement et d'inscription", left, 116);

  const boxY = 158;
  doc.roundedRect(left, boxY, contentWidth, 118, 8).lineWidth(1.4).strokeColor("#111").stroke();
  doc.fillColor("#000").font("Helvetica").fontSize(12);
  const intro = `Le club R\u00e9veil Saint-G\u00e9r\u00e9on atteste que ${fullName}, n\u00e9(e) le ${formatDate(entry.dateNaissance)}, est enregistr\u00e9(e) pour la saison ${saison} en cat\u00e9gorie ${categorie}.`;
  doc.text(intro, left + 18, boxY + 23, { width: contentWidth - 36, lineGap: 4 });
  doc.text("Le r\u00e8glement de la licence est indiqu\u00e9 comme re\u00e7u par le secr\u00e9tariat du club.", left + 18, boxY + 78, { width: contentWidth - 36 });

  const metaY = 314;
  doc.roundedRect(left, metaY, contentWidth, 72, 8).fillColor("#F9FAFB").fill();
  doc.fillColor("#000").font("Helvetica").fontSize(10.5)
    .text(`R\u00e9f\u00e9rence dossier : ${entry.id || ""}`, left + 14, metaY + 14)
    .text(`Date de paiement : ${datePaiement}`, left + 14, metaY + 30)
    .text(`Montant licence : ${montant} \u20ac`, left + 14, metaY + 46);

  const sigY = 468;
  doc.fillColor("#000").font("Helvetica").fontSize(12).text(`Fait \u00e0 Saint-G\u00e9r\u00e9on, le ${now}`, left, sigY);
  doc.text("Pour le R\u00e9veil Saint-G\u00e9r\u00e9on", left + 305, sigY);
  try { doc.image(assetPath("rsg-signature.png"), left + 332, sigY + 28, { width: 220 }); } catch {
    doc.font("Helvetica").fontSize(12).text("Signature", left + 390, sigY + 42);
  }

  doc.fillColor("#6b7280").fontSize(9).text(
    "Document g\u00e9n\u00e9r\u00e9 automatiquement par le secr\u00e9tariat du R\u00e9veil Saint-G\u00e9r\u00e9on.",
    left,
    760,
    { width: contentWidth, align: "center" }
  );
  doc.end();
});

const memberMailLabel = (member) => `${clean(member.prenom)} ${clean(member.nom)}${clean(member.categorie) ? ` - ${clean(member.categorie)}` : ""}`;
const attestationSubject = (entry, members) => {
  const names = members.map((member) => `${clean(member.prenom)} ${clean(member.nom)}`.trim()).filter(Boolean);
  if (names.length <= 1) return `Attestation de licence RSG - ${names[0] || `${entry.prenom || ""} ${entry.nom || ""}`}`.trim();
  const family = clean(entry.nomFamille || entry.nom);
  return `Attestations de licence RSG - Famille ${family} - ${names.join(", ")}`.trim();
};
const mailHtml = (entry, members = attestationsForEntry(entry)) => {
  const multi = members.length > 1;
  const memberList = members.map((member) => `<li><strong>${escapeHtml(member.prenom)} ${escapeHtml(member.nom)}</strong>${clean(member.categorie) ? ` - ${escapeHtml(member.categorie)}` : ""}</li>`).join("");
  return `
  <p>Bonjour,</p>
  <p>Vous trouverez en piece jointe ${multi ? "les attestations de licence" : "l'attestation de licence"} du Reveil Saint-Gereon pour :</p>
  <ul>${memberList}</ul>
  <p>Reference dossier : <strong>${escapeHtml(entry.id)}</strong><br>
  Saison : <strong>${escapeHtml(entry.saison)}</strong></p>
  <p>${multi ? `${members.length} attestations sont jointes a ce mail, une par membre du dossier.` : "L'attestation est jointe a ce mail."}</p>
  <p>Sportivement,<br>Le secretariat du Reveil Saint-Gereon</p>
`;
};

const createGmailTransport = () => {
  const user = clean(GMAIL_USER.value());
  const pass = clean(GMAIL_APP_PASSWORD.value());
  const senderName = clean(GMAIL_SENDER_NAME.value()) || "Reveil Saint-Gereon";
  if (!user || !pass) {
    throw new Error("Secrets Gmail manquants : GMAIL_USER et GMAIL_APP_PASSWORD doivent etre renseignes.");
  }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return {
    transporter,
    from: `"${senderName.replace(/"/g, "'")}" <${user}>`,
  };
};

const sendWithTransport = async ({ transporter, from, to, subject, html, text, attachment, attachments }) => {
  const mail = {
    from,
    to,
    subject,
    text,
    html,
  };
  const files = Array.isArray(attachments) && attachments.length ? attachments : attachment ? [attachment] : [];
  if (files.length) {
    mail.attachments = files.map((file) => ({
      filename: file.Filename || file.filename || file.name || "piece-jointe",
      content: Buffer.from(file.Base64Content || file.base64 || file.content || "", "base64"),
      contentType: file.ContentType || file.contentType || file.type || "application/octet-stream",
    }));
  }
  return transporter.sendMail(mail);
};

const callGmail = async ({ to, subject, html, text, attachment, attachments }) => {
  const { transporter, from } = createGmailTransport();
  return sendWithTransport({ transporter, from, to, subject, html, text, attachment, attachments });
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
  const numero = clean(request.data?.numLicenceFFF || request.data?.numPersonne || request.data?.numero).replace(/\D/g, "");
  if (!saison || numero.length < 4) {
    throw new HttpsError("invalid-argument", "Saison et numero de licence/personne requis.");
  }
  const snap = await admin.firestore().doc(`saisons/${saison}/config/licencies`).get();
  const licencies = snap.exists && Array.isArray(snap.data()?.licencies) ? snap.data().licencies : [];
  const match = licencies.find((licencie) => {
    const candidates = [
      licencie.l,
      licencie.numLicence,
      licencie.numLicenceFFF,
      licencie.np,
      licencie.numPersonne,
      licencie.numeroPersonne,
      licencie.personne,
    ].map((value) => clean(value).replace(/\D/g, "")).filter(Boolean);
    return candidates.includes(numero);
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

const assertSaisonValue = (value) => {
  const saison = clean(value);
  if (!saison) throw new HttpsError("invalid-argument", "Saison requise.");
  return saison;
};

const preinscriptionRef = (saison, id) =>
  admin.firestore().doc(`saisons/${saison}/preinscriptions/${id}`);

const deletedPreinscriptionRef = (saison, id) =>
  admin.firestore().doc(`saisons/${saison}/deletedPreinscriptions/${id}`);

exports.adminSaveInscription = onCall(async (request) => {
  assertAdminAuth(request);
  const saison = assertSaisonValue(request.data?.saison);
  const entry = request.data?.entry;
  if (!entry || typeof entry !== "object" || !clean(entry.id)) {
    throw new HttpsError("invalid-argument", "Dossier invalide.");
  }
  const id = clean(entry.id);
  const deletedSnap = await deletedPreinscriptionRef(saison, id).get();
  if (deletedSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Ce dossier a ete supprime. Rechargez l'administration pour eviter de restaurer une ancienne copie locale."
    );
  }
  await preinscriptionRef(saison, id).set({
    ...withoutUndefined(entry),
    id,
    saison: clean(entry.saison) || saison,
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, id };
});

exports.adminDeleteInscription = onCall(async (request) => {
  assertAdminAuth(request);
  const saison = assertSaisonValue(request.data?.saison);
  const id = clean(request.data?.id);
  if (!id) throw new HttpsError("invalid-argument", "Identifiant dossier requis.");
  const ref = preinscriptionRef(saison, id);
  const deletedRef = deletedPreinscriptionRef(saison, id);
  const snap = await ref.get();
  const batch = admin.firestore().batch();
  batch.delete(ref);
  batch.set(deletedRef, {
    id,
    saison,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: request.auth?.uid || "admin",
    reference: clean(snap.data()?.id) || id,
    nom: clean(snap.data()?.nom),
    prenom: clean(snap.data()?.prenom),
  }, { merge: true });
  await batch.commit();
  return { ok: true, id };
});

exports.adminSaveLicencies = onCall(async (request) => {
  assertAdminAuth(request);
  const saison = assertSaisonValue(request.data?.saison);
  const licencies = request.data?.licencies;
  if (!Array.isArray(licencies)) {
    throw new HttpsError("invalid-argument", "Base Footclubs invalide.");
  }
  await admin.firestore().doc(`saisons/${saison}/config/licencies`).set({
    licencies: withoutUndefined(licencies),
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, count: licencies.length };
});

exports.adminSaveTarifs = onCall(async (request) => {
  assertAdminAuth(request);
  const saison = assertSaisonValue(request.data?.saison);
  const tarifs = request.data?.tarifs || {};
  await admin.firestore().doc(`saisons/${saison}/config/tarifs`).set({
    tarifs: withoutUndefined(tarifs),
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true };
});

exports.adminSaveGlobalConfig = onCall(async (request) => {
  assertAdminAuth(request);
  const config = request.data?.config || {};
  await admin.firestore().doc("config/global").set({
    ...withoutUndefined(config),
    _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

const updateEmailError = async (ref, error, source) => {
  await ref.set({
    emailAttestationStatus: "erreur",
    emailAttestationErreur: clean(error.message || error),
    emailAttestationErreurLe: new Date().toISOString(),
    emailAttestationSource: source,
  }, { merge: true });
};

const sendConfirmationForDoc = async ({ saison, id, source = "auto-preinscription" }) => {
  const ref = admin.firestore().doc(`saisons/${saison}/preinscriptions/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Dossier introuvable.");
  const entry = snap.data();
  if (entry.emailConfirmationEnvoyeLe) {
    return { ok: true, alreadySent: true, to: entry.emailConfirmationDernierDestinataire || getEmailContact(entry) };
  }
  const to = clean(getEmailContact(entry));
  if (!to) throw new HttpsError("failed-precondition", "Aucun email de contact trouve.");
  const tarifs = await getTarifs(saison);
  if (tarifs._confirmationEmailEnabled === false) {
    return { ok: true, disabled: true, to };
  }

  await ref.set({
    emailConfirmationStatus: "envoi",
    emailConfirmationErreur: null,
    emailConfirmationSource: source,
  }, { merge: true });

  try {
    const subjectTpl = clean(tarifs._confirmationEmailSubject) || CONFIRMATION_EMAIL_SUBJECT_DEFAUT;
    const bodyTpl = clean(tarifs._confirmationEmailTemplate) || CONFIRMATION_EMAIL_TEMPLATE_DEFAUT;
    const subject = htmlToText(renderConfirmationTemplate(subjectTpl, entry, tarifs)).replace(/\s+/g, " ").trim();
    const html = renderConfirmationTemplate(bodyTpl, entry, tarifs);
    const result = await callGmail({
      to,
      subject,
      html,
      text: htmlToText(html),
    });
    const messageId = result?.messageId || "";
    await ref.set({
      emailConfirmationEnvoye: true,
      emailConfirmationEnvoyeLe: new Date().toISOString(),
      emailConfirmationDernierDestinataire: to,
      emailConfirmationMessageId: messageId,
      emailConfirmationStatus: "envoye",
      emailConfirmationErreur: null,
      emailConfirmationSource: source,
    }, { merge: true });
    return { ok: true, to, messageId };
  } catch (error) {
    await ref.set({
      emailConfirmationStatus: "erreur",
      emailConfirmationErreur: clean(error.message || error),
      emailConfirmationErreurLe: new Date().toISOString(),
      emailConfirmationSource: source,
    }, { merge: true });
    throw error;
  }
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
  const members = attestationsForEntry(entry);
  if (!members.length) {
    await ref.set({
      emailAttestationStatus: "non_requise",
      emailAttestationErreur: null,
      emailAttestationSource: source,
      emailAttestationIgnoreeLe: new Date().toISOString(),
      emailAttestationNbPiecesJointes: 0,
    }, { merge: true });
    return { ok: true, skipped: true, reason: "Attestation non requise pour une licence dirigeant gratuite." };
  }
  const to = clean(getEmailContact(entry));
  if (!to) throw new HttpsError("failed-precondition", "Aucun email de contact trouve.");

  try {
    await ref.set({
      emailAttestationStatus: "envoi",
      emailAttestationErreur: null,
      emailAttestationSource: source,
    }, { merge: true });
    const attachments = await Promise.all(members.map(async (member) => {
      const pdf = await createAttestationPdf(member);
      return {
        ContentType: "application/pdf",
        Filename: `${safeName(`Attestation_RSG_${member.prenom}_${member.nom}_${member.categorie}_${entry.saison}`)}.pdf`,
        Base64Content: pdf.toString("base64"),
      };
    }));
    const html = mailHtml(entry, members);
    const subject = attestationSubject(entry, members);
    const result = await callGmail({
      to,
      subject,
      html,
      text: htmlToText(html),
      attachments,
    });
    const messageId = result?.messageId || "";
    await ref.set({
      emailAttestationEnvoye: true,
      emailAttestationEnvoyeLe: new Date().toISOString(),
      emailAttestationDernierDestinataire: to,
      emailAttestationMessageId: messageId,
      emailAttestationNbPiecesJointes: attachments.length,
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

exports.sendAttestationEmail = onCall({ secrets: GMAIL_SECRETS }, async (request) => {
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

const safeEmailHtml = (html) => String(html || "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
  .replace(/<object[\s\S]*?<\/object>/gi, "")
  .replace(/<embed[\s\S]*?<\/embed>/gi, "")
  .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
  .replace(/\shref\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, " href=\"#\"");

const normalizeBulkRecipient = (recipient = {}) => ({
  key: clean(recipient.key),
  email: clean(recipient.email).toLowerCase(),
  nom: clean(recipient.nom),
  prenom: clean(recipient.prenom),
  categorie: clean(recipient.categorie),
  type: clean(recipient.type),
  reference: clean(recipient.reference),
  source: clean(recipient.source),
});

const renderBulkEmailTemplate = (template, recipient, saison) => {
  const replacements = {
    "{prenom}": escapeHtml(recipient.prenom),
    "{nom}": escapeHtml(recipient.nom),
    "{categorie}": escapeHtml(recipient.categorie),
    "{type}": escapeHtml(recipient.type),
    "{reference}": escapeHtml(recipient.reference),
    "{saison}": escapeHtml(saison),
    "{source}": escapeHtml(recipient.source),
  };
  return Object.entries(replacements).reduce(
    (value, [key, replacement]) => String(value || "").split(key).join(replacement),
    template || ""
  );
};

const BULK_ATTACHMENT_MAX_FILES = 5;
const BULK_ATTACHMENT_MAX_FILE_BYTES = 5 * 1024 * 1024;
const BULK_ATTACHMENT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const normalizeBulkAttachment = (file) => {
  const filename = clean(file?.Filename || file?.filename || file?.name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 160) || "piece-jointe";
  const contentType = clean(file?.ContentType || file?.contentType || file?.type).replace(/[\r\n]/g, "") || "application/octet-stream";
  const base64 = clean(file?.Base64Content || file?.base64 || file?.content).replace(/\s/g, "");
  const size = Number(file?.Size || file?.size || Math.ceil((base64.length * 3) / 4)) || 0;
  if (!base64) return null;
  return { Filename: filename, ContentType: contentType.slice(0, 120), Base64Content: base64, Size: size };
};

exports.sendBulkEmail = onCall({ secrets: GMAIL_SECRETS, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  assertAdminAuth(request);
  const saison = clean(request.data?.saison) || "2026-2027";
  const subjectTemplate = clean(request.data?.subject);
  const htmlTemplate = safeEmailHtml(request.data?.html);
  const meta = request.data?.meta || {};
  const allowDuplicateEmails = request.data?.allowDuplicateEmails === true;
  const recipientsRaw = Array.isArray(request.data?.recipients) ? request.data.recipients : [];
  const attachmentsRaw = Array.isArray(request.data?.attachments) ? request.data.attachments : [];

  if (!subjectTemplate) throw new HttpsError("invalid-argument", "Objet du mail requis.");
  if (!htmlToText(htmlTemplate).trim()) throw new HttpsError("invalid-argument", "Corps du message requis.");
  if (!recipientsRaw.length) throw new HttpsError("invalid-argument", "Aucun destinataire.");
  if (attachmentsRaw.length > BULK_ATTACHMENT_MAX_FILES) throw new HttpsError("invalid-argument", `Maximum ${BULK_ATTACHMENT_MAX_FILES} pieces jointes.`);

  const attachments = attachmentsRaw.map(normalizeBulkAttachment).filter(Boolean);
  const totalAttachmentSize = attachments.reduce((sum, file) => sum + (Number(file.Size) || 0), 0);
  if (attachments.some((file) => (Number(file.Size) || 0) > BULK_ATTACHMENT_MAX_FILE_BYTES)) {
    throw new HttpsError("invalid-argument", "Une piece jointe depasse la taille autorisee.");
  }
  if (totalAttachmentSize > BULK_ATTACHMENT_MAX_TOTAL_BYTES) {
    throw new HttpsError("invalid-argument", "Le total des pieces jointes est trop volumineux.");
  }

  const byRecipient = new Map();
  recipientsRaw.map(normalizeBulkRecipient).forEach((recipient, index) => {
    if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) return;
    const dedupeKey = allowDuplicateEmails ? (recipient.key || `${recipient.email}-${index}`) : recipient.email;
    if (!byRecipient.has(dedupeKey)) byRecipient.set(dedupeKey, recipient);
  });
  const recipients = [...byRecipient.values()];
  if (!recipients.length) throw new HttpsError("invalid-argument", "Aucune adresse email valide.");
  if (recipients.length > 350) throw new HttpsError("invalid-argument", "Envoi limite a 350 destinataires par lot.");

  const { transporter, from } = createGmailTransport();
  const sent = [];
  const failed = [];
  for (const recipient of recipients) {
    const subject = htmlToText(renderBulkEmailTemplate(subjectTemplate, recipient, saison)).replace(/\s+/g, " ").trim();
    const html = renderBulkEmailTemplate(htmlTemplate, recipient, saison);
    try {
      const result = await sendWithTransport({
        transporter,
        from,
        to: recipient.email,
        subject,
        html,
        text: htmlToText(html),
        attachments,
      });
      sent.push({ email: recipient.email, messageId: result?.messageId || "" });
    } catch (error) {
      failed.push({ email: recipient.email, error: clean(error.message || error) });
      logger.error("Bulk email recipient failed", { saison, email: recipient.email, error: clean(error.message || error) });
    }
  }

  const now = new Date().toISOString();
  await admin.firestore().collection(`saisons/${saison}/mailings`).add({
    createdAt: now,
    createdBy: request.auth?.uid || "admin",
    subject: subjectTemplate,
    source: clean(meta.source),
    filters: meta.filters || {},
    allowDuplicateEmails,
    attachments: attachments.map((file) => ({ filename: file.Filename, contentType: file.ContentType, size: file.Size })),
    requestedCount: recipientsRaw.length,
    recipientCount: recipients.length,
    sentCount: sent.length,
    failedCount: failed.length,
    failed,
  });

  return {
    ok: failed.length === 0,
    requestedCount: recipientsRaw.length,
    recipientCount: recipients.length,
    sentCount: sent.length,
    failedCount: failed.length,
    attachmentCount: attachments.length,
    failed,
  };
});

exports.autoSendConfirmationOnPreinscription = onDocumentCreated({
  document: "saisons/{saison}/preinscriptions/{id}",
  secrets: GMAIL_SECRETS,
}, async (event) => {
  try {
    const result = await sendConfirmationForDoc({
      saison: event.params.saison,
      id: event.params.id,
      source: "auto-preinscription",
    });
    if (result.disabled) {
      logger.info("Confirmation email disabled", { id: event.params.id });
    } else {
      logger.info("Confirmation email sent", { id: event.params.id, to: result.to });
    }
  } catch (error) {
    logger.error("Confirmation email failed", { id: event.params.id, error: error.message });
  }
  return null;
});

exports.autoSendAttestationOnValidation = onDocumentUpdated({
  document: "saisons/{saison}/preinscriptions/{id}",
  secrets: GMAIL_SECRETS,
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
    if (result?.skipped) {
      logger.info("Attestation email skipped", { id: event.params.id, reason: result.reason });
    } else {
      logger.info("Attestation email sent", { id: event.params.id, to: result.to });
    }
  } catch (error) {
    logger.error("Attestation email failed", { id: event.params.id, error: error.message });
  }
  return null;
});
