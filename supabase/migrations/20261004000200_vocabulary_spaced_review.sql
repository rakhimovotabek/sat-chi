begin;
alter table public.vocabulary_progress
 add column mastery_state text not null default 'new' check(mastery_state in ('new','learning','review','mastered')),
 add column starred boolean not null default false,
 add column familiarity integer not null default 0 check(familiarity between 0 and 4),
 add column review_count integer not null default 0 check(review_count>=0),
 add column successful_recalls integer not null default 0 check(successful_recalls>=0),
 add column failed_recalls integer not null default 0 check(failed_recalls>=0),
 add column consecutive_successes integer not null default 0 check(consecutive_successes>=0),
 add column successful_days integer not null default 0 check(successful_days>=0),
 add column first_success timestamptz,
 add column last_success timestamptz,
 add column last_reviewed timestamptz,
 add column next_review timestamptz,
 add column interval_days integer not null default 0 check(interval_days between 0 and 180),
 add column study_seconds integer not null default 0 check(study_seconds>=0);
-- Historical self-reported 'known' words have no spaced recall evidence.
update public.vocabulary_progress set mastery_state=case when status='known' then 'learning' else 'review' end,next_review=now();
revoke insert,update,delete on public.vocabulary_progress from authenticated;
create index vocabulary_progress_due_idx on public.vocabulary_progress(student_id,next_review);
create index vocabulary_progress_weak_idx on public.vocabulary_progress(student_id,failed_recalls) where failed_recalls>0;
create table public.vocabulary_reviews(
 student_id uuid not null references public.profiles on delete cascade,
 event_id uuid not null,
 word_id uuid not null references public.vocabulary_words on delete cascade,
 mode text not null check(mode in ('learn','cards','typed','meaning','reverse')),
 rating text not null check(rating in ('again','hard','good','easy','know','need_review')),
 correct boolean,
 study_seconds integer not null check(study_seconds between 0 and 300),
 created_at timestamptz not null default now(),
 primary key(student_id,event_id)
);
alter table public.vocabulary_reviews enable row level security;
revoke all on public.vocabulary_reviews from public,anon,authenticated;
grant select on public.vocabulary_reviews to authenticated;
create policy vocabulary_reviews_self on public.vocabulary_reviews for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create index vocabulary_reviews_activity_idx on public.vocabulary_reviews(student_id,created_at);

create function public.review_vocabulary(p_word uuid,p_rating text,p_seconds integer,p_event uuid,p_mode text default 'cards',p_answer text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.vocabulary_words; p public.vocabulary_progress; rating text:=p_rating; success boolean; days integer; old_event public.vocabulary_reviews;
begin
 if not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'Active student required' using errcode='42501';end if;
 select * into w from public.vocabulary_words where id=p_word;
 if w.id is null or not public.can_read_vocab(w.set_id) then raise exception 'Word unavailable' using errcode='42501';end if;
 if p_event is null or p_seconds is null or p_seconds not between 0 and 300 or p_mode is null or p_mode not in ('learn','cards','typed','meaning','reverse') or rating is null or rating not in ('again','hard','good','easy','know','need_review') then raise exception 'Invalid review';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_word::text,0));
 select * into old_event from public.vocabulary_reviews where student_id=auth.uid() and event_id=p_event;
 if old_event.event_id is not null then
  if old_event.word_id<>p_word then raise exception 'Review event already used for another word';end if;
  select * into p from public.vocabulary_progress where student_id=auth.uid() and word_id=p_word;
  return jsonb_build_object('progress',to_jsonb(p),'correct',old_event.correct);
 end if;
 if p_mode in ('typed','reverse','meaning') then
  success=case when p_mode='meaning' then lower(btrim(coalesce(p_answer,'')))=lower(btrim(w.definition)) else lower(normalize(regexp_replace(btrim(coalesce(p_answer,'')),'\s+',' ','g'),NFKC))=lower(normalize(regexp_replace(btrim(w.word),'\s+',' ','g'),NFKC)) end;
  rating=case when success then 'good' else 'again' end;
 elsif p_mode='learn' then
  if rating not in ('know','need_review') then raise exception 'Invalid learn action';end if;success=null;
 else
  if rating not in ('again','hard','good','easy') then raise exception 'Invalid flashcard rating';end if;success=rating in ('good','easy');
 end if;
 insert into public.vocabulary_progress(student_id,word_id,status) values(auth.uid(),p_word,'review') on conflict do nothing;
 select * into p from public.vocabulary_progress where student_id=auth.uid() and word_id=p_word for update;
 if p_mode='learn' then
  p.mastery_state=case when p.mastery_state='new' then 'learning' else p.mastery_state end;
  if rating='need_review' then p.mastery_state='review';end if;
  p.next_review=coalesce(p.next_review,now());
 else
  p.review_count=p.review_count+1;
  if success then
   p.successful_recalls=p.successful_recalls+1;p.consecutive_successes=p.consecutive_successes+1;
   if p.last_success is null or p.last_success::date<current_date then p.successful_days=p.successful_days+1;end if;
   p.first_success=coalesce(p.first_success,now());
   p.familiarity=least(4,p.familiarity+1);
   days=case when rating='easy' then greatest(3,least(180,greatest(p.interval_days,1)*3)) else case when p.interval_days=0 then 1 else least(180,p.interval_days*2) end end;
   if p.last_success::date=current_date and p.interval_days>0 and p.next_review>now() then days=p.interval_days;end if;
   p.last_success=now();
   p.mastery_state=case when p.successful_recalls>=5 and p.consecutive_successes>=3 and p.successful_days>=3 and now()-p.first_success>=interval '7 days' and days>=7 then 'mastered' else 'learning' end;
  else
   p.failed_recalls=p.failed_recalls+1;p.consecutive_successes=0;p.familiarity=greatest(0,p.familiarity-1);days=case when rating='hard' then 1 else 0 end;p.mastery_state='review';
  end if;
  p.interval_days=days;p.next_review=now()+case when days=0 then interval '10 minutes' else days*interval '1 day' end;
 end if;
 p.study_seconds=p.study_seconds+p_seconds;p.last_reviewed=now();p.updated_at=now();p.status=case when p.mastery_state='mastered' then 'known' else 'review' end;
 update public.vocabulary_progress set status=p.status,mastery_state=p.mastery_state,familiarity=p.familiarity,review_count=p.review_count,successful_recalls=p.successful_recalls,failed_recalls=p.failed_recalls,consecutive_successes=p.consecutive_successes,successful_days=p.successful_days,first_success=p.first_success,last_success=p.last_success,last_reviewed=p.last_reviewed,next_review=p.next_review,interval_days=p.interval_days,study_seconds=p.study_seconds,updated_at=p.updated_at where student_id=auth.uid() and word_id=p_word;
 insert into public.vocabulary_reviews(student_id,event_id,word_id,mode,rating,correct,study_seconds)values(auth.uid(),p_event,p_word,p_mode,rating,success,p_seconds);
 return jsonb_build_object('progress',to_jsonb(p),'correct',success);
