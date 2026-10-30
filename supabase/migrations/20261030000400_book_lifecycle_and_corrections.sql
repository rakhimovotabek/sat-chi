begin;
alter table public.books add column archived_at timestamptz;
create function public.manage_book_lifecycle(p_book uuid,p_action text)returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 perform 1 from public.books where id=p_book for update;if not found then raise exception 'Book not found';end if;
 if p_action='archive'then update public.books set published=false,archived_at=now()where id=p_book;
 elsif p_action='restore'then update public.books set published=false,archived_at=null where id=p_book;
 elsif p_action='hide'then update public.books set published=false where id=p_book;
 else raise exception 'Unknown lifecycle action';end if;
end;$$;
create function public.guard_archived_publication()returns trigger language plpgsql set search_path='' as $$begin if new.published and new.archived_at is not null then raise exception 'Restore this archived book before publishing';end if;return new;end;$$;
create trigger archived_publication before insert or update on public.books for each row execute function public.guard_archived_publication();
alter table public.universal_book_ids add column record jsonb not null default '{}';
-- Retain each validated record privately for admin corrections without exposing answer keys.
do $$declare definition text;begin
 select pg_get_functiondef('public.universal_append(uuid,integer,jsonb)'::regprocedure)into definition;
 definition:=replace(definition,'insert into public.universal_book_ids values(j.id,q->>''id'',qid);','insert into public.universal_book_ids(job_id,source_id,question_id,record)values(j.id,q->>''id'',qid,q);');
 execute definition;
end;$$;
create function public.universal_draft_records(p_book uuid)returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 return(select jsonb_build_object('job',j.id,'status',j.status,'records',coalesce((select jsonb_agg(jsonb_build_object('questionId',u.question_id,'record',u.record)order by q.position)from public.universal_book_ids u join public.questions q on q.id=u.question_id where u.job_id=j.id),'[]'))from public.universal_book_jobs j where j.book_id=p_book);
end;$$;
create function public.universal_correct(p_job uuid,p_record jsonb)returns void language plpgsql security definer set search_path='' as $$
declare j public.universal_book_jobs; qid uuid; opts jsonb; images jsonb;
begin
 select * into j from public.universal_book_jobs where id=p_job for update;
 if j.status='importing'or exists(select 1 from public.books where id=j.book_id and published)then raise exception 'Finish importing and hide the book before correcting it';end if;
 select question_id into qid from public.universal_book_ids where job_id=j.id and source_id=p_record->>'id';
 if qid is null then raise exception 'Original question identity required';end if;
 if p_record->>'type'='mcq'then select jsonb_agg(o->>'text'order by n),jsonb_agg(o->'imageUrl'order by n)into opts,images from jsonb_array_elements(p_record->'options')with ordinality a(o,n);
 else opts:='[]';images:='[null,null,null,null]';end if;
 update public.questions set topic_id=(j.manifest->'_topicIds'->>(p_record->>'topic'))::uuid,question_text=p_record->>'text',passage=coalesce(p_record->>'passage',''),options=opts,option_image_urls=images,image_url=p_record->>'imageUrl',stimulus_table=nullif(p_record->'table','null'::jsonb),domain=p_record->>'domain',skill=p_record->>'skill',difficulty=p_record->>'difficulty',source=p_record->'source'->>'reference',question_type=p_record->>'type',import_metadata=import_metadata||jsonb_build_object('universal_review',p_record->>'reviewStatus')where id=qid;
 update public.question_answers set correct_answer=(p_record->>'answer')::integer,explanation=p_record->>'explanation'where question_id=qid;
 delete from public.book_open_answers where question_id=qid;
 if p_record->>'type'='open'then insert into public.book_open_answers(question_id,accepted_answers,correct_answer,answer_format)values(qid,p_record->'acceptedAnswers',p_record->'acceptedAnswers'->>0,'numeric');end if;
 update public.universal_book_ids set record=p_record where question_id=qid;
 update public.universal_book_jobs set status='draft',updated_at=now()where id=j.id;
 perform public.refresh_bank_eligibility(qid);
end;$$;
revoke all on function public.universal_correct(uuid,jsonb)from public,anon,authenticated;
grant execute on function public.universal_correct(uuid,jsonb)to service_role;
revoke all on function public.manage_book_lifecycle(uuid,text),public.universal_draft_records(uuid)from public,anon;
grant execute on function public.manage_book_lifecycle(uuid,text),public.universal_draft_records(uuid)to authenticated;
commit;
