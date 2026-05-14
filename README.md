# RSG Preinscription

Application web de preinscription et de gestion administrative pour le club de football **Reveil Saint-Gereon**.

L'objectif est de simplifier les inscriptions, renouvellements de licence, permanences, paiements, dotations equipement, boutique club et suivi administratif Footclubs depuis une interface unique, accessible en ligne.

## Acces

- Application publique : https://u5237661020-cmyk.github.io/rsg-preinscription/
- Formulaire familles : preinscription en ligne
- Espace bureau : gestion administrative du club
- Interface permanence : validation rapide pendant les permanences de licence
- Interface equipement : suivi boutique et dotations

Aucun code d'acces, secret API ou identifiant prive n'est documente dans ce README.

## Fonctionnalites principales

### Formulaire public de preinscription

Le formulaire permet aux familles et membres du club de saisir une preinscription complete en ligne.

Fonctionnalites :

- choix du type de licence : renouvellement, nouvelle licence, retour au club ;
- saisie du numero de licence FFF pour pre-remplir les informations connues ;
- detection d'un joueur deja present dans la base club ;
- gestion des nouvelles licences avec suivi du club precedent et mutations ;
- categorie calculee avec aide par annees de naissance ;
- distinction joueurs, veterans, seniors et dirigeants ;
- possibilite de double licence joueur / dirigeant pour les categories concernees ;
- nationalites completes, dont Ukrainienne et Libanaise ;
- photo d'identite obligatoire ;
- representants legaux pour les mineurs, avec possibilite d'ajouter un second representant ;
- autorisations obligatoires ou cochees selon le besoin : soins d'urgence, droit a l'image, transport ;
- acceptation de la charte du club en fin de formulaire ;
- informations medicales simplifiees ;
- certificat medical demande selon le type de licence, l'arbitrage et la validite connue ;
- lien vers le certificat medical PDF si besoin ;
- choix des tailles pour la dotation licence configuree par categorie ;
- initiales personnalisables sur certains equipements, avec supplement configurable ;
- ajout de membres d'une meme famille dans un seul dossier ;
- nom de famille obligatoire pour regrouper les dossiers famille ;
- calcul automatique du tarif selon categorie, remises famille et supplements ;
- choix indicatif d'un ou plusieurs modes de paiement ;
- paiement final realise lors des permanences de licence ;
- recapitulatif complet avant envoi ;
- affichage des pieces a preparer uniquement a la fin de la preinscription ;
- indication claire que la validation finale se fait en permanence apres reception du paiement.

### Espace admin

L'espace admin centralise le pilotage de la saison.

Fonctionnalites :

- tableau de bord global avec indicateurs ;
- choix de la saison publique du formulaire ;
- choix de la saison de travail admin ;
- synchronisation Firebase en temps reel ;
- liste complete des dossiers ;
- recherche par nom, prenom, email, reference ou membre de famille ;
- filtres par statut, categorie et type de licence ;
- consultation detaillee des dossiers en popup ;
- modification complete des informations du membre ;
- statut de dossier visible et modifiable rapidement ;
- enregistrement automatique des changements de statut ;
- statut dans l'ordre : En attente, Incomplet, Valide, Refuse ;
- mention claire que le statut Valide signifie dossier paye ;
- vues par categorie de joueurs ;
- vues par type : renouvellements, nouvelles licences, familles, dirigeants, feminines, jeunes, adultes ;
- vue familles et multi-licences ;
- gestion des mutations ;
- suivi des joueurs non encore reinscrits depuis la base Footclubs ;
- visualisation des renouveles ;
- affichage des photos dans les listes ;
- exports Excel par onglet, par categorie ou par type selon les vues ;
- donnees exportees enrichies : contacts, famille, categories, paiements, documents, equipements, notes, statuts.

### Gestion des familles et multi-licences

L'application gere les cas reels du club :

