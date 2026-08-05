-- Stage 3b — organization and project onboarding.
--
-- Everything here exists to shorten one path: a vendor signs up, creates a
-- project, invites their client, and both sides end up in a room where a live
-- review can happen. The ownership hierarchy it implements is
--
--   Organization → Team Members → Projects → Client Invitations → Review Sessions
--
-- and the last node is the point. Projects and invitations are not the product;
-- they are the shortest structure that gets two parties into a review together.
--
--------------------------------------------------------------------------------
-- The bootstrap problem, and why writes go through functions
--
-- Migrations 0002 and 0003 gave `authenticated` SELECT and nothing else on
-- organizations, users, projects and memberships, and every policy is "you see
-- what you are a member of". Onboarding has to write the first rows for a
-- caller who is a member of nothing, which no table policy can express safely.
--
-- In particular a memberships INSERT policy cannot be written safely: the
-- natural check ("I already hold member.invite here") is false for a project's
-- creator, so it would need an escape hatch that also lets anybody insert a
-- membership for themselves into any project id they can guess. That is a total
-- tenancy bypass.
--
-- So no INSERT privilege is granted on these tables at all. Every onboarding
-- write goes through one of the four SECURITY DEFINER functions below. They run
-- as the owner and therefore bypass row level security, which makes validating
-- the caller their entire job — each one begins by resolving the caller from
-- the verified JWT and refusing to proceed if it cannot.
--
-- These functions check *structural* preconditions only: the caller has no user
-- row yet, the caller's organization is the project's vendor side, this
-- invitation is unexpired and addressed to this verified address. They never
-- evaluate a Capability. authorize() in src/core/auth remains the only place
-- the capability model lives, and it runs in the server action before any of
-- these are called — the same coarse-in-SQL, precise-in-the-domain split the
-- RLS policies already use.
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- Team standing
--
-- Distinct from a project role. Organization standing says who may create
-- projects and grow the team; it grants nothing inside any individual project,
-- which still requires a membership.
--------------------------------------------------------------------------------

alter table users
  add column organization_role text not null default 'org_member'
    check (organization_role in ('org_owner', 'org_admin', 'org_member'));

--------------------------------------------------------------------------------
-- Invitations
--
-- Two shapes, one lifecycle. A team invitation names no project and no role and
-- adds someone to an organization. A client invitation names both and carries
-- the invitee all the way into a project — one link, and they are somewhere a
-- review can start. The constraint makes the pair inseparable: a project
-- invitation without a role would produce a membership with no permissions.
--------------------------------------------------------------------------------

create table invitations (
  id text primary key,
  organization_id text not null references organizations (id),
  project_id text references projects (id) on delete cascade,
  role text check (
    role in (
      'vendor_owner',
      'vendor_developer',
      'client_approver',
      'client_reviewer',
      'observer'
    )
  ),
  -- Stored normalised so the acceptance comparison cannot be defeated by case.
  email text not null check (email = lower(btrim(email)) and length(email) > 0),
  -- Only ever the hash. The raw token is generated in the application, sent to
  -- the invitee, and never written down here: a leaked database backup must not
  -- be a set of working invitation links.
  token_hash text not null unique,
  invited_by text not null references users (id),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint invitations_shape check (
    (project_id is not null and role is not null)
    or (project_id is null and role is null)
  ),
  constraint invitations_window check (expires_at > created_at)
);

create index invitations_project_idx on invitations (project_id);
create index invitations_organization_idx on invitations (organization_id);

-- One live invitation per address per destination. Re-inviting somebody who has
-- not answered yet should reissue rather than accumulate parallel tokens that
-- all still work.
create unique index invitations_open_unique
  on invitations (organization_id, coalesce(project_id, ''), email)
  where accepted_at is null and revoked_at is null;

-- Same shape as grants_revocation_only: an invitation is a promise, and the
-- only permitted changes are the two ways it stops being open. Without this,
-- the acceptance path could be used to quietly re-point an invitation at a
-- different project, role or address.
create function invitations_terminal_only() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'invitation_immutable: invitations cannot be deleted, revoke instead'
      using errcode = 'restrict_violation';
  end if;

  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.project_id is distinct from old.project_id
    or new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.token_hash is distinct from old.token_hash
    or new.invited_by is distinct from old.invited_by
    or new.created_at is distinct from old.created_at
    or new.expires_at is distinct from old.expires_at
  then
    raise exception 'invitation_immutable: only accepted_at and revoked_at may be modified'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

