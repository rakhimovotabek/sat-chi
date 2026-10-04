begin;
create index practice_owner_kind_idx on public.book_practice_sessions(student_id,kind,started_at desc);
create function public.practice_analytics(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb; areas jsonb; recent jsonb;
begin
 if not public.is_active_user() or (uid<>auth.uid() and not public.is_admin()) then raise exception 'Account unavailable' using errcode='42501';end if;
 with questions as (
 select i.*,s.started_at,a.n,a.first_correct,a.wrong,a.review_marks from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 join lateral(select count(*) n,bool_or(correct)filter(where attempt_order=1) first_correct,count(*)filter(where not correct) wrong,count(*)filter(where marked) review_marks from public.question_check_attempts where item_id=i.id) a on a.n>0 where s.student_id=uid and s.kind='bank')
 select jsonb_build_object('practiced',count(*),'solved',count(*)filter(where solved_at is not null),'unresolved',count(*)filter(where solved_at is null),'first_accuracy',round(100.0*count(*)filter(where first_correct)/nullif(count(*),0),1),'eventual_accuracy',round(100.0*count(*)filter(where solved_at is not null)/nullif(count(*),0),1),'average_attempts',round(avg(n),2),'average_seconds',round(avg(active_seconds),1),'median_seconds',percentile_cont(0.5)within group(order by active_seconds)) into result from questions;
 with questions as (
 select i.*,a.n,a.first_correct,a.wrong,a.review_marks from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 join lateral(select count(*) n,bool_or(correct)filter(where attempt_order=1) first_correct,count(*)filter(where not correct) wrong,count(*)filter(where marked) review_marks from public.question_check_attempts where item_id=i.id) a on a.n>0 where s.student_id=uid and s.kind='bank' and s.started_at>=now()-interval '90 days'),
 grouped as(select g.level,g.label,count(*) samples,count(distinct coalesce(question->>'id',id::text)) unique_questions,round(100.0*count(*)filter(where first_correct)/count(*),1) first_accuracy,round(100.0*count(*)filter(where solved_at is not null)/count(*),1) eventual_accuracy,round(avg(n),2) attempts,round(avg(active_seconds),1) seconds,sum(wrong) wrong,sum(review_marks) review_marks from questions cross join lateral(values ('section',question->>'section'),('domain',question->>'domain'),('skill',question->>'skill')) g(level,label) where nullif(g.label,'') is not null group by g.level,g.label having count(*)>=10 and count(distinct coalesce(question->>'id',id::text))>=5)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by first_accuracy,attempts desc,review_marks desc,seconds desc),'[]') into areas from grouped;
 with sessions as(select s.id,s.kind,s.title,s.started_at created_at,s.elapsed_seconds duration,count(i.id) questions,count(i.id)filter(where i.solved_at is not null or (s.submitted_at is not null and i.correct)) solved,count(i.id)filter(where a.first_correct) first_correct,count(i.id)filter(where a.n>0) checked_questions,round(avg(i.active_seconds),1) average_seconds from public.book_practice_sessions s left join public.book_practice_items i on i.session_id=s.id left join lateral(select count(*) n,bool_or(correct)filter(where attempt_order=1) first_correct from public.question_check_attempts where item_id=i.id)a on true where s.student_id=uid group by s.id order by s.started_at desc limit 20), activity as (
 select id,kind,title,created_at,duration,questions,round(100.0*first_correct/nullif(checked_questions,0),1)first_accuracy,round(100.0*solved/nullif(questions,0),1)eventual_accuracy,average_seconds from sessions
 union all select null::uuid,'vocabulary','Vocabulary review',date_trunc('day',created_at),sum(study_seconds)::int,count(*)::bigint,null::numeric,null::numeric,null::numeric from public.vocabulary_reviews where student_id=uid group by date_trunc('day',created_at)
 union all select id,'vocabulary',title,created_at,study_seconds, item_count::bigint,null::numeric,null::numeric,null::numeric from public.vocabulary_typed_sessions where student_id=uid)
 select coalesce(jsonb_agg(to_jsonb(r)),'[]') into recent from(select * from activity order by created_at desc limit 20)r;
 return result||jsonb_build_object('areas',areas,'activity',recent);
end;$$;
create function public.practice_question_analytics(p_student uuid default null,p_sort text default 'slowest',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb;
begin
 if not public.is_active_user() or (uid<>auth.uid() and not public.is_admin()) then raise exception 'Account unavailable' using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 100000 or p_sort is null or p_sort not in ('slowest','retried','unresolved','missed') then raise exception 'Invalid query';end if;
 with rows as(select i.id,i.session_id,i.position,i.question->>'question_text' question,coalesce(b.title,i.question->>'source','Question Bank') source,i.question->>'domain' domain,i.question->>'skill' skill,i.active_seconds,a.attempts,a.wrong,i.solved_at,
 sum(a.wrong)over(partition by coalesce(i.question->>'id',i.id::text)) recurring_misses
 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id left join public.questions q on q.id::text=i.question->>'id' left join public.book_topics t on t.id=q.topic_id left join public.books b on b.id=t.book_id
 join lateral(select count(*) attempts,count(*)filter(where not correct)wrong from public.question_check_attempts where item_id=i.id) a on a.attempts>0 where s.student_id=uid and s.kind='bank'),filtered as(select * from rows where (p_sort<>'unresolved' or solved_at is null) and(p_sort<>'missed' or recurring_misses>=2)),paged as(select * from filtered order by case when p_sort='slowest' then active_seconds when p_sort='missed' then recurring_misses else attempts end desc,id limit 25 offset p_page*25)
 select jsonb_build_object('total',(select count(*)from filtered),'rows',coalesce(jsonb_agg(to_jsonb(paged)),'[]'))into result from paged;
 return result;
end;$$;
revoke all on function public.practice_analytics(uuid),public.practice_question_analytics(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.practice_analytics(uuid),public.practice_question_analytics(uuid,text,integer) to authenticated;
commit;
