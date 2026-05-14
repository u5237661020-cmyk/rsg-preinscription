# Wiki - Application de preinscription RSG

## Objectif

L'application a ete developpee pour faciliter les inscriptions au Reveil Saint-Gereon avec un formulaire de preinscription en ligne et un espace bureau/secreteriat pour suivre les dossiers.

URL de test :
https://u5237661020-cmyk.github.io/rsg-preinscription/



Les codes d'acces sont modifiables dans l'administration.

## Parcours famille

- Preinscription en ligne pour un joueur ou plusieurs membres d'une meme famille.
- Gestion des renouvellements et des nouvelles licences.
- Un membre d'une meme famille peut etre en renouvellement pendant qu'un autre est en nouvelle licence.
- Detection possible par numero de licence FFF.
- Si un joueur deja connu dans la base est detecte, il ne peut pas etre inscrit comme nouveau joueur.
- Pour une nouvelle licence, le formulaire demande si le joueur etait dans un autre club la saison precedente.
- Les joueurs avec ancien club sont suivis dans l'onglet mutations.

## Medical et autorisations

- Gestion du certificat medical selon la base Footclubs.
- Onglet Certifs avec deux vues :
  - Base Footclubs : tous les joueurs necessitant un certificat.
  - Preinscrits : uniquement les dossiers deja preinscrits.
- Lien vers le certificat medical a faire remplir par le medecin.
- Acceptation obligatoire de la charte RSG.
- Autorisation droit a l'image et transport en vehicule personnel en fin de formulaire.
- Autorisation de soins d'urgence dans la partie medicale.

## Tarifs et paiements

- Tarifs par categorie dans l'ordre : Babyfoot, U6/U7, U8/U9, U10/U11, U12/U13, U14/U15, U16/U17/U18, Seniors, Veterans, Dirigeants.
- Tarifs modifiables dans l'administration.
- Remises famille modifiables.
- Paiement par CB, cheque, especes ou RIB/virement.
- Paiement en plusieurs fois possible avec choix des dates d'encaissement.
- Le statut `Valide` signifie que la licence est reglee/payee.

## Permanences

- Dates, heures et lieux des permanences modifiables dans l'administration.
- Les documents a fournir apparaissent uniquement a la fin de la preinscription.
- Les pieces a fournir sont modifiables dans l'administration.
- Page Permanence adaptee pour verifier les dossiers.
- Changement de statut en enregistrement automatique au clic.

## Boutique club

- Gestion des produits par categorie.
- Photos produits, tailles/options, prix et disponibilite modifiables.
- La boutique n'apparait pas dans la preinscription publique.
- Ajout d'achats par les membres du bureau pendant les permanences ou plus tard dans la saison.
- Separation entre :
  - Boutique permanence licence : ajoutee au paiement licence.
  - Commande saison : reglement separe de la licence.
- Suivi des statuts boutique : a regler, regle, commande, attente fournisseur, recu club, livre, annule.
- Visualisation des commandes par categories de joueurs.

## Secreteriat / Administration

- Navigation verticale plus lisible.
- Onglets principaux : Liste, Par categorie, Par type, Mutations, Manquants, Paiements, Tailles, Certifs, Permanences, Pieces, Boutique, Exports, Footclubs, Tarifs & remises, Base.
- Modification des informations d'un membre.
- Suivi des documents fournis.
- Ajout de notes secreteriat.
- Generation d'une attestation de licence.
- Preparation d'un email d'attestation.

## Exports

Un onglet Exports permet de generer des fichiers Excel :

- Tous dossiers.
- Par equipe.
- Paiements.
- Boutique.
- Tailles.
- Certificats.
- Contacts.
- Base licencies.

## Saisons

- Le public ne peut pas choisir la saison.
- Le formulaire public utilise la saison ouverte par le bureau.
- Dans l'administration, le bureau peut choisir la saison de travail.
- Le bureau peut aussi definir la saison publique du formulaire.

## Points a tester

- Faire une preinscription simple.
- Faire une preinscription famille avec un renouvellement et une nouvelle licence.
- Tester un joueur deja present dans la base.
- Tester une nouvelle licence avec ancien club.
- Passer un dossier en `Valide`.
- Ajouter un achat boutique permanence.
- Ajouter une commande boutique saison.
- Verifier les exports.
- Modifier les tarifs, remises, permanences et pieces a fournir.
