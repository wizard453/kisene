-- Kišenė: duomenų bazės schema (3 versija)
-- Paleisk visą failą Supabase projekte: SQL Editor -> New query -> įklijuok -> Run.
-- Failą galima paleisti pakartotinai ir ant senesnės versijos: jis nieko neištrina, tik prideda trūkstamus dalykus.

-- ============ Biudžeto operacijos ============
create table if not exists public.transactions (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null,
  cat         text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  date        date not null,
  note        text not null default '' check (char_length(note) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.transactions add column if not exists account_id    text not null default 'main';
alter table public.transactions add column if not exists to_account_id text;
alter table public.transactions add column if not exists memo          text not null default '';
alter table public.transactions add column if not exists recurring_id  text;

-- exp = išlaida, inc = pajamos, trf = pervedimas tarp savo sąskaitų
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in ('exp', 'inc', 'trf'));
alter table public.transactions drop constraint if exists transactions_memo_len;
alter table public.transactions add constraint transactions_memo_len check (char_length(memo) <= 300);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- ============ Investicijų operacijos ============
create table if not exists public.inv_tx (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('buy','sell','div','interest','fee','deposit','withdraw','split')),
  platform    text not null default '' check (char_length(platform) <= 60),
  symbol      text not null default '' check (char_length(symbol) <= 40),
  name        text not null default '' check (char_length(name) <= 120),
  isin        text not null default '' check (char_length(isin) <= 20),
  qty         numeric(24, 10) not null default 0,
  price       numeric(24, 10) not null default 0,
  currency    text not null default 'EUR' check (char_length(currency) <= 8),
  amount      numeric(16, 2) not null default 0,
  fee         numeric(16, 2) not null default 0,
  amount_eur  numeric(16, 2),
  note        text not null default '' check (char_length(note) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists inv_tx_user_date_idx on public.inv_tx (user_id, date);

-- ============ Nustatymai ============
create table if not exists public.settings (
  user_id         uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  budgets         jsonb not null default '{}'::jsonb,
  demo_dismissed  boolean not null default false,
  updated_at      timestamptz not null default now()
);

alter table public.settings add column if not exists categories jsonb;
alter table public.settings add column if not exists rules      jsonb not null default '[]'::jsonb;
alter table public.settings add column if not exists accounts   jsonb;
alter table public.settings add column if not exists recurring  jsonb not null default '[]'::jsonb;
alter table public.settings add column if not exists goals      jsonb not null default '[]'::jsonb;
alter table public.settings add column if not exists assets     jsonb not null default '{}'::jsonb;
alter table public.settings add column if not exists prefs      jsonb not null default '{}'::jsonb;

-- ============ updated_at ============
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

drop trigger if exists inv_tx_touch on public.inv_tx;
create trigger inv_tx_touch before update on public.inv_tx
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============ Row Level Security: kiekvienas mato tik savo duomenis ============
alter table public.transactions enable row level security;
alter table public.inv_tx enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own inv_tx" on public.inv_tx;
create policy "own inv_tx" on public.inv_tx
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============ Realtime: pakeitimai iš karto pasiekia kitus įrenginius ============
do $$
declare t text;
begin
  foreach t in array array['transactions', 'inv_tx', 'settings'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============ Investavimo platformų prijungimas (3 versija) ============
-- Raktai saugomi užšifruoti. RLS įjungta be jokių taisyklių, todėl programėlė jų perskaityti negali,
-- prieiga tik per serverio funkciją broker-sync.
create table if not exists public.broker_connections (
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null,
  key_enc     text not null,
  secret_enc  text,
  state       jsonb not null default '{}'::jsonb,
  last_sync   timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, platform)
);
alter table public.broker_connections enable row level security;
