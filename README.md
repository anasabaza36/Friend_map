# FriendMap

Real-time friend location tracker with granular privacy controls. Built with
Vue 3, NestJS, PostgreSQL, Redis, and Socket.IO.

---

## Product Overview

FriendMap lets you and your friends share live GPS locations with each other
while retaining fine-grained control over who can see you at any time.

Every sharing change (including Ghost mode) propagates to authorized viewers
in under 2 seconds, and every GPS update is validated server-side (speed,
order, freshness) before broadcast. Non-friends never see your location and
there is no global broadcast channel — all updates are sent only to
individually authorized Socket.IO rooms.

The frontend is intentionally simple: a Leaflet map, a friends list, and a
privacy settings page. Correctness, security, and real-time behavior take
priority over visual polish.

---

## Features

- **Authentication** — JWT register / login / logout with protected routes
  and automatic redirect on expired tokens.
- **Friend system** — send/receive/accept/reject friend requests, remove
  friends, search by email or username.
- **Four sharing modes (per-user)**:
  - **Ghost** — nobody sees your location.
  - **Everyone** — all confirmed friends see you.
  - **Selected** — only friends you explicitly check see you.
  - **Except Selected** — all friends except those you explicitly check.
- **Session-level Stop Viewing** — hide a specific friend's markers for the
  current browser session without affecting their sharing settings.
- **Leaflet map** — shows current user and authorized friends with:
  - avatar-style custom markers (initials when no avatar)
  - username and relative update time (`just now`, `20 sec ago`, `2 min ago`, …)
  - stale marker styling after 60+ seconds without an update
  - marker pop-up with last update, sharing status, and Stop/Resume viewing
- **Socket.IO real-time updates**
  - `location:updated` — friend moved
  - `location:hidden` — remove friend marker immediately (no polling)
  - `sharing:changed` — sharing mode for a friend changed
- **Server-side location validation**
  - timestamp freshness (< 60 s old, < 10 s in the future)
  - strictly increasing timestamp (rejects out-of-order/replay updates)
  - impossible movement detection (max 500 km/h implied ground speed)
  - coordinate and accuracy range checks
  - per-user rate limit
- **24 h location history** retention for the owner only; current locations
  live in Redis with a TTL for hot read performance.
- **Socket.IO + Redis Adapter** so multiple backend instances stay in sync
  for horizontal scaling.

---

## Tech Stack

| Layer       | Tech                                          |
| ----------- | --------------------------------------------- |
| Frontend    | Vue 3 + TypeScript + Pinia + Vue Router       |
| Maps        | Leaflet 1.9 + OpenStreetMap tiles             |
| Real-time   | Socket.IO Client 4.8                          |
| HTTP Client | Axios                                         |
| API         | NestJS 10 + TypeScript (strict)               |
| Auth        | Passport JWT + bcrypt (12 rounds)             |
| Validation  | class-validator + class-transformer DTOs      |
| Real-time   | Socket.IO 4.8 + @socket.io/redis-adapter      |
| Cache/Hot   | Redis 7 + ioredis                             |
| DB          | PostgreSQL 16 + Prisma 6 ORM                  |
| Rate limit  | Redis-backed sliding window in `LocationRateLimitService` |
| Deploy      | Docker + Docker Compose                       |

---

## Getting Started

### Prerequisites

- Docker ≥ 24 with Docker Compose v2
- Or Node.js 20+ and npm if you want to run services locally

### Quick start with Docker Compose (clean clone)

```bash
cp .env.example .env   # optional — defaults are embedded in compose
docker compose up --build
```

On first boot the backend container automatically runs:

1. `npx prisma migrate deploy` — applies all migrations.
2. `npx prisma db seed` — seeds demo users (see below).
3. `node dist/src/main.js` — starts the NestJS application on port 3000.

Frontend is served through nginx on port 5173.

Once all services report healthy:

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000
- **Backend health:** http://localhost:3000/health (returns Postgres + Redis status)

### Demo seed users

All seeded users share the `DEMO_PASSWORD` (default `DemoPassword123!`,
overridable via env).

