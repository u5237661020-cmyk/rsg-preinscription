import { useState, useEffect, useRef, useCallback } from "react";
import {
  fbSaveInscription, fbGetAllInscriptions, fbDeleteInscription, fbWatchInscriptions,
  fbSaveTarifs, fbGetTarifs, fbSaveLicencies, fbGetLicencies, isFirebaseAvailable,
  fbSaveGlobalConfig, fbGetGlobalConfig,
} from "./firebase.js";

/* â•â• SAISONS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const saisons = (() => {
  const y = new Date().getFullYear();
  return Array.from({length:6},(_,i)=>{const s=y-1+i;return{value:`${s}-${s+1}`,label:`Saison ${s}-${s+1}`};});
})();
const SAISON_DEFAUT = `${new Date().getFullYear()}-${new Date().getFullYear()+1}`;

/* â•â• STORAGE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HiÃ©rarchie : (1) window.storage (artifacts), (2) localStorage (navigateur), (3) memory
   Firestore est utilisÃ© en parallÃ¨le pour le partage entre appareils. */
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
  "VÃ©tÃ©ran":    100,
  "Dirigeant":    0,
};

// Remise famille (Ã  partir du 2e membre de la mÃªme famille, tous confondus)
// Ces valeurs par dÃ©faut sont surchargeables dans Admin > Tarifs
const REMISE_FAMILLE_DEFAUT = {
  2: 10,   // 2e membre : -10%
  3: 20,   // 3e : -20%
  4: 30,   // 4e+ : -30%
};

const PERMANENCES_DEFAUT = [
  {date:"",debut:"",fin:"",lieu:"Stade du RSG"},
];

const PIECES_DEFAUT = [
  {id:"certifMedical",label:"Certificat mÃ©dical complÃ©tÃ© par le mÃ©decin",condition:"certif"},
  {id:"photoId",label:"PiÃ¨ce d'identitÃ© (CNI ou passeport)",condition:"always"},
  {id:"justifDom",label:"Justificatif de domicile (- 3 mois)",condition:"always"},
  {id:"rib",label:"RIB",condition:"always"},
  {id:"livretFamille",label:"Livret de famille (obligatoire pour tarif famille)",condition:"famille"},
  {id:"acteNaissance",label:"Extrait d'acte de naissance",condition:"etranger"},
  {id:"residenceParents",label:"Justificatif de rÃ©sidence des parents",condition:"etranger"},
  {id:"nationaliteParents",label:"Justificatif de nationalitÃ© des parents",condition:"etranger"},
];

const BOUTIQUE_DEFAUT = [
  {id:"pull_rsg",nom:"Pull RSG",categorie:"Textile",prix:25,tailles:["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L","XL","2XL","3XL"],actif:true,imageBase64:""},
  {id:"short_rsg",nom:"Short RSG",categorie:"Ã‰quipement joueur",prix:12,tailles:["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L","XL","2XL","3XL"],actif:true,imageBase64:""},
  {id:"chaussettes_rsg",nom:"Chaussettes RSG",categorie:"Ã‰quipement joueur",prix:7,tailles:["27-30","31-34","35-38","39-42","43-46"],actif:true,imageBase64:""},
];
const BOUTIQUE_CATEGORIES_DEFAUT = ["Textile","Ã‰quipement joueur","Accessoires","Commande spÃ©ciale"];

// Modes de paiement
// CB et EspÃ¨ces : 1 fois uniquement (en permanence)
// ChÃ¨que : fractionnement 1 Ã  4 fois sans frais
const MODES_PAIEMENT = [
  {id:"cb",     l:"ðŸ’³ Carte bancaire", fractionnable:false, lieu:"En permanence licence"},
  {id:"cheque", l:"ðŸ“ ChÃ¨que",         fractionnable:true,  lieu:"En permanence licence"},
  {id:"especes",l:"ðŸ’µ EspÃ¨ces",        fractionnable:false, lieu:"En permanence licence"},
  {id:"rib",    l:"ðŸ¦ RIB / virement", fractionnable:true,  lieu:"Selon consignes du club"},
];

