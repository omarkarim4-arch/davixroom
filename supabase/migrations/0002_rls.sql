-- Stage 2 — row level security.
--
-- This is the second of two enforcement layers. authorize() in src/core/auth
-- decides what an actor may *do*; these policies decide what rows the database
-- will hand over at all. If application code is ever bypassed — a bug, a leaked
-- key, a future service that forgets to call authorize() — the tenancy boundary
-- still holds.
--
-- The policies are deliberately coarse: membership of the row's project, and
-- nothing finer. Capability-level rules stay in the domain. Encoding the whole
-- capability model twice would produce two permission systems that drift apart,
-- and policies too intricate to verify by reading them.

create schema if not exists app;

-- Identity of the current request.
--
-- `app.user_id` is an explicit override used by trusted server contexts and by
-- tests. Otherwise the subject is read from the verified JWT claims that
-- Supabase sets on each request. Stage 3 makes the JWT path the normal one.
create or replace function app.current_user_id() returns text
language plpgsql
stable
as $$
declare
  override text;
  claims text;
begin
  override := current_setting('app.user_id', true);
  if override is not null and override <> '' then
    return override;
  end if;

  claims := current_setting('request.jwt.claims', true);
  if claims is null or claims = '' then
    return null;
  end if;

  return (claims::jsonb ->> 'sub');
exception
  when others then
    return null;
end;
$$;

-- Membership test used by every policy.
--
-- SECURITY DEFINER because the policy on `memberships` itself calls this; a
-- plain function would re-enter that policy and recurse. The function is
-- narrow, takes no free-form input, and reads only its own project row.
create or replace function app.is_project_member(target_project_id text) returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
    from memberships m
    where m.project_id = target_project_id
      and m.user_id = app.current_user_id()
      and (m.removed_at is null or m.removed_at > now())
  );
$$;

-- Project of a deliverable version, for the tables that hang off one.
create or replace function app.version_project_id(target_version_id text) returns text
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select d.project_id
  from deliverable_versions v
  join deliverables d on d.id = v.deliverable_id
  where v.id = target_version_id;
$$;

--------------------------------------------------------------------------------
-- Enable and FORCE row level security.
--
-- FORCE matters: without it a table's owner bypasses its own policies, so the
-- protection would evaporate for the role that runs migrations. Superusers
-- still bypass RLS entirely, which is why application connections must never
-- use one.
--------------------------------------------------------------------------------

alter table organizations enable row level security;
alter table organizations force row level security;
alter table users enable row level security;
alter table users force row level security;
alter table projects enable row level security;
alter table projects force row level security;
alter table memberships enable row level security;
alter table memberships force row level security;
alter table grants enable row level security;
alter table grants force row level security;
alter table timeline_events enable row level security;
alter table timeline_events force row level security;
alter table deliverables enable row level security;
alter table deliverables force row level security;
alter table deliverable_versions enable row level security;
alter table deliverable_versions force row level security;
alter table decisions enable row level security;
alter table decisions force row level security;
alter table feedback enable row level security;
alter table feedback force row level security;

--------------------------------------------------------------------------------
-- Policies
--------------------------------------------------------------------------------

create policy projects_member_read on projects
for select using (app.is_project_member(id));

create policy memberships_member_read on memberships
for select using (app.is_project_member(project_id));

-- You can see a person if you share a project with them.
create policy users_shared_project_read on users
for select using (
  users.id = app.current_user_id()
  or exists (
    select 1
    from memberships m
    where m.user_id = users.id
      and app.is_project_member(m.project_id)
  )
);

-- You can see an organization if it is your own or it sits on either side of a
-- project you belong to.
create policy organizations_participating_read on organizations
for select using (
  exists (
    select 1
    from users u
    where u.id = app.current_user_id()
      and u.organization_id = organizations.id
  )
  or exists (
    select 1
    from projects p
    where (p.vendor_organization_id = organizations.id or p.client_organization_id = organizations.id)
      and app.is_project_member(p.id)
  )
);

create policy grants_member_read on grants
for select using (app.is_project_member(project_id));

create policy grants_member_insert on grants
for insert with check (app.is_project_member(project_id));

-- Revocation only; the grants_revocation_only trigger constrains which column
-- may actually change.
create policy grants_member_revoke on grants
for update using (app.is_project_member(project_id))
with check (app.is_project_member(project_id));

create policy timeline_events_member_read on timeline_events
for select using (app.is_project_member(project_id));

-- An event must be attributed to the actor writing it. Combined with the
-- append-only trigger, this means nobody can author history in someone
-- else's name, nor edit it afterwards.
create policy timeline_events_member_append on timeline_events
for insert with check (
  app.is_project_member(project_id)
  and actor_id = app.current_user_id()
);

create policy deliverables_member_read on deliverables
for select using (app.is_project_member(project_id));

create policy deliverables_member_insert on deliverables
for insert with check (app.is_project_member(project_id));

create policy deliverable_versions_member_read on deliverable_versions
for select using (
  app.is_project_member(
    (select d.project_id from deliverables d where d.id = deliverable_versions.deliverable_id)
  )
);

create policy deliverable_versions_member_insert on deliverable_versions
for insert with check (
  app.is_project_member(
    (select d.project_id from deliverables d where d.id = deliverable_versions.deliverable_id)
  )
);

create policy decisions_member_read on decisions
for select using (
  app.is_project_member(app.version_project_id(decisions.deliverable_version_id))
);

create policy decisions_member_insert on decisions
for insert with check (
  app.is_project_member(app.version_project_id(decisions.deliverable_version_id))
  and decided_by = app.current_user_id()
);

create policy feedback_member_read on feedback
for select using (
  app.is_project_member(app.version_project_id(feedback.deliverable_version_id))
);

create policy feedback_member_insert on feedback
for insert with check (
  app.is_project_member(app.version_project_id(feedback.deliverable_version_id))
  and author_id = app.current_user_id()
);

create policy feedback_member_resolve on feedback
for update using (
  app.is_project_member(app.version_project_id(feedback.deliverable_version_id))
)
with check (
  app.is_project_member(app.version_project_id(feedback.deliverable_version_id))
);

--------------------------------------------------------------------------------
-- Privileges
--
-- `authenticated` and `anon` are the roles Supabase provides. `anon` receives
-- nothing: every table in DavixRoom is project-scoped, so there is no
-- meaningful anonymous read.
--------------------------------------------------------------------------------

grant usage on schema app to authenticated;
grant execute on function app.current_user_id() to authenticated;
grant execute on function app.is_project_member(text) to authenticated;
grant execute on function app.version_project_id(text) to authenticated;

grant select on organizations, users, projects, memberships to authenticated;
grant select, insert, update on grants to authenticated;
grant select, insert on timeline_events to authenticated;
grant select, insert on deliverables, deliverable_versions, decisions to authenticated;
grant select, insert, update on feedback to authenticated;
