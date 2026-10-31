begin;
create table public.universal_book_corrections (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.universal_book_jobs on delete restrict,
 question_id uuid not null references public.questions on delete restrict,
 actor uuid not null references public.profiles on delete restrict,
 previous_record jsonb not null, corrected_record jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index universal_corrections_question_time on public.universal_book_corrections(question_id,created_at desc);
alter table public.universal_book_corrections enable row level security;
revoke all on public.universal_book_corrections from public,anon,authenticated,service_role;
grant select on public.universal_book_corrections to authenticated,service_role;
create policy universal_corrections_admin on public.universal_book_corrections for select to authenticated using(public.is_admin());
alter function public.universal_correct(uuid,jsonb) rename to universal_correct_before_audit;
revoke all on function public.universal_correct_before_audit(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.universal_correct(p_job uuid,p_record jsonb,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.universal_book_jobs; qid uuid; previous jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active)then raise exception 'Active admin required'using errcode='42501';end if;
 select * into j from public.universal_book_jobs where id=p_job for update;
 if not found or j.created_by<>p_actor then raise exception 'Import job belongs to another administrator'using errcode='42501';end if;
 select question_id,record into qid,previous from public.universal_book_ids where job_id=j.id and source_id=p_record->>'id';
 if qid is null then raise exception 'Original question identity required';end if;
 perform public.universal_correct_before_audit(p_job,p_record);
 insert into public.universal_book_corrections(job_id,question_id,actor,previous_record,corrected_record)values(j.id,qid,p_actor,previous,p_record);
end;$$;
revoke all on function public.universal_correct(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.universal_correct(uuid,jsonb,uuid) to service_role;
commit;