| Email               | Username | Sharing mode          |
| ------------------- | -------- | --------------------- |
| alice@example.com   | alice    | Everyone              |
| bob@example.com     | bob      | Selected (→ david)    |
| charlie@example.com | charlie  | Except Selected (→ no emma) |
| david@example.com   | david    | Ghost                 |
| emma@example.com    | emma     | Ghost                 |

Pre-seeded friendships: Alice↔Bob, Alice↔Charlie, Bob↔David, Charlie↔Emma.

### Running locally without Docker

Backend:

```bash
cd backend
cp .env.example .env   # adapt DATABASE_URL / REDIS_HOST for local services
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run start:dev     # :3000
```

Frontend:

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:3000 npm run dev   # :5173
```

### Environment variables

| Variable           | Default                                             | Notes                                     |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| `POSTGRES_USER`    | `friendmap`                                         | Postgres role                             |
| `POSTGRES_PASSWORD`| `friendmap_secret`                                  | Postgres password                         |
| `POSTGRES_DB`      | `friendmap`                                         | Postgres database                         |
| `DATABASE_URL`     | built from Postgres vars in Docker                  | Prisma connection string                  |
| `REDIS_HOST`       | `redis` (Docker) / `localhost`                      | Redis host                                |
| `REDIS_PORT`       | `6379`                                              | Redis port                                |
| `JWT_SECRET`       | `change-me-to-a-long-random-secret-in-production`   | **Change in production!**                 |
| `JWT_EXPIRES_IN`   | `7d`                                                | Access token TTL                          |
| `BACKEND_PORT`     | `3000`                                              | Host port for backend                     |
| `FRONTEND_PORT`    | `5173`                                              | Host port for frontend                    |
| `VITE_API_URL`     | `http://localhost:3000`                             | **Build-time** frontend API URL           |
| `NODE_ENV`         | `development`                                       | `production` enables production Nest mode |
| `DEMO_PASSWORD`    | `DemoPassword123!`                                  | Shared seed password for all demo users   |

### Migrations

```bash
cd backend
npx prisma migrate dev      # create + apply new migrations (dev)
npx prisma migrate deploy   # apply all pending migrations (production / Docker)
npx prisma migrate status   # inspect migration state
```

All migrations live in `backend/prisma/migrations/`.

### Seed

```bash
cd backend
npx prisma db seed
```

Idempotent: uses upserts. Demo password is read from `DEMO_PASSWORD`.

---

## Architecture

```text
Vue 3 Frontend (Leaflet + Pinia + Socket.IO Client)
   |
HTTP (Axios, JWT Bearer)  +  WebSocket (Socket.IO, auth token)
   |
NestJS Backend
   · JWT Auth Guard (HTTP + WebSocket)
   · DTO Validation Pipe (class-validator, whitelist)
   · LocationVisibilityService authorization
   · LocationValidationService GPS checks
   |
   +----------------------+-----------------------+
   |                                              |
PostgreSQL 16 (durable)                          Redis 7 (hot)
├─ users                                          ├─ current locations (TTL)
├─ friend_requests                                ├─ presence / heartbeats
├─ friendships                                    ├─ Socket.IO pub/sub via
├─ sharing_settings                                 @socket.io/redis-adapter
├─ sharing_selected_friends                      ├─ rate-limit counters
├─ sharing_except_friends                        └─ stop-viewing (session-level)
└─ location_history (24h retention, owner-only)
```

Key rules:

- The **frontend is never trusted** — authorization, validation, speed,
  ordering, privacy checks, and rate limiting all live in the backend.
- There is **no global broadcast** channel. Each user has a dedicated
  Socket.IO room (`user:{id}`), and the gateway emits location events only
  into rooms whose users pass `canViewerSeeOwner` **and** are not in a
  session-level stop-viewing state.

---

## Data Model

### User
`id (uuid, PK)`, `email (unique)`, `username (unique)`, `passwordHash`,
`avatarUrl`, `createdAt`, `updatedAt`. Passwords are stored as
**bcrypt hashes only**.

### FriendRequest
`id (PK)`, `senderId → User`, `receiverId → User`,
`status ∈ {PENDING, ACCEPTED, REJECTED}`, timestamps. Unique on
`(senderId, receiverId)` — no duplicate request pairs.

