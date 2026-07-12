# Fonceday Live

Jeu de quiz en direct (animateur / joueurs / vue live pour le stream), avec buzzer, élimination
progressive par manche, et synchronisation temps réel entre tous les appareils via Firebase
Realtime Database.

## Mise en place de la synchronisation (Firebase)

Sans configuration, chaque appareil aurait sa propre partie isolée : l'animateur, les joueurs et
la vue live ne se verraient jamais entre eux. Il faut donc créer un projet Firebase gratuit (une
seule fois) :

1. Va sur https://console.firebase.google.com et crée un nouveau projet (gratuit).
2. Dans le menu de gauche : **Build > Realtime Database** > "Créer une base de données". Choisis
   une région proche, puis démarre **en mode test** pour commencer (règles à sécuriser ensuite,
   voir plus bas).
3. Va dans **⚙️ Paramètres du projet > Général**, descends jusqu'à "Vos applications", clique sur
   l'icône Web (`</>`) pour enregistrer une nouvelle app, puis copie les valeurs de config
   affichées (`apiKey`, `authDomain`, `databaseURL`, etc.).
4. Copie `.env.example` vers `.env` à la racine du projet et colle les valeurs récupérées.
5. Relance `npm run dev`.

### Déploiement sur Vercel

Ajoute les mêmes variables (`VITE_FIREBASE_*`) dans **Project Settings > Environment Variables**
sur Vercel, puis redéploie. Comme Firebase Realtime Database est un service cloud (pas un serveur
que tu héberges toi-même), la synchronisation fonctionne de la même façon en local et une fois
déployé : tous les appareils (animateur, joueurs, vue live) se connectent au même projet Firebase
via internet.

### Sécuriser les règles (recommandé avant le vrai live)

Le mode test autorise la lecture/écriture à tout le monde pendant 30 jours. Avant l'événement,
va dans **Realtime Database > Règles** et remplace par quelque chose comme :

```json
{
  "rules": {
    "fonceday-game-state": {
      ".read": true,
      ".write": true
    }
  }
}
```

(Ceci reste ouvert en écriture — suffisant pour un jeu sans compte utilisateur — mais limite la
portée aux données du jeu plutôt qu'à toute la base.)

## Développement

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