alter function public.invitations_terminal_only() set search_path = pg_catalog;

create trigger invitations_terminal_only
before update or delete on invitations
for each row execute function invitations_terminal_only();

alter table invitations enable row level security;
alter table invitations force row level security;

-- Visible to the side that issued it and to the organization it points at.
-- The invitee cannot see it before accepting — they have no user row yet — which
-- is why acceptance is a function keyed by the token rather than a query.
create policy invitations_participant_read on invitations
for select using (
  (project_id is not null and app.is_project_member(project_id))
  or exists (
    select 1
    from users u
    where u.id = app.current_user_id()
      and u.organization_id = invitations.organization_id
  )
);

grant select on invitations to authenticated;

--------------------------------------------------------------------------------
-- Helpers
--------------------------------------------------------------------------------

-- Mirrors isRoleValidForSide in src/core/auth/authorize.ts. Duplicating a domain
-- rule here is the same deliberate belt-and-braces as the CHECK constraints in
-- 0001: the domain gives fast feedback and good errors, the database guarantees
-- the rule holds however the row arrived.
create function app.role_matches_side(target_role text, side text) returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when target_role = 'observer' then true
    when target_role in ('vendor_owner', 'vendor_developer') then side = 'vendor'
    when target_role in ('client_approver', 'client_reviewer') then side = 'client'
    else false
  end;
$$;

-- Which side of a project an organization sits on, or null.
create function app.organization_side(target_project_id text, target_org_id text)
returns text
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select case
    when p.vendor_organization_id = target_org_id then 'vendor'
    when p.client_organization_id = target_org_id then 'client'
    else null
  end
  from projects p
  where p.id = target_project_id;
$$;

create function app.new_id(prefix text) returns text
language sql
volatile
set search_path = pg_catalog
as $$
  select prefix || '_' || replace(gen_random_uuid()::text, '-', '');
$$;

-- Next position in a project's gapless timeline. The unique constraint on
-- (project_id, seq) is what makes a concurrent append fail rather than share a
-- position; this only has to be right within one transaction.
create function app.next_seq(target_project_id text) returns bigint
language sql
stable
security definer
set search_path = public, app, pg_catalog
as $$
  select coalesce(max(seq), 0) + 1 from timeline_events where project_id = target_project_id;
$$;

--------------------------------------------------------------------------------
-- 1. Bootstrap: a vendor registers itself
--
-- The only function that can create a user row for a subject that has none, and
-- it can only ever create one for the caller's own verified subject. Everything
-- else in the system requires an invitation.
--
-- Organizations created this way are always `vendor`. Clients never register —
-- a client organization exists only because a vendor named it while creating a
-- project, which is what keeps "clients enter only through invitations" true by
-- construction rather than by convention.
--------------------------------------------------------------------------------

-- Parameters are prefixed throughout these functions because plpgsql resolves a
-- bare name to a column when one is in scope, and `display_name` or
-- `token_hash` colliding with the column it is being compared to raises an
-- ambiguity error at call time rather than at creation.
create function app.bootstrap_organization(
  organization_name text,
  owner_display_name text
) returns text
language plpgsql
security definer
set search_path = public, app, auth, pg_catalog
as $$
declare
  subject uuid := app.jwt_subject();
  caller_email text;
  new_org_id text;
  new_user_id text;
begin
  if subject is null then
    raise exception 'not_authenticated: no verified subject on this request'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(organization_name), '') = '' then
    raise exception 'invalid_input: organization name is required'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(owner_display_name), '') = '' then
    raise exception 'invalid_input: display name is required'
      using errcode = 'check_violation';
  end if;

  select lower(btrim(u.email)) into caller_email from auth.users u where u.id = subject;

  if caller_email is null or caller_email = '' then
    raise exception 'not_authenticated: subject has no email'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotence guard, and the thing that stops this being a way to mint
  -- organizations in bulk: one person, one organization, for life.
  if exists (select 1 from users u where u.auth_user_id = subject) then
    raise exception 'already_onboarded: this account already belongs to an organization'
      using errcode = 'unique_violation';
  end if;

  if exists (select 1 from users u where u.email = caller_email) then
    raise exception 'email_taken: that address already belongs to a DavixRoom user'
      using errcode = 'unique_violation';
  end if;

  new_org_id := app.new_id('org');
  new_user_id := app.new_id('user');

  insert into organizations (id, kind, name)
  values (new_org_id, 'vendor', btrim(organization_name));

  insert into users (id, organization_id, organization_role, display_name, email, auth_user_id)
  values (new_user_id, new_org_id, 'org_owner', btrim(owner_display_name), caller_email, subject);

  return new_user_id;