/* â•â• CONSTANTES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ADMIN = "RSG2025";
const C = {J:"#F5C800",Jd:"#D6A900",Jp:"#FFF8D6",N:"#111827",Nm:"#1F2937",Ns:"#374151",G:"#697386",Gc:"#F6F7FB",Gb:"#E8ECF3",W:"#FFFFFF",V:"#16a34a",R:"#dc2626",B:"#2563eb"};
const FONT="'Inter','Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif";
const CATS = [
  {l:"Babyfoot",v:"Babyfoot"},
  {l:"U6/U7",v:"U6-U7"},
  {l:"U8/U9",v:"U8-U9"},
  {l:"U10/U11",v:"U10-U11"},
  {l:"U12/U13",v:"U12-U13"},
  {l:"U14/U15",v:"U14-U15"},
  {l:"U16/U17/U18",v:"U16-U17-U18"},
  {l:"Seniors",v:"Senior"},
  {l:"VÃ©tÃ©rans",v:"VÃ©tÃ©ran"},
  {l:"Dirigeants",v:"Dirigeant"},
];
const ORDRE_CATS = CATS.map(c=>c.v);
const catLabel = cat => CATS.find(c=>c.v===cat)?.l || cat;
const orderedTarifEntries = tarifs => [...ORDRE_CATS.filter(cat=>tarifs?.[cat]!==undefined).map(cat=>[cat,tarifs[cat]]),...Object.entries(tarifs||{}).filter(([k])=>!k.startsWith("_")&&!ORDRE_CATS.includes(k)).sort(([a],[b])=>a.localeCompare(b))];
const catRank = cat => {
  const i=ORDRE_CATS.indexOf(cat);
  return i>=0?i:999;
};
const sortCats = cats => [...cats].sort((a,b)=>catRank(a)-catRank(b)||String(a).localeCompare(String(b)));
const POSTES = ["Gardien","DÃ©fenseur central","LatÃ©ral droit","LatÃ©ral gauche","Milieu dÃ©fensif","Milieu central","Milieu offensif","Ailier droit","Ailier gauche","Attaquant","Pas de prÃ©fÃ©rence"];
const NATS   = ["FranÃ§aise","AlgÃ©rienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Ukrainienne","Libanaise","SÃ©nÃ©galaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Autre"];
const LIENS  = ["PÃ¨re","MÃ¨re","Tuteur lÃ©gal","Grand-parent","FrÃ¨re/SÅ“ur majeur(e)"];
// Tailles disponibles selon catÃ©gorie
const TA = ["S","M","L","XL","2XL","3XL","4XL"];                              // Adultes Kappa
const TE = ["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm"];  // Enfants Kappa
const TADO = ["10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L"];  // Ados (mix enfant + adulte)

// Retourne les tailles Ã  proposer selon la catÃ©gorie
const getTaillesCat=cat=>{
  if(["Senior","VÃ©tÃ©ran","Dirigeant"].includes(cat))return TA;
  if(["U12-U13","U14-U15","U16-U17-U18"].includes(cat))return TADO;
  return TE; // Babyfoot, U6-U7, U8-U9, U10-U11
};

// Indique si un sweat RSG est proposÃ© pour cette catÃ©gorie (U10-U11 uniquement)
const aSweat=cat=>cat==="U10-U11";
// Indique si un survÃªtement est proposÃ© pour cette catÃ©gorie (U12-U13 et plus)
const aSurvet=cat=>["U12-U13","U14-U15","U16-U17-U18","Senior","VÃ©tÃ©ran","Dirigeant"].includes(cat);
const STATUTS = {
  attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:"â³"},
  incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:"âš ï¸"},
  valide:{l:"ValidÃ©",c:"#16a34a",bg:"#dcfce7",i:"âœ…",hint:"Licence rÃ©glÃ©e"},
  refuse:{l:"RefusÃ©",c:"#6b7280",bg:"#f3f4f6",i:"âŒ"},
  paye:{l:"ValidÃ©",c:"#16a34a",bg:"#dcfce7",i:"âœ…",hint:"Ancien statut payÃ©"},
};
const STATUT_ORDER=["attente","incomplet","valide","refuse"];
const STATUTS_BOUTIQUE = {
  a_regler:{l:"Ã€ rÃ©gler",c:"#ca8a04",bg:"#fef9c3"},
  regle:{l:"RÃ©glÃ©",c:"#16a34a",bg:"#dcfce7"},
  commande:{l:"CommandÃ©",c:"#2563eb",bg:"#dbeafe"},
  attente_fournisseur:{l:"En attente fournisseur",c:"#7c3aed",bg:"#ede9fe"},
  recu:{l:"ReÃ§u club",c:"#0891b2",bg:"#cffafe"},
  livre:{l:"LivrÃ©",c:"#15803d",bg:"#dcfce7"},
  annule:{l:"AnnulÃ©",c:"#6b7280",bg:"#f3f4f6"},
};

// Base licenciÃ©s (chargÃ©e au dÃ©marrage depuis /licencies.json â€” voir public/licencies.json)
// Pour mettre Ã  jour la base chaque saison : remplacer simplement le fichier public/licencies.json
const BASE_FOOTCLUBS = []

const F0 = {
  typeLicence:"",numLicenceFFF:"",
  nom:"",prenom:"",dateNaissance:"",sexe:"",lieuNaissance:"",
  nationalite:"FranÃ§aise",nationaliteAutre:"",
  adresse:"",codePostal:"",ville:"",
  email:"",telephone:"",
  categorie:"",poste:"",ancienClub:"",aJoueAutreClub:false,mutationNotes:"",dirigeantArbitre:false,
  // ReprÃ©sentants lÃ©gaux : tableau pour permettre d'en ajouter (au-delÃ  des 2 par dÃ©faut)
  representants:[
    {nom:"",prenom:"",lien:"",tel:"",email:""},  // Resp. principal
  ],
  // MÃ©dical
  mutuelle:"",numSecu:"",allergiesAsthme:"",docteur:"",telDocteur:"",
  // Autorisations COCHÃ‰ES PAR DÃ‰FAUT
  autoSoins:true,autoPhoto:true,autoTransport:true,
  // Documents
  certifMedical:false,photoId:false,justifDom:false,rib:false,livretFamille:false,
  charteAcceptee:false,
  // Ã‰quipement
  tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",
  // Photo d'identitÃ© (obligatoire)
  photoBase64:"",
  // Famille
  freresSoeurs:[], // mineurs : {nom,prenom,dateNaissance,sexe,categorie,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,tailleSweat,photoBase64}
  adultesFamille:[], // adultes : {nom,prenom,dateNaissance,sexe,nationalite,categorie,tel,email,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,photoBase64}
  // Commentaire libre
  commentaire:"",
  // Paiement
  modePaiement:"",nbFois:1,nomFamille:"",dateEcheance1:"",datesEcheances:[],
};

/* â•â• HELPERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const genId  = ()=>"RSG-"+Date.now().toString(36).toUpperCase().slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();
const fmtD   = iso=>iso?new Date(iso).toLocaleDateString("fr-FR"):"â€”";
const fmtDT  = iso=>iso?new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"â€”";
const calcAge= dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate()))a--;return a;};
// DÃ©termine la catÃ©gorie d'un joueur en fonction de son annÃ©e de naissance pour la saison sÃ©lectionnÃ©e
// Ex: pour saison 2026-2027, U6-U7 = nÃ© en 2020 ou 2021
const suggestCat=(dob,saison)=>{
  if(!dob)return"";
  const yr=new Date(dob).getFullYear();
  // AnnÃ©e de rÃ©fÃ©rence = annÃ©e de fin de saison - 1 (logique footballistique : la saison 2026-2027 dÃ©marre en aoÃ»t 2026)
  // On extrait l'annÃ©e de dÃ©but de saison (ex: "2026-2027" â†’ 2026)
  const m=(saison||"").match(/(\d{4})-/);
  const sStart=m?parseInt(m[1]):new Date().getFullYear();
  const age=sStart-yr; // Ã¢ge atteint dans l'annÃ©e de dÃ©but de saison
  // Mapping selon les catÃ©gories U dÃ©finies (n=Ã¢ge atteint, ex: U7 = nÃ© il y a moins de 7 ans au 31/12 de la saison)
  if(yr>=sStart-4)return"Babyfoot";        // 2022+ pour 2026-2027 (4 ans et moins)
  if(yr>=sStart-6)return"U6-U7";           // 2020-2021
  if(yr>=sStart-8)return"U8-U9";           // 2018-2019
  if(yr>=sStart-10)return"U10-U11";        // 2016-2017
  if(yr>=sStart-12)return"U12-U13";        // 2014-2015
  if(yr>=sStart-14)return"U14-U15";        // 2012-2013
  if(yr>=sStart-17)return"U16-U17-U18";    // 2009-2011
  if(yr>=sStart-33)return"Senior";          // 1993-2008 (34 ans en saison 2026-2027 = encore Senior)
  return"VÃ©tÃ©ran";                           // 1992 et avant (â‰¥ 34 ans atteints)
};
// Indique si un certif mÃ©dical sera requis pour la saison sÃ©lectionnÃ©e (= saison de prÃ©inscription)
// Le fichier Footclubs (saison N) contient une colonne "ValiditÃ© Certif MÃ©dic N+1"
// qui indique la validitÃ© du certif pour la saison N+1 â€” celle des prÃ©inscriptions saisies dans l'app.
// Nouveau format Footclubs : champ `cm` (true = "Non valide" â†’ certif Ã  fournir, false = "Valide" â†’ OK)
// Ancien format : champ anneeLastCertif (validitÃ© 3 saisons)
const certifRequis=lic=>{
  if(!lic)return null;
  if(typeof lic.cm==="boolean")return lic.cm;
  const annee=lic.anneeLastCertif||lic.a;
  if(!annee)return null;
  const s=new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1;
  return s>=parseInt(annee)+3;
};
// CompatibilitÃ© ancien/nouveau format : retourne le 1er reprÃ©sentant lÃ©gal
const getResp1=e=>{
  if(e.representants&&e.representants[0]&&e.representants[0].nom)return e.representants[0];
  if(e.resp1Nom)return{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  return null;
};
const getEmailContact=e=>e.isMajeur?(e.email||""):(getResp1(e)?.email||"");
const getTelContact=e=>e.isMajeur?(e.telephone||""):(getResp1(e)?.tel||"");
const getAllergies=e=>e.allergiesAsthme||e.allergies||(e.restrictions?` ${e.restrictions}`:"")||"";
const getSurvet=e=>e.tailleSurvet||e["tailleSurvÃªtement"]||"";

const lookupLic=(lics,nom,prenom,num)=>{if(!lics?.length)return null;const nn=nom.toLowerCase().trim(),pp=prenom.toLowerCase().trim();if(num){const x=lics.find(l=>(l.numLicence||l.l)?.toString()===num.toString());if(x)return x;}return lics.find(l=>(l.nom||l.n)?.toLowerCase().trim()===nn&&(l.prenom||l.p)?.toLowerCase().trim()===pp)||null;};

// Calcul du prix avec remise famille
const calcPrix = (categorie, rang, tarifs) => {
  const base = (tarifs || TARIFS_DEFAUT)[categorie] || 0;
  const remises = getRemisesFamille(tarifs);
  const pct   = rang >= 4 ? remises[4] : (remises[rang] || 0);
  return Math.round(base * (1 - pct/100));
};

const getRemisesFamille = tarifs => ({...REMISE_FAMILLE_DEFAUT,...(tarifs?._remises||{})});
const getAccessCodes = tarifs => {
  const codes=Array.isArray(tarifs?._accessCodes)?tarifs._accessCodes:[];
  const cleaned=[...new Set(codes.map(c=>String(c||"").trim()).filter(Boolean))];
  return cleaned.length?cleaned:[ADMIN];
};
const getPermanences = tarifs => {
  const permanences = tarifs?._permanences;
  return Array.isArray(permanences) && permanences.length ? permanences : PERMANENCES_DEFAUT;
};
const getPieces = tarifs => {
  const pieces = tarifs?._pieces;
  return Array.isArray(pieces) && pieces.length ? pieces : PIECES_DEFAUT;
};
const getBoutique = tarifs => {
  const boutique = tarifs?._boutique;
  const base = Array.isArray(boutique) && boutique.length ? boutique : BOUTIQUE_DEFAUT;
  return base.map(a=>{
    const def=BOUTIQUE_DEFAUT.find(d=>d.id===a.id||d.nom===a.nom);
    return {...a,categorie:a.categorie||def?.categorie||"Commande spÃ©ciale"};
  });
};
const getBoutiqueCategories = tarifs => [...new Set([...BOUTIQUE_CATEGORIES_DEFAUT,...getBoutique(tarifs).map(a=>a.categorie||"Sans catÃ©gorie")])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
const isAchatSaison = a => a?.contexte==="saison";
const calcBoutiqueTotal = achats => (achats||[]).filter(a=>!isAchatSaison(a)).reduce((s,a)=>s+((parseInt(a.quantite)||0)*(parseInt(a.prix)||0)),0);
const calcBoutiqueSaisonTotal = achats => (achats||[]).filter(isAchatSaison).reduce((s,a)=>s+((parseInt(a.quantite)||0)*(parseInt(a.prix)||0)),0);
const calcTotalDossier = e => (e?.prixFinal||0) + (e?.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e?.boutiqueTotal||0));
const getAchatsBoutiqueRows = data => data.flatMap(e=>(e.achatsBoutique||[]).map(a=>({entry:e,achat:a})));
const getAchatCategorie = (achat,articles=[]) => achat?.categorie || articles.find(a=>a.id===achat?.articleId)?.categorie || "Commande spÃ©ciale";
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
  const date = p.date ? fmtD(p.date) : "Date Ã  prÃ©ciser";
  const horaires = p.debut || p.fin ? ` de ${p.debut || "?"} Ã  ${p.fin || "?"}` : "";
  return `${date}${horaires}${p.lieu ? ` Â· ${p.lieu}` : ""}`;
};
const isNationaliteEtrangere = f => (f?.nationalite||"FranÃ§aise") !== "FranÃ§aise";
const pieceVisible = (piece, f, certifNeeded, aDesMembresFamille) => {
  if(piece.condition==="certif")return !!certifNeeded;
  if(piece.condition==="famille")return !!aDesMembresFamille;
  if(piece.condition==="etranger")return isNationaliteEtrangere(f);
  return true;
};
const getDocsAApporter = (f, certifNeeded, aDesMembresFamille, tarifs) =>
  getPieces(tarifs).filter(p=>pieceVisible(p,f,certifNeeded,aDesMembresFamille)).map(p=>p.label).filter(Boolean);
const getLicValue=(lic,...keys)=>keys.map(k=>lic?.[k]).find(v=>v!==undefined&&v!==null&&v!=="")||"";
const catFromLic=lic=>getLicValue(lic,"c","categorie")||"";
const normalizeSexe=s=>/^f/i.test(s||"")?"FÃ©minin":/^m/i.test(s||"")?"Masculin":"";

const calcEcheances = (total, nbFois) => {
  if (nbFois <= 1) return [total];
  const base = Math.floor(total / nbFois);
  const reste = total - base * (nbFois - 1);
  return [reste, ...Array(nbFois - 1).fill(base)];
};

// Calcule les dates d'encaissement Ã  partir de la date du 1er encaissement.
// Les dates suivantes = mÃªme jour, mois suivants
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

// Compte le nombre total de membres dans une prÃ©inscription famille (inscrit + frÃ¨res/sÅ“urs + adultes)
const countMembres = (f) => 1 + (f.freresSoeurs?.length || 0) + (f.adultesFamille?.length || 0);
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
    categorie:m.categorie||e.categorie,
    dateNaissance:m.dateNaissance||e.dateNaissance,
    sexe:m.sexe||e.sexe,
    typeLicence:m.typeLicence||e.typeLicence,
    statut:e.statut,
    certifNeeded:idx===0?e.certifNeeded:(m.certifNeeded||false),
    prix:detail[idx]?.prix ?? (idx===0?e.prixFinal:0),
  });
  return [
    mk(e,0,"Joueur principal"),
    ...(e.freresSoeurs||[]).map((m,i)=>mk(m,i+1,"Famille")),
    ...(e.adultesFamille||[]).map((m,i)=>mk(m,1+(e.freresSoeurs?.length||0)+i,"Famille adulte")),
  ];
};
const tousMembresDossiers = data => data.flatMap(membresDossier);

/* â•â• EXPORT EXCEL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const loadXLSX=()=>new Promise((res,rej)=>{if(window.XLSX){res(window.XLSX);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});
const mkSheet=rows=>{const XLSX=window.XLSX;const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0]?.map((_,i)=>({wch:Math.min(50,Math.max(10,...rows.map(r=>String(r[i]||"").length)))}));return ws;};
const exportXLSX=async(sheets,fname)=>{const XLSX=await loadXLSX();const wb=XLSX.utils.book_new();sheets.forEach(({name,rows})=>XLSX.utils.book_append_sheet(wb,mkSheet(rows),name.slice(0,31)));XLSX.writeFile(wb,fname);};

const H_INS = ["RÃ©fÃ©rence","Date","Type","Statut","Nom","PrÃ©nom","Naissance","Sexe","NationalitÃ©","Lieu naiss.","Adresse","CP","Ville","TÃ©lÃ©phone","Email","CatÃ©gorie","Poste","Ancien club","NÂ° Licence FFF","Resp. principal","Lien","TÃ©l resp.","Email resp.","Autres resp.","Mutuelle","MÃ©decin","TÃ©l mÃ©decin","Allergies/asthme","Soins urgence","Photos","Transport","Certif requis","Certif fourni","Photo ID","Justif.","RIB","Livret famille","Short","Chaussettes","SurvÃªtement","Sweat RSG","Famille","Membres famille","Tarif total â‚¬","Mode paiement","Nb fois","1er encaissement","Notes","Commentaire"];

const toRow=e=>{
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const nbMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  return[e.id,fmtDT(e.datePreinscription),e.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[e.statut]?.l||"",e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.lieuNaissance||"",e.adresse,e.codePostal,e.ville,e.isMajeur?e.telephone:r0?.tel||"",e.isMajeur?e.email:r0?.email||"",e.categorie,e.poste||"",e.ancienClub||"",e.numLicenceFFF||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.mutuelle||"",e.docteur||"",e.telDocteur||"",e.allergiesAsthme||e.allergies||"",e.autoSoins?"Oui":"Non",e.autoPhoto?"Oui":"Non",e.autoTransport?"Oui":"Non",e.certifNeeded?"OUI":"OK",e.certifMedical?"âœ“":"",e.photoId?"âœ“":"",e.justifDom?"âœ“":"",e.rib?"âœ“":"",e.livretFamille?"âœ“":"",e.tailleShort||"",e.tailleChaussettes||"",e.tailleSurvet||e["tailleSurvÃªtement"]||"",e.tailleSweat||"",e.nomFamille||"",nbMembres,e.prixFinal||"",e.modePaiement||"",e.nbFois||1,(e.datesEcheances&&e.datesEcheances[0])||"",e.notes||"",e.commentaire||""];
};

/* â•â• STYLES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const inp=err=>({width:"100%",boxSizing:"border-box",padding:"12px 14px",fontSize:15,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:12,outline:"none",background:C.W,color:C.N,fontFamily:FONT,WebkitAppearance:"none",appearance:"none",minHeight:46,boxShadow:"0 1px 2px rgba(15,23,42,.03)"});
const lbl={display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const BP={background:C.J,color:C.N,border:`1.5px solid ${C.Jd}`,borderRadius:12,padding:"12px 20px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 8px 18px rgba(245,200,0,.22)"};
const BS={background:C.W,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:12,padding:"12px 18px",fontWeight:800,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 4px 12px rgba(15,23,42,.05)"};
const G2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"};

/* â•â• ROOT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Routing par hash : URL #/ = formulaire public, #/admin = bureau, #/permanence = mode bÃ©nÃ©vole
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
  const [licencies,setLicencies]=useState([]);
  const [tarifs,setTarifs]=useState(TARIFS_DEFAUT);
  // Ã‰tat d'authentification admin (vrai si on a tapÃ© le bon mot de passe sur cet appareil)
  const [adminAuth,setAdminAuth]=useState(()=>{
    try{return typeof window!=="undefined"&&window.sessionStorage?.getItem("rsg_admin")==="1";}catch{return false;}
  });
  const effectiveSaison=adminAuth? saison : publicSaison;

  useEffect(()=>{
    (async()=>{
      const local=await stGet("rsg_public_saison");
      if(local)setPublicSaison(local);
      if(isFirebaseAvailable()){
        try{
          const cfg=await fbGetGlobalConfig();
          if(cfg?.publicSaison){setPublicSaison(cfg.publicSaison);await stSet("rsg_public_saison",cfg.publicSaison);}
        }catch{}
      }
    })();
  },[]);

  useEffect(()=>{
    if(!saison)return;
    (async()=>{
      if(isFirebaseAvailable()){
        try{const t=await fbGetTarifs(saison);if(t){setTarifs(t);await stSet(`rsg_tarifs_${saison}`,t);return;}}catch{}
      }
      const t=await stGet(`rsg_tarifs_${saison}`);if(t)setTarifs(t);
    })();
    (async()=>{
      if(isFirebaseAvailable()){
        try{const l=await fbGetLicencies(saison);if(Array.isArray(l)&&l.length>0){setLicencies(l);await stSet(keyLic(saison),l);return;}}catch{}
      }
      const local=await stGet(keyLic(saison));
      if(Array.isArray(local)&&local.length>0){setLicencies(local);return;}
      try{
        const base=import.meta.env.BASE_URL||"/";
        const res=await fetch(`${base}licencies.json`,{cache:"no-cache"});
        if(res.ok){
          const json=await res.json();
          const lics=Array.isArray(json)?json:(json.licencies||[]);
          if(lics.length>0){
            setLicencies(lics);
            await stSet(keyLic(saison),lics);
            if(isFirebaseAvailable()){try{await fbSaveLicencies(saison,lics);}catch{}}
            return;
          }
        }
      }catch(err){console.warn("Pas de licencies.json :",err);}
      setLicencies(BASE_FOOTCLUBS);
    })();
  },[saison]);

  useEffect(()=>{
    if(adminAuth)return;
    if(!publicSaison)return;
    (async()=>{
      if(isFirebaseAvailable()){
        try{const t=await fbGetTarifs(publicSaison);if(t){setTarifs(t);await stSet(`rsg_tarifs_${publicSaison}`,t);return;}}catch{}
      }
      const t=await stGet(`rsg_tarifs_${publicSaison}`);if(t)setTarifs(t);
    })();
  },[publicSaison,adminAuth]);

  const tryLogin=()=>{
    if(getAccessCodes(tarifs).includes(pw.trim())){
      setAdminAuth(true);
      try{window.sessionStorage?.setItem("rsg_admin","1");}catch{}
      setPw("");setPwErr(false);
      navigate("admin");
    }else setPwErr(true);
  };

  const logout=()=>{
    setAdminAuth(false);
    try{window.sessionStorage?.removeItem("rsg_admin");}catch{}
    navigate("home");
  };

  // SÃ©curitÃ© : si on essaie d'accÃ©der Ã  /admin ou /permanence sans Ãªtre loggÃ©, on redirige vers /login
  const needsAuth=route==="admin"||route==="permanence";
  const showLogin=route==="login"||(needsAuth&&!adminAuth);

  return(
    <div style={{fontFamily:FONT,minHeight:"100vh",background:C.Gc,WebkitTextSizeAdjust:"100%"}}>
      <header style={{background:C.N,borderBottom:`4px solid ${C.J}`,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden",cursor:"pointer"}} onClick={()=>navigate("home")}>
          <div style={{width:34,height:34,background:C.J,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,flexShrink:0}}>âš½</div>
          <div style={{lineHeight:1.15}}>
            <div style={{color:C.J,fontWeight:900,fontSize:12}}>RÃ‰VEIL ST-GÃ‰RÃ‰ON</div>
            <div style={{color:"#9ca3af",fontSize:10}}>Saison {effectiveSaison}{adminAuth&&route==="admin"?" Â· ðŸ” Admin":adminAuth&&route==="permanence"?" Â· ðŸ“… Permanence":""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {adminAuth&&<select value={saison} onChange={e=>{setSaison(e.target.value);}} style={{background:C.Ns,color:"#ddd",border:"1px solid #444",borderRadius:7,padding:"5px 6px",fontWeight:600,fontSize:10,cursor:"pointer",minHeight:32,outline:"none"}}>{saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>}
          {route!=="home"&&route!=="login"&&<button onClick={()=>navigate("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>â† Retour</button>}
          {!adminAuth&&route!=="login"&&<button onClick={()=>navigate("login")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:800,fontSize:11,cursor:"pointer",minHeight:32}}>ðŸ” Bureau</button>}
          {adminAuth&&route==="admin"&&<button onClick={()=>navigate("permanence")} style={{background:"#16a34a",color:C.W,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>ðŸ“… Permanence</button>}
          {adminAuth&&route==="permanence"&&<button onClick={()=>navigate("admin")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>ðŸ” Admin</button>}
          {adminAuth&&<button onClick={logout} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>DÃ©co.</button>}
        </div>
      </header>
      {route==="home"&&<Home onForm={()=>navigate("form")} saison={publicSaison} tarifs={tarifs}/>}
      {route==="form"&&<Formulaire onDone={()=>navigate("home")} licencies={licencies} saison={publicSaison} tarifs={tarifs}/>}
      {showLogin&&(
        <div style={{maxWidth:360,margin:"48px auto 0",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:38,marginBottom:8}}>ðŸ”</div><h2 style={{margin:0,color:C.N,fontWeight:800,fontSize:20}}>AccÃ¨s SecrÃ©tariat</h2><p style={{color:C.G,fontSize:13,marginTop:4}}>Saison publique {publicSaison}</p></div>
            <label style={lbl}>Code d'accÃ¨s</label>
            <input type="password" autoComplete="current-password" style={{...inp(pwErr),fontSize:18,letterSpacing:4,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:10}}>âŒ Code incorrect</div>}
            <button style={{...BP,width:"100%",marginTop:4}} onClick={tryLogin}>Entrer â†’</button>
          </div>
        </div>
      )}
      {route==="admin"&&adminAuth&&<Dashboard saison={saison} publicSaison={publicSaison} onPublicSaisonChange={async s=>{
        setPublicSaison(s);
        await stSet("rsg_public_saison",s);
        if(isFirebaseAvailable()){try{await fbSaveGlobalConfig({publicSaison:s});}catch(e){console.error(e);}}
      }} licencies={licencies} onLicenciesChange={async lics=>{
        setLicencies(lics);
        await stSet(keyLic(saison),lics);
        if(isFirebaseAvailable()){try{await fbSaveLicencies(saison,lics);}catch(e){console.error(e);}}
      }} tarifs={tarifs} onTarifsChange={async t=>{
        setTarifs(t);
        await stSet(`rsg_tarifs_${saison}`,t);
        if(isFirebaseAvailable()){try{await fbSaveTarifs(saison,t);}catch(e){console.error(e);}}
      }}/>}
      {route==="permanence"&&adminAuth&&<Permanence saison={saison} tarifs={tarifs}/>}
    </div>
  );
}

/* â•â• HOME â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Home({onForm,saison,tarifs}){
  return(
    <div style={{maxWidth:540,margin:"0 auto",padding:"24px 16px 64px"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:44,margin:"0 0 8px"}}>âš½</div>
        <h1 style={{fontSize:22,fontWeight:900,color:C.N,margin:"0 0 6px"}}>PrÃ©inscription RSG</h1>
        <div style={{display:"inline-block",background:C.J,color:C.N,padding:"3px 14px",borderRadius:20,fontWeight:800,fontSize:13,marginBottom:12}}>Saison {saison}</div>
        <p style={{color:C.G,fontSize:14,lineHeight:1.6,margin:"0 0 20px"}}>Bienvenue au RÃ©veil Saint-GÃ©rÃ©on !<br/>Quelques minutes suffisent pour vous prÃ©inscrire.</p>
        <button style={{...BP,fontSize:18,padding:"16px 32px",borderRadius:12,boxShadow:`0 6px 20px ${C.J}55`,width:"100%"}} onClick={onForm}>ðŸš€ C'est parti !</button>
        <p style={{color:C.G,fontSize:12,lineHeight:1.5,margin:"10px 0 0"}}>La validation finale se fera lors de la permanence de licence.</p>
      </div>

      {/* Grille des tarifs */}
      <div style={{background:C.W,borderRadius:12,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.J,fontWeight:800,fontSize:13}}>ðŸ’° Tarifs saison {saison}</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {orderedTarifEntries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.Gc,borderRadius:7}}>
                <span style={{fontSize:12,fontWeight:600,color:C.N}}>{catLabel(cat)}</span>
                <span style={{fontSize:14,fontWeight:900,color:prix===0?C.V:C.J}}>{prix===0?"GRATUIT":`${prix} â‚¬`}</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,fontSize:12,color:"#1e40af"}}>
            <strong>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Tarif famille</strong> â€” Ã  partir du 2Ã¨me membre (enfants ET adultes)<br/>
            {Object.entries(getRemisesFamille(tarifs)).map(([rang,pct])=><span key={rang}>{rang==="4"?"4Ã¨me et + ":`${rang}Ã¨me `}: <strong>-{pct}%</strong>{rang!=="4"?" Â· ":""}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* â•â• FORMULAIRE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Formulaire({onDone,licencies,saison,tarifs}){
  const [step,setStep]=useState(1);
  const [f,setF]=useState(F0);
  const [errs,setErrs]=useState({});
  const [done,setDone]=useState(null);
  const [saving,setSaving]=useState(false);
  const topRef=useRef();
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const age=calcAge(f.dateNaissance);
  const isMajeur=age!==null&&age>=18;

  // Recherche du licenciÃ© dans la base Footclubs
  const licDetect=(f.numLicenceFFF||(f.nom.length>1&&f.prenom.length>1))?lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF):null;
  const lic=f.typeLicence==="renouvellement"?licDetect:null;
  // Dirigeant non-arbitre = exemptÃ© de certif mÃ©dical
  const estDirigeantNonArbitre=f.categorie==="Dirigeant"&&!f.dirigeantArbitre;
  const certifReq=estDirigeantNonArbitre?false:(f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic):null));
  const certifMsg=estDirigeantNonArbitre
    ?{ok:true,txt:"Pas de certificat mÃ©dical requis pour les dirigeants (sauf si arbitrage)."}
    :f.typeLicence==="nouvelle"
      ?{ok:false,txt:"Nouvelle licence au club â†’ certificat mÃ©dical obligatoire. Prenez rendez-vous dÃ¨s maintenant !!!!!!!"}
      :(!lic?null:(certifReq===true
        ?{ok:false,txt:`Selon Footclubs, votre certificat mÃ©dical n'est pas valide pour la saison ${saison} â†’ RDV mÃ©decin obligatoire. Prenez rendez-vous dÃ¨s maintenant !!!!!!!`}
        :certifReq===false
          ?{ok:true,txt:`Certificat mÃ©dical valide pour la saison ${saison} âœ“ (vous remplirez juste le questionnaire de santÃ©)`}
          :null));

  // Calcul du tarif TOTAL famille (joueur principal + frÃ¨res/sÅ“urs + adultes)
  // Remise progressive : 1er plein tarif, 2Ã¨me -10%, 3Ã¨me -20%, 4Ã¨me+ -30%
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
      const base=tarifs[m.categorie]||0;
      const pct=rang>=4?(remises[4]||0):(remises[rang]||0);
      const prix=Math.round(base*(1-pct/100));
      detail.push({categorie:m.categorie,rang,base,pct,prix});
      total+=prix;
    });
    return {detail,total};
  };
  const {detail:detailPrix,total:prixFinalTotal}=calcDetailFamille();

  // Tarif individuel du joueur principal seul (1er rang)
  const tarifBase=f.categorie?(tarifs[f.categorie]||0):0;

  const echeances=f.modePaiement&&f.nbFois>1?calcEcheances(prixFinalTotal,f.nbFois):null;
  const datesEcheances=echeances?Array.from({length:f.nbFois},(_,i)=>f.datesEcheances?.[i]||""):null;
  const modeObj=MODES_PAIEMENT.find(m=>m.id===f.modePaiement);

  // Ã‰tapes : 1 Type, 2 Joueur+photo, 3 Resp lÃ©gaux (si mineur), 4 MÃ©dical+autorisations, 5 Ã‰quipement, 6 Famille+Documents, 7 Paiement, 8 RÃ©cap
  const STEPS=isMajeur
    ?["Type","Joueur","MÃ©dical","Ã‰quipement","Famille & docs","Paiement","RÃ©cap"]
    :["Type","Joueur","Responsables","MÃ©dical","Ã‰quipement","Famille & docs","Paiement","RÃ©cap"];
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

  // Auto-dÃ©tection catÃ©gorie selon date de naissance et saison
  useEffect(()=>{if(f.dateNaissance&&!f.categorie)set("categorie",suggestCat(f.dateNaissance,saison));},[f.dateNaissance,saison]);
  useEffect(()=>{
    if(!f.numLicenceFFF)return;
    const match=lookupLic(licencies,"","",f.numLicenceFFF);
    if(match)applyLicencie(match);
  },[f.numLicenceFFF,licencies,saison]);
  useEffect(()=>{
    if(f.typeLicence==="nouvelle"&&licDetect){
      setF(p=>({...p,typeLicence:"renouvellement"}));
    }
  },[f.typeLicence,licDetect]);
  // Init reprÃ©sentant nÂ°2 vide
  useEffect(()=>{
    if(!isMajeur&&f.representants.length===0){
      set("representants",[{nom:"",prenom:"",lien:"",tel:"",email:""}]);
    }
  },[isMajeur]);
  useEffect(()=>{topRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[step]);

  const validate=()=>{
    const e={};
    if(step===stepIdx.type&&!f.typeLicence)e.typeLicence="Veuillez choisir";
    if(f.typeLicence==="nouvelle"&&licDetect)e.typeLicence="Vous Ãªtes dÃ©jÃ  reconnu dans la base du club : choisissez renouvellement.";
    if(step===stepIdx.joueur){
      if(!f.nom)e.nom="Requis";
      if(!f.prenom)e.prenom="Requis";
      if(!f.dateNaissance)e.dateNaissance="Requis";
      if(!f.sexe)e.sexe="Requis";
      if(!f.adresse)e.adresse="Requis";
      if(!f.codePostal)e.codePostal="Requis";
      if(!f.ville)e.ville="Requis";
      if(!f.categorie)e.categorie="Requis";
      if(f.typeLicence==="nouvelle"&&f.aJoueAutreClub&&!f.ancienClub)e.ancienClub="Indiquez le club de la saison derniÃ¨re";
      if(!f.photoBase64)e.photoBase64="ðŸ“¸ Photo d'identitÃ© obligatoire";
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
    if(step===stepIdx.paie){
      if(!f.modePaiement)e.modePaiement="Veuillez choisir un mode de paiement";
      if(modeObj?.fractionnable&&f.nbFois>1){
        const dates=Array.from({length:f.nbFois},(_,i)=>f.datesEcheances?.[i]||"");
        if(dates.some(d=>!d))e.dateEcheance1="Veuillez choisir toutes les dates d'encaissement";
      }
    }
    if(step===total&&!f.charteAcceptee)e.charteAcceptee="La charte RSG doit Ãªtre acceptÃ©e pour envoyer la prÃ©inscription";
    setErrs(e);return Object.keys(e).length===0;
  };
  const next=()=>{if(validate())setStep(p=>Math.min(p+1,total));};
  const prev=()=>{setErrs({});setStep(p=>Math.max(p-1,1));};

  // Helpers pour ajout/suppression de reprÃ©sentants et membres famille
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
      nom:(getLicValue(licencie,"n","nom")||p.nom||"").toUpperCase(),
      prenom:getLicValue(licencie,"p","prenom")||p.prenom,
      dateNaissance:dn||p.dateNaissance,
      sexe:normalizeSexe(getLicValue(licencie,"s","sexe"))||p.sexe,
      categorie:cat||p.categorie,
      email:getLicValue(licencie,"em","email")||p.email,
      telephone:getLicValue(licencie,"tel","telephone")||p.telephone,
    }));
  };
  const applyLicencieToMember=(listKey,i,licencie)=>{
    if(!licencie)return;
    const dn=getLicValue(licencie,"dn","dateNaissance");
    const cat=catFromLic(licencie)||suggestCat(dn,saison);
    const list=[...f[listKey]];
    list[i]={
      ...list[i],
      typeLicence:"renouvellement",
      numLicenceFFF:getLicValue(licencie,"l","numLicence","numLicenceFFF")||list[i].numLicenceFFF,
      nom:(getLicValue(licencie,"n","nom")||list[i].nom||"").toUpperCase(),
      prenom:getLicValue(licencie,"p","prenom")||list[i].prenom,
      dateNaissance:dn||list[i].dateNaissance,
      sexe:normalizeSexe(getLicValue(licencie,"s","sexe"))||list[i].sexe,
      categorie:cat||list[i].categorie,
      email:getLicValue(licencie,"em","email")||list[i].email,
      tel:getLicValue(licencie,"tel","telephone")||list[i].tel,
    };
    set(listKey,list);
  };

  const addFrere=()=>set("freresSoeurs",[...f.freresSoeurs,{typeLicence:"nouvelle",numLicenceFFF:"",nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",photoBase64:""}]);
  const updFrere=(i,k,v)=>{const r=[...f.freresSoeurs];r[i]={...r[i],[k]:v};
    // auto-cat si date naissance change
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    const lic=lookupLic(licencies,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&r[i].typeLicence==="nouvelle")r[i].typeLicence="renouvellement";
    set("freresSoeurs",r);
  };
  const delFrere=i=>set("freresSoeurs",f.freresSoeurs.filter((_,j)=>j!==i));

  const addAdulte=()=>set("adultesFamille",[...f.adultesFamille,{typeLicence:"nouvelle",numLicenceFFF:"",nom:"",prenom:"",dateNaissance:"",sexe:"",nationalite:"FranÃ§aise",categorie:"Senior",tel:"",email:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",photoBase64:""}]);
  const updAdulte=(i,k,v)=>{const r=[...f.adultesFamille];r[i]={...r[i],[k]:v};
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    const lic=lookupLic(licencies,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&r[i].typeLicence==="nouvelle")r[i].typeLicence="renouvellement";
    set("adultesFamille",r);
  };
  const delAdulte=i=>set("adultesFamille",f.adultesFamille.filter((_,j)=>j!==i));

  // Y a-t-il des membres famille (pour livret de famille obligatoire)
  const aDesMembresFamille=f.freresSoeurs.length>0||f.adultesFamille.length>0;
  const docsAApporter=getDocsAApporter(f,certifReq,aDesMembresFamille,tarifs);
  const enfantsFamilleLabel=isMajeur?"Enfants mineurs au club":"FrÃ¨res et sÅ“urs mineurs au club";
  const ajouterEnfantLabel=isMajeur?"+ Ajouter un enfant garÃ§on ou fille":"+ Ajouter un frÃ¨re / une sÅ“ur mineur(e)";

  const submit=async()=>{
    if(!validate())return;
    setSaving(true);
    const id=genId();
    const entry={
      id,...f,
      isMajeur,age,
      certifNeeded:certifReq===true,
      saison,
      tarifBase,
      prixFinal:prixFinalTotal,
      detailPrix,
      datesEcheances,
      dateEcheance1:datesEcheances?.[0]||"",
      statut:"attente",notes:"",
      datePreinscription:new Date().toISOString(),
      dateValidation:null,datePaiement:null,
    };
    const data=await stGet(keyIns(saison))||[];
    data.unshift(entry);await stSet(keyIns(saison),data);
    let fbOk=true;
    let fbErrMsg="";
    if(isFirebaseAvailable()){
      try{await fbSaveInscription(saison,entry);}
      catch(e){fbOk=false;fbErrMsg=e.message;console.error("Firebase save error:",e);}
    }else{
      fbOk=false;
      fbErrMsg="Firebase non disponible";
    }
    setSaving(false);
    setDone({id,fbOk,fbErrMsg,entry});
  };

  if(done)return<Confirmation refId={done.id} prenom={f.prenom} nom={f.nom} saison={saison} prixFinal={prixFinalTotal} modePaiement={f.modePaiement} nbFois={f.nbFois} echeances={echeances} datesEcheances={datesEcheances} entry={done.entry} tarifs={tarifs} fbOk={done.fbOk} fbErrMsg={done.fbErrMsg} onNew={()=>{setDone(null);setStep(1);setF(F0);}} onDone={onDone}/>;

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
          <p style={{fontSize:14,color:C.G,marginBottom:14,textAlign:"center"}}>Bienvenue ! Avant de commencer, dites-nous si vous Ã©tiez dÃ©jÃ  licenciÃ©(e) au RSG la saison passÃ©e.</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <TypeCard sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon="ðŸ”„" title="Renouvellement au club" sub="J'Ã©tais licenciÃ©(e) au RSG la saison passÃ©e"/>
            <TypeCard sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon="âœ¨" title="Nouvelle licence au club" sub="Je m'inscris pour la premiÃ¨re fois au RSG ou je reviens"/>
          </div>
          {f.typeLicence==="renouvellement"&&<div style={{background:"#dcfce7",border:`1px solid #86efac`,borderRadius:8,padding:"10px 12px",fontSize:13,color:C.V}}>
            âœ… Parfait ! Le secrÃ©tariat vÃ©rifiera votre certificat mÃ©dical d'aprÃ¨s notre base. Si besoin, on vous le redemandera.
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af"}}>
            ðŸ‘‹ Bienvenue au RSG ! Pour une premiÃ¨re licence ou un retour, le certificat mÃ©dical est obligatoire (il vous sera demandÃ© en permanence).
          </div>}
        </div>}

        {/* STEP 2 - Joueur + Photo */}
        {step===stepIdx.joueur&&<div>
          {age!==null&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:isMajeur?"#dbeafe":"#dcfce7",fontSize:13,fontWeight:600,color:isMajeur?C.B:C.V}}>{isMajeur?"ðŸ§‘ Joueur majeur":"ðŸ‘¶ Joueur mineur â€” un reprÃ©sentant lÃ©gal sera demandÃ© Ã  l'Ã©tape suivante"}</div>}
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <F label="NÂ° licence FFF (facultatif)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Ex: 86297823"/></F>
            {lic&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>âœ“ LicenciÃ© retrouvÃ© : les champs disponibles sont remplis automatiquement.</div>}
            {licDetect&&f.typeLicence==="renouvellement"&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>âœ“ Joueur dÃ©jÃ  au club dÃ©tectÃ© : l'inscription est traitÃ©e en renouvellement.</div>}
          </div>
          <div style={{fontSize:12,color:"#0369a1",lineHeight:1.4,marginTop:-4,marginBottom:10}}>
            Info : si vous renseignez votre numero de licence, les informations connues peuvent preremplir automatiquement les autres champs.
          </div>
          <div style={G2}>
            <F label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="family-name"/></F>
            <F label="PrÃ©nom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)} autoCapitalize="words" autoComplete="given-name"/></F>
            <F label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>set("dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
            <F label="Sexe *" err={errs.sexe}><select style={inp(errs.sexe)} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">â€”</option><option>Masculin</option><option>FÃ©minin</option></select></F>
            <F label="Lieu de naissance"><input style={inp()} value={f.lieuNaissance} onChange={e=>set("lieuNaissance",e.target.value)} placeholder="Ville"/></F>
            <F label="NationalitÃ© *"><select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
          </div>
          {f.nationalite==="Autre"&&<F label="PrÃ©cisez"><input style={inp()} value={f.nationaliteAutre} onChange={e=>set("nationaliteAutre",e.target.value)}/></F>}
          <AdresseInput adresse={f.adresse} cp={f.codePostal} ville={f.ville} onAdresse={v=>set("adresse",v)} onCP={v=>set("codePostal",v)} onVille={v=>set("ville",v)} errA={errs.adresse} errCP={errs.codePostal} errV={errs.ville}/>
          {isMajeur&&<div style={G2}><F label="TÃ©lÃ©phone *" err={errs.telephone}><input type="tel" style={inp(errs.telephone)} value={f.telephone} onChange={e=>set("telephone",e.target.value)} inputMode="tel" autoComplete="tel"/></F><F label="Email *" err={errs.email}><input type="email" style={inp(errs.email)} value={f.email} onChange={e=>set("email",e.target.value)} inputMode="email" autoComplete="email"/></F></div>}
          <div style={G2}>
            <F label="CatÃ©gorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={f.categorie} onChange={e=>set("categorie",e.target.value)}><option value="">â€” Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>{f.dateNaissance&&<span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>âœ“ DÃ©tectÃ©e auto.</span>}</F>
            <F label="Poste"><select style={inp()} value={f.poste} onChange={e=>set("poste",e.target.value)}><option value="">â€” Choisir</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></F>
          </div>
          {f.categorie&&<div style={{background:f.categorie==="Dirigeant"?"#dcfce7":C.Jp,border:`1px solid ${f.categorie==="Dirigeant"?"#86efac":C.Jd}`,borderRadius:8,padding:"10px 12px",fontSize:13,marginBottom:8}}>
            {f.categorie==="Dirigeant"
              ?<span style={{color:C.V,fontWeight:700}}>ðŸŽ‰ Licence dirigeant <strong>GRATUITE</strong> Â· pas de certificat mÃ©dical requis (sauf si arbitrage)</span>
              :<span>ðŸ’° Tarif {f.categorie} : <strong>{tarifs[f.categorie]||0} â‚¬</strong></span>
            }
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <Chk checked={f.aJoueAutreClub} onChange={v=>{set("aJoueAutreClub",v);if(!v)set("ancienClub","");}} label={<><strong>Avez-vous jouÃ© dans un autre club la saison derniÃ¨re ?</strong><br/><span style={{fontSize:12,color:C.G}}>Cette information aide le secrÃ©tariat pour les rÃ¨gles de mutation.</span></>}/>
            {f.aJoueAutreClub&&<F label="Club de la saison derniÃ¨re *" err={errs.ancienClub}><input style={inp(errs.ancienClub)} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Nom du club prÃ©cÃ©dent"/></F>}
            {f.aJoueAutreClub&&<F label="Informations mutation / commentaire"><textarea style={{...inp(),height:58,resize:"vertical"}} value={f.mutationNotes} onChange={e=>set("mutationNotes",e.target.value)} placeholder="Ex: dernier match, situation particuliÃ¨re, contact club..."/></F>}
          </div>}
          {f.typeLicence!=="nouvelle"&&<F label="Ancien club"><input style={inp()} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Club prÃ©cÃ©dent (si applicable)"/></F>}

          {/* Case arbitrage pour les dirigeants */}
          {f.categorie==="Dirigeant"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px 14px",marginBottom:10}}>
            <Chk checked={f.dirigeantArbitre} onChange={v=>set("dirigeantArbitre",v)} label={<><strong>ðŸŸ¨ Je souhaite arbitrer cette saison</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.4}}>Si oui, un certificat mÃ©dical sera demandÃ© sauf s'il a Ã©tÃ© fait il y a moins de 3 ans.</span></>}/>
          </div>}

          {/* PHOTO OBLIGATOIRE */}
          <div style={{marginTop:14,background:errs.photoBase64?"#fee2e2":C.Jp,border:`2px solid ${errs.photoBase64?C.R:C.Jd}`,borderRadius:10,padding:"14px"}}>
            <p style={{fontWeight:800,fontSize:14,color:C.N,margin:"0 0 4px"}}>ðŸ“¸ Photo d'identitÃ© <span style={{color:C.R}}>*</span></p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Obligatoire. Fond neutre, visage dÃ©gagÃ©.</p>
            <PhotoInput value={f.photoBase64} onChange={v=>{set("photoBase64",v);if(v)setErrs(p=>{const x={...p};delete x.photoBase64;return x;});}}/>
            {errs.photoBase64&&<div style={{color:C.R,fontSize:12,marginTop:6,fontWeight:600}}>âš  {errs.photoBase64}</div>}
          </div>
        </div>}

        {/* STEP 3 - ReprÃ©sentants lÃ©gaux (mineurs) */}
        {!isMajeur&&step===stepIdx.resp&&<div>
          <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:13,color:"#1e40af"}}>
            â„¹ï¸ Vous pouvez ajouter plusieurs reprÃ©sentants lÃ©gaux (parents sÃ©parÃ©s, tuteurs, grand-parents, etc.).
          </div>
          {f.representants.map((r,i)=>(
            <div key={i} style={{background:i===0?C.Jp:"#f9fafb",border:`1.5px solid ${i===0?C.Jd:C.Gb}`,borderRadius:10,padding:"14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{color:C.N,fontWeight:800,fontSize:14,margin:0}}>{i===0?"ðŸ‘¨â€ðŸ‘© Responsable lÃ©gal principal *":`Responsable lÃ©gal nÂ°${i+1}`}</h3>
                {i>0&&<button onClick={()=>delRep(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:700}}>âœ• Supprimer</button>}
              </div>
              <div style={G2}>
                <F label={`Nom ${i===0?"*":""}`} err={i===0?errs.resp1Nom:null}><input style={inp(i===0?errs.resp1Nom:null)} value={r.nom} onChange={e=>updRep(i,"nom",e.target.value.toUpperCase())} autoCapitalize="characters"/></F>
                <F label={`PrÃ©nom ${i===0?"*":""}`} err={i===0?errs.resp1Prenom:null}><input style={inp(i===0?errs.resp1Prenom:null)} value={r.prenom} onChange={e=>updRep(i,"prenom",e.target.value)} autoCapitalize="words"/></F>
                <F label={`Lien avec l'enfant ${i===0?"*":""}`} err={i===0?errs.resp1Lien:null}><select style={inp(i===0?errs.resp1Lien:null)} value={r.lien} onChange={e=>updRep(i,"lien",e.target.value)}><option value="">â€” Choisir</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
                <F label={`TÃ©lÃ©phone ${i===0?"*":""}`} err={i===0?errs.resp1Tel:null}><input type="tel" style={inp(i===0?errs.resp1Tel:null)} value={r.tel} onChange={e=>updRep(i,"tel",e.target.value)} inputMode="tel"/></F>
                <F label={`Email ${i===0?"*":""}`} err={i===0?errs.resp1Email:null} span><input type="email" style={inp(i===0?errs.resp1Email:null)} value={r.email} onChange={e=>updRep(i,"email",e.target.value)} inputMode="email"/></F>
              </div>
            </div>
          ))}
          <button onClick={addRep} style={{...BS,width:"100%",marginTop:6}}>+ Ajouter un autre reprÃ©sentant lÃ©gal</button>
        </div>}

        {/* STEP mÃ©dical + autorisations */}
        {step===stepIdx.med&&<div>
          {certifMsg&&<div style={{marginBottom:14,borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"âœ… ":"ðŸ©º "}{certifMsg.txt}</div>}
          {certifReq&&<div style={{background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0369a1",marginBottom:12}}>
            Certificat mÃ©dical Ã  faire remplir par le mÃ©decin : <a href={`${import.meta.env.BASE_URL||"/"}certificat_medical_2026_2027.pdf`} target="_blank" rel="noreferrer" style={{color:"#0369a1",fontWeight:800}}>ouvrir le PDF</a>. <strong>Prendre rendez-vous dÃ¨s maintenant !!!!!!!</strong>
          </div>}
          <div style={G2}>
            <F label="Mutuelle"><input style={inp()} value={f.mutuelle} onChange={e=>set("mutuelle",e.target.value)}/></F>
            <F label="NÂ° sÃ©cu"><input style={inp()} value={f.numSecu} onChange={e=>set("numSecu",e.target.value)} inputMode="numeric" maxLength={15}/></F>
            <F label="MÃ©decin traitant"><input style={inp()} value={f.docteur} onChange={e=>set("docteur",e.target.value)}/></F>
            <F label="TÃ©l. mÃ©decin"><input type="tel" style={inp()} value={f.telDocteur} onChange={e=>set("telDocteur",e.target.value)} inputMode="tel"/></F>
          </div>
          <F label="Allergies, asthme, restrictions mÃ©dicales"><textarea style={{...inp(),height:64,resize:"vertical"}} value={f.allergiesAsthme} onChange={e=>set("allergiesAsthme",e.target.value)} placeholder="Ex: allergie aux arachides, asthme lÃ©ger, traitement... ou 'Aucune' si rien Ã  signaler"/></F>

          <div style={{marginTop:14,padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:14,margin:"0 0 12px"}}>ðŸ“‹ Soins d'urgence</p>

            <Chk checked={f.autoSoins} onChange={v=>set("autoSoins",v)} err={errs.autoSoins} label={<><strong>ðŸš‘ Soins d'urgence{!isMajeur?" *":""}</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise les responsables du club Ã  appeler les services d'urgence et Ã  faire pratiquer les soins mÃ©dicaux d'urgence nÃ©cessaires en cas d'accident. Les parents seront prÃ©venus immÃ©diatement.</span></>}/>
          </div>
        </div>}

        {/* STEP Ã©quipement */}
        {step===stepIdx.equip&&<div>
          <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:C.Jp,border:`1px solid ${C.Jd}`,fontSize:13}}>
            <span style={{color:"#92400e",fontWeight:700}}>ðŸ‘• Ã‰quipement pour la catÃ©gorie {f.categorie||"â€”"}</span>
            <div style={{fontSize:12,color:"#92400e",marginTop:4}}>Tailles Kappa : enfants 6 ans/116 cm Ã  16 ans/174 cm, adultes S Ã  4XL. <a href="https://www.kappa.fr/pages/tailles" target="_blank" rel="noreferrer" style={{color:"#92400e",fontWeight:800}}>Guide officiel</a></div>
          </div>
          <div style={G2}>
            <F label="Short *"><select style={inp()} value={f.tailleShort} onChange={e=>set("tailleShort",e.target.value)}><option value="">â€” Choisir</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
            <F label="Chaussettes *"><select style={inp()} value={f.tailleChaussettes} onChange={e=>set("tailleChaussettes",e.target.value)}><option value="">â€” Choisir</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
          </div>
          {aSweat(f.categorie)&&<F label="Sweat RSG (proposÃ© pour les U10-U11)" span><select style={inp()} value={f.tailleSweat} onChange={e=>set("tailleSweat",e.target.value)}><option value="">â€” Aucun</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
          {aSurvet(f.categorie)&&<F label="SurvÃªtement (proposÃ© Ã  partir des U12-U13)" span><select style={inp()} value={f.tailleSurvet} onChange={e=>set("tailleSurvet",e.target.value)}><option value="">â€” Aucun</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
        </div>}

        {/* STEP famille + documents */}
        {step===stepIdx.famille&&<div>
          {/* FrÃ¨res / sÅ“urs mineurs */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:C.N,fontWeight:800,fontSize:15,margin:"0 0 6px"}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ {enfantsFamilleLabel}</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Si plusieurs membres de la famille s'inscrivent, ajoutez-les ici. Chaque membre peut Ãªtre en renouvellement ou en nouvelle licence, et bÃ©nÃ©ficie de la <strong>remise famille</strong>.</p>
            {f.freresSoeurs.map((m,i)=>(
              <div key={i} style={{background:C.Jp,border:`1.5px solid ${C.Jd}`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13}}>{isMajeur?"Enfant":"FrÃ¨re/SÅ“ur"} nÂ°{i+1}</strong>
                  <button onClick={()=>delFrere(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>âœ•</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence"><select style={inp()} value={m.typeLicence||"nouvelle"} onChange={e=>updFrere(i,"typeLicence",e.target.value)}><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  <F label="NÂ° licence FFF"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updFrere(i,"numLicenceFFF",e.target.value)} onBlur={()=>applyLicencieToMember("freresSoeurs",i,lookupLic(licencies,m.nom||"",m.prenom||"",m.numLicenceFFF||""))} placeholder="Facultatif"/></F>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updFrere(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="PrÃ©nom"><input style={inp()} value={m.prenom} onChange={e=>updFrere(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updFrere(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updFrere(i,"sexe",e.target.value)}><option value="">â€”</option><option>Masculin</option><option>FÃ©minin</option></select></F>
                  <F label="CatÃ©gorie" span><select style={inp()} value={m.categorie} onChange={e=>updFrere(i,"categorie",e.target.value)}><option value="">â€” Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updFrere(i,"aJoueAutreClub",v)} label="A jouÃ© dans un autre club la saison derniÃ¨re"/>
                  {m.aJoueAutreClub&&<F label="Club prÃ©cÃ©dent"><input style={inp()} value={m.ancienClub||""} onChange={e=>updFrere(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updFrere(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <div style={G2}>
                  <F label="Short"><select style={inp()} value={m.tailleShort} onChange={e=>updFrere(i,"tailleShort",e.target.value)}><option value="">â€”</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                  <F label="Chaussettes"><select style={inp()} value={m.tailleChaussettes} onChange={e=>updFrere(i,"tailleChaussettes",e.target.value)}><option value="">â€”</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                </div>
                {aSweat(m.categorie)&&<F label="Sweat RSG"><select style={inp()} value={m.tailleSweat} onChange={e=>updFrere(i,"tailleSweat",e.target.value)}><option value="">â€” Aucun</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                {aSurvet(m.categorie)&&<F label="SurvÃªtement"><select style={inp()} value={m.tailleSurvet} onChange={e=>updFrere(i,"tailleSurvet",e.target.value)}><option value="">â€” Aucun</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updFrere(i,"autoSoins",v)} label="ðŸš‘ Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updFrere(i,"autoPhoto",v)} label="ðŸ“· Droit Ã  l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updFrere(i,"autoTransport",v)} label="ðŸš— Transport"/>
                </div>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>ðŸ“¸ Photo d'identitÃ©</p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updFrere(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addFrere} style={{...BS,width:"100%"}}>{ajouterEnfantLabel}</button>
          </div>

          {/* Adultes de la famille */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:"#1e40af",fontWeight:800,fontSize:15,margin:"0 0 6px"}}>ðŸ‘¨â€ðŸ‘© Adultes de la famille au club</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Parents joueurs (VÃ©tÃ©rans), dirigeants, etc. La remise famille s'applique sur tous les membres confondus.</p>
            {f.adultesFamille.map((m,i)=>(
              <div key={i} style={{background:"#dbeafe",border:`1.5px solid #93c5fd`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13,color:"#1e40af"}}>Adulte nÂ°{i+1}</strong>
                  <button onClick={()=>delAdulte(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>âœ•</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence"><select style={inp()} value={m.typeLicence||"nouvelle"} onChange={e=>updAdulte(i,"typeLicence",e.target.value)}><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  <F label="NÂ° licence FFF"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updAdulte(i,"numLicenceFFF",e.target.value)} onBlur={()=>applyLicencieToMember("adultesFamille",i,lookupLic(licencies,m.nom||"",m.prenom||"",m.numLicenceFFF||""))} placeholder="Facultatif"/></F>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updAdulte(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="PrÃ©nom"><input style={inp()} value={m.prenom} onChange={e=>updAdulte(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updAdulte(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updAdulte(i,"sexe",e.target.value)}><option value="">â€”</option><option>Masculin</option><option>FÃ©minin</option></select></F>
                  <F label="NationalitÃ©"><select style={inp()} value={m.nationalite} onChange={e=>updAdulte(i,"nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
                  <F label="CatÃ©gorie"><select style={inp()} value={m.categorie} onChange={e=>updAdulte(i,"categorie",e.target.value)}><option value="">â€”</option>{CATS.filter(c=>["Senior","VÃ©tÃ©ran","Dirigeant"].includes(c.v)).map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                  <F label="TÃ©lÃ©phone"><input type="tel" style={inp()} value={m.tel} onChange={e=>updAdulte(i,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email"><input type="email" style={inp()} value={m.email} onChange={e=>updAdulte(i,"email",e.target.value)} inputMode="email"/></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updAdulte(i,"aJoueAutreClub",v)} label="A jouÃ© dans un autre club la saison derniÃ¨re"/>
                  {m.aJoueAutreClub&&<F label="Club prÃ©cÃ©dent"><input style={inp()} value={m.ancienClub||""} onChange={e=>updAdulte(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updAdulte(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                {m.categorie!=="Dirigeant"&&<div style={G2}>
                  <F label="Short"><select style={inp()} value={m.tailleShort} onChange={e=>updAdulte(i,"tailleShort",e.target.value)}><option value="">â€”</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                  <F label="Chaussettes"><select style={inp()} value={m.tailleChaussettes} onChange={e=>updAdulte(i,"tailleChaussettes",e.target.value)}><option value="">â€”</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                </div>}
                {m.categorie!=="Dirigeant"&&<F label="SurvÃªtement"><select style={inp()} value={m.tailleSurvet} onChange={e=>updAdulte(i,"tailleSurvet",e.target.value)}><option value="">â€” Aucun</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updAdulte(i,"autoSoins",v)} label="ðŸš‘ Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updAdulte(i,"autoPhoto",v)} label="ðŸ“· Droit Ã  l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updAdulte(i,"autoTransport",v)} label="ðŸš— Transport"/>
                </div>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>ðŸ“¸ Photo d'identitÃ©</p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updAdulte(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addAdulte} style={{background:"#dbeafe",color:"#1e40af",border:`2px solid #93c5fd`,borderRadius:10,padding:"12px 18px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",minHeight:48}}>+ Ajouter un adulte de la famille</button>
          </div>

        </div>}

        {/* STEP paiement */}
        {step===stepIdx.paie&&<div>
          {/* DÃ©tail prix par membre */}
          <div style={{background:C.N,borderRadius:12,padding:"16px",marginBottom:16}}>
            <p style={{color:"#9ca3af",fontSize:12,margin:"0 0 10px",textAlign:"center"}}>DÃ©tail tarif famille ({tousMembres.length} membre{tousMembres.length>1?"s":""})</p>
            {detailPrix.map((d,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"4px 0",borderBottom:i<detailPrix.length-1?"1px solid #333":"none",color:C.W}}>
                <span>{d.rang===1?"Joueur principal":`Membre ${d.rang}`} ({d.categorie})</span>
                <span>
                  {d.pct>0?<span style={{color:"#9ca3af",textDecoration:"line-through",marginRight:6}}>{d.base}â‚¬</span>:null}
                  <strong style={{color:d.pct>0?"#86efac":C.J}}>{d.prix}â‚¬</strong>
                  {d.pct>0&&<span style={{fontSize:11,color:"#86efac",marginLeft:4}}>(-{d.pct}%)</span>}
                </span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:18,paddingTop:10,marginTop:8,borderTop:"2px solid #555",fontWeight:900}}>
              <span style={{color:C.W}}>TOTAL</span>
              <span style={{color:C.J}}>{prixFinalTotal} â‚¬</span>
            </div>
          </div>

          {/* Nom de famille (si famille) */}
          {tousMembres.length>1&&<F label="Nom de famille (pour regrouper sur facture)"><input style={inp()} value={f.nomFamille} onChange={e=>set("nomFamille",e.target.value.toUpperCase())} placeholder="Ex: DUPONT"/></F>}

          {/* Mode de paiement */}
          {errs.modePaiement&&<ErrB msg={errs.modePaiement}/>}
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Mode de paiement *</p>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {MODES_PAIEMENT.map(m=>(
              <button key={m.id} onClick={()=>{set("modePaiement",m.id);if(!m.fractionnable){set("nbFois",1);set("datesEcheances",[]);}}}
                style={{flex:"1 0 auto",padding:"10px 12px",border:`2px solid ${f.modePaiement===m.id?C.J:C.Gb}`,background:f.modePaiement===m.id?C.Jp:"#fafafa",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"center",minHeight:48}}>
                {m.l}
              </button>
            ))}
          </div>

          {/* Fractionnement (chÃ¨que uniquement) */}
          {f.modePaiement&&modeObj?.fractionnable&&(
            <div style={{background:C.Gc,borderRadius:10,padding:"14px",marginBottom:14}}>
              <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Paiement en plusieurs fois (sans frais)</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:f.nbFois>1?12:0}}>
                {[1,2,3,4].map(n=>(
                  <button key={n} onClick={()=>{set("nbFois",n);set("datesEcheances",Array.from({length:n},(_,i)=>f.datesEcheances?.[i]||""));}}
                    style={{flex:"1 0 auto",padding:"8px 10px",border:`2px solid ${f.nbFois===n?C.J:C.Gb}`,background:f.nbFois===n?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:40}}>
                    {n===1?"1Ã— (comptant)":`${n}Ã—`}
                  </button>
                ))}
              </div>
              {f.nbFois>1&&<div style={{marginBottom:10}}>
                <p style={{...lbl,marginBottom:8}}>Dates d'encaissement *</p>
                {errs.dateEcheance1&&<ErrB msg={errs.dateEcheance1}/>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {Array.from({length:f.nbFois},(_,i)=><F key={i} label={`${modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} ${i+1}`}>
                    <input type="date" style={inp()} value={f.datesEcheances?.[i]||""} onChange={e=>set("datesEcheances",Array.from({length:f.nbFois},(_,j)=>j===i?e.target.value:(f.datesEcheances?.[j]||"")))} min={new Date().toISOString().slice(0,10)}/>
                  </F>)}
                </div>
              </div>}
              {f.nbFois>1&&datesEcheances&&(
                <div style={{marginTop:8,padding:"10px 12px",background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
                  <p style={{fontWeight:700,fontSize:12,color:C.G,margin:"0 0 6px"}}>Ã‰chÃ©ancier prÃ©vu :</p>
                  {echeances.map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<f.nbFois-1?`1px solid ${C.Gc}`:"none",fontSize:13}}>
                      <span style={{color:C.G}}>{modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} {i+1} (encaissÃ© le {datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span>
                      <span style={{fontWeight:700,color:C.J}}>{m} â‚¬</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {f.modePaiement==="especes"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#92400e"}}>
            ðŸ’µ Paiement en espÃ¨ces uniquement en une seule fois, Ã  remettre <strong>en permanence licence</strong>.
          </div>}
          {f.modePaiement==="cb"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#92400e"}}>
            ðŸ’³ Paiement par CB en une seule fois, Ã  rÃ©gler <strong>en permanence licence</strong>.
          </div>}
          {f.modePaiement==="rib"&&<div style={{background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0369a1",marginBottom:10}}>
            ðŸ¦ Paiement par RIB / virement : le club vous confirmera les consignes lors de la validation.
          </div>}

          <F label="Message pour le secrÃ©tariat (optionnel)"><textarea style={{...inp(),height:80,resize:"vertical"}} value={f.commentaire} onChange={e=>set("commentaire",e.target.value)} placeholder="Questions, infos particuliÃ¨res..."/></F>
        </div>}

        {/* STEP rÃ©cap */}
        {step===total&&<div>
          <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:13,color:"#713f12"}}>âœ‹ VÃ©rifiez avant d'envoyer.</div>
          {certifMsg&&<div style={{marginBottom:10,borderRadius:8,padding:"8px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"âœ…":"ðŸ©º"} {certifMsg.txt}</div>}

          <RB title="Licence">
            <RR l="Type" v={f.typeLicence==="renouvellement"?"ðŸ”„ Renouvellement au club":"âœ¨ Nouvelle licence au club"}/>
            {f.numLicenceFFF&&<RR l="NÂ° FFF" v={f.numLicenceFFF}/>}
          </RB>

          <RB title="Joueur principal">
            <RR l="IdentitÃ©" v={`${f.prenom} ${f.nom}`}/>
            <RR l="Naissance" v={`${fmtD(f.dateNaissance)}${f.lieuNaissance?" â€” "+f.lieuNaissance:""}`}/>
            <RR l="CatÃ©gorie" v={f.categorie}/>
            <RR l="Adresse" v={`${f.adresse}, ${f.codePostal} ${f.ville}`}/>
            <RR l="NationalitÃ©" v={f.nationalite}/>
            {isMajeur&&<><RR l="TÃ©l" v={f.telephone}/><RR l="Email" v={f.email}/></>}
          </RB>

          {!isMajeur&&f.representants[0]?.nom&&<RB title={`ReprÃ©sentant${f.representants.length>1?"s":""} lÃ©gal${f.representants.length>1?"aux":""}`}>
            {f.representants.filter(r=>r.nom).map((r,i)=>(
              <div key={i} style={{padding:"4px 0",borderBottom:i<f.representants.length-1?`1px dashed ${C.Gc}`:"none"}}>
                <RR l={r.lien||"Resp."} v={`${r.prenom} ${r.nom}`}/>
                <RR l="Contact" v={`${r.tel} Â· ${r.email}`}/>
              </div>
            ))}
          </RB>}

          <RB title="Ã‰quipement">
            <RR l="Short" v={f.tailleShort||"â€”"}/>
            <RR l="Chaussettes" v={f.tailleChaussettes||"â€”"}/>
            {f.tailleSweat&&<RR l="Sweat RSG" v={f.tailleSweat}/>}
            {f.tailleSurvet&&<RR l="SurvÃªtement" v={f.tailleSurvet}/>}
          </RB>

          {f.freresSoeurs.length>0&&<RB title={`${isMajeur?"Enfants":"FrÃ¨res/sÅ“urs"} (${f.freresSoeurs.length})`}>
            {f.freresSoeurs.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom} Â· ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
          </RB>}

          {f.adultesFamille.length>0&&<RB title={`Adultes famille (${f.adultesFamille.length})`}>
            {f.adultesFamille.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom} Â· ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
          </RB>}

          {/* RÃ©cap paiement */}
          <div style={{background:C.N,borderRadius:10,padding:"14px",marginBottom:8}}>
            <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Paiement</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.W,fontSize:13}}>{modeObj?.l||"â€”"}</div>
                {f.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {f.nbFois} chÃ¨ques</div>}
                {tousMembres.length>1&&<div style={{color:"#86efac",fontSize:12}}>Tarif famille {f.nomFamille||""} ({tousMembres.length} membres)</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.J,fontWeight:900,fontSize:24}}>{prixFinalTotal} â‚¬</div>
              </div>
            </div>
            {f.nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
              {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} â‚¬</span></div>)}
            </div>}
          </div>

          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px",marginBottom:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px",color:"#92400e"}}>ðŸ“ PrÃ©parez si possible pour la permanence</p>
            <ul style={{margin:"0 0 10px",paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
              {docsAApporter.map((d,i)=><li key={i}>{d}</li>)}
              <li><strong>{prixFinalTotal} â‚¬</strong> en {modeObj?.l?.toLowerCase()||"mode Ã  choisir"}{f.nbFois>1?` (${f.nbFois} versements)`:""}</li>
            </ul>
            {certifReq&&<a href={`${import.meta.env.BASE_URL||"/"}certificat_medical_2026_2027.pdf`} target="_blank" rel="noreferrer" style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e",marginRight:10}}>TÃ©lÃ©charger le certificat mÃ©dical</a>}
            <a href={`${import.meta.env.BASE_URL||"/"}Charte_RSG_2026-2027_Moderne.pdf`} target="_blank" rel="noreferrer" style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e"}}>Lire la charte RSG</a>
          </div>

          <div style={{background:errs.charteAcceptee?"#fee2e2":"#f0fdf4",border:`1px solid ${errs.charteAcceptee?"#fca5a5":"#86efac"}`,borderRadius:10,padding:"12px",marginBottom:10}}>
            <Chk checked={f.charteAcceptee} onChange={v=>set("charteAcceptee",v)} err={errs.charteAcceptee} label={<span>J'ai lu et j'accepte la <a href={`${import.meta.env.BASE_URL||"/"}Charte_RSG_2026-2027_Moderne.pdf`} target="_blank" rel="noreferrer" style={{color:C.N,fontWeight:800}}>charte RSG</a>.</span>}/>
            <Chk checked={f.autoPhoto} onChange={v=>set("autoPhoto",v)} label={<span><strong>ðŸ“· Droit Ã  l'image</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise le club Ã  utiliser des photos et vidÃ©os sur lesquelles je figure (ou mon enfant) pour communiquer sur les supports du club : site web, journal local, comptes Facebook / Instagram du RSG.</span></span>}/>
            <Chk checked={f.autoTransport} onChange={v=>set("autoTransport",v)} label={<span><strong>ðŸš— Transport en vÃ©hicule personnel</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise le transport dans le vÃ©hicule personnel d'un autre parent ou d'un dirigeant du club lors des dÃ©placements pour matchs et entraÃ®nements.</span></span>}/>
          </div>

          {f.photoBase64&&<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:12,background:C.Gc,borderRadius:8,padding:10}}>
            <img src={f.photoBase64} alt="Photo" style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:`2px solid ${C.J}`,flexShrink:0}}/>
            <span style={{fontSize:13,color:C.V,fontWeight:600}}>âœ“ Photo d'identitÃ© fournie</span>
          </div>}

          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af",marginBottom:10}}>
            â„¹ï¸ <strong>PremiÃ¨re inscription au club</strong> : nous vous recommandons d'imprimer ce rÃ©cap et de l'apporter en permanence.
          </div>}
          <p style={{fontSize:12,color:C.G,lineHeight:1.5}}>En envoyant, vous certifiez l'exactitude des informations (RGPD).</p>
        </div>}

        <div style={{display:"flex",gap:10,marginTop:20,paddingTop:16,borderTop:`1px solid ${C.Gc}`}}>
          {step>1&&<button style={BS} onClick={prev}>â† PrÃ©c.</button>}
          <div style={{flex:1}}/>
          {step<total&&<button style={BP} onClick={next}>Suivant â†’</button>}
          {step===total&&<button style={{...BP,opacity:saving?.7:1}} onClick={submit} disabled={saving}>{saving?"Envoiâ€¦":"âœ“ Envoyer"}</button>}
        </div>
      </div>
    </div>
  );
}


/* â•â• CONFIRMATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Confirmation({refId,prenom,nom,saison,prixFinal,modePaiement,nbFois,echeances,datesEcheances,entry,tarifs,fbOk,fbErrMsg,onNew,onDone}){
  const modeObj=MODES_PAIEMENT.find(m=>m.id===modePaiement);
  const aDesMembresFamille=(entry?.freresSoeurs?.length||0)+(entry?.adultesFamille?.length||0)>0;
  const docs=getDocsAApporter(entry||{},entry?.certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
  return<div style={{maxWidth:480,margin:"24px auto",padding:"0 14px 64px",textAlign:"center"}}>
    <div style={{background:C.W,borderRadius:16,padding:"28px 20px",boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`3px solid ${C.J}`}}>
      <div style={{fontSize:52,marginBottom:10}}>ðŸŽ‰</div>
      <h2 style={{color:C.N,fontWeight:900,fontSize:22,margin:"0 0 6px"}}>PrÃ©inscription envoyÃ©e !</h2>
      <p style={{color:C.G,margin:"0 0 4px",fontSize:14}}>Merci <strong>{prenom} {nom}</strong></p>
      <p style={{color:C.G,margin:"0 0 16px",fontSize:13}}>Saison {saison}</p>
      {fbOk===false&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 12px",margin:"0 0 12px",fontSize:12,color:"#92400e",textAlign:"left"}}>
        âš ï¸ <strong>Attention : envoi cloud Ã©chouÃ©</strong><br/>
        Votre prÃ©inscription est sauvegardÃ©e sur cet appareil mais n'a pas Ã©tÃ© transmise au club. Merci de noter votre rÃ©fÃ©rence ci-dessous et de la communiquer au secrÃ©tariat lors de la permanence.
        {fbErrMsg&&<div style={{fontSize:10,color:"#78350f",marginTop:4,opacity:.7}}>Erreur : {fbErrMsg}</div>}
      </div>}
      <div style={{background:C.Jp,border:`2px solid ${C.J}`,borderRadius:10,padding:"12px 16px",margin:"0 0 12px",display:"inline-block",minWidth:200}}>
        <p style={{fontSize:11,color:C.G,margin:"0 0 4px"}}>RÃ©fÃ©rence</p>
        <p style={{fontSize:20,fontWeight:900,color:C.N,letterSpacing:3,margin:0}}>{refId}</p>
      </div>
      <div style={{background:C.N,borderRadius:10,padding:"12px 16px",margin:"0 0 16px"}}>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px"}}>PAIEMENT</p>
        <p style={{color:C.J,fontWeight:900,fontSize:24,margin:"0 0 4px"}}>{prixFinal} â‚¬</p>
        <p style={{color:C.W,fontSize:13,margin:0}}>{modeObj?.l||""}{nbFois>1?` Â· ${nbFois} versements`:""}</p>
        {echeances&&nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} â‚¬</span></div>)}
        </div>}
      </div>
      <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px 14px",margin:"0 0 16px",textAlign:"left"}}>
        <p style={{fontWeight:800,fontSize:13,color:"#92400e",margin:"0 0 8px"}}>ðŸ“ PrÃ©parez si possible pour valider la licence</p>
        {docs.length?(
          <ul style={{margin:"0 0 10px",paddingLeft:18,fontSize:13,color:"#78350f",lineHeight:1.6}}>
            {docs.map((d,i)=><li key={i}>{d}</li>)}
            <li><strong>{prixFinal} â‚¬</strong> en {modeObj?.l?.toLowerCase()||"mode de paiement choisi"}{nbFois>1?` (${nbFois} versements)`:""}</li>
          </ul>
        ):<p style={{fontSize:13,color:"#78350f",margin:"0 0 10px"}}>Vos documents sont indiquÃ©s comme prÃªts. Pensez simplement au rÃ¨glement et Ã  votre rÃ©fÃ©rence.</p>}
        <p style={{fontWeight:700,fontSize:12,color:"#92400e",margin:"0 0 6px"}}>Permanences licence</p>
        <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
          {permanences.map((p,i)=><li key={i}>{fmtPermanence(p)}</li>)}
        </ul>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {entry&&<button style={BS} onClick={()=>printRecap(entry,saison,prixFinal,modeObj,echeances,datesEcheances,entry.certifNeeded,aDesMembresFamille,tarifs)}>ðŸ–¨ Imprimer</button>}
        <button style={BS} onClick={onDone}>Accueil</button>
        <button style={BP} onClick={onNew}>Nouvelle prÃ©inscription</button>
      </div>
    </div>
  </div>;
}

/* â•â• DASHBOARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Dashboard({saison,publicSaison,onPublicSaisonChange,licencies,onLicenciesChange,tarifs,onTarifsChange}){
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [sel,setSel]=useState(null);
  const [search,setSearch]=useState("");
  const [fSt,setFSt]=useState("tous");
  const [fCat,setFCat]=useState("toutes");
  const [fType,setFType]=useState("tous");
  const [note,setNote]=useState("");
  const [tab,setTab]=useState("liste");
  const [exporting,setExporting]=useState(false);
  const [editTarifs,setEditTarifs]=useState(false);
  const [tmpTarifs,setTmpTarifs]=useState(tarifs);
  const [editPerms,setEditPerms]=useState(false);
  const [tmpPerms,setTmpPerms]=useState(getPermanences(tarifs));
  const [editPieces,setEditPieces]=useState(false);
  const [tmpPieces,setTmpPieces]=useState(getPieces(tarifs));
  const [editBoutique,setEditBoutique]=useState(false);
  const [tmpBoutique,setTmpBoutique]=useState(getBoutique(tarifs));
  const [boutiqueSearch,setBoutiqueSearch]=useState("");
  const [boutiqueStatut,setBoutiqueStatut]=useState("tous");
  const [boutiqueCategorie,setBoutiqueCategorie]=useState("tous");
  const [boutiqueArticle,setBoutiqueArticle]=useState("tous");
  const [boutiquePage,setBoutiquePage]=useState("produits");
  const [certifPage,setCertifPage]=useState("footclubs");
  const [isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<820);

  const [fbStatus,setFbStatus]=useState("connecting"); // "connecting" | "online" | "offline"

  useEffect(()=>{
    const onResize=()=>setIsMobile(typeof window!=="undefined"&&window.innerWidth<820);
    onResize();
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);

  const refresh=useCallback(async()=>{
    setLoading(true);
    const d=await stGet(keyIns(saison));
    setData(Array.isArray(d)?d:[]);
    setLoading(false);
  },[saison]);

  useEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{
    const key=keyIns(saison);
    const sync=async(ev)=>{
      if(ev?.key&&ev.key!==key)return;
      if(ev?.detail?.key&&ev.detail.key!==key)return;
      const d=await stGet(key);
      if(Array.isArray(d))setData([...d].sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||"")));
    };
    window.addEventListener("storage",sync);
    window.addEventListener("rsg-storage",sync);
    return()=>{window.removeEventListener("storage",sync);window.removeEventListener("rsg-storage",sync);};
  },[saison]);

  // Ã‰coute en temps rÃ©el sur Firestore (les nouvelles prÃ©inscriptions apparaissent automatiquement)
  useEffect(()=>{
    if(!isFirebaseAvailable()){setFbStatus("offline");return;}
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      // Fusion intelligente : on prend Firebase comme source de vÃ©ritÃ©
      // mais on garde les Ã©ventuelles donnÃ©es locales non syncÃ©es (id absent cÃ´tÃ© Firebase)
      stGet(keyIns(saison)).then(async(local)=>{
        const localArr=Array.isArray(local)?local:[];
        const fbIds=new Set(fbData.map(e=>e.id));
        const onlyLocal=localArr.filter(e=>!fbIds.has(e.id));
        // Resynchronisation : on tente d'envoyer les Ã©ventuelles entrÃ©es locales manquantes
        for(const e of onlyLocal){
          try{await fbSaveInscription(saison,e);}catch{}
        }
        const merged=[...fbData];
        // Trier par date desc (au cas oÃ¹)
        merged.sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||""));
        setData(merged);
        // Backup local
        await stSet(keyIns(saison),merged);
      });
    },(err)=>{
      console.error("Firebase offline:",err);
      setFbStatus("offline");
    });
    return ()=>unsub&&unsub();
  },[saison]);

  const filtered=data.filter(d=>{
    const q=search.toLowerCase();
    const statutOk=fSt==="tous"||d.statut===fSt||(fSt==="valide"&&d.statut==="paye");
    const membres=membresDossier(d);
    const qOk=!q||`${d.nom} ${d.prenom} ${d.id} ${getEmailContact(d)} ${d.email||""} ${membres.map(m=>`${m.nom} ${m.prenom}`).join(" ")}`.toLowerCase().includes(q);
    const catOk=fCat==="toutes"||membres.some(m=>m.categorie===fCat);
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
    setTmpPieces(getPieces(tarifs));
    setTmpBoutique(getBoutique(tarifs));
  },[tarifs]);

  const upd=async(id,patch)=>{
    const d=(await stGet(keyIns(saison))||[]).map(e=>{
      if(e.id!==id)return e;
      const next={...e,...patch};
      if(patch.statut==="valide"||patch.statut==="paye"){
        const achats=markBoutiqueAchatsRegles(next.achatsBoutique);
        if(achats!==next.achatsBoutique)return {...next,achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)};
      }
      return next;
    });
    await stSet(keyIns(saison),d);
    setData(d);
    const u=d.find(e=>e.id===id);
    if(sel?.id===id){setSel(u);if(patch.notes!==undefined)setNote(u.notes||"");}
    // Sync Firebase
    if(isFirebaseAvailable()&&u){try{await fbSaveInscription(saison,u);}catch(e){console.error(e);}}
  };
  const del=async(id)=>{
    if(!window.confirm("Supprimer dÃ©finitivement ?"))return;
    const d=(await stGet(keyIns(saison))||[]).filter(e=>e.id!==id);
    await stSet(keyIns(saison),d);
    setData(d);
    if(sel?.id===id)setSel(null);
    if(isFirebaseAvailable()){try{await fbDeleteInscription(saison,id);}catch(e){console.error(e);}}
  };

  const doExport=async(type)=>{
    setExporting(true);const fn=`RSG_${saison}_`;
    try{
      if(type==="all")await exportXLSX([{name:"Toutes",rows:[H_INS,...filtered.map(toRow)]}],fn+"Preinscriptions.xlsx");
      else if(type==="parEquipe"){const cats=sortCats([...new Set(data.map(d=>d.categorie))]);await exportXLSX(cats.map(cat=>({name:cat,rows:[H_INS,...data.filter(d=>d.categorie===cat).map(toRow)]})),fn+"ParEquipe.xlsx");}
      else if(type==="paiements"){
        const H=["RÃ©fÃ©rence","Nom","PrÃ©nom","CatÃ©gorie","Mode paiement","Nb fois","Tarif total â‚¬","Famille","Membres famille","1er encaissement","Statut"];
        await exportXLSX([{name:"Paiements",rows:[H,...data.map(e=>{
          const nbMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
          return[e.id,e.nom,e.prenom,e.categorie,e.modePaiement||"",e.nbFois||1,calcTotalDossier(e)||"",e.nomFamille||"",nbMembres,(e.datesEcheances&&e.datesEcheances[0])||"",STATUTS[e.statut]?.l||""];
        })]}],fn+"Paiements.xlsx");
      }
      else if(type==="equip"){const rows=data.filter(d=>d.statut!=="refuse").map(e=>[e.categorie,`${e.prenom} ${e.nom}`,e.tailleShort||"",e.tailleChaussettes||"",getSurvet(e),e.tailleSweat||"",STATUTS[e.statut]?.l||""]);rows.sort((a,b)=>catRank(a[0])-catRank(b[0])||a[1].localeCompare(b[1]));await exportXLSX([{name:"Ã‰quipements",rows:[["CatÃ©gorie","Joueur","Short","Chaussettes","SurvÃªtement","Sweat","Statut"],...rows]}],fn+"Equipements.xlsx");}
      else if(type==="certifs")await exportXLSX([{name:"Certifs",rows:[["Nom","PrÃ©nom","CatÃ©gorie","Contact","Certif requis","Statut"],...data.map(e=>[e.nom,e.prenom,e.categorie,getEmailContact(e),e.certifNeeded?"OUI":"Non",STATUTS[e.statut]?.l||""])]}],fn+"Certifs.xlsx");
      else if(type==="contacts")await exportXLSX([{name:"Contacts",rows:[["Nom","PrÃ©nom","CatÃ©gorie","TÃ©lÃ©phone","Email","Resp.","TÃ©l resp.","Email resp.","Statut"],...data.map(e=>{const r=getResp1(e);return[e.nom,e.prenom,e.categorie,getTelContact(e),getEmailContact(e),r?`${r.prenom||""} ${r.nom||""}`:"",r?.tel||"",r?.email||"",STATUTS[e.statut]?.l||""];})]}],fn+"Contacts.xlsx");
      else if(type==="licencies")await exportXLSX([{name:"Base licenciÃ©s",rows:[["Nom","PrÃ©nom","NÂ° Licence FFF","CatÃ©gorie","AnnÃ©e dernier certif"],...licencies.map(l=>[l.nom,l.prenom,l.numLicence||"",l.categorie||"",l.anneeLastCertif||""])]}],fn+"BaseLicencies.xlsx");
      else if(type==="boutique"){
        const articles=getBoutique(tarifs);
        const rows=getAchatsBoutiqueRows(data).map(({entry:e,achat:a})=>[e.id,e.nom,e.prenom,e.categorie,getEmailContact(e),getTelContact(e),getAchatCategorie(a,articles),a.nom,a.taille||"",a.quantite||1,a.prix||0,a.total||((a.quantite||1)*(a.prix||0)),STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"Ã€ rÃ©gler",a.date?fmtD(a.date):"",a.dateCommande?fmtD(a.dateCommande):"",a.dateReception?fmtD(a.dateReception):"",a.dateLivraison?fmtD(a.dateLivraison):"",a.note||""]);
        await exportXLSX([{name:"Boutique",rows:[["RÃ©fÃ©rence","Nom","PrÃ©nom","CatÃ©gorie joueur","Email","TÃ©lÃ©phone","CatÃ©gorie boutique","Article","Taille","QtÃ©","Prix unit.","Total","Statut","Date achat","Date commande","Date rÃ©ception","Date livraison","Note"],...rows]}],fn+"Boutique.xlsx");
      }
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  const equipData={};
  data.filter(d=>d.statut!=="refuse").forEach(d=>{if(!equipData[d.categorie])equipData[d.categorie]={};const survet=getSurvet(d);if(d.tailleShort){equipData[d.categorie].tailleShort=equipData[d.categorie].tailleShort||{};equipData[d.categorie].tailleShort[d.tailleShort]=(equipData[d.categorie].tailleShort[d.tailleShort]||0)+1;}if(d.tailleChaussettes){equipData[d.categorie].tailleChaussettes=equipData[d.categorie].tailleChaussettes||{};equipData[d.categorie].tailleChaussettes[d.tailleChaussettes]=(equipData[d.categorie].tailleChaussettes[d.tailleChaussettes]||0)+1;}if(survet){equipData[d.categorie].tailleSurvet=equipData[d.categorie].tailleSurvet||{};equipData[d.categorie].tailleSurvet[survet]=(equipData[d.categorie].tailleSurvet[survet]||0)+1;}if(d.tailleSweat){equipData[d.categorie].tailleSweat=equipData[d.categorie].tailleSweat||{};equipData[d.categorie].tailleSweat[d.tailleSweat]=(equipData[d.categorie].tailleSweat[d.tailleSweat]||0)+1;}});
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
    montant:boutiqueRows.reduce((s,{achat:a})=>s+(a.total||((a.quantite||1)*(a.prix||0))),0),
    aRegler:boutiqueRows.filter(({achat:a})=>(a.statut||"a_regler")==="a_regler").length,
    aCommander:boutiqueRows.filter(({achat:a})=>["regle","commande","attente_fournisseur"].includes(a.statut||"a_regler")).length,
    aLivrer:boutiqueRows.filter(({achat:a})=>["recu"].includes(a.statut||"a_regler")).length,
  };
  const updateAchatForEntry=async(entryId,achatId,patch)=>{
    const entry=data.find(e=>e.id===entryId);
    if(!entry)return;
    const achats=(entry.achatsBoutique||[]).map(a=>a.id===achatId?{...a,...patch}:a);
    await upd(entryId,{achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)});
  };

  return<div style={{maxWidth:1480,margin:"0 auto",padding:"18px 18px 90px",letterSpacing:"-.01em"}}>
    <div style={{background:`linear-gradient(135deg, ${C.W} 0%, #fffdf0 100%)`,border:`1px solid ${C.Gb}`,borderRadius:24,padding:"18px 20px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap",boxShadow:"0 16px 40px rgba(15,23,42,.07)"}}>
      <div style={{display:"flex",alignItems:"center",gap:14,minWidth:0}}>
        <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:58,height:58,borderRadius:"50%",objectFit:"cover",boxShadow:"0 10px 24px rgba(15,23,42,.16)",flexShrink:0}}/>
        <div>
          <div style={{fontWeight:950,fontSize:22,color:C.N,lineHeight:1}}>Espace admin RSG</div>
          <div style={{fontSize:13,color:C.G,marginTop:5}}>Saison publique du formulaire : <strong style={{color:C.N}}>{publicSaison}</strong> - Saison de travail admin : <strong style={{color:C.N}}>{saison}</strong></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:isMobile?"stretch":"flex-end"}}>
        <a href={`${import.meta.env.BASE_URL||"/"}wiki-admin.html`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,textDecoration:"none",background:C.N,color:C.J,border:"1px solid #111827",borderRadius:12,padding:"11px 14px",fontSize:13,fontWeight:950,boxShadow:"0 8px 20px rgba(15,23,42,.16)"}}>
          Wiki admin
        </a>
        <select value={publicSaison} onChange={e=>onPublicSaisonChange(e.target.value)} style={{...inp(),width:"auto",minWidth:200,fontSize:13,fontWeight:900,borderRadius:14}}>
          {saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </div>
    {/* Indicateur Firebase + diagnostic */}
    <div style={{padding:"10px 14px",marginBottom:14,background:fbStatus==="online"?"#ecfdf5":fbStatus==="connecting"?"#fef9c3":"#fee2e2",border:`1px solid ${fbStatus==="online"?"#bbf7d0":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,borderRadius:18,fontSize:12,color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R,boxShadow:"0 10px 24px rgba(15,23,42,.04)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:fbStatus==="online"?C.V:fbStatus==="connecting"?"#eab308":C.R}}/>
          <strong>{fbStatus==="online"?"â˜ï¸ Synchronisation Firebase active":fbStatus==="connecting"?"Connexion Ã  Firebaseâ€¦":"âš ï¸ Mode hors-ligne"}</strong>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={async()=>{
            const log=[];
            log.push("=== Diagnostic Firebase ===");
            log.push("Firebase disponible : "+(isFirebaseAvailable()?"OUI âœ“":"NON âœ—"));
            log.push("Saison : "+saison);
            try{
              const dbData=await fbGetAllInscriptions(saison);
              log.push("Lecture Firestore : "+(Array.isArray(dbData)?`${dbData.length} prÃ©inscription(s)`:"Ã‰CHEC"));
              if(Array.isArray(dbData)&&dbData.length){
                log.push("DerniÃ¨re entrÃ©e : "+(dbData[0].prenom||"?")+" "+(dbData[0].nom||"?"));
              }
            }catch(err){
              log.push("Lecture Firestore : Ã‰CHEC ("+err.message+")");
            }
            const local=await stGet(keyIns(saison));
            log.push("DonnÃ©es locales : "+(Array.isArray(local)?`${local.length} prÃ©inscription(s)`:"aucune"));
            log.push("AffichÃ© Ã  l'Ã©cran : "+data.length+" prÃ©inscription(s)");
            alert(log.join("\n"));
          }} style={{background:"transparent",color:"inherit",border:"1px solid currentColor",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>ðŸ” Diagnostic</button>
          <button onClick={refresh} style={{background:"transparent",color:"inherit",border:"1px solid currentColor",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>â†» Recharger</button>
        </div>
      </div>
    </div>

    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:16}}>
      {[{l:"Dossiers",v:stats.total,c:C.N},{l:"Membres inscrits",v:stats.membres,c:C.B},{l:"Dossiers en attente",v:stats.attente,c:"#ca8a04"},{l:"Dossiers validÃ©s payÃ©s",v:stats.valide,c:C.V},{l:"ðŸ©º Certifs",v:stats.certif,c:C.R},{l:"ðŸ’° CA estimÃ©",v:`${stats.ca} â‚¬`,c:"#7c3aed"}].map(({l,v,c})=>(
        <div key={l} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"16px 18px",textAlign:"left",boxShadow:"0 14px 34px rgba(15,23,42,.06)",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",right:-18,top:-18,width:64,height:64,borderRadius:"50%",background:`${c}18`}}/>
          <div style={{fontSize:v.toString().length>5?20:30,fontWeight:950,color:c,lineHeight:1}}>{v}</div>
          <div style={{fontSize:12,color:C.G,lineHeight:1.2,fontWeight:800,marginTop:8}}>{l}</div>
        </div>
      ))}
    </div>

    <div style={{display:"grid",gridTemplateColumns:isMobile?"minmax(0,1fr)":"280px minmax(0,1fr)",gap:isMobile?12:22,alignItems:"start"}}>
    {/* Tabs */}
    <div style={{display:"flex",flexDirection:isMobile?"row":"column",background:C.W,borderRadius:24,padding:isMobile?8:14,gap:6,border:`1px solid ${C.Gb}`,boxShadow:"0 18px 45px rgba(15,23,42,.08)",position:isMobile?"static":"sticky",top:12,zIndex:2,overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch"}}>
      {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 8px 14px",marginBottom:6,borderBottom:`1px solid ${C.Gb}`}}>
        <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13,fontWeight:950,color:C.N,lineHeight:1}}>RÃ©veil Saint-GÃ©rÃ©on</div>
          <div style={{fontSize:11,fontWeight:800,color:C.G,marginTop:2}}>Navigation bureau</div>
        </div>
      </div>}
      {[
        {id:"liste",l:"ðŸ“‹ Liste"},
        {id:"parCat",l:"âš½ Par cat."},
        {id:"parType",l:"ðŸ“Š Par type"},
        {id:"familles",l:"Familles"},
        {id:"mutations",l:"ðŸ” Mutations"},
        {id:"nonpreins",l:"ðŸ” Manquants"},
        {id:"paiements",l:"ðŸ’° Paiements"},
        {id:"equip",l:"ðŸ‘• Tailles"},
        {id:"certifs",l:"ðŸ©º Certifs"},
        {id:"permanences",l:"ðŸ“… Permanences"},
        {id:"pieces",l:"ðŸ“ PiÃ¨ces"},
        {id:"boutique",l:"ðŸ›ï¸ Boutique"},
        {id:"exports",l:"ðŸ“Š Exports"},
        {id:"footclubs",l:"ðŸŒ Footclubs"},
        {id:"tarifs",l:"âš™ï¸ Tarifs & remises"},
        {id:"base",l:`ðŸ‘¥ Base (${licencies.length})`}
      ].map(({id,l})=>(
        <button key={id} onClick={()=>setTab(id)} style={{width:isMobile?"auto":"100%",flex:isMobile?"0 0 auto":undefined,textAlign:"left",padding:"12px 14px",border:"none",borderRadius:14,fontWeight:900,fontSize:13,cursor:"pointer",background:tab===id?C.J:"transparent",color:tab===id?C.N:C.G,whiteSpace:isMobile?"nowrap":"normal",minHeight:42,boxShadow:tab===id?"0 10px 22px rgba(245,200,0,.24)":"none",transition:"background .15s ease, color .15s ease"}}>{l}</button>
      ))}
      <button onClick={refresh} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"11px 14px",fontSize:13,cursor:"pointer",fontWeight:900,textAlign:"left",marginTop:isMobile?0:6}}>Actualiser</button>
    </div>

    <div style={{minWidth:0}}>
    {/* LISTE */}
    {tab==="liste"&&<>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        <input style={{...inp(),fontSize:14}} placeholder="ðŸ” Nom, prÃ©nom, email, rÃ©fÃ©renceâ€¦" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{val:fSt,set:setFSt,opts:[{v:"tous",l:"Tous statuts"},...STATUT_ORDER.map(k=>({v:k,l:STATUTS[k].l}))]},{val:fCat,set:setFCat,opts:[{v:"toutes",l:"Toutes cat."},...CATS.map(c=>({v:c.v,l:c.v}))]},{val:fType,set:setFType,opts:[{v:"tous",l:"Tous types"},{v:"renouvellement",l:"Renouvellements"},{v:"nouvelle",l:"Nouvelles"}]}].map((s,i)=>(
            <select key={i} style={{...inp(),flex:"1 1 100px",fontSize:13}} value={s.val} onChange={e=>s.set(e.target.value)}>{s.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
          ))}
        </div>
        <p style={{fontSize:12,color:C.G,margin:0}}>{filtered.length} / {data.length} dossier(s) - {tousMembresDossiers(filtered).length} membre(s) affiche(s)</p>
      </div>
      {loading&&<p style={{textAlign:"center",color:C.G,padding:32}}>Chargementâ€¦</p>}
      {!loading&&filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucune prÃ©inscription</p>}
      {!loading&&filtered.map(e=><EntryCard key={e.id} e={e} sel={sel} onSel={()=>{setSel(e);setNote(e.notes||"");}}/>)}
    </>}

    {/* CERTIFS */}
    {tab==="certifs"&&<div>
      <div style={{display:"flex",gap:6,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4,marginBottom:12}}>
        {[{id:"footclubs",l:`Base Footclubs (${licencies.filter(l=>certifRequis(l)===true).length})`},{id:"preinscrits",l:`PrÃ©inscrits (${data.filter(d=>d.certifNeeded).length})`}].map(x=><button key={x.id} onClick={()=>setCertifPage(x.id)} style={{flex:1,border:"none",borderRadius:7,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:certifPage===x.id?C.J:C.W,color:certifPage===x.id?C.N:C.G}}>{x.l}</button>)}
      </div>
      {certifPage==="footclubs"&&<div>
        {licencies.filter(l=>certifRequis(l)===true).length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun joueur avec certificat requis dans la base Footclubs.</p>}
        {licencies.filter(l=>certifRequis(l)===true).sort((a,b)=>(catFromLic(a)||"").localeCompare(catFromLic(b)||"")||(getLicValue(a,"n","nom")||"").localeCompare(getLicValue(b,"n","nom")||"")).map((l,i)=>{
          const nom=getLicValue(l,"n","nom"), prenom=getLicValue(l,"p","prenom"), num=getLicValue(l,"l","numLicence","numLicenceFFF"), cat=catFromLic(l)||suggestCat(getLicValue(l,"dn","dateNaissance"),saison)||"â€”";
          const inscrit=data.find(d=>lookupLic([l],d.nom,d.prenom,d.numLicenceFFF));
          return <div key={num||`${nom}-${prenom}-${i}`} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${inscrit?C.V:C.R}`}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:800}}>{prenom} {nom}</span>
              <span style={{background:inscrit?"#dcfce7":"#fee2e2",color:inscrit?C.V:C.R,padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:800}}>{inscrit?"PrÃ©inscrit":"Pas encore prÃ©inscrit"}</span>
            </div>
            <div style={{fontSize:12,color:C.G,marginTop:3}}>{cat} Â· Licence {num||"â€”"} Â· Certificat mÃ©dical requis selon Footclubs</div>
          </div>;
        })}
      </div>}
      {certifPage==="preinscrits"&&<div>
        {data.filter(d=>d.certifNeeded).length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun prÃ©inscrit avec certificat requis.</p>}
        {data.filter(d=>d.certifNeeded).map(e=><div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${C.R}`}}>
          <span style={{fontWeight:700}}>{e.prenom} {e.nom}</span><span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span>
          <div style={{fontSize:12,color:C.G,marginTop:3}}>{getEmailContact(e)} Â· Certif : {e.anneeLastCertifBase||"inconnu"} Â· Statut dossier : {STATUTS[e.statut]?.l||"â€”"}</div>
        </div>)}
      </div>}
    </div>}

    {/* NON PRÃ‰INSCRITS â€” qui de la saison N-1 ne s'est pas rÃ©inscrit ? */}
    {/* PAR CATÃ‰GORIE */}
    {tab==="parCat"&&<ViewParCategorie data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {/* PAR TYPE */}
    {tab==="parType"&&<ViewParType data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {tab==="familles"&&<ViewFamilles data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {tab==="mutations"&&<ViewMutations data={data} onSelect={e=>{setSel(e);setNote(e.notes||"");}}/>}

    {tab==="nonpreins"&&<NonPreinscrits licencies={licencies} data={data} saison={saison}/>}

    {/* Ã‰QUIPEMENTS */}
    {tab==="equip"&&<div>
      {sortCats(Object.keys(equipData)).map(cat=>{const fields=equipData[cat];const joueurs=data.filter(d=>d.categorie===cat&&d.statut!=="refuse").length;return <div key={cat} style={{background:C.W,borderRadius:12,padding:"14px 16px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
        <div style={{fontWeight:900,fontSize:16,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"5px 10px",borderRadius:7,fontSize:13}}>{cat}</span>
          <span style={{color:C.G,fontSize:13}}>{joueurs} joueur(s)</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
          {[
            ["tailleShort","Short"],
            ["tailleChaussettes","Chaussettes"],
            ["tailleSweat","Sweat RSG"],
            ["tailleSurvet","SurvÃªtement"]
          ].filter(([field])=>fields[field]).map(([field,label])=><div key={field} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px"}}>
            <p style={{fontSize:13,fontWeight:900,color:C.N,margin:"0 0 8px"}}>{label}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(72px,1fr))",gap:6}}>
              {Object.entries(fields[field]).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([sz,n])=><div key={sz} style={{background:C.W,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"7px 8px",textAlign:"center"}}>
                <div style={{fontWeight:900,color:C.N,fontSize:13}}>{sz}</div>
                <div style={{fontSize:12,color:C.Jd,fontWeight:900}}>Ã— {n}</div>
              </div>)}
            </div>
          </div>)}
        </div>
      </div>;})}
    </div>}

    {/* PAIEMENTS */}
    {tab==="paiements"&&<div>
      <div style={{background:C.W,borderRadius:12,padding:"14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
        <p style={{fontWeight:700,fontSize:14,margin:"0 0 12px"}}>ðŸ’° RÃ©capitulatif paiements</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {Object.entries({"ðŸ’³ CB":data.filter(d=>d.modePaiement==="cb").length,"ðŸ“ ChÃ¨que":data.filter(d=>d.modePaiement==="cheque").length,"ðŸ’µ EspÃ¨ces":data.filter(d=>d.modePaiement==="especes").length,"ðŸ¦ RIB":data.filter(d=>d.modePaiement==="rib").length}).map(([l,v])=>(
            <div key={l} style={{background:C.Gc,borderRadius:8,padding:"10px",textAlign:"center"}}><div style={{fontWeight:900,fontSize:20}}>{v}</div><div style={{fontSize:11,color:C.G}}>{l}</div></div>
          ))}
        </div>
        {/* Par mode */}
        {[{id:"cb",l:"ðŸ’³ CB"},{id:"cheque",l:"ðŸ“ ChÃ¨que"},{id:"especes",l:"ðŸ’µ EspÃ¨ces"},{id:"rib",l:"ðŸ¦ RIB / virement"}].map(m=>{
          const grp=data.filter(d=>d.modePaiement===m.id);
          if(!grp.length)return null;
          return<div key={m.id} style={{marginBottom:12}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px",color:C.G}}>{m.l} â€” {grp.length} dossier(s) Â· {grp.reduce((s,d)=>s+calcTotalDossier(d),0)} â‚¬ estimÃ©</p>
            {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=><div key={d.id} onClick={()=>{setSel(d);setNote(d.notes||"");}} style={{background:d.nbFois>1?"#fffbeb":C.Gc,border:`1px solid ${d.nbFois>1?"#fcd34d":C.Gb}`,borderLeft:`4px solid ${STATUTS[d.statut]?.c||C.G}`,borderRadius:8,padding:"8px 10px",marginBottom:4,fontSize:12,cursor:"pointer",display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
              <span style={{fontWeight:700}}>{d.prenom} {d.nom}</span> â€” {calcTotalDossier(d)} â‚¬ en {d.nbFois}Ã—{d.datesEcheances&&d.datesEcheances[0]?` Â· 1er encaissement ${fmtD(d.datesEcheances[0])}`:""}
              {d.datesEcheances&&d.nbFois>1&&<div style={{marginTop:4,fontSize:11,color:"#92400e"}}>Ã‰chÃ©ances : {d.datesEcheances.map(dt=>fmtD(dt)).join(" Â· ")}</div>}
            </div>)}
          </div>;
        })}
      </div>
    </div>}

    {/* PERMANENCES */}
    {tab==="permanences"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>ðŸ“… Permanences licence â€” Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces dates et horaires s'affichent aprÃ¨s l'envoi de la prÃ©inscription et sur le rÃ©cap imprimable.</p>
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
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPerms(getPermanences(tarifs).map(p=>({...p})));setEditPerms(true);}}>âœï¸ Modifier les permanences</button>
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
              <F label="DÃ©but"><input type="time" style={inp()} value={p.debut||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,debut:e.target.value}:x))}/></F>
              <F label="Fin"><input type="time" style={inp()} value={p.fin||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,fin:e.target.value}:x))}/></F>
            </div>
            <F label="Lieu"><input style={inp()} value={p.lieu||""} onChange={e=>setTmpPerms(list=>list.map((x,j)=>j===i?{...x,lieu:e.target.value}:x))} placeholder="Ex: Stade du RSG, club-house"/></F>
          </div>)}
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPerms(p=>[...p,{date:"",debut:"",fin:"",lieu:"Stade du RSG"}])}>+ Ajouter une permanence</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_permanences:tmpPerms});setEditPerms(false);}}>âœ“ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditPerms(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {/* PIÃˆCES Ã€ FOURNIR */}
    {tab==="pieces"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>ðŸ“ PiÃ¨ces Ã  fournir â€” Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Ces libellÃ©s s'affichent uniquement Ã  la fin de la prÃ©inscription et sur le rÃ©cap imprimable.</p>
      </div>
      {!editPieces?(
        <div>
          {getPieces(tarifs).map((p,i)=><div key={p.id||i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`}}>
            <div style={{fontWeight:800,fontSize:14,color:C.N}}>{p.label}</div>
            <div style={{fontSize:12,color:C.G,marginTop:3}}>Condition : {p.condition==="certif"?"si certificat requis":p.condition==="famille"?"si inscription famille":p.condition==="etranger"?"si nationalitÃ© Ã©trangÃ¨re":"toujours"}</div>
          </div>)}
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpPieces(getPieces(tarifs).map(p=>({...p})));setEditPieces(true);}}>âœï¸ Modifier les piÃ¨ces Ã  fournir</button>
        </div>
      ):(
        <div>
          {tmpPieces.map((p,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <p style={{fontWeight:800,fontSize:13,margin:0}}>PiÃ¨ce {i+1}</p>
              {tmpPieces.length>1&&<button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpPieces(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>}
            </div>
            <F label="LibellÃ©"><input style={inp()} value={p.label||""} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,label:e.target.value}:x))}/></F>
            <F label="Condition d'affichage"><select style={inp()} value={p.condition||"always"} onChange={e=>setTmpPieces(list=>list.map((x,j)=>j===i?{...x,condition:e.target.value}:x))}>
              <option value="always">Toujours</option>
              <option value="certif">Si certificat mÃ©dical requis</option>
              <option value="famille">Si inscription famille</option>
              <option value="etranger">Si nationalitÃ© Ã©trangÃ¨re</option>
            </select></F>
          </div>)}
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpPieces(list=>[...list,{id:`piece_${Date.now()}`,label:"Nouvelle piÃ¨ce",condition:"always"}])}>+ Ajouter une piÃ¨ce</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_pieces:tmpPieces});setEditPieces(false);}}>âœ“ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditPieces(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {tab==="exports"&&<div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:10}}>
        {[
          {id:"all",l:"Tous dossiers",d:"PrÃ©inscriptions complÃ¨tes"},
          {id:"parEquipe",l:"Par Ã©quipe",d:"Un onglet par catÃ©gorie"},
          {id:"paiements",l:"Paiements",d:"Montants, modes et Ã©chÃ©ances"},
          {id:"boutique",l:"Boutique",d:"Achats et suivi commandes"},
          {id:"equip",l:"Tailles",d:"Ã‰quipements par joueur"},
          {id:"certifs",l:"Certificats",d:"Suivi mÃ©dical"},
          {id:"contacts",l:"Contacts",d:"TÃ©lÃ©phones et emails"},
          {id:"licencies",l:"LicenciÃ©s",d:"Base importÃ©e"}
        ].map(x=><button key={x.id} onClick={()=>doExport(x.id)} disabled={exporting} style={{background:C.W,color:C.N,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"14px 16px",fontWeight:800,fontSize:14,cursor:"pointer",opacity:exporting?.6:1,textAlign:"left",minHeight:86}}>
          <span style={{display:"block"}}>{exporting?"Export...":x.l}</span>
          <span style={{display:"block",fontSize:12,color:C.G,fontWeight:500,marginTop:5}}>{x.d}</span>
        </button>)}
      </div>
    </div>}

    {/* BOUTIQUE PERMANENCE */}
    {tab==="boutique"&&<div>
      <div style={{display:"flex",gap:6,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4,marginBottom:12}}>
        {[{id:"produits",l:"Produits"},{id:"commandes",l:"Commandes"}].map(x=><button key={x.id} onClick={()=>setBoutiquePage(x.id)} style={{flex:1,border:"none",borderRadius:7,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:boutiquePage===x.id?C.J:C.W,color:boutiquePage===x.id?C.N:C.G}}>{x.l}</button>)}
      </div>
      {boutiquePage==="produits"&&(!editBoutique?(
        <div>
          {getBoutiqueCategories(tarifs).map(cat=>{
            const articlesCat=getBoutique(tarifs).filter(a=>(a.categorie||"Sans catÃ©gorie")===cat);
            if(!articlesCat.length)return null;
            return <div key={cat} style={{marginBottom:12}}>
              <p style={{fontSize:12,fontWeight:900,color:C.N,margin:"0 0 6px",textTransform:"uppercase"}}>{cat} Â· {articlesCat.length} article(s)</p>
              {articlesCat.map(a=><div key={a.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${C.Gb}`,opacity:a.actif===false ? .55 : 1}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",minWidth:0,flex:1}}>
                {a.imageBase64?<img src={a.imageBase64} alt={a.nom} style={{width:56,height:56,objectFit:"cover",borderRadius:8,border:`1px solid ${C.Gb}`,flexShrink:0}}/>:<div style={{width:56,height:56,borderRadius:8,background:C.Gc,border:`1px dashed ${C.Gb}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>ðŸ›ï¸</div>}
                <div style={{minWidth:0}}>
                <div style={{fontWeight:900,fontSize:15,color:C.N}}>{a.nom}</div>
                <div style={{fontSize:12,color:C.G,marginTop:3}}>{a.categorie||"Sans catÃ©gorie"} Â· {(a.tailles||[]).join(" Â· ")||"Sans taille"}</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:900,fontSize:20,color:C.J}}>{a.prix} â‚¬</div>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:a.actif===false?"#fee2e2":"#dcfce7",color:a.actif===false?C.R:C.V}}>{a.actif===false?"MasquÃ©":"Actif"}</span>
              </div>
            </div>
          </div>)}
            </div>;
          })}
          <button style={{...BP,width:"100%",marginTop:6}} onClick={()=>{setTmpBoutique(getBoutique(tarifs).map(a=>({...a,tailles:[...(a.tailles||[])]})));setEditBoutique(true);}}>âœï¸ Modifier les articles boutique</button>
        </div>
      ):(
        <div>
          {tmpBoutique.map((a,i)=><div key={i} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
              <p style={{fontWeight:800,fontSize:13,margin:0}}>Article {i+1}</p>
              <button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"5px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>setTmpBoutique(list=>list.filter((_,j)=>j!==i))}>Supprimer</button>
            </div>
            <div style={G2}>
              <F label="Nom"><input style={inp()} value={a.nom||""} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,nom:e.target.value}:x))}/></F>
              <F label="Prix"><input type="number" style={inp()} value={a.prix||0} min={0} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,prix:parseInt(e.target.value)||0}:x))}/></F>
            </div>
            <F label="CatÃ©gorie boutique"><input list="boutique-categories" style={inp()} value={a.categorie||""} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,categorie:e.target.value}:x))} placeholder="Textile, Accessoires, Commande spÃ©ciale..."/></F>
            <div style={{marginBottom:10}}>
              <label style={lbl}>Photo produit</label>
              <PhotoInput value={a.imageBase64||""} onChange={v=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,imageBase64:v}:x))}/>
            </div>
            <F label="Tailles / options (sÃ©parÃ©es par des virgules)" span><input style={inp()} value={(a.tailles||[]).join(", ")} onChange={e=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,tailles:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}:x))} placeholder="S, M, L, XL"/></F>
            <Chk checked={a.actif!==false} onChange={v=>setTmpBoutique(list=>list.map((x,j)=>j===i?{...x,actif:v}:x))} label="Article disponible en permanence"/>
          </div>)}
          <datalist id="boutique-categories">{getBoutiqueCategories({...tarifs,_boutique:tmpBoutique}).map(c=><option key={c} value={c}/>)}</datalist>
          <button style={{...BS,width:"100%",marginBottom:10}} onClick={()=>setTmpBoutique(list=>[...list,{id:`article_${Date.now()}`,nom:"Nouvel article",categorie:"Commande spÃ©ciale",prix:0,tailles:["S","M","L","XL"],actif:true,imageBase64:""}])}>+ Ajouter un article</button>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange({...tarifs,_boutique:tmpBoutique});setEditBoutique(false);}}>âœ“ Enregistrer</button>
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
    </div>}

    {/* TARIFS */}
    {tab==="tarifs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>âš™ï¸ Gestion des tarifs â€” Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Modifiez les tarifs par catÃ©gorie. Ils seront affichÃ©s sur le formulaire public et utilisÃ©s pour les calculs.</p>
      </div>
      {!editTarifs?(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {orderedTarifEntries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.Gb}`}}>
                <span style={{fontWeight:600,fontSize:13}}>{catLabel(cat)}</span>
                <span style={{fontWeight:900,fontSize:18,color:prix===0?C.V:C.J}}>{prix===0?"GRATUIT":prix+" â‚¬"}</span>
              </div>
            ))}
          </div>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Remises famille</p>
            <p style={{fontSize:11,color:C.G,margin:"0 0 8px"}}>S'applique sur tous les membres de la famille (enfants ET adultes).</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(getRemisesFamille(tarifs)).map(([rang,pct])=><span key={rang} style={{background:C.Gc,padding:"5px 10px",borderRadius:6,fontSize:12,fontWeight:600}}>{rang==="4"?"4Ã¨me et +":`${rang}Ã¨me membre`} : <strong style={{color:C.V}}>-{pct}%</strong></span>)}
            </div>
          </div>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>ðŸ” Codes d'accÃ¨s bureau</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{getAccessCodes(tarifs).map(c=><span key={c} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 9px",fontSize:12,fontWeight:800}}>{c}</span>)}</div>
          </div>
          <button style={{...BP,width:"100%"}} onClick={()=>{setTmpTarifs({...tarifs,_remises:getRemisesFamille(tarifs),_accessCodes:getAccessCodes(tarifs)});setEditTarifs(true);}}>âœï¸ Modifier tarifs, remises et accÃ¨s</button>
        </div>
      ):(
        <div>
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>ðŸ’° Tarifs par catÃ©gorie</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {orderedTarifEntries(tmpTarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{catLabel(cat)}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={prix} onChange={e=>setTmpTarifs(p=>({...p,[cat]:parseInt(e.target.value)||0}))} min={0} max={999}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>â‚¬</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§â€ðŸ‘¦ Remises famille (% Ã  partir du nÃ¨me membre)</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[2,3,4].map(rang=>(
              <div key={rang} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{rang===4?"4e et +":rang+"Ã¨me"}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={tmpTarifs._remises?.[rang]||0} onChange={e=>setTmpTarifs(p=>({...p,_remises:{...(p._remises||{}),[rang]:Math.max(0,Math.min(100,parseInt(e.target.value)||0))}}))} min={0} max={100}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>%</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>ðŸ” Codes d'accÃ¨s bureau</p>
          <F label="Un code par ligne ou sÃ©parÃ© par des virgules" span><textarea style={{...inp(),height:72,resize:"vertical"}} value={(tmpTarifs._accessCodes||getAccessCodes(tmpTarifs)).join("\n")} onChange={e=>setTmpTarifs(p=>({...p,_accessCodes:e.target.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)}))}/></F>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange(tmpTarifs);setEditTarifs(false);}}>âœ“ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditTarifs(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {/* FOOTCLUBS */}
    {tab==="footclubs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 6px"}}>ðŸŒ Workflow Footclubs</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.6}}>Pour chaque joueur : <strong>1)</strong> Footclubs â†’ Licences â†’ DÃ©matÃ©rialisÃ©es Â· <strong>2)</strong> Collez l'email Â· <strong>3)</strong> FFF envoie le formulaire automatiquement.</p>
      </div>
      <button style={{...BP,marginBottom:12,width:"100%",fontSize:14}} onClick={()=>window.open("https://footclubs.fff.fr","_blank")}>Ouvrir Footclubs â†’</button>
      {data.filter(d=>d.statut==="attente"||d.statut==="valide").map(e=>{const email=getEmailContact(e);return<div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
          <div><span style={{fontWeight:700,fontSize:14}}>{e.prenom} {e.nom}</span><span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span></div>
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        </div>
        <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
          <div><p style={{fontSize:10,color:"#0369a1",margin:0,fontWeight:700}}>EMAIL FOOTCLUBS</p><p style={{fontSize:13,fontWeight:600,color:C.N,margin:0}}>{email||"â€”"}</p></div>
          <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}} onClick={()=>email&&navigator.clipboard.writeText(email)}>Copier</button>
        </div>
        <div style={{fontSize:12,color:C.G,marginBottom:8,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span>NÃ©(e) : {fmtD(e.dateNaissance)}</span>
          <span style={{color:e.certifNeeded?C.R:C.V,fontWeight:600}}>{e.certifNeeded?"ðŸ©º Certif requis":"âœ… Certif OK"}</span>
          <span style={{color:C.J,fontWeight:600}}>{e.prixFinal||0} â‚¬{e.nbFois>1?` (${e.nbFois}Ã—)`:""}</span>
        </div>
        {e.photoBase64&&<div style={{display:"flex",gap:8,alignItems:"center",fontSize:12,color:C.V,marginBottom:8}}><img src={e.photoBase64} style={{width:36,height:36,objectFit:"cover",borderRadius:4,border:`1.5px solid ${C.J}`}}/><span>Photo â†’ uploader dans Footclubs</span></div>}
        <button style={{...BP,fontSize:12,padding:"8px 14px",width:"100%"}} onClick={()=>upd(e.id,{statut:"valide",dateValidation:new Date().toISOString()})}>âœ“ InitiÃ© dans Footclubs</button>
      </div>;})}
    </div>}

    {/* BASE LICENCIÃ‰S */}
    {tab==="base"&&<BaseLicencies saison={saison} licencies={licencies} onSave={async lic=>{await onLicenciesChange(lic);}}/>}
    </div>
    </div>
    {sel&&<DetailModal onClose={()=>setSel(null)}>
      <DetailPanel e={sel} note={note} setNote={setNote} onUpd={upd} onDel={del} onChangeStatut={(id,st)=>upd(id,{statut:st,dateValidation:st==="valide"?new Date().toISOString():undefined,datePaiement:st==="valide"?new Date().toISOString():undefined})} tarifs={tarifs} onClose={()=>setSel(null)}/>
    </DetailModal>}
  </div>;
}

/* â•â• VUES PAR CATÃ‰GORIE / PAR TYPE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ViewParCategorie({data,onSelect}){
  const [openCat,setOpenCat]=useState(null);
  // Grouper par catÃ©gorie
  const groupes={};
  tousMembresDossiers(data).forEach(m=>{
    const c=m.categorie||"?";
    if(!groupes[c])groupes[c]=[];
    groupes[c].push(m);
  });
  // Ordre logique des catÃ©gories
  const ordreCat=["Babyfoot","U6-U7","U8-U9","U10-U11","U12-U13","U14-U15","U16-U17-U18","Senior","VÃ©tÃ©ran","Dirigeant"];
  const cats=ordreCat.filter(c=>groupes[c]).concat(Object.keys(groupes).filter(c=>!ordreCat.includes(c)).sort());

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>âš½ PrÃ©inscriptions par catÃ©gorie</p>
      <p style={{fontSize:12,color:"#1e40af",margin:0}}>Vue d'Ã©quipe : combien de joueurs par catÃ©gorie, statuts, contacts. Cliquez sur une catÃ©gorie pour la dÃ©plier.</p>
    </div>
    {cats.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucune prÃ©inscription</p>}
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
            {stats.attente>0&&<span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>â³ {stats.attente}</span>}
            {stats.valide>0&&<span style={{background:"#dcfce7",color:C.V,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>âœ“ {stats.valide}</span>}
            {stats.incomplet>0&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>âš ï¸ {stats.incomplet}</span>}
            {stats.certifs>0&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>ðŸ©º {stats.certifs}</span>}
            {stats.ca>0&&<span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>{stats.ca} â‚¬</span>}
            <span style={{color:C.G,fontSize:14,marginLeft:4,transform:isOpen?"rotate(180deg)":"none",transition:"transform .15s"}}>â–¼</span>
          </div>
        </button>
        {isOpen&&<div style={{padding:"4px 14px 14px"}}>
          {/* Actions globales pour la catÃ©gorie */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>{
              const emails=[...new Set(grp.map(m=>getEmailContact(m.dossier)).filter(Boolean))];
              if(!emails.length){alert("Aucun email");return;}
              navigator.clipboard.writeText(emails.join("; "));
              alert(`âœ… ${emails.length} email(s) copiÃ©(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>ðŸ“§ Copier emails</button>
            <button onClick={()=>{
              const tels=[...new Set(grp.map(m=>getTelContact(m.dossier)).filter(Boolean))];
              if(!tels.length){alert("Aucun tÃ©lÃ©phone");return;}
              navigator.clipboard.writeText(tels.join(", "));
              alert(`âœ… ${tels.length} tÃ©lÃ©phone(s) copiÃ©(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>ðŸ“± Copier tÃ©l.</button>
          </div>
          {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=><div key={`${m.dossierId}-${m.idx}`} onClick={()=>onSelect(m.dossier)} style={{cursor:"pointer",background:C.Gc,borderRadius:8,padding:"8px 10px",marginBottom:4,borderLeft:`3px solid ${STATUTS[m.statut]?.c||C.G}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{m.prenom} {m.nom}</div>
              <div style={{fontSize:11,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap"}}>
                <span>{m.dateNaissance?fmtD(m.dateNaissance):""}</span>
                <span>{m.role}</span>
                <span>Dossier {m.dossier.prenom} {m.dossier.nom}</span>
                {m.certifNeeded&&<span style={{color:C.R,fontWeight:700}}>ðŸ©º</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:STATUTS[m.statut]?.bg,color:STATUTS[m.statut]?.c}}>{STATUTS[m.statut]?.i} {STATUTS[m.statut]?.l}</span>
              {m.prix>0&&<div style={{fontSize:13,fontWeight:900,color:C.J,marginTop:2}}>{m.prix} â‚¬</div>}
            </div>
          </div>)}
        </div>}
      </div>;
    })}
  </div>;
}

function ViewParType({data,onSelect}){
  const [openType,setOpenType]=useState(null);
  // DÃ©finition des types
  const types=[
    {id:"renouv",l:"ðŸ”„ Renouvellements",filter:d=>d.typeLicence==="renouvellement"&&!d.dirigeantArbitre&&d.categorie!=="Dirigeant"},
    {id:"nouv",l:"âœ¨ Nouvelles licences",filter:d=>d.typeLicence==="nouvelle"&&!d.dirigeantArbitre&&d.categorie!=="Dirigeant"},
    {id:"famille",l:"ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Inscriptions famille",filter:d=>(d.freresSoeurs?.length||0)+(d.adultesFamille?.length||0)>0},
    {id:"dirigeants",l:"ðŸŽ½ Dirigeants",filter:d=>d.categorie==="Dirigeant"},
    {id:"arbitres",l:"ðŸŸ¨ Arbitres",filter:d=>d.dirigeantArbitre},
    {id:"jeunes",l:"ðŸ‘¶ Jeunes (Babyfoot â†’ U10-U11)",filter:d=>["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(d.categorie)},
    {id:"ados",l:"ðŸ§’ Ados (U12-U13 â†’ U16-U17-U18)",filter:d=>["U12-U13","U14-U15","U16-U17-U18"].includes(d.categorie)},
    {id:"adultes",l:"ðŸ§‘ Adultes (Senior + VÃ©tÃ©ran)",filter:d=>["Senior","VÃ©tÃ©ran"].includes(d.categorie)},
    {id:"feminines",l:"â™€ï¸ FÃ©minines",filter:d=>d.sexe==="FÃ©minin"},
    {id:"masculins",l:"â™‚ï¸ Masculins",filter:d=>d.sexe==="Masculin"},
    {id:"certifReq",l:"ðŸ©º Certif mÃ©dical requis",filter:d=>d.certifNeeded},
    {id:"echeances",l:"ðŸ“ Paiement fractionnÃ©",filter:d=>d.nbFois>1},
  ];

  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:14,color:"#854d0e",margin:"0 0 4px"}}>ðŸ“Š PrÃ©inscriptions par type</p>
      <p style={{fontSize:12,color:"#92400e",margin:0}}>Vues thÃ©matiques : nouvelles licences, familles, arbitres, certifs, etc.</p>
    </div>
    {types.map(t=>{
      const grp=data.filter(t.filter);
      if(!grp.length)return null;
      const isOpen=openType===t.id;
      const ca=grp.reduce((s,d)=>s+(d.prixFinal||0),0);
      return<div key={t.id} style={{background:C.W,borderRadius:10,marginBottom:8,overflow:"hidden",border:`1px solid ${C.Gb}`}}>
        <button onClick={()=>setOpenType(isOpen?null:t.id)} style={{width:"100%",background:isOpen?C.Jp:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontWeight:700,fontSize:14}}>{t.l}</span>
            <span style={{fontSize:18,fontWeight:900,color:C.J}}>{grp.length}</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {ca>0&&<span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:5,fontSize:11,fontWeight:700}}>{ca} â‚¬</span>}
            <span style={{color:C.G,fontSize:14,transform:isOpen?"rotate(180deg)":"none",transition:"transform .15s"}}>â–¼</span>
          </div>
        </button>
        {isOpen&&<div style={{padding:"4px 14px 14px"}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            <button onClick={()=>{
              const emails=[...new Set(grp.map(d=>getEmailContact(d)).filter(Boolean))];
              if(!emails.length){alert("Aucun email");return;}
              navigator.clipboard.writeText(emails.join("; "));
              alert(`âœ… ${emails.length} email(s) copiÃ©(s)`);
            }} style={{...BS,fontSize:11,padding:"6px 10px",minHeight:32}}>ðŸ“§ Copier emails</button>
          </div>
          {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=><div key={d.id} onClick={()=>onSelect(d)} style={{cursor:"pointer",background:C.Gc,borderRadius:8,padding:"8px 10px",marginBottom:4,borderLeft:`3px solid ${STATUTS[d.statut]?.c||C.G}`,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{d.prenom} {d.nom}</div>
              <div style={{fontSize:11,color:C.G,marginTop:2}}>
                <span style={{background:C.N,color:C.J,padding:"1px 5px",borderRadius:3,fontWeight:700,marginRight:4}}>{d.categorie}</span>
                {d.dateNaissance&&<span>{fmtD(d.dateNaissance)}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:5,background:STATUTS[d.statut]?.bg,color:STATUTS[d.statut]?.c}}>{STATUTS[d.statut]?.i}</span>
              {d.prixFinal>0&&<div style={{fontSize:12,fontWeight:900,color:C.J,marginTop:2}}>{d.prixFinal} â‚¬</div>}
            </div>
          </div>)}
        </div>}
      </div>;
    })}
  </div>;
}

