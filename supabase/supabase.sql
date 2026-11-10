-- =========================================================================
--  Une lettre pour toi : schéma Supabase
--  À coller en entier dans Supabase > SQL Editor, puis cliquer sur "Run".
--  Ré-exécutable sans danger : rien n'est effacé (surprises, comptes, codes, photos).
--  Le résultat affiché à la fin dit si le propriétaire est bien configuré.
-- =========================================================================


-- =========================================================================
-- 0. RÉGLAGE : ton identifiant de propriétaire (User UID, pas l'e-mail)
--    1. Supabase > Authentication > Users > "Add user" > "Create new user"
--       (e-mail + mot de passe, coche "Auto Confirm User").
--    2. Clique sur ce compte et copie son "User UID".
--    3. Colle-le entre les apostrophes ci-dessous, puis lance tout le fichier.
-- =========================================================================
create table if not exists public.app_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);

do $$
declare
  owner_uid text := 'de267149-9361-4b23-b9fe-4c199679ca20';
begin
  if owner_uid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    if exists (select 1 from auth.users where id = owner_uid::uuid) then
      insert into public.app_owners (user_id) values (owner_uid::uuid) on conflict do nothing;
    else
      raise warning 'Aucun compte avec le User UID %. Crée-le dans Authentication > Users > Add user, puis relance ce fichier.', owner_uid;
    end if;
  end if;
  if not exists (select 1 from public.app_owners) then
    raise warning 'AUCUN PROPRIÉTAIRE CONFIGURÉ : crée ton compte dans Authentication > Users > Add user (Auto Confirm), colle son User UID en haut de ce fichier, puis relance-le.';
  end if;
end $$;


-- =========================================================================
-- 1. Codes d'activation et clients
-- =========================================================================
create table if not exists public.access_codes (
  code        text primary key,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  used_by     uuid references auth.users(id) on delete set null,
  used_at     timestamptz
);
create table if not exists public.members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  code        text references public.access_codes(code) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- Personne n'accède directement à ces tables : tout passe par les fonctions ci-dessous.
alter table public.app_owners   enable row level security;
alter table public.access_codes enable row level security;
alter table public.members      enable row level security;
revoke all on public.app_owners, public.access_codes, public.members from public, anon, authenticated;

-- (L'ancien bloc qui activait automatiquement tous les comptes existants a été retiré :
--  relancer ce fichier n'active plus jamais personne.)

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_owners where user_id = auth.uid());
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner() or exists (select 1 from members where user_id = auth.uid() and active);
$$;


