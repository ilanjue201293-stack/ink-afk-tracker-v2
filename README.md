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
```

Le même schéma est utilisé avec les préfixes `ruben` et `naim`.