function ViewFamilles({data,onSelect}){
  const familles=data.filter(d=>countMembres(d)>1);
  return<div>
    <div style={{background:"#ecfdf5",border:"1px solid #86efac",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:900,fontSize:14,color:C.V,margin:"0 0 4px"}}>Vue familles</p>
      <p style={{fontSize:12,color:C.V,margin:0}}>Une ligne par dossier famille, avec tous les membres inscrits dedans. Cliquez sur une famille pour ouvrir le dossier complet.</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginBottom:12}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.N}}>{familles.length}</div><div style={{fontSize:11,color:C.G}}>Dossiers famille</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.B}}>{familles.reduce((s,d)=>s+countMembres(d),0)}</div><div style={{fontSize:11,color:C.G}}>Membres famille</div></div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:C.Jd}}>{familles.reduce((s,d)=>s+calcTotalDossier(d),0)} EUR</div><div style={{fontSize:11,color:C.G}}>Montant dossiers</div></div>
    </div>
    {familles.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun dossier famille pour le moment.</p>}
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
          {membres.map(m=><div key={`${m.dossierId}-${m.idx}`} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"8px 9px"}}>
            <div style={{fontWeight:900,fontSize:13}}>{m.prenom} {m.nom}</div>
            <div style={{fontSize:11,color:C.G,marginTop:2}}>{m.categorie} - {m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle licence"} - {m.role}</div>
          </div>)}
        </div>
      </div>;
    })}
  </div>;
}

