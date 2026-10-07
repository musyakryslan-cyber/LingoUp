create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    name text not null default '',
    surname text not null default '',
    email text not null default '',
    phone text not null default '',
    user_type text not null default 'student',
    is_admin boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.profiles
    add column if not exists user_type text not null default 'student';

alter table public.profiles
    drop constraint if exists profiles_user_type_check;
alter table public.profiles
    add constraint profiles_user_type_check
    check (user_type in ('student', 'teacher'));

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create or replace function public.is_lingoup_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and is_admin = true
    );
$$;

revoke all on function public.is_lingoup_admin() from public;
grant execute on function public.is_lingoup_admin() to authenticated;

drop policy if exists "Users can read their own profile and admins can read all profiles"
    on public.profiles;
create policy "Users can read their own profile and admins can read all profiles"
    on public.profiles
    for select
    to authenticated
    using ((select auth.uid()) = id or (select public.is_lingoup_admin()));

create or replace function public.create_lingoup_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, name, surname, email, phone, user_type)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'name', ''),
        coalesce(new.raw_user_meta_data ->> 'surname', ''),
        coalesce(new.email, ''),
        coalesce(new.raw_user_meta_data ->> 'phone', ''),
        case
            when new.raw_user_meta_data ->> 'user_type' in ('student', 'teacher')
                then new.raw_user_meta_data ->> 'user_type'
            else 'student'
        end
    );
    return new;
end;
$$;

drop trigger if exists on_lingoup_auth_user_created on auth.users;
create trigger on_lingoup_auth_user_created
    after insert on auth.users
    for each row execute function public.create_lingoup_profile();
