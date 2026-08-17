create or replace function public.set_app_error_resolution_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'resolved' then
      new.resolved_at := now();
      new.resolved_by := (select auth.uid());
    else
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_app_error_resolution_audit()
  from public, anon, authenticated;

create trigger set_app_error_resolution_audit
  before update on public.app_error_events
  for each row execute function public.set_app_error_resolution_audit();

revoke update on public.app_error_events from authenticated;
grant update(status, admin_notes) on public.app_error_events to authenticated;

comment on function public.set_app_error_resolution_audit() is
  'Preenche resolved_at e resolved_by com o ator autenticado quando o status muda.';
