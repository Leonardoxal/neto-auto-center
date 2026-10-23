-- NETO AUTO CENTER — Migração 0006: notas fiscais e controle de recebimentos (contas a receber).
-- O XML é lido no navegador só para preencher os dados; o arquivo NÃO é guardado.
-- Cada nota tem parcelas (vencimento, valor, forma prevista) e recebimentos (data, valor, forma), com baixa parcial.
-- Acesso: Administrador e Gerência.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  tipo text not null check (tipo in ('NF-e','NFS-e','Outro')),
  numero text not null,
  numero_rps text not null default '',
  serie text not null default '',
  emissao timestamptz not null,
  cliente text not null,
  cliente_doc text not null default '',
  valor numeric(12,2) not null check (valor >= 0),
  iss numeric(12,2) not null default 0,
  descricao text not null default '',
  placa text not null default '',
  os text not null default '',
  pedido text not null default '',
  modelo text not null default '',
  km text not null default '',
  cond_pagamento text not null default '',
  cancelada boolean not null default false,
  obs text not null default '',
  origem text not null default 'xml' check (origem in ('xml','manual')),
  atendimento_id uuid references public.atendimentos(id),
  importado_em timestamptz not null default now(),
  importado_por_nome text not null default ''
);
create index if not exists notas_emissao_ix2 on public.notas (emissao);
create index if not exists notas_placa_ix on public.notas (placa);
create index if not exists notas_cliente_ix on public.notas (cliente);

create table if not exists public.nota_parcelas (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id) on delete cascade,
  numero int not null,
  vencimento date not null,
  valor numeric(12,2) not null check (valor >= 0),
  forma text not null default 'A definir',
  unique (nota_id, numero)
);
create index if not exists parcelas_venc_ix on public.nota_parcelas (vencimento);

create table if not exists public.nota_recebimentos (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas(id) on delete cascade,
  parcela_id uuid not null references public.nota_parcelas(id) on delete cascade,
  data date not null,
  valor numeric(12,2) not null check (valor > 0),
  forma text not null,
  obs text not null default '',
  criado_em timestamptz not null default now(),
  usuario uuid references public.usuarios(id),
  usuario_nome text not null default '',
  estornado_em timestamptz,
  estornado_por_nome text not null default '',
  motivo_estorno text not null default ''
);
create index if not exists receb_nota_ix on public.nota_recebimentos (nota_id);
create index if not exists receb_data_ix on public.nota_recebimentos (data);

do $$
declare t text;
begin
  foreach t in array array['notas','nota_parcelas','nota_recebimentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists financeiro on public.%I', t);
    execute format('create policy financeiro on public.%I for select to authenticated using (public.meu_perfil() in (''Administrador'',''Gerência''))', t);
  end loop;
  begin alter publication supabase_realtime add table public.nota_recebimentos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notas; exception when others then null; end;
end $$;

