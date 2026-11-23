-- Estado do conector fiscal das notas de compra (busca na SEFAZ). Aditiva: não altera 0010 nem 0011.
-- Fica no banco, e não em arquivo local, para que trocar de computador não reinicie a busca do NSU.
-- Cada ambiente (homologação e produção) tem a própria sequência de NSU.
create schema if not exists compras_privado;

create table if not exists compras_privado.conector_fiscal (
  ambiente text primary key check (ambiente in ('homologacao', 'producao')),
  ult_nsu text not null default '000000000000000' check (ult_nsu ~ '^[0-9]{15}$'),
  ultima_consulta timestamptz,
  proxima_consulta timestamptz,          -- a SEFAZ só permite nova consulta depois deste horário
  ultimo_resultado text check (length(ultimo_resultado) <= 200),
  ultimo_erro text check (length(ultimo_erro) <= 300), -- texto curto, sem dado sensível
  certificado_validade timestamptz,
  ultimo_sinal timestamptz,              -- sinal de vida do conector
  busca_pedida_em timestamptz,           -- pedido feito pelo botão "Buscar agora" (etapa do painel)
  cartas_correcao bigint not null default 0 check (cartas_correcao >= 0)
);
alter table compras_privado.conector_fiscal enable row level security;
revoke all on compras_privado.conector_fiscal from public, anon, authenticated, service_role;

create or replace function public.conector_compras_estado(p_ambiente text)
returns table (ult_nsu text, proxima_consulta timestamptz, busca_pedida_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_ambiente not in ('homologacao', 'producao') then raise exception 'Ambiente inválido.'; end if;
  insert into compras_privado.conector_fiscal (ambiente) values (p_ambiente) on conflict (ambiente) do nothing;
  return query select c.ult_nsu, c.proxima_consulta, c.busca_pedida_em
    from compras_privado.conector_fiscal c where c.ambiente = p_ambiente;
end $$;
revoke all on function public.conector_compras_estado(text) from public, anon, authenticated;
grant execute on function public.conector_compras_estado(text) to service_role;

-- Campos nulos mantêm o valor atual. Em p_erro, texto vazio ('') limpa o último erro.
-- Chamar com todos nulos serve de sinal de vida. Uma consulta feita atende e limpa o pedido de busca.
create or replace function public.conector_compras_gravar(
  p_ambiente text, p_ult_nsu text, p_consulta timestamptz, p_proxima timestamptz,
  p_resultado text, p_erro text, p_validade timestamptz, p_cartas bigint default 0
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_ambiente not in ('homologacao', 'producao') then raise exception 'Ambiente inválido.'; end if;
  if p_ult_nsu is not null and p_ult_nsu !~ '^[0-9]{15}$' then raise exception 'NSU inválido.'; end if;
  if p_cartas is null or p_cartas < 0 then raise exception 'Contagem inválida.'; end if;
  insert into compras_privado.conector_fiscal (ambiente) values (p_ambiente) on conflict (ambiente) do nothing;
  update compras_privado.conector_fiscal c set
    ult_nsu = coalesce(p_ult_nsu, c.ult_nsu),
    ultima_consulta = coalesce(p_consulta, c.ultima_consulta),
    proxima_consulta = coalesce(p_proxima, c.proxima_consulta),
    ultimo_resultado = coalesce(left(p_resultado, 200), c.ultimo_resultado),
    ultimo_erro = case when p_erro is null then c.ultimo_erro when p_erro = '' then null else left(p_erro, 300) end,
    certificado_validade = coalesce(p_validade, c.certificado_validade),
    ultimo_sinal = now(),
    busca_pedida_em = case when p_consulta is not null then null else c.busca_pedida_em end,
    cartas_correcao = c.cartas_correcao + p_cartas
  where c.ambiente = p_ambiente;
end $$;
revoke all on function public.conector_compras_gravar(text,text,timestamptz,timestamptz,text,text,timestamptz,bigint) from public, anon, authenticated;
grant execute on function public.conector_compras_gravar(text,text,timestamptz,timestamptz,text,text,timestamptz,bigint) to service_role;
