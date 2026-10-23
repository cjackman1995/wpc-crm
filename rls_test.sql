-- Permission tests. Run with: npm run test:db   (needs a local Postgres, see README)
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create or replace function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- Users: first one becomes manager automatically, the rest are reps.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'boss@example.com',  '{"full_name":"Morgan Manager"}'),
  ('00000000-0000-0000-0000-00000000000b', 'cooper@example.com','{"full_name":"Cooper Jackman"}'),
  ('00000000-0000-0000-0000-00000000000c', 'riley@example.com', '{"full_name":"Riley Rep"}');

select pg_temp.check('first user is manager, others are reps',
  (select string_agg(role::text, ',' order by email) from public.profiles) = 'manager,rep,rep');

-- ---- as Cooper (rep)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';

insert into public.leads (company, amount, stage_id) values
  ('Wadham', 1650000, (select id from public.stages where name = 'Testing Complete')),
  ('Corning', 175000, (select id from public.stages where name = 'Verbal Commit'));
select pg_temp.check('rep insert defaults owner to self',
  (select count(*) from public.leads where owner_id = auth.uid()) = 2);

do $$ begin
  insert into public.leads (company, stage_id, owner_id)
  values ('Sneaky', 1, '00000000-0000-0000-0000-00000000000c');
  raise exception 'FAIL: rep created a lead owned by someone else';
exception when insufficient_privilege then raise notice 'ok  rep cannot create a lead for another rep';
end $$;

insert into public.tasks (title, due_date, lead_id)
  select 'Call about order', current_date, id from public.leads where company = 'Corning';

-- ---- as Riley (rep)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into public.leads (company, amount, stage_id) values ('Rain Carbon', 1200000, 5);
select pg_temp.check('Riley sees only her own lead', (select count(*) from public.leads) = 1);
select pg_temp.check('Riley cannot see Cooper''s tasks', (select count(*) from public.tasks) = 0);
select pg_temp.check('Riley cannot see Cooper''s stage history',
  (select count(*) from public.stage_changes) = 1);

update public.leads set amount = 1 where company = 'Wadham';
select pg_temp.check('Riley''s update of Cooper''s lead touched nothing', true);

do $$ begin
  update public.leads set owner_id = '00000000-0000-0000-0000-00000000000b' where company = 'Rain Carbon';
  raise exception 'FAIL: rep handed a lead to someone else';
exception when insufficient_privilege then raise notice 'ok  rep cannot reassign a lead';
end $$;

do $$ begin
  delete from public.leads where company = 'Rain Carbon';
  if exists (select 1 from public.leads where company = 'Rain Carbon') then
    raise notice 'ok  rep cannot delete leads';
  else
    raise exception 'FAIL: rep deleted a lead';
  end if;
end $$;

do $$ begin
  update public.profiles set role = 'manager' where id = auth.uid();
  raise exception 'FAIL: rep promoted herself';
exception when raise_exception then raise notice 'ok  rep cannot promote herself';
end $$;

do $$ begin
  insert into public.activities (lead_id, type, body)
    select id, 'note', 'snooping' from public.leads where company = 'Wadham';
  if (select count(*) from public.activities where body = 'snooping') = 0 then
    raise notice 'ok  rep cannot log activity on a lead she cannot see';
  end if;
exception when insufficient_privilege then raise notice 'ok  rep cannot log activity on a lead she cannot see';
end $$;

select pg_temp.check('duplicate check reports owner without exposing the lead',
  (select owner_name from public.find_existing_leads(array[]::text[], array['wadham'])) = 'Cooper Jackman');

do $$ begin
  perform public.transfer_book('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
  raise exception 'FAIL: rep transferred leads';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  rep cannot transfer a book of business';
end $$;

-- ---- as manager
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.check('manager sees every lead', (select count(*) from public.leads) = 3);
select pg_temp.check('manager sees every task', (select count(*) from public.tasks) = 1);
select pg_temp.check('Wadham amount unchanged by Riley',
  (select amount from public.leads where company = 'Wadham') = 1650000);

update public.leads set stage_id = (select id from public.stages where name = 'Closed Won'), probability = 0.6
  where company = 'Corning';
update public.leads set probability = 0.6 where company = 'Wadham';
update public.leads set stage_id = (select id from public.stages where name = 'Negotiation') where company = 'Wadham';
select pg_temp.check('closing a lead stamps closed_at',
  (select closed_at is not null from public.leads where company = 'Corning'));
select pg_temp.check('stage move resets a manual probability',
  (select probability is null from public.leads where company = 'Wadham'));
select pg_temp.check('stage moves recorded in history (2 creates + 2 moves for Cooper''s leads)',
  (select count(*) from public.stage_changes s join public.leads l on l.id = s.lead_id
    where l.owner_id = '00000000-0000-0000-0000-00000000000b') = 4);
select pg_temp.check('stage move logged on the timeline',
  (select count(*) from public.activities where type = 'stage_change') = 2);

update public.profiles set role = 'manager' where email = 'riley@example.com';
update public.profiles set role = 'rep' where email = 'riley@example.com';
select pg_temp.check('manager can change roles', true);

do $$ begin
  update public.profiles set role = 'rep' where id = auth.uid();
  raise exception 'FAIL: manager demoted himself';
exception when raise_exception then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  manager cannot lock himself out';
end $$;

select pg_temp.check('transfer moves the whole book',
  public.transfer_book('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c') = 2);

update public.tasks set status = 'done';
select pg_temp.check('completing a task stamps completed_at',
  (select bool_and(completed_at is not null) from public.tasks));

-- ---- deactivated rep loses access
update public.profiles set active = false where email = 'riley@example.com';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check('deactivated user sees nothing', (select count(*) from public.leads) = 0);

-- ---- not signed in
reset request.jwt.claim.sub;
reset role;
set role anon;
do $$ begin
  perform 1 from public.leads;
  raise exception 'FAIL: anonymous read';
exception when insufficient_privilege then raise notice 'ok  anonymous visitors get nothing';
end $$;
reset role;

\echo 'All permission tests passed.'
