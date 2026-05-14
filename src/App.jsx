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
  "Vétéran":    100,
  "Dirigeant":    0,
};

// Remise famille (à partir du 2e membre de la même famille, tous confondus)
// Ces valeurs par défaut sont surchargeables dans Admin > Tarifs
const REMISE_FAMILLE_DEFAUT = {
  2: 10,   // 2e membre : -10%
  3: 20,   // 3e : -20%
  4: 30,   // 4e+ : -30%
};

const PERMANENCES_DEFAUT = [
  {date:"",debut:"",fin:"",lieu:"Stade du RSG"},
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
const BOUTIQUE_CATEGORIES_DEFAUT = ["Textile","Équipement joueur","Accessoires","Commande spéciale"];

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
const ADMIN = "RSG2025";
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
  {l:"Vétérans",v:"Vétéran"},
  {l:"Dirigeants",v:"Dirigeant"},
];
const ORDRE_CATS = CATS.map(c=>c.v);
const catLabel = cat => CATS.find(c=>c.v===cat)?.l || cat;
const orderedTarifEntries = tarifs => [...ORDRE_CATS.filter(cat=>tarifs?.[cat]!==undefined).map(cat=>[cat,tarifs[cat]]),...Object.entries(tarifs||{}).filter(([k])=>!k.startsWith("_")&&!ORDRE_CATS.includes(k)).sort(([a],[b])=>a.localeCompare(b))];
const catRank = cat => {
  const adminOrder=["Babyfoot","U6/U7","U8/U9","U10/U11M","U10/U11F","U12/U13M","U12/U13F","U14/U15M","U14/U15F","U16/U17/U18M","U16/U17/U18F","Seniors M","Seniors F","Vétérans","Dirigeants"];
  const ai=adminOrder.indexOf(cat);
  if(ai>=0)return ai;
  const normalized=String(cat||"").replaceAll("/","-").replace(/\s*M$|\s*F$/,"");
  const i=ORDRE_CATS.indexOf(normalized);
  return i>=0?i:999;
};
const sortCats = cats => [...cats].sort((a,b)=>catRank(a)-catRank(b)||String(a).localeCompare(String(b)));
const adminCatValue=m=>{
  const cat=m?.categorie||"";
  const sexe=m?.sexe||"";
  if(cat==="U6-U7")return"U6/U7";
  if(cat==="U8-U9")return"U8/U9";
  if(cat==="U10-U11")return sexe==="Féminin"?"U10/U11F":"U10/U11M";
  if(cat==="U12-U13")return sexe==="Féminin"?"U12/U13F":"U12/U13M";
  if(cat==="U14-U15")return sexe==="Féminin"?"U14/U15F":"U14/U15M";
  if(cat==="U16-U17-U18")return sexe==="Féminin"?"U16/U17/U18F":"U16/U17/U18M";
  if(cat==="Senior")return sexe==="Féminin"?"Seniors F":"Seniors M";
  if(cat==="Vétéran")return"Vétérans";
  if(cat==="Dirigeant")return"Dirigeants";
  return cat;
};
const structureType=m=>{
  const cat=m?.categorie||"";
  const sexe=m?.sexe||"";
  if(["Babyfoot","U6-U7","U8-U9"].includes(cat)||(cat==="U10-U11"&&sexe!=="Féminin"))return"École de foot RSG";
  if((sexe==="Féminin"&&["U10-U11","U12-U13","U14-U15","U16-U17-U18"].includes(cat))||(sexe!=="Féminin"&&["U12-U13","U14-U15","U16-U17-U18"].includes(cat)))return"Groupement Jeunes ASM/RSG";
  return"Réveil Saint-Géréon";
};
const catBirthYears=(cat,saison)=>{
  const y=parseInt(String(saison||"").match(/(\d{4})/)?.[1]||new Date().getFullYear(),10);
  const ranges={
    Babyfoot:`${y-4} et après`,
    "U6-U7":`${y-6}-${y-5}`,
    "U8-U9":`${y-8}-${y-7}`,
    "U10-U11":`${y-10}-${y-9}`,
    "U12-U13":`${y-12}-${y-11}`,
    "U14-U15":`${y-14}-${y-13}`,
    "U16-U17-U18":`${y-17}-${y-15}`,
    Senior:`${y-33}-${y-18}`,
    "Vétéran":`${y-34} et avant`,
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
const ATTESTATION_TEMPLATE_DEFAUT=`<div class="head">
  <div class="club">RÉVEIL SAINT-GÉRÉON</div>
  <div>Attestation de licence · Saison {saison}</div>
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
  <div>Pour le Réveil Saint-Géréon<br><br>Signature</div>
</div>`;
const getAttestationTemplate=tarifs=>tarifs?._attestationTemplate||ATTESTATION_TEMPLATE_DEFAUT;
const getCoutInitiales=tarifs=>Number(tarifs?._coutInitiales??3);
const getChampsInitiales=tarifs=>{
  const fields=Array.isArray(tarifs?._champsInitiales)?tarifs._champsInitiales:[];
  return fields.length?fields:["tailleSweat","tailleSurvet"];
};
const initialesAutorisees=(field,tarifs)=>getChampsInitiales(tarifs).includes(field);
const getInitialesItems=(m,tarifs)=>{
  const allowed=getChampsInitiales(tarifs);
  const items=m?.initialesEquipementItems&&typeof m.initialesEquipementItems==="object"?m.initialesEquipementItems:{};
  const values=Object.entries(items).filter(([field,v])=>(allowed.includes(field)||field==="global")&&String(v||"").trim()).map(([field,text])=>({field,text:String(text).trim()}));
  if(values.length)return values;
  return m?.initialesEquipement&&String(m?.initialesTexte||"").trim()?[{field:"global",text:String(m.initialesTexte).trim()}]:[];
};
const countInitiales=(m,tarifs)=>getInitialesItems(m,tarifs).length;
const formatInitiales=(m,tarifs)=>getInitialesItems(m,tarifs).map(x=>`${x.field==="global"?"Équipement":EQUIP_LABELS[x.field]||x.field}: ${x.text}`).join(" · ");
const renderTpl=(tpl,e,tarifs)=>{
  const dateJour=new Date().toLocaleDateString("fr-FR");
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
    .replaceAll("{modePaiement}",paiementLabels(e?.modePaiements,e?.modePaiement,tarifs).join(" + ")||"");
};
const POSTES = ["Gardien","Défenseur central","Latéral droit","Latéral gauche","Milieu défensif","Milieu central","Milieu offensif","Ailier droit","Ailier gauche","Attaquant","Pas de préférence"];
const NATS   = ["Française","Algérienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Ukrainienne","Libanaise","Sénégalaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Autre"];
const LIENS  = ["Père","Mère","Tuteur légal","Grand-parent","Frère/Sœur majeur(e)"];
// Tailles disponibles selon catégorie
const TA = ["S","M","L","XL","2XL","3XL","4XL"];                              // Adultes Kappa
const TE = ["6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm"];  // Enfants Kappa
const TADO = ["10 ans / 140cm","12 ans / 152cm","14 ans / 164cm","16 ans / 174cm","S","M","L"];  // Ados (mix enfant + adulte)
const DOTATIONS_DEFAUT = Object.fromEntries(CATS.map(c=>[
  c.v,
  [
    {id:"tailleShort",label:"Short",actif:true},
    {id:"tailleChaussettes",label:"Chaussettes",actif:true},
    ...(c.v==="U10-U11"?[{id:"tailleSweat",label:"Sweat RSG",actif:true}]:[]),
    ...(["U12-U13","U14-U15","U16-U17-U18","Senior","Vétéran"].includes(c.v)?[{id:"tailleSurvet",label:"Survêtement",actif:true}]:[]),
  ]
]));
const EQUIP_LABELS = {tailleShort:"Short",tailleChaussettes:"Chaussettes",tailleSweat:"Sweat RSG",tailleSurvet:"Survêtement"};
const EQUIP_FIELDS = ["tailleShort","tailleChaussettes","tailleSweat","tailleSurvet"];

// Retourne les tailles à proposer selon la catégorie
const getTaillesCat=cat=>{
  if(["Senior","Vétéran","Dirigeant"].includes(cat))return TA;
  if(["U12-U13","U14-U15","U16-U17-U18"].includes(cat))return TADO;
  return TE; // Babyfoot, U6-U7, U8-U9, U10-U11
};
const getDotations = tarifs => {
  const custom = tarifs?._dotations || {};
  const merged = {};
  CATS.forEach(({v})=>{
    const source = Array.isArray(custom[v]) ? custom[v] : DOTATIONS_DEFAUT[v];
    merged[v] = (source||[]).map(item=>({
      id:item.id,
      label:item.label||EQUIP_LABELS[item.id]||item.id,
      actif:item.actif!==false,
      tailles:Array.isArray(item.tailles)&&item.tailles.length?item.tailles:getTaillesCat(v),
    })).filter(item=>EQUIP_FIELDS.includes(item.id));
  });
  return merged;
};
const getDotationCat = (tarifs,cat) => (getDotations(tarifs)[cat]||[]).filter(item=>item.actif!==false);
function EquipFields({member,categorie,onChange,tarifs,required=false}){
  const items=getDotationCat(tarifs,categorie);
  if(!categorie)return <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Choisissez d'abord une catégorie pour afficher les équipements compris avec la licence.</p>;
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
        <F label={`${item.label}${required?" *":""}`}>
      <select style={inp()} value={member?.[item.id]||""} onChange={e=>onChange(item.id,e.target.value)}>
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
// Indique si un survêtement est proposé pour cette catégorie (U12-U13 et plus)
const aSurvet=cat=>["U12-U13","U14-U15","U16-U17-U18","Senior","Vétéran","Dirigeant"].includes(cat);
const STATUTS = {
  attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:""},
  incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:""},
  valide:{l:"Valide",c:"#16a34a",bg:"#dcfce7",i:"✓",hint:"Licence reglee"},
  refuse:{l:"Refuse",c:"#6b7280",bg:"#f3f4f6",i:""},
  paye:{l:"Valide",c:"#16a34a",bg:"#dcfce7",i:"✓",hint:"Ancien statut paye"},
};
const STATUT_ORDER=["attente","incomplet","valide","refuse"];
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
  typeLicence:"",numLicenceFFF:"",
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
  tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",
  initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},doubleLicenceDirigeant:false,
  // Photo d'identité (obligatoire)
  photoBase64:"",
  // Famille
  freresSoeurs:[], // mineurs : {nom,prenom,dateNaissance,sexe,categorie,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,tailleSweat,photoBase64}
  adultesFamille:[], // adultes : {nom,prenom,dateNaissance,sexe,nationalite,categorie,tel,email,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,photoBase64}
  // Commentaire libre
  commentaire:"",
  // Paiement
  modePaiement:"",modePaiements:[],nbFois:1,nomFamille:"",dateEcheance1:"",datesEcheances:[],
};

