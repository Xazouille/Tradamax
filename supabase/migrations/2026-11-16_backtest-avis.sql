-- Tradamax · migration du 16/11/2026 : avis sur les setups du backtest
--
-- Crée la table « backtest_avis » : pour chaque setup revu dans l'onglet Backtest,
-- l'avis du trader (pris, pris autrement, refusé), la raison d'un refus, un
-- commentaire, la décision et le résultat du robot. Réservée aux membres.
-- Aucune table existante n'est modifiée.
--
-- À coller dans Supabase > SQL Editor > New query, puis Run.
-- Peut être relancée sans risque : elle ne crée que ce qui manque.

create table if not exists public.backtest_avis (
  setup_id   text primary key,          -- marché | sens | unité de la prise de liquidité | minute de la prise de liquidité
  marche     text not null,
  regles     text not null,             -- version des règles du robot
  robot      text not null,             -- « pris » ou « annulé » suivi du code de la règle
  avis       text not null check (avis in ('pris', 'autrement', 'refuse')),
  raison     text,                      -- raison d'un refus
  note       text,
  r_robot    numeric,                   -- résultat du robot en R (ou celui qu'il aurait fait), vide sans entrée
  details    jsonb,                     -- date, sens, unités, zone, entrée, stop, objectif, sortie
  auteur     uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.backtest_avis enable row level security;

drop policy if exists "backtest_avis membres" on public.backtest_avis;
create policy "backtest_avis membres" on public.backtest_avis
  for all to authenticated using (public.est_membre()) with check (public.est_membre());