### Friendship
Normalized pair `(userAId, userBId)` sorted, unique, indexed on both sides.
Created when a friend request is accepted; deleted when either party removes
the other.

### SharingSettings
One-to-one with User. `mode ∈ {GHOST, EVERYONE, SELECTED, EXCEPT_SELECTED}`.
Defaults to `GHOST` when no row exists (via `SharingService.getModeForUser`),
which is the strictest possible default.

### Selected / Except relationships

- `SharingSelectedFriend(ownerId, friendId)` — compound PK, the explicit
  allow-list for `SELECTED` mode.
- `SharingExceptFriend(ownerId, friendId)` — compound PK, the explicit
  block-list for `EXCEPT_SELECTED` mode.

Both require a confirmed friendship (`SharingService.assertConfirmedFriends`)
before they can be written — users can't sneak random IDs into sharing lists.

### LocationHistory
Append-only owner-owned log: `userId`, `lat`, `lng`, `accuracy`, `timestamp`,
`createdAt`. Indexed on `(userId, timestamp)` for efficient per-user history
lookup and on a scheduled cleanup job the backend enforces 24 h retention
by deleting rows older than 24 h at write time via
`LocationHistoryService.saveEntry`.

Current (hot) locations are **not** pulled from Postgres at read time — they
live in Redis and are written asynchronously to history.

---

## Real-Time Flow

```text
Phone GPS
   │
   ▼  location:update  (Socket.IO, authenticated via JWT)
LocationGateway.handleLocationUpdate
   │
   ├─ SocketJwtAuthService.authenticate       — JWT verification → User
   ├─ ValidationPipe + LocationUpdateDto      — schema validation
   ├─ LocationRateLimitService                — per-user sliding window
   ├─ LocationValidationService.validateUpdate
   │     ├─ coordinate range (-90/90, -180/180)
   │     ├─ accuracy ≥ 0
   │     ├─ timestamp: not stale, not too-future
   │     ├─ strictly newer than previous timestamp (anti-replay)
   │     └─ implied ground speed ≤ 500 km/h (Haversine)
   ├─ LocationRedisService.setCurrentLocation — TTL hot state
   ├─ LocationHistoryService.saveEntry        — durable append + 24h cleanup
   │
   ▼  broadcastToAuthorizedViewers(ownerId, payload)
FriendshipsService.getFriendIds(ownerId) → [viewerId...]
   │
   ├─ for each viewer:
   │     ├─ LocationVisibilityService.canViewerSeeOwner(viewer, owner)
   │     │     ├─ friendship required
   │     │     └─ switch(owner.mode): GHOST / EVERYONE / SELECTED / EXCEPT
   │     └─ StopViewingService.isViewingStopped(viewer, owner)  [session]
   │
   └─ server.to(userRoom(viewerId)).emit('location:updated', payload)
              │
              ▼  targeted room emit (NOT global)
Authorized viewer Frontend
   ├─ locationStore receives update
   └─ Leaflet marker repositioned / created / stale-flagged
```

WebSocket authorization happens **once per connection** in
`LocationGateway.handleConnection`. The per-update path re-checks the
`socket.data.user` that was written during connection auth and rejects any
unauthenticated socket immediately with a socket-level error event.

---

## Privacy

The four sharing modes and what they mean:

| Mode             | Authorized viewers                              |
| ---------------- | ----------------------------------------------- |
| **Ghost**        | Empty set. Not even friends see you.            |
| **Everyone**     | All confirmed friendships.                      |
| **Selected**     | Intersection of `confirmed friends` and your explicit `Selected` list. |
| **Except Selected** | Confirmed friends **minus** your explicit `Except` block list.      |

Always-on guarantees:

1. **Non-friends are never authorized.** `canViewerSeeOwner` returns `false`
   for `viewerId === ownerId` (you don't get your own events through the
   broadcast path) and for any pair without a confirmed `Friendship` row.
2. **`GHOST` is the default.** Missing `SharingSettings` row ⇒ mode `GHOST`.
3. **Privacy changes propagate in < 2 s.**
   - HTTP `PATCH /sharing/mode` or `/sharing/selected|except` writes to
     Postgres in a transaction.
   - `SharingService` then calls `PrivacyRealtimeService.notify*`
     (non-blocking, void `void …;` fire-and-forget) to fan out
     `sharing:changed` events **and** a targeted `location:hidden` /
     `location:updated` correction emit for viewers whose authorization
     just flipped. Redis pub/sub via the Socket.IO Redis adapter carries
     these events to other backend pods in milliseconds.
