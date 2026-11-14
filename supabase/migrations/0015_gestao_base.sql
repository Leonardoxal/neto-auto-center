-- NETO AUTO CENTER — Migração 0015: base da gestão financeira (etapa 1).
-- 1. Documento (CNPJ/CPF) do cliente da nota -> locadora.
-- 2. Vencimento original da parcela (prazo combinado x real), valor bruto e vínculo com o documento do TGA na nota.
-- 3. Trilha de alterações financeiras (quem, quando, antes e depois), para qualquer nota, com ou sem atendimento.
-- 4. Baixas e duplicatas em aberto vindas dos relatórios do TGA (importadas por PDF), com conciliação com as notas.
-- Só acrescenta; não apaga dados. Valores em `numeric`. Leitura: Administrador e Gerência (política `financeiro`).
-- Escrita só pelas funções `security definer` abaixo, que chamam `exige`.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

-- ===================================================================
-- 1. Documento do cliente -> locadora
-- ===================================================================
create or replace function public._so_digitos(p text) returns text
language sql immutable set search_path = public as $$ select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') $$;

create table if not exists public.locadora_documentos (
  documento text primary key check (documento ~ '^([0-9]{11}|[0-9]{14})$'), -- só dígitos: CPF (11) ou CNPJ (14); várias filiais por locadora
  locadora_id uuid not null references public.locadoras(id),
  obs text not null default '',
  criado_em timestamptz not null default now(),
  criado_por_nome text not null default ''
);
create index if not exists locadora_documentos_loc_ix on public.locadora_documentos (locadora_id);

-- ===================================================================
-- 2. Colunas novas
-- ===================================================================
alter table public.nota_parcelas add column if not exists vencimento_original date;
update public.nota_parcelas set vencimento_original = vencimento where vencimento_original is null;

create or replace function public._parcela_vencimento_original() returns trigger
language plpgsql set search_path = public as $$
begin
  new.vencimento_original := coalesce(new.vencimento_original, new.vencimento);
  return new;
end $$;
drop trigger if exists parcela_vencimento_original on public.nota_parcelas;
create trigger parcela_vencimento_original before insert on public.nota_parcelas
  for each row execute function public._parcela_vencimento_original();
alter table public.nota_parcelas alter column vencimento_original set not null;

-- valor bruto (antes de retenções); nulo = não informado
alter table public.notas add column if not exists valor_bruto numeric(12,2) check (valor_bruto is null or valor_bruto >= 0);
-- documento e emissão do lançamento no TGA, quando o número do TGA não é o número da nota; preenchido ao vincular uma baixa à mão
alter table public.notas add column if not exists tga_documento text not null default '';
alter table public.notas add column if not exists tga_emissao date;
create index if not exists notas_tga_doc_ix on public.notas (tga_documento) where tga_documento <> '';

-- baixas com juros, multa e desconto; origem da baixa
alter table public.nota_recebimentos add column if not exists origem text not null default 'manual';
alter table public.nota_recebimentos add column if not exists juros numeric(12,2) not null default 0 check (juros >= 0);
alter table public.nota_recebimentos add column if not exists multa numeric(12,2) not null default 0 check (multa >= 0);
alter table public.nota_recebimentos add column if not exists desconto numeric(12,2) not null default 0 check (desconto >= 0);
do $$ begin
  alter table public.nota_recebimentos add constraint nota_recebimentos_origem_ck check (origem in ('manual', 'tga'));
exception when duplicate_object then null; end $$;

-- ===================================================================
-- 3. Trilha de alterações financeiras (só acrescenta)
-- ===================================================================
create table if not exists public.gestao_alteracoes (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  usuario uuid,
  usuario_nome text not null default '',
  tabela text not null,
  registro_id text not null,
  nota_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  motivo text not null default ''
);
create index if not exists gestao_alteracoes_nota_ix on public.gestao_alteracoes (nota_id);
create index if not exists gestao_alteracoes_em_ix on public.gestao_alteracoes (em);

create or replace function public._trilha(p_tabela text, p_registro text, p_nota uuid, p_acao text, p_antes jsonb, p_depois jsonb, p_motivo text default '')
returns void language sql security definer set search_path = public as $$
  insert into public.gestao_alteracoes (usuario, usuario_nome, tabela, registro_id, nota_id, acao, antes, depois, motivo)
  values (auth.uid(), public.meu_nome(), p_tabela, p_registro, p_nota, p_acao, p_antes, p_depois, coalesce(p_motivo, ''))
