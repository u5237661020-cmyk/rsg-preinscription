import { useState, useEffect, useRef } from "react";

const SAISONS = (() => {
  const y = new Date().getFullYear();
  return Array.from({length:6},(_,i)=>{const s=y-1+i;return `${s}-${s+1}`;});
})();
const SAISON_DEFAUT = `${new Date().getFullYear()}-${new Date().getFullYear()+1}`;
const ADMIN = "RSG2025";
const PERM = "PERM2025";

// Stockage local (localStorage du navigateur)
async function stGet(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}}
async function stSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.error("Storage full",e);}}
const kIns = s => `rsg_ins_${s}`;
const kLic = s => `rsg_lic_${s}`;
const kTrf = s => `rsg_trf_${s}`;

// Tarifs par défaut (modifiables par le bureau)
const TARIFS_DEFAUT = {
  "Babyfoot": 50,
  "U6-U7": 60,
  "U8-U9": 70,
  "U10-U11": 80,
  "U12-U13": 90,
  "U14-U15": 100,
  "U16-U17-U18": 120,
  "Seniors": 140,
  "Vétérans": 100,
  "Dirigeants": 0
};
const REMISE = {2:10,3:20,4:30};

const MODES = [{id:"cb",l:"💳 CB",frac:false},{id:"cheque",l:"📝 Chèque",frac:true},{id:"especes",l:"💵 Espèces",frac:false}];

// Catégories du club (saison 2026-2027 et suivantes)
const CATS = ["Babyfoot","U6-U7","U8-U9","U10-U11","U12-U13","U14-U15","U16-U17-U18","Seniors","Vétérans","Dirigeants"];
const POSTES = ["Gardien","Défenseur","Milieu","Attaquant","Indifférent"];
const NATIONALITES = ["Française","Algérienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Sénégalaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Suisse","Brésilienne","Autre"];
const LIENS = ["Père","Mère","Tuteur légal","Grand-parent","Beau-père","Belle-mère","Frère/Sœur majeur(e)","Autre"];

// Tailles enfant et adulte
const TA = ["XS","S","M","L","XL","XXL","3XL"];
const TE = ["4 ans / 104","6 ans / 116","8 ans / 128","10 ans / 140","12 ans / 152","14 ans / XS adulte"];

const STATUTS = {
  attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:"⏳"},
  valide:{l:"Validé",c:"#16a34a",bg:"#dcfce7",i:"✅"},
  paye:{l:"Payé",c:"#2563eb",bg:"#dbeafe",i:"💳"},
  incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:"⚠️"},
  refuse:{l:"Refusé",c:"#6b7280",bg:"#f3f4f6",i:"❌"}
};

// Form initial : un joueur principal + un tableau additional pour les frères/sœurs à inscrire en même temps
const F0 = {
  typeLicence:"",numLicenceFFF:"",
  nom:"",prenom:"",dateNaissance:"",sexe:"",nationalite:"Française",
  adresse:"",codePostal:"",ville:"",email:"",telephone:"",
  categorie:"",poste:"",
  responsables:[],
  allergies:"",
  autoSoins:true,autoPhoto:true,autoTransport:true,
  certifMedical:false,photoId:false,justifDom:false,rib:false,
  tShort:"",tChauss:"",tSurv:"",tSweat:"",photoBase64:"",livretFamille:"",
  modePaiement:"",nbFois:1,datesPrelevement:[],nomFamille:"",
  freres:[], adultes:[], // membres de la famille à inscrire en même temps
  commentaire:""
};

const C = {J:"#F5C800",Jd:"#C9A800",Jp:"#FFFBE6",N:"#0F0F0F",Ns:"#2A2A2A",G:"#6B7280",Gc:"#F3F4F6",Gb:"#E5E7EB",W:"#FFFFFF",V:"#16a34a",R:"#dc2626",B:"#2563eb"};

const genId = () => "RSG-"+Date.now().toString(36).toUpperCase().slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();
const fmtD = iso => iso ? new Date(iso).toLocaleDateString("fr-FR") : "—";
const fmtDT = iso => iso ? new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "—";
const calcAge = dob => { if(!dob) return null; const d=new Date(dob),n=new Date(); let a=n.getFullYear()-d.getFullYear(); if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate())) a--; return a; };

// Catégorie auto-détectée selon la saison
// Pour saison 2026-2027 : on calcule l'âge atteint au 31/12 de l'année de début saison
const suggestCatForSaison = (dob, saison) => {
  if (!dob) return "";
  const yrNaissance = new Date(dob).getFullYear();
  const yrSaison = parseInt(saison.split("-")[0]); // ex: 2026
  // L'âge "U" = âge atteint au 31/12 de l'année calendaire correspondant à la saison
  // Pour saison 2026-2027 : U6 = né en 2021 (5 ans révolus, 6 ans dans l'année)
  // formule FFF : catégorie U(N) = né en (yrSaison - N + 1)
  // U6 = 2026 - 6 + 1 = 2021
  // U7 = 2026 - 7 + 1 = 2020
  const ageU = yrSaison - yrNaissance + 1;
  if (ageU <= 5) return "Babyfoot";
  if (ageU <= 7) return "U6-U7";
  if (ageU <= 9) return "U8-U9";
  if (ageU <= 11) return "U10-U11";
  if (ageU <= 13) return "U12-U13";
  if (ageU <= 15) return "U14-U15";
  if (ageU <= 18) return "U16-U17-U18";
  if (yrNaissance >= 1985) return "Seniors";
  return "Vétérans";
};

const certifReq = a => { if(!a) return null; const s=new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1; return s >= parseInt(a)+3; };
const lookupLic = (lics,nom,prenom,num) => { if(!lics?.length) return null; const n=nom.toLowerCase().trim(),p=prenom.toLowerCase().trim(); if(num){const x=lics.find(l=>(l.numLicence||l.l)?.toString()===num.toString()); if(x) return x;} return lics.find(l=>(l.nom||l.n)?.toLowerCase().trim()===n && (l.prenom||l.p)?.toLowerCase().trim()===p) || null; };
const calcEch = (total,n) => { if(n<=1) return [total]; const b=Math.floor(total/n); return [total-b*(n-1), ...Array(n-1).fill(b)]; };

// Calcul prix avec remise selon nb total d'enfants dans la famille
const calcPrixFamille = (cats, tarifs) => {
  // cats = array des catégories de tous les enfants à inscrire
  // 1er = plein tarif, 2ème = -10%, 3ème = -20%, 4ème+ = -30%
  return cats.map((cat, idx) => {
    const base = (tarifs||TARIFS_DEFAUT)[cat] || 0;
    const rang = idx + 1;
    const pct = rang>=4 ? REMISE[4] : (REMISE[rang] || 0);
    const final = Math.round(base*(1-pct/100));
    return { cat, base, pct, final };
  });
};

// Quelles tailles proposer selon catégorie
const taillesPour = (categorie) => {
  // Enfants : uniquement tailles enfant
  if (["Babyfoot","U6-U7","U8-U9","U10-U11"].includes(categorie)) return TE;
  // Ados : tailles enfant grandes (10-14 ans) + tailles adulte (XS à L)
  if (["U12-U13","U14-U15","U16-U17-U18"].includes(categorie)) return [...TE.slice(3), ...TA.slice(0,4)];
  // Adultes : uniquement tailles adulte
  return TA;
};

const survetementPropose = (categorie) => {
  // Survêtement uniquement à partir de U12-U13
  return ["U12-U13","U14-U15","U16-U17-U18","Seniors","Vétérans","Dirigeants"].includes(categorie);
};

const sweatPropose = (categorie) => {
  // Sweat RSG uniquement pour U10-U11
  return categorie === "U10-U11";
};


// Compte total par catégorie (joueur + freres + adultes)
const countByCat = (data) => {
  const counts = {};
  CATS.forEach(cat => counts[cat] = {total:0, attente:0, valide:0, paye:0, incomplet:0, refuse:0});
  data.forEach(e => {
    const all = [{cat:e.categorie,statut:e.statut}];
    (e.freres||[]).forEach(fr => { if(fr.categorie) all.push({cat:fr.categorie,statut:e.statut}); });
    (e.adultes||[]).forEach(a => { if(a.categorie) all.push({cat:a.categorie,statut:e.statut}); });
    all.forEach(({cat,statut}) => {
      if (counts[cat]) {
        counts[cat].total++;
        if (counts[cat][statut]!==undefined) counts[cat][statut]++;
      }
    });
  });
  return counts;
};

const loadXLSX = () => new Promise((res,rej) => { if(window.XLSX){res(window.XLSX);return;} const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload=()=>res(window.XLSX); s.onerror=rej; document.head.appendChild(s); });
const xport = async (sheets,fname) => { const X=await loadXLSX(); const wb=X.utils.book_new(); sheets.forEach(({name,rows})=>{ const ws=X.utils.aoa_to_sheet(rows); X.utils.book_append_sheet(wb,ws,name.slice(0,31)); }); X.writeFile(wb,fname); };

