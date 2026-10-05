begin;
-- Private transport staging does not create any catalog content. The final
-- import reconstructs this JSON inside one transaction and clears the chunks.
create table public.book_package_import_chunks (
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 part_no integer not null check(part_no>=0), data text not null,
 primary key(fingerprint,part_no)
);
alter table public.book_package_import_chunks enable row level security;
revoke all on public.book_package_import_chunks from public,anon,authenticated;
grant all on public.book_package_import_chunks to service_role;
commit;