end;
$$;

--------------------------------------------------------------------------------
-- 2. Create a project
--
-- Creates the client organization, the project, and the creator's membership in
-- one transaction. The atomicity is load-bearing: a project without its first
-- membership is invisible to everybody including the person who made it — no
-- policy would return the row, so it could never be found, joined or deleted.
--------------------------------------------------------------------------------

create function app.create_project(
  project_name text,
  client_organization_name text default null,
  existing_client_organization_id text default null
) returns text
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  caller_id text := app.current_user_id();
  caller_org_id text;
  caller_role text;
  caller_org_kind text;
  client_org_id text;
  new_project_id text;
  membership_id text;
  now_at timestamptz := now();
begin
  if caller_id is null then
    raise exception 'not_authenticated: no DavixRoom user for this request'
      using errcode = 'insufficient_privilege';
  end if;

  select u.organization_id, u.organization_role into caller_org_id, caller_role
  from users u where u.id = caller_id;

  select o.kind into caller_org_kind from organizations o where o.id = caller_org_id;

  -- A client organization can never own a project. Checked before the role,
  -- because a client organization's first user is necessarily its owner.
  if caller_org_kind <> 'vendor' then
    raise exception 'client_organization: only vendor organizations create projects'
      using errcode = 'insufficient_privilege';
  end if;

  if caller_role not in ('org_owner', 'org_admin') then
    raise exception 'forbidden: creating a project requires org_owner or org_admin'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(project_name), '') = '' then
    raise exception 'invalid_input: project name is required'
      using errcode = 'check_violation';
  end if;

  if (client_organization_name is null) = (existing_client_organization_id is null) then
    raise exception 'invalid_input: name exactly one client organization, new or existing'
      using errcode = 'check_violation';
  end if;

  if existing_client_organization_id is not null then
    -- Reuse is limited to clients this vendor already delivers to. Without that
    -- restriction, a vendor could attach any organization id they guessed to a
    -- new project and gain a read path into it through project membership.
    if not exists (
      select 1 from projects p
      where p.vendor_organization_id = caller_org_id
        and p.client_organization_id = existing_client_organization_id
    ) then
      raise exception 'unknown_client: that organization is not one of yours'
        using errcode = 'insufficient_privilege';
    end if;
    client_org_id := existing_client_organization_id;
  else
    if coalesce(btrim(client_organization_name), '') = '' then
      raise exception 'invalid_input: client organization name is required'
        using errcode = 'check_violation';
    end if;
    client_org_id := app.new_id('org');
    insert into organizations (id, kind, name)
    values (client_org_id, 'client', btrim(client_organization_name));
  end if;

  new_project_id := app.new_id('project');
  membership_id := app.new_id('membership');

  insert into projects
    (id, vendor_organization_id, client_organization_id, name, status, created_at)
  values
    (new_project_id, caller_org_id, client_org_id, btrim(project_name), 'active', now_at);

  insert into memberships (id, project_id, user_id, role, joined_at)
  values (membership_id, new_project_id, caller_id, 'vendor_owner', now_at);

  insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
  values
    (app.new_id('event'), new_project_id, 1, 'project.created', caller_id, now_at,
     jsonb_build_object('name', btrim(project_name))),
    (app.new_id('event'), new_project_id, 2, 'member.joined', caller_id, now_at,
     jsonb_build_object('userId', caller_id, 'role', 'vendor_owner'));

  return new_project_id;
end;
$$;

