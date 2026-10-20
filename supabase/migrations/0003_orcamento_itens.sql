-- NETO AUTO CENTER — Migração 0003: orçamento por itens (peças e serviços).
-- Cada item fica registrado com quem lançou, quando, e se foi aprovado ou retirado (com motivo).
-- O valor do orçamento passa a ser a soma dos itens não retirados; cada mudança gera uma revisão,
-- então o histórico de valores continua completo.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

create table if not exists public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  seq bigserial,
  atendimento_id uuid not null references public.atendimentos(id),
  tipo text not null default 'Peça' check (tipo in ('Peça','Serviço','Outro')),
  descricao text not null check (length(trim(descricao)) > 0),
  quantidade numeric(10,2) not null default 1 check (quantidade > 0),
  valor_unitario numeric(12,2) not null check (valor_unitario >= 0),
  status text not null default 'Proposto' check (status in ('Proposto','Aprovado','Retirado')),
  motivo_retirada text not null default '',
  obs text not null default '',
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id),
  criado_por_nome text not null default '',
  alterado_em timestamptz,
  alterado_por_nome text not null default ''
);
create index if not exists itens_at_ix on public.orcamento_itens (atendimento_id, seq);

alter table public.orcamento_itens enable row level security;
drop policy if exists leitura on public.orcamento_itens;
create policy leitura on public.orcamento_itens for select to authenticated using (public.meu_perfil() is not null);

do $$ begin
  begin alter publication supabase_realtime add table public.orcamento_itens; exception when others then null; end;
end $$;

create or replace function public._item_total(i public.orcamento_itens) returns numeric language sql immutable as $$
  select round(i.quantidade * i.valor_unitario, 2)
$$;

