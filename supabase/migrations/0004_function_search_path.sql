-- Stage 3 — pin search_path on the remaining functions.
--
-- Supabase's database linter flagged four functions with a mutable search_path.
-- A function that resolves unqualified names at call time can be redirected by
-- whatever schema happens to sit earliest in the caller's search_path, so an
-- attacker able to create objects in a reachable schema can shadow a built-in
-- and change what the function does. The policy helpers in migration 0002
-- already pin theirs; these four were missed.
--
-- `pg_catalog` alone is sufficient here: none of these functions reference an
-- application table. The trigger functions read only NEW and OLD, and
-- app.jwt_subject reads a session setting and casts it. Anything they do touch
-- lives in the catalog, so nothing needs to be resolvable in `public`.

alter function public.reject_mutation() set search_path = pg_catalog;
alter function public.grants_revocation_only() set search_path = pg_catalog;
alter function public.users_organization_immutable() set search_path = pg_catalog;
alter function app.jwt_subject() set search_path = pg_catalog;
