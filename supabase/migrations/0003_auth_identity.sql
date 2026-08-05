-- Stage 3 — authentication identity.
--
-- Two changes. First, domain users gain a link to the authentication subject.
-- Second, and more importantly, the `app.user_id` override is removed from
-- app.current_user_id().
--
-- That override was a privilege-escalation backdoor: any connection able to run
-- `select set_config('app.user_id', '<victim>', false)` became that user, and
-- every policy in migration 0002 trusts the result. Identity now comes only
-- from the verified JWT claims Supabase attaches to a request, so tests and
-- production exercise the same path and there is no forgeable side channel.

--------------------------------------------------------------------------------
-- Linking domain users to authentication subjects
--
-- The link is a separate column rather than making users.id the auth uuid.
-- Domain identity stays independent of the auth vendor: timeline events,
-- decisions and grants are immutable and reference users.id, so a change of
-- authentication provider must not force a rewrite of the historical record.
--
-- ON DELETE SET NULL because deleting a login must not delete a person from the
-- project history. They simply lose the ability to sign in.
--------------------------------------------------------------------------------

alter table users
  add column auth_user_id uuid unique references auth.users (id) on delete set null;

create index users_auth_user_id_idx on users (auth_user_id);

--------------------------------------------------------------------------------
-- Identity resolution
--------------------------------------------------------------------------------

-- Reads the subject from the request's verified JWT claims.
--
-- Deliberately does not call auth.uid(): reading the claim directly means the
-- same function works against a plain Postgres used for testing, where the
-- Supabase auth helpers do not exist.
create or replace function app.jwt_subject() returns uuid
language plpgsql
stable
as $$
declare
  claims text;
  subject text;
begin
  claims := current_setting('request.jwt.claims', true);
  if claims is null or claims = '' then
    return null;
  end if;

  subject := claims::jsonb ->> 'sub';
  if subject is null or subject = '' then
    return null;
  end if;

  return subject::uuid;
exception
  when others then
    return null;
end;
$$;

-- Maps the authenticated subject to a domain user id.
--
-- SECURITY DEFINER so it can read `users` without tripping that table's own
-- policy, which calls this function. The owning role bypasses row level
-- security, which makes the lookup terminate rather than recurse.
create or replace function app.current_user_id() returns text
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select u.id
  from users u
  where u.auth_user_id = app.jwt_subject();
$$;

--------------------------------------------------------------------------------
-- A user cannot change organization
--
-- Roles are validated against the side of the project a user's organization
-- sits on. Moving a user between organizations after the fact would silently
-- invalidate every membership they hold, so the tenancy of a person is fixed
-- at creation.
--------------------------------------------------------------------------------

create function users_organization_immutable() returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'user_organization_immutable: a user cannot change organization'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger users_organization_immutable
before update on users
for each row execute function users_organization_immutable();

grant execute on function app.jwt_subject() to authenticated;
grant execute on function app.current_user_id() to authenticated;