-- Recalcula o orçamento a partir dos itens: nova revisão se o total mudou; ajusta o valor aprovado.
create or replace function public._sync_itens(p_at uuid, p_obs text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; total numeric; aprov numeric; ultimo numeric; n_aprov int;
begin
  select * into a from public.atendimentos where id = p_at;
  select coalesce(sum(round(quantidade * valor_unitario, 2)) filter (where status <> 'Retirado'), 0),
         coalesce(sum(round(quantidade * valor_unitario, 2)) filter (where status = 'Aprovado'), 0),
         count(*) filter (where status = 'Aprovado')
    into total, aprov, n_aprov from public.orcamento_itens where atendimento_id = p_at;
  select valor into ultimo from public.orcamento_revisoes where atendimento_id = p_at order by seq desc limit 1;
  if total > 0 and total is distinct from ultimo then
    insert into public.orcamento_revisoes (atendimento_id, valor, usuario, obs) values (p_at, total, auth.uid(), left(p_obs, 300));
  end if;
  if a.aprovado_em is not null and n_aprov > 0 and aprov is distinct from a.valor_aprovado then
    update public.atendimentos set valor_aprovado = aprov where id = p_at;
    perform public._evento(p_at, 'Aprovação', 'Valor aprovado ajustado pelos itens: ' || public._brl(aprov));
  end if;
  perform public._recalc_fiscal(p_at);
end $$;

create or replace function public.adicionar_item(p_at uuid, p_tipo text, p_descricao text, p_quantidade numeric, p_valor_unitario numeric, p_obs text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; v_id uuid; v_total numeric;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  a := public._at(p_at);
  if coalesce(trim(p_descricao),'') = '' then raise exception 'Descreva o item.'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade precisa ser maior que zero.'; end if;
  if p_valor_unitario is null or p_valor_unitario < 0 then raise exception 'Informe o valor do item.'; end if;
  insert into public.orcamento_itens (atendimento_id, tipo, descricao, quantidade, valor_unitario, obs, criado_por, criado_por_nome)
  values (p_at, coalesce(p_tipo,'Peça'), trim(p_descricao), p_quantidade, p_valor_unitario, coalesce(p_obs,''), auth.uid(), public.meu_nome())
  returning id into v_id;
  v_total := round(p_quantidade * p_valor_unitario, 2);
  perform public._evento(p_at, 'Orçamento', 'Item incluído: ' || trim(p_descricao) || ' (' || public._brl(v_total) || ')'
    || case when a.aprovado_em is not null then ' · aguardando autorização complementar' else '' end);
  perform public._sync_itens(p_at, 'Item incluído: ' || trim(p_descricao));
  return v_id;
end $$;

create or replace function public.editar_item(p_item uuid, p_tipo text, p_descricao text, p_quantidade numeric, p_valor_unitario numeric, p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare i public.orcamento_itens; a public.atendimentos;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  select * into i from public.orcamento_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  a := public._at(i.atendimento_id);
  if i.status = 'Aprovado' then perform public.exige(array['Administrador','Gerência']); end if;
  if coalesce(trim(p_descricao),'') = '' then raise exception 'Descreva o item.'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'A quantidade precisa ser maior que zero.'; end if;
  if p_valor_unitario is null or p_valor_unitario < 0 then raise exception 'Informe o valor do item.'; end if;
  update public.orcamento_itens set tipo = coalesce(p_tipo, tipo), descricao = trim(p_descricao), quantidade = p_quantidade,
    valor_unitario = p_valor_unitario, obs = coalesce(p_obs, obs), alterado_em = now(), alterado_por_nome = public.meu_nome()
  where id = p_item;
  perform public._evento(i.atendimento_id, 'Orçamento', 'Item alterado: ' || trim(p_descricao) || ' · de '
    || public._brl(round(i.quantidade * i.valor_unitario, 2)) || ' para ' || public._brl(round(p_quantidade * p_valor_unitario, 2)), now(),
    jsonb_build_object('antes', to_jsonb(i)));
  perform public._sync_itens(i.atendimento_id, 'Item alterado: ' || trim(p_descricao));
end $$;

create or replace function public.retirar_item(p_item uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
declare i public.orcamento_itens; a public.atendimentos;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  select * into i from public.orcamento_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  a := public._at(i.atendimento_id);
  if i.status = 'Retirado' then return; end if;
  if i.status = 'Aprovado' then perform public.exige(array['Administrador','Gerência']); end if;
  update public.orcamento_itens set status = 'Retirado', motivo_retirada = coalesce(p_motivo,''), alterado_em = now(), alterado_por_nome = public.meu_nome()
  where id = p_item;
  perform public._evento(i.atendimento_id, 'Orçamento', 'Item retirado: ' || i.descricao || ' (' || public._brl(round(i.quantidade * i.valor_unitario, 2)) || ')'
    || case when coalesce(p_motivo,'') <> '' then ' · ' || p_motivo else '' end);
  perform public._sync_itens(i.atendimento_id, 'Item retirado: ' || i.descricao);
end $$;

create or replace function public.restaurar_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.orcamento_itens; a public.atendimentos;
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  select * into i from public.orcamento_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  a := public._at(i.atendimento_id);
  if i.status <> 'Retirado' then return; end if;
  update public.orcamento_itens set status = 'Proposto', motivo_retirada = '', alterado_em = now(), alterado_por_nome = public.meu_nome() where id = p_item;
  perform public._evento(i.atendimento_id, 'Orçamento', 'Item devolvido ao orçamento: ' || i.descricao);
  perform public._sync_itens(i.atendimento_id, 'Item devolvido: ' || i.descricao);
end $$;

-- Autoriza um item incluído depois da aprovação (autorização complementar)
create or replace function public.aprovar_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.orcamento_itens;
begin
  perform public.exige(array['Administrador','Gerência']);
  select * into i from public.orcamento_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  perform public._at(i.atendimento_id);
  if i.status <> 'Proposto' then return; end if;
  update public.orcamento_itens set status = 'Aprovado', alterado_em = now(), alterado_por_nome = public.meu_nome() where id = p_item;
  perform public._evento(i.atendimento_id, 'Aprovação', 'Item autorizado: ' || i.descricao || ' (' || public._brl(round(i.quantidade * i.valor_unitario, 2)) || ')');
  perform public._sync_itens(i.atendimento_id, 'Item autorizado: ' || i.descricao);
end $$;

-- Aprovação com escolha dos itens: os marcados ficam aprovados, os demais são retirados com o motivo.
create or replace function public.aprovar_com_itens(p_at uuid, p_aprovados uuid[], p_em timestamptz default now(), p_protocolo text default null, p_motivo text default 'Não aprovado pela locadora')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; total numeric; r record;
begin
  perform public.exige(array['Administrador','Gerência']);
  a := public._at(p_at);
  if a.aprovado_em is not null then raise exception 'Este orçamento já foi aprovado.'; end if;
  for r in select * from public.orcamento_itens where atendimento_id = p_at and status = 'Proposto' and not (id = any(coalesce(p_aprovados,'{}'))) loop
    update public.orcamento_itens set status = 'Retirado', motivo_retirada = coalesce(nullif(p_motivo,''),'Não aprovado pela locadora'), alterado_em = now(), alterado_por_nome = public.meu_nome() where id = r.id;
    perform public._evento(p_at, 'Orçamento', 'Item não aprovado: ' || r.descricao || ' (' || public._brl(round(r.quantidade * r.valor_unitario, 2)) || ')', p_em);
  end loop;
  update public.orcamento_itens set status = 'Aprovado', alterado_em = now(), alterado_por_nome = public.meu_nome()
  where atendimento_id = p_at and status = 'Proposto' and id = any(coalesce(p_aprovados,'{}'));
  select coalesce(sum(round(quantidade * valor_unitario, 2)), 0) into total from public.orcamento_itens where atendimento_id = p_at and status = 'Aprovado';
  if total <= 0 then raise exception 'Marque pelo menos um item aprovado com valor.'; end if;
  perform public._sync_itens(p_at, 'Itens aprovados pela locadora');
  perform public.aprovar_orcamento(p_at, total, p_em, p_protocolo);
end $$;

revoke execute on function public._sync_itens(uuid,text) from public, anon, authenticated;