-- =========================================================================
-- 2. La table des surprises
-- =========================================================================
create table if not exists public.surprises (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug        text not null unique,
  nom         text not null,
  code        text not null,
  indice      text not null default '',
  debut       date,
  statut      text not null default '',
  titre       text not null default '',
  texte       text[] not null default '{}',
  signature   text not null default '',
  legendes    text[] not null default '{}',
  photos      text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- Fonctions de contrôle utilisées par les contraintes ci-dessous.
create or replace function public.surprise_texte_ok(t text[]) returns boolean
language sql immutable as $$
  select coalesce(sum(char_length(x)), 0) <= 10000 from unnest(t) as x;
$$;
create or replace function public.surprise_legendes_ok(l text[]) returns boolean
language sql immutable as $$
  select cardinality(l) <= 12 and not exists (select 1 from unnest(l) as x where char_length(x) > 30);
$$;
-- Chaque photo doit être un fichier JPEG du dossier de l'auteur dans le stockage (jamais une adresse externe).
create or replace function public.surprise_photos_ok(p_owner uuid, p text[]) returns boolean
language sql immutable as $$
  select cardinality(p) <= 12
     and not exists (select 1 from unnest(p) as x
                     where x !~ ('^' || p_owner::text || '/[a-z0-9]{1,64}\.jpg$'));
$$;

-- Contraintes « not valid » : elles s'appliquent aux nouvelles écritures sans bloquer les données existantes.
do $$
declare c record;
begin
  for c in select * from (values
    ('surprises_code_check',      $c$check (code ~ '^[0-9]{6}$')$c$),
    ('surprises_nom_len',         $c$check (char_length(nom) between 1 and 40)$c$),
    ('surprises_indice_len',      $c$check (char_length(indice) <= 120)$c$),
    ('surprises_statut_len',      $c$check (char_length(statut) <= 80)$c$),
    ('surprises_titre_len',       $c$check (char_length(titre) <= 80)$c$),
    ('surprises_signature_len',   $c$check (char_length(signature) <= 60)$c$),
    ('surprises_texte_len',       $c$check (cardinality(texte) <= 100 and public.surprise_texte_ok(texte))$c$),
    ('surprises_legendes_ok',     $c$check (public.surprise_legendes_ok(legendes))$c$),
    ('surprises_photos_ok',       $c$check (public.surprise_photos_ok(owner, photos))$c$),
    ('surprises_slug_format',     $c$check (slug ~ '^[a-z0-9-]{6,64}$')$c$)
  ) as t(name, def)
  loop
    execute format('alter table public.surprises drop constraint if exists %I', c.name);
    execute format('alter table public.surprises add constraint %I %s not valid', c.name, c.def);
  end loop;
end $$;

-- 50 surprises maximum par client (le propriétaire n'est pas limité).
create or replace function public.surprises_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_owners where user_id = new.owner)
     and (select count(*) from surprises where owner = new.owner) >= 50 then
    raise exception 'Limite atteinte : 50 surprises maximum par compte.';
  end if;
  return new;
end $$;
drop trigger if exists surprises_limit on public.surprises;
create trigger surprises_limit before insert on public.surprises
  for each row execute function public.surprises_limit();

grant select, insert, update, delete on public.surprises to authenticated;
revoke all on public.surprises from public, anon;
alter table public.surprises enable row level security;

-- Chaque client ACTIVÉ ne voit et ne modifie que SES surprises.
drop policy if exists "admin lit les siennes"      on public.surprises;
drop policy if exists "admin crée les siennes"     on public.surprises;
drop policy if exists "admin modifie les siennes"  on public.surprises;
drop policy if exists "admin supprime les siennes" on public.surprises;
create policy "admin lit les siennes"      on public.surprises for select to authenticated using (owner = auth.uid() and public.is_member());
create policy "admin crée les siennes"     on public.surprises for insert to authenticated with check (owner = auth.uid() and public.is_member());
create policy "admin modifie les siennes"  on public.surprises for update to authenticated using (owner = auth.uid() and public.is_member()) with check (owner = auth.uid());
create policy "admin supprime les siennes" on public.surprises for delete to authenticated using (owner = auth.uid() and public.is_member());


-- =========================================================================
-- 3. Ce que voit la personne qui reçoit le lien
--    Ces deux fonctions ne sont appelables QUE par la fonction serveur
--    (Edge Function « open-surprise »), qui signe ensuite les photos.
--    Les surprises d'un client désactivé ne s'ouvrent plus.
-- =========================================================================

-- Compteur d'essais par surprise, contre les codes testés à la chaîne.
create table if not exists public.unlock_attempts (
  slug          text primary key,
  failures      int not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz,
  lock_level    int not null default 0
);
alter table public.unlock_attempts enable row level security;
revoke all on public.unlock_attempts from public, anon, authenticated;

create or replace function public.surprise_owner_active(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members m where m.user_id = p_owner and m.active)
      or exists (select 1 from app_owners o where o.user_id = p_owner);
$$;

-- Avant le code : l'indice, la longueur du code et UNE seule photo (celle du cœur, la 3e).
create or replace function public.surprise_preview(p_slug text)
returns json language plpgsql stable security definer set search_path = public as $$
declare s surprises; lk timestamptz;
begin
  select * into s from surprises where slug = p_slug;
  if not found or not public.surprise_owner_active(s.owner) then
    return json_build_object('status', 'not_found');
  end if;
  select locked_until into lk from unlock_attempts where slug = p_slug;
  return json_build_object(
    'status', 'ok',
    'indice', s.indice,
    'longueur', char_length(s.code),
    'photo', case when cardinality(s.photos) >= 3 then s.photos[3] end,
    'locked_for', greatest(0, ceil(extract(epoch from (coalesce(lk, now()) - now()))))::int
  );
end $$;

-- Avec le code. Statuts : ok / wrong / locked / not_found.
-- Après 5 erreurs : pause de 15 min, puis 1 h, puis 24 h si ça recommence.
create or replace function public.open_surprise(p_slug text, p_code text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  s surprises;
  a unlock_attempts;
  pause interval;
begin
  select * into s from surprises where slug = p_slug;
  if not found or not public.surprise_owner_active(s.owner) then
    return json_build_object('status', 'not_found');
  end if;

  insert into unlock_attempts (slug) values (p_slug) on conflict (slug) do nothing;
  select * into a from unlock_attempts where slug = p_slug for update;

  -- Verrouillé : on ne regarde même pas le code.
  if a.locked_until is not null and a.locked_until > now() then
    return json_build_object('status', 'locked',
      'retry_after', ceil(extract(epoch from (a.locked_until - now())))::int);
  end if;

  -- Une pause terminée depuis plus de 24 h ne compte plus pour l'escalade.
  if a.locked_until is not null and a.locked_until < now() - interval '24 hours' then
    a.lock_level := 0;
  end if;

  if s.code = p_code then
    update unlock_attempts set failures = 0, window_start = now(), locked_until = null, lock_level = 0
     where slug = p_slug;
    return json_build_object(
      'status', 'ok',
      'indice', s.indice, 'debut', s.debut, 'statut', s.statut, 'titre', s.titre,
      'texte', s.texte, 'signature', s.signature, 'legendes', s.legendes, 'photos', s.photos);
  end if;

  -- Mauvais code : les erreurs comptent sur une fenêtre d'une heure.
  if a.window_start < now() - interval '1 hour' then
    a.failures := 0; a.window_start := now();
  end if;
  a.failures := a.failures + 1;

  if a.failures >= 5 then
    pause := case when a.lock_level = 0 then interval '15 minutes'
                  when a.lock_level = 1 then interval '1 hour'
                  else interval '24 hours' end;
    update unlock_attempts
       set failures = 0, window_start = now(), locked_until = now() + pause, lock_level = least(a.lock_level + 1, 2)
     where slug = p_slug;
    return json_build_object('status', 'locked', 'retry_after', extract(epoch from pause)::int);
  end if;

  update unlock_attempts set failures = a.failures, window_start = a.window_start, lock_level = a.lock_level
   where slug = p_slug;
  return json_build_object('status', 'wrong', 'remaining', 5 - a.failures);
end $$;


-- =========================================================================
-- 4. Activation d'un compte
-- =========================================================================
create or replace function public.my_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'owner', public.is_owner(),
    'member', public.is_member(),
    'inactive', exists (select 1 from members where user_id = auth.uid() and not active)
  );
$$;

-- Vérifie qu'un code existe et n'a pas servi (avant de créer un compte).
create or replace function public.code_is_valid(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from access_codes where code = upper(trim(p_code)) and used_by is null);
$$;

-- Active le compte connecté avec un code. Renvoie 'ok', 'already', 'invalid', 'disabled' ou 'signed_out'.
create or replace function public.activate_account(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if auth.uid() is null then return 'signed_out'; end if;
  if exists (select 1 from members where user_id = auth.uid() and not active) then return 'disabled'; end if;
  if public.is_member() then return 'already'; end if;
  update access_codes set used_by = auth.uid(), used_at = now()
   where code = upper(trim(p_code)) and used_by is null
  returning code into v;
  if v is null then return 'invalid'; end if;
  insert into members (user_id, code) values (auth.uid(), v)
  on conflict (user_id) do update set code = excluded.code;
  return 'ok';
end $$;

-- Le client supprime son compte et toutes ses données
-- (le site efface d'abord ses photos du stockage, puis appelle cette fonction).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  if public.is_owner() then raise exception 'Le compte propriétaire ne peut pas être supprimé depuis le site.'; end if;
  delete from auth.users where id = auth.uid();   -- surprises et statut client partent en cascade
end $$;


-- =========================================================================
-- 5. Espace propriétaire : codes, clients, nettoyage
-- =========================================================================
create or replace function public.owner_create_codes(p_count int, p_note text)
returns setof text language plpgsql security definer set search_path = public as $$
declare v text; h text;
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  for i in 1 .. least(greatest(coalesce(p_count, 1), 1), 50) loop
    h := upper(replace(gen_random_uuid()::text, '-', ''));
    v := substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
    insert into access_codes (code, note) values (v, left(coalesce(p_note, ''), 80));
    return next v;
  end loop;
end $$;

create or replace function public.owner_list_codes()
returns table (code text, note text, created_at timestamptz, used_at timestamptz, used_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  return query
    select c.code, c.note, c.created_at, c.used_at, u.email::text
    from access_codes c left join auth.users u on u.id = c.used_by
    order by c.created_at desc;
end $$;

create or replace function public.owner_delete_code(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  delete from access_codes where code = p_code and used_by is null;
end $$;

create or replace function public.owner_list_members()
returns table (user_id uuid, email text, created_at timestamptz, active boolean, code text, nb_surprises bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  return query
    select m.user_id, u.email::text, m.created_at, m.active, m.code,
           (select count(*) from surprises s where s.owner = m.user_id)
    from members m join auth.users u on u.id = m.user_id
    order by m.created_at desc;
end $$;

-- Comptes inscrits mais jamais activés (ni client, ni propriétaire).
create or replace function public.owner_list_pending()
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  return query
    select u.id, u.email::text, u.created_at
    from auth.users u
    where not exists (select 1 from members m where m.user_id = u.id)
      and not exists (select 1 from app_owners o where o.user_id = u.id)
    order by u.created_at desc;
end $$;

create or replace function public.owner_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  update members set active = p_active where user_id = p_user;
end $$;

-- Supprime un client (ou un compte jamais activé) et toutes ses données.
-- Le site efface d'abord ses photos du stockage, puis appelle cette fonction.
create or replace function public.owner_delete_client(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  if exists (select 1 from app_owners where user_id = p_user) then
    raise exception 'Impossible de supprimer un compte propriétaire.';
  end if;
  delete from auth.users where id = p_user;      -- surprises et statut client partent en cascade
end $$;

-- Photos du stockage qu'aucune surprise n'utilise, déposées il y a plus de 24 h.
create or replace function public.owner_list_orphans()
returns table (name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_owner() then raise exception 'réservé au propriétaire'; end if;
  return query
    select o.name::text, o.created_at
    from storage.objects o
    where o.bucket_id = 'photos'
      and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.surprises s where o.name = any (s.photos))
    order by o.created_at;
end $$;


-- =========================================================================
-- 6. Droits d'exécution des fonctions
--    Supabase donne par défaut ce droit à anon et authenticated : on le retire
--    partout, puis on le redonne fonction par fonction.
-- =========================================================================
revoke execute on all functions in schema public from public, anon, authenticated;

-- Visiteur sans compte : seulement vérifier un code d'activation avant l'inscription.
grant execute on function public.code_is_valid(text) to anon, authenticated;

-- Utilisés par les règles d'accès et les contraintes lors des écritures d'un client connecté.
grant execute on function public.is_owner(), public.is_member(),
  public.surprise_texte_ok(text[]), public.surprise_legendes_ok(text[]), public.surprise_photos_ok(uuid, text[])
  to authenticated;

-- Client connecté.
grant execute on function public.my_status(), public.activate_account(text), public.delete_my_account()
  to authenticated;

-- Propriétaire (chaque fonction revérifie is_owner()).
grant execute on function public.owner_create_codes(int, text), public.owner_list_codes(),
  public.owner_delete_code(text), public.owner_list_members(), public.owner_list_pending(),
  public.owner_set_active(uuid, boolean), public.owner_delete_client(uuid), public.owner_list_orphans()
  to authenticated;

-- Ouverture d'une surprise : uniquement la fonction serveur (clé service_role).
grant execute on function public.surprise_preview(text), public.open_surprise(text, text),
  public.surprise_owner_active(uuid) to service_role;


-- =========================================================================
-- 7. Stockage des photos : dossier PRIVÉ, JPEG de 3 Mo maximum
--    Les photos ne sont lisibles que par leur auteur, ou par des liens
--    temporaires (1 h) créés par la fonction serveur après le bon code.
-- =========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 3145728, '{image/jpeg}')
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = '{image/jpeg}';

drop policy if exists "photos : admin lit les siennes"       on storage.objects;
drop policy if exists "photos : admin ajoute les siennes"    on storage.objects;
drop policy if exists "photos : admin supprime les siennes"  on storage.objects;
drop policy if exists "photos : propriétaire lit tout"       on storage.objects;
drop policy if exists "photos : propriétaire supprime tout"  on storage.objects;
create policy "photos : admin lit les siennes" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos : admin ajoute les siennes" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());
create policy "photos : admin supprime les siennes" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Le propriétaire peut voir et effacer toutes les photos (nettoyage, suppression d'un client).
create policy "photos : propriétaire lit tout" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_owner());
create policy "photos : propriétaire supprime tout" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_owner());


-- =========================================================================
-- 8. Bilan (s'affiche sous l'éditeur SQL)
-- =========================================================================
select case
  when exists (select 1 from public.app_owners)
    then 'OK : schéma à jour, propriétaire configuré.'
  else 'ATTENTION : aucun propriétaire. Crée ton compte (Authentication > Users > Add user, Auto Confirm), colle son User UID tout en haut de ce fichier, puis relance-le.'
end as resultat;
