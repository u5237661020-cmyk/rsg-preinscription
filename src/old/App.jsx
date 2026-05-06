import { useState, useEffect, useRef, useCallback } from "react";
import {
  fbSaveInscription, fbGetAllInscriptions, fbDeleteInscription, fbWatchInscriptions,
  fbSaveTarifs, fbGetTarifs, fbSaveLicencies, fbGetLicencies, isFirebaseAvailable,
} from "./firebase.js";

/* ══ SAISONS ══════════════════════════════════════════════════════ */
const saisons = (() => {
  const y = new Date().getFullYear();
  return Array.from({length:6},(_,i)=>{const s=y-1+i;return{value:`${s}-${s+1}`,label:`Saison ${s}-${s+1}`};});
})();
const SAISON_DEFAUT = `${new Date().getFullYear()}-${new Date().getFullYear()+1}`;

/* ══ STORAGE ══════════════════════════════════════════════════════
   Hiérarchie : (1) window.storage (artifacts), (2) localStorage (navigateur), (3) memory
   Firestore est utilisé en parallèle pour le partage entre appareils. */
const memStore={};
async function stGet(key){
  try{if(typeof window!=="undefined"&&typeof window.storage!=="undefined"){const r=await window.storage.get(key);if(r?.value)return JSON.parse(r.value);}}catch{}
  try{if(typeof window!=="undefined"&&window.localStorage){const v=window.localStorage.getItem(key);if(v)return JSON.parse(v);}}catch{}
  return memStore[key]??null;
}
async function stSet(key,val){
  try{if(typeof window!=="undefined"&&typeof window.storage!=="undefined"){await window.storage.set(key,JSON.stringify(val));return;}}catch{}
  try{if(typeof window!=="undefined"&&window.localStorage){window.localStorage.setItem(key,JSON.stringify(val));return;}}catch{}
  memStore[key]=val;
}
const keyIns=s=>`rsg_ins_${s}`;
const keyLic=s=>`rsg_lic_${s}`;

/* ══ TARIFS (modifiables ici) ═════════════════════════════════════ */
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
  "Dirigeant":   30,
};

// Remise famille (à partir du 2e membre de la même famille, tous confondus)
const REMISE_FAMILLE = {
  2: 10,   // 2e membre : -10%
  3: 20,   // 3e : -20%
  4: 30,   // 4e+ : -30%
};

// Modes de paiement
// CB et Espèces : 1 fois uniquement (en permanence)
// Chèque : fractionnement 1 à 4 fois sans frais
const MODES_PAIEMENT = [
  {id:"cb",     l:"💳 Carte bancaire", fractionnable:false, lieu:"En permanence licence"},
  {id:"cheque", l:"📝 Chèque",         fractionnable:true,  lieu:"En permanence licence"},
  {id:"especes",l:"💵 Espèces",        fractionnable:false, lieu:"En permanence licence"},
];

/* ══ CONSTANTES ═══════════════════════════════════════════════════ */
const ADMIN = "RSG2025";
const C = {J:"#F5C800",Jd:"#C9A800",Jp:"#FFFBE6",N:"#0F0F0F",Nm:"#1A1A1A",Ns:"#2A2A2A",G:"#6B7280",Gc:"#F3F4F6",Gb:"#E5E7EB",W:"#FFFFFF",V:"#16a34a",R:"#dc2626",B:"#2563eb"};
const CATS = [
  {l:"Babyfoot (2022 et après)",v:"Babyfoot"},
  {l:"U6-U7 (2020-2021)",v:"U6-U7"},
  {l:"U8-U9 (2018-2019)",v:"U8-U9"},
  {l:"U10-U11 (2016-2017)",v:"U10-U11"},
  {l:"U12-U13 (2014-2015)",v:"U12-U13"},
  {l:"U14-U15 (2012-2013)",v:"U14-U15"},
  {l:"U16-U17-U18 (2009-2011)",v:"U16-U17-U18"},
  {l:"Senior (1993-2008)",v:"Senior"},
  {l:"Vétéran (1992 et avant)",v:"Vétéran"},
  {l:"Dirigeant",v:"Dirigeant"},
];
const POSTES = ["Gardien","Défenseur central","Latéral droit","Latéral gauche","Milieu défensif","Milieu central","Milieu offensif","Ailier droit","Ailier gauche","Attaquant","Pas de préférence"];
const NATS   = ["Française","Algérienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Sénégalaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Autre"];
const LIENS  = ["Père","Mère","Tuteur légal","Grand-parent","Frère/Sœur majeur(e)"];
// Tailles disponibles selon catégorie
const TA = ["XS","S","M","L","XL","XXL","3XL"];                              // Adultes
const TE = ["4 ans / 104cm","6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / XS adulte"];  // Enfants
const TADO = ["10 ans / 140cm","12 ans / 152cm","14 ans / XS adulte","XS","S","M","L"];  // Ados (mix enfant + adulte XS-L)

// Retourne les tailles à proposer selon la catégorie
const getTaillesCat=cat=>{
  if(["Senior","Vétéran","Dirigeant"].includes(cat))return TA;
  if(["U12-U13","U14-U15","U16-U17-U18"].includes(cat))return TADO;
  return TE; // Babyfoot, U6-U7, U8-U9, U10-U11
};

// Indique si un sweat RSG est proposé pour cette catégorie (U10-U11 uniquement)
const aSweat=cat=>cat==="U10-U11";
// Indique si un survêtement est proposé pour cette catégorie (U12-U13 et plus)
const aSurvet=cat=>["U12-U13","U14-U15","U16-U17-U18","Senior","Vétéran","Dirigeant"].includes(cat);
const STATUTS = {attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:"⏳"},valide:{l:"Validé",c:"#16a34a",bg:"#dcfce7",i:"✅"},paye:{l:"Payé ✓",c:"#2563eb",bg:"#dbeafe",i:"💳"},incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:"⚠️"},refuse:{l:"Refusé",c:"#6b7280",bg:"#f3f4f6",i:"❌"}};

// Base licenciés (chargée au démarrage depuis /licencies.json — voir public/licencies.json)
// Pour mettre à jour la base chaque saison : remplacer simplement le fichier public/licencies.json
const BASE_FOOTCLUBS = []

const F0 = {
  typeLicence:"",numLicenceFFF:"",
  nom:"",prenom:"",dateNaissance:"",sexe:"",lieuNaissance:"",
  nationalite:"Française",nationaliteAutre:"",
  adresse:"",codePostal:"",ville:"",
  email:"",telephone:"",
  categorie:"",poste:"",ancienClub:"",
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
  // Équipement
  tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",
  // Photo d'identité (obligatoire)
  photoBase64:"",
  // Famille
  freresSoeurs:[], // mineurs : {nom,prenom,dateNaissance,sexe,categorie,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,tailleSweat,photoBase64}
  adultesFamille:[], // adultes : {nom,prenom,dateNaissance,sexe,nationalite,categorie,tel,email,allergies,autoSoins,autoPhoto,autoTransport,tailleShort,tailleChaussettes,tailleSurvet,photoBase64}
  // Commentaire libre
  commentaire:"",
  // Paiement
  modePaiement:"",nbFois:1,nomFamille:"",dateEcheance1:"",
};

/* ══ HELPERS ══════════════════════════════════════════════════════ */
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
  const pct   = rang >= 4 ? REMISE_FAMILLE[4] : (REMISE_FAMILLE[rang] || 0);
  return Math.round(base * (1 - pct/100));
};

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

// Compte le nombre total de membres dans une préinscription famille (inscrit + frères/sœurs + adultes)
const countMembres = (f) => 1 + (f.freresSoeurs?.length || 0) + (f.adultesFamille?.length || 0);

/* ══ EXPORT EXCEL ═════════════════════════════════════════════════ */
const loadXLSX=()=>new Promise((res,rej)=>{if(window.XLSX){res(window.XLSX);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});
const mkSheet=rows=>{const XLSX=window.XLSX;const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0]?.map((_,i)=>({wch:Math.min(50,Math.max(10,...rows.map(r=>String(r[i]||"").length)))}));return ws;};
const exportXLSX=async(sheets,fname)=>{const XLSX=await loadXLSX();const wb=XLSX.utils.book_new();sheets.forEach(({name,rows})=>XLSX.utils.book_append_sheet(wb,mkSheet(rows),name.slice(0,31)));XLSX.writeFile(wb,fname);};

const H_INS = ["Référence","Date","Type","Statut","Nom","Prénom","Naissance","Sexe","Nationalité","Lieu naiss.","Adresse","CP","Ville","Téléphone","Email","Catégorie","Poste","Ancien club","N° Licence FFF","Resp. principal","Lien","Tél resp.","Email resp.","Autres resp.","Mutuelle","Médecin","Tél médecin","Allergies/asthme","Soins urgence","Photos","Transport","Certif requis","Certif fourni","Photo ID","Justif.","RIB","Livret famille","Short","Chaussettes","Survêtement","Sweat RSG","Famille","Membres famille","Tarif total €","Mode paiement","Nb fois","1er encaissement","Notes","Commentaire"];

const toRow=e=>{
  const r0=(e.representants||[])[0]||{nom:e.resp1Nom,prenom:e.resp1Prenom,lien:e.resp1Lien,tel:e.resp1Tel,email:e.resp1Email};
  const autresResp=(e.representants||[]).slice(1).filter(r=>r&&r.nom).map(r=>`${r.prenom||""} ${r.nom||""} (${r.lien||""}) ${r.tel||""} ${r.email||""}`).join(" | ");
  const nbMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  return[e.id,fmtDT(e.datePreinscription),e.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[e.statut]?.l||"",e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.lieuNaissance||"",e.adresse,e.codePostal,e.ville,e.isMajeur?e.telephone:r0?.tel||"",e.isMajeur?e.email:r0?.email||"",e.categorie,e.poste||"",e.ancienClub||"",e.numLicenceFFF||"",r0?.nom?`${r0.prenom||""} ${r0.nom}`:"",r0?.lien||"",r0?.tel||"",r0?.email||"",autresResp,e.mutuelle||"",e.docteur||"",e.telDocteur||"",e.allergiesAsthme||e.allergies||"",e.autoSoins?"Oui":"Non",e.autoPhoto?"Oui":"Non",e.autoTransport?"Oui":"Non",e.certifNeeded?"OUI":"OK",e.certifMedical?"✓":"",e.photoId?"✓":"",e.justifDom?"✓":"",e.rib?"✓":"",e.livretFamille?"✓":"",e.tailleShort||"",e.tailleChaussettes||"",e.tailleSurvet||e["tailleSurvêtement"]||"",e.tailleSweat||"",e.nomFamille||"",nbMembres,e.prixFinal||"",e.modePaiement||"",e.nbFois||1,(e.datesEcheances&&e.datesEcheances[0])||"",e.notes||"",e.commentaire||""];
};