- plusieurs membres d'une meme famille dans un seul dossier ;
- melange renouvellement et nouvelle licence dans une meme famille ;
- adulte inscrit avec enfant ;
- double licence joueur et dirigeant ;
- regroupement par nom de famille ;
- consultation de chaque membre de la famille ;
- detail complet en popup ;
- remises famille configurables ;
- possibilite de masquer l'affichage des remises si elles sont configurees a zero.

### Permanences de licence

Une interface separee permet aux benevoles de traiter rapidement les dossiers pendant les permanences.

Fonctionnalites :

- liste des dossiers a traiter ;
- vue par categorie ;
- recherche rapide ;
- ouverture du dossier en popup ;
- modification des informations du membre ;
- changement rapide du statut ;
- enregistrement automatique ;
- suivi des documents fournis ;
- notes internes du secretariat ;
- affichage photo du membre ;
- suivi des paiements ;
- ajout d'achats boutique pendant la permanence ;
- distinction entre boutique liee a la permanence et commandes saison separees ;
- impression de fiche ;
- preparation ou generation d'attestation selon le statut.

### Configuration

L'onglet Configuration permet au bureau d'adapter l'application sans modifier le code.

Parametres gerables :

- tarifs par categorie ;
- ordre des categories ;
- remises famille ;
- codes d'acces bureau ;
- saison publique du formulaire ;
- saison de travail admin ;
- modes de paiement proposes ;
- possibilite de paiement fractionne selon le mode ;
- permanences de licence : dates, horaires et lieu ;
- pieces a fournir ;
- texte et template complet de l'attestation de licence ;
- dotations equipement licence par categorie ;
- produits boutique ;
- cout des initiales ;
- equipements autorises ou non pour les initiales.

### Dotation equipement licence

L'application permet de suivre les equipements compris avec la licence.

Fonctionnalites :

- configuration des dotations par categorie ;
- choix des tailles dans le formulaire public ;
- guide tailles Kappa lie depuis le formulaire ;
- vues de synthese par categorie ;
- vues par taille ;
- liste nominative ;
- affichage photo du membre ;
- export Excel ;
- suivi des initiales sur equipement ;
- distinction entre dotation licence et achats boutique hors dotation.

### Boutique et equipement

La partie equipement permet de suivre les commandes faites au club pendant la saison.

Fonctionnalites :

- gestion des produits boutique ;
- categories de produits ;
- photos des produits ;
- tailles et options ;
- prix configurables ;
- commandes hors dotation ;
- commandes ajoutees pendant les permanences ;
- commandes ajoutees plus tard dans la saison par le bureau ;
- initiales possibles selon configuration ;
- suivi par personne ;
- statut de commande : a regler, regle, commande, en attente fournisseur, recu club, livre, annule ;
- passage automatique des achats en regle si la commande permanence est payee ;
- vue complete par membre avec dotation et hors dotation ;
- filtre par categorie de foot ;
- export global et export par categorie.

### Footclubs

L'onglet Footclubs aide le secretariat a suivre l'integration administrative des licences.

Fonctionnalites :

- liste des licences reglees / validees ;
- statut Footclubs independant du statut de paiement ;
- statuts : a integrer, integre, incomplet dans Footclubs, valide dans Footclubs ;
- commentaires pour indiquer ce qui manque ou bloque ;
- detail du membre en popup ;
- copie rapide des informations utiles ;
- telechargement de la photo du membre ;
- suivi des certificats et informations necessaires.

### Certificats medicaux

L'application distingue les besoins de certificat medical selon les informations connues.

Fonctionnalites :

- vue des joueurs necessitant un certificat depuis la base Footclubs ;
- vue des inscrits necessitant un certificat ;
- prise en compte des nouvelles licences ;
- prise en compte de l'arbitrage ;
- information claire pour prendre rendez-vous chez le medecin si besoin ;
- lien vers le certificat medical PDF.

### Paiements

L'application facilite le suivi financier sans encaisser directement en ligne.

Fonctionnalites :