function ViewMutations({data,onSelect}){
  const joueurs=data.filter(d=>d.typeLicence==="nouvelle"&&(d.aJoueAutreClub||d.ancienClub));
  const parStatut={
    attente:joueurs.filter(d=>d.statut==="attente").length,
    valide:joueurs.filter(d=>d.statut==="valide"||d.statut==="paye").length,
    incomplet:joueurs.filter(d=>d.statut==="incomplet").length,
  };
  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:14,color:"#854d0e",margin:"0 0 4px"}}>ðŸ” Suivi des joueurs mutÃ©s / retours</p>
      <p style={{fontSize:12,color:"#92400e",margin:0}}>Nouvelles licences ayant jouÃ© dans un autre club la saison prÃ©cÃ©dente, Ã  suivre pour les rÃ¨gles de mutation.</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
      {Object.entries(parStatut).map(([k,v])=><div key={k} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px",textAlign:"center"}}>
        <div style={{fontWeight:900,fontSize:20,color:STATUTS[k]?.c||C.N}}>{v}</div>
        <div style={{fontSize:10,color:C.G}}>{STATUTS[k]?.l||k}</div>
      </div>)}
    </div>
    {joueurs.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun joueur mutÃ© / retour dÃ©clarÃ©.</p>}
    {joueurs.map(e=><div key={e.id} onClick={()=>onSelect(e)} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div>
          <strong>{e.prenom} {e.nom}</strong>
          <span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
      </div>
      <div style={{fontSize:12,color:C.G,marginTop:6}}>Ancien club : <strong>{e.ancienClub||"Ã  prÃ©ciser"}</strong></div>
      {e.mutationNotes&&<div style={{fontSize:12,color:"#92400e",marginTop:4}}>Note mutation : {e.mutationNotes}</div>}
      <div style={{fontSize:12,color:C.G,marginTop:4}}>Contact : {getEmailContact(e)||getTelContact(e)||"â€”"}</div>
    </div>)}
  </div>;
}

