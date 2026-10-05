begin;
with source_answers as (
  select q.id as question_id, sq->>'correctAnswer' as correct_answer
  from public.book_import_packages p
  join public.book_topics t on t.book_id=p.book_id
  join public.questions q on q.topic_id=t.id
  cross join lateral jsonb_array_elements(p.source_payload->'chapters') c
  cross join lateral jsonb_array_elements(c->'topics') topic
  cross join lateral jsonb_array_elements(topic->'questions') sq
  where p.slug='preppros-complete-guide-to-digital-sat-math'
    and q.import_metadata->>'package_question_id'=sq->>'id'
)
update public.book_open_answers a
set correct_answer=s.correct_answer
from source_answers s
where a.question_id=s.question_id and a.correct_answer is distinct from s.correct_answer;

with source_answers as (
  select q.id as question_id, a.correct_answer
  from public.book_import_packages p
  join public.book_topics t on t.book_id=p.book_id
  join public.questions q on q.topic_id=t.id
  join public.book_open_answers a on a.question_id=q.id
  where p.slug='preppros-complete-guide-to-digital-sat-math'
)
update public.book_practice_open_keys k
set correct_answer=s.correct_answer
from public.book_practice_items i, source_answers s
where k.item_id=i.id and i.question->>'id'=s.question_id::text
  and k.correct_answer is distinct from s.correct_answer;
commit;