/* ══ STYLES ═══════════════════════════════════════════════════════ */
const inp=err=>({width:"100%",boxSizing:"border-box",padding:"11px 12px",fontSize:16,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:8,outline:"none",background:C.W,color:C.N,fontFamily:"system-ui,-apple-system,sans-serif",WebkitAppearance:"none",appearance:"none",minHeight:44});
const lbl={display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const BP={background:C.J,color:C.N,border:`2px solid ${C.Jd}`,borderRadius:10,padding:"12px 20px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation"};
const BS={background:C.Gc,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:10,padding:"12px 18px",fontWeight:700,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation"};
const G2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"};

/* ══ ROOT ═════════════════════════════════════════════════════════ */
// ═══════════════════════════════════════════════════════════════════
// Routing par hash : URL #/ = formulaire public, #/admin = bureau, #/permanence = mode bénévole
// Avantage : reload garde la vue, pas besoin de react-router
// ═══════════════════════════════════════════════════════════════════
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
  const [route,navigate]=useHashRoute();
  const [pw,setPw]=useState("");
  const [pwErr,setPwErr]=useState(false);
  const [licencies,setLicencies]=useState([]);
  const [tarifs,setTarifs]=useState(TARIFS_DEFAUT);
  // État d'authentification admin (vrai si on a tapé le bon mot de passe sur cet appareil)
  const [adminAuth,setAdminAuth]=useState(()=>{
    try{return typeof window!=="undefined"&&window.sessionStorage?.getItem("rsg_admin")==="1";}catch{return false;}
  });

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

  const tryLogin=()=>{
    if(pw.trim()===ADMIN){
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
  const needsAuth=route==="admin"||route==="permanence";
  const showLogin=route==="login"||(needsAuth&&!adminAuth);

  return(
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",minHeight:"100vh",background:C.Gc,WebkitTextSizeAdjust:"100%"}}>
      <header style={{background:C.N,borderBottom:`4px solid ${C.J}`,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden",cursor:"pointer"}} onClick={()=>navigate("home")}>
          <div style={{width:34,height:34,background:C.J,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,flexShrink:0}}>⚽</div>
          <div style={{lineHeight:1.15}}>
            <div style={{color:C.J,fontWeight:900,fontSize:12}}>RÉVEIL ST-GÉRÉON</div>
            <div style={{color:"#9ca3af",fontSize:10}}>Saison {saison}{adminAuth&&route==="admin"?" · 🔐 Admin":adminAuth&&route==="permanence"?" · 📅 Permanence":""}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <select value={saison} onChange={e=>{setSaison(e.target.value);}} style={{background:C.Ns,color:"#ddd",border:"1px solid #444",borderRadius:7,padding:"5px 6px",fontWeight:600,fontSize:10,cursor:"pointer",minHeight:32,outline:"none"}}>{saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
          {route!=="home"&&route!=="login"&&<button onClick={()=>navigate("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>← Retour</button>}
          {!adminAuth&&route!=="login"&&<button onClick={()=>navigate("login")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:800,fontSize:11,cursor:"pointer",minHeight:32}}>🔐 Bureau</button>}
          {adminAuth&&route==="admin"&&<button onClick={()=>navigate("permanence")} style={{background:"#16a34a",color:C.W,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>📅 Permanence</button>}
          {adminAuth&&route==="permanence"&&<button onClick={()=>navigate("admin")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>🔐 Admin</button>}
          {adminAuth&&<button onClick={logout} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>Déco.</button>}
        </div>
      </header>
      {route==="home"&&<Home onForm={()=>navigate("form")} saison={saison} tarifs={tarifs}/>}
      {route==="form"&&<Formulaire onDone={()=>navigate("home")} licencies={licencies} saison={saison} tarifs={tarifs}/>}
      {showLogin&&(
        <div style={{maxWidth:360,margin:"48px auto 0",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:38,marginBottom:8}}>🔐</div><h2 style={{margin:0,color:C.N,fontWeight:800,fontSize:20}}>Accès Secrétariat</h2><p style={{color:C.G,fontSize:13,marginTop:4}}>Saison {saison}</p></div>
            <label style={lbl}>Code d'accès</label>
            <input type="password" autoComplete="current-password" style={{...inp(pwErr),fontSize:18,letterSpacing:4,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:10}}>❌ Code incorrect</div>}
            <button style={{...BP,width:"100%",marginTop:4}} onClick={tryLogin}>Entrer →</button>
          </div>
        </div>
      )}
      {route==="admin"&&adminAuth&&<Dashboard saison={saison} licencies={licencies} onLicenciesChange={async lics=>{
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

/* ══ HOME ═════════════════════════════════════════════════════════ */
function Home({onForm,saison,tarifs}){
  return(
    <div style={{maxWidth:540,margin:"0 auto",padding:"24px 16px 64px"}}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:44,margin:"0 0 8px"}}>⚽</div>
        <h1 style={{fontSize:22,fontWeight:900,color:C.N,margin:"0 0 6px"}}>Préinscription RSG</h1>
        <div style={{display:"inline-block",background:C.J,color:C.N,padding:"3px 14px",borderRadius:20,fontWeight:800,fontSize:13,marginBottom:12}}>Saison {saison}</div>
        <p style={{color:C.G,fontSize:14,lineHeight:1.6,margin:"0 0 20px"}}>Complétez le formulaire en 5 minutes.<br/>Le secrétariat vous contactera sous 48h.</p>
        <button style={{...BP,fontSize:16,padding:"14px 32px",borderRadius:12,boxShadow:`0 6px 20px ${C.J}55`,width:"100%"}} onClick={onForm}>📝 Commencer la préinscription</button>
      </div>

      {/* Grille des tarifs */}
      <div style={{background:C.W,borderRadius:12,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:16}}>
        <div style={{background:C.N,padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:C.J,fontWeight:800,fontSize:13}}>💰 Tarifs saison {saison}</span>
        </div>
        <div style={{padding:"12px 14px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:C.Gc,borderRadius:7}}>
                <span style={{fontSize:12,fontWeight:600,color:C.N}}>{cat}</span>
                <span style={{fontSize:14,fontWeight:900,color:C.J}}>{prix} €</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,fontSize:12,color:"#1e40af"}}>
            <strong>👨‍👩‍👧‍👦 Tarif famille</strong> — à partir du 2ème membre de la famille (enfants ET adultes confondus)<br/>
            2ème : <strong>-10%</strong> · 3ème : <strong>-20%</strong> · 4ème et + : <strong>-30%</strong>
          </div>
        </div>
      </div>

      <div style={{padding:14,background:C.W,borderRadius:12,border:`1px solid ${C.Gb}`}}>
        <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>📁 Préparez si possible :</p>
        {["Certificat médical (tous les 3 ans — on vous indiquera)","Photo d'identité récente","Justificatif de domicile","RIB"].map((d,i)=>(
          <div key={i} style={{display:"flex",gap:8,padding:"5px 0",fontSize:13,color:C.G,borderBottom:i<3?`1px solid ${C.Gc}`:"none"}}><span style={{color:C.J,fontWeight:700}}>•</span>{d}</div>
        ))}
      </div>
    </div>
  );
}

/* ══ FORMULAIRE ═══════════════════════════════════════════════════ */
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
  const lic=(f.typeLicence==="renouvellement"&&(f.numLicenceFFF||(f.nom.length>1&&f.prenom.length>1)))?lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF):null;
  const certifReq=f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic):null);
  const certifMsg=f.typeLicence==="nouvelle"
    ?{ok:false,txt:"Nouvelle licence au club → certificat médical obligatoire."}
    :(!lic?null:(certifReq===true
      ?{ok:false,txt:`Selon Footclubs, votre certificat médical n'est pas valide pour la saison ${saison} → RDV médecin obligatoire.`}
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
    tousMembres.forEach((m,i)=>{
      const rang=i+1;
      const base=tarifs[m.categorie]||0;
      const pct=rang>=4?REMISE_FAMILLE[4]:(REMISE_FAMILLE[rang]||0);
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
  const datesEcheances=echeances&&f.dateEcheance1?calcDatesEcheance(f.dateEcheance1,f.nbFois):null;
  const modeObj=MODES_PAIEMENT.find(m=>m.id===f.modePaiement);

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
  useEffect(()=>{if(f.dateNaissance)set("categorie",suggestCat(f.dateNaissance,saison));},[f.dateNaissance,saison]);
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
    if(step===stepIdx.joueur){
      if(!f.nom)e.nom="Requis";
      if(!f.prenom)e.prenom="Requis";
      if(!f.dateNaissance)e.dateNaissance="Requis";
      if(!f.sexe)e.sexe="Requis";
      if(!f.adresse)e.adresse="Requis";
      if(!f.codePostal)e.codePostal="Requis";
      if(!f.ville)e.ville="Requis";
      if(!f.categorie)e.categorie="Requis";
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
    if(step===stepIdx.paie){
      if(!f.modePaiement)e.modePaiement="Veuillez choisir un mode de paiement";
      if(modeObj?.fractionnable&&f.nbFois>1&&!f.dateEcheance1)e.dateEcheance1="Veuillez choisir la date du 1er encaissement";
    }
    setErrs(e);return Object.keys(e).length===0;
  };
  const next=()=>{if(validate())setStep(p=>Math.min(p+1,total));};
  const prev=()=>{setErrs({});setStep(p=>Math.max(p-1,1));};

  // Helpers pour ajout/suppression de représentants et membres famille
  const addRep=()=>set("representants",[...f.representants,{nom:"",prenom:"",lien:"",tel:"",email:""}]);
  const updRep=(i,k,v)=>{const r=[...f.representants];r[i]={...r[i],[k]:v};set("representants",r);};
  const delRep=i=>set("representants",f.representants.filter((_,j)=>j!==i));

  const addFrere=()=>set("freresSoeurs",[...f.freresSoeurs,{nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"",allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",tailleSweat:"",photoBase64:""}]);
  const updFrere=(i,k,v)=>{const r=[...f.freresSoeurs];r[i]={...r[i],[k]:v};
    // auto-cat si date naissance change
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    set("freresSoeurs",r);
  };
  const delFrere=i=>set("freresSoeurs",f.freresSoeurs.filter((_,j)=>j!==i));

  const addAdulte=()=>set("adultesFamille",[...f.adultesFamille,{nom:"",prenom:"",dateNaissance:"",sexe:"",nationalite:"Française",categorie:"Senior",tel:"",email:"",allergiesAsthme:"",autoSoins:true,autoPhoto:true,autoTransport:true,tailleShort:"",tailleChaussettes:"",tailleSurvet:"",photoBase64:""}]);
  const updAdulte=(i,k,v)=>{const r=[...f.adultesFamille];r[i]={...r[i],[k]:v};
    if(k==="dateNaissance"&&v)r[i].categorie=suggestCat(v,saison);
    set("adultesFamille",r);
  };
  const delAdulte=i=>set("adultesFamille",f.adultesFamille.filter((_,j)=>j!==i));

  // Y a-t-il des membres famille (pour livret de famille obligatoire)
  const aDesMembresFamille=f.freresSoeurs.length>0||f.adultesFamille.length>0;

  const submit=async()=>{
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
    setDone({id,fbOk,fbErrMsg});
  };

  if(done)return<Confirmation refId={done.id} prenom={f.prenom} nom={f.nom} saison={saison} prixFinal={prixFinalTotal} modePaiement={f.modePaiement} nbFois={f.nbFois} echeances={echeances} datesEcheances={datesEcheances} entry={f} fbOk={done.fbOk} fbErrMsg={done.fbErrMsg} onNew={()=>{setDone(null);setStep(1);setF(F0);}} onDone={onDone}/>;

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
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <TypeCard sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon="🔄" title="Renouvellement au club" sub="Déjà licencié(e) au RSG"/>
            <TypeCard sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon="✨" title="Nouvelle licence au club" sub="Première inscription au RSG"/>
          </div>
          {f.typeLicence==="renouvellement"&&<div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:10,padding:"14px",marginBottom:10}}>
            <F label="N° de licence FFF (si connu)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Sur mon-compte.fff.fr"/></F>
            {certifMsg?<div style={{borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅ ":"🩺 "}{certifMsg.txt}</div>:<p style={{fontSize:12,color:"#0369a1",margin:"4px 0 0"}}>ℹ️ Saisissez votre nom à l'étape suivante pour vérifier votre certif médical.</p>}
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 12px",fontSize:13,color:C.R}}>🩺 Nouvelle licence → <strong>certificat médical obligatoire.</strong></div>}
        </div>}

        {/* STEP 2 - Joueur + Photo */}
        {step===stepIdx.joueur&&<div>
          {age!==null&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:isMajeur?"#dbeafe":"#dcfce7",fontSize:13,fontWeight:600,color:isMajeur?C.B:C.V}}>{isMajeur?"🧑 Joueur majeur":"👶 Joueur mineur — un représentant légal sera demandé à l'étape suivante"}</div>}
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
            <F label="Catégorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={f.categorie} onChange={e=>set("categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>{f.dateNaissance&&<span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>✓ Détectée auto.</span>}</F>
            <F label="Poste"><select style={inp()} value={f.poste} onChange={e=>set("poste",e.target.value)}><option value="">— Choisir</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></F>
          </div>
          {f.categorie&&tarifs[f.categorie]&&<div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>💰 Tarif {f.categorie} : <strong>{tarifs[f.categorie]} €</strong></div>}
          <F label="Ancien club"><input style={inp()} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Club précédent (si applicable)"/></F>

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
            ℹ️ Vous pouvez ajouter plusieurs représentants légaux (parents séparés, tuteurs, grand-parents, etc.).
          </div>
          {f.representants.map((r,i)=>(
            <div key={i} style={{background:i===0?C.Jp:"#f9fafb",border:`1.5px solid ${i===0?C.Jd:C.Gb}`,borderRadius:10,padding:"14px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{color:C.N,fontWeight:800,fontSize:14,margin:0}}>{i===0?"👨‍👩 Responsable légal principal *":`Responsable légal n°${i+1}`}</h3>
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
          <div style={G2}>
            <F label="Mutuelle"><input style={inp()} value={f.mutuelle} onChange={e=>set("mutuelle",e.target.value)}/></F>
            <F label="N° sécu"><input style={inp()} value={f.numSecu} onChange={e=>set("numSecu",e.target.value)} inputMode="numeric" maxLength={15}/></F>
            <F label="Médecin traitant"><input style={inp()} value={f.docteur} onChange={e=>set("docteur",e.target.value)}/></F>
            <F label="Tél. médecin"><input type="tel" style={inp()} value={f.telDocteur} onChange={e=>set("telDocteur",e.target.value)} inputMode="tel"/></F>
          </div>
          <F label="Allergies, asthme, restrictions médicales"><textarea style={{...inp(),height:64,resize:"vertical"}} value={f.allergiesAsthme} onChange={e=>set("allergiesAsthme",e.target.value)} placeholder="Ex: allergie aux arachides, asthme léger, traitement... ou 'Aucune' si rien à signaler"/></F>

          <div style={{marginTop:14,padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:14,margin:"0 0 12px"}}>📋 Autorisations</p>

            <Chk checked={f.autoSoins} onChange={v=>set("autoSoins",v)} err={errs.autoSoins} label={<><strong>🚑 Soins d'urgence{!isMajeur?" *":""}</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise les responsables du club à appeler les services d'urgence et à faire pratiquer les soins médicaux d'urgence nécessaires en cas d'accident. Les parents seront prévenus immédiatement.</span></>}/>

            <Chk checked={f.autoPhoto} onChange={v=>set("autoPhoto",v)} label={<><strong>📷 Droit à l'image</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise le club à utiliser des photos et vidéos sur lesquelles je figure (ou mon enfant) pour communiquer sur les supports du club : site web, journal local, comptes Facebook / Instagram du RSG.</span></>}/>

            {!isMajeur&&<Chk checked={f.autoTransport} onChange={v=>set("autoTransport",v)} label={<><strong>🚗 Transport en véhicule personnel</strong><br/><span style={{fontSize:12,color:C.G,lineHeight:1.5}}>J'autorise mon enfant à être transporté dans le véhicule personnel d'un autre parent ou d'un dirigeant du club lors des déplacements pour matchs et entraînements.</span></>}/>}
          </div>
        </div>}

        {/* STEP équipement */}
        {step===stepIdx.equip&&<div>
          <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:C.Jp,border:`1px solid ${C.Jd}`,fontSize:13}}>
            <span style={{color:"#92400e",fontWeight:700}}>👕 Équipement pour la catégorie {f.categorie||"—"}</span>
          </div>
          <div style={G2}>
            <F label="Short *"><select style={inp()} value={f.tailleShort} onChange={e=>set("tailleShort",e.target.value)}><option value="">— Choisir</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
            <F label="Chaussettes *"><select style={inp()} value={f.tailleChaussettes} onChange={e=>set("tailleChaussettes",e.target.value)}><option value="">— Choisir</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
          </div>
          {aSweat(f.categorie)&&<F label="Sweat RSG (proposé pour les U10-U11)" span><select style={inp()} value={f.tailleSweat} onChange={e=>set("tailleSweat",e.target.value)}><option value="">— Aucun</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
          {aSurvet(f.categorie)&&<F label="Survêtement (proposé à partir des U12-U13)" span><select style={inp()} value={f.tailleSurvet} onChange={e=>set("tailleSurvet",e.target.value)}><option value="">— Aucun</option>{getTaillesCat(f.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
        </div>}

        {/* STEP famille + documents */}
        {step===stepIdx.famille&&<div>
          {/* Frères / sœurs mineurs */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:C.N,fontWeight:800,fontSize:15,margin:"0 0 6px"}}>👨‍👩‍👧 Frères et sœurs mineurs au club</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Si plusieurs enfants de la famille s'inscrivent, ajoutez-les ici pour bénéficier de la <strong>remise famille</strong> (-10% / -20% / -30% à partir du 2e membre).</p>
            {f.freresSoeurs.map((m,i)=>(
              <div key={i} style={{background:C.Jp,border:`1.5px solid ${C.Jd}`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13}}>Frère/Sœur n°{i+1}</strong>
                  <button onClick={()=>delFrere(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updFrere(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom"><input style={inp()} value={m.prenom} onChange={e=>updFrere(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updFrere(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updFrere(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Catégorie" span><select style={inp()} value={m.categorie} onChange={e=>updFrere(i,"categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                </div>
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updFrere(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                <div style={G2}>
                  <F label="Short"><select style={inp()} value={m.tailleShort} onChange={e=>updFrere(i,"tailleShort",e.target.value)}><option value="">—</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                  <F label="Chaussettes"><select style={inp()} value={m.tailleChaussettes} onChange={e=>updFrere(i,"tailleChaussettes",e.target.value)}><option value="">—</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                </div>
                {aSweat(m.categorie)&&<F label="Sweat RSG"><select style={inp()} value={m.tailleSweat} onChange={e=>updFrere(i,"tailleSweat",e.target.value)}><option value="">— Aucun</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                {aSurvet(m.categorie)&&<F label="Survêtement"><select style={inp()} value={m.tailleSurvet} onChange={e=>updFrere(i,"tailleSurvet",e.target.value)}><option value="">— Aucun</option>{getTaillesCat(m.categorie).map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updFrere(i,"autoSoins",v)} label="🚑 Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updFrere(i,"autoPhoto",v)} label="📷 Droit à l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updFrere(i,"autoTransport",v)} label="🚗 Transport"/>
                </div>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>📸 Photo d'identité</p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updFrere(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addFrere} style={{...BS,width:"100%"}}>+ Ajouter un frère / une sœur mineur(e)</button>
          </div>

          {/* Adultes de la famille */}
          <div style={{marginBottom:18}}>
            <h3 style={{color:"#1e40af",fontWeight:800,fontSize:15,margin:"0 0 6px"}}>👨‍👩 Adultes de la famille au club</h3>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Parents joueurs (Vétérans), dirigeants, etc. La remise famille s'applique sur tous les membres confondus.</p>
            {f.adultesFamille.map((m,i)=>(
              <div key={i} style={{background:"#dbeafe",border:`1.5px solid #93c5fd`,borderRadius:10,padding:"12px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <strong style={{fontSize:13,color:"#1e40af"}}>Adulte n°{i+1}</strong>
                  <button onClick={()=>delAdulte(i)} style={{background:"#fee2e2",color:C.R,border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:700}}>✕</button>
                </div>
                <div style={G2}>
                  <F label="Nom"><input style={inp()} value={m.nom} onChange={e=>updAdulte(i,"nom",e.target.value.toUpperCase())}/></F>
                  <F label="Prénom"><input style={inp()} value={m.prenom} onChange={e=>updAdulte(i,"prenom",e.target.value)}/></F>
                  <F label="Naissance"><input type="date" style={inp()} value={m.dateNaissance} onChange={e=>updAdulte(i,"dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
                  <F label="Sexe"><select style={inp()} value={m.sexe} onChange={e=>updAdulte(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
                  <F label="Nationalité"><select style={inp()} value={m.nationalite} onChange={e=>updAdulte(i,"nationalite",e.target.value)}>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
                  <F label="Catégorie"><select style={inp()} value={m.categorie} onChange={e=>updAdulte(i,"categorie",e.target.value)}><option value="">—</option>{CATS.filter(c=>["Senior","Vétéran","Dirigeant"].includes(c.v)).map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></F>
                  <F label="Téléphone"><input type="tel" style={inp()} value={m.tel} onChange={e=>updAdulte(i,"tel",e.target.value)} inputMode="tel"/></F>
                  <F label="Email"><input type="email" style={inp()} value={m.email} onChange={e=>updAdulte(i,"email",e.target.value)} inputMode="email"/></F>
                </div>
                <F label="Allergies, asthme, restrictions"><input style={inp()} value={m.allergiesAsthme} onChange={e=>updAdulte(i,"allergiesAsthme",e.target.value)} placeholder="Ou 'Aucune'"/></F>
                {m.categorie!=="Dirigeant"&&<div style={G2}>
                  <F label="Short"><select style={inp()} value={m.tailleShort} onChange={e=>updAdulte(i,"tailleShort",e.target.value)}><option value="">—</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                  <F label="Chaussettes"><select style={inp()} value={m.tailleChaussettes} onChange={e=>updAdulte(i,"tailleChaussettes",e.target.value)}><option value="">—</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
                </div>}
                {m.categorie!=="Dirigeant"&&<F label="Survêtement"><select style={inp()} value={m.tailleSurvet} onChange={e=>updAdulte(i,"tailleSurvet",e.target.value)}><option value="">— Aucun</option>{TA.map(t=><option key={t} value={t}>{t}</option>)}</select></F>}
                <div style={{marginTop:8,padding:8,background:C.W,borderRadius:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>Autorisations</p>
                  <Chk checked={m.autoSoins} onChange={v=>updAdulte(i,"autoSoins",v)} label="🚑 Soins d'urgence"/>
                  <Chk checked={m.autoPhoto} onChange={v=>updAdulte(i,"autoPhoto",v)} label="📷 Droit à l'image"/>
                  <Chk checked={m.autoTransport} onChange={v=>updAdulte(i,"autoTransport",v)} label="🚗 Transport"/>
                </div>
                <div style={{marginTop:8}}>
                  <p style={{fontSize:12,fontWeight:700,margin:"0 0 6px"}}>📸 Photo d'identité</p>
                  <PhotoInput value={m.photoBase64} onChange={v=>updAdulte(i,"photoBase64",v)}/>
                </div>
              </div>
            ))}
            <button onClick={addAdulte} style={{background:"#dbeafe",color:"#1e40af",border:`2px solid #93c5fd`,borderRadius:10,padding:"12px 18px",fontWeight:700,fontSize:14,cursor:"pointer",width:"100%",minHeight:48}}>+ Ajouter un adulte de la famille</button>
          </div>

          {/* Documents */}
          <div style={{padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:14,margin:"0 0 4px"}}>📁 Documents à fournir en permanence</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Cochez ceux que vous avez déjà préparés. Les autres seront à apporter.</p>
            <Chk checked={f.certifMedical} onChange={v=>set("certifMedical",v)} label={certifMsg?.ok?"Questionnaire de santé (certif non requis)":"Certificat médical (moins de 3 ans) — OBLIGATOIRE pour nouvelle licence ou si certif expiré"}/>
            <Chk checked={f.photoId} onChange={v=>set("photoId",v)} label="Pièce d'identité (CNI ou passeport)"/>
            <Chk checked={f.justifDom} onChange={v=>set("justifDom",v)} label="Justificatif de domicile (- 3 mois)"/>
            <Chk checked={f.rib} onChange={v=>set("rib",v)} label="RIB"/>
            {aDesMembresFamille&&<Chk checked={f.livretFamille} onChange={v=>set("livretFamille",v)} label="📋 Livret de famille — OBLIGATOIRE pour bénéficier du tarif famille"/>}
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
            <div style={{display:"flex",justifyContent:"space-between",fontSize:18,paddingTop:10,marginTop:8,borderTop:"2px solid #555",fontWeight:900}}>
              <span style={{color:C.W}}>TOTAL</span>
              <span style={{color:C.J}}>{prixFinalTotal} €</span>
            </div>
          </div>

          {/* Nom de famille (si famille) */}
          {tousMembres.length>1&&<F label="Nom de famille (pour regrouper sur facture)"><input style={inp()} value={f.nomFamille} onChange={e=>set("nomFamille",e.target.value.toUpperCase())} placeholder="Ex: DUPONT"/></F>}

          {/* Mode de paiement */}
          {errs.modePaiement&&<ErrB msg={errs.modePaiement}/>}
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Mode de paiement *</p>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            {MODES_PAIEMENT.map(m=>(
              <button key={m.id} onClick={()=>{set("modePaiement",m.id);if(!m.fractionnable)set("nbFois",1);}}
                style={{flex:"1 0 auto",padding:"10px 12px",border:`2px solid ${f.modePaiement===m.id?C.J:C.Gb}`,background:f.modePaiement===m.id?C.Jp:"#fafafa",borderRadius:10,fontWeight:700,fontSize:13,cursor:"pointer",textAlign:"center",minHeight:48}}>
                {m.l}
              </button>
            ))}
          </div>

          {/* Fractionnement (chèque uniquement) */}
          {f.modePaiement&&modeObj?.fractionnable&&(
            <div style={{background:C.Gc,borderRadius:10,padding:"14px",marginBottom:14}}>
              <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Paiement en plusieurs fois (sans frais)</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:f.nbFois>1?12:0}}>
                {[1,2,3,4].map(n=>(
                  <button key={n} onClick={()=>set("nbFois",n)}
                    style={{flex:"1 0 auto",padding:"8px 10px",border:`2px solid ${f.nbFois===n?C.J:C.Gb}`,background:f.nbFois===n?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:40}}>
                    {n===1?"1× (comptant)":`${n}×`}
                  </button>
                ))}
              </div>
              {f.nbFois>1&&<F label="Date du 1er encaissement *" err={errs.dateEcheance1}>
                <input type="date" style={inp(errs.dateEcheance1)} value={f.dateEcheance1} onChange={e=>set("dateEcheance1",e.target.value)} min={new Date().toISOString().slice(0,10)}/>
                <span style={{fontSize:11,color:C.G,marginTop:3,display:"block"}}>Les autres chèques seront encaissés les mois suivants à la même date.</span>
              </F>}
              {f.nbFois>1&&datesEcheances&&(
                <div style={{marginTop:8,padding:"10px 12px",background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
                  <p style={{fontWeight:700,fontSize:12,color:C.G,margin:"0 0 6px"}}>Échéancier prévu :</p>
                  {echeances.map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<f.nbFois-1?`1px solid ${C.Gc}`:"none",fontSize:13}}>
                      <span style={{color:C.G}}>Chèque {i+1} (encaissé le {datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span>
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

          {f.freresSoeurs.length>0&&<RB title={`Frères/sœurs (${f.freresSoeurs.length})`}>
            {f.freresSoeurs.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom}`}/>)}
          </RB>}

          {f.adultesFamille.length>0&&<RB title={`Adultes famille (${f.adultesFamille.length})`}>
            {f.adultesFamille.map((m,i)=><RR key={i} l={m.categorie||"?"} v={`${m.prenom} ${m.nom}`}/>)}
          </RB>}

          {/* Récap paiement */}
          <div style={{background:C.N,borderRadius:10,padding:"14px",marginBottom:8}}>
            <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Paiement</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.W,fontSize:13}}>{modeObj?.l||"—"}</div>
                {f.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {f.nbFois} chèques</div>}
                {tousMembres.length>1&&<div style={{color:"#86efac",fontSize:12}}>Tarif famille {f.nomFamille||""} ({tousMembres.length} membres)</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:C.J,fontWeight:900,fontSize:24}}>{prixFinalTotal} €</div>
              </div>
            </div>
            {f.nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
              {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Chèque {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
            </div>}
          </div>

          {/* Documents à apporter */}
          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"12px",marginBottom:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px",color:"#92400e"}}>📋 À apporter en permanence licence</p>
            <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#78350f",lineHeight:1.6}}>
              {!f.certifMedical&&<li>Certificat médical {certifReq?"(OBLIGATOIRE)":""}</li>}
              {!f.photoId&&<li>Pièce d'identité (CNI/passeport)</li>}
              {!f.justifDom&&<li>Justificatif de domicile (- 3 mois)</li>}
              {!f.rib&&<li>RIB</li>}
              {aDesMembresFamille&&!f.livretFamille&&<li><strong>Livret de famille</strong> (obligatoire pour tarif famille)</li>}
              <li><strong>{prixFinalTotal} €</strong> en {modeObj?.l?.toLowerCase()||"mode à choisir"}{f.nbFois>1?` (${f.nbFois} chèques)`:""}</li>
            </ul>
          </div>

          {f.photoBase64&&<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:12,background:C.Gc,borderRadius:8,padding:10}}>
            <img src={f.photoBase64} alt="Photo" style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:`2px solid ${C.J}`,flexShrink:0}}/>
            <span style={{fontSize:13,color:C.V,fontWeight:600}}>✓ Photo d'identité fournie</span>
          </div>}

          {f.typeLicence==="nouvelle"&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#1e40af",marginBottom:10}}>
            ℹ️ <strong>Première inscription au club</strong> : nous vous recommandons d'imprimer ce récap et de l'apporter en permanence.
          </div>}

          <button onClick={()=>printRecap(f,saison,prixFinalTotal,modeObj,echeances,datesEcheances,certifReq,aDesMembresFamille)} style={{...BS,width:"100%",marginBottom:8}}>🖨 Imprimer ce récap</button>

          <p style={{fontSize:12,color:C.G,lineHeight:1.5}}>En envoyant, vous certifiez l'exactitude des informations (RGPD).</p>
        </div>}

        <div style={{display:"flex",gap:10,marginTop:20,paddingTop:16,borderTop:`1px solid ${C.Gc}`}}>
          {step>1&&<button style={BS} onClick={prev}>← Préc.</button>}
          <div style={{flex:1}}/>
          {step<total&&<button style={BP} onClick={next}>Suivant →</button>}
          {step===total&&<button style={{...BP,opacity:saving?.7:1}} onClick={submit} disabled={saving}>{saving?"Envoi…":"✓ Envoyer"}</button>}
        </div>
      </div>
    </div>
  );
}


/* ══ CONFIRMATION ═════════════════════════════════════════════════ */
function Confirmation({refId,prenom,nom,saison,prixFinal,modePaiement,nbFois,echeances,datesEcheances,entry,fbOk,fbErrMsg,onNew,onDone}){
  const modeObj=MODES_PAIEMENT.find(m=>m.id===modePaiement);
  return<div style={{maxWidth:480,margin:"24px auto",padding:"0 14px 64px",textAlign:"center"}}>
    <div style={{background:C.W,borderRadius:16,padding:"28px 20px",boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`3px solid ${C.J}`}}>
      <div style={{fontSize:52,marginBottom:10}}>🎉</div>
      <h2 style={{color:C.N,fontWeight:900,fontSize:22,margin:"0 0 6px"}}>Préinscription envoyée !</h2>
      <p style={{color:C.G,margin:"0 0 4px",fontSize:14}}>Merci <strong>{prenom} {nom}</strong></p>
      <p style={{color:C.G,margin:"0 0 16px",fontSize:13}}>Saison {saison}</p>
      {fbOk===false&&<div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 12px",margin:"0 0 12px",fontSize:12,color:"#92400e",textAlign:"left"}}>
        ⚠️ <strong>Attention : envoi cloud échoué</strong><br/>
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
        <p style={{color:C.W,fontSize:13,margin:0}}>{modeObj?.l||""}{nbFois>1?` · ${nbFois} chèques`:""}</p>
        {echeances&&nbFois>1&&datesEcheances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Chèque {i+1} ({datesEcheances[i]?fmtD(datesEcheances[i]):"?"})</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
        </div>}
      </div>
      <p style={{color:C.G,fontSize:13,lineHeight:1.6,margin:"0 0 16px"}}>Apportez votre dossier en <strong>permanence licence</strong> pour finaliser l'inscription.</p>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {entry&&<button style={BS} onClick={()=>printRecap(entry,saison,prixFinal,modeObj,echeances,datesEcheances,entry.certifNeeded,(entry.freresSoeurs?.length||0)+(entry.adultesFamille?.length||0)>0)}>🖨 Imprimer</button>}
        <button style={BS} onClick={onDone}>Accueil</button>
        <button style={BP} onClick={onNew}>Nouvelle préinscription</button>
      </div>
    </div>
  </div>;
}

/* ══ DASHBOARD ════════════════════════════════════════════════════ */
function Dashboard({saison,licencies,onLicenciesChange,tarifs,onTarifsChange}){
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

  const [fbStatus,setFbStatus]=useState("connecting"); // "connecting" | "online" | "offline"

  const refresh=useCallback(async()=>{
    setLoading(true);
    const d=await stGet(keyIns(saison));
    setData(Array.isArray(d)?d:[]);
    setLoading(false);
  },[saison]);

  useEffect(()=>{refresh();},[refresh]);

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
    return(!q||`${d.nom} ${d.prenom} ${d.id} ${getEmailContact(d)} ${d.email||""}`.toLowerCase().includes(q))&&(fSt==="tous"||d.statut===fSt)&&(fCat==="toutes"||d.categorie===fCat)&&(fType==="tous"||d.typeLicence===fType);
  });

  const stats={
    total:data.length,
    attente:data.filter(d=>d.statut==="attente").length,
    valide:data.filter(d=>d.statut==="valide").length,
    paye:data.filter(d=>d.statut==="paye").length,
    certif:data.filter(d=>d.certifNeeded).length,
    ca:data.filter(d=>d.prixFinal).reduce((s,d)=>s+(d.prixFinal||0),0),
  };

  const upd=async(id,patch)=>{
    const d=(await stGet(keyIns(saison))||[]).map(e=>e.id===id?{...e,...patch}:e);
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
      if(type==="all")await exportXLSX([{name:"Toutes",rows:[H_INS,...filtered.map(toRow)]}],fn+"Preinscriptions.xlsx");
      else if(type==="parEquipe"){const cats=[...new Set(data.map(d=>d.categorie))].sort();await exportXLSX(cats.map(cat=>({name:cat,rows:[H_INS,...data.filter(d=>d.categorie===cat).map(toRow)]})),fn+"ParEquipe.xlsx");}
      else if(type==="paiements"){
        const H=["Référence","Nom","Prénom","Catégorie","Mode paiement","Nb fois","Tarif total €","Famille","Membres famille","1er encaissement","Statut"];
        await exportXLSX([{name:"Paiements",rows:[H,...data.map(e=>{
          const nbMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
          return[e.id,e.nom,e.prenom,e.categorie,e.modePaiement||"",e.nbFois||1,e.prixFinal||"",e.nomFamille||"",nbMembres,(e.datesEcheances&&e.datesEcheances[0])||"",STATUTS[e.statut]?.l||""];
        })]}],fn+"Paiements.xlsx");
      }
      else if(type==="equip"){const rows=data.filter(d=>d.statut!=="refuse").map(e=>[e.categorie,`${e.prenom} ${e.nom}`,e.tailleShort||"",e.tailleChaussettes||"",getSurvet(e),e.tailleSweat||"",STATUTS[e.statut]?.l||""]);rows.sort((a,b)=>a[0].localeCompare(b[0]));await exportXLSX([{name:"Équipements",rows:[["Catégorie","Joueur","Short","Chaussettes","Survêtement","Sweat","Statut"],...rows]}],fn+"Equipements.xlsx");}
      else if(type==="certifs")await exportXLSX([{name:"Certifs",rows:[["Nom","Prénom","Catégorie","Contact","Certif requis","Statut"],...data.map(e=>[e.nom,e.prenom,e.categorie,getEmailContact(e),e.certifNeeded?"OUI":"Non",STATUTS[e.statut]?.l||""])]}],fn+"Certifs.xlsx");
      else if(type==="contacts")await exportXLSX([{name:"Contacts",rows:[["Nom","Prénom","Catégorie","Téléphone","Email","Resp.","Tél resp.","Email resp.","Statut"],...data.map(e=>{const r=getResp1(e);return[e.nom,e.prenom,e.categorie,getTelContact(e),getEmailContact(e),r?`${r.prenom||""} ${r.nom||""}`:"",r?.tel||"",r?.email||"",STATUTS[e.statut]?.l||""];})]}],fn+"Contacts.xlsx");
      else if(type==="licencies")await exportXLSX([{name:"Base licenciés",rows:[["Nom","Prénom","N° Licence FFF","Catégorie","Année dernier certif"],...licencies.map(l=>[l.nom,l.prenom,l.numLicence||"",l.categorie||"",l.anneeLastCertif||""])]}],fn+"BaseLicencies.xlsx");
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  const equipData={};
  data.filter(d=>d.statut!=="refuse").forEach(d=>{if(!equipData[d.categorie])equipData[d.categorie]={};const survet=getSurvet(d);if(d.tailleShort){equipData[d.categorie].tailleShort=equipData[d.categorie].tailleShort||{};equipData[d.categorie].tailleShort[d.tailleShort]=(equipData[d.categorie].tailleShort[d.tailleShort]||0)+1;}if(d.tailleChaussettes){equipData[d.categorie].tailleChaussettes=equipData[d.categorie].tailleChaussettes||{};equipData[d.categorie].tailleChaussettes[d.tailleChaussettes]=(equipData[d.categorie].tailleChaussettes[d.tailleChaussettes]||0)+1;}if(survet){equipData[d.categorie].tailleSurvet=equipData[d.categorie].tailleSurvet||{};equipData[d.categorie].tailleSurvet[survet]=(equipData[d.categorie].tailleSurvet[survet]||0)+1;}if(d.tailleSweat){equipData[d.categorie].tailleSweat=equipData[d.categorie].tailleSweat||{};equipData[d.categorie].tailleSweat[d.tailleSweat]=(equipData[d.categorie].tailleSweat[d.tailleSweat]||0)+1;}});

  return<div style={{maxWidth:900,margin:"0 auto",padding:"12px 12px 80px"}}>
    {/* Indicateur Firebase + diagnostic */}
    <div style={{padding:"8px 12px",marginBottom:10,background:fbStatus==="online"?"#dcfce7":fbStatus==="connecting"?"#fef9c3":"#fee2e2",border:`1px solid ${fbStatus==="online"?"#86efac":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,borderRadius:8,fontSize:12,color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:fbStatus==="online"?C.V:fbStatus==="connecting"?"#eab308":C.R}}/>
          <strong>{fbStatus==="online"?"☁️ Synchronisation Firebase active":fbStatus==="connecting"?"Connexion à Firebase…":"⚠️ Mode hors-ligne"}</strong>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button onClick={async()=>{
            const log=[];
            log.push("=== Diagnostic Firebase ===");
            log.push("Firebase disponible : "+(isFirebaseAvailable()?"OUI ✓":"NON ✗"));
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
          }} style={{background:"transparent",color:"inherit",border:"1px solid currentColor",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>🔍 Diagnostic</button>
          <button onClick={refresh} style={{background:"transparent",color:"inherit",border:"1px solid currentColor",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>↻ Recharger</button>
        </div>
      </div>
    </div>

    {/* Stats */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      {[{l:"Total",v:stats.total,c:C.N},{l:"En attente",v:stats.attente,c:"#ca8a04"},{l:"Validés",v:stats.valide,c:C.V},{l:"Payés",v:stats.paye,c:C.B},{l:"🩺 Certifs",v:stats.certif,c:C.R},{l:"💰 CA estimé",v:`${stats.ca} €`,c:"#7c3aed"}].map(({l,v,c})=>(
        <div key={l} style={{background:C.W,border:`1.5px solid ${c}44`,borderRadius:10,padding:"8px 12px",textAlign:"center",flex:"1 1 80px"}}>
          <div style={{fontSize:v.toString().length>5?16:22,fontWeight:900,color:c}}>{v}</div>
          <div style={{fontSize:10,color:C.G,lineHeight:1.2}}>{l}</div>
        </div>
      ))}
    </div>

    {/* Exports */}
    <div style={{background:C.W,borderRadius:12,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>📊 Exports Excel <span style={{fontSize:11,color:C.G,fontWeight:400}}>— compatibles Google Sheets</span></p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {[{id:"all",l:"📋 Tous dossiers"},{id:"parEquipe",l:"⚽ Par équipe"},{id:"paiements",l:"💰 Paiements"},{id:"equip",l:"👕 Tailles"},{id:"certifs",l:"🩺 Certifs"},{id:"contacts",l:"📞 Contacts"},{id:"licencies",l:"👥 Licenciés"}].map(({id,l})=>(
          <button key={id} onClick={()=>doExport(id)} disabled={exporting} style={{background:C.N,color:C.J,border:"none",borderRadius:8,padding:"8px 12px",fontWeight:700,fontSize:12,cursor:"pointer",opacity:exporting?.6:1,flex:"1 0 auto",minWidth:110}}>{exporting?"…":l}</button>
        ))}
      </div>
    </div>

    {/* Tabs */}
    <div style={{display:"flex",background:C.W,borderRadius:10,padding:4,marginBottom:12,gap:4,border:`1px solid ${C.Gb}`,overflowX:"auto"}}>
      {[{id:"liste",l:"📋 Dossiers"},{id:"nonpreins",l:"🔍 Non préinscrits"},{id:"certifs",l:"🩺 Certifs"},{id:"certifs2627",l:"🩺 Saison N+1"},{id:"equip",l:"👕 Équip."},{id:"paiements",l:"💰 Paiements"},{id:"tarifs",l:"⚙️ Tarifs"},{id:"footclubs",l:"🌐 Footclubs"},{id:"base",l:`👥 Licenciés (${licencies.length})`}].map(({id,l})=>(
        <button key={id} onClick={()=>setTab(id)} style={{flex:"1 0 auto",padding:"8px 8px",border:"none",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer",background:tab===id?C.J:"transparent",color:tab===id?C.N:C.G,whiteSpace:"nowrap"}}>{l}</button>
      ))}
      <button onClick={refresh} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:7,padding:"8px 10px",fontSize:14,cursor:"pointer",flexShrink:0}}>↺</button>
    </div>

    {/* LISTE */}
    {tab==="liste"&&<>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
        <input style={{...inp(),fontSize:14}} placeholder="🔍 Nom, prénom, email, référence…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{val:fSt,set:setFSt,opts:[{v:"tous",l:"Tous statuts"},...Object.entries(STATUTS).map(([k,v])=>({v:k,l:v.l}))]},{val:fCat,set:setFCat,opts:[{v:"toutes",l:"Toutes cat."},...CATS.map(c=>({v:c.v,l:c.v}))]},{val:fType,set:setFType,opts:[{v:"tous",l:"Tous types"},{v:"renouvellement",l:"Renouvellements"},{v:"nouvelle",l:"Nouvelles"}]}].map((s,i)=>(
            <select key={i} style={{...inp(),flex:"1 1 100px",fontSize:13}} value={s.val} onChange={e=>s.set(e.target.value)}>{s.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select>
          ))}
        </div>
        <p style={{fontSize:12,color:C.G,margin:0}}>{filtered.length} / {data.length} dossier(s)</p>
      </div>
      {loading&&<p style={{textAlign:"center",color:C.G,padding:32}}>Chargement…</p>}
      {!loading&&filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucune préinscription</p>}
      {!loading&&filtered.map(e=><EntryCard key={e.id} e={e} sel={sel} onSel={()=>{setSel(sel?.id===e.id?null:e);setNote(e.notes||"");}}/>)}
      {sel&&<DetailPanel e={sel} note={note} setNote={setNote} onUpd={upd} onDel={del} onChangeStatut={(id,st)=>upd(id,{statut:st,dateValidation:st==="valide"?new Date().toISOString():undefined,datePaiement:st==="paye"?new Date().toISOString():undefined})}/>}
    </>}

    {/* CERTIFS */}
    {tab==="certifs"&&<div>
      <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:13,color:C.R}}><strong>🩺 Joueurs nécessitant un certificat médical</strong><br/>Règle FFF : certif valable 3 saisons.</div>
      {data.filter(d=>d.certifNeeded).length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun</p>}
      {data.filter(d=>d.certifNeeded).map(e=><div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,borderLeft:`4px solid ${C.R}`}}>
        <span style={{fontWeight:700}}>{e.prenom} {e.nom}</span><span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span>
        <div style={{fontSize:12,color:C.G,marginTop:3}}>{getEmailContact(e)} · Certif : {e.anneeLastCertifBase||"inconnu"}</div>
      </div>)}
    </div>}

    {/* NON PRÉINSCRITS — qui de la saison N-1 ne s'est pas réinscrit ? */}
    {tab==="nonpreins"&&<NonPreinscrits licencies={licencies} data={data} saison={saison}/>}

    {/* CERTIFS PROCHAINE SAISON */}
    {tab==="certifs2627"&&<Certifs2627 licencies={licencies} saison={saison}/>}

    {/* ÉQUIPEMENTS */}
    {tab==="equip"&&<div>
      {Object.entries(equipData).sort().map(([cat,fields])=><div key={cat} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:C.N,color:C.J,padding:"2px 8px",borderRadius:4,fontSize:12}}>{cat}</span>
          <span style={{color:C.G,fontSize:12}}>{data.filter(d=>d.categorie===cat&&d.statut!=="refuse").length} joueur(s)</span>
        </div>
        {Object.entries(fields).map(([field,sizes])=><div key={field} style={{marginBottom:8}}>
          <p style={{fontSize:12,color:C.G,margin:"0 0 4px"}}>{field==="tailleShort"?"Short":field==="tailleChaussettes"?"Chaussettes":field==="tailleSweat"?"Sweat RSG":"Survêtement"}</p>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{Object.entries(sizes).sort().map(([sz,n])=><span key={sz} style={{background:C.J,color:C.N,padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:700}}>{sz} × {n}</span>)}</div>
        </div>)}
      </div>)}
    </div>}

    {/* PAIEMENTS */}
    {tab==="paiements"&&<div>
      <div style={{background:C.W,borderRadius:12,padding:"14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
        <p style={{fontWeight:700,fontSize:14,margin:"0 0 12px"}}>💰 Récapitulatif paiements</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
          {Object.entries({"💳 CB":data.filter(d=>d.modePaiement==="cb").length,"📝 Chèque":data.filter(d=>d.modePaiement==="cheque").length,"💵 Espèces":data.filter(d=>d.modePaiement==="especes").length}).map(([l,v])=>(
            <div key={l} style={{background:C.Gc,borderRadius:8,padding:"10px",textAlign:"center"}}><div style={{fontWeight:900,fontSize:20}}>{v}</div><div style={{fontSize:11,color:C.G}}>{l}</div></div>
          ))}
        </div>
        {/* Par mode */}
        {[{id:"cb",l:"💳 CB"},{id:"cheque",l:"📝 Chèque"},{id:"especes",l:"💵 Espèces"}].map(m=>{
          const grp=data.filter(d=>d.modePaiement===m.id);
          if(!grp.length)return null;
          return<div key={m.id} style={{marginBottom:12}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px",color:C.G}}>{m.l} — {grp.length} dossier(s) · {grp.reduce((s,d)=>s+(d.prixFinal||0),0)} € estimé</p>
            {grp.filter(d=>d.nbFois>1).map(d=><div key={d.id} style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 10px",marginBottom:4,fontSize:12}}>
              <span style={{fontWeight:700}}>{d.prenom} {d.nom}</span> — {d.prixFinal} € en {d.nbFois}×{d.datesEcheances&&d.datesEcheances[0]?` · 1er encaissement ${fmtD(d.datesEcheances[0])}`:""}
              {d.datesEcheances&&d.nbFois>1&&<div style={{marginTop:4,fontSize:11,color:"#92400e"}}>Échéances : {d.datesEcheances.map(dt=>fmtD(dt)).join(" · ")}</div>}
            </div>)}
          </div>;
        })}
      </div>
    </div>}

    {/* TARIFS */}
    {tab==="tarifs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>⚙️ Gestion des tarifs — Saison {saison}</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0}}>Modifiez les tarifs par catégorie. Ils seront affichés sur le formulaire public et utilisés pour les calculs.</p>
      </div>
      {!editTarifs?(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {Object.entries(tarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.Gb}`}}>
                <span style={{fontWeight:600,fontSize:13}}>{cat}</span>
                <span style={{fontWeight:900,fontSize:18,color:C.J}}>{prix} €</span>
              </div>
            ))}
          </div>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:12,border:`1px solid ${C.Gb}`}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px"}}>Remises famille (fixes)</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(REMISE_FAMILLE).map(([rang,pct])=><span key={rang} style={{background:C.Gc,padding:"4px 10px",borderRadius:6,fontSize:12,fontWeight:600}}>{rang==="4"?"4ème et +":`${rang}ème enfant`} : -{pct}%</span>)}
            </div>
          </div>
          <button style={{...BP,width:"100%"}} onClick={()=>{setTmpTarifs({...tarifs});setEditTarifs(true);}}>✏️ Modifier les tarifs</button>
        </div>
      ):(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            {Object.entries(tmpTarifs).map(([cat,prix])=>(
              <div key={cat} style={{background:C.W,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.Gb}`}}>
                <label style={{...lbl,fontSize:11}}>{cat}</label>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <input type="number" style={{...inp(),fontSize:15,fontWeight:700}} value={prix} onChange={e=>setTmpTarifs(p=>({...p,[cat]:parseInt(e.target.value)||0}))} min={0} max={999}/>
                  <span style={{fontSize:13,color:C.G,flexShrink:0}}>€</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={{...BP,flex:1}} onClick={async()=>{await onTarifsChange(tmpTarifs);setEditTarifs(false);}}>✓ Enregistrer</button>
            <button style={{...BS,flex:1}} onClick={()=>setEditTarifs(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>}

    {/* FOOTCLUBS */}
    {tab==="footclubs"&&<div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
        <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 6px"}}>🌐 Workflow Footclubs</p>
        <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.6}}>Pour chaque joueur : <strong>1)</strong> Footclubs → Licences → Dématérialisées · <strong>2)</strong> Collez l'email · <strong>3)</strong> FFF envoie le formulaire automatiquement.</p>
      </div>
      <button style={{...BP,marginBottom:12,width:"100%",fontSize:14}} onClick={()=>window.open("https://footclubs.fff.fr","_blank")}>Ouvrir Footclubs →</button>
      {data.filter(d=>d.statut==="attente"||d.statut==="valide").map(e=>{const email=getEmailContact(e);return<div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
        <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:8}}>
          <div><span style={{fontWeight:700,fontSize:14}}>{e.prenom} {e.nom}</span><span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span></div>
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        </div>
        <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:"8px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8}}>
          <div><p style={{fontSize:10,color:"#0369a1",margin:0,fontWeight:700}}>EMAIL FOOTCLUBS</p><p style={{fontSize:13,fontWeight:600,color:C.N,margin:0}}>{email||"—"}</p></div>
          <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}} onClick={()=>email&&navigator.clipboard.writeText(email)}>Copier</button>
        </div>
        <div style={{fontSize:12,color:C.G,marginBottom:8,display:"flex",gap:12,flexWrap:"wrap"}}>
          <span>Né(e) : {fmtD(e.dateNaissance)}</span>
          <span style={{color:e.certifNeeded?C.R:C.V,fontWeight:600}}>{e.certifNeeded?"🩺 Certif requis":"✅ Certif OK"}</span>
          <span style={{color:C.J,fontWeight:600}}>{e.prixFinal||0} €{e.nbFois>1?` (${e.nbFois}×)`:""}</span>
        </div>
        {e.photoBase64&&<div style={{display:"flex",gap:8,alignItems:"center",fontSize:12,color:C.V,marginBottom:8}}><img src={e.photoBase64} style={{width:36,height:36,objectFit:"cover",borderRadius:4,border:`1.5px solid ${C.J}`}}/><span>Photo → uploader dans Footclubs</span></div>}
        <button style={{...BP,fontSize:12,padding:"8px 14px",width:"100%"}} onClick={()=>upd(e.id,{statut:"valide",dateValidation:new Date().toISOString()})}>✓ Initié dans Footclubs</button>
      </div>;})}
    </div>}

    {/* BASE LICENCIÉS */}
    {tab==="base"&&<BaseLicencies saison={saison} licencies={licencies} onSave={async lic=>{await onLicenciesChange(lic);}}/>}
  </div>;
}

/* ══ NON PRÉINSCRITS — qui de la saison N-1 manque à l'appel ? ════ */
function NonPreinscrits({licencies,data,saison}){
  const [filtre,setFiltre]=useState("tous");
  const [srch,setSrch]=useState("");
  const [exporting,setExporting]=useState(false);

  // Construire un set des noms+prenoms déjà préinscrits (sans accents, en minuscules)
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const preinscritsSet=new Set();
  data.forEach(d=>{
    preinscritsSet.add(`${norm(d.nom)}|${norm(d.prenom)}`);
    (d.freresSoeurs||[]).forEach(m=>preinscritsSet.add(`${norm(m.nom)}|${norm(m.prenom)}`));
    (d.adultesFamille||[]).forEach(m=>preinscritsSet.add(`${norm(m.nom)}|${norm(m.prenom)}`));
  });

  // Trouver les licenciés saison N-1 qui ne sont pas dans les préinscriptions
  const manquants=licencies.filter(l=>{
    const nom=l.n||l.nom||"";
    const prenom=l.p||l.prenom||"";
    if(!nom&&!prenom)return false;
    return !preinscritsSet.has(`${norm(nom)}|${norm(prenom)}`);
  });

  // Filtrage par catégorie
  const cats=[...new Set(manquants.map(l=>l.c||l.categorie||"?"))].filter(Boolean).sort();
  const liste=filtre==="tous"?manquants:manquants.filter(l=>(l.c||l.categorie)===filtre);
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
      <p style={{fontWeight:700,fontSize:14,color:"#92400e",margin:"0 0 4px"}}>🔍 Licenciés non encore préinscrits pour {saison}</p>
      <p style={{fontSize:13,color:"#78350f",margin:0,lineHeight:1.5}}>
        Comparaison entre la base Footclubs (saison passée) et les préinscriptions reçues pour {saison}.<br/>
        <strong>{manquants.length}</strong> licencié(s) de la saison passée n'ont pas encore préinscrit (sur {licencies.length}).
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
        <div style={{fontSize:11,color:C.G}}>✓ Réinscrits</div>
      </div>
    </div>

    {/* Actions */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={()=>copyEmails("all")} disabled={!emails.length}>📧 Copier {emails.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!manquants.length}>{exporting?"…":"📊 Export Excel"}</button>
    </div>

    {/* Filtre par catégorie */}
    <div style={{marginBottom:10}}>
      <select style={{...inp(),fontSize:14,marginBottom:8}} value={filtre} onChange={e=>setFiltre(e.target.value)}>
        <option value="tous">Toutes catégories ({manquants.length})</option>
        {cats.map(c=>{const n=manquants.filter(l=>(l.c||l.categorie)===c).length;return<option key={c} value={c}>{c} ({n})</option>;})}
      </select>
      {filtre!=="tous"&&emailsCat.length>0&&<button style={{...BS,width:"100%",fontSize:12,padding:"8px 12px"}} onClick={()=>copyEmails("cat")}>📧 Copier les {emailsCat.length} emails de la catégorie {filtre}</button>}
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`🔍 Rechercher dans ${liste.length}…`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {liste.length} affiché(s)</p>
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun</p>}
    {filtered.map((l,i)=>{
      const email=getEmail(l);
      const req=certifRequis(l);
      return<div key={i} style={{background:C.W,borderRadius:8,padding:"10px 12px",marginBottom:4,borderLeft:`3px solid ${C.R}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
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

/* ══ PERMANENCE — Interface bénévoles ═════════════════════════════ */
function Permanence({saison,tarifs}){
  const [data,setData]=useState([]);
  const [search,setSearch]=useState("");
  const [openId,setOpenId]=useState(null);
  const [fbStatus,setFbStatus]=useState("connecting");
  const [filtre,setFiltre]=useState("attente"); // attente | tous

  useEffect(()=>{
    if(!isFirebaseAvailable()){
      setFbStatus("offline");
      stGet(keyIns(saison)).then(d=>setData(Array.isArray(d)?d:[]));
      return;
    }
    setFbStatus("connecting");
    const unsub=fbWatchInscriptions(saison,(fbData)=>{
      setFbStatus("online");
      const sorted=[...fbData].sort((a,b)=>(b.datePreinscription||"").localeCompare(a.datePreinscription||""));
      setData(sorted);
      stSet(keyIns(saison),sorted);
    },()=>{
      setFbStatus("offline");
      stGet(keyIns(saison)).then(d=>setData(Array.isArray(d)?d:[]));
    });
    return ()=>unsub&&unsub();
  },[saison]);

  const upd=async(id,patch)=>{
    const d=data.map(e=>e.id===id?{...e,...patch}:e);
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
  const encaisse=data.filter(d=>d.statut==="paye").reduce((s,d)=>s+(d.prixFinal||0),0);
  const aTraiter=data.filter(d=>d.statut==="attente"||d.statut==="incomplet").length;
  const valides=data.filter(d=>d.statut==="valide"||d.statut==="paye").length;

  return<div style={{maxWidth:760,margin:"0 auto",padding:"12px 12px 80px"}}>
    {/* Indicateur Firebase */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"6px 12px",marginBottom:10,background:fbStatus==="online"?"#dcfce7":fbStatus==="connecting"?"#fef9c3":"#fee2e2",border:`1px solid ${fbStatus==="online"?"#86efac":fbStatus==="connecting"?"#fde047":"#fca5a5"}`,borderRadius:8,fontSize:12,color:fbStatus==="online"?C.V:fbStatus==="connecting"?"#a16207":C.R}}>
      <strong>{fbStatus==="online"?"☁️ Synchronisation active":fbStatus==="connecting"?"Connexion…":"⚠️ Hors-ligne"}</strong>
      <span style={{fontSize:11,color:"#6b7280"}}>{filtered.length} dossier(s)</span>
    </div>

    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      <div style={{background:C.W,border:`2px solid ${C.J}`,borderRadius:10,padding:"10px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:"#ca8a04"}}>{aTraiter}</div>
        <div style={{fontSize:11,color:C.G}}>⏳ À traiter</div>
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
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      <button onClick={()=>setFiltre("attente")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="attente"?C.J:C.Gb}`,background:filtre==="attente"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        ⏳ À traiter ({aTraiter})
      </button>
      <button onClick={()=>setFiltre("tous")} style={{flex:1,padding:"10px",border:`2px solid ${filtre==="tous"?C.J:C.Gb}`,background:filtre==="tous"?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:46}}>
        Tous ({data.length})
      </button>
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:15,marginBottom:12,minHeight:48}} placeholder="🔍 Rechercher par nom, prénom..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>

    {/* Liste */}
    {filtered.length===0&&<p style={{textAlign:"center",color:C.G,padding:32,fontStyle:"italic"}}>Aucun dossier {filtre==="attente"?"en attente":""}</p>}
    {filtered.map(e=><PermFiche key={e.id} e={e} open={openId===e.id} onToggle={()=>setOpenId(openId===e.id?null:e.id)} onUpd={upd} tarifs={tarifs}/>)}
  </div>;
}

function PermFiche({e,open,onToggle,onUpd,tarifs}){
  const totalMembres=1+(e.freresSoeurs?.length||0)+(e.adultesFamille?.length||0);
  const aDesMembres=totalMembres>1;
  const certifNeed=e.certifNeeded;
  const datesEch=e.datesEcheances;
  const echeances=e.nbFois>1?calcEcheances(e.prixFinal,e.nbFois):null;
  const modeObj=MODES_PAIEMENT.find(m=>m.id===e.modePaiement);

  // Documents avec ✓ ou ○
  const docs=[
    {l:"Certificat médical",ok:e.certifMedical,req:certifNeed},
    {l:"Pièce d'identité",ok:e.photoId,req:true},
    {l:"Justif. domicile",ok:e.justifDom,req:true},
    {l:"RIB",ok:e.rib,req:true},
    ...(aDesMembres?[{l:"Livret de famille",ok:e.livretFamille,req:true}]:[]),
  ];

  const action=async(patch)=>{
    await onUpd(e.id,patch);
  };

  return<div style={{background:C.W,borderRadius:10,marginBottom:8,borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",overflow:"hidden"}}>
    {/* Ligne principale (toujours visible) */}
    <div onClick={onToggle} style={{padding:"12px 14px",cursor:"pointer"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16}}>{e.prenom} {e.nom}</div>
          <div style={{fontSize:12,color:C.G,marginTop:2,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{background:C.N,color:C.J,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
            {aDesMembres&&<span style={{background:"#dbeafe",color:"#1e40af",padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>👨‍👩‍👧 {totalMembres} membres</span>}
            {certifNeed&&<span style={{background:"#fee2e2",color:C.R,padding:"1px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>🩺</span>}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:18,fontWeight:900,color:C.J}}>{e.prixFinal} €</div>
          <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
        </div>
      </div>
    </div>

    {/* Détail dépliable */}
    {open&&<div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.Gc}`}}>
      {/* Paiement détaillé */}
      <div style={{background:C.N,borderRadius:8,padding:"10px 12px",marginTop:12}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
          <span style={{color:"#9ca3af"}}>Paiement</span>
          <span style={{color:C.W,fontWeight:700}}>{modeObj?.l||"—"}{e.nbFois>1?` · ${e.nbFois}× chèques`:""}</span>
        </div>
        {echeances&&datesEch&&<div style={{borderTop:"1px solid #333",paddingTop:6,marginTop:4}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}>
            <span style={{color:"#9ca3af"}}>Chèque {i+1} ({datesEch[i]?fmtD(datesEch[i]):"?"})</span>
            <span style={{color:C.J,fontWeight:700}}>{m} €</span>
          </div>)}
        </div>}
      </div>

      {/* Coordonnées */}
      <div style={{background:C.Gc,borderRadius:8,padding:"10px 12px",marginTop:8}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>Contact</p>
        <div style={{fontSize:13,lineHeight:1.6}}>
          <div>📍 {e.adresse}, {e.codePostal} {e.ville}</div>
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

      {/* Documents */}
      <div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>📁 Documents</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {docs.map((d,i)=><span key={i} style={{background:d.ok?"#dcfce7":d.req?"#fee2e2":C.Gc,color:d.ok?C.V:d.req?C.R:C.G,padding:"4px 8px",borderRadius:6,fontSize:12,fontWeight:700}}>
            {d.ok?"✓":"○"} {d.l}
          </span>)}
        </div>
      </div>

      {/* Membres famille (rapide) */}
      {aDesMembres&&<div style={{background:C.W,borderRadius:8,padding:"10px 12px",marginTop:8,border:`1px solid ${C.Gb}`}}>
        <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase"}}>👨‍👩‍👧 Famille</p>
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

      {/* 4 BOUTONS D'ACTION GROS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:14}}>
        <button onClick={()=>action({statut:"paye",datePaiement:new Date().toISOString(),dateValidation:e.dateValidation||new Date().toISOString()})} style={{padding:"14px 8px",background:e.statut==="paye"?"#1d4ed8":C.B,color:C.W,border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",minHeight:60}}>
          💳 Marquer payé
        </button>
        <button onClick={()=>action({statut:"valide",dateValidation:new Date().toISOString()})} style={{padding:"14px 8px",background:e.statut==="valide"?"#15803d":C.V,color:C.W,border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",minHeight:60}}>
          ✓ Validé sans paiement
        </button>
        <button onClick={()=>action({statut:"incomplet"})} style={{padding:"14px 8px",background:e.statut==="incomplet"?"#b91c1c":"#dc2626",color:C.W,border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",minHeight:60}}>
          ⚠️ Incomplet
        </button>
        <button onClick={()=>action({statut:"attente",datePaiement:null,dateValidation:null})} style={{padding:"14px 8px",background:"#6b7280",color:C.W,border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer",minHeight:60}}>
          ↻ En attente
        </button>
      </div>
      <button onClick={()=>printFiche(e)} style={{...BS,width:"100%",marginTop:8,fontSize:13}}>🖨 Imprimer fiche complète</button>
    </div>}
  </div>;
}

/* ══ BASE LICENCIÉS ═══════════════════════════════════════════════ */
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
        La base est chargée automatiquement depuis <code>licencies.json</code>.<br/>
        <strong>Pour mettre à jour chaque saison</strong> : exportez Footclubs en CSV → bouton <em>"Importer CSV Footclubs"</em>.<br/>
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
    </div>
    {msg&&<div style={{background:msg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:msg.ok?C.V:C.R}}>{msg.txt}</div>}
    {licencies.length>0&&<input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`🔍 Rechercher parmi ${licencies.length} licenciés…`} value={srch} onChange={e=>setSrch(e.target.value)}/>}
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
              {req===true?"🩺 Certif à renouveler":req===false?"✅ Certif valide":"❓"}
            </span>
          </div>
          {l.em&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,wordBreak:"break-all"}}>📧 {l.em}</div>}
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}} onClick={()=>{setEI(realIdx);setER({...l});}}>✏️</button>
          <button style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",color:C.R}} onClick={async()=>await onSave(licencies.filter((_,j)=>j!==realIdx))}>✕</button>
        </div>
      </div>;
    })}
  </div>;
}

/* ══ CERTIFS PROCHAINE SAISON ═════════════════════════════════════ */
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

    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`🔍 Rechercher parmi ${liste.length} licencié(s)…`} value={srch} onChange={e=>setSrch(e.target.value)}/>

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
          {l.rl&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>👨‍👩‍👧 {l.rl}</div>}
        </div>
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>{navigator.clipboard.writeText(email);}}>📋 Copier</button>}
      </div>;
    })}
  </div>;
}

/* ══ ADRESSE BAN ══════════════════════════════════════════════════ */
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

/* ══ PHOTO ════════════════════════════════════════════════════════ */
function PhotoInput({value,onChange}){
  const fRef=useRef(),cRef=useRef();
  const handle=file=>{if(!file)return;if(file.size>10*1024*1024){alert("Max 10 Mo");return;}const r=new FileReader();r.onload=ev=>onChange(ev.target.result);r.onerror=()=>alert("Erreur.");r.readAsDataURL(file);};
  if(value)return<div style={{display:"flex",gap:12,alignItems:"center"}}><img src={value} alt="Photo" style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/><div><p style={{fontSize:13,color:C.V,fontWeight:700,margin:"0 0 6px"}}>✓ Photo importée</p><button type="button" style={{fontSize:13,color:C.R,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>onChange("")}>Supprimer</button></div></div>;
  return<div>
    <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={cRef} type="file" accept="image/*" capture="user" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8}}>
      <button type="button" style={{...BS,flex:1,fontSize:13,padding:"10px 8px"}} onClick={()=>fRef.current.click()}>🖼 Galerie</button>
      <button type="button" style={{...BP,flex:1,fontSize:13,padding:"10px 8px"}} onClick={()=>cRef.current.click()}>📷 Caméra</button>
    </div>
    <p style={{fontSize:11,color:C.G,marginTop:5}}>JPG, PNG — max 10 Mo</p>
  </div>;
}

/* ══ ENTRY CARD + DETAIL ══════════════════════════════════════════ */
function EntryCard({e,sel,onSel}){
  const isSel=sel?.id===e.id;
  return<div onClick={onSel} style={{background:isSel?C.Jp:C.W,borderRadius:10,padding:"12px 14px",marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${STATUTS[e.statut]?.c||C.G}`,boxShadow:"0 1px 4px rgba(0,0,0,.05)",transition:"background .1s"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
      <span style={{fontWeight:700,fontSize:15}}>{e.prenom} {e.nom}</span>
      <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:10,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c,flexShrink:0}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
    </div>
    <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{background:C.N,color:C.J,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
      <span style={{background:e.typeLicence==="renouvellement"?"#ede9fe":"#fed7aa",color:e.typeLicence==="renouvellement"?"#6d28d9":"#c2410c",padding:"2px 7px",borderRadius:4,fontWeight:600,fontSize:11}}>{e.typeLicence==="renouvellement"?"🔄 Renouv.":"✨ Nouveau"}</span>
      {e.certifNeeded&&<span style={{background:"#fee2e2",color:C.R,padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>🩺</span>}
      {e.prixFinal&&<span style={{background:"#f0fdf4",color:"#16a34a",padding:"2px 7px",borderRadius:4,fontWeight:700,fontSize:11}}>💰 {e.prixFinal} €{e.nbFois>1?` (${e.nbFois}×)`:""}</span>}
      <span style={{fontSize:11,color:"#9ca3af",marginLeft:"auto"}}>{fmtD(e.datePreinscription)}</span>
    </div>
  </div>;
}

function DetailPanel({e,note,setNote,onUpd,onDel,onChangeStatut}){
  const [saving,setSaving]=useState(false);
  const saveNote=async()=>{setSaving(true);await onUpd(e.id,{notes:note});setSaving(false);};
  return<div style={{background:C.W,borderRadius:14,padding:"16px 14px",marginBottom:16,border:`2px solid ${C.J}`,boxShadow:"0 4px 16px rgba(245,200,0,.15)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,flexWrap:"wrap",marginBottom:14}}>
      <div><h2 style={{margin:0,fontSize:19,fontWeight:900,color:C.N}}>{e.prenom} {e.nom}</h2><p style={{margin:"4px 0 0",fontSize:11,color:"#9ca3af"}}>{e.id} · {fmtDT(e.datePreinscription)} · {e.saison}</p></div>
      {e.photoBase64&&<img src={e.photoBase64} style={{width:56,height:56,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/>}
    </div>
    {e.certifNeeded&&<div style={{marginBottom:12,background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 12px",fontSize:13,color:C.R}}>🩺 Certif médical requis (base : {e.anneeLastCertifBase||"inconnu"})</div>}
    {/* Paiement recap */}
    <div style={{background:C.N,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
      <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.5}}>Paiement</p>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{color:C.W,fontSize:13}}>{MODES_PAIEMENT.find(m=>m.id===e.modePaiement)?.l||"—"}</div>
          {e.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {e.nbFois} fois</div>}
          {e.nomFamille&&e.remisePct>0&&<div style={{color:"#86efac",fontSize:12}}>Famille {e.nomFamille} (-{e.remisePct}%)</div>}
        </div>
        <div style={{textAlign:"right"}}>
          {e.remisePct>0&&<div style={{color:"#6b7280",fontSize:11,textDecoration:"line-through"}}>{e.tarifBase} €</div>}
          <div style={{color:C.J,fontWeight:900,fontSize:20}}>{e.prixFinal||0} €</div>
        </div>
      </div>
      {e.nbFois>1&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
        {calcEcheances(e.prixFinal,e.nbFois).map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Versement {i+1}</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
      </div>}
    </div>
    <div style={{marginBottom:12}}>
      <p style={{fontSize:11,fontWeight:700,color:C.G,margin:"0 0 6px",textTransform:"uppercase",letterSpacing:.5}}>Statut</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {Object.entries(STATUTS).map(([k,v])=><button key={k} onClick={()=>onChangeStatut(e.id,k)} style={{border:`2px solid ${e.statut===k?v.c:C.Gb}`,background:e.statut===k?v.bg:"#fff",color:e.statut===k?v.c:C.G,padding:"6px 10px",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",minHeight:36}}>{v.i} {v.l}</button>)}
      </div>
    </div>
    <div style={{background:"#f0f9ff",border:"1.5px solid #7dd3fc",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:12,color:"#0369a1",margin:"0 0 4px"}}>📋 Email Footclubs</p>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{flex:1,fontWeight:700,fontSize:13,wordBreak:"break-all"}}>{getEmailContact(e)||"—"}</span>
        <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:36}} onClick={()=>navigator.clipboard.writeText(getEmailContact(e))}>Copier</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
      <MC title="Joueur"><DR l="Naissance" v={fmtD(e.dateNaissance)}/><DR l="Adresse" v={`${e.adresse}, ${e.codePostal} ${e.ville}`}/>{e.ancienClub&&<DR l="Ancien club" v={e.ancienClub}/>}{e.numLicenceFFF&&<DR l="N° FFF" v={e.numLicenceFFF}/>}</MC>
      {(() => {const r=getResp1(e);return!e.isMajeur&&r?<MC title="Responsable"><DR l={r.lien||"Resp."} v={`${r.prenom} ${r.nom}`}/><DR l="Tél" v={r.tel}/><DR l="Email" v={r.email}/></MC>:<MC title="Contact"><DR l="Tél" v={e.telephone}/><DR l="Email" v={e.email}/></MC>;})()}
      <MC title="Médical"><DR l="Allergies/asthme" v={getAllergies(e)||"—"}/><DR l="Soins" v={e.autoSoins?"✅":"❌"}/></MC>
      <MC title="Équipement"><DR l="Short" v={e.tailleShort||"—"}/><DR l="Chaussettes" v={e.tailleChaussettes||"—"}/><DR l="Survêt." v={getSurvet(e)||"—"}/>{e.tailleSweat&&<DR l="Sweat" v={e.tailleSweat}/>}</MC>
    </div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
      {[{l:"Certif.",k:"certifMedical"},{l:"Photo ID",k:"photoId"},{l:"Justif.",k:"justifDom"},{l:"RIB",k:"rib"}].map(({l,k})=><span key={k} style={{background:e[k]?"#dcfce7":"#fee2e2",color:e[k]?C.V:C.R,padding:"4px 8px",borderRadius:6,fontSize:12,fontWeight:700}}>{e[k]?"✓":"○"} {l}</span>)}
    </div>
    {e.commentaire&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:13,color:"#92400e"}}><strong>💬</strong> {e.commentaire}</div>}
    <div style={{marginBottom:12}}>
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 6px"}}>📝 Notes secrétariat</p>
      <textarea style={{...inp(),height:64,resize:"vertical",fontSize:13}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes internes…"/>
      <button style={{...BP,fontSize:12,padding:"8px 14px",marginTop:6,opacity:saving?.7:1}} onClick={saveNote} disabled={saving}>{saving?"…":"Enregistrer"}</button>
    </div>
    <div style={{display:"flex",gap:8}}>
      <button style={{...BS,flex:1,fontSize:13}} onClick={()=>printFiche(e)}>🖨 Imprimer</button>
      <button style={{flex:1,background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:10,padding:"12px",fontWeight:700,fontSize:13,cursor:"pointer",minHeight:48}} onClick={()=>onDel(e.id)}>🗑 Supprimer</button>
    </div>
  </div>;
}

/* ══ IMPRESSION ═══════════════════════════════════════════════════ */
// Récap imprimable côté utilisateur (à apporter en permanence)
function printRecap(f,saison,prixFinal,modeObj,echeances,datesEcheances,certifNeeded,aDesMembresFamille){
  const w=window.open("","_blank");if(!w)return;
  const photoHtml=f.photoBase64?`<img src="${f.photoBase64}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;border:2px solid #F5C800"/>`:"";
  const docs=[
    !f.certifMedical&&`Certificat médical${certifNeeded?" (OBLIGATOIRE)":""}`,
    !f.photoId&&"Pièce d'identité (CNI/passeport)",
    !f.justifDom&&"Justificatif de domicile (- 3 mois)",
    !f.rib&&"RIB",
    aDesMembresFamille&&!f.livretFamille&&"Livret de famille (obligatoire pour tarif famille)",
  ].filter(Boolean);
  const ech=echeances&&f.nbFois>1?echeances.map((m,i)=>`<tr><td style="padding:3px 8px">Chèque ${i+1}</td><td style="padding:3px 8px">${datesEcheances&&datesEcheances[i]?fmtD(datesEcheances[i]):"?"}</td><td style="padding:3px 8px;text-align:right;font-weight:700">${m} €</td></tr>`).join(""):"";
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
  <div class="pay">💰 Total à payer : <strong>${prixFinal} €</strong> · ${modeObj?.l||""}${f.nbFois>1?` · En ${f.nbFois} chèques`:""}</div>
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
  ${docs.length?`<div class="docs"><strong>📋 À apporter en permanence :</strong><ul style="margin:6px 0 0;padding-left:20px">${docs.map(d=>`<li>${d}</li>`).join("")}</ul></div>`:`<div class="docs">✅ Tous les documents sont préparés</div>`}
  <div style="margin-top:24px;border-top:2px solid #F5C800;padding-top:6px;font-size:10px;color:#999">
    Document à apporter en permanence licence · RSG Réveil Saint-Géréon · Saison ${saison}
  </div>
  <div class="no-print" style="margin-top:18px;text-align:center">
    <button onclick="window.print()" style="background:#F5C800;border:none;padding:10px 24px;font-weight:700;border-radius:6px;cursor:pointer">🖨 Imprimer</button>
  </div>
  <script>setTimeout(()=>window.print(),400);</script>
  </body></html>`);
  w.document.close();
}

function printFiche(e){
  const w=window.open("","_blank");if(!w)return;
  const mode=MODES_PAIEMENT.find(m=>m.id===e.modePaiement)?.l||"—";
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

/* ══ MICRO-COMPOSANTS ═════════════════════════════════════════════ */
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
