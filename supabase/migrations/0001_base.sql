-- NETO AUTO CENTER — Gestão Operacional
-- Migração 0001: tabelas, permissões (RLS), funções transacionais e auditoria.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run.
-- Pode ser executada de novo com segurança: usa IF NOT EXISTS / CREATE OR REPLACE.

-- gen_random_uuid() é nativo do PostgreSQL 13+ (o Supabase já usa 15+).

-- ===================================================================
-- Tabelas
-- ===================================================================

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text,
  perfil text not null default 'Operacional'
    check (perfil in ('Administrador','Gerência','Recepção','Operacional')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.configuracoes (
  id int primary key default 1 check (id = 1),
  nome_oficina text not null default 'NETO AUTO CENTER',
  fuso text not null default 'America/Cuiaba',
  alerta_dias int[] not null default '{3,7,15,30}'
);
insert into public.configuracoes (id) values (1) on conflict do nothing;

create table if not exists public.areas (
  id serial primary key,
  nome text not null unique,
  ordem int not null default 0,
  ativa boolean not null default true
);
insert into public.areas (nome, ordem) values
  ('Recepção',1),('Estacionamento',2),('Elevador 1',3),('Elevador 2',4),('Elevador 3',5),
  ('Mecânica',6),('Elétrica',7),('Funilaria',8),('Pintura',9),('Lavagem',10),
  ('Conferência',11),('Área de entrega',12)
on conflict (nome) do nothing;

create table if not exists public.locadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'Locadora'
    check (tipo in ('Locadora','Frota','Empresa','Órgão público','Particular')),
  contato text not null default '',
  telefone text not null default '',
  email text not null default '',
  obs text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id)
);
create unique index if not exists locadoras_nome_uk on public.locadoras (upper(nome));

create table if not exists public.veiculos (
  placa text primary key check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo text not null default '',
  criado_em timestamptz not null default now()
);

create sequence if not exists public.atendimento_seq;

create table if not exists public.atendimentos (
  id uuid primary key,
  numero text not null unique default ('AT-' || lpad(nextval('public.atendimento_seq')::text, 4, '0')),
  placa text not null references public.veiculos(placa),
  modelo text not null default '',
  locadora_id uuid not null references public.locadoras(id),
  condutor text not null default '',
  entrada timestamptz not null,
  saida timestamptz,
  os text not null default '',
  protocolo text not null default '',
  responsavel text not null default '',
  local text not null default 'Recepção',
  servico text not null default '',
  obs text not null default '',
  motivo_espera text not null default '',
  sit_fisica text not null default 'patio' check (sit_fisica in ('patio','entregue','retirado')),
  sit_comercial text not null default 'Aguardando orçamento' check (sit_comercial in
    ('Aguardando orçamento','Orçamento enviado','Aguardando aprovação','Em negociação','Aprovado','Recusado','Cancelado')),
  sit_operacional text not null default 'Aguardando avaliação' check (sit_operacional in
    ('Aguardando avaliação','Aguardando início','Em execução','Aguardando peças','Aguardando autorização complementar',
     'Aguardando serviço terceirizado','Aguardando conferência','Serviço concluído')),
  oper_desde timestamptz not null default now(),
  sit_fiscal text not null default 'Não faturado' check (sit_fiscal in
    ('Não faturado','Aguardando emissão','Em processo de emissão','Parcialmente faturado','Faturado','Nota cancelada')),
  sit_financeira text not null default 'A receber' check (sit_financeira in
    ('A receber','Parcialmente recebido','Recebido','Vencido')),
  arquivado boolean not null default false,
  enviado_em timestamptz,
  aprovado_em timestamptz,
  recusado_em timestamptz,
  valor_aprovado numeric(12,2),
  inicio_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id),
  atualizado_em timestamptz not null default now()
);
create index if not exists atendimentos_placa_ix on public.atendimentos (placa);
create index if not exists atendimentos_patio_ix on public.atendimentos (sit_fisica, arquivado);
create index if not exists atendimentos_entrada_ix on public.atendimentos (entrada);
create index if not exists atendimentos_locadora_ix on public.atendimentos (locadora_id);

