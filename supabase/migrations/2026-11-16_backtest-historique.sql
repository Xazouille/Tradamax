-- Tradamax · migration du 16/11/2026 : données historiques du backtest
--
-- Crée un espace de stockage privé « historique » pour les bougies d'une minute
-- exportées depuis MT5 (un fichier compressé par marché et par mois, plus un
-- index). Lecture, ajout, remplacement et suppression réservés aux membres,
-- comme pour les captures. Aucune table existante n'est modifiée.
--
-- À coller dans Supabase > SQL Editor > New query, puis Run.
-- Peut être relancée sans risque : elle ne crée que ce qui manque.

insert into storage.buckets (id, name, public)
values ('historique', 'historique', false)
on conflict do nothing;

drop policy if exists "historique lecture" on storage.objects;
create policy "historique lecture" on storage.objects
  for select to authenticated using (bucket_id = 'historique' and public.est_membre());

drop policy if exists "historique ajout" on storage.objects;
create policy "historique ajout" on storage.objects
  for insert to authenticated with check (bucket_id = 'historique' and public.est_membre());

-- remplacement d'un mois déjà importé (nouvel export qui le complète)
drop policy if exists "historique remplacement" on storage.objects;
create policy "historique remplacement" on storage.objects
  for update to authenticated
  using (bucket_id = 'historique' and public.est_membre())
  with check (bucket_id = 'historique' and public.est_membre());

drop policy if exists "historique suppression" on storage.objects;
create policy "historique suppression" on storage.objects
  for delete to authenticated using (bucket_id = 'historique' and public.est_membre());