/* â•â• NON PRÃ‰INSCRITS â€” qui de la saison N-1 manque Ã  l'appel ? â•â•â•â• */
function NonPreinscrits({licencies,data,saison}){
  const [filtre,setFiltre]=useState("tous");
  const [srch,setSrch]=useState("");
  const [exporting,setExporting]=useState(false);
  const [vue,setVue]=useState("manquants");

  // Construire un set des noms+prenoms dÃ©jÃ  prÃ©inscrits (sans accents, en minuscules)
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

  // Trouver les licenciÃ©s saison N-1 qui ne sont pas dans les prÃ©inscriptions
  const manquants=licencies.filter(l=>{
    const nom=l.n||l.nom||"";
    const prenom=l.p||l.prenom||"";
    if(!nom&&!prenom)return false;
    return !findPreinscrit(l);
  });
  const renouveles=licencies.map(l=>({...l,_preinscrit:findPreinscrit(l)})).filter(l=>l._preinscrit);
  const dossiersRenouveles=new Set(renouveles.map(l=>l._preinscrit?.entry?.id).filter(Boolean)).size;
  const activeList=vue==="renouveles"?renouveles:manquants;

  // Filtrage par catÃ©gorie
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
    alert(`âœ… ${e.length} email(s) copiÃ©(s)`);
  };

  const doExport=async()=>{
    setExporting(true);
    try{
      const rows=manquants.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.tl||"",l.dn?fmtD(l.dn):"",l.s||"",getEmail(l),l.tel||l.tel2||"",l.rl||""]);
      await exportXLSX([{name:`Non preinscrits ${saison}`,rows:[["Nom","PrÃ©nom","NÂ° Licence","CatÃ©gorie","Type","NÃ©(e) le","Sexe","Email","TÃ©lÃ©phone","Repr. lÃ©gal"],...rows]}],`RSG_NonPreinscrits_${saison}.xlsx`);
    }catch(e){alert("Erreur : "+e.message);}
    setExporting(false);
  };

  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:"#92400e",margin:"0 0 4px"}}>ðŸ” LicenciÃ©s non encore prÃ©inscrits pour {saison}</p>
      <p style={{fontSize:13,color:"#78350f",margin:0,lineHeight:1.5}}>
        Comparaison entre la base Footclubs (saison passÃ©e) et les prÃ©inscriptions reÃ§ues pour {saison}.<br/>
        <strong>{manquants.length}</strong> licenciÃ©(s) de la saison passÃ©e ne sont pas encore retrouvÃ©s dans une prÃ©inscription (sur {licencies.length}). Ce compteur ne dÃ©pend pas du statut payÃ©/validÃ©.
      </p>
    </div>

    {/* Stats par catÃ©gorie */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
      <div style={{background:C.W,border:`2px solid ${C.R}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.R}}>{manquants.length}</div>
        <div style={{fontSize:11,color:C.G}}>ðŸ‘» Manquants</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{licencies.length-manquants.length}</div>
        <div style={{fontSize:11,color:C.G}}>âœ“ RetrouvÃ©s dans les prÃ©inscriptions</div>
      </div>
    </div>

    <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div>
          <p style={{fontWeight:900,fontSize:14,margin:"0 0 2px",color:C.V}}>RenouvelÃ©s retrouvÃ©s</p>
          <p style={{fontSize:12,color:C.G,margin:0}}>{renouveles.length} licenciÃ©(s) retrouvÃ©(s) dans {dossiersRenouveles} dossier(s) de prÃ©inscription.</p>
        </div>
        <button style={{...BS,fontSize:12,padding:"8px 12px",minHeight:36}} onClick={()=>{setFiltre("tous");setVue(v=>v==="renouveles"?"manquants":"renouveles");}}>
          {vue==="renouveles"?"Voir les manquants":"Voir les renouvelÃ©s"}
        </button>
      </div>
      {vue==="renouveles"&&<div>
        {renouveles.length===0&&<p style={{textAlign:"center",color:C.G,padding:16,fontStyle:"italic",margin:0}}>Aucun renouvelÃ© retrouvÃ©.</p>}
        {renouveles.map((l,i)=>{
          const p=l._preinscrit;
          const e=p?.entry||{};
          return <div key={`${l.l||l.numLicence||i}-${i}`} style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap",padding:"9px 0",borderTop:i===0?"none":`1px solid ${C.Gb}`}}>
            <div>
              <span style={{fontWeight:900}}>{l.p||l.prenom} {l.n||l.nom}</span>
              {(l.c||l.categorie)&&<span style={{marginLeft:8,background:"#dcfce7",color:C.V,padding:"1px 7px",borderRadius:5,fontSize:11,fontWeight:900}}>{l.c||l.categorie}</span>}
              <div style={{fontSize:12,color:C.G,marginTop:2}}>Dossier {e.id||"â€”"} Â· {p?.role||"PrÃ©inscrit"} Â· Statut : {STATUTS[e.statut]?.l||e.statut||"â€”"}</div>
            </div>
            <div style={{fontSize:12,color:C.G,fontWeight:800}}>{e.prenom||""} {e.nom||""}</div>
          </div>;
        })}
      </div>}
    </div>

    {/* Actions */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>copyEmails("all")} disabled={!emails.length}>ðŸ“§ Copier {emails.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!manquants.length}>{exporting?"â€¦":"ðŸ“Š Export Excel"}</button>
    </div>

    {/* Filtre par catÃ©gorie */}
    <div style={{marginBottom:10}}>
      <select style={{...inp(),fontSize:14,marginBottom:8}} value={filtre} onChange={e=>setFiltre(e.target.value)}>
        <option value="tous">Toutes catÃ©gories ({activeList.length})</option>
        {cats.map(c=>{const n=activeList.filter(l=>(l.c||l.categorie)===c).length;return<option key={c} value={c}>{c} ({n})</option>;})}
      </select>
      {filtre!=="tous"&&emailsCat.length>0&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}} onClick={()=>copyEmails("cat")}>ðŸ“§ Copier les {emailsCat.length} emails de la catÃ©gorie {filtre}</button>}
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`ðŸ” Rechercher dans ${liste.length}â€¦`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {liste.length} affichÃ©(s)</p>
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
          {req===true&&<span style={{marginLeft:6,background:"#fee2e2",color:C.R,padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700}}>ðŸ©º</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3}}>
            {l.dn&&<span>NÃ©(e) {fmtD(l.dn)} Â· </span>}
            {email&&<span>ðŸ“§ {email} Â· </span>}
            {(l.tel||l.tel2)&&<span>ðŸ“± {l.tel||l.tel2}</span>}
          </div>
        </div>
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>navigator.clipboard.writeText(email)}>ðŸ“‹</button>}
      </div>;
    })}
  </div>;
}

/* â•â• PERMANENCE â€” Interface bÃ©nÃ©voles â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Permanence({saison,tarifs}){
  const [data,setData]=useState([]);
  const [search,setSearch]=useState("");
  const [openId,setOpenId]=useState(null);
  const [fbStatus,setFbStatus]=useState("connecting");
  const [filtre,setFiltre]=useState("attente"); // attente | tous
  const [vue,setVue]=useState("liste"); // liste | categories

  useEffect(()=>{
    stGet(keyIns(saison)).then(d=>{if(Array.isArray(d))setData(sortInscriptions(d));});
    if(!isFirebaseAvailable()){
      setFbStatus("offline");
      return;
    }
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      const sorted=sortInscriptions(fbData);
      setData(sorted);
      stSet(keyIns(saison),sorted);
    },()=>{
      setFbStatus("offline");
      stGet(keyIns(saison)).then(d=>setData(sortInscriptions(d)));
    });
    return ()=>unsub&&unsub();
  },[saison]);

  useEffect(()=>{
    const key=keyIns(saison);
    const sync=async(ev)=>{
      if(ev?.key&&ev.key!==key)return;
      if(ev?.detail?.key&&ev.detail.key!==key)return;
      const d=await stGet(key);
      if(Array.isArray(d))setData(sortInscriptions(d));
    };
    window.addEventListener("storage",sync);
    window.addEventListener("rsg-storage",sync);
    return()=>{window.removeEventListener("storage",sync);window.removeEventListener("rsg-storage",sync);};
  },[saison]);

  const upd=async(id,patch)=>{
    const d=data.map(e=>{
      if(e.id!==id)return e;
      const next={...e,...patch};
      if(patch.statut==="valide"||patch.statut==="paye"){
        const achats=markBoutiqueAchatsRegles(next.achatsBoutique);
        if(achats!==next.achatsBoutique)return {...next,achatsBoutique:achats,boutiqueTotal:calcBoutiqueTotal(achats)};
      }
      return next;
    });
    setData(d);
    await stSet(keyIns(saison),d);
    const u=d.find(e=>e.id===id);
    if(isFirebaseAvailable()&&u){try{await fbSaveInscription(saison,u);}catch(e){console.error(e);}}
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
  filtered.forEach(d=>{const cat=d.categorie||"?";if(!groupes[cat])groupes[cat]=[];groupes[cat].push(d);});

  return<div style={{maxWidth:1180,margin:"0 auto",padding:"12px 14px 80px"}}>
    {/* Indicateur Firebase */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 12px",marginBottom:10,background:fbStatus==="online"?"#dcfce7":fbStatus==="connecting"?"#fef9c3":"#fee2e2",border:`1px solid ${fbStatus==="online"?"#86efac":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,borderRadius:8,fontSize:12,color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R}}>
      <strong>{fbStatus==="online"?"â˜ï¸ Synchronisation active":fbStatus==="connecting"?"Connexionâ€¦":"âš ï¸ Hors-ligne"}</strong>
      <span style={{fontSize:11,color:"#6b7280"}}>{filtered.length} dossier(s)</span>
    </div>

    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      <div style={{background:C.W,border:`2px solid ${C.J}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>{aTraiter}</div>
        <div style={{fontSize:11,color:C.G}}>â³ Ã€ traiter</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{valides}</div>
        <div style={{fontSize:11,color:C.G}}>âœ“ ValidÃ©s</div>
      </div>
      <div style={{background:C.N,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:22,fontWeight:900,color:C.J}}>{encaisse} â‚¬</div>
        <div style={{fontSize:11,color:"#9ca3af"}}>ðŸ’µ EncaissÃ©</div>
      </div>
    </div>

    {/* Filtres */}
    <div style={{display:"flex",gap:6,marginBottom:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4}}>
      <button onClick={()=>setFiltre("attente")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="attente"?C.J:C.Gb}`,background:filtre==="attente"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        â³ Ã€ traiter ({aTraiter})
      </button>
      <button onClick={()=>setFiltre("tous")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="tous"?C.J:C.Gb}`,background:filtre==="tous"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        Tous ({data.length})
      </button>
    </div>

    <div style={{display:"flex",gap:6,marginBottom:10,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:4}}>
      <button onClick={()=>setVue("liste")} style={{flex:1,padding:"9px",border:`2px solid ${vue==="liste"?C.J:C.Gb}`,background:vue==="liste"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>Liste</button>
      <button onClick={()=>setVue("categories")} style={{flex:1,padding:"9px",border:`2px solid ${vue==="categories"?C.J:C.Gb}`,background:vue==="categories"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>Par catÃ©gorie</button>
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:15,marginBottom:12,minHeight:48}} placeholder="ðŸ” Rechercher par nom, prÃ©nom..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>

    {/* Liste */}
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucun dossier {filtre==="attente"?"en attente":""}</p>}
    {vue==="liste"&&filtered.map(e=><PermFiche key={e.id} e={e} open={false} onToggle={()=>setOpenId(e.id)} onUpd={upd} tarifs={tarifs}/>)}
    {vue==="categories"&&sortCats(Object.keys(groupes)).map(cat=><div key={cat} style={{background:C.W,borderRadius:10,marginBottom:10,border:`1px solid ${C.Gb}`,overflow:"hidden"}}>
      <div style={{background:C.N,color:C.J,padding:"10px 12px",fontWeight:900,fontSize:14,display:"flex",justifyContent:"space-between"}}><span>{cat}</span><span>{groupes[cat].length}</span></div>
      <div style={{padding:"8px 10px"}}>
        {groupes[cat].map(e=><PermFiche key={e.id} e={e} open={false} onToggle={()=>setOpenId(e.id)} onUpd={upd} tarifs={tarifs}/>)}
      </div>
    </div>)}
    {openId&&data.find(e=>e.id===openId)&&<DetailModal onClose={()=>setOpenId(null)}>
      <PermFiche e={data.find(e=>e.id===openId)} open={true} onToggle={()=>{}} onUpd={upd} tarifs={tarifs}/>
    </DetailModal>}
  </div>;
}

function PermFiche({e,open,onToggle,onUpd,tarifs}){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(e);
  useEffect(()=>{setDraft(e);setEditing(false);},[e.id,e]);
  const totalMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  const aDesMembres=totalMembres>1;
  const certifNeed=e.certifNeeded;
  const datesEch=e.datesEcheances;
  const echeances=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  const modeObj=MODES_PAIEMENT.find(m=>m.id===e.modePaiement);

  // Documents avec âœ“ ou â—‹ â€” k = clÃ© dans l'entry pour toggle
  const docs=getPieces(tarifs)
    .filter(p=>pieceVisible(p,e,certifNeed,aDesMembres))
    .map(p=>({l:p.label,k:p.id,ok:e[p.id]||e.piecesFournies?.[p.id],req:true}));
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);

  const action=async(patch)=>{
    await onUpd(e.id,patch);
  };
  const statusPatch=k=>k==="valide"?{statut:"valide",datePaiement:new Date().toISOString(),dateValidation:e.dateValidation||new Date().toISOString()}:k==="attente"?{statut:"attente",datePaiement:null,dateValidation:null}:{statut:k};
  const updDraft=(k,v)=>setDraft(p=>({...p,[k]:v}));
  const saveDraft=async()=>{
    const membres=[draft.categorie,...(draft.freresSoeurs||[]).map(m=>m.categorie),...(draft.adultesFamille||[]).map(m=>m.categorie)].filter(Boolean);
    const remises=getRemisesFamille(tarifs);
    let total=0;const detail=[];
    membres.forEach((cat,i)=>{const rang=i+1,base=tarifs?.[cat]||0,pct=rang>=4?(remises[4]||0):(remises[rang]||0),prix=Math.round(base*(1-pct/100));detail.push({categorie:cat,rang,base,pct,prix});total+=prix;});
    await onUpd(e.id,{...draft,prixFinal:total,detailPrix:detail,tarifBase:tarifs?.[draft.categorie]||0});
    setEditing(false);
  };

  return<div style={{background:C.W,borderRadius:10,marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",overflow:"hidden"}}>
    {/* Ligne principale (toujours visible) */}
    <div onClick={onToggle} style={{padding:"12px 14px",cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16}}>{e.prenom} {e.nom}</div>
          <div style={{fontSize:12,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{background:C.N,color:C.J,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
            {aDesMembres&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ {totalMembres} membres</span>}
            {certifNeed&&<span style={{background:"#fee2e2",color:C.R,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ©º</span>}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:C.J}}>{calcTotalDossier(e)} â‚¬</div>
          {boutiquePermTotal>0&&<div style={{fontSize:10,color:C.G}}>Licence {e.prixFinal} â‚¬ + boutique permanence {boutiquePermTotal} â‚¬</div>}
          {boutiqueSaisonTotal>0&&<div style={{fontSize:10,color:"#0369a1"}}>Commandes saison sÃ©parÃ©es {boutiqueSaisonTotal} â‚¬</div>}
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        </div>
      </div>
      <div onClick={ev=>ev.stopPropagation()} style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6,marginTop:10}}>
        {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>action(statusPatch(k))} style={{border:`2px solid ${active?v.c:C.Gb}`,background:active?v.bg:C.W,color:active?v.c:C.G,borderRadius:8,padding:"7px 5px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:44}}>{v.i} {v.l}{k==="valide"&&<span style={{display:"block",fontSize:9}}>payÃ©</span>}</button>;})}
      </div>
      <div style={{fontSize:10,color:C.G,marginTop:5,fontWeight:700}}>Enregistrement automatique au clic</div>
    </div>

    {/* DÃ©tail dÃ©pliable */}
    {open&&<div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.Gc}`}}>
      {/* Paiement dÃ©taillÃ© */}
      <div style={{background:C.N,borderRadius:8,padding:"10px 12px",marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
          <span style={{color:"#9ca3af"}}>Paiement</span>
          <span style={{color:C.W,fontWeight:700}}>{modeObj?.l||"â€”"}{e.nbFois>1?` Â· ${e.nbFois}Ã— versements`:""}</span>
        </div>
        {boutiquePermTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",borderTop:"1px solid #333",marginTop:4,paddingTop:6}}>
          <span style={{color:"#9ca3af"}}>Licence + boutique</span>
          <span style={{color:C.J,fontWeight:900}}>{e.prixFinal||0} â‚¬ + {boutiquePermTotal} â‚¬ = {calcTotalDossier(e)} â‚¬</span>
        </div>}
        {boutiqueSaisonTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",borderTop:"1px solid #333",marginTop:4,paddingTop:6}}>
          <span style={{color:"#9ca3af"}}>Commandes saison hors licence</span>
          <span style={{color:"#7dd3fc",fontWeight:900}}>{boutiqueSaisonTotal} â‚¬</span>
        </div>}
        {echeances&&datesEch&&<div style={{borderTop:"1px solid #333",paddingTop:6,marginTop:4}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
            <span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} {i+1} ({datesEch[i]?fmtD(datesEch[i]):"?"})</span>
            <span style={{color:C.J,fontWeight:700}}>{m} â‚¬</span>
          </div>)}
        </div>}
      </div>

      <BoutiqueAchats e={e} onUpd={onUpd} tarifs={tarifs}/>

      {/* CoordonnÃ©es */}
      <div style={{background:C.Gc,borderRadius:8,padding:"10px 12px",marginTop:8}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>Contact</p>
        <div style={{fontSize:13,lineHeight:1.6}}>
          <div>ðŸ“ {e.adresse}, {e.codePostal} {e.ville}</div>
          {e.isMajeur?<>
            <div>ðŸ“± <a href={`tel:${e.telephone}`}>{e.telephone}</a></div>
            <div>ðŸ“§ <a href={`mailto:${e.email}`}>{e.email}</a></div>
          </>:<>
            {(e.representants||[]).filter(r=>r.nom).map((r,i)=><div key={i} style={{padding:"4px 0"}}>
              <strong>{r.lien||"Resp."} :</strong> {r.prenom} {r.nom}<br/>
              ðŸ“± <a href={`tel:${r.tel}`}>{r.tel}</a> Â· ðŸ“§ <a href={`mailto:${r.email}`}>{r.email}</a>
            </div>)}
          </>}
        </div>
      </div>

      <div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <button onClick={()=>setEditing(v=>!v)} style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}}>{editing?"Fermer la modification":"âœï¸ Modifier les infos du membre"}</button>
        {editing&&<div style={{marginTop:10}}>
          <div style={G2}>
            <F label="NÂ° licence FFF"><input style={inp()} value={draft.numLicenceFFF||""} onChange={ev=>updDraft("numLicenceFFF",ev.target.value)}/></F>
            <F label="CatÃ©gorie"><select style={inp()} value={draft.categorie||""} onChange={ev=>updDraft("categorie",ev.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.v}</option>)}</select></F>
            <F label="Nom"><input style={inp()} value={draft.nom||""} onChange={ev=>updDraft("nom",ev.target.value.toUpperCase())}/></F>
            <F label="PrÃ©nom"><input style={inp()} value={draft.prenom||""} onChange={ev=>updDraft("prenom",ev.target.value)}/></F>
            <F label="Naissance"><input type="date" style={inp()} value={draft.dateNaissance||""} onChange={ev=>updDraft("dateNaissance",ev.target.value)}/></F>
            <F label="Sexe"><select style={inp()} value={draft.sexe||""} onChange={ev=>updDraft("sexe",ev.target.value)}><option value="">â€”</option><option>Masculin</option><option>FÃ©minin</option></select></F>
            <F label="NationalitÃ©"><select style={inp()} value={draft.nationalite||""} onChange={ev=>updDraft("nationalite",ev.target.value)}>{NATS.map(n=><option key={n}>{n}</option>)}</select></F>
            <F label="TÃ©lÃ©phone"><input style={inp()} value={draft.telephone||""} onChange={ev=>updDraft("telephone",ev.target.value)}/></F>
            <F label="Email" span><input style={inp()} value={draft.email||""} onChange={ev=>updDraft("email",ev.target.value)}/></F>
            <F label="Adresse" span><input style={inp()} value={draft.adresse||""} onChange={ev=>updDraft("adresse",ev.target.value)}/></F>
            <F label="Code postal"><input style={inp()} value={draft.codePostal||""} onChange={ev=>updDraft("codePostal",ev.target.value)}/></F>
            <F label="Ville"><input style={inp()} value={draft.ville||""} onChange={ev=>updDraft("ville",ev.target.value)}/></F>
            <F label="Mode paiement"><select style={inp()} value={draft.modePaiement||""} onChange={ev=>updDraft("modePaiement",ev.target.value)}><option value="">â€”</option>{MODES_PAIEMENT.map(m=><option key={m.id} value={m.id}>{m.l}</option>)}</select></F>
            <F label="Nb fois"><select style={inp()} value={draft.nbFois||1} onChange={ev=>updDraft("nbFois",parseInt(ev.target.value))}><option value={1}>1Ã—</option><option value={2}>2Ã—</option><option value={3}>3Ã—</option><option value={4}>4Ã—</option></select></F>
            <F label="Short"><select style={inp()} value={draft.tailleShort||""} onChange={ev=>updDraft("tailleShort",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t}>{t}</option>)}</select></F>
            <F label="Chaussettes"><select style={inp()} value={draft.tailleChaussettes||""} onChange={ev=>updDraft("tailleChaussettes",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t}>{t}</option>)}</select></F>
          </div>
          {draft.nbFois>1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Array.from({length:draft.nbFois},(_,i)=><F key={i} label={`Encaissement ${i+1}`}><input type="date" style={inp()} value={draft.datesEcheances?.[i]||""} onChange={ev=>updDraft("datesEcheances",Array.from({length:draft.nbFois},(_,j)=>j===i?ev.target.value:(draft.datesEcheances?.[j]||"")))}/></F>)}
          </div>}
          <button onClick={saveDraft} style={{...BP,width:"100%",marginTop:6,fontSize:13}}>ðŸ’¾ Enregistrer les infos</button>
        </div>}
      </div>

      {/* Documents â€” cochables directement */}
      <div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 8px",textTransform:"uppercase"}}>ðŸ“ Documents fournis (cliquez pour cocher)</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {docs.map((d,i)=><button key={i} onClick={ev=>{ev.stopPropagation();action({[d.k]:!d.ok,piecesFournies:{...(e.piecesFournies||{}),[d.k]:!d.ok}});}} style={{background:d.ok?"#dcfce7":d.req?"#fee2e2":C.Gc,color:d.ok?C.V:d.req?C.R:C.G,padding:"6px 10px",borderRadius:6,fontSize:12,fontWeight:700,border:"none",cursor:"pointer",minHeight:32}}>
            {d.ok?"âœ“":"â—‹"} {d.l}
          </button>)}
        </div>
      </div>

      {/* Membres famille (rapide) */}
      {aDesMembres&&<div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Famille</p>
        {(e.freresSoeurs||[]).map((m,i)=><div key={i} style={{fontSize:12,padding:"2px 0"}}>ðŸ‘¶ {m.prenom} {m.nom} â€” {m.categorie}</div>)}
        {(e.adultesFamille||[]).map((m,i)=><div key={i} style={{fontSize:12,padding:"2px 0"}}>ðŸ§‘ {m.prenom} {m.nom} â€” {m.categorie}</div>)}
      </div>}

      {/* Allergies */}
      {e.allergiesAsthme&&<div style={{background:"#fffbeb",borderRadius:8,padding:"8px 12px",marginTop:8,border:"1px solid #fcd34d",fontSize:12}}>
        <strong>ðŸŒ¿ Allergies/asthme :</strong> {e.allergiesAsthme}
      </div>}

      {e.commentaire&&<div style={{background:"#dbeafe",borderRadius:8,padding:"8px 12px",marginTop:8,border:"1px solid #93c5fd",fontSize:12}}>
        <strong>ðŸ’¬ Message :</strong> {e.commentaire}
      </div>}

      {/* Notes secrÃ©tariat â€” Ã©ditables */}
      <PermNotes e={e} onUpd={onUpd}/>

      <div style={{marginTop:14,background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px"}}>
        <p style={{fontSize:11,fontWeight:900,color:C.G,margin:"0 0 8px",textTransform:"uppercase"}}>Statut du dossier</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
          {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>action(statusPatch(k))} style={{padding:"10px 6px",background:active?v.bg:"#fff",color:active?v.c:C.G,border:`2px solid ${active?v.c:C.Gb}`,borderRadius:10,fontWeight:900,fontSize:12,cursor:"pointer",minHeight:58}}>
            <span style={{display:"block",fontSize:18}}>{v.i}</span>{v.l}{k==="valide"&&<span style={{display:"block",fontSize:10}}>payÃ©</span>}
          </button>;})}
        </div>
      </div>
      {(e.statut==="paye"||e.statut==="valide")&&<div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={()=>printAttestation(e)} style={{...BS,flex:1,fontSize:12}}>ðŸ“„ Attestation</button>
        <button onClick={()=>prepareAttestationEmail(e)} style={{...BS,flex:1,fontSize:12}}>ðŸ“§ Email</button>
      </div>}
      <button onClick={()=>printFiche(e)} style={{...BS,width:"100%",marginTop:8,fontSize:13}}>ðŸ–¨ Imprimer fiche complÃ¨te</button>
    </div>}
  </div>;
}

