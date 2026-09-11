# Ink AFK Tracker V2

V2 totalement séparée du tracker V1. Elle suit trois profils Roblox avec des données isolées : Ilan, Ruben et Naïm.

## Configuration métier

| Profil | Roblox | User ID | Intervalle | Base AFK | Base récompenses | Discord |
|---|---|---:|---:|---:|---:|---|
| Ilan | `xx_nalyy` | `2282558809` | 25 min | 71 h | 170 | début + fin |
| Ruben | `RUBANSU1` | `3671739729` | 30 min | 0 | 0 | désactivé |
| Naïm | `Toussant935` | `6226787995` | 25 min | 0 | 0 | désactivé |

- Ink Game Place ID : `99567941238278`
- AFK World Place ID : `135136333168784`
- Fuseau des jours et du calendrier : `Europe/Paris`

Chaque session est arrondie séparément : `floor(durée / intervalle)`. Aucun reliquat ne passe à la session suivante.

Une première présence `Offline` pendant une session ne la clôture pas immédiatement. Elle passe en attente de confirmation :

- retour dans l’AFK World au scan suivant : même session continuée, trou conservé ;
- second scan `Offline` : fin confirmée à l’heure du premier scan Offline ;
- changement direct vers Ink Game ou un autre jeu : fin immédiate.

## Administration

Le bouton `ADMIN` utilise uniquement `ADMIN_SECRET`. Une fois connecté, les crayons du dashboard permettent de corriger les totaux et chaque donnée utile d’une session.

- création, modification et suppression de sessions ;
- sélection de plusieurs sessions puis fusion, en incluant la fausse coupure ;
- recalcul automatique de la durée, des récompenses, du temps crédité et des totaux ;
- option explicite `Désynchroniser les changements` pour conserver des valeurs manuelles indépendantes sur une session ;
- confirmation séparée de l’obtention du Titre, d’Ultra Instinct et de Rumor. Ultra Instinct et Rumor sont regroupés visuellement sous `Mythic Power` tout en restant suivis séparément.

Chaque confirmation d’obtention mémorise la date, le nombre total de récompenses et le temps AFK total au moment de la confirmation.

Toutes les actions restent isolées par profil et sont inscrites dans les logs.

## Variables d’environnement

Copier `.env.example` vers `.env.local` uniquement dans ce projet V2 :

```text
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
ADMIN_SECRET=
DISCORD_WEBHOOK_URL=
```

Ne jamais réutiliser les identifiants Redis de la V1.

## Commandes locales

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

Avec la nouvelle base configurée dans `.env.local` :

```bash
npm run test:redis
```

Avec le serveur local démarré :

```bash
npm run test:api
```

## Vérification toutes les minutes

Vercel Hobby ne permet pas un cron chaque minute. Créer un job sur cron-job.org :

- URL : `https://URL-V2.vercel.app/api/check`
- méthode : `GET`
- fréquence : chaque minute
- header : `Authorization`
- valeur : `Bearer VALEUR_DE_CRON_SECRET`

Un seul appel vérifie les trois comptes dans une requête Roblox batch.

## Stockage Redis V2

Les clés canoniques suivent cette structure :

```text
ink:v2:profiles:ilan:state
ink:v2:profiles:ilan:base
ink:v2:profiles:ilan:stats
ink:v2:profiles:ilan:sessions
ink:v2:profiles:ilan:adjustments
ink:v2:profiles:ilan:logs
ink:v2:profiles:ilan:achievements
```

Le même schéma est utilisé avec les préfixes `ruben` et `naim`.
