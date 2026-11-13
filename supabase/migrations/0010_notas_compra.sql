-- Fila independente das notas de venda. O conector fiscal deve entregar XML já validado.
create schema if not exists compras_privado;
revoke all on schema compras_privado from public, anon, authenticated;

create table if not exists public.notas_compra (
  chave text primary key check (chave ~ '^[0-9]{44}$'),
  numero text not null,
  serie text not null,
  emissao timestamptz not null,
  fornecedor text not null check (length(trim(fornecedor)) > 0),
  valor numeric(15,2) not null check (valor >= 0),
  xml_original text not null check (octet_length(xml_original) between 1 and 10485760),
  expira_em timestamptz not null,
  recebido_em timestamptz not null default now()
);
create index if not exists notas_compra_expira_ix on public.notas_compra (expira_em);
alter table public.notas_compra enable row level security;
revoke all on public.notas_compra from public, anon, authenticated, service_role;

-- A chave impede que uma nota excluída seja recuperada novamente da fonte fiscal.
create table if not exists compras_privado.notas_excluidas (
  chave text primary key check (chave ~ '^[0-9]{44}$'),
  motivo text not null check (motivo in ('entrada_tga', 'prazo')),
  excluida_em timestamptz not null default now()
);
alter table compras_privado.notas_excluidas enable row level security;
revoke all on compras_privado.notas_excluidas from public, anon, authenticated, service_role;

create or replace function public._limpar_notas_compra()
returns bigint language plpgsql security definer set search_path = public as $$
declare quantidade bigint;
begin
  -- Serializa recepção, exclusão e confirmação para impedir a recriação concorrente.
  perform pg_advisory_xact_lock(773422, 1);
  with removidas as (
    delete from public.notas_compra where expira_em <= now() returning chave
  )
  insert into compras_privado.notas_excluidas (chave, motivo)
  select chave, 'prazo' from removidas on conflict (chave) do nothing;
  get diagnostics quantidade = row_count;
  return quantidade;
end $$;
revoke all on function public._limpar_notas_compra() from public, anon, authenticated, service_role;

-- Somente o servidor autorizado pode receber notas ou confirmar entradas do TGA.
create or replace function public.receber_nota_compra(
  p_chave text, p_numero text, p_serie text, p_emissao timestamptz,
  p_fornecedor text, p_valor numeric, p_xml text
)
returns text language plpgsql security definer set search_path = public as $$
declare limite timestamptz;
begin
  if p_chave is null or p_chave !~ '^[0-9]{44}$' then raise exception 'Chave de acesso inválida.'; end if;
  if p_emissao is null or not isfinite(p_emissao) or p_emissao > now() + interval '5 minutes' then
    raise exception 'Data de emissão inválida.';
  end if;
  if p_numero is null or trim(p_numero) = '' or p_serie is null or trim(p_serie) = ''
    or p_fornecedor is null or trim(p_fornecedor) = '' or p_valor is null or p_valor < 0
    or p_valor = 'NaN'::numeric or p_valor = 'Infinity'::numeric
    or p_valor <> round(p_valor, 2)
    or p_xml is null or octet_length(p_xml) not between 1 and 10485760 then
    raise exception 'Dados da nota incompletos ou inválidos.';
  end if;
  perform pg_advisory_xact_lock(773422, 1);
  if exists (select 1 from compras_privado.notas_excluidas where chave = p_chave) then return 'excluida'; end if;
  if exists (select 1 from public.notas_compra where chave = p_chave) then return 'existente'; end if;
  limite := ((p_emissao at time zone 'America/Cuiaba') + interval '1 year') at time zone 'America/Cuiaba';
  if limite <= now() then
    insert into compras_privado.notas_excluidas (chave, motivo) values (p_chave, 'prazo');
    return 'excluida';
  end if;
  insert into public.notas_compra (chave, numero, serie, emissao, fornecedor, valor, xml_original, expira_em)
  values (p_chave, trim(p_numero), trim(p_serie), p_emissao, trim(p_fornecedor), p_valor, p_xml, limite);
  return 'recebida';
end $$;
revoke all on function public.receber_nota_compra(text,text,text,timestamptz,text,numeric,text) from public, anon, authenticated;
grant execute on function public.receber_nota_compra(text,text,text,timestamptz,text,numeric,text) to service_role;

create or replace function public.confirmar_entrada_compra_tga(p_chave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_chave is null or p_chave !~ '^[0-9]{44}$' then raise exception 'Chave de acesso inválida.'; end if;
  perform pg_advisory_xact_lock(773422, 1);
  insert into compras_privado.notas_excluidas (chave, motivo)
  values (p_chave, 'entrada_tga') on conflict (chave) do nothing;
  delete from public.notas_compra where chave = p_chave;
end $$;
revoke all on function public.confirmar_entrada_compra_tga(text) from public, anon, authenticated;
grant execute on function public.confirmar_entrada_compra_tga(text) to service_role;

create or replace function public.listar_notas_compra()
returns table (chave text, numero text, serie text, emissao timestamptz, fornecedor text, valor text)
language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  return query select n.chave, n.numero, n.serie, n.emissao, n.fornecedor, n.valor::text
    from public.notas_compra n where n.expira_em > now() order by n.emissao desc, n.chave;
end $$;
revoke all on function public.listar_notas_compra() from public, anon;
grant execute on function public.listar_notas_compra() to authenticated;
