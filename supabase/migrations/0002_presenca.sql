-- NETO AUTO CENTER — Migração 0002: veículo na oficina ou com o condutor.
-- O atendimento continua ativo (ex.: aguardando aprovação), mas o veículo pode ter saído com o condutor.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

alter table public.atendimentos add column if not exists na_oficina boolean not null default true;
alter table public.atendimentos add column if not exists fora_desde timestamptz;

create or replace function public.marcar_presenca(p_at uuid, p_na_oficina boolean, p_em timestamptz default now(), p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v_em timestamptz := coalesce(p_em, now());
begin
  perform public.exige(array['Administrador','Gerência','Recepção','Operacional']);
  a := public._at(p_at);
  if a.sit_fisica <> 'patio' then raise exception 'Este atendimento já foi encerrado com a saída do veículo.'; end if;
  if a.na_oficina = p_na_oficina then return; end if;
  update public.atendimentos set na_oficina = p_na_oficina, fora_desde = case when p_na_oficina then null else v_em end where id = p_at;
  insert into public.movimentacoes (atendimento_id, origem, destino, em, usuario, obs)
  values (p_at, case when p_na_oficina then 'Com o condutor' else a.local end, case when p_na_oficina then a.local else 'Com o condutor' end, v_em, auth.uid(), coalesce(p_obs,''));
  perform public._evento(p_at, 'Presença',
    case when p_na_oficina then 'Veículo voltou à oficina' else 'Condutor levou o veículo (atendimento continua ativo)' end
    || case when coalesce(p_obs,'') <> '' then ' · ' || p_obs else '' end, v_em);
end $$;

-- a saída definitiva zera o estado "fora"
create or replace function public._limpa_presenca() returns trigger language plpgsql as $$
begin
  if new.sit_fisica <> 'patio' then new.na_oficina := false; new.fora_desde := null; end if;
  if new.sit_fisica = 'patio' and old.sit_fisica <> 'patio' then new.na_oficina := true; end if;
  return new;
end $$;
drop trigger if exists limpa_presenca on public.atendimentos;
create trigger limpa_presenca before update of sit_fisica on public.atendimentos
  for each row execute function public._limpa_presenca();
