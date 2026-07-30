-- ============================================================================
-- CLAVE - Endurecimento de funções auxiliares e triggers
-- ============================================================================

-- Fixar search_path impede que objetos homônimos de outros schemas sejam
-- resolvidos por funções administrativas ou executadas por triggers.
alter function public.handle_updated_at() set search_path = public;
alter function public.is_admin(uuid) set search_path = public;
alter function public.get_project_owner(uuid) set search_path = public;
alter function public.handle_new_user() set search_path = public;
alter function public.trg_check_same_agency() set search_path = public;
alter function public.trg_sync_briefing_project() set search_path = public;
alter function public.trg_set_briefing_audit() set search_path = public;
alter function public.trg_audit_project_access() set search_path = public;
alter function public.trg_prepare_chip_schedule() set search_path = public;
alter function public.trg_log_chip_event() set search_path = public;
alter function public.user_has_project_access(uuid, uuid) set search_path = public;
alter function public.user_can_manage_project(uuid, uuid) set search_path = public;

-- Funções de RLS são necessárias para usuários autenticados, mas nunca para
-- chamadas anônimas.
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.get_project_owner(uuid) from public, anon;
revoke execute on function public.user_has_project_access(uuid, uuid) from public, anon;
revoke execute on function public.user_can_manage_project(uuid, uuid) from public, anon;
revoke execute on function public.user_can_administer_project(uuid, uuid) from public, anon;
revoke execute on function public.user_has_project_module_access(uuid, text, uuid) from public, anon;
revoke execute on function public.user_has_communication_product_access(uuid, uuid) from public, anon;
revoke execute on function public.user_has_launch_module_access(uuid, uuid) from public, anon;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.get_project_owner(uuid) to authenticated;
grant execute on function public.user_has_project_access(uuid, uuid) to authenticated;
grant execute on function public.user_can_manage_project(uuid, uuid) to authenticated;
grant execute on function public.user_can_administer_project(uuid, uuid) to authenticated;
grant execute on function public.user_has_project_module_access(uuid, text, uuid) to authenticated;
grant execute on function public.user_has_communication_product_access(uuid, uuid) to authenticated;
grant execute on function public.user_has_launch_module_access(uuid, uuid) to authenticated;

-- Funções de trigger não devem ser expostas como RPC.
revoke execute on function public.handle_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.trg_check_same_agency() from public, anon, authenticated;
revoke execute on function public.trg_sync_briefing_project() from public, anon, authenticated;
revoke execute on function public.trg_set_briefing_audit() from public, anon, authenticated;
revoke execute on function public.trg_audit_project_access() from public, anon, authenticated;
revoke execute on function public.trg_prepare_chip_schedule() from public, anon, authenticated;
revoke execute on function public.trg_log_chip_event() from public, anon, authenticated;
