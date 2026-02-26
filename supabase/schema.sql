-- ══════════════════════════════════════════════════════════════════════════════
-- HSK Flashcards — Supabase Schema
-- Run this in: https://app.supabase.com/project/YOUR_PROJECT/sql/new
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Card States (FSRS per-user per-word) ────────────────────────────────────
-- Stores the spaced-repetition state for every card a user has reviewed.
-- 'character' is the simplified Chinese word (matches vocab.json .s field).
create table if not exists public.card_states (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users(id) on delete cascade not null,
  character    text not null,
  stability    float not null default 1.0,    -- FSRS stability (days to 90% recall)
  difficulty   float not null default 5.0,    -- FSRS difficulty [1-10]
  due_date     date not null default current_date,
  last_review  date,
  review_count int not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(user_id, character)
);

-- ─── Study Sessions ───────────────────────────────────────────────────────────
create table if not exists public.study_sessions (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users(id) on delete cascade not null,
  started_at     timestamptz default now(),
  ended_at       timestamptz,
  level          text not null default 'all',  -- '1','2','3','4','5','6','all'
  cards_reviewed int default 0,
  cards_correct  int default 0,
  new_cards      int default 0,
  duration_secs  int
);

-- ─── User Settings ────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id         uuid references auth.users(id) on delete cascade primary key,
  script          text default 'simplified',   -- 'simplified' | 'traditional'
  default_level   text default '1',
  auto_play_audio boolean default true,
  voice_name      text,
  speech_rate     float default 0.85,
  daily_target    int default 20,
  updated_at      timestamptz default now()
);

-- ─── Daily Progress ───────────────────────────────────────────────────────────
create table if not exists public.daily_progress (
  id        bigint generated always as identity primary key,
  user_id   uuid references auth.users(id) on delete cascade not null,
  date      date not null default current_date,
  completed int not null default 0,
  target    int not null default 20,
  unique(user_id, date)
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table public.card_states    enable row level security;
alter table public.study_sessions enable row level security;
alter table public.user_settings  enable row level security;
alter table public.daily_progress enable row level security;

-- Each user can only read and write their own rows
create policy "card_states: own rows only"
  on public.card_states for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "study_sessions: own rows only"
  on public.study_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_settings: own rows only"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "daily_progress: own rows only"
  on public.daily_progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Indexes (for query performance) ─────────────────────────────────────────
create index if not exists idx_card_states_user_due
  on public.card_states(user_id, due_date);

create index if not exists idx_study_sessions_user_started
  on public.study_sessions(user_id, started_at desc);

create index if not exists idx_daily_progress_user_date
  on public.daily_progress(user_id, date desc);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger card_states_updated_at
  before update on public.card_states
  for each row execute procedure public.touch_updated_at();

create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure public.touch_updated_at();

-- ─── Helper: batch upsert card states ─────────────────────────────────────────
-- Called by the app to sync all card states from localStorage on first login
create or replace function public.batch_upsert_card_states(
  p_states jsonb  -- array of {character, stability, difficulty, due_date, last_review}
)
returns void language plpgsql security definer as $$
declare
  s jsonb;
begin
  for s in select * from jsonb_array_elements(p_states) loop
    insert into public.card_states(user_id, character, stability, difficulty, due_date, last_review, review_count, updated_at)
    values (
      auth.uid(),
      s->>'character',
      (s->>'stability')::float,
      (s->>'difficulty')::float,
      (s->>'due_date')::date,
      (s->>'last_review')::date,
      1, now()
    )
    on conflict (user_id, character) do update set
      stability    = excluded.stability,
      difficulty   = excluded.difficulty,
      due_date     = excluded.due_date,
      last_review  = excluded.last_review,
      review_count = card_states.review_count + 1,
      updated_at   = now()
    where excluded.last_review >= card_states.last_review or card_states.last_review is null;
  end loop;
end;
$$;
