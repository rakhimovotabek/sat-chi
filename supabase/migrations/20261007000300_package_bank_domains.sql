begin;
-- Preserve the source's chapter/skill labels while giving the Bank SAT domains.
create function public.package_sat_domain(p_slug text,p_chapter text,p_domain text)
returns text language sql immutable set search_path='' as $$
 select case
 when p_slug='algebra-official-sat-question-bank' then 'Algebra'
 when p_slug='advanced-math-official-sat-question-bank' then 'Advanced Math'
 when p_slug='problem-solving-and-data-analysis-official-sat-question-bank' then 'Problem-Solving and Data Analysis'
 when p_slug='800-challenge-hard-math-150-part-1-sat-math-club' then
 case upper(p_domain) when 'ALGEBRA' then 'Algebra' when 'ADVANCED MATH' then 'Advanced Math'
 when 'PROBLEM-SOLVING & DATA ANALYSIS' then 'Problem-Solving and Data Analysis'
 when 'PROBLEM-SOLVING AND DATA ANALYSIS' then 'Problem-Solving and Data Analysis'
 when 'GEOMETRY & TRIGONOMETRY' then 'Geometry and Trigonometry'
 when 'GEOMETRY AND TRIGONOMETRY' then 'Geometry and Trigonometry' else p_chapter end
 when p_slug in ('hardbook-2-by-satashkent','preppros-complete-guide-to-digital-sat-math') then
 case
 when p_chapter in ('Algebra','Algebra Skills','Fractions','Inequalities','Systems of Equations','Lines','Interpreting Lines','Systems of Equations with Infinite Solutions, No Solution, and One Solution') then 'Algebra'
 when p_chapter in ('Advanced Math','Exponents and Roots','Quadratics','Exponential Growth and Decay','Shifting and Transforming Functions','Extraneous Solutions','Special Quadratics – Perfect Squares and Difference of Squares') then 'Advanced Math'
 when p_chapter in ('Problem Solving and Data Analysis','Percentages','Probability','Statistical Analysis','Ratios and Proportions','Mean, Median, Mode, and Range','Unit Conversion','Scatter Plots and Lines of Best Fit') then 'Problem-Solving and Data Analysis'
 when p_chapter in ('Geometry','Geometry Part 1 – Angles','Geometry Part 2 – Shapes','Geometry Part 3 – Similar Shapes and Congruent Triangles','Trigonometry','Circles','Arcs and Sectors') then 'Geometry and Trigonometry'
 else p_chapter end
 else p_chapter end;
$$;
revoke all on function public.package_sat_domain(text,text,text) from public,anon,authenticated;
grant execute on function public.package_sat_domain(text,text,text) to service_role;

-- A classification-only correction keeps the prior review decision and keys.
create temporary table domain_repair_reviews on commit drop as
select r.* from public.content_review_items r join public.questions q on q.id=r.entity_id
join public.book_topics t on t.id=q.topic_id join public.book_import_packages p on p.book_id=t.book_id
where r.item_type='question' and q.section='Math'
and q.domain is distinct from public.package_sat_domain(p.slug,coalesce(q.import_metadata->>'chapter',q.domain),q.import_metadata->>'domain');
update public.questions q set
 import_metadata=q.import_metadata||jsonb_build_object('source_domain',q.domain,'domain_recovery','explicit-package-heading-v1'),
 domain=public.package_sat_domain(p.slug,coalesce(q.import_metadata->>'chapter',q.domain),q.import_metadata->>'domain')
from public.book_topics t,public.book_import_packages p
where q.topic_id=t.id and p.book_id=t.book_id and q.section='Math'
and q.domain is distinct from public.package_sat_domain(p.slug,coalesce(q.import_metadata->>'chapter',q.domain),q.import_metadata->>'domain');
update public.content_review_items r set status=old.status,note=old.note,reviewed_at=old.reviewed_at,reviewed_by=old.reviewed_by
from domain_repair_reviews old where old.id=r.id;
commit;
