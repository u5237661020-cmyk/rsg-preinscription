import { useState, useEffect, useRef, useCallback } from "react";
import {
  fbSaveInscription, fbGetAllInscriptions, fbDeleteInscription, fbWatchInscriptions,
  fbSaveTarifs, fbGetTarifs, fbSaveLicencies, fbGetLicencies, isFirebaseAvailable,
  fbSaveGlobalConfig, fbSendAttestationEmail, fbSendBulkEmail,
  fbGetPublicConfig, fbAdminLogin, fbLogout, fbWatchAuth, fbLookupLicence, fbChangeAdminPassword,
} from "./firebase.js";
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, BriefcaseBusiness, CalendarDays,
  Camera, Check, CheckSquare, ChevronRight, ClipboardList, Copy, Download, Euro, ExternalLink, Eye,
  Home as HomeIcon, LayoutDashboard, LogOut, Mail, Paperclip, Rocket, RotateCcw,
  QrCode, Search, Send, Shirt, ShieldCheck, ShoppingBag, Stethoscope, Trash2, UploadCloud, UserCog,
  UserPlus, Users,
} from "lucide-react";

/* â•â• SAISONS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const saisons = (() => {
  const y = new Date().getFullYear();
  return Array.from({length:6},(_,i)=>{const s=y-1+i;return{value:`${s}-${s+1}`,label:`Saison ${s}-${s+1}`};});
})();
const SAISON_DEFAUT = `${new Date().getFullYear()}-${new Date().getFullYear()+1}`;
const ADMIN_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
const ADMIN_ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "pointerdown"];

/* â•â• STORAGE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Hiérarchie : (1) window.storage (artifacts), (2) localStorage (navigateur), (3) memory
   Firestore est utilisé en parallèle pour le partage entre appareils. */
const memStore={};
async function stGet(key){
  try{if(typeof window!=="undefined"&&typeof window.storage!=="undefined"){const r=await window.storage.get(key);if(r?.value)return JSON.parse(r.value);}}catch{}
  try{if(typeof window!=="undefined"&&window.localStorage){const v=window.localStorage.getItem(key);if(v)return JSON.parse(v);}}catch{}
  return memStore[key]??null;
}
async function stSet(key,val){
  const raw=JSON.stringify(val);
  try{if(typeof window!=="undefined"&&typeof window.storage!=="undefined"){await window.storage.set(key,raw);}}catch{}
  try{if(typeof window!=="undefined"&&window.localStorage){window.localStorage.setItem(key,raw);}}catch{}
  try{if(typeof window!=="undefined"){window.dispatchEvent(new CustomEvent("rsg-storage",{detail:{key,val}}));}}catch{}
  memStore[key]=val;
}
const keyIns=s=>`rsg_ins_${s}`;
const keyLic=s=>`rsg_lic_${s}`;
const sortInscriptions=arr=>[...(Array.isArray(arr)?arr:[])].sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||""));

/* â•â• TARIFS (modifiables ici) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const TARIFS_DEFAUT = {
  "Babyfoot":    50,
  "U6-U7":       60,
  "U8-U9":       70,
  "U10-U11":     80,
  "U12-U13":     90,
  "U14-U15":    100,
  "U16-U17-U18":110,
  "Senior":     140,
  "Dirigeant":    0,
};

// Remise famille (à partir du 2e membre de la même famille, tous confondus)
// Ces valeurs par défaut sont surchargeables dans Admin > Tarifs
const REMISE_FAMILLE_DEFAUT = {
  2: 20,   // 2e licence mineure : 20 € offerts (géré en euros)
  3: 20,
  4: 20,
};

const PERMANENCES_DEFAUT = [
  {date:"",debut:"",fin:"",lieu:"Stade du RSG",message:""},
];

const PIECES_DEFAUT = [
  {id:"certifMedical",label:"Certificat médical complété par le médecin",condition:"certif"},
  {id:"photoId",label:"Pièce d'identité (CNI ou passeport)",condition:"always"},
  {id:"justifDom",label:"Justificatif de domicile (- 3 mois)",condition:"always"},
  {id:"rib",label:"RIB",condition:"always"},
  {id:"livretFamille",label:"Livret de famille (obligatoire pour tarif famille)",condition:"famille"},
  {id:"acteNaissance",label:"Extrait d'acte de naissance",condition:"etranger"},
  {id:"residenceParents",label:"Justificatif de résidence des parents",condition:"etranger"},
  {id:"nationaliteParents",label:"Justificatif de nationalité des parents",condition:"etranger"},
];

const BOUTIQUE_DEFAUT = [
  {id:"pull_rsg",nom:"Pull RSG",categorie:"Textile",prix:25,tailles:["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L","XL","2XL","3XL"],actif:true,imageBase64:""},
  {id:"short_rsg",nom:"Short RSG",categorie:"Équipement joueur",prix:12,tailles:["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L","XL","2XL","3XL"],actif:true,imageBase64:""},
  {id:"chaussettes_rsg",nom:"Chaussettes RSG",categorie:"Équipement joueur",prix:7,tailles:["27-30","31-34","35-38","39-42","43-46"],actif:true,imageBase64:""},
];
const BOUTIQUE_CATEGORIES_DEFAUT = ["Dotation licence","Textile","Équipement joueur","Accessoires","Commande spéciale"];

// Modes de paiement
// CB et Espèces : 1 fois uniquement (en permanence)
// Chèque : fractionnement 1 à 4 fois sans frais
const MODES_PAIEMENT_DEFAUT = [
  {id:"cb",     l:"Carte bancaire",    fractionnable:false, lieu:"En permanence licence"},
  {id:"cheque", l:"Cheque",            fractionnable:true,  lieu:"En permanence licence"},
  {id:"especes",l:"Especes",           fractionnable:false, lieu:"En permanence licence"},
  {id:"rib",    l:"RIB / virement",    fractionnable:true,  lieu:"Selon consignes du club"},
  {id:"kado_mairie",l:"K'ADO Mairie",   fractionnable:false, lieu:"En permanence licence"},
  {id:"up_sport",l:"Up sport",          fractionnable:false, lieu:"En permanence licence"},
];
const MODES_PAIEMENT = MODES_PAIEMENT_DEFAUT;

/* â•â• CONSTANTES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const C = {J:"#F5C800",Jd:"#D6A900",Jp:"#FFF8D6",N:"#111827",Nm:"#1F2937",Ns:"#374151",G:"#697386",Gc:"#F6F7FB",Gb:"#E8ECF3",W:"#FFFFFF",V:"#16a34a",R:"#dc2626",B:"#2563eb"};
const FONT="'Open Sans','Segoe UI',system-ui,-apple-system,sans-serif";
const CATS = [
  {l:"Babyfoot",v:"Babyfoot"},
  {l:"U6/U7",v:"U6-U7"},
  {l:"U8/U9",v:"U8-U9"},
  {l:"U10/U11",v:"U10-U11"},
  {l:"U12/U13",v:"U12-U13"},
  {l:"U14/U15",v:"U14-U15"},
  {l:"U16/U17/U18",v:"U16-U17-U18"},
  {l:"Seniors",v:"Senior"},
  {l:"Dirigeants",v:"Dirigeant"},
];
const DIRIGEANT_RATTACHEMENT_CATS = CATS.filter(c=>c.v!=="Dirigeant");
const ORDRE_CATS = CATS.map(c=>c.v);
const canonicalCat = cat => ["U12","U13"].includes(cat) ? "U12-U13" : ["Vétéran","Vétérans","Veteran","Veterans"].includes(cat) ? "Senior" : cat;
const catLabel = cat => CATS.find(c=>c.v===canonicalCat(cat))?.l || cat;
const prixCategorie = (tarifs, cat) => {
  const t=tarifs || TARIFS_DEFAUT;
  const c=canonicalCat(cat);
  return Number(t[c] ?? (c==="U12-U13" ? (t.U12 ?? t.U13) : 0) ?? 0);
};
const isMinorCategory = cat => !["Senior","Dirigeant"].includes(canonicalCat(cat));
const orderedTarifEntries = tarifs => [...ORDRE_CATS.map(cat=>[cat,prixCategorie(tarifs,cat)]),...Object.entries(tarifs||{}).filter(([k])=>!k.startsWith("_")&&!ORDRE_CATS.includes(k)&&!["U12-U13","U12","U13","Vétéran","Veteran","Vétérans","Veterans"].includes(k)).sort(([a],[b])=>a.localeCompare(b))];
const catRank = cat => {
  const adminOrder=["Babyfoot","U6/U7","U8/U9","U10/U11M","U10/U11F","U12/U13M","U12/U13F","U14/U15M","U14/U15F","U16/U17/U18M","U16/U17/U18F","Seniors M","Seniors F","Dirigeants"];
  const ai=adminOrder.indexOf(cat);
  if(ai>=0)return ai;
  const normalized=String(cat||"").replaceAll("/","-").replace(/\s*M$|\s*F$/,"");
  const i=ORDRE_CATS.indexOf(normalized);
  return i>=0?i:999;
};
const sortCats = cats => [...cats].sort((a,b)=>catRank(a)-catRank(b)||String(a).localeCompare(String(b)));
const isDirigeantCategory=cat=>["Dirigeant","Dirigeants"].includes(canonicalCat(cat));
const adminCatValue=m=>{
  const cat=canonicalCat(m?.categorie||"");
  const sexe=m?.sexe||"";
  if(cat==="U6-U7")return"U6/U7";
  if(cat==="U8-U9")return"U8/U9";
  if(cat==="U10-U11")return sexe==="Féminin"?"U10/U11F":"U10/U11M";
  if(cat==="U12-U13")return sexe==="Féminin"?"U12/U13F":"U12/U13M";
  if(cat==="U14-U15")return sexe==="Féminin"?"U14/U15F":"U14/U15M";
  if(cat==="U16-U17-U18")return sexe==="Féminin"?"U16/U17/U18F":"U16/U17/U18M";
  if(cat==="Senior")return sexe==="Féminin"?"Seniors F":"Seniors M";
  if(cat==="Dirigeant")return"Dirigeants";
  return cat;
};
const structureType=m=>{
  const cat=canonicalCat(m?.categorie||"");
  const sexe=m?.sexe||"";
  if(["Babyfoot","U6-U7","U8-U9"].includes(cat)||(cat==="U10-U11"&&sexe!=="Féminin"))return"École de foot RSG";
  if((sexe==="Féminin"&&["U10-U11","U12-U13","U14-U15","U16-U17-U18"].includes(cat))||(sexe!=="Féminin"&&["U12-U13","U14-U15","U16-U17-U18"].includes(cat)))return"Groupement Jeunes ASM/RSG";
  return"Réveil Saint-Géréon";
};
const isDirigeantMember=m=>isDirigeantCategory(m?.categorie)||m?.role==="Double licence dirigeant";
const categoryListKey=m=>isDirigeantMember(m)&&m?.dirigeantCategorie
  ? (adminCatValue({categorie:m.dirigeantCategorie,sexe:m.sexe})||catLabel(m.dirigeantCategorie)||"Dirigeants")
  : (adminCatValue(m)||"?");
const categoryListRoleTag=m=>isDirigeantMember(m)?"Dirigeant":"Joueur";
const catBirthYears=(cat,saison)=>{
  const y=parseInt(String(saison||"").match(/(\d{4})/)?.[1]||new Date().getFullYear(),10);
  const ranges={
    Babyfoot:`${y-4}-${y-3}`,
    "U6-U7":`${y-6}-${y-5}`,
    "U8-U9":`${y-8}-${y-7}`,
    "U10-U11":`${y-10}-${y-9}`,
    "U12-U13":`${y-12}-${y-11}`,
    "U14-U15":`${y-14}-${y-13}`,
    "U16-U17-U18":`${y-17}-${y-15}`,
    Senior:`${y-33} et avant`,
    Dirigeant:"encadrement"
  };
  return ranges[cat]||"";
};
const catBirthText=(cat,saison)=>{
  const years=catBirthYears(cat,saison);
  if(!years)return"";
  return cat==="Dirigeant"?"Encadrement":`Nés ${years}`;
};
const catOptionLabel=(c,saison)=>`${c.l}${catBirthText(c.v,saison)?` - ${catBirthText(c.v,saison)}`:""}`;
const ATTESTATION_TEMPLATE_DEFAUT=`<div class="attestation-assets-v2">
<div class="head">
  <img class="logo" src="{logoUrl}" alt="RSG">
  <div>
    <div class="club">RÉVEIL SAINT-GÉRÉON</div>
    <div>Attestation de licence · Saison {saison}</div>
  </div>
</div>

<h1>Attestation de règlement et d'inscription</h1>

<div class="box">
  Le club <strong>Réveil Saint-Géréon</strong> atteste que <strong>{prenom} {nom}</strong>,
  né(e) le <strong>{dateNaissance}</strong>, est enregistré(e) pour la saison
  <strong>{saison}</strong> en catégorie <strong>{categorie}</strong>.
  <br><br>
  Le règlement de la licence est indiqué comme reçu par le secrétariat du club.
</div>

<div class="meta">
  Référence dossier : <strong>{reference}</strong><br>
  Date de paiement : <strong>{datePaiement}</strong><br>
  Montant licence : <strong>{montant} €</strong>
</div>

<div class="sig">
  <div>Fait à Saint-Géréon, le {dateJour}</div>
  <div class="sig-right">Pour le Réveil Saint-Géréon<br><img class="signature" src="{signatureUrl}" alt="Cachet et signature"></div>
</div>
</div>`;
const getAttestationTemplate=tarifs=>{
  const tpl=tarifs?._attestationTemplate;
  return tpl&&String(tpl).includes("attestation-assets-v2")?tpl:ATTESTATION_TEMPLATE_DEFAUT;
};
const CONFIRMATION_EMAIL_SUBJECT_DEFAUT="Votre préinscription RSG est bien reçue - Saison {saison}";
const CONFIRMATION_EMAIL_TEMPLATE_DEFAUT=`<p>Bonjour <strong>{prenom}</strong>,</p>

<p>Merci pour votre préinscription au <strong>Réveil Saint-Géréon</strong> pour la saison <strong>{saison}</strong>.</p>

<p>Nous avons bien reçu le dossier de <strong>{prenom} {nom}</strong>.</p>

<p>
  <strong>Référence dossier :</strong> {reference}<br>
  <strong>Catégorie :</strong> {categorie}<br>
  <strong>Montant licence :</strong> {montant} €<br>
  <strong>Paiement :</strong> {modePaiement}
</p>

<p><strong>Important :</strong> cette préinscription ne valide pas encore définitivement l'inscription.</p>

<p>La validation finale sera faite par le club lors d'une permanence licence, après vérification du dossier et réception du paiement. Elle reste également sous réserve des places disponibles, notamment pour les nouveaux joueurs.</p>

<p>Pour préparer votre passage en permanence, merci d'apporter si nécessaire :</p>
{documents}

<p><strong>Permanences licence :</strong></p>
{permanences}

<p>À très bientôt au club,</p>

<p>Sportivement,<br><strong>Le Réveil Saint-Géréon</strong></p>`;
const getConfirmationEmailSubject=tarifs=>tarifs?._confirmationEmailSubject||CONFIRMATION_EMAIL_SUBJECT_DEFAUT;
const getConfirmationEmailTemplate=tarifs=>tarifs?._confirmationEmailTemplate||CONFIRMATION_EMAIL_TEMPLATE_DEFAUT;
const pdfAssetUrl=name=>`${import.meta.env.BASE_URL||"/"}${name}`;
const getCertificatPdfUrl=tarifs=>tarifs?._certificatMedicalPdfUrl||tarifs?._certificatMedicalPdfDataUrl||pdfAssetUrl("certificat_medical_2026_2027.pdf");
const getChartePdfUrl=tarifs=>tarifs?._chartePdfUrl||tarifs?._chartePdfDataUrl||pdfAssetUrl("Charte_RSG_2026-2027.pdf");
const getGuideInscriptionPdfUrl=tarifs=>tarifs?._guideInscriptionPdfUrl||tarifs?._guideInscriptionPdfDataUrl||pdfAssetUrl("guide_inscription_RSG_2026-2027.pdf");
const getPublicAppUrl=()=>{
  const base=import.meta.env.BASE_URL||"/";
  if(typeof window==="undefined")return base;
  return new URL(base,window.location.origin).href;
};
const getQrCodeImageUrl=value=>`https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&format=svg&data=${encodeURIComponent(value)}`;
const normalizeExternalUrl=url=>{
  const raw=String(url||"").trim();
  if(!raw)return"";
  return /^https?:\/\//i.test(raw)?raw:`https://${raw}`;
};
const getBoutiqueEnLigneUrl=tarifs=>normalizeExternalUrl(tarifs?._boutiqueEnLigneUrl);
const showBoutiqueEnLigne=tarifs=>tarifs?._boutiqueEnLigneEnabled===true&&!!getBoutiqueEnLigneUrl(tarifs);
const getCoutInitiales=tarifs=>Number(tarifs?._coutInitiales??3);
const getChampsInitiales=tarifs=>{
  const fields=Array.isArray(tarifs?._champsInitiales)?tarifs._champsInitiales:[];
  return fields;
};
const initialesAutorisees=(field,tarifs)=>false;
const getInitialesItems=(m,tarifs)=>[];
const countInitiales=(m,tarifs)=>getInitialesItems(m,tarifs).length;
const formatInitiales=(m,tarifs)=>getInitialesItems(m,tarifs).map(x=>`${x.field==="global"?"Équipement":EQUIP_LABELS[x.field]||x.field}: ${x.text}`).join(" · ");
const renderTpl=(tpl,e,tarifs)=>{
  const dateJour=new Date().toLocaleDateString("fr-FR");
  const aDesMembresFamille=(e?.freresSoeurs?.length||0)>0||(e?.adultesFamille?.length||0)>0;
  const docs=getDocsAApporter(e||{},!!e?.certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
  return String(tpl||"")
    .replaceAll("{prenom}",e?.prenom||"")
    .replaceAll("{nom}",e?.nom||"")
    .replaceAll("{dateNaissance}",fmtD(e?.dateNaissance))
    .replaceAll("{saison}",e?.saison||"")
    .replaceAll("{categorie}",catLabel(e?.categorie)||"")
    .replaceAll("{reference}",e?.id||"")
    .replaceAll("{montant}",String(e?.prixFinal||0))
    .replaceAll("{datePaiement}",fmtD(e?.datePaiement)||dateJour)
    .replaceAll("{dateJour}",dateJour)
    .replaceAll("{logoUrl}",`${import.meta.env.BASE_URL||"/"}rsg-logo.png`)
    .replaceAll("{signatureUrl}",`${import.meta.env.BASE_URL||"/"}rsg-signature.png`)
    .replaceAll("{modePaiement}",paiementLabels(e?.modePaiements,e?.modePaiement,tarifs).join(" + ")||"À choisir en permanence")
    .replaceAll("{documents}",docs.length?`<ul>${docs.map(d=>`<li>${d}</li>`).join("")}</ul>`:"<p>Aucune pièce complémentaire indiquée.</p>")
    .replaceAll("{permanences}",permanences.length?`<ul>${permanences.map(p=>`<li>${fmtPermanenceHtml(p)}</li>`).join("")}</ul>`:"<p>Dates communiquées prochainement.</p>");
};
const POSTES = ["Gardien","Défenseur central","Latéral droit","Latéral gauche","Milieu défensif","Milieu central","Milieu offensif","Ailier droit","Ailier gauche","Attaquant","Pas de préférence"];
const NATS   = ["Française","Algérienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Ukrainienne","Libanaise","Sénégalaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Autre"];
const LIENS  = ["Père","Mère","Tuteur légal","Grand-parent","Frère/Sœur majeur(e)"];
// Tailles disponibles selon catégorie
const TA = ["14 ans / 164cm","16 ans / 174cm","S","M","L","XL","2XL","3XL","4XL"];
const TE = ["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm"];
const TADO = ["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L"];
const TCHAUSSETTES = ["23-26","27-30","31-34","35-38","39-42","43-46","47-49"];
const getBoutiqueBase = tarifs => {
  const boutique = tarifs?._boutique;
  const base = Array.isArray(boutique) && boutique.length ? boutique : BOUTIQUE_DEFAUT;
  return base.map(a=>{
    const def=BOUTIQUE_DEFAUT.find(d=>d.id===a.id||d.nom===a.nom);
    return {...a,categorie:a.categorie||def?.categorie||"Commande spéciale"};
  });
};
const findBoutiqueArticle = (tarifs,item={}) => {
  const articles=getBoutiqueBase(tarifs);
  return articles.find(a=>a.id===item.productId)||articles.find(a=>normArticleName(a.nom)===normArticleName(item.label||dotationArticleName(item)))||null;
};
const DOTATIONS_DEFAUT = {
  Babyfoot:[],
  "U6-U7":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  "U8-U9":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  "U10-U11":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES},{id:"tailleSweat",label:"Pull RSG",actif:true}],
  U10:[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES},{id:"tailleSweat",label:"Pull RSG",actif:true}],
  U11:[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  "U12-U13":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  U12:[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES},{id:"tailleTshirt",label:"T-shirt groupement",actif:true},{id:"tailleSurvet",label:"Survêtement",actif:true}],
  U13:[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  "U14-U15":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  "U16-U17-U18":[{id:"tailleShort",label:"Short",actif:true},{id:"tailleChaussettes",label:"Chaussettes",actif:true,tailles:TCHAUSSETTES}],
  Senior:[{id:"tailleSweat",label:"Quart de zip",actif:true}],
  Dirigeant:[],
};
const DOTATION_CATS = CATS.flatMap(c=>{
  if(c.v==="U10-U11")return[{v:"U10",l:"U10"},{v:"U11",l:"U11"}];
  if(c.v==="U12-U13")return[{v:"U12",l:"U12"},{v:"U13",l:"U13"}];
  return[c];
});
const DOTATION_PARENT = {U10:"U10-U11",U11:"U10-U11",U12:"U12-U13",U13:"U12-U13"};
const dotationCatLabel=cat=>DOTATION_CATS.find(c=>c.v===cat)?.l||catLabel(cat);
const dotationConfigKey = cat => ["U10","U11","U12","U13"].includes(cat) ? cat : canonicalCat(cat);
const EQUIP_LABELS = {tailleShort:"Short",tailleChaussettes:"Chaussettes",tailleSweat:"Quart de zip / pull",tailleSurvet:"Survêtement",tailleTshirt:"T-shirt groupement"};
const EQUIP_FIELDS = ["tailleShort","tailleChaussettes","tailleSweat","tailleSurvet","tailleTshirt"];
const dotationDisplayLabel=label=>{
  const n=normArticleName(label);
  if(n.includes("chaussette"))return"Chaussettes RSG";
  if(n.includes("short"))return"Short RSG";
  if(n.includes("survet"))return"Survêtement";
  if(n.includes("t shirt")||n.includes("tee shirt")||n.includes("tshirt"))return"T-shirt groupement";
  if(n.includes("quart"))return"Quart de zip";
  if(n.includes("pull")||n.includes("sweat"))return"Pull RSG";
  return label;
};
const dotationSemanticId=item=>{
  const id=String(item?.id||"");
  const n=normArticleName(item?.label||dotationArticleName(item)||id);
  if(n.includes("chaussette"))return"tailleChaussettes";
  if(n.includes("short"))return"tailleShort";
  if(n.includes("survet"))return"tailleSurvet";
  if(n.includes("t shirt")||n.includes("tee shirt")||n.includes("tshirt"))return"tailleTshirt";
  if(n.includes("quart")||n.includes("pull")||n.includes("sweat"))return"tailleSweat";
  return EQUIP_FIELDS.includes(id)?id:id||n;
};
const isSweatDotation=item=>dotationSemanticId(item)==="tailleSweat";
const sanitizeDotationForCat=(cat,items)=>
  cat==="U11"?(items||[]).filter(item=>!isSweatDotation(item)):(items||[]);
const getDotationRuleNote=cat=>{
  if(cat==="U10")return"Pull RSG inclus automatiquement pour tous les U10.";
  if(cat==="U11")return"Nouvelles licences / retours U11 : Pull RSG ajouté automatiquement. Renouvellements U11 : pas de pull.";
  return"";
};
const dotationItemScore=item=>(item?.productId?4:0)+(String(item?.label||"").includes("RSG")?2:0)+(String(item?.label||"").trim()?1:0);
const dedupeDotationItems=items=>{
  const byId={};
  (items||[]).filter(item=>item&&item.actif!==false).forEach(item=>{
    const id=dotationSemanticId(item);
    const label=dotationDisplayLabel(item.label||EQUIP_LABELS[id]||id);
    const normalized={...item,id,label,actif:true};
    const previous=byId[id];
    if(!previous){byId[id]=normalized;return;}
    const chosen=dotationItemScore(normalized)>dotationItemScore(previous)?normalized:previous;
    byId[id]={
      ...chosen,
      id,
      tailles:[...new Set([...(previous.tailles||[]),...(normalized.tailles||[])])],
      productId:chosen.productId||previous.productId||normalized.productId||"",
    };
  });
  return Object.values(byId);
};

// Retourne les tailles à proposer selon la catégorie
const getTaillesCat=cat=>{
  const c=canonicalCat(cat);
  if(["Senior","Dirigeant"].includes(c))return TA;
  if(["U12-U13","U14-U15","U16-U17-U18"].includes(c))return TADO;
  return TE; // Babyfoot, U6-U7, U8-U9, U10-U11
};
const getDotations = tarifs => {
  const custom = tarifs?._dotations || {};
  const merged = {};
  DOTATION_CATS.forEach(({v})=>{
    const parent=DOTATION_PARENT[v];
    const source = ["Babyfoot","Dirigeant","Senior"].includes(v)
      ? DOTATIONS_DEFAUT[v]
      : (Array.isArray(custom[v]) ? custom[v] : (DOTATIONS_DEFAUT[v] || (parent?DOTATIONS_DEFAUT[parent]:[])));
    merged[v] = sanitizeDotationForCat(v,source).map(item=>({
      id:item.id,
      productId:item.productId||"",
      label:findBoutiqueArticle(tarifs,item)?.nom||item.label||EQUIP_LABELS[item.id]||item.id,
      actif:item.actif!==false,
      tailles:item.id==="tailleChaussettes"?TCHAUSSETTES:(findBoutiqueArticle(tarifs,item)?.tailles?.length?findBoutiqueArticle(tarifs,item).tailles:(Array.isArray(item.tailles)&&item.tailles.length?item.tailles:getTaillesCat(v))),
    })).filter(item=>item.id);
  });
  return merged;
};
const getDotationCat = (tarifs,cat) => {
  const key=dotationConfigKey(cat);
  const dots=getDotations(tarifs);
  if(dots[key])return dedupeDotationItems(dots[key]);
  if(key==="U10-U11")return dedupeDotationItems([...(dots.U10||[]),...(dots.U11||[])]);
  if(key==="U12-U13")return dedupeDotationItems([...(dots.U12||[]),...(dots.U13||[])]);
  return [];
};
const publicDotationDisplayLabel=dotationDisplayLabel;
const publicDotationGroups=(tarifs,cat)=>{
  const c=canonicalCat(cat);
  const labelsFor=key=>[...new Set(getDotationCat(tarifs,key).map(i=>publicDotationDisplayLabel(i.label)).filter(Boolean))];
  const group=(label,key,note="")=>({label,items:labelsFor(key),note});
  if(c==="U10-U11"){
    const u11=group("U11","U11","Nouveaux U11 : Pull RSG en plus.");
    if(u11.items.some(i=>normArticleName(i).includes("pull")))u11.note="";
    return[group("U10","U10"),u11];
  }
  if(c==="U12-U13")return[group("U12","U12"),group("U13","U13")];
  if(c==="Dirigeant")return[{label:"Dirigeants",items:[],note:"Pas de dotation textile. Chèque boutique de 50 € prévu."}];
  const items=labelsFor(c);
  if(!items.length)return[{label:catLabel(c),items:[],note:c==="Babyfoot"?"Pas de dotation prévue pour le Babyfoot.":"Aucune dotation prévue."}];
  return[{label:catLabel(c),items}];
};
const dotationItemFromBoutique=(tarifs,cat,id,label,tailles=TADO)=>{
  const article=findBoutiqueArticle(tarifs,{id,label});
  return {id,label:article?.nom||label,productId:article?.id||"",actif:true,tailles:article?.tailles?.length?article.tailles:tailles};
};
const getSaisonStartYear=saison=>parseInt(String(saison||SAISON_DEFAUT).match(/(\d{4})/)?.[1]||new Date().getFullYear(),10);
const getMemberDotationKey=(member,categorie,saison=SAISON_DEFAUT)=>{
  const cat=canonicalCat(categorie);
  const saisonStart=getSaisonStartYear(member?.dossier?.saison||member?.saison||saison);
  const by=birthYear(member?.dateNaissance);
  if(cat==="U10-U11"){
    if(by===saisonStart-9)return"U10";
    if(by===saisonStart-10)return"U11";
  }
  if(cat==="U12-U13"){
    if(by===saisonStart-11)return"U12";
    if(by===saisonStart-12)return"U13";
  }
  return cat;
};
const getMemberDotationItems=(member,categorie,tarifs,saison=SAISON_DEFAUT)=>{
  const cat=canonicalCat(categorie);
  const dotCat=getMemberDotationKey(member,categorie,saison);
  const hasSpecificCustom=Array.isArray(tarifs?._dotations?.[dotCat]);
  let items=getDotationCat(tarifs,dotCat);
  const isNew=(member?.typeLicence||"nouvelle")==="nouvelle";
  const isU10=cat==="U10-U11"&&dotCat==="U10";
  const isU11=cat==="U10-U11"&&dotCat==="U11";
  const isNewU11=isU11&&isNew;
  if(isU11&&!isNew)items=items.filter(item=>!isSweatDotation(item));
  if((isU10||isNewU11)&&!items.some(i=>i.id==="tailleSweat"))items=[...items,dotationItemFromBoutique(tarifs,dotCat,"tailleSweat","Pull RSG",TADO)];
  if(!hasSpecificCustom&&cat==="U12-U13"&&(dotCat==="U12"||isNew)){
    if(!items.some(i=>i.id==="tailleTshirt"))items=[...items,dotationItemFromBoutique(tarifs,cat,"tailleTshirt","T-shirt groupement",TADO)];
    if(!items.some(i=>i.id==="tailleSurvet"))items=[...items,dotationItemFromBoutique(tarifs,cat,"tailleSurvet","Survêtement",TADO)];
  }
  return dedupeDotationItems(items);
};
const dotationValueForMember=(member,item)=>String(item.id==="tailleSurvet"?getSurvet(member):member?.[item.id]||"").trim();
const getDotationRecapRows=(member,categorie,tarifs,saison=SAISON_DEFAUT)=>
  getMemberDotationItems(member,categorie,tarifs,saison)
    .map(item=>({label:item.label,value:dotationValueForMember(member,item)}))
    .filter(row=>row.value);
const getMemberMissingDotations=(member,tarifs,saison=SAISON_DEFAUT)=>
  getMemberDotationItems(member,member?.categorie,tarifs,saison)
    .filter(item=>!dotationValueForMember(member,item))
    .map(item=>item.label);
function EquipFields({member,categorie,onChange,tarifs,required=false,saison=SAISON_DEFAUT,errors={}}){
  const items=getMemberDotationItems(member,categorie,tarifs,saison);
  const cat=canonicalCat(categorie);
  if(!cat)return <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Choisissez d'abord une catégorie pour afficher les équipements compris avec la licence.</p>;
  if(cat==="Dirigeant")return <p style={{fontSize:12,color:"#92400e",fontWeight:800,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px",margin:"0 0 10px"}}>Pas de dotation textile dirigeant. Un chèque boutique de 50 € est prévu pour cette licence.</p>;
  if(cat==="Babyfoot")return <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Pas de dotation prévue pour le Babyfoot.</p>;
  if(!items.length)return <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Aucune dotation configurée pour cette catégorie.</p>;
  const setInitiales=(field,value)=>{
    const current={...(member?.initialesEquipementItems||{})};
    if(value===null)delete current[field];
    else current[field]=value;
    onChange("initialesEquipementItems",current);
  };
  return <div style={G2}>
    {items.map(item=>{
      const initiales=member?.initialesEquipementItems?.[item.id]||"";
      const checked=Object.prototype.hasOwnProperty.call(member?.initialesEquipementItems||{},item.id);
      const allowInitiales=initialesAutorisees(item.id,tarifs);
      return <div key={item.id} style={{marginBottom:12}}>
        <F label={`${item.label}${required?" *":""}`} err={errors[item.id]}>
      <select style={inp(errors[item.id])} value={member?.[item.id]||""} onChange={e=>onChange(item.id,e.target.value)}>
        <option value="">— Choisir</option>
        {(item.tailles||getTaillesCat(categorie)).map(t=><option key={t} value={t}>{t}</option>)}
      </select>
        </F>
        {allowInitiales&&<label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.G,fontWeight:800,marginTop:-6,cursor:"pointer"}}>
          <input type="checkbox" checked={checked} onChange={e=>setInitiales(item.id,e.target.checked?(initiales||member?.initialesTexte||""):null)} style={{accentColor:C.J}}/>
          Initiales sur {item.label} (+{getCoutInitiales(tarifs)} €)
        </label>}
        {allowInitiales&&checked&&<input style={{...inp(),minHeight:36,padding:"8px 10px",fontSize:13,marginTop:6}} value={initiales} onChange={e=>setInitiales(item.id,e.target.value.toUpperCase().slice(0,6))} placeholder="Ex: PB"/>}
      </div>;
    })}
  </div>;
}

// Indique si un sweat RSG est proposé pour cette catégorie (U10-U11 uniquement)
const aSweat=cat=>cat==="U10-U11";
const aSurvet=cat=>canonicalCat(cat)==="U12-U13";
const STATUTS = {
  attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:""},
  incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:""},
  valide:{l:"Valide",c:"#16a34a",bg:"#dcfce7",i:"✓",hint:"Licence reglee"},
  refuse:{l:"Refuse",c:"#6b7280",bg:"#f3f4f6",i:""},
  paye:{l:"Valide",c:"#16a34a",bg:"#dcfce7",i:"✓",hint:"Ancien statut paye"},
};
const STATUT_ORDER=["attente","incomplet","valide","refuse"];
const dossierStatusPatch=(statut,current={})=>{
  const now=new Date().toISOString();
  return statut==="valide"
    ?{statut:"valide",datePaiement:current.datePaiement||now,dateValidation:current.dateValidation||now}
    :{statut,datePaiement:null,dateValidation:null};
};
const saveFirebaseOrWarn=async(saison,entry,actionLabel="modification",options={})=>{
  if(!isFirebaseAvailable()||!entry)return false;
  try{
    await fbSaveInscription(saison,entry);
    return true;
  }catch(err){
    console.error("Erreur synchronisation Firebase",err);
    const msg=err?.message||String(err||"");
    const deletedConflict=(err?.code||"").includes("failed-precondition")||/supprim/i.test(msg);
    if(typeof window!=="undefined"&&deletedConflict){
      window.dispatchEvent(new CustomEvent("rsg-force-firebase-refresh",{detail:{saison,reason:"deleted-conflict"}}));
    }
    if(typeof window!=="undefined"&&!options.silent){
      const warnKey=`${saison}:${entry.id||""}:${actionLabel}:${err?.code||msg}`;
      const now=Date.now();
      window.__rsgSyncWarns=window.__rsgSyncWarns||{};
      if(!window.__rsgSyncWarns[warnKey]||now-window.__rsgSyncWarns[warnKey]>60000){
        window.__rsgSyncWarns[warnKey]=now;
        window.alert(deletedConflict
          ? `Ce dossier a ete supprime sur Firebase. L'affichage va etre recharge pour eviter de restaurer une ancienne copie locale.`
          : `Sauvegarde Firebase impossible pour cette ${actionLabel}. La modification n'est pas appliquee sur ce poste pour eviter un ecart entre les ordinateurs : ${msg}`);
      }
    }
    return false;
  }
};
const refreshFirebaseInscriptions=async(saison,setData,tarifs=null)=>{
  if(!isFirebaseAvailable())return false;
  const raw=await fbGetAllInscriptions(saison);
  const fresh=tarifs?normalizeInscriptionsForDisplay(raw,tarifs):sortInscriptions(raw);
  if(typeof setData==="function")setData(fresh);
  await stSet(keyIns(saison),fresh);
  return true;
};
const STATUTS_FOOTCLUBS = {
  a_integrer:{l:"À intégrer",c:"#ca8a04",bg:"#fef9c3"},
  integre:{l:"Intégré",c:"#2563eb",bg:"#dbeafe"},
  incomplet:{l:"Incomplet dans Footclubs",c:"#dc2626",bg:"#fee2e2"},
  valide:{l:"Validé dans Footclubs",c:"#16a34a",bg:"#dcfce7"},
};
const STATUT_FOOTCLUBS_ORDER=["a_integrer","integre","incomplet","valide"];
const STATUTS_BOUTIQUE = {
  a_regler:{l:"À régler",c:"#ca8a04",bg:"#fef9c3"},
  regle:{l:"Réglé",c:"#16a34a",bg:"#dcfce7"},
  commande:{l:"Commandé",c:"#2563eb",bg:"#dbeafe"},
  attente_fournisseur:{l:"En attente fournisseur",c:"#7c3aed",bg:"#ede9fe"},
  recu:{l:"Reçu club",c:"#0891b2",bg:"#cffafe"},
  livre:{l:"Livré",c:"#15803d",bg:"#dcfce7"},
  annule:{l:"Annulé",c:"#6b7280",bg:"#f3f4f6"},
};

// Base licenciés Footclubs : vide par saison tant qu'un import manuel n'a pas été fait.
const BASE_FOOTCLUBS = []

const F0 = {
  typeLicence:"",numLicenceFFF:"",numPersonne:"",
  nom:"",prenom:"",dateNaissance:"",sexe:"",lieuNaissance:"",
  nationalite:"Française",nationaliteAutre:"",
  adresse:"",codePostal:"",ville:"",
  email:"",telephone:"",
  categorie:"",poste:"",ancienClub:"",aJoueAutreClub:false,mutationNotes:"",dirigeantArbitre:false,
  // Représentants légaux : tableau pour permettre d'en ajouter (au-delà des 2 par défaut)
  representants:[
    {nom:"",prenom:"",lien:"",tel:"",email:""},  // Resp. principal
  ],
  // Médical
  mutuelle:"",numSecu:"",allergiesAsthme:"",docteur:"",telDocteur:"",
  // Autorisations COCHÉES PAR DÉFAUT
  autoSoins:true,autoPhoto:true,autoTransport:true,
  // Documents
  certifMedical:false,photoId:false,justifDom:false,rib:false,livretFamille:false,
  charteAcceptee:false,
  // Équipement
  tailleShort:"",tailleChaussettes:"",tailleTshirt:"",tailleSurvet:"",tailleSweat:"",
  initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},doubleLicenceDirigeant:false,dirigeantCategorie:"",
  // Photo d'identité (obligatoire)
  photoBase64:"",
  // Famille
  freresSoeurs:[], // mineurs : {nom,prenom,dateNaissance,sexe,categorie,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleTshirt,tailleSurvet,tailleSweat,photoBase64}
  adultesFamille:[], // adultes : {nom,prenom,dateNaissance,sexe,nationalite,categorie,tel,email,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,photoBase64}
  // Commentaire libre
  commentaire:"",
  // Paiement
  modePaiement:"",modePaiements:[],montantsPaiement:{},nbFois:1,nomFamille:"",dateEcheance1:"",datesEcheances:[],
};

/* â•â• HELPERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const genId  = ()=>"RSG-"+Date.now().toString(36).toUpperCase().slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();
const fmtD   = iso=>iso?new Date(iso).toLocaleDateString("fr-FR"):"—";
const fmtDT  = iso=>iso?new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const calcAge= dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate()))a--;return a;};
const birthYear=dob=>{
  if(!dob)return null;
  const s=String(dob).trim();
  const m=s.match(/^(\d{4})-\d{2}-\d{2}$/)||s.match(/^\d{2}\/\d{2}\/(\d{4})$/);
  const y=m?parseInt(m[1],10):new Date(s).getFullYear();
  return Number.isFinite(y)?y:null;
};
// Détermine la catégorie d'un joueur en fonction de son année de naissance pour la saison sélectionnée
// Ex: pour saison 2026-2027, U6-U7 = né en 2020 ou 2021
const suggestCat=(dob,saison)=>{
  if(!dob)return"";
  const yr=birthYear(dob);
  if(!yr)return"";
  // Année de référence = année de fin de saison - 1 (logique footballistique : la saison 2026-2027 démarre en août 2026)
  // On extrait l'année de début de saison (ex: "2026-2027" → 2026)
  const m=(saison||"").match(/(\d{4})-/);
  const sStart=m?parseInt(m[1]):new Date().getFullYear();
  const age=sStart-yr; // âge atteint dans l'année de début de saison
  // Mapping selon les catégories U définies (n=âge atteint, ex: U7 = né il y a moins de 7 ans au 31/12 de la saison)
  if(yr>=sStart-4)return"Babyfoot";        // 2022+ pour 2026-2027 (4 ans et moins)
  if(yr>=sStart-6)return"U6-U7";           // 2020-2021
  if(yr>=sStart-8)return"U8-U9";           // 2018-2019
  if(yr>=sStart-10)return"U10-U11";        // 2016-2017
  if(yr>=sStart-12)return"U12-U13";
  if(yr>=sStart-14)return"U14-U15";        // 2012-2013
  if(yr>=sStart-17)return"U16-U17-U18";    // 2009-2011
  return"Senior";                            // 2008 et avant : Seniors
};
const normalizeCategoryForMember=(cat,dateNaissance,saison=SAISON_DEFAUT)=>{
  const c=canonicalCat(cat||"");
  if(CATS.some(x=>x.v===c))return c;
  const byBirth=suggestCat(dateNaissance,saison);
  if(byBirth)return byBirth;
  const raw=String(cat||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\/\s]+/g,"-");
  const nums=[...raw.matchAll(/U-?(\d+)/g)].map(m=>parseInt(m[1],10)).filter(Number.isFinite);
  const maxU=nums.length?Math.max(...nums):null;
  if(maxU!==null){
    if(maxU<=7)return"U6-U7";
    if(maxU<=9)return"U8-U9";
    if(maxU<=11)return"U10-U11";
    if(maxU<=13)return"U12-U13";
    if(maxU<=15)return"U14-U15";
    if(maxU<=18)return"U16-U17-U18";
    return"Senior";
  }
  return c;
};
// Indique si un certif médical sera requis pour la saison sélectionnée (= saison de préinscription)
// Le fichier Footclubs (saison N) contient une colonne "Validité Certif Médic N+1"
// qui indique la validité du certif pour la saison N+1 — celle des préinscriptions saisies dans l'app.
// Nouveau format Footclubs : champ `cm` (true = "Non valide" → certif à fournir, false = "Valide" → OK)
// Ancien format : champ anneeLastCertif (validité 3 saisons)
const certifRequis=lic=>{
  if(!lic)return null;
  if(typeof lic.cm==="boolean")return lic.cm;
  const annee=lic.anneeLastCertif||lic.a;
  if(!annee)return null;
  const s=new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1;
  return s>=parseInt(annee)+3;
};
// Compatibilité ancien/nouveau format : retourne le 1er représentant légal
const getResp1=e=>{
  if(e.representants&&e.representants[0]&&e.representants[0].nom)return e.representants[0];
  if(e.resp1Nom)return{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  return null;
};
const getEmailContact=e=>e.isMajeur?(e.email||""):(getResp1(e)?.email||"");
const getTelContact=e=>e.isMajeur?(e.telephone||""):(getResp1(e)?.tel||"");
const getAllergies=e=>e.allergiesAsthme||e.allergies||(e.restrictions?` ${e.restrictions}`:"")||"";
const getSurvet=e=>e.tailleSurvet||e["tailleSurvêtement"]||"";

const lookupLicNum=v=>String(v||"").replace(/\D/g,"");
const lookupLic=(lics,nom,prenom,num)=>{if(!lics?.length)return null;const nn=nom.toLowerCase().trim(),pp=prenom.toLowerCase().trim(),target=lookupLicNum(num);if(target){const x=lics.find(l=>[l.numLicence,l.l,l.numLicenceFFF,l.np,l.numPersonne,l.numeroPersonne,l.personne].some(v=>lookupLicNum(v)===target));if(x)return x;}return lics.find(l=>(l.nom||l.n)?.toLowerCase().trim()===nn&&(l.prenom||l.p)?.toLowerCase().trim()===pp)||null;};
const licNumPersonne=lic=>getLicValue(lic,"np","numPersonne","numeroPersonne","personne")||"";

// Calcul du prix avec remise famille
const calcPrix = (categorie, rang, tarifs) => {
  const base = prixCategorie(tarifs, categorie);
  const remises = getRemisesFamille(tarifs);
  const discount = rang >= 4 ? remises[4] : (remises[rang] || 0);
  return Math.max(0, Math.round(base - (rang>=2 && isMinorCategory(categorie) ? Number(discount||0) : 0)));
};

const getRemisesFamille = tarifs => ({...REMISE_FAMILLE_DEFAUT,...(tarifs?._remises||{})});
const normalizeModePaiement = (m,i=0) => ({
  id:m?.id||String(m?.l||m?.label||`mode_${i}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")||`mode_${i}`,
  l:m?.l||m?.label||"Mode de paiement",
  fractionnable:!!m?.fractionnable,
  lieu:m?.lieu||"En permanence licence",
  actif:m?.actif!==false
});
const getModesPaiement = tarifs => {
  const modes=Array.isArray(tarifs?._modesPaiement)?tarifs._modesPaiement.map(normalizeModePaiement).filter(m=>m.l&&m.actif!==false):[];
  return modes.length?modes:MODES_PAIEMENT_DEFAUT;
};
const paiementLabels = (modePaiements,modePaiement,tarifs) => {
  const modes=getModesPaiement(tarifs);
  const ids=(Array.isArray(modePaiements)&&modePaiements.length?modePaiements:(modePaiement?[modePaiement]:[])).filter(Boolean);
  return ids.map(id=>modes.find(m=>m.id===id)?.l||id).filter(Boolean);
};
const getPermanences = tarifs => {
  const permanences = tarifs?._permanences;
  return Array.isArray(permanences) && permanences.length ? permanences : PERMANENCES_DEFAUT;
};
const JOURS_ENTRAINEMENT = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const LIEUX_ENTRAINEMENT = [
  "Stade Charles Ardoux, Terrain synthétique, Saint-Géréon",
  "Stade Charles Ardoux, Terrain en herbe, Saint-Géréon",
  "Stade Gabriel Borday, Terrain synthétique, Mésanger",
];
const planningLieuOptions=value=>{
  const v=String(value||"").trim();
  return v&&!LIEUX_ENTRAINEMENT.includes(v)?[v,...LIEUX_ENTRAINEMENT]:LIEUX_ENTRAINEMENT;
};
const hasFeminineCategory = cat => !["Babyfoot","U6-U7","U8-U9"].includes(canonicalCat(cat));
const planningSectionOptions = cat => hasFeminineCategory(cat)
  ? [{v:"Tous",l:"Tous"},{v:"Masculin",l:"Masculins"},{v:"Féminin",l:"Féminines"}]
  : [{v:"Tous",l:"Mixte"}];
const normalizeCreneauEntrainement = c => {
  const categorie=canonicalCat(c?.categorie||"");
  return {
    id:c?.id||`creneau_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    categorie,
    sexe:hasFeminineCategory(categorie)?(c?.sexe||"Tous"):"Tous",
    jour:c?.jour||"Mercredi",
    debut:c?.debut||"",
    fin:c?.fin||"",
    lieu:c?.lieu||"",
    note:c?.note||"",
    responsableNom:c?.responsableNom||"",
    responsablePrenom:c?.responsablePrenom||"",
    responsableTel:c?.responsableTel||"",
  };
};
const getPlanningEntrainements = tarifs => {
  const rows = tarifs?._planningEntrainements;
  return Array.isArray(rows) ? rows.map(normalizeCreneauEntrainement).filter(c=>c.categorie&&c.jour&&(c.debut||c.fin||c.lieu)) : [];
};
const planningSexeLabel = sexe => sexe==="Féminin"?"Féminines":sexe==="Masculin"?"Masculins":"Tous";
const planningOptionLabel = c => `${catLabel(c.categorie)}${c.sexe&&c.sexe!=="Tous"?` ${planningSexeLabel(c.sexe)}`:""}`;
const planningRespKey = (categorie,sexe="Tous") => `${canonicalCat(categorie)}|${sexe||"Tous"}`;
const normalizePlanningRespKeyValue = key => {
  const [categorie,sexe="Tous"]=String(key||"").split("|");
  return planningRespKey(categorie,sexe);
};
const normalizePlanningResponsable = r => ({
  key:r?.key||planningRespKey(r?.categorie,r?.sexe),
  categorie:canonicalCat(r?.categorie||String(r?.key||"").split("|")[0]||""),
  sexe:r?.sexe||String(r?.key||"").split("|")[1]||"Tous",
  nom:r?.nom||r?.responsableNom||"",
  prenom:r?.prenom||r?.responsablePrenom||"",
  tel:r?.tel||r?.responsableTel||"",
});
const getPlanningResponsables = tarifs => {
  const rows=Array.isArray(tarifs?._planningResponsables)?tarifs._planningResponsables.map(normalizePlanningResponsable):[];
  const byKey=Object.fromEntries(rows.filter(r=>r.categorie).map(r=>[planningRespKey(r.categorie,r.sexe),r]));
  // Migration douce des anciens responsables saisis sur les créneaux.
  getPlanningEntrainements(tarifs).forEach(c=>{
    const key=planningRespKey(c.categorie,c.sexe);
    if(!byKey[key]&&(c.responsableNom||c.responsablePrenom||c.responsableTel)){
      byKey[key]=normalizePlanningResponsable({categorie:c.categorie,sexe:c.sexe,nom:c.responsableNom,prenom:c.responsablePrenom,tel:c.responsableTel});
    }
  });
  return Object.values(byKey);
};
const getPlanningResponsablesHiddenKeys = tarifs => Array.isArray(tarifs?._planningResponsablesHiddenKeys)
  ? [...new Set(tarifs._planningResponsablesHiddenKeys.map(normalizePlanningRespKeyValue).filter(Boolean))]
  : [];
const planningResponsableOptionLabel = (categorie,sexe="Tous") => {
  const section=planningSectionOptions(categorie).find(o=>o.v===(sexe||"Tous"))?.l || planningSexeLabel(sexe);
  return `${catLabel(categorie)} · ${section}`;
};
const planningResponsableLabelFromKey = key => {
  const [categorie,sexe="Tous"]=String(key||"").split("|");
  return planningResponsableOptionLabel(categorie,sexe);
};
const getPlanningResponsableOptions = (responsables=[],hiddenKeys=[]) => {
  const hidden=new Set(hiddenKeys.map(normalizePlanningRespKeyValue));
  const byKey={};
  const add=(categorie,sexe,label)=>{
    const key=planningRespKey(categorie,sexe);
    if(hidden.has(key))return;
    byKey[key]={categorie:canonicalCat(categorie),sexe:sexe||"Tous",label:label||planningResponsableOptionLabel(categorie,sexe),key};
  };
  CATS.forEach(cat=>planningSectionOptions(cat.v).forEach(opt=>add(cat.v,opt.v,`${cat.l} · ${opt.l}`)));
  (responsables||[]).map(normalizePlanningResponsable).filter(r=>r.categorie).forEach(r=>add(r.categorie,r.sexe,planningResponsableOptionLabel(r.categorie,r.sexe)));
  return Object.values(byKey).sort((a,b)=>
    catRank(adminCatValue({categorie:a.categorie,sexe:a.sexe}))-catRank(adminCatValue({categorie:b.categorie,sexe:b.sexe}))
    || ["Tous","Masculin","Féminin"].indexOf(a.sexe)-["Tous","Masculin","Féminin"].indexOf(b.sexe)
    || a.label.localeCompare(b.label,"fr")
  );
};
const planningResponsableFor = (tarifs,categorie,sexe="Tous") => getPlanningResponsables(tarifs).find(r=>planningRespKey(r.categorie,r.sexe)===planningRespKey(categorie,sexe));
const planningContactLabel = c => {
  const nom=[c?.prenom||c?.responsablePrenom,c?.nom||c?.responsableNom].filter(Boolean).join(" ").trim();
  return [nom,c?.tel||c?.responsableTel].filter(Boolean).join(" · ");
};
const creneauLabel = c => `${c.jour}${c.debut||c.fin?` ${c.debut||"?"}-${c.fin||"?"}`:""}${c.lieu?` · ${c.lieu}`:""}${c.note?` · ${c.note}`:""}`;
const planningSort = (a,b) => JOURS_ENTRAINEMENT.indexOf(a.jour)-JOURS_ENTRAINEMENT.indexOf(b.jour)||(a.debut||"99:99").localeCompare(b.debut||"99:99")||catRank(adminCatValue({categorie:a.categorie,sexe:a.sexe}))-catRank(adminCatValue({categorie:b.categorie,sexe:b.sexe}));
const planningForEntry = (tarifs, entry) => {
  const membres=membresDossier(entry||{});
  return getPlanningEntrainements(tarifs).filter(c=>membres.some(m=>canonicalCat(m.categorie)===canonicalCat(c.categorie)&&(!c.sexe||c.sexe==="Tous"||c.sexe===m.sexe)));
};
const parseTrainingTime=t=>{
  const m=String(t||"").trim().match(/^(\d{1,2})[:hH]?(\d{2})$/);
  if(!m)return null;
  const h=Math.min(23,Math.max(0,parseInt(m[1],10)));
  const mn=Math.min(59,Math.max(0,parseInt(m[2],10)));
  return h*60+mn;
};
const fmtTrainingTime=mins=>`${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
const clampTrainingMinutes=mins=>Math.max(0,Math.min(23*60+59,mins));
const snapTrainingMinutes=(mins,step=15)=>clampTrainingMinutes(Math.round(mins/step)*step);
const addTrainingMinutes=(time,delta)=> {
  const start=parseTrainingTime(time);
  return start===null?"":fmtTrainingTime(clampTrainingMinutes(start+delta));
};
const trainingCalendarRange=rows=>{
  const times=rows.flatMap(c=>[parseTrainingTime(c.debut),parseTrainingTime(c.fin)]).filter(v=>v!==null);
  if(!times.length)return{start:9*60,end:15*60,hours:[9,10,11,12,13,14,15]};
  const start=Math.max(7*60,Math.floor(Math.min(...times)/60)*60);
  let end=Math.min(23*60,Math.ceil(Math.max(...times)/60)*60);
  if(end-start<180)end=start+180;
  const hours=Array.from({length:Math.floor((end-start)/60)+1},(_,i)=>start/60+i);
  return{start,end,hours};
};
const planningCardPalette=[
  {bg:"#ffedd5",accent:"#fb923c",fg:"#111827"},
  {bg:"#dbeafe",accent:"#2563eb",fg:"#111827"},
  {bg:"#dcfce7",accent:"#22c55e",fg:"#111827"},
  {bg:"#fce7f3",accent:"#ec4899",fg:"#111827"},
  {bg:"#ede9fe",accent:"#8b5cf6",fg:"#111827"},
  {bg:"#cffafe",accent:"#06b6d4",fg:"#111827"},
  {bg:"#fef9c3",accent:"#eab308",fg:"#111827"},
  {bg:"#e2e8f0",accent:"#334155",fg:"#111827"},
];
const PLANNING_CATEGORY_COLORS={
  Babyfoot:{bg:"#fff7ed",accent:"#f97316",fg:"#111827"},
  "U6/U7":{bg:"#fef9c3",accent:"#eab308",fg:"#111827"},
  "U8/U9":{bg:"#dcfce7",accent:"#22c55e",fg:"#111827"},
  "U10/U11":{bg:"#dbeafe",accent:"#2563eb",fg:"#111827"},
  "U10/U11M":{bg:"#dbeafe",accent:"#2563eb",fg:"#111827"},
  "U10/U11F":{bg:"#ccfbf1",accent:"#14b8a6",fg:"#111827"},
  "U12/U13":{bg:"#ede9fe",accent:"#8b5cf6",fg:"#111827"},
  "U12/U13M":{bg:"#ede9fe",accent:"#8b5cf6",fg:"#111827"},
  "U12/U13F":{bg:"#fce7f3",accent:"#ec4899",fg:"#111827"},
  "U14/U15":{bg:"#e0f2fe",accent:"#0284c7",fg:"#111827"},
  "U14/U15M":{bg:"#e0f2fe",accent:"#0284c7",fg:"#111827"},
  "U14/U15F":{bg:"#ffe4e6",accent:"#f43f5e",fg:"#111827"},
  "U16/U17/U18":{bg:"#f3e8ff",accent:"#a855f7",fg:"#111827"},
  "U16/U17/U18M":{bg:"#f3e8ff",accent:"#a855f7",fg:"#111827"},
  "U16/U17/U18F":{bg:"#d1fae5",accent:"#10b981",fg:"#111827"},
  "Seniors":{bg:"#e2e8f0",accent:"#334155",fg:"#111827"},
  "Seniors M":{bg:"#e2e8f0",accent:"#334155",fg:"#111827"},
  "Seniors F":{bg:"#fae8ff",accent:"#d946ef",fg:"#111827"},
  "Dirigeants":{bg:"#fef3c7",accent:"#d97706",fg:"#111827"},
};
const planningColorKey=c=>{
  const cat=canonicalCat(c?.categorie||"");
  const base=catLabel(cat);
  const sexe=c?.sexe||"Tous";
  const needsSuffix=["U10-U11","U12-U13","U14-U15","U16-U17-U18","Senior"].includes(cat);
  if(needsSuffix&&sexe==="Féminin")return`${base}F`;
  if(needsSuffix&&sexe==="Masculin")return`${base}M`;
  return base;
};
const planningCardColors=c=>{
  const key=planningColorKey(c);
  if(PLANNING_CATEGORY_COLORS[key])return PLANNING_CATEGORY_COLORS[key];
  const idx=[...String(key)].reduce((s,ch)=>s+ch.charCodeAt(0),0)%planningCardPalette.length;
  return planningCardPalette[idx];
};
const planningLegendItems=rows=>{
  const byKey={};
  (rows||[]).forEach(c=>{
    const key=planningColorKey(c);
    if(!key)return;
    byKey[key]||={key,count:0,sample:c};
    byKey[key].count+=1;
  });
  return sortCats(Object.keys(byKey)).map(key=>({...byKey[key],colors:planningCardColors(byKey[key].sample)}));
};
const getPieces = tarifs => {
  const pieces = tarifs?._pieces;
  return Array.isArray(pieces) && pieces.length ? pieces : PIECES_DEFAUT;
};
const normArticleName=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const dotationArticleName = item => {
  if(item.id==="tailleShort")return"Short RSG";
  if(item.id==="tailleChaussettes")return"Chaussettes RSG";
  if(item.id==="tailleSurvet")return"Survêtement";
  if(item.id==="tailleTshirt")return"T-shirt groupement";
  if(item.id==="tailleSweat")return String(item.label||"").toLowerCase().includes("quart")?"Quart de zip":"Pull RSG";
  return item.label||EQUIP_LABELS[item.id]||item.id;
};
const dotationFieldForArticle = article => {
  const n=normArticleName(article?.nom);
  if(n.includes("chaussette"))return"tailleChaussettes";
  if(n.includes("short"))return"tailleShort";
  if(n.includes("survet"))return"tailleSurvet";
  if(n.includes("tee shirt")||n.includes("t shirt")||n.includes("tshirt"))return"tailleTshirt";
  if(n.includes("sweat")||n.includes("pull")||n.includes("quart"))return"tailleSweat";
  return `dot_${String(article?.id||n||Date.now()).replace(/[^a-z0-9_]+/gi,"_")}`;
};
const dotationItemFromArticle = (article,cat) => ({
  id:dotationFieldForArticle(article),
  productId:article.id,
  label:article.nom,
  actif:true,
  tailles:Array.isArray(article.tailles)&&article.tailles.length?article.tailles:getTaillesCat(cat),
});
const dotationArticles = tarifs => {
  const byName={};
  const addItem=(cat,item)=>{
    const nom=dotationArticleName(item);
    const key=normArticleName(nom);
    const tailles=Array.isArray(item.tailles)&&item.tailles.length?item.tailles:getTaillesCat(cat);
    if(!byName[key])byName[key]={id:`dotation_${key.replace(/\s+/g,"_")}`,nom,categorie:"Dotation licence",prix:0,tailles:[],actif:true,imageBase64:"",origineDotation:true,categoriesDotation:[]};
    byName[key].tailles=[...new Set([...byName[key].tailles,...tailles])];
    byName[key].categoriesDotation=[...new Set([...byName[key].categoriesDotation,dotationCatLabel(cat)])];
  };
  Object.entries(getDotations(tarifs)).forEach(([cat,items])=>{
    items.filter(item=>item.actif!==false).forEach(item=>addItem(cat,item));
  });
  [{cat:"U12-U13",id:"tailleTshirt",label:"T-shirt groupement"},{cat:"U12-U13",id:"tailleSurvet",label:"Survêtement"}].forEach(x=>addItem(x.cat,{id:x.id,label:x.label,actif:true,tailles:TADO}));
  return Object.values(byName);
};
const getBoutique = tarifs => {
  const articles=getBoutiqueBase(tarifs);
  const existing=new Set(articles.map(a=>normArticleName(a.nom)));
  dotationArticles(tarifs).forEach(a=>{
    if(existing.has(normArticleName(a.nom)))return;
    articles.push(a);
    existing.add(normArticleName(a.nom));
  });
  return articles;
};
const dotationProductKey=article=>String(article?.id||normArticleName(article?.nom)||`dot_${Date.now()}`);
const getDotationProductsHiddenKeys=tarifs=>Array.isArray(tarifs?._dotationProductsHiddenKeys)?tarifs._dotationProductsHiddenKeys:[];
const getDotationProducts=tarifs=>{
  const hidden=new Set(getDotationProductsHiddenKeys(tarifs));
  const byName=new Map();
  const add=article=>{
    if(!article?.nom)return;
    const key=dotationProductKey(article);
    const nameKey=`nom:${normArticleName(article.nom)}`;
    if(hidden.has(key)||hidden.has(nameKey))return;
    byName.set(normArticleName(article.nom),{
      ...article,
      id:key,
      categorie:"Dotation licence",
      prix:0,
      actif:article.actif!==false,
      tailles:Array.isArray(article.tailles)?article.tailles:[],
      imageBase64:article.imageBase64||"",
    });
  };
  BOUTIQUE_DEFAUT.forEach(a=>add({...a,categorie:"Dotation licence",prix:0}));
  dotationArticles(tarifs).forEach(add);
  (Array.isArray(tarifs?._dotationProducts)?tarifs._dotationProducts:[]).forEach(add);
  return [...byName.values()].filter(a=>a.actif!==false).sort((a,b)=>String(a.nom).localeCompare(String(b.nom),"fr"));
};
const dotationProductMatches=(item,article)=>{
  if(item?.productId&&item.productId===article?.id)return true;
  const itemName=normArticleName(item?.label||dotationArticleName(item));
  const articleName=normArticleName(article?.nom);
  if(itemName===articleName)return true;
  if(dotationSemanticId(item)!==dotationFieldForArticle(article))return false;
  if(dotationSemanticId(item)==="tailleSweat"){
    const itemIsQuart=itemName.includes("quart")||itemName.includes("zip");
    const articleIsQuart=articleName.includes("quart")||articleName.includes("zip");
    if(itemIsQuart||articleIsQuart)return itemIsQuart&&articleIsQuart;
    const itemIsPull=itemName.includes("pull")||itemName.includes("sweat");
    const articleIsPull=articleName.includes("pull")||articleName.includes("sweat");
    return itemIsPull&&articleIsPull;
  }
  return true;
};
const getBoutiqueCategories = tarifs => [...new Set([...BOUTIQUE_CATEGORIES_DEFAUT,...getBoutique(tarifs).map(a=>a.categorie||"Sans catégorie")])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
const isAchatSaison = a => a?.contexte==="saison";
const achatTotal = a => Number(a?.total ?? ((parseInt(a?.quantite)||0)*(parseInt(a?.prix)||0)));
const calcBoutiqueTotal = achats => (achats||[]).filter(a=>!isAchatSaison(a)).reduce((s,a)=>s+achatTotal(a),0);
const calcBoutiqueSaisonTotal = achats => (achats||[]).filter(isAchatSaison).reduce((s,a)=>s+achatTotal(a),0);
const calcTotalDossier = e => e?.prixFinal||0;
const getAchatsBoutiqueRows = data => data.flatMap(e=>(e.achatsBoutique||[]).map(a=>({entry:e,achat:a})));
const getAchatCategorie = (achat,articles=[]) => achat?.categorie || articles.find(a=>a.id===achat?.articleId)?.categorie || "Commande spéciale";
const canInitialesBoutique = article => !!article;
const markBoutiqueAchatsRegles = achats => {
  if(!Array.isArray(achats)||!achats.length)return achats;
  let changed=false;
  const now=new Date().toISOString();
  const next=achats.map(a=>{
    if(isAchatSaison(a)||(a.statut||"a_regler")!=="a_regler")return a;
    changed=true;
    return {...a,statut:"regle",dateReglement:a.dateReglement||now};
  });
  return changed?next:achats;
};
const fmtPermanence = p => {
  const date = p.date ? fmtD(p.date) : "Date à préciser";
  const horaires = p.debut || p.fin ? ` de ${p.debut || "?"} à ${p.fin || "?"}` : "";
  return `${date}${horaires}${p.lieu ? ` · ${p.lieu}` : ""}`;
};
const permanenceMessage = p => String(p?.message || p?.info || p?.commentaire || "").trim();
const htmlSafe = value => String(value ?? "")
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;");
const fmtPermanenceHtml = p => {
  const msg=permanenceMessage(p);
  return `${htmlSafe(fmtPermanence(p))}${msg?`<br><span style="color:#92400e;font-weight:700;white-space:pre-line">${htmlSafe(msg)}</span>`:""}`;
};
const normalizeNationalite = value => String(value||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .toLowerCase()
  .replace(/[^a-z]/g,"");
const isNationaliteFrancaise = value => {
  const n=normalizeNationalite(value);
  return !n || ["f","fr","fra","france","francais","francaise"].includes(n);
};
const isNationaliteEtrangere = f => {
  const values=[
    f?.nationalite,
    ...(f?.freresSoeurs||[]).map(m=>m.nationalite),
    ...(f?.adultesFamille||[]).map(m=>m.nationalite),
  ].filter(v=>String(v||"").trim());
  return values.length ? values.some(v=>!isNationaliteFrancaise(v)) : false;
};
const pieceDejaFournie = (piece,f={}) => {
  const id=piece?.id;
  if(!id)return false;
  if(f?.piecesFournies?.[id]===true)return true;
  if(f?.[id]===true)return true;
  if(id==="certifMedical"&&f?.certifMedical===true)return true;
  return false;
};
const pieceVisible = (piece, f, certifNeeded, aDesMembresFamille) => {
  if(piece.condition==="certif")return !!certifNeeded;
  if(piece.condition==="famille")return !!aDesMembresFamille;
  if(piece.condition==="etranger")return isNationaliteEtrangere(f);
  return true;
};
const getDocsAApporter = (f, certifNeeded, aDesMembresFamille, tarifs) =>
  getPieces(tarifs).filter(p=>pieceVisible(p,f,certifNeeded,aDesMembresFamille)&&!pieceDejaFournie(p,f)).map(p=>p.label).filter(Boolean);
const LicenceHelp=()=>(
  <div style={{fontSize:11,color:"#0369a1",lineHeight:1.45,margin:"-4px 0 8px"}}>
    <div>Le numéro de licence ou de personne FFF se trouve sur votre ancienne licence, dans les emails de la FFF, ou votre compte FFF.</div>
    <div style={{marginTop:6}}><strong>Info :</strong> si vous renseignez votre numéro de licence ou de personne, les informations connues vont être préremplies automatiquement. Merci de bien les vérifier.</div>
  </div>
);
const getLicValue=(lic,...keys)=>keys.map(k=>lic?.[k]).find(v=>v!==undefined&&v!==null&&v!=="")||"";
const catFromLic=lic=>getLicValue(lic,"c","categorie")||"";
const normalizeSexe=s=>/^f/i.test(s||"")?"Féminin":/^m/i.test(s||"")?"Masculin":"";

const calcEcheances = (total, nbFois) => {
  if (nbFois <= 1) return [total];
  const base = Math.floor(total / nbFois);
  const reste = total - base * (nbFois - 1);
  return [reste, ...Array(nbFois - 1).fill(base)];
};

// Calcule les dates d'encaissement à partir de la date du 1er encaissement.
// Les dates suivantes = même jour, mois suivants
const calcDatesEcheance = (date1ISO, nbFois) => {
  if (!date1ISO || nbFois <= 1) return [date1ISO || ""];
  const d = new Date(date1ISO);
  const dates = [date1ISO];
  for (let i = 1; i < nbFois; i++) {
    const next = new Date(d);
    next.setMonth(d.getMonth() + i);
    dates.push(next.toISOString().slice(0, 10));
  }
  return dates;
};
const paymentIds = e => (Array.isArray(e?.modePaiements)&&e.modePaiements.length?e.modePaiements:(e?.modePaiement?[e.modePaiement]:[])).filter(Boolean);
const paymentLabel = (id,tarifs) => getModesPaiement(tarifs).find(m=>m.id===id)?.l || id;
const paymentAmountMap = (e,tarifs,total=calcTotalDossier(e)) => {
  const ids=paymentIds(e);
  const raw=e?.montantsPaiement&&typeof e.montantsPaiement==="object"?e.montantsPaiement:{};
  const hasSaved=ids.some(id=>raw[id]!==undefined&&raw[id]!==null&&raw[id]!=="");
  if(!ids.length)return {};
  if(hasSaved)return Object.fromEntries(ids.map(id=>[id,Number(raw[id]||0)]));
  const auto=ids.length===1?[total]:calcEcheances(total,ids.length);
  return Object.fromEntries(ids.map((id,i)=>[id,Number(auto[i]||0)]));
};
const paymentSplitRows = (e,tarifs,total=calcTotalDossier(e)) => {
  const amounts=paymentAmountMap(e,tarifs,total);
  return paymentIds(e).map(id=>({id,label:paymentLabel(id,tarifs),montant:Number(amounts[id]||0)}));
};
const paymentAmountForMode = (e,id,tarifs,total=calcTotalDossier(e)) => Number(paymentAmountMap(e,tarifs,total)[id]||0);
const paymentSplitTotal = (e,tarifs,total=calcTotalDossier(e)) => paymentSplitRows(e,tarifs,total).reduce((s,r)=>s+r.montant,0);

// Compte tous les membres rattachés au dossier, y compris une éventuelle double licence dirigeant.
const countMembres = (f) => f ? 1 + (f.freresSoeurs?.length || 0) + (f.adultesFamille?.length || 0) + (f.doubleLicenceDirigeant ? 1 : 0) : 0;
const dossierAttachableIndividuel = d => d && countMembres(d)===1 && !d.doubleLicenceDirigeant;
const representantsFromDossier = d => {
  const reps=Array.isArray(d?.representants)?d.representants:[];
  const legacy=d?.resp1Nom||d?.resp1Prenom||d?.resp1Tel||d?.resp1Email
    ?[{nom:d.resp1Nom||"",prenom:d.resp1Prenom||"",lien:d.resp1Lien||"Parent",tel:d.resp1Tel||"",email:d.resp1Email||""}]
    :[];
  return [...reps,...legacy].filter(r=>r&&(r.nom||r.prenom||r.tel||r.email));
};
const mergeRepresentants = (...groups) => {
  const seen=new Set();
  return groups.flat().filter(r=>{
    const key=`${(r.nom||"").toLowerCase()}|${(r.prenom||"").toLowerCase()}|${r.tel||""}|${(r.email||"").toLowerCase()}`;
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });
};
const dossierIndividuelToFamilyMember = d => ({
  sourceDossierId:d.id||"",
  typeLicence:d.typeLicence||"nouvelle",
  numLicenceFFF:d.numLicenceFFF||"",
  numPersonne:d.numPersonne||"",
  nom:d.nom||"",
  prenom:d.prenom||"",
  dateNaissance:d.dateNaissance||"",
  sexe:d.sexe||"",
  lieuNaissance:d.lieuNaissance||"",
  nationalite:d.nationalite||"Française",
  categorie:normalizeCategoryForMember(d.categorie||"",d.dateNaissance,d.saison||SAISON_DEFAUT),
  dirigeantCategorie:d.dirigeantCategorie?normalizeCategoryForMember(d.dirigeantCategorie,"",d.saison||SAISON_DEFAUT):"",
  poste:d.poste||"",
  tel:getTelContact(d)||"",
  telephone:getTelContact(d)||"",
  email:getEmailContact(d)||"",
  ancienClub:d.ancienClub||"",
  aJoueAutreClub:!!d.aJoueAutreClub,
  mutationNotes:d.mutationNotes||"",
  allergiesAsthme:d.allergiesAsthme||d.allergies||"",
  autoSoins:d.autoSoins!==false,
  autoPhoto:d.autoPhoto!==false,
  autoTransport:d.autoTransport!==false,
  certifNeeded:!!d.certifNeeded,
  certifMedical:!!d.certifMedical,
  footclubsStatut:d.footclubsStatut||"",
  footclubsCommentaire:d.footclubsCommentaire||"",
  tailleShort:d.tailleShort||"",
  tailleChaussettes:d.tailleChaussettes||"",
  tailleTshirt:d.tailleTshirt||"",
  tailleSurvet:d.tailleSurvet||d["tailleSurvêtement"]||"",
  tailleSweat:d.tailleSweat||"",
  initialesEquipement:!!d.initialesEquipement,
  initialesTexte:d.initialesTexte||"",
  initialesEquipementItems:d.initialesEquipementItems||{},
  photoBase64:d.photoBase64||"",
});
const mergeIndividualDossiersIntoFamily = (target,sources,tarifs) => {
  const now=new Date().toLocaleDateString("fr-FR");
  const sourceMembers=(sources||[]).filter(dossierAttachableIndividuel).map(dossierIndividuelToFamilyMember);
  const mineurs=sourceMembers.filter(m=>isMinorCategory(m.categorie));
  const adultes=sourceMembers.filter(m=>!isMinorCategory(m.categorie));
  const sourceSummary=(sources||[]).map(s=>`${s.prenom||""} ${s.nom||""}`.trim()||s.id).join(", ");
  const sourceNotes=(sources||[]).filter(s=>s.notes).map(s=>`Notes ancien dossier ${s.id} (${s.prenom||""} ${s.nom||""}) : ${s.notes}`).join("\n");
  const achatsSources=(sources||[]).flatMap(s=>(s.achatsBoutique||[]).map(a=>({
    ...a,
    note:[a.note,`Rattaché depuis le dossier ${s.id}`].filter(Boolean).join(" - "),
  })));
  const achatsBoutique=[...(target.achatsBoutique||[]),...achatsSources];
  const notes=[
    target.notes||"",
    sourceSummary?`Rattachement famille le ${now} : ${sourceSummary}. Les dossiers individuels d'origine ont été fusionnés dans ce dossier.`:"",
    sourceNotes,
  ].filter(Boolean).join("\n");
  const reps=mergeRepresentants(representantsFromDossier(target),...(sources||[]).map(representantsFromDossier));
  const merged={
    ...target,
    nomFamille:target.nomFamille||target.nom||sources?.[0]?.nom||"",
    representants:reps.length?reps:(target.representants||[]),
    freresSoeurs:[...(target.freresSoeurs||[]),...mineurs],
    adultesFamille:[...(target.adultesFamille||[]),...adultes],
    notes,
    achatsBoutique,
    boutiqueTotal:calcBoutiqueTotal(achatsBoutique),
  };
  return recalcDossierPrix(merged,tarifs);
};
const emptyAdminStandaloneMember=(saison=SAISON_DEFAUT)=>({
  typeLicence:"nouvelle",
  numLicenceFFF:"",
  numPersonne:"",
  nom:"",
  prenom:"",
  dateNaissance:"",
  sexe:"",
  lieuNaissance:"",
  nationalite:"Française",
  categorie:"",
  dirigeantCategorie:"",
  contactTel:"",
  contactEmail:"",
  adresse:"",
  codePostal:"",
  ville:"",
  respNom:"",
  respPrenom:"",
  respLien:"Parent",
  respTel:"",
  respEmail:"",
  photoBase64:"",
  certifMedical:false,
  notes:`Créé depuis l'admin le ${new Date().toLocaleDateString("fr-FR")}`,
  saison,
});
const emptyAdminFamilyMember=(kind="mineur",entry={})=>({
  typeLicence:"nouvelle",
  numLicenceFFF:"",
  numPersonne:"",
  nom:entry.nom||"",
  prenom:"",
  dateNaissance:"",
  sexe:"",
  nationalite:"Française",
  categorie:kind==="adulte"?"Senior":"",
  dirigeantCategorie:"",
  tel:"",
  email:"",
  ancienClub:"",
  aJoueAutreClub:false,
  allergiesAsthme:"",
  autoSoins:true,
  autoPhoto:true,
  autoTransport:true,
  tailleShort:"",
  tailleChaussettes:"",
  tailleTshirt:"",
  tailleSurvet:"",
  tailleSweat:"",
  initialesEquipement:false,
  initialesTexte:"",
  initialesEquipementItems:{},
  photoBase64:"",
});
const recalcDossierPrix=(entry,tarifs)=>{
  const entrySaison=entry.saison||SAISON_DEFAUT;
  const normalizedEntry={
    ...entry,
    categorie:normalizeCategoryForMember(entry.categorie||"",entry.dateNaissance,entrySaison),
    dirigeantCategorie:entry.dirigeantCategorie?normalizeCategoryForMember(entry.dirigeantCategorie,"",entrySaison):"",
    freresSoeurs:(entry.freresSoeurs||[]).map(m=>({...m,categorie:normalizeCategoryForMember(m.categorie||"",m.dateNaissance,entrySaison)})),
    adultesFamille:(entry.adultesFamille||[]).map(m=>({...m,categorie:normalizeCategoryForMember(m.categorie||"",m.dateNaissance,entrySaison),dirigeantCategorie:m.dirigeantCategorie?normalizeCategoryForMember(m.dirigeantCategorie,"",entrySaison):""})),
  };
  const cats=[
    normalizedEntry.categorie,
    ...(normalizedEntry.freresSoeurs||[]).map(m=>m.categorie),
    ...(normalizedEntry.adultesFamille||[]).map(m=>m.categorie),
    ...(normalizedEntry.doubleLicenceDirigeant?["Dirigeant"]:[]),
  ].filter(Boolean);
  const remises=getRemisesFamille(tarifs);
  let total=0;
  const detail=cats.map((cat,i)=>{
    const rang=i+1;
    const base=prixCategorie(tarifs,cat);
    const remise=(rang>=2&&isMinorCategory(cat))?Number((rang>=4?(remises[4]||0):(remises[rang]||0))||0):0;
    const prix=Math.max(0,Math.round(base-remise));
    total+=prix;
    return{categorie:cat,rang,base,pct:remise,prix};
  });
  const nbInitiales=[normalizedEntry,...(normalizedEntry.freresSoeurs||[]),...(normalizedEntry.adultesFamille||[])].reduce((s,m)=>s+countInitiales(m,tarifs),0);
  const supplementInitiales=nbInitiales*getCoutInitiales(tarifs);
  return{...normalizedEntry,prixLicences:total,supplementInitiales,prixFinal:total+supplementInitiales,detailPrix:detail,tarifBase:prixCategorie(tarifs,normalizedEntry.categorie)};
};
const normalizeInscriptionsForDisplay=(list,tarifs)=>sortInscriptions(Array.isArray(list)?list:[]).map(e=>recalcDossierPrix(e,tarifs));
const membresDossier = e => {
  const detail=e.detailPrix||[];
  const mk=(m,idx,role)=>({
    ...m,
    dossier:e,
    dossierId:e.id,
    role,
    idx,
    nom:m.nom||e.nom,
    prenom:m.prenom||e.prenom,
    categorie:normalizeCategoryForMember(m.categorie||e.categorie,m.dateNaissance||e.dateNaissance,e.saison||SAISON_DEFAUT),
    dateNaissance:m.dateNaissance||e.dateNaissance,
    sexe:m.sexe||e.sexe,
    poste:m.poste||e.poste,
    photoBase64:m.photoBase64||e.photoBase64,
    footclubsStatut:m.footclubsStatut||e.footclubsStatut,
    footclubsCommentaire:m.footclubsCommentaire||e.footclubsCommentaire,
    typeLicence:m.typeLicence||e.typeLicence,
    statut:e.statut,
    certifNeeded:idx===0?e.certifNeeded:(m.certifNeeded||false),
    prix:detail[idx]?.prix ?? (idx===0?e.prixFinal:0),
  });
  const membres=[
    mk(e,0,"Joueur principal"),
    ...(e.freresSoeurs||[]).map((m,i)=>mk(m,i+1,"Famille")),
    ...(e.adultesFamille||[]).map((m,i)=>mk(m,1+(e.freresSoeurs?.length||0)+i,"Famille adulte")),
  ];
  if(e.doubleLicenceDirigeant)membres.push(mk({...e,categorie:"Dirigeant",dirigeantCategorie:e.dirigeantCategorie},membres.length,"Double licence dirigeant"));
  return membres;
};
const attestationRequiredForMember=m=>!isDirigeantCategory(m?.categorie||m?.dossier?.categorie);
const membresAttestationDossier=e=>membresDossier(e).filter(attestationRequiredForMember);
const dossierHasAttestation=e=>membresAttestationDossier(e).length>0;
const attestationEntryForMember=(m,tarifs)=>{
  const d=m?.dossier||m||{};
  const categorie=normalizeCategoryForMember(m.categorie||d.categorie,m.dateNaissance||d.dateNaissance,d.saison||m.saison||SAISON_DEFAUT);
  return {
    ...d,
    ...m,
    id:d.id||m.id,
    saison:d.saison||m.saison,
    nom:m.nom||d.nom,
    prenom:m.prenom||d.prenom,
    dateNaissance:m.dateNaissance||d.dateNaissance,
    categorie,
    prixFinal:m.prix ?? prixCategorie(tarifs,categorie) ?? d.prixFinal ?? 0,
    tarifBase:m.prix ?? prixCategorie(tarifs,categorie) ?? d.tarifBase ?? 0,
    datePaiement:d.datePaiement,
    dateValidation:d.dateValidation,
    modePaiements:d.modePaiements,
    modePaiement:d.modePaiement,
  };
};
const tousMembresDossiers = data => data.flatMap(membresDossier);
const copyText=txt=>navigator.clipboard?.writeText(String(txt||""));
const safeFileName=s=>String(s||"photo").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9_-]+/gi,"_").replace(/^_+|_+$/g,"")||"photo";
const dataUrlExt=dataUrl=>{
  const m=String(dataUrl||"").match(/^data:image\/([a-zA-Z0-9+.-]+);/);
  const ext=(m?.[1]||"jpg").toLowerCase().replace("jpeg","jpg");
  return ext==="svg+xml"?"svg":ext;
};
const downloadDataUrl=(dataUrl,name)=>{
  if(!dataUrl)return;
  const a=document.createElement("a");
  a.href=dataUrl;
  a.download=`${safeFileName(name)}.${dataUrlExt(dataUrl)}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
};
const footclubsRows=m=>{
  const e=m.dossier||{};
  const r=getResp1(e)||{};
  const reps=(e.representants||[]).filter(x=>x?.nom||x?.prenom);
  const email=getEmailContact(e)||m.email||"";
  const tel=getTelContact(e)||m.tel||"";
  return[
    ["Nom",m.nom||""],
    ["Prénom",m.prenom||""],
    ["N° licence",m.numLicenceFFF||e.numLicenceFFF||""],
    ["N° personne",m.numPersonne||e.numPersonne||""],
    ["Date de naissance",fmtD(m.dateNaissance)],
    ["Sexe",m.sexe||e.sexe||""],
    ["Nationalité",m.nationalite||e.nationalite||""],
    ["Lieu de naissance",m.lieuNaissance||e.lieuNaissance||""],
    ["Catégorie",catLabel(m.categorie)||""],
    ["Poste",m.poste||e.poste||""],
    ["Type licence",m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle licence"],
    ["Ancien club",m.ancienClub||e.ancienClub||""],
    ["Email contact",email],
    ["Téléphone contact",tel],
    ["Adresse",e.adresse||""],
    ["Code postal",e.codePostal||""],
    ["Ville",e.ville||""],
    ["Responsable légal 1",r.nom?`${r.prenom||""} ${r.nom||""}`.trim():""],
    ["Lien responsable 1",r.lien||""],
    ["Téléphone responsable 1",r.tel||""],
    ["Email responsable 1",r.email||""],
    ["Autres responsables",reps.slice(1).map(x=>`${x.prenom||""} ${x.nom||""} (${x.lien||""}) ${x.tel||""} ${x.email||""}`.trim()).join(" | ")],
    ["Certificat médical",m.certifNeeded?"À fournir":"OK"],
    ["Commentaire Footclubs",m.footclubsCommentaire||""],
  ];
};
const footclubsText=m=>footclubsRows(m).filter(([,v])=>String(v||"").trim()).map(([k,v])=>`${k} : ${v}`).join("\n");

/* â•â• EXPORT EXCEL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const loadXLSX=()=>new Promise((res,rej)=>{if(window.XLSX){res(window.XLSX);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});
const mkSheet=rows=>{const XLSX=window.XLSX;const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0]?.map((_,i)=>({wch:Math.min(50,Math.max(10,...rows.map(r=>String(r[i]||"").length)))}));return ws;};
const sheetName=n=>(n||"Feuille").replace(/[\\/?*:[\]]/g," ").slice(0,31);
const EXPORT_CFG_KEY="rsg_export_config";
const getExportConfig=()=>{try{return JSON.parse(localStorage.getItem(EXPORT_CFG_KEY)||"{}")||{};}catch{return{};}};
const saveExportConfig=cfg=>{try{localStorage.setItem(EXPORT_CFG_KEY,JSON.stringify(cfg||{}));}catch{}};
const filterExportRows=(rows,fields=[])=>{
  if(!Array.isArray(fields)||!fields.length||!Array.isArray(rows)||!rows.length)return rows;
  const header=rows[0]||[];
  const idx=header.map((h,i)=>fields.includes(String(h))?i:-1).filter(i=>i>=0);
  if(!idx.length)return rows;
  return rows.map(r=>idx.map(i=>r?.[i]??""));
};
const exportFileName=(fname,target)=>target==="google"?String(fname||"Export.xlsx").replace(/\.xlsx$/i,"_GoogleSheets.xlsx"):fname;
const exportXLSX=async(sheets,fname)=>{
  const cfg=getExportConfig();
  const fields=Array.isArray(cfg.fields)?cfg.fields:[];
  const target=cfg.target||"xlsx";
  const finalSheets=(sheets.length?sheets:[{name:"Aucun",rows:[["Aucune donnée"]]}]).map(s=>({...s,rows:filterExportRows(s.rows,fields)}));
  const XLSX=await loadXLSX();
  const wb=XLSX.utils.book_new();
  finalSheets.forEach(({name,rows})=>XLSX.utils.book_append_sheet(wb,mkSheet(rows),sheetName(name)));
  XLSX.writeFile(wb,exportFileName(fname,target));
};

const H_INS = ["Référence","Saison","Date préinscription","Type licence","Statut dossier","Validé/payé le","Nom","Prénom","Naissance","Sexe","Nationalité","Lieu naiss.","Adresse","CP","Ville","Téléphone contact","Email contact","Catégorie licence","Catégorie admin","Structure","Poste","Ancien club","Mutation/autre club","N° Licence FFF","N° personne","Resp. principal","Lien","Tél resp.","Email resp.","Autres resp.","Mutuelle","Médecin","Tél médecin","Allergies/asthme","Soins urgence","Droit image","Transport","Charte acceptée","Certif requis","Certif fourni","Photo ID","Justif.","RIB","Livret famille","Pièces fournies","Short","Chaussettes","T-shirt","Survêtement","Pull / quart de zip","Initiales","Famille","Membres famille","Détail membres","Licence €","Boutique permanence €","Boutique saison séparée €","Total à encaisser €","Mode paiement","Nb fois","Échéances","Notes secrétariat","Commentaire famille"];

const toRow=(e,tarifs=null)=>{
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const membres=membresDossier(e);
  const boutiquePerm=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaison=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const pieces=getPieces(tarifs).filter(p=>e[p.id]||e.piecesFournies?.[p.id]).map(p=>p.label).join(" | ");
  const echeances=(e.datesEcheances||[]).filter(Boolean).map((d,i)=>`${i+1}: ${fmtD(d)}`).join(" | ");
  const detailMembres=membres.map(m=>`${m.prenom} ${m.nom} (${adminCatValue(m)}, ${m.role})`).join(" | ");
  return[e.id,e.saison||"",fmtDT(e.datePreinscription),e.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[e.statut]?.l||"",fmtD(e.datePaiement||e.dateValidation),e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.lieuNaissance||"",e.adresse,e.codePostal,e.ville,getTelContact(e),getEmailContact(e),canonicalCat(e.categorie),adminCatValue(e),structureType(e),e.poste||"",e.ancienClub||"",e.aJoueAutreClub?"Oui":"Non",e.numLicenceFFF||"",e.numPersonne||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.mutuelle||"",e.docteur||"",e.telDocteur||"",e.allergiesAsthme||e.allergies||"",e.autoSoins?"Oui":"Non",e.autoPhoto?"Oui":"Non",e.autoTransport?"Oui":"Non",e.charteAcceptee?"Oui":"Non",e.certifNeeded?"OUI":"OK",e.certifMedical?"Oui":"Non",e.photoId?"Oui":"Non",e.justifDom?"Oui":"Non",e.rib?"Oui":"Non",e.livretFamille?"Oui":"Non",pieces,e.tailleShort||"",e.tailleChaussettes||"",e.tailleTshirt||"",e.tailleSurvet||e["tailleSurvêtement"]||"",e.tailleSweat||"",formatInitiales(e,tarifs),e.nomFamille||"",membres.length,detailMembres,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,echeances,e.notes||"",e.commentaire||""];
};
const H_MEMBER=["Référence dossier","Saison","Date préinscription","Rang","Rôle dossier","Nom","Prénom","Catégorie admin","Catégorie licence","Structure","Type licence","Statut dossier","Validé/payé le","Naissance","Sexe","Nationalité","Lieu naiss.","N° licence FFF","N° personne","Poste","Email contact","Téléphone contact","Adresse","CP","Ville","Resp. principal","Lien","Tél resp.","Email resp.","Autres resp.","Famille","Membres famille","Ancien club","Mutation/autre club","Certif requis","Certif fourni","Photo ID","Soins urgence","Droit image","Transport","Charte acceptée","Allergies/asthme","Short","Chaussettes","T-shirt","Survêtement","Pull / quart de zip","Initiales","Montant membre €","Licence dossier €","Boutique permanence €","Boutique saison séparée €","Total dossier €","Mode paiement","Nb fois","Échéances","Footclubs statut","Footclubs commentaire","Notes dossier"];
const memberRow=(m,tarifs=null)=>{
  const e=m.dossier||m;
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const boutiquePerm=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaison=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const echeances=(e.datesEcheances||[]).filter(Boolean).map((d,i)=>`${i+1}: ${fmtD(d)}`).join(" | ");
  return[e.id||m.dossierId||"",e.saison||"",fmtDT(e.datePreinscription),m.idx??0,m.role||"",m.nom||"",m.prenom||"",adminCatValue(m),canonicalCat(m.categorie)||"",structureType(m),m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[m.statut]?.l||"",fmtD(e.datePaiement||e.dateValidation),m.dateNaissance||"",m.sexe||"",m.nationalite||e.nationalite||"",m.lieuNaissance||e.lieuNaissance||"",m.numLicenceFFF||e.numLicenceFFF||"",m.numPersonne||e.numPersonne||"",m.poste||"",getEmailContact(e),getTelContact(e),e.adresse||"",e.codePostal||"",e.ville||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.nomFamille||"",countMembres(e),m.ancienClub||e.ancienClub||"",(m.aJoueAutreClub||e.aJoueAutreClub)?"Oui":"Non",m.certifNeeded?"Oui":"Non",m.certifMedical||e.certifMedical?"Oui":"Non",m.photoBase64||e.photoBase64||e.photoId?"Oui":"Non",m.autoSoins===false?"Non":"Oui",m.autoPhoto===false?"Non":"Oui",m.autoTransport===false?"Non":"Oui",e.charteAcceptee?"Oui":"Non",m.allergiesAsthme||e.allergiesAsthme||e.allergies||"",m.tailleShort||"",m.tailleChaussettes||"",m.tailleTshirt||"",getSurvet(m),m.tailleSweat||"",formatInitiales(m,tarifs),m.prix||0,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,(e.datesEcheances||[]).length?echeances:"",STATUTS_FOOTCLUBS[m.footclubsStatut||"a_integrer"]?.l||"",m.footclubsCommentaire||"",e.notes||""];
};
const H_BOUTIQUE=["Référence","Saison","Nom","Prénom","Catégorie joueur","Catégorie admin","Email","Téléphone","Famille","Contexte","Catégorie boutique","Article","Taille","Qté","Prix unit.","Initiales","Suppl. initiales","Total","Statut","Date achat","Date commande","Date réception","Date livraison","Note","Statut dossier"];
const boutiqueExportRow=({entry:e,achat:a},articles)=>[e.id,e.saison||"",e.nom,e.prenom,canonicalCat(e.categorie),adminCatValue(e),getEmailContact(e),getTelContact(e),e.nomFamille||"",isAchatSaison(a)?"Commande saison séparée":"Permanence licence",getAchatCategorie(a,articles),a.nom,a.taille||"",a.quantite||1,a.prix||0,a.initialesTexte||"",a.supplementInitiales||0,achatTotal(a),STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"À régler",a.date?fmtD(a.date):"",a.dateCommande?fmtD(a.dateCommande):"",a.dateReception?fmtD(a.dateReception):"",a.dateLivraison?fmtD(a.dateLivraison):"",a.note||"",STATUTS[e.statut]?.l||""];
const H_LIC=["Nom","Prénom","N° Licence FFF","N° personne","Catégorie","Sous-catégorie","Type licence","Né(e) le","Sexe","Email joueur","Téléphone joueur","Email représentant","Téléphone représentant","Représentant légal","Certif prochaine saison","Certif requis","Commentaire"];
const licRow=l=>[getLicValue(l,"n","nom"),getLicValue(l,"p","prenom"),getLicValue(l,"l","numLicence","numLicenceFFF"),licNumPersonne(l),catFromLic(l)||"",getLicValue(l,"sc","sousCategorie"),getLicValue(l,"tl","typeLicence"),getLicValue(l,"dn","dateNaissance"),getLicValue(l,"s","sexe"),getLicValue(l,"em","email"),getLicValue(l,"tel","telephone"),getLicValue(l,"em2","emailRl"),getLicValue(l,"tel2","telRl"),getLicValue(l,"rl","representant"),l.cm===true?"Non valide":l.cm===false?"Valide":"Inconnu",certifRequis(l)===true?"Oui":certifRequis(l)===false?"Non":"Inconnu",getLicValue(l,"commentaire","note")];

/* â•â• STYLES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const inp=err=>({width:"100%",boxSizing:"border-box",padding:"12px 14px",fontSize:15,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:12,outline:"none",background:C.W,color:C.N,fontFamily:FONT,WebkitAppearance:"none",appearance:"none",minHeight:46,boxShadow:"0 1px 2px rgba(15,23,42,.03)"});
const lbl={display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const Icon=({as:IconCmp,size=16,stroke=2.35,style})=>{
  if(!IconCmp)return null;
  return <IconCmp size={size} strokeWidth={stroke} aria-hidden="true" style={{flexShrink:0,...style}}/>;
};
const btnFlex={display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8};
const BP={...btnFlex,background:`linear-gradient(180deg,#ffd91a 0%,${C.J} 100%)`,color:C.N,border:`1.5px solid ${C.Jd}`,borderRadius:12,padding:"12px 20px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 10px 24px rgba(245,200,0,.24)"};
const BS={...btnFlex,background:C.W,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:12,padding:"12px 18px",fontWeight:800,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 6px 16px rgba(15,23,42,.06)"};
const BDark={...btnFlex,background:C.N,color:C.W,border:`1px solid ${C.N}`,borderRadius:12,padding:"10px 14px",fontWeight:900,fontSize:13,cursor:"pointer",minHeight:40,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 10px 22px rgba(15,23,42,.16)"};
const G2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"};
const RSG_BUTTON_CSS=`
*{box-sizing:border-box}
body{margin:0;background:#f4f6fb;color:#111827}
button,
a[data-rsg-button="true"]{
  transition: transform .15s ease, box-shadow .15s ease, filter .15s ease, background-color .15s ease, border-color .15s ease, color .15s ease;
}
button:hover:not(:disabled),
a[data-rsg-button="true"]:hover{
  transform: translateY(-1px);
  filter: saturate(1.03) brightness(1.01);
  box-shadow: 0 10px 22px rgba(15,23,42,.14) !important;
}
button:active:not(:disabled),
a[data-rsg-button="true"]:active{
  transform: translateY(0);
  filter: brightness(.96);
}
button:focus-visible,
a[data-rsg-button="true"]:focus-visible{
  outline: 3px solid rgba(37,99,235,.35);
  outline-offset: 2px;
}
button:disabled{
  cursor: not-allowed;
}
button svg,
a[data-rsg-button="true"] svg{
  pointer-events:none;
}
.rsg-guide-link:hover{
  background: #f8fafc !important;
  border-color: #94a3b8 !important;
  color: #0f172a !important;
  box-shadow: 0 8px 18px rgba(15,23,42,.08) !important;
}
.rsg-header-guide-link:hover{
  background: rgba(245,200,0,.14) !important;
  border-color: #f5c800 !important;
  color: #facc15 !important;
}
.rsg-app-header{
  position: sticky;
  top: 0;
  z-index: 200;
  background: ${C.N};
  border-bottom: 4px solid ${C.J};
  box-shadow: 0 10px 24px rgba(15,23,42,.18);
}
.rsg-header-inner{
  min-height: 62px;
  max-width: 1480px;
  margin: 0 auto;
  padding: 8px clamp(10px, 2vw, 18px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.rsg-brand{
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-family: ${FONT};
  text-align: left;
}
.rsg-brand:hover,
.rsg-brand:active{
  transform: none !important;
  filter: none !important;
  box-shadow: none !important;
}
.rsg-brand-logo{
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  background: ${C.J};
  flex: 0 0 auto;
  box-shadow: 0 5px 14px rgba(0,0,0,.28);
}
.rsg-brand-copy{
  min-width: 0;
  line-height: 1.12;
}
.rsg-brand-title{
  display: block;
  color: ${C.J};
  font-weight: 950;
  font-size: 13px;
  letter-spacing: 0;
  white-space: normal;
  max-width: 150px;
}
.rsg-brand-season{
  display: block;
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 800;
  margin-top: 2px;
  white-space: normal;
}
.rsg-header-actions{
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 2px 0;
}
.rsg-header-actions::-webkit-scrollbar{
  display: none;
}
.rsg-header-button{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 0 0 auto;
  height: 42px;
  min-width: 0;
  padding: 0 13px;
  border-radius: 13px;
  border: 1.5px solid transparent;
  font-family: ${FONT};
  font-size: 12px;
  font-weight: 950;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  touch-action: manipulation;
}
.rsg-header-button--ghost{
  background: rgba(255,255,255,.045);
  color: ${C.J};
  border-color: ${C.J};
}
.rsg-header-button--primary{
  background: ${C.J};
  color: ${C.N};
  border-color: ${C.J};
}
.rsg-header-button--blue{
  background: #0ea5e9;
  color: ${C.W};
  border-color: #0ea5e9;
}
.rsg-header-button--green{
  background: #16a34a;
  color: ${C.W};
  border-color: #16a34a;
}
.rsg-header-button svg{
  width: 16px;
  height: 16px;
}
@media (max-width: 760px){
  .rsg-header-inner{
    min-height: 58px;
    padding: 7px 8px;
    gap: 8px;
  }
  .rsg-brand-logo{
    width: 40px;
    height: 40px;
  }
  .rsg-brand-title{
    font-size: 12px;
    max-width: 128px;
  }
  .rsg-brand-season{
    font-size: 10.5px;
  }
  .rsg-header-actions{
    gap: 6px;
  }
  .rsg-header-button{
    height: 38px;
    padding: 0 10px;
    border-radius: 12px;
    font-size: 11.5px;
  }
}
@media (max-width: 620px){
  .rsg-header-inner[data-admin="true"] .rsg-brand{
    flex: 0 0 auto;
  }
  .rsg-header-inner[data-admin="true"] .rsg-brand-copy{
    display: none;
  }
  .rsg-header-inner[data-admin="true"] .rsg-header-actions{
    flex: 1 1 auto;
    justify-content: flex-start;
  }
}
@media (max-width: 430px){
  .rsg-header-inner{
    padding-inline: 7px;
    gap: 6px;
  }
  .rsg-brand{
    gap: 7px;
  }
  .rsg-brand-logo{
    width: 36px;
    height: 36px;
  }
  .rsg-brand-title{
    max-width: 92px;
    font-size: 11px;
  }
  .rsg-brand-season{
    font-size: 9.5px;
  }
  .rsg-header-button{
    height: 36px;
    padding: 0 9px;
    font-size: 11px;
  }
  .rsg-header-button svg{
    width: 15px;
    height: 15px;
  }
}
`;

/* â•â• ROOT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Routing par hash : URL #/ = formulaire public, #/admin = bureau, #/permanence = mode bénévole
// Avantage : reload garde la vue, pas besoin de react-router
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const useHashRoute=()=>{
  const [route,setRoute]=useState(()=>{
    const h=(typeof window!=="undefined"?window.location.hash:"")||"#/";
    return h.replace(/^#\/?/, "").split("?")[0]||"home";
  });
  useEffect(()=>{
    const onChange=()=>{
      const h=(window.location.hash||"#/").replace(/^#\/?/, "").split("?")[0]||"home";
      setRoute(h);
    };
    window.addEventListener("hashchange",onChange);
    return ()=>window.removeEventListener("hashchange",onChange);
  },[]);
  const navigate=useCallback((r)=>{
    window.location.hash="#/"+(r==="home"?"":r);
  },[]);
  return [route,navigate];
};

export default function App() {
  const [saison,setSaison]=useState(SAISON_DEFAUT);
  const [publicSaison,setPublicSaison]=useState(SAISON_DEFAUT);
  const [route,navigate]=useHashRoute();
  const [pw,setPw]=useState("");
  const [pwErr,setPwErr]=useState(false);
  const [loginBusy,setLoginBusy]=useState(false);
  const [licencies,setLicencies]=useState([]);
  const [tarifs,setTarifs]=useState(TARIFS_DEFAUT);
  const [adminAuth,setAdminAuth]=useState(false);
  const [authReady,setAuthReady]=useState(!isFirebaseAvailable());
  const effectiveSaison=adminAuth? saison : publicSaison;

  useEffect(()=>{
    if(!isFirebaseAvailable())return;
    return fbWatchAuth(async user=>{
      if(!user){setAdminAuth(false);setAuthReady(true);return;}
      try{
        const token=await user.getIdTokenResult(true);
        setAdminAuth(token.claims?.admin===true);
      }catch{
        setAdminAuth(false);
      }finally{
        setAuthReady(true);
      }
    });
  },[]);

  useEffect(()=>{
    (async()=>{
      const local=await stGet("rsg_public_saison");
      if(local)setPublicSaison(local);
      if(isFirebaseAvailable()){
        try{
          const cfg=await fbGetPublicConfig(local||"");
          if(cfg?.publicSaison){setPublicSaison(cfg.publicSaison);await stSet("rsg_public_saison",cfg.publicSaison);}
          if(cfg?.tarifs){setTarifs(cfg.tarifs);await stSet(`rsg_tarifs_${cfg.publicSaison||local||publicSaison}`,cfg.tarifs);}
        }catch{}
      }
    })();
  },[]);

  useEffect(()=>{
    if(!adminAuth)return;
    if(!saison)return;
    setLicencies([]);
    (async()=>{
      if(isFirebaseAvailable()){
        try{const t=await fbGetTarifs(saison);if(t){setTarifs(t);await stSet(`rsg_tarifs_${saison}`,t);return;}}catch{}
      }
      const t=await stGet(`rsg_tarifs_${saison}`);if(t)setTarifs(t);
    })();
    (async()=>{
      if(isFirebaseAvailable()){
        try{
          const l=await fbGetLicencies(saison);
          if(Array.isArray(l)){
            setLicencies(l);
            await stSet(keyLic(saison),l);
            return;
          }
        }catch{}
      }
      const local=await stGet(keyLic(saison));
      if(Array.isArray(local)){setLicencies(local);return;}
      setLicencies(BASE_FOOTCLUBS);
    })();
  },[saison,adminAuth]);

  useEffect(()=>{
    if(adminAuth)return;
    if(!publicSaison)return;
    (async()=>{
      if(isFirebaseAvailable()){
        try{const cfg=await fbGetPublicConfig(publicSaison);if(cfg?.tarifs){setTarifs(cfg.tarifs);await stSet(`rsg_tarifs_${publicSaison}`,cfg.tarifs);return;}}catch{}
      }
      const t=await stGet(`rsg_tarifs_${publicSaison}`);if(t)setTarifs(t);
    })();
  },[publicSaison,adminAuth]);

  const tryLogin=async()=>{
    if(!pw.trim()){setPwErr(true);return;}
    setLoginBusy(true);
    try{
      await fbAdminLogin({saison:publicSaison||saison,code:pw.trim()});
      setAdminAuth(true);
      setPw("");setPwErr(false);
      navigate("admin");
    }catch(err){
      console.error(err);
      setPwErr(err?.message||true);
    }finally{
      setLoginBusy(false);
    }
  };

  const logout=useCallback(async()=>{
    try{await fbLogout();}catch(e){console.error(e);}
    setAdminAuth(false);
    navigate("home");
  },[navigate]);

  useEffect(()=>{
    if(!adminAuth || typeof window==="undefined")return;
    let timeoutId=null;
    const disconnectInactiveComputer=()=>{
      logout();
    };
    const resetInactivityTimer=()=>{
      if(timeoutId)window.clearTimeout(timeoutId);
      timeoutId=window.setTimeout(disconnectInactiveComputer,ADMIN_INACTIVITY_TIMEOUT_MS);
    };
    ADMIN_ACTIVITY_EVENTS.forEach(eventName=>window.addEventListener(eventName,resetInactivityTimer,{passive:true}));
    resetInactivityTimer();
    return ()=>{
      if(timeoutId)window.clearTimeout(timeoutId);
      ADMIN_ACTIVITY_EVENTS.forEach(eventName=>window.removeEventListener(eventName,resetInactivityTimer));
    };
  },[adminAuth,logout]);

  // Sécurité : si on essaie d'accéder à /admin ou /permanence sans être loggé, on redirige vers /login
  const needsAuth=route==="admin"||route==="permanence"||route==="equipement";
  const showLogin=authReady&&(route==="login"||(needsAuth&&!adminAuth));
  const isPublicFront=route==="home"||route==="form";

  return(
    <div style={{fontFamily:FONT,minHeight:"100vh",background:C.Gc,WebkitTextSizeAdjust:"100%"}}>
      <style>{RSG_BUTTON_CSS}</style>
      <header className="rsg-app-header">
        <div className="rsg-header-inner" data-admin={adminAuth ? "true" : "false"}>
          <button type="button" className="rsg-brand" onClick={()=>navigate("home")} aria-label="Accueil RSG">
            <img className="rsg-brand-logo" src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG"/>
            <span className="rsg-brand-copy">
              <span className="rsg-brand-title">REVEIL ST-GEREON</span>
              <span className="rsg-brand-season">Saison {effectiveSaison}{adminAuth&&route==="admin"?" · Admin":adminAuth&&route==="permanence"?" · Permanence":adminAuth&&route==="equipement"?" · Équipement":""}</span>
            </span>
          </button>
          <nav className="rsg-header-actions" aria-label="Navigation principale">
            {isPublicFront&&<a data-rsg-button="true" className="rsg-header-button rsg-header-button--ghost rsg-header-guide-link" href={getGuideInscriptionPdfUrl(tarifs)} target="_blank" rel="noreferrer"><Icon as={BookOpen}/><span>Guide inscription</span></a>}
            {route!=="home"&&route!=="login"&&<button type="button" onClick={()=>navigate("home")} className="rsg-header-button rsg-header-button--ghost"><Icon as={ArrowLeft}/><span>Retour</span></button>}
            {!adminAuth&&route!=="login"&&route!=="form"&&<button type="button" onClick={()=>navigate("login")} className="rsg-header-button rsg-header-button--primary"><Icon as={UserCog}/><span>Bureau</span></button>}
            {adminAuth&&route!=="admin"&&route!=="permanence"&&route!=="equipement"&&route!=="form"&&<button type="button" onClick={()=>navigate("admin")} className="rsg-header-button rsg-header-button--primary"><Icon as={LayoutDashboard}/><span>Admin</span></button>}
            {adminAuth&&route==="admin"&&<button type="button" onClick={()=>navigate("permanence")} className="rsg-header-button rsg-header-button--green"><Icon as={Users}/><span>Permanence</span></button>}
            {adminAuth&&(route==="permanence"||route==="equipement")&&<button type="button" onClick={()=>navigate("admin")} className="rsg-header-button rsg-header-button--primary"><Icon as={LayoutDashboard}/><span>Admin</span></button>}
            {adminAuth&&<button type="button" onClick={logout} className="rsg-header-button rsg-header-button--ghost"><Icon as={LogOut}/><span>Déconnexion</span></button>}
          </nav>
        </div>
      </header>
      {route==="home"&&<Home onForm={()=>navigate("form")} saison={publicSaison} tarifs={tarifs}/>}
      {route==="form"&&<Formulaire onDone={()=>navigate("home")} licencies={[]} saison={publicSaison} tarifs={tarifs} onLookupLicence={num=>fbLookupLicence({saison:publicSaison,numLicenceFFF:num})}/>}
      {showLogin&&(
        <div style={{maxWidth:360,margin:"48px auto 0",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:20}}><img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:68,height:68,borderRadius:"50%",objectFit:"cover",marginBottom:10}}/><h2 style={{margin:0,color:C.N,fontWeight:900,fontSize:20}}>Acces Secretariat</h2><p style={{color:C.G,fontSize:13,marginTop:4}}>Saison publique {publicSaison}</p></div>
            <label style={lbl}>Code d'accès</label>
            <input type="password" autoComplete="current-password" style={{...inp(pwErr),fontSize:18,letterSpacing:4,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:10}}>{typeof pwErr==="string"&&pwErr!==""?pwErr:"Code incorrect"}</div>}
            <button style={{...BP,width:"100%",marginTop:4,opacity:loginBusy?0.7:1}} onClick={tryLogin} disabled={loginBusy}><Icon as={ShieldCheck}/>{loginBusy?"Connexion...":"Entrer"}</button>
          </div>
        </div>
      )}
      {route==="admin"&&adminAuth&&<Dashboard saison={saison} onSaisonChange={setSaison} publicSaison={publicSaison} onPublicSaisonChange={async s=>{
        if(isFirebaseAvailable()){
          try{await fbSaveGlobalConfig({publicSaison:s});}
          catch(e){
            console.error(e);
            alert(`Sauvegarde Firebase impossible pour la saison publique : ${e?.message||e}`);
            throw e;
          }
        }
        setPublicSaison(s);
        await stSet("rsg_public_saison",s);
      }} licencies={licencies} onLicenciesChange={async lics=>{
        if(isFirebaseAvailable()){
          try{await fbSaveLicencies(saison,lics);}
          catch(e){
            console.error(e);
            alert(`Sauvegarde Firebase impossible pour la base Footclubs : ${e?.message||e}`);
            throw e;
          }
        }
        setLicencies(lics);
        await stSet(keyLic(saison),lics);
      }} tarifs={tarifs} onTarifsChange={async t=>{
        if(isFirebaseAvailable()){
          try{await fbSaveTarifs(saison,t);}
          catch(e){
            console.error(e);
            alert(`Sauvegarde Firebase impossible pour la configuration : ${e?.message||e}`);
            throw e;
          }
        }
        setTarifs(t);
        await stSet(`rsg_tarifs_${saison}`,t);
      }}/>}
      {route==="permanence"&&adminAuth&&<Permanence saison={saison} tarifs={tarifs}/>}
      {route==="equipement"&&adminAuth&&<Equipement saison={saison} tarifs={tarifs}/>}
    </div>
  );
}

/* â•â• HOME â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Home({onForm,saison,tarifs}){
  const [isWide,setIsWide]=useState(()=>typeof window!=="undefined"&&window.innerWidth>=980);
  const [selectedTarifCat,setSelectedTarifCat]=useState("");
  useEffect(()=>{
    const onResize=()=>setIsWide(typeof window!=="undefined"&&window.innerWidth>=980);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);
  const remisesFamille=getRemisesFamille(tarifs);
  const showRemisesFamille=Object.values(remisesFamille).some(v=>Number(v)>0);
  const planningRows=getPlanningEntrainements(tarifs);
  const planningOptions=Object.values(planningRows.reduce((acc,c)=>{const key=`${canonicalCat(c.categorie)}|${c.sexe||"Tous"}`;acc[key]||={key,categorie:canonicalCat(c.categorie),sexe:c.sexe||"Tous",label:planningOptionLabel(c)};return acc;},{})).sort((a,b)=>catRank(adminCatValue({categorie:a.categorie,sexe:a.sexe}))-catRank(adminCatValue({categorie:b.categorie,sexe:b.sexe}))||a.label.localeCompare(b.label));
  const [planningCat,setPlanningCat]=useState("");
  const activePlanning=planningOptions.find(o=>o.key===planningCat);
  const planningShown=planningRows.filter(r=>activePlanning&&canonicalCat(r.categorie)===activePlanning.categorie&&(r.sexe||"Tous")===activePlanning.sexe);
  const planningContact=activePlanning?planningResponsableFor(tarifs,activePlanning.categorie,activePlanning.sexe):null;
  const permanencesPublic=getPermanences(tarifs).filter(p=>p&&(p.date||p.debut||p.fin||p.lieu));
  const selectedDotations=selectedTarifCat?publicDotationGroups(tarifs,selectedTarifCat):[];
  const showInfoCard=planningOptions.length>0;
  return(
    <div style={{maxWidth:isWide?1180:540,margin:"0 auto",padding:"24px 16px 64px"}}>
      <div style={{textAlign:"center",margin:"0 auto 22px",maxWidth:720}}>
        <div style={{width:70,height:70,borderRadius:22,background:C.W,border:`1px solid ${C.Gb}`,boxShadow:"0 16px 34px rgba(15,23,42,.10)",display:"grid",placeItems:"center",margin:"0 auto 12px"}}>
          <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:54,height:54,borderRadius:"50%",objectFit:"cover"}}/>
        </div>
        <h1 style={{fontSize:22,fontWeight:900,color:C.N,margin:"0 0 6px"}}>Préinscription RSG</h1>
        <div style={{display:"inline-block",background:C.J,color:C.N,padding:"3px 14px",borderRadius:20,fontWeight:800,fontSize:13,marginBottom:12}}>Saison {saison}</div>
        <p style={{color:C.G,fontSize:14,lineHeight:1.6,margin:"0 0 20px"}}>Bienvenue au Réveil Saint-Géréon !<br/>Quelques minutes suffisent pour vous préinscrire.</p>
        <button style={{...BP,fontSize:17,padding:"15px 28px",borderRadius:12,boxShadow:`0 14px 30px ${C.J}45`,width:"100%"}} onClick={onForm}><Icon as={Rocket} size={20}/>C'est parti !</button>
        <div style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:10,alignItems:"start",background:"#fff1f2",border:"1.5px solid #fda4af",borderRadius:12,padding:"12px 14px",margin:"14px 0 0",boxShadow:"0 10px 24px rgba(220,38,38,.08)",textAlign:"left"}}>
          <Icon as={AlertTriangle} size={18} style={{color:C.R,marginTop:1}}/>
          <p style={{color:C.R,fontSize:13,lineHeight:1.45,margin:0,fontWeight:900}}>La validation finale sera faite par le club lors d'une permanence licence, après vérification du dossier et réception du paiement. Elle reste également sous réserve des places disponibles, notamment pour les nouveaux joueurs.</p>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:isWide?"minmax(0,1fr) minmax(0,1fr)":"1fr",gap:isWide?18:0,alignItems:"start"}}>
      {/* Grille des tarifs */}
      <div style={{background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16,boxShadow:"0 12px 28px rgba(15,23,42,.06)"}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <Icon as={Euro} size={16} style={{color:C.J}}/><span style={{color:C.J,fontWeight:900,fontSize:13}}>Tarifs saison {saison}</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          <p style={{fontSize:11.5,fontWeight:800,color:C.G,margin:"0 0 10px",lineHeight:1.35}}>Les tarifs s'appliquent aux catégories masculines et féminines.</p>
          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",margin:"0 0 10px"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#fffbeb",border:`1px solid ${C.Jd}`,borderRadius:999,padding:"5px 9px",fontSize:11,fontWeight:900,color:"#92400e"}}>
              <Icon as={Shirt} size={13}/><span>Cliquez sur une catégorie pour voir les dotations</span>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {orderedTarifEntries(tarifs).map(([cat,prix])=>{
              const active=selectedTarifCat===cat;
              return <button type="button" key={cat} onClick={()=>setSelectedTarifCat(active?"":cat)} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"center",padding:"7px 10px",background:active?C.Jp:C.Gc,border:`1.5px solid ${active?C.Jd:"transparent"}`,borderRadius:7,textAlign:"left",fontFamily:FONT,cursor:"pointer",boxShadow:active?"0 8px 18px rgba(245,200,0,.18)":"none",minHeight:0}}>
                <span style={{minWidth:0}}>
                  <span style={{display:"block",fontSize:12,fontWeight:800,color:C.N,lineHeight:1.15}}>{catLabel(cat)}</span>
                  {catBirthText(cat,saison)&&<span style={{display:"block",fontSize:10.5,fontWeight:700,color:C.G,lineHeight:1.2,marginTop:2}}>{catBirthText(cat,saison)}</span>}
                </span>
                <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:14,fontWeight:900,color:prix===0?C.V:C.J}}>{prix===0?"GRATUIT":`${prix} €`}<Icon as={ChevronRight} size={12} style={{transform:active?"rotate(90deg)":"none",transition:"transform .15s ease",color:C.G}}/></span>
              </button>;
            })}
          </div>
          {selectedTarifCat&&<div style={{marginTop:10,padding:"10px 11px",background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
              <Icon as={Shirt} size={15} style={{color:C.Jd}}/>
              <span style={{fontSize:12,fontWeight:950,color:C.N}}>Dotation incluse - {catLabel(selectedTarifCat)}</span>
            </div>
            <div style={{display:"grid",gap:7}}>
              {selectedDotations.map(g=><div key={g.label} style={{display:"grid",gridTemplateColumns:selectedDotations.length>1?"56px minmax(0,1fr)":"minmax(0,1fr)",gap:8,alignItems:"start"}}>
                {selectedDotations.length>1&&<span style={{fontSize:11,fontWeight:950,color:C.G,marginTop:2}}>{g.label}</span>}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",minWidth:0}}>
                  {g.items.length?g.items.map(item=><span key={item} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:999,padding:"4px 8px",fontSize:11,fontWeight:850,color:C.N}}>{item}</span>):<span style={{fontSize:11.5,color:g.note?.includes("50 €")?"#92400e":C.G,fontWeight:850,background:g.note?.includes("50 €")?C.Jp:"transparent",border:g.note?.includes("50 €")?`1px solid ${C.Jd}`:"none",borderRadius:8,padding:g.note?.includes("50 €")?"5px 8px":0}}>{g.note||"Aucune dotation prévue."}</span>}
                  {g.items.length>0&&g.note&&<span style={{background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:999,padding:"4px 8px",fontSize:11,fontWeight:900,color:"#1d4ed8"}}>{g.note}</span>}
                </div>
              </div>)}
            </div>
          </div>}
          {showRemisesFamille&&<div style={{marginTop:10,padding:"8px 10px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,fontSize:12,color:"#1e40af"}}>
            <strong>Tarif famille</strong> — 20 € offerts sur la 2ème licence mineure
          </div>}
        </div>
      </div>
      {showInfoCard&&<div style={{background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16,boxShadow:"0 12px 28px rgba(15,23,42,.06)"}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <Icon as={CalendarDays} size={16} style={{color:C.J}}/><span style={{color:C.J,fontWeight:900,fontSize:13}}>Planning entraînements & responsable de catégorie</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          {planningOptions.length>0?<>
            <F label="Je veux connaître les informations d'entraînement pour la catégorie :">
              <select style={inp()} value={planningCat} onChange={e=>setPlanningCat(e.target.value)}>
                <option value="">Choisir une catégorie</option>
                {planningOptions.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </F>
            {activePlanning&&<div style={{display:"grid",gap:7,marginTop:10}}>
              {planningShown.map(c=><div key={c.id} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"9px 10px"}}>
                <div style={{fontSize:13,fontWeight:900,color:C.N}}>{c.jour}{c.debut||c.fin?` · ${c.debut||"?"}-${c.fin||"?"}`:""}</div>
                <div style={{fontSize:12,color:C.G,fontWeight:700,marginTop:2}}>{c.lieu||"Lieu à confirmer"}</div>
                {c.note&&<div style={{fontSize:11,color:"#92400e",fontWeight:800,marginTop:3}}>{c.note}</div>}
              </div>)}
              <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:8,padding:"9px 10px"}}>
                <div style={{fontSize:11,fontWeight:900,color:C.V,textTransform:"uppercase"}}>Responsable catégorie</div>
                <div style={{fontSize:13,fontWeight:900,color:C.N,marginTop:2}}>{planningContactLabel(planningContact)||"À confirmer"}</div>
              </div>
            </div>}
          </>:<div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:9,padding:"10px 12px",fontSize:12,color:C.G,fontWeight:800}}>Planning à confirmer.</div>}
        </div>
      </div>}
      <div style={{background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16,boxShadow:"0 12px 28px rgba(15,23,42,.06)"}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <Icon as={ClipboardList} size={16} style={{color:C.J}}/><span style={{color:C.J,fontWeight:900,fontSize:13}}>Permanences licence : dates & lieux</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          <p style={{fontSize:12,color:C.G,margin:"0 0 10px",lineHeight:1.45,fontWeight:750}}>La validation du dossier et la réception du paiement se font pendant une permanence licence.</p>
          {permanencesPublic.length>0?<div style={{display:"grid",gap:8}}>
            {permanencesPublic.map((p,i)=><div key={`${p.date||"date"}-${p.debut||"debut"}-${i}`} style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:9,alignItems:"start",background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 11px"}}>
              <div style={{width:34,height:34,borderRadius:10,background:C.J,color:C.N,display:"grid",placeItems:"center",fontWeight:950,fontSize:13}}>{i+1}</div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,fontWeight:950,color:C.N,lineHeight:1.25}}>{p.date?fmtD(p.date):"Date à préciser"}{p.debut||p.fin?` · ${p.debut||"?"}-${p.fin||"?"}`:""}</div>
                <div style={{fontSize:12,color:C.G,fontWeight:800,marginTop:3,lineHeight:1.35}}>{p.lieu||"Lieu à confirmer"}</div>
                {permanenceMessage(p)&&<div style={{fontSize:11.5,color:"#92400e",fontWeight:850,marginTop:6,lineHeight:1.35,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"6px 8px",whiteSpace:"pre-line"}}>{permanenceMessage(p)}</div>}
              </div>
            </div>)}
          </div>:<div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",fontSize:12,color:C.G,fontWeight:850}}>Dates communiquées prochainement.</div>}
        </div>
      </div>
      </div>
    </div>
  );
}

/* â•â• FORMULAIRE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Formulaire({onDone,licencies,saison,tarifs,onLookupLicence}){
  const [step,setStep]=useState(1);
  const [f,setF]=useState(F0);
  const [errs,setErrs]=useState({});
  const [done,setDone]=useState(null);
  const [saving,setSaving]=useState(false);
  const [charteOpened,setCharteOpened]=useState(false);
  const [editPrimaryRep,setEditPrimaryRep]=useState(false);
  const [licLookupCache,setLicLookupCache]=useState({});
  const [licLookupBusy,setLicLookupBusy]=useState(false);
  const topRef=useRef();
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const age=calcAge(f.dateNaissance);
  const isMajeur=age!==null&&age>=18;
  const licenciesConnues=[...(Array.isArray(licencies)?licencies:[]),...Object.values(licLookupCache).filter(Boolean)];

  // Recherche du licencié dans la base Footclubs
  const licDetect=(f.numLicenceFFF||(licenciesConnues.length&&f.nom.length>1&&f.prenom.length>1))?lookupLic(licenciesConnues,f.nom,f.prenom,f.numLicenceFFF):null;
  const lic=f.typeLicence==="renouvellement"?licDetect:null;
  // Dirigeant non-arbitre = exempté de certif médical
  const estDirigeantNonArbitre=f.categorie==="Dirigeant"&&!f.dirigeantArbitre;
  const certifReq=estDirigeantNonArbitre?false:(f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic):null));
  const certifMsg=estDirigeantNonArbitre
    ?{ok:true,txt:"Pas de certificat médical requis pour les dirigeants (sauf si arbitrage)."}
    :f.typeLicence==="nouvelle"
      ?{ok:false,txt:"Nouvelle licence au club : certificat médical obligatoire. Si ce n'est pas déjà fait, prenez rendez-vous dès maintenant."}
      :(!lic?null:(certifReq===true
        ?{ok:false,txt:`Selon Footclubs, votre certificat médical n'est pas valide pour la saison ${saison}. Un rendez-vous médical est donc nécessaire. Si ce n'est pas déjà fait, prenez rendez-vous dès maintenant.`}
        :certifReq===false
          ?{ok:true,txt:`Certificat médical valide pour la saison ${saison} ✓ (vous remplirez juste le questionnaire de santé)`}
          :null));

  // Calcul du tarif TOTAL famille : 20 € offerts sur les licences suivantes.
  const tousMembres=[
    {categorie:f.categorie},
    ...f.freresSoeurs.map(m=>({categorie:m.categorie})),
    ...f.adultesFamille.map(m=>({categorie:m.categorie})),
  ].filter(m=>m.categorie);

  const calcDetailFamille=()=>{
    const detail=[];
    let total=0;
    const remises=getRemisesFamille(tarifs);
    tousMembres.forEach((m,i)=>{
      const rang=i+1;
      const base=prixCategorie(tarifs,m.categorie);
      const pct=rang>=4?(remises[4]||0):(remises[rang]||0);
      const remise=(rang>=2&&isMinorCategory(m.categorie))?Number(pct||0):0;
      const prix=Math.max(0,Math.round(base-remise));
      detail.push({categorie:m.categorie,rang,base,pct:remise,prix});
      total+=prix;
    });
    return {detail,total};
  };
  const {detail:detailPrix,total:prixLicences}=calcDetailFamille();
  const nbInitialesEquipements=[
    f,
    ...f.freresSoeurs,
    ...f.adultesFamille,
  ].reduce((s,m)=>s+countInitiales(m,tarifs),0);
  const supplementInitiales=nbInitialesEquipements*getCoutInitiales(tarifs);
  const prixFinalTotal=prixLicences+supplementInitiales;

  // Tarif individuel du joueur principal seul (1er rang)
  const tarifBase=f.categorie?prixCategorie(tarifs,f.categorie):0;

  const modesPaiement=getModesPaiement(tarifs);
  const rawSelectedModes=(Array.isArray(f.modePaiements)&&f.modePaiements.length?f.modePaiements:(f.modePaiement?[f.modePaiement]:[])).filter(Boolean);
  const selectedModes=rawSelectedModes;
  const modeObj=selectedModes.map(id=>modesPaiement.find(m=>m.id===id)).find(m=>m?.fractionnable)||modesPaiement.find(m=>m.id===selectedModes[0]);
  const echeances=modeObj?.fractionnable&&f.nbFois>1?calcEcheances(prixFinalTotal,f.nbFois):null;
  const datesEcheances=echeances?Array.from({length:f.nbFois},(_,i)=>f.datesEcheances?.[i]||""):null;

  // Étapes : 1 Type, 2 Joueur+photo, 3 Resp légaux (si mineur), 4 Médical+autorisations, 5 Équipement, 6 Famille+Documents, 7 Paiement, 8 Récap
  const STEPS=isMajeur
    ?["Type","Joueur","Médical","Équipement","Famille & docs","Paiement","Récap"]
    :["Type","Joueur","Responsables","Médical","Équipement","Famille & docs","Paiement","Récap"];
  const total=STEPS.length;
  const stepIdx={
    type:1,
    joueur:2,
    resp:isMajeur?null:3,
    med:isMajeur?3:4,
    equip:isMajeur?4:5,
    famille:isMajeur?5:6,
    paie:isMajeur?6:7,
    recap:isMajeur?7:8,
  };

  // Auto-détection catégorie selon date de naissance et saison
  useEffect(()=>{if(f.dateNaissance&&!f.categorie)set("categorie",suggestCat(f.dateNaissance,saison));},[f.dateNaissance,saison]);
  useEffect(()=>{
    if(!f.numLicenceFFF)return;
    const num=f.numLicenceFFF;
    const match=lookupLic(licenciesConnues,"","",num);
    if(match){applyLicencie(match);return;}
    if(!onLookupLicence||String(num).replace(/\D/g,"").length<4)return;
    let cancelled=false;
    setLicLookupBusy(true);
    onLookupLicence(num).then(found=>{
      if(cancelled||!found)return;
      setLicLookupCache(p=>({...p,[String(num).replace(/\D/g,"")]:found}));
      applyLicencie(found);
    }).catch(()=>{}).finally(()=>{if(!cancelled)setLicLookupBusy(false);});
    return()=>{cancelled=true;};
  },[f.numLicenceFFF,saison]);
  useEffect(()=>{
    if(f.typeLicence==="nouvelle"&&licDetect){
      setF(p=>({...p,typeLicence:"renouvellement"}));
    }
  },[f.typeLicence,licDetect]);
  useEffect(()=>{
    if(!licDetect||f.typeLicence!=="renouvellement")return;
    const licNum=getLicValue(licDetect,"l","numLicence","numLicenceFFF");
    const pers=licNumPersonne(licDetect);
    if((licNum&&!f.numLicenceFFF)||(pers&&!f.numPersonne))applyLicencie(licDetect);
  },[licDetect,f.typeLicence,f.numLicenceFFF,f.numPersonne]);
  // Init représentant n°2 vide
  useEffect(()=>{
    if(!isMajeur&&f.representants.length===0){
      set("representants",[{nom:"",prenom:"",lien:"",tel:"",email:""}]);
    }
  },[isMajeur]);
  useEffect(()=>{topRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[step]);

  const validate=()=>{
    const e={};
    if(step===stepIdx.type&&!f.typeLicence)e.typeLicence="Veuillez choisir";
    if(f.typeLicence==="nouvelle"&&licDetect)e.typeLicence="Vous êtes déjà reconnu dans la base du club : choisissez renouvellement.";
    if(step===stepIdx.joueur){
      if(!f.nom)e.nom="Requis";
      if(!f.prenom)e.prenom="Requis";
      if(!f.dateNaissance)e.dateNaissance="Requis";
      if(!f.sexe)e.sexe="Requis";
      if(!f.adresse)e.adresse="Requis";
      if(!f.codePostal)e.codePostal="Requis";
      if(!f.ville)e.ville="Requis";
      if(!f.categorie)e.categorie="Requis";
      if(f.typeLicence==="nouvelle"&&f.aJoueAutreClub&&!f.ancienClub)e.ancienClub="Indiquez le club de la saison dernière";
      if(!f.photoBase64)e.photoBase64="📸 Photo d'identité obligatoire";
      if(isMajeur){
        if(!f.telephone)e.telephone="Requis";
        if(!f.email)e.email="Requis";
        if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))e.email="Email invalide";
      }
    }
    if(!isMajeur&&step===stepIdx.resp){
      const r0=f.representants[0]||{};
      if(!r0.nom)e.resp1Nom="Requis";
      if(!r0.prenom)e.resp1Prenom="Requis";
      if(!r0.lien)e.resp1Lien="Requis";
      if(!r0.tel)e.resp1Tel="Requis";
      if(!r0.email)e.resp1Email="Requis";
      if(r0.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r0.email))e.resp1Email="Email invalide";
    }
    if(step===stepIdx.med&&!isMajeur&&!f.autoSoins)e.autoSoins="Autorisation soins urgence obligatoire";
    if(step===stepIdx.equip){
      const manquants=getMemberDotationItems(f,f.categorie,tarifs,saison).filter(item=>!dotationValueForMember(f,item)).map(item=>item.label);
      if(manquants.length)e.equipement=`Tailles à renseigner : ${manquants.join(", ")}`;
    }
    if(step===stepIdx.paie){
      if(tousMembres.length>1&&!String(f.nomFamille||"").trim())e.nomFamille="Nom de famille obligatoire pour regrouper le dossier";
      if(modeObj?.fractionnable&&f.nbFois>1){
        const dates=Array.from({length:f.nbFois},(_,i)=>f.datesEcheances?.[i]||"");
        if(dates.some(d=>!d))e.dateEcheance1="Veuillez choisir toutes les dates d'encaissement";
      }
    }
    if(step===stepIdx.famille){
      const commonRequiredFields=[
        ["typeLicence","type de licence"],
        ["nom","nom"],
        ["prenom","prénom"],
        ["dateNaissance","date de naissance"],
        ["sexe","sexe"],
        ["categorie","catégorie"],
      ];
      const familyMembers=[
        ...f.freresSoeurs.map((m,i)=>({m,i,type:"frere",label:m.prenom||m.nom||`enfant ${i+1}`,requiredFields:commonRequiredFields})),
        ...f.adultesFamille.map((m,i)=>({m,i,type:"adulte",label:m.prenom||m.nom||`adulte ${i+1}`,requiredFields:[...commonRequiredFields,["nationalite","nationalité"],["tel","téléphone"],["email","email"]]})),
      ];
      const missingInfos=familyMembers.flatMap(({m,i,type,label,requiredFields})=>requiredFields.filter(([field])=>!String(m?.[field]||"").trim()).map(([field,fieldLabel])=>({i,type,field,fieldLabel,label})));
      const invalidEmails=familyMembers
        .filter(x=>x.type==="adulte"&&x.m?.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.m.email))
        .map(x=>({i:x.i,type:x.type,field:"email",fieldLabel:"email invalide",label:x.label}));
      const adultInMinorSection=f.freresSoeurs
        .map((m,i)=>({m,i,label:m.prenom||m.nom||`enfant ${i+1}`}))
        .filter(({m})=>m?.categorie&&!isMinorCategory(m.categorie))
        .map(({i,label})=>({i,type:"frere",field:"categorie",fieldLabel:"à déplacer dans Adultes de la famille",label}));
      const missingPreviousClubs=familyMembers
        .filter(x=>x.m?.typeLicence==="nouvelle"&&x.m?.aJoueAutreClub&&!String(x.m?.ancienClub||"").trim())
        .map(x=>({i:x.i,type:x.type,field:"ancienClub",fieldLabel:"club précédent",label:x.label}));
      const missingDotations=familyMembers.flatMap(({m,i,type,label})=>
        getMemberDotationItems(m,m.categorie,tarifs,saison)
          .filter(item=>!dotationValueForMember(m,item))
          .map(item=>({i,type,field:item.id,fieldLabel:item.label,label}))
      );
      [...missingInfos,...invalidEmails,...adultInMinorSection,...missingPreviousClubs,...missingDotations].forEach(({i,type,field})=>{e[`${type}${field}${i}`]="Requis";});
      invalidEmails.forEach(({i,type,field})=>{e[`${type}${field}${i}`]="Email invalide";});
      adultInMinorSection.forEach(({i,type,field})=>{e[`${type}${field}${i}`]="Adulte";});
      const allMissing=[...missingInfos,...invalidEmails,...adultInMinorSection,...missingPreviousClubs,...missingDotations];
      if(allMissing.length){
        const grouped=allMissing.reduce((acc,x)=>({...acc,[x.label]:[...(acc[x.label]||[]),x.fieldLabel]}),{});
        e.familleInfos=`Champs obligatoires manquants : ${Object.entries(grouped).map(([name,fields])=>`${name} (${[...new Set(fields)].join(", ")})`).join(" · ")}`;
      }
      const missingPhotos=[
        ...f.freresSoeurs.filter(m=>!m.photoBase64).map(m=>m.prenom||m.nom||"un enfant"),
        ...f.adultesFamille.filter(m=>!m.photoBase64).map(m=>m.prenom||m.nom||"un adulte"),
      ];
      if(missingPhotos.length)e.famillePhotos=`Photo d'identité obligatoire pour : ${missingPhotos.join(", ")}`;
      if(isMajeur&&f.freresSoeurs.length>0){
        const repFields=[["lien","rôle"],["nom","nom"],["prenom","prénom"],["tel","téléphone"],["email","email"]];
        const repsToCheck=[];
        if(editPrimaryRep||hasCustomPrimaryRep())repsToCheck.push({idx:0,label:"représentant principal",rep:f.representants?.[0]||{}});
        if(f.representants?.[1])repsToCheck.push({idx:1,label:"2ème représentant",rep:f.representants[1]});
        const missingReps=repsToCheck.flatMap(({idx,label,rep})=>repFields.filter(([field])=>!String(rep?.[field]||"").trim()).map(([field,fieldLabel])=>({idx,label,field,fieldLabel})));
        missingReps.forEach(({idx,field})=>{e[`rep${idx}${field}`]="Requis";});
        repsToCheck.forEach(({idx,rep})=>{
          if(rep?.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rep.email))e[`rep${idx}email`]="Email invalide";
        });
        if(missingReps.length)e.familleInfos=[e.familleInfos,`Représentants légaux à compléter : ${missingReps.map(x=>`${x.label} (${x.fieldLabel})`).join(", ")}`].filter(Boolean).join(" · ");
      }
    }
    if(step===total&&!charteOpened)e.charteAcceptee="Veuillez ouvrir la charte RSG avant de valider";
    if(step===total&&!f.charteAcceptee)e.charteAcceptee="La charte RSG doit être acceptée pour envoyer la préinscription";
    setErrs(e);return Object.keys(e).length===0;
  };
  const next=()=>{if(validate())setStep(p=>Math.min(p+1,total));};
  const prev=()=>{setErrs({});setStep(p=>Math.max(p-1,1));};

  // Helpers pour ajout/suppression de représentants et membres famille
  const addRep=()=>set("representants",[...f.representants,{nom:"",prenom:"",lien:"",tel:"",email:""}]);
  const updRep=(i,k,v)=>{const r=[...f.representants];r[i]={...r[i],[k]:v};set("representants",r);};
  const delRep=i=>set("representants",f.representants.filter((_,j)=>j!==i));
  const applyLicencie=licencie=>{
    if(!licencie)return;
    const dn=getLicValue(licencie,"dn","dateNaissance");
    const cat=catFromLic(licencie)||suggestCat(dn,saison);
    setF(p=>({
      ...p,
      typeLicence:"renouvellement",
      numLicenceFFF:getLicValue(licencie,"l","numLicence","numLicenceFFF")||p.numLicenceFFF,
      numPersonne:licNumPersonne(licencie)||p.numPersonne,
      nom:(getLicValue(licencie,"n","nom")||p.nom||"").toUpperCase(),
      prenom:getLicValue(licencie,"p","prenom")||p.prenom,
      dateNaissance:dn||p.dateNaissance,
      sexe:normalizeSexe(getLicValue(licencie,"s","sexe"))||p.sexe,
      lieuNaissance:getLicValue(licencie,"ln","lieuNaissance")||p.lieuNaissance,
      nationalite:(getLicValue(licencie,"nat","nationalite")==="F"?"Française":getLicValue(licencie,"nat","nationalite"))||p.nationalite,
      adresse:getLicValue(licencie,"adr","adresse")||p.adresse,
      codePostal:getLicValue(licencie,"cp","codePostal")||p.codePostal,
      ville:getLicValue(licencie,"ville")||p.ville,
      categorie:cat||p.categorie,
      email:getLicValue(licencie,"em","email")||p.email,
      telephone:getLicValue(licencie,"tel","telephone")||p.telephone,
      representants:getLicValue(licencie,"rl","representant")
        ?[{...(p.representants?.[0]||{}),nom:String(getLicValue(licencie,"rl","representant")).split(" ").slice(0,-1).join(" ")||p.representants?.[0]?.nom||"",prenom:String(getLicValue(licencie,"rl","representant")).split(" ").slice(-1).join(" ")||p.representants?.[0]?.prenom||"",tel:getLicValue(licencie,"tel2","telRl")||p.representants?.[0]?.tel||"",email:getLicValue(licencie,"em2","emailRl")||p.representants?.[0]?.email||""},...(p.representants||[]).slice(1)]
        :p.representants,
    }));
  };
  const applyLicencieToMember=(listKey,i,licencie)=>{
    if(!licencie)return;
    const dn=getLicValue(licencie,"dn","dateNaissance");
    const cat=catFromLic(licencie)||suggestCat(dn,saison);
    const current=(f[listKey]||[])[i]||{};
    const filled={
      ...current,
      typeLicence:"renouvellement",
      numLicenceFFF:getLicValue(licencie,"l","numLicence","numLicenceFFF")||current.numLicenceFFF,
      numPersonne:licNumPersonne(licencie)||current.numPersonne,
      nom:(getLicValue(licencie,"n","nom")||current.nom||"").toUpperCase(),
      prenom:getLicValue(licencie,"p","prenom")||current.prenom,
      dateNaissance:dn||current.dateNaissance,
      sexe:normalizeSexe(getLicValue(licencie,"s","sexe"))||current.sexe,
      nationalite:(getLicValue(licencie,"nat","nationalite")==="F"?"Française":getLicValue(licencie,"nat","nationalite"))||current.nationalite||"Française",
      categorie:cat||current.categorie,
      email:getLicValue(licencie,"em","email")||current.email,
      tel:getLicValue(licencie,"tel","telephone")||current.tel,
    };
    if(listKey==="freresSoeurs"&&!isMinorCategory(filled.categorie)){
      setF(p=>{
        const freres=[...(p.freresSoeurs||[])];
        freres.splice(i,1);
        const adultes=[...(p.adultesFamille||[]),{...filled,categorie:normalizeCategoryForMember(filled.categorie,filled.dateNaissance,saison)||"Senior"}];
        return {...p,freresSoeurs:freres,adultesFamille:adultes};
      });
      setErrs(p=>({...p,familleInfos:"Le licencié retrouvé est adulte : il a été déplacé dans la section Adultes de la famille."}));
      return;
    }
    const list=[...(f[listKey]||[])];
    list[i]=filled;
    set(listKey,list);
  };
  const lookupAndApplyMember=async(listKey,i,member)=>{
    const num=member?.numLicenceFFF||"";
    const local=lookupLic(licenciesConnues,member?.nom||"",member?.prenom||"",num);
    if(local){applyLicencieToMember(listKey,i,local);return;}
    if(!onLookupLicence||String(num).replace(/\D/g,"").length<4)return;
    try{
      const found=await onLookupLicence(num);
      if(found){
        setLicLookupCache(p=>({...p,[String(num).replace(/\D/g,"")]:found}));
        applyLicencieToMember(listKey,i,found);
      }
    }catch{}
  };

  const addFrere=()=>set("freresSoeurs",[...f.freresSoeurs,{typeLicence:"",numLicenceFFF:"",numPersonne:"",nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleTshirt:"",tailleSurvet:"",tailleSweat:"",initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},photoBase64:""}]);
  const updFrere=(i,k,v)=>{const r=[...f.freresSoeurs];r[i]={...r[i],[k]:v};
    if(k==="typeLicence"&&v==="nouvelle")r[i]={...r[i],numLicenceFFF:"",numPersonne:""};
    // auto-cat si date naissance change
    if(k==="dateNaissance"&&v){
      const suggested=suggestCat(v,saison);
      r[i].categorie=isMinorCategory(suggested)?suggested:"";
    }
    const lic=lookupLic(licenciesConnues,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&!r[i].typeLicence)r[i].typeLicence="renouvellement";
    set("freresSoeurs",r);
  };
  const delFrere=i=>set("freresSoeurs",f.freresSoeurs.filter((_,j)=>j!==i));

  const addAdulte=()=>set("adultesFamille",[...f.adultesFamille,{typeLicence:"",numLicenceFFF:"",numPersonne:"",nom:"",prenom:"",dateNaissance:"",sexe:"",nationalite:"Française",categorie:"Senior",tel:"",email:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleTshirt:"",tailleSurvet:"",tailleSweat:"",initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},photoBase64:""}]);
  const updAdulte=(i,k,v)=>{const r=[...f.adultesFamille];r[i]={...r[i],[k]:v};
    if(k==="typeLicence"&&v==="nouvelle")r[i]={...r[i],numLicenceFFF:"",numPersonne:""};
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    const lic=lookupLic(licenciesConnues,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&!r[i].typeLicence)r[i].typeLicence="renouvellement";
    set("adultesFamille",r);
  };
  const delAdulte=i=>set("adultesFamille",f.adultesFamille.filter((_,j)=>j!==i));
  const AuthLabel=({title,children})=><span><strong>{title}</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.45}}>{children}</span></span>;
  const FamilyAuthorizations=({member,onChange})=>(
    <div style={{marginTop:8,padding:10,background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
      <p style={{fontSize:12,fontWeight:800,margin:"0 0 8px",color:C.N}}>Autorisations</p>
      <Chk checked={member.autoSoins!==false} onChange={v=>onChange("autoSoins",v)} label={<AuthLabel title="🚑 Soins d'urgence">J'autorise les responsables du club à appeler les services d'urgence et à faire pratiquer les soins médicaux nécessaires en cas d'accident. Les responsables légaux seront prévenus dès que possible.</AuthLabel>}/>
      <Chk checked={member.autoPhoto!==false} onChange={v=>onChange("autoPhoto",v)} label={<AuthLabel title="📷 Droit à l'image">J'autorise le club à utiliser des photos ou vidéos de ce membre pour les supports de communication du RSG : site internet, réseaux sociaux, presse locale et documents du club.</AuthLabel>}/>
      <Chk checked={member.autoTransport!==false} onChange={v=>onChange("autoTransport",v)} label={<AuthLabel title="Transport en véhicule personnel">J'autorise le transport de ce membre par un dirigeant, éducateur ou autre parent lors des déplacements liés au club : matchs, entraînements, tournois ou événements.</AuthLabel>}/>
    </div>
  );
  const toggleModePaiement=id=>{
    setF(p=>{
      const cur=(Array.isArray(p.modePaiements)&&p.modePaiements.length?p.modePaiements:(p.modePaiement?[p.modePaiement]:[])).filter(Boolean);
      const next=cur.includes(id)?cur.filter(x=>x!==id):[...cur,id];
      const hasFraction=next.some(mid=>modesPaiement.find(m=>m.id===mid)?.fractionnable);
      return {...p,modePaiements:next,modePaiement:next[0]||"",nbFois:hasFraction?p.nbFois:1,datesEcheances:hasFraction?p.datesEcheances:[]};
    });
  };

  // Y a-t-il des membres famille (pour livret de famille obligatoire)
  const aDesMembresFamille=f.freresSoeurs.length>0||f.adultesFamille.length>0;
  const docsAApporter=getDocsAApporter(f,certifReq,aDesMembresFamille,tarifs);
  const enfantsFamilleLabel=isMajeur?"Enfants mineurs au club":"Frères et sœurs mineurs au club";
  const ajouterEnfantLabel=isMajeur?"+ Ajouter un enfant garçon ou fille":"+ Ajouter un frère / une sœur mineur(e)";
  const repVide=()=>({nom:"",prenom:"",lien:"",tel:"",email:""});
  const adultePrincipalRep=()=>({nom:f.nom||"",prenom:f.prenom||"",lien:f.representants?.[0]?.lien||"",tel:f.telephone||"",email:f.email||""});
  const hasCustomPrimaryRep=()=>["nom","prenom","tel","email"].some(k=>String(f.representants?.[0]?.[k]||"").trim());
  const primaryRepForDisplay=()=>{
    const manual=f.representants?.[0]||{};
    const base=adultePrincipalRep();
    return hasCustomPrimaryRep()?{...base,...manual,lien:manual.lien||base.lien}:base;
  };
  const effectiveRepresentants=()=>{
    const reps=[...(f.representants||[])];
    if(isMajeur&&f.freresSoeurs.length>0)reps[0]=primaryRepForDisplay();
    return reps.filter((r,i)=>(isMajeur&&f.freresSoeurs.length>0&&i===0)||["nom","prenom","lien","tel","email"].some(k=>String(r?.[k]||"").trim()));
  };
  const startEditPrimaryRep=()=>{
    const reps=[...(f.representants||[])];
    reps[0]=primaryRepForDisplay();
    set("representants",reps.length?reps:[primaryRepForDisplay()]);
    setEditPrimaryRep(true);
  };
  const resetPrimaryRepToAdult=()=>{
    const reps=[...(f.representants||[])];
    reps[0]=repVide();
    set("representants",reps);
    setEditPrimaryRep(false);
  };
  const addSecondRep=()=>{
    const reps=[...(f.representants||[])];
    if(!reps[0])reps[0]=repVide();
    if(!reps[1])reps[1]=repVide();
    set("representants",reps.slice(0,2));
  };

  const submit=async()=>{
    if(!validate())return;
    setSaving(true);
    const id=genId();
    const entry={
      id,...f,
      representants:effectiveRepresentants(),
      modePaiements:selectedModes,
      modePaiement:selectedModes[0]||"",
      montantsPaiement:Object.fromEntries(selectedModes.map((id,i)=>[id,calcEcheances(prixFinalTotal,Math.max(1,selectedModes.length))[i]||0])),
      isMajeur,age,
      certifNeeded:certifReq===true,
      saison,
      tarifBase,
      prixFinal:prixFinalTotal,
      prixLicences,
      supplementInitiales,
      detailPrix,
      datesEcheances,
      dateEcheance1:datesEcheances?.[0]||"",
      statut:"attente",notes:"",
      datePreinscription:new Date().toISOString(),
      dateValidation:null,datePaiement:null,
    };
    const entryToSave=await compressEntryPhotos(entry);
    const data=await stGet(keyIns(saison))||[];
    data.unshift(entryToSave);await stSet(keyIns(saison),data);
    let fbOk=true;
    let fbErrMsg="";
    if(isFirebaseAvailable()){
      try{await fbSaveInscription(saison,entryToSave);}
      catch(e){fbOk=false;fbErrMsg=e.message;console.error("Firebase save error:",e);}
    }else{
      fbOk=false;
      fbErrMsg="Firebase non disponible";
    }
    setSaving(false);
    setDone({id,fbOk,fbErrMsg,entry:entryToSave});
  };

  if(done)return<Confirmation refId={done.id} prenom={f.prenom} nom={f.nom} saison={saison} prixFinal={prixFinalTotal} modePaiement={f.modePaiement} modePaiements={f.modePaiements} nbFois={f.nbFois} echeances={echeances} datesEcheances={datesEcheances} entry={done.entry} tarifs={tarifs} fbOk={done.fbOk} fbErrMsg={done.fbErrMsg} onNew={()=>{setDone(null);setStep(1);setF(F0);}} onDone={onDone}/>;

  return(
    <div style={{maxWidth:600,margin:"0 auto",padding:"14px 12px 80px"}} ref={topRef}>
      <ProgressBar steps={STEPS} current={step}/>
      <div style={{background:C.W,borderRadius:14,padding:"20px 16px",boxShadow:"0 2px 12px rgba(0,0,0,.06)",border:`1px solid ${C.Gb}`}}>
        <h2 style={{margin:"0 0 16px",fontSize:17,fontWeight:800,color:C.N,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:C.J,color:C.N,width:26,height:26,borderRadius:6,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,flexShrink:0}}>{step}</span>
          {STEPS[step-1]}
        </h2>

        {/* STEP 1 - Type */}
        {step===stepIdx.type&&<div>
          {errs.typeLicence&&<ErrB msg={errs.typeLicence}/>}
          <p style={{fontSize:14,color:C.G,marginBottom:14,textAlign:"center"}}>Bienvenue ! Avant de commencer, dites-nous si vous étiez déjà licencié(e) au RSG la saison passée.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <TypeCard sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon={RotateCcw} title="Renouvellement au club" sub="J'étais licencié(e) au RSG la saison passée"/>
            <TypeCard sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon={UserPlus} title="Nouvelle licence au club" sub="Je m'inscris pour la première fois au RSG ou je reviens"/>
          </div>
          {f.typeLicence==="renouvellement"&&<div style={{background:"#dcfce7",border:`1px solid #86efac`,borderRadius:8,padding:"10px 12px",fontSize:13,color:C.V}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Icon as={Check} size={15}/>Parfait ! Le secrétariat vérifiera votre certificat médical d'après notre base. Si besoin, on vous le redemandera.</span>
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af"}}>
            👋 Bienvenue au RSG ! Pour une première licence ou un retour, le certificat médical est obligatoire. Si ce n'est pas déjà fait, prenez rendez-vous chez le médecin dès maintenant.
          </div>}
        </div>}

        {/* STEP 2 - Joueur + Photo */}
        {step===stepIdx.joueur&&<div>
          {age!==null&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:isMajeur?"#dbeafe":"#dcfce7",fontSize:13,fontWeight:600,color:isMajeur?C.B:C.V}}>{isMajeur?"🧑 Joueur majeur":"👶 Joueur mineur — un représentant légal sera demandé à l'étape suivante"}</div>}
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <F label="N° licence FFF ou N° personne (facultatif)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Ex : 86297823"/></F>
            {f.numPersonne&&<F label="N° personne Footclubs"><input style={inp()} value={f.numPersonne} readOnly/></F>}
            <LicenceHelp/>
            {licLookupBusy&&<div style={{fontSize:12,color:C.B,fontWeight:700}}>Recherche sécurisée dans la base club...</div>}
            {lic&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>✓ Licencié retrouvé : les champs disponibles sont remplis automatiquement.</div>}
            {licDetect&&f.typeLicence==="renouvellement"&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>✓ Joueur déjà au club détecté : l'inscription est traitée en renouvellement.</div>}
          </div>
          <div style={G2}>
            <F label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="family-name"/></F>
            <F label="Prénom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)} autoCapitalize="words" autoComplete="given-name"/></F>
            <F label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>setF(p=>({...p,dateNaissance:e.target.value,categorie:suggestCat(e.target.value,saison)}))} max={new Date().toISOString().slice(0,10)}/></F>
            <F label="Sexe *" err={errs.sexe}><select style={inp(errs.sexe)} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
            <F label="Lieu de naissance"><input style={inp()} value={f.lieuNaissance} onChange={e=>set("lieuNaissance",e.target.value)} placeholder="Ville"/></F>
            <F label="Nationalité *"><select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
          </div>
          {f.nationalite==="Autre"&&<F label="Précisez"><input style={inp()} value={f.nationaliteAutre} onChange={e=>set("nationaliteAutre",e.target.value)}/></F>}
          <AdresseInput adresse={f.adresse} cp={f.codePostal} ville={f.ville} onAdresse={v=>set("adresse",v)} onCP={v=>set("codePostal",v)} onVille={v=>set("ville",v)} errA={errs.adresse} errCP={errs.codePostal} errV={errs.ville}/>
          {isMajeur&&<div style={G2}><F label="Téléphone *" err={errs.telephone}><input type="tel" style={inp(errs.telephone)} value={f.telephone} onChange={e=>set("telephone",e.target.value)} inputMode="tel" autoComplete="tel"/></F><F label="Email *" err={errs.email}><input type="email" style={inp(errs.email)} value={f.email} onChange={e=>set("email",e.target.value)} inputMode="email" autoComplete="email"/></F></div>}
          <div style={G2}>
            <F label="Catégorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={canonicalCat(f.categorie)} onChange={e=>set("categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{catOptionLabel(c,saison)}</option>)}</select>{f.dateNaissance&&<span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>✓ Détectée auto.</span>}</F>
          </div>
          {["U14-U15","U16-U17-U18","Senior"].includes(canonicalCat(f.categorie))&&<div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
            <Chk checked={f.doubleLicenceDirigeant} onChange={v=>setF(p=>({...p,doubleLicenceDirigeant:v,dirigeantCategorie:""}))} label="Je souhaite aussi une licence dirigeant en complément de ma licence joueur"/>
          </div>}
          {f.categorie&&<div style={{background:f.categorie==="Dirigeant"?"#dcfce7":C.Jp,border:`1px solid ${f.categorie==="Dirigeant"?"#86efac":C.Jd}`,borderRadius:8,padding:"10px 12px",fontSize:13,marginBottom:8}}>
            {f.categorie==="Dirigeant"
              ?<span style={{color:C.V,fontWeight:700}}>🎉 Licence dirigeant <strong>GRATUITE</strong> · pas de dotation textile · chèque boutique de 50 € · pas de certificat médical requis (sauf si arbitrage)</span>
              :<span style={{display:"inline-flex",alignItems:"center",gap:6}}><Icon as={Euro} size={15}/>Tarif {catLabel(f.categorie)} : <strong>{tarifBase} €</strong></span>
            }
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <Chk checked={f.aJoueAutreClub} onChange={v=>{set("aJoueAutreClub",v);if(!v)set("ancienClub","");}} label={<><strong>Avez-vous joué dans un autre club la saison dernière ?</strong><br/><span style={{fontSize:12,color:C.G}}>Cette information aide le secrétariat pour les règles de mutation.</span></>}/>
            {f.aJoueAutreClub&&<F label="Club de la saison dernière *" err={errs.ancienClub}><input style={inp(errs.ancienClub)} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Nom du club précédent"/></F>}
            {f.aJoueAutreClub&&<F label="Informations mutation / commentaire"><textarea style={{...inp(),height:58,resize:"vertical"}} value={f.mutationNotes} onChange={e=>set("mutationNotes",e.target.value)} placeholder="Ex: dernier match, situation particulière, contact club..."/></F>}
          </div>}
          {f.typeLicence!=="nouvelle"&&<F label="Ancien club"><input style={inp()} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Club précédent (si applicable)"/></F>}

          {/* Case arbitrage pour les dirigeants */}
          {f.categorie==="Dirigeant"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <Chk checked={f.dirigeantArbitre} onChange={v=>set("dirigeantArbitre",v)} label={<><strong>🟨 Je souhaite arbitrer cette saison</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.4}}>Si oui, un certificat médical sera demandé sauf s'il a été fait il y a moins de 3 ans.</span></>}/>
          </div>}

          {/* PHOTO OBLIGATOIRE */}
          <div style={{marginTop:14,background:errs.photoBase64?"#fee2e2":C.Jp,border:`2px solid ${errs.photoBase64?C.R:C.Jd}`,borderRadius:10,padding:"14px"}}>
            <p style={{fontWeight:800,fontSize:14,color:C.N,margin:"0 0 4px"}}>📸 Photo d'identité <span style={{color:C.R}}>*</span></p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Obligatoire. Fond neutre, visage dégagé.</p>
            <PhotoInput value={f.photoBase64} onChange={v=>{set("photoBase64",v);if(v)setErrs(p=>{const x={...p};delete x.photoBase64;return x;});}}/>
            {errs.photoBase64&&<div style={{color:C.R,fontSize:12,marginTop:6,fontWeight:600}}>⚠ {errs.photoBase64}</div>}
          </div>
        </div>}

        {/* STEP 3 - Représentants légaux (mineurs) */}
        {!isMajeur&&step===stepIdx.resp&&<div>
          <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:13,color:"#1e40af"}}>
            Info : vous pouvez ajouter plusieurs représentants légaux (parents séparés, tuteurs, grand-parents, etc.).
          </div>
          {f.representants.map((r,i)=>(
            <div key={i} style={{background:i===0?C.Jp:"#f9fafb",border:`1.5px solid ${i===0?C.Jd:C.Gb}`,borderRadius:10,padding:"14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{color:C.N,fontWeight:800,fontSize:14,margin:0}}>{i===0?"Responsable légal principal *":`Responsable légal n°${i+1}`}</h3>
                {i>0&&<button onClick={()=>delRep(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕ Supprimer</button>}
              </div>
              <div style={G2}>
                <F label={`Nom ${i===0?"*":""}`} err={i===0?errs.resp1Nom:null}><input style={inp(i===0?errs.resp1Nom:null)} value={r.nom} onChange={e=>updRep(i,"nom",e.target.value.toUpperCase())} autoCapitalize="characters"/></F>
                <F label={`Prénom ${i===0?"*":""}`} err={i===0?errs.resp1Prenom:null}><input style={inp(i===0?errs.resp1Prenom:null)} value={r.prenom} onChange={e=>updRep(i,"prenom",e.target.value)} autoCapitalize="words"/></F>
                <F label={`Lien avec l'enfant ${i===0?"*":""}`} err={i===0?errs.resp1Lien:null}><select style={inp(i===0?errs.resp1Lien:null)} value={r.lien} onChange={e=>updRep(i,"lien",e.target.value)}><option value="">— Choisir</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
                <F label={`Téléphone ${i===0?"*":""}`} err={i===0?errs.resp1Tel:null}><input type="tel" style={inp(i===0?errs.resp1Tel:null)} value={r.tel} onChange={e=>updRep(i,"tel",e.target.value)} inputMode="tel"/></F>
                <F label={`Email ${i===0?"*":""}`} err={i===0?errs.resp1Email:null} span><input type="email" style={inp(i===0?errs.resp1Email:null)} value={r.email} onChange={e=>updRep(i,"email",e.target.value)} inputMode="email"/></F>
              </div>
            </div>
          ))}
          <button onClick={addRep} style={{...BS,width:"100%",marginTop:6}}>+ Ajouter un autre représentant légal</button>
        </div>}

        {/* STEP médical + autorisations */}
        {step===stepIdx.med&&<div>
          {certifMsg&&<div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:14,borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}><Icon as={certifMsg.ok?Check:Stethoscope} size={16}/><span>{certifMsg.txt}</span></div>}
          {certifReq&&<div style={{background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0369a1",marginBottom:12}}>
            Certificat médical à faire remplir par le médecin : <a href={getCertificatPdfUrl(tarifs)} target="_blank" rel="noreferrer" style={{color:"#0369a1",fontWeight:800}}>ouvrir le PDF</a>.
          </div>}
          <div style={{marginTop:14,padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:14,margin:"0 0 12px"}}>📋 Soins d'urgence</p>

            <Chk checked={f.autoSoins} onChange={v=>set("autoSoins",v)} err={errs.autoSoins} label={<><strong>🚑 Soins d'urgence{!isMajeur?" *":""}</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise les responsables du club à appeler les services d'urgence et à faire pratiquer les soins médicaux d'urgence nécessaires en cas d'accident. Les parents seront prévenus immédiatement.</span></>}/>
            <F label="Allergies / asthme / restrictions (facultatif)" span>
              <textarea style={{...inp(),height:74,resize:"vertical"}} value={f.allergiesAsthme} onChange={e=>set("allergiesAsthme",e.target.value)} placeholder="Ex : aucune, asthme, allergie alimentaire, traitement particulier..."/>
            </F>
          </div>
        </div>}

        {/* STEP équipement */}
        {step===stepIdx.equip&&<div>
          {errs.equipement&&<ErrB msg={errs.equipement}/>}
          <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:C.Jp,border:`1px solid ${C.Jd}`,fontSize:13}}>
            <span style={{color:"#92400e",fontWeight:700}}>Dotation comprise avec la licence - {catLabel(f.categorie)||"catégorie à choisir"}</span>
            <div style={{fontSize:12,color:"#92400e",marginTop:4}}>Guide tailles Kappa : <a href="https://www.kappa.fr/pages/tailles" target="_blank" rel="noreferrer" style={{color:"#92400e",fontWeight:800}}>ouvrir le guide officiel</a></div>
          </div>
          <EquipFields member={f} categorie={f.categorie} tarifs={tarifs} saison={saison} required onChange={(k,v)=>set(k,v)}/>
        </div>}

        {/* STEP famille + documents */}
        {step===stepIdx.famille&&<div>
          {errs.familleInfos&&<ErrB msg={errs.familleInfos}/>}
          {errs.famillePhotos&&<ErrB msg={errs.famillePhotos}/>}
          {/* Frères / sœurs mineurs */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:C.N,fontWeight:800,fontSize:15,margin:"0 0 6px"}}>{enfantsFamilleLabel}</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Si plusieurs enfants mineurs de la même famille s'inscrivent, ajoutez-les ici. Chaque enfant peut être en renouvellement ou en nouvelle licence. La réduction famille correspond à <strong>20 € offerts sur la 2ème licence d'un mineur</strong>.</p>
            {f.freresSoeurs.map((m,i)=>(
              <div key={i} style={{background:C.Jp,border:`1.5px solid ${C.Jd}`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13}}>{isMajeur?"Enfant":"Frère/Sœur"} n°{i+1}</strong>
                  <button onClick={()=>delFrere(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence *" err={errs[`freretypeLicence${i}`]}><select style={inp(errs[`freretypeLicence${i}`])} value={m.typeLicence||""} onChange={e=>updFrere(i,"typeLicence",e.target.value)}><option value="">— Choisir</option><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  {m.typeLicence==="renouvellement"&&<>
                    <F label="N° licence FFF ou N° personne (facultatif)"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updFrere(i,"numLicenceFFF",e.target.value)} onBlur={()=>lookupAndApplyMember("freresSoeurs",i,m)} placeholder="Facultatif"/></F>
                    {m.numPersonne&&<F label="N° personne Footclubs"><input style={inp()} value={m.numPersonne} readOnly/></F>}
                    <div style={{gridColumn:"1 / -1"}}><LicenceHelp/></div>
                  </>}
                  <F label="Nom *" err={errs[`frerenom${i}`]}><input style={inp(errs[`frerenom${i}`])} value={m.nom} onChange={e=>updFrere(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom *" err={errs[`frereprenom${i}`]}><input style={inp(errs[`frereprenom${i}`])} value={m.prenom} onChange={e=>updFrere(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance *" err={errs[`freredateNaissance${i}`]}><input type="date" style={inp(errs[`freredateNaissance${i}`])} value={m.dateNaissance} onChange={e=>updFrere(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe *" err={errs[`freresexe${i}`]}><select style={inp(errs[`freresexe${i}`])} value={m.sexe} onChange={e=>updFrere(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Catégorie *" span err={errs[`frerecategorie${i}`]}><select style={inp(errs[`frerecategorie${i}`])} value={m.categorie} onChange={e=>updFrere(i,"categorie",e.target.value)}><option value="">— Choisir</option>{CATS.filter(c=>isMinorCategory(c.v)).map(c=><option key={c.v} value={c.v}>{catOptionLabel(c,saison)}</option>)}</select></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updFrere(i,"aJoueAutreClub",v)} label="A joué dans un autre club la saison dernière"/>
                  {m.aJoueAutreClub&&<F label="Club précédent *" err={errs[`frereancienClub${i}`]}><input style={inp(errs[`frereancienClub${i}`])} value={m.ancienClub||""} onChange={e=>updFrere(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updFrere(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <EquipFields member={m} categorie={m.categorie} tarifs={tarifs} saison={saison} required errors={Object.fromEntries(getMemberDotationItems(m,m.categorie,tarifs,saison).map(item=>[item.id,errs[`frere${item.id}${i}`]]))} onChange={(k,v)=>updFrere(i,k,v)}/>
                <FamilyAuthorizations member={m} onChange={(k,v)=>updFrere(i,k,v)}/>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>📸 Photo d'identité <span style={{color:C.R}}>*</span></p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updFrere(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addFrere} style={{...BS,width:"100%"}}>{ajouterEnfantLabel}</button>
          </div>

          {isMajeur&&f.freresSoeurs.length>0&&(()=>{
            const primary=primaryRepForDisplay();
            const second=f.representants?.[1];
            return <div style={{marginBottom:18,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px"}}>
              <h3 style={{color:C.N,fontWeight:900,fontSize:15,margin:"0 0 4px"}}>Responsable légal des enfants ajoutés</h3>
              <p style={{fontSize:12,color:C.G,margin:"0 0 10px",lineHeight:1.45}}>Par défaut, l'adulte inscrit en premier est utilisé comme représentant légal principal. Vous pouvez modifier ces coordonnées ou ajouter un deuxième représentant si besoin.</p>

              {!editPrimaryRep&&<div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start",flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:950,color:C.V,textTransform:"uppercase",marginBottom:4}}>Représentant légal principal</div>
                    <div style={{fontSize:15,fontWeight:950,color:C.N}}>{[primary.prenom,primary.nom].filter(Boolean).join(" ")||"Adulte inscrit en premier"}</div>
                    <div style={{fontSize:12,color:C.G,fontWeight:750,marginTop:3}}>{primary.tel||"Téléphone repris de l'adulte"} · {primary.email||"Email repris de l'adulte"}</div>
                    <div style={{fontSize:11,color:C.V,fontWeight:850,marginTop:6}}>Coordonnées reprises automatiquement depuis l'adulte principal du dossier.</div>
                  </div>
                  <button type="button" onClick={startEditPrimaryRep} style={{...BS,fontSize:12,padding:"8px 11px",whiteSpace:"nowrap"}}>Modifier</button>
                </div>
              </div>}

              {editPrimaryRep&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                  <strong style={{fontSize:12,color:C.N}}>Modifier le représentant légal principal</strong>
                  <button type="button" onClick={resetPrimaryRepToAdult} style={{background:"#ecfdf5",color:C.V,border:"1px solid #86efac",borderRadius:8,padding:"6px 9px",fontSize:11,fontWeight:900,cursor:"pointer"}}>Reprendre l'adulte principal</button>
                </div>
                <div style={G2}>
                  <F label="Rôle / lien avec l'enfant *" err={errs.rep0lien}><select style={inp(errs.rep0lien)} value={f.representants?.[0]?.lien||""} onChange={e=>updRep(0,"lien",e.target.value)}><option value="">— Choisir</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
                  <F label="Nom *" err={errs.rep0nom}><input style={inp(errs.rep0nom)} value={f.representants?.[0]?.nom||""} onChange={e=>updRep(0,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom *" err={errs.rep0prenom}><input style={inp(errs.rep0prenom)} value={f.representants?.[0]?.prenom||""} onChange={e=>updRep(0,"prenom",e.target.value)}/></F>
                  <F label="Téléphone *" err={errs.rep0tel}><input type="tel" style={inp(errs.rep0tel)} value={f.representants?.[0]?.tel||""} onChange={e=>updRep(0,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email *" span err={errs.rep0email}><input type="email" style={inp(errs.rep0email)} value={f.representants?.[0]?.email||""} onChange={e=>updRep(0,"email",e.target.value)} inputMode="email"/></F>
                </div>
              </div>}

              {second&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:12,color:C.N}}>Deuxième représentant légal</strong>
                  <button type="button" onClick={()=>delRep(1)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:800}}>Supprimer</button>
                </div>
                <div style={G2}>
                  <F label="Rôle / lien avec l'enfant *" err={errs.rep1lien}><select style={inp(errs.rep1lien)} value={second.lien||""} onChange={e=>updRep(1,"lien",e.target.value)}><option value="">— Choisir</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
                  <F label="Nom *" err={errs.rep1nom}><input style={inp(errs.rep1nom)} value={second.nom||""} onChange={e=>updRep(1,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom *" err={errs.rep1prenom}><input style={inp(errs.rep1prenom)} value={second.prenom||""} onChange={e=>updRep(1,"prenom",e.target.value)}/></F>
                  <F label="Téléphone *" err={errs.rep1tel}><input type="tel" style={inp(errs.rep1tel)} value={second.tel||""} onChange={e=>updRep(1,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email *" span err={errs.rep1email}><input type="email" style={inp(errs.rep1email)} value={second.email||""} onChange={e=>updRep(1,"email",e.target.value)} inputMode="email"/></F>
                </div>
              </div>}

              {!second&&<button type="button" onClick={addSecondRep} style={{...BS,width:"100%"}}>+ Ajouter un 2ème représentant légal</button>}
            </div>;
          })()}

          {/* Adultes de la famille */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:"#1e40af",fontWeight:800,fontSize:15,margin:"0 0 6px"}}>Adultes de la famille au club</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Parents joueurs, dirigeants, etc. : vous pouvez les ajouter au même dossier familial, mais ils ne déclenchent pas la remise famille. La réduction concerne uniquement la 2ème licence d'un mineur.</p>
            {f.adultesFamille.map((m,i)=>(
              <div key={i} style={{background:"#dbeafe",border:`1.5px solid #93c5fd`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13,color:"#1e40af"}}>Adulte n°{i+1}</strong>
                  <button onClick={()=>delAdulte(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence *" err={errs[`adultetypeLicence${i}`]}><select style={inp(errs[`adultetypeLicence${i}`])} value={m.typeLicence||""} onChange={e=>updAdulte(i,"typeLicence",e.target.value)}><option value="">— Choisir</option><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  {m.typeLicence==="renouvellement"&&<>
                    <F label="N° licence FFF ou N° personne (facultatif)"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updAdulte(i,"numLicenceFFF",e.target.value)} onBlur={()=>lookupAndApplyMember("adultesFamille",i,m)} placeholder="Facultatif"/></F>
                    {m.numPersonne&&<F label="N° personne Footclubs"><input style={inp()} value={m.numPersonne} readOnly/></F>}
                    <div style={{gridColumn:"1 / -1"}}><LicenceHelp/></div>
                  </>}
                  <F label="Nom *" err={errs[`adultenom${i}`]}><input style={inp(errs[`adultenom${i}`])} value={m.nom} onChange={e=>updAdulte(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom *" err={errs[`adulteprenom${i}`]}><input style={inp(errs[`adulteprenom${i}`])} value={m.prenom} onChange={e=>updAdulte(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance *" err={errs[`adultedateNaissance${i}`]}><input type="date" style={inp(errs[`adultedateNaissance${i}`])} value={m.dateNaissance} onChange={e=>updAdulte(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe *" err={errs[`adultesexe${i}`]}><select style={inp(errs[`adultesexe${i}`])} value={m.sexe} onChange={e=>updAdulte(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Nationalité *" err={errs[`adultenationalite${i}`]}><select style={inp(errs[`adultenationalite${i}`])} value={m.nationalite} onChange={e=>updAdulte(i,"nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
                  <F label="Catégorie *" err={errs[`adultecategorie${i}`]}><select style={inp(errs[`adultecategorie${i}`])} value={canonicalCat(m.categorie)} onChange={e=>updAdulte(i,"categorie",e.target.value)}><option value="">—</option>{CATS.filter(c=>["Senior","Dirigeant"].includes(c.v)).map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                  <F label="Téléphone *" err={errs[`adultetel${i}`]}><input type="tel" style={inp(errs[`adultetel${i}`])} value={m.tel} onChange={e=>updAdulte(i,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email *" err={errs[`adulteemail${i}`]}><input type="email" style={inp(errs[`adulteemail${i}`])} value={m.email} onChange={e=>updAdulte(i,"email",e.target.value)} inputMode="email"/></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updAdulte(i,"aJoueAutreClub",v)} label="A joué dans un autre club la saison dernière"/>
                  {m.aJoueAutreClub&&<F label="Club précédent *" err={errs[`adulteancienClub${i}`]}><input style={inp(errs[`adulteancienClub${i}`])} value={m.ancienClub||""} onChange={e=>updAdulte(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updAdulte(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <EquipFields member={m} categorie={m.categorie} tarifs={tarifs} saison={saison} required errors={Object.fromEntries(getMemberDotationItems(m,m.categorie,tarifs,saison).map(item=>[item.id,errs[`adulte${item.id}${i}`]]))} onChange={(k,v)=>updAdulte(i,k,v)}/>
                <FamilyAuthorizations member={m} onChange={(k,v)=>updAdulte(i,k,v)}/>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>📸 Photo d'identité <span style={{color:C.R}}>*</span></p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updAdulte(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addAdulte} style={{background:"#dbeafe",color:"#1e40af",border:`2px solid #93c5fd`,borderRadius:10,padding:"12px 18px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",minHeight:48}}>+ Ajouter un adulte de la famille</button>
          </div>

        </div>}

        {/* STEP paiement */}
        {step===stepIdx.paie&&<div>
          {/* Détail prix par membre */}
          <div style={{background:C.N,borderRadius:12,padding:"16px",marginBottom:16}}>
            <p style={{color:"#9ca3af",fontSize:12,margin:"0 0 10px",textAlign:"center"}}>Détail tarif famille ({tousMembres.length} membre{tousMembres.length>1?"s":""})</p>
            {detailPrix.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:i<detailPrix.length-1?"1px solid #333":"none",color:C.W}}>
                <span>{d.rang===1?"Joueur principal":`Membre ${d.rang}`} ({catLabel(d.categorie)})</span>
                <span>
                  {d.pct>0?<span style={{color:"#9ca3af",textDecoration:"line-through",marginRight:6}}>{d.base}€</span>:null}
                  <strong style={{color:d.pct>0?"#86efac":C.J}}>{d.prix}€</strong>
                  {d.pct>0&&<span style={{fontSize:11,color:"#86efac",marginLeft:4}}>(-{d.pct} €)</span>}
                </span>
              </div>
            ))}
            {supplementInitiales>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderTop:"1px solid #333",color:C.W}}>
              <span>Initiales équipement ({nbInitialesEquipements})</span>
              <strong style={{color:C.J}}>{supplementInitiales}€</strong>
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:18,paddingTop:10,marginTop:8,borderTop:"2px solid #555",fontWeight:900}}>
              <span style={{color:C.W}}>TOTAL</span>
              <span style={{color:C.J}}>{prixFinalTotal} €</span>
            </div>
          </div>

          {/* Nom de famille (si famille) */}
          {tousMembres.length>1&&<F label="Nom de famille (obligatoire pour regrouper le dossier)" err={errs.nomFamille}><input style={inp(errs.nomFamille)} value={f.nomFamille} onChange={e=>set("nomFamille",e.target.value.toUpperCase())} placeholder="Ex: DUPONT"/></F>}

          {/* Mode de paiement */}
          {errs.modePaiement&&<ErrB msg={errs.modePaiement}/>}
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 4px"}}>Mode de paiement indicatif</p>
          <p style={{fontSize:12,color:C.G,margin:"0 0 10px",lineHeight:1.45}}>Réponse facultative : le choix sert uniquement d'indication pour le club. Le paiement se fera au moment des permanences de licence. Vous pouvez choisir plusieurs modes.</p>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {modesPaiement.map(m=>(
              <button key={m.id} type="button" onClick={ev=>{ev.preventDefault();toggleModePaiement(m.id);}}
                style={{flex:"1 0 auto",padding:"10px 12px",border:`2px solid ${selectedModes.includes(m.id)?C.J:C.Gb}`,background:selectedModes.includes(m.id)?C.Jp:"#fafafa",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"center",minHeight:48}}>
                {m.l}
                {selectedModes.includes(m.id)&&<span style={{display:"block",fontSize:10,color:C.Jd,marginTop:2}}>Sélectionné</span>}
              </button>
            ))}
          </div>

          {/* Fractionnement (chèque uniquement) */}
          {f.modePaiement&&modeObj?.fractionnable&&(
            <div style={{background:C.Gc,borderRadius:10,padding:"14px",marginBottom:14}}>
              <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Paiement en plusieurs fois (sans frais)</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:f.nbFois>1?12:0}}>
                {[1,2,3,4].map(n=>(
                  <button key={n} onClick={()=>{set("nbFois",n);set("datesEcheances",Array.from({length:n},(_,i)=>f.datesEcheances?.[i]||""));}}
                    style={{flex:"1 0 auto",padding:"8px 10px",border:`2px solid ${f.nbFois===n?C.J:C.Gb}`,background:f.nbFois===n?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:40}}>
                    {n===1?"1x (comptant)":`${n}x`}
                  </button>
                ))}
              </div>
              {f.nbFois>1&&<div style={{marginBottom:10}}>
                <p style={{...lbl,marginBottom:8}}>Dates d'encaissement *</p>
                {errs.dateEcheance1&&<ErrB msg={errs.dateEcheance1}/>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {Array.from({length:f.nbFois},(_,i)=><F key={i} label={`${modeObj?.id==="cheque"?"Chèque":"Versement"} ${i+1}`}>
                    <input type="date" style={inp()} value={f.datesEcheances?.[i]||""} onChange={e=>set("datesEcheances",Array.from({length:f.nbFois},(_,j)=>j===i?e.target.value:(f.datesEcheances?.[j]||"")))} min={new Date().toISOString().slice(0,10)}/>
                  </F>)}
                </div>
              </div>}
              {f.nbFois>1&&datesEcheances&&(
                <div style={{marginTop:8,padding:"10px 12px",background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
                  <p style={{fontWeight:700,fontSize:12,color:C.G,margin:"0 0 6px"}}>Échéancier prévu :</p>
                  {echeances.map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<f.nbFois-1?`1px solid ${C.Gc}`:"none",fontSize:13}}>
                      <span style={{color:C.G}}>{modeObj?.id==="cheque"?"Chèque":"Versement"} {i+1} (encaissé le {datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span>
                      <span style={{fontWeight:700,color:C.J}}>{m} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {f.modePaiement==="especes"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#92400e"}}>
            💵 Paiement en espèces uniquement en une seule fois, à remettre <strong>en permanence licence</strong>.
          </div>}
          {f.modePaiement==="cb"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#92400e"}}>
            💳 Paiement par CB en une seule fois, à régler <strong>en permanence licence</strong>.
          </div>}
          {f.modePaiement==="rib"&&<div style={{background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0369a1",marginBottom:10}}>
            Paiement par RIB / virement : le club vous confirmera les consignes lors de la validation.
          </div>}

          <F label="Message pour le secrétariat (optionnel)"><textarea style={{...inp(),height:80,resize:"vertical"}} value={f.commentaire} onChange={e=>set("commentaire",e.target.value)} placeholder="Questions, infos particulières..."/></F>
        </div>}

        {/* STEP récap */}
        {step===total&&<div>
          <div style={{display:"flex",alignItems:"center",gap:7,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:13,color:"#713f12"}}><Icon as={AlertTriangle} size={15}/>Vérifiez avant d'envoyer.</div>
          {certifMsg&&<div style={{display:"flex",alignItems:"flex-start",gap:7,marginBottom:10,borderRadius:8,padding:"8px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}><Icon as={certifMsg.ok?Check:Stethoscope} size={15}/><span>{certifMsg.txt}</span></div>}

          <RB title="Licence">
            <RR l="Type" v={f.typeLicence==="renouvellement"?"🔄 Renouvellement au club":"✨ Nouvelle licence au club"}/>
            {f.numLicenceFFF&&<RR l="N° FFF" v={f.numLicenceFFF}/>}
            {f.numPersonne&&<RR l="N° personne" v={f.numPersonne}/>}
          </RB>

          <RB title="Joueur principal">
            <RR l="Identité" v={`${f.prenom} ${f.nom}`}/>
            <RR l="Naissance" v={`${fmtD(f.dateNaissance)}${f.lieuNaissance?" — "+f.lieuNaissance:""}`}/>
            <RR l="Catégorie" v={catLabel(f.categorie)}/>
            {f.doubleLicenceDirigeant&&<RR l="Licence dirigeant" v="Oui"/>}
            <RR l="Adresse" v={`${f.adresse}, ${f.codePostal} ${f.ville}`}/>
            <RR l="Nationalité" v={f.nationalite}/>
            {isMajeur&&<><RR l="Tél" v={f.telephone}/><RR l="Email" v={f.email}/></>}
          </RB>

          {!isMajeur&&f.representants[0]?.nom&&<RB title={`Représentant${f.representants.length>1?"s":""} légal${f.representants.length>1?"aux":""}`}>
            {f.representants.filter(r=>r.nom).map((r,i)=>(
              <div key={i} style={{padding:"4px 0",borderBottom:i<f.representants.length-1?`1px dashed ${C.Gc}`:"none"}}>
                <RR l={r.lien||"Resp."} v={`${r.prenom} ${r.nom}`}/>
                <RR l="Contact" v={`${r.tel} · ${r.email}`}/>
              </div>
            ))}
          </RB>}

          {(() => {
            const equipementRecap=getDotationRecapRows(f,f.categorie,tarifs,saison);
            return equipementRecap.length>0&&<RB title="Équipement">
              {equipementRecap.map(row=><RR key={row.label} l={row.label} v={row.value}/>)}
            </RB>;
          })()}

          {f.freresSoeurs.length>0&&<RB title={`${isMajeur?"Enfants":"Frères/sœurs"} (${f.freresSoeurs.length})`}>
            {f.freresSoeurs.map((m,i)=><RR key={i} l={catLabel(m.categorie)||"?"} v={`${m.prenom} ${m.nom} · ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
          </RB>}

          {f.adultesFamille.length>0&&<RB title={`Adultes famille (${f.adultesFamille.length})`}>
            {f.adultesFamille.map((m,i)=><RR key={i} l={catLabel(m.categorie)||"?"} v={`${m.prenom} ${m.nom} · ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
          </RB>}

          {/* Récap paiement */}
          <div style={{background:C.N,borderRadius:10,padding:"14px",marginBottom:8}}>
            <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Paiement</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.W,fontSize:13}}>{paiementLabels(f.modePaiements,f.modePaiement,tarifs).join(" + ")||"À choisir en permanence"}</div>
                {f.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {f.nbFois} chèques</div>}
                {tousMembres.length>1&&<div style={{color:"#86efac",fontSize:12}}>Tarif famille {f.nomFamille||""} ({tousMembres.length} membres)</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.J,fontWeight:900,fontSize:24}}>{prixFinalTotal} €</div>
              </div>
            </div>
            {f.nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
              {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"Chèque":"Versement"} {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
            </div>}
          </div>

          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px",marginBottom:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px",color:"#92400e"}}>Préparez si possible pour la permanence</p>
            <ul style={{margin:"0 0 10px",paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
              {docsAApporter.map((d,i)=><li key={i}>{d}</li>)}
              <li><strong>{prixFinalTotal} €</strong>{paiementLabels(f.modePaiements,f.modePaiement,tarifs).length?` · paiement indicatif : ${paiementLabels(f.modePaiements,f.modePaiement,tarifs).join(" + ")}`:" · paiement à choisir en permanence"}{f.nbFois>1?` (${f.nbFois} versements)`:""}</li>
            </ul>
            {certifReq&&<a href={getCertificatPdfUrl(tarifs)} target="_blank" rel="noreferrer" style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e",marginRight:10}}>Télécharger le certificat médical</a>}
            <a href={getChartePdfUrl(tarifs)} target="_blank" rel="noreferrer" onClick={()=>setCharteOpened(true)} style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e"}}>Lire la charte RSG</a>
          </div>

          <div style={{background:errs.charteAcceptee?"#fee2e2":"#f0fdf4",border:`1px solid ${errs.charteAcceptee?"#fca5a5":"#86efac"}`,borderRadius:10,padding:"12px",marginBottom:10}}>
            <Chk checked={f.charteAcceptee} onChange={v=>set("charteAcceptee",v)} err={errs.charteAcceptee} label={<span>J'ai lu et j'accepte la <a href={getChartePdfUrl(tarifs)} target="_blank" rel="noreferrer" onClick={()=>setCharteOpened(true)} style={{color:C.N,fontWeight:800}}>charte RSG</a>.</span>}/>
            {!charteOpened&&<div style={{fontSize:11,color:"#92400e",fontWeight:800,margin:"4px 0 8px"}}>Ouvrez la charte au moins une fois avant validation.</div>}
            <Chk checked={f.autoPhoto} onChange={v=>set("autoPhoto",v)} label={<span><strong>📷 Droit à l'image</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise le club à utiliser des photos et vidéos sur lesquelles je figure (ou mon enfant) pour communiquer sur les supports du club : site web, journal local, comptes Facebook / Instagram du RSG.</span></span>}/>
            <Chk checked={f.autoTransport} onChange={v=>set("autoTransport",v)} label={<span><strong>Transport en véhicule personnel</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise le transport dans le véhicule personnel d'un autre parent ou d'un dirigeant du club lors des déplacements pour matchs et entraînements.</span></span>}/>
          </div>

          {f.photoBase64&&<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:12,background:C.Gc,borderRadius:8,padding:10}}>
            <img src={f.photoBase64} alt="Photo" style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:`2px solid ${C.J}`,flexShrink:0}}/>
            <span style={{fontSize:13,color:C.V,fontWeight:600}}>✓ Photo d'identité fournie</span>
          </div>}

          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af",marginBottom:10}}>
            <strong>Première inscription au club</strong> : nous vous recommandons d'imprimer ce récap et de l'apporter en permanence.
          </div>}
          <p style={{fontSize:12,color:C.G,lineHeight:1.5}}>En envoyant, vous certifiez l'exactitude des informations (RGPD).</p>
        </div>}

        <div style={{display:"flex",gap:10,marginTop:20,paddingTop:16,borderTop:`1px solid ${C.Gc}`}}>
          {step>1&&<button style={BS} onClick={prev}>Préc.</button>}
          <div style={{flex:1}}/>
          {step<total&&<button style={BP} onClick={next}>Suivant <Icon as={ChevronRight}/></button>}
          {step===total&&<button style={{...BP,opacity:saving?0.7:1}} onClick={submit} disabled={saving}><Icon as={Check}/>{saving?"Envoi...":"Envoyer"}</button>}
        </div>
      </div>
    </div>
  );
}


/* â•â• CONFIRMATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Confirmation({refId,prenom,nom,saison,prixFinal,modePaiement,modePaiements,nbFois,echeances,datesEcheances,entry,tarifs,fbOk,fbErrMsg,onNew,onDone}){
  const modesLabel=paiementLabels(modePaiements,modePaiement,tarifs).join(" + ");
  const selectedModes=(Array.isArray(modePaiements)&&modePaiements.length?modePaiements:(modePaiement?[modePaiement]:[])).filter(Boolean);
  const modes=getModesPaiement(tarifs);
  const modeObj=selectedModes.map(id=>modes.find(m=>m.id===id)).find(m=>m?.fractionnable)||modes.find(m=>m.id===selectedModes[0]);
  const aDesMembresFamille=(entry?.freresSoeurs?.length||0)+(entry?.adultesFamille?.length||0)>0;
  const docs=getDocsAApporter(entry||{},entry?.certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
  const planningRows=planningForEntry(tarifs,entry||{categorie:""});
  const planningContacts=[...new Map(planningRows.map(c=>planningResponsableFor(tarifs,c.categorie,c.sexe)).filter(r=>planningContactLabel(r)).map(r=>[planningRespKey(r.categorie,r.sexe),r])).values()];
  return<div style={{maxWidth:480,margin:"24px auto",padding:"0 14px 64px",textAlign:"center"}}>
    <div style={{background:C.W,borderRadius:16,padding:"28px 20px",boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`3px solid ${C.J}`}}>
      <div style={{fontSize:52,marginBottom:10}}>🎉</div>
      <h2 style={{color:C.N,fontWeight:900,fontSize:22,margin:"0 0 6px"}}>Préinscription envoyée !</h2>
      <p style={{color:C.G,margin:"0 0 4px",fontSize:14}}>Merci <strong>{prenom} {nom}</strong></p>
      <p style={{color:C.G,margin:"0 0 16px",fontSize:13}}>Saison {saison}</p>
      {fbOk===false&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 12px",margin:"0 0 12px",fontSize:12,color:"#92400e",textAlign:"left"}}>
        <strong>Attention : envoi cloud échoué</strong><br/>
        Votre préinscription est sauvegardée sur cet appareil mais n'a pas été transmise au club. Merci de noter votre référence ci-dessous et de la communiquer au secrétariat lors de la permanence.
        {fbErrMsg&&<div style={{fontSize:10,color:"#78350f",marginTop:4,opacity:.7}}>Erreur : {fbErrMsg}</div>}
      </div>}
      <div style={{background:C.Jp,border:`2px solid ${C.J}`,borderRadius:10,padding:"12px 16px",margin:"0 0 12px",display:"inline-block",minWidth:200}}>
        <p style={{fontSize:11,color:C.G,margin:"0 0 4px"}}>Référence</p>
        <p style={{fontSize:20,fontWeight:900,color:C.N,letterSpacing:3,margin:0}}>{refId}</p>
      </div>
      <div style={{background:C.N,borderRadius:10,padding:"12px 16px",margin:"0 0 16px"}}>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px"}}>PAIEMENT</p>
        <p style={{color:C.J,fontWeight:900,fontSize:24,margin:"0 0 4px"}}>{prixFinal} €</p>
        <p style={{color:C.W,fontSize:13,margin:0}}>{modesLabel||"Paiement à choisir en permanence"}{nbFois>1?` · ${nbFois} versements`:""}</p>
        {echeances&&nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"Chèque":"Versement"} {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
        </div>}
      </div>
      <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px 14px",margin:"0 0 16px",textAlign:"left"}}>
        <p style={{fontWeight:800,fontSize:13,color:"#92400e",margin:"0 0 8px"}}>Préparez si possible pour valider la licence</p>
        {docs.length?(
          <ul style={{margin:"0 0 10px",paddingLeft:18,fontSize:13,color:"#78350f",lineHeight:1.6}}>
            {docs.map((d,i)=><li key={i}>{d}</li>)}
            <li><strong>{prixFinal} €</strong>{modesLabel?` · paiement indicatif : ${modesLabel}`:" · paiement à choisir en permanence"}{nbFois>1?` (${nbFois} versements)`:""}</li>
          </ul>
        ):<p style={{fontSize:13,color:"#78350f",margin:"0 0 10px"}}>Vos documents sont indiqués comme prêts. Pensez simplement au règlement et à votre référence.</p>}
        <p style={{fontWeight:700,fontSize:12,color:"#92400e",margin:"0 0 6px"}}>Permanences licence</p>
        <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
          {permanences.map((p,i)=><li key={i}>{fmtPermanence(p)}{permanenceMessage(p)&&<div style={{fontWeight:750,lineHeight:1.35,margin:"2px 0 6px",whiteSpace:"pre-line"}}>{permanenceMessage(p)}</div>}</li>)}
        </ul>
        {planningRows.length>0&&<>
          <p style={{fontWeight:700,fontSize:12,color:"#92400e",margin:"10px 0 6px"}}>Entraînements</p>
          <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
            {planningRows.map(c=><li key={c.id}><strong>{planningOptionLabel(c)}</strong> · {creneauLabel(c)}</li>)}
          </ul>
          {planningContacts.length>0&&<div style={{fontSize:12,color:"#78350f",fontWeight:800,marginTop:6}}>
            Responsable : {planningContacts.map(planningContactLabel).join(" · ")}
          </div>}
        </>}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {entry&&<button style={BS} onClick={()=>printRecap(entry,saison,prixFinal,modeObj,echeances,datesEcheances,entry.certifNeeded,aDesMembresFamille,tarifs)}>Imprimer</button>}
        <button style={BS} onClick={onDone}>Accueil</button>
        <button style={BP} onClick={onNew}>Nouvelle préinscription</button>
      </div>
    </div>
  </div>;
}

function AdminPasswordPanel({saison}) {
  const [form,setForm]=useState({currentCode:"",newCode:"",confirmCode:""});
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState(null);
  const setField=(field,value)=>{setForm(prev=>({...prev,[field]:value}));setMsg(null);};
  const submit=async()=>{
    const currentCode=form.currentCode.trim();
    const newCode=form.newCode.trim();
    const confirmCode=form.confirmCode.trim();
    if(!currentCode||!newCode||!confirmCode){setMsg({type:"error",text:"Renseignez le code actuel, le nouveau code et la confirmation."});return;}
    if(newCode.length<8){setMsg({type:"error",text:"Le nouveau code doit contenir au moins 8 caracteres."});return;}
    if(newCode!==confirmCode){setMsg({type:"error",text:"La confirmation ne correspond pas au nouveau code."});return;}
    if(currentCode===newCode){setMsg({type:"error",text:"Le nouveau code doit etre different de l'ancien."});return;}
    if(!isFirebaseAvailable()){setMsg({type:"error",text:"Firebase n'est pas disponible : changement impossible depuis cette session."});return;}
    setBusy(true);
    try{
      await fbChangeAdminPassword({saison,currentCode,newCode});
      setForm({currentCode:"",newCode:"",confirmCode:""});
      setMsg({type:"success",text:"Code d'acces bureau modifie. Utilisez le nouveau code a la prochaine connexion."});
    }catch(err){
      setMsg({type:"error",text:err?.message||"Changement impossible pour le moment."});
    }finally{
      setBusy(false);
    }
  };
  const messageStyle=msg?{
    background:msg.type==="success"?"#dcfce7":"#fee2e2",
    color:msg.type==="success"?C.V:C.R,
    border:`1px solid ${msg.type==="success"?"#86efac":"#fecaca"}`,
    borderRadius:10,
    padding:"9px 11px",
    fontSize:12,
    fontWeight:800,
    marginTop:10,
    lineHeight:1.35
  }:null;
  return <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"14px",marginBottom:12,boxShadow:"0 8px 24px rgba(15,23,42,.04)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start",flexWrap:"wrap",marginBottom:12}}>
      <div>
        <p style={{fontWeight:950,fontSize:15,color:C.N,margin:"0 0 4px"}}>Changer le code d'acces bureau</p>
        <p style={{fontSize:12,color:C.G,margin:0,lineHeight:1.45}}>Le code n'est pas stocke en clair : seul un hash serveur est conserve dans Firebase.</p>
      </div>
      <span style={{background:"#ecfdf5",color:C.V,border:"1px solid #86efac",borderRadius:999,padding:"5px 9px",fontSize:11,fontWeight:950}}>Securise</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
      <F label="Code actuel"><input type="password" autoComplete="current-password" style={inp()} value={form.currentCode} onChange={e=>setField("currentCode",e.target.value)} disabled={busy}/></F>
      <F label="Nouveau code"><input type="password" autoComplete="new-password" style={inp()} value={form.newCode} onChange={e=>setField("newCode",e.target.value)} disabled={busy}/></F>
      <F label="Confirmer"><input type="password" autoComplete="new-password" style={inp()} value={form.confirmCode} onChange={e=>setField("confirmCode",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} disabled={busy}/></F>
    </div>
    <button type="button" style={{...BP,width:"100%",fontSize:13,padding:"9px 14px",minHeight:42,opacity:busy?0.7:1}} onClick={submit} disabled={busy}>{busy?"Modification...":"Enregistrer le nouveau code"}</button>
    {msg&&<div style={messageStyle}>{msg.text}</div>}
    <p style={{fontSize:11,color:C.G,margin:"9px 0 0",lineHeight:1.45}}>Si le code est oublie, le reset se fait par Firebase par le responsable technique. L'ancien code cesse de fonctionner des qu'un code app est defini.</p>
  </div>;
}

/* â•â• DASHBOARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const renderAdminEmailTpl=(tpl,recipient,saison)=>String(tpl||"")
  .replaceAll("{prenom}",recipient?.prenom||"")
  .replaceAll("{nom}",recipient?.nom||"")
  .replaceAll("{categorie}",recipient?.categorie||"")
  .replaceAll("{type}",recipient?.type||"")
  .replaceAll("{reference}",recipient?.reference||"")
  .replaceAll("{saison}",saison||"")
  .replaceAll("{source}",recipient?.source||"");

const MAIL_ATTACHMENT_MAX_FILES=5;
const MAIL_ATTACHMENT_MAX_FILE_BYTES=5*1024*1024;
const MAIL_ATTACHMENT_MAX_TOTAL_BYTES=8*1024*1024;
const fileSizeLabel=bytes=>{
  const n=Number(bytes)||0;
  if(n>=1024*1024)return `${(n/1024/1024).toFixed(n>=10*1024*1024?0:1)} Mo`;
  if(n>=1024)return `${Math.round(n/1024)} Ko`;
  return `${n} o`;
};
const readMailAttachment=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve({
    Filename:file.name||"piece-jointe",
    ContentType:file.type||"application/octet-stream",
    Base64Content:String(reader.result||"").split(",")[1]||"",
    Size:file.size||0,
  });
  reader.onerror=()=>reject(reader.error||new Error("Lecture du fichier impossible."));
  reader.readAsDataURL(file);
});

function RichTextEditor({value,onChange,variables,toolbarLabel="Éditeur du message"}) {
  const ref=useRef(null);
  const htmlRef=useRef(null);
  const [htmlMode,setHtmlMode]=useState(false);
  const [color,setColor]=useState("#111827");
  const [bgColor,setBgColor]=useState("#fff8d6");
  const variableList=variables&&variables.length?variables:["{prenom}","{nom}","{categorie}","{type}","{saison}","{reference}","{source}"];
  useEffect(()=>{if(ref.current&&!htmlMode&&ref.current.innerHTML!==value)ref.current.innerHTML=value||"";},[value,htmlMode]);
  const sync=()=>onChange(ref.current?.innerHTML||"");
  const cmd=(name,arg=null)=>{ref.current?.focus();document.execCommand(name,false,arg);sync();};
  const insertHtmlText=v=>{
    const el=htmlRef.current;
    const raw=value||"";
    const start=el?.selectionStart??raw.length;
    const end=el?.selectionEnd??raw.length;
    const next=raw.slice(0,start)+v+raw.slice(end);
    onChange(next);
    requestAnimationFrame(()=>{if(el){el.focus();el.selectionStart=el.selectionEnd=start+v.length;}});
  };
  const addVar=v=>{
    if(htmlMode){insertHtmlText(v);return;}
    ref.current?.focus();
    document.execCommand("insertText",false,v);
    sync();
  };
  const tab=(label,active,onClick)=><button type="button" onClick={onClick} style={{border:"none",borderLeft:`1px solid ${C.Gb}`,background:active?C.W:"#f8fafc",color:active?C.N:C.G,fontSize:11,fontWeight:900,padding:"7px 10px",minHeight:30,cursor:"pointer",fontFamily:FONT}}>{label}</button>;
  const iconBtn=(label,onClick,title,active=false,wide=false)=>(
    <button type="button" title={title||label} aria-label={title||label} style={{height:30,minWidth:wide?52:30,padding:wide?"0 8px":"0",border:`1px solid ${active?C.Jd:C.Gb}`,borderRadius:4,background:active?C.Jp:C.W,color:C.N,boxShadow:"none",fontSize:13,fontWeight:900,cursor:"pointer",fontFamily:FONT,lineHeight:1}} onClick={onClick}>{label}</button>
  );
  const sep=()=><span style={{width:1,height:20,background:C.Gb,display:"inline-block",margin:"0 2px"}}/>;
  const colorTool=(label,current,onPick,title)=>(
    <label title={title} style={{height:30,minWidth:34,border:`1px solid ${C.Gb}`,borderRadius:4,background:C.W,display:"inline-flex",alignItems:"center",justifyContent:"center",position:"relative",cursor:"pointer",fontSize:13,fontWeight:950,color:C.N}}>
      <span style={{borderBottom:`3px solid ${current}`,lineHeight:1}}>{label}</span>
      <input type="color" value={current} onChange={e=>onPick(e.target.value)} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
    </label>
  );
  return <div style={{border:`1px solid ${C.Gb}`,borderRadius:14,overflow:"hidden",background:C.W}}>
    <div style={{background:"#f8fafc",borderBottom:`1px solid ${C.Gb}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"stretch",borderBottom:`1px solid ${C.Gb}`,minHeight:34}}>
        <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",minWidth:0}}>
          <span style={{fontSize:11,color:C.G,fontWeight:900,textTransform:"uppercase",letterSpacing:.2}}>{toolbarLabel}</span>
        </div>
        <div style={{display:"flex",flexShrink:0}}>
          {tab("Visuel",!htmlMode,()=>setHtmlMode(false))}
          {tab("Texte",htmlMode,()=>setHtmlMode(true))}
        </div>
      </div>
      {!htmlMode&&<div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",padding:"6px 8px"}}>
        <select title="Format" style={{height:30,width:120,border:`1px solid ${C.Gb}`,borderRadius:4,background:C.W,padding:"0 8px",fontSize:12,fontWeight:800,color:C.N,fontFamily:FONT}} onChange={e=>cmd("formatBlock",e.target.value)} defaultValue="p" disabled={htmlMode}>
          <option value="p">Paragraphe</option>
          <option value="h2">Titre</option>
          <option value="h3">Sous-titre</option>
          <option value="blockquote">Citation</option>
        </select>
        {iconBtn("B",()=>cmd("bold"),"Gras")}
        {iconBtn(<span style={{fontStyle:"italic"}}>I</span>,()=>cmd("italic"),"Italique")}
        {iconBtn(<span style={{textDecoration:"underline"}}>U</span>,()=>cmd("underline"),"Souligner")}
        {sep()}
        {iconBtn("•",()=>cmd("insertUnorderedList"),"Liste à puces")}
        {iconBtn("1.",()=>cmd("insertOrderedList"),"Liste numérotée")}
        {iconBtn("“”",()=>cmd("formatBlock","blockquote"),"Citation")}
        {sep()}
        {iconBtn("≡",()=>cmd("justifyLeft"),"Aligner à gauche")}
        {iconBtn("≣",()=>cmd("justifyCenter"),"Centrer")}
        {iconBtn("☰",()=>cmd("justifyRight"),"Aligner à droite")}
        {sep()}
        {colorTool("A",color,v=>{setColor(v);cmd("foreColor",v);},"Couleur du texte")}
        {colorTool("S",bgColor,v=>{setBgColor(v);cmd("hiliteColor",v);},"Surlignage")}
        {iconBtn("⌁",()=>{const url=prompt("Adresse du lien");if(url)cmd("createLink",url);},"Lien")}
        {iconBtn("—",()=>cmd("insertHorizontalRule"),"Trait horizontal")}
        {sep()}
        {iconBtn("↶",()=>cmd("undo"),"Annuler")}
        {iconBtn("↷",()=>cmd("redo"),"Rétablir")}
        {iconBtn("Tx",()=>cmd("removeFormat"),"Effacer le style",false,true)}
      </div>}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",padding:"0 8px 7px"}}>
        <span style={{fontSize:11,color:C.G,fontWeight:900,marginRight:2}}>Variables</span>
        {variableList.map(v=><button key={v} type="button" title={`Insérer ${v}`} style={{height:26,border:`1px solid ${C.Gb}`,borderRadius:4,background:C.W,color:C.N,fontSize:11,fontWeight:850,padding:"0 7px",cursor:"pointer",fontFamily:FONT}} onClick={()=>addVar(v)}>{v}</button>)}
      </div>
    </div>
    {htmlMode
      ?<textarea ref={htmlRef} style={{width:"100%",border:"none",display:"block",minHeight:320,maxHeight:520,resize:"vertical",fontFamily:"Consolas, monospace",fontSize:13,lineHeight:1.55,background:C.W,padding:"14px 16px",outline:"none",color:C.N,boxSizing:"border-box"}} value={value||""} onChange={e=>onChange(e.target.value)}/>
      :<div ref={ref} contentEditable onInput={sync} style={{minHeight:320,maxHeight:520,overflow:"auto",lineHeight:1.6,background:C.W,padding:"14px 16px",outline:"none",fontSize:14,color:C.N}}/>}
  </div>;
}

function ConfigTemplateEditor({
  subjectValue,
  onSubjectChange,
  bodyValue,
  onBodyChange,
  variables,
  toolbarLabel,
  subjectLabel="Objet du message",
  bodyLabel="Corps du message",
  renderedSubject,
  previewHtml,
  previewLabel="Aperçu",
  previewHint="Exemple : destinataire exemple",
  help,
  compact=false,
  attestationPreview=false,
}) {
  return <div style={{display:"grid",gridTemplateColumns:compact?"1fr":"minmax(360px,1fr) minmax(320px,.9fr)",gap:12,alignItems:"start",marginBottom:12}}>
    <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}>
      {onSubjectChange&&<F label={subjectLabel} span><input style={inp()} value={subjectValue||""} onChange={e=>onSubjectChange(e.target.value)} placeholder="Objet du message"/></F>}
      <F label={bodyLabel} span>
        <RichTextEditor value={bodyValue} onChange={onBodyChange} variables={variables} toolbarLabel={toolbarLabel}/>
      </F>
      {help&&<div style={{fontSize:11,color:C.G,margin:"-4px 0 0",lineHeight:1.5}}>{help}</div>}
    </div>
    <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",position:compact?"static":"sticky",top:12}}>
      <p style={{display:"flex",alignItems:"center",gap:7,fontWeight:950,fontSize:14,color:C.N,margin:"0 0 8px"}}><Icon as={Eye} size={16}/>{previewLabel}</p>
      {previewHint&&<div style={{fontSize:12,color:C.G,marginBottom:6}}>{previewHint}</div>}
      {renderedSubject!==undefined&&<div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",fontSize:13,fontWeight:900,marginBottom:8}}>{renderedSubject}</div>}
      {attestationPreview&&<style>{`
        .config-attestation-preview .head{border-bottom:5px solid #F5C800;padding-bottom:12px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
        .config-attestation-preview .logo{width:58px;height:58px;object-fit:contain}
        .config-attestation-preview h1{margin:0 0 18px;font-size:21px;line-height:1.2}
        .config-attestation-preview .club{font-weight:900;font-size:16px}
        .config-attestation-preview .box{border:2px solid #111;border-radius:10px;padding:16px;margin:18px 0;font-size:14px;line-height:1.65}
        .config-attestation-preview .meta{background:#f9fafb;border-radius:8px;padding:10px 12px;font-size:12px}
        .config-attestation-preview .sig{margin-top:34px;display:flex;justify-content:space-between;gap:22px;align-items:flex-start;font-size:13px}
        .config-attestation-preview .sig-right{text-align:left;min-width:190px}
        .config-attestation-preview .signature{display:block;margin-top:10px;max-width:230px;max-height:72px;object-fit:contain}
      `}</style>}
      <div className={attestationPreview?"config-attestation-preview":undefined} style={{background:"#fff",border:`1px solid ${C.Gb}`,borderRadius:10,padding:attestationPreview?"14px 16px":"10px 12px",fontSize:13,lineHeight:1.5,maxHeight:560,overflow:"auto"}} dangerouslySetInnerHTML={{__html:previewHtml||""}}/>
    </div>
  </div>;
}

function QrCodeConfigPanel({compact=false}) {
  const [copied,setCopied]=useState(false);
  const appUrl=getPublicAppUrl();
  const qrUrl=getQrCodeImageUrl(appUrl);
  const copyLink=async()=>{
    try{
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(()=>setCopied(false),1600);
    }catch{
      window.prompt("Copiez le lien public de l'application :",appUrl);
    }
  };
  const openPrint=()=>{
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>QR code préinscription RSG</title><style>
      body{margin:0;font-family:Arial,sans-serif;color:#111827;background:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center}
      .page{width:560px;max-width:92vw;text-align:center;padding:38px}
      img{width:320px;max-width:74vw;height:auto;border:1px solid #e5e7eb;border-radius:18px;padding:16px}
      h1{font-size:24px;margin:0 0 8px}
      p{font-size:15px;line-height:1.5;margin:8px 0;color:#4b5563}
      .url{word-break:break-all;font-weight:700;color:#111827;margin-top:14px}
      @media print{button{display:none}.page{padding:0}img{width:300px}}
    </style></head><body><div class="page">
      <h1>Préinscription RSG</h1>
      <p>Scannez ce QR code pour ouvrir l'application.</p>
      <img src="${qrUrl}" alt="QR code préinscription RSG">
      <p class="url">${appUrl}</p>
      <button onclick="window.print()" style="margin-top:18px;padding:12px 18px;border-radius:12px;border:1px solid #D6A900;background:#F5C800;font-weight:800;cursor:pointer">Imprimer</button>
    </div></body></html>`;
    const w=window.open("","_blank","width=720,height=820");
    if(!w){window.open(qrUrl,"_blank");return;}
    w.document.open();
    w.document.write(html);
    w.document.close();
  };
  return <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:16,padding:"14px",marginBottom:12,boxShadow:"0 10px 28px rgba(15,23,42,.05)"}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:14}}>
      <div>
        <p style={{display:"flex",alignItems:"center",gap:8,fontWeight:950,fontSize:16,color:C.N,margin:"0 0 5px"}}><Icon as={QrCode} size={18}/>QR code de l'application</p>
        <p style={{fontSize:12,color:C.G,margin:0,lineHeight:1.45}}>Ce QR code ouvre la page publique de préinscription. Il peut être imprimé ou partagé aux familles.</p>
      </div>
      <span style={{background:"#ecfdf5",color:C.V,border:"1px solid #86efac",borderRadius:999,padding:"6px 10px",fontSize:11,fontWeight:950}}>Lien public actif</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:compact?"1fr":"220px minmax(0,1fr)",gap:14,alignItems:"center"}}>
      <div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:16,padding:12,display:"flex",justifyContent:"center"}}>
        <img src={qrUrl} alt="QR code application préinscription RSG" style={{width:180,height:180,maxWidth:"100%",objectFit:"contain",background:C.W,borderRadius:12,padding:8,border:`1px solid ${C.Gb}`}}/>
      </div>
      <div style={{minWidth:0}}>
        <label style={{...lbl,fontSize:12}}>Lien scanné par le QR code</label>
        <div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"11px 12px",fontSize:13,fontWeight:850,color:C.N,wordBreak:"break-all",lineHeight:1.4,marginBottom:10}}>{appUrl}</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button type="button" style={{...BP,fontSize:13,padding:"10px 14px",minHeight:42}} onClick={copyLink}><Icon as={Copy} size={15}/>{copied?"Lien copié":"Copier le lien"}</button>
          <button type="button" style={{...BS,fontSize:13,padding:"10px 14px",minHeight:42}} onClick={openPrint}><Icon as={QrCode} size={15}/>Ouvrir / imprimer</button>
          <a data-rsg-button="true" href={appUrl} target="_blank" rel="noreferrer" style={{...BS,fontSize:13,padding:"10px 14px",minHeight:42,textDecoration:"none"}}><Icon as={ExternalLink} size={15}/>Tester le lien</a>
        </div>
        <p style={{fontSize:11,color:C.G,margin:"10px 0 0",lineHeight:1.45}}>Le QR est généré automatiquement à partir de l'adresse actuelle du site déployé.</p>
      </div>
    </div>
  </div>;
}

function AdminEmailingPanel({saison,data,licencies}) {
  const [source,setSource]=useState("preinscrits");
  const [cat,setCat]=useState("toutes");
  const [type,setType]=useState("tous");
  const [statut,setStatut]=useState("tous");
  const [subject,setSubject]=useState("Information RSG - Saison {saison}");
  const [html,setHtml]=useState(`<p>Bonjour {prenom},</p>

<p>Le Réveil Saint-Géréon vous transmet une information concernant la saison <strong>{saison}</strong>.</p>

<p>Sportivement,<br><strong>Le secrétariat du RSG</strong></p>`);
  const [sending,setSending]=useState(false);
  const [result,setResult]=useState(null);
  const [recipientSearch,setRecipientSearch]=useState("");
  const [selectedKeys,setSelectedKeys]=useState([]);
  const [attachments,setAttachments]=useState([]);
  const [attachmentDrag,setAttachmentDrag]=useState(false);
  const [attachmentBusy,setAttachmentBusy]=useState(false);
  const [attachmentError,setAttachmentError]=useState("");
  const attachmentInputRef=useRef(null);
  const typeLabel=v=>v==="renouvellement"?"Renouvellement":v==="nouvelle"?"Nouvelle licence":v||"Non renseigné";
  useEffect(()=>setSelectedKeys([]),[source,cat,type,statut]);
  const preinscritRows=data.flatMap(d=>{
    const membres=membresDossier(d);
    const email=getEmailContact(d);
    return membres.map(m=>{
      const categorie=adminCatValue(m)||catLabel(m.categorie)||m.categorie||"";
      const typeRaw=m.typeLicence||d.typeLicence||"";
      return {key:`pre-${d.id}-${m.idx}`,email,nom:m.nom||d.nom||"",prenom:m.prenom||d.prenom||"",categorie,cats:[categorie].filter(Boolean),type:typeLabel(typeRaw),types:[typeRaw].filter(Boolean),reference:d.id||"",source:"Préinscrit",statut:d.statut||"attente",label:`${m.prenom||d.prenom} ${m.nom||d.nom} - ${categorie}`};
    });
  });
  const baseRows=(licencies||[]).map(l=>{
    const categorie=catFromLic(l)||getLicValue(l,"c","categorie")||"";
    const typeRaw=getLicValue(l,"tl","typeLicence")||"";
    const email=getLicValue(l,"em","email")||getLicValue(l,"em2","emailRl")||getLicValue(l,"emailAutre")||"";
    const reference=getLicValue(l,"l","numLicence","numLicenceFFF")||`${getLicValue(l,"n","nom")}-${getLicValue(l,"p","prenom")}`;
    return {key:`base-${reference}-${email}`,email,nom:getLicValue(l,"n","nom")||"",prenom:getLicValue(l,"p","prenom")||"",categorie,cats:[categorie].filter(Boolean),type:typeRaw||"Base Footclubs",types:[typeRaw||"Base Footclubs"],reference,source:"Base Footclubs",statut:"base",label:`${getLicValue(l,"p","prenom")||""} ${getLicValue(l,"n","nom")||""} - ${categorie}`};
  });
  const rows=source==="preinscrits"?preinscritRows:baseRows;
  const categories=sortCats([...new Set(rows.flatMap(r=>r.cats).filter(Boolean))]);
  const types=[...new Set(rows.flatMap(r=>r.types).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"fr"));
  const q=recipientSearch.toLowerCase().trim();
  const baseFilteredRows=rows.filter(r=>r.email&&(cat==="toutes"||r.cats.includes(cat))&&(type==="tous"||r.types.includes(type))&&(source!=="preinscrits"||statut==="tous"||r.statut===statut||(statut==="valide"&&r.statut==="paye")));
  const filteredRows=baseFilteredRows.filter(r=>{
    const hay=[r.label,r.email,r.nom,r.prenom,r.categorie,r.type,r.reference].filter(Boolean).join(" ").toLowerCase();
    return !q||hay.includes(q);
  });
  const recipients=[...filteredRows.reduce((map,row)=>{
    const key=String(row.email||"").trim().toLowerCase();
    if(!key)return map;
    if(!map.has(key))map.set(key,{key,email:key,nom:row.nom,prenom:row.prenom,categorie:row.categorie,type:row.type,reference:row.reference,source:row.source,label:row.label});
    else{
      const current=map.get(key);
      current.categorie=[...new Set([current.categorie,row.categorie].flatMap(x=>String(x||"").split(" · ")).filter(Boolean))].join(" · ");
      current.reference=[...new Set([current.reference,row.reference].filter(Boolean))].join(" · ");
    }
    return map;
  },new Map()).values()];
  const selectedRows=baseFilteredRows.filter(r=>selectedKeys.includes(r.key));
  const effectiveRecipients=selectedKeys.length?selectedRows.map(r=>({...r,email:String(r.email||"").trim().toLowerCase()})):recipients;
  const preview=effectiveRecipients[0]||recipients[0]||{prenom:"Florian",nom:"FIGUREAU",categorie:"Senior",type:"Renouvellement",reference:"RSG-EXEMPLE",source:source==="preinscrits"?"Préinscrit":"Base Footclubs"};
  const toggleSelected=(key,on)=>setSelectedKeys(list=>on?[...new Set([...list,key])]:list.filter(k=>k!==key));
  const selectShown=()=>setSelectedKeys(list=>[...new Set([...list,...filteredRows.map(r=>r.key)])]);
  const totalAttachmentSize=attachments.reduce((sum,file)=>sum+(Number(file.Size)||0),0);
  const addAttachments=async fileList=>{
    const files=Array.from(fileList||[]);
    if(!files.length)return;
    setAttachmentBusy(true);
    setAttachmentError("");
    const next=[];
    const errors=[];
    const known=new Set(attachments.map(file=>`${file.Filename}-${file.Size}`));
    let total=totalAttachmentSize;
    for(const file of files){
      const key=`${file.name}-${file.size}`;
      if(attachments.length+next.length>=MAIL_ATTACHMENT_MAX_FILES){errors.push(`Maximum ${MAIL_ATTACHMENT_MAX_FILES} pièces jointes.`);break;}
      if(known.has(key))continue;
      if(file.size>MAIL_ATTACHMENT_MAX_FILE_BYTES){errors.push(`${file.name} dépasse ${fileSizeLabel(MAIL_ATTACHMENT_MAX_FILE_BYTES)}.`);continue;}
      if(total+file.size>MAIL_ATTACHMENT_MAX_TOTAL_BYTES){errors.push(`Total limité à ${fileSizeLabel(MAIL_ATTACHMENT_MAX_TOTAL_BYTES)}.`);continue;}
      try{
        const converted=await readMailAttachment(file);
        if(!converted.Base64Content){errors.push(`${file.name} n'a pas pu être lu.`);continue;}
        next.push(converted);
        known.add(key);
        total+=file.size;
      }catch(err){errors.push(`${file.name} : ${err?.message||"lecture impossible"}.`);}
    }
    if(next.length)setAttachments(list=>[...list,...next]);
    if(errors.length)setAttachmentError([...new Set(errors)].join(" "));
    setAttachmentBusy(false);
  };
  const removeAttachment=(name,size)=>setAttachments(list=>list.filter(file=>file.Filename!==name||file.Size!==size));
  const onDropAttachments=e=>{
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDrag(false);
    addAttachments(e.dataTransfer?.files);
  };
  const send=async()=>{
    setResult(null);
    if(!isFirebaseAvailable()){alert("Firebase doit être actif pour envoyer des emails.");return;}
    if(!subject.trim()||!html.replace(/<[^>]+>/g,"").trim()){alert("Objet et message obligatoires.");return;}
    if(!effectiveRecipients.length){alert("Aucun destinataire avec email valide pour ces filtres.");return;}
    if(attachmentBusy){alert("Patientez pendant l'ajout des pièces jointes.");return;}
    const cible=selectedKeys.length?`${effectiveRecipients.length} membre(s) sélectionné(s)`:`${effectiveRecipients.length} destinataire(s) filtré(s)`;
    const pj=attachments.length?` avec ${attachments.length} pièce(s) jointe(s)`:"";
    if(!window.confirm(`Envoyer ce mail à ${cible}${pj} ?`))return;
    setSending(true);
    try{
      const res=await fbSendBulkEmail({saison,subject,html,attachments,recipients:effectiveRecipients,meta:{source,filters:{categorie:cat,type,statut,recherche:recipientSearch},allowDuplicateEmails:!!selectedKeys.length}});
      setResult(res);
    }catch(err){
      setResult({ok:false,error:err?.message||String(err),sentCount:0,failedCount:effectiveRecipients.length});
    }finally{setSending(false);}
  };
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:12,alignItems:"center",background:"#ecfdf5",border:"1px solid #86efac",borderRadius:16,padding:"13px 15px",marginBottom:12,boxShadow:"0 10px 24px rgba(22,163,74,.08)"}}>
      <div style={{width:42,height:42,borderRadius:14,background:C.W,color:C.V,display:"grid",placeItems:"center",boxShadow:"0 8px 18px rgba(22,163,74,.12)"}}><Icon as={Mail} size={21}/></div>
      <div>
        <p style={{fontWeight:950,fontSize:16,color:C.N,margin:"0 0 4px"}}>Envoi d'emails groupés</p>
        <p style={{fontSize:12,color:C.V,margin:0,lineHeight:1.45}}>Envoi individuel depuis l'adresse Gmail configurée : aucun destinataire ne voit les autres adresses.</p>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",marginBottom:12}}>
      <F label="Source"><select style={inp()} value={source} onChange={e=>{setSource(e.target.value);setCat("toutes");setType("tous");setStatut("tous");}}><option value="preinscrits">Préinscrits</option><option value="footclubs">Base Footclubs</option></select></F>
      <F label="Rechercher un membre"><input style={inp()} value={recipientSearch} onChange={e=>setRecipientSearch(e.target.value)} placeholder="Nom, email, référence..."/></F>
      <F label="Catégorie"><select style={inp()} value={cat} onChange={e=>setCat(e.target.value)}><option value="toutes">Toutes catégories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></F>
      <F label="Type"><select style={inp()} value={type} onChange={e=>setType(e.target.value)}><option value="tous">Tous types</option>{types.map(t=><option key={t} value={t}>{typeLabel(t)}</option>)}</select></F>
      {source==="preinscrits"&&<F label="Statut dossier"><select style={inp()} value={statut} onChange={e=>setStatut(e.target.value)}><option value="tous">Tous statuts</option>{STATUT_ORDER.map(k=><option key={k} value={k}>{STATUTS[k].l}</option>)}</select></F>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.N}}>{effectiveRecipients.length}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>{selectedKeys.length?"Membre(s) sélectionné(s)":"Destinataire(s) filtré(s)"}</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.N}}>{filteredRows.length}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Membre(s) affiché(s)</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.Jd}}>{selectedKeys.length}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Coché(s)</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.R}}>{rows.filter(r=>!r.email).length}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Sans email</div></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,alignItems:"start"}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}>
        <F label="Objet du message" span><input style={inp()} value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Objet du mail"/></F>
        <F label="Corps du message" span><RichTextEditor value={html} onChange={setHtml}/></F>
        <div style={{fontSize:11,color:C.G,margin:"-4px 0 12px",lineHeight:1.5}}>Variables : {"{prenom}"} {"{nom}"} {"{categorie}"} {"{type}"} {"{reference}"} {"{saison}"} {"{source}"}.</div>
        <F label="Pièces jointes" span>
          <div
            onDragEnter={e=>{e.preventDefault();setAttachmentDrag(true);}}
            onDragOver={e=>{e.preventDefault();setAttachmentDrag(true);}}
            onDragLeave={e=>{e.preventDefault();if(e.currentTarget===e.target)setAttachmentDrag(false);}}
            onDrop={onDropAttachments}
            style={{border:`1.5px dashed ${attachmentDrag?C.J:C.Gb}`,background:attachmentDrag?C.Jp:"#f8fafc",borderRadius:12,padding:"12px",display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",transition:"background .15s,border-color .15s"}}
          >
            <input ref={attachmentInputRef} type="file" multiple style={{display:"none"}} onChange={e=>{addAttachments(e.target.files);e.target.value="";}}/>
            <div style={{minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:950,color:C.N}}><Icon as={UploadCloud} size={16}/>Glisser-déposer des fichiers ici</div>
              <div style={{fontSize:11,color:C.G,lineHeight:1.45}}>ou ajoutez un PDF, une image, un document... {MAIL_ATTACHMENT_MAX_FILES} fichiers max, {fileSizeLabel(MAIL_ATTACHMENT_MAX_TOTAL_BYTES)} au total.</div>
            </div>
            <button type="button" style={{...BS,fontSize:12,padding:"8px 10px",minHeight:34,boxShadow:"none"}} onClick={()=>attachmentInputRef.current?.click()} disabled={attachmentBusy}><Icon as={Paperclip} size={14}/>{attachmentBusy?"Ajout...":"Ajouter une PJ"}</button>
          </div>
          {attachmentError&&<div style={{fontSize:11,color:C.R,fontWeight:800,marginTop:6,lineHeight:1.45}}>{attachmentError}</div>}
          {attachments.length>0&&<div style={{display:"grid",gap:6,marginTop:8}}>
            {attachments.map(file=><div key={`${file.Filename}-${file.Size}`} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",background:C.W,border:`1px solid ${C.Gb}`,borderRadius:9,padding:"8px 9px",fontSize:12}}>
              <span style={{fontWeight:850,color:C.N,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{file.Filename}</span>
              <span style={{fontSize:11,color:C.G,fontWeight:800}}>{fileSizeLabel(file.Size)}</span>
              <button type="button" title="Retirer la pièce jointe" style={{...btnFlex,border:"none",background:"#fee2e2",color:C.R,borderRadius:6,fontSize:11,fontWeight:950,padding:"5px 8px",cursor:"pointer"}} onClick={()=>removeAttachment(file.Filename,file.Size)}><Icon as={Trash2} size={12}/>Retirer</button>
            </div>)}
            <div style={{fontSize:11,color:C.G,fontWeight:800}}>Total pièces jointes : {fileSizeLabel(totalAttachmentSize)}</div>
          </div>}
        </F>
        <button style={{...BP,width:"100%",opacity:(sending||attachmentBusy)?0.7:1}} onClick={send} disabled={sending||attachmentBusy||!effectiveRecipients.length}><Icon as={Send}/>{sending?"Envoi en cours...":selectedKeys.length?`Envoyer aux ${effectiveRecipients.length} sélectionné(s)`:`Envoyer aux ${effectiveRecipients.length} destinataire(s) filtré(s)`}</button>
        {result&&<div style={{marginTop:10,background:result.ok!==false?"#dcfce7":"#fee2e2",color:result.ok!==false?C.V:C.R,borderRadius:10,padding:"10px 12px",fontSize:13,fontWeight:850}}>
          {result.error?`Erreur : ${result.error}`:`Envoyés : ${result.sentCount||0} · Échecs : ${result.failedCount||0}${result.attachmentCount?` · PJ : ${result.attachmentCount}`:""}`}
          {Array.isArray(result.failed)&&result.failed.length>0&&<div style={{fontSize:11,marginTop:6,lineHeight:1.5}}>Échecs : {result.failed.slice(0,8).map(f=>`${f.email} (${f.error})`).join(" · ")}</div>}
        </div>}
      </div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",position:"sticky",top:12}}>
        <p style={{display:"flex",alignItems:"center",gap:7,fontWeight:950,fontSize:14,color:C.N,margin:"0 0 8px"}}><Icon as={Eye} size={16}/>Aperçu</p>
        <div style={{fontSize:12,color:C.G,marginBottom:6}}>Exemple : {preview.email||"destinataire exemple"}</div>
        <div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",fontSize:13,fontWeight:900,marginBottom:8}}>{renderAdminEmailTpl(subject,preview,saison)}</div>
        <div style={{background:"#fff",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",fontSize:13,lineHeight:1.5}} dangerouslySetInnerHTML={{__html:renderAdminEmailTpl(html,preview,saison)}}/>
        {attachments.length>0&&<div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"9px 10px",fontSize:12,lineHeight:1.45,marginTop:8}}>
          <strong>{attachments.length} pièce(s) jointe(s)</strong><br/>
          <span style={{color:C.G}}>{attachments.map(file=>file.Filename).join(" · ")}</span>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",margin:"12px 0 8px",flexWrap:"wrap"}}>
          <p style={{fontWeight:950,fontSize:13,color:C.N,margin:0}}>Membres / destinataires</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button type="button" style={{...BS,fontSize:11,padding:"6px 8px",minHeight:30,boxShadow:"none"}} onClick={selectShown} disabled={!filteredRows.length}><Icon as={CheckSquare} size={13}/>Tout cocher</button>
            <button type="button" style={{...BS,fontSize:11,padding:"6px 8px",minHeight:30,boxShadow:"none"}} onClick={()=>setSelectedKeys([])} disabled={!selectedKeys.length}>Vider</button>
          </div>
        </div>
        <div style={{maxHeight:310,overflow:"auto",display:"grid",gap:6}}>
          {filteredRows.slice(0,160).map(r=>{
            const checked=selectedKeys.includes(r.key);
            return <label key={r.key} style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:8,alignItems:"start",background:checked?C.Jp:C.Gc,border:`1px solid ${checked?C.Jd:C.Gb}`,borderRadius:9,padding:"8px 9px",fontSize:12,cursor:"pointer"}}>
              <input type="checkbox" checked={checked} onChange={e=>toggleSelected(r.key,e.target.checked)} style={{marginTop:3,accentColor:C.J}}/>
              <span style={{minWidth:0}}>
                <strong>{r.prenom} {r.nom}</strong><br/>
                <span style={{color:C.G,wordBreak:"break-word"}}>{r.email} · {r.categorie}</span>
              </span>
            </label>;
          })}
          {filteredRows.length>160&&<div style={{fontSize:12,color:C.G}}>+ {filteredRows.length-160} autre(s). Affinez la recherche pour les afficher.</div>}
          {!filteredRows.length&&<div style={{fontSize:12,color:C.G,background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:9,padding:"10px"}}>Aucun membre ne correspond aux filtres.</div>}
        </div>
      </div>
    </div>
  </div>;
}

function Dashboard({saison,onSaisonChange,publicSaison,onPublicSaisonChange,licencies,onLicenciesChange,tarifs,onTarifsChange}){
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sel,setSel]=useState(null);
  const [memberSel,setMemberSel]=useState(null);
  const [search,setSearch]=useState("");
  const [fSt,setFSt]=useState("tous");
  const [fCat,setFCat]=useState("toutes");
  const [fType,setFType]=useState("tous");
  const [note,setNote]=useState("");
  const [tab,setTab]=useState("dashboard");
  const [exporting,setExporting]=useState(false);
  const [editTarifs,setEditTarifs]=useState(false);
  const [configTab,setConfigTab]=useState("tarifs");
  const [tmpTarifs,setTmpTarifs]=useState(tarifs);
  const [editPerms,setEditPerms]=useState(false);
  const [tmpPerms,setTmpPerms]=useState(getPermanences(tarifs));
  const [editPlanning,setEditPlanning]=useState(false);
  const [tmpPlanning,setTmpPlanning]=useState(getPlanningEntrainements(tarifs));
  const [editPlanningResponsables,setEditPlanningResponsables]=useState(false);
  const [tmpPlanningResponsables,setTmpPlanningResponsables]=useState(getPlanningResponsables(tarifs));
  const [tmpPlanningResponsablesHiddenKeys,setTmpPlanningResponsablesHiddenKeys]=useState(getPlanningResponsablesHiddenKeys(tarifs));
  const [planningCalCat,setPlanningCalCat]=useState("toutes");
  const [planningCalType,setPlanningCalType]=useState("tous");
  const [planningCalLieu,setPlanningCalLieu]=useState("tous");
  const [editPieces,setEditPieces]=useState(false);
  const [tmpPieces,setTmpPieces]=useState(getPieces(tarifs));
  const [editBoutique,setEditBoutique]=useState(false);
  const [tmpBoutique,setTmpBoutique]=useState(getBoutique(tarifs));
  const [boutiqueSearch,setBoutiqueSearch]=useState("");
  const [boutiqueStatut,setBoutiqueStatut]=useState("tous");
  const [boutiqueCategorie,setBoutiqueCategorie]=useState("tous");
  const [boutiqueArticle,setBoutiqueArticle]=useState("tous");
  const [boutiquePage,setBoutiquePage]=useState("produits");
  const [boutiqueVisualCat,setBoutiqueVisualCat]=useState("toutes");
  const [certifPage,setCertifPage]=useState("footclubs");
  const [equipCat,setEquipCat]=useState("toutes");
  const [footclubsSearch,setFootclubsSearch]=useState("");
  const [footclubsStatus,setFootclubsStatus]=useState("tous");
  const [footclubsCat,setFootclubsCat]=useState("toutes");
  const [footclubsType,setFootclubsType]=useState("tous");
  const [paiementCat,setPaiementCat]=useState("toutes");
  const [paiementType,setPaiementType]=useState("tous");
  const [paiementMode,setPaiementMode]=useState("tous");
  const [paiementMonth,setPaiementMonth]=useState("tous");
  const [exportFieldsOpen,setExportFieldsOpen]=useState(false);
  const [exportTarget,setExportTarget]=useState(()=>getExportConfig().target||"xlsx");
  const [exportFields,setExportFields]=useState(()=>Array.isArray(getExportConfig().fields)?getExportConfig().fields:[]);
  const [isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<820);
  const [createMemberOpen,setCreateMemberOpen]=useState(false);
  const [planningDraft,setPlanningDraft]=useState(null);

  const [fbStatus,setFbStatus]=useState("connecting"); // "connecting" | "online" | "offline"

  const exportFieldChoices=[...new Set([
    ...H_INS,
    ...H_MEMBER,
    ...H_BOUTIQUE,
    ...H_LIC,
    "Vue","Statut","Catégorie","Email","Téléphone","Famille","Membres dossier","Total dossier €","Reste à payer","Échéance 1","Échéance 2","Échéance 3","Échéance 4","Date paiement","Date achat","Date commande","Date réception","Date livraison","Qté","Prix unit.","Note","Notes"
  ])].sort((a,b)=>String(a).localeCompare(String(b),"fr"));
  const essentialExportFields=["Référence","Référence dossier","Saison","Nom","Prénom","Naissance","Sexe","Catégorie licence","Catégorie admin","Structure","Type licence","Statut dossier","N° Licence FFF","N° licence FFF","N° personne","Email contact","Téléphone contact","Resp. principal","Lien","Tél resp.","Email resp.","Certif requis","Certif fourni","Total à encaisser €","Total dossier €","Mode paiement","Notes secrétariat","Notes dossier"];
  const toggleExportField=(field,on)=>{
    const base=exportFields.length?exportFields:exportFieldChoices;
    setExportFields(on?[...new Set([...base,field])]:base.filter(f=>f!==field));
  };

  useEffect(()=>{
    saveExportConfig({target:exportTarget,fields:exportFields});
  },[exportTarget,exportFields]);

  useEffect(()=>{
    const onResize=()=>setIsMobile(typeof window!=="undefined"&&window.innerWidth<820);
    onResize();
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);

  const refresh=useCallback(async()=>{
    setLoading(true);
    if(isFirebaseAvailable()){
      try{
        const fbData=await fbGetAllInscriptions(saison);
        const sorted=normalizeInscriptionsForDisplay(fbData,tarifs);
        setData(sorted);
        await stSet(keyIns(saison),sorted);
        setLoading(false);
        return;
      }catch(err){
        console.error("Rechargement Firebase impossible",err);
      }
    }
    const d=await stGet(keyIns(saison));
    setData(normalizeInscriptionsForDisplay(d,tarifs));
    setLoading(false);
  },[saison,tarifs]);

  useEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{
    const forceRefresh=ev=>{
      if(ev?.detail?.saison&&ev.detail.saison!==saison)return;
      refresh();
    };
    window.addEventListener("rsg-force-firebase-refresh",forceRefresh);
    return()=>window.removeEventListener("rsg-force-firebase-refresh",forceRefresh);
  },[saison,refresh]);
  useEffect(()=>{
    if(isFirebaseAvailable())return;
    const key=keyIns(saison);
    const sync=async(ev)=>{
      if(ev?.key&&ev.key!==key)return;
      if(ev?.detail?.key&&ev.detail.key!==key)return;
      const d=await stGet(key);
      if(Array.isArray(d))setData(normalizeInscriptionsForDisplay(d,tarifs));
    };
    window.addEventListener("storage",sync);
    window.addEventListener("rsg-storage",sync);
    return()=>{window.removeEventListener("storage",sync);window.removeEventListener("rsg-storage",sync);};
  },[saison,tarifs]);

  // Écoute en temps réel sur Firestore (les nouvelles préinscriptions apparaissent automatiquement)
  useEffect(()=>{
    if(!isFirebaseAvailable()){setFbStatus("offline");return;}
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      const sorted=normalizeInscriptionsForDisplay(fbData,tarifs);
      setData(sorted);
      // Firebase est la source de vérité en admin : le stockage local n'est qu'un cache.
      stSet(keyIns(saison),sorted);
    },(err)=>{
      console.error("Firebase offline:",err);
      setFbStatus("offline");
    });
    return ()=>unsub&&unsub();
  },[saison,tarifs]);

  useEffect(()=>{
    if(!sel?.id)return;
    const fresh=data.find(e=>e.id===sel.id);
    if(fresh&&fresh!==sel){
      setSel(fresh);
      setNote(fresh.notes||"");
    }
  },[data,sel?.id]);

  const filtered=data.filter(d=>{
    const q=search.toLowerCase();
    const statutOk=fSt==="tous"||d.statut===fSt||(fSt==="valide"&&d.statut==="paye");
    const membres=membresDossier(d);
    const qOk=!q||`${d.nom} ${d.prenom} ${d.id} ${getEmailContact(d)} ${d.email||""} ${membres.map(m=>`${m.nom} ${m.prenom}`).join(" ")}`.toLowerCase().includes(q);
    const catOk=fCat==="toutes"||membres.some(m=>adminCatValue(m)===fCat||m.categorie===fCat);
    const typeOk=fType==="tous"||membres.some(m=>m.typeLicence===fType);
    return qOk&&statutOk&&catOk&&typeOk;
  });

  const stats={
    total:data.length,
    membres:tousMembresDossiers(data).length,
    attente:data.filter(d=>d.statut==="attente").length,
    valide:data.filter(d=>d.statut==="valide"||d.statut==="paye").length,
    certif:data.filter(d=>d.certifNeeded).length,
    ca:data.filter(d=>d.prixFinal).reduce((s,d)=>s+calcTotalDossier(d),0),
  };

  useEffect(()=>{
    setTmpTarifs(tarifs);
    setTmpPerms(getPermanences(tarifs));
    setTmpPlanning(getPlanningEntrainements(tarifs));
    setTmpPlanningResponsables(getPlanningResponsables(tarifs));
    setTmpPlanningResponsablesHiddenKeys(getPlanningResponsablesHiddenKeys(tarifs));
    setEditPlanning(false);
    setEditPlanningResponsables(false);
    setTmpPieces(getPieces(tarifs));
    setTmpBoutique(getBoutique(tarifs));
  },[tarifs]);

  const upd=async(id,patch)=>{
    let u=null;
    const current=isFirebaseAvailable()?data:(data.length?data:(await stGet(keyIns(saison))||[]));
    const d=(Array.isArray(current)?current:[]).map(e=>{
      if(e.id!==id)return e;
      const next={...e,...patch};
      if(patch.statut==="valide"||patch.statut==="paye"){
        const achats=markBoutiqueAchatsRegles(next.achatsBoutique);
        u=achats!==next.achatsBoutique?{...next,achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)}:next;
        return u;
      }
      u=next;
      return next;
    });
    if(!u)return;
    if(isFirebaseAvailable()){
      const synced=await saveFirebaseOrWarn(saison,u,"modification du dossier");
      if(!synced)return;
    }
    await stSet(keyIns(saison),d);
    setData(d);
    if(sel?.id===id){setSel(u);if(patch.notes!==undefined)setNote(u.notes||"");}
  };
  const createStandaloneMember=async(entry)=>{
    const entryToSave=await compressEntryPhotos(recalcDossierPrix(entry,tarifs));
    if(isFirebaseAvailable()){
      const synced=await saveFirebaseOrWarn(saison,entryToSave,"création du membre");
      if(!synced)return;
    }
    const current=isFirebaseAvailable()?data:(data.length?data:(await stGet(keyIns(saison))||[]));
    const base=Array.isArray(current)?current.filter(e=>e.id!==entryToSave.id):[];
    const next=sortInscriptions([entryToSave,...base]);
    await stSet(keyIns(saison),next);
    setData(next);
    setCreateMemberOpen(false);
    setSel(entryToSave);
    setNote(entryToSave.notes||"");
  };
  const del=async(id)=>{
    if(!window.confirm("Supprimer définitivement ?"))return;
    if(isFirebaseAvailable()){
      try{
        await fbDeleteInscription(saison,id);
      }catch(e){
        console.error(e);
        alert(`Suppression impossible sur Firebase : ${e?.message||e}. Le dossier n'a pas été supprimé pour éviter un écart entre les ordinateurs.`);
        return;
      }
    }
    const current=isFirebaseAvailable()?data:(await stGet(keyIns(saison))||[]);
    const d=(Array.isArray(current)?current:[]).filter(e=>e.id!==id);
    await stSet(keyIns(saison),d);
    setData(d);
    if(sel?.id===id)setSel(null);
  };
  const attachIndividualMembers=async(targetId,sourceIds=[])=>{
    const ids=[...new Set(sourceIds)].filter(id=>id&&id!==targetId);
    if(!ids.length)return;
    const current=isFirebaseAvailable()?data:(data.length?data:(await stGet(keyIns(saison))||[]));
    const arr=Array.isArray(current)?current:[];
    const target=arr.find(e=>e.id===targetId);
    const sources=arr.filter(e=>ids.includes(e.id)&&dossierAttachableIndividuel(e));
    if(!target||!sources.length)return;
    const merged=await compressEntryPhotos(mergeIndividualDossiersIntoFamily(target,sources,tarifs));
    const next=sortInscriptions(arr.filter(e=>!ids.includes(e.id)).map(e=>e.id===targetId?merged:e));
    if(isFirebaseAvailable()){
      const synced=await saveFirebaseOrWarn(saison,merged,"rattachement famille");
      if(!synced)return;
      try{
        for(const source of sources)await fbDeleteInscription(saison,source.id);
      }catch(err){
        console.error("Suppression dossier source impossible",err);
        alert(`Rattachement partiel : le dossier famille a ete sauvegarde, mais un ancien dossier n'a pas pu etre supprime (${err?.message||err}). Rechargez la liste avant de continuer.`);
        await refreshFirebaseInscriptions(saison,setData,tarifs).catch(()=>{});
        return;
      }
    }
    await stSet(keyIns(saison),next);
    setData(next);
    if(sel?.id===targetId){
      setSel(merged);
      setNote(merged.notes||"");
    }
  };

  const sendAttestationEmail=async(entry,force=true)=>{
    if(!dossierHasAttestation(entry)){alert("Attestation non nécessaire : la licence dirigeant est gratuite.");return;}
    if(!isFirebaseAvailable()){alert("Firebase doit être actif pour envoyer automatiquement un email.");return;}
    try{
      const result=await fbSendAttestationEmail({saison:entry.saison||saison,id:entry.id,force});
      alert(result?.skipped?"Attestation non nécessaire : licence dirigeant gratuite.":result?.alreadySent?"Attestation déjà envoyée.":"Email d'attestation envoyé.");
    }catch(err){
      const msg=err?.message||String(err);
      alert("Envoi impossible : "+msg);
    }
  };

  const savePlanningRows=async rows=>{
    const normalized=rows.map(normalizeCreneauEntrainement).filter(c=>c.categorie);
    await onTarifsChange({...tarifs,_planningEntrainements:normalized});
  };
  const planningContextFromFilters=()=>{
    const match=planningCalCat==="toutes"?null:planningCalRows.find(c=>adminCatValue({categorie:c.categorie,sexe:c.sexe})===planningCalCat);
    return {
      categorie:match?.categorie||"",
      sexe:planningCalType!=="tous"?planningCalType:(match?.sexe||"Tous"),
      lieu:planningCalLieu!=="tous"?planningCalLieu:"",
    };
  };
  const openPlanningCreate=slot=>{
    const ctx=planningContextFromFilters();
    setPlanningDraft(normalizeCreneauEntrainement({
      ...ctx,
      jour:slot.jour,
      debut:slot.debut,
      fin:slot.fin||addTrainingMinutes(slot.debut,90),
    }));
  };
  const savePlanningDraft=async draft=>{
    const c=normalizeCreneauEntrainement(draft);
    if(!c.categorie){alert("Choisissez une catégorie pour ce créneau.");return;}
    if(!c.debut||!c.fin){alert("Renseignez l'heure de début et l'heure de fin.");return;}
    const rows=getPlanningEntrainements(tarifs);
    const exists=rows.some(x=>x.id===c.id);
    await savePlanningRows(exists?rows.map(x=>x.id===c.id?c:x):[...rows,c]);
    setPlanningDraft(null);
  };
  const deletePlanningDraft=async draft=>{
    if(!draft?.id)return setPlanningDraft(null);
    if(!window.confirm("Supprimer ce créneau d'entraînement ?"))return;
    await savePlanningRows(getPlanningEntrainements(tarifs).filter(c=>c.id!==draft.id));
    setPlanningDraft(null);
  };
  const movePlanningCreneau=async(id,{jour,debut})=>{
    const rows=getPlanningEntrainements(tarifs);
    const current=rows.find(c=>c.id===id);
    if(!current)return;
    const oldStart=parseTrainingTime(current.debut);
    const oldEnd=parseTrainingTime(current.fin);
    const duration=oldStart!==null&&oldEnd!==null&&oldEnd>oldStart?oldEnd-oldStart:90;
    const rawStart=parseTrainingTime(debut);
    if(rawStart===null)return;
    const start=Math.max(0,Math.min(23*60+59-duration,rawStart));
    const moved={...current,jour,debut:fmtTrainingTime(start),fin:fmtTrainingTime(clampTrainingMinutes(start+duration))};
    await savePlanningRows(rows.map(c=>c.id===id?moved:c));
  };

  const planningCalRows=getPlanningEntrainements(tarifs).sort(planningSort);
  const planningCalCats=sortCats([...new Set(planningCalRows.map(c=>adminCatValue({categorie:c.categorie,sexe:c.sexe})))]).filter(Boolean);
  const planningCalLieux=[...new Set([...LIEUX_ENTRAINEMENT,...planningCalRows.map(c=>c.lieu).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  const planningResponsablesHiddenKeys=getPlanningResponsablesHiddenKeys(tarifs);
  const planningResponsableOptions=getPlanningResponsableOptions(getPlanningResponsables(tarifs),planningResponsablesHiddenKeys);
  const tmpPlanningResponsableOptions=getPlanningResponsableOptions(tmpPlanningResponsables,tmpPlanningResponsablesHiddenKeys);
  const getTmpPlanningResp=(categorie,sexe)=>tmpPlanningResponsables.find(r=>planningRespKey(r.categorie,r.sexe)===planningRespKey(categorie,sexe))||normalizePlanningResponsable({categorie,sexe});
  const setTmpPlanningResp=(categorie,sexe,patch)=>setTmpPlanningResponsables(list=>{
    const key=planningRespKey(categorie,sexe);
    const current=list.find(r=>planningRespKey(r.categorie,r.sexe)===key)||normalizePlanningResponsable({categorie,sexe});
    return [...list.filter(r=>planningRespKey(r.categorie,r.sexe)!==key),{...current,...patch,key,categorie:canonicalCat(categorie),sexe}];
  });
  const removePlanningRespOption=async opt=>{
    const key=planningRespKey(opt.categorie,opt.sexe);
    if(typeof window!=="undefined"&&!window.confirm(`Supprimer "${opt.label}" de la configuration des responsables catégories ?`))return;
    const hidden=[...new Set([...planningResponsablesHiddenKeys,key])];
    const responsables=getPlanningResponsables(tarifs).filter(r=>planningRespKey(r.categorie,r.sexe)!==key);
    await onTarifsChange({...tarifs,_planningResponsables:responsables,_planningResponsablesHiddenKeys:hidden});
  };
  const removeTmpPlanningRespOption=opt=>{
    const key=planningRespKey(opt.categorie,opt.sexe);
    if(typeof window!=="undefined"&&!window.confirm(`Supprimer "${opt.label}" de cet écran ?`))return;
    setTmpPlanningResponsablesHiddenKeys(list=>[...new Set([...list,key])]);
    setTmpPlanningResponsables(list=>list.filter(r=>planningRespKey(r.categorie,r.sexe)!==key));
  };
  const restoreTmpPlanningRespKey=key=>setTmpPlanningResponsablesHiddenKeys(list=>list.filter(k=>normalizePlanningRespKeyValue(k)!==normalizePlanningRespKeyValue(key)));
  const importPdfIntoTmpTarifs=(file,field)=>{
    if(!file)return;
    if(file.type!=="application/pdf"&&!String(file.name||"").toLowerCase().endsWith(".pdf")){
      alert("Merci de sélectionner un fichier PDF.");
      return;
    }
    const maxBytes=650*1024;
    if(file.size>maxBytes){
      alert("Ce PDF est trop lourd pour être stocké directement dans la configuration. Hébergez-le puis collez son URL dans le champ prévu.");
      return;
    }
    const reader=new FileReader();
    reader.onload=()=>setTmpTarifs(p=>({...p,[field]:reader.result,[field.replace("DataUrl","Url")]:""}));
    reader.onerror=()=>alert("Lecture du PDF impossible.");
    reader.readAsDataURL(file);
  };
  const planningCalShown=planningCalRows.filter(c=>{
    const adminCat=adminCatValue({categorie:c.categorie,sexe:c.sexe});
    return (planningCalCat==="toutes"||adminCat===planningCalCat||canonicalCat(c.categorie)===planningCalCat)
      &&(planningCalType==="tous"||(c.sexe||"Tous")===planningCalType)
      &&(planningCalLieu==="tous"||c.lieu===planningCalLieu);
  });
  const planningByDay=JOURS_ENTRAINEMENT.map(jour=>({jour,rows:planningCalShown.filter(c=>c.jour===jour)})).filter(g=>g.rows.length);

  const doExport=async(type)=>{
    setExporting(true);const fn=`RSG_${saison}_`;
    try{
      if(type==="all")await exportXLSX([{name:"Toutes",rows:[H_INS,...filtered.map(e=>toRow(e,tarifs))]}],fn+"Preinscriptions.xlsx");
      else if(type==="parEquipe"){const membres=tousMembresDossiers(data);const cats=sortCats([...new Set(membres.map(adminCatValue))]);await exportXLSX(cats.map(cat=>({name:cat,rows:[H_MEMBER,...membres.filter(m=>adminCatValue(m)===cat).sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=>memberRow(m,tarifs))]})),fn+"ParEquipe.xlsx");}
      else if(type==="parType"){
        const membres=tousMembresDossiers(data);
        const memberHeader=["Vue",...H_MEMBER];
        const dossierHeader=["Vue",...H_INS];
        const defs=[
          {label:"École de foot RSG",members:true,filter:m=>structureType(m)==="École de foot RSG"},
          {label:"Groupement Jeunes ASM RSG",members:true,filter:m=>structureType(m)==="Groupement Jeunes ASM/RSG"},
          {label:"Renouvellements",members:true,filter:m=>m.typeLicence==="renouvellement"&&!m.dirigeantArbitre&&m.categorie!=="Dirigeant"},
          {label:"Nouvelles licences",members:true,filter:m=>m.typeLicence==="nouvelle"&&!m.dirigeantArbitre&&m.categorie!=="Dirigeant"},
          {label:"Dossiers multi-membres",members:false,filter:d=>countMembres(d)>1},
          {label:"Dirigeants",members:true,filter:m=>m.categorie==="Dirigeant"},
          {label:"Arbitres",members:true,filter:m=>m.dirigeantArbitre||m.dossier?.dirigeantArbitre},
          {label:"Jeunes",members:true,filter:m=>["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(canonicalCat(m.categorie))},
          {label:"Ados",members:true,filter:m=>["U12-U13","U14-U15","U16-U17-U18"].includes(canonicalCat(m.categorie))},
          {label:"Adultes",members:true,filter:m=>canonicalCat(m.categorie)==="Senior"},
          {label:"Féminines",members:true,filter:m=>m.sexe==="Féminin"},
          {label:"Masculins",members:true,filter:m=>m.sexe==="Masculin"},
          {label:"Certif médical requis",members:true,filter:m=>m.certifNeeded},
          {label:"Paiement fractionné",members:false,filter:d=>(d.nbFois||1)>1},
        ];
        const sheets=defs.map(def=>{
          const rows=def.members?membres.filter(def.filter).sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=>[def.label,...memberRow(m,tarifs)]):data.filter(def.filter).sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=>[def.label,...toRow(d,tarifs)]);
          return{name:def.label,rows:[def.members?memberHeader:dossierHeader,...rows]};
        });
        await exportXLSX(sheets,fn+"ParType.xlsx");
      }
      else if(type==="paiements"){
        const H=["Référence","Saison","Statut","Nom","Prénom","Catégorie","Catégorie admin","Email","Téléphone","Famille","Membres famille","Licence €","Boutique permanence €","Boutique saison séparée €","Total à encaisser €","Mode paiement","Nb fois","Échéance 1","Échéance 2","Échéance 3","Échéance 4","Date paiement","Notes"];
        await exportXLSX([{name:"Paiements",rows:[H,...data.map(e=>{
          const nbMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
          const boutiquePerm=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
          const boutiqueSaison=calcBoutiqueSaisonTotal(e.achatsBoutique);
          return[e.id,e.saison||saison,STATUTS[e.statut]?.l||"",e.nom,e.prenom,canonicalCat(e.categorie),adminCatValue(e),getEmailContact(e),getTelContact(e),e.nomFamille||"",nbMembres,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,e.datesEcheances?.[0]||"",e.datesEcheances?.[1]||"",e.datesEcheances?.[2]||"",e.datesEcheances?.[3]||"",fmtD(e.datePaiement||e.dateValidation),e.notes||""];
        })]}],fn+"Paiements.xlsx");
      }
      else if(type==="equip"){const rows=tousMembresDossiers(data).filter(m=>m.statut!=="refuse"&&(equipCat==="toutes"||adminCatValue(m)===equipCat)).sort((a,b)=>catRank(adminCatValue(a))-catRank(adminCatValue(b))||(a.nom||"").localeCompare(b.nom||"")).map(m=>memberRow(m,tarifs));await exportXLSX([{name:"Dotation licence",rows:[H_MEMBER,...rows]}],fn+(equipCat==="toutes"?"DotationLicence.xlsx":`Dotation_${equipCat.replace(/[^a-z0-9]+/gi,"_")}.xlsx`));}
      else if(type==="certifs")await exportXLSX([{name:"Préinscrits",rows:[H_MEMBER,...tousMembresDossiers(data).filter(m=>m.certifNeeded).map(m=>memberRow(m,tarifs))]},{name:"Base Footclubs",rows:[H_LIC,...licencies.filter(l=>certifRequis(l)===true).map(licRow)]}],fn+"Certifs.xlsx");
      else if(type==="contacts")await exportXLSX([{name:"Contacts",rows:[["Référence","Saison","Date préinscription","Statut","Nom","Prénom","Catégorie licence","Catégorie admin","Email contact","Téléphone contact","Adresse","CP","Ville","Responsable principal","Lien","Tél resp.","Email resp.","Autres responsables","Famille","Membres dossier","Détail membres","Mode paiement","Total dossier €","Notes"],...data.map(e=>{const r=getResp1(e);const autres=(e.representants||[]).slice(1).filter(x=>x?.nom).map(x=>`${x.prenom||""} ${x.nom||""} (${x.lien||""}) ${x.tel||""} ${x.email||""}`).join(" | ");const membres=membresDossier(e);return[e.id,e.saison||saison,fmtDT(e.datePreinscription),STATUTS[e.statut]?.l||"",e.nom,e.prenom,canonicalCat(e.categorie),adminCatValue(e),getEmailContact(e),getTelContact(e),e.adresse||"",e.codePostal||"",e.ville||"",r?`${r.prenom||""} ${r.nom||""}`.trim():"",r?.lien||"",r?.tel||"",r?.email||"",autres,e.nomFamille||"",membres.length,membres.map(m=>`${m.prenom} ${m.nom} (${adminCatValue(m)})`).join(" | "),paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),calcTotalDossier(e)||0,e.notes||""];})]}],fn+"Contacts.xlsx");
      else if(type==="licencies")await exportXLSX([{name:"Base licenciés",rows:[H_LIC,...licencies.map(licRow)]}],fn+"BaseLicencies.xlsx");
      else if(type==="planning")await exportXLSX([{name:"Entrainements",rows:[["Catégorie","Type","Jour","Début","Fin","Lieu","Responsable","Téléphone","Note"],...planningCalShown.map(c=>{const r=planningResponsableFor(tarifs,c.categorie,c.sexe)||{};return[catLabel(c.categorie),planningSexeLabel(c.sexe||"Tous"),c.jour,c.debut||"",c.fin||"",c.lieu||"",[r.prenom,r.nom].filter(Boolean).join(" "),r.tel||"",c.note||""];})]}],fn+"PlanningEntrainements.xlsx");
      else if(type==="boutique"){
        const articles=getBoutique(tarifs);
        const rows=getAchatsBoutiqueRows(data).map(r=>boutiqueExportRow(r,articles));
        const members=tousMembresDossiers(data).map(m=>{const achats=m.dossier.achatsBoutique||[];const aRegler=achats.filter(a=>(a.statut||"a_regler")==="a_regler").reduce((s,a)=>s+achatTotal(a),0);return[m.dossierId,m.nom,m.prenom,adminCatValue(m),structureType(m),EQUIP_FIELDS.map(f=>`${EQUIP_LABELS[f]} ${f==="tailleSurvet"?getSurvet(m):(m[f]||"-")}`).join(" · "),achats.map(a=>`${a.nom} ${a.taille||""} (${STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"À régler"})`).join(" · "),aRegler];});
        await exportXLSX([{name:"Commandes",rows:[H_BOUTIQUE,...rows]},{name:"Vue membres",rows:[["Référence","Nom","Prénom","Catégorie foot","Type","Dotation licence","Commandes hors dotation","Reste à payer"],...members]}],fn+"Boutique.xlsx");
      }
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  const equipMembers=tousMembresDossiers(data).filter(m=>m.statut!=="refuse");
  const equipData={};
  equipMembers.forEach(m=>{
    const cat=adminCatValue(m);
    if(!equipData[cat])equipData[cat]={joueurs:[],_labels:{}};
    equipData[cat].joueurs.push(m);
    getMemberDotationItems(m,m.categorie,tarifs,saison).forEach(item=>{
      const field=item.id;
      const value=dotationValueForMember(m,item);
      equipData[cat]._labels[field]=item.label||EQUIP_LABELS[field]||field;
      if(!value)return;
      equipData[cat][field]=equipData[cat][field]||{};
      equipData[cat][field][value]=(equipData[cat][field][value]||0)+1;
    });
  });
  const equipMissingRows=equipMembers
    .map(m=>({...m,missingDotations:getMemberMissingDotations(m,tarifs,saison)}))
    .filter(m=>m.missingDotations.length);
  const boutiqueArticles=getBoutique(tarifs);
  const boutiqueCategories=getBoutiqueCategories(tarifs);
  const boutiqueRows=getAchatsBoutiqueRows(data);
  const boutiqueRowsFiltered=boutiqueRows.filter(({entry:e,achat:a})=>{
    const q=boutiqueSearch.toLowerCase();
    const cat=getAchatCategorie(a,boutiqueArticles);
    return (!q||`${e.nom} ${e.prenom} ${e.id} ${a.nom} ${a.taille||""} ${cat}`.toLowerCase().includes(q))&&(boutiqueStatut==="tous"||(a.statut||"a_regler")===boutiqueStatut)&&(boutiqueCategorie==="tous"||cat===boutiqueCategorie)&&(boutiqueArticle==="tous"||a.articleId===boutiqueArticle);
  });
  const boutiqueStats={
    total:boutiqueRows.length,
    montant:boutiqueRows.reduce((s,{achat:a})=>s+achatTotal(a),0),
    aRegler:boutiqueRows.filter(({achat:a})=>(a.statut||"a_regler")==="a_regler").length,
    aCommander:boutiqueRows.filter(({achat:a})=>["regle","commande","attente_fournisseur"].includes(a.statut||"a_regler")).length,
    aLivrer:boutiqueRows.filter(({achat:a})=>["recu"].includes(a.statut||"a_regler")).length,
  };
  const boutiqueVisualMembers=tousMembresDossiers(data).sort((a,b)=>catRank(adminCatValue(a))-catRank(adminCatValue(b))||(a.nom||"").localeCompare(b.nom||""));
  const boutiqueVisualCats=sortCats([...new Set(boutiqueVisualMembers.map(m=>adminCatValue(m)||m.categorie||"Sans catégorie"))]);
  const boutiqueVisualShown=boutiqueVisualCat==="toutes"?boutiqueVisualMembers:boutiqueVisualMembers.filter(m=>(adminCatValue(m)||m.categorie||"Sans catégorie")===boutiqueVisualCat);
  const exportBoutiqueVisual=async(list,label)=>{
    const rows=list.map(m=>{
      const achats=m.dossier.achatsBoutique||[];
      const aRegler=achats.filter(a=>(a.statut||"a_regler")==="a_regler").reduce((s,a)=>s+achatTotal(a),0);
      return[m.dossierId,m.nom,m.prenom,adminCatValue(m),structureType(m),EQUIP_FIELDS.map(f=>`${EQUIP_LABELS[f]} ${f==="tailleSurvet"?getSurvet(m):(m[f]||"-")}`).join(" · "),achats.map(a=>`${a.nom} ${a.taille||""} (${STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"À régler"})`).join(" · "),aRegler];
    });
    await exportXLSX([{name:"Vue complete",rows:[["Référence","Nom","Prénom","Catégorie foot","Type","Dotation licence","Commandes hors dotation","Reste à payer"],...rows]}],`RSG_Boutique_VueComplete_${safeFileName(label)}.xlsx`);
  };
  const equipCats=sortCats(Object.keys(equipData));
  const equipCatsShown=equipCat==="toutes"?equipCats:equipCats.filter(c=>c===equipCat);
  const updateAchatForEntry=async(entryId,achatId,patch)=>{
    const entry=data.find(e=>e.id===entryId);
    if(!entry)return;
    const achats=(entry.achatsBoutique||[]).map(a=>a.id===achatId?{...a,...patch}:a);
    await upd(entryId,{achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)});
  };
  const dotationProducts=getDotationProducts(tmpTarifs);
  const upsertTmpDotationProduct=(article,patch={})=>setTmpTarifs(p=>{
    const key=dotationProductKey(article);
    const base={...article,...patch,id:key,categorie:"Dotation licence",prix:0,actif:true};
    const custom=(Array.isArray(p?._dotationProducts)?p._dotationProducts:[]).filter(a=>dotationProductKey(a)!==key);
    const renamed=patch.nom&&normArticleName(patch.nom)!==normArticleName(article.nom);
    const hidden=[...new Set([
      ...getDotationProductsHiddenKeys(p).filter(k=>k!==key&&k!==`nom:${normArticleName(base.nom)}`),
      ...(renamed?[`nom:${normArticleName(article.nom)}`]:[]),
    ])];
    const dotations=Object.fromEntries(Object.entries(p?._dotations||getDotations(p)).map(([cat,items])=>[
      cat,
      (items||[]).map(item=>dotationProductMatches(item,article)?dotationItemFromArticle(base,cat):item),
    ]));
    return {...p,_dotationProducts:[...custom,base],_dotationProductsHiddenKeys:hidden,_dotations:dotations};
  });
  const addTmpDotationProduct=()=>setTmpTarifs(p=>({
    ...p,
    _dotationProducts:[...(Array.isArray(p?._dotationProducts)?p._dotationProducts:[]),{id:`dot_${Date.now()}`,nom:"Nouveau produit dotation",categorie:"Dotation licence",prix:0,tailles:["S","M","L","XL"],actif:true,imageBase64:""}],
  }));
  const removeTmpDotationProduct=article=>setTmpTarifs(p=>{
    const key=dotationProductKey(article);
    const nameKey=`nom:${normArticleName(article.nom)}`;
    const hidden=[...new Set([...getDotationProductsHiddenKeys(p),key,nameKey])];
    const dotations=Object.fromEntries(Object.entries(p?._dotations||getDotations(p)).map(([cat,items])=>[
      cat,
      (items||[]).filter(item=>!dotationProductMatches(item,article)),
    ]));
    return {
      ...p,
      _dotationProducts:(Array.isArray(p?._dotationProducts)?p._dotationProducts:[]).filter(a=>dotationProductKey(a)!==key&&`nom:${normArticleName(a.nom)}`!==nameKey),
      _dotationProductsHiddenKeys:hidden,
      _dotations:dotations,
    };
  });
  const updateFootclubsMember=async(row,patch)=>{
    const entry=data.find(e=>e.id===row.dossierId);
    if(!entry)return;
    if(row.idx===0){
      await upd(entry.id,patch);
      return;
    }
    const nbFreres=entry.freresSoeurs?.length||0;
    if(row.idx<=nbFreres){
      const freres=[...(entry.freresSoeurs||[])];
      const i=row.idx-1;
      freres[i]={...freres[i],...patch};
      await upd(entry.id,{freresSoeurs:freres});
      return;
    }
    const adultes=[...(entry.adultesFamille||[])];
    const i=row.idx-1-nbFreres;
    adultes[i]={...adultes[i],...patch};
    await upd(entry.id,{adultesFamille:adultes});
  };
  const licencesReglees=tousMembresDossiers(data).filter(m=>m.statut==="valide"||m.statut==="paye").map(m=>{
    if(m.typeLicence!=="renouvellement"||!Array.isArray(licencies)||!licencies.length)return m;
    const lic=lookupLic(licencies,m.nom||"",m.prenom||"",m.numLicenceFFF||m.dossier?.numLicenceFFF||"");
    if(!lic)return m;
    return {
      ...m,
      numLicenceFFF:getLicValue(lic,"l","numLicence","numLicenceFFF")||m.numLicenceFFF||m.dossier?.numLicenceFFF||"",
      numPersonne:licNumPersonne(lic)||m.numPersonne||m.dossier?.numPersonne||"",
    };
  });
  const footclubsCats=sortCats([...new Set(licencesReglees.map(m=>adminCatValue(m)||m.categorie).filter(Boolean))]);
  const footclubsBaseFiltered=licencesReglees.filter(m=>{
    const q=footclubsSearch.toLowerCase().trim();
    const cat=adminCatValue(m)||m.categorie||"";
    const hay=[
      m.nom,m.prenom,m.dossierId,m.categorie,cat,m.poste,m.typeLicence,
      m.numLicenceFFF,m.numPersonne,getEmailContact(m.dossier),getTelContact(m.dossier),
      m.dossier?.nomFamille,m.dossier?.nom,m.dossier?.prenom,m.footclubsCommentaire,
    ].filter(Boolean).join(" ").toLowerCase();
    return (!q||hay.includes(q))
      &&(footclubsCat==="toutes"||cat===footclubsCat)
      &&(footclubsType==="tous"||m.typeLicence===footclubsType);
  });
  const footclubsCounts=STATUT_FOOTCLUBS_ORDER.map(k=>({k,...STATUTS_FOOTCLUBS[k],count:footclubsBaseFiltered.filter(m=>(m.footclubsStatut||"a_integrer")===k).length}));
  const footclubsShown=footclubsBaseFiltered
    .filter(m=>footclubsStatus==="tous"||(m.footclubsStatut||"a_integrer")===footclubsStatus)
    .sort((a,b)=>catRank(a.categorie)-catRank(b.categorie)||(a.nom||"").localeCompare(b.nom||""));
  const runDiagnostic=async()=>{
    const log=[];
    log.push("=== Diagnostic Firebase ===");
    log.push("Firebase disponible : "+(isFirebaseAvailable()?"OUI":"NON"));
    log.push("Saison : "+saison);
    try{
      const dbData=await fbGetAllInscriptions(saison);
      log.push("Lecture Firestore : "+(Array.isArray(dbData)?`${dbData.length} préinscription(s)`:"ÉCHEC"));
      if(Array.isArray(dbData)&&dbData.length){
        log.push("Dernière entrée : "+(dbData[0].prenom||"?")+" "+(dbData[0].nom||"?"));
      }
    }catch(err){
      log.push("Lecture Firestore : ÉCHEC ("+err.message+")");
    }
    const local=await stGet(keyIns(saison));
    log.push("Données locales : "+(Array.isArray(local)?`${local.length} préinscription(s)`:"aucune"));
    log.push("Affiché à l'écran : "+data.length+" préinscription(s)");
    alert(log.join("\n"));
  };
  const currentExportType=tab==="paiements"?"paiements":tab==="equip"?"equip":tab==="planningCal"?"planning":tab==="boutique"?"boutique":tab==="certifs"?"certifs":tab==="footclubs"?"all":tab==="base"?"licencies":tab==="parCat"?"parEquipe":tab==="parType"?"parType":"all";
  const exportSettingsPanel=<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:16,padding:"10px 12px",marginBottom:12,boxShadow:"0 10px 24px rgba(15,23,42,.05)"}}>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(170px,.85fr) minmax(220px,1fr) auto",gap:8,alignItems:"end"}}>
      <div>
        <label style={{...lbl,fontSize:11,marginBottom:4}}>Format</label>
        <select style={{...inp(),minHeight:40,padding:"8px 10px",fontSize:13,borderRadius:12}} value={exportTarget} onChange={e=>setExportTarget(e.target.value)}>
          <option value="xlsx">Excel (.xlsx)</option>
          <option value="google">Google Sheets compatible (.xlsx à importer)</option>
        </select>
      </div>
      <div>
        <label style={{...lbl,fontSize:11,marginBottom:4}}>Champs</label>
        <button type="button" style={{...BS,width:"100%",fontSize:12,minHeight:40,padding:"8px 10px",boxShadow:"none",background:C.Gc}} onClick={()=>setExportFieldsOpen(v=>!v)}>
          Champs exportés : {exportFields.length?`${exportFields.length} sélectionné(s)`:"tous"}
        </button>
      </div>
      <button onClick={()=>doExport(currentExportType)} disabled={exporting} style={{...BP,minHeight:40,padding:"8px 12px",fontSize:12,boxShadow:"none",whiteSpace:"nowrap",justifyContent:"center"}}>
        <Icon as={Download} size={15}/>{exporting?"Export...":"Exporter l'onglet"}
      </button>
      <p style={{gridColumn:"1 / -1",fontSize:10.5,color:C.G,margin:"0"}}>Réglages communs aux exports admin.</p>
    </div>
    {exportFieldsOpen&&<div style={{marginTop:12,borderTop:`1px solid ${C.Gb}`,paddingTop:12}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
        <button style={{...BS,fontSize:12,padding:"7px 10px",minHeight:36}} onClick={()=>setExportFields([])}>Tous les champs</button>
        <button style={{...BS,fontSize:12,padding:"7px 10px",minHeight:36}} onClick={()=>setExportFields(essentialExportFields.filter(f=>exportFieldChoices.includes(f)))}>Essentiel bureau</button>
        <button style={{...BS,fontSize:12,padding:"7px 10px",minHeight:36}} onClick={()=>setExportFields(["Nom","Prénom","Catégorie licence","Catégorie admin","Email contact","Téléphone contact","Total à encaisser €"].filter(f=>exportFieldChoices.includes(f)))}>Contact + paiement</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:6,maxHeight:260,overflow:"auto",paddingRight:4}}>
        {exportFieldChoices.map(field=>{
          const checked=!exportFields.length||exportFields.includes(field);
          return <label key={field} style={{display:"flex",alignItems:"center",gap:7,background:checked?C.Jp:C.Gc,border:`1px solid ${checked?C.Jd:C.Gb}`,borderRadius:10,padding:"7px 9px",fontSize:12,fontWeight:750,color:C.N,cursor:"pointer"}}>
            <input type="checkbox" checked={checked} onChange={e=>toggleExportField(field,e.target.checked)}/>
            <span>{field}</span>
          </label>;
        })}
      </div>
    </div>}
  </div>;
  const configEditorTarifs=tmpTarifs||tarifs;
  const configPreviewEntry={
    ...F0,
    prenom:"Florian",
    nom:"FIGUREAU",
    dateNaissance:"02/12/1992",
    categorie:"Senior",
    saison,
    id:"RSG-CMOIPN4",
    prixFinal:140,
    datePaiement:new Date().toISOString().slice(0,10),
    modePaiement:"cheque",
    modePaiements:[{id:"cheque",montant:140}],
    certifNeeded:true,
  };

  return<div style={{maxWidth:1480,margin:"0 auto",padding:"18px 18px 90px",letterSpacing:0}}>
    <div style={{background:`linear-gradient(135deg, ${C.W} 0%, #fffdf0 100%)`,border:`1px solid ${C.Gb}`,borderRadius:26,padding:"20px 22px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",boxShadow:"0 18px 48px rgba(15,23,42,.08)"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
        <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:58,height:58,borderRadius:"50%",objectFit:"cover",boxShadow:"0 10px 24px rgba(15,23,42,.16)",flexShrink:0}}/>
        <div>
          <div style={{fontWeight:950,fontSize:23,color:C.N,lineHeight:1,letterSpacing:0}}>Espace admin RSG</div>
          <div style={{fontSize:13,color:C.G,marginTop:5}}>Saison publique du formulaire : <strong style={{color:C.N}}>{publicSaison}</strong> - Saison de travail admin : <strong style={{color:C.N}}>{saison}</strong></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:isMobile?"stretch":"flex-end"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 10px",borderRadius:12,background:fbStatus==="online"?"#ecfdf5":fbStatus==="connecting"?"#fef9c3":"#fee2e2",color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R,border:`1px solid ${fbStatus==="online"?"#bbf7d0":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,fontSize:12,fontWeight:850}}>
          <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:fbStatus==="online"?C.V:fbStatus==="connecting"?"#eab308":C.R}}/>
          {fbStatus==="online"?"Firebase actif":fbStatus==="connecting"?"Connexion Firebase":"Hors-ligne"}
        </div>
        <button onClick={()=>setCreateMemberOpen(true)} style={{...BP,minHeight:36,padding:"8px 10px",fontSize:11,boxShadow:"none"}}><Icon as={UserPlus} size={14}/>Nouveau membre</button>
        <button onClick={runDiagnostic} style={{...BS,minHeight:36,padding:"8px 10px",fontSize:11,boxShadow:"none"}}><Icon as={ShieldCheck} size={14}/>Diagnostic</button>
        <button onClick={refresh} style={{...BS,minHeight:36,padding:"8px 10px",fontSize:11,boxShadow:"none"}}><Icon as={Search} size={14}/>Recharger</button>
        <a data-rsg-button="true" href={`${import.meta.env.BASE_URL||"/"}wiki-admin.html`} target="_blank" rel="noreferrer" style={{...BDark,textDecoration:"none",color:C.J}}>
          <Icon as={BookOpen} size={15}/>Wiki admin
        </a>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"280px minmax(0,1fr)",gap:isMobile?12:22,alignItems:"start"}}>
    {/* Tabs */}
    <div style={{display:"flex",flexDirection:isMobile?"row":"column",background:C.W,borderRadius:24,padding:isMobile?8:14,gap:6,border:`1px solid ${C.Gb}`,boxShadow:"0 18px 45px rgba(15,23,42,.08)",position:isMobile?"static":"sticky",top:12,zIndex:2,overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch"}}>
      {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 8px 14px",marginBottom:6,borderBottom:`1px solid ${C.Gb}`}}>
        <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:950,color:C.N,lineHeight:1}}>Reveil Saint-Gereon</div>
          <div style={{fontSize:11,fontWeight:800,color:C.G,marginTop:2}}>Navigation bureau</div>
        </div>
      </div>}
      {[
        {id:"dashboard",l:"Dashboard",icon:LayoutDashboard},
        {id:"liste",l:"Liste",icon:ClipboardList},
        {id:"parCat",l:"Categories",icon:BarChart3},
        {id:"parType",l:"Types",icon:Users},
        {id:"familles",l:"Familles & multi-licences",icon:Users},
        {id:"mutations",l:"Mutations",icon:ArrowLeft},
        {id:"nonpreins",l:"Manquants",icon:AlertTriangle},
        {id:"paiements",l:"Paiements",icon:Euro},
        {id:"equip",l:"Dotation licence",icon:Shirt},
        {id:"planningCal",l:"Calendrier entraînements",icon:CalendarDays},
        {id:"certifs",l:"Certificats",icon:ShieldCheck},
        {id:"emails",l:"Emails",icon:Mail},
        {id:"exports",l:"Exports",icon:Download},
        {id:"footclubs",l:"Footclubs",icon:HomeIcon},
        {id:"tarifs",l:"Configuration",icon:UserCog},
        {id:"base",l:`Base (${licencies.length})`,icon:ClipboardList}
      ].map(({id,l,icon})=>(
        <button key={id} onClick={()=>{setTab(id);setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),0);}} style={{width:isMobile?"auto":"100%",flex:isMobile?"0 0 auto":undefined,textAlign:"left",padding:"8px 12px",border:"none",borderRadius:12,fontWeight:tab===id?850:650,fontSize:12,cursor:"pointer",background:tab===id?C.J:"transparent",color:tab===id?C.N:C.G,whiteSpace:isMobile?"nowrap":"normal",minHeight:36,boxShadow:tab===id?"0 8px 18px rgba(245,200,0,.20)":"none",transition:"background .15s ease, color .15s ease",fontFamily:FONT,display:"flex",alignItems:"center",gap:9,justifyContent:"flex-start"}}>
          <Icon as={icon} size={15}/><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{l}</span>
        </button>
      ))}
    </div>

    <div style={{minWidth:0}}>
    {!["dashboard","tarifs","emails","planningCal"].includes(tab)&&<>
      {exportSettingsPanel}
    </>}
    {tab==="dashboard"&&<ViewDashboard data={data} licencies={licencies} saison={saison} isMobile={isMobile} onSelect={e=>{setSel(e);setNote(e.notes||"");}} onNavigate={setTab}/>}

    {tab==="emails"&&<AdminEmailingPanel saison={saison} data={data} licencies={licencies}/>}

    {/* LISTE */}
    {tab==="liste"&&<>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        <input style={{...inp(),fontSize:14}} placeholder="Nom, prenom, email, reference..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{val:fSt,set:setFSt,opts:[{v:"tous",l:"Tous statuts"},...STATUT_ORDER.map(k=>({v:k,l:STATUTS[k].l}))]},{val:fCat,set:setFCat,opts:[{v:"toutes",l:"Toutes cat."},..."Babyfoot,U6/U7,U8/U9,U10/U11M,U10/U11F,U12/U13M,U12/U13F,U14/U15M,U14/U15F,U16/U17/U18M,U16/U17/U18F,Seniors M,Seniors F,Dirigeants".split(",").map(c=>({v:c,l:c}))]},{val:fType,set:setFType,opts:[{v:"tous",l:"Tous types"},{v:"renouvellement",l:"Renouvellements"},{v:"nouvelle",l:"Nouvelles"}]}].map((s,i)=>(
            <select key={i} style={{...inp(),flex:"1 1 100px",fontSize:13}} value={s.val} onChange={e=>s.set(e.target.value)}>{s.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
          ))}
        </div>
        <p style={{fontSize:12,color:C.G,margin:0}}>{filtered.length} / {data.length} dossier(s) - {tousMembresDossiers(filtered).length} membre(s) affiche(s)</p>
      </div>
      {loading&&<p style={{textAlign:"center",color:C.G,padding:32}}>Chargement…</p>}
      {!loading&&filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucune préinscription</p>}
      {!loading&&filtered.map(e=><EntryCard key={e.id} e={e} sel={sel} onSel={()=>{setSel(e);setNote(e.notes||"");}} onMemberSel={setMemberSel}/>)}
    </>}

    {/* CERTIFS */}
    {tab==="certifs"&&<div>
      <div style={{display:"flex",gap:6,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4,marginBottom:12}}>
        {[{id:"footclubs",l:`Base Footclubs (${licencies.filter(l=>certifRequis(l)===true).length})`},{id:"preinscrits",l:`Préinscrits (${data.filter(d=>d.certifNeeded).length})`}].map(x=><button key={x.id} onClick={()=>setCertifPage(x.id)} style={{flex:1,border:"none",borderRadius:7,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:certifPage===x.id?C.J:C.W,color:certifPage===x.id?C.N:C.G}}>{x.l}</button>)}
      </div>
      {certifPage==="footclubs"&&<div>
        {licencies.filter(l=>certifRequis(l)===true).length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun joueur avec certificat requis dans la base Footclubs.</p>}
        {licencies.filter(l=>certifRequis(l)===true).sort((a,b)=>(catFromLic(a)||"").localeCompare(catFromLic(b)||"")||(getLicValue(a,"n","nom")||"").localeCompare(getLicValue(b,"n","nom")||"")).map((l,i)=>{
          const nom=getLicValue(l,"n","nom"), prenom=getLicValue(l,"p","prenom"), num=getLicValue(l,"l","numLicence","numLicenceFFF"), cat=catFromLic(l)||suggestCat(getLicValue(l,"dn","dateNaissance"),saison)||"—";
          const inscrit=data.find(d=>lookupLic([l],d.nom,d.prenom,d.numLicenceFFF));
          return <div key={num||`${nom}-${prenom}-${i}`} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${inscrit?C.V:C.R}`}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:800}}>{prenom} {nom}</span>
              <span style={{background:inscrit?"#dcfce7":"#fee2e2",color:inscrit?C.V:C.R,padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:800}}>{inscrit?"Préinscrit":"Pas encore préinscrit"}</span>
            </div>
            <div style={{fontSize:12,color:C.G,marginTop:3}}>{cat} · Licence {num||"—"} · Certificat médical requis selon Footclubs</div>
          </div>;
        })}
      </div>}
      {certifPage==="preinscrits"&&<div>
        {data.filter(d=>d.certifNeeded).length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun préinscrit avec certificat requis.</p>}
        {data.filter(d=>d.certifNeeded).map(e=><div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${C.R}`}}>
          <span style={{fontWeight:700}}>{e.prenom} {e.nom}</span><span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span>
          <div style={{fontSize:12,color:C.G,marginTop:3}}>{getEmailContact(e)} · Certif : {e.anneeLastCertifBase||"inconnu"} · Statut dossier : {STATUTS[e.statut]?.l||"—"}</div>
        </div>)}
      </div>}
    </div>}

    {/* NON PRÉINSCRITS — qui de la saison N-1 ne s'est pas réinscrit ? */}
    {/* PAR CATÉGORIE */}
    {tab==="parCat"&&<ViewParCategorie data={data} tarifs={tarifs} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {/* PAR TYPE */}
    {tab==="parType"&&<ViewParType data={data} tarifs={tarifs} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {tab==="familles"&&<ViewFamilles data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}} onMemberSelect={setMemberSel}/>}

    {tab==="mutations"&&<ViewMutations data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {tab==="nonpreins"&&<NonPreinscrits licencies={licencies} data={data} saison={saison}/>}

    {/* ÉQUIPEMENTS */}
    {tab==="equip"&&<div>
      <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontWeight:900,fontSize:15,color:C.V,margin:"0 0 4px"}}>Dotation équipement licence</p>
        <p style={{fontSize:12,color:C.V,margin:0}}>Suivi des tailles comprises avec la licence : vue par catégorie, totaux par taille, et liste nominative.</p>
      </div>
      {equipMissingRows.length>0&&<div style={{background:"#fff7ed",border:"1.5px solid #fdba74",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontSize:14,fontWeight:950,color:"#9a3412",margin:"0 0 4px",display:"flex",alignItems:"center",gap:7}}><Icon as={AlertTriangle} size={16}/>Dotations à demander en permanence</p>
        <p style={{fontSize:12,color:"#9a3412",fontWeight:800,margin:"0 0 10px"}}>{equipMissingRows.length} membre(s) ont une dotation configurée mais une ou plusieurs tailles non renseignées.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:8}}>
          {equipMissingRows.slice(0,12).map(m=><button key={`missing-${m.dossierId}-${m.idx}`} type="button" onClick={()=>setMemberSel(m)} style={{background:C.W,border:"1px solid #fed7aa",borderRadius:10,padding:"9px 10px",textAlign:"left",fontFamily:FONT,cursor:"pointer"}}>
            <div style={{fontSize:12,fontWeight:950,color:C.N}}>{m.prenom} {m.nom} · {adminCatValue(m)}</div>
            <div style={{fontSize:11,fontWeight:850,color:"#9a3412",marginTop:2}}>À demander : {m.missingDotations.join(", ")}</div>
          </button>)}
        </div>
        {equipMissingRows.length>12&&<p style={{fontSize:11,color:"#9a3412",fontWeight:850,margin:"8px 0 0"}}>+ {equipMissingRows.length-12} autre(s) membre(s) à vérifier dans les catégories concernées.</p>}
      </div>}
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",marginBottom:12,display:"grid",gridTemplateColumns:"minmax(220px,1fr) auto",gap:10,alignItems:"end"}}>
        <F label="Filtrer par catégorie">
          <select style={inp()} value={equipCat} onChange={e=>setEquipCat(e.target.value)}>
            <option value="toutes">Toutes les catégories</option>
            {equipCats.map(cat=><option key={cat} value={cat}>{cat}</option>)}
          </select>
        </F>
        <button onClick={()=>doExport("equip")} disabled={exporting} style={{...BP,marginBottom:12,minHeight:46,fontSize:13}}>
          {exporting?"Export...":equipCat==="toutes"?"Export toutes catégories":"Export catégorie"}
        </button>
      </div>
      {equipCatsShown.map(cat=>{const fields=equipData[cat];const joueurs=fields.joueurs||[];const fieldOrder=[...EQUIP_FIELDS,...Object.keys(fields).filter(k=>!["joueurs","_labels"].includes(k)&&!EQUIP_FIELDS.includes(k))].filter(field=>fields[field]);return <div key={cat} style={{background:C.W,borderRadius:12,padding:"14px 16px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
        <div style={{fontWeight:900,fontSize:16,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"5px 10px",borderRadius:7,fontSize:13}}>{cat}</span>
          <span style={{color:C.G,fontSize:13}}>{joueurs.length} joueur(s)</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
          {fieldOrder.map(field=><div key={field} style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:16,padding:"12px 14px"}}>
            {(()=>{const label=fields._labels?.[field]||EQUIP_LABELS[field]||field;return <>
            <p style={{fontSize:13,fontWeight:900,color:C.N,margin:"0 0 8px"}}>{label}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(72px,1fr))",gap:6}}>
              {Object.entries(fields[field]).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([sz,n])=><div key={sz} style={{background:C.W,border:`1px solid ${C.Jd}`,borderRadius:12,padding:"9px 10px",textAlign:"center",boxShadow:"0 4px 10px rgba(15,23,42,.04)"}}>
                <div style={{fontWeight:900,color:C.N,fontSize:13}}>{sz}</div>
                <div style={{fontSize:12,color:C.Jd,fontWeight:900}}>x {n}</div>
              </div>)}
            </div>
            </>;})()}
          </div>)}
        </div>
        <div style={{marginTop:10,background:C.Gc,borderRadius:10,padding:"10px 12px"}}>
          <p style={{fontSize:12,fontWeight:900,margin:"0 0 8px",color:C.N}}>Liste nominative</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:6}}>
            {joueurs.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=>{const missing=getMemberMissingDotations(m,tarifs,saison);const recap=getMemberDotationItems(m,m.categorie,tarifs,saison).map(item=>`${item.label}: ${dotationValueForMember(m,item)||"-"}`).join(" · ");return <button key={`${m.dossierId}-${m.idx}`} onClick={()=>setMemberSel(m)} style={{display:"grid",gridTemplateColumns:m.photoBase64?"34px minmax(0,1fr)":"minmax(0,1fr)",gap:8,alignItems:"center",background:C.W,border:`1px solid ${missing.length?"#fdba74":C.Gb}`,borderRadius:8,padding:"7px 8px",cursor:"pointer",textAlign:"left",fontFamily:FONT}}>
              {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:34,height:34,borderRadius:8,objectFit:"cover"}}/>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:900}}>{m.prenom} {m.nom}</div>
                <div style={{fontSize:11,color:C.G}}>{recap||"Aucune dotation"}{formatInitiales(m,tarifs)?` · Initiales: ${formatInitiales(m,tarifs)}`:""}</div>
                {missing.length>0&&<div style={{fontSize:11,color:"#9a3412",fontWeight:900,marginTop:3}}>À demander : {missing.join(", ")}</div>}
              </div>
            </button>;})}
          </div>
        </div>
      </div>;})}
    </div>}

    {tab==="planningCal"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:14,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 4px"}}>Calendrier des entraînements</p>
        <p style={{fontSize:12,color:"#1e40af",margin:0}}>Vue globale de tous les créneaux configurés, avec filtres par catégorie, type et lieu.</p>
      </div>
      {exportSettingsPanel}
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",marginBottom:12,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
        <F label="Catégorie">
          <select style={inp()} value={planningCalCat} onChange={e=>setPlanningCalCat(e.target.value)}>
            <option value="toutes">Toutes catégories</option>
            {planningCalCats.map(cat=><option key={cat} value={cat}>{cat}</option>)}
          </select>
        </F>
        <F label="Type">
          <select style={inp()} value={planningCalType} onChange={e=>setPlanningCalType(e.target.value)}>
            <option value="tous">Tous types</option>
            <option value="Tous">Mixte / tous</option>
            <option value="Masculin">Masculins</option>
            <option value="Féminin">Féminines</option>
          </select>
        </F>
        <F label="Lieu">
          <select style={inp()} value={planningCalLieu} onChange={e=>setPlanningCalLieu(e.target.value)}>
            <option value="tous">Tous lieux</option>
            {planningCalLieux.map(lieu=><option key={lieu} value={lieu}>{lieu}</option>)}
          </select>
        </F>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
        <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.N}}>{planningCalShown.length}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Créneau(x) affiché(s)</div></div>
        <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.N}}>{new Set(planningCalShown.map(c=>c.lieu).filter(Boolean)).size}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Lieu(x)</div></div>
        <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px"}}><div style={{fontSize:24,fontWeight:950,color:C.N}}>{new Set(planningCalShown.map(c=>adminCatValue({categorie:c.categorie,sexe:c.sexe}))).size}</div><div style={{fontSize:12,color:C.G,fontWeight:850}}>Catégorie(s)</div></div>
      </div>
      {!planningCalRows.length&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"18px",fontSize:13,color:C.G,marginBottom:12}}>Aucun créneau configuré. Cliquez directement dans le calendrier pour créer le premier créneau.</div>}
      {planningCalRows.length>0&&!planningCalShown.length&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"18px",fontSize:13,color:C.G,marginBottom:12}}>Aucun créneau ne correspond aux filtres.</div>}
      <PlanningWeekCalendar rows={planningCalShown} tarifs={tarifs} isMobile={isMobile} onCreate={openPlanningCreate} onEdit={c=>setPlanningDraft({...c})} onMove={movePlanningCreneau}/>
    </div>}

    {/* PAIEMENTS */}
    {tab==="paiements"&&(()=> {
      const payModes=getModesPaiement(tarifs);
      const dossierModes=d=>paymentIds(d);
      const monthKey=dt=>{
        const s=String(dt||"").trim();
        let m=s.match(/^(\d{4})-(\d{2})/);
        if(m)return`${m[1]}-${m[2]}`;
        m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        return m?`${m[3]}-${m[2]}`:"";
      };
      const monthLabel=key=>{
        const [y,m]=String(key||"").split("-");
        if(!y||!m)return key;
        const label=new Date(Number(y),Number(m)-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
        return label.charAt(0).toUpperCase()+label.slice(1);
      };
      const dossierCats=d=>[...new Set(membresDossier(d).map(m=>categoryListKey(m)).filter(Boolean))];
      const dossierTypes=d=>[...new Set(membresDossier(d).map(m=>structureType(m)).filter(Boolean))];
      const payCats=sortCats([...new Set(data.flatMap(d=>dossierCats(d)))]);
      const payTypes=[...new Set(data.flatMap(d=>dossierTypes(d)))].sort((a,b)=>a.localeCompare(b));
      const payMonths=[...new Set(data.flatMap(d=>(d.datesEcheances||[]).map(monthKey).filter(Boolean)))].sort();
      const filteredPaiements=data.filter(d=>{
        const catOk=paiementCat==="toutes"||dossierCats(d).includes(paiementCat);
        const typeOk=paiementType==="tous"||dossierTypes(d).includes(paiementType);
        const modeOk=paiementMode==="tous"||dossierModes(d).includes(paiementMode);
        const monthOk=paiementMonth==="tous"||(d.datesEcheances||[]).some(dt=>monthKey(dt)===paiementMonth);
        return catOk&&typeOk&&modeOk&&monthOk;
      });
      const modeCards=payModes.map(m=>{
        const rows=filteredPaiements.filter(d=>dossierModes(d).includes(m.id));
        return{...m,count:rows.length,total:rows.reduce((s,d)=>s+paymentAmountForMode(d,m.id,tarifs),0)};
      });
      const shownModes=paiementMode==="tous"?payModes:payModes.filter(m=>m.id===paiementMode);
      const hasGroup=shownModes.some(m=>filteredPaiements.some(d=>dossierModes(d).includes(m.id)));
      return <div>
      <div style={{background:C.W,borderRadius:22,padding:"18px",marginBottom:12,border:`1px solid ${C.Gb}`,boxShadow:"0 14px 34px rgba(15,23,42,.06)"}}>
        <p style={{fontWeight:900,fontSize:16,margin:"0 0 14px",color:C.N}}>Récapitulatif paiements</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10,marginBottom:10}}>
          <F label="Catégorie">
            <select style={inp()} value={paiementCat} onChange={e=>setPaiementCat(e.target.value)}>
              <option value="toutes">Toutes catégories</option>
              {payCats.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </F>
          <F label="Type">
            <select style={inp()} value={paiementType} onChange={e=>setPaiementType(e.target.value)}>
              <option value="tous">Tous types</option>
              {payTypes.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </F>
          <F label="Mode de paiement">
            <select style={inp()} value={paiementMode} onChange={e=>setPaiementMode(e.target.value)}>
              <option value="tous">Tous modes</option>
              {payModes.map(m=><option key={m.id} value={m.id}>{m.l}</option>)}
            </select>
          </F>
          <F label="Mois d'échéance">
            <select style={inp()} value={paiementMonth} onChange={e=>setPaiementMonth(e.target.value)}>
              <option value="tous">Toutes échéances</option>
              {payMonths.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </F>
        </div>
        <div style={{fontSize:12,color:C.G,margin:"0 0 14px"}}>{filteredPaiements.length} / {data.length} dossier(s) affiché(s){paiementMonth!=="tous"?` · échéance ${monthLabel(paiementMonth)}`:""}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
          {modeCards.map(m=>(
            <button key={m.id} onClick={()=>setPaiementMode(paiementMode===m.id?"tous":m.id)} style={{background:paiementMode===m.id?C.Jp:"#f8fafc",border:`1px solid ${paiementMode===m.id?C.J:C.Gb}`,borderRadius:16,padding:"12px 14px",textAlign:"center",cursor:"pointer",fontFamily:FONT}}>
              <div style={{fontWeight:950,fontSize:24,color:C.N}}>{m.count}</div>
              <div style={{fontSize:12,color:C.G,fontWeight:850,marginTop:3}}>{m.l}</div>
              {m.total>0&&<div style={{fontSize:11,color:C.Jd,fontWeight:900,marginTop:4}}>{m.total} € estimés</div>}
            </button>
          ))}
        </div>
        {!hasGroup&&<p style={{textAlign:"center",color:C.G,padding:22,fontStyle:"italic",margin:0}}>Aucun paiement ne correspond aux filtres.</p>}
        {/* Par mode */}
        {shownModes.map(m=>{
          const grp=filteredPaiements.filter(d=>dossierModes(d).includes(m.id));
          if(!grp.length)return null;
          return<div key={m.id} style={{marginBottom:12}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px",color:C.G}}>{m.l} - {grp.length} dossier(s) - {grp.reduce((s,d)=>s+paymentAmountForMode(d,m.id,tarifs),0)} € estimés</p>
            {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=>{
              const total=calcTotalDossier(d);
              const modeAmount=paymentAmountForMode(d,m.id,tarifs,total);
              const echeances=d.nbFois>1?calcEcheances(total,d.nbFois):[];
              const rows=(d.datesEcheances||[]).map((dt,i)=>({dt,i,montant:echeances?.[i]||0,month:monthKey(dt)})).filter(r=>r.dt);
              const monthRows=paiementMonth==="tous"?rows:rows.filter(r=>r.month===paiementMonth);
              const cats=dossierCats(d);
              const types=dossierTypes(d);
              return <div key={d.id} onClick={()=>{setSel(d);setNote(d.notes||"");}} style={{background:d.nbFois>1?"#fffbeb":C.Gc,border:`1px solid ${d.nbFois>1?"#fcd34d":C.Gb}`,borderLeft:`4px solid ${STATUTS[d.statut]?.c||C.G}`,borderRadius:14,padding:"11px 12px",marginBottom:7,fontSize:13,cursor:"pointer",display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,alignItems:"start"}}>
                <div style={{minWidth:0}}>
                  <div><span style={{fontWeight:900,color:C.N}}>{d.prenom} {d.nom}</span> - {modeAmount} € en {m.l}{dossierModes(d).length>1?` · total dossier ${total} €`:""}{d.nbFois>1?` · ${d.nbFois}x`:""}{d.datesEcheances&&d.datesEcheances[0]?` - 1er encaissement ${fmtD(d.datesEcheances[0])}`:""}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                    {cats.slice(0,4).map(c=><span key={c} style={{background:C.N,color:C.J,padding:"1px 7px",borderRadius:999,fontSize:11,fontWeight:900}}>{c}</span>)}
                    {types.slice(0,2).map(t=><span key={t} style={{background:C.Gc,color:C.G,padding:"1px 7px",borderRadius:999,fontSize:11,fontWeight:800,border:`1px solid ${C.Gb}`}}>{t}</span>)}
                    {cats.length>4&&<span style={{fontSize:11,color:C.G,fontWeight:800}}>+{cats.length-4}</span>}
                  </div>
                  {monthRows.length>0&&<div style={{marginTop:6,fontSize:11,color:"#92400e",fontWeight:850}}>
                    {paiementMonth==="tous"?"Échéances":"Échéance du mois"} : {monthRows.map(r=>`${fmtD(r.dt)}${r.montant?` (${r.montant} €)`:""}`).join(" · ")}
                  </div>}
                </div>
                <span style={{fontSize:11,fontWeight:900,padding:"3px 8px",borderRadius:999,background:STATUTS[d.statut]?.bg,color:STATUTS[d.statut]?.c,whiteSpace:"nowrap"}}>{STATUTS[d.statut]?.l}</span>
              </div>;
            })}
          </div>;
        })}
      </div>
    </div>;
    })()}

    {/* PERMANENCES */}
    {false&&tab==="permanences"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Permanences licence - Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces dates et horaires s'affichent après l'envoi de la préinscription et sur le récap imprimable.</p>
      </div>
      {!editPerms?(
        <div>
          {getPermanences(tarifs).map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:C.N}}>Permanence {i+1}</div>
              <div style={{fontSize:13,color:C.G,marginTop:2}}>{fmtPermanence(p)}</div>
            </div>
            <span style={{background:C.Jp,color:"#713f12",border:`1px solid ${C.Jd}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700}}>visible public</span>
          </div>)}
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPerms(getPermanences(tarifs).map(p=>({...p})));setEditPerms(true);}}>Modifier les permanences</button>
        </div>
      ):(
        <div>
          {tmpPerms.map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <p style={{fontWeight:800,fontSize:13,margin:0}}>Permanence {i+1}</p>
              {tmpPerms.length>1&&<button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPerms(p=>p.filter((_,j)=>j!==i))}>Supprimer</button>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1.2fr .8fr .8fr",gap:8,marginBottom:8}}>
              <F label="Date"><input type="date" style={inp()} value={p.date||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,date:e.target.value}:x))}/></F>
              <F label="Début"><input type="time" style={inp()} value={p.debut||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,debut:e.target.value}:x))}/></F>
              <F label="Fin"><input type="time" style={inp()} value={p.fin||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,fin:e.target.value}:x))}/></F>
            </div>
            <F label="Lieu"><input style={inp()} value={p.lieu||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,lieu:e.target.value}:x))} placeholder="Ex: Stade du RSG, club-house"/></F>
          </div>)}
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPerms(p=>[...p,{date:"",debut:"",fin:"",lieu:"Stade du RSG"}])}>+ Ajouter une permanence</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_permanences:tmpPerms});setEditPerms(false);}}>✓ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditPerms(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {/* PIÈCES À FOURNIR */}
    {false&&tab==="pieces"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Pieces a fournir - Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces libellés s'affichent uniquement à la fin de la préinscription et sur le récap imprimable.</p>
      </div>
      {!editPieces?(
        <div>
          {getPieces(tarifs).map((p,i)=><div key={p.id||i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`}}>
            <div style={{fontWeight:800,fontSize:14,color:C.N}}>{p.label}</div>
            <div style={{fontSize:12,color:C.G,marginTop:3}}>Condition : {p.condition==="certif"?"si certificat requis":p.condition==="famille"?"si inscription famille":p.condition==="etranger"?"si nationalité étrangère":"toujours"}</div>
          </div>)}
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPieces(getPieces(tarifs).map(p=>({...p})));setEditPieces(true);}}>Modifier les pieces a fournir</button>
        </div>
      ):(
        <div>
          {tmpPieces.map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <p style={{fontWeight:800,fontSize:13,margin:0}}>Pièce {i+1}</p>
              {tmpPieces.length>1&&<button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPieces(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>}
            </div>
            <F label="Libellé"><input style={inp()} value={p.label||""} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/></F>
            <F label="Condition d'affichage"><select style={inp()} value={p.condition||"always"} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,condition:e.target.value}:x))}>
              <option value="always">Toujours</option>
              <option value="certif">Si certificat médical requis</option>
              <option value="famille">Si inscription famille</option>
              <option value="etranger">Si nationalité étrangère</option>
            </select></F>
          </div>)}
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPieces(list=>[...list,{id:`piece_${Date.now()}`,label:"Nouvelle pièce",condition:"always"}])}>+ Ajouter une pièce</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_pieces:tmpPieces});setEditPieces(false);}}>✓ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditPieces(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {tab==="exports"&&<div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
        {[
          {id:"all",l:"Tous dossiers",d:"Préinscriptions complètes"},
          {id:"parEquipe",l:"Par équipe",d:"Un onglet par catégorie"},
          {id:"paiements",l:"Paiements",d:"Montants, modes et échéances"},
          {id:"equip",l:"Tailles",d:"Équipements par joueur"},
          {id:"certifs",l:"Certificats",d:"Suivi médical"},
          {id:"contacts",l:"Contacts",d:"Téléphones et emails"},
          {id:"licencies",l:"Licenciés",d:"Base importée"}
        ].map(x=><button key={x.id} onClick={()=>doExport(x.id)} disabled={exporting} style={{background:C.W,color:C.N,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"14px 16px",fontWeight:800,fontSize:14,cursor:"pointer",opacity:exporting?.6:1,textAlign:"left",minHeight:86}}>
          <span style={{display:"block"}}>{exporting?"Export...":x.l}</span>
          <span style={{display:"block",fontSize:12,color:C.G,fontWeight:500,marginTop:5}}>{x.d}</span>
        </button>)}
      </div>
    </div>}

    {/* BOUTIQUE PERMANENCE */}
    {tab==="boutique"&&<div>
      <div style={{display:"flex",gap:6,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4,marginBottom:12}}>
        {[{id:"produits",l:"Produits"},{id:"commandes",l:"Commandes hors dotation"},{id:"visualisation",l:"Vue complète"}].map(x=><button key={x.id} onClick={()=>setBoutiquePage(x.id)} style={{flex:1,border:"none",borderRadius:7,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:boutiquePage===x.id?C.J:C.W,color:boutiquePage===x.id?C.N:C.G}}>{x.l}</button>)}
      </div>
      {boutiquePage==="produits"&&(!editBoutique?(
        <div>
          {getBoutiqueCategories(tarifs).map(cat=>{
            const articlesCat=getBoutique(tarifs).filter(a=>(a.categorie||"Sans catégorie")===cat);
            if(!articlesCat.length)return null;
            return <div key={cat} style={{marginBottom:12}}>
              <p style={{fontSize:12,fontWeight:900,color:C.N,margin:"0 0 6px",textTransform:"uppercase"}}>{cat} · {articlesCat.length} article(s)</p>
              {articlesCat.map(a=><div key={a.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`,opacity:a.actif===false ? .55 : 1}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",minWidth:0,flex:1}}>
                {a.imageBase64?<img src={a.imageBase64} alt={a.nom} style={{width:56,height:56,objectFit:"cover",borderRadius:8,border:`1px solid ${C.Gb}`,flexShrink:0}}/>:<div style={{width:56,height:56,borderRadius:8,background:C.Gc,border:`1px dashed ${C.Gb}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.G,flexShrink:0}}>IMG</div>}
                <div style={{minWidth:0}}>
                <div style={{fontWeight:900,fontSize:15,color:C.N}}>{a.nom}</div>
                <div style={{fontSize:12,color:C.G,marginTop:3}}>{a.categorie||"Sans catégorie"} · {(a.tailles||[]).join(" · ")||"Sans taille"}</div>
                {a.origineDotation&&<div style={{fontSize:11,color:"#92400e",fontWeight:800,marginTop:3}}>Dotation : {(a.categoriesDotation||[]).join(", ")}</div>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:900,fontSize:20,color:C.J}}>{a.prix} €</div>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:a.actif===false?"#fee2e2":"#dcfce7",color:a.actif===false?C.R:C.V}}>{a.actif===false?"Masqué":"Actif"}</span>
              </div>
            </div>
          </div>)}
            </div>;
          })}
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpBoutique(getBoutique(tarifs).map(a=>({...a,tailles:[...(a.tailles||[])]})));setEditBoutique(true);}}>Modifier les articles boutique</button>
        </div>
      ):(
        <div>
          {tmpBoutique.map((a,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <p style={{fontWeight:800,fontSize:13,margin:0}}>Article {i+1}</p>
              {a.origineDotation&&<span style={{fontSize:11,fontWeight:900,color:"#92400e",background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:999,padding:"3px 8px"}}>Dotation licence</span>}
              <button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpBoutique(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>
            </div>
            <div style={G2}>
              <F label="Nom"><input style={inp()} value={a.nom||""} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,nom:e.target.value}:x))}/></F>
              <F label="Prix"><input type="number" style={inp()} value={a.prix||0} min={0} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,prix:parseInt(e.target.value)||0}:x))}/></F>
            </div>
            <F label="Catégorie boutique"><input list="boutique-categories" style={inp()} value={a.categorie||""} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,categorie:e.target.value}:x))} placeholder="Textile, Accessoires, Commande spéciale..."/></F>
            <div style={{marginBottom:10}}>
              <label style={lbl}>Photo produit</label>
              <PhotoInput value={a.imageBase64||""} onChange={v=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,imageBase64:v}:x))}/>
            </div>
            <F label="Tailles / options (séparées par des virgules)" span><input style={inp()} value={(a.tailles||[]).join(", ")} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,tailles:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}:x))} placeholder="S, M, L, XL"/></F>
            <Chk checked={a.actif!==false} onChange={v=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,actif:v}:x))} label="Article disponible en permanence"/>
          </div>)}
          <datalist id="boutique-categories">{getBoutiqueCategories({...tarifs,_boutique:tmpBoutique}).map(c=><option key={c} value={c}/>)}</datalist>
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpBoutique(list=>[...list,{id:`article_${Date.now()}`,nom:"Nouvel article",categorie:"Commande spéciale",prix:0,tailles:["S","M","L","XL"],actif:true,imageBase64:""}])}>+ Ajouter un article</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_boutique:tmpBoutique});setEditBoutique(false);}}>✓ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditBoutique(false)}>Annuler</button>
          </div>
        </div>
      ))}

      {boutiquePage==="commandes"&&<BoutiquePilotage
        rows={boutiqueRowsFiltered}
        allRows={boutiqueRows}
        stats={boutiqueStats}
        articles={getBoutique(tarifs)}
        search={boutiqueSearch}
        setSearch={setBoutiqueSearch}
        statut={boutiqueStatut}
        setStatut={setBoutiqueStatut}
        categorie={boutiqueCategorie}
        setCategorie={setBoutiqueCategorie}
        article={boutiqueArticle}
        setArticle={setBoutiqueArticle}
        categories={boutiqueCategories}
        onUpdate={updateAchatForEntry}
        onSelect={e=>{setSel(e);setNote(e.notes||"");}}
        onExport={()=>doExport("boutique")}
        exporting={exporting}
      />}
      {boutiquePage==="visualisation"&&<div>
        <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",marginBottom:12}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"center"}}>
            <select style={{...inp(),fontSize:13}} value={boutiqueVisualCat} onChange={e=>setBoutiqueVisualCat(e.target.value)}>
              <option value="toutes">Toutes catégories foot ({boutiqueVisualMembers.length})</option>
              {boutiqueVisualCats.map(c=><option key={c} value={c}>{c} ({boutiqueVisualMembers.filter(m=>(adminCatValue(m)||m.categorie||"Sans catégorie")===c).length})</option>)}
            </select>
            <button style={{...BS,fontSize:12,padding:"9px 12px"}} onClick={()=>exportBoutiqueVisual(boutiqueVisualMembers,"all")} disabled={!boutiqueVisualMembers.length}>Export all</button>
            <button style={{...BS,fontSize:12,padding:"9px 12px"}} onClick={()=>exportBoutiqueVisual(boutiqueVisualShown,boutiqueVisualCat==="toutes"?"filtre":boutiqueVisualCat)} disabled={!boutiqueVisualShown.length}>{boutiqueVisualCat==="toutes"?"Export affiché":"Export catégorie"}</button>
          </div>
          <div style={{fontSize:12,color:C.G,marginTop:8}}>{boutiqueVisualShown.length} membre(s) affiché(s). Cliquez sur une ligne pour voir les commandes hors dotation, statuts et reste à payer.</div>
        </div>
        <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,overflow:"hidden"}}>
          {boutiqueVisualShown.map(m=>{
            const achats=m.dossier.achatsBoutique||[];
            const aRegler=achats.filter(a=>(a.statut||"a_regler")==="a_regler").reduce((s,a)=>s+achatTotal(a),0);
            return <button key={`${m.dossierId}-${m.idx}`} onClick={()=>setMemberSel(m)} style={{width:"100%",border:"none",borderBottom:`1px solid ${C.Gc}`,background:C.W,padding:"10px 12px",display:"grid",gridTemplateColumns:m.photoBase64?"48px minmax(0,1.1fr) minmax(0,1.8fr) auto":"minmax(0,1.1fr) minmax(0,1.8fr) auto",gap:10,alignItems:"center",textAlign:"left",cursor:"pointer",fontFamily:FONT}}>
              {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:48,height:48,borderRadius:12,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
              <div>
                <div style={{fontWeight:950,fontSize:14,color:C.N}}>{m.prenom} {m.nom}</div>
                <div style={{fontSize:11,color:C.G}}>{adminCatValue(m)} · {structureType(m)}</div>
              </div>
              <div style={{fontSize:12,color:C.N,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                <strong>Hors dotation :</strong> {achats.length?achats.map(a=>`${a.nom} ${a.taille||""} (${STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l})`).join(" · "):"Aucune commande"}
              </div>
              <div style={{textAlign:"right",fontWeight:950,color:aRegler>0?"#ca8a04":C.V,fontSize:13}}>{aRegler>0?`${aRegler} € à payer`:"OK"}</div>
            </button>;
          })}
        </div>
      </div>}
    </div>}

    {/* TARIFS */}
    {tab==="tarifs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Configuration - Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Réglages du formulaire public, des tarifs, paiements, dotations et documents générés.</p>
      </div>
      <div style={{display:"flex",gap:6,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:4,marginBottom:14,overflowX:"auto"}}>
        {[
          {id:"saisons",l:"Saisons"},
          {id:"tarifs",l:"Tarifs"},
          {id:"remises",l:"Remises"},
          {id:"permanences",l:"Permanences"},
          {id:"planning",l:"Planning entraînements"},
          {id:"responsables",l:"Responsables catégories"},
          {id:"pieces",l:"Pièces"},
          {id:"qrCode",l:"QR code"},
          {id:"documentsPdf",l:"Documents PDF"},
          {id:"acces",l:"Securite & paiements"},
          {id:"dotations",l:"Dotations"},
          {id:"emails",l:"Emails"},
          {id:"attestation",l:"Attestation"}
        ].map(x=><button key={x.id} onClick={()=>setConfigTab(x.id)} style={{border:"none",borderRadius:9,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:configTab===x.id?C.J:C.W,color:configTab===x.id?C.N:C.G,whiteSpace:"nowrap",fontFamily:FONT}}>{x.l}</button>)}
      </div>
      {(!editTarifs||["permanences","planning","responsables","pieces","qrCode"].includes(configTab))?(
        <div>
          {configTab==="saisons"&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:18,padding:"16px",marginBottom:12,boxShadow:"0 10px 28px rgba(15,23,42,.05)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",marginBottom:14}}>
              <div>
                <p style={{fontWeight:950,fontSize:16,color:C.N,margin:"0 0 4px"}}>Gestion des saisons</p>
                <p style={{fontSize:12,color:C.G,margin:0,lineHeight:1.45}}>Le formulaire public ne propose aucun choix aux familles. Le bureau choisit ici quelle saison est publiée et quelle saison est consultée dans l'admin.</p>
              </div>
              <span style={{background:publicSaison===saison?"#dcfce7":"#fef3c7",color:publicSaison===saison?C.V:"#92400e",borderRadius:999,padding:"6px 10px",fontSize:11,fontWeight:950}}>
                {publicSaison===saison?"Même saison":"Saisons différentes"}
              </span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
              <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:16,padding:"12px"}}>
                <label style={{display:"block",fontSize:12,fontWeight:950,color:"#1d4ed8",marginBottom:7}}>Saison du formulaire public</label>
                <select value={publicSaison} onChange={e=>onPublicSaisonChange(e.target.value)} style={{...inp(),fontSize:14,fontWeight:900,borderColor:"#93c5fd"}}>
                  {saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <p style={{fontSize:11,color:"#1e40af",margin:"7px 0 0"}}>Les familles inscrivent uniquement cette saison.</p>
              </div>
              <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:16,padding:"12px"}}>
                <label style={{display:"block",fontSize:12,fontWeight:950,color:"#854d0e",marginBottom:7}}>Saison de travail admin</label>
                <select value={saison} onChange={e=>onSaisonChange(e.target.value)} style={{...inp(),fontSize:14,fontWeight:900,borderColor:C.Jd}}>
                  {saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <p style={{fontSize:11,color:"#92400e",margin:"7px 0 0"}}>Dossiers, base Footclubs, tarifs et exports consultés par le bureau.</p>
              </div>
            </div>
          </div>}
          {configTab==="tarifs"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {orderedTarifEntries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.Gb}`}}>
                <span style={{fontWeight:600,fontSize:13}}>{catLabel(cat)}</span>
                <span style={{fontWeight:900,fontSize:18,color:prix===0?C.V:C.J}}>{prix===0?"GRATUIT":prix+" €"}</span>
              </div>
            ))}
          </div>}
          {configTab==="remises"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Remises famille</p>
            <p style={{fontSize:11,color:C.G,margin:"0 0 8px"}}>20 € offerts sur la 2ème licence mineure et les suivantes dans la même famille.</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(getRemisesFamille(tarifs)).map(([rang,pct])=><span key={rang} style={{background:C.Gc,padding:"5px 10px",borderRadius:6,fontSize:12,fontWeight:600}}>{rang==="4"?"4ème et +":`${rang}ème membre`} : <strong style={{color:C.V}}>-{pct} €</strong></span>)}
            </div>
          </div>}
          {configTab==="permanences"&&<div>
            <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Permanences licence - Saison {saison}</p>
              <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces dates, horaires et messages s'affichent sur l'accueil, après l'envoi de la préinscription et sur le récap imprimable.</p>
            </div>
            {!editPerms?(
              <div>
                {getPermanences(tarifs).map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`,display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:C.N}}>Permanence {i+1}</div>
                    <div style={{fontSize:13,color:C.G,marginTop:2}}>{fmtPermanence(p)}</div>
                    {permanenceMessage(p)&&<div style={{fontSize:12,color:"#92400e",fontWeight:800,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"6px 8px",marginTop:6,maxWidth:680,whiteSpace:"pre-line"}}>{permanenceMessage(p)}</div>}
                  </div>
                  <span style={{background:C.Jp,color:"#713f12",border:`1px solid ${C.Jd}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700}}>visible public</span>
                </div>)}
                <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPerms(getPermanences(tarifs).map(p=>({...p})));setEditPerms(true);}}>Modifier les permanences</button>
              </div>
            ):(
              <div>
                {tmpPerms.map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                    <p style={{fontWeight:800,fontSize:13,margin:0}}>Permanence {i+1}</p>
                    {tmpPerms.length>1&&<button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPerms(p=>p.filter((_,j)=>j!==i))}>Supprimer</button>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1.2fr .8fr .8fr",gap:8,marginBottom:8}}>
                    <F label="Date"><input type="date" style={inp()} value={p.date||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,date:e.target.value}:x))}/></F>
                    <F label="Début"><input type="time" style={inp()} value={p.debut||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,debut:e.target.value}:x))}/></F>
                    <F label="Fin"><input type="time" style={inp()} value={p.fin||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,fin:e.target.value}:x))}/></F>
                  </div>
                  <F label="Lieu"><input style={inp()} value={p.lieu||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,lieu:e.target.value}:x))} placeholder="Ex: Stade du RSG, club-house"/></F>
                  <F label="Message public sous cette permanence"><textarea style={{...inp(),minHeight:76,resize:"vertical",lineHeight:1.4,paddingTop:10}} value={p.message||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,message:e.target.value}:x))} placeholder="Ex : pensez à apporter le règlement, les pièces demandées et votre référence de dossier."/></F>
                </div>)}
                <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPerms(p=>[...p,{date:"",debut:"",fin:"",lieu:"Stade du RSG",message:""}])}>+ Ajouter une permanence</button>
                <div style={{display:"flex",gap:8}}>
                  <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_permanences:tmpPerms});setEditPerms(false);}}>✓ Enregistrer</button>
                  <button style={{...BS,flex:1}} onClick={()=>setEditPerms(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>}
          {configTab==="planning"&&<div>
            <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Planning entraînements - Saison {saison}</p>
              <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ajoutez un ou plusieurs créneaux par catégorie. Ils s'affichent aux familles uniquement pour les catégories concernées.</p>
            </div>
            {!editPlanning?(
              <div>
                {getPlanningEntrainements(tarifs).length?getPlanningEntrainements(tarifs).map(c=><div key={c.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`,display:"grid",gridTemplateColumns:isMobile?"1fr":"220px 1fr",gap:8,alignItems:"center"}}>
                  <div style={{fontWeight:900,fontSize:14,color:C.N}}>{planningOptionLabel(c)}</div>
                  <div style={{fontSize:13,color:C.G}}>{creneauLabel(c)}</div>
                </div>):<div style={{background:C.W,borderRadius:10,padding:"14px",border:`1px solid ${C.Gb}`,fontSize:13,color:C.G}}>Aucun créneau configuré pour le moment.</div>}
                <button style={{...BP,width:"100%",marginTop:8}} onClick={()=>{setTmpPlanning(getPlanningEntrainements(tarifs).map(c=>({...c})));setEditPlanning(true);}}>Modifier le planning</button>
              </div>
            ):(
              <div>
                {tmpPlanning.map((c,i)=><div key={c.id||i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                    <p style={{fontWeight:800,fontSize:13,margin:0}}>Créneau {i+1}</p>
                    <button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPlanning(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.2fr .9fr .9fr .7fr .7fr 1.4fr",gap:8}}>
                    <F label="Catégorie"><select style={inp()} value={c.categorie||""} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,categorie:e.target.value,sexe:hasFeminineCategory(e.target.value)?(x.sexe||"Tous"):"Tous"}:x))}><option value="">— Choisir</option>{CATS.map(cat=><option key={cat.v} value={cat.v}>{cat.l}</option>)}</select></F>
                    <F label="Section"><select style={inp()} value={c.sexe||"Tous"} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,sexe:e.target.value}:x))}>{planningSectionOptions(c.categorie).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></F>
                    <F label="Jour"><select style={inp()} value={c.jour||"Mercredi"} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,jour:e.target.value}:x))}>{JOURS_ENTRAINEMENT.map(j=><option key={j}>{j}</option>)}</select></F>
                    <F label="Début"><input type="time" style={inp()} value={c.debut||""} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,debut:e.target.value}:x))}/></F>
                    <F label="Fin"><input type="time" style={inp()} value={c.fin||""} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,fin:e.target.value}:x))}/></F>
                    <F label="Lieu"><select style={inp()} value={c.lieu||""} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,lieu:e.target.value}:x))}>
                      <option value="">— Choisir un lieu</option>
                      {planningLieuOptions(c.lieu).map(lieu=><option key={lieu} value={lieu}>{lieu}</option>)}
                    </select></F>
                  </div>
                  <F label="Note facultative" span><input style={inp()} value={c.note||""} onChange={e=>setTmpPlanning(list=>list.map((x,j)=>j===i?{...x,note:e.target.value}:x))} placeholder="Ex: à confirmer, terrain synthétique..."/></F>
                </div>)}
                <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPlanning(list=>[...list,normalizeCreneauEntrainement({categorie:"",sexe:"Tous",jour:"Mercredi",debut:"",fin:"",lieu:""})])}>+ Ajouter un créneau</button>
                <div style={{display:"flex",gap:8}}>
                  <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_planningEntrainements:tmpPlanning.map(normalizeCreneauEntrainement).filter(c=>c.categorie)});setEditPlanning(false);}}>✓ Enregistrer</button>
                  <button style={{...BS,flex:1}} onClick={()=>setEditPlanning(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>}
          {configTab==="responsables"&&<div>
            <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Responsables catégories - Saison {saison}</p>
              <p style={{fontSize:13,color:C.V,margin:0}}>Renseignez un responsable par catégorie et section. Ces coordonnées s'affichent sous les créneaux d'entraînement concernés.</p>
            </div>
            {!editPlanningResponsables?(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8}}>
                  {planningResponsableOptions.map(opt=>{
                    const r=planningResponsableFor(tarifs,opt.categorie,opt.sexe);
                    return <div key={planningRespKey(opt.categorie,opt.sexe)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",marginBottom:5}}>
                        <div style={{fontSize:12,fontWeight:950,color:C.N}}>{opt.label}</div>
                        <button type="button" onClick={()=>removePlanningRespOption(opt)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:7,padding:"4px 7px",fontSize:10,fontWeight:900,cursor:"pointer",lineHeight:1}}>Supprimer</button>
                      </div>
                      <div style={{fontSize:13,color:planningContactLabel(r)?C.V:C.G,fontWeight:850}}>{planningContactLabel(r)||"Aucun responsable renseigné"}</div>
                    </div>;
                  })}
                </div>
                {planningResponsablesHiddenKeys.length>0&&<div style={{marginTop:10,background:"#fff7ed",border:"1px solid #fdba74",borderRadius:10,padding:"10px 12px"}}>
                  <div style={{fontSize:12,fontWeight:950,color:"#9a3412",marginBottom:6}}>Catégories supprimées de cet écran</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {planningResponsablesHiddenKeys.map(key=><span key={key} style={{background:C.W,border:"1px solid #fed7aa",borderRadius:999,padding:"5px 8px",fontSize:11,fontWeight:850,color:"#9a3412"}}>{planningResponsableLabelFromKey(key)}</span>)}
                  </div>
                </div>}
                <button style={{...BP,width:"100%",marginTop:10}} onClick={()=>{setTmpPlanningResponsables(getPlanningResponsables(tarifs));setTmpPlanningResponsablesHiddenKeys(getPlanningResponsablesHiddenKeys(tarifs));setEditPlanningResponsables(true);}}>Modifier les responsables</button>
              </div>
            ):(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8,marginBottom:10}}>
                  {tmpPlanningResponsableOptions.map(opt=>{
                    const r=getTmpPlanningResp(opt.categorie,opt.sexe);
                    return <div key={planningRespKey(opt.categorie,opt.sexe)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:950,color:C.N}}>{opt.label}</div>
                        <button type="button" onClick={()=>removeTmpPlanningRespOption(opt)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:7,padding:"4px 7px",fontSize:10,fontWeight:900,cursor:"pointer",lineHeight:1}}>Supprimer</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                        <input style={{...inp(),fontSize:12,minHeight:38,padding:"8px 10px"}} value={r.prenom||""} onChange={e=>setTmpPlanningResp(opt.categorie,opt.sexe,{prenom:e.target.value})} placeholder="Prénom"/>
                        <input style={{...inp(),fontSize:12,minHeight:38,padding:"8px 10px"}} value={r.nom||""} onChange={e=>setTmpPlanningResp(opt.categorie,opt.sexe,{nom:e.target.value})} placeholder="Nom"/>
                      </div>
                      <input style={{...inp(),fontSize:12,minHeight:38,padding:"8px 10px",marginTop:6}} value={r.tel||""} onChange={e=>setTmpPlanningResp(opt.categorie,opt.sexe,{tel:e.target.value})} placeholder="Téléphone"/>
                    </div>;
                  })}
                </div>
                {tmpPlanningResponsablesHiddenKeys.length>0&&<div style={{background:"#fff7ed",border:"1px solid #fdba74",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:950,color:"#9a3412",marginBottom:6}}>Catégories supprimées</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {tmpPlanningResponsablesHiddenKeys.map(key=><button key={key} type="button" onClick={()=>restoreTmpPlanningRespKey(key)} style={{background:C.W,border:"1px solid #fed7aa",borderRadius:999,padding:"6px 9px",fontSize:11,fontWeight:850,color:"#9a3412",cursor:"pointer"}}>{planningResponsableLabelFromKey(key)} · réafficher</button>)}
                  </div>
                </div>}
                <div style={{display:"flex",gap:8}}>
                  <button style={{...BP,flex:1}} onClick={async()=>{const hidden=[...new Set(tmpPlanningResponsablesHiddenKeys.map(normalizePlanningRespKeyValue))];await onTarifsChange({...tarifs,_planningResponsables:tmpPlanningResponsables.map(normalizePlanningResponsable).filter(r=>r.categorie&&(r.nom||r.prenom||r.tel)&&!hidden.includes(planningRespKey(r.categorie,r.sexe))),_planningResponsablesHiddenKeys:hidden});setEditPlanningResponsables(false);}}>✓ Enregistrer</button>
                  <button style={{...BS,flex:1}} onClick={()=>setEditPlanningResponsables(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>}
          {configTab==="pieces"&&<div>
            <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
              <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Pièces à fournir - Saison {saison}</p>
              <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces libellés s'affichent uniquement à la fin de la préinscription et sur le récap imprimable.</p>
            </div>
            {!editPieces?(
              <div>
                {getPieces(tarifs).map((p,i)=><div key={p.id||i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`}}>
                  <div style={{fontWeight:800,fontSize:14,color:C.N}}>{p.label}</div>
                  <div style={{fontSize:12,color:C.G,marginTop:3}}>Condition : {p.condition==="certif"?"si certificat requis":p.condition==="famille"?"si inscription famille":p.condition==="etranger"?"si nationalité étrangère":"toujours"}</div>
                </div>)}
                <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPieces(getPieces(tarifs).map(p=>({...p})));setEditPieces(true);}}>Modifier les pièces à fournir</button>
              </div>
            ):(
              <div>
                {tmpPieces.map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
                    <p style={{fontWeight:800,fontSize:13,margin:0}}>Pièce {i+1}</p>
                    {tmpPieces.length>1&&<button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPieces(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>}
                  </div>
                  <F label="Libellé"><input style={inp()} value={p.label||""} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/></F>
                  <F label="Condition d'affichage"><select style={inp()} value={p.condition||"always"} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,condition:e.target.value}:x))}>
                    <option value="always">Toujours</option>
                    <option value="certif">Si certificat médical requis</option>
                    <option value="famille">Si inscription famille</option>
                    <option value="etranger">Si nationalité étrangère</option>
                  </select></F>
                </div>)}
                <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPieces(list=>[...list,{id:`piece_${Date.now()}`,label:"Nouvelle pièce",condition:"always"}])}>+ Ajouter une pièce</button>
                <div style={{display:"flex",gap:8}}>
                  <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_pieces:tmpPieces});setEditPieces(false);}}>✓ Enregistrer</button>
                  <button style={{...BS,flex:1}} onClick={()=>setEditPieces(false)}>Annuler</button>
                </div>
              </div>
            )}
          </div>}
          {configTab==="qrCode"&&<QrCodeConfigPanel compact={isMobile}/>}
          {configTab==="acces"&&<>
          <AdminPasswordPanel saison={saison}/>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Accès bureau sécurisé</p>
            <p style={{fontSize:12,color:C.G,margin:0,lineHeight:1.5}}>Le mot de passe n'est jamais affiché dans l'application. Il est vérifié côté serveur et stocké sous forme protégée.</p>
          </div>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Modes de paiement proposés</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{getModesPaiement(tarifs).map(m=><span key={m.id} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 9px",fontSize:12,fontWeight:800}}>{m.l}{m.fractionnable?" · fractionnable":""}</span>)}</div>
          </div>
          </>}
          {configTab==="attestation"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Template complet attestation licence</p>
            <p style={{fontSize:12,color:C.G,margin:0}}>Le modèle HTML complet est modifiable : en-tête, texte, encadré, signature et variables.</p>
          </div>}
          {configTab==="emails"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Email automatique de confirmation</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px",lineHeight:1.45}}>Envoyé automatiquement à la création d'une préinscription, si l'adresse Gmail de l'application est configurée côté Firebase.</p>
            <div style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px 12px",fontSize:12,lineHeight:1.5}}>
              <strong>Objet :</strong> {getConfirmationEmailSubject(tarifs)}
              <div style={{marginTop:8}} dangerouslySetInnerHTML={{__html:renderTpl(getConfirmationEmailTemplate(tarifs),{...F0,prenom:"Florian",nom:"FIGUREAU",categorie:"Senior",saison,id:"RSG-CMOIPN4",prixFinal:140,certifNeeded:true},tarifs)}}/>
            </div>
          </div>}
          {configTab==="documentsPdf"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Documents PDF publics</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px",lineHeight:1.45}}>Ces liens sont utilisés dans le formulaire public pour le certificat médical, la charte RSG et le guide d'inscription.</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:8}}>
              <a href={getCertificatPdfUrl(tarifs)} target="_blank" rel="noreferrer" style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px 12px",fontSize:13,fontWeight:900,color:C.N,textDecoration:"none"}}>Ouvrir le certificat médical</a>
              <a href={getChartePdfUrl(tarifs)} target="_blank" rel="noreferrer" style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px 12px",fontSize:13,fontWeight:900,color:C.N,textDecoration:"none"}}>Ouvrir la charte RSG</a>
              <a href={getGuideInscriptionPdfUrl(tarifs)} target="_blank" rel="noreferrer" style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px 12px",fontSize:13,fontWeight:900,color:C.N,textDecoration:"none"}}>Ouvrir le guide d'inscription</a>
            </div>
          </div>}
          {configTab==="dotations"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Dotations equipement incluses avec la licence</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:8}}>
              {DOTATION_CATS.map(c=><div key={c.v} style={{background:C.Gc,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontWeight:900,fontSize:12,color:C.N}}>{c.l}</div>
                <div style={{fontSize:11,color:C.G,marginTop:3}}>{getDotationCat(tarifs,c.v).map(i=>i.label).join(" · ")||"Aucune dotation"}</div>
                {getDotationRuleNote(c.v)&&<div style={{fontSize:10.5,color:"#92400e",fontWeight:850,marginTop:5,lineHeight:1.3,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:7,padding:"5px 7px"}}>{getDotationRuleNote(c.v)}</div>}
              </div>)}
            </div>
          </div>}
          {!["saisons","permanences","planning","responsables","pieces","qrCode"].includes(configTab)&&<button style={{...BP,width:"100%"}} onClick={()=>{setTmpTarifs({...tarifs,_remises:getRemisesFamille(tarifs),_dotations:getDotations(tarifs),_modesPaiement:getModesPaiement(tarifs)});setEditTarifs(true);}}>Modifier la configuration</button>}
        </div>
      ):(
        <div>
          {configTab==="saisons"&&<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:18,padding:"16px",marginBottom:12}}>
            <p style={{fontWeight:950,fontSize:16,color:C.N,margin:"0 0 8px"}}>Gestion des saisons</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 12px"}}>Ces réglages sont enregistrés directement. Aucun bouton Enregistrer n'est nécessaire ici.</p>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
              <F label="Saison du formulaire public"><select value={publicSaison} onChange={e=>onPublicSaisonChange(e.target.value)} style={inp()}>{saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></F>
              <F label="Saison de travail admin"><select value={saison} onChange={e=>onSaisonChange(e.target.value)} style={inp()}>{saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></F>
            </div>
          </div>}
          {configTab==="tarifs"&&<>
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>💰 Tarifs par catégorie</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {orderedTarifEntries(tmpTarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{catLabel(cat)}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={prix} onChange={e=>setTmpTarifs(p=>({...p,[cat]:parseInt(e.target.value)||0}))} min={0} max={999}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>€</span>
                </div>
              </div>
            ))}
          </div>
          </>}
          {configTab==="remises"&&<>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Remises famille (€ à partir du nième membre mineur)</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[2,3,4].map(rang=>(
              <div key={rang} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{rang===4?"4e et +":rang+"ème"}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={tmpTarifs._remises?.[rang]||0} onChange={e=>setTmpTarifs(p=>({...p,_remises:{...(p._remises||{}),[rang]:Math.max(0,Math.min(999,parseInt(e.target.value)||0))}}))} min={0} max={999}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>€</span>
                </div>
              </div>
            ))}
          </div>
          </>}
          {configTab==="dotations"&&<>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Dotations par categorie (comprises avec la licence)</p>
          <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10}}>
              <div>
                <p style={{fontWeight:950,fontSize:13,margin:"0 0 3px",color:C.N}}>Produits disponibles en dotation</p>
                <p style={{fontSize:11,color:C.G,margin:0,lineHeight:1.35}}>Ces produits sont les seuls proposés dans les catégories ci-dessous. Pas de commande boutique hors dotation.</p>
              </div>
              <button type="button" style={{...BS,fontSize:12,padding:"8px 12px"}} onClick={addTmpDotationProduct}>+ Ajouter un produit</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:8}}>
              {dotationProducts.map(article=><div key={article.id} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"9px 10px"}}>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"start"}}>
                  <input style={{...inp(),fontSize:12,minHeight:36,padding:"7px 9px",fontWeight:900}} value={article.nom||""} onChange={e=>upsertTmpDotationProduct(article,{nom:e.target.value})} placeholder="Nom du produit"/>
                  <button type="button" onClick={()=>removeTmpDotationProduct(article)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:7,padding:"7px 8px",fontSize:11,fontWeight:900,cursor:"pointer"}}>Suppr.</button>
                </div>
                <input style={{...inp(),fontSize:11,minHeight:34,padding:"7px 9px",marginTop:6}} value={(article.tailles||[]).join(", ")} onChange={e=>upsertTmpDotationProduct(article,{tailles:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)})} placeholder="Tailles/options séparées par virgules"/>
              </div>)}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:10,marginBottom:14}}>
            {DOTATION_CATS.map(c=>{
              const dot=sanitizeDotationForCat(c.v,(tmpTarifs._dotations||getDotations(tmpTarifs))[c.v]||[]);
              const boutiqueProducts=dotationProducts.filter(article=>!(c.v==="U11"&&dotationFieldForArticle(article)==="tailleSweat"));
              const setDot=next=>setTmpTarifs(p=>({...p,_dotations:{...(p._dotations||getDotations(p)),[c.v]:sanitizeDotationForCat(c.v,next)}}));
              const isChecked=article=>dot.some(item=>item.actif!==false&&dotationProductMatches(item,article));
              const toggleProduct=(article,checked)=>{
                const next=dot.filter(item=>!dotationProductMatches(item,article));
                setDot(checked?[...next,dotationItemFromArticle(article,c.v)]:next);
              };
              return <div key={c.v} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontWeight:900,fontSize:13,marginBottom:8,color:C.N}}>{c.l}</div>
                {getDotationRuleNote(c.v)&&<div style={{fontSize:11,color:"#92400e",fontWeight:850,margin:"0 0 8px",lineHeight:1.35,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"7px 8px"}}>{getDotationRuleNote(c.v)}</div>}
                <div style={{display:"grid",gap:7}}>
                  {boutiqueProducts.map(article=>{
                    const checked=isChecked(article);
                    return <label key={article.id} style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:8,alignItems:"start",background:checked?C.Jp:C.Gc,border:`1px solid ${checked?C.Jd:C.Gb}`,borderRadius:10,padding:"8px 9px",cursor:"pointer"}}>
                      <input type="checkbox" checked={checked} onChange={e=>toggleProduct(article,e.target.checked)} style={{accentColor:C.J,marginTop:3}}/>
                      <span style={{minWidth:0}}>
                        <span style={{display:"block",fontSize:12,fontWeight:900,color:C.N}}>{article.nom}</span>
                        <span style={{display:"block",fontSize:10.5,fontWeight:750,color:C.G,marginTop:2,lineHeight:1.25}}>{article.categorie||"Sans catégorie"}{article.tailles?.length?` · ${article.tailles.join(", ")}`:" · Sans taille"}</span>
                      </span>
                    </label>;
                  })}
                </div>
              </div>;
            })}
          </div>
          </>}
          {configTab==="documentsPdf"&&<>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Documents PDF publics</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:10,marginBottom:14}}>
            <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px 14px"}}>
              <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px",color:C.N}}>Certificat médical</p>
              <F label="URL du PDF"><input style={inp()} value={tmpTarifs._certificatMedicalPdfUrl||""} onChange={e=>setTmpTarifs(p=>({...p,_certificatMedicalPdfUrl:e.target.value,_certificatMedicalPdfDataUrl:e.target.value?p._certificatMedicalPdfDataUrl:""}))} placeholder="https://.../certificat.pdf"/></F>
              <input type="file" accept="application/pdf,.pdf" onChange={e=>{importPdfIntoTmpTarifs(e.target.files?.[0],"_certificatMedicalPdfDataUrl");e.target.value="";}} style={{fontSize:12}}/>
              <p style={{fontSize:11,color:C.G,margin:"8px 0 0",lineHeight:1.4}}>Import direct possible uniquement pour les petits PDF. Sinon, collez une URL.</p>
              <a href={getCertificatPdfUrl(tmpTarifs)} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:12,fontWeight:900,color:"#0369a1"}}>Tester le lien</a>
            </div>
            <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px 14px"}}>
              <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px",color:C.N}}>Charte RSG</p>
              <F label="URL du PDF"><input style={inp()} value={tmpTarifs._chartePdfUrl||""} onChange={e=>setTmpTarifs(p=>({...p,_chartePdfUrl:e.target.value,_chartePdfDataUrl:e.target.value?p._chartePdfDataUrl:""}))} placeholder="https://.../charte.pdf"/></F>
              <input type="file" accept="application/pdf,.pdf" onChange={e=>{importPdfIntoTmpTarifs(e.target.files?.[0],"_chartePdfDataUrl");e.target.value="";}} style={{fontSize:12}}/>
              <p style={{fontSize:11,color:C.G,margin:"8px 0 0",lineHeight:1.4}}>La charte est souvent trop lourde pour Firestore : une URL hébergée est préférable.</p>
              <a href={getChartePdfUrl(tmpTarifs)} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:12,fontWeight:900,color:"#0369a1"}}>Tester le lien</a>
            </div>
            <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px 14px"}}>
              <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px",color:C.N}}>Guide d'inscription</p>
              <F label="URL du PDF"><input style={inp()} value={tmpTarifs._guideInscriptionPdfUrl||""} onChange={e=>setTmpTarifs(p=>({...p,_guideInscriptionPdfUrl:e.target.value,_guideInscriptionPdfDataUrl:e.target.value?p._guideInscriptionPdfDataUrl:""}))} placeholder="https://.../guide-inscription.pdf"/></F>
              <input type="file" accept="application/pdf,.pdf" onChange={e=>{importPdfIntoTmpTarifs(e.target.files?.[0],"_guideInscriptionPdfDataUrl");e.target.value="";}} style={{fontSize:12}}/>
              <p style={{fontSize:11,color:C.G,margin:"8px 0 0",lineHeight:1.4}}>Pour un guide avec photos, une URL hébergée est préférable si le PDF dépasse la limite d'import.</p>
              <a href={getGuideInscriptionPdfUrl(tmpTarifs)} target="_blank" rel="noreferrer" style={{display:"inline-block",marginTop:8,fontSize:12,fontWeight:900,color:"#0369a1"}}>Tester le lien</a>
            </div>
          </div>
          </>}
          {configTab==="acces"&&<>
          <AdminPasswordPanel saison={saison}/>
          <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
            <p style={{fontWeight:900,fontSize:13,color:C.V,margin:"0 0 5px"}}>Mot de passe bureau protégé</p>
            <p style={{fontSize:12,color:C.G,margin:0,lineHeight:1.5}}>Le code d'accès se change ci-dessus. Le secret Firebase reste uniquement une solution d'initialisation ou de reset technique.</p>
          </div>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Modes de paiement visibles sur le formulaire</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:8,marginBottom:12}}>
            {getModesPaiement(tmpTarifs).map((m,i)=><div key={`${m.id}-${i}`} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px"}}>
              <F label="Nom affiché"><input style={inp()} value={m.l} onChange={e=>setTmpTarifs(p=>{const list=getModesPaiement(p).map((x,j)=>j===i?{...x,l:e.target.value}:x);return{...p,_modesPaiement:list};})}/></F>
              <Chk checked={m.fractionnable} onChange={v=>setTmpTarifs(p=>{const list=getModesPaiement(p).map((x,j)=>j===i?{...x,fractionnable:v}:x);return{...p,_modesPaiement:list};})} label="Possibilité de paiement en plusieurs fois"/>
              <button style={{...BS,width:"100%",fontSize:12,padding:"7px 10px",marginTop:6,background:"#fee2e2",color:C.R}} onClick={()=>setTmpTarifs(p=>({...p,_modesPaiement:getModesPaiement(p).filter((_,j)=>j!==i)}))}>Supprimer</button>
            </div>)}
          </div>
          <button style={{...BS,width:"100%",marginBottom:12}} onClick={()=>setTmpTarifs(p=>({...p,_modesPaiement:[...getModesPaiement(p),{id:`mode_${Date.now()}`,l:"Nouveau mode",fractionnable:false,lieu:"En permanence licence",actif:true}]}))}>+ Ajouter un mode de paiement</button>
          </>}
          {configTab==="emails"&&<>
          <ConfigTemplateEditor
            compact={isMobile}
            subjectValue={getConfirmationEmailSubject(configEditorTarifs)}
            onSubjectChange={value=>setTmpTarifs(p=>({...p,_confirmationEmailSubject:value}))}
            bodyValue={getConfirmationEmailTemplate(configEditorTarifs)}
            onBodyChange={value=>setTmpTarifs(p=>({...p,_confirmationEmailTemplate:value}))}
            variables={["{prenom}","{nom}","{dateNaissance}","{saison}","{categorie}","{reference}","{montant}","{modePaiement}","{documents}","{permanences}"]}
            toolbarLabel="Éditeur email confirmation"
            bodyLabel="Message confirmation préinscription"
            renderedSubject={renderTpl(getConfirmationEmailSubject(configEditorTarifs),configPreviewEntry,configEditorTarifs)}
            previewHtml={renderTpl(getConfirmationEmailTemplate(configEditorTarifs),configPreviewEntry,configEditorTarifs)}
            previewHint="Exemple : mail de confirmation envoyé après préinscription"
            help="Variables disponibles dans la barre de l'éditeur. L'onglet Texte permet de modifier le HTML brut si nécessaire."
          />
          </>}
          {configTab==="attestation"&&<>
          <ConfigTemplateEditor
            compact={isMobile}
            bodyValue={getAttestationTemplate(configEditorTarifs)}
            onBodyChange={value=>setTmpTarifs(p=>({...p,_attestationTemplate:value}))}
            variables={["{prenom}","{nom}","{dateNaissance}","{saison}","{categorie}","{reference}","{montant}","{datePaiement}","{dateJour}","{modePaiement}","{logoUrl}","{signatureUrl}"]}
            toolbarLabel="Éditeur attestation"
            bodyLabel="Template complet attestation licence"
            previewLabel="Aperçu attestation"
            previewHint="Exemple : rendu proche du PDF généré"
            previewHtml={renderTpl(getAttestationTemplate(configEditorTarifs),configPreviewEntry,configEditorTarifs)}
            attestationPreview
            help="L'onglet Texte permet de modifier le HTML complet si nécessaire. Les classes existantes restent utilisables : box, meta, sig, head, logo, signature."
          />
          </>}
          {configTab!=="saisons"&&<div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange(tmpTarifs);setEditTarifs(false);}}>✓ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditTarifs(false)}>Annuler</button>
          </div>}
        </div>
      )}
    </div>}

    {/* FOOTCLUBS */}
    {tab==="footclubs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontWeight:900,fontSize:15,color:C.N,margin:"0 0 8px"}}>Suivi Footclubs des licences réglées</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.6}}>Liste uniquement les licences dont le dossier est <strong>Validé/payé</strong>. Le statut Footclubs ci-dessous est indépendant du statut de paiement.</p>
      </div>
      <button style={{...BP,marginBottom:12,width:"100%",fontSize:14}} onClick={()=>window.open("https://footclubs.fff.fr","_blank")}>Ouvrir Footclubs →</button>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 14px",marginBottom:12,boxShadow:"0 8px 20px rgba(15,23,42,.04)"}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(260px,1.4fr) repeat(3,minmax(150px,.7fr)) auto",gap:8,alignItems:"end"}}>
          <F label="Recherche"><input style={{...inp(),fontSize:13}} value={footclubsSearch} onChange={e=>setFootclubsSearch(e.target.value)} placeholder="Nom, prénom, email, n° licence, famille..."/></F>
          <F label="Statut Footclubs"><select style={{...inp(),fontSize:13}} value={footclubsStatus} onChange={e=>setFootclubsStatus(e.target.value)}>
            <option value="tous">Tous statuts</option>
            {STATUT_FOOTCLUBS_ORDER.map(k=><option key={k} value={k}>{STATUTS_FOOTCLUBS[k].l}</option>)}
          </select></F>
          <F label="Catégorie"><select style={{...inp(),fontSize:13}} value={footclubsCat} onChange={e=>setFootclubsCat(e.target.value)}>
            <option value="toutes">Toutes catégories</option>
            {footclubsCats.map(c=><option key={c} value={c}>{catLabel(c)}</option>)}
          </select></F>
          <F label="Type"><select style={{...inp(),fontSize:13}} value={footclubsType} onChange={e=>setFootclubsType(e.target.value)}>
            <option value="tous">Tous types</option>
            <option value="renouvellement">Renouvellements</option>
            <option value="nouvelle">Nouvelles licences</option>
          </select></F>
          <button style={{...BS,fontSize:12,padding:"9px 12px",minHeight:44,boxShadow:"none"}} onClick={()=>{setFootclubsSearch("");setFootclubsStatus("tous");setFootclubsCat("toutes");setFootclubsType("tous");}}>Réinitialiser</button>
        </div>
        <p style={{fontSize:12,color:C.G,margin:"6px 0 0"}}>{footclubsShown.length} licence(s) affichée(s) sur {licencesReglees.length} réglée(s).</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:12}}>
        {footclubsCounts.map(s=><button key={s.k} onClick={()=>setFootclubsStatus(footclubsStatus===s.k?"tous":s.k)} style={{background:s.bg,border:`2px solid ${footclubsStatus===s.k?s.c:`${s.c}44`}`,borderRadius:14,padding:"10px 12px",textAlign:"left",cursor:"pointer",fontFamily:FONT}}>
          <div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.count}</div>
          <div style={{fontSize:12,fontWeight:900,color:s.c}}>{s.l}</div>
        </button>)}
      </div>
      {licencesReglees.length===0&&<p style={{textAlign:"center",color:C.G,padding:28,fontStyle:"italic",background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`}}>Aucune licence réglée/validée à intégrer dans Footclubs.</p>}
      {licencesReglees.length>0&&footclubsShown.length===0&&<p style={{textAlign:"center",color:C.G,padding:22,fontStyle:"italic",background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`}}>Aucune licence ne correspond aux filtres.</p>}
      {footclubsShown.map(m=>{
        const email=getEmailContact(m.dossier);
        const stKey=m.footclubsStatut||"a_integrer";
        const st=STATUTS_FOOTCLUBS[stKey]||STATUTS_FOOTCLUBS.a_integrer;
        const rows=footclubsRows(m);
        return <div key={`${m.dossierId}-${m.idx}`} onClick={()=>{setSel(m.dossier);setNote(m.dossier.notes||"");}} style={{background:C.W,borderRadius:14,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`,borderLeft:`5px solid ${st.c}`,cursor:"pointer"}}>
        <div style={{display:"grid",gridTemplateColumns:m.photoBase64?"44px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:10,alignItems:"center",marginBottom:10}}>
          {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:44,height:44,objectFit:"cover",borderRadius:10,border:`1px solid ${C.Gb}`}}/>}
          <div style={{minWidth:0}}>
            <div style={{fontWeight:900,fontSize:14,color:C.N}}>{m.prenom} {m.nom}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:5}}>
              <span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:900}}>{m.categorie}</span>
              {m.poste&&<span style={{background:C.Gc,color:C.G,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:800}}>{m.poste}</span>}
              <span style={{background:STATUTS[m.statut]?.bg,color:STATUTS[m.statut]?.c,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:800}}>Licence réglée</span>
              {m.idx>0&&<span style={{background:"#f0f9ff",color:"#0369a1",padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:800}}>Famille : {m.dossier.prenom} {m.dossier.nom}</span>}
            </div>
          </div>
          <select value={stKey} onClick={e=>e.stopPropagation()} onChange={e=>updateFootclubsMember(m,{footclubsStatut:e.target.value})} style={{...inp(),width:210,fontSize:12,fontWeight:900,borderColor:st.c,color:st.c,background:st.bg}}>
            {STATUT_FOOTCLUBS_ORDER.map(k=><option key={k} value={k}>{STATUTS_FOOTCLUBS[k].l}</option>)}
          </select>
        </div>
        <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
          <div><p style={{fontSize:10,color:"#0369a1",margin:0,fontWeight:800}}>EMAIL FOOTCLUBS</p><p style={{fontSize:13,fontWeight:700,color:C.N,margin:0}}>{email||"—"}</p></div>
          <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:8,padding:"7px 11px",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0}} onClick={ev=>{ev.stopPropagation();email&&navigator.clipboard.writeText(email);}}>Copier</button>
        </div>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"10px 10px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:8}}>
            <p style={{fontSize:11,color:"#9a3412",fontWeight:950,textTransform:"uppercase",margin:0}}>Infos prêtes à copier dans Footclubs</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button style={{...BS,fontSize:11,padding:"6px 9px",minHeight:0}} onClick={()=>copyText(footclubsText(m))}>Copier tout</button>
              {m.photoBase64&&<button style={{...BS,fontSize:11,padding:"6px 9px",minHeight:0}} onClick={()=>downloadDataUrl(m.photoBase64,`photo_${m.nom}_${m.prenom}_${m.dossierId}`)}>Télécharger photo</button>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:6}}>
            {rows.filter(([k,v])=>["N° licence","N° personne"].includes(k)||String(v||"").trim()).slice(0,18).map(([k,v])=><button key={k} title="Cliquer pour copier" onClick={()=>v&&copyText(v)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px",textAlign:"left",cursor:v?"copy":"default",fontFamily:FONT}}>
              <span style={{display:"block",fontSize:10,color:C.G,fontWeight:800,textTransform:"uppercase",marginBottom:2}}>{k}</span>
              <span style={{display:"block",fontSize:12,color:v?C.N:C.G,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v||"à compléter"}</span>
            </button>)}
          </div>
        </div>
        <div style={{fontSize:12,color:C.G,marginBottom:8,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span>Né(e) : {fmtD(m.dateNaissance)}</span>
          <span style={{color:m.certifNeeded?C.R:C.V,fontWeight:700}}>{m.certifNeeded?"Certif requis":"Certif OK"}</span>
          <span style={{color:C.J,fontWeight:800}}>{m.prix||0} €</span>
        </div>
        <F label="Commentaire Footclubs / pièce manquante / blocage" span>
          <textarea onClick={e=>e.stopPropagation()} style={{...inp(),height:62,resize:"vertical",fontSize:13}} value={m.footclubsCommentaire||""} onChange={e=>updateFootclubsMember(m,{footclubsCommentaire:e.target.value})} placeholder="Ex : photo floue, certificat à compléter, attente validation FFF, mutation à vérifier..."/>
        </F>
      </div>;})}
    </div>}

    {/* BASE LICENCIÉS */}
    {tab==="base"&&<BaseLicencies saison={saison} licencies={licencies} onSave={async lic=>{await onLicenciesChange(lic);}}/>}
    </div>
    </div>
    {sel&&<DetailModal onClose={()=>setSel(null)}>
      <DetailPanel e={sel} note={note} setNote={setNote} onUpd={upd} onDel={del} onChangeStatut={(id,st)=>upd(id,dossierStatusPatch(st,sel||data.find(e=>e.id===id)||{}))} tarifs={tarifs} licencies={licencies} allEntries={data} onAttachIndividualMembers={attachIndividualMembers} onClose={()=>setSel(null)} onSendAttestation={sendAttestationEmail}/>
    </DetailModal>}
    {memberSel&&<DetailModal onClose={()=>setMemberSel(null)}>
      <MemberDetailPanel m={memberSel} tarifs={tarifs} onOpenDossier={()=>{setSel(memberSel.dossier);setNote(memberSel.dossier.notes||"");setMemberSel(null);}}/>
    </DetailModal>}
    {planningDraft&&<DetailModal onClose={()=>setPlanningDraft(null)}>
      <div style={{background:C.W,borderRadius:18,padding:18,border:`2px solid ${C.J}`,boxShadow:"0 18px 50px rgba(15,23,42,.18)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:14}}>
          <div>
            <h2 style={{margin:"0 0 4px",fontSize:20,color:C.N,fontWeight:950}}>{getPlanningEntrainements(tarifs).some(c=>c.id===planningDraft.id)?"Modifier le créneau":"Créer un créneau"}</h2>
            <p style={{fontSize:12,color:C.G,margin:0}}>Le créneau sera sauvegardé dans la configuration du planning entraînements.</p>
          </div>
          {getPlanningEntrainements(tarifs).some(c=>c.id===planningDraft.id)&&<button style={{background:"#fee2e2",color:C.R,border:"1px solid #fca5a5",borderRadius:10,padding:"8px 10px",fontSize:12,fontWeight:900,cursor:"pointer"}} onClick={()=>deletePlanningDraft(planningDraft)}><Icon as={Trash2} size={14}/>Supprimer</button>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.2fr .9fr .9fr .7fr .7fr 1.4fr",gap:8}}>
          <F label="Catégorie">
            <select style={inp()} value={planningDraft.categorie||""} onChange={e=>setPlanningDraft(p=>({...p,categorie:e.target.value,sexe:hasFeminineCategory(e.target.value)?(p.sexe||"Tous"):"Tous"}))}>
              <option value="">— Choisir</option>
              {CATS.map(cat=><option key={cat.v} value={cat.v}>{cat.l}</option>)}
            </select>
          </F>
          <F label="Section">
            <select style={inp()} value={planningDraft.sexe||"Tous"} onChange={e=>setPlanningDraft(p=>({...p,sexe:e.target.value}))}>
              {planningSectionOptions(planningDraft.categorie).map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </F>
          <F label="Jour">
            <select style={inp()} value={planningDraft.jour||"Mercredi"} onChange={e=>setPlanningDraft(p=>({...p,jour:e.target.value}))}>
              {JOURS_ENTRAINEMENT.map(j=><option key={j}>{j}</option>)}
            </select>
          </F>
          <F label="Début"><input type="time" style={inp()} value={planningDraft.debut||""} onChange={e=>setPlanningDraft(p=>({...p,debut:e.target.value,fin:p.fin||addTrainingMinutes(e.target.value,90)}))}/></F>
          <F label="Fin"><input type="time" style={inp()} value={planningDraft.fin||""} onChange={e=>setPlanningDraft(p=>({...p,fin:e.target.value}))}/></F>
          <F label="Lieu">
            <select style={inp()} value={planningDraft.lieu||""} onChange={e=>setPlanningDraft(p=>({...p,lieu:e.target.value}))}>
              <option value="">— Choisir un lieu</option>
              {planningLieuOptions(planningDraft.lieu).map(lieu=><option key={lieu} value={lieu}>{lieu}</option>)}
            </select>
          </F>
        </div>
        <F label="Note facultative" span>
          <input style={inp()} value={planningDraft.note||""} onChange={e=>setPlanningDraft(p=>({...p,note:e.target.value}))} placeholder="Ex : terrain synthétique, à confirmer..."/>
        </F>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:8,marginTop:6}}>
          <button style={{...BS,width:"100%"}} onClick={()=>setPlanningDraft(null)}>Annuler</button>
          <button style={{...BP,width:"100%"}} onClick={()=>savePlanningDraft(planningDraft)}><Icon as={Check} size={16}/>Enregistrer le créneau</button>
        </div>
      </div>
    </DetailModal>}
    {createMemberOpen&&<DetailModal onClose={()=>setCreateMemberOpen(false)}>
      <AdminStandaloneMemberForm saison={saison} tarifs={tarifs} licencies={licencies} onCreate={createStandaloneMember} onCancel={()=>setCreateMemberOpen(false)}/>
    </DetailModal>}
  </div>;
}

function AdminStandaloneMemberForm({saison,tarifs,licencies=[],onCreate,onCancel}){
  const [f,setF]=useState(()=>emptyAdminStandaloneMember(saison));
  const [errs,setErrs]=useState({});
  const [saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const age=calcAge(f.dateNaissance);
  const isMajeur=age===null?true:age>=18;
  const licDetect=lookupLic(licencies,f.nom||"",f.prenom||"",f.numLicenceFFF||f.numPersonne||"");
  const applyLic=lic=>{
    if(!lic)return;
    const dn=getLicValue(lic,"dn","dateNaissance");
    const cat=catFromLic(lic)||suggestCat(dn,saison);
    setF(p=>({
      ...p,
      typeLicence:"renouvellement",
      numLicenceFFF:getLicValue(lic,"l","numLicence","numLicenceFFF")||p.numLicenceFFF,
      numPersonne:licNumPersonne(lic)||p.numPersonne,
      nom:(getLicValue(lic,"n","nom")||p.nom||"").toUpperCase(),
      prenom:getLicValue(lic,"p","prenom")||p.prenom,
      dateNaissance:dn||p.dateNaissance,
      sexe:normalizeSexe(getLicValue(lic,"s","sexe"))||p.sexe,
      lieuNaissance:getLicValue(lic,"ln","lieuNaissance")||p.lieuNaissance,
      nationalite:(getLicValue(lic,"nat","nationalite")==="F"?"Française":getLicValue(lic,"nat","nationalite"))||p.nationalite,
      adresse:getLicValue(lic,"adr","adresse")||p.adresse,
      codePostal:getLicValue(lic,"cp","codePostal")||p.codePostal,
      ville:getLicValue(lic,"ville")||p.ville,
      categorie:cat||p.categorie,
      contactEmail:getLicValue(lic,"em","email")||p.contactEmail,
      contactTel:getLicValue(lic,"tel","telephone")||p.contactTel,
    }));
  };
  const submit=async()=>{
    const e={};
    if(!f.nom.trim())e.nom="Requis";
    if(!f.prenom.trim())e.prenom="Requis";
    if(!f.dateNaissance)e.dateNaissance="Requis";
    if(!f.categorie)e.categorie="Requis";
    if(f.categorie==="Dirigeant"&&!f.dirigeantCategorie)e.dirigeantCategorie="Indiquez la catégorie rattachée";
    const email=isMajeur?f.contactEmail:f.respEmail;
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))e.email="Email invalide";
    setErrs(e);
    if(Object.keys(e).length)return;
    setSaving(true);
    const adult=calcAge(f.dateNaissance)>=18;
    const lic=lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF||f.numPersonne);
    const estDirigeant=f.categorie==="Dirigeant";
    const certifNeeded=estDirigeant?false:(f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic)===true:false));
    const entry={
      ...F0,
      id:genId(),
      saison,
      typeLicence:f.typeLicence,
      numLicenceFFF:f.numLicenceFFF||"",
      numPersonne:f.numPersonne||"",
      nom:f.nom.trim().toUpperCase(),
      prenom:f.prenom.trim(),
      dateNaissance:f.dateNaissance,
      sexe:f.sexe,
      lieuNaissance:f.lieuNaissance,
      nationalite:f.nationalite||"Française",
      adresse:f.adresse,
      codePostal:f.codePostal,
      ville:f.ville,
      email:adult?f.contactEmail:"",
      telephone:adult?f.contactTel:"",
      categorie:f.categorie,
      dirigeantCategorie:f.categorie==="Dirigeant"?f.dirigeantCategorie:"",
      isMajeur:adult,
      age:calcAge(f.dateNaissance),
      representants:adult?[]:[{nom:f.respNom||"",prenom:f.respPrenom||"",lien:f.respLien||"Parent",tel:f.respTel||"",email:f.respEmail||""}],
      freresSoeurs:[],
      adultesFamille:[],
      certifNeeded,
      certifMedical:f.certifMedical,
      photoBase64:f.photoBase64,
      statut:"attente",
      notes:f.notes||"Créé depuis l'admin",
      modePaiements:[],
      montantsPaiement:{},
      datesEcheances:[],
      datePreinscription:new Date().toISOString(),
      dateValidation:null,
      datePaiement:null,
    };
    try{await onCreate(entry);}
    finally{setSaving(false);}
  };
  return <div style={{background:C.W,borderRadius:14,padding:"16px 14px",border:`2px solid ${C.J}`,boxShadow:"0 4px 16px rgba(245,200,0,.15)"}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14}}>
      <div>
        <h2 style={{margin:0,fontSize:20,fontWeight:950,color:C.N}}>Nouveau membre hors famille</h2>
        <p style={{fontSize:13,color:C.G,margin:"5px 0 0"}}>Crée une fiche indépendante dans l'admin, sans rattachement à un dossier famille.</p>
      </div>
      <span style={{background:C.Jp,color:"#92400e",border:`1px solid ${C.Jd}`,borderRadius:10,padding:"6px 9px",fontSize:12,fontWeight:900}}>Saison {saison}</span>
    </div>
    <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
      <div style={G2}>
        <F label="Type de licence"><select style={inp()} value={f.typeLicence} onChange={e=>set("typeLicence",e.target.value)}><option value="nouvelle">Nouvelle licence</option><option value="renouvellement">Renouvellement</option></select></F>
        <F label="N° licence FFF"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Facultatif"/></F>
        <F label="N° personne"><input style={inp()} value={f.numPersonne} onChange={e=>set("numPersonne",e.target.value)} placeholder="Facultatif"/></F>
      </div>
      {licDetect&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 10px",boxShadow:"none"}} onClick={()=>applyLic(licDetect)}><Icon as={Check} size={14}/>Licencié retrouvé : préremplir la fiche</button>}
    </div>
    <div style={G2}>
      <F label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())}/></F>
      <F label="Prénom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)}/></F>
      <F label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>setF(p=>({...p,dateNaissance:e.target.value,categorie:suggestCat(e.target.value,saison)||p.categorie}))}/></F>
      <F label="Sexe"><select style={inp()} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
      <F label="Catégorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={canonicalCat(f.categorie)} onChange={e=>set("categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
      {f.categorie==="Dirigeant"&&<F label="Catégorie rattachée *" err={errs.dirigeantCategorie}><select style={inp(errs.dirigeantCategorie)} value={f.dirigeantCategorie} onChange={e=>set("dirigeantCategorie",e.target.value)}><option value="">— Choisir</option>{DIRIGEANT_RATTACHEMENT_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>}
      <F label="Lieu de naissance"><input style={inp()} value={f.lieuNaissance} onChange={e=>set("lieuNaissance",e.target.value)}/></F>
      <F label="Nationalité"><select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
    </div>
    <AdresseInput adresse={f.adresse} cp={f.codePostal} ville={f.ville} onAdresse={v=>set("adresse",v)} onCP={v=>set("codePostal",v)} onVille={v=>set("ville",v)}/>
    <div style={G2}>
      {isMajeur?<>
        <F label="Téléphone"><input style={inp()} value={f.contactTel} onChange={e=>set("contactTel",e.target.value)} inputMode="tel"/></F>
        <F label="Email" err={errs.email}><input type="email" style={inp(errs.email)} value={f.contactEmail} onChange={e=>set("contactEmail",e.target.value)}/></F>
      </>:<>
        <F label="Nom responsable"><input style={inp()} value={f.respNom} onChange={e=>set("respNom",e.target.value.toUpperCase())}/></F>
        <F label="Prénom responsable"><input style={inp()} value={f.respPrenom} onChange={e=>set("respPrenom",e.target.value)}/></F>
        <F label="Lien"><select style={inp()} value={f.respLien} onChange={e=>set("respLien",e.target.value)}>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
        <F label="Téléphone responsable"><input style={inp()} value={f.respTel} onChange={e=>set("respTel",e.target.value)} inputMode="tel"/></F>
        <F label="Email responsable" err={errs.email}><input type="email" style={inp(errs.email)} value={f.respEmail} onChange={e=>set("respEmail",e.target.value)}/></F>
      </>}
    </div>
    <F label="Photo"><PhotoInput value={f.photoBase64} onChange={v=>set("photoBase64",v)}/></F>
    <EquipFields member={f} categorie={f.categorie} tarifs={tarifs} saison={saison} onChange={(k,v)=>set(k,v)}/>
    <F label="Notes admin"><textarea style={{...inp(),height:72,resize:"vertical"}} value={f.notes} onChange={e=>set("notes",e.target.value)}/></F>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginTop:4}}>
      <button style={{...BS,width:"100%"}} onClick={onCancel} disabled={saving}>Annuler</button>
      <button style={{...BP,width:"100%",opacity:saving?0.7:1}} onClick={submit} disabled={saving}><Icon as={UserPlus} size={16}/>{saving?"Création...":"Créer le membre"}</button>
    </div>
  </div>;
}

function PlanningWeekCalendar({rows,tarifs,isMobile=false,onCreate,onEdit,onMove}){
  const range=trainingCalendarRange(rows);
  const legend=planningLegendItems(rows);
  const durationHours=Math.max(1,(range.end-range.start)/60);
  const hourHeight=Math.round(Math.max(38,Math.min(56,520/durationHours)));
  const totalHeight=Math.round(Math.max(260,durationHours*hourHeight));
  const hasSunday=rows.some(c=>c.jour==="Dimanche");
  const days=[...JOURS_ENTRAINEMENT.filter(j=>j!=="Dimanche"),...(hasSunday?["Dimanche"]:[])];
  const timed=rows.map(c=>{
    const start=parseTrainingTime(c.debut);
    const end=parseTrainingTime(c.fin)??(start!==null?start+90:null);
    return {...c,_start:start,_end:end&&start!==null&&end>start?end:(start!==null?start+60:null)};
  }).filter(c=>c._start!==null);
  const untimed=rows.filter(c=>parseTrainingTime(c.debut)===null);
  const dayLayouts=Object.fromEntries(days.map(day=>{
    const list=timed.filter(c=>c.jour===day).sort((a,b)=>a._start-b._start||catRank(adminCatValue({categorie:a.categorie,sexe:a.sexe}))-catRank(adminCatValue({categorie:b.categorie,sexe:b.sexe})));
    const groups=[];
    let group=[];
    let groupEnd=-1;
    list.forEach(c=>{
      if(!group.length||c._start<groupEnd){
        group.push(c);
        groupEnd=Math.max(groupEnd,c._end);
      }else{
        groups.push(group);
        group=[c];
        groupEnd=c._end;
      }
    });
    if(group.length)groups.push(group);
    const placed=groups.flatMap(items=>{
      const lanes=[];
      const withLane=items.map(c=>{
        let lane=lanes.findIndex(end=>c._start>=end);
        if(lane<0){lane=lanes.length;lanes.push(c._end);}
        else lanes[lane]=c._end;
        return {...c,_lane:lane};
      });
      const laneCount=Math.max(1,lanes.length);
      return withLane.map(c=>({...c,_laneCount:laneCount}));
    });
    return [day,placed];
  }));
  const minuteFromPointer=(ev)=>{
    const rect=ev.currentTarget.getBoundingClientRect();
    const y=Math.max(0,Math.min(rect.height,ev.clientY-rect.top));
    const raw=range.start+(y/Math.max(1,rect.height))*(range.end-range.start);
    return Math.max(range.start,Math.min(range.end-15,snapTrainingMinutes(raw,15)));
  };
  if(isMobile){
    const mobileDays=days.map(day=>({
      day,
      rows:[...(dayLayouts[day]||[]),...untimed.filter(c=>c.jour===day)].sort((a,b)=>(a._start??9999)-(b._start??9999)||String(planningOptionLabel(a)).localeCompare(planningOptionLabel(b))),
    })).filter(g=>g.rows.length||onCreate);
    return <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:16,overflow:"hidden",boxShadow:"0 10px 24px rgba(15,23,42,.06)",marginBottom:12}}>
      {(onCreate||onMove)&&<div style={{display:"flex",alignItems:"center",gap:7,background:"#f8fafc",borderBottom:`1px solid ${C.Gb}`,padding:"8px 10px",fontSize:11,color:C.G,fontWeight:850,lineHeight:1.35}}>
        <Icon as={CalendarDays} size={14}/><span>Touchez un créneau pour le modifier. Ajout possible par jour.</span>
      </div>}
      {legend.length>0&&<PlanningLegend items={legend}/>}
      <div style={{display:"grid",gap:8,padding:10}}>
        {mobileDays.map(({day,rows:dayRows})=><div key={day} style={{background:"#fbfdff",border:`1px solid ${C.Gb}`,borderRadius:12,padding:9}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:dayRows.length?8:0}}>
            <strong style={{fontSize:13,color:C.N}}>{day}</strong>
            {onCreate&&<button type="button" onClick={()=>onCreate({jour:day,debut:"18:00",fin:"19:30"})} style={{border:`1px solid ${C.Jd}`,background:C.Jp,color:"#854d0e",borderRadius:999,padding:"5px 8px",fontSize:10.5,fontWeight:950,cursor:"pointer",fontFamily:FONT}}>+ Créneau</button>}
          </div>
          {dayRows.map(c=>{
            const colors=planningCardColors(c);
            const resp=planningResponsableFor(tarifs,c.categorie,c.sexe);
            return <button key={c.id} type="button" onClick={()=>onEdit&&onEdit(c)} style={{width:"100%",border:`1px solid ${colors.accent}`,borderLeft:`5px solid ${colors.accent}`,background:colors.bg,borderRadius:10,padding:"8px 9px",marginTop:6,textAlign:"left",cursor:onEdit?"pointer":"default",fontFamily:FONT,color:colors.fg}}>
              <div style={{fontSize:11,fontWeight:950,color:"#475569"}}>{c.debut&&c.fin?`${c.debut} - ${c.fin}`:"Horaire à préciser"}</div>
              <div style={{fontSize:13,fontWeight:950,lineHeight:1.15,marginTop:2}}>{planningOptionLabel(c)}</div>
              <div style={{fontSize:10.5,fontWeight:750,color:"#475569",lineHeight:1.25,marginTop:3}}>{c.lieu||"Lieu à confirmer"}</div>
              <div style={{fontSize:10.5,fontWeight:900,color:colors.accent,marginTop:3}}>{planningContactLabel(resp)||"Responsable à renseigner"}</div>
            </button>;
          })}
        </div>)}
      </div>
    </div>;
  }
  const timeCol=58;
  return <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:18,overflow:"hidden",boxShadow:"0 16px 34px rgba(15,23,42,.06)",marginBottom:12}}>
    {(onCreate||onMove)&&<div style={{display:"flex",alignItems:"center",gap:8,background:"#f8fafc",borderBottom:`1px solid ${C.Gb}`,padding:"8px 10px",fontSize:11.5,color:C.G,fontWeight:850}}>
      <Icon as={CalendarDays} size={14}/><span>Cliquez une case pour créer. Glissez une carte pour déplacer.</span>
    </div>}
    {legend.length>0&&<PlanningLegend items={legend}/>}
    <div style={{width:"100%"}}>
      <div style={{width:"100%"}}>
        <div style={{display:"grid",gridTemplateColumns:`${timeCol}px repeat(${days.length}, minmax(0, 1fr))`,borderBottom:`1px solid ${C.Gb}`,background:"#fbfdff"}}>
          <div style={{padding:"10px 8px",fontSize:10.5,fontWeight:950,color:C.G,textTransform:"uppercase"}}>Heure</div>
          {days.map(day=><div key={day} style={{padding:"10px 7px",textAlign:"center",fontSize:13,fontWeight:950,color:C.N,borderLeft:`1px solid ${C.Gb}`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{day}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:`${timeCol}px repeat(${days.length}, minmax(0, 1fr))`}}>
          <div style={{position:"relative",height:totalHeight,background:"#fbfdff",borderRight:`1px solid ${C.Gb}`}}>
            {range.hours.map(h=>{
              const top=((h*60-range.start)/(range.end-range.start))*totalHeight;
              return <div key={h} style={{position:"absolute",top:Math.max(0,top-8),right:7,fontSize:11,fontWeight:850,color:C.N}}>{fmtTrainingTime(h*60)}</div>;
            })}
          </div>
          {days.map(day=><div key={day} title={onCreate?"Cliquer pour ajouter un créneau":undefined} onClick={onCreate?(e)=>{const start=minuteFromPointer(e);onCreate({jour:day,debut:fmtTrainingTime(start),fin:fmtTrainingTime(clampTrainingMinutes(start+90))});}:undefined} onDragOver={onMove?(e)=>{e.preventDefault();e.dataTransfer.dropEffect="move";}:undefined} onDrop={onMove?(e)=>{e.preventDefault();const id=e.dataTransfer.getData("text/plain");if(id)onMove(id,{jour:day,debut:fmtTrainingTime(minuteFromPointer(e))});}:undefined} style={{position:"relative",height:totalHeight,borderLeft:`1px solid ${C.Gb}`,cursor:onCreate?"copy":"default",background:`repeating-linear-gradient(to bottom,#ffffff 0,#ffffff ${Math.round(hourHeight/2)-1}px,#f1f5f9 ${Math.round(hourHeight/2)}px,#ffffff ${Math.round(hourHeight/2)+1}px,#ffffff ${hourHeight-1}px,#e5e7eb ${hourHeight}px)`}}>
            {(dayLayouts[day]||[]).map(c=>{
              const colors=planningCardColors(c);
              const top=((c._start-range.start)/(range.end-range.start))*totalHeight;
              const height=Math.max(44,((c._end-c._start)/(range.end-range.start))*totalHeight);
              const laneWidth=100/c._laneCount;
              const left=c._laneCount>1?`calc(${c._lane*laneWidth}% + 4px)`:"5px";
              const width=c._laneCount>1?`calc(${laneWidth}% - 8px)`:"calc(100% - 10px)";
              const resp=planningResponsableFor(tarifs,c.categorie,c.sexe);
              return <div data-planning-card="true" draggable={!!onMove} onDragStart={onMove?(e)=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",c.id);}:undefined} onClick={(e)=>{e.stopPropagation();onEdit&&onEdit(c);}} key={c.id} title={creneauLabel(c)} style={{position:"absolute",top,left,width,height,background:colors.bg,borderLeft:`4px solid ${colors.accent}`,borderRadius:8,padding:"6px 7px",boxShadow:"0 8px 16px rgba(15,23,42,.09)",overflow:"hidden",color:colors.fg,cursor:onMove?"grab":onEdit?"pointer":"default",minWidth:0}}>
                <div style={{fontSize:10,fontWeight:900,color:"#475569",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.debut||"?"} - {c.fin||"?"}</div>
                <div style={{fontSize:12,fontWeight:950,lineHeight:1.08,marginTop:3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{planningOptionLabel(c)}</div>
                <div style={{fontSize:9.8,fontWeight:750,color:"#475569",lineHeight:1.15,marginTop:3,display:height<62?"none":"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{c.lieu||"Lieu à confirmer"}</div>
                <div style={{fontSize:9.6,fontWeight:850,color:colors.accent,lineHeight:1.15,marginTop:2,display:height<82?"none":"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{planningContactLabel(resp)||"Resp. à renseigner"}</div>
              </div>;
            })}
          </div>)}
        </div>
      </div>
    </div>
    {untimed.length>0&&<div style={{borderTop:`1px solid ${C.Gb}`,padding:"10px 12px",background:C.Gc}}>
      <div style={{fontSize:11,fontWeight:950,color:C.G,textTransform:"uppercase",marginBottom:6}}>Créneaux à compléter</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {untimed.map(c=><span key={c.id} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"6px 8px",fontSize:12,fontWeight:850,color:C.N}}>{planningOptionLabel(c)} · {c.jour} · {c.lieu||"lieu à préciser"}</span>)}
      </div>
    </div>}
  </div>;
}

function PlanningLegend({items}){
  return <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"9px 10px",background:"#fff",borderBottom:`1px solid ${C.Gb}`}}>
    <span style={{fontSize:11,fontWeight:950,color:C.G,textTransform:"uppercase",letterSpacing:.3,marginRight:2}}>Légende</span>
    {items.map(item=><span key={item.key} style={{display:"inline-flex",alignItems:"center",gap:6,background:item.colors.bg,border:`1px solid ${item.colors.accent}`,borderRadius:999,padding:"4px 8px",fontSize:11,fontWeight:900,color:item.colors.fg}}>
      <span style={{width:9,height:9,borderRadius:999,background:item.colors.accent,boxShadow:"0 0 0 2px rgba(255,255,255,.65)"}}/>
      {item.key}
      <span style={{fontSize:10,color:"#475569",fontWeight:850}}>({item.count})</span>
    </span>)}
  </div>;
}

/* â•â• VUES PAR CATÉGORIE / PAR TYPE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ViewDashboard({data,licencies=[],saison,isMobile=false,onSelect,onNavigate}){
  const membres=tousMembresDossiers(data);
  const totalMembres=membres.length;
  const validDocs=data.filter(d=>d.statut==="valide"||d.statut==="paye");
  const pendingDocs=data.filter(d=>d.statut==="attente");
  const incompleteDocs=data.filter(d=>d.statut==="incomplet");
  const refusedDocs=data.filter(d=>d.statut==="refuse");
  const activeDocs=data.filter(d=>d.statut!=="refuse");
  const ca=data.reduce((s,d)=>s+calcTotalDossier(d),0);
  const caValide=validDocs.reduce((s,d)=>s+calcTotalDossier(d),0);
  const caRestant=activeDocs.reduce((s,d)=>s+calcTotalDossier(d),0)-caValide;
  const progress=data.length?Math.round((validDocs.length/data.length)*100):0;
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const memberKey=(nom,prenom)=>`${norm(nom)}|${norm(prenom)}`;
  const preinscritsKeys=new Set();
  membres.forEach(m=>{
    if(m.nom||m.prenom)preinscritsKeys.add(memberKey(m.nom,m.prenom));
    const licence=(m.numLicenceFFF||m.dossier?.numLicenceFFF||"").trim();
    if(licence)preinscritsKeys.add(`lic:${licence}`);
  });
  const footclubsPreinscrits=licencies.filter(l=>{
    const nom=l.n||l.nom||"";
    const prenom=l.p||l.prenom||"";
    const licence=(l.l||l.numLicence||l.numLicenceFFF||"").trim();
    return (licence&&preinscritsKeys.has(`lic:${licence}`))||preinscritsKeys.has(memberKey(nom,prenom));
  }).length;
  const footclubsProgress=licencies.length?Math.round((footclubsPreinscrits/licencies.length)*100):0;
  const certifDocs=data.filter(d=>d.certifNeeded).length;
  const photoMissing=membres.filter(m=>!m.photoBase64&&!m.dossier?.photoBase64&&!m.dossier?.photoId).length;
  const families=data.filter(d=>countMembres(d)>1).length;
  const mutations=membres.filter(m=>m.aJoueAutreClub||m.dossier?.aJoueAutreClub).length;
  const renewals=membres.filter(m=>m.typeLicence==="renouvellement").length;
  const nouvelles=membres.filter(m=>m.typeLicence==="nouvelle").length;
  const dirigeants=membres.filter(m=>adminCatValue(m)==="Dirigeants").length;
  const byCat=sortCats([...new Set(membres.map(m=>adminCatValue(m)||m.categorie).filter(Boolean))])
    .map(cat=>({cat,count:membres.filter(m=>(adminCatValue(m)||m.categorie)===cat).length,valid:membres.filter(m=>(adminCatValue(m)||m.categorie)===cat&&(m.statut==="valide"||m.statut==="paye")).length}));
  const maxCat=Math.max(1,...byCat.map(x=>x.count));
  const byStatus=STATUT_ORDER.map(k=>({id:k,label:STATUTS[k].l,count:data.filter(d=>d.statut===k||(k==="valide"&&d.statut==="paye")).length,color:STATUTS[k].c,bg:STATUTS[k].bg}));
  const paymentCounts={};
  data.forEach(d=>{
    const ids=Array.isArray(d.modePaiements)&&d.modePaiements.length?d.modePaiements:(d.modePaiement?[d.modePaiement]:["non renseigne"]);
    ids.forEach(id=>paymentCounts[id]=(paymentCounts[id]||0)+1);
  });
  const payments=Object.entries(paymentCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const derniers=[...data].sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||"")).slice(0,6);
  const topCats=[...byCat].sort((a,b)=>b.count-a.count).slice(0,3);
  const priority=[
    {label:"Dossiers en attente",value:pendingDocs.length,color:"#ca8a04",bg:"#fef9c3",target:"liste"},
    {label:"Dossiers incomplets",value:incompleteDocs.length,color:C.R,bg:"#fee2e2",target:"liste"},
    {label:"Certificats a suivre",value:certifDocs,color:"#7c3aed",bg:"#f3e8ff",target:"certifs"},
    {label:"Photos manquantes",value:photoMissing,color:"#0369a1",bg:"#e0f2fe",target:"liste"},
  ];
  const quick=[
    {label:"Ouvrir categories",target:"parCat",hint:"vue equipe"},
    {label:"Suivre paiements",target:"paiements",hint:`${caRestant>0?caRestant:0} € restant`},
    {label:"Voir Footclubs",target:"footclubs",hint:`${validDocs.length} dossiers valides`},
    {label:"Exporter",target:"exports",hint:"fichiers Excel"},
  ];
  const panel={background:C.W,border:`1px solid ${C.Gb}`,borderRadius:18,padding:isMobile?14:16,boxShadow:"0 12px 30px rgba(15,23,42,.05)",minWidth:0};
  const chip=(bg,color)=>({background:bg,color,border:`1px solid ${color}22`,borderRadius:999,padding:"4px 9px",fontSize:11,fontWeight:900,whiteSpace:"nowrap"});
  const ring=(value,color,label,sub)=>(
    <div style={{justifySelf:isMobile?"start":"center",display:"grid",placeItems:"center",width:132,height:132,borderRadius:"50%",background:`conic-gradient(${color} ${value*3.6}deg, #edf1f7 0deg)`,boxShadow:"inset 0 0 0 1px rgba(15,23,42,.08)"}}>
      <div style={{width:98,height:98,borderRadius:"50%",background:C.W,display:"grid",placeItems:"center",boxShadow:"0 8px 20px rgba(15,23,42,.08)"}}>
        <div style={{textAlign:"center",padding:"0 8px"}}>
          <div style={{fontSize:25,fontWeight:950,color:C.N,lineHeight:1}}>{value}%</div>
          <div style={{fontSize:9,fontWeight:950,color:C.G,textTransform:"uppercase",marginTop:4,lineHeight:1.15}}>{label}</div>
          {sub&&<div style={{fontSize:10,fontWeight:900,color,marginTop:5,lineHeight:1.1}}>{sub}</div>}
        </div>
      </div>
    </div>
  );
  return <div style={{display:"grid",gap:14}}>
    <div style={{background:`linear-gradient(135deg,#ffffff 0%,#fff8d6 100%)`,border:`1px solid ${C.Gb}`,borderRadius:24,padding:isMobile?"16px":"20px",boxShadow:"0 16px 38px rgba(15,23,42,.07)",display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(0,1.05fr) 300px minmax(260px,.85fr)",gap:16,alignItems:"center",overflow:"hidden"}}>
      <div style={{minWidth:0}}>
        <p style={{fontSize:12,fontWeight:900,color:C.G,margin:"0 0 5px"}}>Saison {saison}</p>
        <h2 style={{fontSize:isMobile?24:30,fontWeight:950,color:C.N,margin:0,lineHeight:1.08}}>Tableau de bord inscriptions</h2>
        <p style={{fontSize:13,color:C.G,margin:"9px 0 0",lineHeight:1.55}}>Pilotage rapide des dossiers, paiements, certificats, familles et actions a traiter.</p>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:13}}>
          <span style={chip("#dcfce7",C.V)}>{validDocs.length} valides payes</span>
          <span style={chip("#fef9c3","#ca8a04")}>{pendingDocs.length+incompleteDocs.length} a traiter</span>
          <span style={chip("#e0f2fe","#0369a1")}>{families} familles ou multi-licences</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,132px)":"repeat(2,132px)",gap:14,justifyContent:isMobile?"start":"center",overflowX:isMobile?"auto":"visible",paddingBottom:isMobile?2:0}}>
        {ring(progress,C.V,"preinscrits valides",`${validDocs.length}/${data.length||0}`)}
        {ring(footclubsProgress,C.B,"preinscrits / base",`${footclubsPreinscrits}/${licencies.length||0}`)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:9}}>
        {[["Dossiers",data.length,C.N],["Membres",totalMembres,C.B],["CA estime",`${ca} €`,C.Jd],["Certificats",certifDocs,C.R]].map(([l,v,c])=><div key={l} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"12px 13px",minHeight:72}}>
          <div style={{fontSize:24,fontWeight:950,color:c,lineHeight:1}}>{v}</div>
          <div style={{fontSize:11,fontWeight:900,color:C.G,marginTop:7}}>{l}</div>
        </div>)}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(4,minmax(0,1fr))",gap:10}}>
      {priority.map(p=><button key={p.label} onClick={()=>onNavigate?.(p.target)} style={{...panel,background:p.bg,border:`1px solid ${p.color}33`,textAlign:"left",cursor:"pointer",padding:"13px 14px",boxShadow:"none",fontFamily:FONT}}>
        <div style={{fontSize:25,fontWeight:950,color:p.color,lineHeight:1}}>{p.value}</div>
        <div style={{fontSize:12,fontWeight:900,color:p.color,marginTop:7}}>{p.label}</div>
      </button>)}
    </div>

    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(0,1.4fr) minmax(300px,.8fr)",gap:14}}>
      <div style={panel}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:0}}>Membres par categorie</h3>
          <button onClick={()=>onNavigate?.("parCat")} style={{...BS,minHeight:0,padding:"7px 10px",fontSize:11,boxShadow:"none"}}>Voir detail</button>
        </div>
        {byCat.length===0?<p style={{fontSize:13,color:C.G,margin:0}}>Aucune preinscription pour le moment.</p>:<div style={{display:"grid",gap:10}}>
          {byCat.slice(0,10).map(x=><div key={x.cat} style={{display:"grid",gridTemplateColumns:isMobile?"86px minmax(0,1fr) 32px":"130px minmax(0,1fr) 42px",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,fontWeight:900,color:C.N,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={catLabel(x.cat)}>{catLabel(x.cat)}</span>
            <div style={{height:14,background:C.Gc,borderRadius:999,overflow:"hidden",position:"relative"}}>
              <div style={{height:"100%",width:`${Math.max(7,(x.count/maxCat)*100)}%`,background:`linear-gradient(90deg,${C.J},#f59e0b)`,borderRadius:999}}/>
              {x.valid>0&&<div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.max(5,(x.valid/maxCat)*100)}%`,background:"rgba(22,163,74,.28)",borderRadius:999}}/>}
            </div>
            <span style={{fontSize:12,fontWeight:950,color:C.G,textAlign:"right"}}>{x.count}</span>
          </div>)}
        </div>}
        {byCat.length>10&&<p style={{fontSize:11,color:C.G,margin:"10px 0 0"}}>{byCat.length-10} categorie(s) supplementaire(s) dans la vue detail.</p>}
      </div>

      <div style={panel}>
        <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:"0 0 14px"}}>Statuts dossiers</h3>
        <div style={{display:"grid",gap:9}}>
          {byStatus.map(s=><button key={s.id} onClick={()=>onNavigate?.("liste")} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:s.bg,border:`1px solid ${s.color}33`,borderRadius:12,padding:"10px 12px",fontFamily:FONT,cursor:"pointer"}}>
            <span style={{fontWeight:900,fontSize:13,color:s.color}}>{s.label}{s.id==="valide"&&<span style={{fontSize:10,fontWeight:800,marginLeft:5}}>paye</span>}</span>
            <span style={{fontWeight:950,fontSize:21,color:s.color}}>{s.count}</span>
          </button>)}
        </div>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,minmax(0,1fr))",gap:14}}>
      <div style={panel}>
        <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:"0 0 13px"}}>Lecture rapide</h3>
        {[
          ["Renouvellements",renewals,C.B],
          ["Nouvelles licences",nouvelles,"#f97316"],
          ["Mutations",mutations,"#7c3aed"],
          ["Dirigeants",dirigeants,C.V],
        ].map(([l,v,c])=><div key={l} style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.Gc}`,padding:"9px 0"}}>
          <span style={{fontSize:13,fontWeight:850,color:C.G}}>{l}</span>
          <span style={{fontSize:19,fontWeight:950,color:c}}>{v}</span>
        </div>)}
      </div>

      <div style={panel}>
        <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:"0 0 13px"}}>Encaissement</h3>
        <div style={{display:"grid",gap:9}}>
          <div style={{background:"#dcfce7",border:"1px solid #86efac",borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:900,color:C.V}}>CA valide paye</div>
            <div style={{fontSize:24,fontWeight:950,color:C.V}}>{caValide} €</div>
          </div>
          <div style={{background:"#fef9c3",border:"1px solid #fde68a",borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:900,color:"#92400e"}}>Potentiel restant actif</div>
            <div style={{fontSize:24,fontWeight:950,color:"#ca8a04"}}>{Math.max(0,caRestant)} €</div>
          </div>
        </div>
        <p style={{fontSize:11,color:C.G,margin:"10px 0 0"}}>{refusedDocs.length} dossier(s) refuse(s) exclus du reste potentiel.</p>
      </div>

      <div style={panel}>
        <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:"0 0 13px"}}>Modes de paiement</h3>
        {payments.length===0?<p style={{fontSize:13,color:C.G,margin:0}}>Aucun mode renseigne.</p>:payments.map(([id,count])=><div key={id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 32px",gap:8,alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.Gc}`}}>
          <span style={{fontSize:12,fontWeight:850,color:C.G,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{id==="non renseigne"?"Non renseigne":id}</span>
          <span style={{fontSize:16,fontWeight:950,color:C.N,textAlign:"right"}}>{count}</span>
        </div>)}
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"minmax(0,.85fr) minmax(0,1.15fr)",gap:14}}>
      <div style={panel}>
        <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:"0 0 13px"}}>Top categories</h3>
        {topCats.length===0?<p style={{fontSize:13,color:C.G,margin:0}}>Les categories apparaitront ici des les premieres fiches.</p>:topCats.map((x,i)=><div key={x.cat} style={{display:"grid",gridTemplateColumns:"32px minmax(0,1fr) auto",gap:10,alignItems:"center",background:i===0?C.Jp:C.Gc,border:`1px solid ${i===0?C.Jd:C.Gb}`,borderRadius:12,padding:"9px 10px",marginBottom:8}}>
          <span style={{width:26,height:26,borderRadius:9,background:i===0?C.N:C.W,color:i===0?C.J:C.N,display:"grid",placeItems:"center",fontWeight:950,fontSize:12}}>{i+1}</span>
          <span style={{fontWeight:950,fontSize:13,color:C.N,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{catLabel(x.cat)}</span>
          <span style={{fontWeight:950,color:C.Jd}}>{x.count}</span>
        </div>)}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8,marginTop:12}}>
          {quick.map(q=><button key={q.target} onClick={()=>onNavigate?.(q.target)} style={{background:q.target==="exports"?C.N:C.W,color:q.target==="exports"?C.J:C.N,border:`1px solid ${q.target==="exports"?C.N:C.Gb}`,borderRadius:12,padding:"10px 11px",textAlign:"left",cursor:"pointer",fontFamily:FONT}}>
            <span style={{display:"block",fontSize:12,fontWeight:950}}>{q.label}</span>
            <span style={{display:"block",fontSize:10,fontWeight:800,color:q.target==="exports"?"#fde68a":C.G,marginTop:3}}>{q.hint}</span>
          </button>)}
        </div>
      </div>

      <div style={panel}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12,flexWrap:"wrap"}}>
          <h3 style={{fontSize:16,fontWeight:950,color:C.N,margin:0}}>Dernieres preinscriptions</h3>
          <button onClick={()=>onNavigate?.("liste")} style={{...BS,minHeight:0,padding:"7px 10px",fontSize:11,boxShadow:"none"}}>Ouvrir la liste</button>
        </div>
        {derniers.length===0?<p style={{fontSize:13,color:C.G,margin:0}}>Aucune fiche recente.</p>:derniers.map(d=><button key={d.id} onClick={()=>onSelect?.(d)} style={{width:"100%",display:"grid",gridTemplateColumns:d.photoBase64?"40px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:9,alignItems:"center",padding:"9px 0",border:"none",borderBottom:`1px solid ${C.Gc}`,background:"transparent",textAlign:"left",cursor:"pointer",fontFamily:FONT}}>
          {d.photoBase64&&<img src={d.photoBase64} alt="" style={{width:40,height:40,borderRadius:10,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,fontWeight:950,color:C.N,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.prenom} {d.nom}</div>
            <div style={{fontSize:11,color:C.G,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{catLabel(d.categorie)} · {fmtD(d.datePreinscription)} · {getEmailContact(d)||"contact a verifier"}</div>
          </div>
          <span style={{fontSize:11,fontWeight:900,color:STATUTS[d.statut]?.c,background:STATUTS[d.statut]?.bg,borderRadius:999,padding:"4px 8px",whiteSpace:"nowrap"}}>{STATUTS[d.statut]?.l}</span>
        </button>)}
      </div>
    </div>
  </div>;
}

function ViewParCategorie({data,tarifs=null,onSelect}){
  const [openCat,setOpenCat]=useState(null);
  const [exportingCat,setExportingCat]=useState("");
  // Grouper par catégorie
  const groupes={};
  tousMembresDossiers(data).forEach(m=>{
    const c=categoryListKey(m);
    if(!groupes[c])groupes[c]=[];
    groupes[c].push(m);
  });
  // Ordre logique des catégories
  const ordreCat=["Babyfoot","U6/U7","U8/U9","U10/U11M","U10/U11F","U12/U13M","U12/U13F","U14/U15M","U14/U15F","U16/U17/U18M","U16/U17/U18F","Seniors M","Seniors F","Dirigeants"];
  const cats=ordreCat.filter(c=>groupes[c]).concat(Object.keys(groupes).filter(c=>!ordreCat.includes(c)).sort());
  const exportCategorie=async(cat,grp)=>{
    setExportingCat(cat);
    try{
      const rows=grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=>memberRow(m,tarifs));
      await exportXLSX([{name:cat,rows:[H_MEMBER,...rows]}],`RSG_Categorie_${cat.replace(/[^a-z0-9]+/gi,"_")}.xlsx`);
    }catch(e){alert("Erreur export : "+e.message);}
    setExportingCat("");
  };

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>⚽ Préinscriptions par catégorie</p>
      <p style={{fontSize:12,color:"#1e40af",margin:0}}>Vue d'équipe : combien de joueurs par catégorie, statuts, contacts. Cliquez sur une catégorie pour la déplier.</p>
    </div>
    {cats.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucune préinscription</p>}
    {cats.map(cat=>{
      const grp=groupes[cat];
      const stats={
        total:grp.length,
        dossiers:new Set(grp.map(m=>m.dossierId)).size,
        attente:grp.filter(m=>m.statut==="attente").length,
        valide:grp.filter(m=>m.statut==="valide"||m.statut==="paye").length,
        incomplet:grp.filter(m=>m.statut==="incomplet").length,
        certifs:grp.filter(m=>m.certifNeeded).length,
        ca:grp.reduce((s,m)=>s+(m.prix||0),0),
      };
      const isOpen=openCat===cat;
      return<div key={cat} style={{background:C.W,borderRadius:10,marginBottom:8,overflow:"hidden",border:`1px solid ${C.Gb}`}}>
        <button onClick={()=>setOpenCat(isOpen?null:cat)} style={{width:"100%",background:isOpen?C.Jp:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{background:C.N,color:C.J,padding:"4px 10px",borderRadius:6,fontWeight:800,fontSize:13}}>{cat}</span>
            <span style={{fontSize:18,fontWeight:900,color:C.N}}>{stats.total}</span>
            <span style={{fontSize:11,color:C.G}}>membre(s) - {stats.dossiers} dossier(s)</span>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            {stats.attente>0&&<span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:800}}>Attente {stats.attente}</span>}
            {stats.valide>0&&<span style={{background:"#dcfce7",color:C.V,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>✓ {stats.valide}</span>}
            {stats.incomplet>0&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:800}}>Incomplet {stats.incomplet}</span>}
            {stats.certifs>0&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>🩺 {stats.certifs}</span>}
            {stats.ca>0&&<span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>{stats.ca} €</span>}
            <span style={{color:C.G,fontSize:14,marginLeft:4,transform:isOpen?"rotate(180deg)":"none",transition:"transform .15s"}}>v</span>
          </div>
        </button>
        {isOpen&&<div style={{padding:"4px 14px 14px"}}>
          {/* Actions globales pour la catégorie */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>{
              const emails=[...new Set(grp.map(m=>getEmailContact(m.dossier)).filter(Boolean))];
              if(!emails.length){alert("Aucun email");return;}
              navigator.clipboard.writeText(emails.join("; "));
              alert(`✅ ${emails.length} email(s) copié(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>📧 Copier emails</button>
            <button onClick={()=>{
              const tels=[...new Set(grp.map(m=>getTelContact(m.dossier)).filter(Boolean))];
              if(!tels.length){alert("Aucun téléphone");return;}
              navigator.clipboard.writeText(tels.join(", "));
              alert(`✅ ${tels.length} téléphone(s) copié(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>📱 Copier tél.</button>
            <button onClick={()=>exportCategorie(cat,grp)} disabled={!!exportingCat} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32,background:C.W}}>
              {exportingCat===cat?"Export...":"Export catégorie"}
            </button>
          </div>
          {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=><div key={`${m.dossierId}-${m.idx}`} onClick={()=>onSelect(m.dossier)} style={{cursor:"pointer",background:C.Gc,borderRadius:8,padding:"8px 10px",marginBottom:4,borderLeft:`3px solid ${STATUTS[m.statut]?.c||C.G}`,display:"grid",gridTemplateColumns:m.photoBase64?"38px minmax(0,1fr) auto":"minmax(0,1fr) auto",alignItems:"center",gap:9}}>
            {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:38,height:38,borderRadius:9,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{m.prenom} {m.nom}</div>
              <div style={{fontSize:11,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{background:isDirigeantMember(m)?"#ede9fe":"#dcfce7",color:isDirigeantMember(m)?"#6d28d9":C.V,padding:"1px 7px",borderRadius:999,fontWeight:900}}>{categoryListRoleTag(m)}</span>
                <span>{m.dateNaissance?fmtD(m.dateNaissance):""}</span>
                {m.poste&&<span style={{color:C.N,fontWeight:700}}>{m.poste}</span>}
                <span>{m.role}</span>
                {isDirigeantMember(m)&&m.dirigeantCategorie&&<span style={{color:C.N,fontWeight:800}}>Rattaché {catLabel(m.dirigeantCategorie)||m.dirigeantCategorie}</span>}
                <span>{structureType(m)}</span>
                <span>Dossier {m.dossier.prenom} {m.dossier.nom}</span>
                {m.certifNeeded&&<span style={{color:C.R,fontWeight:700}}>🩺</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:STATUTS[m.statut]?.bg,color:STATUTS[m.statut]?.c}}>{STATUTS[m.statut]?.i} {STATUTS[m.statut]?.l}</span>
              {m.prix>0&&<div style={{fontSize:13,fontWeight:900,color:C.J,marginTop:2}}>{m.prix} €</div>}
            </div>
          </div>)}
        </div>}
      </div>;
    })}
  </div>;
}

function ViewParType({data,tarifs=null,onSelect}){
  const [openType,setOpenType]=useState(null);
  const [exportingType,setExportingType]=useState("");
  const membres=tousMembresDossiers(data);
  // Définition des types
  const types=[
    {id:"ecole",l:"École de foot RSG",sub:"Babyfoot à U11",members:true,filter:m=>structureType(m)==="École de foot RSG"},
    {id:"groupement",l:"Groupement Jeunes ASM/RSG",sub:"U12 à U18 masculins, U10 à U18 féminines",members:true,filter:m=>structureType(m)==="Groupement Jeunes ASM/RSG"},
    {id:"renouv",l:"🔄 Renouvellements",members:true,filter:m=>m.typeLicence==="renouvellement"&&!m.dirigeantArbitre&&m.categorie!=="Dirigeant"},
    {id:"nouv",l:"✨ Nouvelles licences",members:true,filter:m=>m.typeLicence==="nouvelle"&&!m.dirigeantArbitre&&m.categorie!=="Dirigeant"},
    {id:"famille",l:"Dossiers multi-membres",filter:d=>countMembres(d)>1},
    {id:"dirigeants",l:"🎽 Dirigeants",members:true,filter:m=>m.categorie==="Dirigeant"},
    {id:"arbitres",l:"🟨 Arbitres",members:true,filter:m=>m.dirigeantArbitre||m.dossier?.dirigeantArbitre},
    {id:"jeunes",l:"👶 Jeunes (Babyfoot → U10-U11)",members:true,filter:m=>["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(canonicalCat(m.categorie))},
    {id:"ados",l:"🧒 Ados (U12/U13 → U16-U17-U18)",members:true,filter:m=>["U12-U13","U14-U15","U16-U17-U18"].includes(canonicalCat(m.categorie))},
    {id:"adultes",l:"🧑 Adultes seniors",members:true,filter:m=>canonicalCat(m.categorie)==="Senior"},
    {id:"feminines",l:"Féminines",members:true,filter:m=>m.sexe==="Féminin"},
    {id:"masculins",l:"Masculins",members:true,filter:m=>m.sexe==="Masculin"},
    {id:"certifReq",l:"🩺 Certif médical requis",members:true,filter:m=>m.certifNeeded},
    {id:"echeances",l:"Paiement fractionne",filter:d=>d.nbFois>1},
  ];
  const exportType=async(t,grp)=>{
    setExportingType(t.id);
    try{
      const rows=t.members
        ? grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=>memberRow(m,tarifs))
        : grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=>toRow(d,tarifs));
      const header=t.members?H_MEMBER:H_INS;
      await exportXLSX([{name:t.l.replace(/[^\p{L}\p{N}\s-]/gu,"").trim()||"Type",rows:[header,...rows]}],`RSG_Type_${t.l.replace(/[^a-z0-9]+/gi,"_")}.xlsx`);
    }catch(e){alert("Erreur export : "+e.message);}
    setExportingType("");
  };

  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:14,color:"#854d0e",margin:"0 0 4px"}}>📊 Préinscriptions par type</p>
      <p style={{fontSize:12,color:"#92400e",margin:0}}>Vues thématiques : nouvelles licences, familles, arbitres, certifs, etc.</p>
    </div>
    {types.map(t=>{
      const grp=t.members?membres.filter(t.filter):data.filter(t.filter);
      if(!grp.length)return null;
      const isOpen=openType===t.id;
      const ca=grp.reduce((s,d)=>s+(t.members?(d.prix||0):(d.prixFinal||0)),0);
      return<div key={t.id} style={{background:C.W,borderRadius:10,marginBottom:8,overflow:"hidden",border:`1px solid ${C.Gb}`}}>
        <button onClick={()=>setOpenType(isOpen?null:t.id)} style={{width:"100%",background:isOpen?C.Jp:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontWeight:700,fontSize:14}}>{t.l}</span>
            <span style={{fontSize:18,fontWeight:900,color:C.J}}>{grp.length}</span>
            {t.sub&&<span style={{fontSize:11,color:C.G}}>{t.sub}</span>}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {ca>0&&<span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>{ca} €</span>}
            <span style={{color:C.G,fontSize:14,transform:isOpen?"rotate(180deg)":"none",transition:"transform .15s"}}>v</span>
          </div>
        </button>
        {isOpen&&<div style={{padding:"4px 14px 14px"}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>{
              const emails=[...new Set(grp.map(d=>getEmailContact(t.members?d.dossier:d)).filter(Boolean))];
              if(!emails.length){alert("Aucun email");return;}
              navigator.clipboard.writeText(emails.join("; "));
              alert(`✅ ${emails.length} email(s) copié(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>📧 Copier emails</button>
            <button onClick={()=>exportType(t,grp)} disabled={!!exportingType} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32,background:C.W}}>
              {exportingType===t.id?"Export...":"Export type"}
            </button>
          </div>
          {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=><div key={t.members?`${d.dossierId}-${d.idx}`:d.id} onClick={()=>onSelect(t.members?d.dossier:d)} style={{cursor:"pointer",background:C.Gc,borderRadius:8,padding:"8px 10px",marginBottom:4,borderLeft:`3px solid ${STATUTS[d.statut]?.c||C.G}`,display:"grid",gridTemplateColumns:d.photoBase64?"38px minmax(0,1fr) auto":"minmax(0,1fr) auto",alignItems:"center",gap:9}}>
            {d.photoBase64&&<img src={d.photoBase64} alt="" style={{width:38,height:38,borderRadius:9,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{d.prenom} {d.nom}</div>
              <div style={{fontSize:11,color:C.G,marginTop:2}}>
                <span style={{background:C.N,color:C.J,padding:"1px 5px",borderRadius:3,fontWeight:700,marginRight:4}}>{adminCatValue(d)}</span>
                <span style={{background:C.W,color:C.G,padding:"1px 5px",borderRadius:3,fontWeight:700,marginRight:4}}>{structureType(d)}</span>
                {d.poste&&<span style={{marginRight:5,color:C.N,fontWeight:700}}>{d.poste}</span>}
                {d.dateNaissance&&<span>{fmtD(d.dateNaissance)}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:STATUTS[d.statut]?.bg,color:STATUTS[d.statut]?.c}}>{STATUTS[d.statut]?.i}</span>
              {(t.members?d.prix:d.prixFinal)>0&&<div style={{fontSize:12,fontWeight:900,color:C.J,marginTop:2}}>{t.members?d.prix:d.prixFinal} €</div>}
            </div>
          </div>)}
        </div>}
      </div>;
    })}
  </div>;
}

function ViewFamilles({data,onSelect,onMemberSelect}){
  const familles=data.filter(d=>countMembres(d)>1);
  return<div>
    <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:900,fontSize:14,color:C.V,margin:"0 0 4px"}}>Familles & multi-licences</p>
      <p style={{fontSize:12,color:C.V,margin:0}}>Une ligne par dossier avec plusieurs membres ou plusieurs licences. Cliquez sur un dossier pour l'ouvrir, ou sur un membre pour voir son détail.</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:12}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.N}}>{familles.length}</div><div style={{fontSize:11,color:C.G}}>Dossiers multi-membres</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.B}}>{familles.reduce((s,d)=>s+countMembres(d),0)}</div><div style={{fontSize:11,color:C.G}}>Membres / licences</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.Jd}}>{familles.reduce((s,d)=>s+calcTotalDossier(d),0)} EUR</div><div style={{fontSize:11,color:C.G}}>Montant dossiers</div></div>
    </div>
    {familles.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun dossier multi-membre pour le moment.</p>}
    {familles.map(e=>{
      const membres=membresDossier(e);
      return <div key={e.id} onClick={()=>onSelect(e)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,borderRadius:10,padding:"12px 14px",marginBottom:10,cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap",marginBottom:8}}>
          <div>
            <div style={{fontWeight:900,fontSize:15}}>{e.nomFamille||`${e.nom} ${e.prenom}`}</div>
            <div style={{fontSize:12,color:C.G}}>Dossier {e.id} - Contact {getEmailContact(e)||getTelContact(e)||"-"}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:11,fontWeight:900,padding:"3px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.l}</span>
            <div style={{fontSize:15,fontWeight:900,color:C.J,marginTop:3}}>{calcTotalDossier(e)} EUR</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:6}}>
          {membres.map(m=><div key={`${m.dossierId}-${m.idx}`} onClick={ev=>{ev.stopPropagation();onMemberSelect?.(m);}} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"8px 9px",cursor:"pointer",display:"grid",gridTemplateColumns:m.photoBase64?"34px minmax(0,1fr)":"minmax(0,1fr)",gap:8,alignItems:"center"}}>
            {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:34,height:34,borderRadius:8,objectFit:"cover"}}/>}
            <div>
            <div style={{fontWeight:900,fontSize:13}}>{m.prenom} {m.nom}</div>
            <div style={{fontSize:11,color:C.G,marginTop:2}}>{adminCatValue(m)} - {m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle licence"} - {m.role}</div>
            </div>
          </div>)}
        </div>
      </div>;
    })}
  </div>;
}

function ViewMutations({data,onSelect}){
  const [catFilter,setCatFilter]=useState("toutes");
  const [typeFilter,setTypeFilter]=useState("tous");
  const mutationRows=tousMembresDossiers(data).filter(m=>{
    const d=m.dossier||m;
    const ancienClub=m.ancienClub||(m.idx===0?d.ancienClub:"");
    const aJoue=!!(m.aJoueAutreClub||(m.idx===0&&d.aJoueAutreClub));
    return m.typeLicence==="nouvelle"&&(aJoue||ancienClub);
  });
  const mutationCats=sortCats([...new Set(mutationRows.map(m=>adminCatValue(m)||m.categorie||"Sans catégorie").filter(Boolean))]);
  const mutationTypes=[...new Set(mutationRows.map(m=>structureType(m)||"Sans type").filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const joueurs=mutationRows.filter(m=>
    (catFilter==="toutes"||(adminCatValue(m)||m.categorie||"Sans catégorie")===catFilter)&&
    (typeFilter==="tous"||(structureType(m)||"Sans type")===typeFilter)
  );
  const parStatut={
    attente:joueurs.filter(d=>d.statut==="attente").length,
    valide:joueurs.filter(d=>d.statut==="valide"||d.statut==="paye").length,
    incomplet:joueurs.filter(d=>d.statut==="incomplet").length,
  };
  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:900,fontSize:15,color:"#854d0e",margin:"0 0 6px"}}>Suivi des joueurs mutés / retours</p>
      <p style={{fontSize:12,color:"#92400e",margin:0}}>Nouvelles licences ayant joué dans un autre club la saison précédente, à suivre pour les règles de mutation.</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8,marginBottom:12}}>
      <select style={inp()} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
        <option value="toutes">Toutes catégories</option>
        {mutationCats.map(c=><option key={c} value={c}>{c}</option>)}
      </select>
      <select style={inp()} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
        <option value="tous">Tous types</option>
        {mutationTypes.map(t=><option key={t} value={t}>{t}</option>)}
      </select>
    </div>
    <div style={{fontSize:12,color:C.G,margin:"-4px 0 12px"}}>{joueurs.length} / {mutationRows.length} joueur(s) muté(s) ou retour(s) affiché(s)</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginBottom:12}}>
      {Object.entries(parStatut).map(([k,v])=><div key={k} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px",textAlign:"center"}}>
        <div style={{fontWeight:900,fontSize:20,color:STATUTS[k]?.c||C.N}}>{v}</div>
        <div style={{fontSize:10,color:C.G}}>{STATUTS[k]?.l||k}</div>
      </div>)}
    </div>
    {joueurs.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>{mutationRows.length?"Aucun joueur pour ces filtres.":"Aucun joueur muté / retour déclaré."}</p>}
    {joueurs.map(e=>{
      const d=e.dossier||e;
      const ancienClub=e.ancienClub||(e.idx===0?d.ancienClub:"");
      const note=e.mutationNotes||(e.idx===0?d.mutationNotes:"");
      return <div key={`${e.dossierId||d.id}-${e.idx??0}`} onClick={()=>onSelect(d)} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,cursor:"pointer"}}>
      <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"44px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:10,alignItems:"center"}}>
        {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
        <div>
          <strong>{e.prenom} {e.nom}</strong>
          <span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{adminCatValue(e)}</span>
          {e.role&&<span style={{marginLeft:6,background:C.Gc,color:C.G,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:800}}>{e.role}</span>}
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
      </div>
      {d.nomFamille&&<div style={{fontSize:12,color:C.G,marginTop:6}}>Dossier famille : <strong>{d.nomFamille}</strong></div>}
      <div style={{fontSize:12,color:C.G,marginTop:6}}>Ancien club : <strong>{ancienClub||"à préciser"}</strong></div>
      {note&&<div style={{fontSize:12,color:"#92400e",marginTop:4}}>Note mutation : {note}</div>}
      <div style={{fontSize:12,color:C.G,marginTop:4}}>Type : {structureType(e)} · Contact : {getEmailContact(d)||getTelContact(d)||"—"}</div>
    </div>;
    })}
  </div>;
}

/* â•â• NON PRÉINSCRITS — qui de la saison N-1 manque à l'appel ? â•â•â•â• */
function NonPreinscrits({licencies,data,saison}){
  const [filtre,setFiltre]=useState("tous");
  const [srch,setSrch]=useState("");
  const [exporting,setExporting]=useState(false);
  const [vue,setVue]=useState("manquants");

  // Construire un set des noms+prenoms déjà préinscrits (sans accents, en minuscules)
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const memberKey=(nom,prenom)=>`${norm(nom)}|${norm(prenom)}`;
  const preinscritsMap=new Map();
  const addPreinscrit=(m,d,role)=>{
    const info={entry:d,role,statut:d.statut,categorie:m.categorie||d.categorie};
    preinscritsMap.set(memberKey(m.nom,m.prenom),info);
    const licence=(m.numLicenceFFF||d.numLicenceFFF||"").trim();
    if(licence)preinscritsMap.set(`lic:${licence}`,info);
  };
  data.forEach(d=>{
    addPreinscrit(d,d,"Joueur principal");
    (d.freresSoeurs||[]).forEach(m=>addPreinscrit(m,d,"Membre famille"));
    (d.adultesFamille||[]).forEach(m=>addPreinscrit(m,d,"Membre famille"));
  });
  const findPreinscrit=l=>{
    const nom=l.n||l.nom||"";
    const prenom=l.p||l.prenom||"";
    const licence=(l.l||l.numLicence||l.numLicenceFFF||"").trim();
    return (licence&&preinscritsMap.get(`lic:${licence}`))||preinscritsMap.get(memberKey(nom,prenom));
  };

  // Trouver les licenciés saison N-1 qui ne sont pas dans les préinscriptions
  const manquants=licencies.filter(l=>{
    const nom=l.n||l.nom||"";
    const prenom=l.p||l.prenom||"";
    if(!nom&&!prenom)return false;
    return !findPreinscrit(l);
  });
  const renouveles=licencies.map(l=>({...l,_preinscrit:findPreinscrit(l)})).filter(l=>l._preinscrit);
  const dossiersRenouveles=new Set(renouveles.map(l=>l._preinscrit?.entry?.id).filter(Boolean)).size;
  const activeList=vue==="renouveles"?renouveles:manquants;

  // Filtrage par catégorie
  const cats=[...new Set(activeList.map(l=>l.c||l.categorie||"?"))].filter(Boolean).sort();
  const liste=filtre==="tous"?activeList:activeList.filter(l=>(l.c||l.categorie)===filtre);
  const filtered=srch.length>1?liste.filter(l=>{
    const q=srch.toLowerCase();
    return `${l.n||l.nom||""} ${l.p||l.prenom||""}`.toLowerCase().includes(q);
  }):liste;

  const getEmail=l=>l.em||l.em2||"";
  const emails=[...new Set(manquants.map(getEmail).filter(e=>e))];
  const emailsCat=[...new Set(liste.map(getEmail).filter(e=>e))];

  const copyEmails=which=>{
    const e=which==="cat"?emailsCat:emails;
    if(!e.length){alert("Aucun email");return;}
    navigator.clipboard.writeText(e.join("; "));
    alert(`✅ ${e.length} email(s) copié(s)`);
  };

  const doExport=async()=>{
    setExporting(true);
    try{
      const rows=manquants.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.tl||"",l.dn?fmtD(l.dn):"",l.s||"",getEmail(l),l.tel||l.tel2||"",l.rl||""]);
      await exportXLSX([{name:`Non preinscrits ${saison}`,rows:[["Nom","Prénom","N° Licence","Catégorie","Type","Né(e) le","Sexe","Email","Téléphone","Repr. légal"],...rows]}],`RSG_NonPreinscrits_${saison}.xlsx`);
    }catch(e){alert("Erreur : "+e.message);}
    setExporting(false);
  };

  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:900,fontSize:15,color:"#92400e",margin:"0 0 6px"}}>Licencies non encore preinscrits pour {saison}</p>
      <p style={{fontSize:13,color:"#78350f",margin:0,lineHeight:1.5}}>
        Comparaison entre la base Footclubs (saison passée) et les préinscriptions reçues pour {saison}.<br/>
        <strong>{manquants.length}</strong> licencié(s) de la saison passée ne sont pas encore retrouvés dans une préinscription (sur {licencies.length}). Ce compteur ne dépend pas du statut payé/validé.
      </p>
    </div>

    {/* Stats par catégorie */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
      <div style={{background:C.W,border:`2px solid ${C.R}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.R}}>{manquants.length}</div>
        <div style={{fontSize:11,color:C.G}}>👻 Manquants</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{licencies.length-manquants.length}</div>
        <div style={{fontSize:11,color:C.G}}>✓ Retrouvés dans les préinscriptions</div>
      </div>
    </div>

    <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div>
          <p style={{fontWeight:900,fontSize:14,margin:"0 0 2px",color:C.V}}>Renouvelés retrouvés</p>
          <p style={{fontSize:12,color:C.G,margin:0}}>{renouveles.length} licencié(s) retrouvé(s) dans {dossiersRenouveles} dossier(s) de préinscription.</p>
        </div>
        <button style={{...BS,fontSize:12,padding:"8px 12px",minHeight:36}} onClick={()=>{setFiltre("tous");setVue(v=>v==="renouveles"?"manquants":"renouveles");}}>
          {vue==="renouveles"?"Voir les manquants":"Voir les renouvelés"}
        </button>
      </div>
      {vue==="renouveles"&&<div>
        {renouveles.length===0&&<p style={{textAlign:"center",color:C.G,padding:16,fontStyle:"italic",margin:0}}>Aucun renouvelé retrouvé.</p>}
        {renouveles.map((l,i)=>{
          const p=l._preinscrit;
          const e=p?.entry||{};
          return <div key={`${l.l||l.numLicence||i}-${i}`} style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap",padding:"9px 0",borderTop:i===0?"none":`1px solid ${C.Gb}`}}>
            <div>
              <span style={{fontWeight:900}}>{l.p||l.prenom} {l.n||l.nom}</span>
              {(l.c||l.categorie)&&<span style={{marginLeft:8,background:"#dcfce7",color:C.V,padding:"1px 7px",borderRadius:5,fontSize:11,fontWeight:900}}>{l.c||l.categorie}</span>}
              <div style={{fontSize:12,color:C.G,marginTop:2}}>Dossier {e.id||"—"} · {p?.role||"Préinscrit"} · Statut : {STATUTS[e.statut]?.l||e.statut||"—"}</div>
            </div>
            <div style={{fontSize:12,color:C.G,fontWeight:800}}>{e.prenom||""} {e.nom||""}</div>
          </div>;
        })}
      </div>}
    </div>

    {/* Actions */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>copyEmails("all")} disabled={!emails.length}>📧 Copier {emails.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!manquants.length}>{exporting?"…":"📊 Export Excel"}</button>
    </div>

    {/* Filtre par catégorie */}
    <div style={{marginBottom:10}}>
      <select style={{...inp(),fontSize:14,marginBottom:8}} value={filtre} onChange={e=>setFiltre(e.target.value)}>
        <option value="tous">Toutes catégories ({activeList.length})</option>
        {cats.map(c=>{const n=activeList.filter(l=>(l.c||l.categorie)===c).length;return<option key={c} value={c}>{c} ({n})</option>;})}
      </select>
      {filtre!=="tous"&&emailsCat.length>0&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}} onClick={()=>copyEmails("cat")}>📧 Copier les {emailsCat.length} emails de la catégorie {filtre}</button>}
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`Rechercher dans ${liste.length}...`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {liste.length} affiché(s)</p>
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun</p>}
    {filtered.map((l,i)=>{
      const email=getEmail(l);
      const req=certifRequis(l);
      const p=l._preinscrit;
      const e=p?.entry||{};
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:4,borderLeft:`3px solid ${vue==="renouveles"?C.V:C.R}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontWeight:700,fontSize:14}}>{l.p||l.prenom} {l.n||l.nom}</span>
          {(l.c||l.categorie)&&<span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{l.c||l.categorie}</span>}
          {l.tl&&l.tl!=="Libre"&&<span style={{marginLeft:6,background:"#ede9fe",color:"#6d28d9",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:600}}>{l.tl}</span>}
          {req===true&&<span style={{marginLeft:6,background:"#fee2e2",color:C.R,padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700}}>🩺</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3}}>
            {l.dn&&<span>Né(e) {fmtD(l.dn)} · </span>}
            {email&&<span>📧 {email} · </span>}
            {(l.tel||l.tel2)&&<span>📱 {l.tel||l.tel2}</span>}
          </div>
        </div>
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>navigator.clipboard.writeText(email)}>📋</button>}
      </div>;
    })}
  </div>;
}

function Equipement({saison,tarifs}){
  const [data,setData]=useState([]);
  const [search,setSearch]=useState("");
  const [statut,setStatut]=useState("tous");
  const [categorie,setCategorie]=useState("tous");
  const [article,setArticle]=useState("tous");
  const [page,setPage]=useState("dotations");
  const [sel,setSel]=useState(null);
  const [memberSel,setMemberSel]=useState(null);
  useEffect(()=>{
    if(!isFirebaseAvailable()){
      stGet(keyIns(saison)).then(d=>{if(Array.isArray(d))setData(normalizeInscriptionsForDisplay(d,tarifs));});
      return;
    }
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      const sorted=normalizeInscriptionsForDisplay(fbData,tarifs);
      setData(sorted);
      stSet(keyIns(saison),sorted);
    });
    return()=>unsub&&unsub();
  },[saison,tarifs]);
  useEffect(()=>{
    if(!sel?.id)return;
    const fresh=data.find(e=>e.id===sel.id);
    if(fresh&&fresh!==sel)setSel(fresh);
  },[data,sel?.id]);
  useEffect(()=>{
    const forceRefresh=ev=>{
      if(ev?.detail?.saison&&ev.detail.saison!==saison)return;
      refreshFirebaseInscriptions(saison,setData,tarifs).catch(err=>console.error("Rechargement Firebase impossible",err));
    };
    window.addEventListener("rsg-force-firebase-refresh",forceRefresh);
    return()=>window.removeEventListener("rsg-force-firebase-refresh",forceRefresh);
  },[saison,tarifs]);
  const upd=async(id,patch)=>{
    const d=data.map(e=>e.id===id?{...e,...patch}:e);
    const u=d.find(e=>e.id===id);
    if(!u)return;
    if(isFirebaseAvailable()){
      const synced=await saveFirebaseOrWarn(saison,u,"modification équipement");
      if(!synced)return;
    }
    setData(d);
    await stSet(keyIns(saison),d);
  };
  const updateAchat=async(entryId,achatId,patch)=>{
    const entry=data.find(e=>e.id===entryId);if(!entry)return;
    const achats=(entry.achatsBoutique||[]).map(a=>a.id===achatId?{...a,...patch}:a);
    await upd(entryId,{achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)});
  };
  const articles=getBoutique(tarifs);
  const categories=getBoutiqueCategories(tarifs);
  const rows=getAchatsBoutiqueRows(data);
  const filtered=rows.filter(({entry:e,achat:a})=>{
    const q=search.toLowerCase();
    const cat=getAchatCategorie(a,articles);
    return (!q||`${e.nom} ${e.prenom} ${e.nomFamille||""} ${a.nom} ${a.taille||""} ${cat}`.toLowerCase().includes(q))&&(statut==="tous"||(a.statut||"a_regler")===statut)&&(categorie==="tous"||cat===categorie)&&(article==="tous"||a.articleId===article);
  });
  const stats={total:rows.length,montant:rows.reduce((s,{achat:a})=>s+achatTotal(a),0),aRegler:rows.filter(({achat:a})=>(a.statut||"a_regler")==="a_regler").length,aLivrer:rows.filter(({achat:a})=>["recu"].includes(a.statut||"a_regler")).length};
  const dotRows=tousMembresDossiers(data).filter(m=>m.statut!=="refuse");
  return <div style={{maxWidth:1280,margin:"0 auto",padding:"18px 16px 80px"}}>
    <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"18px 20px",marginBottom:14,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div>
        <h1 style={{fontSize:22,margin:"0 0 4px",fontWeight:950,color:C.N}}>Équipement RSG</h1>
        <p style={{fontSize:13,color:C.G,margin:0}}>Gestion des dotations licence par personne.</p>
      </div>
    </div>
    {page==="dotations"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10}}>
      {dotRows.sort((a,b)=>catRank(adminCatValue(a))-catRank(adminCatValue(b))||(a.nom||"").localeCompare(b.nom||"")).map(m=>{const missing=getMemberMissingDotations(m,tarifs,saison);const recap=getMemberDotationItems(m,m.categorie,tarifs,saison).map(item=>`${item.label}: ${dotationValueForMember(m,item)||"-"}`).join(" · ");return <button key={`${m.dossierId}-${m.idx}`} onClick={()=>setMemberSel(m)} style={{background:C.W,border:`1px solid ${missing.length?"#fdba74":C.Gb}`,borderRadius:14,padding:"10px 12px",display:"grid",gridTemplateColumns:m.photoBase64?"48px minmax(0,1fr)":"minmax(0,1fr)",gap:10,alignItems:"center",cursor:"pointer",textAlign:"left",fontFamily:FONT}}>
        {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:48,height:48,borderRadius:12,objectFit:"cover"}}/>}
        <div>
          <div style={{fontWeight:950,fontSize:14}}>{m.prenom} {m.nom}</div>
          <div style={{fontSize:11,color:C.G,margin:"3px 0"}}>{adminCatValue(m)} · {structureType(m)}</div>
          <div style={{fontSize:12,color:C.N}}>{recap||"Aucune dotation"}</div>
          {missing.length>0&&<div style={{fontSize:11,color:"#9a3412",fontWeight:900,marginTop:3}}>À demander : {missing.join(", ")}</div>}
          {formatInitiales(m,tarifs)&&<div style={{fontSize:12,color:C.Jd,fontWeight:900}}>Initiales : {formatInitiales(m,tarifs)}</div>}
        </div>
      </button>;})}
    </div>}
    {sel&&<DetailModal onClose={()=>setSel(null)}><DetailPanel e={sel} note={sel.notes||""} setNote={()=>{}} onUpd={upd} onDel={()=>{}} onChangeStatut={(id,st)=>upd(id,dossierStatusPatch(st,sel||data.find(e=>e.id===id)||{}))} tarifs={tarifs} onClose={()=>setSel(null)}/></DetailModal>}
    {memberSel&&<DetailModal onClose={()=>setMemberSel(null)}>
      <MemberDetailPanel m={memberSel} tarifs={tarifs} onOpenDossier={()=>{setSel(memberSel.dossier);setMemberSel(null);}}/>
    </DetailModal>}
  </div>;
}

/* â•â• PERMANENCE — Interface bénévoles â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Permanence({saison,tarifs}){
  const [data,setData]=useState([]);
  const [search,setSearch]=useState("");
  const [openId,setOpenId]=useState(null);
  const [memberSel,setMemberSel]=useState(null);
  const [fbStatus,setFbStatus]=useState("connecting");
  const [filtre,setFiltre]=useState("attente"); // attente | tous
  const [vue,setVue]=useState("liste"); // liste | categories

  useEffect(()=>{
    if(!isFirebaseAvailable()){
      setFbStatus("offline");
      stGet(keyIns(saison)).then(d=>{if(Array.isArray(d))setData(normalizeInscriptionsForDisplay(d,tarifs));});
      return;
    }
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      const sorted=normalizeInscriptionsForDisplay(fbData,tarifs);
      setData(sorted);
      stSet(keyIns(saison),sorted);
    },()=>{
      setFbStatus("offline");
      stGet(keyIns(saison)).then(d=>setData(normalizeInscriptionsForDisplay(d,tarifs)));
    });
    return ()=>unsub&&unsub();
  },[saison,tarifs]);

  useEffect(()=>{
    if(isFirebaseAvailable())return;
    const key=keyIns(saison);
    const sync=async(ev)=>{
      if(ev?.key&&ev.key!==key)return;
      if(ev?.detail?.key&&ev.detail.key!==key)return;
      const d=await stGet(key);
      if(Array.isArray(d))setData(normalizeInscriptionsForDisplay(d,tarifs));
    };
    window.addEventListener("storage",sync);
    window.addEventListener("rsg-storage",sync);
    return()=>{window.removeEventListener("storage",sync);window.removeEventListener("rsg-storage",sync);};
  },[saison,tarifs]);

  useEffect(()=>{
    const forceRefresh=ev=>{
      if(ev?.detail?.saison&&ev.detail.saison!==saison)return;
      refreshFirebaseInscriptions(saison,setData,tarifs).catch(err=>console.error("Rechargement Firebase impossible",err));
    };
    window.addEventListener("rsg-force-firebase-refresh",forceRefresh);
    return()=>window.removeEventListener("rsg-force-firebase-refresh",forceRefresh);
  },[saison,tarifs]);

  const upd=async(id,patch)=>{
    let u=null;
    const d=data.map(e=>{
      if(e.id!==id)return e;
      const next={...e,...patch};
      if(patch.statut==="valide"||patch.statut==="paye"){
        const achats=markBoutiqueAchatsRegles(next.achatsBoutique);
        u=achats!==next.achatsBoutique?{...next,achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)}:next;
        return u;
      }
      u=next;
      return next;
    });
    if(!u)return;
    if(isFirebaseAvailable()){
      const synced=await saveFirebaseOrWarn(saison,u,"modification permanence");
      if(!synced)return;
    }
    setData(d);
    await stSet(keyIns(saison),d);
  };

  // Filtrage
  const liste=filtre==="attente"?data.filter(d=>d.statut==="attente"||d.statut==="incomplet"):data;
  const filtered=search.length>1?liste.filter(d=>{
    const q=search.toLowerCase();
    const all=`${d.nom} ${d.prenom} ${d.id} ${d.nomFamille||""} ${(d.freresSoeurs||[]).map(m=>m.nom+" "+m.prenom).join(" ")}`.toLowerCase();
    return all.includes(q);
  }):liste;

  // Stats
  const encaisse=data.filter(d=>d.statut==="valide"||d.statut==="paye").reduce((s,d)=>s+(d.prixFinal||0),0);
  const aTraiter=data.filter(d=>d.statut==="attente"||d.statut==="incomplet").length;
  const valides=data.filter(d=>d.statut==="valide"||d.statut==="paye").length;
  const groupes={};
  filtered.forEach(d=>{const cat=adminCatValue(d)||"?";if(!groupes[cat])groupes[cat]=[];groupes[cat].push(d);});

  return<div style={{maxWidth:1180,margin:"0 auto",padding:"12px 14px 80px"}}>
    {/* Indicateur Firebase */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 12px",marginBottom:10,background:fbStatus==="online"?"#dcfce7":fbStatus==="connecting"?"#fef9c3":"#fee2e2",border:`1px solid ${fbStatus==="online"?"#86efac":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,borderRadius:8,fontSize:12,color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R}}>
      <strong>{fbStatus==="online"?"Synchronisation active":fbStatus==="connecting"?"Connexion...":"Hors-ligne"}</strong>
      <span style={{fontSize:11,color:"#6b7280"}}>{filtered.length} dossier(s)</span>
    </div>

    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      <div style={{background:C.W,border:`2px solid ${C.J}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>{aTraiter}</div>
        <div style={{fontSize:11,color:C.G}}>A traiter</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{valides}</div>
        <div style={{fontSize:11,color:C.G}}>✓ Validés</div>
      </div>
      <div style={{background:C.N,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,color:C.J}}>{encaisse} €</div>
        <div style={{fontSize:11,color:"#9ca3af"}}>💵 Encaissé</div>
      </div>
    </div>

    {/* Filtres */}
    <div style={{display:"flex",gap:6,marginBottom:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4}}>
      <button onClick={()=>setFiltre("attente")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="attente"?C.J:C.Gb}`,background:filtre==="attente"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        A traiter ({aTraiter})
      </button>
      <button onClick={()=>setFiltre("tous")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="tous"?C.J:C.Gb}`,background:filtre==="tous"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        Tous ({data.length})
      </button>
    </div>

    <div style={{display:"flex",gap:6,marginBottom:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4}}>
      <button onClick={()=>setVue("liste")} style={{flex:1,padding:"9px",border:`2px solid ${vue==="liste"?C.J:C.Gb}`,background:vue==="liste"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>Liste</button>
      <button onClick={()=>setVue("categories")} style={{flex:1,padding:"9px",border:`2px solid ${vue==="categories"?C.J:C.Gb}`,background:vue==="categories"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>Par catégorie</button>
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:15,marginBottom:12,minHeight:48}} placeholder="Rechercher par nom, prenom..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>

    {/* Liste */}
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucun dossier {filtre==="attente"?"en attente":""}</p>}
    {vue==="liste"&&filtered.map(e=><PermFiche key={e.id} e={e} open={false} onToggle={()=>setOpenId(e.id)} onUpd={upd} tarifs={tarifs} onMemberSel={setMemberSel}/>)}
    {vue==="categories"&&sortCats(Object.keys(groupes)).map(cat=><div key={cat} style={{background:C.W,borderRadius:10,marginBottom:10,border:`1px solid ${C.Gb}`,overflow:"hidden"}}>
      <div style={{background:C.N,color:C.J,padding:"10px 12px",fontWeight:900,fontSize:14,display:"flex",justifyContent:"space-between"}}><span>{cat}</span><span>{groupes[cat].length}</span></div>
      <div style={{padding:"8px 10px"}}>
        {groupes[cat].map(e=><PermFiche key={e.id} e={e} open={false} onToggle={()=>setOpenId(e.id)} onUpd={upd} tarifs={tarifs} onMemberSel={setMemberSel}/>)}
      </div>
    </div>)}
    {openId&&data.find(e=>e.id===openId)&&<DetailModal onClose={()=>setOpenId(null)}>
      <PermFiche e={data.find(e=>e.id===openId)} open={true} onToggle={()=>{}} onUpd={upd} tarifs={tarifs} onMemberSel={setMemberSel}/>
    </DetailModal>}
    {memberSel&&<DetailModal onClose={()=>setMemberSel(null)}>
      <MemberDetailPanel m={memberSel} tarifs={tarifs} onOpenDossier={()=>{setOpenId(memberSel.dossierId);setMemberSel(null);}}/>
    </DetailModal>}
  </div>;
}

function PermFiche({e,open,onToggle,onUpd,tarifs,onMemberSel}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(e);
  useEffect(()=>{setDraft(e);setEditing(false);},[e.id,e]);
  const membres=membresDossier(e);
  const isFamille=membres.length>1;
  const totalMembres=membres.length;
  const aDesMembres=isFamille;
  const dossierTitle=isFamille?`Famille ${e.nomFamille||e.nom}`:`${e.prenom} ${e.nom}`;
  const membresAttestation=membresAttestationDossier(e);
  const canAttestation=membresAttestation.length>0;
  const certifNeed=e.certifNeeded;
  const datesEch=e.datesEcheances;
  const echeances=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  const modeObj=getModesPaiement(tarifs).find(m=>paymentIds(e).includes(m.id)&&m.fractionnable)||getModesPaiement(tarifs).find(m=>m.id===e.modePaiement);

  // Documents avec ✓ ou â—‹ — k = clé dans l'entry pour toggle
  const docs=getPieces(tarifs)
    .filter(p=>pieceVisible(p,e,certifNeed,aDesMembres))
    .map(p=>({l:p.label,k:p.id,ok:e[p.id]||e.piecesFournies?.[p.id],req:true}));
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);

  const action=async(patch)=>{
    await onUpd(e.id,patch);
  };
  const statusPatch=k=>dossierStatusPatch(k,e);
  const updDraft=(k,v)=>setDraft(p=>({...p,[k]:v}));
  const saveDraft=async()=>{
    await onUpd(e.id,recalcDossierPrix(draft,tarifs));
    setEditing(false);
  };

  return<div style={{background:C.W,borderRadius:10,marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",overflow:"hidden"}}>
    {/* Ligne principale (toujours visible) */}
    <div onClick={onToggle} style={{padding:"12px 14px",cursor:"pointer"}}>
      <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"52px minmax(0,1fr) auto":"minmax(0,1fr) auto",alignItems:"center",gap:10}}>
        {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:52,height:52,borderRadius:12,objectFit:"cover",border:`2px solid ${C.J}`}}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:900,fontSize:16,color:C.N}}>{dossierTitle}</div>
          {isFamille&&<div style={{fontSize:11,color:C.G,fontWeight:800,marginTop:2}}>Dossier principal : {e.prenom} {e.nom}</div>}
          <div style={{fontSize:12,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{background:C.N,color:C.J,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{adminCatValue(e)}</span>
            <span style={{background:C.Gc,color:C.G,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{structureType(e)}</span>
            {aDesMembres&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{totalMembres} membres</span>}
            {certifNeed&&<span style={{background:"#fee2e2",color:C.R,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>🩺</span>}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:C.J}}>{calcTotalDossier(e)} €</div>
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
          <div style={{fontSize:10,color:"#9ca3af",marginTop:3}}>{fmtD(e.datePreinscription)}</div>
        </div>
      </div>
      {isFamille&&<div style={{marginTop:8,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px"}}>
        <div style={{fontSize:12,fontWeight:950,color:C.N,marginBottom:2}}>Famille {e.nomFamille||e.nom}</div>
        <div style={{fontSize:11,fontWeight:900,color:C.G,marginBottom:5}}>{membres.length} membres inscrits dans ce dossier - cliquez sur un membre</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:6}}>
          {membres.map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={ev=>{ev.stopPropagation();onMemberSel?.(m);}} style={{background:m.idx===0?C.N:"#fff",color:m.idx===0?C.J:C.N,border:`1px solid ${m.idx===0?C.N:C.Gb}`,borderRadius:8,padding:"6px 8px",fontSize:11,fontWeight:800,cursor:"pointer",textAlign:"left",display:"grid",gridTemplateColumns:m.photoBase64?"28px minmax(0,1fr)":"minmax(0,1fr)",gap:7,alignItems:"center"}}>
            {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:28,height:28,borderRadius:7,objectFit:"cover"}}/>}
            <span>{m.prenom} {m.nom} - {adminCatValue(m)}</span>
          </button>)}
        </div>
      </div>}
      <div onClick={ev=>ev.stopPropagation()} style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6,marginTop:10}}>
        {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>action(statusPatch(k))} style={{border:`2px solid ${active?v.c:C.Gb}`,background:active?v.bg:C.W,color:active?v.c:C.G,borderRadius:8,padding:"7px 5px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:44}}>{v.i} {v.l}{k==="valide"&&<span style={{display:"block",fontSize:9}}>payé</span>}</button>;})}
      </div>
      <div style={{fontSize:10,color:C.G,marginTop:5,fontWeight:700}}>Enregistrement automatique au clic</div>
    </div>

    {/* Détail dépliable */}
    {open&&<div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.Gc}`}}>
      {/* Paiement détaillé */}
      <div style={{background:C.N,borderRadius:8,padding:"10px 12px",marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
          <span style={{color:"#9ca3af"}}>Paiement</span>
          <span style={{color:C.W,fontWeight:700}}>{e.nbFois>1?`${e.nbFois}x versements`:""}</span>
        </div>
        <PaymentSummary e={e} tarifs={tarifs} dark total={calcTotalDossier(e)}/>
        {echeances&&datesEch&&<div style={{borderTop:"1px solid #333",paddingTop:6,marginTop:4}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
            <span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"Chèque":"Versement"} {i+1} ({datesEch[i]?fmtD(datesEch[i]):"?"})</span>
            <span style={{color:C.J,fontWeight:700}}>{m} €</span>
          </div>)}
        </div>}
      </div>

      {/* Coordonnées */}
      <div style={{background:C.Gc,borderRadius:8,padding:"10px 12px",marginTop:8}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>Contact</p>
        <div style={{fontSize:13,lineHeight:1.6}}>
          <div>{e.adresse}, {e.codePostal} {e.ville}</div>
          {e.isMajeur?<>
            <div>📱 <a href={`tel:${e.telephone}`}>{e.telephone}</a></div>
            <div>📧 <a href={`mailto:${e.email}`}>{e.email}</a></div>
          </>:<>
            {(e.representants||[]).filter(r=>r.nom).map((r,i)=><div key={i} style={{padding:"4px 0"}}>
              <strong>{r.lien||"Resp."} :</strong> {r.prenom} {r.nom}<br/>
              📱 <a href={`tel:${r.tel}`}>{r.tel}</a> · 📧 <a href={`mailto:${r.email}`}>{r.email}</a>
            </div>)}
          </>}
        </div>
      </div>

      <div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <button onClick={()=>setEditing(v=>!v)} style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}}>{editing?"Fermer la modification":"Modifier dossier et membres"}</button>
        {editing&&<div style={{marginTop:10}}>
          <FamilyMembersAdminEditor draft={draft} setDraft={setDraft} tarifs={tarifs} saison={e.saison||SAISON_DEFAUT} compact/>
          <div style={{marginTop:10}}><PaymentSplitEditor draft={draft} setDraft={setDraft} tarifs={tarifs} total={calcTotalDossier(recalcDossierPrix(draft,tarifs))} compact/></div>
          <button onClick={saveDraft} style={{...BP,width:"100%",marginTop:6,fontSize:13}}>💾 Enregistrer les infos</button>
        </div>}
      </div>

      {/* Documents — cochables directement */}
      <div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 8px",textTransform:"uppercase"}}>Documents fournis (cliquez pour cocher)</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {docs.map((d,i)=><button key={i} onClick={ev=>{ev.stopPropagation();action({[d.k]:!d.ok,piecesFournies:{...(e.piecesFournies||{}),[d.k]:!d.ok}});}} style={{background:d.ok?"#dcfce7":d.req?"#fee2e2":C.Gc,color:d.ok?C.V:d.req?C.R:C.G,padding:"6px 10px",borderRadius:6,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",minHeight:32}}>
            {d.ok?"✓":"o"} {d.l}
          </button>)}
        </div>
      </div>

      {/* Membres famille (rapide) */}
      {aDesMembres&&<div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:13,fontWeight:950,color:C.N,margin:"0 0 2px"}}>Famille {e.nomFamille||e.nom}</p>
        {membresAttestation.length>0?<>
          <p style={{fontSize:11,fontWeight:800,color:C.G,margin:"0 0 8px",textTransform:"uppercase"}}>Cliquez sur un membre pour son attestation</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:7}}>
            {membresAttestation.map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={()=>printAttestation(attestationEntryForMember(m,tarifs),tarifs)} style={{background:m.idx===0?C.N:C.Gc,color:m.idx===0?C.J:C.N,border:`1px solid ${m.idx===0?C.N:C.Gb}`,borderRadius:8,padding:"7px 8px",fontSize:12,fontWeight:900,textAlign:"left",cursor:"pointer",fontFamily:FONT}}>
              {m.prenom} {m.nom}<br/><span style={{fontSize:11,color:m.idx===0?C.J:C.G}}>{adminCatValue(m)} · {m.prix||0} €</span>
            </button>)}
          </div>
        </>:<p style={{fontSize:12,color:C.V,fontWeight:850,margin:"6px 0 0"}}>Attestation non nécessaire : licence dirigeant gratuite.</p>}
      </div>}

      {/* Allergies */}
      {e.allergiesAsthme&&<div style={{background:"#fffbeb",borderRadius:8,padding:"8px 12px",marginTop:8,border:"1px solid #fcd34d",fontSize:12}}>
        <strong>🌿 Allergies/asthme :</strong> {e.allergiesAsthme}
      </div>}

      {e.commentaire&&<div style={{background:"#dbeafe",borderRadius:8,padding:"8px 12px",marginTop:8,border:"1px solid #93c5fd",fontSize:12}}>
        <strong>💬 Message :</strong> {e.commentaire}
      </div>}

      {/* Notes secrétariat — éditables */}
      <PermNotes e={e} onUpd={onUpd}/>

      <div style={{marginTop:14,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px"}}>
        <p style={{fontSize:11,fontWeight:900,color:C.G,margin:"0 0 8px",textTransform:"uppercase"}}>Statut du dossier</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
          {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>action(statusPatch(k))} style={{padding:"10px 6px",background:active?v.bg:"#fff",color:active?v.c:C.G,border:`2px solid ${active?v.c:C.Gb}`,borderRadius:10,fontWeight:900,fontSize:12,cursor:"pointer",minHeight:58}}>
            <span style={{display:"block",fontSize:18}}>{v.i}</span>{v.l}{k==="valide"&&<span style={{display:"block",fontSize:10}}>payé</span>}
          </button>;})}
        </div>
      </div>
      {(e.statut==="paye"||e.statut==="valide")&&canAttestation&&<div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={()=>printAttestation(attestationEntryForMember(membresAttestation[0],tarifs),tarifs)} style={{...BS,flex:1,fontSize:12}}>📄 Attestation</button>
        <button onClick={()=>prepareAttestationEmail(e,tarifs)} style={{...BS,flex:1,fontSize:12}}>📧 Email</button>
      </div>}
      <button onClick={()=>printFiche(e)} style={{...BS,width:"100%",marginTop:8,fontSize:13}}>Imprimer fiche complete</button>
    </div>}
  </div>;
}

function BoutiquePilotage({rows,allRows,stats,articles,search,setSearch,statut,setStatut,categorie,setCategorie,article,setArticle,categories,onUpdate,onSelect,onExport,exporting}){
  const [open,setOpen]=useState(null);
  const [catFoot,setCatFoot]=useState("toutes");
  const playerCats=sortCats([...new Set(allRows.map(({entry:e})=>adminCatValue(e)||e.categorie||"Sans catégorie"))]);
  const visibleRows=catFoot==="toutes"?rows:rows.filter(({entry:e})=>(adminCatValue(e)||e.categorie||"Sans catégorie")===catFoot);
  const totalFiltered=visibleRows.reduce((s,{achat:a})=>s+achatTotal(a),0);
  const byArticle={};
  const byPlayerCat={};
  allRows.forEach(({achat:a})=>{const k=a.articleId||a.nom;if(!byArticle[k])byArticle[k]={nom:a.nom,categorie:getAchatCategorie(a,articles),qte:0,total:0};byArticle[k].qte+=(parseInt(a.quantite)||1);byArticle[k].total+=achatTotal(a);});
  allRows.forEach(({entry:e,achat:a})=>{
    const k=e.categorie||"Sans catégorie";
    if(!byPlayerCat[k])byPlayerCat[k]={categorie:k,lignes:0,qte:0,total:0,aRegler:0};
    byPlayerCat[k].lignes+=1;
    byPlayerCat[k].qte+=(parseInt(a.quantite)||1);
    byPlayerCat[k].total+=achatTotal(a);
    if((a.statut||"a_regler")==="a_regler")byPlayerCat[k].aRegler+=1;
  });
  const setStatus=(entry,achat,st)=>{
    const patch={statut:st};
    const today=new Date().toISOString();
    if(st==="commande"&&!achat.dateCommande)patch.dateCommande=today;
    if(st==="recu"&&!achat.dateReception)patch.dateReception=today;
    if(st==="livre"&&!achat.dateLivraison)patch.dateLivraison=today;
    onUpdate(entry.id,achat.id,patch);
  };
  const exportRows=async(list,label)=>{
    const rowsX=list.map(r=>boutiqueExportRow(r,articles));
    await exportXLSX([{name:"Boutique",rows:[H_BOUTIQUE,...rowsX]}],`RSG_Boutique_${safeFileName(label)}.xlsx`);
  };
  const patchArticle=(entry,achat,articleId)=>{
    const art=articles.find(a=>a.id===articleId);
    if(!art)return;
    const taille=(art.tailles||[]).includes(achat.taille)?achat.taille:(art.tailles?.[0]||"");
    const q=Math.max(1,parseInt(achat.quantite)||1);
    const initiales=canInitialesBoutique(art)?(achat.initialesTexte||""):"";
    const supplementInitiales=initiales?q*(achat.coutInitiales||3):0;
    onUpdate(entry.id,achat.id,{articleId:art.id,nom:art.nom,categorie:art.categorie||"Commande spéciale",taille,prix:art.prix||0,imageBase64:art.imageBase64||"",initialesTexte:initiales,supplementInitiales,total:q*(art.prix||0)+supplementInitiales});
  };
  return<div style={{marginTop:18}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
      {[{l:"Lignes",v:stats.total,c:C.N},{l:"Montant",v:`${stats.montant} €`,c:C.Jd},{l:"À régler",v:stats.aRegler,c:"#ca8a04"},{l:"À livrer",v:stats.aLivrer,c:"#0891b2"}].map(s=><div key={s.l} style={{background:C.W,border:`1.5px solid ${s.c}44`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:C.G}}>{s.l}</div>
      </div>)}
    </div>
    <div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 10px"}}>Pilotage boutique</p>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <input style={{...inp(),fontSize:13}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher personne, article, taille..."/>
        <select style={{...inp(),fontSize:13}} value={statut} onChange={e=>setStatut(e.target.value)}><option value="tous">Tous statuts</option>{Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
        <select style={{...inp(),fontSize:13}} value={categorie} onChange={e=>setCategorie(e.target.value)}><option value="tous">Toutes catégories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select style={{...inp(),fontSize:13}} value={article} onChange={e=>setArticle(e.target.value)}><option value="tous">Tous articles</option>{articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select>
        <select style={{...inp(),fontSize:13}} value={catFoot} onChange={e=>setCatFoot(e.target.value)}><option value="toutes">Toutes catégories foot</option>{playerCats.map(c=><option key={c} value={c}>{c}</option>)}</select>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button style={{...BS,fontSize:12,padding:"8px 12px"}} onClick={()=>exportRows(allRows,"toutes_categories")} disabled={exporting||!allRows.length}>Export all</button>
        <button style={{...BS,fontSize:12,padding:"8px 12px"}} onClick={()=>exportRows(visibleRows,catFoot==="toutes"?"filtre":"categorie_"+catFoot)} disabled={exporting||!visibleRows.length}>{catFoot==="toutes"?"Export affiché":"Export catégorie"}</button>
        <span style={{fontSize:12,color:C.G}}>{visibleRows.length} ligne(s) affichée(s) · {totalFiltered} €</span>
      </div>
    </div>
    {Object.values(byArticle).length>0&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 8px"}}>Synthèse articles</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.values(byArticle).map(a=><span key={a.nom} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:7,padding:"6px 9px",fontSize:12,fontWeight:700}}>{a.categorie} · {a.nom} · {a.qte} · {a.total} €</span>)}</div>
    </div>}
    {Object.values(byPlayerCat).length>0&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 8px"}}>Commandes par catégorie de joueurs</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
        {Object.values(byPlayerCat).sort((a,b)=>catRank(a.categorie)-catRank(b.categorie)||a.categorie.localeCompare(b.categorie)).map(c=><div key={c.categorie} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontWeight:900,color:C.N,fontSize:13}}>{c.categorie}</div>
          <div style={{fontSize:12,color:C.G,marginTop:3}}>{c.qte} article(s) · {c.total} €</div>
          {c.aRegler>0&&<div style={{fontSize:11,color:"#ca8a04",fontWeight:800,marginTop:3}}>{c.aRegler} à régler</div>}
        </div>)}
      </div>
    </div>}
    <div style={{background:C.W,borderRadius:10,border:`1px solid ${C.Gb}`,overflow:"hidden"}}>
      {visibleRows.length===0&&<p style={{fontSize:13,color:C.G,padding:16,margin:0}}>Aucun achat boutique pour ces filtres.</p>}
      {visibleRows.map(({entry:e,achat:a})=>{const st=STATUTS_BOUTIQUE[a.statut||"a_regler"]||STATUTS_BOUTIQUE.a_regler;const isOpen=open===a.id;const art=articles.find(x=>x.id===a.articleId)||articles.find(x=>x.nom===a.nom);return <div key={`${e.id}-${a.id}`} style={{borderBottom:`1px solid ${C.Gc}`}}>
        <div style={{display:"grid",gridTemplateColumns:"auto 1.2fr .9fr auto",gap:10,alignItems:"center",padding:"10px 12px"}}>
          {a.imageBase64?<img src={a.imageBase64} alt={a.nom} style={{width:46,height:46,objectFit:"cover",borderRadius:7,border:`1px solid ${C.Gb}`}}/>:<div style={{width:46,height:46,borderRadius:7,background:C.Gc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:C.G}}>IMG</div>}
          <div style={{minWidth:0}}><div style={{fontWeight:900,fontSize:13}}>{a.nom} {a.taille?`· ${a.taille}`:""}</div><div style={{fontSize:12,color:C.G}}>{getAchatCategorie(a,articles)} · {a.quantite||1} x {a.prix||0} €{a.initialesTexte?` · Initiales ${a.initialesTexte} (+${a.supplementInitiales||0} €)`:""} = <strong>{achatTotal(a)} €</strong></div></div>
          <button onClick={()=>onSelect(e)} style={{background:"transparent",border:"none",textAlign:"left",cursor:"pointer",padding:0,display:"grid",gridTemplateColumns:e.photoBase64?"minmax(0,1fr) 34px":"minmax(0,1fr)",gap:8,alignItems:"center"}}>
            <div><div style={{fontWeight:800,fontSize:13,color:C.N}}>{e.prenom} {e.nom}</div><div style={{fontSize:11,color:C.G}}>{adminCatValue(e)||e.categorie} · {getTelContact(e)||getEmailContact(e)||e.id}</div></div>
            {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:34,height:34,borderRadius:8,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
          </button>
          <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"flex-end",flexWrap:"wrap"}}>
            <select value={a.statut||"a_regler"} onChange={ev=>setStatus(e,a,ev.target.value)} style={{fontSize:11,border:`1px solid ${st.c}`,background:st.bg,color:st.c,borderRadius:6,padding:"5px 7px",fontWeight:800}}>{Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
            <button onClick={()=>setOpen(isOpen?null:a.id)} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 8px",fontSize:12,cursor:"pointer"}}>{isOpen?"Fermer":"Details"}</button>
          </div>
        </div>
        {isOpen&&<div style={{background:"#fafafa",padding:"10px 12px",borderTop:`1px solid ${C.Gc}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1.2fr .9fr .65fr .65fr",gap:8,marginBottom:8}}>
            <F label="Article"><select style={inp()} value={a.articleId||art?.id||""} onChange={ev=>patchArticle(e,a,ev.target.value)}>{articles.map(x=><option key={x.id} value={x.id}>{x.nom} · {x.prix} €</option>)}</select></F>
            <F label="Taille"><select style={inp()} value={a.taille||""} onChange={ev=>onUpdate(e.id,a.id,{taille:ev.target.value})}>{((art?.tailles?.length?art.tailles:[a.taille||""]).filter(Boolean)).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
            <F label="Quantité"><input type="number" min={1} style={inp()} value={a.quantite||1} onChange={ev=>{const q=Math.max(1,parseInt(ev.target.value)||1);const supplement=a.initialesTexte?q*(a.coutInitiales||3):0;onUpdate(e.id,a.id,{quantite:q,supplementInitiales:supplement,total:q*(a.prix||0)+supplement});}}/></F>
            <F label="Prix unit."><input type="number" min={0} style={inp()} value={a.prix||0} onChange={ev=>{const prix=Math.max(0,parseInt(ev.target.value)||0);const q=Math.max(1,parseInt(a.quantite)||1);onUpdate(e.id,a.id,{prix,total:q*prix+(a.supplementInitiales||0)});}}/></F>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
            <F label="Commande"><input type="date" style={inp()} value={(a.dateCommande||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateCommande:ev.target.value})}/></F>
            <F label="Réception"><input type="date" style={inp()} value={(a.dateReception||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateReception:ev.target.value})}/></F>
            <F label="Livraison"><input type="date" style={inp()} value={(a.dateLivraison||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateLivraison:ev.target.value})}/></F>
            <F label="Initiales"><input style={inp()} value={a.initialesTexte||""} onChange={ev=>{const initiales=ev.target.value.toUpperCase().slice(0,6);const q=Math.max(1,parseInt(a.quantite)||1);const supplement=initiales?q*(a.coutInitiales||3):0;onUpdate(e.id,a.id,{initialesTexte:initiales,supplementInitiales:supplement,total:q*(a.prix||0)+supplement});}} disabled={art&&!canInitialesBoutique(art)}/></F>
          </div>
          <F label="Note de suivi"><textarea style={{...inp(),height:58,resize:"vertical"}} value={a.note||""} onChange={ev=>onUpdate(e.id,a.id,{note:ev.target.value})} placeholder="Ex: taille à confirmer, fournisseur relancé, parent prévenu..."/></F>
        </div>}
      </div>;})}
    </div>
  </div>;
}

function BoutiqueAchats({e,onUpd,tarifs}){
  const articles=getBoutique(tarifs).filter(a=>a.actif!==false);
  const categories=[...new Set(articles.map(a=>a.categorie||"Commande spéciale"))].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const [categorie,setCategorie]=useState(categories[0]||"");
  const articlesCat=articles.filter(a=>(a.categorie||"Commande spéciale")===categorie);
  const [articleId,setArticleId]=useState(articlesCat[0]?.id||articles[0]?.id||"");
  const article=articles.find(a=>a.id===articleId)||articlesCat[0]||articles[0];
  const [taille,setTaille]=useState(article?.tailles?.[0]||"");
  const [quantite,setQuantite]=useState(1);
  const [contexte,setContexte]=useState((e.statut==="paye"||e.statut==="valide")?"saison":"permanence");
  const [initialesTexte,setInitialesTexte]=useState("");
  const [open,setOpen]=useState(false);
  useEffect(()=>{setCategorie(categories[0]||"");},[tarifs]);
  useEffect(()=>{setArticleId((articles.filter(a=>(a.categorie||"Commande spéciale")===categorie)[0]||articles[0])?.id||"");},[categorie,tarifs]);
  useEffect(()=>{setTaille(article?.tailles?.[0]||"");},[articleId,tarifs]);
  useEffect(()=>{if(!canInitialesBoutique(article))setInitialesTexte("");},[articleId,tarifs]);
  useEffect(()=>{setContexte((e.statut==="paye"||e.statut==="valide")?"saison":"permanence");},[e.id,e.statut]);
  const achats=e.achatsBoutique||[];
  const total=calcBoutiqueTotal(achats);
  const totalSaison=calcBoutiqueSaisonTotal(achats);
  const saveAchats=async next=>{
    const achatsNext=(e.statut==="paye"||e.statut==="valide")?markBoutiqueAchatsRegles(next):next;
    await onUpd(e.id,{achatsBoutique:achatsNext,boutiqueTotal:calcBoutiqueTotal(achatsNext)});
  };
  const add=async()=>{
    if(!article)return;
    const q=Math.max(1,parseInt(quantite)||1);
    const initiales=canInitialesBoutique(article)?String(initialesTexte||"").trim().toUpperCase():"";
    const supplementInitiales=initiales?q*getCoutInitiales(tarifs):0;
    const ligne={id:`achat_${Date.now()}`,articleId:article.id,nom:article.nom,categorie:article.categorie||"Commande spéciale",taille,quantite:q,prix:article.prix||0,initialesTexte:initiales,coutInitiales:getCoutInitiales(tarifs),supplementInitiales,total:q*(article.prix||0)+supplementInitiales,statut:"a_regler",contexte,date:new Date().toISOString()};
    ligne.imageBase64=article.imageBase64||"";
    await saveAchats([...achats,ligne]);
    setInitialesTexte("");
    setOpen(false);
  };
  const updateAchat=(id,patch)=>saveAchats(achats.map(a=>a.id===id?{...a,...patch}:a));
  return<div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"8px 10px",marginTop:8}}>
    <button onClick={()=>setOpen(v=>!v)} style={{width:"100%",border:"none",background:"transparent",padding:"4px 0",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,cursor:"pointer",fontFamily:FONT,textAlign:"left"}}>
      <span style={{fontSize:13,fontWeight:950,color:C.N}}>Boutique</span>
      <span style={{fontSize:12,fontWeight:900,color:open?"#92400e":C.B}}>{open?"Fermer":"Ajouter un achat"}</span>
    </button>
    {(achats.length>0||totalSaison>0)&&<div style={{fontSize:11,color:C.G,margin:"2px 0 6px"}}>
      {achats.length} article(s) · permanence {total} €{totalSaison>0?` · saison ${totalSaison} €`:""}
    </div>}
    {open&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",marginTop:8}}>
    {articles.length===0?<p style={{fontSize:12,color:"#92400e",margin:0}}>Aucun article actif configuré.</p>:<>
      {article&&<div style={{display:"flex",gap:10,alignItems:"center",background:C.W,borderRadius:8,padding:"8px 10px",marginBottom:8,border:"1px solid #fcd34d"}}>
        {article.imageBase64?<img src={article.imageBase64} alt={article.nom} style={{width:54,height:54,objectFit:"cover",borderRadius:8,border:`1px solid ${C.Gb}`}}/>:<div style={{width:54,height:54,borderRadius:8,background:C.Gc,border:`1px dashed ${C.Gb}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.G}}>IMG</div>}
        <div style={{minWidth:0}}>
          <div style={{fontWeight:800,fontSize:13,color:C.N}}>{article.nom}</div>
          <div style={{fontSize:11,color:C.G}}>{article.categorie||"Commande spéciale"}</div>
          <div style={{fontSize:12,color:"#92400e",fontWeight:700}}>{article.prix||0} €</div>
        </div>
      </div>}
      <F label="Type d'achat"><select style={{...inp(),fontSize:13}} value={contexte} onChange={ev=>setContexte(ev.target.value)}>
        <option value="permanence">Permanence licence : ajouté au règlement licence + boutique</option>
        <option value="saison">Commande saison : règlement séparé de la licence</option>
      </select></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr .8fr .55fr",gap:6}}>
        <F label="Catégorie produit"><select style={{...inp(),fontSize:13}} value={categorie} onChange={ev=>setCategorie(ev.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></F>
        <F label="Article"><select style={{...inp(),fontSize:13}} value={articleId} onChange={ev=>setArticleId(ev.target.value)}>{(articlesCat.length?articlesCat:articles).map(a=><option key={a.id} value={a.id}>{a.nom} · {a.prix} €</option>)}</select></F>
        <F label="Taille / option"><select style={{...inp(),fontSize:13}} value={taille} onChange={ev=>setTaille(ev.target.value)}>{(article?.tailles||[""]).map(t=><option key={t} value={t}>{t||"Sans taille"}</option>)}</select></F>
        <F label="Qté"><input type="number" min={1} style={{...inp(),fontSize:13}} value={quantite} onChange={ev=>setQuantite(ev.target.value)}/></F>
      </div>
      {article&&canInitialesBoutique(article)&&<F label={`Initiales sur cet article (+${getCoutInitiales(tarifs)} € par équipement)`} span>
        <input style={{...inp(),fontSize:13}} value={initialesTexte} onChange={ev=>setInitialesTexte(ev.target.value.toUpperCase().slice(0,6))} placeholder="Ex: PB"/>
      </F>}
      <button style={{...BP,width:"100%",fontSize:12,padding:"8px 12px",marginTop:8,minHeight:38}} onClick={add}>+ Ajouter au dossier</button>
    </>}
    </div>}
    {achats.length>0&&<div style={{marginTop:8,borderTop:`1px solid ${C.Gc}`,paddingTop:6}}>
      {achats.map(a=>{const st=STATUTS_BOUTIQUE[a.statut||"a_regler"]||STATUTS_BOUTIQUE.a_regler;return <div key={a.id} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"center",gap:8,fontSize:12,padding:"6px 0",borderBottom:`1px dashed #fcd34d`}}>
        {a.imageBase64&&<img src={a.imageBase64} alt={a.nom} style={{width:34,height:34,objectFit:"cover",borderRadius:6,border:`1px solid ${C.Gb}`,flexShrink:0}}/>}
        <div style={{minWidth:0}}>
          <div>{a.quantite}x {a.nom}{a.taille?` (${a.taille})`:""} · {a.prix} €</div>
          {a.initialesTexte&&<div style={{fontSize:11,color:"#92400e",fontWeight:800}}>Initiales : {a.initialesTexte} (+{a.supplementInitiales||0} €)</div>}
          <div style={{fontSize:11,color:C.G}}>{getAchatCategorie(a,articles)} · {isAchatSaison(a)?"Commande saison séparée":"Permanence licence"}</div>
          <select value={a.statut||"a_regler"} onChange={ev=>updateAchat(a.id,{statut:ev.target.value})} style={{marginTop:4,fontSize:11,border:`1px solid ${st.c}`,background:st.bg,color:st.c,borderRadius:5,padding:"3px 6px",fontWeight:700,maxWidth:"100%"}}>
            {Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,color:"#92400e"}}>{achatTotal(a)} €</div>
          <button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:5,padding:"3px 7px",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:4}} onClick={()=>saveAchats(achats.filter(x=>x.id!==a.id))}>Supprimer</button>
        </div>
      </div>;})}
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:13,paddingTop:6,borderTop:"1px dashed #fcd34d",color:"#92400e"}}>
        <span>Boutique permanence licence</span><span>{total} €</span>
      </div>
      {totalSaison>0&&<div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:13,paddingTop:5,color:"#0369a1"}}>
        <span>Commandes saison séparées</span><span>{totalSaison} €</span>
      </div>}
    </div>}
  </div>;
}

// Notes éditables pour le mode Permanence
function PermNotes({e,onUpd}){
  const [note,setNote]=useState(e.notes||"");
  const [saving,setSaving]=useState(false);
  const [edited,setEdited]=useState(false);
  useEffect(()=>{setNote(e.notes||"");setEdited(false);},[e.id,e.notes]);
  const save=async()=>{
    setSaving(true);
    await onUpd(e.id,{notes:note});
    setSaving(false);
    setEdited(false);
  };
  return<div style={{background:C.Gc,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px dashed ${C.Gb}`}}>
    <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>Notes secretariat / benevoles</p>
    <textarea style={{...inp(),height:60,resize:"vertical",fontSize:13}} value={note} onChange={ev=>{setNote(ev.target.value);setEdited(true);}} placeholder="Ex: chèque manquant, rappel parent, etc."/>
    {edited&&<button onClick={save} disabled={saving} style={{...BP,fontSize:12,padding:"6px 14px",marginTop:6,opacity:saving?.7:1}}>{saving?"Enregistrement…":"💾 Enregistrer"}</button>}
  </div>;
}

/* â•â• BASE LICENCIÉS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function BaseLicencies({saison,licencies,onSave}){
  const [msg,setMsg]=useState(null);
  const [srch,setSrch]=useState("");
  const [editIdx,setEI]=useState(null);
  const [editRow,setER]=useState(null);
  const fileRefXlsx=useRef();
  const fileRefCsv=useRef();
  const fileRefJson=useRef();

  const cellText=v=>{
    if(v===undefined||v===null)return"";
    if(v instanceof Date)return v.toLocaleDateString("fr-FR");
    return String(v).trim().replace(/^["']|["']$/g,"");
  };
  const headNorm=s=>String(s||"").toLowerCase().replace(/�/g,"e").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/['"]/g,"").replace(/\s+/g," ").trim();

  // Parser CSV/Excel avec reconnaissance des colonnes Footclubs et conservation des autres infos.
  const parseRows=aoa=>{
    const rows=(aoa||[]).map(r=>(r||[]).map(cellText)).filter(r=>r.some(Boolean));
    if(rows.length<2)return[];
    const rawHeaders=rows[0];
    const headers=rawHeaders.map(headNorm);
    const find=(...names)=>headers.findIndex(h=>names.map(headNorm).includes(h));
    const findInc=(fn)=>headers.findIndex(fn);
    const idx={
      nom:find("Nom"),
      prenom:find("Prénom","Prenom"),
      numLicence:find("Numéro licence","Numero licence","N° licence"),
      numPersonne:find("Numéro personne","Numero personne","N° personne"),
      validite:findInc(h=>h.includes("validite certif")||h.includes("certif medic n+1")),
      anneeLastCertif:findInc(h=>!h.includes("validite")&&(h.includes("date certif")||h.includes("visite"))),
      categorie:find("Sous catégorie","Sous categorie"),
      naissance:find("Né(e) le","Ne(e) le","Née le","Nee le"),
      sexe:find("Sexe"),
      email:find("Email principal"),
      tel:find("Mobile personnel"),
      typeLic:find("Type licence"),
      emailRl:find("Email repr légal 1","Email repr legal 1"),
      telRl:find("Tel mobile repr légal 1","Tel mobile repr legal 1"),
      nomRl:find("Nom, prénom repr légal 1","Nom, prenom repr legal 1"),
      emailRl2:find("Email repr légal 2","Email repr legal 2"),
      telRl2:find("Tel mobile repr légal 2","Tel mobile repr legal 2"),
      nomRl2:find("Nom, prénom repr légal 2","Nom, prenom repr legal 2"),
      civilite:find("Civilité","Civilite"),
      lieuNaissance:find("Lieu de naissance"),
      nationalite:find("Nationalité","Nationalite"),
      statutPhoto:find("Statut photo"),
      complement:find("Complément","Complement"),
      voie:find("Voie-rue","Voie rue"),
      lieuDit:find("Lieu-dit","Lieu dit"),
      codePostal:find("Code postal"),
      ville:find("Bureau distributeur_2","Bureau distributeur"),
      pays:find("Pays ou DOM-TOM","Pays"),
      enregistrement:find("Enregistrement"),
      editionLicence:find("Date édition licence","Date edition licence"),
      statut:find("Statut"),
      natureChangement:find("Nature changement de club"),
      natureDemande:find("Nature de demande"),
      prixApplique:find("Prix appliqué","Prix applique"),
      prixClub:find("Prix club"),
      montantReglement:find("Montant règlement","Montant reglement"),
      etatReglement:find("Etat règlement","Etat reglement"),
      dateReglement:find("Date règlement","Date reglement"),
      modeReglement:find("Mode de règlement","Mode de reglement"),
      telDom:find("Téléphone domicile","Telephone domicile"),
      telTravail:find("Téléphone travail","Telephone travail"),
      telAutre:find("Téléphone autre","Telephone autre"),
      emailAutre:find("Email autre"),
    };
    const mapCat=sc=>{
      if(!sc)return"";
      if(/dirigeant/i.test(sc))return"Dirigeant";
      if(/educateur|éducateur|régional|regional/i.test(sc))return"Educateur";
      if(/senior/i.test(sc))return"Senior";
      if(/vétéran|veteran/i.test(sc))return"Senior";
      const m=sc.match(/U(\d+)/i);
      if(m){const n=+m[1];if(n<=7)return"U6-U7";if(n<=9)return"U8-U9";if(n<=11)return"U10-U11";if(n<=13)return"U12-U13";if(n<=15)return"U14-U15";if(n<=18)return"U16-U17-U18";return"Senior";}
      return"";
    };
    return rows.slice(1).map(cells=>{
      const validite=idx.validite>=0?cells[idx.validite]:"";
      const sousCat=idx.categorie>=0?cells[idx.categorie]:"";
      const naissRaw=idx.naissance>=0?cells[idx.naissance]:"";
      let naissISO="";
      if(naissRaw){const m=naissRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);if(m)naissISO=`${m[3].padStart(4,"20")}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
      let cm=null;
      if(validite){if(/non\s*valide/i.test(validite))cm=true;else if(/valide/i.test(validite))cm=false;}
      const val=k=>idx[k]>=0?cells[idx[k]]||"":"";
      const adresse=[val("complement"),val("voie"),val("lieuDit")].filter(Boolean).join(" ");
      const extra={};
      [
        ["Civilité","civilite"],["Lieu de naissance","lieuNaissance"],["Nationalité","nationalite"],["Adresse",null,adresse],
        ["Code postal","codePostal"],["Ville","ville"],["Pays","pays"],["Statut photo","statutPhoto"],
        ["Enregistrement","enregistrement"],["Date édition licence","editionLicence"],["Statut licence","statut"],
        ["Changement club","natureChangement"],["Demande","natureDemande"],["Prix appliqué","prixApplique"],
        ["Prix club","prixClub"],["Montant règlement","montantReglement"],["État règlement","etatReglement"],
        ["Date règlement","dateReglement"],["Mode règlement","modeReglement"],["Tél domicile","telDom"],
        ["Tél travail","telTravail"],["Tél autre","telAutre"],["Email autre","emailAutre"],
        ["Représentant légal 2","nomRl2"],["Tél repr légal 2","telRl2"],["Email repr légal 2","emailRl2"],
      ].forEach(([label,key,direct])=>{const v=direct??val(key);if(v)extra[label]=v;});
      return{
        n:val("nom").toUpperCase(),
        p:val("prenom"),
        l:idx.numLicence>=0?cells[idx.numLicence]||"":"",
        np:idx.numPersonne>=0?cells[idx.numPersonne]||"":"",
        c:mapCat(sousCat),sc:sousCat,
        tl:idx.typeLic>=0?cells[idx.typeLic]||"":"",
        cm,dn:naissISO,
        s:val("sexe"),
        em:val("email"),
        tel:val("tel"),
        em2:val("emailRl"),
        tel2:val("telRl"),
        rl:val("nomRl"),
        ln:val("lieuNaissance"),
        nat:val("nationalite"),
        adr:adresse,
        cp:val("codePostal"),
        ville:val("ville"),
        extra,
      };
    }).filter(r=>r.n||r.p||r.l);
  };

  const parseCSV=text=>{
    const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];
    const sep=lines[0].includes(";")?";":",";
    return parseRows(lines.map(line=>line.split(sep)));
  };

  const handleFileXlsx=file=>{
    if(!file)return;
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const XLSX=await loadXLSX();
        const wb=XLSX.read(ev.target.result,{type:"array",cellDates:false});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""});
        const rows=parseRows(aoa);
        if(!rows.length){setMsg({ok:false,txt:"Format Excel Footclubs non reconnu."});return;}
        await onSave(rows);
        setMsg({ok:true,txt:`✅ ${rows.length} licencié(s) importé(s) depuis Excel Footclubs avec toutes les colonnes disponibles.`});
      }catch(e){setMsg({ok:false,txt:"Erreur Excel : "+e.message});}
    };
    r.readAsArrayBuffer(file);
  };

  const handleFileCsv=file=>{
    if(!file)return;
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const rows=parseCSV(ev.target.result);
        if(!rows.length){setMsg({ok:false,txt:"Format CSV non reconnu."});return;}
        await onSave(rows);
        setMsg({ok:true,txt:`✅ ${rows.length} licencié(s) importé(s) depuis le CSV.`});
      }catch(e){setMsg({ok:false,txt:"Erreur CSV : "+e.message});}
    };
    r.readAsText(file,"UTF-8");
  };

  const handleFileJson=file=>{
    if(!file)return;
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const json=JSON.parse(ev.target.result);
        const lics=Array.isArray(json)?json:(json.licencies||[]);
        if(!lics.length){setMsg({ok:false,txt:"Aucun licencié trouvé dans le JSON."});return;}
        await onSave(lics);
        setMsg({ok:true,txt:`✅ ${lics.length} licencié(s) importé(s) depuis le JSON.`});
      }catch(e){setMsg({ok:false,txt:"Erreur JSON : "+e.message});}
    };
    r.readAsText(file,"UTF-8");
  };

  const addManuel=async()=>{
    const nom=prompt("Nom (majuscules) :");if(!nom)return;
    const prenom=prompt("Prénom :")||"";
    const num=prompt("N° de licence FFF :")||"";
    const certifValide=prompt("Certif valide pour la prochaine saison ?\n  - 'oui' = pas de médecin\n  - 'non' = certif à renouveler\n  - vide = inconnu");
    let cm=null;
    if(certifValide&&/^non/i.test(certifValide))cm=true;
    else if(certifValide&&/^oui/i.test(certifValide))cm=false;
    const numPersonne=prompt("N° personne Footclubs (si connu) :")||"";
    const cat=prompt("Catégorie (ex: U13-U14, Senior) :")||"";
    await onSave([...licencies,{n:nom.toUpperCase(),p:prenom,l:num,np:numPersonne,cm,c:cat,tl:"Libre"}]);
    setMsg({ok:true,txt:`✅ ${nom} ${prenom} ajouté(e).`});
  };

  const filtered=srch.length>1?licencies.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""} ${licNumPersonne(l)} ${Object.values(l.extra||{}).join(" ")}`.toLowerCase().includes(srch.toLowerCase())):licencies;

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>👥 Base des licenciés — Saison {saison}</p>
      <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.5}}>
        La base est rattachée à cette saison. À chaque nouvelle saison, elle reste vide tant que vous ne réimportez pas Footclubs.<br/>
        <strong>Pour mettre à jour</strong> : importez directement l'export Excel Footclubs (.xlsx) ou un CSV.<br/>
        Le champ <strong>"Validité Certif Médic N+1"</strong> est automatiquement détecté.
      </p>
    </div>
    <input ref={fileRefXlsx} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={e=>{handleFileXlsx(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={fileRefCsv} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{handleFileCsv(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={fileRefJson} type="file" accept=".json" style={{display:"none"}} onChange={e=>{handleFileJson(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BP,flex:"1 1 180px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefXlsx.current.click()}>📥 Importer Excel Footclubs</button>
      <button style={{...BS,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefCsv.current.click()}>Importer CSV</button>
      <button style={{...BS,flex:"1 1 130px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefJson.current.click()}>📥 Importer JSON</button>
      <button style={{...BS,flex:"1 1 100px",fontSize:13,padding:"10px 14px"}} onClick={addManuel}>＋ Ajouter</button>
      <button style={{...BS,flex:"1 1 130px",fontSize:13,padding:"10px 14px"}} onClick={()=>{
        const blob=new Blob([JSON.stringify({saison,dateExport:new Date().toISOString(),licencies},null,1)],{type:"application/json"});
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`licencies_${saison}.json`;a.click();URL.revokeObjectURL(url);
      }} disabled={!licencies.length}>💾 Exporter JSON</button>
      <button style={{...BS,flex:"1 1 160px",fontSize:13,padding:"10px 14px",background:"#fee2e2",color:C.R,borderColor:"#fca5a5"}} onClick={async()=>{if(window.confirm(`Vider toute la base Footclubs de la saison ${saison} ?`)){await onSave([]);setMsg({ok:true,txt:"Base Footclubs vidée pour cette saison."});}}} disabled={!licencies.length}>Vider la base saison</button>
    </div>
    {msg&&<div style={{background:msg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:msg.ok?C.V:C.R}}>{msg.txt}</div>}
    {licencies.length>0&&<input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`Rechercher parmi ${licencies.length} licencies...`} value={srch} onChange={e=>setSrch(e.target.value)}/>}
    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {licencies.length} licencié(s)</p>
    {licencies.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucun licencié — importez le CSV Footclubs.</p>}
    {filtered.map((l,i)=>{
      const req=certifRequis(l);
      const realIdx=licencies.indexOf(l);
      if(editIdx===realIdx)return<div key={i} style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"12px",marginBottom:6}}>
        <div style={G2}>
          <div><label style={{...lbl,fontSize:11}}>Nom</label><input style={{...inp(),fontSize:13}} value={editRow.n||editRow.nom||""} onChange={e=>setER(p=>({...p,n:e.target.value.toUpperCase()}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>Prénom</label><input style={{...inp(),fontSize:13}} value={editRow.p||editRow.prenom||""} onChange={e=>setER(p=>({...p,p:e.target.value}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>N° licence</label><input style={{...inp(),fontSize:13}} value={editRow.l||editRow.numLicence||""} onChange={e=>setER(p=>({...p,l:e.target.value}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>N° personne</label><input style={{...inp(),fontSize:13}} value={licNumPersonne(editRow)} onChange={e=>setER(p=>({...p,np:e.target.value}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>Certif prochaine saison</label>
            <select style={{...inp(),fontSize:13}} value={editRow.cm===true?"oui":editRow.cm===false?"non":""} onChange={e=>{const v=e.target.value;setER(p=>({...p,cm:v==="oui"?true:v==="non"?false:null}));}}>
              <option value="">— Inconnu</option>
              <option value="oui">🩺 Certif requis</option>
              <option value="non">✅ Certif valide</option>
            </select>
          </div>
          <div><label style={{...lbl,fontSize:11}}>Catégorie</label><input style={{...inp(),fontSize:13}} value={editRow.c||editRow.categorie||""} onChange={e=>setER(p=>({...p,c:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button style={{...BP,fontSize:12,padding:"7px 14px"}} onClick={async()=>{const u=[...licencies];u[realIdx]=editRow;await onSave(u);setEI(null);}}>✓</button>
          <button style={{...BS,fontSize:12,padding:"7px 14px"}} onClick={()=>setEI(null)}>✕</button>
        </div>
      </div>;
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:4,borderLeft:`3px solid ${req===true?C.R:req===false?C.V:C.Gb}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontWeight:700,fontSize:14}}>{l.p||l.prenom} {l.n||l.nom}</span>
          {(l.c||l.categorie)&&<span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{l.c||l.categorie}</span>}
          {l.tl&&l.tl!=="Libre"&&<span style={{marginLeft:6,background:"#ede9fe",color:"#6d28d9",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:600}}>{l.tl}</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3}}>
            {(l.l||l.numLicence)&&<span>N° {l.l||l.numLicence} · </span>}
            {licNumPersonne(l)&&<span>Pers. {licNumPersonne(l)} · </span>}
            {l.dn&&<span>{fmtD(l.dn)} · </span>}
            <span style={{color:req===true?C.R:req===false?C.V:"#9ca3af",fontWeight:600}}>
              {req===true?"Certif a renouveler":req===false?"Certif valide":"?"}
            </span>
          </div>
          {l.em&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,wordBreak:"break-all"}}>📧 {l.em}</div>}
          {(l.tel||l.em2||l.tel2||l.rl)&&<div style={{fontSize:11,color:C.G,marginTop:2,display:"flex",gap:7,flexWrap:"wrap"}}>
            {l.tel&&<span>Tel joueur : {l.tel}</span>}
            {l.rl&&<span>Resp. : {l.rl}</span>}
            {l.em2&&<span>Email resp. : {l.em2}</span>}
            {l.tel2&&<span>Tel resp. : {l.tel2}</span>}
          </div>}
          {Object.keys(l.extra||{}).length>0&&<details style={{marginTop:5}}>
            <summary style={{fontSize:11,color:C.B,fontWeight:800,cursor:"pointer"}}>Autres informations Footclubs</summary>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:5,marginTop:6}}>
              {Object.entries(l.extra).map(([k,v])=><div key={k} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 7px",fontSize:11,color:C.G}}>
                <strong style={{color:C.N}}>{k}</strong><br/>{v}
              </div>)}
            </div>
          </details>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}} onClick={()=>{setEI(realIdx);setER({...l});}}>Modifier</button>
          <button style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",color:C.R}} onClick={async()=>await onSave(licencies.filter((_,j)=>j!==realIdx))}>✕</button>
        </div>
      </div>;
    })}
  </div>;
}

/* â•â• CERTIFS PROCHAINE SAISON â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Certifs2627({licencies,saison}){
  const [filtre,setFiltre]=useState("requis");
  const [srch,setSrch]=useState("");
  const [exporting,setExporting]=useState(false);

  // La colonne "Validité Certif Médic N+1" de Footclubs concerne la saison sélectionnée elle-même
  // (les préinscriptions saisies pour la saison N portent sur la validité du certif pour cette saison N)
  const cible=saison;

  const all=licencies.filter(l=>l.tl!=="Dirigeant");
  const requis=all.filter(l=>certifRequis(l)===true);
  const valides=all.filter(l=>certifRequis(l)===false);

  const liste=filtre==="requis"?requis:filtre==="valides"?valides:all;
  const filtered=srch.length>1?liste.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""}`.toLowerCase().includes(srch.toLowerCase())):liste;

  const getEmail=l=>l.em||l.em2||"";
  const emailsRequis=[...new Set(requis.map(getEmail).filter(e=>e))];

  const copyAll=()=>{
    if(!emailsRequis.length){alert("Aucun email à copier");return;}
    navigator.clipboard.writeText(emailsRequis.join("; "));
    alert(`✅ ${emailsRequis.length} email(s) copié(s) dans le presse-papier`);
  };

  const doExport=async()=>{
    setExporting(true);
    try{
      const rows=requis.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.sc||"",l.dn?fmtD(l.dn):"",l.s||"",getEmail(l),l.tel||l.tel2||"",l.rl||""]);
      await exportXLSX([{name:`Certifs ${cible}`,rows:[["Nom","Prénom","N° Licence","Catégorie","Sous-catégorie","Né(e) le","Sexe","Email","Téléphone","Représentant légal"],...rows]}],`RSG_Certifs_${cible}.xlsx`);
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  return<div>
    <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:C.R,margin:"0 0 4px"}}>🩺 Certificats médicaux pour la saison {cible}</p>
      <p style={{fontSize:13,color:"#991b1b",margin:0,lineHeight:1.5}}>
        Liste basée sur la colonne <strong>"Validité Certif Médic N+1"</strong> de Footclubs.<br/>
        Les joueurs marqués <strong>"Non valide"</strong> devront fournir un nouveau certificat médical pour la saison {cible}.
      </p>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{background:C.W,border:`2px solid ${C.R}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.R}}>{requis.length}</div>
        <div style={{fontSize:11,color:C.G}}>🩺 À renouveler</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{valides.length}</div>
        <div style={{fontSize:11,color:C.G}}>✅ Valides</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.G}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.G}}>{all.length}</div>
        <div style={{fontSize:11,color:C.G}}>Total joueurs</div>
      </div>
    </div>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={copyAll} disabled={!emailsRequis.length}>📧 Copier les {emailsRequis.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!requis.length}>{exporting?"…":"📊 Export Excel"}</button>
    </div>

    <div style={{display:"flex",gap:6,marginBottom:10}}>
      {[{id:"requis",l:`🩺 À renouveler (${requis.length})`,c:C.R},{id:"valides",l:`✅ Valides (${valides.length})`,c:C.V},{id:"tous",l:`Tous (${all.length})`,c:C.G}].map(o=>(
        <button key={o.id} onClick={()=>setFiltre(o.id)} style={{flex:"1 1 auto",padding:"8px 10px",border:`2px solid ${filtre===o.id?o.c:C.Gb}`,background:filtre===o.id?(o.c===C.R?"#fee2e2":o.c===C.V?"#dcfce7":C.Gc):"#fff",color:filtre===o.id?o.c:C.G,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>{o.l}</button>
      ))}
    </div>

    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`Rechercher parmi ${liste.length} licencie(s)...`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {liste.length} affiché(s)</p>
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun licencié</p>}
    {filtered.map((l,i)=>{
      const req=certifRequis(l);
      const email=getEmail(l);
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:6,borderLeft:`4px solid ${req===true?C.R:req===false?C.V:C.G}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontWeight:700,fontSize:14}}>{l.p||l.prenom} {l.n||l.nom}</span>
          {(l.c||l.categorie)&&<span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{l.c||l.categorie}</span>}
          {l.dn&&<span style={{marginLeft:6,fontSize:11,color:C.G}}>· {fmtD(l.dn)}</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3,wordBreak:"break-word"}}>
            {(l.l||l.numLicence)&&<span>N° {l.l||l.numLicence}</span>}
            {email&&<span> · 📧 {email}</span>}
            {(l.tel||l.tel2)&&<span> · 📱 {l.tel||l.tel2}</span>}
          </div>
          {l.rl&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{l.rl}</div>}
        </div>
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>{navigator.clipboard.writeText(email);}}>📋 Copier</button>}
      </div>;
    })}
  </div>;
}

/* â•â• ADRESSE BAN â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AdresseInput({adresse,cp,ville,onAdresse,onCP,onVille,errA,errCP,errV}){
  const [results,setResults]=useState([]);
  const [open,setOpen]=useState(false);
  const timer=useRef(null);
  const wrap=useRef(null);
  const search=async q=>{if(q.length<4){setResults([]);setOpen(false);return;}try{const r=await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=housenumber`);const d=await r.json();const f=d.features||[];setResults(f);setOpen(f.length>0);}catch{setResults([]);}};
  const onType=v=>{onAdresse(v);clearTimeout(timer.current);timer.current=setTimeout(()=>search(v),450);};
  const pick=feat=>{const p=feat.properties;onAdresse(p.name||adresse);onCP(p.postcode||"");onVille(p.city||"");setOpen(false);setResults([]);};
  useEffect(()=>{const h=e=>{if(wrap.current&&!wrap.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return<div style={{marginBottom:12}} ref={wrap}>
    <label style={lbl}>Adresse *</label>
    <input style={inp(errA)} value={adresse} onChange={e=>onType(e.target.value)} onFocus={()=>results.length&&setOpen(true)} placeholder="Tapez votre adresse complète…" autoComplete="off" autoCorrect="off" spellCheck={false}/>
    {errA&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {errA}</span>}
    {open&&results.length>0&&<div style={{background:C.W,border:`2px solid ${C.J}`,borderRadius:8,marginTop:4,overflow:"hidden",boxShadow:"0 4px 14px rgba(0,0,0,.12)"}}>
      {results.map((feat,i)=><div key={i} onMouseDown={e=>{e.preventDefault();pick(feat);}} onTouchEnd={e=>{e.preventDefault();pick(feat);}} style={{padding:"10px 12px",borderBottom:i<results.length-1?`1px solid ${C.Gc}`:"none",cursor:"pointer",background:C.W}} onMouseEnter={e=>e.currentTarget.style.background=C.Jp} onMouseLeave={e=>e.currentTarget.style.background=C.W}>
        <div style={{fontWeight:600,fontSize:14}}>{feat.properties.name}</div>
        <div style={{fontSize:12,color:C.G}}>{feat.properties.postcode} {feat.properties.city}</div>
      </div>)}
    </div>}
    <div style={{...G2,marginTop:8}}>
      <div><label style={lbl}>Code postal *</label><input style={inp(errCP)} value={cp} onChange={e=>onCP(e.target.value)} inputMode="numeric" maxLength={5} autoComplete="postal-code"/>{errCP&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {errCP}</span>}</div>
      <div><label style={lbl}>Ville *</label><input style={inp(errV)} value={ville} onChange={e=>onVille(e.target.value)} autoComplete="address-level2"/>{errV&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {errV}</span>}</div>
    </div>
  </div>;
}

/* â•â• PHOTO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const compressImageDataUrl=(dataUrl,max=420,quality=.72)=>new Promise(resolve=>{
  if(!dataUrl||!String(dataUrl).startsWith("data:image/"))return resolve(dataUrl);
  const img=new Image();
  img.onload=()=>{
    const ratio=Math.min(1,max/Math.max(img.width,img.height));
    const w=Math.max(1,Math.round(img.width*ratio));
    const h=Math.max(1,Math.round(img.height*ratio));
    const canvas=document.createElement("canvas");
    canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(img,0,0,w,h);
    resolve(canvas.toDataURL("image/jpeg",quality));
  };
  img.onerror=()=>resolve(dataUrl);
  img.src=dataUrl;
});
const compressImageFile=file=>new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onload=async ev=>resolve(await compressImageDataUrl(ev.target.result));
  r.onerror=reject;
  r.readAsDataURL(file);
});
async function compressEntryPhotos(entry){
  const out={...entry};
  if(out.photoBase64)out.photoBase64=await compressImageDataUrl(out.photoBase64);
  out.freresSoeurs=await Promise.all((out.freresSoeurs||[]).map(async m=>({...m,photoBase64:m.photoBase64?await compressImageDataUrl(m.photoBase64):m.photoBase64})));
  out.adultesFamille=await Promise.all((out.adultesFamille||[]).map(async m=>({...m,photoBase64:m.photoBase64?await compressImageDataUrl(m.photoBase64):m.photoBase64})));
  return out;
}
function PhotoInput({value,onChange}){
  const fRef=useRef(),cRef=useRef();
  const [busy,setBusy]=useState(false);
  const handle=async file=>{
    if(!file)return;
    if(file.size>10*1024*1024){alert("Max 10 Mo");return;}
    setBusy(true);
    try{onChange(await compressImageFile(file));}
    catch{alert("Erreur lors de l'import de la photo.");}
    finally{setBusy(false);}
  };
  if(value)return<div style={{display:"flex",gap:12,alignItems:"center"}}><img src={value} alt="Photo" style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/><div><p style={{fontSize:13,color:C.V,fontWeight:700,margin:"0 0 6px"}}>✓ Photo importée</p><button type="button" style={{fontSize:13,color:C.R,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>onChange("")}>Supprimer</button></div></div>;
  return<div>
    <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={cRef} type="file" accept="image/*" capture="user" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8}}>
      <button type="button" disabled={busy} style={{...BS,flex:1,fontSize:13,padding:"10px 8px",opacity:busy?0.65:1}} onClick={()=>fRef.current.click()}>{busy?"Optimisation...":"Galerie"}</button>
      <button type="button" disabled={busy} style={{...BP,flex:1,fontSize:13,padding:"10px 8px",opacity:busy?0.65:1}} onClick={()=>cRef.current.click()}><Icon as={Camera} size={15}/>Caméra</button>
    </div>
    <p style={{fontSize:11,color:C.G,marginTop:5}}>JPG, PNG — image optimisée automatiquement</p>
  </div>;
}

function memberCategoryOptions(role){
  if(role==="frere")return CATS.filter(c=>isMinorCategory(c.v));
  if(role==="adulte")return CATS.filter(c=>["Senior","Dirigeant"].includes(c.v));
  return CATS;
}

function AdminMemberEditCard({title,role,member,onPatch,onRemove,tarifs,saison,compact=false}){
  const telKey=role==="adulte"?"tel":"telephone";
  const canContact=role==="main"||role==="adulte";
  const isMain=role==="main";
  const change=(k,v)=>{
    const patch={[k]:v};
    if(k==="typeLicence"&&v==="nouvelle"){patch.numLicenceFFF="";patch.numPersonne="";}
    if(k==="dateNaissance"&&v){
      const suggested=suggestCat(v,saison);
      if(role==="frere")patch.categorie=isMinorCategory(suggested)?suggested:"";
      else if(role==="adulte"){if(suggested&&!isMinorCategory(suggested))patch.categorie=suggested;}
      else patch.categorie=suggested||member.categorie||"";
    }
    onPatch(patch);
  };
  return <div style={{background:C.W,border:`1.5px solid ${role==="main"?C.Jd:role==="adulte"?"#93c5fd":C.Gb}`,borderRadius:10,padding:compact?"10px":"12px",marginBottom:10,boxShadow:"0 5px 14px rgba(15,23,42,.04)"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10}}>
      <div style={{display:"flex",gap:10,alignItems:"center",minWidth:0}}>
        {member.photoBase64?<img src={member.photoBase64} alt="" style={{width:42,height:42,borderRadius:9,objectFit:"cover",border:`1px solid ${C.Gb}`,flexShrink:0}}/>:<div style={{width:42,height:42,borderRadius:9,background:C.Gc,border:`1px dashed ${C.Gb}`,display:"grid",placeItems:"center",fontSize:10,fontWeight:900,color:C.G,flexShrink:0}}>PHOTO</div>}
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:950,color:C.N}}>{title}</div>
          <div style={{fontSize:11,color:C.G,fontWeight:800,marginTop:2}}>{member.prenom||"Prénom"} {member.nom||"NOM"} · {adminCatValue(member)||"catégorie à choisir"}</div>
        </div>
      </div>
      {onRemove&&<button type="button" onClick={onRemove} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:8,padding:"6px 9px",fontSize:11,fontWeight:900,cursor:"pointer",flexShrink:0}}>Supprimer</button>}
    </div>
    <div style={G2}>
      <F label="Type licence"><select style={inp()} value={member.typeLicence||""} onChange={ev=>change("typeLicence",ev.target.value)}><option value="">— Choisir</option><option value="renouvellement">Renouvellement</option><option value="nouvelle">Nouvelle licence</option></select></F>
      {member.typeLicence==="renouvellement"&&<>
        <F label="N° licence FFF"><input style={inp()} value={member.numLicenceFFF||""} onChange={ev=>change("numLicenceFFF",ev.target.value)} placeholder="Facultatif"/></F>
        <F label="N° personne"><input style={inp()} value={member.numPersonne||""} onChange={ev=>change("numPersonne",ev.target.value)} placeholder="Facultatif"/></F>
      </>}
      <F label="Nom"><input style={inp()} value={member.nom||""} onChange={ev=>change("nom",ev.target.value.toUpperCase())}/></F>
      <F label="Prénom"><input style={inp()} value={member.prenom||""} onChange={ev=>change("prenom",ev.target.value)}/></F>
      <F label="Naissance"><input type="date" style={inp()} value={member.dateNaissance||""} onChange={ev=>change("dateNaissance",ev.target.value)}/></F>
      <F label="Sexe"><select style={inp()} value={member.sexe||""} onChange={ev=>change("sexe",ev.target.value)}><option value="">— Choisir</option><option>Masculin</option><option>Féminin</option></select></F>
      <F label="Catégorie"><select style={inp()} value={canonicalCat(member.categorie)} onChange={ev=>change("categorie",ev.target.value)}><option value="">— Choisir</option>{memberCategoryOptions(role).map(c=><option key={c.v} value={c.v}>{catOptionLabel(c,saison)}</option>)}</select></F>
      {(role==="main"||role==="adulte")&&<F label="Nationalité"><select style={inp()} value={member.nationalite||"Française"} onChange={ev=>change("nationalite",ev.target.value)}>{NATS.map(n=><option key={n}>{n}</option>)}</select></F>}
      {member.categorie==="Dirigeant"&&<F label="Dirigeant rattaché à"><select style={inp()} value={member.dirigeantCategorie||""} onChange={ev=>change("dirigeantCategorie",ev.target.value)}><option value="">— Choisir</option>{DIRIGEANT_RATTACHEMENT_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>}
      {canContact&&<>
        <F label="Téléphone"><input type="tel" style={inp()} value={member[telKey]||""} onChange={ev=>change(telKey,ev.target.value)} inputMode="tel"/></F>
        <F label="Email"><input type="email" style={inp()} value={member.email||""} onChange={ev=>change("email",ev.target.value)} inputMode="email"/></F>
      </>}
      {isMain&&<>
        <F label="Adresse" span><input style={inp()} value={member.adresse||""} onChange={ev=>change("adresse",ev.target.value)}/></F>
        <F label="Code postal"><input style={inp()} value={member.codePostal||""} onChange={ev=>change("codePostal",ev.target.value)} maxLength={5} inputMode="numeric"/></F>
        <F label="Ville"><input style={inp()} value={member.ville||""} onChange={ev=>change("ville",ev.target.value)}/></F>
      </>}
      <F label="Allergies, asthme, restrictions" span><input style={inp()} value={member.allergiesAsthme||""} onChange={ev=>change("allergiesAsthme",ev.target.value)} placeholder="Aucune, asthme, PAI..."/></F>
    </div>
    <div style={{marginTop:2}}>
      <div style={{fontSize:11,fontWeight:950,color:C.G,textTransform:"uppercase",margin:"0 0 6px"}}>Dotation licence</div>
      <EquipFields member={member} categorie={canonicalCat(member.categorie)} tarifs={tarifs} saison={saison} onChange={(k,v)=>change(k,v)}/>
    </div>
    <div style={{marginTop:8}}>
      <div style={{fontSize:11,fontWeight:950,color:C.G,textTransform:"uppercase",margin:"0 0 6px"}}>Photo</div>
      <PhotoInput value={member.photoBase64||""} onChange={v=>change("photoBase64",v)}/>
    </div>
  </div>;
}

function FamilyMembersAdminEditor({draft,setDraft,tarifs,saison,compact=false}){
  const patchMain=patch=>setDraft(p=>({...p,...patch}));
  const patchList=(key,i,patch)=>setDraft(p=>({...p,[key]:(p[key]||[]).map((m,j)=>j===i?{...m,...patch}:m)}));
  const memberKey=(prefix,m,i)=>`${prefix}-${m?.id||m?.numLicenceFFF||m?.numPersonne||`${m?.nom||""}-${m?.prenom||""}-${m?.dateNaissance||""}`}-${i}`;
  const removeList=(key,i)=>{
    const member=(draft[key]||[])[i]||{};
    const label=`${member.prenom||""} ${member.nom||""}`.trim()||"ce membre";
    if(typeof window!=="undefined"&&!window.confirm(`Supprimer ${label} du dossier ?`))return;
    setDraft(p=>{
      const current=p[key]||[];
      const nextList=current.filter((_,j)=>j!==i);
      const next={...p,[key]:nextList};
      const remaining=(key==="freresSoeurs"?nextList:(p.freresSoeurs||[])).length+(key==="adultesFamille"?nextList:(p.adultesFamille||[])).length;
      if(remaining===0)next.nomFamille="";
      return recalcDossierPrix(next,tarifs);
    });
  };
  const total=1+(draft.freresSoeurs?.length||0)+(draft.adultesFamille?.length||0);
  return <div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:12,padding:compact?"10px":"12px",marginTop:8}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start",flexWrap:"wrap",marginBottom:10}}>
      <div>
        <div style={{fontSize:14,fontWeight:950,color:C.N}}>Membres du dossier</div>
        <div style={{fontSize:12,color:C.G,fontWeight:800,marginTop:2}}>Modifiez chaque licence ici : identité, catégorie, numéros FFF, contact, dotation et photo.</div>
      </div>
      <span style={{background:C.N,color:C.J,borderRadius:8,padding:"5px 9px",fontSize:12,fontWeight:950}}>{total} membre{total>1?"s":""}</span>
    </div>
    {total>1&&<F label="Nom de famille du dossier"><input style={inp()} value={draft.nomFamille||draft.nom||""} onChange={ev=>patchMain({nomFamille:ev.target.value.toUpperCase()})} placeholder="Ex : BERNARD"/></F>}
    <AdminMemberEditCard title="Joueur principal" role="main" member={draft} onPatch={patchMain} tarifs={tarifs} saison={saison} compact={compact}/>
    {(draft.freresSoeurs||[]).map((m,i)=><AdminMemberEditCard key={memberKey("frere",m,i)} title={`Enfant / frère-sœur n°${i+1}`} role="frere" member={m} onPatch={patch=>patchList("freresSoeurs",i,patch)} onRemove={()=>removeList("freresSoeurs",i)} tarifs={tarifs} saison={saison} compact={compact}/>)}
    {(draft.adultesFamille||[]).map((m,i)=><AdminMemberEditCard key={memberKey("adulte",m,i)} title={`Adulte famille n°${i+1}`} role="adulte" member={m} onPatch={patch=>patchList("adultesFamille",i,patch)} onRemove={()=>removeList("adultesFamille",i)} tarifs={tarifs} saison={saison} compact={compact}/>)}
    {total===1&&<div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"9px 10px",fontSize:12,fontWeight:850,color:C.V}}>Le dossier est maintenant individuel. Enregistrez pour valider la suppression.</div>}
  </div>;
}

function FamilyMembersOverview({e,tarifs,onEdit,onMemberSel,compact=false}){
  const membres=membresDossier(e);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:13,fontWeight:950,color:C.N}}>Famille {e.nomFamille||e.nom}</div>
        <div style={{fontSize:11,fontWeight:850,color:C.G,marginTop:2}}>{membres.length} membre{membres.length>1?"s":""} dans ce dossier</div>
      </div>
      {onEdit&&<button type="button" onClick={onEdit} style={{...BS,fontSize:12,padding:"8px 11px"}}>Modifier les membres</button>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:8}}>
      {membres.map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={ev=>{ev.stopPropagation();onMemberSel?.(m);}} style={{background:m.idx===0?C.N:C.W,color:m.idx===0?C.J:C.N,border:`1px solid ${m.idx===0?C.N:C.Gb}`,borderRadius:10,padding:compact?"8px":"10px",fontFamily:FONT,textAlign:"left",cursor:onMemberSel?"pointer":"default",display:"grid",gridTemplateColumns:m.photoBase64?"38px minmax(0,1fr)":"minmax(0,1fr)",gap:9,alignItems:"center",minHeight:62}}>
        {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:38,height:38,borderRadius:9,objectFit:"cover",border:`1px solid ${m.idx===0?C.J:C.Gb}`}}/>}
        <span style={{minWidth:0}}>
          <span style={{display:"block",fontSize:12,fontWeight:950,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.prenom} {m.nom}</span>
          <span style={{display:"block",fontSize:11,fontWeight:850,color:m.idx===0?C.J:C.G,marginTop:2}}>{adminCatValue(m)} · {m.typeLicence==="renouvellement"?"Renouv.":"Nouveau"} · {m.prix||prixCategorie(tarifs,m.categorie)||0} €</span>
        </span>
      </button>)}
    </div>
  </div>;
}

function PaymentSummary({e,tarifs,dark=false,total=calcTotalDossier(e)}){
  const rows=paymentSplitRows(e,tarifs,total);
  const splitTotal=rows.reduce((s,r)=>s+r.montant,0);
  const diff=Math.round((total-splitTotal)*100)/100;
  const fg=dark?C.W:C.N;
  const muted=dark?"#9ca3af":C.G;
  if(!rows.length)return <div style={{fontSize:13,color:muted}}>Aucun mode de paiement renseigné.</div>;
  return <div>
    <div style={{display:"grid",gap:5}}>
      {rows.map(r=><div key={r.id} style={{display:"flex",justifyContent:"space-between",gap:10,fontSize:13,padding:"4px 0",borderBottom:`1px solid ${dark?"#263244":C.Gc}`}}>
        <span style={{color:muted,fontWeight:850}}>{r.label}</span>
        <span style={{color:dark?C.J:C.Jd,fontWeight:950}}>{r.montant} €</span>
      </div>)}
    </div>
    {Math.abs(diff)>0.01&&<div style={{marginTop:6,fontSize:11,color:diff>0?"#f97316":C.R,fontWeight:900}}>Écart avec le total dossier : {diff>0?"+":""}{diff} €</div>}
  </div>;
}

function PaymentSplitEditor({draft,setDraft,tarifs,total=calcTotalDossier(draft),compact=false}){
  const modes=getModesPaiement(tarifs);
  const ids=paymentIds(draft);
  const amounts=paymentAmountMap(draft,tarifs,total);
  const splitTotal=ids.reduce((s,id)=>s+Number(amounts[id]||0),0);
  const diff=Math.round((total-splitTotal)*100)/100;
  const setPaymentState=(nextIds,nextAmounts)=>setDraft(p=>({
    ...p,
    modePaiements:nextIds,
    modePaiement:nextIds[0]||"",
    montantsPaiement:Object.fromEntries(nextIds.map(id=>[id,Number(nextAmounts[id]||0)])),
  }));
  const addMode=()=>{
    const next=modes.find(m=>!ids.includes(m.id));
    if(!next)return;
    const remaining=Math.max(0,Math.round((total-splitTotal)*100)/100);
    setPaymentState([...ids,next.id],{...amounts,[next.id]:remaining});
  };
  const changeMode=(oldId,newId)=>{
    if(!newId||oldId===newId)return;
    const nextIds=ids.map(id=>id===oldId?newId:id).filter((id,i,arr)=>arr.indexOf(id)===i);
    const nextAmounts={...amounts,[newId]:amounts[oldId]||0};
    delete nextAmounts[oldId];
    setPaymentState(nextIds,nextAmounts);
  };
  const changeAmount=(id,value)=>setPaymentState(ids,{...amounts,[id]:Number(value||0)});
  const removeMode=id=>{
    const nextIds=ids.filter(x=>x!==id);
    const nextAmounts={...amounts};
    delete nextAmounts[id];
    setPaymentState(nextIds,nextAmounts);
  };
  const hasFraction=ids.some(id=>modes.find(m=>m.id===id)?.fractionnable);
  const setNbFois=n=>{
    const count=parseInt(n,10)||1;
    const current=Array.from({length:count},(_,i)=>draft.datesEcheances?.[i]||"");
    setDraft(p=>({...p,nbFois:count,datesEcheances:count>1?current:[],dateEcheance1:count>1?(current[0]||p.dateEcheance1||""):""}));
  };
  const setDate=(i,value)=>{
    const count=parseInt(draft.nbFois||1,10)||1;
    const next=Array.from({length:count},(_,j)=>j===i?value:(draft.datesEcheances?.[j]||""));
    setDraft(p=>({...p,datesEcheances:next,dateEcheance1:next[0]||""}));
  };
  return <div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:12,padding:compact?"10px":"12px"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
      <div>
        <div style={{fontSize:13,fontWeight:950,color:C.N}}>Répartition des paiements</div>
        <div style={{fontSize:11,color:C.G,fontWeight:800}}>Ajoutez les moyens utilisés et indiquez le montant encaissé ou à encaisser pour chacun.</div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontSize:11,color:C.G,fontWeight:850}}>Total dossier</div>
        <div style={{fontSize:18,color:C.Jd,fontWeight:950}}>{total} €</div>
      </div>
    </div>
    <div style={{display:"grid",gap:8}}>
      {ids.map(id=><div key={id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 130px 34px",gap:7,alignItems:"center"}}>
        <select style={{...inp(),fontSize:13,minHeight:40}} value={id} onChange={ev=>changeMode(id,ev.target.value)}>
          {modes.map(m=><option key={m.id} value={m.id} disabled={ids.includes(m.id)&&m.id!==id}>{m.l}</option>)}
        </select>
        <input type="number" min="0" step="1" style={{...inp(),fontSize:13,minHeight:40,textAlign:"right",fontWeight:900}} value={amounts[id]??0} onChange={ev=>changeAmount(id,ev.target.value)} aria-label={`Montant ${paymentLabel(id,tarifs)}`}/>
        <button type="button" onClick={()=>removeMode(id)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:9,height:40,fontWeight:950,cursor:"pointer"}}>×</button>
      </div>)}
    </div>
    <button type="button" onClick={addMode} disabled={ids.length>=modes.length} style={{...BS,width:"100%",fontSize:12,padding:"8px 10px",marginTop:8,opacity:ids.length>=modes.length?0.55:1}}>+ Ajouter un moyen de paiement</button>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:8}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"8px 10px"}}><div style={{fontSize:11,color:C.G,fontWeight:850}}>Réparti</div><div style={{fontSize:16,fontWeight:950,color:C.N}}>{splitTotal} €</div></div>
      <div style={{background:Math.abs(diff)<.01?"#ecfdf5":"#fff7ed",border:`1px solid ${Math.abs(diff)<.01?"#86efac":"#fdba74"}`,borderRadius:10,padding:"8px 10px"}}><div style={{fontSize:11,color:C.G,fontWeight:850}}>Écart</div><div style={{fontSize:16,fontWeight:950,color:Math.abs(diff)<.01?C.V:"#c2410c"}}>{diff} €</div></div>
    </div>
    {hasFraction&&<div style={{marginTop:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px"}}>
      <div style={G2}>
        <F label="Nombre d'échéances"><select style={inp()} value={draft.nbFois||1} onChange={ev=>setNbFois(ev.target.value)}><option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option><option value={4}>4x</option></select></F>
        {draft.nbFois>1&&<F label="Total échéancé"><input style={inp()} value={`${total} €`} readOnly/></F>}
      </div>
      {draft.nbFois>1&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}>
        {Array.from({length:draft.nbFois},(_,i)=><F key={i} label={`Échéance ${i+1}`}><input type="date" style={inp()} value={draft.datesEcheances?.[i]||""} onChange={ev=>setDate(i,ev.target.value)}/></F>)}
      </div>}
    </div>}
  </div>;
}

/* â•â• ENTRY CARD + DETAIL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function DetailModal({children,onClose}){
  useEffect(()=>{
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=e=>{if(e.key==="Escape")onClose?.();};
    window.addEventListener("keydown",onKey);
    return()=>{document.body.style.overflow=prev;window.removeEventListener("keydown",onKey);};
  },[onClose]);
  return <div role="dialog" aria-modal="true" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,.55)",padding:"18px 12px",display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto"}} onMouseDown={onClose}>
    <div style={{width:"min(980px,100%)",maxHeight:"calc(100vh - 36px)",overflowY:"auto",borderRadius:16,boxShadow:"0 24px 70px rgba(0,0,0,.28)"}} onMouseDown={e=>e.stopPropagation()}>
      <div style={{position:"sticky",top:0,zIndex:20,display:"flex",justifyContent:"flex-end",padding:"8px 8px 0",pointerEvents:"none"}}>
        <button onClick={onClose} style={{background:C.N,color:C.W,border:"none",borderRadius:8,padding:"8px 11px",fontSize:13,fontWeight:900,cursor:"pointer",boxShadow:"0 8px 18px rgba(0,0,0,.18)",pointerEvents:"auto"}}>Fermer</button>
      </div>
      {children}
    </div>
  </div>;
}

function EntryCard({e,sel,onSel,onMemberSel}){
  const isSel=sel?.id===e.id;
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const membres=membresDossier(e);
  const isFamille=membres.length>1;
  return<div onClick={onSel} style={{background:isSel?C.Jp:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",transition:"background .1s"}}>
    <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"44px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:10,alignItems:"center"}}>
      {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
      <div style={{minWidth:0}}>
        <div style={{fontWeight:900,fontSize:15,color:C.N}}>{isFamille?`Famille ${e.nomFamille||e.nom}`:`${e.prenom} ${e.nom}`}</div>
        {isFamille&&<div style={{fontSize:11,color:C.G,fontWeight:800,marginTop:2}}>Dossier principal : {e.prenom} {e.nom}</div>}
        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{catLabel(e.categorie)}</span>
          <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 7px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"Renouv.":"Nouveau"}</span>
          {e.poste&&<span style={{background:C.Gc,color:C.G,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.poste}</span>}
          {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>Certif requis</span>}
            {e.prixFinal&&<span style={{background:"#f0fdf4",color:"#16a34a",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{calcTotalDossier(e)} €{e.nbFois>1?` (${e.nbFois}x)`:""}</span>}
          {boutiqueSaisonTotal>0&&<span style={{background:"#e0f2fe",color:"#0369a1",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>Saison {boutiqueSaisonTotal} € separe</span>}
        </div>
      </div>
      <div style={{textAlign:"right",display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
        <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:10,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c,flexShrink:0}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        <span style={{fontSize:11,color:"#9ca3af"}}>{fmtD(e.datePreinscription)}</span>
      </div>
    </div>
    {membres.length>1&&<div style={{marginTop:8,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px"}}>
      <div style={{fontSize:12,fontWeight:950,color:C.N,marginBottom:2}}>Famille {e.nomFamille||e.nom}</div>
      <div style={{fontSize:11,fontWeight:900,color:C.G,marginBottom:5}}>{membres.length} membres inscrits dans ce dossier - cliquez sur un membre</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:6}}>
        {membres.map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={ev=>{ev.stopPropagation();onMemberSel?.(m);}} style={{background:m.idx===0?C.N:"#fff",color:m.idx===0?C.J:C.N,border:`1px solid ${m.idx===0?C.N:C.Gb}`,borderRadius:8,padding:"6px 8px",fontSize:11,fontWeight:800,cursor:"pointer",textAlign:"left",display:"grid",gridTemplateColumns:m.photoBase64?"28px minmax(0,1fr)":"minmax(0,1fr)",gap:7,alignItems:"center"}}>
          {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:28,height:28,borderRadius:7,objectFit:"cover"}}/>}
          <span>{m.prenom} {m.nom} - {adminCatValue(m)}</span>
        </button>)}
      </div>
    </div>}
  </div>;
}

function MemberDetailPanel({m,tarifs,onOpenDossier}){
  const docs=getPieces(tarifs).filter(p=>pieceVisible(p,m.dossier,m.certifNeeded,countMembres(m.dossier)>1));
  const isValidated=m.statut==="paye"||m.statut==="valide";
  const canAttestation=attestationRequiredForMember(m);
  return <div style={{background:C.W,borderRadius:14,padding:"16px",border:`2px solid ${C.J}`,boxShadow:"0 4px 16px rgba(245,200,0,.15)"}}>
    <div style={{display:"grid",gridTemplateColumns:m.photoBase64?"76px minmax(0,1fr)":"minmax(0,1fr)",gap:14,alignItems:"center",marginBottom:14}}>
      {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:76,height:76,borderRadius:14,objectFit:"cover",border:`2px solid ${C.J}`}}/>}
      <div>
        <h2 style={{margin:"0 0 5px",fontSize:22,fontWeight:950,color:C.N}}>{m.prenom} {m.nom}</h2>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"3px 8px",borderRadius:6,fontWeight:900,fontSize:12}}>{adminCatValue(m)}</span>
          <span style={{background:C.Gc,color:C.G,padding:"3px 8px",borderRadius:6,fontWeight:800,fontSize:12}}>{structureType(m)}</span>
          <span style={{background:m.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:m.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"3px 8px",borderRadius:6,fontWeight:800,fontSize:12}}>{m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle licence"}</span>
          <span style={{background:STATUTS[m.statut]?.bg,color:STATUTS[m.statut]?.c,padding:"3px 8px",borderRadius:6,fontWeight:800,fontSize:12}}>{STATUTS[m.statut]?.l}</span>
        </div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
      <MC title="Identité">
        <DR l="Naissance" v={fmtD(m.dateNaissance)}/>
        <DR l="Sexe" v={m.sexe}/>
        <DR l="Nationalité" v={m.nationalite||m.dossier.nationalite}/>
        <DR l="N° FFF" v={m.numLicenceFFF||m.dossier.numLicenceFFF}/>
        <DR l="N° personne" v={m.numPersonne||m.dossier.numPersonne}/>
        {m.categorie==="Dirigeant"&&<DR l="Rattaché à" v={catLabel(m.dirigeantCategorie)||m.dirigeantCategorie||"à préciser"}/>}
        <DR l="Poste" v={m.poste}/>
      </MC>
      <MC title="Famille / dossier">
        <DR l="Famille" v={m.dossier.nomFamille||m.dossier.nom}/>
        <DR l="Référence" v={m.dossierId}/>
        <DR l="Rôle" v={m.role}/>
        <DR l="Contact" v={getEmailContact(m.dossier)||getTelContact(m.dossier)}/>
      </MC>
      <MC title="Dotation licence">
        {getMemberDotationItems(m,m.categorie,tarifs,m.saison||m.dossier?.saison||SAISON_DEFAUT).map(item=><DR key={item.id} l={item.label} v={dotationValueForMember(m,item)||"—"}/>)}
        {getMemberMissingDotations(m,tarifs,m.saison||m.dossier?.saison||SAISON_DEFAUT).length>0&&<div style={{background:"#fff7ed",border:"1px solid #fdba74",borderRadius:8,padding:"7px 8px",fontSize:11,fontWeight:900,color:"#9a3412",marginTop:6}}>À demander : {getMemberMissingDotations(m,tarifs,m.saison||m.dossier?.saison||SAISON_DEFAUT).join(", ")}</div>}
        {formatInitiales(m,tarifs)&&<DR l="Initiales" v={`${formatInitiales(m,tarifs)} (+${countInitiales(m,tarifs)*getCoutInitiales(tarifs)} €)`}/>}
      </MC>
      <MC title="Médical / pièces">
        <DR l="Certif" v={m.certifNeeded?"Requis":"OK / non requis"}/>
        <DR l="Soins urgence" v={m.autoSoins===false?"Non":"Oui"}/>
        <DR l="Allergies" v={m.allergiesAsthme||m.dossier.allergiesAsthme||"—"}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>{docs.map(p=><span key={p.id} style={{background:m.dossier[p.id]||m.dossier.piecesFournies?.[p.id]?"#dcfce7":"#fee2e2",color:m.dossier[p.id]||m.dossier.piecesFournies?.[p.id]?C.V:C.R,borderRadius:6,padding:"3px 7px",fontSize:11,fontWeight:800}}>{p.label}</span>)}</div>
      </MC>
    </div>
    {isValidated&&canAttestation&&<button onClick={()=>printAttestation(attestationEntryForMember(m,tarifs),tarifs)} style={{...BS,width:"100%",marginTop:12}}>Attestation de ce membre</button>}
    {isValidated&&!canAttestation&&<div style={{background:"#ecfdf5",color:C.V,border:"1px solid #86efac",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:850,marginTop:12}}>Attestation non nécessaire : licence dirigeant gratuite.</div>}
    <button onClick={onOpenDossier} style={{...BP,width:"100%",marginTop:12}}>Ouvrir le dossier famille complet</button>
  </div>;
}

function DetailPanel({e,note,setNote,onUpd,onDel,onChangeStatut,tarifs,licencies=[],allEntries=[],onAttachIndividualMembers,onClose,onSendAttestation}){
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(e);
  const [savingEdit,setSavingEdit]=useState(false);
  const [addMemberOpen,setAddMemberOpen]=useState(false);
  const [attachOpen,setAttachOpen]=useState(false);
  const [attachIds,setAttachIds]=useState([]);
  const [newMemberKind,setNewMemberKind]=useState("mineur");
  const [newMember,setNewMember]=useState(()=>emptyAdminFamilyMember("mineur",e));
  // Sections dépliables
  const [openSec,setOpenSec]=useState({contact:false,medical:false,equip:false,paiement:false,docs:false,famille:true});
  const togSec=k=>setOpenSec(p=>({...p,[k]:!p[k]}));

  const saveNote=async()=>{setSaving(true);await onUpd(e.id,{notes:note});setSaving(false);};
  const fillFootclubsRefs=entry=>{
    if(!Array.isArray(licencies)||!licencies.length)return entry;
    const fillMember=m=>{
      if((m.typeLicence||entry.typeLicence)!=="renouvellement")return m;
      const lic=lookupLic(licencies,m.nom||entry.nom||"",m.prenom||entry.prenom||"",m.numLicenceFFF||"");
      if(!lic)return m;
      const num=getLicValue(lic,"l","numLicence","numLicenceFFF");
      const pers=licNumPersonne(lic);
      return {...m,numLicenceFFF:num||m.numLicenceFFF||"",numPersonne:pers||m.numPersonne||""};
    };
    const main=fillMember(entry);
    return {
      ...entry,
      numLicenceFFF:main.numLicenceFFF,
      numPersonne:main.numPersonne,
      freresSoeurs:(entry.freresSoeurs||[]).map(fillMember),
      adultesFamille:(entry.adultesFamille||[]).map(fillMember),
    };
  };
  useEffect(()=>{
    if(!Array.isArray(licencies)||!licencies.length)return;
    const next=fillFootclubsRefs(e);
    const patch={};
    if((next.numLicenceFFF||"")!==(e.numLicenceFFF||""))patch.numLicenceFFF=next.numLicenceFFF||"";
    if((next.numPersonne||"")!==(e.numPersonne||""))patch.numPersonne=next.numPersonne||"";
    if(JSON.stringify(next.freresSoeurs||[])!==JSON.stringify(e.freresSoeurs||[]))patch.freresSoeurs=next.freresSoeurs||[];
    if(JSON.stringify(next.adultesFamille||[])!==JSON.stringify(e.adultesFamille||[]))patch.adultesFamille=next.adultesFamille||[];
    if(Object.keys(patch).length)onUpd(e.id,patch);
  },[e.id,licencies.length]);
  const startEdit=()=>{const filled=fillFootclubsRefs(e);setDraft({...filled,representants:filled.representants||(filled.resp1Nom?[{nom:filled.resp1Nom,prenom:filled.resp1Prenom,lien:filled.resp1Lien,tel:filled.resp1Tel,email:filled.resp1Email}]:[{nom:"",prenom:"",lien:"",tel:"",email:""}]),freresSoeurs:filled.freresSoeurs||[],adultesFamille:filled.adultesFamille||[]});setEditing(true);setOpenSec({contact:true,medical:true,equip:true,paiement:true,docs:true,famille:true});};
  const startMemberEdit=()=>{const filled=fillFootclubsRefs(e);setDraft({...filled,representants:filled.representants||(filled.resp1Nom?[{nom:filled.resp1Nom,prenom:filled.resp1Prenom,lien:filled.resp1Lien,tel:filled.resp1Tel,email:filled.resp1Email}]:[{nom:"",prenom:"",lien:"",tel:"",email:""}]),freresSoeurs:filled.freresSoeurs||[],adultesFamille:filled.adultesFamille||[]});setEditing(true);setOpenSec({contact:false,medical:false,equip:false,paiement:false,docs:false,famille:true});};
  const cancelEdit=()=>{setEditing(false);setDraft(e);};
  const saveEdit=async()=>{
    setSavingEdit(true);
    const updated=recalcDossierPrix(draft,tarifs);
    await onUpd(e.id,updated);
    setEditing(false);
    setSavingEdit(false);
  };
  const upd=(k,v)=>setDraft(p=>({...p,[k]:v}));
  const updRep=(i,k,v)=>{const r=[...(draft.representants||[])];r[i]={...r[i],[k]:v};upd("representants",r);};
  const addRep=()=>upd("representants",[...(draft.representants||[]),{nom:"",prenom:"",lien:"",tel:"",email:""}]);
  const delRep=i=>upd("representants",(draft.representants||[]).filter((_,j)=>j!==i));
  const setNewKind=kind=>{setNewMemberKind(kind);setNewMember(emptyAdminFamilyMember(kind,e));};
  const openAddMemberForm=()=>{setEditing(false);setOpenSec(p=>({...p,famille:true}));setAddMemberOpen(true);};
  const updNewMember=(k,v)=>setNewMember(p=>({...p,[k]:v,...(k==="dateNaissance"&&v?{categorie:suggestCat(v,e.saison||SAISON_DEFAUT)||p.categorie}:{})}));
  const updFamilyMember=async(kind,i,patch)=>{
    const key=kind==="adulte"?"adultesFamille":"freresSoeurs";
    const list=[...(e[key]||[])];
    list[i]={...list[i],...patch};
    await onUpd(e.id,recalcDossierPrix({...e,[key]:list},tarifs));
  };
  const addNewMember=async()=>{
    const member={...newMember,nom:(newMember.nom||e.nom||"").toUpperCase(),prenom:newMember.prenom||""};
    if(!member.nom||!member.prenom||!member.dateNaissance||!member.sexe||!member.categorie){alert("Nom, prénom, date de naissance, sexe et catégorie sont obligatoires.");return;}
    const patch=newMemberKind==="adulte"
      ?{adultesFamille:[...(e.adultesFamille||[]),member],nomFamille:e.nomFamille||e.nom}
      :{freresSoeurs:[...(e.freresSoeurs||[]),member],nomFamille:e.nomFamille||e.nom};
    await onUpd(e.id,recalcDossierPrix({...e,...patch},tarifs));
    setAddMemberOpen(false);
    setNewMember(emptyAdminFamilyMember(newMemberKind,e));
  };
  const attachCandidates=(allEntries||[])
    .filter(d=>d.id!==e.id&&dossierAttachableIndividuel(d))
    .sort((a,b)=>(a.nom||"").localeCompare(b.nom||"","fr")||(a.prenom||"").localeCompare(b.prenom||"","fr"));
  const toggleAttach=id=>setAttachIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const selectedAttachSources=attachCandidates.filter(d=>attachIds.includes(d.id));
  const attachPreview=selectedAttachSources.length?mergeIndividualDossiersIntoFamily(e,selectedAttachSources,tarifs):null;
  const confirmAttach=async()=>{
    if(!selectedAttachSources.length)return;
    const label=selectedAttachSources.map(d=>`${d.prenom||""} ${d.nom||""}`.trim()).join(", ");
    if(typeof window!=="undefined"&&!window.confirm(`Rattacher ${selectedAttachSources.length} dossier(s) individuel(s) à ${e.nomFamille||e.nom} ?\n\n${label}\n\nLes dossiers individuels sélectionnés seront retirés de la liste et la remise famille sera recalculée automatiquement.`))return;
    await onAttachIndividualMembers?.(e.id,attachIds);
    setAttachIds([]);
    setAttachOpen(false);
  };

  const r0=getResp1(e);
  const tousMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  const membresAttestation=membresAttestationDossier(e);
  const canAttestation=membresAttestation.length>0;
  const isFamille=tousMembres>1;
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);

  return<div style={{background:C.W,borderRadius:14,padding:"16px 14px",border:`2px solid ${C.J}`,boxShadow:"0 4px 16px rgba(245,200,0,.15)"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <div style={{flex:1,minWidth:0}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.N}}>{isFamille?`Famille ${e.nomFamille||e.nom}`:`${e.prenom} ${e.nom}`}</h2>
        {isFamille&&<div style={{fontSize:13,color:C.G,fontWeight:850,marginTop:3}}>Dossier principal : {e.prenom} {e.nom}</div>}
        <p style={{margin:"4px 0 0",fontSize:11,color:"#9ca3af"}}>{e.id} · {fmtDT(e.datePreinscription)} · {e.saison}</p>
        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>{catLabel(e.categorie)}</span>
          <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 8px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"Renouvellement":"Nouveau"}</span>
          {tousMembres>1&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Famille ({tousMembres})</span>}
          {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Certif requis</span>}
          {e.dirigeantArbitre&&<span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Arbitre</span>}
        </div>
      </div>
      {e.photoBase64&&<img src={e.photoBase64} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/>}
    </div>

    {/* Bouton Modifier global */}
    {!editing&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:12}}>
      <button onClick={startEdit} style={{...BP,fontSize:13,width:"100%"}}>Tout modifier</button>
      <button onClick={openAddMemberForm} style={{...BS,fontSize:13,width:"100%",background:"#ecfdf5",borderColor:"#86efac",color:C.V}}><Icon as={UserPlus} size={15}/>Ajouter un membre</button>
      {onAttachIndividualMembers&&attachCandidates.length>0&&<button onClick={()=>{setAddMemberOpen(false);setOpenSec(p=>({...p,famille:true}));setAttachOpen(v=>!v);}} style={{...BS,fontSize:13,width:"100%",background:"#eef2ff",borderColor:"#c7d2fe",color:"#3730a3"}}><Icon as={Users} size={15}/>Rattacher des dossiers</button>}
    </div>}
    {editing&&<div style={{display:"flex",gap:8,marginBottom:12}}>
      <button style={{...BP,flex:1,fontSize:13,opacity:savingEdit?.7:1}} onClick={saveEdit} disabled={savingEdit}>{savingEdit?"Enregistrement...":"Enregistrer modifs"}</button>
      <button style={{...BS,flex:"0 0 auto",fontSize:13}} onClick={cancelEdit}>Annuler</button>
    </div>}
      {(e.statut==="paye"||e.statut==="valide")&&<div style={{marginBottom:12}}>
      {canAttestation?<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button style={{...BS,flex:"1 1 150px",fontSize:12,padding:"8px 12px"}} onClick={()=>printAttestation(attestationEntryForMember(membresAttestation[0],tarifs),tarifs)}>Attestation licence</button>
        {onSendAttestation&&<button style={{...BP,flex:"1 1 170px",fontSize:12,padding:"8px 12px",minHeight:40}} onClick={()=>onSendAttestation(e,true)}>{e.emailAttestationEnvoyeLe?"Renvoyer l'attestation":"Envoyer l'attestation"}</button>}
        <button style={{...BS,flex:"1 1 150px",fontSize:12,padding:"8px 12px"}} onClick={()=>prepareAttestationEmail(e,tarifs)}>Preparer l'email</button>
      </div>:<div style={{background:"#ecfdf5",color:C.V,border:"1px solid #86efac",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:850}}>Attestation non nécessaire : licence dirigeant gratuite.</div>}
      {(e.emailAttestationEnvoyeLe||e.emailAttestationErreur||e.emailAttestationStatus==="envoi"||e.emailAttestationStatus==="non_requise")&&<div style={{marginTop:8,background:e.emailAttestationErreur?"#fee2e2":e.emailAttestationStatus==="envoi"?"#fef9c3":"#dcfce7",color:e.emailAttestationErreur?C.R:e.emailAttestationStatus==="envoi"?"#854d0e":C.V,borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:800}}>
        {e.emailAttestationStatus==="non_requise"?"Attestation non nécessaire : licence dirigeant gratuite.":e.emailAttestationStatus==="envoi"?"Email en cours d'envoi...":e.emailAttestationErreur?`Erreur email automatique (le statut reste enregistré) : ${e.emailAttestationErreur}`:`Email envoyé le ${fmtDT(e.emailAttestationEnvoyeLe)}${e.emailAttestationDernierDestinataire?` à ${e.emailAttestationDernierDestinataire}`:""}`}
      </div>}
      {membresAttestation.length>1&&<div style={{marginTop:10,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px"}}>
        <div style={{fontSize:13,fontWeight:950,color:C.N}}>Famille {e.nomFamille||e.nom}</div>
        <div style={{fontSize:11,fontWeight:850,color:C.G,margin:"2px 0 8px"}}>Attestation individuelle par membre</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:7}}>
          {membresAttestation.map(m=><button key={`${m.dossierId}-${m.idx}`} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:9,padding:"8px 9px",fontSize:12,fontWeight:900,textAlign:"left",cursor:"pointer",fontFamily:FONT}} onClick={()=>printAttestation(attestationEntryForMember(m,tarifs),tarifs)}>
            {m.prenom} {m.nom}<br/><span style={{fontSize:11,color:C.G}}>{adminCatValue(m)} · {m.prix||0} €</span>
          </button>)}
        </div>
      </div>}
    </div>}

    {/* Statut */}
    <div style={{marginBottom:12}}>
      <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.5}}>Statut · enregistrement automatique</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
        {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>onChangeStatut(e.id,k)} style={{border:`2px solid ${active?v.c:C.Gb}`,background:active?v.bg:"#fff",color:active?v.c:C.G,padding:"10px 8px",borderRadius:10,fontWeight:900,fontSize:13,cursor:"pointer",minHeight:58,boxShadow:active?`0 0 0 3px ${v.c}22`:"none"}}><span style={{display:"block",fontSize:18}}>{v.i}</span>{v.l}{k==="valide"&&<span style={{display:"block",fontSize:10,fontWeight:700,marginTop:2}}>payé</span>}</button>;})}
      </div>
    </div>

    {/* CONTACT - section dépliable, éditable */}
    <SecBlock title="Identite & Contact" open={openSec.contact||editing} onTog={()=>togSec("contact")}>
      {!editing?<div>
        <DR l="Naissance" v={`${fmtD(e.dateNaissance)}${e.lieuNaissance?" — "+e.lieuNaissance:""}`}/>
        <DR l="Sexe" v={e.sexe}/>
        <DR l="Nationalité" v={e.nationalite}/>
        <DR l="Adresse" v={`${e.adresse}, ${e.codePostal} ${e.ville}`}/>
        {e.numLicenceFFF&&<DR l="N° FFF" v={e.numLicenceFFF}/>}
        {e.numPersonne&&<DR l="N° personne" v={e.numPersonne}/>}
        {e.ancienClub&&<DR l="Ancien club" v={e.ancienClub}/>}
        {e.aJoueAutreClub&&<DR l="Mutation" v={`Oui${e.mutationNotes?` — ${e.mutationNotes}`:""}`}/>}
        {e.categorie==="Dirigeant"&&<DR l="Catégorie rattachée" v={catLabel(e.dirigeantCategorie)||e.dirigeantCategorie||"à préciser"}/>}
        {e.doubleLicenceDirigeant&&<DR l="Licence dirigeant" v={`Oui · catégorie ${catLabel(e.dirigeantCategorie)||e.dirigeantCategorie||"à préciser"}`}/>}
        {e.poste&&<DR l="Poste" v={e.poste}/>}
        <DR l="Téléphone" v={getTelContact(e)}/>
        <DR l="Email" v={getEmailContact(e)}/>
        {!e.isMajeur&&(e.representants||[]).filter(r=>r.nom).map((r,i)=><div key={i} style={{marginTop:6,paddingTop:6,borderTop:`1px dashed ${C.Gc}`}}>
          <DR l={`Resp. ${r.lien||""}`} v={`${r.prenom||""} ${r.nom||""}`}/>
          <DR l="Tél" v={r.tel}/>
          <DR l="Email" v={r.email}/>
        </div>)}
      </div>:<div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Nom</label><input style={inp()} value={draft.nom||""} onChange={ev=>upd("nom",ev.target.value.toUpperCase())}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Prénom</label><input style={inp()} value={draft.prenom||""} onChange={ev=>upd("prenom",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Naissance</label><input type="date" style={inp()} value={draft.dateNaissance||""} onChange={ev=>upd("dateNaissance",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Sexe</label><select style={inp()} value={draft.sexe||""} onChange={ev=>upd("sexe",ev.target.value)}><option>Masculin</option><option>Féminin</option></select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Nationalité</label><select style={inp()} value={draft.nationalite||""} onChange={ev=>upd("nationalite",ev.target.value)}>{NATS.map(n=><option key={n}>{n}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Catégorie</label><select style={inp()} value={canonicalCat(draft.categorie)} onChange={ev=>upd("categorie",ev.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.v}</option>)}</select></div>
          {draft.categorie==="Dirigeant"&&<div style={{marginBottom:10}}><label style={lbl}>Rattaché à la catégorie</label><select style={inp()} value={draft.dirigeantCategorie||""} onChange={ev=>upd("dirigeantCategorie",ev.target.value)}><option value="">— Choisir</option>{DIRIGEANT_RATTACHEMENT_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></div>}
          {draft.doubleLicenceDirigeant&&draft.categorie!=="Dirigeant"&&<div style={{marginBottom:10}}><label style={lbl}>Double licence dirigeant rattachée à</label><select style={inp()} value={draft.dirigeantCategorie||""} onChange={ev=>upd("dirigeantCategorie",ev.target.value)}><option value="">— Choisir</option>{DIRIGEANT_RATTACHEMENT_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></div>}
          <div style={{marginBottom:10}}><label style={lbl}>Poste</label><select style={inp()} value={draft.poste||""} onChange={ev=>upd("poste",ev.target.value)}><option value="">—</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>N° FFF</label><input style={inp()} value={draft.numLicenceFFF||""} onChange={ev=>upd("numLicenceFFF",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>N° personne</label><input style={inp()} value={draft.numPersonne||""} onChange={ev=>upd("numPersonne",ev.target.value)}/></div>
        </div>
        <Chk checked={draft.aJoueAutreClub} onChange={v=>upd("aJoueAutreClub",v)} label="A joué dans un autre club la saison dernière"/>
        {draft.aJoueAutreClub&&<div style={{marginBottom:10}}><label style={lbl}>Club précédent / mutation</label><input style={inp()} value={draft.ancienClub||""} onChange={ev=>upd("ancienClub",ev.target.value)}/></div>}
        {draft.aJoueAutreClub&&<div style={{marginBottom:10}}><label style={lbl}>Note mutation</label><textarea style={{...inp(),height:58,resize:"vertical"}} value={draft.mutationNotes||""} onChange={ev=>upd("mutationNotes",ev.target.value)}/></div>}
        <div style={{marginBottom:10}}><label style={lbl}>Adresse</label><input style={inp()} value={draft.adresse||""} onChange={ev=>upd("adresse",ev.target.value)}/></div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Code postal</label><input style={inp()} value={draft.codePostal||""} onChange={ev=>upd("codePostal",ev.target.value)} maxLength={5} inputMode="numeric"/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Ville</label><input style={inp()} value={draft.ville||""} onChange={ev=>upd("ville",ev.target.value)}/></div>
        </div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Téléphone</label><input type="tel" style={inp()} value={draft.telephone||""} onChange={ev=>upd("telephone",ev.target.value)} inputMode="tel"/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Email</label><input type="email" style={inp()} value={draft.email||""} onChange={ev=>upd("email",ev.target.value)} inputMode="email"/></div>
        </div>
        {/* Représentants éditables */}
        {!draft.isMajeur&&<div style={{marginTop:10,padding:10,background:C.Jp,borderRadius:8,border:`1px solid ${C.Jd}`}}>
          <p style={{fontWeight:700,fontSize:12,margin:"0 0 8px"}}>Représentants légaux</p>
          {(draft.representants||[]).map((r,i)=><div key={i} style={{background:C.W,borderRadius:6,padding:8,marginBottom:6,position:"relative"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <strong style={{fontSize:11,color:C.G}}>Resp. {i+1}</strong>
              {(draft.representants||[]).length>1&&<button onClick={()=>delRep(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:4,padding:"2px 6px",fontSize:10,cursor:"pointer",fontWeight:700}}>✕</button>}
            </div>
            <div style={G2}>
              <input style={{...inp(),fontSize:13}} placeholder="Nom" value={r.nom||""} onChange={ev=>updRep(i,"nom",ev.target.value.toUpperCase())}/>
              <input style={{...inp(),fontSize:13}} placeholder="Prénom" value={r.prenom||""} onChange={ev=>updRep(i,"prenom",ev.target.value)}/>
              <select style={{...inp(),fontSize:13}} value={r.lien||""} onChange={ev=>updRep(i,"lien",ev.target.value)}><option value="">— Lien</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select>
              <input type="tel" style={{...inp(),fontSize:13}} placeholder="Téléphone" value={r.tel||""} onChange={ev=>updRep(i,"tel",ev.target.value)}/>
            </div>
            <input type="email" style={{...inp(),fontSize:13,marginTop:6}} placeholder="Email" value={r.email||""} onChange={ev=>updRep(i,"email",ev.target.value)}/>
          </div>)}
          <button onClick={addRep} style={{...BS,fontSize:11,padding:"6px 12px",width:"100%"}}>+ Ajouter</button>
        </div>}
      </div>}
    </SecBlock>

    {/* PAIEMENT - section dépliable, éditable */}
    <SecBlock title="Paiement" open={openSec.paiement||editing} onTog={()=>togSec("paiement")}>
      {!editing?<div style={{background:C.N,borderRadius:8,padding:"10px 12px",margin:"-4px 0 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <PaymentSummary e={e} tarifs={tarifs} dark total={calcTotalDossier(e)}/>
            {e.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {e.nbFois} chèques</div>}
            {e.nomFamille&&<div style={{color:"#86efac",fontSize:12}}>Famille {e.nomFamille}</div>}
          </div>
          <div style={{color:C.J,fontWeight:900,fontSize:22}}>{calcTotalDossier(e)} €</div>
        </div>
        {e.nbFois>1&&e.datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {calcEcheances(e.prixFinal,e.nbFois).map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Chèque {i+1} ({e.datesEcheances[i]?fmtD(e.datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
        </div>}
      </div>:<div>
        <PaymentSplitEditor draft={draft} setDraft={setDraft} tarifs={tarifs} total={calcTotalDossier(recalcDossierPrix(draft,tarifs))}/>
        <div style={{marginTop:10}}><label style={lbl}>Nom de famille</label><input style={inp()} value={draft.nomFamille||""} onChange={ev=>upd("nomFamille",ev.target.value.toUpperCase())}/></div>
        <p style={{fontSize:11,color:C.G,marginTop:6}}>Le prix sera recalculé automatiquement à l'enregistrement selon la catégorie et les membres famille.</p>
      </div>}
    </SecBlock>

    {/* MÉDICAL - dépliable, éditable */}
    <SecBlock title="Medical" open={openSec.medical||editing} onTog={()=>togSec("medical")}>
      {!editing?<div>
        <DR l="Allergies/asthme" v={getAllergies(e)||"—"}/>
        <DR l="Mutuelle" v={e.mutuelle}/>
        <DR l="N° sécu" v={e.numSecu}/>
        <DR l="Médecin" v={e.docteur}/>
        <DR l="Tél médecin" v={e.telDocteur}/>
        <div style={{marginTop:6}}>
          <span style={{background:e.autoSoins?"#dcfce7":"#fee2e2",color:e.autoSoins?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700,marginRight:4}}>Soins {e.autoSoins?"✓":"non"}</span>
          <span style={{background:e.autoPhoto?"#dcfce7":"#fee2e2",color:e.autoPhoto?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700,marginRight:4}}>Photo {e.autoPhoto?"✓":"non"}</span>
          <span style={{background:e.autoTransport?"#dcfce7":"#fee2e2",color:e.autoTransport?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700}}>Transport {e.autoTransport?"✓":"non"}</span>
        </div>
      </div>:<div>
        <div style={{marginBottom:10}}><label style={lbl}>Allergies, asthme, restrictions</label><textarea style={{...inp(),height:60,resize:"vertical"}} value={draft.allergiesAsthme||""} onChange={ev=>upd("allergiesAsthme",ev.target.value)}/></div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Mutuelle</label><input style={inp()} value={draft.mutuelle||""} onChange={ev=>upd("mutuelle",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>N° sécu</label><input style={inp()} value={draft.numSecu||""} onChange={ev=>upd("numSecu",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Médecin</label><input style={inp()} value={draft.docteur||""} onChange={ev=>upd("docteur",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Tél médecin</label><input type="tel" style={inp()} value={draft.telDocteur||""} onChange={ev=>upd("telDocteur",ev.target.value)}/></div>
        </div>
        <Chk checked={draft.autoSoins} onChange={v=>upd("autoSoins",v)} label="Autorise les soins d'urgence"/>
        <Chk checked={draft.autoPhoto} onChange={v=>upd("autoPhoto",v)} label="Autorise les photos/videos"/>
        <Chk checked={draft.autoTransport} onChange={v=>upd("autoTransport",v)} label="Autorise le transport"/>
      </div>}
    </SecBlock>

    {/* ÉQUIPEMENT - dépliable, éditable */}
    <SecBlock title="Equipement" open={openSec.equip||editing} onTog={()=>togSec("equip")}>
      {!editing?<div>
        {getMemberDotationItems(e,e.categorie,tarifs,e.saison||SAISON_DEFAUT).map(item=><DR key={item.id} l={item.label} v={dotationValueForMember(e,item)||"—"}/>)}
        {getMemberMissingDotations(e,tarifs,e.saison||SAISON_DEFAUT).length>0&&<div style={{background:"#fff7ed",border:"1px solid #fdba74",borderRadius:8,padding:"8px 10px",fontSize:12,fontWeight:900,color:"#9a3412",marginTop:6}}>À demander en permanence : {getMemberMissingDotations(e,tarifs,e.saison||SAISON_DEFAUT).join(", ")}</div>}
        {!getMemberDotationItems(e,e.categorie,tarifs,e.saison||SAISON_DEFAUT).length&&<DR l="Dotation" v="Aucune dotation configurée"/>}
      </div>:<EquipFields member={draft} categorie={canonicalCat(draft.categorie)} tarifs={tarifs} onChange={(k,v)=>upd(k,v)}/>}
    </SecBlock>

    {/* DOCS - dépliable, éditable */}
    <SecBlock title="Documents" open={openSec.docs||editing} onTog={()=>togSec("docs")}>
      {!editing?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{l:"Certif.",k:"certifMedical"},{l:"Photo ID",k:"photoId"},{l:"Justif.",k:"justifDom"},{l:"RIB",k:"rib"},{l:"Livret famille",k:"livretFamille"}].map(({l,k})=><span key={k} style={{background:e[k]?"#dcfce7":"#fee2e2",color:e[k]?C.V:C.R,padding:"4px 8px",borderRadius:6,fontSize:12,fontWeight:700}}>{e[k]?"✓":"o"} {l}</span>)}
      </div>:<div>
        <Chk checked={draft.certifMedical} onChange={v=>upd("certifMedical",v)} label="Certificat medical"/>
        <Chk checked={draft.photoId} onChange={v=>upd("photoId",v)} label="Piece d'identite"/>
        <Chk checked={draft.justifDom} onChange={v=>upd("justifDom",v)} label="Justificatif de domicile"/>
        <Chk checked={draft.rib} onChange={v=>upd("rib",v)} label="RIB"/>
        <Chk checked={draft.livretFamille} onChange={v=>upd("livretFamille",v)} label="Livret de famille"/>
      </div>}
    </SecBlock>

    <SecBlock title={`Famille / membres (${tousMembres})`} open={openSec.famille} onTog={()=>togSec("famille")}>
      {editing
        ?<FamilyMembersAdminEditor draft={draft} setDraft={setDraft} tarifs={tarifs} saison={e.saison||SAISON_DEFAUT}/>
        :<FamilyMembersOverview e={e} tarifs={tarifs} onEdit={startMemberEdit}/>}
      {!editing&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 12px",marginTop:8}} onClick={()=>setAddMemberOpen(v=>!v)}><Icon as={UserPlus} size={14}/>{addMemberOpen?"Fermer l'ajout":"Ajouter un membre au dossier"}</button>}
      {!editing&&onAttachIndividualMembers&&attachCandidates.length>0&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 12px",marginTop:8,background:"#eef2ff",borderColor:"#c7d2fe",color:"#3730a3"}} onClick={()=>{setAddMemberOpen(false);setAttachOpen(v=>!v);}}><Icon as={Users} size={14}/>{attachOpen?"Fermer le rattachement":"Rattacher des dossiers individuels"}</button>}
      {!editing&&attachOpen&&<div style={{background:"#eef2ff",border:"1px solid #c7d2fe",borderRadius:10,padding:"10px 12px",marginTop:8}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start",flexWrap:"wrap",marginBottom:8}}>
          <div>
            <div style={{fontSize:13,fontWeight:950,color:"#312e81"}}>Rattacher des membres déjà inscrits seuls</div>
            <div style={{fontSize:11,color:"#4338ca",fontWeight:800,marginTop:2}}>Choisissez les dossiers individuels à intégrer dans ce dossier famille. Ils disparaîtront comme lignes séparées.</div>
          </div>
          {attachPreview&&<div style={{background:C.W,border:"1px solid #c7d2fe",borderRadius:9,padding:"7px 9px",textAlign:"right"}}>
            <div style={{fontSize:10,color:C.G,fontWeight:900,textTransform:"uppercase"}}>Nouveau total licence</div>
            <div style={{fontSize:18,color:C.Jd,fontWeight:950}}>{attachPreview.prixFinal||0} €</div>
          </div>}
        </div>
        <div style={{display:"grid",gap:7,maxHeight:260,overflow:"auto",paddingRight:2}}>
          {attachCandidates.map(d=>{
            const checked=attachIds.includes(d.id);
            return <label key={d.id} style={{display:"grid",gridTemplateColumns:"auto minmax(0,1fr) auto",gap:9,alignItems:"center",background:checked?C.W:"#f8fafc",border:`1px solid ${checked?"#6366f1":C.Gb}`,borderRadius:9,padding:"8px 9px",cursor:"pointer"}}>
              <input type="checkbox" checked={checked} onChange={()=>toggleAttach(d.id)} style={{accentColor:"#4f46e5"}}/>
              <span style={{minWidth:0}}>
                <strong style={{fontSize:12,color:C.N}}>{d.prenom} {d.nom}</strong>
                <span style={{display:"block",fontSize:11,color:C.G,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{adminCatValue(d)} · {d.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle licence"} · {getEmailContact(d)||getTelContact(d)||d.id}</span>
              </span>
              <span style={{background:C.N,color:C.J,borderRadius:7,padding:"4px 7px",fontSize:11,fontWeight:950}}>{d.prixFinal||prixCategorie(tarifs,d.categorie)||0} €</span>
            </label>;
          })}
        </div>
        <button style={{...BP,width:"100%",fontSize:13,padding:"9px 12px",marginTop:9,opacity:attachIds.length?1:.55}} disabled={!attachIds.length} onClick={confirmAttach}><Icon as={Check} size={15}/>Rattacher {attachIds.length||""} dossier{attachIds.length>1?"s":""} et recalculer</button>
        <p style={{fontSize:11,color:"#4338ca",fontWeight:800,margin:"7px 0 0"}}>Vérifiez ensuite les paiements et documents : les montants licence sont recalculés avec la remise famille.</p>
      </div>}
      {!editing&&addMemberOpen&&<div style={{background:"#fff7ed",border:"1px solid #fdba74",borderRadius:10,padding:"10px 12px",marginTop:8}}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          <button style={{...BS,flex:1,fontSize:12,padding:"8px 10px",background:newMemberKind==="mineur"?C.J:C.W}} onClick={()=>setNewKind("mineur")}>Mineur</button>
          <button style={{...BS,flex:1,fontSize:12,padding:"8px 10px",background:newMemberKind==="adulte"?C.J:C.W}} onClick={()=>setNewKind("adulte")}>Adulte</button>
        </div>
        <div style={G2}>
          <F label="Nom *"><input style={inp()} value={newMember.nom||""} onChange={ev=>updNewMember("nom",ev.target.value.toUpperCase())}/></F>
          <F label="Prénom *"><input style={inp()} value={newMember.prenom||""} onChange={ev=>updNewMember("prenom",ev.target.value)}/></F>
          <F label="Date de naissance *"><input type="date" style={inp()} value={newMember.dateNaissance||""} onChange={ev=>updNewMember("dateNaissance",ev.target.value)}/></F>
          <F label="Sexe *"><select style={inp()} value={newMember.sexe||""} onChange={ev=>updNewMember("sexe",ev.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
          <F label="Catégorie *"><select style={inp()} value={newMember.categorie||""} onChange={ev=>updNewMember("categorie",ev.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
          {newMember.categorie==="Dirigeant"&&<F label="Rattaché à la catégorie"><select style={inp()} value={newMember.dirigeantCategorie||""} onChange={ev=>updNewMember("dirigeantCategorie",ev.target.value)}><option value="">— Choisir</option>{DIRIGEANT_RATTACHEMENT_CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>}
          <F label="Type licence"><select style={inp()} value={newMember.typeLicence||"nouvelle"} onChange={ev=>updNewMember("typeLicence",ev.target.value)}><option value="nouvelle">Nouvelle licence</option><option value="renouvellement">Renouvellement</option></select></F>
          <F label="N° licence FFF"><input style={inp()} value={newMember.numLicenceFFF||""} onChange={ev=>updNewMember("numLicenceFFF",ev.target.value)}/></F>
          <F label="N° personne"><input style={inp()} value={newMember.numPersonne||""} onChange={ev=>updNewMember("numPersonne",ev.target.value)}/></F>
          {newMemberKind==="adulte"&&<>
            <F label="Téléphone"><input style={inp()} value={newMember.tel||""} onChange={ev=>updNewMember("tel",ev.target.value)} inputMode="tel"/></F>
            <F label="Email"><input type="email" style={inp()} value={newMember.email||""} onChange={ev=>updNewMember("email",ev.target.value)}/></F>
          </>}
        </div>
        <EquipFields member={newMember} categorie={newMember.categorie} tarifs={tarifs} onChange={(k,v)=>updNewMember(k,v)}/>
        <button style={{...BP,width:"100%",fontSize:13,padding:"9px 12px",marginTop:6}} onClick={addNewMember}><Icon as={Check} size={15}/>Enregistrer ce nouveau membre</button>
      </div>}
    </SecBlock>

    {/* Email Footclubs (utile bureau) */}
    <div style={{background:"#f0f9ff",border:"1.5px solid #7dd3fc",borderRadius:10,padding:"10px 12px",marginTop:12,marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:11,color:"#0369a1",margin:"0 0 4px",textTransform:"uppercase"}}>Email pour Footclubs</p>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{flex:1,fontWeight:700,fontSize:13,wordBreak:"break-all"}}>{getEmailContact(e)||"—"}</span>
        <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:36}} onClick={()=>navigator.clipboard.writeText(getEmailContact(e))}>Copier</button>
      </div>
    </div>

    {e.commentaire&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:13,color:"#92400e"}}>
      <strong>Message du preinscrit :</strong> {e.commentaire}
    </div>}

    {/* Notes secrétariat */}
    <div style={{marginBottom:12,background:C.Gc,padding:12,borderRadius:10,border:`1.5px dashed ${C.Gb}`}}>
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px"}}>Notes secretariat</p>
      <textarea style={{...inp(),height:70,resize:"vertical",fontSize:13}} value={note} onChange={ev=>setNote(ev.target.value)} placeholder="Notes internes — visibles uniquement par le bureau et les bénévoles…"/>
      <button style={{...BP,fontSize:12,padding:"8px 14px",marginTop:6,opacity:saving?.7:1}} onClick={saveNote} disabled={saving}>{saving?"Enregistrement...":"Enregistrer la note"}</button>
    </div>

    <div style={{display:"flex",gap:8}}>
      <button style={{...BS,flex:1,fontSize:13}} onClick={()=>printFiche(e)}>Imprimer</button>
      <button style={{flex:1,background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:13,cursor:"pointer",minHeight:48}} onClick={()=>onDel(e.id)}>Supprimer</button>
    </div>
  </div>;
}

// Bloc dépliable pour le DetailPanel
function SecBlock({title,open,onTog,children}){
  return<div style={{background:"#fafafa",borderRadius:10,border:`1px solid ${C.Gb}`,marginBottom:8,overflow:"hidden"}}>
    <button onClick={onTog} style={{width:"100%",background:"transparent",border:"none",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontWeight:700,fontSize:13,color:C.N}}>
      <span>{title}</span>
      <span style={{color:C.G,fontSize:14,transform:open?"rotate(180deg)":"none",transition:"transform .15s"}}>v</span>
    </button>
    {open&&<div style={{padding:"4px 12px 12px"}}>{children}</div>}
  </div>;
}


/* â•â• IMPRESSION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// Récap imprimable côté utilisateur (à apporter en permanence)
function printRecap(f,saison,prixFinal,modeObj,echeances,datesEcheances,certifNeeded,aDesMembresFamille,tarifs){
  const w=window.open("","_blank");if(!w)return;
  const photoHtml=f.photoBase64?`<img src="${f.photoBase64}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:"";
  const docs=getDocsAApporter(f,certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
  const planningRows=planningForEntry(tarifs,f);
  const planningContacts=[...new Map(planningRows.map(c=>planningResponsableFor(tarifs,c.categorie,c.sexe)).filter(r=>planningContactLabel(r)).map(r=>[planningRespKey(r.categorie,r.sexe),r])).values()];
  const ech=echeances&&f.nbFois>1?echeances.map((m,i)=>`<tr><td style="padding:3px 8px">${modeObj?.id==="cheque"?"Chèque":"Versement"} ${i+1}</td><td style="padding:3px 8px">${datesEcheances&&datesEcheances[i]?fmtD(datesEcheances[i]):"?"}</td><td style="padding:3px 8px;text-align:right;font-weight:700">${m} €</td></tr>`).join(""):"";
  const fs=f.freresSoeurs?.length?`<h2>Frères / sœurs</h2><ul style="margin:0;padding-left:18px">${f.freresSoeurs.map(m=>`<li>${m.prenom} ${m.nom} — ${catLabel(m.categorie)||"?"}${m.dateNaissance?` (né(e) ${fmtD(m.dateNaissance)})`:""}</li>`).join("")}</ul>`:"";
  const ad=f.adultesFamille?.length?`<h2>Adultes famille</h2><ul style="margin:0;padding-left:18px">${f.adultesFamille.map(m=>`<li>${m.prenom} ${m.nom} — ${catLabel(m.categorie)||"?"}</li>`).join("")}</ul>`:"";
  const reps=!f.representants?"":f.representants.filter(r=>r.nom).map(r=>`<li><strong>${r.lien||"Resp."} :</strong> ${r.prenom} ${r.nom} — ${r.tel} — ${r.email}</li>`).join("");
  const equipementRecap=getDotationRecapRows(f,f.categorie,tarifs,saison);
  w.document.write(`<!DOCTYPE html><html><head><title>Récap RSG</title><style>
    body{font-family:Arial,sans-serif;max-width:780px;margin:20px auto;font-size:12px;padding:0 20px}
    h1{border-bottom:4px solid #F5C800;padding-bottom:8px;margin:0 0 6px}
    h2{background:#F5C800;padding:4px 10px;font-size:13px;display:inline-block;border-radius:3px;margin:14px 0 6px}
    .row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0;font-size:11px}
    .l{color:#6b7280;min-width:120px;flex-shrink:0}
    .v{font-weight:600}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
    .pay{background:#111;color:#F5C800;padding:12px 14px;border-radius:8px;margin:12px 0;font-size:14px}
    .docs{background:#fffbeb;border:1.5px solid #fcd34d;padding:10px 14px;border-radius:8px;margin:10px 0}
    table{border-collapse:collapse;width:100%;margin-top:6px}
    table td{border-bottom:1px solid #eee}
    @media print{button{display:none!important}.no-print{display:none}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h1>⚽ RÉVEIL SAINT-GÉRÉON<br/><span style="font-size:13px;font-weight:400">Récap préinscription — Saison ${saison}</span></h1>
      <p style="margin:4px 0;font-size:11px;color:${certifNeeded?"#dc2626":"#16a34a"};font-weight:700">${certifNeeded?"🩺 Certif médical OBLIGATOIRE à apporter":"✅ Certif médical valide"}</p>
    </div>
    ${photoHtml}
  </div>
  <div class="pay">💰 Total à payer : <strong>${prixFinal} €</strong> · ${modeObj?.l||""}${f.nbFois>1?` · En ${f.nbFois} versements`:""}</div>
  ${ech?`<table>${ech}</table>`:""}
  <h2>Joueur principal</h2>
  <div class="grid">
    <div class="row"><span class="l">Nom complet</span><span class="v">${f.prenom} ${f.nom}</span></div>
    <div class="row"><span class="l">Naissance</span><span class="v">${fmtD(f.dateNaissance)}${f.lieuNaissance?" — "+f.lieuNaissance:""}</span></div>
    <div class="row"><span class="l">Catégorie</span><span class="v">${catLabel(f.categorie)}</span></div>
    ${f.doubleLicenceDirigeant?`<div class="row"><span class="l">Licence dirigeant</span><span class="v">Oui</span></div>`:""}
    <div class="row"><span class="l">Adresse</span><span class="v">${f.adresse}, ${f.codePostal} ${f.ville}</span></div>
    <div class="row"><span class="l">Nationalité</span><span class="v">${f.nationalite||""}</span></div>
    ${f.email?`<div class="row"><span class="l">Email</span><span class="v">${f.email}</span></div>`:""}
    ${f.telephone?`<div class="row"><span class="l">Téléphone</span><span class="v">${f.telephone}</span></div>`:""}
  </div>
  ${reps?`<h2>Représentants légaux</h2><ul style="margin:0;padding-left:18px;font-size:11px">${reps}</ul>`:""}
  ${equipementRecap.length?`<h2>Équipement</h2><p style="font-size:11px;margin:0">${equipementRecap.map(row=>`${row.label} : <strong>${row.value}</strong>`).join(" · ")}</p>`:""}
  ${fs}
  ${ad}
  ${f.allergiesAsthme?`<h2>Médical</h2><p style="font-size:11px">Allergies/asthme/restrictions : <strong>${f.allergiesAsthme}</strong></p>`:""}
  ${docs.length?`<div class="docs"><strong>📋 Préparez si possible pour la permanence :</strong><ul style="margin:6px 0 0;padding-left:20px">${docs.map(d=>`<li>${d}</li>`).join("")}</ul></div>`:`<div class="docs">✅ Tous les documents sont préparés. Pensez au règlement et à votre référence.</div>`}
  <h2>Permanences licence</h2>
  <ul style="margin:0;padding-left:18px;font-size:11px">${permanences.map(p=>`<li>${fmtPermanenceHtml(p)}</li>`).join("")}</ul>
  ${planningRows.length?`<h2>Entraînements</h2><ul style="margin:0;padding-left:18px;font-size:11px">${planningRows.map(c=>`<li><b>${planningOptionLabel(c)}</b> · ${creneauLabel(c)}</li>`).join("")}</ul>${planningContacts.length?`<p style="font-size:11px;margin:6px 0 0"><b>Responsable :</b> ${planningContacts.map(planningContactLabel).join(" · ")}</p>`:""}`:""}
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999">
    Document à apporter en permanence licence · RSG Réveil Saint-Géréon · Saison ${saison}
  </div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="background:#F5C800;border:none;padding:10px 24px;font-weight:700;border-radius:6px;cursor:pointer">Imprimer</button>
  </div>
  <script>setTimeout(()=>window.print(),400);</script>
  </body></html>`);
  w.document.close();
}

function printFiche(e){
  const w=window.open("","_blank");if(!w)return;
  const mode=paiementLabels(e.modePaiements,e.modePaiement,null).join(" + ")||"—";
  const ech=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  const equipementRecap=EQUIP_FIELDS.map(id=>({label:EQUIP_LABELS[id],value:id==="tailleSurvet"?getSurvet(e):e?.[id]})).filter(row=>row.value);
  w.document.write(`<!DOCTYPE html><html><head><title>Fiche ${e.prenom} ${e.nom}</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:20px auto;font-size:12px}h1{border-bottom:4px solid #F5C800;padding-bottom:8px}h2{background:#F5C800;padding:3px 8px;font-size:12px;display:inline-block;border-radius:3px;margin:14px 0 6px}.row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0;font-size:11px}.l{color:#6b7280;min-width:120px;flex-shrink:0}.v{font-weight:600}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.pay{background:#111;color:#F5C800;padding:10px 14px;border-radius:8px;margin:12px 0}@media print{button{display:none!important}}</style></head><body>
  <div style="display:flex;justify-content:space-between"><div><h1>⚽ RÉVEIL SAINT-GÉRÉON<br><span style="font-size:13px;font-weight:400">Préinscription — Saison ${e.saison||"—"}</span></h1>
  <span style="background:#111;color:#F5C800;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${catLabel(e.categorie)}</span> <span style="font-size:11px">${e.typeLicence==="renouvellement"?"🔄 Renouvellement":"✨ Nouvelle"}</span> <span style="font-size:11px;color:#666">${e.id}</span>
  <div style="margin-top:4px;font-size:11px;color:${e.certifNeeded?"#dc2626":"#16a34a"};font-weight:700">${e.certifNeeded?"🩺 Certif médical OBLIGATOIRE":"✅ Certif valable"}</div></div>
  ${e.photoBase64?`<img src="${e.photoBase64}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:""}
  </div>
  <div class="pay">💰 ${e.prixFinal||0} € · ${mode}${e.nbFois>1?` · En ${e.nbFois} fois`:""}${e.remisePct>0?` · Remise famille -${e.remisePct}% (${e.nomFamille||""})`:""}</div>
  ${ech?`<p style="font-size:11px">Échéancier : ${ech.map((m,i)=>`Versement ${i+1} : ${m} €`).join(" | ")}</p>`:""}
  <h2>Joueur</h2><div class="grid"><div class="row"><span class="l">Nom</span><span class="v">${e.prenom} ${e.nom}</span></div><div class="row"><span class="l">Naissance</span><span class="v">${fmtD(e.dateNaissance)}${e.lieuNaissance?" — "+e.lieuNaissance:""}</span></div><div class="row"><span class="l">Adresse</span><span class="v">${e.adresse}, ${e.codePostal} ${e.ville}</span></div>${e.numLicenceFFF?`<div class="row"><span class="l">N° FFF</span><span class="v">${e.numLicenceFFF}</span></div>`:""}</div>
  ${(() => {const r=getResp1(e);return!e.isMajeur&&r?`<h2>Responsable légal</h2><div class="grid"><div class="row"><span class="l">Identité</span><span class="v">${r.prenom||""} ${r.nom||""}${r.lien?" ("+r.lien+")":""}</span></div><div class="row"><span class="l">Téléphone</span><span class="v">${r.tel||""}</span></div><div class="row"><span class="l">Email</span><span class="v">${r.email||""}</span></div></div>`:"";})()}
  ${equipementRecap.length?`<h2>Équipement</h2><p style="font-size:11px">${equipementRecap.map(row=>`${row.label} : <b>${row.value}</b>`).join(" · ")}</p>`:""}
  ${e.notes?`<h2>Notes bureau</h2><p>${e.notes}</p>`:""}
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999;display:flex;justify-content:space-between"><span>RSG Réveil Saint-Géréon · Saison ${e.saison} · Document confidentiel</span><span>${STATUTS[e.statut]?.l||"—"}</span></div>
  <script>setTimeout(()=>window.print(),300);</script></body></html>`);
  w.document.close();
}

function printAttestation(e,tarifs){
  if(!attestationRequiredForMember(e)){alert("Attestation non nécessaire : la licence dirigeant est gratuite.");return;}
  const w=window.open("","_blank");if(!w)return;
  const contenu=renderTpl(getAttestationTemplate(tarifs),e,tarifs);
  w.document.write(`<!DOCTYPE html><html><head><title>Attestation licence ${e.prenom} ${e.nom}</title><style>
    body{font-family:Arial,sans-serif;max-width:820px;margin:26px auto;padding:0 28px;color:#111}
    .head{border-bottom:5px solid #F5C800;padding-bottom:14px;margin-bottom:30px;display:flex;align-items:center;gap:14px}
    .logo{width:68px;height:68px;object-fit:contain}
    h1{margin:0;font-size:24px}
    .club{font-weight:900;font-size:18px}
    .box{border:2px solid #111;border-radius:10px;padding:22px;margin:24px 0;font-size:16px;line-height:1.7}
    .meta{background:#f9fafb;border-radius:8px;padding:12px 14px;font-size:13px}
    .sig{margin-top:56px;display:flex;justify-content:space-between;gap:30px;align-items:flex-start}
    .sig-right{text-align:left;min-width:280px}
    .signature{display:block;margin-top:12px;max-width:330px;max-height:96px;object-fit:contain}
    @media print{button{display:none!important}}
  </style></head><body>
    ${contenu}
    <button onclick="window.print()" style="margin-top:40px;background:#F5C800;border:none;padding:10px 22px;font-weight:800;border-radius:8px;cursor:pointer">Imprimer / PDF</button>
    <script>setTimeout(()=>window.print(),350);</script>
  </body></html>`);
  w.document.close();
}

function prepareAttestationEmail(e,tarifs){
  if(!dossierHasAttestation(e)){alert("Attestation non nécessaire : la licence dirigeant est gratuite.");return;}
  const email=getEmailContact(e);
  if(!email){alert("Aucun email de contact trouvé pour ce dossier.");return;}
  alert("Le navigateur va préparer l'email. Pour joindre l'attestation, utilisez d'abord le bouton Attestation licence puis Imprimer / PDF : un site statique ne peut pas attacher automatiquement un PDF à un mailto.");
  const subject=`Attestation de licence RSG - ${e.prenom||""} ${e.nom||""}`;
  const body=[
    `Bonjour,`,
    ``,
    `Veuillez trouver l'attestation de licence du Réveil Saint-Géréon pour ${e.prenom||""} ${e.nom||""}.`,
    ``,
    `Référence dossier : ${e.id||""}`,
    `Saison : ${e.saison||""}`,
    `Catégorie : ${catLabel(e.categorie)||""}`,
    ``,
    `Pièce jointe à ajouter : attestation de licence PDF.`,
    ``,
    `Sportivement,`,
    `Le Réveil Saint-Géréon`
  ].join("\n");
  window.location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* â•â• MICRO-COMPOSANTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ProgressBar({steps,current}){
  return<div style={{display:"flex",alignItems:"center",marginBottom:14,padding:"0 2px"}}>
    {steps.map((sl,i)=><div key={i} style={{display:"flex",alignItems:"center",flex:1}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
        <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,background:current>i+1?C.V:current===i+1?C.J:"#e5e7eb",color:current>i+1||current===i+1?C.N:"#9ca3af",transition:"all .2s"}}>{current>i+1?"✓":i+1}</div>
        <span style={{fontSize:9,color:current===i+1?C.N:"#9ca3af",fontWeight:current===i+1?700:400,whiteSpace:"nowrap",textAlign:"center",lineHeight:1.1,maxWidth:52}}>{sl}</span>
      </div>
      {i<steps.length-1&&<div style={{height:2,flex:1,background:current>i+1?C.V:"#e5e7eb",margin:"0 2px 12px",transition:"all .2s"}}/>}
    </div>)}
  </div>;
}
function TypeCard({sel,onClick,icon,title,sub}){const isComponent=typeof icon==="function"||(icon&&typeof icon==="object"&&"$$typeof" in icon);return<div onClick={onClick} style={{border:`2px solid ${sel?C.J:C.Gb}`,background:sel?C.Jp:"#fafafa",borderRadius:12,padding:"14px 10px",cursor:"pointer",textAlign:"center",transition:"all .15s",minHeight:110,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,boxShadow:sel?"0 10px 22px rgba(245,200,0,.18)":"0 4px 12px rgba(15,23,42,.04)"}}><div style={{width:38,height:38,borderRadius:12,background:sel?C.N:C.W,color:sel?C.J:C.N,border:`1px solid ${sel?C.N:C.Gb}`,display:"grid",placeItems:"center"}}>{isComponent?<Icon as={icon} size={20}/>:icon}</div><div style={{fontWeight:900,fontSize:14,color:C.N}}>{title}</div><div style={{fontSize:11,color:C.G,lineHeight:1.3}}>{sub}</div></div>;}
function ErrB({msg}){return<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:12}}>⚠ {msg}</div>;}
function F({label,err,children,span}){return<div style={{marginBottom:12,gridColumn:span?"1 / -1":undefined}}><label style={lbl}>{label}</label>{children}{err&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {err}</span>}</div>;}
function Chk({checked,onChange,label,err}){return<div style={{marginBottom:10}}><label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{marginTop:2,accentColor:C.J,width:18,height:18,flexShrink:0}}/><span style={{fontSize:13,color:C.N,lineHeight:1.4}}>{label}</span></label>{err&&<span style={{color:C.R,fontSize:11,display:"block",marginTop:3,marginLeft:28}}>⚠ {err}</span>}</div>;}
function RB({title,children}){return<div style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:8}}><p style={{fontWeight:700,fontSize:12,color:C.N,margin:"0 0 6px"}}>{title}</p>{children}</div>;}
function RR({l,v}){return<div style={{display:"flex",gap:8,fontSize:12,padding:"2px 0"}}><span style={{color:C.G,minWidth:100,flexShrink:0}}>{l} :</span><span style={{fontWeight:600}}>{v||"—"}</span></div>;}
function MC({title,children}){return<div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px"}}><p style={{fontWeight:700,fontSize:11,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.4}}>{title}</p>{children}</div>;}
function DR({l,v}){return<div style={{padding:"3px 0",borderBottom:`1px solid ${C.Gc}`,display:"flex",gap:6,fontSize:11}}><span style={{color:"#9ca3af",minWidth:72,flexShrink:0}}>{l}</span><span style={{fontWeight:600,wordBreak:"break-all"}}>{v||"—"}</span></div>;}