function BoutiquePilotage({rows,allRows,stats,articles,search,setSearch,statut,setStatut,categorie,setCategorie,article,setArticle,categories,onUpdate,onSelect,onExport,exporting}){
  const [open,setOpen]=useState(null);
  const totalFiltered=rows.reduce((s,{achat:a})=>s+(a.total||((a.quantite||1)*(a.prix||0))),0);
  const byArticle={};
  const byPlayerCat={};
  allRows.forEach(({achat:a})=>{const k=a.articleId||a.nom;if(!byArticle[k])byArticle[k]={nom:a.nom,categorie:getAchatCategorie(a,articles),qte:0,total:0};byArticle[k].qte+=(parseInt(a.quantite)||1);byArticle[k].total+=(a.total||((a.quantite||1)*(a.prix||0)));});
  allRows.forEach(({entry:e,achat:a})=>{
    const k=e.categorie||"Sans catÃ©gorie";
    if(!byPlayerCat[k])byPlayerCat[k]={categorie:k,lignes:0,qte:0,total:0,aRegler:0};
    byPlayerCat[k].lignes+=1;
    byPlayerCat[k].qte+=(parseInt(a.quantite)||1);
    byPlayerCat[k].total+=(a.total||((a.quantite||1)*(a.prix||0)));
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
  return<div style={{marginTop:18}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
      {[{l:"Lignes",v:stats.total,c:C.N},{l:"Montant",v:`${stats.montant} â‚¬`,c:C.Jd},{l:"Ã€ rÃ©gler",v:stats.aRegler,c:"#ca8a04"},{l:"Ã€ livrer",v:stats.aLivrer,c:"#0891b2"}].map(s=><div key={s.l} style={{background:C.W,border:`1.5px solid ${s.c}44`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:C.G}}>{s.l}</div>
      </div>)}
    </div>
    <div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 10px"}}>Pilotage boutique</p>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <input style={{...inp(),fontSize:13}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher personne, article, taille..."/>
        <select style={{...inp(),fontSize:13}} value={statut} onChange={e=>setStatut(e.target.value)}><option value="tous">Tous statuts</option>{Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
        <select style={{...inp(),fontSize:13}} value={categorie} onChange={e=>setCategorie(e.target.value)}><option value="tous">Toutes catÃ©gories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select style={{...inp(),fontSize:13}} value={article} onChange={e=>setArticle(e.target.value)}><option value="tous">Tous articles</option>{articles.map(a=><option key={a.id} value={a.id}>{a.nom}</option>)}</select>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button style={{...BS,fontSize:12,padding:"8px 12px"}} onClick={onExport} disabled={exporting}>{exporting?"Export...":"ðŸ“Š Export boutique"}</button>
        <span style={{fontSize:12,color:C.G}}>{rows.length} ligne(s) affichÃ©e(s) Â· {totalFiltered} â‚¬</span>
      </div>
    </div>
    {Object.values(byArticle).length>0&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 8px"}}>SynthÃ¨se articles</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.values(byArticle).map(a=><span key={a.nom} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:7,padding:"6px 9px",fontSize:12,fontWeight:700}}>{a.categorie} Â· {a.nom} Â· {a.qte} Â· {a.total} â‚¬</span>)}</div>
    </div>}
    {Object.values(byPlayerCat).length>0&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:12}}>
      <p style={{fontWeight:800,fontSize:13,margin:"0 0 8px"}}>Commandes par catÃ©gorie de joueurs</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
        {Object.values(byPlayerCat).sort((a,b)=>catRank(a.categorie)-catRank(b.categorie)||a.categorie.localeCompare(b.categorie)).map(c=><div key={c.categorie} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontWeight:900,color:C.N,fontSize:13}}>{c.categorie}</div>
          <div style={{fontSize:12,color:C.G,marginTop:3}}>{c.qte} article(s) Â· {c.total} â‚¬</div>
          {c.aRegler>0&&<div style={{fontSize:11,color:"#ca8a04",fontWeight:800,marginTop:3}}>{c.aRegler} Ã  rÃ©gler</div>}
        </div>)}
      </div>
    </div>}
    <div style={{background:C.W,borderRadius:10,border:`1px solid ${C.Gb}`,overflow:"hidden"}}>
      {rows.length===0&&<p style={{fontSize:13,color:C.G,padding:16,margin:0}}>Aucun achat boutique pour ces filtres.</p>}
      {rows.map(({entry:e,achat:a})=>{const st=STATUTS_BOUTIQUE[a.statut||"a_regler"]||STATUTS_BOUTIQUE.a_regler;const isOpen=open===a.id;return <div key={`${e.id}-${a.id}`} style={{borderBottom:`1px solid ${C.Gc}`}}>
        <div style={{display:"grid",gridTemplateColumns:"auto 1.2fr .9fr auto",gap:10,alignItems:"center",padding:"10px 12px"}}>
          {a.imageBase64?<img src={a.imageBase64} alt={a.nom} style={{width:46,height:46,objectFit:"cover",borderRadius:7,border:`1px solid ${C.Gb}`}}/>:<div style={{width:46,height:46,borderRadius:7,background:C.Gc,display:"flex",alignItems:"center",justifyContent:"center"}}>ðŸ›ï¸</div>}
          <div style={{minWidth:0}}><div style={{fontWeight:900,fontSize:13}}>{a.nom} {a.taille?`Â· ${a.taille}`:""}</div><div style={{fontSize:12,color:C.G}}>{getAchatCategorie(a,articles)} Â· {a.quantite||1} Ã— {a.prix||0} â‚¬ = <strong>{a.total||((a.quantite||1)*(a.prix||0))} â‚¬</strong></div></div>
          <button onClick={()=>onSelect(e)} style={{background:"transparent",border:"none",textAlign:"left",cursor:"pointer",padding:0}}><div style={{fontWeight:800,fontSize:13,color:C.N}}>{e.prenom} {e.nom}</div><div style={{fontSize:11,color:C.G}}>{e.categorie} Â· {getTelContact(e)||getEmailContact(e)||e.id}</div></button>
          <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"flex-end",flexWrap:"wrap"}}>
            <select value={a.statut||"a_regler"} onChange={ev=>setStatus(e,a,ev.target.value)} style={{fontSize:11,border:`1px solid ${st.c}`,background:st.bg,color:st.c,borderRadius:6,padding:"5px 7px",fontWeight:800}}>{Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
            <button onClick={()=>setOpen(isOpen?null:a.id)} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 8px",fontSize:12,cursor:"pointer"}}>{isOpen?"â–²":"DÃ©tails"}</button>
          </div>
        </div>
        {isOpen&&<div style={{background:"#fafafa",padding:"10px 12px",borderTop:`1px solid ${C.Gc}`}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:8}}>
            <F label="Commande"><input type="date" style={inp()} value={(a.dateCommande||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateCommande:ev.target.value})}/></F>
            <F label="RÃ©ception"><input type="date" style={inp()} value={(a.dateReception||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateReception:ev.target.value})}/></F>
            <F label="Livraison"><input type="date" style={inp()} value={(a.dateLivraison||"").slice(0,10)} onChange={ev=>onUpdate(e.id,a.id,{dateLivraison:ev.target.value})}/></F>
            <F label="QuantitÃ©"><input type="number" min={1} style={inp()} value={a.quantite||1} onChange={ev=>{const q=Math.max(1,parseInt(ev.target.value)||1);onUpdate(e.id,a.id,{quantite:q,total:q*(a.prix||0)});}}/></F>
          </div>
          <F label="Note de suivi"><textarea style={{...inp(),height:58,resize:"vertical"}} value={a.note||""} onChange={ev=>onUpdate(e.id,a.id,{note:ev.target.value})} placeholder="Ex: taille Ã  confirmer, fournisseur relancÃ©, parent prÃ©venu..."/></F>
        </div>}
      </div>;})}
    </div>
  </div>;
}

function BoutiqueAchats({e,onUpd,tarifs}){
  const articles=getBoutique(tarifs).filter(a=>a.actif!==false);
  const categories=[...new Set(articles.map(a=>a.categorie||"Commande spÃ©ciale"))].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  const [categorie,setCategorie]=useState(categories[0]||"");
  const articlesCat=articles.filter(a=>(a.categorie||"Commande spÃ©ciale")===categorie);
  const [articleId,setArticleId]=useState(articlesCat[0]?.id||articles[0]?.id||"");
  const article=articles.find(a=>a.id===articleId)||articlesCat[0]||articles[0];
  const [taille,setTaille]=useState(article?.tailles?.[0]||"");
  const [quantite,setQuantite]=useState(1);
  const [contexte,setContexte]=useState((e.statut==="paye"||e.statut==="valide")?"saison":"permanence");
  useEffect(()=>{setCategorie(categories[0]||"");},[tarifs]);
  useEffect(()=>{setArticleId((articles.filter(a=>(a.categorie||"Commande spÃ©ciale")===categorie)[0]||articles[0])?.id||"");},[categorie,tarifs]);
  useEffect(()=>{setTaille(article?.tailles?.[0]||"");},[articleId,tarifs]);
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
    const ligne={id:`achat_${Date.now()}`,articleId:article.id,nom:article.nom,categorie:article.categorie||"Commande spÃ©ciale",taille,quantite:q,prix:article.prix||0,total:q*(article.prix||0),statut:"a_regler",contexte,date:new Date().toISOString()};
    ligne.imageBase64=article.imageBase64||"";
    await saveAchats([...achats,ligne]);
  };
  const updateAchat=(id,patch)=>saveAchats(achats.map(a=>a.id===id?{...a,...patch}:a));
  return<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",marginTop:8}}>
    <p style={{fontSize:11,fontWeight:800,color:"#92400e",margin:"0 0 8px",textTransform:"uppercase"}}>ðŸ›ï¸ Ajouter un achat boutique au dossier</p>
    {articles.length===0?<p style={{fontSize:12,color:"#92400e",margin:0}}>Aucun article actif configurÃ©.</p>:<>
      {article&&<div style={{display:"flex",gap:10,alignItems:"center",background:C.W,borderRadius:8,padding:"8px 10px",marginBottom:8,border:"1px solid #fcd34d"}}>
        {article.imageBase64?<img src={article.imageBase64} alt={article.nom} style={{width:54,height:54,objectFit:"cover",borderRadius:8,border:`1px solid ${C.Gb}`}}/>:<div style={{width:54,height:54,borderRadius:8,background:C.Gc,border:`1px dashed ${C.Gb}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>ðŸ›ï¸</div>}
        <div style={{minWidth:0}}>
          <div style={{fontWeight:800,fontSize:13,color:C.N}}>{article.nom}</div>
          <div style={{fontSize:11,color:C.G}}>{article.categorie||"Commande spÃ©ciale"}</div>
          <div style={{fontSize:12,color:"#92400e",fontWeight:700}}>{article.prix||0} â‚¬</div>
        </div>
      </div>}
      <F label="Type d'achat"><select style={{...inp(),fontSize:13}} value={contexte} onChange={ev=>setContexte(ev.target.value)}>
        <option value="permanence">Permanence licence : ajoutÃ© au rÃ¨glement licence + boutique</option>
        <option value="saison">Commande saison : rÃ¨glement sÃ©parÃ© de la licence</option>
      </select></F>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr .8fr .55fr",gap:6}}>
        <F label="CatÃ©gorie produit"><select style={{...inp(),fontSize:13}} value={categorie} onChange={ev=>setCategorie(ev.target.value)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></F>
        <F label="Article"><select style={{...inp(),fontSize:13}} value={articleId} onChange={ev=>setArticleId(ev.target.value)}>{(articlesCat.length?articlesCat:articles).map(a=><option key={a.id} value={a.id}>{a.nom} Â· {a.prix} â‚¬</option>)}</select></F>
        <F label="Taille / option"><select style={{...inp(),fontSize:13}} value={taille} onChange={ev=>setTaille(ev.target.value)}>{(article?.tailles||[""]).map(t=><option key={t} value={t}>{t||"Sans taille"}</option>)}</select></F>
        <F label="QtÃ©"><input type="number" min={1} style={{...inp(),fontSize:13}} value={quantite} onChange={ev=>setQuantite(ev.target.value)}/></F>
      </div>
      <button style={{...BP,width:"100%",fontSize:12,padding:"8px 12px",marginTop:8,minHeight:38}} onClick={add}>+ Ajouter au dossier</button>
    </>}
    {achats.length>0&&<div style={{marginTop:10,borderTop:"1px solid #fcd34d",paddingTop:8}}>
      {achats.map(a=>{const st=STATUTS_BOUTIQUE[a.statut||"a_regler"]||STATUTS_BOUTIQUE.a_regler;return <div key={a.id} style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"center",gap:8,fontSize:12,padding:"6px 0",borderBottom:`1px dashed #fcd34d`}}>
        {a.imageBase64&&<img src={a.imageBase64} alt={a.nom} style={{width:34,height:34,objectFit:"cover",borderRadius:6,border:`1px solid ${C.Gb}`,flexShrink:0}}/>}
        <div style={{minWidth:0}}>
          <div>{a.quantite}Ã— {a.nom}{a.taille?` (${a.taille})`:""} Â· {a.prix} â‚¬</div>
          <div style={{fontSize:11,color:C.G}}>{getAchatCategorie(a,articles)} Â· {isAchatSaison(a)?"Commande saison sÃ©parÃ©e":"Permanence licence"}</div>
          <select value={a.statut||"a_regler"} onChange={ev=>updateAchat(a.id,{statut:ev.target.value})} style={{marginTop:4,fontSize:11,border:`1px solid ${st.c}`,background:st.bg,color:st.c,borderRadius:5,padding:"3px 6px",fontWeight:700,maxWidth:"100%"}}>
            {Object.entries(STATUTS_BOUTIQUE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:900,color:"#92400e"}}>{a.total||a.quantite*a.prix} â‚¬</div>
          <button style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:5,padding:"3px 7px",fontSize:11,fontWeight:700,cursor:"pointer",marginTop:4}} onClick={()=>saveAchats(achats.filter(x=>x.id!==a.id))}>Ã—</button>
        </div>
      </div>;})}
      <div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:13,paddingTop:6,borderTop:"1px dashed #fcd34d",color:"#92400e"}}>
        <span>Boutique permanence licence</span><span>{total} â‚¬</span>
      </div>
      {totalSaison>0&&<div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:13,paddingTop:5,color:"#0369a1"}}>
        <span>Commandes saison sÃ©parÃ©es</span><span>{totalSaison} â‚¬</span>
      </div>}
    </div>}
  </div>;
}

// Notes Ã©ditables pour le mode Permanence
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
    <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>ðŸ“ Notes secrÃ©tariat / bÃ©nÃ©voles</p>
    <textarea style={{...inp(),height:60,resize:"vertical",fontSize:13}} value={note} onChange={ev=>{setNote(ev.target.value);setEdited(true);}} placeholder="Ex: chÃ¨que manquant, rappel parent, etc."/>
    {edited&&<button onClick={save} disabled={saving} style={{...BP,fontSize:12,padding:"6px 14px",marginTop:6,opacity:saving?.7:1}}>{saving?"Enregistrementâ€¦":"ðŸ’¾ Enregistrer"}</button>}
  </div>;
}

