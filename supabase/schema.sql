-- Tradamax V1 : base de données partagée (Supabase)
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Peut être relancé sans erreur.
-- AVANT de lancer : remplacez les deux adresses e-mail ci-dessous par les vôtres, dans l'éditeur
-- de Supabase seulement (ce fichier est publié : n'y écrivez jamais vos vraies adresses).

create extension if not exists pgcrypto;

-- 1. Les deux associés autorisés -------------------------------------------
create table if not exists public.membres (
  email text primary key
);
insert into public.membres (email) values
  ('gerant@exemple.fr'),
  ('trader@exemple.fr')
on conflict do nothing;

create or replace function public.est_membre()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.membres
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2. Trades -------------------------------------------------------------------
create table if not exists public.trades (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  heure       text,
  marche      text,
  compte      text,
  sens        text,
  fenetre     text,
  entree      numeric,
  stop        numeric,
  sortie      numeric,
  taille      numeric,
  risque      numeric,
  r_prevu     numeric,
  resultat    numeric not null,
  plan        boolean not null default true,
  emotion     text,
  note        text,
  capture     text,
  importe     boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);
create index if not exists trades_date_idx on public.trades (date);

-- 3. Réglages partagés (marchés, comptes, capital, R prévu, taux de change) ---
create table if not exists public.reglages (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.reglages (id, data) values (1, '{}'::jsonb) on conflict do nothing;

-- 4. Comptes prop firm ---------------------------------------------------------
create table if not exists public.prop_comptes (
  id          uuid primary key default gen_random_uuid(),
  firme       text not null,
  programme   text,
  taille      numeric,
  devise      text not null default 'USD',
  statut      text not null default 'Challenge en cours',
  cout        numeric,
  date_achat  date,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- 5. Versements reçus des prop firms ---------------------------------------------
create table if not exists public.payouts (
  id          uuid primary key default gen_random_uuid(),
  compte_id   uuid references public.prop_comptes (id) on delete cascade,
  date        date not null,
  montant     numeric not null,
  devise      text not null default 'USD',
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

-- 6. Accès : seuls les membres connectés lisent et écrivent ----------------------
alter table public.membres      enable row level security;
alter table public.trades       enable row level security;
alter table public.reglages     enable row level security;
alter table public.prop_comptes enable row level security;
alter table public.payouts      enable row level security;

drop policy if exists "membres lecture" on public.membres;
create policy "membres lecture" on public.membres
  for select to authenticated using (public.est_membre());

drop policy if exists "membres tout" on public.trades;
create policy "membres tout" on public.trades
  for all to authenticated using (public.est_membre()) with check (public.est_membre());

drop policy if exists "membres tout" on public.reglages;
create policy "membres tout" on public.reglages
  for all to authenticated using (public.est_membre()) with check (public.est_membre());

drop policy if exists "membres tout" on public.prop_comptes;
create policy "membres tout" on public.prop_comptes
  for all to authenticated using (public.est_membre()) with check (public.est_membre());

drop policy if exists "membres tout" on public.payouts;
create policy "membres tout" on public.payouts
  for all to authenticated using (public.est_membre()) with check (public.est_membre());

-- 7. Mises à jour en direct entre vous deux (sans erreur si c'est déjà fait) -----
do $$
declare t text;
begin
  foreach t in array array['trades', 'reglages', 'prop_comptes', 'payouts'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 8. Captures d'écran (stockage privé) ---------------------------------------
insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict do nothing;

drop policy if exists "captures lecture" on storage.objects;
create policy "captures lecture" on storage.objects
  for select to authenticated using (bucket_id = 'captures' and public.est_membre());

drop policy if exists "captures ajout" on storage.objects;
create policy "captures ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'captures' and public.est_membre());

drop policy if exists "captures suppression" on storage.objects;
create policy "captures suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'captures' and public.est_membre());