4. **Session-level Stop Viewing** is stored in Redis keyed by
   `(viewerUserId, ownerUserId, socketId)` so reloading the page /
   reconnecting the socket restores visibility. The `StopViewingService`
   cleanup in `handleDisconnect` wipes session entries.

---

## Security

- **JWT authentication (HTTP + WebSocket).**
  `JwtStrategy` validates tokens on every HTTP route guarded by
  `JwtAuthGuard`. The Socket.IO gateway extracts the same token from either
  `handshake.auth.token` (preferred) or query/headers, then calls
  `SocketJwtAuthService.authenticate` to verify signature + DB existence
  before writing `socket.data.user`. Connections with invalid tokens are
  severed immediately with error codes `INVALID_TOKEN` /
  `AUTH_TOKEN_MISSING` / `USER_NOT_FOUND`.
- **Password hashing:** bcrypt with 12 rounds (`auth.service.ts`). No plain
  text passwords are ever logged, returned by DTO responses, or stored.
- **DTO validation everywhere:** `ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true, transform: true })` applied globally (HTTP in
  `main.ts`, WebSocket via `@UsePipes` on `LocationGateway`). All DTO fields
  carry `class-validator` decorators: `IsEmail`, `IsString`, `MinLength`,
  `IsNumber`, `IsLatitude`, `IsLongitude`, `IsIn` for enums, etc.
- **Server-side authorization for every access path.**
  - `GET /locations/users/:id` → `canViewerSeeOwner(viewer, owner)`
  - `GET /locations/history` → owner only via `@CurrentUser()`
  - `GET /locations/me` → owner only
  - Socket broadcast path → `canViewerSeeOwner` per viewer
  - `DELETE /friends/:id` / accept/reject request → request/ friendship
    ownership verified
- **WebSocket payload validation:** `LocationUpdateDto` is the same DTO used
  for HTTP POST so every field goes through `class-validator` before NestJS
  hands the typed object to `handleLocationUpdate`.
- **No global broadcasts.** `broadcastToAuthorizedViewers` never calls
  `server.emit(...)`; it always goes through
  `server.to(userRoom(viewerId)).emit(...)` per individually authorized
  viewer. (See the unit test `No global server.emit for location data` in
  `location.gateway.spec.ts` — spies on `server.emit` and asserts zero calls
  through the full update path.)
- **Rate limiting:** `LocationRateLimitService` implements a per-user
  sliding-window counter in Redis with configurable `MAX_UPDATES_PER_WINDOW`
  / `WINDOW_MS`. Exceeding it throws a rate limit error before the update is
  validated or stored.
- **Location validation** before broadcast (see Real-Time Flow):
  coordinate/timestamp/speed/order constraints all fail closed.
- **Redis TTL on hot state** so even if a privacy deletion race is missed
  the location expires automatically within the configured TTL.
- **Secrets:** Frontend ships with zero backend secrets. `VITE_API_URL` is a
  build-time public URL; `JWT_SECRET`, Postgres passwords, and Redis
  credentials live only in backend environment variables.

---

## Scaling to 100,000 Concurrent Users

```text
┌───────────────────────────┐
│ Load Balancer (Nginx/ALB) │
└────────────┬──────────────┘
             │ round-robin + sticky for WebSocket upgrades
     ┌───────┴───────┬───────────────┐
     ▼               ▼               ▼
NestJS pod A    NestJS pod B    NestJS pod C  (stateless)
     └───────────────┬───────────────────┘
                     │ Socket.IO Redis Adapter
            ┌────────┴─────────┐
            ▼                  ▼
    Redis Cluster (3+ primaries, 1 replica each)
    · hot locations (ZSET by timestamp with TTL)
    · pub/sub channels
    · rate-limiting sliding windows
    · presence heartbeats
    · Stop Viewing session state
                     │
                     ▼
          PostgreSQL (1 primary + read replicas)
          · PgBouncer connection pooling in front of each pod
          · Read replicas for /friends + sharing-settings reads
          · Write path: friendship mutations, sharing mode, location history
```