const inp = err => ({width:"100%",boxSizing:"border-box",padding:"10px 12px",fontSize:16,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:8,outline:"none",background:C.W,color:C.N,minHeight:44});
const lbl = {display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const BP = {background:C.J,color:C.N,border:`2px solid ${C.Jd}`,borderRadius:10,padding:"12px 18px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48};
const BS = {background:C.Gc,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:10,padding:"12px 16px",fontWeight:700,fontSize:15,cursor:"pointer",minHeight:48};
const G2 = {display:"grid",gridTemplateColumns:"1fr 1fr",gap:10};

export default function App() {
  const [saison, setSaison] = useState(SAISON_DEFAUT);
  const [view, setView] = useState("home");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [licencies, setLicencies] = useState([]);
  const [tarifs, setTarifs] = useState(TARIFS_DEFAUT);

  useEffect(() => {
    stGet(kLic(saison)).then(d => setLicencies(Array.isArray(d) ? d : []));
    stGet(kTrf(saison)).then(d => { if(d) setTarifs(d); else setTarifs(TARIFS_DEFAUT); });
  }, [saison]);

  const tryLogin = () => {
    const v = pw.trim();
    if (v === ADMIN) { setView("admin"); setPw(""); setPwErr(false); }
    else if (v === PERM) { setView("permanence"); setPw(""); setPwErr(false); }
    else setPwErr(true);
  };

  return (
    <div style={{fontFamily:"system-ui,sans-serif",minHeight:"100vh",background:C.Gc}}>
      <header style={{background:C.N,borderBottom:`4px solid ${C.J}`,padding:"0 12px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:32,height:32,background:C.J,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900}}>⚽</div>
          <div style={{lineHeight:1.1}}>
            <div style={{color:C.J,fontWeight:900,fontSize:12}}>RSG ST-GÉRÉON</div>
            <div style={{color:"#9ca3af",fontSize:10}}>Saison {saison}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          <select value={saison} onChange={e=>{setSaison(e.target.value);setView("home");}} style={{background:C.Ns,color:"#ddd",border:"1px solid #444",borderRadius:7,padding:"4px 6px",fontSize:11,fontWeight:600,minHeight:32,outline:"none"}}>
            {SAISONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {view !== "home" && <button onClick={()=>setView("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"4px 9px",fontWeight:700,fontSize:11,cursor:"pointer",minHeight:32}}>← Retour</button>}
          {view === "home" && <button onClick={()=>setView("login")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"4px 9px",fontWeight:800,fontSize:11,cursor:"pointer",minHeight:32}}>🔐 Bureau</button>}
        </div>
      </header>

      {view === "home" && <Home onForm={()=>setView("form")} saison={saison} tarifs={tarifs}/>}
      {view === "form" && <Formulaire saison={saison} licencies={licencies} tarifs={tarifs} onDone={()=>setView("home")}/>}
      {view === "login" && (
        <div style={{maxWidth:360,margin:"40px auto",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:14,padding:24,border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:6}}>🔐</div>
              <h2 style={{margin:0,fontSize:18}}>Accès Club</h2>
              <p style={{color:C.G,fontSize:12,marginTop:4}}>Bureau ou Permanence licences</p>
            </div>
            <input type="password" style={{...inp(pwErr),fontSize:18,letterSpacing:3,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr && <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:12,color:C.R,marginBottom:8}}>❌ Code incorrect</div>}
            <button style={{...BP,width:"100%"}} onClick={tryLogin}>Entrer →</button>
            <p style={{fontSize:11,color:C.G,marginTop:10,textAlign:"center"}}>Bureau : RSG2025 · Permanence : PERM2025</p>
          </div>
        </div>
      )}
      {view === "admin" && <Dashboard saison={saison} licencies={licencies} setLicencies={setLicencies} tarifs={tarifs} setTarifs={setTarifs}/>}
      {view === "permanence" && <Permanence saison={saison}/>}
    </div>
  );
}

function Home({onForm,saison,tarifs}) {
  return (
    <div style={{maxWidth:540,margin:"0 auto",padding:"24px 14px 60px"}}>
      <div style={{textAlign:"center",marginBottom:18}}>
        <div style={{fontSize:42,marginBottom:6}}>⚽</div>
        <h1 style={{fontSize:22,fontWeight:900,margin:"0 0 6px"}}>Préinscription RSG</h1>
        <div style={{display:"inline-block",background:C.J,color:C.N,padding:"3px 12px",borderRadius:20,fontWeight:800,fontSize:13,marginBottom:12}}>Saison {saison}</div>
        <p style={{color:C.G,fontSize:14,margin:"0 0 18px"}}>Préinscrivez-vous en 5 minutes.<br/>Le paiement se fera en permanence licence.</p>
        <button style={{...BP,fontSize:16,padding:"14px 28px",borderRadius:12,width:"100%"}} onClick={onForm}>📝 Commencer</button>
      </div>

      <div style={{background:C.W,borderRadius:12,border:`1px solid ${C.Gb}`,overflow:"hidden",marginBottom:14}}>
        <div style={{background:C.N,padding:"10px 12px"}}>
          <span style={{color:C.J,fontWeight:800,fontSize:13}}>💰 Tarifs {saison}</span>
        </div>
        <div style={{padding:"10px 12px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(tarifs).map(([cat,prix]) => (
              <div key={cat} style={{display:"flex",justifyContent:"space-between",padding:"6px 10px",background:C.Gc,borderRadius:6}}>
                <span style={{fontSize:12,fontWeight:600}}>{cat}</span>
                <span style={{fontSize:14,fontWeight:900,color:C.J}}>{prix} €</span>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px 10px",background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:8,fontSize:12,color:"#1e40af"}}>
            <strong>👨‍👩‍👧 Tarif famille</strong> : -10% / -20% / -30% à partir du 2ème enfant
          </div>
        </div>
      </div>
    </div>
  );
}

function Formulaire({saison,licencies,tarifs,onDone}) {
  const [step,setStep] = useState(1);
  const [f,setF] = useState(F0);
  const [errs,setErrs] = useState({});
  const [done,setDone] = useState(null);
  const [saving,setSaving] = useState(false);
  const set = (k,v) => setF(p => ({...p,[k]:v}));

  const age = calcAge(f.dateNaissance);
  // Catégorie "joueur" => isMaj basé sur âge
  const isMaj = age !== null && age >= 18;
  const isDirigeant = f.categorie === "Dirigeants";
  const isMineur = !isMaj && !isDirigeant;

  // Si le joueur est mineur, on doit avoir au moins un responsable
  // Init responsables avec un par défaut si mineur
  useEffect(() => {
    if (isMineur && f.responsables.length === 0) {
      set("responsables", [{nom:"",prenom:"",lien:"Père",tel:"",email:""}]);
    } else if (!isMineur && f.responsables.length > 0) {
      set("responsables", []);
    }
  }, [isMineur]);

  // Auto-suggest catégorie depuis date de naissance + saison
  useEffect(() => {
    if (f.dateNaissance) {
      const c = suggestCatForSaison(f.dateNaissance, saison);
      if (c && c !== f.categorie) set("categorie", c);
    }
  }, [f.dateNaissance, saison]);

  // Lookup licencié pour info certif
  const lic = (f.typeLicence==="renouvellement" && (f.numLicenceFFF || (f.nom.length>1 && f.prenom.length>1))) ? lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF) : null;
  const annee = (lic?.anneeLastCertif || lic?.a) || null;
  const cReq = f.typeLicence==="nouvelle" ? true : (annee ? certifReq(annee) : null);
  const cMsg = f.typeLicence==="nouvelle" ? {ok:false,t:"Nouvelle licence → certificat médical obligatoire."} : (!annee ? null : (cReq ? {ok:false,t:`Certif ${annee} expiré. RDV médecin obligatoire.`} : {ok:true,t:`Certif ${annee} valable jusqu'en ${parseInt(annee)+3}`}));

  // Toutes les catégories de la famille (joueur + autres membres)
  const categoriesFamille = [f.categorie, ...f.freres.map(fr => fr.categorie), ...f.adultes.map(a => a.categorie)].filter(Boolean);
  const tarifsFamille = calcPrixFamille(categoriesFamille, tarifs);
  const totalFamille = tarifsFamille.reduce((s,t) => s+t.final, 0);
  const ech = f.modePaiement && f.nbFois>1 ? calcEch(totalFamille, f.nbFois) : null;
  const modeOk = MODES.find(m=>m.id===f.modePaiement);

  // Étapes : Type, Joueur, [Resp si mineur], Médical, Équipement, Famille, Paiement, Récap
  const STEPS = isMineur
    ? ["Type","Joueur","Resp.","Autorisations","Équip.","Famille","Paiement","Récap"]
    : ["Type","Joueur","Autorisations","Équip.","Famille","Paiement","Récap"];
  const total = STEPS.length;
  const sResp = 3;
  const sMed = isMineur ? 4 : 3;
  const sEq = isMineur ? 5 : 4;
  const sFam = isMineur ? 6 : 5;
  const sPay = isMineur ? 7 : 6;
  const sRec = total;

  const validate = () => {
    const e = {};
    if (step===1 && !f.typeLicence) e.typeLicence = "Choisissez";
    if (step===2) {
      if (!f.nom) e.nom = "Requis";
      if (!f.prenom) e.prenom = "Requis";
      if (!f.dateNaissance && !isDirigeant) e.dateNaissance = "Requis";
      if (!f.sexe) e.sexe = "Requis";
      if (!f.adresse) e.adresse = "Requis";
      if (!f.codePostal) e.codePostal = "Requis";
      if (!f.ville) e.ville = "Requis";
      if (!f.categorie) e.categorie = "Requis";
      if (!f.photoBase64) e.photoBase64 = "Photo d\u0027identit\u00e9 requise";
      if ((isMaj || isDirigeant)) {
        if (!f.telephone) e.telephone = "Requis";
        if (!f.email) e.email = "Requis";
      }
    }
    if (isMineur && step===sResp) {
      f.responsables.forEach((r,i) => {
        if (!r.nom) e[`r${i}_nom`] = "Requis";
        if (!r.prenom) e[`r${i}_prenom`] = "Requis";
        if (!r.tel) e[`r${i}_tel`] = "Requis";
        if (!r.email) e[`r${i}_email`] = "Requis";
      });
    }
    if (step===sPay && !f.modePaiement) e.modePaiement = "Choisissez un mode";
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setSaving(true);
    const id = genId();
    const entry = {
      id, ...f, isMaj, age,
      certifNeeded: cReq===true,
      saison,
      tarifsDetail: tarifsFamille,
      prixTotal: totalFamille,
      statut: "attente", notes: "",
      datePreinscription: new Date().toISOString()
    };
    const data = await stGet(kIns(saison)) || [];
    data.unshift(entry);
    await stSet(kIns(saison), data);
    setSaving(false);
    setDone({id, entry});
  };

  if (done) return <Confirmation done={done} f={f} totalFamille={totalFamille} tarifsFamille={tarifsFamille} ech={ech} modeOk={modeOk} cMsg={cMsg} saison={saison} onNew={()=>{setDone(null);setStep(1);setF(F0);onDone();}}/>;

  const next = () => { if (validate()) setStep(p => Math.min(p+1, total)); };
  const prev = () => { setErrs({}); setStep(p => Math.max(p-1, 1)); };

  return (
    <div style={{maxWidth:580,margin:"0 auto",padding:"12px 12px 70px"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:12,gap:2,overflowX:"auto"}}>
        {STEPS.map((sl,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",flex:"0 0 auto",minWidth:36}}>
            <div style={{width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,background:step>i+1?C.V:step===i+1?C.J:"#e5e7eb",color:step>i?C.N:"#9ca3af",flexShrink:0}}>{step>i+1?"✓":i+1}</div>
            {i<STEPS.length-1 && <div style={{height:2,width:18,background:step>i+1?C.V:"#e5e7eb",margin:"0 2px"}}/>}
          </div>
        ))}
      </div>
      <p style={{fontSize:11,color:C.G,marginTop:0,marginBottom:8,textAlign:"center"}}>Étape {step}/{total} · {STEPS[step-1]}</p>

      <div style={{background:C.W,borderRadius:14,padding:"18px 14px",border:`1px solid ${C.Gb}`}}>

        {step===1 && <Step1 f={f} set={set} errs={errs} cMsg={cMsg} licencies={licencies}/>}
        {step===2 && <Step2 f={f} set={set} errs={errs} age={age} isMaj={isMaj} isDirigeant={isDirigeant} tarifs={tarifs} saison={saison}/>}
        {isMineur && step===sResp && <StepResp f={f} setF={setF} errs={errs}/>}
        {step===sMed && <StepAutorisations f={f} set={set}/>}
        {step===sEq && <StepEquip f={f} set={set} age={age}/>}
        {step===sFam && <StepFamille f={f} setF={setF} tarifs={tarifs} saison={saison} tarifsFamille={tarifsFamille} totalFamille={totalFamille}/>}
        {step===sPay && <StepPaiement f={f} set={set} errs={errs} totalFamille={totalFamille} ech={ech} modeOk={modeOk}/>}
        {step===sRec && <StepRecap f={f} cMsg={cMsg} totalFamille={totalFamille} tarifsFamille={tarifsFamille} ech={ech} modeOk={modeOk} isMineur={isMineur}/>}

        <div style={{display:"flex",gap:8,marginTop:16,paddingTop:12,borderTop:`1px solid ${C.Gc}`}}>
          {step>1 && <button style={BS} onClick={prev}>← Préc.</button>}
          <div style={{flex:1}}/>
          {step<total && <button style={BP} onClick={next}>Suivant →</button>}
          {step===total && <button style={{...BP,opacity:saving?0.6:1}} onClick={submit} disabled={saving}>{saving?"…":"✓ Envoyer"}</button>}
        </div>
      </div>
    </div>
  );
}

function Step1({f,set,errs,cMsg,licencies}) {
  return (
    <div>
      <h2 style={{margin:"0 0 12px",fontSize:16}}>1. Type de licence</h2>
      {errs.typeLicence && <Err msg={errs.typeLicence}/>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <Card sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon="🔄" t="Renouvellement"/>
        <Card sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon="✨" t="Nouvelle licence"/>
      </div>
      {f.typeLicence==="renouvellement" && (
        <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:10,padding:12}}>
          <Field label="N° licence FFF (si connu)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)}/></Field>
          {cMsg ? <Msg ok={cMsg.ok}>{cMsg.t}</Msg> : <p style={{fontSize:12,color:"#0369a1",margin:0}}>ℹ️ {licencies.length>0 ? "Saisissez votre nom à l'étape suivante pour vérifier votre certif." : "Le secrétariat confirmera si un certif est requis."}</p>}
        </div>
      )}
      {f.typeLicence==="nouvelle" && <Msg ok={false}>🩺 Nouvelle licence → certificat médical obligatoire (à apporter en permanence).</Msg>}
    </div>
  );
}

function Step2({f,set,errs,age,isMaj,isDirigeant,tarifs,saison}) {
  return (
    <div>
      <h2 style={{margin:"0 0 12px",fontSize:16}}>2. Informations joueur</h2>
      {age!==null && !isDirigeant && (
        <div style={{marginBottom:10,padding:"6px 10px",borderRadius:6,background:isMaj?"#dbeafe":"#dcfce7",fontSize:12,fontWeight:600,color:isMaj?C.B:C.V}}>
          {isMaj?"🧑 Joueur majeur":`👶 Joueur mineur (${age} ans) — représentant légal requis`}
        </div>
      )}
      <div style={G2}>
        <Field label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())} autoComplete="family-name"/></Field>
        <Field label="Prénom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)} autoComplete="given-name"/></Field>
        <Field label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>set("dateNaissance",e.target.value)}/></Field>
        <Field label="Sexe *" err={errs.sexe}><select style={inp(errs.sexe)} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></Field>
      </div>
      <Field label="Nationalité">
        <select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}>
          {NATIONALITES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      <Field label="Adresse *" err={errs.adresse}><input style={inp(errs.adresse)} value={f.adresse} onChange={e=>set("adresse",e.target.value)} placeholder="Numéro et rue"/></Field>
      <div style={G2}>
        <Field label="CP *" err={errs.codePostal}><input style={inp(errs.codePostal)} value={f.codePostal} onChange={e=>set("codePostal",e.target.value)} inputMode="numeric" maxLength={5}/></Field>
        <Field label="Ville *" err={errs.ville}><input style={inp(errs.ville)} value={f.ville} onChange={e=>set("ville",e.target.value)}/></Field>
      </div>
      {(isMaj || isDirigeant) && (
        <div style={G2}>
          <Field label="Téléphone *" err={errs.telephone}><input type="tel" style={inp(errs.telephone)} value={f.telephone} onChange={e=>set("telephone",e.target.value)}/></Field>
          <Field label="Email *" err={errs.email}><input type="email" style={inp(errs.email)} value={f.email} onChange={e=>set("email",e.target.value)}/></Field>
        </div>
      )}
      <div style={G2}>
        <Field label="Catégorie *" err={errs.categorie}>
          <select style={inp(errs.categorie)} value={f.categorie} onChange={e=>set("categorie",e.target.value)}>
            <option value="">—</option>{CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          {f.dateNaissance && <span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>✓ Détectée auto. selon âge</span>}
        </Field>
        {!isDirigeant && <Field label="Poste"><select style={inp()} value={f.poste} onChange={e=>set("poste",e.target.value)}><option value="">—</option>{POSTES.map(p => <option key={p}>{p}</option>)}</select></Field>}
      </div>
      {f.categorie && (
        <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"8px 10px",fontSize:13,marginBottom:10}}>💰 Tarif {f.categorie} : <strong>{tarifs[f.categorie]||0} €</strong></div>
      )}
      <div style={{marginTop:8,background:C.Jp,border:`1.5px solid ${errs.photoBase64?C.R:C.Jd}`,borderRadius:10,padding:"12px 14px"}}>
        <p style={{fontWeight:700,fontSize:13,color:C.N,margin:"0 0 4px"}}>📸 Photo d'identité *</p>
        <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Obligatoire pour la licence Footclubs. Fond neutre, visage dégagé.</p>
        <PhotoInput value={f.photoBase64} onChange={v=>set("photoBase64",v)} err={errs.photoBase64}/>
      </div>
    </div>
  );
}

function StepResp({f,setF,errs}) {
  const updR = (i,k,v) => setF(p => ({...p, responsables: p.responsables.map((r,j) => i===j?{...r,[k]:v}:r)}));
  const addR = () => setF(p => ({...p, responsables:[...p.responsables, {nom:"",prenom:"",lien:"Mère",tel:"",email:""}]}));
  const delR = (i) => setF(p => ({...p, responsables: p.responsables.filter((_,j) => j!==i)}));
  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>3. Représentant(s) légal/légaux</h2>
      <p style={{fontSize:12,color:C.G,marginTop:0,marginBottom:12}}>Au moins un représentant légal obligatoire. Ajoutez les autres si nécessaire.</p>
      {f.responsables.map((r,i) => (
        <div key={i} style={{background:i===0?C.Jp:C.Gc,border:`1px solid ${i===0?C.Jd:C.Gb}`,borderRadius:10,padding:12,marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{fontWeight:700,fontSize:13,margin:0}}>{i===0?"Représentant principal":`Représentant ${i+1}`}</p>
            {i>0 && <button onClick={()=>delR(i)} style={{background:"transparent",border:"none",color:C.R,fontSize:18,cursor:"pointer",padding:0,minHeight:24}}>✕</button>}
          </div>
          <Field label="Lien avec le joueur *">
            <select style={inp()} value={r.lien} onChange={e=>updR(i,"lien",e.target.value)}>
              {LIENS.map(l => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <div style={G2}>
            <Field label="Nom *" err={errs[`r${i}_nom`]}><input style={inp(errs[`r${i}_nom`])} value={r.nom} onChange={e=>updR(i,"nom",e.target.value.toUpperCase())}/></Field>
            <Field label="Prénom *" err={errs[`r${i}_prenom`]}><input style={inp(errs[`r${i}_prenom`])} value={r.prenom} onChange={e=>updR(i,"prenom",e.target.value)}/></Field>
            <Field label="Téléphone *" err={errs[`r${i}_tel`]}><input type="tel" style={inp(errs[`r${i}_tel`])} value={r.tel} onChange={e=>updR(i,"tel",e.target.value)}/></Field>
            <Field label="Email *" err={errs[`r${i}_email`]}><input type="email" style={inp(errs[`r${i}_email`])} value={r.email} onChange={e=>updR(i,"email",e.target.value)}/></Field>
          </div>
        </div>
      ))}
      <button onClick={addR} style={{...BS,width:"100%"}}>＋ Ajouter un autre représentant</button>
    </div>
  );
}

function StepAutorisations({f,set}) {
  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>4. Autorisations</h2>
      <p style={{fontSize:12,color:C.G,marginTop:0,marginBottom:14}}>Cochez ou décochez selon votre choix. Toutes les autorisations sont activées par défaut.</p>

      <div style={{background:f.autoSoins?"#dcfce7":"#fee2e2",border:`1.5px solid ${f.autoSoins?"#86efac":"#fca5a5"}`,borderRadius:10,padding:12,marginBottom:10}}>
        <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
          <input type="checkbox" checked={f.autoSoins} onChange={e=>set("autoSoins",e.target.checked)} style={{marginTop:3,accentColor:C.J,width:20,height:20,flexShrink:0}}/>
          <div>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 3px"}}>🚑 Autorisation des soins d'urgence</p>
            <p style={{fontSize:12,color:"#444",margin:0,lineHeight:1.4}}>J'autorise les responsables du club à appeler les services d'urgence et à faire pratiquer les soins médicaux d'urgence nécessaires en cas d'accident. Les parents seront prévenus immédiatement.</p>
          </div>
        </label>
      </div>

      <div style={{background:f.autoPhoto?"#dcfce7":"#fee2e2",border:`1.5px solid ${f.autoPhoto?"#86efac":"#fca5a5"}`,borderRadius:10,padding:12,marginBottom:10}}>
        <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
          <input type="checkbox" checked={f.autoPhoto} onChange={e=>set("autoPhoto",e.target.checked)} style={{marginTop:3,accentColor:C.J,width:20,height:20,flexShrink:0}}/>
          <div>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 3px"}}>📸 Droit à l'image — réseaux sociaux</p>
            <p style={{fontSize:12,color:"#444",margin:0,lineHeight:1.4}}>J'autorise le club à utiliser des photos et vidéos prises lors des activités sportives sur les supports de communication du club (site web, Facebook, Instagram, journaux locaux, affiches).</p>
          </div>
        </label>
      </div>

      <div style={{background:f.autoTransport?"#dcfce7":"#fee2e2",border:`1.5px solid ${f.autoTransport?"#86efac":"#fca5a5"}`,borderRadius:10,padding:12,marginBottom:10}}>
        <label style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
          <input type="checkbox" checked={f.autoTransport} onChange={e=>set("autoTransport",e.target.checked)} style={{marginTop:3,accentColor:C.J,width:20,height:20,flexShrink:0}}/>
          <div>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 3px"}}>🚗 Transport en véhicule privé</p>
            <p style={{fontSize:12,color:"#444",margin:0,lineHeight:1.4}}>J'autorise le transport de mon enfant dans le véhicule personnel d'un autre parent, dirigeant ou éducateur du club lors des déplacements pour les matchs et les tournois.</p>
          </div>
        </label>
      </div>

      <Field label="Allergies, asthme, restrictions médicales (à signaler)">
        <input style={inp()} value={f.allergies} onChange={e=>set("allergies",e.target.value)} placeholder="Allergies, asthme, autres restrictions… ou Aucune"/>
      </Field>
    </div>
  );
}

function StepEquip({f,set,age}) {
  const tailles = taillesPour(f.categorie);
  const survetOK = survetementPropose(f.categorie);
  const sweatOK = sweatPropose(f.categorie);
  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>5. Équipement</h2>
      <p style={{fontSize:12,color:C.G,marginTop:0,marginBottom:12}}>Tailles proposées selon la catégorie {f.categorie}</p>
      <div style={G2}>
        <Field label="Taille short">
          <select style={inp()} value={f.tShort} onChange={e=>set("tShort",e.target.value)}>
            <option value="">—</option>{tailles.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Taille chaussettes">
          <select style={inp()} value={f.tChauss} onChange={e=>set("tChauss",e.target.value)}>
            <option value="">—</option>{tailles.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      {sweatOK && (
        <Field label="Taille sweat RSG (offert)">
          <select style={inp()} value={f.tSweat} onChange={e=>set("tSweat",e.target.value)}>
            <option value="">—</option>{tailles.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      )}
      {survetOK && (
        <Field label="Taille survêtement">
          <select style={inp()} value={f.tSurv} onChange={e=>set("tSurv",e.target.value)}>
            <option value="">—</option>{TA.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      )}
      {!survetOK && !sweatOK && f.categorie && (
        <p style={{fontSize:12,color:C.G,padding:"8px 10px",background:C.Gc,borderRadius:6}}>ℹ️ Pas de survêtement ni de sweat pour cette catégorie.</p>
      )}
      {sweatOK && (
        <p style={{fontSize:12,color:C.V,padding:"8px 10px",background:"#dcfce7",border:"1px solid #86efac",borderRadius:6,marginTop:6}}>🎁 Le sweat RSG est offert pour les U10-U11</p>
      )}
    </div>
  );
}

function StepFamille({f,setF,tarifs,saison,tarifsFamille,totalFamille}) {
  const addFrere = () => setF(p => ({...p, freres:[...p.freres, {nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"",poste:"",nationalite:"Française",allergies:"",tShort:"",tChauss:"",tSurv:"",tSweat:""}]}));
  const updFr = (i,k,v) => setF(p => ({...p, freres: p.freres.map((fr,j) => i===j?{...fr,[k]:v}:fr)}));
  const delFr = (i) => setF(p => ({...p, freres: p.freres.filter((_,j) => j!==i)}));

  const addAdulte = () => setF(p => ({...p, adultes:[...p.adultes, {nom:"",prenom:"",dateNaissance:"",sexe:"",categorie:"Seniors",poste:"",nationalite:"Française",adresse:f.adresse,codePostal:f.codePostal,ville:f.ville,telephone:"",email:"",allergies:"",tShort:"",tChauss:"",tSurv:"",autoSoins:true,autoPhoto:true,autoTransport:true,photoBase64:""}]}));
  const updAd = (i,k,v) => setF(p => ({...p, adultes: p.adultes.map((a,j) => i===j?{...a,[k]:v}:a)}));
  const delAd = (i) => setF(p => ({...p, adultes: p.adultes.filter((_,j) => j!==i)}));

  // Auto-suggest catégorie pour chaque frère/sœur
  useEffect(() => {
    f.freres.forEach((fr,i) => {
      if (fr.dateNaissance && !fr.categorie) {
        const c = suggestCatForSaison(fr.dateNaissance, saison);
        if (c) updFr(i, "categorie", c);
      }
    });
  }, [f.freres.map(fr => fr.dateNaissance).join(",")]);

  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>6. Frères / sœurs à inscrire</h2>
      <p style={{fontSize:12,color:C.G,marginTop:0,marginBottom:12}}>Vous inscrivez plusieurs enfants ? Ajoutez-les ici pour bénéficier du tarif famille (-10% à -30%).</p>

      <Field label="Nom de famille (pour le suivi)">
        <input style={inp()} value={f.nomFamille} onChange={e=>setF(p=>({...p,nomFamille:e.target.value.toUpperCase()}))} placeholder="DUPONT"/>
      </Field>

      {/* Liste des frères/sœurs ajoutés */}
      {f.freres.map((fr,i) => {
        const taillesFr = taillesPour(fr.categorie);
        const survetOK = survetementPropose(fr.categorie);
        const sweatOK = sweatPropose(fr.categorie);
        return (
          <div key={i} style={{background:C.Gc,border:`1.5px solid ${C.Gb}`,borderRadius:10,padding:12,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <p style={{fontWeight:700,fontSize:13,margin:0}}>👶 Frère / sœur {i+1}</p>
              <button onClick={()=>delFr(i)} style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,cursor:"pointer",color:C.R,fontWeight:700}}>✕ Retirer</button>
            </div>
            <div style={G2}>
              <Field label="Nom *"><input style={inp()} value={fr.nom} onChange={e=>updFr(i,"nom",e.target.value.toUpperCase())}/></Field>
              <Field label="Prénom *"><input style={inp()} value={fr.prenom} onChange={e=>updFr(i,"prenom",e.target.value)}/></Field>
              <Field label="Naissance *"><input type="date" style={inp()} value={fr.dateNaissance} onChange={e=>updFr(i,"dateNaissance",e.target.value)}/></Field>
              <Field label="Sexe *"><select style={inp()} value={fr.sexe} onChange={e=>updFr(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></Field>
            </div>
            <Field label="Nationalité">
              <select style={inp()} value={fr.nationalite} onChange={e=>updFr(i,"nationalite",e.target.value)}>
                {NATIONALITES.map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <div style={G2}>
              <Field label="Catégorie *">
                <select style={inp()} value={fr.categorie} onChange={e=>updFr(i,"categorie",e.target.value)}>
                  <option value="">—</option>{CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Poste"><select style={inp()} value={fr.poste} onChange={e=>updFr(i,"poste",e.target.value)}><option value="">—</option>{POSTES.map(p => <option key={p}>{p}</option>)}</select></Field>
            </div>
            <Field label="Allergies, asthme, restrictions"><input style={inp()} value={fr.allergies} onChange={e=>updFr(i,"allergies",e.target.value)} placeholder="Aucune"/></Field>
            {fr.categorie && (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <Field label="Short"><select style={inp()} value={fr.tShort} onChange={e=>updFr(i,"tShort",e.target.value)}><option value="">—</option>{taillesFr.map(t=><option key={t}>{t}</option>)}</select></Field>
                <Field label="Chaussettes"><select style={inp()} value={fr.tChauss} onChange={e=>updFr(i,"tChauss",e.target.value)}><option value="">—</option>{taillesFr.map(t=><option key={t}>{t}</option>)}</select></Field>
                {sweatOK && <Field label="Sweat RSG"><select style={inp()} value={fr.tSweat} onChange={e=>updFr(i,"tSweat",e.target.value)}><option value="">—</option>{taillesFr.map(t=><option key={t}>{t}</option>)}</select></Field>}
                {survetOK && <Field label="Survêtement"><select style={inp()} value={fr.tSurv} onChange={e=>updFr(i,"tSurv",e.target.value)}><option value="">—</option>{TA.map(t=><option key={t}>{t}</option>)}</select></Field>}
              </div>
            )}
            {fr.categorie && <p style={{fontSize:12,color:C.G,marginTop:4}}>💰 Tarif {fr.categorie} : <strong>{tarifs[fr.categorie]||0} €</strong></p>}
          </div>
        );
      })}

      <button onClick={addFrere} style={{...BS,width:"100%",marginBottom:18}}>＋ Ajouter un frère / une sœur (mineur)</button>

      <div style={{height:1,background:C.Gb,margin:"4px 0 14px"}}/>

      {/* Adultes de la famille à inscrire */}
      {f.adultes.map((a,i) => {
        const taillesA = taillesPour(a.categorie);
        const survetOK = survetementPropose(a.categorie);
        const isMaj_a = calcAge(a.dateNaissance) >= 18;
        return (
          <div key={i} style={{background:"#eff6ff",border:`1.5px solid #93c5fd`,borderRadius:10,padding:12,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <p style={{fontWeight:700,fontSize:13,margin:0,color:"#1e40af"}}>🧑 Adulte de la famille {i+1}</p>
              <button onClick={()=>delAd(i)} style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 10px",fontSize:12,cursor:"pointer",color:C.R,fontWeight:700}}>✕ Retirer</button>
            </div>
            <div style={G2}>
              <Field label="Nom *"><input style={inp()} value={a.nom} onChange={e=>updAd(i,"nom",e.target.value.toUpperCase())}/></Field>
              <Field label="Prénom *"><input style={inp()} value={a.prenom} onChange={e=>updAd(i,"prenom",e.target.value)}/></Field>
              <Field label="Naissance *"><input type="date" style={inp()} value={a.dateNaissance} onChange={e=>updAd(i,"dateNaissance",e.target.value)}/></Field>
              <Field label="Sexe *"><select style={inp()} value={a.sexe} onChange={e=>updAd(i,"sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></Field>
            </div>
            <Field label="Nationalité">
              <select style={inp()} value={a.nationalite} onChange={e=>updAd(i,"nationalite",e.target.value)}>
                {NATIONALITES.map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <div style={G2}>
              <Field label="Téléphone *"><input type="tel" style={inp()} value={a.telephone} onChange={e=>updAd(i,"telephone",e.target.value)}/></Field>
              <Field label="Email *"><input type="email" style={inp()} value={a.email} onChange={e=>updAd(i,"email",e.target.value)}/></Field>
            </div>
            <div style={G2}>
              <Field label="Catégorie *">
                <select style={inp()} value={a.categorie} onChange={e=>updAd(i,"categorie",e.target.value)}>
                  {["Seniors","Vétérans","Dirigeants"].map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              {a.categorie!=="Dirigeants" && <Field label="Poste"><select style={inp()} value={a.poste} onChange={e=>updAd(i,"poste",e.target.value)}><option value="">—</option>{POSTES.map(p => <option key={p}>{p}</option>)}</select></Field>}
            </div>
            <Field label="Allergies, asthme, restrictions"><input style={inp()} value={a.allergies} onChange={e=>updAd(i,"allergies",e.target.value)} placeholder="Aucune"/></Field>

            {/* Tailles */}
            {a.categorie!=="Dirigeants" && (
              <div style={G2}>
                <Field label="Short"><select style={inp()} value={a.tShort} onChange={e=>updAd(i,"tShort",e.target.value)}><option value="">—</option>{taillesA.map(t=><option key={t}>{t}</option>)}</select></Field>
                <Field label="Chaussettes"><select style={inp()} value={a.tChauss} onChange={e=>updAd(i,"tChauss",e.target.value)}><option value="">—</option>{taillesA.map(t=><option key={t}>{t}</option>)}</select></Field>
                {survetOK && <Field label="Survêtement"><select style={inp()} value={a.tSurv} onChange={e=>updAd(i,"tSurv",e.target.value)}><option value="">—</option>{TA.map(t=><option key={t}>{t}</option>)}</select></Field>}
              </div>
            )}

            {/* Autorisations adulte */}
            <div style={{background:C.W,borderRadius:8,padding:10,marginTop:8}}>
              <p style={{fontWeight:700,fontSize:12,margin:"0 0 6px"}}>Autorisations</p>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,padding:"3px 0",cursor:"pointer"}}>
                <input type="checkbox" checked={a.autoSoins} onChange={e=>updAd(i,"autoSoins",e.target.checked)} style={{accentColor:C.J,width:16,height:16}}/>
                <span>🚑 Soins d'urgence</span>
              </label>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,padding:"3px 0",cursor:"pointer"}}>
                <input type="checkbox" checked={a.autoPhoto} onChange={e=>updAd(i,"autoPhoto",e.target.checked)} style={{accentColor:C.J,width:16,height:16}}/>
                <span>📸 Droit à l'image</span>
              </label>
              <label style={{display:"flex",gap:8,alignItems:"center",fontSize:12,padding:"3px 0",cursor:"pointer"}}>
                <input type="checkbox" checked={a.autoTransport} onChange={e=>updAd(i,"autoTransport",e.target.checked)} style={{accentColor:C.J,width:16,height:16}}/>
                <span>🚗 Transport véhicule privé</span>
              </label>
            </div>

            {/* Photo */}
            <div style={{marginTop:8}}>
              <p style={{fontWeight:700,fontSize:12,margin:"0 0 6px"}}>📸 Photo d'identité *</p>
              <PhotoInput value={a.photoBase64} onChange={v=>updAd(i,"photoBase64",v)}/>
            </div>

            {a.categorie && <p style={{fontSize:12,color:C.G,marginTop:6,margin:"6px 0 0"}}>💰 Tarif {a.categorie} : <strong>{tarifs[a.categorie]||0} €</strong></p>}
          </div>
        );
      })}

      <button onClick={addAdulte} style={{...BS,width:"100%",marginBottom:14,background:"#eff6ff",borderColor:"#93c5fd",color:"#1e40af"}}>＋ Ajouter un adulte de la famille (parent, conjoint…)</button>

      {/* Récap tarifs famille */}
      {tarifsFamille.length>0 && (
        <div style={{background:C.N,borderRadius:10,padding:12}}>
          <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>💰 Total famille</p>
          {tarifsFamille.map((t,i) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",fontSize:12,color:"#ddd"}}>
              <span>{i===0 ? "Joueur principal" : (i <= f.freres.length ? `Enfant ${i+1}` : `Adulte ${i - f.freres.length}`)} ({t.cat})</span>
              <span>
                {t.pct>0 && <span style={{color:"#6b7280",textDecoration:"line-through",marginRight:6}}>{t.base}€</span>}
                <span style={{color:C.J,fontWeight:700}}>{t.final}€</span>
                {t.pct>0 && <span style={{color:"#86efac",marginLeft:4,fontSize:10}}>-{t.pct}%</span>}
              </span>
            </div>
          ))}
          <div style={{borderTop:"1px solid #333",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:C.W,fontWeight:700,fontSize:14}}>Total</span>
            <span style={{color:C.J,fontWeight:900,fontSize:22}}>{totalFamille} €</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StepPaiement({f,set,errs,totalFamille,ech,modeOk}) {
  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>7. Mode de paiement</h2>

      <div style={{background:C.N,borderRadius:10,padding:14,marginBottom:14,textAlign:"center"}}>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 4px"}}>Montant total à régler</p>
        <div style={{color:C.J,fontWeight:900,fontSize:30}}>{totalFamille} €</div>
      </div>

      {errs.modePaiement && <Err msg={errs.modePaiement}/>}
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 8px"}}>Mode de paiement *</p>
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {MODES.map(m => (
          <button key={m.id} onClick={()=>{set("modePaiement",m.id);if(!m.frac){set("nbFois",1);set("datesPrelevement",[]);}}}
            style={{flex:1,padding:"10px 8px",border:`2px solid ${f.modePaiement===m.id?C.J:C.Gb}`,background:f.modePaiement===m.id?C.Jp:"#fafafa",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",minHeight:44}}>
            {m.l}
          </button>
        ))}
      </div>

      {modeOk?.frac && (
        <div style={{background:C.Gc,borderRadius:10,padding:12,marginBottom:12}}>
          <p style={{fontWeight:700,fontSize:13,margin:"0 0 4px"}}>En combien de fois ? (chèques sans frais)</p>
          <p style={{fontSize:11,color:C.G,margin:"0 0 8px"}}>Tous les chèques sont remis lors de la permanence licence et encaissés aux dates choisies.</p>
          <div style={{display:"flex",gap:6}}>
            {[1,2,3,4].map(n => (
              <button key={n} onClick={()=>set("nbFois",n)}
                style={{flex:1,padding:"8px",border:`2px solid ${f.nbFois===n?C.J:C.Gb}`,background:f.nbFois===n?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>
                {n===1?"1× compt.":`${n}×`}
              </button>
            ))}
          </div>
          {f.nbFois>1 && (
            <div style={{marginTop:10}}>
              <Field label="Date du 1er encaissement souhaité">
                <input type="date" style={inp()} value={f.datesPrelevement[0]||""} min={new Date().toISOString().slice(0,10)} onChange={e=>{
                  const d1 = e.target.value;
                  if (!d1) { set("datesPrelevement",[]); return; }
                  // Auto-calculer N-1 dates suivantes (espacées d'un mois)
                  const dates = [d1];
                  const dt = new Date(d1);
                  for (let i=1; i<f.nbFois; i++) {
                    dt.setMonth(dt.getMonth()+1);
                    dates.push(dt.toISOString().slice(0,10));
                  }
                  set("datesPrelevement",dates);
                }}/>
              </Field>
              <p style={{fontSize:11,color:C.G,margin:"-6px 0 8px"}}>Les autres chèques seront encaissés au même jour des mois suivants.</p>
            </div>
          )}
          {ech && (
            <div style={{marginTop:6,padding:10,background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
              {ech.map((m,i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:13,borderBottom:i<ech.length-1?`1px solid ${C.Gc}`:"none"}}>
                  <span style={{color:C.G}}>Chèque {i+1} {f.datesPrelevement[i]?`(encaissé le ${fmtD(f.datesPrelevement[i])})`:i===0?"(remise permanence)":""}</span>
                  <span style={{fontWeight:700,color:C.J}}>{m} €</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {f.modePaiement==="cb" && <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#92400e",marginBottom:10}}>💳 Carte bancaire : paiement en 1 fois en permanence licence.</div>}
      {f.modePaiement==="especes" && <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#92400e",marginBottom:10}}>💵 Espèces : paiement en 1 fois en permanence licence.</div>}

      <Field label="Message pour le secrétariat (optionnel)"><textarea style={{...inp(),height:60,resize:"vertical"}} value={f.commentaire} onChange={e=>set("commentaire",e.target.value)}/></Field>
    </div>
  );
}

function StepRecap({f,cMsg,totalFamille,tarifsFamille,ech,modeOk,isMineur}) {
  const hasFamily = f.freres.length>0 || f.adultes.length>0;
  const docs = [
    {l:"Certificat médical (-3 ans) ou questionnaire santé", k:"certifMedical"},
    {l:"Pièce d'identité (CNI, passeport)", k:"photoId"},
    {l:"Justificatif de domicile (-3 mois)", k:"justifDom"},
    {l:"RIB (en cas de prélèvement)", k:"rib"},
    ...(hasFamily ? [{l:"Livret de famille (recommandé pour le tarif famille)", k:"livretFamille"}] : [])
  ];

  const handlePrint = () => {
    const w = window.open("","_blank");
    if (!w) return;
    const docsHtml = docs.map(d => `<li>☐ ${d.l}</li>`).join("");
    const tarifsHtml = tarifsFamille.map((t,i) => `<tr><td>${i===0?"Joueur principal":`Enfant ${i+1}`} (${t.cat})</td><td style="text-align:right">${t.pct>0?`<s>${t.base}€</s> ${t.final}€ (-${t.pct}%)`:`${t.final}€`}</td></tr>`).join("");
    const echHtml = ech ? `<p>Échéancier : ${ech.map((m,i) => `Chèque ${i+1} : ${m}€${f.datesPrelevement[i]?` (le ${fmtD(f.datesPrelevement[i])})`:""}`).join(" / ")}</p>` : "";
    const respHtml = isMineur ? f.responsables.map(r => `<li>${r.lien} : ${r.prenom} ${r.nom} — ${r.tel} — ${r.email}</li>`).join("") : "";
    const freresHtml = f.freres.length ? "<h3>Frères/sœurs inscrits</h3><ul>"+f.freres.map(fr => `<li>${fr.prenom} ${fr.nom} — ${fr.categorie}</li>`).join("")+"</ul>" : "";
    const adultesHtml = f.adultes.length ? "<h3>Adultes de la famille inscrits</h3><ul>"+f.adultes.map(a => `<li>${a.prenom} ${a.nom} — ${a.categorie} — ${a.telephone}</li>`).join("")+"</ul>" : "";
    w.document.write(`<!DOCTYPE html><html><head><title>Préinscription RSG</title><style>
      body{font-family:Arial,sans-serif;max-width:780px;margin:20px auto;padding:0 20px;font-size:13px;color:#222}
      h1{border-bottom:4px solid #F5C800;padding-bottom:8px;color:#0F0F0F}
      h2{background:#F5C800;padding:4px 10px;font-size:14px;display:inline-block;border-radius:4px;margin:18px 0 8px;color:#0F0F0F}
      h3{font-size:13px;margin:14px 0 4px}
      table{width:100%;border-collapse:collapse;margin:8px 0}
      td{padding:5px 8px;border-bottom:1px solid #eee}
      .total{background:#0F0F0F;color:#F5C800;padding:12px;margin:10px 0;font-size:16px;font-weight:700;display:flex;justify-content:space-between;border-radius:6px}
      ul{margin:4px 0 8px;padding-left:20px}
      .badge{background:#F5C800;color:#0F0F0F;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px}
      @media print{button{display:none}}
    </style></head><body>
      <h1>⚽ RSG St-Géréon — Fiche de préinscription</h1>
      <p><strong>Saison ${f.saison || ""}</strong> — ${f.typeLicence==="renouvellement"?"🔄 Renouvellement":"✨ Nouvelle licence"}</p>
      <h2>Joueur principal</h2>
      <p><strong>${f.prenom} ${f.nom}</strong> · Né(e) le ${fmtD(f.dateNaissance)} · ${f.sexe} · ${f.nationalite}<br>
      <span class="badge">${f.categorie}</span> ${f.poste?`- ${f.poste}`:""}<br>
      ${f.adresse}, ${f.codePostal} ${f.ville}</p>
      ${respHtml?`<h3>Représentants légaux</h3><ul>${respHtml}</ul>`:`<p>Tél : ${f.telephone} · Email : ${f.email}</p>`}
      ${freresHtml}
      ${adultesHtml}
      <h2>Tarif et paiement</h2>
      <table>${tarifsHtml}</table>
      <div class="total"><span>TOTAL À RÉGLER</span><span>${totalFamille} €</span></div>
      <p>Mode : <strong>${modeOk?.l||"—"}</strong>${f.nbFois>1?` en ${f.nbFois}× sans frais`:""}</p>
      ${echHtml}
      <h2>Documents à apporter en permanence</h2>
      <ul>${docsHtml}</ul>
      ${cMsg?`<p style="background:${cMsg.ok?"#dcfce7":"#fee2e2"};padding:8px 12px;border-radius:6px;border:1px solid ${cMsg.ok?"#86efac":"#fca5a5"}">${cMsg.ok?"✅":"🩺"} ${cMsg.t}</p>`:""}
      <h2>Autorisations signées</h2>
      <ul>
        <li>${f.autoSoins?"☑":"☐"} Soins d'urgence</li>
        <li>${f.autoPhoto?"☑":"☐"} Droit à l'image (réseaux sociaux, supports club)</li>
        <li>${f.autoTransport?"☑":"☐"} Transport en véhicule privé</li>
      </ul>
      ${f.allergies?`<p>⚠ Allergies/restrictions : ${f.allergies}</p>`:""}
      <p style="margin-top:30px;border-top:2px solid #F5C800;padding-top:8px;font-size:11px;color:#666">RSG Réveil Saint-Géréon · Saison ${f.saison} · Document à présenter en permanence licence</p>
      <p>Signature représentant légal :<br><br>______________________________</p>
      <script>setTimeout(()=>window.print(),300);</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div>
      <h2 style={{margin:"0 0 8px",fontSize:16}}>8. Récapitulatif</h2>
      <p style={{fontSize:12,color:C.G,marginTop:0,marginBottom:12}}>Vérifiez les informations avant d'envoyer.</p>

      {cMsg && <Msg ok={cMsg.ok}>{cMsg.t}</Msg>}

      <Box t="Joueur principal">
        <L l="Identité" v={`${f.prenom} ${f.nom}`}/>
        <L l="Naissance" v={fmtD(f.dateNaissance)}/>
        <L l="Catégorie" v={f.categorie}/>
        <L l="Nationalité" v={f.nationalite}/>
      </Box>

      {isMineur && f.responsables.length>0 && (
        <Box t="Représentant(s) légal(aux)">
          {f.responsables.map((r,i) => (
            <L key={i} l={r.lien} v={`${r.prenom} ${r.nom} · ${r.tel}`}/>
          ))}
        </Box>
      )}

      {f.freres.length>0 && (
        <Box t={`Frères/sœurs (${f.freres.length})`}>
          {f.freres.map((fr,i) => <L key={i} l={`${i+1}.`} v={`${fr.prenom} ${fr.nom} (${fr.categorie})`}/>)}
        </Box>
      )}
      {f.adultes.length>0 && (
        <Box t={`Adultes de la famille (${f.adultes.length})`}>
          {f.adultes.map((a,i) => <L key={i} l={`${i+1}.`} v={`${a.prenom} ${a.nom} (${a.categorie})`}/>)}
        </Box>
      )}

      {/* Détail tarifs */}
      <div style={{background:C.N,borderRadius:10,padding:12,marginBottom:10}}>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px",fontWeight:700}}>💰 PAIEMENT</p>
        {tarifsFamille.map((t,i) => (
          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",color:"#ddd"}}>
            <span>{i===0?"Joueur":`Enfant ${i+1}`} — {t.cat}</span>
            <span>{t.pct>0 && <span style={{color:"#6b7280",textDecoration:"line-through",marginRight:4}}>{t.base}€</span>}<span style={{color:C.J,fontWeight:700}}>{t.final}€</span></span>
          </div>
        ))}
        <div style={{borderTop:"1px solid #333",marginTop:6,paddingTop:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:C.W,fontSize:13,fontWeight:700}}>{modeOk?.l}{f.nbFois>1?` · ${f.nbFois}× sans frais`:""}</div>
          </div>
          <div style={{color:C.J,fontWeight:900,fontSize:22}}>{totalFamille} €</div>
        </div>
        {ech && (
          <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #333"}}>
            {ech.map((m,i) => (
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#ddd"}}>
                <span>Versement {i+1}{i===0?" (à la permanence)":""}</span>
                <span style={{color:C.J,fontWeight:700}}>{m}€</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Box t="Autorisations">
        <L l="Soins d'urgence" v={f.autoSoins?"✅ Autorisé":"❌ Non autorisé"}/>
        <L l="Droit à l'image" v={f.autoPhoto?"✅ Autorisé":"❌ Non autorisé"}/>
        <L l="Transport privé" v={f.autoTransport?"✅ Autorisé":"❌ Non autorisé"}/>
      </Box>

      <div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:10,padding:12,marginBottom:10}}>
        <p style={{fontWeight:800,fontSize:13,color:"#92400e",margin:"0 0 6px"}}>📅 À apporter en permanence licence</p>
        <ul style={{margin:0,paddingLeft:20,fontSize:12,color:"#92400e",lineHeight:1.7}}>
          <li>Certificat médical (si requis) ou questionnaire de santé</li>
          <li>Pièce d'identité du joueur</li>
          <li>Justificatif de domicile (-3 mois)</li>
          {hasFamily && <li><strong>Livret de famille</strong> (recommandé pour valider le tarif famille)</li>}
          {f.typeLicence==="nouvelle" && <li>Photo d'identité récente</li>}
          {f.modePaiement==="cheque" && f.nbFois>1 && <li><strong>{f.nbFois} chèques</strong> à l'ordre du RSG (encaissés aux dates indiquées)</li>}
          <li><strong>Le règlement</strong> ({modeOk?.l}{f.nbFois>1?` — total ${totalFamille}€ en ${f.nbFois}×`:` — ${totalFamille}€`})</li>
        </ul>
      </div>

      <button onClick={handlePrint} style={{...BS,width:"100%",marginBottom:6}}>🖨 Imprimer ma fiche de préinscription</button>
      <p style={{fontSize:11,color:C.G,textAlign:"center",margin:"6px 0 0"}}>L'impression vous permet de venir en permanence avec votre dossier prêt.</p>
    </div>
  );
}

function Confirmation({done,f,totalFamille,tarifsFamille,ech,modeOk,cMsg,saison,onNew}) {
  return (
    <div style={{maxWidth:480,margin:"24px auto",padding:"0 14px",textAlign:"center"}}>
      <div style={{background:C.W,borderRadius:14,padding:24,border:`3px solid ${C.J}`}}>
        <div style={{fontSize:48,marginBottom:8}}>🎉</div>
        <h2 style={{fontSize:20,margin:"0 0 6px"}}>Préinscription envoyée !</h2>
        <p style={{color:C.G,fontSize:13,margin:"0 0 12px"}}>{f.prenom} {f.nom}{f.freres.length||f.adultes.length?` + ${f.freres.length+f.adultes.length} membre(s) famille`:""}</p>
        <div style={{background:C.Jp,border:`2px solid ${C.J}`,borderRadius:10,padding:"10px 14px",marginBottom:12,display:"inline-block"}}>
          <p style={{fontSize:11,color:C.G,margin:"0 0 4px"}}>Référence</p>
          <p style={{fontSize:18,fontWeight:900,letterSpacing:2,margin:0}}>{done.id}</p>
        </div>
        <div style={{background:C.N,borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 4px"}}>À régler en permanence</p>
          <p style={{color:C.J,fontWeight:900,fontSize:24,margin:0}}>{totalFamille} €</p>
          <p style={{color:C.W,fontSize:12,margin:"4px 0 0"}}>{modeOk?.l}{f.nbFois>1?` · ${f.nbFois}×`:""}</p>
        </div>
        <p style={{color:C.G,fontSize:12,margin:"0 0 14px"}}>📅 Présentez-vous en <strong>permanence licence</strong> avec votre dossier complet et votre règlement.</p>
        <button style={BP} onClick={onNew}>Accueil</button>
      </div>
    </div>
  );
}

// Mode permanence et dashboard inchangés
function Permanence({saison}) {
  const [data,setData] = useState([]);
  const [search,setSearch] = useState("");
  const [sel,setSel] = useState(null);
  const [loading,setLoading] = useState(true);

  const refresh = async () => { setLoading(true); const d=await stGet(kIns(saison)); setData(Array.isArray(d)?d:[]); setLoading(false); };
  useEffect(() => { refresh(); }, [saison]);

  const upd = async (id,patch) => {
    const d = (await stGet(kIns(saison))||[]).map(e => e.id===id ? {...e,...patch} : e);
    await stSet(kIns(saison), d);
    setData(d);
    if (sel?.id===id) setSel(d.find(e => e.id===id));
  };

  const filtered = data.filter(d => !search || `${d.nom} ${d.prenom} ${d.id} ${d.nomFamille||""}`.toLowerCase().includes(search.toLowerCase()));
  const stats = {
    total: data.length,
    attente: data.filter(d => d.statut==="attente").length,
    paye: data.filter(d => d.statut==="paye").length,
    total_paye: data.filter(d => d.statut==="paye").reduce((s,d) => s+(d.prixTotal||0), 0),
  };

  return (
    <div style={{maxWidth:780,margin:"0 auto",padding:"12px 12px 60px"}}>
      <div style={{background:"#7c3aed",color:C.W,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
        <p style={{margin:"0 0 4px",fontWeight:900,fontSize:15}}>📅 Mode Permanence Licence</p>
        <p style={{margin:0,fontSize:12,opacity:.9}}>Validation rapide des paiements</p>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {[{l:"Total",v:stats.total,c:C.N},{l:"Attente",v:stats.attente,c:"#ca8a04"},{l:"Payés",v:stats.paye,c:C.B},{l:"💰 Encaissé",v:`${stats.total_paye} €`,c:C.V}].map(({l,v,c}) => (
          <div key={l} style={{background:C.W,border:`1.5px solid ${c}44`,borderRadius:10,padding:"6px 10px",textAlign:"center",flex:"1 1 70px"}}>
            <div style={{fontSize:String(v).length>5?14:20,fontWeight:900,color:c}}>{v}</div>
            <div style={{fontSize:10,color:C.G}}>{l}</div>
          </div>
        ))}
      </div>

      <details style={{marginBottom:10,background:C.W,borderRadius:10,border:`1px solid ${C.Gb}`}}>
        <summary style={{padding:"10px 12px",cursor:"pointer",fontWeight:700,fontSize:13,listStyle:"none"}}>📊 Voir le détail par catégorie</summary>
        <div style={{padding:"0 12px 10px"}}>
          <CatStats data={data} title="Tous les inscrits par catégorie"/>
        </div>
      </details>
      <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder="🔍 Nom, prénom, famille…" value={search} onChange={e=>setSearch(e.target.value)} autoFocus/>
      <p style={{fontSize:11,color:C.G,margin:"0 0 10px"}}>{filtered.length} dossier(s) · Cliquez pour valider</p>

      {loading && <p style={{textAlign:"center",color:C.G,padding:24}}>Chargement…</p>}
      {!loading && filtered.length===0 && <p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Aucun dossier</p>}

      {!loading && filtered.map(e => {
        const isOpen = sel?.id===e.id;
        return (
          <div key={e.id} style={{background:isOpen?C.Jp:C.W,borderRadius:10,marginBottom:8,border:`2px solid ${isOpen?C.J:C.Gb}`,overflow:"hidden"}}>
            <div onClick={()=>setSel(isOpen?null:e)} style={{padding:"12px 14px",cursor:"pointer",borderLeft:`5px solid ${STATUTS[e.statut]?.c||C.G}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <div>
                  <span style={{fontWeight:700,fontSize:15}}>{e.prenom} {e.nom}</span>
                  {(e.freres?.length>0||e.adultes?.length>0) && <span style={{marginLeft:6,fontSize:11,color:C.B,fontWeight:700}}>+{(e.freres?.length||0)+(e.adultes?.length||0)}</span>}
                  <span style={{marginLeft:8,background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700}}>{e.categorie}</span>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{background:"#f0fdf4",color:C.V,padding:"3px 8px",borderRadius:6,fontSize:13,fontWeight:900}}>{e.prixTotal||e.prixFinal||0} €</span>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i}</span>
                </div>
              </div>
            </div>

            {isOpen && (
              <div style={{padding:"12px 14px",borderTop:`1px solid ${C.J}`,background:C.W}}>
                <div style={{background:C.N,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{color:C.W,fontSize:13,fontWeight:700}}>{MODES.find(m=>m.id===e.modePaiement)?.l||"—"}</div>
                      {e.nbFois>1 && <div style={{color:"#9ca3af",fontSize:11}}>En {e.nbFois}×</div>}
                      {e.nomFamille && <div style={{color:"#86efac",fontSize:11}}>Famille {e.nomFamille}</div>}
                    </div>
                    <div style={{color:C.J,fontWeight:900,fontSize:24}}>{e.prixTotal||e.prixFinal||0} €</div>
                  </div>
                  {e.nbFois>1 && (
                    <div style={{marginTop:8,paddingTop:8,borderTop:"1px solid #333"}}>
                      {calcEch(e.prixTotal||e.prixFinal||0,e.nbFois).map((m,i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"2px 0",color:"#ddd"}}>
                          <span>Versement {i+1}{i===0?" (aujourd'hui)":""}</span>
                          <span style={{color:C.J,fontWeight:700}}>{m} €</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{fontSize:12,color:C.G,marginBottom:10}}>
                  {e.responsables?.length>0 ? e.responsables.map((r,i) => <div key={i}>📞 {r.lien} : {r.prenom} {r.nom} — {r.tel}</div>) : <div>📞 {e.telephone}</div>}
                  <div>✉️ {e.responsables?.[0]?.email||e.email}</div>
                  <div>🎂 {fmtD(e.dateNaissance)}</div>
                </div>

                {e.freres?.length>0 && (
                  <div style={{background:C.Gc,padding:"6px 10px",borderRadius:6,marginBottom:6,fontSize:11}}>
                    <strong>Frères/sœurs :</strong> {e.freres.map(fr => `${fr.prenom} ${fr.nom} (${fr.categorie})`).join(" · ")}
                  </div>
                )}
                {e.adultes?.length>0 && (
                  <div style={{background:"#eff6ff",padding:"6px 10px",borderRadius:6,marginBottom:8,fontSize:11,color:"#1e40af"}}>
                    <strong>Adultes :</strong> {e.adultes.map(a => `${a.prenom} ${a.nom} (${a.categorie})`).join(" · ")}
                  </div>
                )}

                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                  {[{l:"Certif",k:"certifMedical"},{l:"Photo ID",k:"photoId"},{l:"Justif",k:"justifDom"},{l:"RIB",k:"rib"},...((e.freres?.length||e.adultes?.length)?[{l:"Livret",k:"livretFamille"}]:[])].map(({l,k}) => (
                    <span key={k} style={{background:e[k]?"#dcfce7":"#fee2e2",color:e[k]?C.V:C.R,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>{e[k]?"✓":"○"} {l}</span>
                  ))}
                  {e.certifNeeded && <span style={{background:"#fee2e2",color:C.R,padding:"4px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>🩺 Certif requis !</span>}
                </div>

                <p style={{fontWeight:700,fontSize:12,margin:"0 0 6px"}}>Action :</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <button onClick={()=>upd(e.id,{statut:"paye",datePaiement:new Date().toISOString()})} style={{...BP,padding:"10px",fontSize:13,background:C.V,borderColor:C.V,color:C.W}}>💳 Marquer payé</button>
                  <button onClick={()=>upd(e.id,{statut:"valide",dateValidation:new Date().toISOString()})} style={{...BS,padding:"10px",fontSize:13}}>✓ Validé</button>
                  <button onClick={()=>upd(e.id,{statut:"incomplet"})} style={{...BS,padding:"10px",fontSize:13,background:"#fee2e2",color:"#991b1b",borderColor:"#fca5a5"}}>⚠️ Incomplet</button>
                  <button onClick={()=>upd(e.id,{statut:"attente"})} style={{...BS,padding:"10px",fontSize:13}}>↻ Attente</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({saison,licencies,setLicencies,tarifs,setTarifs}) {
  const [data,setData] = useState([]);
  const [loading,setLoading] = useState(true);
  const [tab,setTab] = useState("liste");
  const [search,setSearch] = useState("");
  const [fSt,setFSt] = useState("tous");
  const [sel,setSel] = useState(null);
  const [exp,setExp] = useState(false);
  const [editTrf,setEditTrf] = useState(false);
  const [tmpTrf,setTmpTrf] = useState(tarifs);

  const refresh = async () => { setLoading(true); const d=await stGet(kIns(saison)); setData(Array.isArray(d)?d:[]); setLoading(false); };
  useEffect(() => { refresh(); }, [saison]);

  const upd = async (id,patch) => {
    const d = (await stGet(kIns(saison))||[]).map(e => e.id===id?{...e,...patch}:e);
    await stSet(kIns(saison),d); setData(d);
    if (sel?.id===id) setSel(d.find(e=>e.id===id));
  };
  const del = async (id) => {
    if (!window.confirm("Supprimer ?")) return;
    const d = (await stGet(kIns(saison))||[]).filter(e => e.id!==id);
    await stSet(kIns(saison),d); setData(d);
    if (sel?.id===id) setSel(null);
  };

  const filtered = data.filter(d => (!search || `${d.nom} ${d.prenom} ${d.id}`.toLowerCase().includes(search.toLowerCase())) && (fSt==="tous" || d.statut===fSt));
  const stats = {
    total: data.length,
    attente: data.filter(d=>d.statut==="attente").length,
    paye: data.filter(d=>d.statut==="paye").length,
    ca: data.filter(d=>d.prixTotal||d.prixFinal).reduce((s,d)=>s+(d.prixTotal||d.prixFinal||0),0),
    encaisse: data.filter(d=>d.statut==="paye").reduce((s,d)=>s+(d.prixTotal||d.prixFinal||0),0),
  };

  const headers = ["Réf","Date","Type","Statut","Nom","Prénom","Naissance","Sexe","Nationalité","Adresse","CP","Ville","Tél","Email","Catégorie","Total €","Mode","Nb fois","Famille","Frères","Notes"];
  const toRow = e => [e.id,fmtDT(e.datePreinscription),e.typeLicence,STATUTS[e.statut]?.l,e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.adresse,e.codePostal,e.ville,e.responsables?.[0]?.tel||e.telephone||"",e.responsables?.[0]?.email||e.email||"",e.categorie,e.prixTotal||e.prixFinal||"",e.modePaiement||"",e.nbFois||1,e.nomFamille||"",e.freres?.length||0,e.notes||""];

  const doExport = async (type) => {
    setExp(true);
    const fn = `RSG_${saison}_`;
    try {
      if (type==="all") await xport([{name:"Toutes",rows:[headers,...filtered.map(toRow)]}], fn+"Dossiers.xlsx");
      else if (type==="equipe") {
        const cats = [...new Set(data.map(d=>d.categorie))].sort();
        await xport(cats.map(c => ({name:c, rows:[headers,...data.filter(d=>d.categorie===c).map(toRow)]})), fn+"ParEquipe.xlsx");
      } else if (type==="paie") {
        await xport([{name:"Paiements",rows:[["Réf","Nom","Prénom","Cat","Mode","Nb fois","Total","Statut","Famille"],...data.map(e=>[e.id,e.nom,e.prenom,e.categorie,e.modePaiement,e.nbFois||1,e.prixTotal||e.prixFinal||0,STATUTS[e.statut]?.l,e.nomFamille||""])]}], fn+"Paiements.xlsx");
      }
    } catch(e) { alert("Erreur : "+e.message); }
    setExp(false);
  };

  return (
    <div style={{maxWidth:840,margin:"0 auto",padding:"12px 12px 60px"}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {[{l:"Total",v:stats.total,c:C.N},{l:"Attente",v:stats.attente,c:"#ca8a04"},{l:"Payés",v:stats.paye,c:C.B},{l:"💰 CA",v:`${stats.ca}€`,c:"#7c3aed"},{l:"💵 Reçu",v:`${stats.encaisse}€`,c:C.V}].map(({l,v,c}) => (
          <div key={l} style={{background:C.W,border:`1.5px solid ${c}44`,borderRadius:10,padding:"6px 10px",textAlign:"center",flex:"1 1 70px"}}>
            <div style={{fontSize:String(v).length>5?14:20,fontWeight:900,color:c}}>{v}</div>
            <div style={{fontSize:10,color:C.G}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{background:C.W,borderRadius:10,padding:10,marginBottom:10,border:`1px solid ${C.Gb}`}}>
        <p style={{fontWeight:700,fontSize:12,margin:"0 0 6px"}}>📊 Exports Excel</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{id:"all",l:"📋 Tous"},{id:"equipe",l:"⚽ Par équipe"},{id:"paie",l:"💰 Paiements"}].map(({id,l}) => (
            <button key={id} onClick={()=>doExport(id)} disabled={exp} style={{background:C.N,color:C.J,border:"none",borderRadius:7,padding:"7px 10px",fontWeight:700,fontSize:11,cursor:"pointer",flex:"1 0 auto",opacity:exp?.6:1}}>{exp?"…":l}</button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",background:C.W,borderRadius:10,padding:3,marginBottom:10,gap:3,border:`1px solid ${C.Gb}`,overflowX:"auto"}}>
        {[{id:"liste",l:"📋 Dossiers"},{id:"stats",l:"📊 Stats"},{id:"tarifs",l:"⚙️ Tarifs"},{id:"licencies",l:`👥 Licenciés (${licencies.length})`}].map(({id,l}) => (
          <button key={id} onClick={()=>setTab(id)} style={{flex:"1 0 auto",padding:"7px 8px",border:"none",borderRadius:6,fontWeight:700,fontSize:11,cursor:"pointer",background:tab===id?C.J:"transparent",color:tab===id?C.N:C.G,whiteSpace:"nowrap"}}>{l}</button>
        ))}
        <button onClick={refresh} style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"7px 9px",fontSize:13,cursor:"pointer"}}>↺</button>
      </div>

      {tab==="liste" && (
        <div>
          <input style={{...inp(),fontSize:14,marginBottom:8}} placeholder="🔍 Recherche…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <select style={{...inp(),fontSize:13,marginBottom:10}} value={fSt} onChange={e=>setFSt(e.target.value)}>
            <option value="tous">Tous statuts</option>
            {Object.entries(STATUTS).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
          <p style={{fontSize:11,color:C.G,margin:"0 0 8px"}}>{filtered.length} / {data.length}</p>
          {loading && <p style={{textAlign:"center",color:C.G,padding:20}}>Chargement…</p>}
          {!loading && filtered.length===0 && <p style={{textAlign:"center",color:C.G,padding:20,fontStyle:"italic"}}>Aucun dossier</p>}
          {!loading && filtered.map(e => (
            <div key={e.id} onClick={()=>setSel(sel?.id===e.id?null:e)} style={{background:sel?.id===e.id?C.Jp:C.W,borderRadius:8,padding:"10px 12px",marginBottom:6,cursor:"pointer",borderLeft:`4px solid ${STATUTS[e.statut]?.c}`}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <span style={{fontWeight:700,fontSize:14}}>{e.prenom} {e.nom}{e.freres?.length>0?` +${e.freres.length}`:""}</span>
                <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:8,background:STATUTS[e.statut]?.bg,color:STATUTS[e.statut]?.c}}>{STATUTS[e.statut]?.i} {STATUTS[e.statut]?.l}</span>
              </div>
              <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.categorie}</span>
                <span style={{background:"#f0fdf4",color:C.V,padding:"1px 6px",borderRadius:4,fontWeight:700,fontSize:11}}>{e.prixTotal||e.prixFinal||0} €</span>
                {e.certifNeeded && <span style={{background:"#fee2e2",color:C.R,padding:"1px 6px",borderRadius:4,fontWeight:700,fontSize:11}}>🩺</span>}
                <span style={{fontSize:10,color:"#9ca3af",marginLeft:"auto"}}>{fmtD(e.datePreinscription)}</span>
              </div>
            </div>
          ))}
          {sel && (
            <div style={{background:C.W,borderRadius:12,padding:14,marginTop:10,border:`2px solid ${C.J}`}}>
              <h3 style={{margin:"0 0 8px"}}>{sel.prenom} {sel.nom}</h3>
              <p style={{fontSize:11,color:C.G,margin:"0 0 10px"}}>{sel.id} · {fmtDT(sel.datePreinscription)}</p>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                {Object.entries(STATUTS).map(([k,v]) => (
                  <button key={k} onClick={()=>upd(sel.id,{statut:k})} style={{border:`2px solid ${sel.statut===k?v.c:C.Gb}`,background:sel.statut===k?v.bg:"#fff",color:sel.statut===k?v.c:C.G,padding:"5px 9px",borderRadius:7,fontWeight:700,fontSize:11,cursor:"pointer"}}>{v.i} {v.l}</button>
                ))}
              </div>
              <div style={{fontSize:12,color:C.G,marginBottom:10}}>
                {sel.responsables?.[0] && <div>📞 {sel.responsables[0].lien} : {sel.responsables[0].prenom} {sel.responsables[0].nom}</div>}
                <div>📞 {sel.responsables?.[0]?.tel||sel.telephone}</div>
                <div>✉️ {sel.responsables?.[0]?.email||sel.email}</div>
                <div>📍 {sel.adresse}, {sel.codePostal} {sel.ville}</div>
                <div>💰 {sel.prixTotal||sel.prixFinal||0} € · {MODES.find(m=>m.id===sel.modePaiement)?.l} {sel.nbFois>1?`(${sel.nbFois}×)`:""}</div>
              </div>
              <button onClick={()=>del(sel.id)} style={{background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:8,padding:"8px",fontWeight:700,fontSize:12,cursor:"pointer",width:"100%"}}>🗑 Supprimer</button>
            </div>
          )}
        </div>
      )}

      {tab==="stats" && (
        <div>
          <CatStats data={data} title="Inscrits par catégorie"/>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>💰 Recettes par mode de paiement</p>
            {MODES.map(m => {
              const grp = data.filter(d => d.modePaiement===m.id);
              const totalEst = grp.reduce((s,d)=>s+(d.prixTotal||d.prixFinal||0),0);
              const totalPaye = grp.filter(d=>d.statut==="paye").reduce((s,d)=>s+(d.prixTotal||d.prixFinal||0),0);
              if (!grp.length) return null;
              return (
                <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.Gc}`,fontSize:13}}>
                  <div>
                    <span style={{fontWeight:700}}>{m.l}</span>
                    <span style={{marginLeft:8,fontSize:11,color:C.G}}>{grp.length} dossier(s)</span>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,color:C.V,fontWeight:700}}>{totalPaye}€ reçu</div>
                    {totalPaye<totalEst && <div style={{fontSize:11,color:C.G}}>sur {totalEst}€ prévu</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>👥 Familles inscrites</p>
            {(() => {
              const familles = data.filter(d => d.freres?.length>0 || d.adultes?.length>0);
              if (!familles.length) return <p style={{textAlign:"center",color:C.G,fontStyle:"italic",fontSize:12,margin:0}}>Aucune famille multi-membres</p>;
              return familles.map(d => {
                const total = 1 + (d.freres?.length||0) + (d.adultes?.length||0);
                return (
                  <div key={d.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.Gc}`,fontSize:12}}>
                    <span><strong>{d.nomFamille||d.nom}</strong> — {total} membres</span>
                    <span style={{color:C.J,fontWeight:700}}>{d.prixTotal||0}€</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {tab==="tarifs" && (
        <div>
          <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:13,color:"#1e40af"}}>⚙️ Tarifs saison {saison}</div>
          {!editTrf ? (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
                {Object.entries(tarifs).map(([cat,prix]) => (
                  <div key={cat} style={{background:C.W,borderRadius:8,padding:"8px 10px",display:"flex",justifyContent:"space-between",border:`1px solid ${C.Gb}`}}>
                    <span style={{fontSize:13,fontWeight:600}}>{cat}</span>
                    <span style={{fontSize:16,fontWeight:900,color:C.J}}>{prix} €</span>
                  </div>
                ))}
              </div>
              <button style={{...BP,width:"100%"}} onClick={()=>{setTmpTrf({...tarifs});setEditTrf(true);}}>✏️ Modifier</button>
            </div>
          ) : (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
                {Object.entries(tmpTrf).map(([cat,prix]) => (
                  <div key={cat} style={{background:C.W,borderRadius:8,padding:"8px 10px",border:`1px solid ${C.Gb}`}}>
                    <label style={{fontSize:11,color:C.G}}>{cat}</label>
                    <input type="number" style={{...inp(),fontSize:14,fontWeight:700}} value={prix} onChange={e=>setTmpTrf(p=>({...p,[cat]:parseInt(e.target.value)||0}))}/>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button style={{...BP,flex:1}} onClick={async()=>{await stSet(kTrf(saison),tmpTrf); setTarifs(tmpTrf); setEditTrf(false);}}>✓ Enregistrer</button>
                <button style={{...BS,flex:1}} onClick={()=>setEditTrf(false)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="licencies" && <BaseLic saison={saison} licencies={licencies} setLicencies={setLicencies}/>}
    </div>
  );
}

function BaseLic({saison,licencies,setLicencies}) {
  const [msg,setMsg] = useState(null);
  const [search,setSearch] = useState("");
  const fileRef = useRef();

  const parseCSV = txt => {
    const lines = txt.split(/\r?\n/).filter(l => l.trim());
    if (lines.length<2) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const h = lines[0].split(sep).map(x => x.trim().toLowerCase().replace(/['"]/g,""));
    const idx = {
      n: h.findIndex(x => x.includes("nom") && !x.includes("pre") && !x.includes("pré")),
      p: h.findIndex(x => x.includes("pre") || x.includes("pré")),
      l: h.findIndex(x => x.includes("licen") || x.includes("num")),
      a: h.findIndex(x => x.includes("certif") || x.includes("med") || x.includes("méd")),
      c: h.findIndex(x => x.includes("cat")),
    };
    return lines.slice(1).map(line => {
      const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g,""));
      const annee = (idx.a>=0 ? cells[idx.a] : "").match(/\d{4}/)?.[0] || "";
      return {n:idx.n>=0?cells[idx.n]?.toUpperCase():"",p:idx.p>=0?cells[idx.p]:"",l:idx.l>=0?cells[idx.l]:"",a:annee,c:idx.c>=0?cells[idx.c]:""};
    }).filter(r => r.n || r.p || r.l);
  };

  const handleFile = file => {
    if (!file) return;
    const r = new FileReader();
    r.onload = async ev => {
      try {
        const rows = parseCSV(ev.target.result);
        if (!rows.length) { setMsg({ok:false,t:"Format non reconnu"}); return; }
        await stSet(kLic(saison), rows);
        setLicencies(rows);
        setMsg({ok:true,t:`✅ ${rows.length} licencié(s) importé(s)`});
      } catch(e) { setMsg({ok:false,t:"Erreur : "+e.message}); }
    };
    r.readAsText(file, "UTF-8");
  };

  const filtered = search.length>1 ? licencies.filter(l => `${l.n||l.nom} ${l.p||l.prenom} ${l.l||l.numLicence}`.toLowerCase().includes(search.toLowerCase())) : licencies;

  return (
    <div>
      <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
        <p style={{fontWeight:700,fontSize:13,color:"#1e40af",margin:"0 0 4px"}}>👥 Base licenciés — Saison {saison}</p>
        <p style={{fontSize:12,color:"#1e40af",margin:0}}>Importez l'export CSV de Footclubs pour vérifier automatiquement les certificats médicaux.</p>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{handleFile(e.target.files?.[0]); e.target.value="";}}/>
      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
        <button style={{...BP,flex:"1 1 140px",fontSize:13,padding:"9px 12px"}} onClick={()=>fileRef.current.click()}>📥 Importer CSV</button>
        {licencies.length>0 && <button style={{background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:10,padding:"9px 12px",fontWeight:700,fontSize:13,cursor:"pointer"}} onClick={async()=>{if(window.confirm("Vider ?")){await stSet(kLic(saison),[]); setLicencies([]); setMsg({ok:true,t:"Vidé"});}}}>🗑 Vider</button>}
      </div>
      {msg && <div style={{background:msg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`,borderRadius:8,padding:"8px 10px",marginBottom:10,fontSize:12,color:msg.ok?C.V:C.R}}>{msg.t}</div>}
      {licencies.length>0 && <input style={{...inp(),fontSize:14,marginBottom:8}} placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}/>}
      {licencies.length===0 ? <p style={{textAlign:"center",color:C.G,padding:24,fontStyle:"italic"}}>Base vide — importez un CSV</p> : (
        <div>
          <p style={{fontSize:11,color:C.G,marginBottom:6}}>{filtered.length} / {licencies.length}</p>
          {filtered.slice(0,50).map((l,i) => {
            const annee = l.a || l.anneeLastCertif;
            const req = annee ? certifReq(annee) : null;
            return (
              <div key={i} style={{background:C.W,borderRadius:8,padding:"8px 10px",marginBottom:4,borderLeft:`3px solid ${req===true?C.R:req===false?C.V:C.Gb}`}}>
                <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                  <span style={{fontWeight:700,fontSize:13}}>{l.p||l.prenom} {l.n||l.nom}</span>
                  {(l.c||l.categorie) && <span style={{background:C.N,color:C.J,padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700}}>{l.c||l.categorie}</span>}
                </div>
                <div style={{fontSize:11,color:C.G,marginTop:2}}>
                  {(l.l||l.numLicence) && <span>N° {l.l||l.numLicence} · </span>}
                  {annee && <span>Certif {annee} · </span>}
                  <span style={{color:req===true?C.R:req===false?C.V:"#9ca3af",fontWeight:600}}>{req===true?"🩺 Requis":req===false?"✅ OK":"❓"}</span>
                </div>
              </div>
            );
          })}
          {filtered.length>50 && <p style={{textAlign:"center",color:C.G,fontSize:11,marginTop:6}}>+ {filtered.length-50} autres</p>}
        </div>
      )}
    </div>
  );
}


function PhotoInput({value,onChange,err}) {
  const fRef=useRef(),cRef=useRef();
  const handle=file=>{ if(!file)return; if(file.size>10*1024*1024){alert("Max 10 Mo");return;} const r=new FileReader(); r.onload=ev=>onChange(ev.target.result); r.onerror=()=>alert("Erreur."); r.readAsDataURL(file); };
  if(value) return (
    <div style={{display:"flex",gap:12,alignItems:"center",padding:10,background:"#dcfce7",border:"1px solid #86efac",borderRadius:8}}>
      <img src={value} alt="Photo" style={{width:64,height:64,objectFit:"cover",borderRadius:8,border:`2px solid ${C.J}`,flexShrink:0}}/>
      <div style={{flex:1}}>
        <p style={{fontSize:13,color:C.V,fontWeight:700,margin:"0 0 4px"}}>✓ Photo importée</p>
        <button type="button" style={{fontSize:12,color:C.R,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline"}} onClick={()=>onChange("")}>Supprimer / changer</button>
      </div>
    </div>
  );
  return (
    <div>
      <input ref={fRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
      <input ref={cRef} type="file" accept="image/*" capture="user" style={{display:"none"}} onChange={e=>{handle(e.target.files?.[0]);e.target.value="";}}/>
      <div style={{display:"flex",gap:8}}>
        <button type="button" style={{...BS,flex:1,fontSize:13,padding:"10px 8px",borderColor:err?C.R:C.Gb}} onClick={()=>fRef.current.click()}>🖼 Galerie</button>
        <button type="button" style={{...BP,flex:1,fontSize:13,padding:"10px 8px"}} onClick={()=>cRef.current.click()}>📷 Caméra</button>
      </div>
      {err && <span style={{color:C.R,fontSize:11,marginTop:5,display:"block"}}>⚠ {err}</span>}
      <p style={{fontSize:11,color:C.G,marginTop:5,margin:"5px 0 0"}}>JPG, PNG — fond neutre, visage dégagé. Max 10 Mo</p>
    </div>
  );
}


function CatStats({data, title="Inscrits par catégorie"}) {
  const counts = countByCat(data);
  const max = Math.max(1, ...Object.values(counts).map(c => c.total));
  return (
    <div style={{background:C.W,borderRadius:10,padding:"12px 14px",border:`1px solid ${C.Gb}`,marginBottom:10}}>
      <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>📊 {title}</p>
      {CATS.map(cat => {
        const ct = counts[cat];
        if (!ct.total) return null;
        const pct = (ct.total / max) * 100;
        return (
          <div key={cat} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{fontWeight:700}}>{cat}</span>
              <span style={{color:C.G}}>
                <span style={{color:C.B,fontWeight:700}}>{ct.paye}💳</span>
                <span style={{margin:"0 4px"}}>·</span>
                <span style={{color:C.V,fontWeight:700}}>{ct.valide}✅</span>
                <span style={{margin:"0 4px"}}>·</span>
                <span style={{color:"#ca8a04",fontWeight:700}}>{ct.attente}⏳</span>
                <span style={{margin:"0 4px"}}>·</span>
                <span style={{fontWeight:900,color:C.N}}>Total {ct.total}</span>
              </span>
            </div>
            <div style={{height:18,background:C.Gc,borderRadius:4,overflow:"hidden",display:"flex"}}>
              {ct.paye>0 && <div style={{width:`${(ct.paye/ct.total)*pct}%`,background:C.B}} title={`Payés: ${ct.paye}`}/>}
              {ct.valide>0 && <div style={{width:`${(ct.valide/ct.total)*pct}%`,background:C.V}} title={`Validés: ${ct.valide}`}/>}
              {ct.attente>0 && <div style={{width:`${(ct.attente/ct.total)*pct}%`,background:"#ca8a04"}} title={`Attente: ${ct.attente}`}/>}
              {ct.incomplet>0 && <div style={{width:`${(ct.incomplet/ct.total)*pct}%`,background:C.R}} title={`Incomplet: ${ct.incomplet}`}/>}
            </div>
          </div>
        );
      })}
      {!Object.values(counts).some(c=>c.total) && <p style={{textAlign:"center",color:C.G,fontStyle:"italic",fontSize:12,padding:"8px 0",margin:0}}>Aucun inscrit</p>}
    </div>
  );
}

function Card({sel,onClick,icon,t}) {
  return <div onClick={onClick} style={{border:`2px solid ${sel?C.J:C.Gb}`,background:sel?C.Jp:"#fafafa",borderRadius:10,padding:14,cursor:"pointer",textAlign:"center",minHeight:90,display:"flex",flexDirection:"column",justifyContent:"center",gap:6}}>
    <div style={{fontSize:24}}>{icon}</div>
    <div style={{fontWeight:800,fontSize:13}}>{t}</div>
  </div>;
}
function Field({label,err,children}) {
  return <div style={{marginBottom:10}}><label style={lbl}>{label}</label>{children}{err && <span style={{color:C.R,fontSize:11,marginTop:3,display:"block"}}>⚠ {err}</span>}</div>;
}
function Err({msg}) {
  return <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"8px 10px",fontSize:12,color:C.R,marginBottom:10}}>⚠ {msg}</div>;
}
function Msg({ok,children}) {
  return <div style={{borderRadius:8,padding:"8px 10px",background:ok?"#dcfce7":"#fee2e2",border:`1px solid ${ok?"#86efac":"#fca5a5"}`,fontSize:12,color:ok?C.V:C.R,marginTop:6,marginBottom:6}}>{ok?"✅ ":"🩺 "}{children}</div>;
}
function Box({t,children}) {
  return <div style={{background:"#f9fafb",borderRadius:8,padding:"8px 10px",marginBottom:6}}>
    <p style={{fontWeight:700,fontSize:11,color:C.N,margin:"0 0 4px"}}>{t}</p>{children}
  </div>;
}
function L({l,v}) {
  return <div style={{display:"flex",gap:8,fontSize:12,padding:"2px 0"}}><span style={{color:C.G,minWidth:90}}>{l} :</span><span style={{fontWeight:600}}>{v||"—"}</span></div>;
}
