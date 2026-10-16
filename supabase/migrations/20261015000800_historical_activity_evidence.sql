begin;
-- A legacy session start is an ordering anchor, not an answer timestamp.
-- Do not count such anchors as observed daily activity. Submitted timestamps
-- are recorded evidence; drafts without answer timestamps show no timestamp.
do $$declare definition text;begin
 select pg_get_functiondef('public.dashboard_study_activity()'::regprocedure)into definition;
 definition:=replace(definition,'where e.source in(''submission'',''legacy'')and',
 'where (e.source=''submission'' or (e.source=''legacy'' and exists(select 1 from public.book_practice_items hi join public.book_practice_sessions hs on hs.id=hi.session_id where hi.id=e.item_id and hs.submitted_at=e.created_at)))and');
 execute definition;
 select pg_get_functiondef('public.practice_prior_progress(uuid,integer)'::regprocedure)into definition;
 definition:=replace(definition,'coalesce(l.created_at,d.started_at)','case when l.priority<>1 or exists(select 1 from public.book_practice_sessions hs join public.book_practice_items hi on hi.session_id=hs.id where hi.id=l.item_id and hs.submitted_at=l.created_at) then l.created_at end');
 definition:=replace(definition,'case when known then correct end first_correct',
 'case when known then coalesce(correct,(select e.correct from events e where e.item_id=events.item_id and e.priority=2 and e.correct is not null order by e.created_at,e.ordinal limit 1)) end first_correct');
 execute definition;
end;$$;
commit;
