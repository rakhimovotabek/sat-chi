begin;
-- Preserve supplied lineage at insertion, before legacy review seeding runs.
-- Existing questions, keys, snapshots and grades are never updated here.
create or replace function public.universal_append(p_job uuid,p_expected integer,p_questions jsonb)returns integer
language plpgsql security definer set search_path='' as $$
declare j public.universal_book_jobs;q jsonb;qid uuid;pos integer;options jsonb;images jsonb;source_page integer;source_position integer;source_metadata jsonb;
begin
 select * into j from public.universal_book_jobs where id=p_job for update;
 if not found then raise exception 'Unknown job';end if;
 if j.question_cursor<>p_expected then return j.question_cursor;end if;
 if j.status<>'importing'or jsonb_array_length(p_questions)>25 then raise exception 'Invalid batch';end if;
 pos:=p_expected;
 for q in select value from jsonb_array_elements(p_questions)loop
 source_page:=null;source_position:=pos;source_metadata:='{}';
 if j.manifest->>'bankSource'='sbank'then
 source_page:=(q#>>'{source,original,source_page}')::integer;source_position:=(q->>'sourceOrder')::integer;
 if source_page is null or source_page<1 or source_page>coalesce((j.manifest#>>'{originalManifest,source_page_count}')::integer,100000)or source_position is null or source_position<1 then raise exception 'Verified SBank source page and ordering required';end if;
 source_metadata:=jsonb_build_object('questionNumber',q#>>'{source,original,source_question_number}','source_order',source_position,'source_package',j.manifest#>>'{originalManifest,book_id}');
 end if;
 if q->>'type'='mcq'then
 select jsonb_agg(o->>'text'order by n),jsonb_agg(o->'imageUrl'order by n)into options,images from jsonb_array_elements(q->'options')with ordinality a(o,n);
 else options:='[]';images:='[null,null,null,null]';end if;
 insert into public.questions(topic_id,question_text,passage,options,option_image_urls,image_url,stimulus_table,domain,skill,difficulty,source,position,source_page,question_type,import_metadata)
 values((j.manifest->'_topicIds'->>(q->>'topic'))::uuid,q->>'text',coalesce(q->>'passage',''),options,images,q->>'imageUrl',nullif(q->'table','null'::jsonb),q->>'domain',q->>'skill',q->>'difficulty',q->'source'->>'reference',source_position,source_page,q->>'type',jsonb_build_object('package_question_id',q->>'id','universal_review',q->>'reviewStatus')||source_metadata)returning id into qid;
 insert into public.question_answers(question_id,correct_answer,explanation)values(qid,(q->>'answer')::integer,q->>'explanation');
 if q->>'type'='open'then insert into public.book_open_answers(question_id,accepted_answers,correct_answer,answer_format)values(qid,q->'acceptedAnswers',q->'acceptedAnswers'->>0,'numeric');end if;
 insert into public.universal_book_ids(job_id,source_id,question_id,record)values(j.id,q->>'id',qid,q);
 pos:=pos+1;
 end loop;
 if pos>(j.manifest->>'questionCount')::integer then raise exception 'Too many questions';end if;
 update public.universal_book_jobs set question_cursor=pos,updated_at=now()where id=j.id;
 return pos;
end;$$;
revoke all on function public.universal_append(uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.universal_append(uuid,integer,jsonb)to service_role;
commit;