create table if not exists public.orcamento_revisoes (
  id uuid primary key default gen_random_uuid(),
  seq bigserial,
  atendimento_id uuid not null references public.atendimentos(id),
  valor numeric(12,2) not null check (valor > 0),
  em timestamptz not null default now(),
  usuario uuid references public.usuarios(id),
  obs text not null default ''
);
create index if not exists revisoes_at_ix on public.orcamento_revisoes (atendimento_id, em);

create table if not exists public.descontos (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  base numeric(12,2) not null,
  solicitado numeric(12,2) not null check (solicitado >= 0),
  concedido numeric(12,2) not null check (concedido >= 0),
  pedido_em timestamptz not null,
  resposta_em timestamptz not null,
  motivo text not null default '',
  usuario uuid references public.usuarios(id),
  check (resposta_em >= pedido_em),
  check (concedido <= base)
);
create index if not exists descontos_at_ix on public.descontos (atendimento_id);

create table if not exists public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  origem text not null,
  destino text not null,
  em timestamptz not null default now(),
  usuario uuid references public.usuarios(id),
  obs text not null default ''
);
create index if not exists mov_at_ix on public.movimentacoes (atendimento_id, em);

create table if not exists public.esperas (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  motivo text not null,
  inicio timestamptz not null,
  fim timestamptz
);
create index if not exists esperas_at_ix on public.esperas (atendimento_id);

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.atendimentos(id),
  tipo text not null check (tipo in ('NFS-e','NF-e')),
  numero text not null,
  serie text not null default '1',
  valor numeric(12,2) not null check (valor > 0),
  emissao timestamptz not null,
  cancelada boolean not null default false,
  cancelada_em timestamptz,
  motivo_cancelamento text not null default '',
  obs text not null default '',
  usuario uuid references public.usuarios(id)
);
create unique index if not exists notas_validas_uk on public.notas_fiscais (atendimento_id, tipo, numero, serie) where not cancelada;
create index if not exists notas_emissao_ix on public.notas_fiscais (emissao);

create table if not exists public.eventos (
  id bigserial primary key,
  atendimento_id uuid references public.atendimentos(id),
  tipo text not null,
  descricao text not null,
  em timestamptz not null default now(),
  usuario uuid references public.usuarios(id),
  usuario_nome text not null default '',
  dados jsonb
);
create index if not exists eventos_at_ix on public.eventos (atendimento_id, em);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text not null default '',
  data date not null,
  hora time,
  prazo date,
  responsavel uuid references public.usuarios(id),
  prioridade text not null default 'Normal' check (prioridade in ('Baixa','Normal','Alta','Urgente')),
  status text not null default 'Pendente' check (status in ('Pendente','Em andamento','Concluída','Cancelada')),
  atendimento_id uuid references public.atendimentos(id),
  locadora_id uuid references public.locadoras(id),
  obs text not null default '',
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id),
  concluido_em timestamptz,
  concluido_por uuid references public.usuarios(id)
);

create table if not exists public.tarefa_log (
  id bigserial primary key,
  tarefa_id uuid not null references public.tarefas(id),
  acao text not null,
  em timestamptz not null default now(),
  usuario uuid references public.usuarios(id)
);

create table if not exists public.anotacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null default '',
  categoria text not null default 'Geral',
  fixada boolean not null default false,
  atendimento_id uuid references public.atendimentos(id),
  locadora_id uuid references public.locadoras(id),
  autor uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.anotacao_versoes (
  id bigserial primary key,
  anotacao_id uuid not null references public.anotacoes(id),
  titulo text not null,
  texto text not null,
  em timestamptz not null default now(),
  usuario uuid references public.usuarios(id)
);

-- ===================================================================
-- Perfil do usuário logado e criação automática de usuários
-- ===================================================================

create or replace function public.meu_perfil() returns text
language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.meu_nome() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nome from public.usuarios where id = auth.uid()), '')
$$;

create or replace function public.exige(perfis text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.meu_perfil() is null then
    raise exception 'Usuário sem acesso ou inativo.' using errcode = '42501';
  end if;
  if not (public.meu_perfil() = any(perfis)) then
    raise exception 'O perfil % não pode fazer esta operação.', public.meu_perfil() using errcode = '42501';
  end if;
end $$;

-- O primeiro usuário criado vira Administrador; os demais começam como Operacional
-- e o administrador ajusta o perfil dentro do app.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nome, email, perfil)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
    new.email,
    case when exists (select 1 from public.usuarios) then 'Operacional' else 'Administrador' end
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.novo_usuario();

