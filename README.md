# TopicLive+

## Introduction

<p>TopicLive+ est le projet de reprise et d'amélioration du script TopicLive par Kiwec.<br>
C'est un userscript pour jeuxvideo.com qui charge les messages des forums en direct. Plus besoin de rafraichir la page !<br>
Un bouton de navigation vous mène au dernier message posté et lance le mode chat, les messages sont alors chargés automatiquement avec un scroll continu.

Si un nouveau message est posté un compteur de nouveaux messages apparait. Cliquez dessus pour atteindre ces messages directement. La favicon se mettra aussi à jour.</p>

<p>Voir le Changelog pour le détail des dernières mises à jour du script.</p>

## Installation

- Installez ViolentMonkey ou Tampermonkey.

- Installez TopicLive+ en [cliquant ici](https://github.com/moyaona/TopicLivePlus/raw/refs/heads/main/TopicLivePlus.user.js) (Vous obtiendrez les dernières màjs automatiquement)

## Améliorations par rapport au script original

  ### Nouveautés majeures
- Refondation du système de chargement automatique des messages : un mode chat qui fait défiler les messages automatiquemement, un mode lecture qui charge les nouveaux messages sans défilement automatique (façon discord).
- En mode lecture : Ajout d'un bouton "Nouveaux Messages" sur la page qui comptabilise le nombre de nouveaux messages et présente un compteur décrémentiel. <br> Ce bouton permet d'accéder directement en scrollant aux derniers messages postés.<br> En l'absence de nouveaux messages s'affichera un bouton "Revenir au direct" qui permet d'atteindre le dernier message du topic et de repasser en mode chat.
- Ajout d'un compteur de nouveaux messages décrémentiel en favicon qui s'actualise en fonction des nouveaux messages lus.
- Chargement automatique des messages postés par l'utilisateur sans nécessiter d'actualisation de la page.
- Fix des citations des nouveaux messages chargés automatiquement.

  ### Nouveautés mineures
- Fix de la favicon jvc qui ne s'affichait pas de suite en chargeant un topic.
- Modification esthétique du compteur de nouveaux messages en favicon.
- Exclusion du script des MP.
- Fix de l'audio et remplacement par une notification plus douce.
- Ajout d'options de personnalisation (activer Son, Compteur favicon, Bouton "Nouveaux Messages").
- Ajout d'un logo pour le script.

## Améliorations envisagées
- Compatibilité avec les options ajoutées par Déboucled et Risibank.
- Permettre le fonctionnement du script sur toutes les pages d'un topic et pas uniquement la dernière.
- Faire fonctionner le script pour l'actualisation des MP.
- Intégrer des boutons de navigation mobile.
- Intégrer un compteur de connectés flottant.
- Menu contextuel dédié.

## Crédits
- Kiwec : Base du script / https://github.com/kiwec (script original disponible ici : https://github.com/moyaona/TopicLive_Enhanced )
- Lantea (github) / Atlantis (jvscript) : Aide et conseils; Fix des citations / https://github.com/Lantea-Git / https://jvscript.fr/search/Atlantis
- Moyaona : Refondation du script
