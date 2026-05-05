import { useState, useEffect, useRef, useCallback } from "react";

/* ══ SAISONS ══════════════════════════════════════════════════════ */
const saisons = (() => {
  const y = new Date().getFullYear();
  return Array.from({length:6},(_,i)=>{const s=y-1+i;return{value:`${s}-${s+1}`,label:`Saison ${s}-${s+1}`};});
})();
const SAISON_DEFAUT = `${new Date().getFullYear()}-${new Date().getFullYear()+1}`;

/* ══ STORAGE ══════════════════════════════════════════════════════ */
async function stGet(key){try{if(typeof window.storage!=="undefined"){const r=await window.storage.get(key);return r?.value?JSON.parse(r.value):null;}}catch{}return null;}
async function stSet(key,val){try{if(typeof window.storage!=="undefined")await window.storage.set(key,JSON.stringify(val));}catch{}}
const keyIns=s=>`rsg_ins_${s}`;
const keyLic=s=>`rsg_lic_${s}`;

/* ══ TARIFS (modifiables ici) ═════════════════════════════════════ */
const TARIFS_DEFAUT = {
  "U5-U6":    60,
  "U7-U8":    70,
  "U9-U10":   80,
  "U11-U12":  90,
  "U13-U14": 100,
  "U15-U16": 110,
  "U17-U18": 120,
  "Senior":  140,
  "Vétéran": 100,
};

// Remise famille (à partir du 2e enfant de la même famille)
const REMISE_FAMILLE = {
  2: 10,   // 2e enfant : -10%
  3: 20,   // 3e enfant : -20%
  4: 30,   // 4e+ : -30%
};

const MODES_PAIEMENT = [
  {id:"cb",    l:"💳 Carte bancaire", fractionnable:true},
  {id:"cheque",l:"📝 Chèque",         fractionnable:true},
  {id:"especes",l:"💵 Espèces",       fractionnable:false},
];

/* ══ CONSTANTES ═══════════════════════════════════════════════════ */
const ADMIN = "RSG2025";
const C = {J:"#F5C800",Jd:"#C9A800",Jp:"#FFFBE6",N:"#0F0F0F",Nm:"#1A1A1A",Ns:"#2A2A2A",G:"#6B7280",Gc:"#F3F4F6",Gb:"#E5E7EB",W:"#FFFFFF",V:"#16a34a",R:"#dc2626",B:"#2563eb"};
const CATS = [{l:"U5-U6 (2020-2021)",v:"U5-U6"},{l:"U7-U8 (2018-2019)",v:"U7-U8"},{l:"U9-U10 (2016-2017)",v:"U9-U10"},{l:"U11-U12 (2014-2015)",v:"U11-U12"},{l:"U13-U14 (2012-2013)",v:"U13-U14"},{l:"U15-U16 (2010-2011)",v:"U15-U16"},{l:"U17-U18 (2008-2009)",v:"U17-U18"},{l:"Senior (av. 2008)",v:"Senior"},{l:"Vétéran (av. 1985)",v:"Vétéran"}];
const POSTES = ["Gardien","Défenseur central","Latéral droit","Latéral gauche","Milieu défensif","Milieu central","Milieu offensif","Ailier droit","Ailier gauche","Attaquant","Pas de préférence"];
const NATS   = ["Française","Algérienne","Marocaine","Tunisienne","Portugaise","Espagnole","Italienne","Belge","Britannique","Allemande","Polonaise","Roumaine","Turque","Sénégalaise","Malienne","Camerounaise","Ivoirienne","Congolaise (RDC)","Autre"];
const LIENS  = ["Père","Mère","Tuteur légal","Grand-parent","Frère/Sœur majeur(e)"];
const TA = ["XS","S","M","L","XL","XXL","3XL"];
const TE = ["4 ans / 104cm","6 ans / 116cm","8 ans / 128cm","10 ans / 140cm","12 ans / 152cm","14 ans / XS adulte"];
const STATUTS = {attente:{l:"En attente",c:"#ca8a04",bg:"#fef9c3",i:"⏳"},valide:{l:"Validé",c:"#16a34a",bg:"#dcfce7",i:"✅"},paye:{l:"Payé ✓",c:"#2563eb",bg:"#dbeafe",i:"💳"},incomplet:{l:"Incomplet",c:"#dc2626",bg:"#fee2e2",i:"⚠️"},refuse:{l:"Refusé",c:"#6b7280",bg:"#f3f4f6",i:"❌"}};

