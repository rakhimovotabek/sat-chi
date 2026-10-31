begin;
-- Derived private lookup only: no question, answer or student history is rewritten.
create table public.universal_asset_usage(
 path text not null references public.book_package_assets(path) on delete cascade,
 question_id uuid not null references public.questions(id) on delete cascade,
 role text not null check(role in('question','option','explanation')),
 primary key(path,question_id,role)
);
alter table public.universal_asset_usage enable row level security;
revoke all on public.universal_asset_usage from public,anon,authenticated;
grant all on public.universal_asset_usage to service_role;
create index universal_asset_usage_question_idx on public.universal_asset_usage(question_id);
create function public.index_universal_assets(p_question uuid)returns void
language sql security definer set search_path='' as $$
 with content as(select q.*,a.explanation from public.questions q join public.question_answers a on a.question_id=q.id where q.id=p_question),refs as(
 select split_part(image_url,'/book-package-assets/',2)path,'question'role from content
 union all select split_part(v,'/book-package-assets/',2),'option'from content cross join lateral jsonb_array_elements_text(option_image_urls)v
 union all select m[1],'explanation'from content cross join lateral regexp_matches(coalesce(explanation,''),'/book-package-assets/([a-f0-9]{64}/[a-f0-9]{64}[.](png|jpg|jpeg|webp))','g')m
 )insert into public.universal_asset_usage(path,question_id,role)
 select distinct r.path,p_question,r.role from refs r join public.book_package_assets a on a.path=r.path
 on conflict do nothing;
$$;
create function public.universal_asset_usage_trigger()returns trigger
language plpgsql security definer set search_path='' as $$declare qid uuid;begin
 if tg_table_name='questions'then qid:=new.id;else qid:=new.question_id;end if;
 if exists(select 1 from public.universal_book_ids where question_id=qid)then perform public.index_universal_assets(qid);end if;
 return new;
end;$$;
create trigger universal_asset_usage_insert after insert on public.universal_book_ids for each row execute function public.universal_asset_usage_trigger();
create trigger universal_asset_usage_images after update of image_url,option_image_urls on public.questions for each row execute function public.universal_asset_usage_trigger();
create trigger universal_asset_usage_explanations after update of explanation on public.question_answers for each row execute function public.universal_asset_usage_trigger();
revoke all on function public.index_universal_assets(uuid),public.universal_asset_usage_trigger()from public,anon,authenticated,service_role;
do $$declare q record;begin for q in select question_id from public.universal_book_ids loop perform public.index_universal_assets(q.question_id);end loop;end;$$;
alter function public.can_read_book_package_asset(text)rename to can_read_book_package_asset_before_usage;
revoke all on function public.can_read_book_package_asset_before_usage(text)from public,anon,authenticated,service_role;
create function public.can_read_book_package_asset(p_path text)returns boolean
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user()then return false;end if;
 if exists(select 1 from public.universal_asset_usage where path=p_path)then
 if public.is_admin()then return true;end if;
 return exists(
 select 1 from public.universal_asset_usage u join public.questions q on q.id=u.question_id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 join public.question_bank_eligibility e on e.question_id=q.id
 where u.path=p_path and (
 u.role in('question','option')and b.published and e.student_ready
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 where s.student_id=auth.uid()and i.question->>'id'=q.id::text and public.can_access_homework_session(s.id)
 and(u.role in('question','option')or i.correct is not null or i.solved_at is not null or s.submitted_at is not null))
 ));
 end if;
 return public.can_read_book_package_asset_before_usage(p_path);
end;$$;
revoke all on function public.can_read_book_package_asset(text)from public,anon;
grant execute on function public.can_read_book_package_asset(text)to authenticated,service_role;
do $$begin if to_regclass('storage.objects')is not null then
 execute 'drop policy if exists book_package_asset_read on storage.objects';
 execute 'create policy book_package_asset_read on storage.objects for select to authenticated using(bucket_id=''book-package-assets'' and public.can_read_book_package_asset(name))';
end if;end;$$;
notify pgrst,'reload schema';
commit;
