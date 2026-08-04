# DavixRoom

A collaboration platform for the software development lifecycle. Software companies and their
clients work in a shared space where clients can watch development live, review features, leave
feedback, approve or reject changes, read the project history, chat with developers, and receive
AI summaries.

DavixRoom is not a meeting tool. Screen sharing is one feature among many, and the architecture
is deliberately organised around the durable record of a project rather than around live video.

## Architecture

The system is built on three decisions that are expensive to retrofit, so they are settled first.

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
src/config/      Environment validation
src/app/         Next.js App Router
```

The domain depends only on the interfaces in `src/core/ports`. Storage, realtime, media and AI are
adapters that satisfy those interfaces, which keeps vendors swappable and the domain testable in
milliseconds without any infrastructure running.

## Development

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

| Command              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `pnpm verify`        | Typecheck, lint and test — what CI runs      |
| `pnpm test`          | Unit tests                                   |
| `pnpm test:watch`    | Tests in watch mode                          |
| `pnpm test:coverage` | Coverage report                              |
| `pnpm typecheck`     | Route typegen followed by `tsc --noEmit`     |
| `pnpm lint`          | ESLint, including the domain purity boundary |
| `pnpm format`        | Prettier                                     |

## Roadmap

| Stage | Scope                                                             |
| ----- | ----------------------------------------------------------------- |
| 1     | Foundation and domain core ✅                                     |
| 2     | Persistence and multi-tenant security (Postgres, RLS, migrations) |
| 3     | Authentication, organization and project onboarding               |
| 4     | Timeline and activity feed                                        |
| 5     | Feature review and decision workflow                              |
| 6     | Chat and presence                                                 |
| 7     | Live sessions and screen share                                    |
| 8     | Recordings and artifacts                                          |
| 9     | AI summaries and decision digests                                 |
| 10    | Temporary remote control via session-scoped grants                |

Screen sharing lands at Stage 7 by design: by then the timeline, decision model and grant system it
needs to plug into already exist.
