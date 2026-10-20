-- NETO AUTO CENTER — Migração 0005: anexos (PDF e prints) do orçamento.
-- Os arquivos ficam no Storage do Supabase (pasta privada "anexos"); aqui fica o registro de cada um.
-- Depois que o atendimento é finalizado (saída), os arquivos são apagados após o prazo configurado;
-- o registro do anexo (nome, tamanho, quem enviou) continua no histórico.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

-- pasta privada, até 5 MB por arquivo, só PDF e imagens
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 5242880, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists anexos_ler on storage.objects;
create policy anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.meu_perfil() is not null);
drop policy if exists anexos_enviar on storage.objects;
create policy anexos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.meu_perfil() in ('Administrador','Gerência','Recepção'));
drop policy if exists anexos_apagar on storage.objects;
create policy anexos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.meu_perfil() in ('Administrador','Gerência'));

alter table public.configuracoes add column if not exists anexos_dias_apos_saida int not null default 7 check (anexos_dias_apos_saida >= 0);
drop policy if exists admin_config on public.configuracoes;
create policy admin_config on public.configuracoes for update to authenticated
  using (public.meu_perfil() = 'Administrador') with check (public.meu_perfil() = 'Administrador');

create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  nome text not null,
  caminho text not null unique,
  tipo text not null,
  tamanho bigint not null default 0,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id),
  criado_por_nome text not null default '',
  removido_em timestamptz,
  removido_motivo text not null default ''
);
create index if not exists anexos_at_ix on public.anexos (atendimento_id);
alter table public.anexos enable row level security;
drop policy if exists leitura on public.anexos;
create policy leitura on public.anexos for select to authenticated using (public.meu_perfil() is not null);

create or replace function public.registrar_anexo(p_at uuid, p_nome text, p_caminho text, p_tipo text, p_tamanho bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  perform public._at(p_at);
  if p_caminho not like p_at::text || '/%' then raise exception 'Caminho do anexo inválido.'; end if;
  insert into public.anexos (atendimento_id, nome, caminho, tipo, tamanho, criado_por, criado_por_nome)
  values (p_at, p_nome, p_caminho, p_tipo, coalesce(p_tamanho,0), auth.uid(), public.meu_nome())
  on conflict (caminho) do nothing returning id into v_id;
  perform public._evento(p_at, 'Anexo', 'Anexo enviado: ' || p_nome || ' (' || round(coalesce(p_tamanho,0) / 1024.0) || ' KB)');
  return v_id;
end $$;

-- marca como removido (o app apaga o arquivo do Storage antes de chamar)
create or replace function public.marcar_anexo_removido(p_anexo uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
declare x public.anexos;
begin
  perform public.exige(array['Administrador','Gerência']);
  select * into x from public.anexos where id = p_anexo for update;
  if not found or x.removido_em is not null then return; end if;
  update public.anexos set removido_em = now(), removido_motivo = coalesce(p_motivo,'') where id = p_anexo;
  perform public._evento(x.atendimento_id, 'Anexo', 'Arquivo removido: ' || x.nome || case when coalesce(p_motivo,'') <> '' then ' · ' || p_motivo else '' end);
end $$;

-- anexos que já passaram do prazo após a saída do veículo (para a limpeza automática)
create or replace function public.anexos_para_limpar()
returns setof public.anexos language sql stable security definer set search_path = public as $$
  select x.* from public.anexos x join public.atendimentos a on a.id = x.atendimento_id
  where x.removido_em is null and a.sit_fisica <> 'patio' and a.saida is not null
    and a.saida < now() - make_interval(days => (select anexos_dias_apos_saida from public.configuracoes where id = 1))
  limit 200
$$;

create or replace function public.espaco_anexos()
returns table (bytes bigint, arquivos bigint) language sql stable security definer set search_path = public as $$
  select coalesce(sum(tamanho),0)::bigint, count(*) from public.anexos where removido_em is null
$$;