-- ===================================================================
-- Permissões (RLS): todo usuário ativo lê; escrita direta só onde indicado.
-- As operações de atendimento passam pelas funções abaixo.
-- ===================================================================

do $$
declare t text;
begin
  foreach t in array array['usuarios','configuracoes','areas','locadoras','veiculos','atendimentos',
    'orcamento_revisoes','descontos','movimentacoes','esperas','notas_fiscais','eventos',
    'tarefas','tarefa_log','anotacoes','anotacao_versoes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists leitura on public.%I', t);
    execute format('create policy leitura on public.%I for select to authenticated using (public.meu_perfil() is not null)', t);
  end loop;
end $$;

-- o usuário sempre enxerga o próprio cadastro (para saber se está inativo)
drop policy if exists proprio on public.usuarios;
create policy proprio on public.usuarios for select to authenticated using (id = auth.uid());

drop policy if exists admin_usuarios on public.usuarios;
create policy admin_usuarios on public.usuarios for update to authenticated
  using (public.meu_perfil() = 'Administrador') with check (public.meu_perfil() = 'Administrador');

drop policy if exists admin_config on public.configuracoes;
create policy admin_config on public.configuracoes for update to authenticated
  using (public.meu_perfil() = 'Administrador') with check (public.meu_perfil() = 'Administrador');

drop policy if exists admin_areas on public.areas;
create policy admin_areas on public.areas for all to authenticated
  using (public.meu_perfil() = 'Administrador') with check (public.meu_perfil() = 'Administrador');

drop policy if exists cad_locadoras_ins on public.locadoras;
create policy cad_locadoras_ins on public.locadoras for insert to authenticated
  with check (public.meu_perfil() in ('Administrador','Gerência','Recepção'));
drop policy if exists cad_locadoras_upd on public.locadoras;
create policy cad_locadoras_upd on public.locadoras for update to authenticated
  using (public.meu_perfil() in ('Administrador','Gerência','Recepção'))
  with check (public.meu_perfil() in ('Administrador','Gerência','Recepção'));

-- ===================================================================
-- Funções transacionais (cada uma grava tudo ou nada, com evento de auditoria)
-- ===================================================================

