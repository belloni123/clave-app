-- Run against staging after the viewer migration. All fixture changes roll back.
begin;
insert into auth.users(id, email) values
  ('90000000-0000-4000-8000-000000000001', 'team-test-owner@example.invalid'),
  ('90000000-0000-4000-8000-000000000002', 'team-test-collaborator@example.invalid');
update public.profiles set role='colab', agency_role='colaborador'
where id in ('90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002');
insert into public.projects(id,user_id,name) values
  ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000001','Team test A'),
  ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000001','Team test B'),
  ('90000000-0000-4000-8000-000000000013','90000000-0000-4000-8000-000000000001','Team test blocked');
insert into public.project_users(project_id,user_id,permission_level,allowed_modules,concedido_por) values
  ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000002','editor',array['comunicacao'],'90000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000012','90000000-0000-4000-8000-000000000002','viewer',array['comunicacao'],'90000000-0000-4000-8000-000000000001');
insert into public.colab_assignments(colab_id,project_id) values
  ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000011');
insert into public.communication_products(id,project_id,name) values
  ('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000011','Product A'),
  ('90000000-0000-4000-8000-000000000022','90000000-0000-4000-8000-000000000012','Product B'),
  ('90000000-0000-4000-8000-000000000023','90000000-0000-4000-8000-000000000013','Blocked product');
insert into public.communication_product_fields(product_id,key,value) values
  ('90000000-0000-4000-8000-000000000022','test','Original');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare affected integer;
begin
  if (select count(*) from public.projects where id::text like '90000000-%') <> 2 then raise exception 'project visibility failed'; end if;
  if (select count(*) from public.communication_products where id::text like '90000000-%') <> 2 then raise exception 'module read failed'; end if;
  update public.communication_products set name='Editor changed' where id='90000000-0000-4000-8000-000000000021';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'editor update failed'; end if;
  update public.communication_products set name='Viewer changed' where id='90000000-0000-4000-8000-000000000022';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'viewer update allowed'; end if;
  update public.communication_product_fields set value='Viewer changed' where product_id='90000000-0000-4000-8000-000000000022';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'viewer child update allowed'; end if;
  delete from public.communication_products where id='90000000-0000-4000-8000-000000000022';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'viewer delete allowed'; end if;
  begin
    insert into public.communication_products(project_id,name) values ('90000000-0000-4000-8000-000000000012','Viewer insert');
    raise exception 'viewer insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.stories(project_id,title,category,emotion,body) values ('90000000-0000-4000-8000-000000000011','Forbidden','test','test','test');
    raise exception 'blocked module write allowed';
  exception when insufficient_privilege then null; end;
  update public.project_users set permission_level='admin' where user_id=auth.uid();
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'collaborator escalated role'; end if;
  if public.user_has_project_module_access('90000000-0000-4000-8000-000000000011','historias',auth.uid()) then raise exception 'blocked module readable'; end if;
end;
$$;
reset role;
update public.profiles set blocked_at=now() where id='90000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
declare affected integer;
begin
  if private.team_account_active() then raise exception 'blocked account active'; end if;
  if exists(select 1 from public.projects where id::text like '90000000-%') then raise exception 'blocked account reads projects'; end if;
  if exists(select 1 from public.communication_products where id::text like '90000000-%') then raise exception 'blocked account reads content'; end if;
  update public.communication_products set name='Blocked write' where id='90000000-0000-4000-8000-000000000021';
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'blocked account writes'; end if;
  begin
    update public.profiles set blocked_at=null where id=auth.uid();
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'self unblock allowed'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform private.check_team_account();
    raise exception 'blocked account passed Data API hook';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
update public.profiles set blocked_at=null where id='90000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$
begin
  perform private.check_team_account();
  if (select count(*) from public.projects where id::text like '90000000-%')<>2 then raise exception 'unblock did not restore permissions'; end if;
  begin
    update public.profiles set deleted_at=now() where id=auth.uid();
    raise exception 'direct status update allowed';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
-- Deleting the owner must close access even with ownership privileges, and keep
-- both project data and membership history intact.
update public.profiles set blocked_at=now(),deleted_at=now() where id='90000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
begin
  if exists(select 1 from public.projects where id::text like '90000000-%') then raise exception 'deleted owner still has access'; end if;
  begin
    perform private.check_team_account();
    raise exception 'deleted owner passed Data API hook';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
begin
  if (select count(*) from public.projects where id::text like '90000000-%')<>3 then raise exception 'deletion erased projects'; end if;
  if (select count(*) from public.project_users where user_id='90000000-0000-4000-8000-000000000002' and ativo)<>2 then raise exception 'saved permissions changed'; end if;
end;
$$;
select 'PASS: block denies existing JWT; unblock restores grants; deletion preserves projects; self status editing denied' as result;
rollback;
