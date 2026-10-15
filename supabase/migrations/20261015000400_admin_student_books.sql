begin;
create function public.learning_book_progress(p_books uuid[],p_student uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid());
begin
 if not public.is_active_user()or(uid<>auth.uid()and not public.is_admin())then raise exception 'Account unavailable' using errcode='42501';end if;
 if p_books is null or cardinality(p_books)>50 then raise exception 'At most 50 books per page';end if;
 return coalesce((with history as materialized(select * from public.learning_question_facts(uid)), counts as(
 select b.id book_id,count(q.id)total,count(q.id)filter(where h.attempted)attempted,
 count(q.id)filter(where h.checked)checked,count(h.first_correct)first_known,
 count(q.id)filter(where h.first_correct)first_correct,count(q.id)filter(where h.first_correct=false)first_incorrect,
 count(q.id)filter(where h.checked and h.first_correct is null)first_unknown,
 round(100.0*count(q.id)filter(where h.first_correct)/nullif(count(h.first_correct),0),1)first_accuracy,
 count(q.id)filter(where h.eventually_correct)eventually_correct,count(q.id)filter(where h.now_correct)now_correct
 from public.books b left join public.book_topics t on t.book_id=b.id
 left join public.questions q on q.topic_id=t.id and(public.question_practicable(q.id)or public.book_package_question_ready(q.id))
 and(public.is_admin()or public.question_approved_for_students(q.id))
 left join history h on h.question_id=q.id::text
 where b.id=any(p_books)and(b.published or public.is_admin())group by b.id
 )select jsonb_agg(to_jsonb(counts))from counts),'[]');
end;$$;

create function public.admin_student_books(p_student uuid,p_page integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[];result jsonb;
begin
 if not public.is_admin()then raise exception 'Active administrator required'using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_student and role='student')or p_page is null or p_page not between 0 and 10000 then raise exception 'Student unavailable';end if;
 with history as materialized(select * from public.learning_question_facts(p_student)), books as(
 select distinct b.id,b.title from history h join public.questions q on q.id::text=h.question_id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where h.attempted
 ),paged as(select * from books order by title,id limit 25 offset p_page*25)
 select array_agg(id),jsonb_build_object('total',(select count(*)from books),'books',coalesce(jsonb_agg(to_jsonb(paged)),'[]'))into ids,result from paged;
 return result||jsonb_build_object('progress',public.learning_book_progress(coalesce(ids,'{}'),p_student),
 'channels',jsonb_build_object('book',public.learning_fact_totals(p_student,'book'),'bank',public.learning_fact_totals(p_student,'bank'),'homework',public.learning_fact_totals(p_student,'homework')));
end;$$;

create function public.admin_student_book_outline(p_student uuid,p_book uuid,p_filter text default 'all',p_page integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Active administrator required'using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_student and role='student')or p_filter is null or p_filter not in('all','first_correct','first_incorrect','corrected','unanswered','pending')or p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid review request';end if;
 return(with recursive tree as(
 select id,array[position]sort_path from public.book_topics where book_id=p_book and parent_id is null
 union all select t.id,p.sort_path||t.position from public.book_topics t join tree p on t.parent_id=p.id where t.book_id=p_book
 ), history as materialized(select * from public.learning_question_facts(p_student)), catalog as(
 select q.id question_id,row_number()over(order by tree.sort_path,q.position,q.id)position,
 h.item_id,h.first_correct,h.checked,h.now_correct,h.eventually_correct,h.pending,h.attempted
 from tree join public.questions q on q.topic_id=tree.id left join history h on h.question_id=q.id::text
 ),filtered as(select * from catalog where case p_filter when 'all'then true when 'first_correct'then first_correct
 when 'first_incorrect'then first_correct=false when 'corrected'then first_correct=false and eventually_correct
 when 'unanswered'then not coalesce(attempted,false)when 'pending'then pending else false end),
 paged as(select * from filtered order by position limit 100 offset p_page*100)
 select jsonb_build_object('total',(select count(*)from filtered),'rows',coalesce(jsonb_agg(to_jsonb(paged)),'[]'))from paged);
end;$$;

create function public.admin_student_book_question(p_student uuid,p_book uuid,p_question uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q public.questions;f record;item jsonb;answer jsonb;events jsonb;
begin
 if not public.is_admin()then raise exception 'Active administrator required'using errcode='42501';end if;
 if not exists(select 1 from public.profiles where id=p_student and role='student')then raise exception 'Student unavailable';end if;
 select qs.* into q from public.questions qs join public.book_topics t on t.id=qs.topic_id where qs.id=p_question and t.book_id=p_book;
 if q.id is null then raise exception 'Book question unavailable';end if;
 select * into f from public.learning_question_facts(p_student)where question_id=q.id::text;
 if f.item_id is not null then
 select to_jsonb(i)into item from public.book_practice_items i where i.id=f.item_id;
 select jsonb_build_object('correct_answer',coalesce(o.correct_answer,k.correct_answer::text),'accepted_answers',o.accepted_answers,
 'accepted_range',o.accepted_range,'explanation',k.explanation,'automatic_correct',r.automatic_correct,'review_correct',r.review_correct,'reviewed_at',r.reviewed_at)
 into answer from public.book_practice_keys k left join public.book_practice_open_keys o on o.item_id=k.item_id
 left join public.practice_open_reviews r on r.item_id=k.item_id where k.item_id=f.item_id;
 events:=public.practice_history_events(f.session_id,f.item_id);
 else
 item:=jsonb_build_object('id',q.id,'question',to_jsonb(q),'selected_answer',null,'correct',null);
 select jsonb_build_object('correct_answer',coalesce(o.correct_answer,a.correct_answer::text),'accepted_answers',o.accepted_answers,
 'accepted_range',o.accepted_range,'explanation',a.explanation)into answer from public.question_answers a
 left join public.book_open_answers o on o.question_id=a.question_id where a.question_id=q.id;
 events:='{"total":0,"rows":[]}';
 end if;
 return jsonb_build_object('item',item,'review',answer,'history',events,'first_correct',f.first_correct,
 'checked',coalesce(f.checked,false),'eventually_correct',coalesce(f.eventually_correct,false),'now_correct',f.now_correct,'read_only',true);
end;$$;
revoke all on function public.learning_book_progress(uuid[],uuid),public.admin_student_books(uuid,integer),
 public.admin_student_book_outline(uuid,uuid,text,integer),public.admin_student_book_question(uuid,uuid,uuid)from public,anon;
grant execute on function public.learning_book_progress(uuid[],uuid),public.admin_student_books(uuid,integer),
 public.admin_student_book_outline(uuid,uuid,text,integer),public.admin_student_book_question(uuid,uuid,uuid)to authenticated;
commit;