--------------------------------------------------------------------------------
-- 3. Invite somebody
--
-- The caller must be an active member of the project and sit on its vendor
-- side. That is deliberately coarser than the capability model — a
-- vendor_developer passes this and is still refused by authorize(), which runs
-- first in the server action. The same division as the RLS policies: structure
-- here, capabilities in the domain.
--
-- The raw token never reaches the database. The application generates it,
-- hashes it, and passes only the hash.
--------------------------------------------------------------------------------

create function app.create_invitation(
  target_project_id text,
  invitee_email text,
  invitee_role text,
  invitation_token_hash text,
  invitation_expires_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, app, pg_catalog
as $$
declare
  caller_id text := app.current_user_id();
  caller_org_id text;
  caller_side text;
  destination_org_id text;
  destination_side text;
  normalised_email text := lower(btrim(coalesce(invitee_email, '')));
  new_invitation_id text;
  now_at timestamptz := now();
begin
  if caller_id is null then
    raise exception 'not_authenticated: no DavixRoom user for this request'
      using errcode = 'insufficient_privilege';
  end if;

  if normalised_email = '' then
    raise exception 'invalid_input: an email address is required'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(invitation_token_hash), '') = '' then
    raise exception 'invalid_input: a token hash is required'
      using errcode = 'check_violation';
  end if;

  if invitation_expires_at is null or invitation_expires_at <= now_at then
    raise exception 'invalid_input: expiry must be in the future'
      using errcode = 'check_violation';
  end if;

  if not app.is_project_member(target_project_id) then
    raise exception 'forbidden: you are not a member of that project'
      using errcode = 'insufficient_privilege';
  end if;

  select u.organization_id into caller_org_id from users u where u.id = caller_id;
  caller_side := app.organization_side(target_project_id, caller_org_id);

  if caller_side is distinct from 'vendor' then
    raise exception 'forbidden: only the vendor side invites'
      using errcode = 'insufficient_privilege';
  end if;

  -- Which organization the invitee lands in follows from the role, so an
  -- invitation cannot quietly put a client-side reviewer inside the vendor org.
  if invitee_role in ('vendor_owner', 'vendor_developer') then
    destination_side := 'vendor';
    select p.vendor_organization_id into destination_org_id
    from projects p where p.id = target_project_id;
  elsif invitee_role in ('client_approver', 'client_reviewer', 'observer') then
    destination_side := 'client';
    select p.client_organization_id into destination_org_id
    from projects p where p.id = target_project_id;
  else
    raise exception 'invalid_input: unknown role %', invitee_role
      using errcode = 'check_violation';
  end if;

  if not app.role_matches_side(invitee_role, destination_side) then
    raise exception 'invalid_input: role % cannot be held on the % side', invitee_role, destination_side
      using errcode = 'check_violation';
  end if;

  new_invitation_id := app.new_id('invitation');

  insert into invitations
    (id, organization_id, project_id, role, email, token_hash, invited_by,
     created_at, expires_at)
  values
    (new_invitation_id, destination_org_id, target_project_id, invitee_role,
     normalised_email, btrim(invitation_token_hash), caller_id, now_at,
     invitation_expires_at);

  return new_invitation_id;
end;
$$;

--------------------------------------------------------------------------------
-- 4. Accept an invitation
--
-- Looked up by token hash, because the invitee has no user row yet and so no
-- policy could show them the invitation.
--
-- The token is not the credential. Acceptance requires being signed in as the
-- address the invitation names, and requires that address to be *confirmed* —
-- otherwise anyone could sign up claiming the invitee's address and walk in
-- with a forwarded link.
--------------------------------------------------------------------------------

create function app.accept_invitation(
  invitation_token_hash text,
  invitee_display_name text default null
) returns text
language plpgsql
security definer
set search_path = public, app, auth, pg_catalog
as $$
declare
  subject uuid := app.jwt_subject();
  caller_email text;
  confirmed_at timestamptz;
  invitation invitations%rowtype;
  existing_user_id text;
  existing_org_id text;
  target_user_id text;
  membership_id text;
  destination_side text;
  now_at timestamptz := now();