### Horizontal scaling details

- **NestJS pods are stateless** — all transient state (current locations,
  presence, rate limits, stop-viewing) is in Redis. Session affinity /
  sticky sessions on the load balancer keep a single WebSocket connection
  pinned to one pod; Redis pub/sub carries events between pods via
  `@socket.io/redis-adapter` so any pod can broadcast to any user's room.
- **Redis Cluster:** split hot keys across shards by user id prefix
  (`location:{userid}`, `presence:{userid}`), keeping related keys on the
  same shard via hash tags to avoid cross-node multi-key bottlenecks. Pub/sub
  scales with the adapter shim and does not need to read hot data.
- **PostgreSQL:**
  - Connection pooling via PgBouncer (transaction mode) per pod so 100k
    concurrent sockets do not translate to 100k Postgres connections.
  - Read replicas for `GET /friends`, `GET /sharing`, `GET
    /locations/history`, and friend-list page loads.
  - Write-heavy tables: `location_history` inherits one row per accepted
    GPS update. Do **not** accept 1 Hz GPS updates and flush every one to
    Postgres synchronously. Instead already implemented in
    `LocationHistoryService.saveEntry`: keep hot path pure Redis + in-memory
    and batch history writes every ~10 s / per user buffer, or keep the
    current write-then-async path.
  - `location_history.createdAt` index + `ON DELETE ... WHERE createdAt <
    now() - interval '24 hours'` runs periodically (already implemented as
    part of every `saveEntry`, which keeps per-user rows bounded).
- **Avoiding a PostgreSQL write on every GPS update** at scale: today the
  synchronous code path writes history to Postgres in the same await. At
  100k users × 1/s each = 100k t/s Postgres writes, which will overwhelm a
  single primary. Move `locationHistory.saveEntry` onto a worker queue
  (BullMQ with Redis) and return from the broadcast path once Redis is
  confirmed. Batch inserts per-user, 10 s at a time, to keep ~10k writes/s
  sustainable. This is a documented future change; current code is written
  so the swap is localized to `locations.service.ts` +
  `location.gateway.ts` / broadcast flow.
- **TTL hot state.** `LocationRedisService.setCurrentLocation` stores with
  `LOCATION_REDIS_TTL_MS` (`2 * MAX_LOCATION_AGE_MS` + 60 s per constants).
  Users whose clients stop sending vanish automatically, keeping the Redis
  working set equal to the set of recently active users.
- **Rate limiting** naturally sheds duplicate / replay / misbehaving client
  traffic before any DB or pub/sub work.

### What would break first?

Under the current naive implementation (synchronous Postgres write per GPS
update) the **PostgreSQL primary** saturates first on `location_history`
INSERTs — expected somewhere in the 8–20k accepted updates/s range on a
single well-sized primary without batching, well short of 100k concurrent
users at 1 Hz.

Fix (already architected for, not yet committed): offload
`LocationHistoryService.saveEntry` to a BullMQ queue with per-user batching.

The second break point after batching is the **Redis Cluster primary that
holds the hottest users' hot location keys** if many viewers fan-out read
the same celebrity user's key. Mitigated by hash-tags + local caching on
NestJS pods for visibility checks.

---

## Trade-offs

| Decision                                               | Why                                                                 | Drawback                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Redis for current locations, not Postgres**         | Hot reads, TTL expiry, pub/sub locality, low write latency         | Redis data is volatile; Postgres is source of truth for history               |
| **PostgreSQL for durable data**                        | ACID, Prisma DX, complex queries for friendships + sharing modes   | High write tps on `location_history` needs batching at scale                  |
| **Leaflet + OSM instead of Google Maps**               | Free, no API key, self-hostable tiles, open data                  | Less polished POI, no native routing/place autocomplete in-box                |
| **JWT instead of OAuth / sessions**                    | Simpler self-host, stateless auth for HTTP + WebSocket same secret | Revocation relies on short TTL + logout (no token blacklist today — add if reqd) |
| **Session-level Stop Viewing (Redis, per socket)**    | Respects reload semantics without touching the owner's settings    | Not persisted across browser sessions; owner has no server-side list of viewers who hid them |
| **24 h retention on `location_history`**               | Caps storage / privacy exposure, aligns with "live friend tracker" | No long-term trails; if a user wants history beyond 24 h they need exports     |
| **500 km/h validation threshold**                      | Catches spoofed jumps / replay / buggy mobile GPS                  | Rules out legitimate very-high-speed users (test pilots, hyperloop) – false positive risk is minimal |
| **Socket.IO Redis Adapter for multi-pod**              | One-line cross-pod pub/sub + room sync                             | Adds Redis as a critical-path dependency for real-time fan-out                 |
| **Prisma ORM**                                         | Type-safe queries, migrations, seed, schema visualization          | Adds generated client build step; opinionated SQL surface                      |