end;$$;
create function public.star_vocabulary(p_word uuid,p_starred boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if p_starred is null or not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') or not exists(select 1 from public.vocabulary_words where id=p_word and public.can_read_vocab(set_id)) then raise exception 'Word unavailable' using errcode='42501';end if;
 insert into public.vocabulary_progress(student_id,word_id,status,starred)values(auth.uid(),p_word,'review',p_starred)on conflict(student_id,word_id)do update set starred=excluded.starred;
end;$$;

-- One bounded query supplies the pool, progress, and original set memberships.
create function public.vocabulary_pool(p_sets uuid[] default '{}',p_filter text default 'all',p_search text default '',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() then raise exception 'Active user required' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>10000 or p_filter is null or p_filter not in ('all','new','learning','review','mastered','starred','due','weak') or p_search is null or length(p_search)>200 or p_sets is null or cardinality(p_sets)>100 then raise exception 'Invalid pool filters';end if;
 with eligible as (
  select w.*,s.title set_title,to_jsonb(p) progress,
    row_number() over(partition by lower(btrim(w.word)),lower(btrim(w.definition)) order by s.position,w.position,w.id) occurrence,
    array_agg(w.set_id) over(partition by lower(btrim(w.word)),lower(btrim(w.definition))) source_sets
  from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id
  left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid()
  where public.can_read_vocab(w.set_id) and (cardinality(p_sets)=0 or w.set_id=any(p_sets))
   and (p_search='' or position(lower(p_search) in lower(w.word))>0 or position(lower(p_search) in lower(w.definition))>0)
   and case p_filter when 'all' then true when 'starred' then coalesce(p.starred,false) when 'due' then p.next_review<=now() when 'weak' then p.failed_recalls>=2 and p.mastery_state<>'mastered' else coalesce(p.mastery_state,'new')=p_filter end
 ), distinct_words as(select * from eligible where occurrence=1), paged as(select * from distinct_words order by set_title,position,id limit 100 offset p_page*100)
 select jsonb_build_object('total',(select count(*) from distinct_words),'words',coalesce(jsonb_agg(to_jsonb(paged)-'occurrence'),'[]'))into result from paged;
 return result;
end;$$;
create function public.vocabulary_summary(p_book uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() then raise exception 'Active user required' using errcode='42501';end if;
 with words as(select w.id,w.set_id,coalesce(p.mastery_state,'new') state,p.* from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where public.can_read_vocab(w.set_id) and (p_book is null or s.book_id=p_book)), per_set as(
 select set_id,count(*) total,count(*)filter(where state<>'new') learned,count(*)filter(where state='mastered') mastered,count(*)filter(where state='review') reviewing,count(*)filter(where state='new') new,count(*)filter(where next_review<=now()) due from words group by set_id
 )select jsonb_build_object('total',count(*),'learned',count(*)filter(where state<>'new'),'mastered',count(*)filter(where state='mastered'),'due',count(*)filter(where next_review<=now()),'starred',count(*)filter(where starred),'weak',count(*)filter(where failed_recalls>=2 and state<>'mastered'),'successful',coalesce(sum(successful_recalls),0),'failed',coalesce(sum(failed_recalls),0),'study_seconds',coalesce(sum(study_seconds),0),'sets',coalesce((select jsonb_agg(to_jsonb(per_set))from per_set),'[]'))into result from words;
 return result;
end;$$;
revoke all on function public.review_vocabulary(uuid,text,integer,uuid,text,text),public.star_vocabulary(uuid,boolean),public.vocabulary_pool(uuid[],text,text,integer),public.vocabulary_summary(uuid) from public,anon,authenticated;
grant execute on function public.review_vocabulary(uuid,text,integer,uuid,text,text),public.star_vocabulary(uuid,boolean),public.vocabulary_pool(uuid[],text,text,integer),public.vocabulary_summary(uuid) to authenticated;
commit;
