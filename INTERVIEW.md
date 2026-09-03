# INTERVIEW — FriendMap

Concise answers for technical interviews. Each answer is deliberately short
(10–45 seconds if spoken) and is meant to be expanded with a whiteboard / code
reference if the interviewer digs deeper.

---

## 1. Why Redis?

Three jobs, none of which Postgres does well for 100k concurrent users:

1. **Hot current-location cache with TTL** — every GPS read is a point lookup
   per friend. Redis sub-ms get beats any Postgres indexed read at fan-out.
2. **Pub/sub for Socket.IO multi-instance fan-out** via
   `@socket.io/redis-adapter` — so any NestJS pod can emit into user rooms on
   any other pod without shared in-memory state.
3. **Transient state that shouldn't touch SQL**:
   - presence heartbeats
   - per-user rate-limit sliding-window counters
   - session-level Stop Viewing (keyed by `viewer:owner:socket`).

Everything in Redis has a TTL or is explicitly cleaned up so Redis can't grow
unbounded. Postgres is the durable source of truth; Redis is the hot tier.

---

## 2. Why PostgreSQL?

The non-GPS data (users, friendships, sharing modes, sharing allow/block
lists, 24 h location history) is relational, benefits from ACID transactions,
and queries are complex enough (e.g. "get all friends + their sharing mode
+ whether they are in selected list") that Prisma over Postgres gives clean,
type-safe joins.

Prisma migrations + seed give reproducible deploys. A single primary plus
read replicas will comfortably handle the non-streaming traffic even at
scale — the heavy write path (history) is explicitly architected to be
batched.

---

## 3. Why Socket.IO?

Two features that roll-your-own WS would have to re-implement:

1. **Automatic fallback (WS → long-polling)** when browsers/corporate proxies
   block upgrades. Critical for a consumer mobile/desktop web app.
2. **Rooms + Redis adapter** out of the box. `server.to(userRoom(id)).emit(...)`
   is the entire building block for targeted per-user fan-out. Without it I'd
   need a custom pub/sub layer + a connection registry per pod.

Fallback alone is worth the 40 KB client overhead.

---

## 4. How does authorization work?

Two layers, both server-side only:

**Layer 1 — Are you a friend?** `FriendshipsService.areFriends(viewer, owner)`
checks the normalized `Friendship(userAId, userBId)` unique row. Non-friends
fail closed.

**Layer 2 — What does the owner's mode allow?**
`LocationVisibilityService.canViewerSeeOwner`:

| Owner mode        | Pass condition for a viewer friend                   |
| ----------------- | ---------------------------------------------------- |
| `GHOST`           → never                                                            |
| `EVERYONE`        → always (friendship already checked above)                       |
| `SELECTED`        → `SharingSelectedFriend(owner, viewer)` row exists                |
| `EXCEPT_SELECTED` → `SharingExceptFriend(owner, viewer)` row does **not** exist      |

Applied identically on both:

- the HTTP read path (`GET /locations/users/:id` → `LocationsService.getFriendCurrentLocation`)
- the WebSocket broadcast path (`broadcastToAuthorizedViewers` iterates all friendIds and skips non-passing ones per viewer).

Result: **there is no code path that returns or broadcasts a location without
these two checks**.

---

## 5. How does Ghost mode work under 2 seconds?

1. Alice clicks "Ghost → Save mode".
2. Frontend sends `PATCH /sharing/mode { mode: 'GHOST' }`.
3. `SharingService.updateMode` upserts `SharingSettings.mode = GHOST` in a
   single Postgres statement — durable first.
4. `SharingService` (via injected `PrivacyRealtimeService`) fires
   `notifySharingModeChanged(aliceId, oldMode, GHOST)` as
   `void …;` fire-and-forget, so the HTTP response doesn't wait for fan-out.
5. `PrivacyRealtimeService.notifySharingModeChanged`:
   - calls `getFriendIds(aliceId)` → list of N viewers
   - for **every viewer** in the list, emits two events into that viewer's
     room: `sharing:changed { userId: aliceId, mode: GHOST }` and
     `location:hidden { userId: aliceId }`.
6. Redis pub/sub (Socket.IO adapter) carries each room emit to the specific
   NestJS pod that holds that viewer's socket — usually one cross-pod
   PUBLISH per viewer.
7. Frontend's `applyLocationHidden` in `locationStore` deletes the marker
   from the `Map<string, FriendMarkerState>` immediately on receipt;
   `removeFriendMarker` removes the Leaflet marker in the same tick.

Wall-clock between "Alice clicks Save" and "Bob's marker vanishes": **HTTP
write + 1× Redis PUBLISH per viewer + browser render** — consistently
< 500 ms even across pods, and with 1000 friends per user still well
under 2 s.

---

## 6. How do you prevent location leaks?

**Defense in depth:**

1. **No global broadcasts.** `server.emit('location:updated', …)` is never
   called. The test suite explicitly spies on `server.emit` during an update
   and asserts it was called **zero** times. Every emit is
   `server.to(userRoom(viewerId)).emit(...)` — per-viewer, post-auth.
2. **Frontend is untrusted.** The frontend has a `location:hidden` handler
   but doesn't decide who is visible; the server withholds events in the
   first place. A malicious client modifying JS can't "enable visibility"
   for non-friends because their socket is never subscribed to that owner's
   updates.
3. **Authorization at every read path** (HTTP GET + WebSocket broadcast +
   location history access).
4. **Validation gatekeepers before persistence:** speed, freshness, ordering,
   range. So even an authenticated attacker can't poison the cache with
   spoofed coordinates for other users.
5. **Stop Viewing stored server-side, not just client-side.** Even if a
   frontend bug re-renders a hidden marker, `StopViewingService.isViewingStopped`
   in the broadcast loop still suppresses the emit for that viewerId.
6. **No secrets on the frontend.** `VITE_API_URL` is a build-time public URL.
   No JWT secret, Redis URL, or database credential ever ends up in the
   frontend bundle.

---

## 7. How do you authenticate WebSockets?

Exactly once, **at connection time**, in
`LocationGateway.handleConnection(socket)`:

1. `SocketJwtAuthService.extractToken` pulls a token from three places
   (priority order):
   - `socket.handshake.auth.token` — Socket.IO v4 built-in auth packet
   - `handshake.query.token`
   - `handshake.headers.authorization` (Bearer)
2. If missing → emit `error { code: AUTH_TOKEN_MISSING }` then
   `socket.disconnect(true)` — hard close.
3. Otherwise `SocketJwtAuthService.authenticate(token)` calls
   `jwtService.verifyAsync` + a Prisma `user.findUnique` so deleted users
   whose tokens are still within TTL also get rejected.
4. On success → `socket.data.user = user` + `socket.join(userRoom(user.id))`.
5. On failure → `INVALID_TOKEN` or `USER_NOT_FOUND` error event +
   `disconnect(true)`.

Per-message handlers (`handleLocationUpdate`, `handleStopViewing`,
`handleStartViewing`) re-check `socket.data?.user` at the top of the function
and return early with `NOT_AUTHENTICATED` if missing — defense in depth
against a connection that snuck through.

---

## 8. How do you validate GPS data?

`LocationValidationService.validateUpdate(update, previous)` runs **before**
the new point is written anywhere. All conditions fail closed (return 400 /
socket error, no write, no broadcast).

| Check             | What it enforces                                                                 |
| ----------------- | -------------------------------------------------------------------------------- |
| Coordinates       | `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`, `accuracy >= 0`                          |
| Timestamp format  | finite, positive, numeric Unix ms (Date.now scale)                               |
| Timestamp age     | not older than 60 s, not newer than now + 10 s (MAX_CLOCK_SKEW_MS)               |
| Order             | strictly newer than the last accepted point's timestamp — rejects replays        |
| Speed             | Haversine distance / elapsed ms → km/h, must be ≤ `MAX_GROUND_SPEED_KMH` (500)    |

All constants are in `locations/constants/location.constants.ts` and unit tests
hit every branch (see `location-validation.service.spec.ts`, 74 tests total,
all pass).

---

## 9. How do you detect impossible speed?

Haversine great-circle distance in kilometers between the previous accepted
point and the candidate point, divided by elapsed hours between the two
timestamps, giving a conservative implied linear ground speed:

```
speed = haversine_km(prev.lat,prev.lng, new.lat,new.lng)
        / ((new.timestamp − prev.timestamp) / 3_600_000)
```

If `speed > 500 km/h` (roughly 311 mph — higher than any production car,
commercial jet altitudes don't have GPS coordinates going through the
system for 99 % of users), the update is rejected with
`LocationValidationFailure.IMPOSSIBLE_MOVEMENT` and neither Redis nor
history sees it.

Threshold is intentionally generous (favoring zero false positives on
highway cars / light aircraft) at the cost of missing only extreme and
extremely rare cases; easy to raise per-customer.

---

## 10. How does Redis TTL work?

Every accepted GPS update writes:

```
SET location:{userId} <json> PX LOCATION_REDIS_TTL_MS
```

Where `LOCATION_REDIS_TTL_MS = 2 × MAX_LOCATION_AGE_MS + 60_000` ≈ 3 minutes.

- Keys vanish automatically for users who go offline → no zombie markers in
  Redis, no cleanup script for hot state.
- TTL is **longer** than the 60 s stale threshold the UI uses. This way a
  user whose phone briefly loses signal returns from "stale" to "live" in
  under a minute once the client reconnects and sends a point.
- Other transient keys (presence, rate counters, stop-viewing session keys)
  each carry their own TTL tailored to the semantic lifetime of the data.

Result: Redis working set size equals active-user count × small constant
per user and stabilizes without explicit maintenance.

---

## 11. How would you scale to 100,000 concurrent users?

Seven concrete steps, in the order I'd do them:

1. **Stateless NestJS + sticky sessions / WS upgrade affinity** behind a
   load balancer (Nginx or ALB). Add more pods until CPU per pod < 60 %.
2. **Socket.IO Redis adapter already in the code** — zero code change.
   Any pod's `server.to(room).emit` reaches every connection.
3. **Redis Cluster (3 primaries × 1 replica)** with `{userId}` hash-tags on
   `location:{u}`, `presence:{u}`, `ratelimit:{u}`, `stopview:{u}:{s}` so
   related keys land on one shard.
4. **PgBouncer transaction-mode pooling** in front of Postgres so 100k
   sockets on 20 pods translate to ~500 actual connections to the primary.
5. **Postgres read replicas** for `GET /friends`, `GET /sharing`, profile
   loads — 90 %+ of SQL reads move off the primary.
6. **`location_history` INSERT batching via BullMQ.** Today each update
   writes synchronously to Postgres. At 100k u × 1 Hz = 100k t/s we can't
   keep up on a single primary. Buffer per-user writes in Redis list /
   BullMQ job, flush every 10 s → ~10k inserts/s, comfortably sustainable.
7. **Self-hosted tile server or commercial provider** (Mapbox / Stadia Maps)
   for Leaflet tiles. Public OSM tile infrastructure is not for 100k MAU.

At this point I expect to comfortably serve 100k concurrent users with room
to grow, and the next bottleneck is Redis shard hot keys for "celebrity"
users followed by 100k+ viewers (mitigate with in-pod in-memory cache of
the top-N most queried visibility bits).

---

## 12. What breaks first?

With the current implementation (no history batching):
**PostgreSQL primary's `location_history` INSERT throughput.**

At a rough ~8–20k inserts/s on a well-sized Postgres primary, users at
1 Hz GPS reporting would top out at 8–20 k concurrent users before latency
on the broadcast path (which awaits the history write today) climbs past
the 2-second privacy SLA.

Fix is cheap and architecturally localized: offload
`LocationHistoryService.saveEntry` to a BullMQ worker and fire the broadcast
as soon as Redis confirms. That single change pushes the first break point
to Redis cluster shard CPU on per-fan-out PUBLISHes, which happens at a much
higher concurrency number.

---

## 13. What happens if Redis goes down?

Graceful degradation with **clear failure semantics**.

**Write path (user sends GPS):**

- `LocationRedisService.setCurrentLocation` throws connection error.
- NestJS exception filter returns 503 on HTTP; the socket gateway catches
  and emits `INTERNAL_ERROR` to that one socket.
- No update is persisted (Redis OR Postgres), so inconsistent state is
  impossible — fail closed.
- Broadcast loop is never reached, so no viewer receives stale data either.

**Read path (viewer asks for a friend's point):**

- `getCurrentLocation` returns `null` as-if there is no location.
- Frontend shows "no markers visible" empty state + socket status shows
  `connect_error` or the REST 503 banner.

**Presence / stop-viewing / rate limit:**

- all default to absent → presence shows offline, stop-viewing clears,
  rate limit allows traffic (permissive).

We lose the hot/live property while Redis is down, but **nothing leaks and
nothing is corrupted**. User impact is "the map stops updating until Redis
comes back". Automated recovery: reconnect loops on both Socket.IO client
and ioredis with backoff.

If I were going to production I'd add Redis Sentinel or Cluster with
automatic failover so the blip is a few seconds, not a human page.

---

## 14. What happens if Socket.IO has multiple instances?

Nothing changes, thanks to the Redis adapter.

- At startup each pod runs:
  `srv.adapter(createAdapter(pubClient.duplicate(), subClient.duplicate()))`
- When pod A does `server.to(userRoom(bob)).emit('location:updated', …)`,
  the Redis adapter **PUBLISHes the payload to an adapter channel**.
- Pod B (which actually holds Bob's WebSocket) **SUBSCRIBEd on startup** to
  the same channel, sees the message, looks up Bob's socket id locally,
  and emits to his socket.

Rooms are virtual; no pod keeps a global cross-pod registry of who is
connected where. Scaling from 1 pod to 50 pods is a horizontal add with
zero code and zero migration.

The only caveat: stop-viewing state is per-socket and (by design) never
sent cross-pod. If a viewer reconnects and lands on a different pod their
Stop Viewing set resets. This is the documented session-level semantics,
not a bug.

---

## 15. Why isn't the frontend trusted?

Because it runs on an attacker-controlled device. Any JWT-holding user can
open DevTools, swap JS, forge requests. Specifically:

1. **Privacy.** I can't allow frontend JS to decide "am I allowed to see
   Alice?" because a modified client would always say yes. Only the backend,
   against its own Postgres rows, can decide authorization.
2. **GPS integrity.** A modified frontend can send any coordinates at any
   timestamp. Backend re-validates everything (range, order, speed,
   freshness). Otherwise you could spoof yourself at the White House or
   replay an old location and have it re-render to your friends.
3. **Rate limits.** A naive client could send 10 000 updates per second.
   Only the backend Redis rate limiter protects the database.
4. **JWT handling.** Expired tokens are enforced server-side. The frontend's
   "redirect to login" on 401 is a UX convenience, not a security boundary.

Rule of thumb: if an attacker with the same JWT and a curl command could
subvert a check by sending a different payload, move that check to the
backend. Everything in FriendMap that affects other users or persistent
state is backed by a server-side enforcement.

---

## 16. Why use Prisma?

Four wins that pay for the learning curve immediately:

1. **Type-safe queries end-to-end.** `prisma.sharingSelectedFriend.findUnique({ where: { ownerId_friendId: … }})` returns a typed object, no manual
   SQL projection, no string SQL typos causing runtime N+1.
2. **Migrations as checked-in SQL.** `prisma migrate dev` generates a
   reproducible `.sql` file per schema change; `prisma migrate deploy` plays
   them in order in CI / Docker. No ad-hoc schema drift between dev and
   prod.
3. **First-class composite unique + compound PK.** Exactly what the
   normalized Friendship pair and the `SharingSelectedFriend(ownerId, friendId)`
   models need. Prisma generates the correct `@@unique` and `@@id` syntax.
4. **Seeding via TypeScript.** `prisma/seed.ts` uses the same Prisma client
   and bcrypt module the app uses — no raw SQL seed files, no separate tool.

If Prisma weren't an option I'd pick Knex + typed DTOs, but Prisma removes
whole classes of "I wrote the wrong WHERE clause" bugs.

---

## 17. How are passwords protected?

- **Stored as bcrypt(12) only.** `passwordHash` column in Prisma; there is
  no `password` column anywhere.
- **Written once, at registration / password change only.**
  `AuthService.register` calls `bcrypt.hash(dto.password, BCRYPT_ROUNDS)`,
  writes the hash, and immediately forgets the plaintext.
- **Compared in constant time.** `AuthService.login` calls
  `bcrypt.compare(dto.password, user.passwordHash)`. If either email or
  password is wrong, the exact same generic error is returned —
  "Invalid email or password" — no user enumeration oracle.
- **Never serialized to the client.** `UserProfile` DTO, `FriendSummary`,
  socket auth objects, and loggers never include the field; a global grep
  for `password` in `backend/src/*` only hits bcrypt hashing and DTO
  fields.
- **Seed password (`DemoPassword123!`) is a documented dev default.**
  Override via `DEMO_PASSWORD` env. Production must not use this; Helm /
  deployment configs should source secrets from a vault.

---

## 18. How is rate limiting implemented?

`LocationRateLimitService` in `backend/src/locations/`, Redis-backed sliding
window — per user, per GPS update path (both HTTP POST and the socket
update path share the same call).

```
KEY:   ratelimit:location:{userId}
TYPE:  sorted set (ZADD)
VALUE: timestampMs → unique member id
TTL:   WINDOW_MS (1 minute)
LIMIT: MAX_UPDATES_PER_WINDOW (30 per minute default)
```

On each `assertWithinLimit(userId)`:

1. Pipeline `ZREMRANGEBYSCORE -inf, (now - WINDOW)` to drop members outside
   the window.
2. `ZCARD` → current count.
3. If count ≥ MAX → throw 429 / socket rate-limit error.
4. Otherwise `ZADD` current timestamp + `EXPIRE WINDOW_MS` and proceed.

Pipeline keeps it round-trip efficient (1 RTT). Sliding window is smoother
than token-bucket for bursty misbehaving clients. The same code path gates
both the HTTP endpoint and the Socket.IO handler, so an attacker can't
bypass the limit by switching transports.
