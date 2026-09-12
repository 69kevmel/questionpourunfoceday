# Fonceday Live

Jeu de quiz en direct (animateur / joueurs / vue live pour le stream), avec choix multiple, élimination
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

- Une partie accepte de 3 à 15 joueurs.
- La première manche est un QCM simultané : une seule réponse par joueur en 15 secondes.
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

## Confort du direct et reprise

- Les joueurs retrouvent leur inscription sur le même navigateur, y compris après un rechargement. L’identité est liée à une partie ; une nouvelle partie demande une nouvelle inscription.
- La présence utilise `fonceday-presence/{gameId}/{playerId}/{connectionId}` et `onDisconnect`. Plusieurs onglets sont pris en compte. Le compteur d’inscrits reste distinct de la présence.
- Les écritures de réponses n’apparaissent confirmées qu’après validation de la transaction Firebase. Pendant une coupure, une nouvelle soumission est bloquée ; un envoi déjà engagé attend sa confirmation ou son échec.
- L’animateur peut mettre le chrono en pause, le reprendre et annuler sa dernière action. L’annulation restaure les scores et les réponses précédents ; un chrono restauré reste en pause. Les réponses reçues depuis l’action annulée sont remplacées après confirmation.
- Le calendrier prévoit une émission tous les 14 jours à partir du dimanche 20 septembre 2026 à 16 h 20 (heure de Paris). L’accueil affiche automatiquement la prochaine émission et les sept suivantes ; la date du jour reste visible jusqu’à minuit à Paris. L’heure reste identique lors des changements d’heure et le calendrier continue les années suivantes. Le lobby animateur permet de choisir un autre premier dimanche et un horaire : `fonceday-settings/nextShow` sert alors de point de départ à la récurrence. « Rétablir le calendrier du 20 septembre » revient au calendrier par défaut.
- Les règles Firebase du déploiement doivent autoriser les opérations de présence appropriées et réserver la modification des réglages à l’animateur. Les règles distantes ne sont pas modifiées par ce projet.

## Finale et réponses libres

Le classement passe aux points de finale et aux deux finalistes. La banque finale normale exclut les questions marquées « Réserver à la mort subite ». À égalité, les réserves sont jouées une par une ; après chaque correction, « Continuer » détermine immédiatement le gagnant s’il y en a un.

Sans réserves personnalisées, dix QCM de calcul indépendants sont ajoutés à la copie de la partie. Les réserves répétant une question normale sont exclues. Une fois les réserves épuisées, la partie attend une nouvelle question saisie par l’animateur au lieu de rejouer des réponses connues.

Chaque réponse libre reçue doit être acceptée ou refusée manuellement avant publication des points. Les suggestions tolèrent accents, casse, espaces et variantes saisies dans le gestionnaire. La décision de l’animateur prévaut.

## Gestion des questions

Lire une banque ne déclenche plus de migration ni d’écriture. Les banques personnalisées anciennes et les listes vides sont conservées. Ajout, modification, déplacement entre manches et réorganisation utilisent des transactions. Les champs inutiles sont retirés avant l’envoi à Firebase ; une cible numérique vide est refusée, zéro reste valide. La suppression demande une confirmation et les échecs d’écriture sont affichés.

## Répétition locale

Ouvrir `/?demo=1`, ou utiliser le lien du lobby animateur. Cette page ne s’abonne pas à Firebase et n’y écrit pas. Elle propose 3 à 15 joueurs fictifs, des réponses automatiques, les vues animateur/joueur/live et des scénarios de finale, réponse libre et réserves épuisées. Elle utilise le même moteur, les mêmes limites de temps et les mêmes corrections que la partie réelle. Recharger la page réinitialise la répétition.
