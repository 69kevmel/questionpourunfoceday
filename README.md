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

### Sécurité Firebase

Ne déploie pas les règles Realtime Database avec une écriture publique générale. L'application
valide les actions dans des transactions, mais une personne qui appelle directement l'API Firebase
peut contourner le client. Pour un événement non privé, ajoute Firebase Authentication, un rôle
animateur vérifié côté serveur et des règles séparant les actions joueur des transitions animateur.

Le mot de passe de l'écran animateur est seulement une barrière d'interface. Un secret intégré à
une application Vite est toujours visible dans le navigateur et ne remplace pas une authentification
serveur.

## Partie

- Une partie accepte de 5 à 15 joueurs.
- La vue publique est disponible sur `/live`.
- Les égalités au seuil d'élimination sont départagées par l'animateur.
- La finale utilise un score dédié et continue en mort subite en cas d'égalité.

## Développement

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Vérifications

```bash
npm test
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```