- modes de paiement configurables ;
- choix indicatif de plusieurs modes de paiement ;
- paiement effectif prevu en permanence ;
- prise en charge du paiement en plusieurs fois ;
- choix des dates d'encaissement ;
- affichage des echeances ;
- suivi des dossiers valides/payes ;
- distinction licence, boutique permanence et commandes saison separees ;
- exports de paiement.

### Attestations de licence et emails

L'application prepare l'envoi des attestations de licence quand un dossier est valide.

Fonctionnalites :

- generation d'une attestation au nom du membre ;
- template complet modifiable ;
- bouton de preparation de l'email ;
- suivi de l'envoi d'attestation ;
- statut visible : envoye, en cours, erreur ;
- date d'envoi conservee dans le dossier ;
- possibilite de renvoi manuel ;
- architecture prevue pour utiliser un fournisseur email transactionnel configure cote serveur.

## Categories gerees

Le formulaire public conserve une presentation simple :

- Babyfoot
- U6/U7
- U8/U9
- U10/U11
- U12/U13
- U14/U15
- U16/U17/U18
- Seniors
- Veterans
- Dirigeants

L'admin utilise des categories plus precises pour le suivi :

- Babyfoot
- U6/U7
- U8/U9
- U10/U11M
- U10/U11F
- U12/U13M
- U12/U13F
- U14/U15M
- U14/U15F
- U16/U17/U18M
- U16/U17/U18F
- Seniors M
- Seniors F
- Veterans
- Dirigeants

Types de structure :

- Ecole de foot RSG : Babyfoot a U11 ;
- Groupement Jeunes ASM/RSG : U12 a U18 masculins, U10 a U18 feminines ;
- Reveil Saint-Gereon : seniors, veterans, dirigeants et autres cas.

## Exports Excel

Les exports sont prevus pour fournir des fichiers utiles directement au bureau.

Exemples de donnees exportees :

- identite du membre ;
- contact principal ;
- representants legaux ;
- categorie licence ;
- categorie admin ;
- type de licence ;
- statut dossier ;
- statut Footclubs ;
- informations mutation ;
- documents fournis ;
- besoins certificat ;
- tailles de dotation ;
- initiales ;
- paiements ;
- echeances ;
- boutique permanence ;
- commandes hors dotation ;
- notes secretariat.

## Technologies

- React
- Vite
- Firebase Firestore pour la synchronisation temps reel
- Firebase Functions pour les traitements serveur
- Firebase Hosting ou GitHub Pages selon le mode de publication
- Exports Excel generes cote navigateur

## Donnees et confidentialite

L'application manipule des donnees personnelles liees aux licences sportives.

Bonnes pratiques :

- limiter l'acces admin aux membres du bureau ;
- ne pas publier de codes d'acces dans le depot GitHub ;
- ne pas stocker de cles API dans le code public ;
- utiliser Firebase Secrets pour les cles serveur ;
- exporter uniquement les informations necessaires ;
- supprimer ou archiver les donnees inutiles en fin de saison ;
- reimporter la base Footclubs manuellement a chaque nouvelle saison.

## Lancement local

Installer les dependances :

```bash
npm install
```

Lancer en local :

```bash
npm run dev
```

Construire la version de production :

```bash
npm run build
```

Publier sur GitHub Pages :

```bash
npm run deploy
```

## Structure du projet

```text
rsg-preinscription/
├── src/
│   ├── App.jsx
│   ├── firebase.js
│   └── main.jsx
├── functions/
│   └── index.js
├── public/
├── firestore.rules
├── firebase.json
├── package.json
├── vite.config.js
├── WIKI.md
└── README.md
```

## Documentation utilisateur

Le fichier `WIKI.md` complete ce README avec une documentation plus pratique pour les utilisateurs de l'espace admin.

## Statut

Application concue pour la gestion des preinscriptions et licences du Reveil Saint-Gereon pour la saison en cours, avec configuration par saison pour faciliter la reprise chaque annee.