-- Vincula a nota a um atendimento pela placa (entrada até a emissão; ainda no pátio ou saída até 30 dias antes)
-- e registra a nota no atendimento, para o faturamento do veículo ficar certo.
create or replace function public._vincular_nota(p_nota uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare x public.notas; v_at uuid; num text;
begin
  select * into x from public.notas where id = p_nota;
  if x.atendimento_id is not null or coalesce(x.placa,'') = '' or x.tipo = 'Outro' or x.cancelada then return x.atendimento_id; end if;
  select id into v_at from public.atendimentos
   where placa = x.placa and entrada <= x.emissao + interval '1 day' and (saida is null or saida >= x.emissao - interval '30 days')
   order by entrada desc limit 1;
  if v_at is null then return null; end if;
  update public.notas set atendimento_id = v_at where id = p_nota;
  num := coalesce(nullif(x.numero_rps,''), x.numero);
  if not exists (select 1 from public.notas_fiscais where atendimento_id = v_at and tipo = x.tipo and numero = num and not cancelada) then
    insert into public.notas_fiscais (atendimento_id, tipo, numero, serie, valor, emissao, obs, usuario)
    values (v_at, x.tipo, num, coalesce(nullif(x.serie,''),'1'), x.valor, x.emissao, 'Importada do XML', auth.uid());
    perform public._recalc_fiscal(v_at);
    perform public._evento(v_at, 'Nota fiscal', x.tipo || ' nº ' || num || ' importada do XML: ' || public._brl(x.valor) || ' · ' || x.cliente, x.emissao);
  end if;
  return v_at;
end $$;

-- Importação em lote. Notas já existentes (mesma chave) atualizam dados, sem mexer em parcelas com recebimento.
create or replace function public.importar_notas(p_notas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; p jsonb; v_id uuid; novas int := 0; atualizadas int := 0; vinculadas int := 0; existia boolean; v_at uuid;
begin
  perform public.exige(array['Administrador','Gerência']);
  for it in select * from jsonb_array_elements(p_notas) loop
    select true into existia from public.notas where chave = it->>'chave';
    insert into public.notas (chave, tipo, numero, numero_rps, serie, emissao, cliente, cliente_doc, valor, iss, descricao, placa, os, pedido, modelo, km, cond_pagamento, cancelada, origem, importado_por_nome)
    values (it->>'chave', it->>'tipo', it->>'numero', coalesce(it->>'numero_rps',''), coalesce(it->>'serie',''), (it->>'emissao')::timestamptz,
            it->>'cliente', coalesce(it->>'cliente_doc',''), (it->>'valor')::numeric, coalesce((it->>'iss')::numeric,0), coalesce(it->>'descricao',''),
            coalesce(it->>'placa',''), coalesce(it->>'os',''), coalesce(it->>'pedido',''), coalesce(it->>'modelo',''), coalesce(it->>'km',''),
            coalesce(it->>'cond_pagamento',''), coalesce((it->>'cancelada')::boolean,false), 'xml', public.meu_nome())
    on conflict (chave) do update set cancelada = excluded.cancelada, descricao = excluded.descricao, placa = excluded.placa, os = excluded.os,
      pedido = excluded.pedido, modelo = excluded.modelo, km = excluded.km
    returning id into v_id;
    if existia then atualizadas := atualizadas + 1;
    else
      novas := novas + 1;
      for p in select * from jsonb_array_elements(coalesce(it->'parcelas','[]'::jsonb)) loop
        insert into public.nota_parcelas (nota_id, numero, vencimento, valor, forma)
        values (v_id, (p->>'numero')::int, (p->>'vencimento')::date, (p->>'valor')::numeric, case when it->>'cond_pagamento' ilike '%vista%' then 'À vista' else 'A definir' end)
        on conflict (nota_id, numero) do nothing;
      end loop;
      if not exists (select 1 from public.nota_parcelas where nota_id = v_id) then
        insert into public.nota_parcelas (nota_id, numero, vencimento, valor) values (v_id, 1, ((it->>'emissao')::timestamptz at time zone 'America/Cuiaba')::date + 30, (it->>'valor')::numeric);
      end if;
    end if;
    existia := false;
    v_at := public._vincular_nota(v_id);
    if v_at is not null then vinculadas := vinculadas + 1; end if;
  end loop;
  return jsonb_build_object('novas', novas, 'atualizadas', atualizadas, 'vinculadas', vinculadas);
end $$;

create or replace function public.nota_manual(p_tipo text, p_numero text, p_emissao timestamptz, p_cliente text, p_valor numeric, p_vencimento date,
  p_forma text default 'A definir', p_placa text default '', p_obs text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_placa text := upper(regexp_replace(coalesce(p_placa,''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform public.exige(array['Administrador','Gerência']);
  if coalesce(trim(p_numero),'') = '' or coalesce(trim(p_cliente),'') = '' then raise exception 'Informe número e cliente.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  insert into public.notas (chave, tipo, numero, emissao, cliente, valor, placa, obs, origem, importado_por_nome)
  values ('MANUAL-' || p_tipo || '-' || trim(p_numero) || '-' || to_char(p_emissao, 'YYYYMMDD'), p_tipo, trim(p_numero), p_emissao, trim(p_cliente), p_valor, v_placa, coalesce(p_obs,''), 'manual', public.meu_nome())
  returning id into v_id;
  insert into public.nota_parcelas (nota_id, numero, vencimento, valor, forma) values (v_id, 1, coalesce(p_vencimento, (p_emissao at time zone 'America/Cuiaba')::date + 30), p_valor, coalesce(nullif(p_forma,''),'A definir'));
  perform public._vincular_nota(v_id);
  return v_id;
end $$;

-- Baixa (total ou parcial) de uma parcela
create or replace function public.registrar_recebimento(p_parcela uuid, p_data date, p_valor numeric, p_forma text, p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare pa public.nota_parcelas; saldo numeric; x public.notas;
begin
  perform public.exige(array['Administrador','Gerência']);
  select * into pa from public.nota_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  select * into x from public.notas where id = pa.nota_id;
  if x.cancelada then raise exception 'Nota cancelada não recebe pagamento.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor recebido.'; end if;
  if coalesce(trim(p_forma),'') = '' then raise exception 'Informe a forma de pagamento.'; end if;
  select pa.valor - coalesce(sum(valor),0) into saldo from public.nota_recebimentos where parcela_id = p_parcela and estornado_em is null;
  if p_valor > saldo + 0.009 then raise exception 'O valor recebido (%) é maior que o saldo da parcela (%).', public._brl(p_valor), public._brl(saldo); end if;
  insert into public.nota_recebimentos (nota_id, parcela_id, data, valor, forma, obs, usuario, usuario_nome)
  values (pa.nota_id, p_parcela, coalesce(p_data, (now() at time zone 'America/Cuiaba')::date), p_valor, trim(p_forma), coalesce(p_obs,''), auth.uid(), public.meu_nome());
  if x.atendimento_id is not null then
    perform public._evento(x.atendimento_id, 'Financeiro', 'Recebido ' || public._brl(p_valor) || ' (' || trim(p_forma) || ') da ' || x.tipo || ' nº ' || coalesce(nullif(x.numero_rps,''), x.numero));
  end if;
end $$;

create or replace function public.estornar_recebimento(p_receb uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  update public.nota_recebimentos set estornado_em = now(), estornado_por_nome = public.meu_nome(), motivo_estorno = coalesce(p_motivo,'')
  where id = p_receb and estornado_em is null;
end $$;

-- Ajuste de parcelas: vencimento, valor e forma prevista; dividir em mais parcelas
create or replace function public.salvar_parcelas(p_nota uuid, p_parcelas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x public.notas; p jsonb; soma numeric := 0; k int := 0;
begin
  perform public.exige(array['Administrador','Gerência']);
  select * into x from public.notas where id = p_nota for update;
  if not found then raise exception 'Nota não encontrada.'; end if;
  if exists (select 1 from public.nota_recebimentos where nota_id = p_nota and estornado_em is null) then
    raise exception 'Esta nota já tem recebimento. Estorne o recebimento antes de refazer as parcelas.';
  end if;
  for p in select * from jsonb_array_elements(p_parcelas) loop soma := soma + (p->>'valor')::numeric; end loop;
  if abs(soma - x.valor) > 0.01 then raise exception 'As parcelas somam % e a nota vale %.', public._brl(soma), public._brl(x.valor); end if;
  delete from public.nota_parcelas where nota_id = p_nota;
  for p in select * from jsonb_array_elements(p_parcelas) loop
    k := k + 1;
    insert into public.nota_parcelas (nota_id, numero, vencimento, valor, forma) values (p_nota, k, (p->>'vencimento')::date, (p->>'valor')::numeric, coalesce(nullif(p->>'forma',''),'A definir'));
  end loop;
end $$;

create or replace function public.editar_nota(p_nota uuid, p_obs text, p_placa text default null, p_cancelada boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador','Gerência']);
  update public.notas set obs = coalesce(p_obs, obs),
    placa = coalesce(upper(regexp_replace(p_placa, '[^A-Za-z0-9]', '', 'g')), placa),
    cancelada = coalesce(p_cancelada, cancelada) where id = p_nota;
  perform public._vincular_nota(p_nota);
end $$;

revoke execute on function public._vincular_nota(uuid) from public, anon, authenticated;
