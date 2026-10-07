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
grant update (user_type) on table public.profiles to authenticated;

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

drop policy if exists "Users can update their own profile type" on public.profiles;
create policy "Users can update their own profile type"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

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

create table if not exists public.reviews (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    author_name text not null,
    user_type text not null check (user_type in ('student', 'teacher')),
    content text not null check (char_length(trim(content)) between 5 and 1000),
    created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;
revoke all on table public.reviews from anon, authenticated;
grant select (id, author_name, user_type, content, created_at)
    on table public.reviews to anon, authenticated;
grant insert (user_id, content) on table public.reviews to authenticated;
grant update (content) on table public.reviews to authenticated;
grant delete on table public.reviews to authenticated;

drop policy if exists "Anyone can read published reviews" on public.reviews;
create policy "Anyone can read published reviews"
    on public.reviews
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Users can publish their own reviews" on public.reviews;
create policy "Users can publish their own reviews"
    on public.reviews
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can edit their own reviews" on public.reviews;
create policy "Users can edit their own reviews"
    on public.reviews
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own reviews" on public.reviews;
create policy "Users can delete their own reviews"
    on public.reviews
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

create or replace function public.set_lingoup_review_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    profile_name text;
    profile_surname text;
    profile_type text;
begin
    select name, surname, user_type
    into profile_name, profile_surname, profile_type
    from public.profiles
    where id = new.user_id;

    if not found then
        raise exception 'A profile is required to publish a review';
    end if;

    new.author_name := concat_ws(' ', nullif(trim(profile_name), ''), nullif(left(trim(profile_surname), 1), '') || '.');
    new.user_type := profile_type;
    return new;
end;
$$;

revoke all on function public.set_lingoup_review_author() from public;
drop trigger if exists set_lingoup_review_author on public.reviews;
create trigger set_lingoup_review_author
    before insert or update on public.reviews
    for each row execute function public.set_lingoup_review_author();

create table if not exists public.admin_contacts (
    id uuid primary key default gen_random_uuid(),
    label text not null check (char_length(trim(label)) between 1 and 80),
    value text not null check (char_length(trim(value)) between 1 and 500),
    created_at timestamptz not null default now()
);

alter table public.admin_contacts enable row level security;
revoke all on table public.admin_contacts from anon, authenticated;
grant select on table public.admin_contacts to anon, authenticated;
grant insert (label, value) on table public.admin_contacts to authenticated;

drop policy if exists "Anyone can read administrator contacts" on public.admin_contacts;
create policy "Anyone can read administrator contacts"
    on public.admin_contacts
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Only administrators can add contacts" on public.admin_contacts;
create policy "Only administrators can add contacts"
    on public.admin_contacts
    for insert
    to authenticated
    with check ((select public.is_lingoup_admin()));