$$;

create or replace function public._trilha_imutavel() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'A trilha de alterações não pode ser alterada nem apagada.'; end $$;
drop trigger if exists trilha_imutavel on public.gestao_alteracoes;
create trigger trilha_imutavel before update or delete on public.gestao_alteracoes
  for each row execute function public._trilha_imutavel();

create or replace function public._trilha_recebimento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._trilha('nota_recebimentos', new.id::text, new.nota_id, 'recebimento', null, to_jsonb(new));
  elsif old.estornado_em is null and new.estornado_em is not null then
    perform public._trilha('nota_recebimentos', new.id::text, new.nota_id, 'estorno', to_jsonb(old), to_jsonb(new), new.motivo_estorno);
  end if;
  return null;
end $$;
drop trigger if exists trilha_recebimento on public.nota_recebimentos;
create trigger trilha_recebimento after insert or update on public.nota_recebimentos
  for each row execute function public._trilha_recebimento();

create or replace function public._trilha_parcela() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.vencimento, old.valor, old.forma) is distinct from (new.vencimento, new.valor, new.forma) then
    perform public._trilha('nota_parcelas', new.id::text, new.nota_id, 'ajuste_parcela', to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end $$;
drop trigger if exists trilha_parcela on public.nota_parcelas;
create trigger trilha_parcela after update on public.nota_parcelas
  for each row execute function public._trilha_parcela();

-- ===================================================================
-- 4. Baixas e duplicatas em aberto do TGA
-- ===================================================================
create table if not exists public.tga_importacoes (
  id uuid primary key default gen_random_uuid(),
  relatorio text not null check (relatorio in ('baixados', 'em_aberto')),
  arquivo_hash text not null,              -- identifica o arquivo: o mesmo arquivo não entra duas vezes
  linhas int not null,
  rodape jsonb not null,                   -- totais do rodapé do PDF, em centavos
  novas int not null default 0,
  conciliadas int not null default 0,
  em timestamptz not null default now(),
  por_nome text not null default '',
  unique (relatorio, arquivo_hash)
);

-- Classificação do cliente do TGA: locadora (vale a nota fiscal) ou particular (vale o PV, mesmo que tenha nota).
create table if not exists public.tga_clientes (
  codigo text primary key,                 -- código do cliente no TGA, ex.: C02170 (sem nome nem telefone)
  tipo text not null check (tipo in ('locadora', 'particular')),
  locadora_id uuid references public.locadoras(id),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.tga_baixas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,              -- estável entre exportações: importar de novo não duplica
  importacao_id uuid not null references public.tga_importacoes(id),
  documento text not null,                 -- com sufixo de parcela, ex.: 0001231-2
  doc_numero text not null,
  parcela_numero int not null,
  emissao date not null,
  vencimento date not null,
  baixa date not null,
  tipo_doc text not null,                  -- DP duplicata, DV devolução
  portador text not null default '',
  cliente_codigo text not null default '',
  valor_original numeric(12,2) not null,   -- principal baixado nesta linha
  juros numeric(12,2) not null default 0,
  desconto numeric(12,2) not null default 0,
  multa numeric(12,2) not null default 0,
  valor_pago numeric(12,2) not null,
  dias_atraso int not null default 0,
  devolucao boolean not null default false,
  confere boolean not null default true,   -- false: original + juros + multa - desconto não dá o pago; só se aplica por vínculo manual
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'conciliada', 'sem_nota', 'ambigua', 'excede_saldo', 'devolucao', 'revisar', 'particular')),
  recebimento_id uuid references public.nota_recebimentos(id) on delete set null,
  conciliado_em timestamptz
);
create index if not exists tga_baixas_sit_ix on public.tga_baixas (situacao);
create index if not exists tga_baixas_doc_ix on public.tga_baixas (doc_numero);
create unique index if not exists tga_baixas_receb_uk on public.tga_baixas (recebimento_id) where recebimento_id is not null;

