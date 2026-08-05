-- Stage 2 — core schema.
--
-- Mirrors the domain model in src/core. Ids are text rather than uuid because
-- the domain brands them as opaque strings; Stage 3 links users.id to the
-- authentication subject.
--
-- Constraints here duplicate rules already enforced in the domain. That is
-- deliberate: the domain gives fast feedback and good error messages, while the
-- database guarantees the rule holds even if a row arrives by some other path.

create table organizations (
  id text primary key,
  kind text not null check (kind in ('vendor', 'client')),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table users (
  id text primary key,
  organization_id text not null references organizations (id),
  display_name text not null check (length(btrim(display_name)) > 0),
  email text not null unique,
  created_at timestamptz not null default now()
);

create index users_organization_id_idx on users (organization_id);

-- A project always spans exactly one vendor org and one client org. The two
-- must differ: a project with the same org on both sides has no review
-- boundary, which would make approval meaningless.
create table projects (
  id text primary key,
  vendor_organization_id text not null references organizations (id),
  client_organization_id text not null references organizations (id),
  name text not null check (length(btrim(name)) > 0),
  status text not null check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null,
  constraint projects_sides_differ check (vendor_organization_id <> client_organization_id)
);

create table memberships (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  user_id text not null references users (id),
  role text not null check (
    role in (
      'vendor_owner',
      'vendor_developer',
      'client_approver',
      'client_reviewer',
      'observer'
    )
  ),
  joined_at timestamptz not null,
  removed_at timestamptz,
  unique (project_id, user_id)
);

create index memberships_user_id_idx on memberships (user_id);

-- Scoped, expiring, revocable permissions layered on top of role capabilities.
-- A session-scoped grant must name its session; a project-scoped one must not.
create table grants (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  subject_user_id text not null references users (id),
  capability text not null,
  scope_kind text not null check (scope_kind in ('project', 'session')),
  scope_session_id text,
  granted_by text not null references users (id),
  granted_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint grants_scope_shape check (
    (scope_kind = 'session' and scope_session_id is not null)
    or (scope_kind = 'project' and scope_session_id is null)
  )
);

create index grants_lookup_idx on grants (project_id, subject_user_id, capability);

-- The project timeline. `seq` is per-project and gapless; the unique constraint
-- is what turns two concurrent appends into one success and one retry rather
-- than two events sharing a position.
create table timeline_events (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  seq bigint not null check (seq > 0),
  type text not null,
  actor_id text not null references users (id),
  occurred_at timestamptz not null,
  payload jsonb not null,
  unique (project_id, seq)
);

create index timeline_events_project_seq_idx on timeline_events (project_id, seq);

create table deliverables (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  created_by text not null references users (id),
  created_at timestamptz not null
);

create index deliverables_project_id_idx on deliverables (project_id);

create table deliverable_versions (
  id text primary key,
  deliverable_id text not null references deliverables (id) on delete cascade,
  number integer not null check (number > 0),
  summary text not null check (length(btrim(summary)) > 0),
  published_by text not null references users (id),
  published_at timestamptz not null,
  -- Artifact storage lands in Stage 8; until then this records references
  -- without a foreign key to a table that does not yet exist.
  artifact_ids text[] not null default '{}',
  unique (deliverable_id, number)
);

-- A decision names the exact version it judged. Rejecting or requesting changes
-- without a rationale leaves the other side nothing to act on.
create table decisions (
  id text primary key,
  deliverable_version_id text not null references deliverable_versions (id) on delete cascade,
  verdict text not null check (verdict in ('approved', 'rejected', 'changes_requested')),
  decided_by text not null references users (id),
  decided_at timestamptz not null,
  rationale text,
  constraint decisions_rationale_required check (
    verdict = 'approved'
    or (rationale is not null and length(btrim(rationale)) > 0)
  )
);

create index decisions_version_idx on decisions (deliverable_version_id);

create table feedback (
  id text primary key,
  deliverable_version_id text not null references deliverable_versions (id) on delete cascade,
  author_id text not null references users (id),
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null,
  anchor jsonb,
  resolved_at timestamptz
);

create index feedback_version_idx on feedback (deliverable_version_id);

--------------------------------------------------------------------------------
-- Immutability
--
-- Stage 1's EventStore port simply omits update and delete. That is an
-- interface convention; these triggers make it a guarantee that holds no matter
-- which client connects. Triggers rather than REVOKE because privilege grants
-- do not restrain a table's owner, and the record must be append-only for
-- everyone.
--------------------------------------------------------------------------------

create function reject_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'append_only_violation: % is append-only, % rejected', tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger timeline_events_append_only
before update or delete on timeline_events
for each row execute function reject_mutation();

create trigger decisions_append_only
before update or delete on decisions
for each row execute function reject_mutation();

create trigger deliverable_versions_append_only
before update or delete on deliverable_versions
for each row execute function reject_mutation();

-- Grants are immutable except for revocation. Without this, a revocation path
-- could be used to quietly widen a grant's capability, scope or expiry.
create function grants_revocation_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'grant_immutable: grants cannot be deleted, revoke instead'
      using errcode = 'restrict_violation';
  end if;

  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.subject_user_id is distinct from old.subject_user_id
    or new.capability is distinct from old.capability
    or new.scope_kind is distinct from old.scope_kind
    or new.scope_session_id is distinct from old.scope_session_id
    or new.granted_by is distinct from old.granted_by
    or new.granted_at is distinct from old.granted_at
    or new.expires_at is distinct from old.expires_at
  then
    raise exception 'grant_immutable: only revoked_at may be modified'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

create trigger grants_revocation_only
before update or delete on grants
for each row execute function grants_revocation_only();