create or replace function public._evento(p_at uuid, p_tipo text, p_desc text, p_em timestamptz default now(), p_dados jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.eventos (atendimento_id, tipo, descricao, em, usuario, usuario_nome, dados)
  values (p_at, p_tipo, p_desc, coalesce(p_em, now()), auth.uid(), public.meu_nome(), p_dados);
  update public.atendimentos set atualizado_em = now() where id = p_at;
$$;

create or replace function public._brl(v numeric) returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(v, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.')
$$;

create or replace function public._at(p_at uuid) returns public.atendimentos
language plpgsql security definer set search_path = public as $$
declare a public.atendimentos;
begin
  select * into a from public.atendimentos where id = p_at for update;
  if not found then raise exception 'Atendimento não encontrado.'; end if;
  return a;
end $$;

-- Entrada rápida. p_id vem do aparelho: repetir o envio não duplica.
create or replace function public.registrar_entrada(
  p_id uuid, p_placa text, p_locadora_id uuid, p_condutor text, p_entrada timestamptz,
  p_valor numeric default null, p_modelo text default '', p_os text default '', p_protocolo text default '',
  p_responsavel text default '', p_local text default 'Recepção', p_servico text default '', p_obs text default ''
) returns public.atendimentos
language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v_placa text := upper(regexp_replace(coalesce(p_placa,''), '[^A-Za-z0-9]', '', 'g'));
begin
  select * into a from public.atendimentos where id = p_id;
  if found then return a; end if;
  perform public.exige(array['Administrador','Gerência','Recepção']);
  if v_placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Placa inválida: %', p_placa; end if;
  if p_entrada is null then p_entrada := now(); end if;
  if abs(extract(epoch from (p_entrada - now()))) > 900 then
    perform public.exige(array['Administrador','Gerência']);
  end if;
  if p_valor is not null and p_valor <= 0 then raise exception 'O valor do orçamento precisa ser maior que zero.'; end if;

  insert into public.veiculos (placa, modelo) values (v_placa, coalesce(p_modelo,''))
  on conflict (placa) do update set modelo = case when excluded.modelo <> '' then excluded.modelo else veiculos.modelo end;

  insert into public.atendimentos (id, placa, modelo, locadora_id, condutor, entrada, os, protocolo, responsavel, local, servico, obs, oper_desde, criado_por)
  values (p_id, v_placa, coalesce(p_modelo,''), p_locadora_id, coalesce(p_condutor,''), p_entrada, coalesce(p_os,''), coalesce(p_protocolo,''),
          coalesce(nullif(p_responsavel,''), public.meu_nome()), coalesce(nullif(p_local,''),'Recepção'), coalesce(p_servico,''), coalesce(p_obs,''), p_entrada, auth.uid())
  returning * into a;

  perform public._evento(a.id, 'Entrada', 'Veículo recebido', p_entrada);
  if abs(extract(epoch from (p_entrada - now()))) > 900 then
    perform public._evento(a.id, 'Correção', 'Data de entrada informada manualmente: ' || to_char(p_entrada at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
  end if;
  if a.local <> 'Recepção' then
    insert into public.movimentacoes (atendimento_id, origem, destino, em, usuario) values (a.id, 'Recepção', a.local, p_entrada, auth.uid());
  end if;
  if p_valor is not null then
    insert into public.orcamento_revisoes (atendimento_id, valor, usuario, obs) values (a.id, p_valor, auth.uid(), 'Orçamento inicial');
    perform public._evento(a.id, 'Orçamento', 'Orçamento inicial: ' || public._brl(p_valor));
  end if;
  return a;
end $$;

create or replace function public.movimentar(p_at uuid, p_destino text, p_em timestamptz default now(), p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos;
begin
  perform public.exige(array['Administrador','Gerência','Recepção','Operacional']);
  a := public._at(p_at);
  if a.local = p_destino then return; end if;
  insert into public.movimentacoes (atendimento_id, origem, destino, em, usuario, obs) values (p_at, a.local, p_destino, coalesce(p_em,now()), auth.uid(), coalesce(p_obs,''));
  update public.atendimentos set local = p_destino where id = p_at;
  perform public._evento(p_at, 'Movimentação', a.local || ' → ' || p_destino || case when coalesce(p_obs,'') <> '' then ' · ' || p_obs else '' end, p_em);
end $$;

create or replace function public.mudar_operacional(p_at uuid, p_valor text, p_em timestamptz default now(), p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v_em timestamptz := coalesce(p_em, now()); v_desc text;
  esperas_list text[] := array['Aguardando peças','Aguardando autorização complementar','Aguardando serviço terceirizado'];
begin
  perform public.exige(array['Administrador','Gerência','Recepção','Operacional']);
  a := public._at(p_at);
  if p_motivo is not null then update public.atendimentos set motivo_espera = p_motivo where id = p_at; end if;
  if a.sit_operacional = p_valor then return; end if;
  update public.esperas set fim = v_em where atendimento_id = p_at and fim is null;
  if p_valor = any(esperas_list) then
    insert into public.esperas (atendimento_id, motivo, inicio) values (p_at, p_valor, v_em);
  end if;
  v_desc := case when a.sit_operacional = any(esperas_list) and p_valor = 'Em execução' then 'Retomada do serviço'
                 else a.sit_operacional || ' → ' || p_valor end;
  update public.atendimentos set
    sit_operacional = p_valor, oper_desde = v_em,
    inicio_em = case when p_valor = 'Em execução' and inicio_em is null then v_em else inicio_em end,
    concluido_em = case when p_valor = 'Serviço concluído' then v_em else concluido_em end
  where id = p_at;
  perform public._evento(p_at, 'Operacional', v_desc, v_em);
end $$;

create or replace function public.registrar_saida(p_at uuid, p_tipo text, p_em timestamptz default now(), p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v_em timestamptz := coalesce(p_em, now());
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  if p_tipo not in ('entregue','retirado') then raise exception 'Tipo de saída inválido.'; end if;
  a := public._at(p_at);
  if a.sit_fisica <> 'patio' then raise exception 'Este veículo já saiu do pátio.'; end if;
  if v_em < a.entrada then raise exception 'A saída não pode ser anterior à entrada.'; end if;
  update public.atendimentos set sit_fisica = p_tipo, saida = v_em where id = p_at;
  update public.esperas set fim = v_em where atendimento_id = p_at and fim is null;
  perform public._evento(p_at, 'Saída', case when p_tipo = 'entregue' then 'Veículo entregue' else 'Veículo retirado / removido' end
    || case when coalesce(p_obs,'') <> '' then ' · ' || p_obs else '' end, v_em);
end $$;

create or replace function public.reabrir(p_at uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  perform public._at(p_at);
  update public.atendimentos set sit_fisica = 'patio', saida = null where id = p_at;
  perform public._evento(p_at, 'Reabertura', 'Veículo voltou ao pátio');
end $$;

create or replace function public.arquivar(p_at uuid, p_arquivar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  perform public._at(p_at);
  update public.atendimentos set arquivado = p_arquivar where id = p_at;
  perform public._evento(p_at, 'Arquivamento', case when p_arquivar then 'Atendimento arquivado' else 'Atendimento desarquivado' end);
end $$;

create or replace function public.editar_atendimento(p_at uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; mudou text[] := '{}'; k text;
  campos text[] := array['modelo','locadora_id','condutor','os','protocolo','responsavel','motivo_espera','servico','obs'];
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  a := public._at(p_at);
  foreach k in array campos loop
    if p ? k and coalesce(p->>k,'') is distinct from coalesce(to_jsonb(a)->>k,'') then
      mudou := mudou || k;
    end if;
  end loop;
  update public.atendimentos set
    modelo = coalesce(p->>'modelo', modelo),
    locadora_id = coalesce((p->>'locadora_id')::uuid, locadora_id),
    condutor = coalesce(p->>'condutor', condutor),
    os = coalesce(p->>'os', os),
    protocolo = coalesce(p->>'protocolo', protocolo),
    responsavel = coalesce(p->>'responsavel', responsavel),
    motivo_espera = coalesce(p->>'motivo_espera', motivo_espera),
    servico = coalesce(p->>'servico', servico),
    obs = coalesce(p->>'obs', obs)
  where id = p_at;
  if p ? 'entrada' and (p->>'entrada')::timestamptz <> a.entrada then
    perform public.exige(array['Administrador','Gerência']);
    update public.atendimentos set entrada = (p->>'entrada')::timestamptz where id = p_at;
    perform public._evento(p_at, 'Correção', 'Data de entrada corrigida de '
      || to_char(a.entrada at time zone 'America/Cuiaba','DD/MM/YYYY HH24:MI') || ' para '
      || to_char((p->>'entrada')::timestamptz at time zone 'America/Cuiaba','DD/MM/YYYY HH24:MI'));
  end if;
  if array_length(mudou,1) > 0 then
    perform public._evento(p_at, 'Cadastro', 'Alterado: ' || array_to_string(mudou, ', '), now(), jsonb_build_object('antes', to_jsonb(a), 'mudou', mudou));
  end if;
end $$;

-- Mudança manual das situações comercial, fiscal e financeira (com perfil exigido por tipo)
create or replace function public.mudar_situacao(p_at uuid, p_campo text, p_valor text, p_em timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; antigo text; v_em timestamptz := coalesce(p_em, now());
begin
  if p_campo = 'comercial' then perform public.exige(array['Administrador','Gerência','Recepção']);
  elsif p_campo in ('fiscal','financeira') then perform public.exige(array['Administrador','Gerência']);
  else raise exception 'Situação inválida.'; end if;
  a := public._at(p_at);
  antigo := case p_campo when 'comercial' then a.sit_comercial when 'fiscal' then a.sit_fiscal else a.sit_financeira end;
  if antigo = p_valor then return; end if;
  if p_campo = 'comercial' then
    update public.atendimentos set sit_comercial = p_valor,
      enviado_em = case when p_valor in ('Orçamento enviado','Aguardando aprovação') and enviado_em is null then v_em else enviado_em end
    where id = p_at;
  elsif p_campo = 'fiscal' then update public.atendimentos set sit_fiscal = p_valor where id = p_at;
  else update public.atendimentos set sit_financeira = p_valor where id = p_at; end if;
  perform public._evento(p_at, initcap(p_campo), antigo || ' → ' || p_valor, v_em);
end $$;

-- ---------- Comercial e fiscal (usadas a partir da Entrega 2) ----------

create or replace function public.registrar_orcamento(p_at uuid, p_valor numeric, p_em timestamptz default now(), p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  perform public._at(p_at);
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  select count(*) into n from public.orcamento_revisoes where atendimento_id = p_at;
  insert into public.orcamento_revisoes (atendimento_id, valor, em, usuario, obs)
  values (p_at, p_valor, coalesce(p_em,now()), auth.uid(), coalesce(nullif(p_obs,''), case when n = 0 then 'Orçamento inicial' else 'Revisão' end));
  perform public._evento(p_at, 'Orçamento', case when n = 0 then 'Orçamento inicial: ' else 'Revisão: ' end || public._brl(p_valor), p_em);
end $$;

create or replace function public.enviar_orcamento(p_at uuid, p_em timestamptz default now(), p_protocolo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v numeric;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  a := public._at(p_at);
  select valor into v from public.orcamento_revisoes where atendimento_id = p_at order by seq desc limit 1;
  if v is null then raise exception 'Registre o valor do orçamento antes de enviar.'; end if;
  update public.atendimentos set
    enviado_em = coalesce(enviado_em, coalesce(p_em,now())),
    protocolo = coalesce(nullif(p_protocolo,''), protocolo),
    sit_comercial = case when sit_comercial in ('Aguardando orçamento','Orçamento enviado') then 'Aguardando aprovação' else sit_comercial end
  where id = p_at;
  perform public._evento(p_at, 'Orçamento', case when a.enviado_em is null then 'Orçamento enviado: ' else 'Orçamento reenviado: ' end || public._brl(v), p_em);
end $$;

create or replace function public.registrar_desconto(p_at uuid, p_solicitado numeric, p_concedido numeric, p_pedido_em timestamptz, p_resposta_em timestamptz, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; base numeric;
begin
  perform public.exige(array['Administrador','Gerência']);
  a := public._at(p_at);
  select valor into base from public.orcamento_revisoes where atendimento_id = p_at order by seq desc limit 1;
  if base is null then raise exception 'Não há orçamento para negociar.'; end if;
  if p_concedido < 0 or p_concedido > base then raise exception 'A redução concedida precisa estar entre zero e o valor de referência.'; end if;
  insert into public.descontos (atendimento_id, base, solicitado, concedido, pedido_em, resposta_em, motivo, usuario)
  values (p_at, base, p_solicitado, coalesce(p_concedido,0), p_pedido_em, p_resposta_em, coalesce(p_motivo,''), auth.uid());
  if coalesce(p_concedido,0) > 0 then
    insert into public.orcamento_revisoes (atendimento_id, valor, em, usuario, obs) values (p_at, base - p_concedido, p_resposta_em, auth.uid(), 'Após negociação');
  end if;
  if a.sit_comercial <> 'Aprovado' then update public.atendimentos set sit_comercial = 'Em negociação' where id = p_at; end if;
  perform public._evento(p_at, 'Desconto', 'Solicitado ' || public._brl(p_solicitado) || ' · concedido ' || public._brl(coalesce(p_concedido,0))
    || case when coalesce(p_motivo,'') <> '' then ' · ' || p_motivo else '' end, p_resposta_em);
end $$;

create or replace function public.aprovar_orcamento(p_at uuid, p_valor numeric, p_em timestamptz default now(), p_protocolo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v numeric; v_em timestamptz := coalesce(p_em, now());
begin
  perform public.exige(array['Administrador','Gerência']);
  a := public._at(p_at);
  if a.aprovado_em is not null then raise exception 'Este orçamento já foi aprovado.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor aprovado.'; end if;
  if a.enviado_em is not null and v_em < a.enviado_em then raise exception 'A aprovação não pode ser anterior ao envio.'; end if;
  select valor into v from public.orcamento_revisoes where atendimento_id = p_at order by seq desc limit 1;
  if v is distinct from p_valor then
    insert into public.orcamento_revisoes (atendimento_id, valor, em, usuario, obs) values (p_at, p_valor, v_em, auth.uid(), 'Valor aprovado');
  end if;
  update public.atendimentos set aprovado_em = v_em, valor_aprovado = p_valor, sit_comercial = 'Aprovado',
    protocolo = coalesce(nullif(p_protocolo,''), protocolo) where id = p_at;
  perform public._evento(p_at, 'Aprovação', 'Aprovado: ' || public._brl(p_valor), v_em);
  if a.sit_operacional = 'Aguardando avaliação' then perform public.mudar_operacional(p_at, 'Aguardando início', v_em); end if;
end $$;

create or replace function public.recusar_orcamento(p_at uuid, p_em timestamptz default now(), p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  perform public._at(p_at);
  update public.atendimentos set recusado_em = coalesce(p_em,now()), sit_comercial = 'Recusado' where id = p_at;
  perform public._evento(p_at, 'Recusa', 'Orçamento recusado' || case when coalesce(p_motivo,'') <> '' then ': ' || p_motivo else '' end, p_em);
end $$;

create or replace function public._recalc_fiscal(p_at uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; fat numeric; tot int; canc int; base numeric;
begin
  select * into a from public.atendimentos where id = p_at;
  select coalesce(sum(valor) filter (where not cancelada),0), count(*), count(*) filter (where cancelada)
    into fat, tot, canc from public.notas_fiscais where atendimento_id = p_at;
  base := coalesce(a.valor_aprovado, (select valor from public.orcamento_revisoes where atendimento_id = p_at order by seq desc limit 1));
  update public.atendimentos set sit_fiscal = case
    when fat > 0 and base is not null and fat + 0.005 < base then 'Parcialmente faturado'
    when fat > 0 then 'Faturado'
    when tot > 0 and tot = canc then 'Nota cancelada'
    when a.sit_fiscal in ('Faturado','Parcialmente faturado') then 'Não faturado'
    else a.sit_fiscal end
  where id = p_at;
end $$;

create or replace function public.emitir_nota(p_at uuid, p_tipo text, p_numero text, p_serie text, p_valor numeric, p_emissao timestamptz, p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  perform public._at(p_at);
  if coalesce(p_numero,'') = '' then raise exception 'Informe o número da nota.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor da nota.'; end if;
  insert into public.notas_fiscais (atendimento_id, tipo, numero, serie, valor, emissao, obs, usuario)
  values (p_at, p_tipo, p_numero, coalesce(nullif(p_serie,''),'1'), p_valor, p_emissao, coalesce(p_obs,''), auth.uid());
  perform public._recalc_fiscal(p_at);
  perform public._evento(p_at, 'Nota fiscal', p_tipo || ' nº ' || p_numero || ' emitida: ' || public._brl(p_valor), p_emissao);
end $$;

create or replace function public.cancelar_nota(p_nota uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
declare n public.notas_fiscais;
begin
  perform public.exige(array['Administrador','Gerência']);
  select * into n from public.notas_fiscais where id = p_nota for update;
  if not found then raise exception 'Nota não encontrada.'; end if;
  if n.cancelada then return; end if;
  update public.notas_fiscais set cancelada = true, cancelada_em = now(), motivo_cancelamento = coalesce(p_motivo,'') where id = p_nota;
  perform public._recalc_fiscal(n.atendimento_id);
  perform public._evento(n.atendimento_id, 'Nota fiscal', n.tipo || ' nº ' || n.numero || ' cancelada' || case when coalesce(p_motivo,'') <> '' then ': ' || p_motivo else '' end);
end $$;

-- Funções internas não podem ser chamadas pelo app
revoke execute on function public._evento(uuid,text,text,timestamptz,jsonb) from public, anon, authenticated;
revoke execute on function public._at(uuid) from public, anon, authenticated;
revoke execute on function public._recalc_fiscal(uuid) from public, anon, authenticated;
revoke execute on function public.novo_usuario() from public, anon, authenticated;

-- ===================================================================
-- Atualização ao vivo entre aparelhos
-- ===================================================================
do $$
begin
  begin alter publication supabase_realtime add table public.atendimentos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.eventos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tarefas; exception when others then null; end;
end $$;