create table if not exists public.tga_em_aberto (
  id uuid primary key default gen_random_uuid(),
  importacao_id uuid not null references public.tga_importacoes(id),
  documento text not null,
  doc_numero text not null,
  parcela_numero int not null,
  emissao date not null,
  vencimento date not null,
  tipo_doc text not null,
  portador text not null default '',
  cliente_codigo text not null default '',
  valor_original numeric(12,2) not null,
  juros numeric(12,2) not null default 0,
  multa numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null,
  dias_atraso int not null default 0
);
create index if not exists tga_em_aberto_imp_ix on public.tga_em_aberto (importacao_id);

-- Leitura restrita a Administrador e Gerência; nenhuma escrita direta pelo app.
do $$
declare t text;
begin
  foreach t in array array['locadora_documentos', 'gestao_alteracoes', 'tga_importacoes', 'tga_clientes', 'tga_baixas', 'tga_em_aberto'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists financeiro on public.%I', t);
    execute format('create policy financeiro on public.%I for select to authenticated using (public.meu_perfil() in (''Administrador'',''Gerência''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end $$;

-- Parcelas candidatas para uma linha do TGA. Uma duplicata do TGA (PV) é a soma da nota de serviço e da nota de peça:
-- documento vinculado à mão (com a mesma emissão) devolve a parcela de cada nota do grupo (manual = true);
-- sem vínculo, vale o número da nota (NF-e ou RPS) com emissão até 45 dias de diferença (manual = false).
create or replace function public._tga_candidatas(p_doc text, p_parcela int, p_emissao date)
returns table (parcela_id uuid, nota_id uuid, valor numeric, manual boolean)
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, p.nota_id, p.valor, nt.tga_documento, nt.tga_emissao, nt.numero, nt.numero_rps, nt.emissao
    from public.nota_parcelas p join public.notas nt on nt.id = p.nota_id
    where p.numero = p_parcela and not nt.cancelada and ltrim(p_doc, '0') <> ''
  ), manual as (
    select * from base where tga_documento <> '' and ltrim(tga_documento, '0') = ltrim(p_doc, '0') and tga_emissao = p_emissao
  )
  select id, nota_id, valor, true from manual
  union all
  select id, nota_id, valor, false from base
  where not exists (select 1 from manual) and tga_documento = ''
    and (ltrim(numero, '0') = ltrim(p_doc, '0') or (numero_rps <> '' and ltrim(numero_rps, '0') = ltrim(p_doc, '0')))
    and abs((emissao at time zone 'America/Cuiaba')::date - p_emissao) <= 45
$$;

-- Aplica uma baixa do TGA às parcelas do grupo: cria um recebimento por parcela (principal repartido pelo saldo de cada uma).
-- Juros, multa e desconto ficam no primeiro recebimento. shortcut: a repartição proporcional ao saldo é uma estimativa quando a
-- locadora paga serviço e peça em dias diferentes; o recebimento pode ser estornado e refeito à mão. Devolve a situação resultante.
create or replace function public._aplicar_baixa_tga(p_baixa uuid, p_parcelas uuid[])
returns text language plpgsql security definer set search_path = public as $$
declare r public.tga_baixas; ids uuid[]; notas uuid[]; saldos numeric[]; partes numeric[] := '{}'; total numeric := 0; acc numeric := 0;
  n int; i int; v_rec uuid; primeiro uuid;
begin
  select * into r from public.tga_baixas where id = p_baixa for update;
  perform 1 from public.nota_parcelas where id = any(p_parcelas) for update;
  select array_agg(p.id order by p.id), array_agg(p.nota_id order by p.id),
         array_agg(p.valor - coalesce((select sum(x.valor) from public.nota_recebimentos x where x.parcela_id = p.id and x.estornado_em is null), 0) order by p.id)
    into ids, notas, saldos from public.nota_parcelas p where p.id = any(p_parcelas);
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return 'sem_nota'; end if;
  if r.valor_original <= 0 then return 'revisar'; end if;
  for i in 1..n loop total := total + saldos[i]; end loop;
  if r.valor_original > total + 0.009 then return 'excede_saldo'; end if;
  for i in 1..n loop
    partes[i] := case when i = n then r.valor_original - acc else round(r.valor_original * saldos[i] / total, 2) end;
    acc := acc + partes[i];
    if partes[i] < 0 or partes[i] > saldos[i] + 0.009 then return 'excede_saldo'; end if;
  end loop;
  for i in 1..n loop
    continue when partes[i] <= 0;
    insert into public.nota_recebimentos (nota_id, parcela_id, data, valor, forma, obs, usuario_nome, origem, juros, multa, desconto)
    values (notas[i], ids[i], r.baixa, partes[i], 'TGA', 'Importado do TGA, documento ' || r.documento, 'Importação TGA', 'tga',
            case when primeiro is null then r.juros else 0 end, case when primeiro is null then r.multa else 0 end, case when primeiro is null then r.desconto else 0 end)
    returning id into v_rec;
    primeiro := coalesce(primeiro, v_rec);
  end loop;
  update public.tga_baixas set recebimento_id = primeiro, situacao = 'conciliada', conciliado_em = now() where id = p_baixa;
  return 'conciliada';
end $$;

-- Concilia as baixas pendentes com as notas. Uma baixa já aplicada (mesmo estornada depois) não é aplicada de novo.
create or replace function public._conciliar_tga() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.tga_baixas; n int; manuais boolean; ids uuid[]; sit text; v_chave text;
  res jsonb := jsonb_build_object('conciliadas', 0, 'sem_nota', 0, 'ambiguas', 0, 'excede_saldo', 0, 'revisar', 0);
begin
  for r in select * from public.tga_baixas where situacao in ('pendente', 'sem_nota', 'ambigua', 'excede_saldo') order by baixa, emissao, id loop
    select count(*), coalesce(bool_or(manual), false), array_agg(parcela_id) into n, manuais, ids
      from public._tga_candidatas(r.doc_numero, r.parcela_numero, r.emissao);
    if n = 0 then sit := 'sem_nota';
    elsif n > 1 and not manuais then sit := 'ambigua';
    else sit := public._aplicar_baixa_tga(r.id, ids);
    end if;
    if sit <> 'conciliada' and sit <> r.situacao then update public.tga_baixas set situacao = sit where id = r.id; end if;
    v_chave := case sit when 'conciliada' then 'conciliadas' when 'ambigua' then 'ambiguas' else sit end;
    res := jsonb_set(res, array[v_chave], to_jsonb((res ->> v_chave)::int + 1));
  end loop;
  return res;
end $$;

-- Importa um relatório do TGA já lido e conferido no computador. O servidor confere de novo a soma contra o rodapé.
-- p_rodape: {"pago": centavos}; p_linhas: linhas do leitor (valores em centavos).
create or replace function public.importar_tga(p_relatorio text, p_hash text, p_rodape jsonb, p_linhas jsonb, p_clientes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_novas int := 0; soma bigint; conc jsonb := '{}'::jsonb;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  if p_relatorio not in ('baixados', 'em_aberto') then raise exception 'Relatório inválido.'; end if;
  if coalesce(trim(p_hash), '') = '' then raise exception 'Informe o identificador do arquivo.'; end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'Nenhuma linha para importar.'; end if;
  if (p_rodape ->> 'pago') is null then raise exception 'Informe o total do rodapé.'; end if;
  select coalesce(sum(case when coalesce((l ->> 'devolucao')::boolean, false) then -(l ->> 'pago')::bigint else (l ->> 'pago')::bigint end), 0)
    into soma from jsonb_array_elements(p_linhas) l;
  if soma <> (p_rodape ->> 'pago')::bigint then
    raise exception 'A soma das linhas (% centavos) não bate com o total do rodapé (% centavos). Nada foi importado.', soma, p_rodape ->> 'pago';
  end if;
  if exists (select 1 from public.tga_importacoes where relatorio = p_relatorio and arquivo_hash = p_hash) then
    return jsonb_build_object('ja_importado', true);
  end if;
  insert into public.tga_importacoes (relatorio, arquivo_hash, linhas, rodape, por_nome)
  values (p_relatorio, p_hash, jsonb_array_length(p_linhas), p_rodape, public.meu_nome()) returning id into v_id;

  -- Locadora x particular, classificado no computador de quem importa (o banco só recebe código e tipo, nunca o nome).
  insert into public.tga_clientes (codigo, tipo, locadora_id)
  select c.key, c.value ->> 'tipo', nullif(c.value ->> 'locadora_id', '')::uuid from jsonb_each(coalesce(p_clientes, '{}'::jsonb)) c
  on conflict (codigo) do update set tipo = excluded.tipo, locadora_id = excluded.locadora_id, atualizado_em = now();

  if p_relatorio = 'baixados' then
    with ins as (
      insert into public.tga_baixas (chave, importacao_id, documento, doc_numero, parcela_numero, emissao, vencimento, baixa, tipo_doc, portador, cliente_codigo,
        valor_original, juros, desconto, multa, valor_pago, dias_atraso, devolucao, confere, situacao)
      select l.chave, v_id, l.documento, l.doc_numero, l.parcela, l.emissao, l.vencimento, l.baixa, l.tipo_doc, coalesce(l.portador, ''), coalesce(l.cliente_codigo, ''),
        l.original / 100.0, l.juros / 100.0, l.desconto / 100.0, l.multa / 100.0, l.pago / 100.0, coalesce(l.dias_atraso, 0),
        coalesce(l.devolucao, false), coalesce(l.confere, true),
        case when coalesce(l.devolucao, false) then 'devolucao' when not coalesce(l.confere, true) then 'revisar'
             when exists (select 1 from public.tga_clientes k where k.codigo = l.cliente_codigo and k.tipo = 'particular') then 'particular' else 'pendente' end
      from jsonb_to_recordset(p_linhas) as l(chave text, documento text, doc_numero text, parcela int, emissao date, vencimento date, baixa date,
        tipo_doc text, portador text, cliente_codigo text, original bigint, juros bigint, desconto bigint, multa bigint, pago bigint, dias_atraso int, devolucao boolean, confere boolean)
      on conflict (chave) do nothing returning 1
    ) select count(*) into v_novas from ins;
    -- cliente que passou a ser locadora volta para a fila de ligação com as notas
    update public.tga_baixas set situacao = 'pendente' where situacao = 'particular'
      and cliente_codigo in (select codigo from public.tga_clientes where tipo = 'locadora');
    conc := public._conciliar_tga();
  else
    insert into public.tga_em_aberto (importacao_id, documento, doc_numero, parcela_numero, emissao, vencimento, tipo_doc, portador, cliente_codigo,
      valor_original, juros, multa, valor_total, dias_atraso)
    select v_id, l.documento, l.doc_numero, l.parcela, l.emissao, l.vencimento, l.tipo_doc, coalesce(l.portador, ''), coalesce(l.cliente_codigo, ''),
      l.original / 100.0, l.juros / 100.0, l.multa / 100.0, l.pago / 100.0, coalesce(l.dias_atraso, 0)
    from jsonb_to_recordset(p_linhas) as l(documento text, doc_numero text, parcela int, emissao date, vencimento date, tipo_doc text, portador text, cliente_codigo text,
      original bigint, juros bigint, multa bigint, pago bigint, dias_atraso int);
    get diagnostics v_novas = row_count;
  end if;
  update public.tga_importacoes set novas = v_novas, conciliadas = coalesce((conc ->> 'conciliadas')::int, 0) where id = v_id;
  perform public._trilha('tga_importacoes', v_id::text, null, 'importacao_tga', null,
    jsonb_build_object('relatorio', p_relatorio, 'linhas', jsonb_array_length(p_linhas), 'novas', v_novas) || conc);
  return jsonb_build_object('ja_importado', false, 'importacao', v_id, 'linhas', jsonb_array_length(p_linhas), 'novas', v_novas, 'conciliacao', conc);
end $$;

-- Concilia de novo (por exemplo, depois de importar notas novas)
create or replace function public.conciliar_tga() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador', 'Gerência']);
  return public._conciliar_tga();
end $$;

-- Sugere as notas de um PV do TGA: mesmo cliente, emissão até 10 dias de diferença e soma das parcelas igual ao valor baixado.
-- Uma nota (venda só de serviço ou só de peça) ou duas (serviço mais peça). Quem decide é a pessoa; a função só sugere.
create or replace function public.sugerir_pv_tga(p_documento text)
returns table (emissao_tga date, valor_tga numeric, nota_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador', 'Gerência']);
  return query
  with alvo as (
    select b.emissao as em, b.parcela_numero as parc, sum(b.valor_original) as v
    from public.tga_baixas b where b.documento = p_documento and not b.devolucao and b.situacao <> 'conciliada' group by 1, 2
  ), ps as (
    select p.nota_id, p.valor, p.numero, n.cliente_doc, (n.emissao at time zone 'America/Cuiaba')::date as dia
    from public.nota_parcelas p join public.notas n on n.id = p.nota_id
    where not n.cancelada and n.tga_documento = '' and n.cliente_doc <> ''
  )
  select a.em, a.v, array[s.nota_id] from alvo a
    join ps s on s.numero = a.parc and abs(s.dia - a.em) <= 10 and s.valor = a.v
  union all
  select a.em, a.v, array[s1.nota_id, s2.nota_id] from alvo a
    join ps s1 on s1.numero = a.parc and abs(s1.dia - a.em) <= 10
    join ps s2 on s2.numero = a.parc and abs(s2.dia - a.em) <= 10 and s2.cliente_doc = s1.cliente_doc and s2.nota_id > s1.nota_id
  where s1.valor + s2.valor = a.v;
end $$;

-- Liga um PV do TGA (documento sem o sufixo de parcela + emissão) a uma ou mais notas do site e aplica as baixas pendentes.
-- Guarda o PV nas notas: as próximas baixas desse PV entram sozinhas, repartidas entre as notas.
create or replace function public.vincular_pv_tga(p_doc_numero text, p_emissao date, p_notas uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  if ltrim(coalesce(p_doc_numero, ''), '0') = '' or p_emissao is null then raise exception 'Informe o documento e a emissão do TGA.'; end if;
  if coalesce(array_length(p_notas, 1), 0) not between 1 and 4 then raise exception 'Informe de 1 a 4 notas.'; end if;
  select count(*) into n from public.notas where id = any(p_notas) and not cancelada
    and (tga_documento = '' or (ltrim(tga_documento, '0') = ltrim(p_doc_numero, '0') and tga_emissao = p_emissao));
  if n <> array_length(p_notas, 1) then raise exception 'Alguma nota não existe, está cancelada ou já está ligada a outro PV.'; end if;
  update public.notas set tga_documento = p_doc_numero, tga_emissao = p_emissao where id = any(p_notas);
  perform public._trilha('notas', p_doc_numero, null, 'vinculo_pv_tga', null, jsonb_build_object('documento', p_doc_numero, 'emissao', p_emissao, 'notas', p_notas));
  return public._conciliar_tga();
end $$;

-- Desfaz o vínculo (os recebimentos já criados continuam; estorne-os à parte se estiverem errados).
create or replace function public.desvincular_pv_tga(p_doc_numero text, p_emissao date)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador', 'Gerência']);
  update public.notas set tga_documento = '', tga_emissao = null where ltrim(tga_documento, '0') = ltrim(p_doc_numero, '0') and tga_emissao = p_emissao;
  perform public._trilha('notas', p_doc_numero, null, 'desvinculo_pv_tga', jsonb_build_object('documento', p_doc_numero, 'emissao', p_emissao), null);
end $$;

-- ===================================================================
-- 5. Funções de escrita da base
-- ===================================================================
create or replace function public.vincular_documento_locadora(p_documento text, p_locadora uuid, p_obs text default '')
returns void language plpgsql security definer set search_path = public as $$
declare d text := public._so_digitos(p_documento); antes jsonb;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  if length(d) not in (11, 14) then raise exception 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'; end if;
  if not exists (select 1 from public.locadoras where id = p_locadora) then raise exception 'Locadora não encontrada.'; end if;
  select to_jsonb(x) into antes from public.locadora_documentos x where documento = d;
  insert into public.locadora_documentos (documento, locadora_id, obs, criado_por_nome)
  values (d, p_locadora, coalesce(p_obs, ''), public.meu_nome())
  on conflict (documento) do update set locadora_id = excluded.locadora_id, obs = excluded.obs;
  perform public._trilha('locadora_documentos', d, null, case when antes is null then 'vincular_documento' else 'mudar_documento' end,
    antes, jsonb_build_object('documento', d, 'locadora_id', p_locadora));
end $$;

create or replace function public.desvincular_documento_locadora(p_documento text)
returns void language plpgsql security definer set search_path = public as $$
declare d text := public._so_digitos(p_documento); antes jsonb;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  select to_jsonb(x) into antes from public.locadora_documentos x where documento = d;
  if antes is null then return; end if;
  delete from public.locadora_documentos where documento = d;
  perform public._trilha('locadora_documentos', d, null, 'desvincular_documento', antes, null);
end $$;

create or replace function public.definir_valor_bruto(p_nota uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
declare antes numeric;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  if p_valor is not null and p_valor < 0 then raise exception 'O valor bruto não pode ser negativo.'; end if;
  select valor_bruto into antes from public.notas where id = p_nota for update;
  if not found then raise exception 'Nota não encontrada.'; end if;
  update public.notas set valor_bruto = p_valor where id = p_nota;
  perform public._trilha('notas', p_nota::text, p_nota, 'valor_bruto', to_jsonb(antes), to_jsonb(p_valor));
end $$;

-- Igual à da 0006, mas preserva o vencimento original (por número de parcela) e registra a alteração na trilha.
create or replace function public.salvar_parcelas(p_nota uuid, p_parcelas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare x public.notas; p jsonb; soma numeric := 0; k int := 0; antes jsonb;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  select * into x from public.notas where id = p_nota for update;
  if not found then raise exception 'Nota não encontrada.'; end if;
  if exists (select 1 from public.nota_recebimentos where nota_id = p_nota and estornado_em is null) then
    raise exception 'Esta nota já tem recebimento. Estorne o recebimento antes de refazer as parcelas.';
  end if;
  for p in select * from jsonb_array_elements(p_parcelas) loop soma := soma + (p ->> 'valor')::numeric; end loop;
  if abs(soma - x.valor) > 0.01 then raise exception 'As parcelas somam % e a nota vale %.', public._brl(soma), public._brl(x.valor); end if;
  select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'vencimento', vencimento, 'vencimento_original', vencimento_original,
    'valor', valor, 'forma', forma) order by numero), '[]'::jsonb) into antes from public.nota_parcelas where nota_id = p_nota;
  delete from public.nota_parcelas where nota_id = p_nota;
  for p in select * from jsonb_array_elements(p_parcelas) loop
    k := k + 1;
    insert into public.nota_parcelas (nota_id, numero, vencimento, vencimento_original, valor, forma)
    values (p_nota, k, (p ->> 'vencimento')::date,
      coalesce((select (e ->> 'vencimento_original')::date from jsonb_array_elements(antes) e where (e ->> 'numero')::int = k), (p ->> 'vencimento')::date),
      (p ->> 'valor')::numeric, coalesce(nullif(p ->> 'forma', ''), 'A definir'));
  end loop;
  perform public._trilha('nota_parcelas', p_nota::text, p_nota, 'parcelas_refeitas', antes, p_parcelas);
end $$;

-- Funções chamadas pelo app: só para usuário logado (funções novas nascem abertas para anon; a 0007 só cobriu as que existiam).
revoke execute on function public.importar_tga(text, text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.conciliar_tga() from public, anon;
revoke execute on function public.sugerir_pv_tga(text) from public, anon;
revoke execute on function public.vincular_pv_tga(text, date, uuid[]) from public, anon;
revoke execute on function public.desvincular_pv_tga(text, date) from public, anon;
revoke execute on function public.vincular_documento_locadora(text, uuid, text) from public, anon;
revoke execute on function public.desvincular_documento_locadora(text) from public, anon;
revoke execute on function public.definir_valor_bruto(uuid, numeric) from public, anon;
revoke execute on function public.salvar_parcelas(uuid, jsonb) from public, anon;

-- Funções internas: fechadas para o app (a 0007 só cobre as que existiam na época).
revoke execute on function public._trilha(text, text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public._trilha_recebimento() from public, anon, authenticated;
revoke execute on function public._trilha_parcela() from public, anon, authenticated;
revoke execute on function public._trilha_imutavel() from public, anon, authenticated;
revoke execute on function public._parcela_vencimento_original() from public, anon, authenticated;
revoke execute on function public._tga_candidatas(text, int, date) from public, anon, authenticated;
revoke execute on function public._aplicar_baixa_tga(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public._conciliar_tga() from public, anon, authenticated;
revoke execute on function public._so_digitos(text) from public, anon, authenticated;
