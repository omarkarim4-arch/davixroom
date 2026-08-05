# DavixRoom

A collaboration platform for the software development lifecycle. Software companies and their
clients work in a shared space where clients can watch development live, review features, leave
feedback, approve or reject changes, read the project history, chat with developers, and receive
AI summaries.

DavixRoom is not a meeting tool. Screen sharing is one feature among many, and the architecture
is deliberately organised around the durable record of a project rather than around live video.

## Architecture

The system is built on four decisions that are expensive to retrofit, so they are settled first.

### 1. The timeline is the spine

Every meaningful act appends an immutable `TimelineEvent` carrying a per-project, gapless sequence
number. Project history, decision review, and AI summaries are all _readers of this one log_ rather
than separate subsystems with their own storage.

Events are never edited. Correcting something means appending a new event, so what was known at
each point in time survives.

### 2. Permissions are grants, not roles

Roles are named bundles of capabilities, but the unit of permission is the `Capability`, and
`authorize()` in `src/core/auth` is the only place one is ever evaluated. Nothing asks "is this
user an admin?".

On top of role capabilities sit `Grant`s: explicit, attributable, scoped and expiring. This is what
makes temporary remote control tractable — control is never granted to a user in general, only to a
user within a specific session, with an expiry and instant revocation. No role carries
`session.control`; it can only ever arrive through a grant.

### 3. Decisions bind to versions

Clients approve a `DeliverableVersion`, never a `Deliverable`. A deliverable's status is _derived_
from its versions and decisions rather than stored, so publishing a new version automatically
returns it to review. A stored status field would have to be remembered-to-be-reset, and forgetting
once would show unapproved work as approved.

### 4. The tenancy boundary is enforced twice

`authorize()` decides what an actor may **do**. Row level security decides what rows the database
will hand over **at all**. If application code is ever bypassed — a bug, a leaked key, a service
that forgets to call `authorize()` — a client still cannot read another client's project.