---

## Known Limitations

- **Not production-ready.** Single-region deployment, no TLS termination in
  Compose, no backups, no monitoring/alerting, no APM, no CDN for tiles.
- **No in-production WebSocket auth token refresh workflow** beyond the
  401/1008 redirect. Clients must re-login to obtain a fresh JWT after the
  7-day default TTL.
- **`location_history` rows deleted per-write today** to keep 24 h
  retention — works at modest scale; at 10k+ updates/s move to a scheduled
  cron + partitioning.
- **BullMQ / queue-based history batching** (the documented scaling fix)
  described but not implemented.
- **Reverse geocoding / place names** are not included — markers only show
  lat/lng via Leaflet tile context.
- **Tile serving relies on public OpenStreetMap** — at high traffic you
  need your own tile server or a commercial provider with an API key.
- **Two-device logins for the same user share a single "stop viewing" set
  per socket id** — this is intentional (session-level) but may surprise a
  user with 3 open tabs.
- **Docker Compose health checks for backend** use internal HTTP GET via
  node on `/health`; works but adds overhead vs a pure TCP check.
- **Test coverage is unit + one e2e auth spec.** Integration flows 1–7 from
  the prompt are validated logically by unit tests against the specific
  services, but there is no Playwright/Cypress e2e that drives two browsers
  and a live stack.

---

## Project Structure

```
backend/
  prisma/
    schema.prisma      # User, FriendRequest, Friendship, Sharing*, LocationHistory
    migrations/        # Prisma migrations
    seed.ts            # Demo users + friendships + sharing modes
  src/
    auth/              # register/login, JwtStrategy, JwtAuthGuard
    friends/           # requests + list API
    friendships/       # normalized pair helpers (areFriends, getFriendIds)
    sharing/           # sharing settings API + SELECTED/EXCEPT lists
    locations/
      location-validation.service.ts   # speed/order/timestamp/coord checks
      location-redis.service.ts        # TTL hot location cache
      location-history.service.ts      # durable append + 24h cleanup
      location-rate-limit.service.ts   # Redis sliding window
      locations.service.ts             # HTTP publish + per-view authorization
    location-visibility/               # canViewerSeeOwner pure authorization
    realtime/
      location.gateway.ts              # Socket.IO gateway + broadcast fan-out
      socket-jwt-auth.service.ts       # WS connection authentication
      privacy-realtime.service.ts      # sharing change → hidden/updated fan-out
      presence.service.ts              # online/heartbeat Redis tracking
      stop-viewing.service.ts          # session-level viewer suppression
    redis/ prisma/ users/ common/      # cross-cutting concerns
  test/auth.e2e-spec.ts                # register/login e2e

frontend/
  src/
    services/    # auth, friends, sharing, location (HTTP), socket (Socket.IO)
    stores/      # auth (Pinia), location (Pinia marker state + stale tick)
    types/       # auth + domain types (strict, no any)
    utils/time.ts# relative format, stale check, initials
    views/
      LoginView.vue RegisterView.vue  # guest-only, redirect to /map
      MapView.vue                       # Leaflet + markers + geolocation watch
      FriendsView.vue                   # incoming/outgoing/friends, send/search
      SettingsView.vue                  # GHOST/EVERYONE/SELECTED/EXCEPT radio
    router/index.ts  # beforeEach guard (requiresAuth / guestOnly, localStorage JWT)
```
