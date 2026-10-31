-- 月相实验室行为埋点 schema

create table if not exists public.moonlab_sessions (
  id uuid primary key,
  student_name text not null default '匿名',
  class_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer,
  score integer not null default 0,
  total_questions integer not null default 0,
  completed boolean not null default false,
  task_version text,
  user_agent text
);

create table if not exists public.moonlab_events (
  id uuid primary key,
  session_id uuid not null references public.moonlab_sessions(id) on delete cascade,
  seq integer not null default 0,
  event_type text not null,
  phase text,
  payload jsonb not null default '{}'::jsonb,
  client_ts timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.moonlab_answers (
  id uuid primary key,
  session_id uuid not null references public.moonlab_sessions(id) on delete cascade,
  question_id text not null,
  question_type text not null default 'choice',
  prompt text,
  answer jsonb,
  correct_answer jsonb,
  is_correct boolean not null,
  attempt integer not null default 1,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists moonlab_events_session_idx on public.moonlab_events (session_id, seq);
create index if not exists moonlab_events_type_idx on public.moonlab_events (event_type, created_at desc);
create index if not exists moonlab_answers_session_idx on public.moonlab_answers (session_id);
create index if not exists moonlab_answers_question_idx on public.moonlab_answers (question_id);
create index if not exists moonlab_sessions_started_idx on public.moonlab_sessions (started_at desc);

-- 权限：匿名/登录用户只能写入明细，读不到别人明细
grant usage on schema public to anon, authenticated;
grant insert on public.moonlab_sessions to anon, authenticated;
grant insert on public.moonlab_events to anon, authenticated;
grant insert on public.moonlab_answers to anon, authenticated;

alter table public.moonlab_sessions enable row level security;
alter table public.moonlab_events enable row level security;
alter table public.moonlab_answers enable row level security;

drop policy if exists moonlab_sessions_insert on public.moonlab_sessions;
create policy moonlab_sessions_insert on public.moonlab_sessions
  for insert to anon, authenticated with check (true);

drop policy if exists moonlab_events_insert on public.moonlab_events;
create policy moonlab_events_insert on public.moonlab_events
  for insert to anon, authenticated with check (true);

drop policy if exists moonlab_answers_insert on public.moonlab_answers;
create policy moonlab_answers_insert on public.moonlab_answers
  for insert to anon, authenticated with check (true);

-- 聚合视图：只能看汇总，看不到单个学生明细
create or replace view public.moonlab_overview as
select
  count(*)::int as sessions,
  count(*) filter (where completed)::int as completed_sessions,
  round(avg(duration_ms) / 1000.0, 1) as avg_duration_sec,
  round(avg(score)::numeric, 1) as avg_score,
  round(100.0 * count(*) filter (where completed) / greatest(count(*), 1), 1) as completion_rate,
  max(started_at) as last_active_at
from public.moonlab_sessions;

create or replace view public.moonlab_question_stats as
select
  a.question_id,
  max(a.question_type) as question_type,
  max(a.prompt) as prompt,
  count(*)::int as attempts,
  count(distinct a.session_id)::int as learners,
  count(*) filter (where a.is_correct)::int as correct_count,
  round(100.0 * count(*) filter (where a.is_correct) / greatest(count(*), 1), 1) as accuracy,
  round(avg(a.duration_ms))::int as avg_duration_ms
from public.moonlab_answers a
group by a.question_id;

create or replace view public.moonlab_event_stats as
select
  e.event_type,
  count(*)::int as events,
  count(distinct e.session_id)::int as sessions
from public.moonlab_events e
group by e.event_type;

create or replace view public.moonlab_daily as
select
  date_trunc('day', s.started_at)::date as day,
  count(*)::int as sessions,
  count(*) filter (where s.completed)::int as completed,
  round(avg(s.score)::numeric, 1) as avg_score,
  round(avg(s.duration_ms) / 1000.0, 1) as avg_duration_sec
from public.moonlab_sessions s
group by 1
order by 1;

create or replace view public.moonlab_wrong_patterns as
select
  a.question_id,
  a.answer::text as answer_text,
  count(*)::int as times,
  count(distinct a.session_id)::int as learners
from public.moonlab_answers a
where a.is_correct = false
group by a.question_id, a.answer::text
order by count(*) desc;

grant select on public.moonlab_overview to anon, authenticated;
grant select on public.moonlab_question_stats to anon, authenticated;
grant select on public.moonlab_event_stats to anon, authenticated;
grant select on public.moonlab_daily to anon, authenticated;
grant select on public.moonlab_wrong_patterns to anon, authenticated;
