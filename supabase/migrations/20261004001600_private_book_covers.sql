begin;
alter table public.books add column cover_path text check(cover_path ~ '^books/[0-9a-f-]{36}/[0-9a-f]{64}\.webp$'), add column cover_metadata jsonb not null default '{}' check(jsonb_typeof(cover_metadata)='object' and octet_length(cover_metadata::text)<=2000);
alter table public.vocabulary_books add column cover_url text check(cover_url is null or (cover_url ~ '^https://' and length(cover_url)<=1000)), add column cover_path text check(cover_path ~ '^vocabulary/[0-9a-f-]{36}/[0-9a-f]{64}\.webp$'), add column cover_metadata jsonb not null default '{}' check(jsonb_typeof(cover_metadata)='object' and octet_length(cover_metadata::text)<=2000);
create index books_cover_path_idx on public.books(cover_path) where cover_path is not null;
create index vocabulary_books_cover_path_idx on public.vocabulary_books(cover_path) where cover_path is not null;
create function public.can_read_book_cover(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_user() and (public.is_admin()
 or exists(select 1 from public.books b where b.cover_path=p_path and b.published)
 or exists(select 1 from public.vocabulary_books b where b.cover_path=p_path and b.published))
$$;
revoke all on function public.can_read_book_cover(text) from public,anon;
grant execute on function public.can_read_book_cover(text) to authenticated;
-- The SQL-only test harness has no Storage schema. Real Supabase installations
-- always take this branch; a dedicated test creates Storage and tests its RLS.
do $$begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('book-covers','book-covers',false,262144,array['image/webp']) on conflict(id) do update set public=false,file_size_limit=262144,allowed_mime_types=array['image/webp'];
 execute 'create policy book_cover_read on storage.objects for select to authenticated using(bucket_id=''book-covers'' and public.can_read_book_cover(name))';
 execute 'create policy book_cover_admin_insert on storage.objects for insert to authenticated with check(bucket_id=''book-covers'' and public.is_admin())';
 execute 'create policy book_cover_admin_update on storage.objects for update to authenticated using(bucket_id=''book-covers'' and public.is_admin()) with check(bucket_id=''book-covers'' and public.is_admin())';
 execute 'create policy book_cover_admin_delete on storage.objects for delete to authenticated using(bucket_id=''book-covers'' and public.is_admin())';
 end if;
end;$$;
create function public.vocabulary_catalog(p_page integer default 0,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 100000 or p_search is null or length(p_search)>200 then raise exception 'Invalid catalog query';end if;
 with catalog as materialized(select * from public.vocabulary_books where (published or public.is_admin()) and title ilike '%'||p_search||'%' order by created_at desc,id limit 50 offset p_page*50),
 sets as(select s.book_id,count(*)::integer n from public.vocabulary_sets s join catalog c on c.id=s.book_id group by s.book_id),
 words as(select s.book_id,count(*)::integer n,count(*) filter(where p.mastery_state='mastered')::integer mastered from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join catalog c on c.id=s.book_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() group by s.book_id)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('set_count',coalesce(s.n,0),'word_count',coalesce(w.n,0),'mastered_count',coalesce(w.mastered,0)) order by c.created_at desc,c.id),'[]') into result from catalog c left join sets s on s.book_id=c.id left join words w on w.book_id=c.id;
 return result;
end;$$;
revoke all on function public.vocabulary_catalog(integer,text) from public,anon;
grant execute on function public.vocabulary_catalog(integer,text) to authenticated;
commit;
