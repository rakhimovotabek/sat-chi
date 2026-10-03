begin;
create function public.valid_vocabulary_question(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'question') is distinct from 'string' or char_length(btrim(p->>'question')) not between 1 and 20000 then return false;end if;
 if jsonb_typeof(p->'options') is distinct from 'array' then return false;end if;
 if jsonb_array_length(p->'options')<>4 or exists(select 1 from jsonb_array_elements(p->'options') v where jsonb_typeof(v)<>'string' or char_length(btrim(v#>>'{}')) not between 1 and 4000) then return false;end if;
 if jsonb_typeof(p->'correctAnswer') is distinct from 'number' or (p->>'correctAnswer') !~ '^[0-3]$' then return false;end if;
 if p ? 'type' and p->>'type'<>'mcq' then return false;end if;
 if p ? 'explanation' and (jsonb_typeof(p->'explanation')<>'string' or length(p->>'explanation')>60000) then return false;end if;
 if p ? 'passage' and (jsonb_typeof(p->'passage')<>'string' or length(p->>'passage')>60000) then return false;end if;
 return true;end;$$;
revoke all on function public.valid_vocabulary_question(jsonb) from public,anon,authenticated;
grant execute on function public.valid_vocabulary_question(jsonb) to authenticated,service_role;
alter table public.vocabulary_questions add constraint valid_vocab_payload check(public.valid_vocabulary_question(payload));
alter table public.vocabulary_words add constraint vocabulary_text_limits check(length(example)<=6000 and length(synonym)<=6000 and length(translation)<=6000);
alter table public.vocabulary_books add constraint vocabulary_book_limits check(length(description)<=10000 and length(source)<=500);
alter table public.vocabulary_sets add constraint vocabulary_set_position check(position>=0);
create function public.sync_book_section() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.questions q set section=case when new.category='Math' then 'Math' else 'Reading & Writing' end from public.book_topics t where q.topic_id=t.id and t.book_id=new.id;return new;end;$$;
create trigger book_section after update of category on public.books for each row execute function public.sync_book_section();
revoke all on function public.sync_book_section() from public,anon,authenticated;
-- Upgrade only missing descriptive metadata on old snapshots; saved keys/answers are untouched.
update public.book_practice_items i set question=jsonb_set(i.question,'{section}',to_jsonb(q.section)) from public.questions q where i.question->>'id'=q.id::text and not i.question ? 'section';
alter function public.learning_metrics(uuid) rename to learning_metrics_internal;
revoke all on function public.learning_metrics_internal(uuid) from public,anon,authenticated;
create function public.learning_metrics(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb; streak integer:=0; day date; cursor_day date:=current_date;begin
 result=public.learning_metrics_internal(uid);
 if not exists(select 1 from public.student_activity where student_id=uid and created_at::date=current_date) then cursor_day=current_date-1;end if;
 for day in select distinct created_at::date from public.student_activity where student_id=uid order by 1 desc loop
 if day=cursor_day then streak=streak+1;cursor_day=cursor_day-1;elsif day<cursor_day then exit;end if;end loop;
 return result||jsonb_build_object('streak',streak);end;$$;
revoke all on function public.learning_metrics(uuid) from public,anon,authenticated;
grant execute on function public.learning_metrics(uuid) to authenticated;
commit;
