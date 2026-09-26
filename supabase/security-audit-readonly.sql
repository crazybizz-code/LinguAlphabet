-- ============================================================
-- READ-ONLY security audit — run in the Supabase SQL Editor BEFORE and
-- AFTER applying supabase/security-remediation-2026-09.sql, and keep both
-- outputs with the review. Every statement is a SELECT against the system
-- catalogs; nothing here changes the database.
--
-- Why this exists: the repo cannot see policies/grants created in the
-- dashboard, and the remediation branch had no direct database access
-- (REST keys only). This closes that gap and surfaces drift.
-- ============================================================

-- 1. RLS state for every public table
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by 1;

-- 2. Every policy (look for anything not defined in the repo's supabase/*.sql)
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Table-level privileges held by the learner-facing roles
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
group by table_name, grantee
order by table_name, grantee;

-- 4. Column-level privileges (profiles must show only the self-reported columns after remediation)
select table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('profiles', 'assessment_questions', 'placement_attempts', 'progress')
order by table_name, grantee, privilege_type, column_name;

-- 5. Functions callable over PostgREST (/rest/v1/rpc/*) and who can execute them
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

-- 6. Triggers on public tables and on auth.users
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth')
order by 1, 2, 3;

-- 7. Views and whether they run with invoker rights (a non-invoker view bypasses RLS)
select c.relname as view_name,
       coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') as security_invoker,
       has_table_privilege('anon', c.oid, 'select') as anon_can_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_can_select
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by 1;

-- 8. Default privileges that will apply to FUTURE tables/functions
select pg_get_userbyid(d.defaclrole) as owner, d.defaclobjtype as object_type, d.defaclacl as acl
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public';
