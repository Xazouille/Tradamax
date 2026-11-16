-- Tradamax · migration du 16/11/2026 : tests de contrôle du backtest
--
-- Crée la table « backtest_controles » : le résultat du test de contrôle
-- (période jamais utilisée pour régler les règles), une seule fois par marché
-- et par version des règles. Les membres peuvent lire et ajouter un résultat,
-- jamais le modifier ni le supprimer depuis le site : c'est ce qui verrouille
-- le test. Aucune table existante n'est modifiée.
--
-- À coller dans Supabase > SQL Editor > New query, puis Run.
-- Peut être relancée sans risque : elle ne crée que ce qui manque.

create table if not exists public.backtest_controles (
  id         text primary key,          -- marché | version des règles : un seul test par couple
  marche     text not null,
  regles     text not null,
  periode    text not null,             -- premier et dernier mois testés
  resultat   jsonb not null,            -- trades, réussite, résultat en R, R moyen, drawdown, série de pertes
  auteur     uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.backtest_controles enable row level security;

drop policy if exists "backtest_controles lecture" on public.backtest_controles;
create policy "backtest_controles lecture" on public.backtest_controles
  for select to authenticated using (public.est_membre());

drop policy if exists "backtest_controles ajout" on public.backtest_controles;
create policy "backtest_controles ajout" on public.backtest_controles
  for insert to authenticated with check (public.est_membre());

-- aucune règle de modification ni de suppression : un résultat enregistré reste tel quel