// Base licenciés Footclubs pré-chargée (282 entrées saison 2025-2026 — joueurs + dirigeants + éducateurs, avec validité certif N+1)
const BASE_FOOTCLUBS = [{"n":"AUBIN","p":"Patrice","l":"87237437","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1963-04-15","s":"M","cm":true,"em":"patrice.aubin144@orange.fr","tel":"660020745"},{"n":"GUYOT","p":"Damien","l":"87118110","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1992-05-05","s":"M","cm":false,"em":"damien.guyot@outlook.fr","tel":"770254613"},{"n":"MAUXION","p":"Antoine","l":"86369752","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2000-04-21","s":"M","cm":false,"em":"ANTOINEMAUXION@HOTMAIL.FR","tel":"602394089"},{"n":"OUSSAYEH","p":"Abderrahman","l":"86557295","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1977-08-22","s":"M","cm":true,"em":"wino.abder@hotmail.fr","tel":"613724892"},{"n":"GLEMIN","p":"Alexandre","l":"87724802","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2001-05-10","s":"M","cm":true,"em":"alexandre.glemin@gmail.com","tel":"788666482"},{"n":"RAVART","p":"Cyrille","l":"87061497","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1991-06-27","s":"M","cm":false,"em":"RAVART-CYRILLE@HOTMAIL.FR","tel":"631551644"},{"n":"HERSANT","p":"Thierry","l":"86419534","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1972-12-22","s":"M","cm":true,"em":"thierry.r100@free.fr","tel":"660622941"},{"n":"RENOU","p":"Clement","l":"87390294","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1993-05-11","s":"M","cm":false},{"n":"DUFOURD","p":"Thierry","l":"87061490","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1962-09-30","s":"M","cm":true,"em":"dufourdpatricia@gmail.com","tel":"682641485"},{"n":"EDIN","p":"Nicolas","l":"88012043","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1985-01-24","s":"M","cm":true,"em":"edin.nicolas@orange.fr","tel":"622711734"},{"n":"DENAIRE","p":"David","l":"86411959","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1990-11-11","s":"M","cm":false,"em":"denaire.david@laposte.net","tel":"678899112"},{"n":"VOLLARD","p":"Quentin","l":"86411920","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1992-03-09","s":"M","cm":false,"em":"quentin.vollard@hotmail.fr","tel":"627430091"},{"n":"GUICHARD","p":"Anthony","l":"86318443","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1985-07-12","s":"M","cm":true,"em":"anthony.guichard44@laposte.net","tel":"663380446"},{"n":"PASQUIER","p":"Manuel","l":"87061493","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1990-04-25","s":"M","cm":false,"em":"manuel.pasquier@hotmail.fr","tel":"648074953"},{"n":"GOISET","p":"Justin","l":"86924598","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1993-07-21","s":"M","cm":true,"em":"JUSTINGOISET@GMAIL.COM","tel":"659696622"},{"n":"BIZEUL","p":"Jerome","l":"87254574","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1975-12-25","s":"M","cm":false,"em":"jeromebizeul@free.fr","tel":"638649333"},{"n":"BERNARD","p":"Jacky","l":"86557260","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1956-02-19","s":"M","cm":false,"em":"bernard-jacky@orange.fr","tel":"687397624"},{"n":"SIMON","p":"Matteo","l":"86411464","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2002-03-31","s":"M","cm":false,"em":"MATTEOSIMON8@GMAIL.COM","tel":"663276859"},{"n":"DENIER","p":"Eric","l":"86423235","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1968-02-18","s":"M","cm":true,"em":"valericdenier@free.fr","tel":"0670176714"},{"n":"BLIN","p":"Mickael","l":"86318498","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1982-02-15","s":"M","cm":false,"em":"blinmblanv@orange.fr","tel":"672477641"},{"n":"BOTREAU","p":"Anthony","l":"86941719","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1986-12-12","s":"M","cm":true,"em":"anthony.botreau@orange.fr","tel":"615780637"},{"n":"BERNARD","p":"Jean","l":"86174786","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1993-05-28","s":"M","cm":false,"em":"secretariat.foot.rsg@gmail.com","tel":"684210737"},{"n":"PINEL","p":"Jean Yves","l":"86475012","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1963-05-15","s":"M","cm":false,"em":"jeanyves-pinel@orange.fr","tel":"602727446"},{"n":"LEGENDRE","p":"Olivier","l":"86543205","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1967-02-22","s":"M","cm":true,"em":"LEGENDREOLIVIER0162@ORANGE.FR","tel":"686842747"},{"n":"MARTIN","p":"Gael","l":"88097444","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1980-05-08","s":"M","cm":false,"em":"labes.martin@orange.fr","tel":"686689509"},{"n":"GUEYMARD","p":"Jean David","l":"87305494","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1990-10-31","s":"M","cm":true,"em":"secretariat.foot.rsg@gmail.com","tel":"662693252"},{"n":"HAMARD","p":"Franck","l":"87390566","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1968-05-20","s":"M","cm":false,"em":"franck.hamard@wanadoo.fr","tel":"689888155"},{"n":"VIVIER","p":"Pierrick","l":"87960033","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1967-02-16","s":"M","cm":false,"em":"lovivier@gmail.com","tel":"781614452"},{"n":"STEPHANT","p":"Corentin","l":"86361853","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2001-02-26","s":"M","cm":true,"em":"co-stephant@orange.fr","tel":"782891088"},{"n":"CRESPIN","p":"Lucas","l":"87615254","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2000-02-14","s":"M","cm":false,"em":"crespin1402@gmail.com","tel":"751610787"},{"n":"PINEL","p":"Marc Antoine","l":"87390311","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1989-08-18","s":"M","cm":false,"em":"MARCOPINEL@ORANGE.FR","tel":"670878846"},{"n":"GANDON","p":"Thomas","l":"86819431","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1988-01-10","s":"M","cm":true,"em":"thomas49440@gmail.com","tel":"683988703"},{"n":"DAVY","p":"Corentin","l":"87368622","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2002-06-07","s":"M","cm":false,"em":"corentin.davy@yahoo.fr","tel":"623946352"},{"n":"MONNIER","p":"Owen","l":"88264184","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2005-09-04","s":"M","cm":false,"em":"owenmonnier@gmail.com","tel":"622487228"},{"n":"VOLLARD","p":"Luc","l":"86350925","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1959-09-08","s":"M","cm":true,"em":"famille.vollard@orange.fr","tel":"683985123"},{"n":"BERNARD","p":"Pierre","l":"87061505","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1984-08-03","s":"M","cm":false,"em":"pierre--bernard@hotmail.fr","tel":"621046601"},{"n":"MAUSSION","p":"Gerard","l":"87195940","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1955-02-13","s":"M","cm":true,"em":"maussion.gerard@gmail.com","tel":"624151504"},{"n":"COIFFARD","p":"Yanis","l":"86318449","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1997-07-09","s":"M","cm":false,"em":"y.coiffard@laposte.net","tel":"750910076"},{"n":"GUILLET","p":"Jordan","l":"86442547","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1993-06-04","s":"M","cm":false,"em":"JGUILLET.PRO@GMAIL.COM","tel":"637711629"},{"n":"COSSARD","p":"Patrick","l":"86318465","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1963-10-15","s":"M","cm":false,"em":"patrickcossard@orange.fr","tel":"631087782"},{"n":"MAUXION","p":"Erwan","l":"86527871","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1997-07-17","s":"M","cm":true,"em":"erwanmauxion@yahoo.fr","tel":"749411359"},{"n":"RENIER","p":"Jerome","l":"86318496","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1973-11-10","s":"M","cm":false,"em":"laurence.jet@free.fr","tel":"681311532"},{"n":"CLEMENCEAU","p":"Marius","l":"87551636","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"2006-12-08","s":"M","cm":false,"em":"mariusclemenceau@gmail.com","tel":"670007889"},{"n":"SERRE","p":"Didier","l":"87061521","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1968-02-24","s":"M","cm":true,"em":"didier.serre68@orange.fr","tel":"689681146"},{"n":"BRANCHEREAU","p":"Anthony","l":"86650225","c":"Dirigeant","sc":"Dirigeant","tl":"Dirigeant","dn":"1978-06-20","s":"M","cm":false,"em":"anthonybranchereau@free.fr","tel":"676383303"},{"n":"SEBILEAU","p":"Laura","l":"88126362","c":"Dirigeant","sc":"Dirigeante","tl":"Dirigeant","dn":"2004-05-01","s":"F","cm":false,"em":"laura.sebileau@gmail.com","tel":"767843002"},{"n":"LOIRAT","p":"Sabrina","l":"87615252","c":"Dirigeant","sc":"Dirigeante","tl":"Dirigeant","dn":"1994-05-31","s":"F","cm":false,"em":"SABRINA.LOIRAT@GMAIL.COM","tel":"680582811"},{"n":"GUYOT","p":"Lucile","l":"86442499","c":"Dirigeant","sc":"Dirigeante","tl":"Dirigeant","dn":"1991-11-08","s":"F","cm":false,"em":"brachet.lucile@gmail.com","tel":"647355411"},{"n":"LEBOSSE","p":"Valentine","l":"88178115","c":"Dirigeant","sc":"Dirigeante","tl":"Dirigeant","dn":"1993-08-25","s":"F","cm":true,"em":"valentinelebosse@gmail.com","tel":"627181496"},{"n":"BARDOT","p":"Laurene","l":"87155957","c":"Dirigeant","sc":"Dirigeante","tl":"Dirigeant","dn":"1991-07-30","s":"F","cm":false,"em":"bardotlaurene@hotmail.fr","tel":"635574485"},{"n":"RIGAUD","p":"Patrice","l":"87177630","c":"Educateur","sc":"Educateur Fédéral","tl":"Educateur Fédéral","dn":"1964-04-09","s":"M","cm":false,"em":"patrice.rigaud64@orange.fr","tel":"620297764"},{"n":"GUILLON","p":"Herve","l":"86350647","c":"Educateur","sc":"Educateur Fédéral","tl":"Educateur Fédéral","dn":"1978-08-05","s":"M","cm":false,"em":"herveguillon49@orange.fr","tel":"617154095"},{"n":"SERRE","p":"Antoine","l":"86687414","c":"Educateur","sc":"Régional","tl":"Technique","dn":"1996-10-11","s":"M","cm":false,"em":"antoine.serre44@gmail.com","tel":"633788121"},{"n":"COIFFARD","p":"Yanis","l":"87573309","c":"Educateur","sc":"Régional","tl":"Technique","dn":"1997-07-09","s":"M","cm":false,"em":"y.coiffard@laposte.net","tel":"750910076"},{"n":"GUILLET","p":"Jordan","l":"86297823","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-06-04","s":"M","cm":false,"em":"JGUILLET.PRO@GMAIL.COM","tel":"637711629"},{"n":"MAUXION","p":"Erwan","l":"86924593","c":"Senior","sc":"Senior","tl":"Libre","dn":"1997-07-17","s":"M","cm":true,"em":"erwanmauxion@yahoo.fr","tel":"749411359"},{"n":"YOCK","p":"Lamine","l":"86527927","c":"Senior","sc":"Senior","tl":"Libre","dn":"2001-03-02","s":"M","cm":false,"em":"LAMINEYOCK5@GMAIL.COM","tel":"782537495"},{"n":"GATINEL","p":"Jules","l":"86343811","c":"Senior","sc":"Senior","tl":"Libre","dn":"2000-06-13","s":"M","cm":true,"em":"gatineljules@gmail.com","tel":"616275107"},{"n":"EVAIN","p":"Valentin","l":"86440069","c":"Senior","sc":"Senior","tl":"Libre","dn":"1996-11-05","s":"M","cm":false,"em":"val4996@hotmail.fr","tel":"688603873"},{"n":"SERRE","p":"Antoine","l":"88264183","c":"Senior","sc":"Senior","tl":"Libre","dn":"1996-10-11","s":"M","cm":false,"em":"antoine.serre44@gmail.com","tel":"633788121"},{"n":"FIGUREAU","p":"Florian","l":"86419950","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-12-02","s":"M","cm":true,"em":"figureau.florian@gmail.com","tel":"659276911"},{"n":"GAUTIER","p":"Alexandre","l":"86650295","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-08-27","s":"M","cm":false,"em":"alexandre.gautier273@gmail.com","tel":"631693271"},{"n":"MORTIER","p":"Florian","l":"87348970","c":"Senior","sc":"Senior","tl":"Libre","dn":"1996-10-21","s":"M","cm":false,"em":"florian.m290@gmail.com","tel":"669715501"},{"n":"VIVIER","p":"Titouan","l":"88249825","c":"Senior","sc":"Senior","tl":"Libre","dn":"2003-04-28","s":"M","cm":false,"em":"titouanvivier@gmail.com","tel":"782046488"},{"n":"MARQUE","p":"Tristan","l":"86814921","c":"Senior","sc":"Senior","tl":"Libre","dn":"1999-02-17","s":"M","cm":false,"em":"tristan.marque@gmail.com","tel":"620574622"},{"n":"SALEIX","p":"Eliot","l":"87724869","c":"Senior","sc":"Senior","tl":"Libre","dn":"2003-01-04","s":"M","cm":true,"em":"eliotsaleix8@gmail.com","tel":"607289874"},{"n":"RAVART","p":"Cyrille","l":"87061496","c":"Senior","sc":"Senior","tl":"Libre","dn":"1991-06-27","s":"M","cm":false,"em":"RAVART-CYRILLE@HOTMAIL.FR","tel":"631551644"},{"n":"HAMON","p":"Maxime","l":"87709704","c":"Senior","sc":"Senior","tl":"Libre","dn":"2001-05-14","s":"M","cm":false,"em":"hamonmaxime576@gmail.com","tel":"619470742"},{"n":"GREVECHE","p":"Ugo","l":"86475001","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-12-11","s":"M","cm":false,"em":"greveche.ugo@gmail.com","tel":"662550624"},{"n":"GUYOT","p":"Damien","l":"87195938","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-05-05","s":"M","cm":false,"em":"damien.guyot@outlook.fr","tel":"770254613"},{"n":"LECOMTE","p":"Romain","l":"88492164","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-05-24","s":"M","cm":false,"em":"romainlecomte24@gmail.com","tel":"646744442"},{"n":"VIGNERON","p":"Quentin","l":"87443454","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-04-15","s":"M","cm":false,"em":"vigneron.quentin@outlook.fr","tel":"633307857"},{"n":"GICQUIAU","p":"Adrien","l":"87118114","c":"Senior","sc":"Senior","tl":"Libre","dn":"1999-07-21","s":"M","cm":false,"em":"gicquiauadrien@gmail.com","tel":"622427086"},{"n":"BRIERE","p":"Aurelien","l":"86650279","c":"Senior","sc":"Senior","tl":"Libre","dn":"1999-01-08","s":"M","cm":false,"em":"aurelien.briere@free.fr","tel":"770523987"},{"n":"MAUXION","p":"Antoine","l":"86298469","c":"Senior","sc":"Senior","tl":"Libre","dn":"2000-04-21","s":"M","cm":false,"em":"ANTOINEMAUXION@HOTMAIL.FR","tel":"602394089"},{"n":"DUFOURD","p":"Gregoire","l":"87118123","c":"Senior","sc":"Senior","tl":"Libre","dn":"1997-04-12","s":"M","cm":false,"em":"gregoire.dufourd@gmail.com","tel":"647019440"},{"n":"CHEVILLARD","p":"Gwenael","l":"86890777","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-09-04","s":"M","cm":false,"em":"gwenael.chevillard@hotmail.fr","tel":"621895176"},{"n":"GAUTIER","p":"Emilien","l":"87061517","c":"Senior","sc":"Senior","tl":"Libre","dn":"1991-01-26","s":"M","cm":false,"em":"emilien.gautier@yahoo.fr","tel":"670234543"},{"n":"GLEMIN","p":"Pierre","l":"86340814","c":"Senior","sc":"Senior","tl":"Libre","dn":"2003-11-28","s":"M","cm":false,"em":"pierreglemin1@gmail.com","tel":"631783816"},{"n":"VOLLARD","p":"Quentin","l":"86442588","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-03-09","s":"M","cm":false,"em":"quentin.vollard@hotmail.fr","tel":"627430091"},{"n":"DANIN","p":"Evan","l":"86474991","c":"Senior","sc":"Senior","tl":"Libre","dn":"2003-04-16","s":"M","cm":false,"em":"evandanin@gmail.com","tel":"783660218"},{"n":"HAMARD","p":"Pierre","l":"87348966","c":"Senior","sc":"Senior","tl":"Libre","dn":"1997-03-24","s":"M","cm":false,"em":"pierrehamard@orange.fr","tel":"672840858"},{"n":"MARTEL","p":"Corentin","l":"87219063","c":"Senior","sc":"Senior","tl":"Libre","dn":"1995-02-22","s":"M","cm":false,"em":"CORENTINMARTEL2@GMAIL.COM","tel":"601863659"},{"n":"FIX","p":"Marcelin","l":"86907501","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-12-27","s":"M","cm":false,"em":"marcelin.fix@gmail.com","tel":"695200624"},{"n":"BERTIN","p":"Antoine","l":"86527956","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-04-28","s":"M","cm":true,"em":"2002antoinebertin@gmail.com","tel":"0632435093Mère"},{"n":"HENAULT","p":"Florent","l":"86492907","c":"Senior","sc":"Senior","tl":"Libre","dn":"1995-10-27","s":"M","cm":false,"em":"florenthenault@gmail.com","tel":"642892986"},{"n":"SIMON","p":"Matteo","l":"86343814","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-03-31","s":"M","cm":false,"em":"MATTEOSIMON8@GMAIL.COM","tel":"663276859"},{"n":"MOREAU","p":"Alan","l":"87875689","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-06-30","s":"M","cm":false,"em":"alanmoreau.02@gmail.com","tel":"649492893"},{"n":"BOUTSIOU","p":"Ilyas","l":"87237418","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-01-20","s":"M","cm":true,"em":"ilyas.askif@gmail.com","tel":"0628490191Mère"},{"n":"NANCY RENOU","p":"Leo","l":"86342221","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-09-14","s":"M","cm":false,"em":"leonancyren@gmail.com","tel":"679192610"},{"n":"DAMIENS","p":"Antoine","l":"87793805","c":"Senior","sc":"Senior","tl":"Libre","dn":"1999-07-17","s":"M","cm":false,"em":"ANTOINE.DAMIENS1@ICLOUD.COM","tel":"782855149"},{"n":"GOUBAUD","p":"Maxime","l":"86342226","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-10-04","s":"M","cm":false,"em":"goubaudmaxime@gmail.com","tel":"611718915"},{"n":"PAUNET","p":"Maxime","l":"86352672","c":"Senior","sc":"Senior","tl":"Libre","dn":"1997-01-15","s":"M","cm":false,"em":"maximepaunet@gmail.com","tel":"649636925"},{"n":"DELAUNAY","p":"Marius","l":"86457323","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-04-13","s":"M","cm":false,"em":"MARIUS.DELAUNAY@HOTMAIL.FR","tel":"626743283"},{"n":"BU","p":"Corentin","l":"87118070","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-06-18","s":"M","cm":false,"em":"corentin.bu@gmail.com","tel":"767442662"},{"n":"CRESPIN","p":"Lucas","l":"86650249","c":"Senior","sc":"Senior","tl":"Libre","dn":"2000-02-14","s":"M","cm":false,"em":"crespin1402@gmail.com","tel":"751610787"},{"n":"DIEVAL","p":"Enzo","l":"86527973","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-01-26","s":"M","cm":true,"em":"enzodieval44@gmail.com","tel":"782020055"},{"n":"PLOTEAU","p":"Simon","l":"87061487","c":"Senior","sc":"Senior","tl":"Libre","dn":"2000-08-14","s":"M","cm":true,"em":"simon.ploteau@outlook.fr","tel":"613158487"},{"n":"FIGUREAU","p":"Maxime","l":"86751194","c":"Senior","sc":"Senior","tl":"Libre","dn":"1995-06-27","s":"M","cm":false,"em":"FIGUREAU.MAXIME@GMAIL.COM","tel":"641716627"},{"n":"BRUNET HENNEBERT","p":"Enzo","l":"86440374","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-07-13","s":"M","cm":false,"em":"enzo.bh@icloud.com","tel":"784512842"},{"n":"RAYER","p":"Emilien","l":"86685337","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-10-19","s":"M","cm":false,"em":"EMILIENRAYER@GMAIL.COM","tel":"786014479"},{"n":"VIGNERON","p":"Clement","l":"86440383","c":"Senior","sc":"Senior","tl":"Libre","dn":"1993-11-24","s":"M","cm":false,"em":"vigneron.c@orange.fr","tel":"635459373"},{"n":"TARDIF","p":"Dylan","l":"86342555","c":"Senior","sc":"Senior","tl":"Libre","dn":"1998-11-09","s":"M","cm":false,"em":"dylantardif27@gmail.com","tel":"678902586"},{"n":"PERRAY","p":"Benjamin","l":"87061504","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-04-05","s":"M","cm":false,"em":"benjaminperray44@gmail.com","tel":"618458637"},{"n":"OLLIVAUX","p":"Jules","l":"86941691","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-03-30","s":"M","cm":false,"em":"julesollivaux@gmail.com","tel":"670551089"},{"n":"DAVY","p":"Corentin","l":"87368640","c":"Senior","sc":"Senior","tl":"Libre","dn":"2002-06-07","s":"M","cm":false,"em":"corentin.davy@yahoo.fr","tel":"623946352"},{"n":"MONNIER","p":"Owen","l":"87348919","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-09-04","s":"M","cm":false,"em":"owenmonnier@gmail.com","tel":"622487228"},{"n":"MARTELIER","p":"Kevin","l":"87061499","c":"Senior","sc":"Senior","tl":"Libre","dn":"1992-07-23","s":"M","cm":false,"em":"ploteau.julie@orange.fr","tel":"658368680"},{"n":"FOUCHET","p":"Nathan","l":"88440591","c":"Senior","sc":"Senior","tl":"Libre","dn":"1998-05-13","s":"M","cm":false,"em":"nathanfouchet@gmail.com","tel":"766527347"},{"n":"MAZOUE","p":"Antoine","l":"87254449","c":"Senior","sc":"Senior","tl":"Libre","dn":"1996-07-02","s":"M","cm":false,"em":"mazoueantoine@gmail.com","tel":"649297858"},{"n":"DUFOUR","p":"Killian","l":"86350901","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-06-24","s":"M","cm":true,"em":"killian.dufour44@gmail.com","tel":"772237534"},{"n":"DURAND","p":"Ewan","l":"88092442","c":"Senior","sc":"Senior","tl":"Libre","dn":"2005-09-05","s":"M","cm":false,"em":"ewandur9@gmail.com","tel":"699092472"},{"n":"BUSSON","p":"Kevin","l":"86682503","c":"Senior","sc":"Senior","tl":"Libre","dn":"2000-11-18","s":"M","cm":false,"em":"KEVIN.BUSSON.49@GMAIL.COM","tel":"695081251"},{"n":"AUDINEAU","p":"Lucien","l":"86456182","c":"Senior","sc":"Senior","tl":"Libre","dn":"1999-11-05","s":"M","cm":true,"em":"AUDINEAULUCIEN@GMAIL.COM","tel":"651695170"},{"n":"COIFFARD","p":"Yanis","l":"86350898","c":"Senior","sc":"Senior","tl":"Libre","dn":"1997-07-09","s":"M","cm":false,"em":"y.coiffard@laposte.net","tel":"750910076"},{"n":"MAHE","p":"Vivien","l":"86650282","c":"Senior","sc":"Senior","tl":"Libre","dn":"1991-07-20","s":"M","cm":false,"em":"vivien-mahe@live.fr","tel":"661645299"},{"n":"BRANCHEREAU","p":"Tia","l":"87210244","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2004-07-28","s":"F","cm":true,"em":"tia.branchereau04@gmail.com","tel":"783074755"},{"n":"VIVIER","p":"Melissa","l":"86457280","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1997-10-27","s":"F","cm":false,"em":"melvivier27@gmail.com","tel":"750493864"},{"n":"HAURAIX","p":"Emilie","l":"86941798","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1982-07-11","s":"F","cm":false,"em":"milou_3@hotmail.fr","tel":"679102247"},{"n":"GUILLAIN","p":"Oriane","l":"86341767","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1982-09-22","s":"F","cm":true,"em":"oriane_468@hotmail.com","tel":"622852329"},{"n":"BERTHIEU","p":"Anna","l":"87907508","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2005-10-19","s":"F","cm":false,"em":"AN.BERTHIEU@GMAIL.COM","tel":"695152449"},{"n":"HAIE","p":"Emeline","l":"87177552","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1993-08-30","s":"F","cm":false,"em":"haie.emeline1993@gmail.com","tel":"681599537"},{"n":"BU","p":"Justine","l":"86350606","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2005-05-15","s":"F","cm":false,"em":"justine05.bu@gmail.com","tel":"749070022"},{"n":"BAFFOU","p":"Eugenie","l":"86440237","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2005-05-11","s":"F","cm":false,"em":"eugeniebaffou11@gmail.com","tel":"643930030"},{"n":"BARDOT","p":"Laurene","l":"87156009","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1991-07-30","s":"F","cm":false,"em":"bardotlaurene@hotmail.fr","tel":"635574485"},{"n":"SEBILEAU","p":"Laura","l":"88492165","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2004-05-01","s":"F","cm":false,"em":"laura.sebileau@gmail.com","tel":"767843002"},{"n":"GUILLON","p":"Camille","l":"86343879","c":"Senior","sc":"Senior F","tl":"Libre","dn":"2005-08-13","s":"F","cm":false,"em":"cguillon1308@gmail.com","tel":"637966505"},{"n":"COURTIN","p":"Blandine","l":"86341693","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1986-08-05","s":"F","cm":false,"em":"blandine.courtin12@gmail.com","tel":"676764905"},{"n":"GILLET","p":"Flavie","l":"87868540","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1996-02-02","s":"F","cm":true,"em":"gilletflavie@gmail.com","tel":"666782379"},{"n":"VIVIER","p":"Lena","l":"86650338","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1994-12-10","s":"F","cm":false,"em":"lenavivier10@gmail.com","tel":"658695195"},{"n":"RIGAUD","p":"Charlotte","l":"86350909","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1996-04-15","s":"F","cm":false,"em":"charlotte.rigaud@hotmail.fr","tel":"786311387"},{"n":"CAILLER","p":"Mathilde","l":"86440056","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1991-01-28","s":"F","cm":false,"em":"caillermathilde@outlook.com","tel":"646371875"},{"n":"SOURICE","p":"Solenne","l":"87365210","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1987-06-03","s":"F","cm":false,"em":"tite-solenn@hotmail.fr","tel":"626520872"},{"n":"PLOTEAU","p":"Julie","l":"86440242","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1994-08-03","s":"F","cm":false,"em":"ploteau.julie@orange.fr","tel":"678285720"},{"n":"GUILLON","p":"Angelique","l":"86343909","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1978-08-11","s":"F","cm":true,"em":"herveguillon49@orange.fr","tel":"604459335"},{"n":"LOIRAT","p":"Sabrina","l":"86440386","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1994-05-31","s":"F","cm":false,"em":"SABRINA.LOIRAT@GMAIL.COM","tel":"680582811"},{"n":"SALLIOT","p":"Violette","l":"86324641","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1985-12-20","s":"F","cm":true,"em":"viosalliot@wanadoo.fr","tel":"643502423"},{"n":"GUYOT","p":"Lucile","l":"88366602","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1991-11-08","s":"F","cm":false,"em":"brachet.lucile@gmail.com","tel":"647355411"},{"n":"BRANCHEREAU","p":"Linda","l":"86324882","c":"Senior","sc":"Senior F","tl":"Libre","dn":"1984-12-19","s":"F","cm":true,"em":"linda_branchereau@hotmail.fr","tel":"673402035"},{"n":"GRISS BEMBE","p":"Thiama","l":"88463966","c":"Senior","sc":"Senior U20 (- 20 ans)","tl":"Libre","dn":"2006-04-13","s":"M","cm":false,"em":"thiamagb@gmail.com","tel":"782108991"},{"n":"CLEMENCEAU","p":"Marius","l":"86689638","c":"Senior","sc":"Senior U20 (- 20 ans)","tl":"Libre","dn":"2006-12-08","s":"M","cm":false,"em":"mariusclemenceau@gmail.com","tel":"670007889"},{"n":"LOISEAU","p":"Gabriel","l":"86324300","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-12-16","s":"M","cm":false,"em":"anouck.loiseau@gmail.com","tel":"621618084","em2":"anouck.loiseau@gmail.com","tel2":"621618084","rl":"loiseau Anouck"},{"n":"SYLVERE KRAEMER","p":"Loup","l":"86324088","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-04-03","s":"M","cm":false,"em":"benoit.sylvere@gmail.com","tel":"677281663","em2":"benoit.sylvere@gmail.com","tel2":"677281663","rl":"Sylvere Benoit"},{"n":"SOURICE","p":"Lubin","l":"86557379","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-05-19","s":"M","cm":false,"em":"charles-sous@hotmail.fr","tel":"615441336","em2":"charles-sous@hotmail.fr","tel2":"615441336","rl":"Sourice Charles"},{"n":"EDIN","p":"Hugo","l":"86324057","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-04-19","s":"M","cm":false,"em":"edin.nicolas@orange.fr","tel":"622711734","em2":"edin.nicolas@orange.fr","tel2":"622711734","rl":"Edin Nicolas"},{"n":"ALLICHE","p":"Alex","l":"86924606","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-11-30","s":"M","cm":false,"em":"BINA.AH26@YAHOO.FR","tel":"638111851","em2":"BINA.AH26@YAHOO.FR","tel2":"638111851","rl":"Alliche Madjid"},{"n":"VASYLIEV","p":"Gordei","l":"86324905","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-01-15","s":"M","cm":false,"em":"0708bcb@gmail.com","tel":"766239976","em2":"0708bcb@gmail.com","tel2":"766239976","rl":"Vasylieva Olga"},{"n":"ABOU ZEID","p":"Joud","l":"87906414","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-04-11","s":"M","cm":false,"em":"iman22032017@gmail.com","tel":"753483615","em2":"mohamad22032017@gmail.com","tel2":"605575079","rl":"Abou zeid Mohamad"},{"n":"GANDON","p":"Leon","l":"86819438","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-07-01","s":"M","cm":false,"em":"thomas49440@gmail.com","tel":"683988703","em2":"thomas49440@gmail.com","tel2":"683988703","rl":"Gandon Thomas"},{"n":"TRICOCHE","p":"Anatole","l":"87553871","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-05-15","s":"M","cm":false,"em":"benoit.tricoche@laposte.net","tel":"678968686","em2":"benoit.tricoche@laposte.net","tel2":"678968686","rl":"Tricoche Benoit"},{"n":"HODE","p":"Mathis","l":"86324865","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-02-26","s":"M","cm":false,"em":"julie.seignoux@orange.fr","tel":"687151489","em2":"julie.seignoux@orange.fr","tel2":"687151489","rl":"Seignoux Julie"},{"n":"ROUEZ","p":"Gabriel","l":"86423697","c":"U9-U10","sc":"U10 (- 10 ans)","tl":"Libre","dn":"2016-07-07","s":"M","cm":false,"em":"aurelien.rouez@gmail.com","tel":"668034674","em2":"aurelien.rouez@gmail.com","tel2":"668034674","rl":"Rouez Aurélien"},{"n":"BERNARD","p":"Salome","l":"86324769","c":"U9-U10","sc":"U10 F (- 10 ans F)","tl":"Libre","dn":"2016-03-29","s":"F","cm":false,"em":"linda_branchereau@hotmail.fr","tel":"621046601","em2":"linda_branchereau@hotmail.fr","tel2":"621046601","rl":"Bernard Pierre"},{"n":"GALLARD","p":"Zoe","l":"86324129","c":"U9-U10","sc":"U10 F (- 10 ans F)","tl":"Libre","dn":"2016-05-11","s":"F","cm":false,"em":"manugallard2@gmail.com","tel":"659481374","em2":"manugallard2@gmail.com","tel2":"659481374","rl":"Gallard Emmanuel"},{"n":"LAI","p":"Sidonie","l":"86475010","c":"U9-U10","sc":"U10 F (- 10 ans F)","tl":"Libre","dn":"2016-03-26","s":"F","cm":false,"em":"cbressin@yahoo.fr","tel":"660146115","em2":"cbressin@yahoo.fr","tel2":"660146115","rl":"Bressin Chloé"},{"n":"ANTHIER ROYEAU","p":"Malona","l":"87868445","c":"U9-U10","sc":"U10 F (- 10 ans F)","tl":"Libre","dn":"2016-05-25","s":"F","cm":false,"em":"jeromeanthier@gmail.com","tel":"763164574","em2":"jeromeanthier@gmail.com","tel2":"763164574","rl":"Royeau Flora"},{"n":"VOISIN","p":"Paul","l":"86527838","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-12-03","s":"M","cm":false,"em":"elsa.gasnier@free.fr","tel":"685119734","em2":"elsa.gasnier@free.fr","tel2":"685119734","rl":"Voisin Erwan"},{"n":"BERTHELOT","p":"Raphael","l":"86324708","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-09-24","s":"M","cm":false,"em":"rodolpheberthelot@hotmail.fr","tel":"613733812","em2":"guenolenerobin@gmail.com","tel2":"613733812","rl":"Guénolène Robin"},{"n":"DRENEAU","p":"Arsene","l":"86924617","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-12-29","s":"M","cm":false,"em":"siengadeline@gmail.com","tel":"661402791","em2":"siengadeline@gmail.com","tel2":"661402791","rl":"DRENEAU Alexandre"},{"n":"CHAMTOURI","p":"Iyed","l":"86324884","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-02-18","s":"M","cm":false,"em":"chamtouri.eline@gmail.com","tel":"780312453","em2":"chamtouri.eline@gmail.com","tel2":"780312453","rl":"chamtouri Hanene"},{"n":"BRUNET HENNEBERT","p":"Sacha","l":"86527885","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-08-27","s":"M","cm":false,"em":"famille.brunet.hennebert@gmail.com","tel":"615760864","em2":"famille.brunet.hennebert@gmail.com","tel2":"615760864","rl":"BRUNET Yannick"},{"n":"FIX","p":"Antonin","l":"86440222","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-04-19","s":"M","cm":false,"em":"nicolas.fix44@free.fr","tel":"626871135","em2":"nicolas.fix44@free.fr","tel2":"626871135","rl":"FIX Nicolas"},{"n":"AHMAD LAHBIB","p":"Ahmad Deida","l":"87907294","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-01-14","s":"M","cm":false,"em":"raguibsoukaina8@gmail.com","tel":"758788292","em2":"raguibsoukaina8@gmail.com","tel2":"758788292","rl":"Raguib Soukaina"},{"n":"SARDAIN","p":"Ian","l":"88017638","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-06-03","s":"M","cm":false,"em":"brice.sardain@gmail.com","tel":"767864786","em2":"brice.sardain@gmail.com","tel2":"767864786","rl":"Sardain Brice"},{"n":"BOUVIER","p":"Clement","l":"88537080","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-03-03","s":"M","cm":false,"em":"katie.bernard@yahoo.fr","tel":"622041719","em2":"katie.bernard@yahoo.fr","tel2":"622041719","rl":"BERNARD Katie"},{"n":"DERRIEN","p":"Dan","l":"87968611","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-10-15","s":"M","cm":false,"em":"marine.dubreuil@yahoo.fr","tel":"650296243","em2":"marine.dubreuil@yahoo.fr","tel2":"650296243","rl":"DUBREUIL Marine"},{"n":"MAHE","p":"Gabriel","l":"86324102","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-03-04","s":"M","cm":false,"em":"bonnardsop@yahoo.fr","tel":"684997546","em2":"bonnardsop@yahoo.fr","tel2":"684997546","rl":"MAHE Cédric"},{"n":"LEPETIT","p":"Bastien","l":"86324618","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-09-30","s":"M","cm":false,"em":"jouanludivine@orange.fr","tel":"674734585","em2":"jouanludivine@orange.fr","tel2":"674734585","rl":"Lepetit Ludivine"},{"n":"ACHI","p":"Willaine","l":"87637207","c":"U11-U12","sc":"U11 (- 11 ans)","tl":"Libre","dn":"2015-01-28","s":"M","cm":false,"em":"murielle.chintoh@icloud.com","tel":"668888202","em2":"murielle.chintoh@icloud.com","tel2":"668888202","rl":"Chintoh Murielle"},{"n":"BRUN","p":"Maïa","l":"86324288","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-11-26","s":"F","cm":false,"em":"wilfried.brun@free.fr","tel":"623078330","em2":"wilfried.brun@free.fr","tel2":"623078330","rl":"Brun Celine"},{"n":"BRUN","p":"Eloise","l":"86324285","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-11-26","s":"F","cm":false,"em":"wilfried.brun@free.fr","tel":"623078330","em2":"wilfried.brun@free.fr","tel2":"623078330","rl":"Brun Wilfried"},{"n":"LAUNAY","p":"Salome","l":"86324227","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-01-31","s":"F","cm":false,"em":"launay-nicolas@hotmail.fr","tel":"603445837","em2":"launay-nicolas@hotmail.fr","tel2":"603445837","rl":"launay Nicolas"},{"n":"OUSSAYEH","p":"Inesse","l":"86557359","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-10-22","s":"F","cm":false,"em":"wino.abder@hotmail.fr","tel":"613724892","em2":"wino.abder@hotmail.fr","tel2":"613724892","rl":"OUSSAYEH Abderrahman"},{"n":"BOUVET","p":"Suzye","l":"87998634","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-12-30","s":"F","cm":false,"em":"lafamillebouvet@gmail.com","tel":"625673269","em2":"lafamillebouvet@gmail.com","tel2":"625673269","rl":"Bouvet  Wilfrid"},{"n":"CAMUS VAN WONTERGHEM","p":"Tess","l":"87061489","c":"U11-U12","sc":"U11 F (- 11 ans F)","tl":"Libre","dn":"2015-08-26","s":"F","cm":false,"em":"marion.vwtg@gmail.com","tel":"683261908","em2":"marion.vwtg@gmail.com","tel2":"683261908","rl":"Van Wonterghem  Marion"},{"n":"LE ROUX","p":"Tiego","l":"87390396","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-09-13","s":"M","cm":false,"em":"einahpets44000@hotmail.fr","tel":"670812077","em2":"einahpets44000@hotmail.fr","tel2":"670812077","rl":"LE ROUX Olivier"},{"n":"OUAHBI","p":"Hamza","l":"86924603","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-03-13","s":"M","cm":false,"em":"ouahbi.momo68@hotmail.fr","tel":"634787102","em2":"ouahbi.momo68@hotmail.fr","tel2":"634787102","rl":"ouahbi Mohamed"},{"n":"AL OUWEISH","p":"Mohammed","l":"86440208","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-01-22","s":"M","cm":false,"em":"tarek13020@gmail.com","tel":"753222549","em2":"tarek13020@gmail.com","tel2":"753222549","rl":"AL OUWEISH Tarek"},{"n":"DIABATE","p":"Erik","l":"87254657","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-06-26","s":"M","cm":false,"em":"dapherik2@gmail.com","tel":"667271421","em2":"dapherik2@gmail.com","tel2":"667271421","rl":"Soulabail Daphnee"},{"n":"PINTEAN","p":"David Rafael","l":"86419574","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-10-07","s":"M","cm":false,"em":"mary_bilt@yahoo.com","tel":"660569767","em2":"mary_bilt@yahoo.com","tel2":"660569767","rl":"Pintean Maria"},{"n":"MARTIN","p":"Manoe","l":"86440172","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-05-20","s":"M","cm":false,"em":"labes.martin@orange.fr","tel":"632833733","em2":"labes.martin@orange.fr","tel2":"632833733","rl":"MARTIN Charlotte"},{"n":"SYLVERE KRAEMER","p":"Axel","l":"86591519","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-01-31","s":"M","cm":false,"em":"benoit.sylvere@gmail.com","tel":"677281663","em2":"benoit.sylvere@gmail.com","tel2":"677281663","rl":"Sylvere Benoit"},{"n":"GUEZO","p":"Mathis","l":"88032069","c":"U11-U12","sc":"U12 (- 12 ans)","tl":"Libre","dn":"2014-03-16","s":"M","cm":false,"em":"semmar.ghiz@gmail.com","tel":"674682146","em2":"gaelguezo@hotmail.com","tel2":"674682146","rl":"Guezo Gael"},{"n":"EL AARAIBI BAILLAL","p":"Ossama","l":"88078781","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-01-20","s":"M","cm":false,"em":"llaaroussidaoud@gmail.com","tel":"758583426","em2":"llaaroussidaoud@gmail.com","tel2":"758583426","rl":"El Aaraibi Daoud Laroussi"},{"n":"GUICHARD","p":"Mateo","l":"86324400","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-10-30","s":"M","cm":false,"em":"leslie.aubert44@laposte.net","tel":"663380446","em2":"anthony.guichard44@laposte.net","tel2":"663380446","rl":"GUICHARD Anthony"},{"n":"DALLOUL","p":"Antoine","l":"86324348","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-03-31","s":"M","cm":false,"em":"moriceva@hotmail.fr","tel":"689288782","em2":"dalloul.remi@orange.fr","tel2":"672763893","rl":"DALLOUL Rémi"},{"n":"LAUNAY","p":"Lou","l":"87061535","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-01-14","s":"M","cm":false,"em":"glaunay44@gmail.com","tel":"627430267","em2":"glaunay44@gmail.com","tel2":"627430267","rl":"LAUNAY Gaetan"},{"n":"JOLIVEL","p":"Simon","l":"87637227","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-09-02","s":"M","cm":false,"em":"ms.margaret.saraiva@gmail.com","tel":"662684875","em2":"ms.margaret.saraiva@gmail.com","tel2":"662684875","rl":"SARAIVA Margaret"},{"n":"META","p":"Leon","l":"87365273","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-04-07","s":"M","cm":false,"em":"mattetsoline@gmail.com","tel":"611913107","em2":"mattetsoline@gmail.com","tel2":"611913107","rl":"meta Muhamet"},{"n":"MORTIER","p":"William","l":"86324252","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-03-11","s":"M","cm":false,"em":"aa.mortier@yahoo.fr","tel":"667174760","em2":"aa.mortier@yahoo.fr","tel2":"667174760","rl":"Mortier Anthony"},{"n":"CHAUVIN","p":"Lenny","l":"87868553","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-03-21","s":"M","cm":false,"em":"mguyard186@outlook.fr","tel":"624524025","em2":"mguyard186@outlook.fr","tel2":"624524025","rl":"Guyard Marie Laure"},{"n":"JOLIVEL","p":"Arthur","l":"86475005","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-09-02","s":"M","cm":false,"em":"ms.margaret.saraiva@gmail.com","tel":"662684875","em2":"ms.margaret.saraiva@gmail.com","tel2":"662684875","rl":"SARAIVA Margaret"},{"n":"ROUSSEAU","p":"Nohan","l":"88178110","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-12-06","s":"M","cm":false,"em":"tonydu44340@gmail.com","tel":"662156947","em2":"tonydu44@msn.com","tel2":"662156947","rl":"Rousseau Tony"},{"n":"JUTON","p":"Helias","l":"87365183","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-05-29","s":"M","cm":false,"em":"amithiam@live.fr","tel":"681812058","em2":"amithiam@live.fr","tel2":"681812058","rl":"Juton Aminata"},{"n":"BINESSE","p":"Yoni","l":"86341786","c":"U13-U14","sc":"U13 (- 13 ans)","tl":"Libre","dn":"2013-07-12","s":"M","cm":false,"em":"oriane_468@hotmail.com","tel":"622852329","em2":"oriane_468@hotmail.com","tel2":"622852329","rl":"Guillain Oriane"},{"n":"AIT CHAOU","p":"Ichou","l":"86324901","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-10-14","s":"M","cm":false,"em":"malinyun@yahoo.fr","tel":"616117327","em2":"aaitchaou@yahoo.fr","tel2":"616117327","rl":"AIT CHAOU Abdelouahed"},{"n":"LORIER","p":"Titouan","l":"86324414","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-02-23","s":"M","cm":false,"em":"laetmanu@hotmail.fr","tel":"603352307","em2":"laetmanu@hotmail.fr","tel2":"603352307","rl":"LORIER Laëtitia"},{"n":"GRIAUD","p":"Mewen","l":"86819396","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-08-01","s":"M","cm":false,"em":"mathilde.griaud@iadfrance.fr","tel":"689622737","em2":"thildam@hotmail.fr","tel2":"689622737","rl":"Griaud Olivier"},{"n":"ROBERT","p":"Ethan","l":"86557230","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-04-12","s":"M","cm":false,"em":"samadethan@gmail.com","tel":"671523754","em2":"samadethan@gmail.com","tel2":"671523754","rl":"Robert Samuel"},{"n":"RENIER","p":"Thomas","l":"86324848","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-01-05","s":"M","cm":false,"em":"laurence.jet@free.fr","tel":"681311532","em2":"laurence.jet@free.fr","tel2":"681311532","rl":"Renier Jérôme"},{"n":"BERNARD","p":"Titouan","l":"86324771","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-04-09","s":"M","cm":false,"em":"linda_branchereau@hotmail.fr","tel":"673402035","em2":"linda_branchereau@hotmail.fr","tel2":"673402035","rl":"BERNARD Linda"},{"n":"LAINE","p":"Marcelin","l":"86324652","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-07-10","s":"M","cm":false,"em":"viosalliot@wanadoo.fr","tel":"643502422","em2":"viosalliot@wanadoo.fr","tel2":"643502422","rl":"salliot Violette"},{"n":"DOIZON BARBIER","p":"Gonzague","l":"86650213","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-09-11","s":"M","cm":false,"em":"fanydlajardiere@hotmail.com","tel":"675666926","em2":"fanydlajardiere@hotmail.com","tel2":"675666926","rl":"Doizon Barbier Stéphanie"},{"n":"BLIN","p":"Kyllian","l":"86350882","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-06-07","s":"M","cm":false,"em":"blinmblanv@orange.fr","tel":"672477641","em2":"blinmblanv@orange.fr","tel2":"672477641","rl":"BLIN Mickael"},{"n":"HERSANT","p":"Tom","l":"86419492","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-12-13","s":"M","cm":false,"em":"thierry.r100@free.fr","tel":"649338783","em2":"aliouv28@gmail.com","tel2":"649338783","rl":"OUVRARD Aline"},{"n":"DANAIS","p":"Mael","l":"86885656","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-01-30","s":"M","cm":false,"em":"geoffreydanais@gmail.com","tel":"698764479","em2":"geoffreydanais@gmail.com","tel2":"698764479","rl":"Bouteiller Julie"},{"n":"ROUSSEAU","p":"Luan","l":"86421718","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-08-07","s":"M","cm":false,"em":"galya.rousseau@gmail.com","tel":"771833329","em2":"olivier.rousseau.b@gmail.com","tel2":"771849491","rl":"Rousseau Olivier"},{"n":"DIABATE","p":"Alexandre","l":"87254646","c":"U13-U14","sc":"U14 (- 14 ans)","tl":"Libre","dn":"2012-08-16","s":"M","cm":false,"em":"dapherik2@gmail.com","tel":"667271421","em2":"dapherik2@gmail.com","tel2":"667271421","rl":"Soulabail Daphnee"},{"n":"NOEL","p":"Arthur","l":"86483603","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-08-12","s":"M","cm":false,"em":"noel_jero@yahoo.fr","tel":"787068723","em2":"noel_jero@yahoo.fr","tel2":"787068723","rl":"NOEL Jerome"},{"n":"CUSSONNEAU","p":"Clovis","l":"86591500","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-09-23","s":"M","cm":false,"em":"VCUSSONNEAU@WANADOO.FR","tel":"686452760","em2":"vcussonneau@wanadoo.fr","tel2":"686452760","rl":"Cussonneau Vincent"},{"n":"MURAIL","p":"Adem","l":"86324273","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-11-27","s":"M","cm":false,"em":"eoletzgo@hotmail.fr","tel":"651614560","em2":"eoletzgo@hotmail.fr","tel2":"651614560","rl":"Murail Matthieu"},{"n":"BARANGER","p":"Axel","l":"87254598","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-01-28","s":"M","cm":false,"em":"sobaranger29@yahoo.com","tel":"682324039","em2":"sobaranger29@yahoo.com","tel2":"682324039","rl":"BARANGER Solenne"},{"n":"GOUEVY","p":"Gabriel","l":"86457042","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-03-31","s":"M","cm":false,"em":"COTTINEAU.DAVID@GMAIL.COM","tel":"699445742","em2":"guignonaurelie@yahoo.fr","tel2":"699445742","rl":"Guignon Aurelie"},{"n":"AIT CHAOU","p":"Ayour","l":"86775100","c":"U15-U16","sc":"U15 (- 15 ans)","tl":"Libre","dn":"2011-05-29","s":"M","cm":false,"em":"MALINYUN@YAHOO.FR","tel":"616117327","em2":"aaitchaou@yahoo.fr","tel2":"616117327","rl":"AIT CHAOU Abdelouahed"},{"n":"ROUEZ","p":"Clement","l":"86342276","c":"U15-U16","sc":"U16 (- 16 ans)","tl":"Libre","dn":"2010-02-16","s":"M","cm":false,"em":"aurelien.rouez@gmail.com","tel":"668034674","em2":"aurelien.rouez@gmail.com","tel2":"668034674","rl":"Aurélien Rouez"},{"n":"ARRONDEL","p":"Martin","l":"86483614","c":"U17-U18","sc":"U17 (- 17 ans)","tl":"Libre","dn":"2009-01-03","s":"M","cm":false,"em":"martin.arrondel@gmail.com","tel":"678728922","em2":"o.arrondel@gmail.com","tel2":"678728922","rl":"ARRONDEL Olivier"},{"n":"BU","p":"Pierre","l":"86343869","c":"U17-U18","sc":"U18 (- 18 ans)","tl":"Libre","dn":"2008-07-02","s":"M","cm":false,"em":"pierre08.bu@gmail.com","tel":"636099986"},{"n":"GOUBAUD","p":"Gabriel","l":"86527909","c":"U17-U18","sc":"U18 (- 18 ans)","tl":"Libre","dn":"2008-06-06","s":"M","cm":false,"em":"gabriel.goubaud@gmail.com","tel":"776358506"},{"n":"ROUSSEAU","p":"Alessio","l":"86421726","c":"U17-U18","sc":"U18 (- 18 ans)","tl":"Libre","dn":"2008-02-20","s":"M","cm":true,"em":"galya.rousseau@gmail.com","tel":"771833329"},{"n":"CHEMINAND","p":"Lalie","l":"87061516","c":"Senior","sc":"U19 F (- 19 ans F)","tl":"Libre","dn":"2007-06-05","s":"F","cm":false,"em":"cheminandgael@gmail.com","tel":"787180526"},{"n":"ASMANI","p":"Sacha","l":"88446183","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-12-06","s":"M","cm":false,"em":"yann.leon974@hotmail.fr","tel":"646623419","em2":"yann.leon974@hotmail.fr","tel2":"646623419","rl":"Asmani Yannick"},{"n":"GUYOT BRACHET","p":"Jules","l":"86440297","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-03-07","s":"M","cm":false,"em":"damien.guyot@outlook.fr","tel":"770254613","em2":"damien.guyot@outlook.fr","tel2":"770254613","rl":"guyot Damien"},{"n":"BELLANGER","p":"Milan","l":"87061513","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-02-20","s":"M","cm":false,"em":"kevin-bellanger@hotmail.fr","tel":"664734095","em2":"kevin-bellanger@hotmail.fr","tel2":"664734095","rl":"Bellanger  Kevin"},{"n":"EDIN","p":"Timeo","l":"86324053","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-04-07","s":"M","cm":false,"em":"edin.nicolas@orange.fr","tel":"675254185","em2":"as.edin@orange.fr","tel2":"675254185","rl":"EDIN Anne-Sophie"},{"n":"LE LOUS","p":"Gabriel","l":"88535931","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-06-06","s":"M","cm":false,"em":"ludo0309@live.fr","tel":"664517891","em2":"ludo0309@live.fr","tel2":"664517891","rl":"LE LOUS Ludovic"},{"n":"BERTHELOT","p":"Armand","l":"88365739","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-11-12","s":"M","cm":false,"em":"rodolpheberthelot@hotmail.fr","tel":"629386219","em2":"rodolpheberthelot@hotmail.fr","tel2":"629386219","rl":"Berthelot Rodolphe"},{"n":"SALAK R'KOUNI","p":"Mohamed","l":"88520209","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-12-08","s":"M","cm":false,"em":"hodasmara16@gmail.com","tel":"666836132","em2":"hodasmara16@gmail.com","tel2":"666836132","rl":"Rkouni Hoda"},{"n":"ARFI","p":"Naïm","l":"88037968","c":"U5-U6","sc":"U6 (- 6 ans)","tl":"Libre","dn":"2020-07-26","s":"M","cm":false,"em":"tit-bigou@hotmail.fr","tel":"677472301","em2":"tit-bigou@hotmail.fr","tel2":"677472301","rl":"Zerren Marianne"},{"n":"BOTREAU","p":"Marc","l":"86941711","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-01-07","s":"M","cm":false,"em":"anthony.botreau@orange.fr","tel":"615780637","em2":"anthony.botreau@orange.fr","tel2":"615780637","rl":"Botreau Anthony"},{"n":"GANDON","p":"Luce","l":"86819432","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-03-25","s":"M","cm":false,"em":"thomas49440@gmail.com","tel":"683988703","em2":"thomas49440@gmail.com","tel2":"683988703","rl":"Gandon Thomas"},{"n":"STERCKEMAN","p":"Pierre","l":"88037974","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-07-25","s":"M","cm":false,"em":"sterckeman_mathieu@yahoo.fr","tel":"672020086","em2":"sterckeman_mathieu@yahoo.fr","tel2":"672020086","rl":"Sterckeman Mathieu"},{"n":"LAMARQUE","p":"Noah","l":"88251129","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-10-09","s":"M","cm":false,"em":"marine.goy.pro@hotmail.fr","tel":"685778203","em2":"marine.goy.pro@hotmail.fr","tel2":"685778203","rl":"GOY Marine"},{"n":"CARRET","p":"Mael","l":"86924595","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-12-08","s":"M","cm":false,"em":"gwenael.carret@hotmail.fr","tel":"673768809","em2":"gwenael.carret@hotmail.fr","tel2":"673768809","rl":"CARRET Gwenael"},{"n":"LUSSEAU","p":"Samuel","l":"86324314","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-07-19","s":"M","cm":false,"em":"elie.lusseau@gmail.com","tel":"665604055","em2":"elie.lusseau@gmail.com","tel2":"665604055","rl":"LUSSEAU Elie"},{"n":"GREAU","p":"Louis","l":"87365244","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-02-02","s":"M","cm":false,"em":"piaucaroline94@gmail.com","tel":"686406211","em2":"piaucaroline94@gmail.com","tel2":"686406211","rl":"Gréau  Thomas"},{"n":"GALLARD","p":"Abel","l":"86324128","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-09-27","s":"M","cm":false,"em":"manugallard2@gmail.com","tel":"659481374","em2":"manugallard2@gmail.com","tel2":"659481374","rl":"Gallard Emmanuel"},{"n":"LE SOMMER","p":"Ewenn","l":"86457122","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-06-29","s":"M","cm":false,"em":"thomas.lesommer@sdis44.fr","tel":"676036315","em2":"thomas.lesommer@sdis44.fr","tel2":"676036315","rl":"LE SOMMER Thomas"},{"n":"GODICHEAU POITEVIN","p":"Mahe","l":"87868571","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-04-02","s":"M","cm":false,"em":"GODICHEAU.ANTHONY@GMAIL.COM","tel":"781072103","em2":"GODICHEAU.ANTHONY@GMAIL.COM","tel2":"781072103","rl":"GODICHEAU  Anthony"},{"n":"PINTEAN","p":"Simion","l":"86419582","c":"U7-U8","sc":"U7 (- 7 ans)","tl":"Libre","dn":"2019-01-30","s":"M","cm":false,"em":"mary_bilt@yahoo.com","tel":"660569767","em2":"mary_bilt@yahoo.com","tel2":"660569767","rl":"pintean Maria"},{"n":"BATARDIERE","p":"Maïwenn","l":"87177627","c":"U7-U8","sc":"U7 F (- 7 ans F)","tl":"Libre","dn":"2019-12-15","s":"F","cm":false,"em":"DYLANWINDOWS@HOTMAIL.FR","tel":"648976118","em2":"DYLANWINDOWS@HOTMAIL.FR","tel2":"648976118","rl":"BATARDIERE Dylan"},{"n":"BERIAT","p":"Wassim","l":"86819498","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-12-13","s":"M","cm":false,"em":"B.LAHCEN@YMAIL.COM","tel":"761140433","em2":"B.LAHCEN@YMAIL.COM","tel2":"761140433","rl":"Beriat Lahcen"},{"n":"BERIAT","p":"Walid","l":"86819504","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-12-13","s":"M","cm":false,"em":"B.LAHCEN@YMAIL.COM","tel":"761140433","em2":"B.LAHCEN@YMAIL.COM","tel2":"761140433","rl":"Beriat Lahcen"},{"n":"MATETE MPALA","p":"Aderson Pierre","l":"88354557","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-04-07","s":"M","cm":false,"em":"lebreche2001@yahoo.fr","tel":"611416198","em2":"lebreche2001@yahoo.fr","tel2":"611416198","rl":"MATETE NKOKOLO Lebreche"},{"n":"DRAPEAU","p":"Mathis","l":"87553805","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-08-24","s":"M","cm":false,"em":"drapeau.frederick@gmail.com","tel":"651096879","em2":"drapeau.frederick@gmail.com","tel2":"651096879","rl":"DRAPEAU Frederick"},{"n":"EL ASRI","p":"Wissam","l":"88512885","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-08-08","s":"M","cm":false,"em":"lotfi.elasri@gmail.com","tel":"604184044","em2":"lotfi.elasri@gmail.com","tel2":"604184044","rl":"el asri Lotfi"},{"n":"OUSSAYEH","p":"Yamen","l":"86557362","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-06-30","s":"M","cm":false,"em":"wino.abder@hotmail.fr","tel":"613724892","em2":"wino.abder@hotmail.fr","tel2":"613724892","rl":"OUSSAYEH Abderrahman"},{"n":"DELANGHE","p":"Leon","l":"87968571","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-12-08","s":"M","cm":false,"em":"mikael.delanghe@laposte.net","tel":"679936459","em2":"noemie.cadot@laposte.net","tel2":"675090094","rl":"CADOT Noémie"},{"n":"GENE ALPHONSE","p":"Mattia","l":"86440390","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-10-28","s":"M","cm":false,"em":"genealphonse@hotmail.fr","tel":"660802035","em2":"genealphonse@hotmail.fr","tel2":"660802035","rl":"Gene Alphonse Roger"},{"n":"EL ASRI","p":"Wissam","l":"88512885","c":"U7-U8","sc":"U8 (- 8 ans)","tl":"Libre","dn":"2018-08-08","s":"M","cm":false,"em":"lotfi.elasri@gmail.com","tel":"604184044","em2":"lotfi.elasri@gmail.com","tel2":"604184044","rl":"el asri Lotfi"},{"n":"ARRONDEL","p":"Romy","l":"88082583","c":"U7-U8","sc":"U8 F (- 8 ans F)","tl":"Libre","dn":"2018-05-24","s":"F","cm":false,"em":"maxarrondel@hotmail.com","tel":"685613534","em2":"maxarrondel@hotmail.com","tel2":"685613534","rl":"Arrondel Maxime"},{"n":"GHANAY","p":"Youssef","l":"88112877","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-04-08","s":"M","cm":false,"em":"ghanaybilel@gmail.com","tel":"649557883","em2":"ghanaybilel@gmail.com","tel2":"649557883","rl":"Ghanay Bilel"},{"n":"MAGRE","p":"Noham","l":"86324360","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-10-15","s":"M","cm":false,"em":"laptitciya@hotmail.fr","tel":"761599010","em2":"laptitciya@hotmail.fr","tel2":"761599010","rl":"Magré Sébastien"},{"n":"LEVESQUE","p":"Julien Amir","l":"86819489","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-06-02","s":"M","cm":false,"em":"elhassania.aithaddo@gmail.com","tel":"787373961","em2":"elhassania.aithaddo@gmail.com","tel2":"787373961","rl":"LEVESQUE El Hassania"},{"n":"MURAIL","p":"Noa","l":"87365231","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-04-30","s":"M","cm":false,"em":"eoletzgo@hotmail.fr","tel":"651614560","em2":"eoletzgo@hotmail.fr","tel2":"651614560","rl":"Murail Matthieu"},{"n":"GUYOT BRACHET","p":"Louis","l":"86324157","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-02-22","s":"M","cm":false,"em":"brachet.lucile@gmail.com","tel":"647355411","em2":"brachet.lucile@gmail.com","tel2":"647355411","rl":"Guyot Lucile"},{"n":"GONTIER","p":"Julien","l":"86504309","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-11-19","s":"M","cm":false,"em":"francois.gontier@gmail.com","tel":"786424219","em2":"francois.gontier@gmail.com","tel2":"786424219","rl":"GONTIER François"},{"n":"EDELIN","p":"Timothe","l":"87177625","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-10-04","s":"M","cm":false,"em":"GSTEPH44@GMAIL.COM","tel":"662438245","em2":"GSTEPH44@GMAIL.COM","tel2":"662438245","rl":"EDELIN Stéphanie"},{"n":"MARTELIER","p":"Layvin","l":"86440259","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-06-14","s":"M","cm":false,"em":"ploteau.julie@orange.fr","tel":"678285720","em2":"ploteau.julie@orange.fr","tel2":"658368680","rl":"Ploteau Julie"},{"n":"COTTIER","p":"Louis","l":"86440433","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-05-08","s":"M","cm":false,"em":"timothee.cottier@gmail.com","tel":"673659595","em2":"timothee.cottier@gmail.com","tel2":"673659595","rl":"Cottier Timothée"},{"n":"DELAUNAY","p":"Justin","l":"86343095","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-03-09","s":"M","cm":false,"em":"vincent.delaunay19@gmail.com","tel":"757177212","em2":"vincent.delaunay19@gmail.com","tel2":"757177212","rl":"DELAUNAY Vincent"},{"n":"BEKHAT","p":"Enzo","l":"87365162","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-05-03","s":"M","cm":false,"em":"HORIZZON@HOTMAIL.FR","tel":"651944506","em2":"HORIZZON@HOTMAIL.FR","tel2":"651944506","rl":"Bekhat Myriam"},{"n":"SAMSON","p":"Eliott","l":"86324470","c":"U9-U10","sc":"U9 (- 9 ans)","tl":"Libre","dn":"2017-10-07","s":"M","cm":false,"em":"yoyosamson@hotmail.fr","tel":"687060555","em2":"yoyosamson@hotmail.fr","tel2":"687060555","rl":"Samson Yohan"},{"n":"TRAORE","p":"Alice","l":"87254620","c":"U9-U10","sc":"U9 F (- 9 ans F)","tl":"Libre","dn":"2017-08-10","s":"F","cm":false,"em":"abelien2006@yahoo.fr","tel":"668658102","em2":"abelien2006@yahoo.fr","tel2":"668658102","rl":"TRAORE Abel"},{"n":"LBSSIR","p":"Marwa","l":"87916071","c":"U9-U10","sc":"U9 F (- 9 ans F)","tl":"Libre","dn":"2017-05-14","s":"F","cm":false,"em":"khadijalbssir8@gmail.com","tel":"751352704","em2":"khadijalbssir8@gmail.com","tel2":"751352704","rl":"Lbssir Chyahou Khadija"},{"n":"BERNARD","p":"Pierre","l":"87061510","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1984-08-03","s":"M","cm":false,"em":"pierre--bernard@hotmail.fr","tel":"621046601"},{"n":"RIGAUD","p":"Patrice","l":"87637673","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1964-04-09","s":"M","cm":false,"em":"patrice.rigaud64@orange.fr","tel":"620297764"},{"n":"CHARRIER","p":"Michel","l":"87714891","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1959-12-25","s":"M","cm":false,"em":"charriermichel1675@orange.fr","tel":"631513581"},{"n":"DENAIRE","p":"David","l":"87920652","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1990-11-11","s":"M","cm":false,"em":"denaire.david@laposte.net","tel":"678899112"},{"n":"DOUET","p":"Guillaume","l":"86924605","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1989-10-21","s":"M","cm":false,"em":"SACHARINE49@GMAIL.COM","tel":"621948499"},{"n":"SOURICE","p":"Charles","l":"87118086","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1986-04-21","s":"M","cm":false,"em":"charles-sous@hotmail.fr","tel":"0630078020"},{"n":"ARRONDEL","p":"Maxime","l":"86442430","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1985-09-21","s":"M","cm":false,"em":"maxarrondel@hotmail.com","tel":"685613534"},{"n":"GUILLON","p":"Herve","l":"86324935","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1978-08-05","s":"M","cm":false,"em":"herveguillon49@orange.fr","tel":"617154095"},{"n":"PASQUIER","p":"Manuel","l":"87156096","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1990-04-25","s":"M","cm":false,"em":"manuel.pasquier@hotmail.fr","tel":"648074953"},{"n":"BLAYO","p":"Sebastien","l":"88032077","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1978-04-25","s":"M","cm":false,"em":"julie.prevost04@gmail.com","tel":"785466751"},{"n":"BOURGEAIS","p":"Sylvain","l":"86504260","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1986-03-13","s":"M","cm":false,"em":"SYL.BOURGEAIS@GMAIL.COM","tel":"633057001"},{"n":"MARTIN","p":"Gael","l":"86324521","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1980-05-08","s":"M","cm":false,"em":"labes.martin@orange.fr","tel":"686689509"},{"n":"DUCHANGE","p":"Francois","l":"86819427","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1984-08-19","s":"M","cm":false,"em":"francois.nolwenn@laposte.net","tel":"633468696"},{"n":"META","p":"Muhamet","l":"86890758","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1988-01-31","s":"M","cm":false,"em":"meta31@hotmail.co.uk","tel":"611913107"},{"n":"HENRY","p":"Tristan","l":"88422550","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1974-08-13","s":"M","cm":true,"em":"tristanry13@gmail.com","tel":"684152739"},{"n":"LEMESLE","p":"Christopher","l":"86440120","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1984-10-05","s":"M","cm":false,"em":"leptichris@hotmail.fr","tel":"671236163"},{"n":"BIZEUL","p":"Jerome","l":"87254567","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1975-12-25","s":"M","cm":false,"em":"jeromebizeul@free.fr","tel":"638649333"},{"n":"AILLERIE","p":"Jocelyn","l":"87390603","c":"Vétéran","sc":"Vétéran","tl":"Libre","dn":"1972-03-17","s":"M","cm":false,"em":"joaille@club-internet.fr","tel":"668494480"}]

const F0 = {typeLicence:"",numLicenceFFF:"",nom:"",prenom:"",dateNaissance:"",sexe:"",lieuNaissance:"",nationalite:"",nationaliteAutre:"",adresse:"",codePostal:"",ville:"",email:"",telephone:"",categorie:"",poste:"",ancienClub:"",resp1Nom:"",resp1Prenom:"",resp1Lien:"",resp1Tel:"",resp1Email:"",resp2Nom:"",resp2Prenom:"",resp2Lien:"",resp2Tel:"",resp2Email:"",mutuelle:"",numSecu:"",allergies:"",restrictions:"",docteur:"",telDocteur:"",autoSoins:false,autoPhoto:false,autoTransport:false,certifMedical:false,photoId:false,justifDom:false,rib:false,tailleShort:"",tailleChaussettes:"",tailleSurvêtement:"",photoBase64:"",commentaire:"",
  // Paiement
  modePaiement:"",nbFois:1,nomFamille:"",rangFamille:1,
};

/* ══ HELPERS ══════════════════════════════════════════════════════ */
const genId  = ()=>"RSG-"+Date.now().toString(36).toUpperCase().slice(-4)+Math.random().toString(36).slice(2,5).toUpperCase();
const fmtD   = iso=>iso?new Date(iso).toLocaleDateString("fr-FR"):"—";
const fmtDT  = iso=>iso?new Date(iso).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const calcAge= dob=>{if(!dob)return null;const d=new Date(dob),n=new Date();let a=n.getFullYear()-d.getFullYear();if(n<new Date(n.getFullYear(),d.getMonth(),d.getDate()))a--;return a;};
const suggestCat=dob=>{if(!dob)return"";const yr=new Date(dob).getFullYear();if(yr>=2020)return"U5-U6";if(yr>=2018)return"U7-U8";if(yr>=2016)return"U9-U10";if(yr>=2014)return"U11-U12";if(yr>=2012)return"U13-U14";if(yr>=2010)return"U15-U16";if(yr>=2008)return"U17-U18";if(yr>=1985)return"Senior";return"Vétéran";};
// Indique si un certif médical sera requis pour la prochaine saison
// Nouveau format Footclubs : champ `cm` (true = "Non valide" donc certif requis, false = OK)
// Ancien format : champ anneeLastCertif (validité 3 saisons)
const certifRequis=lic=>{
  if(!lic)return null;
  // Nouveau format : booléen direct
  if(typeof lic.cm==="boolean")return lic.cm;
  // Ancien format : calcul à partir de l'année
  const annee=lic.anneeLastCertif||lic.a;
  if(!annee)return null;
  const s=new Date().getMonth()>=6?new Date().getFullYear():new Date().getFullYear()-1;
  return s>=parseInt(annee)+3;
};
const lookupLic=(lics,nom,prenom,num)=>{if(!lics?.length)return null;const nn=nom.toLowerCase().trim(),pp=prenom.toLowerCase().trim();if(num){const x=lics.find(l=>(l.numLicence||l.l)?.toString()===num.toString());if(x)return x;}return lics.find(l=>(l.nom||l.n)?.toLowerCase().trim()===nn&&(l.prenom||l.p)?.toLowerCase().trim()===pp)||null;};
const getTailles=age=>(age!==null&&age<14)?TE:TA;

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

/* ══ EXPORT EXCEL ═════════════════════════════════════════════════ */
const loadXLSX=()=>new Promise((res,rej)=>{if(window.XLSX){res(window.XLSX);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=rej;document.head.appendChild(s);});
const mkSheet=rows=>{const XLSX=window.XLSX;const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=rows[0]?.map((_,i)=>({wch:Math.min(50,Math.max(10,...rows.map(r=>String(r[i]||"").length)))}));return ws;};
const exportXLSX=async(sheets,fname)=>{const XLSX=await loadXLSX();const wb=XLSX.utils.book_new();sheets.forEach(({name,rows})=>XLSX.utils.book_append_sheet(wb,mkSheet(rows),name.slice(0,31)));XLSX.writeFile(wb,fname);};

const H_INS = ["Référence","Date","Type","Statut","Nom","Prénom","Naissance","Sexe","Nationalité","Lieu naiss.","Adresse","CP","Ville","Téléphone","Email","Catégorie","Poste","Ancien club","N° Licence FFF","Resp. 1","Lien resp. 1","Tél resp. 1","Email resp. 1","Resp. 2","Tél resp. 2","Email resp. 2","Mutuelle","Médecin","Tél médecin","Allergies","Restrictions","Soins urgence","Photos","Transport","Certif requis","Certif fourni","Photo ID","Justif.","RIB","Short","Chaussettes","Survêtement","Famille","Rang famille","Tarif €","Remise %","Prix payé €","Mode paiement","Nb fois","Notes","Commentaire"];
const toRow=e=>[e.id,fmtDT(e.datePreinscription),e.typeLicence==="renouvellement"?"Renouvellement":"Nouvelle",STATUTS[e.statut]?.l||"",e.nom,e.prenom,e.dateNaissance,e.sexe,e.nationalite||"",e.lieuNaissance||"",e.adresse,e.codePostal,e.ville,e.isMajeur?e.telephone:e.resp1Tel||"",e.isMajeur?e.email:e.resp1Email||"",e.categorie,e.poste||"",e.ancienClub||"",e.numLicenceFFF||"",e.resp1Nom?`${e.resp1Prenom} ${e.resp1Nom}`:"",e.resp1Lien||"",e.resp1Tel||"",e.resp1Email||"",e.resp2Nom?`${e.resp2Prenom} ${e.resp2Nom}`:"",e.resp2Tel||"",e.resp2Email||"",e.mutuelle||"",e.docteur||"",e.telDocteur||"",e.allergies||"",e.restrictions||"",e.autoSoins?"Oui":"Non",e.autoPhoto?"Oui":"Non",e.autoTransport?"Oui":"Non",e.certifNeeded?"OUI":"OK",e.certifMedical?"✓":"",e.photoId?"✓":"",e.justifDom?"✓":"",e.rib?"✓":"",e.tailleShort||"",e.tailleChaussettes||"",e["tailleSurvêtement"]||"",e.nomFamille||"",e.rangFamille||1,e.tarifBase||"",e.remisePct||0,e.prixFinal||"",e.modePaiement||"",e.nbFois||1,e.notes||"",e.commentaire||""];

/* ══ STYLES ═══════════════════════════════════════════════════════ */
const inp=err=>({width:"100%",boxSizing:"border-box",padding:"11px 12px",fontSize:16,border:`1.5px solid ${err?C.R:C.Gb}`,borderRadius:8,outline:"none",background:C.W,color:C.N,fontFamily:"system-ui,-apple-system,sans-serif",WebkitAppearance:"none",appearance:"none",minHeight:44});
const lbl={display:"block",fontSize:13,fontWeight:700,color:"#333",marginBottom:5};
const BP={background:C.J,color:C.N,border:`2px solid ${C.Jd}`,borderRadius:10,padding:"12px 20px",fontWeight:900,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation"};
const BS={background:C.Gc,color:C.N,border:`1.5px solid ${C.Gb}`,borderRadius:10,padding:"12px 18px",fontWeight:700,fontSize:15,cursor:"pointer",minHeight:48,touchAction:"manipulation"};
const G2={display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 10px"};

/* ══ ROOT ═════════════════════════════════════════════════════════ */
export default function App() {
  const [saison,setSaison]=useState(SAISON_DEFAUT);
  const [view,setView]=useState("home");
  const [pw,setPw]=useState("");
  const [pwErr,setPwErr]=useState(false);
  const [licencies,setLicencies]=useState([]);
  const [tarifs,setTarifs]=useState(TARIFS_DEFAUT);

  useEffect(()=>{
    if(!saison)return;
    stGet(keyLic(saison)).then(d=>{
      // Si pas encore de base pour cette saison, on charge la base Footclubs pré-intégrée
      setLicencies(Array.isArray(d)&&d.length>0?d:BASE_FOOTCLUBS);
    });
    stGet(`rsg_tarifs_${saison}`).then(d=>{ if(d)setTarifs(d); });
  },[saison]);

  

  const tryLogin=()=>{if(pw.trim()===ADMIN){setView("admin");setPw("");setPwErr(false);}else setPwErr(true);};

  return(
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",minHeight:"100vh",background:C.Gc,WebkitTextSizeAdjust:"100%"}}>
      <header style={{background:C.N,borderBottom:`4px solid ${C.J}`,padding:"0 14px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:10,overflow:"hidden"}}>
          <div style={{width:34,height:34,background:C.J,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,flexShrink:0}}>⚽</div>
          <div style={{lineHeight:1.15}}><div style={{color:C.J,fontWeight:900,fontSize:12}}>RÉVEIL ST-GÉRÉON</div><div style={{color:"#9ca3af",fontSize:10}}>Saison {saison}</div></div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
          <select value={saison} onChange={e=>{setSaison(e.target.value);setView("home");}} style={{background:C.Ns,color:"#ddd",border:"1px solid #444",borderRadius:7,padding:"5px 6px",fontWeight:600,fontSize:10,cursor:"pointer",minHeight:32,outline:"none"}}>{saisons.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
          {view!=="home"&&<button onClick={()=>setView("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>← Retour</button>}
          {view!=="admin"&&<button onClick={()=>setView("login")} style={{background:C.J,color:C.N,border:"none",borderRadius:7,padding:"5px 9px",fontWeight:800,fontSize:11,cursor:"pointer",minHeight:32}}>🔐 Bureau</button>}
          {view==="admin"&&<button onClick={()=>setView("home")} style={{background:"transparent",color:C.J,border:`1px solid ${C.J}`,borderRadius:7,padding:"5px 9px",fontWeight:700,fontSize:10,cursor:"pointer",minHeight:32}}>Déco.</button>}
        </div>
      </header>
      {view==="home"&&<Home onForm={()=>setView("form")} saison={saison} tarifs={tarifs}/>}
      {view==="form"&&<Formulaire onDone={()=>setView("home")} licencies={licencies} saison={saison} tarifs={tarifs}/>}
      {view==="login"&&(
        <div style={{maxWidth:360,margin:"48px auto 0",padding:"0 16px"}}>
          <div style={{background:C.W,borderRadius:16,padding:28,boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`2px solid ${C.J}`}}>
            <div style={{textAlign:"center",marginBottom:20}}><div style={{fontSize:38,marginBottom:8}}>🔐</div><h2 style={{margin:0,color:C.N,fontWeight:800,fontSize:20}}>Accès Secrétariat</h2><p style={{color:C.G,fontSize:13,marginTop:4}}>Saison {saison}</p></div>
            <label style={lbl}>Code d'accès</label>
            <input type="password" autoComplete="current-password" style={{...inp(pwErr),fontSize:18,letterSpacing:4,marginBottom:8}} value={pw} onChange={e=>{setPw(e.target.value);setPwErr(false);}} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="Code" autoFocus/>
            {pwErr&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:7,padding:"8px 12px",fontSize:13,color:C.R,marginBottom:10}}>❌ Code incorrect — défaut : RSG2025</div>}
            <button style={{...BP,width:"100%",marginTop:4}} onClick={tryLogin}>Entrer →</button>
          </div>
        </div>
      )}
      {view==="admin"&&<Dashboard saison={saison} licencies={licencies} onLicenciesChange={setLicencies} tarifs={tarifs} onTarifsChange={async t=>{setTarifs(t);await stSet(`rsg_tarifs_${saison}`,t);}}/>}
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
            <strong>👨‍👩‍👧‍👦 Tarif famille</strong> : à partir du 2ème enfant inscrit dans la même famille<br/>
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
  const tailles=getTailles(age);
  const lic=(f.typeLicence==="renouvellement"&&(f.numLicenceFFF||(f.nom.length>1&&f.prenom.length>1)))?lookupLic(licencies,f.nom,f.prenom,f.numLicenceFFF):null;
  const anneeRef=lic?(lic.anneeLastCertif||lic.a)||null:null;
  const certifReq=f.typeLicence==="nouvelle"?true:(lic?certifRequis(lic):null);
  // Message à afficher selon le format de données
  const certifMsg=f.typeLicence==="nouvelle"
    ?{ok:false,txt:"Nouvelle licence → certificat médical obligatoire."}
    :(!lic?null:(certifReq===true
      ?{ok:false,txt:`Selon Footclubs, votre certificat médical n'est pas valide pour la prochaine saison → RDV médecin obligatoire.`}
      :certifReq===false
        ?{ok:true,txt:`Certificat médical valide pour 2026-2027. Pas besoin de médecin ✓ (vous remplirez le questionnaire de santé)`}
        :null));

  // Prix calculé
  const rang = Math.max(1, parseInt(f.rangFamille)||1);
  const tarifBase  = f.categorie ? (tarifs[f.categorie]||0) : 0;
  const remisePct  = rang>=4?REMISE_FAMILLE[4]:(REMISE_FAMILLE[rang]||0);
  const prixFinal  = Math.round(tarifBase*(1-remisePct/100));
  const echeances  = f.modePaiement&&f.nbFois>1?calcEcheances(prixFinal,f.nbFois):null;
  const modeObj    = MODES_PAIEMENT.find(m=>m.id===f.modePaiement);

  const STEPS=isMajeur?["Type","Joueur","Médical","Équipement","Paiement","Récap"]:["Type","Joueur","Responsable","Médical","Équipement","Paiement","Récap"];
  const total=STEPS.length;
  const medStep=isMajeur?3:4;
  const eqStep=isMajeur?4:5;
  const payStep=isMajeur?5:6;

  useEffect(()=>{if(f.dateNaissance)set("categorie",suggestCat(f.dateNaissance));},[f.dateNaissance]);
  useEffect(()=>{topRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[step]);

  const validate=()=>{
    const e={};
    if(step===1&&!f.typeLicence)e.typeLicence="Veuillez choisir";
    if(step===2){if(!f.nom)e.nom="Requis";if(!f.prenom)e.prenom="Requis";if(!f.dateNaissance)e.dateNaissance="Requis";if(!f.sexe)e.sexe="Requis";if(!f.adresse)e.adresse="Requis";if(!f.codePostal)e.codePostal="Requis";if(!f.ville)e.ville="Requis";if(!f.categorie)e.categorie="Requis";if(isMajeur){if(!f.telephone)e.telephone="Requis";if(!f.email)e.email="Requis";}if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))e.email="Email invalide";}
    if(!isMajeur&&step===3){if(!f.resp1Nom)e.resp1Nom="Requis";if(!f.resp1Prenom)e.resp1Prenom="Requis";if(!f.resp1Tel)e.resp1Tel="Requis";if(!f.resp1Email)e.resp1Email="Requis";}
    if(step===medStep&&!isMajeur&&!f.autoSoins)e.autoSoins="Autorisation obligatoire";
    if(step===payStep){if(!f.modePaiement)e.modePaiement="Veuillez choisir un mode de paiement";}
    setErrs(e);return Object.keys(e).length===0;
  };
  const next=()=>{if(validate())setStep(p=>Math.min(p+1,total));};
  const prev=()=>{setErrs({});setStep(p=>Math.max(p-1,1));};
  const submit=async()=>{
    setSaving(true);
    const id=genId();
    const entry={id,...f,isMajeur,age,certifNeeded:certifReq===true,anneeLastCertifBase:anneeRef,saison,tarifBase,remisePct,prixFinal,statut:"attente",notes:"",datePreinscription:new Date().toISOString(),dateValidation:null,datePaiement:null};
    const data=await stGet(keyIns(saison))||[];
    data.unshift(entry);await stSet(keyIns(saison),data);
    setSaving(false);setDone(id);
  };

  if(done)return<Confirmation refId={done} prenom={f.prenom} nom={f.nom} saison={saison} prixFinal={prixFinal} modePaiement={f.modePaiement} nbFois={f.nbFois} echeances={echeances} onNew={()=>{setDone(null);setStep(1);setF(F0);}} onDone={onDone}/>;

  return(
    <div style={{maxWidth:600,margin:"0 auto",padding:"14px 12px 80px"}} ref={topRef}>
      <ProgressBar steps={STEPS} current={step}/>
      <div style={{background:C.W,borderRadius:14,padding:"20px 16px",boxShadow:"0 2px 12px rgba(0,0,0,.06)",border:`1px solid ${C.Gb}`}}>
        <h2 style={{margin:"0 0 16px",fontSize:17,fontWeight:800,color:C.N,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:C.J,color:C.N,width:26,height:26,borderRadius:6,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,flexShrink:0}}>{step}</span>
          {STEPS[step-1]}
        </h2>

        {/* STEP 1 - Type */}
        {step===1&&<div>
          {errs.typeLicence&&<ErrB msg={errs.typeLicence}/>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            <TypeCard sel={f.typeLicence==="renouvellement"} onClick={()=>set("typeLicence","renouvellement")} icon="🔄" title="Renouvellement" sub="Déjà licencié(e) FFF"/>
            <TypeCard sel={f.typeLicence==="nouvelle"} onClick={()=>set("typeLicence","nouvelle")} icon="✨" title="Nouvelle licence" sub="Première licence FFF"/>
          </div>
          {f.typeLicence==="renouvellement"&&<div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:10,padding:"14px",marginBottom:10}}>
            <F label="N° de licence FFF (si connu)"><input style={inp()} value={f.numLicenceFFF} onChange={e=>set("numLicenceFFF",e.target.value)} placeholder="Sur mon-compte.fff.fr"/></F>
            {certifMsg?<div style={{borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅ ":"🩺 "}{certifMsg.txt}</div>:<p style={{fontSize:12,color:"#0369a1",margin:"4px 0 0"}}>ℹ️ {licencies.length>0?"Saisissez votre nom à l'étape suivante pour vérifier votre certif médical.":"Le secrétariat confirmera si un certif médical est nécessaire."}</p>}
          </div>}
          {f.typeLicence==="nouvelle"&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 12px",fontSize:13,color:C.R}}>🩺 Nouvelle licence → <strong>certificat médical obligatoire.</strong></div>}
          {/* Aperçu tarif si catégorie déjà connue (renouvellement + nom saisi) */}
          {f.categorie&&tarifBase>0&&<div style={{marginTop:10,background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px 12px",fontSize:13,display:"flex",alignItems:"center",gap:8}}>
            <span>💰</span>
            <span>Tarif {f.categorie} : <strong>{tarifBase} €</strong></span>
          </div>}
        </div>}

        {/* STEP 2 - Joueur */}
        {step===2&&<div>
          {age!==null&&<div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:isMajeur?"#dbeafe":"#dcfce7",fontSize:13,fontWeight:600,color:isMajeur?C.B:C.V}}>{isMajeur?"🧑 Joueur majeur":"👶 Joueur mineur — un représentant légal sera demandé à l'étape suivante"}</div>}
          <div style={G2}>
            <F label="Nom *" err={errs.nom}><input style={inp(errs.nom)} value={f.nom} onChange={e=>set("nom",e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="family-name"/></F>
            <F label="Prénom *" err={errs.prenom}><input style={inp(errs.prenom)} value={f.prenom} onChange={e=>set("prenom",e.target.value)} autoCapitalize="words" autoComplete="given-name"/></F>
            <F label="Date de naissance *" err={errs.dateNaissance}><input type="date" style={inp(errs.dateNaissance)} value={f.dateNaissance} onChange={e=>set("dateNaissance",e.target.value)} max={new Date().toISOString().slice(0,10)}/></F>
            <F label="Sexe *" err={errs.sexe}><select style={inp(errs.sexe)} value={f.sexe} onChange={e=>set("sexe",e.target.value)}><option value="">—</option><option>Masculin</option><option>Féminin</option></select></F>
            <F label="Lieu de naissance"><input style={inp()} value={f.lieuNaissance} onChange={e=>set("lieuNaissance",e.target.value)} placeholder="Ville"/></F>
            <F label="Nationalité"><select style={inp()} value={f.nationalite} onChange={e=>set("nationalite",e.target.value)}><option value="">— Choisir</option>{NATS.map(n=><option key={n} value={n}>{n}</option>)}</select></F>
          </div>
          {f.nationalite==="Autre"&&<F label="Précisez"><input style={inp()} value={f.nationaliteAutre} onChange={e=>set("nationaliteAutre",e.target.value)}/></F>}
          <AdresseInput adresse={f.adresse} cp={f.codePostal} ville={f.ville} onAdresse={v=>set("adresse",v)} onCP={v=>set("codePostal",v)} onVille={v=>set("ville",v)} errA={errs.adresse} errCP={errs.codePostal} errV={errs.ville}/>
          {isMajeur&&<div style={G2}><F label="Téléphone *" err={errs.telephone}><input type="tel" style={inp(errs.telephone)} value={f.telephone} onChange={e=>set("telephone",e.target.value)} inputMode="tel" autoComplete="tel"/></F><F label="Email *" err={errs.email}><input type="email" style={inp(errs.email)} value={f.email} onChange={e=>set("email",e.target.value)} inputMode="email" autoComplete="email"/></F></div>}
          <div style={G2}>
            <F label="Catégorie *" err={errs.categorie}><select style={inp(errs.categorie)} value={f.categorie} onChange={e=>set("categorie",e.target.value)}><option value="">— Choisir</option>{CATS.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>{f.dateNaissance&&<span style={{fontSize:11,color:C.V,marginTop:3,display:"block"}}>✓ Détectée auto.</span>}</F>
            <F label="Poste"><select style={inp()} value={f.poste} onChange={e=>set("poste",e.target.value)}><option value="">— Choisir</option>{POSTES.map(p=><option key={p}>{p}</option>)}</select></F>
          </div>
          {f.categorie&&<div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>💰 Tarif {f.categorie} : <strong>{tarifs[f.categorie]||0} €</strong></div>}
          <F label="Ancien club"><input style={inp()} value={f.ancienClub} onChange={e=>set("ancienClub",e.target.value)} placeholder="Club précédent (si applicable)"/></F>
          <div style={{marginTop:8,background:C.Jp,border:`1.5px solid ${C.Jd}`,borderRadius:10,padding:"12px 14px"}}>
            <p style={{fontWeight:700,fontSize:13,color:C.N,margin:"0 0 4px"}}>📸 Photo d'identité</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Fond neutre, visage dégagé</p>
            <PhotoInput value={f.photoBase64} onChange={v=>set("photoBase64",v)}/>
          </div>
        </div>}

        {/* STEP responsable (mineur) */}
        {!isMajeur&&step===3&&<div>
          <h3 style={{color:C.N,fontWeight:700,fontSize:14,margin:"0 0 12px"}}>Responsable légal principal *</h3>
          <div style={G2}>
            <F label="Nom *" err={errs.resp1Nom}><input style={inp(errs.resp1Nom)} value={f.resp1Nom} onChange={e=>set("resp1Nom",e.target.value.toUpperCase())}/></F>
            <F label="Prénom *" err={errs.resp1Prenom}><input style={inp(errs.resp1Prenom)} value={f.resp1Prenom} onChange={e=>set("resp1Prenom",e.target.value)} autoCapitalize="words"/></F>
            <F label="Lien"><select style={inp()} value={f.resp1Lien} onChange={e=>set("resp1Lien",e.target.value)}><option value="">—</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
            <F label="Téléphone *" err={errs.resp1Tel}><input type="tel" style={inp(errs.resp1Tel)} value={f.resp1Tel} onChange={e=>set("resp1Tel",e.target.value)} inputMode="tel" autoComplete="tel"/></F>
            <F label="Email *" err={errs.resp1Email} span><input type="email" style={inp(errs.resp1Email)} value={f.resp1Email} onChange={e=>set("resp1Email",e.target.value)} inputMode="email" autoComplete="email"/></F>
          </div>
          <details style={{marginTop:14}}><summary style={{fontWeight:700,fontSize:13,cursor:"pointer",color:C.G,padding:"8px 0"}}>＋ 2ᵉ responsable légal (optionnel)</summary>
            <div style={{marginTop:10}}><div style={G2}>
              <F label="Nom"><input style={inp()} value={f.resp2Nom} onChange={e=>set("resp2Nom",e.target.value.toUpperCase())}/></F>
              <F label="Prénom"><input style={inp()} value={f.resp2Prenom} onChange={e=>set("resp2Prenom",e.target.value)}/></F>
              <F label="Lien"><select style={inp()} value={f.resp2Lien} onChange={e=>set("resp2Lien",e.target.value)}><option value="">—</option>{LIENS.map(l=><option key={l}>{l}</option>)}</select></F>
              <F label="Téléphone"><input type="tel" style={inp()} value={f.resp2Tel} onChange={e=>set("resp2Tel",e.target.value)} inputMode="tel"/></F>
              <F label="Email" span><input type="email" style={inp()} value={f.resp2Email} onChange={e=>set("resp2Email",e.target.value)} inputMode="email"/></F>
            </div></div>
          </details>
        </div>}

        {/* STEP médical */}
        {step===medStep&&<div>
          {certifMsg&&<div style={{marginBottom:14,borderRadius:8,padding:"10px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅ ":"🩺 "}{certifMsg.txt}</div>}
          <div style={G2}>
            <F label="Mutuelle"><input style={inp()} value={f.mutuelle} onChange={e=>set("mutuelle",e.target.value)}/></F>
            <F label="N° sécu"><input style={inp()} value={f.numSecu} onChange={e=>set("numSecu",e.target.value)} inputMode="numeric" maxLength={15}/></F>
            <F label="Médecin traitant"><input style={inp()} value={f.docteur} onChange={e=>set("docteur",e.target.value)}/></F>
            <F label="Tél. médecin"><input type="tel" style={inp()} value={f.telDocteur} onChange={e=>set("telDocteur",e.target.value)} inputMode="tel"/></F>
          </div>
          <F label="Allergies"><input style={inp()} value={f.allergies} onChange={e=>set("allergies",e.target.value)} placeholder="Ex: arachides... ou Aucune"/></F>
          <F label="Restrictions médicales"><input style={inp()} value={f.restrictions} onChange={e=>set("restrictions",e.target.value)} placeholder="Ex: asthme... ou Aucune"/></F>
          <div style={{marginTop:14,padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>📋 Autorisations</p>
            {!isMajeur&&<Chk checked={f.autoSoins} onChange={v=>set("autoSoins",v)} err={errs.autoSoins} label="J'autorise le club à pratiquer les soins d'urgence en cas de nécessité *"/>}
            <Chk checked={f.autoPhoto} onChange={v=>set("autoPhoto",v)} label="J'autorise l'utilisation de photos/vidéos sur les supports du club"/>
            {!isMajeur&&<Chk checked={f.autoTransport} onChange={v=>set("autoTransport",v)} label="J'autorise le transport en véhicule personnel lors des déplacements"/>}
          </div>
          <div style={{marginTop:12,padding:14,background:C.Gc,borderRadius:10}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>📁 Documents déjà préparés</p>
            <Chk checked={f.certifMedical} onChange={v=>set("certifMedical",v)} label={certifMsg?.ok?"Questionnaire de santé (certif non requis)":"Certificat médical (moins de 3 ans)"}/>
            <Chk checked={f.photoId} onChange={v=>set("photoId",v)} label="Pièce d'identité (CNI ou passeport)"/>
            <Chk checked={f.justifDom} onChange={v=>set("justifDom",v)} label="Justificatif de domicile"/>
            <Chk checked={f.rib} onChange={v=>set("rib",v)} label="RIB (prélèvement cotisation)"/>
          </div>
        </div>}

        {/* STEP équipement */}
        {step===eqStep&&<div>
          <div style={{marginBottom:12,padding:"8px 12px",borderRadius:8,background:C.Jp,border:`1px solid ${C.Jd}`,fontSize:13}}>
            {age!==null&&age<14?<span style={{color:"#92400e",fontWeight:700}}>👶 Tailles enfant (joueur de {age} ans)</span>:<span style={{color:C.G}}>Tailles adultes</span>}
          </div>
          <div style={G2}>
            <F label="Short"><select style={inp()} value={f.tailleShort} onChange={e=>set("tailleShort",e.target.value)}><option value="">— Choisir</option>{tailles.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
            <F label="Chaussettes"><select style={inp()} value={f.tailleChaussettes} onChange={e=>set("tailleChaussettes",e.target.value)}><option value="">— Choisir</option>{tailles.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
            <F label="Survêtement" span><select style={inp()} value={f["tailleSurvêtement"]} onChange={e=>set("tailleSurvêtement",e.target.value)}><option value="">— Choisir</option>{tailles.map(t=><option key={t} value={t}>{t}</option>)}</select></F>
          </div>
        </div>}

        {/* STEP paiement */}
        {step===payStep&&<div>
          {/* Prix récapitulatif */}
          <div style={{background:C.N,borderRadius:12,padding:"16px",marginBottom:16,textAlign:"center"}}>
            <p style={{color:"#9ca3af",fontSize:12,margin:"0 0 4px"}}>Montant de la licence</p>
            {remisePct>0?(
              <div>
                <div style={{color:"#6b7280",fontSize:14,textDecoration:"line-through"}}>{tarifBase} €</div>
                <div style={{color:C.J,fontWeight:900,fontSize:32}}>{prixFinal} €</div>
                <div style={{background:"#16a34a",color:C.W,display:"inline-block",padding:"2px 10px",borderRadius:20,fontSize:12,fontWeight:700,marginTop:4}}>🎉 Remise famille -{remisePct}%</div>
              </div>
            ):(
              <div style={{color:C.J,fontWeight:900,fontSize:32}}>{prixFinal} €</div>
            )}
          </div>

          {/* Remise famille */}
          <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:10,padding:"14px",marginBottom:14}}>
            <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>👨‍👩‍👧‍👦 Tarif famille</p>
            <p style={{fontSize:12,color:C.G,margin:"0 0 10px"}}>Vous inscrivez plusieurs enfants ? Indiquez le nom de famille et le rang de cet enfant pour bénéficier de la remise.</p>
            <div style={G2}>
              <F label="Nom de famille"><input style={inp()} value={f.nomFamille} onChange={e=>set("nomFamille",e.target.value.toUpperCase())} placeholder="Ex: DUPONT"/></F>
              <F label="Rang dans la fratrie">
                <select style={inp()} value={f.rangFamille} onChange={e=>set("rangFamille",parseInt(e.target.value))}>
                  <option value={1}>1er enfant (plein tarif)</option>
                  <option value={2}>2ème enfant (-10%)</option>
                  <option value={3}>3ème enfant (-20%)</option>
                  <option value={4}>4ème et + (-30%)</option>
                </select>
              </F>
            </div>
          </div>

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

          {/* Fractionnement */}
          {f.modePaiement&&modeObj?.fractionnable&&(
            <div style={{background:C.Gc,borderRadius:10,padding:"14px",marginBottom:14}}>
              <p style={{fontWeight:700,fontSize:13,margin:"0 0 10px"}}>Paiement en plusieurs fois (sans frais)</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {[1,2,3,4].map(n=>(
                  <button key={n} onClick={()=>set("nbFois",n)}
                    style={{flex:"1 0 auto",padding:"8px 10px",border:`2px solid ${f.nbFois===n?C.J:C.Gb}`,background:f.nbFois===n?C.Jp:"#fff",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",minHeight:40}}>
                    {n===1?"1× (comptant)":`${n}×`}
                  </button>
                ))}
              </div>
              {f.nbFois>1&&(
                <div style={{marginTop:12,padding:"10px 12px",background:C.W,borderRadius:8,border:`1px solid ${C.Gb}`}}>
                  <p style={{fontWeight:700,fontSize:12,color:C.G,margin:"0 0 6px"}}>Échéancier :</p>
                  {calcEcheances(prixFinal,f.nbFois).map((m,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:i<f.nbFois-1?`1px solid ${C.Gc}`:"none",fontSize:13}}>
                      <span style={{color:C.G}}>Versement {i+1}{i===0?" (à l'inscription)":""}</span>
                      <span style={{fontWeight:700,color:C.J}}>{m} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {f.modePaiement==="especes"&&<div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 12px",fontSize:13,color:"#92400e"}}>
            💵 Paiement en espèces uniquement en une seule fois, remis au secrétariat lors de la validation du dossier.
          </div>}

          <F label="Message pour le secrétariat (optionnel)"><textarea style={{...inp(),height:80,resize:"vertical"}} value={f.commentaire} onChange={e=>set("commentaire",e.target.value)} placeholder="Questions, infos particulières..."/></F>
        </div>}

        {/* STEP récap */}
        {step===total&&<div>
          <div style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:13,color:"#713f12"}}>✋ Vérifiez avant d'envoyer.</div>
          {certifMsg&&<div style={{marginBottom:10,borderRadius:8,padding:"8px 12px",background:certifMsg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${certifMsg.ok?"#86efac":"#fca5a5"}`,fontSize:13,color:certifMsg.ok?C.V:C.R}}>{certifMsg.ok?"✅":"🩺"} {certifMsg.txt}</div>}
          <RB title="Licence"><RR l="Type" v={f.typeLicence==="renouvellement"?"🔄 Renouvellement":"✨ Nouvelle"}/>{f.numLicenceFFF&&<RR l="N° FFF" v={f.numLicenceFFF}/>}</RB>
          <RB title="Joueur"><RR l="Identité" v={`${f.prenom} ${f.nom}`}/><RR l="Naissance" v={fmtD(f.dateNaissance)}/><RR l="Catégorie" v={f.categorie}/><RR l="Adresse" v={`${f.adresse}, ${f.codePostal} ${f.ville}`}/>{isMajeur&&<><RR l="Tél" v={f.telephone}/><RR l="Email" v={f.email}/></>}</RB>
          {!isMajeur&&f.resp1Nom&&<RB title="Responsable légal"><RR l="Identité" v={`${f.resp1Prenom} ${f.resp1Nom}`}/><RR l="Contact" v={`${f.resp1Tel} · ${f.resp1Email}`}/></RB>}
          <RB title="Équipement"><RR l="Short" v={f.tailleShort||"—"}/><RR l="Chaussettes" v={f.tailleChaussettes||"—"}/><RR l="Survêtement" v={f["tailleSurvêtement"]||"—"}/></RB>
          {/* Récap paiement */}
          <div style={{background:C.N,borderRadius:10,padding:"14px",marginBottom:8}}>
            <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 8px",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Paiement</p>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.W,fontSize:13}}>{MODES_PAIEMENT.find(m=>m.id===f.modePaiement)?.l||"—"}</div>
                {f.nbFois>1&&<div style={{color:"#9ca3af",fontSize:12}}>En {f.nbFois} fois sans frais</div>}
                {f.nomFamille&&remisePct>0&&<div style={{color:"#86efac",fontSize:12}}>Remise famille {f.nomFamille} -{remisePct}%</div>}
              </div>
              <div style={{textAlign:"right"}}>
                {remisePct>0&&<div style={{color:"#6b7280",fontSize:12,textDecoration:"line-through"}}>{tarifBase} €</div>}
                <div style={{color:C.J,fontWeight:900,fontSize:22}}>{prixFinal} €</div>
              </div>
            </div>
            {f.nbFois>1&&echeances&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
              {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Versement {i+1}{i===0?" (à l'inscription)":""}</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
            </div>}
          </div>
          {f.photoBase64&&<div style={{marginBottom:10,display:"flex",alignItems:"center",gap:12,background:C.Gc,borderRadius:8,padding:10}}><img src={f.photoBase64} alt="Photo" style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:`2px solid ${C.J}`,flexShrink:0}}/><span style={{fontSize:13,color:C.V,fontWeight:600}}>✓ Photo fournie</span></div>}
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
function Confirmation({refId,prenom,nom,saison,prixFinal,modePaiement,nbFois,echeances,onNew,onDone}){
  const modeLabel=MODES_PAIEMENT.find(m=>m.id===modePaiement)?.l||"";
  return<div style={{maxWidth:480,margin:"24px auto",padding:"0 14px 64px",textAlign:"center"}}>
    <div style={{background:C.W,borderRadius:16,padding:"28px 20px",boxShadow:"0 4px 20px rgba(0,0,0,.1)",border:`3px solid ${C.J}`}}>
      <div style={{fontSize:52,marginBottom:10}}>🎉</div>
      <h2 style={{color:C.N,fontWeight:900,fontSize:22,margin:"0 0 6px"}}>Préinscription envoyée !</h2>
      <p style={{color:C.G,margin:"0 0 4px",fontSize:14}}>Merci <strong>{prenom} {nom}</strong></p>
      <p style={{color:C.G,margin:"0 0 16px",fontSize:13}}>Saison {saison}</p>
      <div style={{background:C.Jp,border:`2px solid ${C.J}`,borderRadius:10,padding:"12px 16px",margin:"0 0 12px",display:"inline-block",minWidth:200}}>
        <p style={{fontSize:11,color:C.G,margin:"0 0 4px"}}>Référence</p>
        <p style={{fontSize:20,fontWeight:900,color:C.N,letterSpacing:3,margin:0}}>{refId}</p>
      </div>
      <div style={{background:C.N,borderRadius:10,padding:"12px 16px",margin:"0 0 16px"}}>
        <p style={{color:"#9ca3af",fontSize:11,margin:"0 0 6px"}}>PAIEMENT</p>
        <p style={{color:C.J,fontWeight:900,fontSize:24,margin:"0 0 4px"}}>{prixFinal} €</p>
        <p style={{color:C.W,fontSize:13,margin:0}}>{modeLabel}{nbFois>1?` · En ${nbFois} fois sans frais`:""}</p>
        {echeances&&nbFois>1&&<div style={{marginTop:8,borderTop:"1px solid #333",paddingTop:8}}>
          {echeances.map((m,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0"}}><span style={{color:"#9ca3af"}}>Versement {i+1}{i===0?" (à l'inscription)":""}</span><span style={{color:C.J,fontWeight:700}}>{m} €</span></div>)}
        </div>}
      </div>
      <p style={{color:C.G,fontSize:13,lineHeight:1.6,margin:"0 0 20px"}}>Le secrétariat vous contactera sous <strong>48h</strong> pour finaliser votre inscription.</p>
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
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

  const refresh=useCallback(async()=>{setLoading(true);const d=await stGet(keyIns(saison));setData(Array.isArray(d)?d:[]);setLoading(false);},[saison]);
  useEffect(()=>{refresh();},[refresh]);

  const filtered=data.filter(d=>{
    const q=search.toLowerCase();
    return(!q||`${d.nom} ${d.prenom} ${d.id} ${d.resp1Email||""} ${d.email||""}`.toLowerCase().includes(q))&&(fSt==="tous"||d.statut===fSt)&&(fCat==="toutes"||d.categorie===fCat)&&(fType==="tous"||d.typeLicence===fType);
  });

  const stats={
    total:data.length,
    attente:data.filter(d=>d.statut==="attente").length,
    valide:data.filter(d=>d.statut==="valide").length,
    paye:data.filter(d=>d.statut==="paye").length,
    certif:data.filter(d=>d.certifNeeded).length,
    ca:data.filter(d=>d.prixFinal).reduce((s,d)=>s+(d.prixFinal||0),0),
  };

  const upd=async(id,patch)=>{const d=(await stGet(keyIns(saison))||[]).map(e=>e.id===id?{...e,...patch}:e);await stSet(keyIns(saison),d);setData(d);const u=d.find(e=>e.id===id);if(sel?.id===id){setSel(u);if(patch.notes!==undefined)setNote(u.notes||"");}};
  const del=async(id)=>{if(!window.confirm("Supprimer définitivement ?"))return;const d=(await stGet(keyIns(saison))||[]).filter(e=>e.id!==id);await stSet(keyIns(saison),d);setData(d);if(sel?.id===id)setSel(null);};

  const doExport=async(type)=>{
    setExporting(true);const fn=`RSG_${saison}_`;
    try{
      if(type==="all")await exportXLSX([{name:"Toutes",rows:[H_INS,...filtered.map(toRow)]}],fn+"Preinscriptions.xlsx");
      else if(type==="parEquipe"){const cats=[...new Set(data.map(d=>d.categorie))].sort();await exportXLSX(cats.map(cat=>({name:cat,rows:[H_INS,...data.filter(d=>d.categorie===cat).map(toRow)]})),fn+"ParEquipe.xlsx");}
      else if(type==="paiements"){
        const H=["Référence","Nom","Prénom","Catégorie","Mode paiement","Nb fois","Tarif €","Remise %","Prix final €","Famille","Rang","Statut"];
        await exportXLSX([{name:"Paiements",rows:[H,...data.map(e=>[e.id,e.nom,e.prenom,e.categorie,e.modePaiement||"",e.nbFois||1,e.tarifBase||"",e.remisePct||0,e.prixFinal||"",e.nomFamille||"",e.rangFamille||1,STATUTS[e.statut]?.l||""])]}],fn+"Paiements.xlsx");
      }
      else if(type==="equip"){const rows=data.filter(d=>d.statut!=="refuse").map(e=>[e.categorie,`${e.prenom} ${e.nom}`,e.tailleShort||"",e.tailleChaussettes||"",e["tailleSurvêtement"]||"",STATUTS[e.statut]?.l||""]);rows.sort((a,b)=>a[0].localeCompare(b[0]));await exportXLSX([{name:"Équipements",rows:[["Catégorie","Joueur","Short","Chaussettes","Survêtement","Statut"],...rows]}],fn+"Equipements.xlsx");}
      else if(type==="certifs")await exportXLSX([{name:"Certifs",rows:[["Nom","Prénom","Catégorie","Contact","Certif requis","Année certif","Statut"],...data.map(e=>[e.nom,e.prenom,e.categorie,e.isMajeur?e.email:e.resp1Email,e.certifNeeded?"OUI":"Non",e.anneeLastCertifBase||"",STATUTS[e.statut]?.l||""])]}],fn+"Certifs.xlsx");
      else if(type==="contacts")await exportXLSX([{name:"Contacts",rows:[["Nom","Prénom","Catégorie","Téléphone","Email","Resp. 1","Tél resp.1","Email resp.1","Statut"],...data.map(e=>[e.nom,e.prenom,e.categorie,e.isMajeur?e.telephone:e.resp1Tel||"",e.isMajeur?e.email:e.resp1Email||"",e.resp1Nom?`${e.resp1Prenom} ${e.resp1Nom}`:"",e.resp1Tel||"",e.resp1Email||"",STATUTS[e.statut]?.l||""])]}],fn+"Contacts.xlsx");
      else if(type==="licencies")await exportXLSX([{name:"Base licenciés",rows:[["Nom","Prénom","N° Licence FFF","Catégorie","Sous-catégorie","Type licence","Né(e) le","Sexe","Certif 26-27","Email","Téléphone","Représentant légal"],...licencies.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.sc||"",l.tl||"",l.dn?fmtD(l.dn):"",l.s||"",l.cm===true?"🩺 Requis":l.cm===false?"✅ Valide":"❓",l.em||"",l.tel||l.tel2||"",l.rl||""])]}],fn+"BaseLicencies.xlsx");
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  const equipData={};
  data.filter(d=>d.statut!=="refuse").forEach(d=>{if(!equipData[d.categorie])equipData[d.categorie]={};["tailleShort","tailleChaussettes","tailleSurvêtement"].forEach(k=>{if(d[k]){equipData[d.categorie][k]=equipData[d.categorie][k]||{};equipData[d.categorie][k][d[k]]=(equipData[d.categorie][k][d[k]]||0)+1;}});});

  return<div style={{maxWidth:900,margin:"0 auto",padding:"12px 12px 80px"}}>
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
      {[{id:"liste",l:"📋 Dossiers"},{id:"certifs",l:"🩺 Certifs (préinsc.)"},{id:"certifs2627",l:"🩺 Certifs 26-27"},{id:"equip",l:"👕 Équip."},{id:"paiements",l:"💰 Paiements"},{id:"tarifs",l:"⚙️ Tarifs"},{id:"footclubs",l:"🌐 Footclubs"},{id:"base",l:`👥 Licenciés (${licencies.length})`}].map(({id,l})=>(
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
        <div style={{fontSize:12,color:C.G,marginTop:3}}>{e.isMajeur?e.email:e.resp1Email} · Certif : {e.anneeLastCertifBase||"inconnu"}</div>
      </div>)}
    </div>}

    {/* CERTIFS 26-27 (issus de la base licenciés) */}
    {tab==="certifs2627"&&<Certifs2627 licencies={licencies} saison={saison}/>}

    {/* ÉQUIPEMENTS */}
    {tab==="equip"&&<div>
      {Object.entries(equipData).sort().map(([cat,fields])=><div key={cat} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
          <span style={{background:C.N,color:C.J,padding:"2px 8px",borderRadius:4,fontSize:12}}>{cat}</span>
          <span style={{color:C.G,fontSize:12}}>{data.filter(d=>d.categorie===cat&&d.statut!=="refuse").length} joueur(s)</span>
        </div>
        {Object.entries(fields).map(([field,sizes])=><div key={field} style={{marginBottom:8}}>
          <p style={{fontSize:12,color:C.G,margin:"0 0 4px"}}>{field==="tailleShort"?"Short":field==="tailleChaussettes"?"Chaussettes":"Survêtement"}</p>
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
              <span style={{fontWeight:700}}>{d.prenom} {d.nom}</span> — {d.prixFinal} € en {d.nbFois}× · 1er versement {calcEcheances(d.prixFinal,d.nbFois)[0]} €
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
      {data.filter(d=>d.statut==="attente"||d.statut==="valide").map(e=>{const email=e.isMajeur?e.email:e.resp1Email;return<div key={e.id} style={{background:C.W,borderRadius:10,padding:"12px 14px",marginBottom:10,border:`1px solid ${C.Gb}`}}>
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
    {tab==="base"&&<BaseLicencies saison={saison} licencies={licencies} onSave={async lic=>{await stSet(keyLic(saison),lic);onLicenciesChange(lic);}}/>}
  </div>;
}

/* ══ CERTIFS 26-27 ════════════════════════════════════════════════ */
function Certifs2627({licencies,saison}){
  const [filtre,setFiltre]=useState("requis");// requis | valides | tous
  const [srch,setSrch]=useState("");
  const [exporting,setExporting]=useState(false);

  // Annee de la prochaine saison à partir de saison courante "2025-2026" -> "2026-2027"
  const next=(()=>{const m=saison.match(/(\d{4})-(\d{4})/);return m?`${parseInt(m[2])}-${parseInt(m[2])+1}`:"prochaine saison";})();

  const all=licencies.filter(l=>l.tl!=="Dirigeant"); // les dirigeants n'ont pas besoin de certif joueur
  const requis=all.filter(l=>certifRequis(l)===true);
  const valides=all.filter(l=>certifRequis(l)===false);
  const inconnus=all.filter(l=>certifRequis(l)===null);

  const liste=filtre==="requis"?requis:filtre==="valides"?valides:all;
  const filtered=srch.length>1?liste.filter(l=>`${l.n||l.nom||""} ${l.p||l.prenom||""} ${l.l||l.numLicence||""}`.toLowerCase().includes(srch.toLowerCase())):liste;

  // Email de contact = email du joueur OU email représentant légal (mineur)
  const getEmail=l=>{
    if(l.em)return l.em;
    if(l.em2)return l.em2;
    return"";
  };
  const emailsRequis=requis.map(getEmail).filter(e=>e);

  const copyAll=()=>{
    if(!emailsRequis.length){alert("Aucun email à copier");return;}
    navigator.clipboard.writeText(emailsRequis.join("; "));
    alert(`✅ ${emailsRequis.length} email(s) copié(s) dans le presse-papier (séparés par ;)`);
  };

  const doExport=async()=>{
    setExporting(true);
    try{
      const rows=requis.map(l=>[l.n||l.nom||"",l.p||l.prenom||"",l.l||l.numLicence||"",l.c||l.categorie||"",l.sc||"",l.dn?fmtD(l.dn):"",l.s||"",getEmail(l),l.tel||l.tel2||"",l.rl||""]);
      await exportXLSX([{name:`Certifs ${next}`,rows:[["Nom","Prénom","N° Licence","Catégorie","Sous-catégorie","Né(e) le","Sexe","Email","Téléphone","Représentant légal"],...rows]}],`RSG_Certifs_${next}.xlsx`);
    }catch(e){alert("Erreur export : "+e.message);}
    setExporting(false);
  };

  return<div>
    <div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:C.R,margin:"0 0 4px"}}>🩺 Certificats médicaux pour la saison {next}</p>
      <p style={{fontSize:13,color:"#991b1b",margin:0,lineHeight:1.5}}>
        Liste basée sur la colonne <strong>"Validité Certif Médic N+1"</strong> de Footclubs.
        Les joueurs marqués <strong>"Non valide"</strong> devront fournir un nouveau certificat médical pour la saison {next}.
      </p>
    </div>

    {/* Stats */}
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      <div style={{background:C.W,border:`2px solid ${C.R}`,borderRadius:10,padding:"10px 14px",flex:"1 1 100px",textAlign:"center"}}>
        <div style={{fontSize:24,fontWeight:900,color:C.R}}>{requis.length}</div>
        <div style={{fontSize:11,color:C.G}}>🩺 Certif requis</div>
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

    {/* Actions */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
      <button style={{...BP,flex:"1 1 160px",fontSize:13,padding:"10px 14px"}} onClick={copyAll} disabled={!emailsRequis.length}>📧 Copier les {emailsRequis.length} emails</button>
      <button style={{...BS,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={doExport} disabled={exporting||!requis.length}>{exporting?"Export…":"📊 Export Excel"}</button>
    </div>

    {/* Filtres */}
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      {[{id:"requis",l:`🩺 À renouveler (${requis.length})`,c:C.R},{id:"valides",l:`✅ Valides (${valides.length})`,c:C.V},{id:"tous",l:`Tous (${all.length})`,c:C.G}].map(o=>(
        <button key={o.id} onClick={()=>setFiltre(o.id)} style={{flex:"1 1 auto",padding:"8px 10px",border:`2px solid ${filtre===o.id?o.c:C.Gb}`,background:filtre===o.id?(o.c===C.R?"#fee2e2":o.c===C.V?"#dcfce7":C.Gc):"#fff",color:filtre===o.id?o.c:C.G,borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>{o.l}</button>
      ))}
    </div>

    {/* Recherche */}
    <input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`🔍 Rechercher parmi ${liste.length} licencié(s)…`} value={srch} onChange={e=>setSrch(e.target.value)}/>

    {/* Liste */}
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
        {email&&<button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"6px 10px",fontSize:11,cursor:"pointer",fontWeight:600,flexShrink:0}} onClick={()=>{navigator.clipboard.writeText(email);}}>📋 Email</button>}
      </div>;
    })}
  </div>;
}

/* ══ BASE LICENCIÉS ═══════════════════════════════════════════════ */
function BaseLicencies({saison,licencies,onSave}){
  const [msg,setMsg]=useState(null);
  const [srch,setSrch]=useState("");
  const [editIdx,setEI]=useState(null);
  const [editRow,setER]=useState(null);
  const fileRef=useRef();

  const parseCSV=text=>{
    const lines=text.split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];
    const sep=lines[0].includes(";")?";":",";
    const headers=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/['"]/g,""));
    const idx={
      nom:headers.findIndex(h=>h==="nom"||(h.includes("nom")&&!h.includes("pre")&&!h.includes("pré")&&!h.includes("club")&&!h.includes("cdg")&&!h.includes("repr"))),
      prenom:headers.findIndex(h=>h.includes("prenom")||h.includes("prénom")||h.includes("prén")),
      numLicence:headers.findIndex(h=>h.includes("numéro licence")||h.includes("numero licence")||h==="numéro licence"),
      validite:headers.findIndex(h=>h.includes("validité certif")||h.includes("validite certif")),
      anneeLastCertif:headers.findIndex(h=>!h.includes("validité")&&(h.includes("certif")||h.includes("médec")||h.includes("medec")||h.includes("visite"))),
      categorie:headers.findIndex(h=>h.includes("sous catégorie")||h.includes("sous categorie")||h.includes("code catégorie")||h==="catégorie"||h==="categorie"),
      naissance:headers.findIndex(h=>h.includes("né(e) le")||h.includes("ne(e) le")||h==="date de naissance"),
      sexe:headers.findIndex(h=>h==="sexe"),
      email:headers.findIndex(h=>h.includes("email principal")),
      tel:headers.findIndex(h=>h.includes("mobile personnel")),
      typeLic:headers.findIndex(h=>h.includes("type licence")),
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
      const anneeRaw=idx.anneeLastCertif>=0?cells[idx.anneeLastCertif]:"";
      const annee=anneeRaw.match(/\d{4}/)?.[0]||"";
      const sousCat=idx.categorie>=0?cells[idx.categorie]:"";
      const naissRaw=idx.naissance>=0?cells[idx.naissance]:"";
      let naissISO="";
      if(naissRaw){const m=naissRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);if(m)naissISO=`${m[3].padStart(4,"20")}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
      // cm = true si "Non valide", false si "Valide", null sinon
      let cm=null;
      if(validite){if(/non\s*valide/i.test(validite))cm=true;else if(/valide/i.test(validite))cm=false;}
      return{
        n:idx.nom>=0?(cells[idx.nom]||"").toUpperCase():"",
        p:idx.prenom>=0?cells[idx.prenom]||"":"",
        l:idx.numLicence>=0?cells[idx.numLicence]||"":"",
        c:mapCat(sousCat),
        sc:sousCat,
        tl:idx.typeLic>=0?cells[idx.typeLic]||"":"",
        cm,
        anneeLastCertif:annee,  // garde l'ancien format pour compat
        dn:naissISO,
        s:idx.sexe>=0?cells[idx.sexe]||"":"",
        em:idx.email>=0?cells[idx.email]||"":"",
        tel:idx.tel>=0?cells[idx.tel]||"":"",
      };
    }).filter(r=>r.n||r.p||r.l);
  };
  const handleFile=file=>{if(!file)return;const r=new FileReader();r.onload=async ev=>{try{const rows=parseCSV(ev.target.result);if(!rows.length){setMsg({ok:false,txt:"Format non reconnu."});return;}await onSave(rows);setMsg({ok:true,txt:`✅ ${rows.length} licencié(s) importé(s).`});}catch(e){setMsg({ok:false,txt:"Erreur : "+e.message});}};r.readAsText(file,"UTF-8");};
  const addManuel=async()=>{
    const nom=prompt("Nom (majuscules) :");if(!nom)return;
    const prenom=prompt("Prénom :")||"";
    const num=prompt("N° de licence FFF :")||"";
    const certifValide=prompt("Certificat médical valide pour la prochaine saison ?\n  - 'oui' = certif valide (pas besoin de médecin)\n  - 'non' = certif à renouveler\n  - vide = inconnu\n");
    let cm=null;
    if(certifValide&&/^non/i.test(certifValide))cm=true;
    else if(certifValide&&/^oui/i.test(certifValide))cm=false;
    const cat=prompt("Catégorie (ex: U13-U14, Senior, Vétéran) :")||"";
    await onSave([...licencies,{n:nom.toUpperCase(),p:prenom,l:num,cm,c:cat,tl:"Libre"}]);
    setMsg({ok:true,txt:`✅ ${nom} ${prenom} ajouté(e).`});
  };
  const filtered=srch.length>1?licencies.filter(l=>`${l.nom} ${l.prenom} ${l.numLicence}`.toLowerCase().includes(srch.toLowerCase())):licencies;

  return<div>
    <div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
      <p style={{fontWeight:700,fontSize:14,color:"#1e40af",margin:"0 0 4px"}}>👥 Base des licenciés — Saison {saison}</p>
      <p style={{fontSize:13,color:"#1e40af",margin:0,lineHeight:1.6}}>Base pré-chargée depuis Footclubs (282 entrées : joueurs, dirigeants, éducateurs).<br/><strong>Champ "Certif 26-27"</strong> issu de la colonne <em>Validité Certif Médic N+1</em>. Importez un nouveau CSV pour mettre à jour.</p>
    </div>
    <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>{handleFile(e.target.files?.[0]);e.target.value="";}}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <button style={{...BP,flex:"1 1 140px",fontSize:13,padding:"10px 14px"}} onClick={()=>fileRef.current.click()}>📥 Importer CSV Footclubs</button>
      <button style={{...BS,flex:"1 1 120px",fontSize:13,padding:"10px 14px"}} onClick={addManuel}>＋ Ajouter</button>
      {licencies.length>0&&<button style={{background:"#fee2e2",color:"#991b1b",border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:13,cursor:"pointer"}} onClick={async()=>{if(window.confirm("Réinitialiser avec la base Footclubs par défaut ?"))await onSave(BASE_FOOTCLUBS);}}>↺ Réinitialiser</button>}
    </div>
    {msg&&<div style={{background:msg.ok?"#dcfce7":"#fee2e2",border:`1px solid ${msg.ok?"#86efac":"#fca5a5"}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:msg.ok?C.V:C.R}}>{msg.txt}</div>}
    {licencies.length>0&&<input style={{...inp(),fontSize:14,marginBottom:10}} placeholder={`🔍 Rechercher parmi ${licencies.length} licenciés…`} value={srch} onChange={e=>setSrch(e.target.value)}/>}
    <div>
      <p style={{fontSize:12,color:C.G,marginBottom:8}}>{filtered.length} / {licencies.length} licencié(s)</p>
      {filtered.map((l,i)=>{
        const req=certifRequis(l);
        const realIdx=licencies.indexOf(l);
        if(editIdx===realIdx)return<div key={i} style={{background:C.Jp,border:`1px solid ${C.Jd}`,borderRadius:8,padding:"12px",marginBottom:6}}>
          <div style={G2}>
            <div><label style={{...lbl,fontSize:11}}>Nom</label><input style={{...inp(),fontSize:13}} value={editRow.n||editRow.nom||""} onChange={e=>setER(p=>({...p,n:e.target.value.toUpperCase(),nom:e.target.value.toUpperCase()}))}/></div>
            <div><label style={{...lbl,fontSize:11}}>Prénom</label><input style={{...inp(),fontSize:13}} value={editRow.p||editRow.prenom||""} onChange={e=>setER(p=>({...p,p:e.target.value,prenom:e.target.value}))}/></div>
            <div><label style={{...lbl,fontSize:11}}>N° licence</label><input style={{...inp(),fontSize:13}} value={editRow.l||editRow.numLicence||""} onChange={e=>setER(p=>({...p,l:e.target.value,numLicence:e.target.value}))}/></div>
            <div><label style={{...lbl,fontSize:11}}>Certif 26-27 ?</label>
              <select style={{...inp(),fontSize:13}} value={editRow.cm===true?"oui":editRow.cm===false?"non":""} onChange={e=>{const v=e.target.value;setER(p=>({...p,cm:v==="oui"?true:v==="non"?false:null}));}}>
                <option value="">— Inconnu</option>
                <option value="oui">🩺 Certif requis</option>
                <option value="non">✅ Certif valide</option>
              </select>
            </div>
            <div><label style={{...lbl,fontSize:11}}>Catégorie</label><input style={{...inp(),fontSize:13}} value={editRow.c||editRow.categorie||""} onChange={e=>setER(p=>({...p,c:e.target.value,categorie:e.target.value}))}/></div>
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
              {l.dn&&<span>Né(e) {fmtD(l.dn)} · </span>}
              <span style={{color:req===true?C.R:req===false?C.V:"#9ca3af",fontWeight:600}}>
                {req===true?"🩺 Certif requis 26-27":req===false?"✅ Certif valide 26-27":"❓ Inconnu"}
              </span>
            </div>
            {(l.em||l.tel)&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>
              {l.em&&<span>📧 {l.em}</span>}{l.em&&l.tel&&<span> · </span>}{l.tel&&<span>📱 {l.tel}</span>}
            </div>}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button style={{background:C.Gc,border:`1px solid ${C.Gb}`,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}} onClick={()=>{setEI(realIdx);setER({...l});}}>✏️</button>
            <button style={{background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer",color:C.R}} onClick={async()=>await onSave(licencies.filter((_,j)=>j!==realIdx))}>✕</button>
          </div>
        </div>;
      })}
    </div>
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
        <span style={{flex:1,fontWeight:700,fontSize:13,wordBreak:"break-all"}}>{e.isMajeur?e.email:e.resp1Email||"—"}</span>
        <button style={{background:"#0369a1",color:C.W,border:"none",borderRadius:6,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,minHeight:36}} onClick={()=>navigator.clipboard.writeText(e.isMajeur?e.email||"":e.resp1Email||"")}>Copier</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
      <MC title="Joueur"><DR l="Naissance" v={fmtD(e.dateNaissance)}/><DR l="Adresse" v={`${e.adresse}, ${e.codePostal} ${e.ville}`}/>{e.ancienClub&&<DR l="Ancien club" v={e.ancienClub}/>}{e.numLicenceFFF&&<DR l="N° FFF" v={e.numLicenceFFF}/>}</MC>
      {!e.isMajeur&&e.resp1Nom?<MC title="Responsable"><DR l={e.resp1Lien||"Resp."} v={`${e.resp1Prenom} ${e.resp1Nom}`}/><DR l="Tél" v={e.resp1Tel}/><DR l="Email" v={e.resp1Email}/></MC>:<MC title="Contact"><DR l="Tél" v={e.telephone}/><DR l="Email" v={e.email}/></MC>}
      <MC title="Médical"><DR l="Allergies" v={e.allergies||"—"}/><DR l="Soins" v={e.autoSoins?"✅":"❌"}/></MC>
      <MC title="Équipement"><DR l="Short" v={e.tailleShort||"—"}/><DR l="Chaussettes" v={e.tailleChaussettes||"—"}/><DR l="Survêt." v={e["tailleSurvêtement"]||"—"}/></MC>
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
  ${!e.isMajeur&&e.resp1Nom?`<h2>Responsable légal</h2><div class="grid"><div class="row"><span class="l">Identité</span><span class="v">${e.resp1Prenom} ${e.resp1Nom}${e.resp1Lien?" ("+e.resp1Lien+")":""}</span></div><div class="row"><span class="l">Téléphone</span><span class="v">${e.resp1Tel}</span></div><div class="row"><span class="l">Email</span><span class="v">${e.resp1Email}</span></div></div>`:""}
  <h2>Équipement</h2><p style="font-size:11px">Short : <b>${e.tailleShort||"—"}</b> · Chaussettes : <b>${e.tailleChaussettes||"—"}</b> · Survêtement : <b>${e["tailleSurvêtement"]||"—"}</b></p>
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
