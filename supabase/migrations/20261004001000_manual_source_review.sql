begin;
create function public.add_source_review_question(p_source uuid,p_payload jsonb,p_page integer,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare j public.import_jobs;rid uuid:=gen_random_uuid();flags jsonb:='["Manually transcribed source; verify all content and the printed key against the original page"]';
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into j from public.import_jobs where id=p_source;if not found or j.source_type<>'book' then raise exception 'Question source unavailable';end if;
 if p_page is null or p_page not between 1 and 100000 or char_length(p_note)>2000 then raise exception 'Physical source page required';end if;
 perform public.validate_review_payload('question',p_payload);
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('type','question','passage','stimulus','options','correctAnswer','explanation','domain','skill','difficulty','source','imageUrl','table')) then raise exception 'Unsupported question fields';end if;
 if exists(select 1 from public.questions q where md5(lower(regexp_replace(q.question_text||' '||q.passage||' '||q.options::text,'\s+',' ','g')))=md5(lower(regexp_replace((p_payload->>'question')||' '||coalesce(p_payload->>'passage','')||' '||(p_payload->'options')::text,'\s+',' ','g')))) then flags:=flags||'["Possible duplicate"]';end if;
 insert into public.content_review_items(id,source_id,item_type,candidate_key,candidate,source_page,extraction_method,warnings,note)
 values(rid,j.id,'question','manual:'||rid,p_payload||jsonb_build_object('source',j.source_file),p_page,'manual',flags,p_note);
 insert into public.content_review_audit(item_id,source_id,action,actor,after_data)values(rid,j.id,'manual_candidate',auth.uid(),jsonb_build_object('page',p_page,'payload',p_payload,'note',p_note));
 return rid;
end;$$;
revoke all on function public.add_source_review_question(uuid,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.add_source_review_question(uuid,jsonb,integer,text) to authenticated;
create function public.reconcile_manual_approval() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.item_type='question' and old.entity_id is null and new.entity_id is not null and new.status='approved' then
 insert into public.local_question_imports(fingerprint,question_id)select public.local_question_fingerprint(public.content_review_payload(new)),new.entity_id on conflict do nothing;
 update public.import_jobs set source_metadata=jsonb_set(source_metadata,'{resolution_status}','"partial"'),updated_at=clock_timestamp() where id=new.source_id;
 end if;return new;
end;$$;
revoke all on function public.reconcile_manual_approval() from public,anon,authenticated,service_role;
create trigger manual_approval_source_status after update on public.content_review_items for each row execute function public.reconcile_manual_approval();
create or replace function public.record_import_checkpoint() returns trigger language plpgsql security definer set search_path='' as $$
declare catalog_count integer;
begin
 perform public.seed_content_review(new.id);
 if new.parser_version<>'' then
 if new.book_id is not null then select count(*)::int into catalog_count from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=new.book_id;
 elsif new.vocabulary_book_id is not null then select count(*)::int into catalog_count from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=new.vocabulary_book_id;
 else catalog_count:=0;end if;
 insert into public.import_runs(source_id,checkpoint_key,parser_version,status,imported_count,skipped_count,warnings,errors)
 values(new.id,new.id||':'||new.parser_version||':'||new.updated_at,new.parser_version,new.status,catalog_count,new.skipped_count,new.warnings,new.errors)on conflict do nothing;
 end if;return new;
end;$$;
commit;
