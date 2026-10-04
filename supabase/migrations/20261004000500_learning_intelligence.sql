begin;
create index practice_submitted_owner_idx on public.book_practice_sessions(student_id,submitted_at desc)where submitted_at is not null;
create or replace function public.learning_metrics(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid());result jsonb; zone text; today date; cursor_day date; day date; streak integer:=0; longest integer:=0; days date[];sat jsonb;attention jsonb;
begin
 result=public.learning_metrics_internal(uid); -- Existing active-user/admin ownership boundary stays authoritative.
 select coalesce((select timezone from public.study_preferences where student_id=uid),'UTC') into zone;today=timezone(zone,now())::date;
 with study_days as(
 select distinct timezone(zone,s.submitted_at)::date as study_day from public.book_practice_sessions s where s.student_id=uid and s.submitted_at is not null and exists(select 1 from public.book_practice_items i where i.session_id=s.id and i.selected_answer is not null)
 union select timezone(zone,r.created_at)::date from public.vocabulary_reviews r where r.student_id=uid group by 1 having count(distinct word_id)>=3 or sum(study_seconds)>=60
 union select study_date from public.study_plan_tasks where student_id=uid and completed_at is not null
 ),ranked as(select study_day,study_day-row_number()over(order by study_day)::int group_key from study_days),runs as(select count(*)::int length from ranked group by group_key)
 select coalesce(array_agg(study_day order by study_day desc),'{}'::date[]),coalesce((select max(length)from runs),0)into days,longest from study_days;
 cursor_day=case when today=any(days)then today else today-1 end;
 foreach day in array days loop
  if day=cursor_day then streak=streak+1;cursor_day=cursor_day-1;elsif day<cursor_day then exit;end if;
 end loop;
 select jsonb_build_object('attempted',count(*)filter(where i.selected_answer is not null),'correct',count(*)filter(where i.correct and i.selected_answer is not null),'incorrect',count(*)filter(where i.correct=false and i.selected_answer is not null),'today',count(*)filter(where i.selected_answer is not null and timezone(zone,s.submitted_at)::date=today),'recent_attempted',count(*)filter(where i.selected_answer is not null and s.submitted_at>=now()-interval '14 days'),'recent_correct',count(*)filter(where i.correct and i.selected_answer is not null and s.submitted_at>=now()-interval '14 days'))into sat from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=uid and s.submitted_at is not null and s.kind<>'vocabulary';
 select coalesce(jsonb_agg(to_jsonb(a)),'[]')into attention from(select i.question->>'section' section,i.question->>'domain' domain,count(*) attempted,count(*)filter(where i.correct)correct from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=uid and s.submitted_at>=now()-interval '30 days' and s.kind<>'vocabulary' and i.selected_answer is not null and nullif(i.question->>'domain','')is not null group by 1,2 having count(*)>=10)a;
 return result||sat||jsonb_build_object('study_seconds',coalesce((result->>'study_seconds')::bigint,0)+(select coalesce(sum(study_seconds),0)from public.vocabulary_reviews where student_id=uid),'streak',streak,'longest_streak',longest,'attention',attention);
end;$$;
-- Answer metadata remains public only for each student's frozen attempts after submission.
create function public.question_mistakes(p_filters jsonb default '{}',p_page integer default 0)returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() or p_page is null or p_page not between 0 and 10000 or p_filters is null or jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('domain','skill','source','since','until'))then raise exception 'Invalid mistake filters';end if;
 with mistakes as(select i.id item_id,i.session_id,i.question,s.submitted_at,row_number()over(partition by coalesce(i.question->>'id',i.id::text)order by s.submitted_at desc)instance from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and s.kind<>'vocabulary' and i.selected_answer is not null and i.correct=false
 and (coalesce(p_filters->>'domain','')=''or i.question->>'domain'=p_filters->>'domain')and(coalesce(p_filters->>'skill','')=''or i.question->>'skill'=p_filters->>'skill')and(coalesce(p_filters->>'source','')=''or i.question->>'source'=p_filters->>'source')and(coalesce(p_filters->>'since','')=''or s.submitted_at>=(p_filters->>'since')::date)and(coalesce(p_filters->>'until','')=''or s.submitted_at<(p_filters->>'until')::date+interval '1 day')
 ),unique_mistakes as(select * from mistakes where instance=1),paged as(select * from unique_mistakes order by submitted_at desc,item_id limit 25 offset p_page*25)
 select jsonb_build_object('total',(select count(*)from unique_mistakes),'items',coalesce(jsonb_agg(to_jsonb(paged)-'instance'),'[]'))into result from paged;return result;
end;$$;
create function public.practice_mistake(p_item uuid)returns uuid language plpgsql security definer set search_path='' as $$declare item public.book_practice_items;key public.book_practice_keys;sid uuid;iid uuid;begin
 if not public.is_active_user()then raise exception 'Active student required'using errcode='42501';end if;
 select i.* into item from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where i.id=p_item and s.student_id=auth.uid() and s.submitted_at is not null and i.correct=false and i.selected_answer is not null;
 if item.id is null then raise exception 'Own submitted mistake required'using errcode='42501';end if;
 select * into key from public.book_practice_keys where item_id=item.id;
 insert into public.book_practice_sessions(student_id,title,kind)values(auth.uid(),'Review a question mistake','bank')returning id into sid;
 insert into public.book_practice_items(session_id,position,question)values(sid,0,item.question)returning id into iid;
 insert into public.book_practice_keys values(iid,key.correct_answer,key.explanation);return sid;
end;$$;
revoke all on function public.question_mistakes(jsonb,integer),public.practice_mistake(uuid) from public,anon,authenticated;
grant execute on function public.question_mistakes(jsonb,integer),public.practice_mistake(uuid) to authenticated;
commit;
