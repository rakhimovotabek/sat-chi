begin;
-- Older clients keep readable plain passages; updated clients render safe markup.
alter table public.questions add column passage_markup text not null default '' check(char_length(passage_markup)<=20000);
commit;