The policies are deliberately coarse (membership of the row's project, nothing finer) and the
capability rules stay in the domain. Encoding the capability model twice would produce two
permission systems that drift apart, and policies too intricate to verify by reading them.

Immutability is enforced the same way. The `EventStore` port omits `update` and `delete`, but that
is only an interface convention; database triggers make it a property of the data, so timeline
events, decisions and published versions cannot be rewritten by any client. Grants accept exactly
one change — setting `revoked_at` — so the revocation path cannot be used to quietly widen a grant.

### 5. Onboarding writes go through functions, not policies

Row level security answers "which rows may this caller see". It cannot answer
"may this caller create the first row", because onboarding necessarily runs for
somebody who is a member of nothing — and a `memberships` INSERT policy loose
enough to admit a project's creator is also loose enough to let anyone insert a
membership for themselves into any project id they guess.

So no application role holds INSERT on `organizations`, `users`, `projects`,
`memberships` or `invitations`. Those tables are written only by four
`SECURITY DEFINER` functions in migration 0005, each of which resolves the
caller from the verified JWT before doing anything. They enforce structure —
"this account has no user row yet", "your organization is this project's vendor
side", "this invitation is unexpired and addressed to this confirmed address" —
and never evaluate a capability. `authorize()` still owns that, and runs first.

The hierarchy those functions build is
`Organization → Team Members → Projects → Client Invitations → Review Sessions`.
Vendors register themselves; a client organization exists only because a vendor
named it while creating a project, and client users exist only because they
accepted an invitation. There is no route by which a client registers.

An invitation's token is never stored — only its SHA-256 hash — and the token
alone is not sufficient to accept: the caller must be signed in as the confirmed
address the invitation names. A forwarded link is worth nothing on its own.

### Layout

```
src/core/        Pure domain. No React, no Next.js, no SDKs — enforced by ESLint.
  auth/          Capabilities, grants, and the authorize() chokepoint
  timeline/      Immutable events and the append-only log
  review/        Deliverables, versions, decisions, feedback
  project/       Projects and memberships (the tenancy boundary)
  org/           Organizations and users
  ports/         Interfaces to the outside world, implemented by adapters
  testing/       In-memory ports and fixture builders
src/infra/       Adapters. Postgres executors, repositories, row mappers.
  testing/       Ephemeral PGlite database and shared fixtures
  auth/          Supabase Auth clients and session resolution
src/config/      Environment validation (server) and public config (browser)
src/app/         Next.js App Router
src/proxy.ts     Session refresh on every request
supabase/
  migrations/    Schema, constraints, triggers, RLS policies
```

Migrations are the single source of schema truth. They run against ephemeral PGlite in tests
and against the live project via `apply_migration` — never by hand, so any checkout can
reproduce the database exactly.

The domain depends only on the interfaces in `src/core/ports`. Storage, realtime, media and AI are
adapters that satisfy those interfaces, which keeps vendors swappable and the domain testable in
milliseconds without any infrastructure running.

## Testing the database

Integration tests run against [PGlite](https://pglite.dev) — Postgres compiled to WebAssembly,
running in-process. The real migrations are applied to a fresh database per test file, so schema
constraints, append-only triggers and RLS policies are exercised with genuine Postgres semantics.
No Docker, no hosted project, and CI needs no service containers.

One detail matters when writing these tests: superusers bypass row level security entirely, so
asserting a policy while connected as one proves nothing. The harness switches to the
`authenticated` role before any access claim and seeds data only as the superuser.

## Identity and the request path

Authentication is Supabase Auth. Application data is not read through it — the
repositories use direct SQL, and the Supabase client is confined to signing in, signing out,
and establishing who the caller is, so there is never a second competing data path.

A request becomes a database identity in exactly one place, `asAuthenticatedUser`:

```sql
begin;
  set local role authenticated;                    -- never the owner: postgres has BYPASSRLS
  set local request.jwt.claims = '{"sub":"…"}';    -- what migration 0003 resolves the user from
  -- repository queries run here, under RLS
commit;
```

`SET LOCAL` inside a transaction is load-bearing. A plain `SET` persists on the pooled
connection after the request ends, so the next request — a different user, possibly a
different tenant — would inherit this identity. No policy can catch that, which makes it the
most dangerous mistake available in this layer.

The subject always comes from `supabase.auth.getUser()`, never `getSession()`. `getSession()`
returns whatever the cookie claims without validating it, and that value is fed straight into
`request.jwt.claims`.

## Development

```bash
pnpm install
cp .env.example .env.local   # then fill in DATABASE_URL
pnpm dev                     # http://localhost:3000
```

`DATABASE_URL` is a secret and is gitignored. It must connect as a role **without**
`BYPASSRLS` — `postgres` and `service_role` both have it, and either would silently disable
every tenancy policy while appearing to work. A live test asserts this.

Tests needing the live database skip themselves when `DATABASE_URL` is absent, so a fresh
checkout and CI both pass without credentials.

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `pnpm verify`        | Typecheck, lint and test — what CI runs      |
| `pnpm test`          | Unit and database integration tests          |
| `pnpm test:watch`    | Tests in watch mode                          |
| `pnpm test:coverage` | Coverage report                              |
| `pnpm typecheck`     | Route typegen followed by `tsc --noEmit`     |
| `pnpm lint`          | ESLint, including the domain purity boundary |
| `pnpm format`        | Prettier                                     |

## Roadmap

| Stage | Scope                                              |
| ----- | -------------------------------------------------- |
| 1     | Foundation and domain core ✅                      |
| 2     | Persistence and multi-tenant security ✅           |
| 3a    | Authentication and live database ✅                |
| 3b    | Organization and project onboarding ✅             |
| 4     | Timeline and activity feed                         |
| 5     | Feature review and decision workflow               |
| 6     | Chat and presence                                  |
| 7     | Live sessions and screen share                     |
| 8     | Recordings and artifacts                           |
| 9     | AI summaries and decision digests                  |
| 10    | Temporary remote control via session-scoped grants |

Screen sharing lands at Stage 7 by design: by then the timeline, decision model and grant system it
needs to plug into already exist.