/* â•â• BASE LICENCIÃ‰S â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function BaseLicencies({saison,licencies,onSave}){
  const [msg,setMsg]=useState(null);
  const [srch,setSrch]=useState("");
  const [editIdx,setEI]=useState(null);
  const [editRow,setER]=useState(null);
  const fileRefCsv=useRef();
  const fileRefJson=useRef();

  // Parser CSV avec reconnaissance des nouvelles colonnes Footclubs
  const parseCSV=text=>{
    const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];
    const sep=lines[0].includes(";")?";":",";
    const headers=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/['"]/g,""));
    const idx={
      nom:headers.findIndex(h=>h==="nom"||(h.includes("nom")&&!h.includes("pre")&&!h.includes("prÃ©")&&!h.includes("club")&&!h.includes("cdg")&&!h.includes("repr"))),
      prenom:headers.findIndex(h=>h.includes("prenom")||h.includes("prÃ©nom")||h.includes("prÃ©n")),
      numLicence:headers.findIndex(h=>h.includes("numÃ©ro licence")||h.includes("numero licence")),
      validite:headers.findIndex(h=>h.includes("validitÃ© certif")||h.includes("validite certif")),
      anneeLastCertif:headers.findIndex(h=>!h.includes("validitÃ©")&&(h.includes("date certif")||h.includes("visite"))),
      categorie:headers.findIndex(h=>h.includes("sous catÃ©gorie")||h.includes("sous categorie")),
      naissance:headers.findIndex(h=>h.includes("nÃ©(e) le")||h.includes("ne(e) le")),
      sexe:headers.findIndex(h=>h==="sexe"),
      email:headers.findIndex(h=>h.includes("email principal")),
      tel:headers.findIndex(h=>h.includes("mobile personnel")),
      typeLic:headers.findIndex(h=>h.includes("type licence")),
      emailRl:headers.findIndex(h=>h.includes("email repr lÃ©gal 1")),
      telRl:headers.findIndex(h=>h.includes("tel mobile repr lÃ©gal 1")),
      nomRl:headers.findIndex(h=>h.includes("nom, prÃ©nom repr lÃ©gal 1")),
    };
    const mapCat=sc=>{
      if(!sc)return"";
      if(/dirigeant/i.test(sc))return"Dirigeant";
      if(/educateur|Ã©ducateur|rÃ©gional|regional/i.test(sc))return"Educateur";
      if(/senior/i.test(sc))return"Senior";
      if(/vÃ©tÃ©ran|veteran/i.test(sc))return"VÃ©tÃ©ran";
      const m=sc.match(/U(\d+)/i);
      if(m){const n=+m[1];if(n<=6)return"U5-U6";if(n<=8)return"U7-U8";if(n<=10)return"U9-U10";if(n<=12)return"U11-U12";if(n<=14)return"U13-U14";if(n<=16)return"U15-U16";if(n<=18)return"U17-U18";return"Senior";}
      return"";
    };
    return lines.slice(1).map(line=>{
      const cells=line.split(sep).map(c=>c.trim().replace(/^["']|["']$/g,""));
      const validite=idx.validite>=0?cells[idx.validite]:"";
      const sousCat=idx.categorie>=0?cells[idx.categorie]:"";
      const naissRaw=idx.naissance>=0?cells[idx.naissance]:"";
      let naissISO="";
      if(naissRaw){const m=naissRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);if(m)naissISO=`${m[3].padStart(4,"20")}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
      let cm=null;
      if(validite){if(/non\s*valide/i.test(validite))cm=true;else if(/valide/i.test(validite))cm=false;}
      return{
        n:idx.nom>=0?(cells[idx.nom]||"").toUpperCase():"",
        p:idx.prenom>=0?cells[idx.prenom]||"":"",
        l:idx.numLicence>=0?cells[idx.numLicence]||"":"",
        c:mapCat(sousCat),sc:sousCat,
        tl:idx.typeLic>=0?cells[idx.typeLic]||"":"",
        cm,dn:naissISO,
        s:idx.sexe>=0?cells[idx.sexe]||"":"",
        em:idx.email>=0?cells[idx.email]||"":"",
        tel:idx.tel>=0?cells[idx.tel]||"":"",
        em2:idx.emailRl>=0?cells[idx.emailRl]||"":"",
        tel2:idx.telRl>=0?cells[idx.telRl]||"":"",
        rl:idx.nomRl>=0?cells[idx.nomRl]||"":"",
      };
    }).filter(r=>r.n||r.p||r.l);
  };

  const handleFileCsv=file=>{
    if(!file)return;
    const r=new FileReader();
    r.onload=async ev=>{
      try{
        const rows=parseCSV(ev.target.result);
        if(!rows.length){setMsg({ok:false,txt:"Format CSV non reconnu."});return;}
        await onSave(rows);
        setMsg({ok:true,txt:`âœ… ${rows.length} licenciÃ©(s) importÃ©(s) depuis le CSV.`});
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
        if(!lics.length){setMsg({ok:false,txt:"Aucun licenciÃ© trouvÃ© dans le JSON."});return;}
        await onSave(lics);
        setMsg({ok:true,txt:`âœ… ${lics.length} licenciÃ©(s) importÃ©(s) depuis le JSON.`});
      }catch(e){setMsg({ok:false,txt:"Erreur JSON : "+e.message});}
    };
    r.readAsText(file,"UTF-8");
  };

  const addManuel=async()=>{
    const nom=prompt("Nom (majuscules) :");if(!nom)return;
    const prenom=prompt("PrÃ©nom :")||"";
    const num=prompt("NÂ° de licence FFF :")||"";
    const certifValide=prompt("Certif valide pour la prochaine saison ?\n  - 'oui' = pas de mÃ©decin\n  - 'non' = certif Ã  renouveler\n  - vide = inconnu");
    let cm=null;
    if(certifValide&&/^non/i.test(certifValide))cm=true;
    else if(certifValide&&/^oui/i.test(certifValide))cm=false;
    const cat=prompt("CatÃ©gorie (ex: U13-U14, Senior) :")||"";
    await onSave([...licencies,{n:nom.toUpperCase(),p:prenom,l:num,cm,c:cat,tl:"Libre"}]);
    setMsg({ok:true,txt:`âœ… ${nom} ${prenom} ajoutÃ©(e).`});
  };

  const filtered=srch.length>1?licencies.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""}`.toLowerCase().includes(srch.toLowerCase())):licencies;

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>ðŸ‘¥ Base des licenciÃ©s â€” Saison {saison}</p>
      <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.5}}>
        La base est chargÃ©e automatiquement depuis <code>licencies.json</code>.<br/>
        <strong>Pour mettre Ã  jour chaque saison</strong> : exportez Footclubs en CSV â†’ bouton <em>"Importer CSV Footclubs"</em>.<br/>
        Le champ <strong>"ValiditÃ© Certif MÃ©dic N+1"</strong> est automatiquement dÃ©tectÃ©.
      </p>
    </div>
    <input ref={fileRefCsv} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{handleFileCsv(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={fileRefJson} type="file" accept=".json" style={{display:"none"}} onChange={e=>{handleFileJson(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefCsv.current.click()}>ðŸ“¥ Importer CSV Footclubs</button>
      <button style={{...BS,flex:"1 1 130px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefJson.current.click()}>ðŸ“¥ Importer JSON</button>
      <button style={{...BS,flex:"1 1 100px",fontSize:13,padding:"10px 14px"}} onClick={addManuel}>ï¼‹ Ajouter</button>
      <button style={{...BS,flex:"1 1 130px",fontSize:13,padding:"10px 14px"}} onClick={()=>{
        const blob=new Blob([JSON.stringify({saison,dateExport:new Date().toISOString(),licencies},null,1)],{type:"application/json"});
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`licencies_${saison}.json`;a.click();URL.revokeObjectURL(url);
      }} disabled={!licencies.length}>ðŸ’¾ Exporter JSON</button>
    </div>
    {msg&&<div style={{background:msg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:msg.ok?C.V:C.R}}>{msg.txt}</div>}
    {licencies.length>0&&<input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`ðŸ” Rechercher parmi ${licencies.length} licenciÃ©sâ€¦`} value={srch} onChange={e=>setSrch(e.target.value)}/>}
    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {licencies.length} licenciÃ©(s)</p>
    {licencies.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucun licenciÃ© â€” importez le CSV Footclubs.</p>}
    {filtered.map((l,i)=>{
      const req=certifRequis(l);
      const realIdx=licencies.indexOf(l);
      if(editIdx===realIdx)return<div key={i} style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"12px",marginBottom:6}}>
        <div style={G2}>
          <div><label style={{...lbl,fontSize:11}}>Nom</label><input style={{...inp(),fontSize:13}} value={editRow.n||editRow.nom||""} onChange={e=>setER(p=>({...p,n:e.target.value.toUpperCase()}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>PrÃ©nom</label><input style={{...inp(),fontSize:13}} value={editRow.p||editRow.prenom||""} onChange={e=>setER(p=>({...p,p:e.target.value}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>NÂ° licence</label><input style={{...inp(),fontSize:13}} value={editRow.l||editRow.numLicence||""} onChange={e=>setER(p=>({...p,l:e.target.value}))}/></div>
          <div><label style={{...lbl,fontSize:11}}>Certif prochaine saison</label>
            <select style={{...inp(),fontSize:13}} value={editRow.cm===true?"oui":editRow.cm===false?"non":""} onChange={e=>{const v=e.target.value;setER(p=>({...p,cm:v==="oui"?true:v==="non"?false:null}));}}>
              <option value="">â€” Inconnu</option>
              <option value="oui">ðŸ©º Certif requis</option>
              <option value="non">âœ… Certif valide</option>
            </select>
          </div>
          <div><label style={{...lbl,fontSize:11}}>CatÃ©gorie</label><input style={{...inp(),fontSize:13}} value={editRow.c||editRow.categorie||""} onChange={e=>setER(p=>({...p,c:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button style={{...BP,fontSize:12,padding:"7px 14px"}} onClick={async()=>{const u=[...licencies];u[realIdx]=editRow;await onSave(u);setEI(null);}}>âœ“</button>
          <button style={{...BS,fontSize:12,padding:"7px 14px"}} onClick={()=>setEI(null)}>âœ•</button>
        </div>
      </div>;
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:4,borderLeft:`3px solid ${req===true?C.R:req===false?C.V:C.Gb}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontWeight:700,fontSize:14}}>{l.p||l.prenom} {l.n||l.nom}</span>
          {(l.c||l.categorie)&&<span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{l.c||l.categorie}</span>}
          {l.tl&&l.tl!=="Libre"&&<span style={{marginLeft:6,background:"#ede9fe",color:"#6d28d9",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:600}}>{l.tl}</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3}}>
            {(l.l||l.numLicence)&&<span>NÂ° {l.l||l.numLicence} Â· </span>}
            {l.dn&&<span>{fmtD(l.dn)} Â· </span>}
            <span style={{color:req===true?C.R:req===false?C.V:"#9ca3af",fontWeight:600}}>
              {req===true?"ðŸ©º Certif Ã  renouveler":req===false?"âœ… Certif valide":"â“"}
            </span>
          </div>
          {l.em&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,wordBreak:"break-all"}}>ðŸ“§ {l.em}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}} onClick={()=>{setEI(realIdx);setER({...l});}}>âœï¸</button>
          <button style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",color:C.R}} onClick={async()=>await onSave(licencies.filter((_,j)=>j!==realIdx))}>âœ•</button>
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

  // La colonne "ValiditÃ© Certif MÃ©dic N+1" de Footclubs concerne la saison sÃ©lectionnÃ©e elle-mÃªme
  // (les prÃ©inscriptions saisies pour la saison N portent sur la validitÃ© du certif pour cette saison N)
  const cible=saison;

  const all=licencies.filter(l=>l.tl!=="Dirigeant");
  const requis=all.filter(l=>certifRequis(l)===true);
  const valides=all.filter(l=>certifRequis(l)===false);

  const liste=filtre==="requis"?requis:filtre==="valides"?valides:all;
  const filtered=srch.length>1?liste.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""}`.toLowerCase().includes(srch.toLowerCase())):liste;

  const getEmail=l=>l.em||l.em2||"";
  const emailsRequis=[...new Set(requis.map(getEmail).filter(e=>e))];

  const copyAll=()=>{
    if(!emailsRequis.length){alert("Aucun email Ã  copier");return;}
    navigator.clipboard.writeText(emailsRequis.join("; "));
    alert(`âœ… ${emailsRequis.length} email(s) copiÃ©(s) dans le presse-papier`);
  };

  const doExport=async()=>{
    setExporting(true);
    try{
      const rows=requis.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.sc||"",l.dn?fmtD(l.dn):"",l.s||"",getEmail(l),l.tel||l.tel2||"",l.rl||""]);
      await exportXLSX([{name:`Certifs ${cible}`,rows:[["Nom","PrÃ©nom","NÂ° Licence","CatÃ©gorie","Sous-catÃ©gorie","NÃ©(e) le","Sexe","Email","TÃ©lÃ©phone","ReprÃ©sentant lÃ©gal"],...rows]}],`RSG_Certifs_${cible}.xlsx`);
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  return<div>
    <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:C.R,margin:"0 0 4px"}}>ðŸ©º Certificats mÃ©dicaux pour la saison {cible}</p>
      <p style={{fontSize:13,color:"#991b1b",margin:0,lineHeight:1.5}}>
        Liste basÃ©e sur la colonne <strong>"ValiditÃ© Certif MÃ©dic N+1"</strong> de Footclubs.<br/>
        Les joueurs marquÃ©s <strong>"Non valide"</strong> devront fournir un nouveau certificat mÃ©dical pour la saison {cible}.
      </p>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{background:C.W,border:`2px solid ${C.R}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.R}}>{requis.length}</div>
        <div style={{fontSize:11,color:C.G}}>ðŸ©º Ã€ renouveler</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.V}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.V}}>{valides.length}</div>
        <div style={{fontSize:11,color:C.G}}>âœ… Valides</div>
      </div>
      <div style={{background:C.W,border:`2px solid ${C.G}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.G}}>{all.length}</div>
        <div style={{fontSize:11,color:C.G}}>Total joueurs</div>
      </div>
    </div>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={copyAll} disabled={!emailsRequis.length}>ðŸ“§ Copier les {emailsRequis.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!requis.length}>{exporting?"â€¦":"ðŸ“Š Export Excel"}</button>
    </div>

    <div style={{display:"flex",gap:6,marginBottom:10}}>
      {[{id:"requis",l:`ðŸ©º Ã€ renouveler (${requis.length})`,c:C.R},{id:"valides",l:`âœ… Valides (${valides.length})`,c:C.V},{id:"tous",l:`Tous (${all.length})`,c:C.G}].map(o=>(
        <button key={o.id} onClick={()=>setFiltre(o.id)} style={{flex:"1 1 auto",padding:"8px 10px",border:`2px solid ${filtre===o.id?o.c:C.Gb}`,background:filtre===o.id?(o.c===C.R?"#fee2e2":o.c===C.V?"#dcfce7":C.Gc):"#fff",color:filtre===o.id?o.c:C.G,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>{o.l}</button>
      ))}
    </div>

    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`ðŸ” Rechercher parmi ${liste.length} licenciÃ©(s)â€¦`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {liste.length} affichÃ©(s)</p>
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun licenciÃ©</p>}
    {filtered.map((l,i)=>{
      const req=certifRequis(l);
      const email=getEmail(l);
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:6,borderLeft:`4px solid ${req===true?C.R:req===false?C.V:C.G}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span style={{fontWeight:700,fontSize:14}}>{l.p||l.prenom} {l.n||l.nom}</span>
          {(l.c||l.categorie)&&<span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{l.c||l.categorie}</span>}
          {l.dn&&<span style={{marginLeft:6,fontSize:11,color:C.G}}>Â· {fmtD(l.dn)}</span>}
          <div style={{fontSize:12,color:C.G,marginTop:3,wordBreak:"break-word"}}>
            {(l.l||l.numLicence)&&<span>NÂ° {l.l||l.numLicence}</span>}
            {email&&<span> Â· ðŸ“§ {email}</span>}
            {(l.tel||l.tel2)&&<span> Â· ðŸ“± {l.tel||l.tel2}</span>}
          </div>
          {l.rl&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ {l.rl}</div>}
        </div>
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>{navigator.clipboard.writeText(email);}}>ðŸ“‹ Copier</button>}
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
    <input style={inp(errA)} value={adresse} onChange={e=>onType(e.target.value)} onFocus={()=>results.length&&setOpen(true)} placeholder="Tapez votre adresse complÃ¨teâ€¦" autoComplete="off" autoCorrect="off" spellCheck={false}/>
    {errA&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>âš  {errA}</span>}
    {open&&results.length>0&&<div style={{background:C.W,border:`2px solid ${C.J}`,borderRadius:8,marginTop:4,overflow:"hidden",boxShadow:"0 4px 14px rgba(0,0,0,.12)"}}>
      {results.map((feat,i)=><div key={i} onMouseDown={e=>{e.preventDefault();pick(feat);}} onTouchEnd={e=>{e.preventDefault();pick(feat);}} style={{padding:"10px 12px",borderBottom:i<results.length-1?`1px solid ${C.Gc}`:"none",cursor:"pointer",background:C.W}} onMouseEnter={e=>e.currentTarget.style.background=C.Jp} onMouseLeave={e=>e.currentTarget.style.background=C.W}>
        <div style={{fontWeight:600,fontSize:14}}>{feat.properties.name}</div>
        <div style={{fontSize:12,color:C.G}}>{feat.properties.postcode} {feat.properties.city}</div>
      </div>)}
    </div>}
    <div style={{...G2,marginTop:8}}>
      <div><label style={lbl}>Code postal *</label><input style={inp(errCP)} value={cp} onChange={e=>onCP(e.target.value)} inputMode="numeric" maxLength={5} autoComplete="postal-code"/>{errCP&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>âš  {errCP}</span>}</div>
      <div><label style={lbl}>Ville *</label><input style={inp(errV)} value={ville} onChange={e=>onVille(e.target.value)} autoComplete="address-level2"/>{errV&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>âš  {errV}</span>}</div>
    </div>
  </div>;
}

/* â•â• PHOTO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PhotoInput({value,onChange}){
  const fRef=useRef(),cRef=useRef();
  const handle=file=>{if(!file)return;if(file.size>10*1024*1024){alert("Max 10 Mo");return;}const r=new FileReader();r.onload=ev=>onChange(ev.target.result);r.onerror=()=>alert("Erreur.");r.readAsDataURL(file);};
  if(value)return<div style={{display:"flex",gap:12,alignItems:"center"}}><img src={value} alt="Photo" style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/><div><p style={{fontSize:13,color:C.V,fontWeight:700,margin:"0 0 6px"}}>âœ“ Photo importÃ©e</p><button type="button" style={{fontSize:13,color:C.R,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>onChange("")}>Supprimer</button></div></div>;
  return<div>
    <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={cRef} type="file" accept="image/*" capture="user" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8}}>
      <button type="button" style={{...BS,flex:1,fontSize:13,padding:"10px 8px"}} onClick={()=>fRef.current.click()}>ðŸ–¼ Galerie</button>
      <button type="button" style={{...BP,flex:1,fontSize:13,padding:"10px 8px"}} onClick={()=>cRef.current.click()}>ðŸ“· CamÃ©ra</button>
    </div>
    <p style={{fontSize:11,color:C.G,marginTop:5}}>JPG, PNG â€” max 10 Mo</p>
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

function EntryCard({e,sel,onSel}){
  const isSel=sel?.id===e.id;
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const membres=membresDossier(e);
  return<div onClick={onSel} style={{background:isSel?C.Jp:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",transition:"background .1s"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <span style={{fontWeight:700,fontSize:15}}>{e.prenom} {e.nom}</span>
      <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:10,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c,flexShrink:0}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
    </div>
    <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
      <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 7px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"ðŸ”„ Renouv.":"âœ¨ Nouveau"}</span>
      {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ©º</span>}
      {e.prixFinal&&<span style={{background:"#f0fdf4",color:"#16a34a",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ’° {calcTotalDossier(e)} â‚¬{boutiquePermTotal>0?` dont boutique permanence ${boutiquePermTotal} â‚¬`:""}{e.nbFois>1?` (${e.nbFois}Ã—)`:""}</span>}
      {boutiqueSaisonTotal>0&&<span style={{background:"#e0f2fe",color:"#0369a1",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ›ï¸ Saison {boutiqueSaisonTotal} â‚¬ sÃ©parÃ©</span>}
      <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto"}}>{fmtD(e.datePreinscription)}</span>
    </div>
    {membres.length>1&&<div style={{marginTop:8,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px"}}>
      <div style={{fontSize:11,fontWeight:900,color:C.G,marginBottom:5}}>Famille - {membres.length} membres inscrits dans ce dossier</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
        {membres.map(m=><span key={`${m.dossierId}-${m.idx}`} style={{background:m.idx===0?C.N:"#fff",color:m.idx===0?C.J:C.N,border:`1px solid ${m.idx===0?C.N:C.Gb}`,borderRadius:6,padding:"3px 7px",fontSize:11,fontWeight:800}}>
          {m.prenom} {m.nom} - {m.categorie}
        </span>)}
      </div>
    </div>}
  </div>;
}

function DetailPanel({e,note,setNote,onUpd,onDel,onChangeStatut,tarifs,onClose}){
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(e);
  const [savingEdit,setSavingEdit]=useState(false);
  // Sections dÃ©pliables
  const [openSec,setOpenSec]=useState({contact:false,medical:false,equip:false,paiement:false,docs:false,famille:false});
  const togSec=k=>setOpenSec(p=>({...p,[k]:!p[k]}));

  const saveNote=async()=>{setSaving(true);await onUpd(e.id,{notes:note});setSaving(false);};
  const startEdit=()=>{setDraft({...e,representants:e.representants||(e.resp1Nom?[{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email}]:[{nom:"",prenom:"",lien:"",tel:"",email:""}]),freresSoeurs:e.freresSoeurs||[],adultesFamille:e.adultesFamille||[]});setEditing(true);setOpenSec({contact:true,medical:true,equip:true,paiement:true,docs:true,famille:true});};
  const cancelEdit=()=>{setEditing(false);setDraft(e);};
  const saveEdit=async()=>{
    setSavingEdit(true);
    // Recalcul prix si catÃ©gorie a changÃ©
    const tousMembres=[draft.categorie,...(draft.freresSoeurs||[]).map(m=>m.categorie),...(draft.adultesFamille||[]).map(m=>m.categorie)].filter(Boolean);
    const remises=getRemisesFamille(tarifs);
    const detail=[];let total=0;
    tousMembres.forEach((cat,i)=>{
      const rang=i+1;
      const base=tarifs?.[cat]||0;
      const pct=rang>=4?(remises[4]||0):(remises[rang]||0);
      const prix=Math.round(base*(1-pct/100));
      detail.push({categorie:cat,rang,base,pct,prix});
      total+=prix;
    });
    const updated={...draft,prixFinal:total,detailPrix:detail,tarifBase:tarifs?.[draft.categorie]||0};
    await onUpd(e.id,updated);
    setEditing(false);
    setSavingEdit(false);
  };
  const upd=(k,v)=>setDraft(p=>({...p,[k]:v}));
  const updRep=(i,k,v)=>{const r=[...(draft.representants||[])];r[i]={...r[i],[k]:v};upd("representants",r);};
  const addRep=()=>upd("representants",[...(draft.representants||[]),{nom:"",prenom:"",lien:"",tel:"",email:""}]);
  const delRep=i=>upd("representants",(draft.representants||[]).filter((_,j)=>j!==i));

  const r0=getResp1(e);
  const tousMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  const boutiquePermTotal=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaisonTotal=calcBoutiqueSaisonTotal(e.achatsBoutique);

  return<div style={{background:C.W,borderRadius:14,padding:"16px 14px",border:`2px solid ${C.J}`,boxShadow:"0 4px 16px rgba(245,200,0,.15)"}}>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <div style={{flex:1,minWidth:0}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:900,color:C.N}}>{e.prenom} {e.nom}</h2>
        <p style={{margin:"4px 0 0",fontSize:11,color:"#9ca3af"}}>{e.id} Â· {fmtDT(e.datePreinscription)} Â· {e.saison}</p>
        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
          <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 8px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"ðŸ”„ Renouv.":"âœ¨ Nouveau"}</span>
          {tousMembres>1&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Famille ({tousMembres})</span>}
          {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸ©º Certif requis</span>}
          {e.dirigeantArbitre&&<span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>ðŸŸ¨ Arbitre</span>}
        </div>
      </div>
      {e.photoBase64&&<img src={e.photoBase64} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/>}
    </div>

    {/* Bouton Modifier global */}
    {!editing&&<button onClick={startEdit} style={{...BP,fontSize:13,width:"100%",marginBottom:12}}>âœï¸ Tout modifier</button>}
    {editing&&<div style={{display:"flex",gap:8,marginBottom:12}}>
      <button style={{...BP,flex:1,fontSize:13,opacity:savingEdit?.7:1}} onClick={saveEdit} disabled={savingEdit}>{savingEdit?"Enregistrementâ€¦":"ðŸ’¾ Enregistrer modifs"}</button>
      <button style={{...BS,flex:"0 0 auto",fontSize:13}} onClick={cancelEdit}>Annuler</button>
    </div>}
      {(e.statut==="paye"||e.statut==="valide")&&<div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BS,flex:"1 1 160px",fontSize:12,padding:"8px 12px"}} onClick={()=>printAttestation(e)}>ðŸ“„ Attestation licence</button>
      <button style={{...BS,flex:"1 1 160px",fontSize:12,padding:"8px 12px"}} onClick={()=>prepareAttestationEmail(e)}>ðŸ“§ PrÃ©parer l'email</button>
    </div>}

    {/* Statut */}
    <div style={{marginBottom:12}}>
      <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.5}}>Statut Â· enregistrement automatique</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
        {STATUT_ORDER.map(k=>{const v=STATUTS[k];const active=(e.statut==="paye"&&k==="valide")||e.statut===k;return <button key={k} onClick={()=>onChangeStatut(e.id,k)} style={{border:`2px solid ${active?v.c:C.Gb}`,background:active?v.bg:"#fff",color:active?v.c:C.G,padding:"10px 8px",borderRadius:10,fontWeight:900,fontSize:13,cursor:"pointer",minHeight:58,boxShadow:active?`0 0 0 3px ${v.c}22`:"none"}}><span style={{display:"block",fontSize:18}}>{v.i}</span>{v.l}{k==="valide"&&<span style={{display:"block",fontSize:10,fontWeight:700,marginTop:2}}>payÃ©</span>}</button>;})}
      </div>
    </div>

    {/* CONTACT - section dÃ©pliable, Ã©ditable */}
    <SecBlock title="ðŸ“ž IdentitÃ© & Contact" open={openSec.contact||editing} onTog={()=>togSec("contact")}>
      {!editing?<div>
        <DR l="Naissance" v={`${fmtD(e.dateNaissance)}${e.lieuNaissance?" â€” "+e.lieuNaissance:""}`}/>
        <DR l="Sexe" v={e.sexe}/>
        <DR l="NationalitÃ©" v={e.nationalite}/>
        <DR l="Adresse" v={`${e.adresse}, ${e.codePostal} ${e.ville}`}/>
        {e.numLicenceFFF&&<DR l="NÂ° FFF" v={e.numLicenceFFF}/>}
        {e.ancienClub&&<DR l="Ancien club" v={e.ancienClub}/>}
        {e.aJoueAutreClub&&<DR l="Mutation" v={`Oui${e.mutationNotes?` â€” ${e.mutationNotes}`:""}`}/>}
        {e.poste&&<DR l="Poste" v={e.poste}/>}
        <DR l="TÃ©lÃ©phone" v={getTelContact(e)}/>
        <DR l="Email" v={getEmailContact(e)}/>
        {!e.isMajeur&&(e.representants||[]).filter(r=>r.nom).map((r,i)=><div key={i} style={{marginTop:6,paddingTop:6,borderTop:`1px dashed ${C.Gc}`}}>
          <DR l={`Resp. ${r.lien||""}`} v={`${r.prenom||""} ${r.nom||""}`}/>
          <DR l="TÃ©l" v={r.tel}/>
          <DR l="Email" v={r.email}/>
        </div>)}
      </div>:<div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Nom</label><input style={inp()} value={draft.nom||""} onChange={ev=>upd("nom",ev.target.value.toUpperCase())}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>PrÃ©nom</label><input style={inp()} value={draft.prenom||""} onChange={ev=>upd("prenom",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Naissance</label><input type="date" style={inp()} value={draft.dateNaissance||""} onChange={ev=>upd("dateNaissance",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Sexe</label><select style={inp()} value={draft.sexe||""} onChange={ev=>upd("sexe",ev.target.value)}><option>Masculin</option><option>FÃ©minin</option></select></div>
          <div style={{marginBottom:10}}><label style={lbl}>NationalitÃ©</label><select style={inp()} value={draft.nationalite||""} onChange={ev=>upd("nationalite",ev.target.value)}>{NATS.map(n=><option key={n}>{n}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>CatÃ©gorie</label><select style={inp()} value={draft.categorie||""} onChange={ev=>upd("categorie",ev.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.v}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Poste</label><select style={inp()} value={draft.poste||""} onChange={ev=>upd("poste",ev.target.value)}><option value="">â€”</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>NÂ° FFF</label><input style={inp()} value={draft.numLicenceFFF||""} onChange={ev=>upd("numLicenceFFF",ev.target.value)}/></div>
        </div>
        <Chk checked={draft.aJoueAutreClub} onChange={v=>upd("aJoueAutreClub",v)} label="A jouÃ© dans un autre club la saison derniÃ¨re"/>
        {draft.aJoueAutreClub&&<div style={{marginBottom:10}}><label style={lbl}>Club prÃ©cÃ©dent / mutation</label><input style={inp()} value={draft.ancienClub||""} onChange={ev=>upd("ancienClub",ev.target.value)}/></div>}
        {draft.aJoueAutreClub&&<div style={{marginBottom:10}}><label style={lbl}>Note mutation</label><textarea style={{...inp(),height:58,resize:"vertical"}} value={draft.mutationNotes||""} onChange={ev=>upd("mutationNotes",ev.target.value)}/></div>}
        <div style={{marginBottom:10}}><label style={lbl}>Adresse</label><input style={inp()} value={draft.adresse||""} onChange={ev=>upd("adresse",ev.target.value)}/></div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Code postal</label><input style={inp()} value={draft.codePostal||""} onChange={ev=>upd("codePostal",ev.target.value)} maxLength={5} inputMode="numeric"/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Ville</label><input style={inp()} value={draft.ville||""} onChange={ev=>upd("ville",ev.target.value)}/></div>
        </div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>TÃ©lÃ©phone</label><input type="tel" style={inp()} value={draft.telephone||""} onChange={ev=>upd("telephone",ev.target.value)} inputMode="tel"/></div>
          <div style={{marginBottom:10}}><label style={lbl}>Email</label><input type="email" style={inp()} value={draft.email||""} onChange={ev=>upd("email",ev.target.value)} inputMode="email"/></div>
        </div>
        {/* ReprÃ©sentants Ã©ditables */}
        {!draft.isMajeur&&<div style={{marginTop:10,padding:10,background:C.Jp,borderRadius:8,border:`1px solid ${C.Jd}`}}>
          <p style={{fontWeight:700,fontSize:12,margin:"0 0 8px"}}>ReprÃ©sentants lÃ©gaux</p>
          {(draft.representants||[]).map((r,i)=><div key={i} style={{background:C.W,borderRadius:6,padding:8,marginBottom:6,position:"relative"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <strong style={{fontSize:11,color:C.G}}>Resp. {i+1}</strong>
              {(draft.representants||[]).length>1&&<button onClick={()=>delRep(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:4,padding:"2px 6px",fontSize:10,cursor:"pointer",fontWeight:700}}>âœ•</button>}
            </div>
            <div style={G2}>
              <input style={{...inp(),fontSize:13}} placeholder="Nom" value={r.nom||""} onChange={ev=>updRep(i,"nom",ev.target.value.toUpperCase())}/>
              <input style={{...inp(),fontSize:13}} placeholder="PrÃ©nom" value={r.prenom||""} onChange={ev=>updRep(i,"prenom",ev.target.value)}/>
              <select style={{...inp(),fontSize:13}} value={r.lien||""} onChange={ev=>updRep(i,"lien",ev.target.value)}><option value="">â€” Lien</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select>
              <input type="tel" style={{...inp(),fontSize:13}} placeholder="TÃ©lÃ©phone" value={r.tel||""} onChange={ev=>updRep(i,"tel",ev.target.value)}/>
            </div>
            <input type="email" style={{...inp(),fontSize:13,marginTop:6}} placeholder="Email" value={r.email||""} onChange={ev=>updRep(i,"email",ev.target.value)}/>
          </div>)}
          <button onClick={addRep} style={{...BS,fontSize:11,padding:"6px 12px",width:"100%"}}>+ Ajouter</button>
        </div>}
      </div>}
    </SecBlock>

    {/* PAIEMENT - section dÃ©pliable, Ã©ditable */}
    <SecBlock title="ðŸ’° Paiement" open={openSec.paiement||editing} onTog={()=>togSec("paiement")}>
      {!editing?<div style={{background:C.N,borderRadius:8,padding:"10px 12px",margin:"-4px 0 0"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.W,fontSize:13}}>{MODES_PAIEMENT.find(m=>m.id===e.modePaiement)?.l||"â€”"}</div>
            {e.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {e.nbFois} chÃ¨ques</div>}
            {e.nomFamille&&<div style={{color:"#86efac",fontSize:12}}>Famille {e.nomFamille}</div>}
          </div>
          <div style={{color:C.J,fontWeight:900,fontSize:22}}>{calcTotalDossier(e)} â‚¬</div>
        </div>
        {boutiquePermTotal>0&&<div style={{fontSize:12,color:"#86efac",marginTop:6}}>Licence {e.prixFinal||0} â‚¬ + boutique permanence {boutiquePermTotal} â‚¬</div>}
        {boutiqueSaisonTotal>0&&<div style={{fontSize:12,color:"#7dd3fc",marginTop:6}}>Commandes saison sÃ©parÃ©es : {boutiqueSaisonTotal} â‚¬</div>}
        {e.nbFois>1&&e.datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {calcEcheances(e.prixFinal,e.nbFois).map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>ChÃ¨que {i+1} ({e.datesEcheances[i]?fmtD(e.datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} â‚¬</span></div>)}
        </div>}
      </div>:<div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Mode de paiement</label><select style={inp()} value={draft.modePaiement||""} onChange={ev=>upd("modePaiement",ev.target.value)}><option value="">â€”</option>{MODES_PAIEMENT.map(m=><option key={m.id} value={m.id}>{m.l}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Nb fois</label><select style={inp()} value={draft.nbFois||1} onChange={ev=>upd("nbFois",parseInt(ev.target.value))}><option value={1}>1Ã— (comptant)</option><option value={2}>2Ã—</option><option value={3}>3Ã—</option><option value={4}>4Ã—</option></select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Nom de famille</label><input style={inp()} value={draft.nomFamille||""} onChange={ev=>upd("nomFamille",ev.target.value.toUpperCase())}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>1er encaissement</label><input type="date" style={inp()} value={draft.dateEcheance1||""} onChange={ev=>upd("dateEcheance1",ev.target.value)}/></div>
        </div>
        {draft.nbFois>1&&draft.dateEcheance1&&<div style={{padding:"8px 10px",background:C.Gc,borderRadius:8,fontSize:12}}>
          Ã‰chÃ©ances : {calcDatesEcheance(draft.dateEcheance1,draft.nbFois).map(d=>fmtD(d)).join(" Â· ")}
        </div>}
        <p style={{fontSize:11,color:C.G,marginTop:6}}>ðŸ’¡ Le prix sera recalculÃ© automatiquement Ã  l'enregistrement selon la catÃ©gorie et les membres famille.</p>
      </div>}
    </SecBlock>

    <BoutiqueAchats e={e} onUpd={onUpd} tarifs={tarifs}/>

    {/* MÃ‰DICAL - dÃ©pliable, Ã©ditable */}
    <SecBlock title="ðŸ©º MÃ©dical" open={openSec.medical||editing} onTog={()=>togSec("medical")}>
      {!editing?<div>
        <DR l="Allergies/asthme" v={getAllergies(e)||"â€”"}/>
        <DR l="Mutuelle" v={e.mutuelle}/>
        <DR l="NÂ° sÃ©cu" v={e.numSecu}/>
        <DR l="MÃ©decin" v={e.docteur}/>
        <DR l="TÃ©l mÃ©decin" v={e.telDocteur}/>
        <div style={{marginTop:6}}>
          <span style={{background:e.autoSoins?"#dcfce7":"#fee2e2",color:e.autoSoins?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700,marginRight:4}}>ðŸš‘ Soins {e.autoSoins?"âœ“":"âœ—"}</span>
          <span style={{background:e.autoPhoto?"#dcfce7":"#fee2e2",color:e.autoPhoto?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700,marginRight:4}}>ðŸ“· Photo {e.autoPhoto?"âœ“":"âœ—"}</span>
          <span style={{background:e.autoTransport?"#dcfce7":"#fee2e2",color:e.autoTransport?C.V:C.R,padding:"3px 8px",borderRadius:5,fontSize:11,fontWeight:700}}>ðŸš— Transport {e.autoTransport?"âœ“":"âœ—"}</span>
        </div>
      </div>:<div>
        <div style={{marginBottom:10}}><label style={lbl}>Allergies, asthme, restrictions</label><textarea style={{...inp(),height:60,resize:"vertical"}} value={draft.allergiesAsthme||""} onChange={ev=>upd("allergiesAsthme",ev.target.value)}/></div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Mutuelle</label><input style={inp()} value={draft.mutuelle||""} onChange={ev=>upd("mutuelle",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>NÂ° sÃ©cu</label><input style={inp()} value={draft.numSecu||""} onChange={ev=>upd("numSecu",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>MÃ©decin</label><input style={inp()} value={draft.docteur||""} onChange={ev=>upd("docteur",ev.target.value)}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>TÃ©l mÃ©decin</label><input type="tel" style={inp()} value={draft.telDocteur||""} onChange={ev=>upd("telDocteur",ev.target.value)}/></div>
        </div>
        <Chk checked={draft.autoSoins} onChange={v=>upd("autoSoins",v)} label="ðŸš‘ Autorise les soins d'urgence"/>
        <Chk checked={draft.autoPhoto} onChange={v=>upd("autoPhoto",v)} label="ðŸ“· Autorise les photos/vidÃ©os"/>
        <Chk checked={draft.autoTransport} onChange={v=>upd("autoTransport",v)} label="ðŸš— Autorise le transport"/>
      </div>}
    </SecBlock>

    {/* Ã‰QUIPEMENT - dÃ©pliable, Ã©ditable */}
    <SecBlock title="ðŸ‘• Ã‰quipement" open={openSec.equip||editing} onTog={()=>togSec("equip")}>
      {!editing?<div>
        <DR l="Short" v={e.tailleShort||"â€”"}/>
        <DR l="Chaussettes" v={e.tailleChaussettes||"â€”"}/>
        <DR l="SurvÃªt." v={getSurvet(e)||"â€”"}/>
        {e.tailleSweat&&<DR l="Sweat" v={e.tailleSweat}/>}
      </div>:<div style={G2}>
        <div style={{marginBottom:10}}><label style={lbl}>Short</label><select style={inp()} value={draft.tailleShort||""} onChange={ev=>upd("tailleShort",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        <div style={{marginBottom:10}}><label style={lbl}>Chaussettes</label><select style={inp()} value={draft.tailleChaussettes||""} onChange={ev=>upd("tailleChaussettes",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
        {aSurvet(draft.categorie)&&<div style={{marginBottom:10}}><label style={lbl}>SurvÃªtement</label><select style={inp()} value={draft.tailleSurvet||""} onChange={ev=>upd("tailleSurvet",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
        {aSweat(draft.categorie)&&<div style={{marginBottom:10}}><label style={lbl}>Sweat RSG</label><select style={inp()} value={draft.tailleSweat||""} onChange={ev=>upd("tailleSweat",ev.target.value)}><option value="">â€”</option>{getTaillesCat(draft.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
      </div>}
    </SecBlock>

    {/* DOCS - dÃ©pliable, Ã©ditable */}
    <SecBlock title="ðŸ“ Documents" open={openSec.docs||editing} onTog={()=>togSec("docs")}>
      {!editing?<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{l:"Certif.",k:"certifMedical"},{l:"Photo ID",k:"photoId"},{l:"Justif.",k:"justifDom"},{l:"RIB",k:"rib"},{l:"Livret famille",k:"livretFamille"}].map(({l,k})=><span key={k} style={{background:e[k]?"#dcfce7":"#fee2e2",color:e[k]?C.V:C.R,padding:"4px 8px",borderRadius:6,fontSize:12,fontWeight:700}}>{e[k]?"âœ“":"â—‹"} {l}</span>)}
      </div>:<div>
        <Chk checked={draft.certifMedical} onChange={v=>upd("certifMedical",v)} label="ðŸ©º Certificat mÃ©dical"/>
        <Chk checked={draft.photoId} onChange={v=>upd("photoId",v)} label="ðŸªª PiÃ¨ce d'identitÃ©"/>
        <Chk checked={draft.justifDom} onChange={v=>upd("justifDom",v)} label="ðŸ  Justificatif de domicile"/>
        <Chk checked={draft.rib} onChange={v=>upd("rib",v)} label="ðŸ’³ RIB"/>
        <Chk checked={draft.livretFamille} onChange={v=>upd("livretFamille",v)} label="ðŸ“‹ Livret de famille"/>
      </div>}
    </SecBlock>

    {/* FAMILLE - lecture seule (Ã©dition complÃ¨te famille hors-scope ici) */}
    {tousMembres>1&&<SecBlock title={`ðŸ‘¨â€ðŸ‘©â€ðŸ‘§ Famille (${tousMembres-1} autre${tousMembres>2?"s":""} membre${tousMembres>2?"s":""})`} open={openSec.famille} onTog={()=>togSec("famille")}>
      {(e.freresSoeurs||[]).map((m,i)=><div key={i} style={{padding:"6px 8px",background:C.Jp,borderRadius:6,marginBottom:4,fontSize:12}}>
        ðŸ‘¶ <strong>{m.prenom} {m.nom}</strong> â€” {m.categorie} {m.dateNaissance?`(nÃ©(e) ${fmtD(m.dateNaissance)})`:""}
        <div style={{fontSize:11,color:C.G,marginTop:2}}>Short {m.tailleShort||"â€”"} Â· Chaussettes {m.tailleChaussettes||"â€”"}{m.tailleSurvet?` Â· SurvÃªt. ${m.tailleSurvet}`:""}{m.tailleSweat?` Â· Sweat ${m.tailleSweat}`:""}</div>
      </div>)}
      {(e.adultesFamille||[]).map((m,i)=><div key={i} style={{padding:"6px 8px",background:"#dbeafe",borderRadius:6,marginBottom:4,fontSize:12}}>
        ðŸ§‘ <strong>{m.prenom} {m.nom}</strong> â€” {m.categorie}
        <div style={{fontSize:11,color:C.G,marginTop:2}}>ðŸ“± {m.tel||"â€”"} Â· ðŸ“§ {m.email||"â€”"}</div>
      </div>)}
    </SecBlock>}

    {/* Email Footclubs (utile bureau) */}
    <div style={{background:"#f0f9ff",border:"1.5px solid #7dd3fc",borderRadius:10,padding:"10px 12px",marginTop:12,marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:11,color:"#0369a1",margin:"0 0 4px",textTransform:"uppercase"}}>ðŸ“‹ Email pour Footclubs</p>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{flex:1,fontWeight:700,fontSize:13,wordBreak:"break-all"}}>{getEmailContact(e)||"â€”"}</span>
        <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:36}} onClick={()=>navigator.clipboard.writeText(getEmailContact(e))}>Copier</button>
      </div>
    </div>

    {e.commentaire&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:13,color:"#92400e"}}>
      <strong>ðŸ’¬ Message du prÃ©inscrit :</strong> {e.commentaire}
    </div>}

    {/* Notes secrÃ©tariat */}
    <div style={{marginBottom:12,background:C.Gc,padding:12,borderRadius:10,border:`1.5px dashed ${C.Gb}`}}>
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px"}}>ðŸ“ Notes secrÃ©tariat</p>
      <textarea style={{...inp(),height:70,resize:"vertical",fontSize:13}} value={note} onChange={ev=>setNote(ev.target.value)} placeholder="Notes internes â€” visibles uniquement par le bureau et les bÃ©nÃ©volesâ€¦"/>
      <button style={{...BP,fontSize:12,padding:"8px 14px",marginTop:6,opacity:saving?.7:1}} onClick={saveNote} disabled={saving}>{saving?"Enregistrementâ€¦":"ðŸ’¾ Enregistrer la note"}</button>
    </div>

    <div style={{display:"flex",gap:8}}>
      <button style={{...BS,flex:1,fontSize:13}} onClick={()=>printFiche(e)}>ðŸ–¨ Imprimer</button>
      <button style={{flex:1,background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:13,cursor:"pointer",minHeight:48}} onClick={()=>onDel(e.id)}>ðŸ—‘ Supprimer</button>
    </div>
  </div>;
}

// Bloc dÃ©pliable pour le DetailPanel
function SecBlock({title,open,onTog,children}){
  return<div style={{background:"#fafafa",borderRadius:10,border:`1px solid ${C.Gb}`,marginBottom:8,overflow:"hidden"}}>
    <button onClick={onTog} style={{width:"100%",background:"transparent",border:"none",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontWeight:700,fontSize:13,color:C.N}}>
      <span>{title}</span>
      <span style={{color:C.G,fontSize:14,transform:open?"rotate(180deg)":"none",transition:"transform .15s"}}>â–¼</span>
    </button>
    {open&&<div style={{padding:"4px 12px 12px"}}>{children}</div>}
  </div>;
}


/* â•â• IMPRESSION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// RÃ©cap imprimable cÃ´tÃ© utilisateur (Ã  apporter en permanence)
function printRecap(f,saison,prixFinal,modeObj,echeances,datesEcheances,certifNeeded,aDesMembresFamille,tarifs){
  const w=window.open("","_blank");if(!w)return;
  const photoHtml=f.photoBase64?`<img src="${f.photoBase64}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:"";
  const docs=getDocsAApporter(f,certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
  const ech=echeances&&f.nbFois>1?echeances.map((m,i)=>`<tr><td style="padding:3px 8px">${modeObj?.id==="cheque"?"ChÃ¨que":"Versement"} ${i+1}</td><td style="padding:3px 8px">${datesEcheances&&datesEcheances[i]?fmtD(datesEcheances[i]):"?"}</td><td style="padding:3px 8px;text-align:right;font-weight:700">${m} â‚¬</td></tr>`).join(""):"";
  const fs=f.freresSoeurs?.length?`<h2>FrÃ¨res / sÅ“urs</h2><ul style="margin:0;padding-left:18px">${f.freresSoeurs.map(m=>`<li>${m.prenom} ${m.nom} â€” ${m.categorie||"?"}${m.dateNaissance?` (nÃ©(e) ${fmtD(m.dateNaissance)})`:""}</li>`).join("")}</ul>`:"";
  const ad=f.adultesFamille?.length?`<h2>Adultes famille</h2><ul style="margin:0;padding-left:18px">${f.adultesFamille.map(m=>`<li>${m.prenom} ${m.nom} â€” ${m.categorie||"?"}</li>`).join("")}</ul>`:"";
  const reps=!f.representants?"":f.representants.filter(r=>r.nom).map(r=>`<li><strong>${r.lien||"Resp."} :</strong> ${r.prenom} ${r.nom} â€” ${r.tel} â€” ${r.email}</li>`).join("");
  w.document.write(`<!DOCTYPE html><html><head><title>RÃ©cap RSG</title><style>
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
      <h1>âš½ RÃ‰VEIL SAINT-GÃ‰RÃ‰ON<br/><span style="font-size:13px;font-weight:400">RÃ©cap prÃ©inscription â€” Saison ${saison}</span></h1>
      <p style="margin:4px 0;font-size:11px;color:${certifNeeded?"#dc2626":"#16a34a"};font-weight:700">${certifNeeded?"ðŸ©º Certif mÃ©dical OBLIGATOIRE Ã  apporter":"âœ… Certif mÃ©dical valide"}</p>
    </div>
    ${photoHtml}
  </div>
  <div class="pay">ðŸ’° Total Ã  payer : <strong>${prixFinal} â‚¬</strong> Â· ${modeObj?.l||""}${f.nbFois>1?` Â· En ${f.nbFois} versements`:""}</div>
  ${ech?`<table>${ech}</table>`:""}
  <h2>Joueur principal</h2>
  <div class="grid">
    <div class="row"><span class="l">Nom complet</span><span class="v">${f.prenom} ${f.nom}</span></div>
    <div class="row"><span class="l">Naissance</span><span class="v">${fmtD(f.dateNaissance)}${f.lieuNaissance?" â€” "+f.lieuNaissance:""}</span></div>
    <div class="row"><span class="l">CatÃ©gorie</span><span class="v">${f.categorie}</span></div>
    <div class="row"><span class="l">Adresse</span><span class="v">${f.adresse}, ${f.codePostal} ${f.ville}</span></div>
    <div class="row"><span class="l">NationalitÃ©</span><span class="v">${f.nationalite||""}</span></div>
    ${f.email?`<div class="row"><span class="l">Email</span><span class="v">${f.email}</span></div>`:""}
    ${f.telephone?`<div class="row"><span class="l">TÃ©lÃ©phone</span><span class="v">${f.telephone}</span></div>`:""}
  </div>
  ${reps?`<h2>ReprÃ©sentants lÃ©gaux</h2><ul style="margin:0;padding-left:18px;font-size:11px">${reps}</ul>`:""}
  <h2>Ã‰quipement</h2>
  <p style="font-size:11px;margin:0">
    Short : <strong>${f.tailleShort||"â€”"}</strong> Â· Chaussettes : <strong>${f.tailleChaussettes||"â€”"}</strong>
    ${f.tailleSweat?` Â· Sweat RSG : <strong>${f.tailleSweat}</strong>`:""}
    ${f.tailleSurvet?` Â· SurvÃªtement : <strong>${f.tailleSurvet}</strong>`:""}
  </p>
  ${fs}
  ${ad}
  ${f.allergiesAsthme?`<h2>MÃ©dical</h2><p style="font-size:11px">Allergies/asthme/restrictions : <strong>${f.allergiesAsthme}</strong></p>`:""}
  ${docs.length?`<div class="docs"><strong>ðŸ“‹ PrÃ©parez si possible pour la permanence :</strong><ul style="margin:6px 0 0;padding-left:20px">${docs.map(d=>`<li>${d}</li>`).join("")}</ul></div>`:`<div class="docs">âœ… Tous les documents sont prÃ©parÃ©s. Pensez au rÃ¨glement et Ã  votre rÃ©fÃ©rence.</div>`}
  <h2>Permanences licence</h2>
  <ul style="margin:0;padding-left:18px;font-size:11px">${permanences.map(p=>`<li>${fmtPermanence(p)}</li>`).join("")}</ul>
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999">
    Document Ã  apporter en permanence licence Â· RSG RÃ©veil Saint-GÃ©rÃ©on Â· Saison ${saison}
  </div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="background:#F5C800;border:none;padding:10px 24px;font-weight:700;border-radius:6px;cursor:pointer">ðŸ–¨ Imprimer</button>
  </div>
  <script>setTimeout(()=>window.print(),400);</script>
  </body></html>`);
  w.document.close();
}

function printFiche(e){
  const w=window.open("","_blank");if(!w)return;
  const mode=MODES_PAIEMENT.find(m=>m.id===e.modePaiement)?.l||"â€”";
  const ech=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  w.document.write(`<!DOCTYPE html><html><head><title>Fiche ${e.prenom} ${e.nom}</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:20px auto;font-size:12px}h1{border-bottom:4px solid #F5C800;padding-bottom:8px}h2{background:#F5C800;padding:3px 8px;font-size:12px;display:inline-block;border-radius:3px;margin:14px 0 6px}.row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0;font-size:11px}.l{color:#6b7280;min-width:120px;flex-shrink:0}.v{font-weight:600}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.pay{background:#111;color:#F5C800;padding:10px 14px;border-radius:8px;margin:12px 0}@media print{button{display:none!important}}</style></head><body>
  <div style="display:flex;justify-content:space-between"><div><h1>âš½ RÃ‰VEIL SAINT-GÃ‰RÃ‰ON<br><span style="font-size:13px;font-weight:400">PrÃ©inscription â€” Saison ${e.saison||"â€”"}</span></h1>
  <span style="background:#111;color:#F5C800;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${e.categorie}</span> <span style="font-size:11px">${e.typeLicence==="renouvellement"?"ðŸ”„ Renouvellement":"âœ¨ Nouvelle"}</span> <span style="font-size:11px;color:#666">${e.id}</span>
  <div style="margin-top:4px;font-size:11px;color:${e.certifNeeded?"#dc2626":"#16a34a"};font-weight:700">${e.certifNeeded?"ðŸ©º Certif mÃ©dical OBLIGATOIRE":"âœ… Certif valable"}</div></div>
  ${e.photoBase64?`<img src="${e.photoBase64}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:""}
  </div>
  <div class="pay">ðŸ’° ${e.prixFinal||0} â‚¬ Â· ${mode}${e.nbFois>1?` Â· En ${e.nbFois} fois`:""}${e.remisePct>0?` Â· Remise famille -${e.remisePct}% (${e.nomFamille||""})`:""}</div>
  ${ech?`<p style="font-size:11px">Ã‰chÃ©ancier : ${ech.map((m,i)=>`Versement ${i+1} : ${m} â‚¬`).join(" | ")}</p>`:""}
  <h2>Joueur</h2><div class="grid"><div class="row"><span class="l">Nom</span><span class="v">${e.prenom} ${e.nom}</span></div><div class="row"><span class="l">Naissance</span><span class="v">${fmtD(e.dateNaissance)}${e.lieuNaissance?" â€” "+e.lieuNaissance:""}</span></div><div class="row"><span class="l">Adresse</span><span class="v">${e.adresse}, ${e.codePostal} ${e.ville}</span></div>${e.numLicenceFFF?`<div class="row"><span class="l">NÂ° FFF</span><span class="v">${e.numLicenceFFF}</span></div>`:""}</div>
  ${(() => {const r=getResp1(e);return!e.isMajeur&&r?`<h2>Responsable lÃ©gal</h2><div class="grid"><div class="row"><span class="l">IdentitÃ©</span><span class="v">${r.prenom||""} ${r.nom||""}${r.lien?" ("+r.lien+")":""}</span></div><div class="row"><span class="l">TÃ©lÃ©phone</span><span class="v">${r.tel||""}</span></div><div class="row"><span class="l">Email</span><span class="v">${r.email||""}</span></div></div>`:"";})()}
  <h2>Ã‰quipement</h2><p style="font-size:11px">Short : <b>${e.tailleShort||"â€”"}</b> Â· Chaussettes : <b>${e.tailleChaussettes||"â€”"}</b> Â· SurvÃªtement : <b>${getSurvet(e)||"â€”"}</b>${e.tailleSweat?` Â· Sweat : <b>${e.tailleSweat}</b>`:""}</p>
  ${e.notes?`<h2>Notes bureau</h2><p>${e.notes}</p>`:""}
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999;display:flex;justify-content:space-between"><span>RSG RÃ©veil Saint-GÃ©rÃ©on Â· Saison ${e.saison} Â· Document confidentiel</span><span>${STATUTS[e.statut]?.l||"â€”"}</span></div>
  <script>setTimeout(()=>window.print(),300);</script></body></html>`);
  w.document.close();
}

function printAttestation(e){
  const w=window.open("","_blank");if(!w)return;
  const date=new Date().toLocaleDateString("fr-FR");
  w.document.write(`<!DOCTYPE html><html><head><title>Attestation licence ${e.prenom} ${e.nom}</title><style>
    body{font-family:Arial,sans-serif;max-width:760px;margin:30px auto;padding:0 28px;color:#111}
    .head{border-bottom:5px solid #F5C800;padding-bottom:14px;margin-bottom:30px}
    h1{margin:0;font-size:24px}
    .club{font-weight:900;font-size:18px}
    .box{border:2px solid #111;border-radius:10px;padding:22px;margin:24px 0;font-size:16px;line-height:1.7}
    .meta{background:#f9fafb;border-radius:8px;padding:12px 14px;font-size:13px}
    .sig{margin-top:60px;display:flex;justify-content:space-between;gap:30px}
    @media print{button{display:none!important}}
  </style></head><body>
    <div class="head">
      <div class="club">âš½ RÃ‰VEIL SAINT-GÃ‰RÃ‰ON</div>
      <div>Attestation de licence Â· Saison ${e.saison||""}</div>
    </div>
    <h1>Attestation de rÃ¨glement et d'inscription</h1>
    <div class="box">
      Le club <strong>RÃ©veil Saint-GÃ©rÃ©on</strong> atteste que <strong>${e.prenom||""} ${e.nom||""}</strong>,
      nÃ©(e) le <strong>${fmtD(e.dateNaissance)}</strong>, est enregistrÃ©(e) pour la saison
      <strong>${e.saison||""}</strong> en catÃ©gorie <strong>${e.categorie||""}</strong>.
      <br/><br/>
      Le rÃ¨glement de la licence est indiquÃ© comme reÃ§u par le secrÃ©tariat du club.
    </div>
    <div class="meta">
      RÃ©fÃ©rence dossier : <strong>${e.id||""}</strong><br/>
      Date de paiement : <strong>${fmtD(e.datePaiement)||date}</strong><br/>
      Montant licence : <strong>${e.prixFinal||0} â‚¬</strong>
    </div>
    <div class="sig">
      <div>Fait Ã  Saint-GÃ©rÃ©on, le ${date}</div>
      <div>Pour le RÃ©veil Saint-GÃ©rÃ©on<br/><br/>Signature</div>
    </div>
    <button onclick="window.print()" style="margin-top:40px;background:#F5C800;border:none;padding:10px 22px;font-weight:800;border-radius:8px;cursor:pointer">Imprimer / PDF</button>
    <script>setTimeout(()=>window.print(),350);</script>
  </body></html>`);
  w.document.close();
}

function prepareAttestationEmail(e){
  const email=getEmailContact(e);
  if(!email){alert("Aucun email de contact trouvÃ© pour ce dossier.");return;}
  const subject=`Attestation de licence RSG - ${e.prenom||""} ${e.nom||""}`;
  const body=[
    `Bonjour,`,
    ``,
    `Votre licence au RÃ©veil Saint-GÃ©rÃ©on est indiquÃ©e comme rÃ©glÃ©e pour la saison ${e.saison||""}.`,
    `Vous pouvez trouver / recevoir l'attestation de licence au nom de ${e.prenom||""} ${e.nom||""}.`,
    ``,
    `RÃ©fÃ©rence dossier : ${e.id||""}`,
    ``,
    `Sportivement,`,
    `Le RÃ©veil Saint-GÃ©rÃ©on`
  ].join("\n");
  window.location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* â•â• MICRO-COMPOSANTS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ProgressBar({steps,current}){
  return<div style={{display:"flex",alignItems:"center",marginBottom:14,padding:"0 2px"}}>
    {steps.map((sl,i)=><div key={i} style={{display:"flex",alignItems:"center",flex:1}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
        <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,background:current>i+1?C.V:current===i+1?C.J:"#e5e7eb",color:current>i+1||current===i+1?C.N:"#9ca3af",transition:"all .2s"}}>{current>i+1?"âœ“":i+1}</div>
        <span style={{fontSize:9,color:current===i+1?C.N:"#9ca3af",fontWeight:current===i+1?700:400,whiteSpace:"nowrap",textAlign:"center",lineHeight:1.1,maxWidth:52}}>{sl}</span>
      </div>
      {i<steps.length-1&&<div style={{height:2,flex:1,background:current>i+1?C.V:"#e5e7eb",margin:"0 2px 12px",transition:"all .2s"}}/>}
    </div>)}
  </div>;
}
function TypeCard({sel,onClick,icon,title,sub}){return<div onClick={onClick} style={{border:`2px solid ${sel?C.J:C.Gb}`,background:sel?C.Jp:"#fafafa",borderRadius:12,padding:"14px 10px",cursor:"pointer",textAlign:"center",transition:"all .15s",minHeight:110,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><div style={{fontSize:26}}>{icon}</div><div style={{fontWeight:800,fontSize:14,color:C.N}}>{title}</div><div style={{fontSize:11,color:C.G,lineHeight:1.3}}>{sub}</div></div>;}
function ErrB({msg}){return<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:12}}>âš  {msg}</div>;}
function F({label,err,children,span}){return<div style={{marginBottom:12,gridColumn:span?"1 / -1":undefined}}><label style={lbl}>{label}</label>{children}{err&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>âš  {err}</span>}</div>;}
function Chk({checked,onChange,label,err}){return<div style={{marginBottom:10}}><label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{marginTop:2,accentColor:C.J,width:18,height:18,flexShrink:0}}/><span style={{fontSize:13,color:C.N,lineHeight:1.4}}>{label}</span></label>{err&&<span style={{color:C.R,fontSize:11,display:"block",marginTop:3,marginLeft:28}}>âš  {err}</span>}</div>;}
function RB({title,children}){return<div style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:8}}><p style={{fontWeight:700,fontSize:12,color:C.N,margin:"0 0 6px"}}>{title}</p>{children}</div>;}
function RR({l,v}){return<div style={{display:"flex",gap:8,fontSize:12,padding:"2px 0"}}><span style={{color:C.G,minWidth:100,flexShrink:0}}>{l} :</span><span style={{fontWeight:600}}>{v||"â€”"}</span></div>;}
function MC({title,children}){return<div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px"}}><p style={{fontWeight:700,fontSize:11,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.4}}>{title}</p>{children}</div>;}
function DR({l,v}){return<div style={{padding:"3px 0",borderBottom:`1px solid ${C.Gc}`,display:"flex",gap:6,fontSize:11}}><span style={{color:"#9ca3af",minWidth:72,flexShrink:0}}>{l}</span><span style={{fontWeight:600,wordBreak:"break-all"}}>{v||"â€”"}</span></div>;}


