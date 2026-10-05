-- 使用者設定：每個使用者一筆，id 就是登入帳號的 id。
-- level、goals 的值要和 src/constants/profile-options.ts 一致。
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  level text not null
    check (level in ('beginner', 'kana', 'N5', 'N4', 'N3', 'N2', 'N1')),
  goals text[] not null default '{}'
    check (goals <@ array['travel', 'exam', 'anime_drama', 'work']::text[]),
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Row Level Security：每個人只能讀、新增、修改自己的那一筆。
alter table public.profiles enable row level security;

create policy "只能讀自己的設定"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "只能新增自己的設定"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "只能修改自己的設定"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 讓 App（已登入的使用者）可以透過 API 存取這張表；實際能碰哪幾筆由上面的 RLS 決定。
-- 未登入的訪客（anon）完全不能存取。
revoke all on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;

-- 每次修改設定時，自動把 updated_at 更新成現在時間。
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
