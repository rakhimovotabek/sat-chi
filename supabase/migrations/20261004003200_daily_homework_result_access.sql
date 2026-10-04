begin;
-- Distinguish a read-only timed partial result from resumable unfinished work.
-- Completion remains based on all answers; exposing submission time grants no credit.
do $$declare definition text;needle text;begin
 definition=pg_get_functiondef('public.daily_homework_directory(uuid,uuid,date,date,integer)'::regprocedure);
 needle='i.completed_late,coalesce(s.elapsed_seconds';
 if position(needle in definition)=0 then raise exception 'Directory definition changed; review before deployment';end if;
 execute replace(definition,needle,'i.completed_late,s.submitted_at session_submitted_at,coalesce(s.elapsed_seconds');
end;$$;
commit;