/* â•â• HELPERS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const genId  = ()=>"RSG-"+Date.now().toString(36).toUpperCase().slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();
const fmtD   = iso=>iso?new Date(iso).toLocaleDateString("fr-FR"):"—";
const fmtDT  = iso=>iso?new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const calcAge= dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate()))a--;return a;};
// Détermine la catégorie d'un joueur en fonction de son année de naissance pour la saison sélectionnée
// Ex: pour saison 2026-2027, U6-U7 = né en 2020 ou 2021
const suggestCat=(dob,saison)=>{
  if(!dob)return"";
  const yr=new Date(dob).getFullYear();
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
  if(yr>=sStart-12)return"U12-U13";        // 2014-2015
  if(yr>=sStart-14)return"U14-U15";        // 2012-2013
  if(yr>=sStart-17)return"U16-U17-U18";    // 2009-2011
  if(yr>=sStart-33)return"Senior";          // 1993-2008 (34 ans en saison 2026-2027 = encore Senior)
  return"Vétéran";                           // 1992 et avant (≥ 34 ans atteints)
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
const getPieces = tarifs => {
  const pieces = tarifs?._pieces;
  return Array.isArray(pieces) && pieces.length ? pieces : PIECES_DEFAUT;
};
const getBoutique = tarifs => {
  const boutique = tarifs?._boutique;
  const base = Array.isArray(boutique) && boutique.length ? boutique : BOUTIQUE_DEFAUT;
  return base.map(a=>{
    const def=BOUTIQUE_DEFAUT.find(d=>d.id===a.id||d.nom===a.nom);
    return {...a,categorie:a.categorie||def?.categorie||"Commande spéciale"};
  });
};
const getBoutiqueCategories = tarifs => [...new Set([...BOUTIQUE_CATEGORIES_DEFAUT,...getBoutique(tarifs).map(a=>a.categorie||"Sans catégorie")])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
const isAchatSaison = a => a?.contexte==="saison";
const achatTotal = a => Number(a?.total ?? ((parseInt(a?.quantite)||0)*(parseInt(a?.prix)||0)));
const calcBoutiqueTotal = achats => (achats||[]).filter(a=>!isAchatSaison(a)).reduce((s,a)=>s+achatTotal(a),0);
const calcBoutiqueSaisonTotal = achats => (achats||[]).filter(isAchatSaison).reduce((s,a)=>s+achatTotal(a),0);
const calcTotalDossier = e => (e?.prixFinal||0) + (e?.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e?.boutiqueTotal||0));
const getAchatsBoutiqueRows = data => data.flatMap(e=>(e.achatsBoutique||[]).map(a=>({entry:e,achat:a})));
const getAchatCategorie = (achat,articles=[]) => achat?.categorie || articles.find(a=>a.id===achat?.articleId)?.categorie || "Commande spéciale";
const canInitialesBoutique = article => {
  const nom=String(article?.nom||"").toLowerCase();
  return !nom.includes("short")&&!nom.includes("chaussette");
};
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
const isNationaliteEtrangere = f => (f?.nationalite||"Française") !== "Française";
const pieceVisible = (piece, f, certifNeeded, aDesMembresFamille) => {
  if(piece.condition==="certif")return !!certifNeeded;
  if(piece.condition==="famille")return !!aDesMembresFamille;
  if(piece.condition==="etranger")return isNationaliteEtrangere(f);
  return true;
};
const getDocsAApporter = (f, certifNeeded, aDesMembresFamille, tarifs) =>
  getPieces(tarifs).filter(p=>pieceVisible(p,f,certifNeeded,aDesMembresFamille)).map(p=>p.label).filter(Boolean);
const LicenceHelp=()=>(
  <div style={{fontSize:11,color:"#0369a1",lineHeight:1.45,margin:"-6px 0 10px"}}>
    Le numéro de licence FFF se trouve sur votre ancienne licence, dans les emails de la FFF / Footclubs, ou peut être demandé au club. Il contient généralement 7 à 8 chiffres.
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

// Compte tous les membres rattachés au dossier, y compris une éventuelle double licence dirigeant.
const countMembres = (f) => f ? 1 + (f.freresSoeurs?.length || 0) + (f.adultesFamille?.length || 0) + (f.doubleLicenceDirigeant ? 1 : 0) : 0;
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
  if(e.doubleLicenceDirigeant)membres.push(mk({...e,categorie:"Dirigeant"},membres.length,"Double licence dirigeant"));
  return membres;
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
    ["Date de naissance",fmtD(m.dateNaissance)],
    ["Sexe",m.sexe||e.sexe||""],
    ["Nationalité",m.nationalite||e.nationalite||""],
    ["Lieu de naissance",m.lieuNaissance||e.lieuNaissance||""],
    ["Catégorie",m.categorie||""],
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
const exportXLSX=async(sheets,fname)=>{const XLSX=await loadXLSX();const wb=XLSX.utils.book_new();(sheets.length?sheets:[{name:"Aucun",rows:[["Aucune donnée"]]}]).forEach(({name,rows})=>XLSX.utils.book_append_sheet(wb,mkSheet(rows),sheetName(name)));XLSX.writeFile(wb,fname);};

const H_INS = ["Référence","Saison","Date préinscription","Type licence","Statut dossier","Validé/payé le","Nom","Prénom","Naissance","Sexe","Nationalité","Lieu naiss.","Adresse","CP","Ville","Téléphone contact","Email contact","Catégorie licence","Catégorie admin","Structure","Poste","Ancien club","Mutation/autre club","N° Licence FFF","Resp. principal","Lien","Tél resp.","Email resp.","Autres resp.","Mutuelle","Médecin","Tél médecin","Allergies/asthme","Soins urgence","Droit image","Transport","Charte acceptée","Certif requis","Certif fourni","Photo ID","Justif.","RIB","Livret famille","Pièces fournies","Short","Chaussettes","Survêtement","Sweat RSG","Initiales","Famille","Membres famille","Détail membres","Licence €","Boutique permanence €","Boutique saison séparée €","Total à encaisser €","Mode paiement","Nb fois","Échéances","Notes secrétariat","Commentaire famille"];

const toRow=(e,tarifs=null)=>{
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const membres=membresDossier(e);
  const boutiquePerm=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaison=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const pieces=getPieces(tarifs).filter(p=>e[p.id]||e.piecesFournies?.[p.id]).map(p=>p.label).join(" | ");
  const echeances=(e.datesEcheances||[]).filter(Boolean).map((d,i)=>`${i+1}: ${fmtD(d)}`).join(" | ");
  const detailMembres=membres.map(m=>`${m.prenom} ${m.nom} (${adminCatValue(m)}, ${m.role})`).join(" | ");
  return[e.id,e.saison||"",fmtDT(e.datePreinscription),e.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[e.statut]?.l||"",fmtD(e.datePaiement||e.dateValidation),e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.lieuNaissance||"",e.adresse,e.codePostal,e.ville,getTelContact(e),getEmailContact(e),e.categorie,adminCatValue(e),structureType(e),e.poste||"",e.ancienClub||"",e.aJoueAutreClub?"Oui":"Non",e.numLicenceFFF||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.mutuelle||"",e.docteur||"",e.telDocteur||"",e.allergiesAsthme||e.allergies||"",e.autoSoins?"Oui":"Non",e.autoPhoto?"Oui":"Non",e.autoTransport?"Oui":"Non",e.charteAcceptee?"Oui":"Non",e.certifNeeded?"OUI":"OK",e.certifMedical?"Oui":"Non",e.photoId?"Oui":"Non",e.justifDom?"Oui":"Non",e.rib?"Oui":"Non",e.livretFamille?"Oui":"Non",pieces,e.tailleShort||"",e.tailleChaussettes||"",e.tailleSurvet||e["tailleSurvêtement"]||"",e.tailleSweat||"",formatInitiales(e,tarifs),e.nomFamille||"",membres.length,detailMembres,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,echeances,e.notes||"",e.commentaire||""];
};
const H_MEMBER=["Référence dossier","Saison","Date préinscription","Rang","Rôle dossier","Nom","Prénom","Catégorie admin","Catégorie licence","Structure","Type licence","Statut dossier","Validé/payé le","Naissance","Sexe","Nationalité","Lieu naiss.","N° licence FFF","Poste","Email contact","Téléphone contact","Adresse","CP","Ville","Resp. principal","Lien","Tél resp.","Email resp.","Autres resp.","Famille","Membres famille","Ancien club","Mutation/autre club","Certif requis","Certif fourni","Photo ID","Soins urgence","Droit image","Transport","Charte acceptée","Allergies/asthme","Short","Chaussettes","Survêtement","Sweat RSG","Initiales","Montant membre €","Licence dossier €","Boutique permanence €","Boutique saison séparée €","Total dossier €","Mode paiement","Nb fois","Échéances","Footclubs statut","Footclubs commentaire","Notes dossier"];
const memberRow=(m,tarifs=null)=>{
  const e=m.dossier||m;
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const boutiquePerm=e.achatsBoutique?calcBoutiqueTotal(e.achatsBoutique):(e.boutiqueTotal||0);
  const boutiqueSaison=calcBoutiqueSaisonTotal(e.achatsBoutique);
  const echeances=(e.datesEcheances||[]).filter(Boolean).map((d,i)=>`${i+1}: ${fmtD(d)}`).join(" | ");
  return[e.id||m.dossierId||"",e.saison||"",fmtDT(e.datePreinscription),m.idx??0,m.role||"",m.nom||"",m.prenom||"",adminCatValue(m),m.categorie||"",structureType(m),m.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[m.statut]?.l||"",fmtD(e.datePaiement||e.dateValidation),m.dateNaissance||"",m.sexe||"",m.nationalite||e.nationalite||"",m.lieuNaissance||e.lieuNaissance||"",m.numLicenceFFF||e.numLicenceFFF||"",m.poste||"",getEmailContact(e),getTelContact(e),e.adresse||"",e.codePostal||"",e.ville||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.nomFamille||"",countMembres(e),m.ancienClub||e.ancienClub||"",(m.aJoueAutreClub||e.aJoueAutreClub)?"Oui":"Non",m.certifNeeded?"Oui":"Non",m.certifMedical||e.certifMedical?"Oui":"Non",m.photoBase64||e.photoBase64||e.photoId?"Oui":"Non",m.autoSoins===false?"Non":"Oui",m.autoPhoto===false?"Non":"Oui",m.autoTransport===false?"Non":"Oui",e.charteAcceptee?"Oui":"Non",m.allergiesAsthme||e.allergiesAsthme||e.allergies||"",m.tailleShort||"",m.tailleChaussettes||"",getSurvet(m),m.tailleSweat||"",formatInitiales(m,tarifs),m.prix||0,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,(e.datesEcheances||[]).length?echeances:"",STATUTS_FOOTCLUBS[m.footclubsStatut||"a_integrer"]?.l||"",m.footclubsCommentaire||"",e.notes||""];
};
const H_BOUTIQUE=["Référence","Saison","Nom","Prénom","Catégorie joueur","Catégorie admin","Email","Téléphone","Famille","Contexte","Catégorie boutique","Article","Taille","Qté","Prix unit.","Initiales","Suppl. initiales","Total","Statut","Date achat","Date commande","Date réception","Date livraison","Note","Statut dossier"];
const boutiqueExportRow=({entry:e,achat:a},articles)=>[e.id,e.saison||"",e.nom,e.prenom,e.categorie,adminCatValue(e),getEmailContact(e),getTelContact(e),e.nomFamille||"",isAchatSaison(a)?"Commande saison séparée":"Permanence licence",getAchatCategorie(a,articles),a.nom,a.taille||"",a.quantite||1,a.prix||0,a.initialesTexte||"",a.supplementInitiales||0,achatTotal(a),STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"À régler",a.date?fmtD(a.date):"",a.dateCommande?fmtD(a.dateCommande):"",a.dateReception?fmtD(a.dateReception):"",a.dateLivraison?fmtD(a.dateLivraison):"",a.note||"",STATUTS[e.statut]?.l||""];
const H_LIC=["Nom","Prénom","N° Licence FFF","Catégorie","Sous-catégorie","Type licence","Né(e) le","Sexe","Email joueur","Téléphone joueur","Email représentant","Téléphone représentant","Représentant légal","Certif prochaine saison","Certif requis","Commentaire"];
const licRow=l=>[getLicValue(l,"n","nom"),getLicValue(l,"p","prenom"),getLicValue(l,"l","numLicence","numLicenceFFF"),catFromLic(l)||"",getLicValue(l,"sc","sousCategorie"),getLicValue(l,"tl","typeLicence"),getLicValue(l,"dn","dateNaissance"),getLicValue(l,"s","sexe"),getLicValue(l,"em","email"),getLicValue(l,"tel","telephone"),getLicValue(l,"em2","emailRl"),getLicValue(l,"tel2","telRl"),getLicValue(l,"rl","representant"),l.cm===true?"Non valide":l.cm===false?"Valide":"Inconnu",certifRequis(l)===true?"Oui":certifRequis(l)===false?"Non":"Inconnu",getLicValue(l,"commentaire","note")];

/* â•â• STYLES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const inp=err=>({width:"100%",boxSizing:"border-box",padding:"12px 14px",fontSize:15,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:12,outline:"none",background:C.W,color:C.N,fontFamily:FONT,WebkitAppearance:"none",appearance:"none",minHeight:46,boxShadow:"0 1px 2px rgba(15,23,42,.03)"});
const lbl={display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const BP={background:C.J,color:C.N,border:`1.5px solid ${C.Jd}`,borderRadius:12,padding:"12px 20px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 8px 18px rgba(245,200,0,.22)"};
const BS={background:C.W,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:12,padding:"12px 18px",fontWeight:800,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation",fontFamily:FONT,boxShadow:"0 4px 12px rgba(15,23,42,.05)"};
const G2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"};

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
  const [licencies,setLicencies]=useState([]);
  const [tarifs,setTarifs]=useState(TARIFS_DEFAUT);
  // État d'authentification admin (vrai si on a tapé le bon mot de passe sur cet appareil)
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

  // Sécurité : si on essaie d'accéder à /admin ou /permanence sans être loggé, on redirige vers /login
  const needsAuth=route==="admin"||route==="permanence"||route==="equipement";
  const showLogin=route==="login"||(needsAuth&&!adminAuth);

  return(
    <div style={{fontFamily:FONT,minHeight:"100vh",background:C.Gc,WebkitTextSizeAdjust:"100%"}}>
      <header style={{background:C.N,borderBottom:`4px solid ${C.J}`,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60,position:"sticky",top:0,zIndex:200,boxShadow:"0 10px 24px rgba(15,23,42,.18)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden",cursor:"pointer"}} onClick={()=>navigate("home")}>
          <img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover",background:C.J,flexShrink:0,boxShadow:"0 4px 10px rgba(0,0,0,.28)"}}/>
          <div style={{lineHeight:1.15}}>
            <div style={{color:C.J,fontWeight:950,fontSize:13,letterSpacing:0}}>REVEIL ST-GEREON</div>
            <div style={{color:"#cbd5e1",fontSize:11,fontWeight:700}}>Saison {effectiveSaison}{adminAuth&&route==="admin"?" · Admin":adminAuth&&route==="permanence"?" · Permanence":adminAuth&&route==="equipement"?" · Équipement":""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          {route!=="home"&&route!=="login"&&<button onClick={()=>navigate("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:10,padding:"7px 10px",fontWeight:850,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Retour</button>}
          {!adminAuth&&route!=="login"&&<button onClick={()=>navigate("login")} style={{background:C.J,color:C.N,border:"none",borderRadius:10,padding:"7px 11px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Bureau</button>}
          {adminAuth&&route==="admin"&&<button onClick={()=>navigate("equipement")} style={{background:"#0ea5e9",color:C.W,border:"none",borderRadius:10,padding:"7px 11px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Équipement</button>}
          {adminAuth&&route==="admin"&&<button onClick={()=>navigate("permanence")} style={{background:"#16a34a",color:C.W,border:"none",borderRadius:10,padding:"7px 11px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Permanence</button>}
          {adminAuth&&(route==="permanence"||route==="equipement")&&<button onClick={()=>navigate("admin")} style={{background:C.J,color:C.N,border:"none",borderRadius:10,padding:"7px 11px",fontWeight:900,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Admin</button>}
          {adminAuth&&<button onClick={logout} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:10,padding:"7px 10px",fontWeight:850,fontSize:11,cursor:"pointer",minHeight:36,fontFamily:FONT}}>Deconnexion</button>}
        </div>
      </header>
      {route==="home"&&<Home onForm={()=>navigate("form")} saison={publicSaison} tarifs={tarifs}/>}
      {route==="form"&&<Formulaire onDone={()=>navigate("home")} licencies={licencies} saison={publicSaison} tarifs={tarifs}/>}
      {showLogin&&(
        <div style={{maxWidth:360,margin:"48px auto 0",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:20}}><img src={`${import.meta.env.BASE_URL||"/"}rsg-logo.png`} alt="RSG" style={{width:68,height:68,borderRadius:"50%",objectFit:"cover",marginBottom:10}}/><h2 style={{margin:0,color:C.N,fontWeight:900,fontSize:20}}>Acces Secretariat</h2><p style={{color:C.G,fontSize:13,marginTop:4}}>Saison publique {publicSaison}</p></div>
            <label style={lbl}>Code d'accès</label>
            <input type="password" autoComplete="current-password" style={{...inp(pwErr),fontSize:18,letterSpacing:4,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:10}}>Code incorrect</div>}
            <button style={{...BP,width:"100%",marginTop:4}} onClick={tryLogin}>Entrer →</button>
          </div>
        </div>
      )}
      {route==="admin"&&adminAuth&&<Dashboard saison={saison} onSaisonChange={setSaison} publicSaison={publicSaison} onPublicSaisonChange={async s=>{
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
      {route==="equipement"&&adminAuth&&<Equipement saison={saison} tarifs={tarifs}/>}
    </div>
  );
}

/* â•â• HOME â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Home({onForm,saison,tarifs}){
  const remisesFamille=getRemisesFamille(tarifs);
  const showRemisesFamille=Object.values(remisesFamille).some(v=>Number(v)>0);
  return(
    <div style={{maxWidth:540,margin:"0 auto",padding:"24px 16px 64px"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:44,margin:"0 0 8px"}}>⚽</div>
        <h1 style={{fontSize:22,fontWeight:900,color:C.N,margin:"0 0 6px"}}>Préinscription RSG</h1>
        <div style={{display:"inline-block",background:C.J,color:C.N,padding:"3px 14px",borderRadius:20,fontWeight:800,fontSize:13,marginBottom:12}}>Saison {saison}</div>
        <p style={{color:C.G,fontSize:14,lineHeight:1.6,margin:"0 0 20px"}}>Bienvenue au Réveil Saint-Géréon !<br/>Quelques minutes suffisent pour vous préinscrire.</p>
        <button style={{...BP,fontSize:18,padding:"16px 32px",borderRadius:12,boxShadow:`0 6px 20px ${C.J}55`,width:"100%"}} onClick={onForm}>🚀 C'est parti !</button>
        <p style={{color:C.R,fontSize:12,lineHeight:1.5,margin:"10px 0 0",fontWeight:800}}>La validation finale se fera lors de la permanence de licence après réception du paiement.</p>
      </div>

      {/* Grille des tarifs */}
      <div style={{background:C.W,borderRadius:12,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.J,fontWeight:800,fontSize:13}}>💰 Tarifs saison {saison}</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {orderedTarifEntries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,alignItems:"center",padding:"7px 10px",background:C.Gc,borderRadius:7}}>
                <span style={{minWidth:0}}>
                  <span style={{display:"block",fontSize:12,fontWeight:800,color:C.N,lineHeight:1.15}}>{catLabel(cat)}</span>
                  {catBirthText(cat,saison)&&<span style={{display:"block",fontSize:10.5,fontWeight:700,color:C.G,lineHeight:1.2,marginTop:2}}>{catBirthText(cat,saison)}</span>}
                </span>
                <span style={{fontSize:14,fontWeight:900,color:prix===0?C.V:C.J}}>{prix===0?"GRATUIT":`${prix} €`}</span>
              </div>
            ))}
          </div>
          {showRemisesFamille&&<div style={{marginTop:10,padding:"8px 10px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,fontSize:12,color:"#1e40af"}}>
            <strong>Tarif famille</strong> — à partir du 2ème membre (enfants ET adultes)<br/>
            {Object.entries(remisesFamille).map(([rang,pct])=><span key={rang}>{rang==="4"?"4ème et + ":`${rang}ème `}: <strong>-{pct}%</strong>{rang!=="4"?" · ":""}</span>)}
          </div>}
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

  // Recherche du licencié dans la base Footclubs
  const licDetect=(f.numLicenceFFF||(f.nom.length>1&&f.prenom.length>1))?lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF):null;
  const lic=f.typeLicence==="renouvellement"?licDetect:null;
  // Dirigeant non-arbitre = exempté de certif médical
  const estDirigeantNonArbitre=f.categorie==="Dirigeant"&&!f.dirigeantArbitre;
  const certifReq=estDirigeantNonArbitre?false:(f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic):null));
  const certifMsg=estDirigeantNonArbitre
    ?{ok:true,txt:"Pas de certificat médical requis pour les dirigeants (sauf si arbitrage)."}
    :f.typeLicence==="nouvelle"
      ?{ok:false,txt:"Nouvelle licence au club → certificat médical obligatoire. Prenez rendez-vous dès maintenant !!!!!!!"}
      :(!lic?null:(certifReq===true
        ?{ok:false,txt:`Selon Footclubs, votre certificat médical n'est pas valide pour la saison ${saison} → RDV médecin obligatoire. Prenez rendez-vous dès maintenant !!!!!!!`}
        :certifReq===false
          ?{ok:true,txt:`Certificat médical valide pour la saison ${saison} ✓ (vous remplirez juste le questionnaire de santé)`}
          :null));

  // Calcul du tarif TOTAL famille (joueur principal + frères/sœurs + adultes)
  // Remise progressive : 1er plein tarif, 2ème -10%, 3ème -20%, 4ème+ -30%
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
  const {detail:detailPrix,total:prixLicences}=calcDetailFamille();
  const nbInitialesEquipements=[
    f,
    ...f.freresSoeurs,
    ...f.adultesFamille,
  ].reduce((s,m)=>s+countInitiales(m,tarifs),0);
  const supplementInitiales=nbInitialesEquipements*getCoutInitiales(tarifs);
  const prixFinalTotal=prixLicences+supplementInitiales;

  // Tarif individuel du joueur principal seul (1er rang)
  const tarifBase=f.categorie?(tarifs[f.categorie]||0):0;

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
    const match=lookupLic(licencies,"","",f.numLicenceFFF);
    if(match)applyLicencie(match);
  },[f.numLicenceFFF,licencies,saison]);
  useEffect(()=>{
    if(f.typeLicence==="nouvelle"&&licDetect){
      setF(p=>({...p,typeLicence:"renouvellement"}));
    }
  },[f.typeLicence,licDetect]);
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
      const manquants=getDotationCat(tarifs,f.categorie).filter(item=>!f[item.id]).map(item=>item.label);
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
      const missingPhotos=[
        ...f.freresSoeurs.filter(m=>!m.photoBase64).map(m=>m.prenom||m.nom||"un enfant"),
        ...f.adultesFamille.filter(m=>!m.photoBase64).map(m=>m.prenom||m.nom||"un adulte"),
      ];
      if(missingPhotos.length)e.famillePhotos=`Photo d'identité obligatoire pour : ${missingPhotos.join(", ")}`;
    }
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

  const addFrere=()=>set("freresSoeurs",[...f.freresSoeurs,{typeLicence:"nouvelle",numLicenceFFF:"",nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},photoBase64:""}]);
  const updFrere=(i,k,v)=>{const r=[...f.freresSoeurs];r[i]={...r[i],[k]:v};
    // auto-cat si date naissance change
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    const lic=lookupLic(licencies,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&r[i].typeLicence==="nouvelle")r[i].typeLicence="renouvellement";
    set("freresSoeurs",r);
  };
  const delFrere=i=>set("freresSoeurs",f.freresSoeurs.filter((_,j)=>j!==i));

  const addAdulte=()=>set("adultesFamille",[...f.adultesFamille,{typeLicence:"nouvelle",numLicenceFFF:"",nom:"",prenom:"",dateNaissance:"",sexe:"",nationalite:"Française",categorie:"Senior",tel:"",email:"",ancienClub:"",aJoueAutreClub:false,allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",initialesEquipement:false,initialesTexte:"",initialesEquipementItems:{},photoBase64:""}]);
  const updAdulte=(i,k,v)=>{const r=[...f.adultesFamille];r[i]={...r[i],[k]:v};
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    const lic=lookupLic(licencies,r[i].nom||"",r[i].prenom||"",r[i].numLicenceFFF||"");
    if(lic&&r[i].typeLicence==="nouvelle")r[i].typeLicence="renouvellement";
    set("adultesFamille",r);
  };
  const delAdulte=i=>set("adultesFamille",f.adultesFamille.filter((_,j)=>j!==i));
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

  const submit=async()=>{
    if(!validate())return;
    setSaving(true);
    const id=genId();
    const entry={
      id,...f,
      modePaiements:selectedModes,
      modePaiement:selectedModes[0]||"",
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
            <TypeCard sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon="🔄" title="Renouvellement au club" sub="J'étais licencié(e) au RSG la saison passée"/>
            <TypeCard sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon="✨" title="Nouvelle licence au club" sub="Je m'inscris pour la première fois au RSG ou je reviens"/>
          </div>
          {f.typeLicence==="renouvellement"&&<div style={{background:"#dcfce7",border:`1px solid #86efac`,borderRadius:8,padding:"10px 12px",fontSize:13,color:C.V}}>
            ✅ Parfait ! Le secrétariat vérifiera votre certificat médical d'après notre base. Si besoin, on vous le redemandera.
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af"}}>
            👋 Bienvenue au RSG ! Pour une première licence ou un retour, le certificat médical est obligatoire (il vous sera demandé en permanence).
          </div>}
        </div>}

        {/* STEP 2 - Joueur + Photo */}
        {step===stepIdx.joueur&&<div>
          {age!==null&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:isMajeur?"#dbeafe":"#dcfce7",fontSize:13,fontWeight:600,color:isMajeur?C.B:C.V}}>{isMajeur?"🧑 Joueur majeur":"👶 Joueur mineur — un représentant légal sera demandé à l'étape suivante"}</div>}
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
            <F label="N° licence FFF (facultatif)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Ex: 86297823"/></F>
            <LicenceHelp/>
            {lic&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>✓ Licencié retrouvé : les champs disponibles sont remplis automatiquement.</div>}
            {licDetect&&f.typeLicence==="renouvellement"&&<div style={{fontSize:12,color:C.V,fontWeight:700}}>✓ Joueur déjà au club détecté : l'inscription est traitée en renouvellement.</div>}
          </div>
          <div style={{fontSize:12,color:"#0369a1",lineHeight:1.4,marginTop:-4,marginBottom:10}}>
            Info : si vous renseignez votre numéro de licence, les informations connues peuvent préremplir automatiquement les autres champs.
          </div>
          <div style={G2}>
            <F label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="family-name"/></F>
            <F label="Prénom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)} autoCapitalize="words" autoComplete="given-name"/></F>
            <F label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>set("dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
            <F label="Sexe *" err={errs.sexe}><select style={inp(errs.sexe)} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
            <F label="Lieu de naissance"><input style={inp()} value={f.lieuNaissance} onChange={e=>set("lieuNaissance",e.target.value)} placeholder="Ville"/></F>
            <F label="Nationalité *"><select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
          </div>
          {f.nationalite==="Autre"&&<F label="Précisez"><input style={inp()} value={f.nationaliteAutre} onChange={e=>set("nationaliteAutre",e.target.value)}/></F>}
          <AdresseInput adresse={f.adresse} cp={f.codePostal} ville={f.ville} onAdresse={v=>set("adresse",v)} onCP={v=>set("codePostal",v)} onVille={v=>set("ville",v)} errA={errs.adresse} errCP={errs.codePostal} errV={errs.ville}/>
          {isMajeur&&<div style={G2}><F label="Téléphone *" err={errs.telephone}><input type="tel" style={inp(errs.telephone)} value={f.telephone} onChange={e=>set("telephone",e.target.value)} inputMode="tel" autoComplete="tel"/></F><F label="Email *" err={errs.email}><input type="email" style={inp(errs.email)} value={f.email} onChange={e=>set("email",e.target.value)} inputMode="email" autoComplete="email"/></F></div>}
          <div style={G2}>
            <F label="Catégorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={f.categorie} onChange={e=>set("categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{catOptionLabel(c,saison)}</option>)}</select>{f.dateNaissance&&<span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>✓ Détectée auto.</span>}</F>
            <F label="Poste"><select style={inp()} value={f.poste} onChange={e=>set("poste",e.target.value)}><option value="">— Choisir</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></F>
          </div>
          {["U14-U15","U16-U17-U18","Senior","Vétéran"].includes(f.categorie)&&<div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",marginBottom:10}}>
            <Chk checked={f.doubleLicenceDirigeant} onChange={v=>set("doubleLicenceDirigeant",v)} label="Je souhaite aussi une licence dirigeant en complément de ma licence joueur"/>
          </div>}
          {f.categorie&&<div style={{background:f.categorie==="Dirigeant"?"#dcfce7":C.Jp,border:`1px solid ${f.categorie==="Dirigeant"?"#86efac":C.Jd}`,borderRadius:8,padding:"10px 12px",fontSize:13,marginBottom:8}}>
            {f.categorie==="Dirigeant"
              ?<span style={{color:C.V,fontWeight:700}}>🎉 Licence dirigeant <strong>GRATUITE</strong> · pas de certificat médical requis (sauf si arbitrage)</span>
              :<span>💰 Tarif {f.categorie} : <strong>{tarifs[f.categorie]||0} €</strong></span>
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
          {certifMsg&&<div style={{marginBottom:14,borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅ ":"🩺 "}{certifMsg.txt}</div>}
          {certifReq&&<div style={{background:"#f0f9ff",border:"1px solid #7dd3fc",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#0369a1",marginBottom:12}}>
            Certificat médical à faire remplir par le médecin : <a href={`${import.meta.env.BASE_URL||"/"}certificat_medical_2026_2027.pdf`} target="_blank" rel="noreferrer" style={{color:"#0369a1",fontWeight:800}}>ouvrir le PDF</a>. <strong>Prendre rendez-vous dès maintenant !!!!!!!</strong>
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
          <EquipFields member={f} categorie={f.categorie} tarifs={tarifs} required onChange={(k,v)=>set(k,v)}/>
        </div>}

        {/* STEP famille + documents */}
        {step===stepIdx.famille&&<div>
          {errs.famillePhotos&&<ErrB msg={errs.famillePhotos}/>}
          {/* Frères / sœurs mineurs */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:C.N,fontWeight:800,fontSize:15,margin:"0 0 6px"}}>{enfantsFamilleLabel}</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Si plusieurs membres de la famille s'inscrivent, ajoutez-les ici. Chaque membre peut être en renouvellement ou en nouvelle licence, et bénéficie de la <strong>remise famille</strong>.</p>
            {f.freresSoeurs.map((m,i)=>(
              <div key={i} style={{background:C.Jp,border:`1.5px solid ${C.Jd}`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13}}>{isMajeur?"Enfant":"Frère/Sœur"} n°{i+1}</strong>
                  <button onClick={()=>delFrere(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence"><select style={inp()} value={m.typeLicence||"nouvelle"} onChange={e=>updFrere(i,"typeLicence",e.target.value)}><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  <F label="N° licence FFF"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updFrere(i,"numLicenceFFF",e.target.value)} onBlur={()=>applyLicencieToMember("freresSoeurs",i,lookupLic(licencies,m.nom||"",m.prenom||"",m.numLicenceFFF||""))} placeholder="Facultatif"/></F>
                  <div style={{gridColumn:"1 / -1"}}><LicenceHelp/></div>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updFrere(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom"><input style={inp()} value={m.prenom} onChange={e=>updFrere(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updFrere(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updFrere(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Catégorie" span><select style={inp()} value={m.categorie} onChange={e=>updFrere(i,"categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{catOptionLabel(c,saison)}</option>)}</select></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updFrere(i,"aJoueAutreClub",v)} label="A joué dans un autre club la saison dernière"/>
                  {m.aJoueAutreClub&&<F label="Club précédent"><input style={inp()} value={m.ancienClub||""} onChange={e=>updFrere(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updFrere(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <EquipFields member={m} categorie={m.categorie} tarifs={tarifs} onChange={(k,v)=>updFrere(i,k,v)}/>
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updFrere(i,"autoSoins",v)} label="🚑 Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updFrere(i,"autoPhoto",v)} label="📷 Droit à l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updFrere(i,"autoTransport",v)} label="Transport"/>
                </div>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>📸 Photo d'identité <span style={{color:C.R}}>*</span></p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updFrere(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addFrere} style={{...BS,width:"100%"}}>{ajouterEnfantLabel}</button>
          </div>

          {isMajeur&&f.freresSoeurs.length>0&&<div style={{marginBottom:18,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:10,padding:"12px"}}>
            <h3 style={{color:C.N,fontWeight:800,fontSize:15,margin:"0 0 6px"}}>Représentants légaux des enfants ajoutés</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Indiquez le rôle de l'adulte inscrit en premier s'il est représentant légal, et ajoutez si besoin un deuxième représentant légal.</p>
            {f.representants.slice(0,2).map((r,i)=>(
              <div key={i} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:12}}>{i===0?"Représentant légal principal":"Deuxième représentant légal"}</strong>
                  {i>0&&<button onClick={()=>delRep(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>}
                </div>
                <div style={G2}>
                  <F label="Rôle / lien avec l'enfant"><select style={inp()} value={r.lien} onChange={e=>updRep(i,"lien",e.target.value)}><option value="">— Choisir</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
                  <F label="Nom"><input style={inp()} value={r.nom} onChange={e=>updRep(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom"><input style={inp()} value={r.prenom} onChange={e=>updRep(i,"prenom",e.target.value)}/></F>
                  <F label="Téléphone"><input type="tel" style={inp()} value={r.tel} onChange={e=>updRep(i,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email" span><input type="email" style={inp()} value={r.email} onChange={e=>updRep(i,"email",e.target.value)} inputMode="email"/></F>
                </div>
              </div>
            ))}
            {f.representants.length<2&&<button onClick={addRep} style={{...BS,width:"100%"}}>+ Ajouter un 2ème représentant légal</button>}
          </div>}

          {/* Adultes de la famille */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:"#1e40af",fontWeight:800,fontSize:15,margin:"0 0 6px"}}>Adultes de la famille au club</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Parents joueurs (Vétérans), dirigeants, etc. La remise famille s'applique sur tous les membres confondus.</p>
            {f.adultesFamille.map((m,i)=>(
              <div key={i} style={{background:"#dbeafe",border:`1.5px solid #93c5fd`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13,color:"#1e40af"}}>Adulte n°{i+1}</strong>
                  <button onClick={()=>delAdulte(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Type de licence"><select style={inp()} value={m.typeLicence||"nouvelle"} onChange={e=>updAdulte(i,"typeLicence",e.target.value)}><option value="renouvellement">Renouvellement au RSG</option><option value="nouvelle">Nouvelle licence / retour</option></select></F>
                  <F label="N° licence FFF"><input style={inp()} value={m.numLicenceFFF||""} onChange={e=>updAdulte(i,"numLicenceFFF",e.target.value)} onBlur={()=>applyLicencieToMember("adultesFamille",i,lookupLic(licencies,m.nom||"",m.prenom||"",m.numLicenceFFF||""))} placeholder="Facultatif"/></F>
                  <div style={{gridColumn:"1 / -1"}}><LicenceHelp/></div>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updAdulte(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom"><input style={inp()} value={m.prenom} onChange={e=>updAdulte(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updAdulte(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updAdulte(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Nationalité"><select style={inp()} value={m.nationalite} onChange={e=>updAdulte(i,"nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
                  <F label="Catégorie"><select style={inp()} value={m.categorie} onChange={e=>updAdulte(i,"categorie",e.target.value)}><option value="">—</option>{CATS.filter(c=>["Senior","Vétéran","Dirigeant"].includes(c.v)).map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                  <F label="Téléphone"><input type="tel" style={inp()} value={m.tel} onChange={e=>updAdulte(i,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email"><input type="email" style={inp()} value={m.email} onChange={e=>updAdulte(i,"email",e.target.value)} inputMode="email"/></F>
                </div>
                {m.typeLicence==="nouvelle"&&<div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                  <Chk checked={m.aJoueAutreClub} onChange={v=>updAdulte(i,"aJoueAutreClub",v)} label="A joué dans un autre club la saison dernière"/>
                  {m.aJoueAutreClub&&<F label="Club précédent"><input style={inp()} value={m.ancienClub||""} onChange={e=>updAdulte(i,"ancienClub",e.target.value)} placeholder="Nom du club"/></F>}
                </div>}
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updAdulte(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <EquipFields member={m} categorie={m.categorie} tarifs={tarifs} onChange={(k,v)=>updAdulte(i,k,v)}/>
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updAdulte(i,"autoSoins",v)} label="🚑 Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updAdulte(i,"autoPhoto",v)} label="📷 Droit à l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updAdulte(i,"autoTransport",v)} label="Transport"/>
                </div>
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
                <span>{d.rang===1?"Joueur principal":`Membre ${d.rang}`} ({d.categorie})</span>
                <span>
                  {d.pct>0?<span style={{color:"#9ca3af",textDecoration:"line-through",marginRight:6}}>{d.base}€</span>:null}
                  <strong style={{color:d.pct>0?"#86efac":C.J}}>{d.prix}€</strong>
                  {d.pct>0&&<span style={{fontSize:11,color:"#86efac",marginLeft:4}}>(-{d.pct}%)</span>}
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
          <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:13,color:"#713f12"}}>✋ Vérifiez avant d'envoyer.</div>
          {certifMsg&&<div style={{marginBottom:10,borderRadius:8,padding:"8px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅":"🩺"} {certifMsg.txt}</div>}

          <RB title="Licence">
            <RR l="Type" v={f.typeLicence==="renouvellement"?"🔄 Renouvellement au club":"✨ Nouvelle licence au club"}/>
            {f.numLicenceFFF&&<RR l="N° FFF" v={f.numLicenceFFF}/>}
          </RB>

          <RB title="Joueur principal">
            <RR l="Identité" v={`${f.prenom} ${f.nom}`}/>
            <RR l="Naissance" v={`${fmtD(f.dateNaissance)}${f.lieuNaissance?" — "+f.lieuNaissance:""}`}/>
            <RR l="Catégorie" v={f.categorie}/>
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

          <RB title="Équipement">
            <RR l="Short" v={f.tailleShort||"—"}/>
            <RR l="Chaussettes" v={f.tailleChaussettes||"—"}/>
            {f.tailleSweat&&<RR l="Sweat RSG" v={f.tailleSweat}/>}
            {f.tailleSurvet&&<RR l="Survêtement" v={f.tailleSurvet}/>}
          </RB>

          {f.freresSoeurs.length>0&&<RB title={`${isMajeur?"Enfants":"Frères/sœurs"} (${f.freresSoeurs.length})`}>
            {f.freresSoeurs.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom} · ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
          </RB>}

          {f.adultesFamille.length>0&&<RB title={`Adultes famille (${f.adultesFamille.length})`}>
            {f.adultesFamille.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom} · ${(m.typeLicence||"nouvelle")==="renouvellement"?"Renouvellement":"Nouvelle licence"}`}/>)}
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
            {certifReq&&<a href={`${import.meta.env.BASE_URL||"/"}certificat_medical_2026_2027.pdf`} target="_blank" rel="noreferrer" style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e",marginRight:10}}>Télécharger le certificat médical</a>}
            <a href={`${import.meta.env.BASE_URL||"/"}Charte_RSG_2026-2027.pdf`} target="_blank" rel="noreferrer" style={{display:"inline-block",fontSize:12,fontWeight:700,color:"#92400e"}}>Lire la charte RSG</a>
          </div>

          <div style={{background:errs.charteAcceptee?"#fee2e2":"#f0fdf4",border:`1px solid ${errs.charteAcceptee?"#fca5a5":"#86efac"}`,borderRadius:10,padding:"12px",marginBottom:10}}>
            <Chk checked={f.charteAcceptee} onChange={v=>set("charteAcceptee",v)} err={errs.charteAcceptee} label={<span>J'ai lu et j'accepte la <a href={`${import.meta.env.BASE_URL||"/"}Charte_RSG_2026-2027.pdf`} target="_blank" rel="noreferrer" style={{color:C.N,fontWeight:800}}>charte RSG</a>.</span>}/>
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
          {step<total&&<button style={BP} onClick={next}>Suivant →</button>}
          {step===total&&<button style={{...BP,opacity:saving?.7:1}} onClick={submit} disabled={saving}>{saving?"Envoi…":"✓ Envoyer"}</button>}
        </div>
      </div>
    </div>
  );
}


/* â•â• CONFIRMATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function Confirmation({refId,prenom,nom,saison,prixFinal,modePaiement,modePaiements,nbFois,echeances,datesEcheances,entry,tarifs,fbOk,fbErrMsg,onNew,onDone}){
  const modesLabel=paiementLabels(modePaiements,modePaiement,tarifs).join(" + ");
  const modeObj=getModesPaiement(tarifs).find(m=>m.id===(Array.isArray(modePaiements)&&modePaiements.length?modePaiements[0]:modePaiement));
  const aDesMembresFamille=(entry?.freresSoeurs?.length||0)+(entry?.adultesFamille?.length||0)>0;
  const docs=getDocsAApporter(entry||{},entry?.certifNeeded,aDesMembresFamille,tarifs);
  const permanences=getPermanences(tarifs);
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
          {permanences.map((p,i)=><li key={i}>{fmtPermanence(p)}</li>)}
        </ul>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {entry&&<button style={BS} onClick={()=>printRecap(entry,saison,prixFinal,modeObj,echeances,datesEcheances,entry.certifNeeded,aDesMembresFamille,tarifs)}>Imprimer</button>}
        <button style={BS} onClick={onDone}>Accueil</button>
        <button style={BP} onClick={onNew}>Nouvelle préinscription</button>
      </div>
    </div>
  </div>;
}

/* â•â• DASHBOARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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

  // Écoute en temps réel sur Firestore (les nouvelles préinscriptions apparaissent automatiquement)
  useEffect(()=>{
    if(!isFirebaseAvailable()){setFbStatus("offline");return;}
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      // Fusion intelligente : on prend Firebase comme source de vérité
      // mais on garde les éventuelles données locales non syncées (id absent côté Firebase)
      stGet(keyIns(saison)).then(async(local)=>{
        const localArr=Array.isArray(local)?local:[];
        const fbIds=new Set(fbData.map(e=>e.id));
        const onlyLocal=localArr.filter(e=>!fbIds.has(e.id));
        // Resynchronisation : on tente d'envoyer les éventuelles entrées locales manquantes
        for(const e of onlyLocal){
          try{await fbSaveInscription(saison,e);}catch{}
        }
        const merged=[...fbData];
        // Trier par date desc (au cas où)
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
    if(!window.confirm("Supprimer définitivement ?"))return;
    const d=(await stGet(keyIns(saison))||[]).filter(e=>e.id!==id);
    await stSet(keyIns(saison),d);
    setData(d);
    if(sel?.id===id)setSel(null);
    if(isFirebaseAvailable()){try{await fbDeleteInscription(saison,id);}catch(e){console.error(e);}}
  };

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
          {label:"Jeunes",members:true,filter:m=>["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(m.categorie)},
          {label:"Ados",members:true,filter:m=>["U12-U13","U14-U15","U16-U17-U18"].includes(m.categorie)},
          {label:"Adultes",members:true,filter:m=>["Senior","Vétéran"].includes(m.categorie)},
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
          return[e.id,e.saison||saison,STATUTS[e.statut]?.l||"",e.nom,e.prenom,e.categorie,adminCatValue(e),getEmailContact(e),getTelContact(e),e.nomFamille||"",nbMembres,e.prixFinal||0,boutiquePerm,boutiqueSaison,calcTotalDossier(e)||0,paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),e.nbFois||1,e.datesEcheances?.[0]||"",e.datesEcheances?.[1]||"",e.datesEcheances?.[2]||"",e.datesEcheances?.[3]||"",fmtD(e.datePaiement||e.dateValidation),e.notes||""];
        })]}],fn+"Paiements.xlsx");
      }
      else if(type==="equip"){const rows=tousMembresDossiers(data).filter(m=>m.statut!=="refuse"&&(equipCat==="toutes"||adminCatValue(m)===equipCat)).sort((a,b)=>catRank(adminCatValue(a))-catRank(adminCatValue(b))||(a.nom||"").localeCompare(b.nom||"")).map(m=>memberRow(m,tarifs));await exportXLSX([{name:"Dotation licence",rows:[H_MEMBER,...rows]}],fn+(equipCat==="toutes"?"DotationLicence.xlsx":`Dotation_${equipCat.replace(/[^a-z0-9]+/gi,"_")}.xlsx`));}
      else if(type==="certifs")await exportXLSX([{name:"Préinscrits",rows:[H_MEMBER,...tousMembresDossiers(data).filter(m=>m.certifNeeded).map(m=>memberRow(m,tarifs))]},{name:"Base Footclubs",rows:[H_LIC,...licencies.filter(l=>certifRequis(l)===true).map(licRow)]}],fn+"Certifs.xlsx");
      else if(type==="contacts")await exportXLSX([{name:"Contacts",rows:[["Référence","Saison","Date préinscription","Statut","Nom","Prénom","Catégorie licence","Catégorie admin","Email contact","Téléphone contact","Adresse","CP","Ville","Responsable principal","Lien","Tél resp.","Email resp.","Autres responsables","Famille","Membres dossier","Détail membres","Mode paiement","Total dossier €","Notes"],...data.map(e=>{const r=getResp1(e);const autres=(e.representants||[]).slice(1).filter(x=>x?.nom).map(x=>`${x.prenom||""} ${x.nom||""} (${x.lien||""}) ${x.tel||""} ${x.email||""}`).join(" | ");const membres=membresDossier(e);return[e.id,e.saison||saison,fmtDT(e.datePreinscription),STATUTS[e.statut]?.l||"",e.nom,e.prenom,e.categorie,adminCatValue(e),getEmailContact(e),getTelContact(e),e.adresse||"",e.codePostal||"",e.ville||"",r?`${r.prenom||""} ${r.nom||""}`.trim():"",r?.lien||"",r?.tel||"",r?.email||"",autres,e.nomFamille||"",membres.length,membres.map(m=>`${m.prenom} ${m.nom} (${adminCatValue(m)})`).join(" | "),paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + "),calcTotalDossier(e)||0,e.notes||""];})]}],fn+"Contacts.xlsx");
      else if(type==="licencies")await exportXLSX([{name:"Base licenciés",rows:[H_LIC,...licencies.map(licRow)]}],fn+"BaseLicencies.xlsx");
      else if(type==="boutique"){
        const articles=getBoutique(tarifs);
        const rows=getAchatsBoutiqueRows(data).map(r=>boutiqueExportRow(r,articles));
        const members=tousMembresDossiers(data).map(m=>{const achats=m.dossier.achatsBoutique||[];const aRegler=achats.filter(a=>(a.statut||"a_regler")==="a_regler").reduce((s,a)=>s+achatTotal(a),0);return[m.dossierId,m.nom,m.prenom,adminCatValue(m),structureType(m),EQUIP_FIELDS.map(f=>`${EQUIP_LABELS[f]} ${f==="tailleSurvet"?getSurvet(m):(m[f]||"-")}`).join(" · "),achats.map(a=>`${a.nom} ${a.taille||""} (${STATUTS_BOUTIQUE[a.statut||"a_regler"]?.l||"À régler"})`).join(" · "),aRegler];});
        await exportXLSX([{name:"Commandes",rows:[H_BOUTIQUE,...rows]},{name:"Vue membres",rows:[["Référence","Nom","Prénom","Catégorie foot","Type","Dotation licence","Commandes hors dotation","Reste à payer"],...members]}],fn+"Boutique.xlsx");
      }
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  const equipData={};
  tousMembresDossiers(data).filter(m=>m.statut!=="refuse").forEach(m=>{
    const cat=adminCatValue(m);
    if(!equipData[cat])equipData[cat]={joueurs:[]};
    equipData[cat].joueurs.push(m);
    EQUIP_FIELDS.forEach(field=>{
      const value=field==="tailleSurvet"?getSurvet(m):m[field];
      if(!value)return;
      equipData[cat][field]=equipData[cat][field]||{};
      equipData[cat][field][value]=(equipData[cat][field][value]||0)+1;
    });
  });
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
  const licencesReglees=tousMembresDossiers(data).filter(m=>m.statut==="valide"||m.statut==="paye");
  const footclubsCounts=STATUT_FOOTCLUBS_ORDER.map(k=>({k,...STATUTS_FOOTCLUBS[k],count:licencesReglees.filter(m=>(m.footclubsStatut||"a_integrer")===k).length}));
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
        <button onClick={runDiagnostic} style={{background:C.W,color:C.N,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"8px 10px",fontSize:11,cursor:"pointer",fontWeight:850,fontFamily:FONT}}>Diagnostic</button>
        <button onClick={refresh} style={{background:C.W,color:C.N,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"8px 10px",fontSize:11,cursor:"pointer",fontWeight:850,fontFamily:FONT}}>Recharger</button>
        <a href={`${import.meta.env.BASE_URL||"/"}wiki-admin.html`} target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,textDecoration:"none",background:C.N,color:C.J,border:"1px solid #111827",borderRadius:12,padding:"11px 14px",fontSize:13,fontWeight:950,boxShadow:"0 8px 20px rgba(15,23,42,.16)"}}>
          Wiki admin
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
        {id:"dashboard",l:"Dashboard"},
        {id:"liste",l:"Liste"},
        {id:"parCat",l:"Categories"},
        {id:"parType",l:"Types"},
        {id:"familles",l:"Familles & multi-licences"},
        {id:"mutations",l:"Mutations"},
        {id:"nonpreins",l:"Manquants"},
        {id:"paiements",l:"Paiements"},
        {id:"equip",l:"Dotation licence"},
        {id:"certifs",l:"Certificats"},
        {id:"boutique",l:"Boutique"},
        {id:"exports",l:"Exports"},
        {id:"footclubs",l:"Footclubs"},
        {id:"tarifs",l:"Configuration"},
        {id:"base",l:`Base (${licencies.length})`}
      ].map(({id,l})=>(
        <button key={id} onClick={()=>{setTab(id);setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),0);}} style={{width:isMobile?"auto":"100%",flex:isMobile?"0 0 auto":undefined,textAlign:"left",padding:"8px 12px",border:"none",borderRadius:12,fontWeight:tab===id?800:600,fontSize:12,cursor:"pointer",background:tab===id?C.J:"transparent",color:tab===id?C.N:C.G,whiteSpace:isMobile?"nowrap":"normal",minHeight:34,boxShadow:tab===id?"0 8px 18px rgba(245,200,0,.20)":"none",transition:"background .15s ease, color .15s ease",fontFamily:FONT}}>{l}</button>
      ))}
    </div>

    <div style={{minWidth:0}}>
    {!["dashboard","tarifs"].includes(tab)&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
      <button onClick={()=>doExport(tab==="paiements"?"paiements":tab==="equip"?"equip":tab==="boutique"?"boutique":tab==="certifs"?"certifs":tab==="footclubs"?"all":tab==="base"?"licencies":tab==="parCat"?"parEquipe":tab==="parType"?"parType":"all")} disabled={exporting} style={{...BS,fontSize:12,padding:"8px 12px",background:C.W}}>
        {exporting?"Export...":"Export Excel de cet onglet"}
      </button>
    </div>}
    {tab==="dashboard"&&<ViewDashboard data={data} saison={saison}/>}

    {/* LISTE */}
    {tab==="liste"&&<>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        <input style={{...inp(),fontSize:14}} placeholder="Nom, prenom, email, reference..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{val:fSt,set:setFSt,opts:[{v:"tous",l:"Tous statuts"},...STATUT_ORDER.map(k=>({v:k,l:STATUTS[k].l}))]},{val:fCat,set:setFCat,opts:[{v:"toutes",l:"Toutes cat."},..."Babyfoot,U6/U7,U8/U9,U10/U11M,U10/U11F,U12/U13M,U12/U13F,U14/U15M,U14/U15F,U16/U17/U18M,U16/U17/U18F,Seniors M,Seniors F,Vétérans,Dirigeants".split(",").map(c=>({v:c,l:c}))]},{val:fType,set:setFType,opts:[{v:"tous",l:"Tous types"},{v:"renouvellement",l:"Renouvellements"},{v:"nouvelle",l:"Nouvelles"}]}].map((s,i)=>(
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
      {equipCatsShown.map(cat=>{const fields=equipData[cat];const joueurs=fields.joueurs||[];return <div key={cat} style={{background:C.W,borderRadius:12,padding:"14px 16px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
        <div style={{fontWeight:900,fontSize:16,marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"5px 10px",borderRadius:7,fontSize:13}}>{cat}</span>
          <span style={{color:C.G,fontSize:13}}>{joueurs.length} joueur(s)</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
          {EQUIP_FIELDS.map(field=>[field,EQUIP_LABELS[field]]).filter(([field])=>fields[field]).map(([field,label])=><div key={field} style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:16,padding:"12px 14px"}}>
            <p style={{fontSize:13,fontWeight:900,color:C.N,margin:"0 0 8px"}}>{label}</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(72px,1fr))",gap:6}}>
              {Object.entries(fields[field]).sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})).map(([sz,n])=><div key={sz} style={{background:C.W,border:`1px solid ${C.Jd}`,borderRadius:12,padding:"9px 10px",textAlign:"center",boxShadow:"0 4px 10px rgba(15,23,42,.04)"}}>
                <div style={{fontWeight:900,color:C.N,fontSize:13}}>{sz}</div>
                <div style={{fontSize:12,color:C.Jd,fontWeight:900}}>x {n}</div>
              </div>)}
            </div>
          </div>)}
        </div>
        <div style={{marginTop:10,background:C.Gc,borderRadius:10,padding:"10px 12px"}}>
          <p style={{fontSize:12,fontWeight:900,margin:"0 0 8px",color:C.N}}>Liste nominative</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:6}}>
            {joueurs.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={()=>setMemberSel(m)} style={{display:"grid",gridTemplateColumns:m.photoBase64?"34px minmax(0,1fr)":"minmax(0,1fr)",gap:8,alignItems:"center",background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px",cursor:"pointer",textAlign:"left",fontFamily:FONT}}>
              {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:34,height:34,borderRadius:8,objectFit:"cover"}}/>}
              <div style={{minWidth:0}}>
                <div style={{fontSize:12,fontWeight:900}}>{m.prenom} {m.nom}</div>
                <div style={{fontSize:11,color:C.G}}>{EQUIP_FIELDS.map(f=>`${EQUIP_LABELS[f]}: ${f==="tailleSurvet"?getSurvet(m):(m[f]||"-")}`).join(" · ")}{formatInitiales(m,tarifs)?` · Initiales: ${formatInitiales(m,tarifs)}`:""}</div>
              </div>
            </button>)}
          </div>
        </div>
      </div>;})}
    </div>}

    {/* PAIEMENTS */}
    {tab==="paiements"&&<div>
      <div style={{background:C.W,borderRadius:22,padding:"18px",marginBottom:12,border:`1px solid ${C.Gb}`,boxShadow:"0 14px 34px rgba(15,23,42,.06)"}}>
        <p style={{fontWeight:900,fontSize:16,margin:"0 0 14px",color:C.N}}>Recapitulatif paiements</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
          {getModesPaiement(tarifs).map(m=>[m.id,data.filter(d=>(Array.isArray(d.modePaiements)&&d.modePaiements.length?d.modePaiements:[d.modePaiement]).includes(m.id)).length,m.l]).map(([id,v,l])=>(
            <div key={l} style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:16,padding:"12px 14px",textAlign:"center"}}><div style={{fontWeight:950,fontSize:24,color:C.N}}>{v}</div><div style={{fontSize:12,color:C.G,fontWeight:850,marginTop:3}}>{l}</div></div>
          ))}
        </div>
        {/* Par mode */}
        {getModesPaiement(tarifs).map(m=>{
          const grp=data.filter(d=>(Array.isArray(d.modePaiements)&&d.modePaiements.length?d.modePaiements:[d.modePaiement]).includes(m.id));
          if(!grp.length)return null;
          return<div key={m.id} style={{marginBottom:12}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px",color:C.G}}>{m.l} - {grp.length} dossier(s) - {grp.reduce((s,d)=>s+calcTotalDossier(d),0)} € estime</p>
            {grp.sort((a,b)=>(a.nom||"").localeCompare(b.nom||"")).map(d=><div key={d.id} onClick={()=>{setSel(d);setNote(d.notes||"");}} style={{background:d.nbFois>1?"#fffbeb":C.Gc,border:`1px solid ${d.nbFois>1?"#fcd34d":C.Gb}`,borderLeft:`4px solid ${STATUTS[d.statut]?.c||C.G}`,borderRadius:14,padding:"11px 12px",marginBottom:7,fontSize:13,cursor:"pointer",display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
              <span><span style={{fontWeight:900,color:C.N}}>{d.prenom} {d.nom}</span> - {calcTotalDossier(d)} € en {d.nbFois}x{d.datesEcheances&&d.datesEcheances[0]?` - 1er encaissement ${fmtD(d.datesEcheances[0])}`:""}</span>
              {d.datesEcheances&&d.nbFois>1&&<div style={{marginTop:4,fontSize:11,color:"#92400e"}}>Échéances : {d.datesEcheances.map(dt=>fmtD(dt)).join(" · ")}</div>}
            </div>)}
          </div>;
        })}
      </div>
    </div>}

    {/* PERMANENCES */}
    {tab==="permanences"&&<div>
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
    {tab==="pieces"&&<div>
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
          {id:"boutique",l:"Boutique",d:"Achats et suivi commandes"},
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
          {id:"pieces",l:"Pièces"},
          {id:"acces",l:"Accès & paiements"},
          {id:"dotations",l:"Dotations"},
          {id:"attestation",l:"Attestation"},
          {id:"initiales",l:"Initiales"}
        ].map(x=><button key={x.id} onClick={()=>setConfigTab(x.id)} style={{border:"none",borderRadius:9,padding:"10px 12px",fontWeight:900,fontSize:13,cursor:"pointer",background:configTab===x.id?C.J:C.W,color:configTab===x.id?C.N:C.G,whiteSpace:"nowrap",fontFamily:FONT}}>{x.l}</button>)}
      </div>
      {(!editTarifs||["permanences","pieces"].includes(configTab))?(
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
            <p style={{fontSize:11,color:C.G,margin:"0 0 8px"}}>S'applique sur tous les membres de la famille (enfants ET adultes).</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(getRemisesFamille(tarifs)).map(([rang,pct])=><span key={rang} style={{background:C.Gc,padding:"5px 10px",borderRadius:6,fontSize:12,fontWeight:600}}>{rang==="4"?"4ème et +":`${rang}ème membre`} : <strong style={{color:C.V}}>-{pct}%</strong></span>)}
            </div>
          </div>}
          {configTab==="permanences"&&<div>
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
          {configTab==="acces"&&<>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Codes d'acces bureau</p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{getAccessCodes(tarifs).map(c=><span key={c} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 9px",fontSize:12,fontWeight:800}}>{c}</span>)}</div>
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
          {configTab==="initiales"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Initiales équipement</p>
            <p style={{fontSize:12,color:C.G,margin:0}}>Supplément configurable : <strong>{getCoutInitiales(tarifs)} €</strong></p>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{getChampsInitiales(tarifs).map(f=><span key={f} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"5px 9px",fontSize:12,fontWeight:800}}>{EQUIP_LABELS[f]||f}</span>)}</div>
          </div>}
          {configTab==="dotations"&&<div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Dotations equipement incluses avec la licence</p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:8}}>
              {CATS.map(c=><div key={c.v} style={{background:C.Gc,borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontWeight:900,fontSize:12,color:C.N}}>{c.l}</div>
                <div style={{fontSize:11,color:C.G,marginTop:3}}>{getDotationCat(tarifs,c.v).map(i=>i.label).join(" · ")||"Aucune dotation"}</div>
              </div>)}
            </div>
          </div>}
          {!["saisons","permanences","pieces"].includes(configTab)&&<button style={{...BP,width:"100%"}} onClick={()=>{setTmpTarifs({...tarifs,_remises:getRemisesFamille(tarifs),_accessCodes:getAccessCodes(tarifs),_dotations:getDotations(tarifs),_modesPaiement:getModesPaiement(tarifs)});setEditTarifs(true);}}>Modifier tarifs, remises, acces et dotations</button>}
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
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Remises famille (% a partir du nieme membre)</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[2,3,4].map(rang=>(
              <div key={rang} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{rang===4?"4e et +":rang+"ème"}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={tmpTarifs._remises?.[rang]||0} onChange={e=>setTmpTarifs(p=>({...p,_remises:{...(p._remises||{}),[rang]:Math.max(0,Math.min(100,parseInt(e.target.value)||0))}}))} min={0} max={100}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>%</span>
                </div>
              </div>
            ))}
          </div>
          </>}
          {configTab==="dotations"&&<>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Dotations par categorie (comprises avec la licence)</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:10,marginBottom:14}}>
            {CATS.map(c=>{
              const dot=(tmpTarifs._dotations||getDotations(tmpTarifs))[c.v]||[];
              const setDot=next=>setTmpTarifs(p=>({...p,_dotations:{...(p._dotations||getDotations(p)),[c.v]:next}}));
              return <div key={c.v} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:12,padding:"10px 12px"}}>
                <div style={{fontWeight:900,fontSize:13,marginBottom:8,color:C.N}}>{c.l}</div>
                {EQUIP_FIELDS.map(field=>{
                  const item=dot.find(x=>x.id===field)||{id:field,label:EQUIP_LABELS[field],actif:false,tailles:getTaillesCat(c.v)};
                  return <div key={field} style={{borderTop:`1px solid ${C.Gc}`,paddingTop:8,marginTop:8}}>
                    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,fontWeight:900,color:C.N,marginBottom:6}}>
                      <input type="checkbox" checked={item.actif!==false} onChange={e=>{
                        const next=dot.filter(x=>x.id!==field);
                        next.push({...item,actif:e.target.checked});
                        setDot(EQUIP_FIELDS.map(f=>next.find(x=>x.id===f)||{id:f,label:EQUIP_LABELS[f],actif:false,tailles:getTaillesCat(c.v)}));
                      }} style={{accentColor:C.J}}/>
                      {EQUIP_LABELS[field]}
                    </label>
                    <input style={{...inp(),fontSize:12,minHeight:38,padding:"8px 10px"}} value={(item.tailles||getTaillesCat(c.v)).join(", ")} onChange={e=>{
                      const next=dot.filter(x=>x.id!==field);
                      next.push({...item,tailles:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)});
                      setDot(EQUIP_FIELDS.map(f=>next.find(x=>x.id===f)||{id:f,label:EQUIP_LABELS[f],actif:false,tailles:getTaillesCat(c.v)}));
                    }} placeholder="Tailles séparées par des virgules"/>
                  </div>;
                })}
              </div>;
            })}
          </div>
          </>}
          {configTab==="acces"&&<>
          <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Codes d'acces bureau</p>
          <F label="Un code par ligne ou séparé par des virgules" span><textarea style={{...inp(),height:72,resize:"vertical"}} value={(tmpTarifs._accessCodes||getAccessCodes(tmpTarifs)).join("\n")} onChange={e=>setTmpTarifs(p=>({...p,_accessCodes:e.target.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)}))}/></F>
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
          {configTab==="initiales"&&
          <>
            <F label="Supplément initiales équipement (€)" span><input type="number" min={0} style={inp()} value={getCoutInitiales(tmpTarifs)} onChange={e=>setTmpTarifs(p=>({...p,_coutInitiales:Math.max(0,parseInt(e.target.value)||0)}))}/></F>
            <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"10px 12px",marginBottom:12}}>
              <p style={{fontWeight:900,fontSize:13,margin:"0 0 8px"}}>Équipements autorisant les initiales</p>
              <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Par défaut, les initiales sont désactivées sur short et chaussettes.</p>
              {EQUIP_FIELDS.map(field=><Chk key={field} checked={getChampsInitiales(tmpTarifs).includes(field)} onChange={v=>setTmpTarifs(p=>{const cur=getChampsInitiales(p);return{...p,_champsInitiales:v?[...new Set([...cur,field])]:cur.filter(x=>x!==field)};})} label={EQUIP_LABELS[field]}/>)}
            </div>
          </>
          }
          {configTab==="attestation"&&<>
          <F label="Template complet attestation licence (HTML autorisé)" span><textarea style={{...inp(),height:260,resize:"vertical",fontFamily:"Consolas, monospace",fontSize:12,lineHeight:1.45}} value={getAttestationTemplate(tmpTarifs)} onChange={e=>setTmpTarifs(p=>({...p,_attestationTemplate:e.target.value}))}/></F>
          <div style={{fontSize:11,color:C.G,margin:"-6px 0 12px",lineHeight:1.5}}>Variables disponibles : {"{prenom}"} {"{nom}"} {"{dateNaissance}"} {"{saison}"} {"{categorie}"} {"{reference}"} {"{montant}"} {"{datePaiement}"} {"{dateJour}"} {"{modePaiement}"}. Vous pouvez utiliser des balises HTML simples : &lt;br&gt;, &lt;strong&gt;, &lt;div class="box"&gt;, &lt;div class="meta"&gt;, &lt;div class="sig"&gt;.</div>
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
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8,marginBottom:12}}>
        {footclubsCounts.map(s=><div key={s.k} style={{background:s.bg,border:`1px solid ${s.c}44`,borderRadius:14,padding:"10px 12px"}}>
          <div style={{fontSize:22,fontWeight:900,color:s.c}}>{s.count}</div>
          <div style={{fontSize:12,fontWeight:900,color:s.c}}>{s.l}</div>
        </div>)}
      </div>
      {licencesReglees.length===0&&<p style={{textAlign:"center",color:C.G,padding:28,fontStyle:"italic",background:C.W,borderRadius:14,border:`1px solid ${C.Gb}`}}>Aucune licence réglée/validée à intégrer dans Footclubs.</p>}
      {licencesReglees.sort((a,b)=>catRank(a.categorie)-catRank(b.categorie)||(a.nom||"").localeCompare(b.nom||"")).map(m=>{
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
            {rows.filter(([,v])=>String(v||"").trim()).slice(0,18).map(([k,v])=><button key={k} title="Cliquer pour copier" onClick={()=>copyText(v)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px",textAlign:"left",cursor:"copy",fontFamily:FONT}}>
              <span style={{display:"block",fontSize:10,color:C.G,fontWeight:800,textTransform:"uppercase",marginBottom:2}}>{k}</span>
              <span style={{display:"block",fontSize:12,color:C.N,fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{v}</span>
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
      <DetailPanel e={sel} note={note} setNote={setNote} onUpd={upd} onDel={del} onChangeStatut={(id,st)=>upd(id,{statut:st,dateValidation:st==="valide"?new Date().toISOString():undefined,datePaiement:st==="valide"?new Date().toISOString():undefined})} tarifs={tarifs} onClose={()=>setSel(null)}/>
    </DetailModal>}
    {memberSel&&<DetailModal onClose={()=>setMemberSel(null)}>
      <MemberDetailPanel m={memberSel} tarifs={tarifs} onOpenDossier={()=>{setSel(memberSel.dossier);setNote(memberSel.dossier.notes||"");setMemberSel(null);}}/>
    </DetailModal>}
  </div>;
}

/* â•â• VUES PAR CATÉGORIE / PAR TYPE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function ViewDashboard({data,saison}){
  const membres=tousMembresDossiers(data);
  const totalMembres=membres.length;
  const ca=data.reduce((s,d)=>s+calcTotalDossier(d),0);
  const byCat=sortCats([...new Set(membres.map(m=>m.categorie).filter(Boolean))]).map(cat=>({cat,count:membres.filter(m=>m.categorie===cat).length}));
  const maxCat=Math.max(1,...byCat.map(x=>x.count));
  const byStatus=STATUT_ORDER.map(k=>({id:k,label:STATUTS[k].l,count:data.filter(d=>d.statut===k||(k==="valide"&&d.statut==="paye")).length,color:STATUTS[k].c,bg:STATUTS[k].bg}));
  const byType=[
    {label:"Renouvellements",count:membres.filter(m=>m.typeLicence==="renouvellement").length,color:C.B},
    {label:"Nouvelles",count:membres.filter(m=>m.typeLicence==="nouvelle").length,color:"#f97316"},
    {label:"Familles & multi-licences",count:data.filter(d=>countMembres(d)>1).length,color:C.V},
    {label:"Mutations",count:membres.filter(m=>m.aJoueAutreClub||m.dossier?.aJoueAutreClub).length,color:"#7c3aed"},
  ];
  const derniers=[...data].sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||"")).slice(0,6);
  return <div>
    <div style={{background:`linear-gradient(135deg,#fff 0%,#fff8d6 100%)`,border:`1px solid ${C.Gb}`,borderRadius:24,padding:"18px 20px",marginBottom:14,boxShadow:"0 14px 34px rgba(15,23,42,.06)",display:"flex",justifyContent:"space-between",gap:18,flexWrap:"wrap"}}>
      <div>
        <p style={{fontSize:13,fontWeight:800,color:C.G,margin:"0 0 4px"}}>Saison {saison}</p>
        <h2 style={{fontSize:26,fontWeight:900,color:C.N,margin:0}}>Tableau de bord inscriptions</h2>
        <p style={{fontSize:13,color:C.G,margin:"8px 0 0"}}>Vue globale des dossiers, familles, statuts, paiements et catégories.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(120px,1fr))",gap:8,minWidth:280}}>
        {[["Dossiers",data.length,C.N],["Membres",totalMembres,C.B],["CA estime",`${ca} €`,C.Jd],["Certificats",data.filter(d=>d.certifNeeded).length,C.R]].map(([l,v,c])=><div key={l} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:16,padding:"12px 14px"}}>
          <div style={{fontSize:24,fontWeight:900,color:c}}>{v}</div>
          <div style={{fontSize:11,fontWeight:800,color:C.G}}>{l}</div>
        </div>)}
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.4fr) minmax(280px,.8fr)",gap:14,marginBottom:14}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"16px",boxShadow:"0 14px 34px rgba(15,23,42,.05)"}}>
        <h3 style={{fontSize:15,fontWeight:900,color:C.N,margin:"0 0 14px"}}>Membres par catégorie</h3>
        <div style={{display:"grid",gap:10}}>
          {byCat.map(x=><div key={x.cat} style={{display:"grid",gridTemplateColumns:"110px minmax(0,1fr) 34px",alignItems:"center",gap:10}}>
            <span style={{fontSize:12,fontWeight:900,color:C.N}}>{catLabel(x.cat)}</span>
            <div style={{height:12,background:C.Gc,borderRadius:999,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.max(6,(x.count/maxCat)*100)}%`,background:C.J,borderRadius:999}}/></div>
            <span style={{fontSize:12,fontWeight:900,color:C.G,textAlign:"right"}}>{x.count}</span>
          </div>)}
        </div>
      </div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"16px",boxShadow:"0 14px 34px rgba(15,23,42,.05)"}}>
        <h3 style={{fontSize:15,fontWeight:900,color:C.N,margin:"0 0 14px"}}>Statuts dossiers</h3>
        <div style={{display:"grid",gap:10}}>
          {byStatus.map(s=><div key={s.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:s.bg,border:`1px solid ${s.color}33`,borderRadius:14,padding:"10px 12px"}}>
            <span style={{fontWeight:900,fontSize:13,color:s.color}}>{s.label}</span>
            <span style={{fontWeight:900,fontSize:20,color:s.color}}>{s.count}</span>
          </div>)}
        </div>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"16px"}}>
        <h3 style={{fontSize:15,fontWeight:900,color:C.N,margin:"0 0 14px"}}>Répartition</h3>
        {byType.map(x=><div key={x.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.Gc}`,padding:"9px 0"}}>
          <span style={{fontSize:13,fontWeight:800,color:C.G}}>{x.label}</span>
          <span style={{fontSize:18,fontWeight:900,color:x.color}}>{x.count}</span>
        </div>)}
      </div>
      <div style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:22,padding:"16px"}}>
        <h3 style={{fontSize:15,fontWeight:900,color:C.N,margin:"0 0 14px"}}>Dernières préinscriptions</h3>
        {derniers.map(d=><div key={d.id} style={{display:"grid",gridTemplateColumns:d.photoBase64?"34px 1fr auto":"1fr auto",gap:8,alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.Gc}`}}>
          {d.photoBase64&&<img src={d.photoBase64} alt="" style={{width:34,height:34,borderRadius:8,objectFit:"cover"}}/>}
          <div><div style={{fontSize:13,fontWeight:900,color:C.N}}>{d.prenom} {d.nom}</div><div style={{fontSize:11,color:C.G}}>{d.categorie} · {fmtD(d.datePreinscription)}</div></div>
          <span style={{fontSize:11,fontWeight:800,color:STATUTS[d.statut]?.c,background:STATUTS[d.statut]?.bg,borderRadius:999,padding:"3px 7px"}}>{STATUTS[d.statut]?.l}</span>
        </div>)}
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
    const c=adminCatValue(m)||"?";
    if(!groupes[c])groupes[c]=[];
    groupes[c].push(m);
  });
  // Ordre logique des catégories
  const ordreCat=["Babyfoot","U6/U7","U8/U9","U10/U11M","U10/U11F","U12/U13M","U12/U13F","U14/U15M","U14/U15F","U16/U17/U18M","U16/U17/U18F","Seniors M","Seniors F","Vétérans","Dirigeants"];
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
                <span>{m.dateNaissance?fmtD(m.dateNaissance):""}</span>
                {m.poste&&<span style={{color:C.N,fontWeight:700}}>{m.poste}</span>}
                <span>{m.role}</span>
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
    {id:"jeunes",l:"👶 Jeunes (Babyfoot → U10-U11)",members:true,filter:m=>["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(m.categorie)},
    {id:"ados",l:"🧒 Ados (U12-U13 → U16-U17-U18)",members:true,filter:m=>["U12-U13","U14-U15","U16-U17-U18"].includes(m.categorie)},
    {id:"adultes",l:"🧑 Adultes (Senior + Vétéran)",members:true,filter:m=>["Senior","Vétéran"].includes(m.categorie)},
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
  const joueurs=data.filter(d=>d.typeLicence==="nouvelle"&&(d.aJoueAutreClub||d.ancienClub));
  const parStatut={
    attente:joueurs.filter(d=>d.statut==="attente").length,
    valide:joueurs.filter(d=>d.statut==="valide"||d.statut==="paye").length,
    incomplet:joueurs.filter(d=>d.statut==="incomplet").length,
  };
  return<div>
    <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{fontWeight:900,fontSize:15,color:"#854d0e",margin:"0 0 6px"}}>Suivi des joueurs mutes / retours</p>
      <p style={{fontSize:12,color:"#92400e",margin:0}}>Nouvelles licences ayant joué dans un autre club la saison précédente, à suivre pour les règles de mutation.</p>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:12}}>
      {Object.entries(parStatut).map(([k,v])=><div key={k} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:8,padding:"10px",textAlign:"center"}}>
        <div style={{fontWeight:900,fontSize:20,color:STATUTS[k]?.c||C.N}}>{v}</div>
        <div style={{fontSize:10,color:C.G}}>{STATUTS[k]?.l||k}</div>
      </div>)}
    </div>
    {joueurs.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun joueur muté / retour déclaré.</p>}
    {joueurs.map(e=><div key={e.id} onClick={()=>onSelect(e)} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,cursor:"pointer"}}>
      <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"44px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:10,alignItems:"center"}}>
        {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
        <div>
          <strong>{e.prenom} {e.nom}</strong>
          <span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{adminCatValue(e)}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
      </div>
      <div style={{fontSize:12,color:C.G,marginTop:6}}>Ancien club : <strong>{e.ancienClub||"à préciser"}</strong></div>
      {e.mutationNotes&&<div style={{fontSize:12,color:"#92400e",marginTop:4}}>Note mutation : {e.mutationNotes}</div>}
      <div style={{fontSize:12,color:C.G,marginTop:4}}>Contact : {getEmailContact(e)||getTelContact(e)||"—"}</div>
    </div>)}
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
  const [page,setPage]=useState("commandes");
  const [sel,setSel]=useState(null);
  const [memberSel,setMemberSel]=useState(null);
  useEffect(()=>{
    stGet(keyIns(saison)).then(d=>{if(Array.isArray(d))setData(sortInscriptions(d));});
    if(!isFirebaseAvailable())return;
    const unsub=fbWatchInscriptions(saison,(fbData)=>{setData(sortInscriptions(fbData));stSet(keyIns(saison),sortInscriptions(fbData));});
    return()=>unsub&&unsub();
  },[saison]);
  const upd=async(id,patch)=>{
    const d=data.map(e=>e.id===id?{...e,...patch}:e);
    setData(d);await stSet(keyIns(saison),d);
    const u=d.find(e=>e.id===id);
    if(isFirebaseAvailable()&&u){try{await fbSaveInscription(saison,u);}catch{}}
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
        <p style={{fontSize:13,color:C.G,margin:0}}>Boutique hors dotation et dotations licence, avec photos et suivi complet par personne.</p>
      </div>
      <div style={{display:"flex",gap:6,background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:12,padding:4}}>
        {[{id:"commandes",l:"Commandes hors dotation"},{id:"dotations",l:"Dotations licence"},{id:"produits",l:"Produits"}].map(x=><button key={x.id} onClick={()=>setPage(x.id)} style={{border:"none",borderRadius:9,padding:"9px 12px",fontWeight:900,cursor:"pointer",background:page===x.id?C.J:C.W,color:page===x.id?C.N:C.G}}>{x.l}</button>)}
      </div>
    </div>
    {page==="commandes"&&<BoutiquePilotage rows={filtered} allRows={rows} stats={stats} articles={articles} search={search} setSearch={setSearch} statut={statut} setStatut={setStatut} categorie={categorie} setCategorie={setCategorie} article={article} setArticle={setArticle} categories={categories} onUpdate={updateAchat} onSelect={setSel} onExport={async()=>exportXLSX([{name:"Boutique",rows:[H_BOUTIQUE,...filtered.map(r=>boutiqueExportRow(r,articles))]}],`RSG_${saison}_Equipement.xlsx`)} exporting={false}/>}
    {page==="dotations"&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10}}>
      {dotRows.sort((a,b)=>catRank(adminCatValue(a))-catRank(adminCatValue(b))||(a.nom||"").localeCompare(b.nom||"")).map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={()=>setMemberSel(m)} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"10px 12px",display:"grid",gridTemplateColumns:m.photoBase64?"48px minmax(0,1fr)":"minmax(0,1fr)",gap:10,alignItems:"center",cursor:"pointer",textAlign:"left",fontFamily:FONT}}>
        {m.photoBase64&&<img src={m.photoBase64} alt="" style={{width:48,height:48,borderRadius:12,objectFit:"cover"}}/>}
        <div>
          <div style={{fontWeight:950,fontSize:14}}>{m.prenom} {m.nom}</div>
          <div style={{fontSize:11,color:C.G,margin:"3px 0"}}>{adminCatValue(m)} · {structureType(m)}</div>
          <div style={{fontSize:12,color:C.N}}>{EQUIP_FIELDS.map(f=>`${EQUIP_LABELS[f]}: ${f==="tailleSurvet"?getSurvet(m):(m[f]||"-")}`).join(" · ")}</div>
          {formatInitiales(m,tarifs)&&<div style={{fontSize:12,color:C.Jd,fontWeight:900}}>Initiales : {formatInitiales(m,tarifs)}</div>}
        </div>
      </button>)}
    </div>}
    {page==="produits"&&<div>{categories.map(cat=><div key={cat} style={{marginBottom:12}}><p style={{fontWeight:950,fontSize:13,textTransform:"uppercase",margin:"0 0 6px"}}>{cat}</p>{articles.filter(a=>(a.categorie||"Sans catégorie")===cat).map(a=><div key={a.id} style={{background:C.W,border:`1px solid ${C.Gb}`,borderRadius:14,padding:"10px 12px",marginBottom:7,display:"grid",gridTemplateColumns:"58px minmax(0,1fr) auto",gap:10,alignItems:"center"}}>{a.imageBase64?<img src={a.imageBase64} alt="" style={{width:58,height:58,borderRadius:12,objectFit:"cover"}}/>:<div style={{width:58,height:58,borderRadius:12,background:C.Gc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:C.G,fontWeight:900}}>IMG</div>}<div><div style={{fontWeight:950}}>{a.nom}</div><div style={{fontSize:12,color:C.G}}>{(a.tailles||[]).join(" · ")}</div></div><div style={{fontWeight:950,fontSize:20,color:C.J}}>{a.prix} €</div></div>)}</div>)}</div>}
    {sel&&<DetailModal onClose={()=>setSel(null)}><DetailPanel e={sel} note={sel.notes||""} setNote={()=>{}} onUpd={upd} onDel={()=>{}} onChangeStatut={(id,st)=>upd(id,{statut:st})} tarifs={tarifs} onClose={()=>setSel(null)}/></DetailModal>}
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
  const totalMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  const aDesMembres=totalMembres>1;
  const certifNeed=e.certifNeeded;
  const datesEch=e.datesEcheances;
  const echeances=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  const modeObj=getModesPaiement(tarifs).find(m=>m.id===e.modePaiement);

  // Documents avec ✓ ou â—‹ — k = clé dans l'entry pour toggle
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
    const nbInitiales=[draft,...(draft.freresSoeurs||[]),...(draft.adultesFamille||[])].reduce((s,m)=>s+countInitiales(m,tarifs),0);
    const supplementInitiales=nbInitiales*getCoutInitiales(tarifs);
    await onUpd(e.id,{...draft,prixLicences:total,supplementInitiales,prixFinal:total+supplementInitiales,detailPrix:detail,tarifBase:tarifs?.[draft.categorie]||0});
    setEditing(false);
  };

  return<div style={{background:C.W,borderRadius:10,marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",overflow:"hidden"}}>
    {/* Ligne principale (toujours visible) */}
    <div onClick={onToggle} style={{padding:"12px 14px",cursor:"pointer"}}>
      <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"52px minmax(0,1fr) auto":"minmax(0,1fr) auto",alignItems:"center",gap:10}}>
        {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:52,height:52,borderRadius:12,objectFit:"cover",border:`2px solid ${C.J}`}}/>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16}}>{e.prenom} {e.nom}</div>
          <div style={{fontSize:12,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{background:C.N,color:C.J,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{adminCatValue(e)}</span>
            <span style={{background:C.Gc,color:C.G,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{structureType(e)}</span>
            {aDesMembres&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{totalMembres} membres</span>}
            {certifNeed&&<span style={{background:"#fee2e2",color:C.R,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>🩺</span>}
          </div>
          {aDesMembres&&<div style={{fontSize:11,color:C.G,marginTop:5,display:"flex",gap:4,flexWrap:"wrap"}}>
            <strong>Famille {e.nomFamille||e.nom}</strong>
            {membresDossier(e).map(m=><button key={`${m.dossierId}-${m.idx}`} onClick={ev=>{ev.stopPropagation();onMemberSel?.(m);}} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"2px 7px",fontSize:11,cursor:"pointer",fontWeight:800}}>{m.prenom} {m.nom} - {adminCatValue(m)}</button>)}
          </div>}
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:C.J}}>{calcTotalDossier(e)} €</div>
          {boutiquePermTotal>0&&<div style={{fontSize:10,color:C.G}}>Licence {e.prixFinal} € + boutique permanence {boutiquePermTotal} €</div>}
          {boutiqueSaisonTotal>0&&<div style={{fontSize:10,color:"#0369a1"}}>Commandes saison séparées {boutiqueSaisonTotal} €</div>}
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        </div>
      </div>
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
          <span style={{color:C.W,fontWeight:700}}>{modeObj?.l||"—"}{e.nbFois>1?` · ${e.nbFois}x versements`:""}</span>
        </div>
        {boutiquePermTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",borderTop:"1px solid #333",marginTop:4,paddingTop:6}}>
          <span style={{color:"#9ca3af"}}>Licence + boutique</span>
          <span style={{color:C.J,fontWeight:900}}>{e.prixFinal||0} € + {boutiquePermTotal} € = {calcTotalDossier(e)} €</span>
        </div>}
        {boutiqueSaisonTotal>0&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",borderTop:"1px solid #333",marginTop:4,paddingTop:6}}>
          <span style={{color:"#9ca3af"}}>Commandes saison hors licence</span>
          <span style={{color:"#7dd3fc",fontWeight:900}}>{boutiqueSaisonTotal} €</span>
        </div>}
        {echeances&&datesEch&&<div style={{borderTop:"1px solid #333",paddingTop:6,marginTop:4}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
            <span style={{color:"#9ca3af"}}>{modeObj?.id==="cheque"?"Chèque":"Versement"} {i+1} ({datesEch[i]?fmtD(datesEch[i]):"?"})</span>
            <span style={{color:C.J,fontWeight:700}}>{m} €</span>
          </div>)}
        </div>}
      </div>

      <BoutiqueAchats e={e} onUpd={onUpd} tarifs={tarifs}/>

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
        <button onClick={()=>setEditing(v=>!v)} style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}}>{editing?"Fermer la modification":"Modifier les infos du membre"}</button>
        {editing&&<div style={{marginTop:10}}>
          <div style={G2}>
            <F label="N° licence FFF"><input style={inp()} value={draft.numLicenceFFF||""} onChange={ev=>updDraft("numLicenceFFF",ev.target.value)}/></F>
            <F label="Catégorie"><select style={inp()} value={draft.categorie||""} onChange={ev=>updDraft("categorie",ev.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.v}</option>)}</select></F>
            <F label="Nom"><input style={inp()} value={draft.nom||""} onChange={ev=>updDraft("nom",ev.target.value.toUpperCase())}/></F>
            <F label="Prénom"><input style={inp()} value={draft.prenom||""} onChange={ev=>updDraft("prenom",ev.target.value)}/></F>
            <F label="Naissance"><input type="date" style={inp()} value={draft.dateNaissance||""} onChange={ev=>updDraft("dateNaissance",ev.target.value)}/></F>
            <F label="Sexe"><select style={inp()} value={draft.sexe||""} onChange={ev=>updDraft("sexe",ev.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
            <F label="Nationalité"><select style={inp()} value={draft.nationalite||""} onChange={ev=>updDraft("nationalite",ev.target.value)}>{NATS.map(n=><option key={n}>{n}</option>)}</select></F>
            <F label="Téléphone"><input style={inp()} value={draft.telephone||""} onChange={ev=>updDraft("telephone",ev.target.value)}/></F>
            <F label="Email" span><input style={inp()} value={draft.email||""} onChange={ev=>updDraft("email",ev.target.value)}/></F>
            <F label="Adresse" span><input style={inp()} value={draft.adresse||""} onChange={ev=>updDraft("adresse",ev.target.value)}/></F>
            <F label="Code postal"><input style={inp()} value={draft.codePostal||""} onChange={ev=>updDraft("codePostal",ev.target.value)}/></F>
            <F label="Ville"><input style={inp()} value={draft.ville||""} onChange={ev=>updDraft("ville",ev.target.value)}/></F>
            <F label="Mode paiement"><select style={inp()} value={draft.modePaiement||""} onChange={ev=>updDraft("modePaiement",ev.target.value)}><option value="">—</option>{getModesPaiement(tarifs).map(m=><option key={m.id} value={m.id}>{m.l}</option>)}</select></F>
            <F label="Nb fois"><select style={inp()} value={draft.nbFois||1} onChange={ev=>updDraft("nbFois",parseInt(ev.target.value))}><option value={1}>1x</option><option value={2}>2x</option><option value={3}>3x</option><option value={4}>4x</option></select></F>
          </div>
          <EquipFields member={draft} categorie={draft.categorie} tarifs={tarifs} onChange={(k,v)=>updDraft(k,v)}/>
          {draft.nbFois>1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {Array.from({length:draft.nbFois},(_,i)=><F key={i} label={`Encaissement ${i+1}`}><input type="date" style={inp()} value={draft.datesEcheances?.[i]||""} onChange={ev=>updDraft("datesEcheances",Array.from({length:draft.nbFois},(_,j)=>j===i?ev.target.value:(draft.datesEcheances?.[j]||"")))}/></F>)}
          </div>}
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
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>Famille</p>
        {(e.freresSoeurs||[]).map((m,i)=><div key={i} style={{fontSize:12,padding:"2px 0"}}>👶 {m.prenom} {m.nom} — {m.categorie}</div>)}
        {(e.adultesFamille||[]).map((m,i)=><div key={i} style={{fontSize:12,padding:"2px 0"}}>🧑 {m.prenom} {m.nom} — {m.categorie}</div>)}
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
      {(e.statut==="paye"||e.statut==="valide")&&<div style={{display:"flex",gap:8,marginTop:8}}>
        <button onClick={()=>printAttestation(e,tarifs)} style={{...BS,flex:1,fontSize:12}}>📄 Attestation</button>
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
  };
  const updateAchat=(id,patch)=>saveAchats(achats.map(a=>a.id===id?{...a,...patch}:a));
  return<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",marginTop:8}}>
    <p style={{fontSize:11,fontWeight:800,color:"#92400e",margin:"0 0 8px",textTransform:"uppercase"}}>Ajouter un achat boutique au dossier</p>
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
      {article&&!canInitialesBoutique(article)&&<div style={{fontSize:11,color:C.G,margin:"-2px 0 8px"}}>Initiales non proposées pour les shorts et chaussettes.</div>}
      <button style={{...BP,width:"100%",fontSize:12,padding:"8px 12px",marginTop:8,minHeight:38}} onClick={add}>+ Ajouter au dossier</button>
    </>}
    {achats.length>0&&<div style={{marginTop:10,borderTop:"1px solid #fcd34d",paddingTop:8}}>
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
  const fileRefCsv=useRef();
  const fileRefJson=useRef();

  // Parser CSV avec reconnaissance des nouvelles colonnes Footclubs
  const parseCSV=text=>{
    const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];
    const sep=lines[0].includes(";")?";":",";
    const headers=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/['"]/g,""));
    const idx={
      nom:headers.findIndex(h=>h==="nom"||(h.includes("nom")&&!h.includes("pre")&&!h.includes("pré")&&!h.includes("club")&&!h.includes("cdg")&&!h.includes("repr"))),
      prenom:headers.findIndex(h=>h.includes("prenom")||h.includes("prénom")||h.includes("prén")),
      numLicence:headers.findIndex(h=>h.includes("numéro licence")||h.includes("numero licence")),
      validite:headers.findIndex(h=>h.includes("validité certif")||h.includes("validite certif")),
      anneeLastCertif:headers.findIndex(h=>!h.includes("validité")&&(h.includes("date certif")||h.includes("visite"))),
      categorie:headers.findIndex(h=>h.includes("sous catégorie")||h.includes("sous categorie")),
      naissance:headers.findIndex(h=>h.includes("né(e) le")||h.includes("ne(e) le")),
      sexe:headers.findIndex(h=>h==="sexe"),
      email:headers.findIndex(h=>h.includes("email principal")),
      tel:headers.findIndex(h=>h.includes("mobile personnel")),
      typeLic:headers.findIndex(h=>h.includes("type licence")),
      emailRl:headers.findIndex(h=>h.includes("email repr légal 1")),
      telRl:headers.findIndex(h=>h.includes("tel mobile repr légal 1")),
      nomRl:headers.findIndex(h=>h.includes("nom, prénom repr légal 1")),
    };
    const mapCat=sc=>{
      if(!sc)return"";
      if(/dirigeant/i.test(sc))return"Dirigeant";
      if(/educateur|éducateur|régional|regional/i.test(sc))return"Educateur";
      if(/senior/i.test(sc))return"Senior";
      if(/vétéran|veteran/i.test(sc))return"Vétéran";
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
    const cat=prompt("Catégorie (ex: U13-U14, Senior) :")||"";
    await onSave([...licencies,{n:nom.toUpperCase(),p:prenom,l:num,cm,c:cat,tl:"Libre"}]);
    setMsg({ok:true,txt:`✅ ${nom} ${prenom} ajouté(e).`});
  };

  const filtered=srch.length>1?licencies.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""}`.toLowerCase().includes(srch.toLowerCase())):licencies;

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>👥 Base des licenciés — Saison {saison}</p>
      <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.5}}>
        La base est rattachée à cette saison. À chaque nouvelle saison, elle reste vide tant que vous ne réimportez pas Footclubs.<br/>
        <strong>Pour mettre à jour</strong> : exportez Footclubs en CSV → bouton <em>"Importer CSV Footclubs"</em>.<br/>
        Le champ <strong>"Validité Certif Médic N+1"</strong> est automatiquement détecté.
      </p>
    </div>
    <input ref={fileRefCsv} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{handleFileCsv(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={fileRefJson} type="file" accept=".json" style={{display:"none"}} onChange={e=>{handleFileJson(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRefCsv.current.click()}>📥 Importer CSV Footclubs</button>
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
            {l.dn&&<span>{fmtD(l.dn)} · </span>}
            <span style={{color:req===true?C.R:req===false?C.V:"#9ca3af",fontWeight:600}}>
              {req===true?"Certif a renouveler":req===false?"Certif valide":"?"}
            </span>
          </div>
          {l.em&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,wordBreak:"break-all"}}>📧 {l.em}</div>}
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
      <button type="button" disabled={busy} style={{...BP,flex:1,fontSize:13,padding:"10px 8px",opacity:busy?0.65:1}} onClick={()=>cRef.current.click()}>📷 Caméra</button>
    </div>
    <p style={{fontSize:11,color:C.G,marginTop:5}}>JPG, PNG — image optimisée automatiquement</p>
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
  return<div onClick={onSel} style={{background:isSel?C.Jp:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",transition:"background .1s"}}>
    <div style={{display:"grid",gridTemplateColumns:e.photoBase64?"44px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:10,alignItems:"center"}}>
      {e.photoBase64&&<img src={e.photoBase64} alt="" style={{width:44,height:44,borderRadius:10,objectFit:"cover",border:`1px solid ${C.Gb}`}}/>}
      <div style={{minWidth:0}}>
        <div style={{fontWeight:800,fontSize:15}}>{e.prenom} {e.nom}</div>
        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
          <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 7px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"Renouv.":"Nouveau"}</span>
          {e.poste&&<span style={{background:C.Gc,color:C.G,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.poste}</span>}
          {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>Certif requis</span>}
          {e.prixFinal&&<span style={{background:"#f0fdf4",color:"#16a34a",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{calcTotalDossier(e)} €{boutiquePermTotal>0?` dont boutique permanence ${boutiquePermTotal} €`:""}{e.nbFois>1?` (${e.nbFois}x)`:""}</span>}
          {boutiqueSaisonTotal>0&&<span style={{background:"#e0f2fe",color:"#0369a1",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>Saison {boutiqueSaisonTotal} € separe</span>}
        </div>
      </div>
      <div style={{textAlign:"right",display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
        <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:10,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c,flexShrink:0}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        <span style={{fontSize:11,color:"#9ca3af"}}>{fmtD(e.datePreinscription)}</span>
      </div>
    </div>
    {membres.length>1&&<div style={{marginTop:8,background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:8,padding:"7px 8px"}}>
      <div style={{fontSize:11,fontWeight:900,color:C.G,marginBottom:5}}>Famille - {membres.length} membres inscrits dans ce dossier</div>
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
  const achats=m.dossier.achatsBoutique||[];
  const resteAPayer=achats.filter(a=>(a.statut||"a_regler")==="a_regler").reduce((s,a)=>s+achatTotal(a),0);
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
        <DR l="Poste" v={m.poste}/>
      </MC>
      <MC title="Famille / dossier">
        <DR l="Famille" v={m.dossier.nomFamille||m.dossier.nom}/>
        <DR l="Référence" v={m.dossierId}/>
        <DR l="Rôle" v={m.role}/>
        <DR l="Contact" v={getEmailContact(m.dossier)||getTelContact(m.dossier)}/>
      </MC>
      <MC title="Dotation licence">
        {getDotationCat(tarifs,m.categorie).map(item=><DR key={item.id} l={item.label} v={item.id==="tailleSurvet"?getSurvet(m):m[item.id]}/>)}
        {formatInitiales(m,tarifs)&&<DR l="Initiales" v={`${formatInitiales(m,tarifs)} (+${countInitiales(m,tarifs)*getCoutInitiales(tarifs)} €)`}/>}
      </MC>
      <MC title="Médical / pièces">
        <DR l="Certif" v={m.certifNeeded?"Requis":"OK / non requis"}/>
        <DR l="Soins urgence" v={m.autoSoins===false?"Non":"Oui"}/>
        <DR l="Allergies" v={m.allergiesAsthme||m.dossier.allergiesAsthme||"—"}/>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>{docs.map(p=><span key={p.id} style={{background:m.dossier[p.id]||m.dossier.piecesFournies?.[p.id]?"#dcfce7":"#fee2e2",color:m.dossier[p.id]||m.dossier.piecesFournies?.[p.id]?C.V:C.R,borderRadius:6,padding:"3px 7px",fontSize:11,fontWeight:800}}>{p.label}</span>)}</div>
      </MC>
    </div>
    <div style={{background:"#f8fafc",border:`1px solid ${C.Gb}`,borderRadius:12,padding:"12px 14px",marginTop:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:8}}>
        <p style={{fontWeight:950,fontSize:14,margin:0,color:C.N}}>Achats hors dotation</p>
        <span style={{background:resteAPayer>0?"#fef3c7":"#dcfce7",color:resteAPayer>0?"#ca8a04":C.V,borderRadius:8,padding:"4px 8px",fontSize:12,fontWeight:950}}>Reste à payer : {resteAPayer} €</span>
      </div>
      {achats.length===0&&<p style={{fontSize:13,color:C.G,margin:0}}>Aucune commande hors dotation.</p>}
      {achats.map(a=>{const st=STATUTS_BOUTIQUE[a.statut||"a_regler"]||STATUTS_BOUTIQUE.a_regler;return <div key={a.id} style={{display:"grid",gridTemplateColumns:a.imageBase64?"40px minmax(0,1fr) auto":"minmax(0,1fr) auto",gap:9,alignItems:"center",background:C.W,border:`1px solid ${C.Gb}`,borderRadius:10,padding:"8px 10px",marginTop:6}}>
        {a.imageBase64&&<img src={a.imageBase64} alt="" style={{width:40,height:40,borderRadius:9,objectFit:"cover"}}/>}
        <div style={{minWidth:0}}>
          <div style={{fontWeight:900,fontSize:13,color:C.N}}>{a.nom}{a.taille?` · ${a.taille}`:""} · {a.quantite||1}x</div>
          <div style={{fontSize:11,color:C.G}}>Commande : {a.dateCommande?fmtD(a.dateCommande):"—"} · Réception : {a.dateReception?fmtD(a.dateReception):"—"} · Livraison : {a.dateLivraison?fmtD(a.dateLivraison):"—"}</div>
          {a.note&&<div style={{fontSize:11,color:C.G,marginTop:2}}>Note : {a.note}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontWeight:950,color:C.Jd,fontSize:13}}>{achatTotal(a)} €</div>
          <span style={{display:"inline-block",marginTop:3,background:st.bg,color:st.c,borderRadius:7,padding:"2px 7px",fontSize:11,fontWeight:900}}>{st.l}</span>
        </div>
      </div>;})}
    </div>
    <button onClick={onOpenDossier} style={{...BP,width:"100%",marginTop:12}}>Ouvrir le dossier famille complet</button>
  </div>;
}

function DetailPanel({e,note,setNote,onUpd,onDel,onChangeStatut,tarifs,onClose}){
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(e);
  const [savingEdit,setSavingEdit]=useState(false);
  // Sections dépliables
  const [openSec,setOpenSec]=useState({contact:false,medical:false,equip:false,paiement:false,docs:false,famille:false});
  const togSec=k=>setOpenSec(p=>({...p,[k]:!p[k]}));

  const saveNote=async()=>{setSaving(true);await onUpd(e.id,{notes:note});setSaving(false);};
  const startEdit=()=>{setDraft({...e,representants:e.representants||(e.resp1Nom?[{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email}]:[{nom:"",prenom:"",lien:"",tel:"",email:""}]),freresSoeurs:e.freresSoeurs||[],adultesFamille:e.adultesFamille||[]});setEditing(true);setOpenSec({contact:true,medical:true,equip:true,paiement:true,docs:true,famille:true});};
  const cancelEdit=()=>{setEditing(false);setDraft(e);};
  const saveEdit=async()=>{
    setSavingEdit(true);
    // Recalcul prix si catégorie a changé
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
        <p style={{margin:"4px 0 0",fontSize:11,color:"#9ca3af"}}>{e.id} · {fmtDT(e.datePreinscription)} · {e.saison}</p>
        <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
          <span style={{background:C.N,color:C.J,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
          <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 8px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"Renouvellement":"Nouveau"}</span>
          {tousMembres>1&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Famille ({tousMembres})</span>}
          {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Certif requis</span>}
          {e.dirigeantArbitre&&<span style={{background:"#fef9c3",color:"#854d0e",padding:"2px 8px",borderRadius:4,fontWeight:700,fontSize:11}}>Arbitre</span>}
        </div>
      </div>
      {e.photoBase64&&<img src={e.photoBase64} style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/>}
    </div>

    {/* Bouton Modifier global */}
    {!editing&&<button onClick={startEdit} style={{...BP,fontSize:13,width:"100%",marginBottom:12}}>Tout modifier</button>}
    {editing&&<div style={{display:"flex",gap:8,marginBottom:12}}>
      <button style={{...BP,flex:1,fontSize:13,opacity:savingEdit?.7:1}} onClick={saveEdit} disabled={savingEdit}>{savingEdit?"Enregistrement...":"Enregistrer modifs"}</button>
      <button style={{...BS,flex:"0 0 auto",fontSize:13}} onClick={cancelEdit}>Annuler</button>
    </div>}
      {(e.statut==="paye"||e.statut==="valide")&&<div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BS,flex:"1 1 160px",fontSize:12,padding:"8px 12px"}} onClick={()=>printAttestation(e,tarifs)}>Attestation licence</button>
      <button style={{...BS,flex:"1 1 160px",fontSize:12,padding:"8px 12px"}} onClick={()=>prepareAttestationEmail(e,tarifs)}>Preparer l'email</button>
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
        {e.ancienClub&&<DR l="Ancien club" v={e.ancienClub}/>}
        {e.aJoueAutreClub&&<DR l="Mutation" v={`Oui${e.mutationNotes?` — ${e.mutationNotes}`:""}`}/>}
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
          <div style={{marginBottom:10}}><label style={lbl}>Catégorie</label><select style={inp()} value={draft.categorie||""} onChange={ev=>upd("categorie",ev.target.value)}>{CATS.map(c=><option key={c.v} value={c.v}>{c.v}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Poste</label><select style={inp()} value={draft.poste||""} onChange={ev=>upd("poste",ev.target.value)}><option value="">—</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>N° FFF</label><input style={inp()} value={draft.numLicenceFFF||""} onChange={ev=>upd("numLicenceFFF",ev.target.value)}/></div>
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
            <div style={{color:C.W,fontSize:13}}>{paiementLabels(e.modePaiements,e.modePaiement,tarifs).join(" + ")||"—"}</div>
            {e.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {e.nbFois} chèques</div>}
            {e.nomFamille&&<div style={{color:"#86efac",fontSize:12}}>Famille {e.nomFamille}</div>}
          </div>
          <div style={{color:C.J,fontWeight:900,fontSize:22}}>{calcTotalDossier(e)} €</div>
        </div>
        {boutiquePermTotal>0&&<div style={{fontSize:12,color:"#86efac",marginTop:6}}>Licence {e.prixFinal||0} € + boutique permanence {boutiquePermTotal} €</div>}
        {boutiqueSaisonTotal>0&&<div style={{fontSize:12,color:"#7dd3fc",marginTop:6}}>Commandes saison séparées : {boutiqueSaisonTotal} €</div>}
        {e.nbFois>1&&e.datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {calcEcheances(e.prixFinal,e.nbFois).map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Chèque {i+1} ({e.datesEcheances[i]?fmtD(e.datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
        </div>}
      </div>:<div>
        <div style={G2}>
          <div style={{marginBottom:10}}><label style={lbl}>Mode de paiement</label><select style={inp()} value={draft.modePaiement||""} onChange={ev=>upd("modePaiement",ev.target.value)}><option value="">—</option>{getModesPaiement(tarifs).map(m=><option key={m.id} value={m.id}>{m.l}</option>)}</select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Nb fois</label><select style={inp()} value={draft.nbFois||1} onChange={ev=>upd("nbFois",parseInt(ev.target.value))}><option value={1}>1x (comptant)</option><option value={2}>2x</option><option value={3}>3x</option><option value={4}>4x</option></select></div>
          <div style={{marginBottom:10}}><label style={lbl}>Nom de famille</label><input style={inp()} value={draft.nomFamille||""} onChange={ev=>upd("nomFamille",ev.target.value.toUpperCase())}/></div>
          <div style={{marginBottom:10}}><label style={lbl}>1er encaissement</label><input type="date" style={inp()} value={draft.dateEcheance1||""} onChange={ev=>upd("dateEcheance1",ev.target.value)}/></div>
        </div>
        {draft.nbFois>1&&draft.dateEcheance1&&<div style={{padding:"8px 10px",background:C.Gc,borderRadius:8,fontSize:12}}>
          Échéances : {calcDatesEcheance(draft.dateEcheance1,draft.nbFois).map(d=>fmtD(d)).join(" · ")}
        </div>}
        <p style={{fontSize:11,color:C.G,marginTop:6}}>Le prix sera recalculé automatiquement à l'enregistrement selon la catégorie et les membres famille.</p>
      </div>}
    </SecBlock>

    <BoutiqueAchats e={e} onUpd={onUpd} tarifs={tarifs}/>

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
        {getDotationCat(tarifs,e.categorie).map(item=><DR key={item.id} l={item.label} v={e[item.id]||"—"}/>)}
        {!getDotationCat(tarifs,e.categorie).length&&<DR l="Dotation" v="Aucune dotation configurée"/>}
      </div>:<EquipFields member={draft} categorie={draft.categorie} tarifs={tarifs} onChange={(k,v)=>upd(k,v)}/>}
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

    {/* FAMILLE - lecture seule (édition complète famille hors-scope ici) */}
    {tousMembres>1&&<SecBlock title={`Famille (${tousMembres-1} autre${tousMembres>2?"s":""} membre${tousMembres>2?"s":""})`} open={openSec.famille} onTog={()=>togSec("famille")}>
      {(e.freresSoeurs||[]).map((m,i)=><div key={i} style={{padding:"6px 8px",background:C.Jp,borderRadius:6,marginBottom:4,fontSize:12}}>
        <strong>{m.prenom} {m.nom}</strong> — {m.categorie} {m.dateNaissance?`(né(e) ${fmtD(m.dateNaissance)})`:""}
        <div style={{fontSize:11,color:C.G,marginTop:2}}>Short {m.tailleShort||"—"} · Chaussettes {m.tailleChaussettes||"—"}{m.tailleSurvet?` · Survêt. ${m.tailleSurvet}`:""}{m.tailleSweat?` · Sweat ${m.tailleSweat}`:""}</div>
      </div>)}
      {(e.adultesFamille||[]).map((m,i)=><div key={i} style={{padding:"6px 8px",background:"#dbeafe",borderRadius:6,marginBottom:4,fontSize:12}}>
        <strong>{m.prenom} {m.nom}</strong> — {m.categorie}
        <div style={{fontSize:11,color:C.G,marginTop:2}}>{m.tel||"—"} · {m.email||"—"}</div>
      </div>)}
    </SecBlock>}

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
  const ech=echeances&&f.nbFois>1?echeances.map((m,i)=>`<tr><td style="padding:3px 8px">${modeObj?.id==="cheque"?"Chèque":"Versement"} ${i+1}</td><td style="padding:3px 8px">${datesEcheances&&datesEcheances[i]?fmtD(datesEcheances[i]):"?"}</td><td style="padding:3px 8px;text-align:right;font-weight:700">${m} €</td></tr>`).join(""):"";
  const fs=f.freresSoeurs?.length?`<h2>Frères / sœurs</h2><ul style="margin:0;padding-left:18px">${f.freresSoeurs.map(m=>`<li>${m.prenom} ${m.nom} — ${m.categorie||"?"}${m.dateNaissance?` (né(e) ${fmtD(m.dateNaissance)})`:""}</li>`).join("")}</ul>`:"";
  const ad=f.adultesFamille?.length?`<h2>Adultes famille</h2><ul style="margin:0;padding-left:18px">${f.adultesFamille.map(m=>`<li>${m.prenom} ${m.nom} — ${m.categorie||"?"}</li>`).join("")}</ul>`:"";
  const reps=!f.representants?"":f.representants.filter(r=>r.nom).map(r=>`<li><strong>${r.lien||"Resp."} :</strong> ${r.prenom} ${r.nom} — ${r.tel} — ${r.email}</li>`).join("");
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
    <div class="row"><span class="l">Catégorie</span><span class="v">${f.categorie}</span></div>
    <div class="row"><span class="l">Adresse</span><span class="v">${f.adresse}, ${f.codePostal} ${f.ville}</span></div>
    <div class="row"><span class="l">Nationalité</span><span class="v">${f.nationalite||""}</span></div>
    ${f.email?`<div class="row"><span class="l">Email</span><span class="v">${f.email}</span></div>`:""}
    ${f.telephone?`<div class="row"><span class="l">Téléphone</span><span class="v">${f.telephone}</span></div>`:""}
  </div>
  ${reps?`<h2>Représentants légaux</h2><ul style="margin:0;padding-left:18px;font-size:11px">${reps}</ul>`:""}
  <h2>Équipement</h2>
  <p style="font-size:11px;margin:0">
    Short : <strong>${f.tailleShort||"—"}</strong> · Chaussettes : <strong>${f.tailleChaussettes||"—"}</strong>
    ${f.tailleSweat?` · Sweat RSG : <strong>${f.tailleSweat}</strong>`:""}
    ${f.tailleSurvet?` · Survêtement : <strong>${f.tailleSurvet}</strong>`:""}
  </p>
  ${fs}
  ${ad}
  ${f.allergiesAsthme?`<h2>Médical</h2><p style="font-size:11px">Allergies/asthme/restrictions : <strong>${f.allergiesAsthme}</strong></p>`:""}
  ${docs.length?`<div class="docs"><strong>📋 Préparez si possible pour la permanence :</strong><ul style="margin:6px 0 0;padding-left:20px">${docs.map(d=>`<li>${d}</li>`).join("")}</ul></div>`:`<div class="docs">✅ Tous les documents sont préparés. Pensez au règlement et à votre référence.</div>`}
  <h2>Permanences licence</h2>
  <ul style="margin:0;padding-left:18px;font-size:11px">${permanences.map(p=>`<li>${fmtPermanence(p)}</li>`).join("")}</ul>
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
  w.document.write(`<!DOCTYPE html><html><head><title>Fiche ${e.prenom} ${e.nom}</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:20px auto;font-size:12px}h1{border-bottom:4px solid #F5C800;padding-bottom:8px}h2{background:#F5C800;padding:3px 8px;font-size:12px;display:inline-block;border-radius:3px;margin:14px 0 6px}.row{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0;font-size:11px}.l{color:#6b7280;min-width:120px;flex-shrink:0}.v{font-weight:600}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.pay{background:#111;color:#F5C800;padding:10px 14px;border-radius:8px;margin:12px 0}@media print{button{display:none!important}}</style></head><body>
  <div style="display:flex;justify-content:space-between"><div><h1>⚽ RÉVEIL SAINT-GÉRÉON<br><span style="font-size:13px;font-weight:400">Préinscription — Saison ${e.saison||"—"}</span></h1>
  <span style="background:#111;color:#F5C800;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${e.categorie}</span> <span style="font-size:11px">${e.typeLicence==="renouvellement"?"🔄 Renouvellement":"✨ Nouvelle"}</span> <span style="font-size:11px;color:#666">${e.id}</span>
  <div style="margin-top:4px;font-size:11px;color:${e.certifNeeded?"#dc2626":"#16a34a"};font-weight:700">${e.certifNeeded?"🩺 Certif médical OBLIGATOIRE":"✅ Certif valable"}</div></div>
  ${e.photoBase64?`<img src="${e.photoBase64}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:""}
  </div>
  <div class="pay">💰 ${e.prixFinal||0} € · ${mode}${e.nbFois>1?` · En ${e.nbFois} fois`:""}${e.remisePct>0?` · Remise famille -${e.remisePct}% (${e.nomFamille||""})`:""}</div>
  ${ech?`<p style="font-size:11px">Échéancier : ${ech.map((m,i)=>`Versement ${i+1} : ${m} €`).join(" | ")}</p>`:""}
  <h2>Joueur</h2><div class="grid"><div class="row"><span class="l">Nom</span><span class="v">${e.prenom} ${e.nom}</span></div><div class="row"><span class="l">Naissance</span><span class="v">${fmtD(e.dateNaissance)}${e.lieuNaissance?" — "+e.lieuNaissance:""}</span></div><div class="row"><span class="l">Adresse</span><span class="v">${e.adresse}, ${e.codePostal} ${e.ville}</span></div>${e.numLicenceFFF?`<div class="row"><span class="l">N° FFF</span><span class="v">${e.numLicenceFFF}</span></div>`:""}</div>
  ${(() => {const r=getResp1(e);return!e.isMajeur&&r?`<h2>Responsable légal</h2><div class="grid"><div class="row"><span class="l">Identité</span><span class="v">${r.prenom||""} ${r.nom||""}${r.lien?" ("+r.lien+")":""}</span></div><div class="row"><span class="l">Téléphone</span><span class="v">${r.tel||""}</span></div><div class="row"><span class="l">Email</span><span class="v">${r.email||""}</span></div></div>`:"";})()}
  <h2>Équipement</h2><p style="font-size:11px">Short : <b>${e.tailleShort||"—"}</b> · Chaussettes : <b>${e.tailleChaussettes||"—"}</b> · Survêtement : <b>${getSurvet(e)||"—"}</b>${e.tailleSweat?` · Sweat : <b>${e.tailleSweat}</b>`:""}</p>
  ${e.notes?`<h2>Notes bureau</h2><p>${e.notes}</p>`:""}
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999;display:flex;justify-content:space-between"><span>RSG Réveil Saint-Géréon · Saison ${e.saison} · Document confidentiel</span><span>${STATUTS[e.statut]?.l||"—"}</span></div>
  <script>setTimeout(()=>window.print(),300);</script></body></html>`);
  w.document.close();
}

function printAttestation(e,tarifs){
  const w=window.open("","_blank");if(!w)return;
  const contenu=renderTpl(getAttestationTemplate(tarifs),e,tarifs);
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
    ${contenu}
    <button onclick="window.print()" style="margin-top:40px;background:#F5C800;border:none;padding:10px 22px;font-weight:800;border-radius:8px;cursor:pointer">Imprimer / PDF</button>
    <script>setTimeout(()=>window.print(),350);</script>
  </body></html>`);
  w.document.close();
}

function prepareAttestationEmail(e,tarifs){
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
function TypeCard({sel,onClick,icon,title,sub}){return<div onClick={onClick} style={{border:`2px solid ${sel?C.J:C.Gb}`,background:sel?C.Jp:"#fafafa",borderRadius:12,padding:"14px 10px",cursor:"pointer",textAlign:"center",transition:"all .15s",minHeight:110,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}><div style={{fontSize:26}}>{icon}</div><div style={{fontWeight:800,fontSize:14,color:C.N}}>{title}</div><div style={{fontSize:11,color:C.G,lineHeight:1.3}}>{sub}</div></div>;}
function ErrB({msg}){return<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:12}}>⚠ {msg}</div>;}
function F({label,err,children,span}){return<div style={{marginBottom:12,gridColumn:span?"1 / -1":undefined}}><label style={lbl}>{label}</label>{children}{err&&<span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {err}</span>}</div>;}
function Chk({checked,onChange,label,err}){return<div style={{marginBottom:10}}><label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{marginTop:2,accentColor:C.J,width:18,height:18,flexShrink:0}}/><span style={{fontSize:13,color:C.N,lineHeight:1.4}}>{label}</span></label>{err&&<span style={{color:C.R,fontSize:11,display:"block",marginTop:3,marginLeft:28}}>⚠ {err}</span>}</div>;}
function RB({title,children}){return<div style={{background:"#f9fafb",borderRadius:8,padding:"10px 12px",marginBottom:8}}><p style={{fontWeight:700,fontSize:12,color:C.N,margin:"0 0 6px"}}>{title}</p>{children}</div>;}
function RR({l,v}){return<div style={{display:"flex",gap:8,fontSize:12,padding:"2px 0"}}><span style={{color:C.G,minWidth:100,flexShrink:0}}>{l} :</span><span style={{fontWeight:600}}>{v||"—"}</span></div>;}
function MC({title,children}){return<div style={{background:"#f9fafb",borderRadius:10,padding:"10px 12px"}}><p style={{fontWeight:700,fontSize:11,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.4}}>{title}</p>{children}</div>;}
function DR({l,v}){return<div style={{padding:"3px 0",borderBottom:`1px solid ${C.Gc}`,display:"flex",gap:6,fontSize:11}}><span style={{color:"#9ca3af",minWidth:72,flexShrink:0}}>{l}</span><span style={{fontWeight:600,wordBreak:"break-all"}}>{v||"—"}</span></div>;}


