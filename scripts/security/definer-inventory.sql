-- Regenerates docs/security/SECURITY-DEFINER-INVENTORY.md's table.
-- Run against production and paste the rows in. Read-only.
--
-- Extension-owned functions are excluded: btree_gist and pg_net live in
-- `public`, we do not own them, and their grants are the extension author's.
select p.proname                                                as fn,
       pg_get_userbyid(p.proowner)                              as owner,
       (p.prorettype = 'trigger'::regtype)                      as is_trigger,
       coalesce((select c from unnest(p.proconfig) c
                 where c like 'search\_path=%'), '(MUTABLE)')   as search_path,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role,
       exists(select 1 from pg_policy pol
              where pg_get_expr(pol.polqual,      pol.polrelid) like '%'||p.proname||'%'
                 or pg_get_expr(pol.polwithcheck, pol.polrelid) like '%'||p.proname||'%')
                                                                as called_from_rls
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not exists (select 1 from pg_depend d
                  where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e')
order by has_function_privilege('anon', p.oid, 'EXECUTE') desc, p.proname;