begin
  if subject is null then
    raise exception 'not_authenticated: no verified subject on this request'
      using errcode = 'insufficient_privilege';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
  into caller_email, confirmed_at
  from auth.users u where u.id = subject;

  if caller_email is null or caller_email = '' then
    raise exception 'not_authenticated: subject has no email'
      using errcode = 'insufficient_privilege';
  end if;

  if confirmed_at is null then
    raise exception 'email_unconfirmed: confirm your email address before accepting'
      using errcode = 'insufficient_privilege';
  end if;

  select * into invitation from invitations i
  where i.token_hash = invitation_token_hash;

  -- One message for "no such token" and "not for you". Distinguishing them
  -- would turn this into an oracle for which addresses have been invited.
  if invitation.id is null
    or invitation.email is distinct from caller_email
  then
    raise exception 'invitation_invalid: that invitation is not available'
      using errcode = 'insufficient_privilege';
  end if;

  if invitation.revoked_at is not null then
    raise exception 'invitation_revoked: that invitation was withdrawn'
      using errcode = 'insufficient_privilege';
  end if;

  if invitation.accepted_at is not null then
    raise exception 'invitation_used: that invitation has already been accepted'
      using errcode = 'insufficient_privilege';
  end if;

  if invitation.expires_at <= now_at then
    raise exception 'invitation_expired: that invitation has expired'
      using errcode = 'insufficient_privilege';
  end if;

  select u.id, u.organization_id into existing_user_id, existing_org_id
  from users u where u.auth_user_id = subject;

  if existing_user_id is not null then
    -- users.organization_id is immutable by trigger; refusing here gives a
    -- comprehensible error instead of a constraint failure.
    if existing_org_id is distinct from invitation.organization_id then
      raise exception 'organization_conflict: this account already belongs to another organization'
        using errcode = 'restrict_violation';
    end if;
    target_user_id := existing_user_id;
  else
    if exists (select 1 from users u where u.email = caller_email) then
      raise exception 'email_taken: that address already belongs to a DavixRoom user'
        using errcode = 'unique_violation';
    end if;

    target_user_id := app.new_id('user');
    insert into users (id, organization_id, organization_role, display_name, email, auth_user_id)
    values (
      target_user_id,
      invitation.organization_id,
      'org_member',
      coalesce(
        nullif(btrim(coalesce(invitee_display_name, '')), ''),
        split_part(caller_email, '@', 1)
      ),
      caller_email,
      subject
    );
  end if;

  if invitation.project_id is not null then
    destination_side := app.organization_side(invitation.project_id, invitation.organization_id);

    if not app.role_matches_side(invitation.role, destination_side) then
      raise exception 'invalid_input: role % cannot be held on the % side', invitation.role, destination_side
        using errcode = 'check_violation';
    end if;

    if not exists (
      select 1 from memberships m
      where m.project_id = invitation.project_id and m.user_id = target_user_id
    ) then
      membership_id := app.new_id('membership');

      insert into memberships (id, project_id, user_id, role, joined_at)
      values (membership_id, invitation.project_id, target_user_id, invitation.role, now_at);

      insert into timeline_events (id, project_id, seq, type, actor_id, occurred_at, payload)
      values (
        app.new_id('event'),
        invitation.project_id,
        app.next_seq(invitation.project_id),
        'member.joined',
        target_user_id,
        now_at,
        jsonb_build_object('userId', target_user_id, 'role', invitation.role)
      );
    end if;
  end if;

  update invitations set accepted_at = now_at where id = invitation.id;

  return invitation.project_id;
end;
$$;

--------------------------------------------------------------------------------
-- Privileges
--
-- EXECUTE only. No INSERT is granted on organizations, users, projects,
-- memberships or invitations to any role, which is what makes these four
-- functions the entire write surface for onboarding.
--------------------------------------------------------------------------------

grant execute on function app.bootstrap_organization(text, text) to authenticated;
grant execute on function app.create_project(text, text, text) to authenticated;
grant execute on function app.create_invitation(text, text, text, text, timestamptz) to authenticated;
grant execute on function app.accept_invitation(text, text) to authenticated;

-- The helpers are implementation details of the four functions above, which
-- reach them as the definer. Nothing outside needs them, and
-- app.organization_side in particular would otherwise let any signed-in caller
-- probe whether a given organization sits on a given project.
revoke all on function app.new_id(text) from public;
revoke all on function app.next_seq(text) from public;
revoke all on function app.organization_side(text, text) from public;
revoke all on function app.role_matches_side(text, text) from public;
