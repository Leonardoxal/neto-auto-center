-- Teste da migração 0015 (gestão financeira, etapa 1). Só dados sintéticos.
-- Como usar, num banco de TESTE onde a 0001 a 0015 já foram aplicadas (rode a 0015 duas vezes para conferir que é idempotente):
--   psql "$BANCO_DE_TESTE" -f supabase/tests/0015_gestao_base.test.sql
-- O script termina SEMPRE com um erro proposital, o que desfaz tudo o que ele criou. Se a última mensagem começar com
-- "TESTES OK", todas as conferências passaram; qualquer outra mensagem é uma falha.
-- Precisa de pelo menos um usuário ativo com perfil Administrador (o teste age como ele).

do $teste$
declare
  adm uuid; v_nota uuid; p1 uuid; p2 uuid; v_loc uuid; v_rec uuid; v_rev uuid; n_servico uuid; n_peca uuid;
  r jsonb; n int; linhas jsonb; rel text := ''; msg text; hoje date := current_date; emis date := current_date - 3;
begin
  select id into adm from public.usuarios where perfil = 'Administrador' and ativo limit 1;
  if adm is null then raise exception 'FALHOU: não há Administrador ativo no banco de teste'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', adm::text, true);

  -- 1. vencimento original: nasce igual ao vencimento e sobrevive ao ajuste de parcelas
  v_nota := public.nota_manual('NF-e', '4999001', emis::timestamptz, 'CLIENTE SINTETICO', 1000, hoje + 30, 'Boleto');
  select id into p1 from public.nota_parcelas where nota_id = v_nota and numero = 1;
  if (select vencimento_original from public.nota_parcelas where id = p1) <> hoje + 30 then raise exception 'FALHOU: vencimento_original não nasceu igual ao vencimento'; end if;
  perform public.salvar_parcelas(v_nota, '[{"vencimento":"2030-01-10","valor":500},{"vencimento":"2030-02-10","valor":500}]'::jsonb);
  select id into p1 from public.nota_parcelas where nota_id = v_nota and numero = 1;
  select id into p2 from public.nota_parcelas where nota_id = v_nota and numero = 2;
  if (select vencimento_original from public.nota_parcelas where id = p1) <> hoje + 30 then raise exception 'FALHOU: salvar_parcelas perdeu o vencimento original da parcela 1'; end if;
  if (select vencimento from public.nota_parcelas where id = p1) <> date '2030-01-10' then raise exception 'FALHOU: vencimento da parcela 1 não mudou'; end if;
  if (select vencimento_original from public.nota_parcelas where id = p2) <> date '2030-02-10' then raise exception 'FALHOU: parcela nova deveria ter original = vencimento'; end if;
  rel := rel || 'vencimento_original; ';

  -- 2. trilha de alterações
  update public.nota_parcelas set vencimento = date '2030-01-20' where id = p1;
  if not exists (select 1 from public.gestao_alteracoes where nota_id = v_nota and acao = 'parcelas_refeitas') then raise exception 'FALHOU: sem trilha de parcelas_refeitas'; end if;
  if not exists (select 1 from public.gestao_alteracoes where nota_id = v_nota and acao = 'ajuste_parcela') then raise exception 'FALHOU: sem trilha de ajuste_parcela'; end if;
  begin update public.gestao_alteracoes set motivo = 'x'; raise exception 'FALHOU: a trilha aceitou alteração';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin delete from public.gestao_alteracoes; raise exception 'FALHOU: a trilha aceitou exclusão';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  rel := rel || 'trilha; ';

  -- 3. importar baixas do TGA: aplica, não duplica, estorno não reaplica
  linhas := jsonb_build_array(
    jsonb_build_object('chave', 'teste|1', 'documento', '4999001-1', 'doc_numero', '4999001', 'parcela', 1, 'emissao', emis, 'vencimento', hoje, 'baixa', hoje,
      'tipo_doc', 'DP', 'portador', '', 'original', 50000, 'juros', 100, 'desconto', 0, 'multa', 0, 'pago', 50100, 'dias_atraso', 0, 'devolucao', false, 'confere', true),
    jsonb_build_object('chave', 'teste|2', 'documento', '4999002-1', 'doc_numero', '4999002', 'parcela', 1, 'emissao', emis, 'vencimento', hoje, 'baixa', hoje,
      'tipo_doc', 'DP', 'portador', '04', 'original', 7000, 'juros', 0, 'desconto', 0, 'multa', 0, 'pago', 7000, 'dias_atraso', 0, 'devolucao', false, 'confere', true),
    jsonb_build_object('chave', 'teste|3', 'documento', '03012026-1', 'doc_numero', '03012026', 'parcela', 1, 'emissao', emis, 'vencimento', hoje, 'baixa', hoje,
      'tipo_doc', 'DV', 'portador', '', 'original', 3000, 'juros', 0, 'desconto', 0, 'multa', 0, 'pago', 3000, 'dias_atraso', 0, 'devolucao', true, 'confere', true),
    jsonb_build_object('chave', 'teste|4', 'documento', '4999001-2', 'doc_numero', '4999001', 'parcela', 2, 'emissao', emis, 'vencimento', hoje, 'baixa', hoje,
      'tipo_doc', 'DP', 'portador', '', 'original', 50000, 'juros', 0, 'desconto', 0, 'multa', 0, 'pago', 49000, 'dias_atraso', 0, 'devolucao', false, 'confere', false));
  -- soma = 50100 + 7000 - 3000 + 49000 (a devolução subtrai)
  r := public.importar_tga('baixados', 'hash-teste-1', '{"pago":103100}'::jsonb, linhas);
  if (r ->> 'novas')::int <> 4 then raise exception 'FALHOU: esperava 4 linhas novas, veio %', r; end if;
  if (r #>> '{conciliacao,conciliadas}')::int <> 1 or (r #>> '{conciliacao,sem_nota}')::int <> 1 then raise exception 'FALHOU: conciliação inesperada %', r; end if;
  select id into v_rec from public.nota_recebimentos where nota_id = v_nota and estornado_em is null;
  if (select valor from public.nota_recebimentos where id = v_rec) <> 500 or (select juros from public.nota_recebimentos where id = v_rec) <> 1
     or (select origem from public.nota_recebimentos where id = v_rec) <> 'tga' or (select data from public.nota_recebimentos where id = v_rec) <> hoje then
    raise exception 'FALHOU: recebimento do TGA gravado errado'; end if;
  if (select count(*) from public.tga_baixas where situacao = 'devolucao') <> 1 or (select count(*) from public.tga_baixas where situacao = 'revisar') <> 1 then
    raise exception 'FALHOU: devolução e linha que não confere deveriam ficar fora da aplicação automática'; end if;
  rel := rel || 'importar; ';

  if (public.importar_tga('baixados', 'hash-teste-1', '{"pago":103100}'::jsonb, linhas) ->> 'ja_importado')::boolean is not true then raise exception 'FALHOU: o mesmo arquivo entrou de novo'; end if;
  r := public.importar_tga('baixados', 'hash-teste-2', '{"pago":103100}'::jsonb, linhas);
  if (r ->> 'novas')::int <> 0 then raise exception 'FALHOU: importar de novo duplicou linhas: %', r; end if;
  if (select count(*) from public.nota_recebimentos where nota_id = v_nota) <> 1 then raise exception 'FALHOU: importar de novo duplicou recebimento'; end if;
  rel := rel || 'sem_duplicar; ';

  begin
    perform public.importar_tga('baixados', 'hash-teste-3', '{"pago":103101}'::jsonb, linhas);
    raise exception 'FALHOU: aceitou soma diferente do rodapé';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; msg := sqlerrm; end;
  if msg not like '%não bate com o total do rodapé%' then raise exception 'FALHOU: mensagem de divergência inesperada: %', msg; end if;
  rel := rel || 'divergencia; ';

  perform public.estornar_recebimento(v_rec, 'teste');
  if not exists (select 1 from public.gestao_alteracoes where nota_id = v_nota and acao = 'estorno') then raise exception 'FALHOU: estorno sem trilha'; end if;
  perform public.importar_tga('baixados', 'hash-teste-4', '{"pago":103100}'::jsonb, linhas);
  perform public.conciliar_tga();
  if exists (select 1 from public.nota_recebimentos where nota_id = v_nota and estornado_em is null) then raise exception 'FALHOU: baixa estornada foi aplicada de novo'; end if;
  if (select count(*) from public.nota_recebimentos where nota_id = v_nota) <> 1 then raise exception 'FALHOU: estorno apagou ou duplicou o recebimento'; end if;
  rel := rel || 'estorno; ';

  -- 4. vínculo manual: linha sem nota entra na parcela 2 e a nota passa a casar sozinha; linha que não confere excede o saldo
  -- PV do TGA = nota de serviço (40) + nota de peça (30) do mesmo cliente; a baixa de 70 é repartida entre as duas
  -- cliente particular: vale o PV, a baixa não entra na fila de ligação com notas; se virar locadora, entra na fila
  select id into v_loc from public.locadoras limit 1;
  if v_loc is null then insert into public.locadoras (nome) values ('LOCADORA SINTETICA TESTE') returning id into v_loc; end if;
  linhas := jsonb_build_array(jsonb_build_object('chave', 'teste|5', 'documento', '4999777-1', 'doc_numero', '4999777', 'parcela', 1, 'emissao', emis, 'vencimento', hoje,
    'baixa', hoje, 'tipo_doc', 'DP', 'portador', '', 'cliente_codigo', 'C99999', 'original', 9000, 'juros', 0, 'desconto', 0, 'multa', 0, 'pago', 9000,
    'dias_atraso', 0, 'devolucao', false, 'confere', true));
  perform public.importar_tga('baixados', 'hash-part-1', '{"pago":9000}'::jsonb, linhas, '{"C99999":{"tipo":"particular","locadora_id":null}}'::jsonb);
  if (select situacao from public.tga_baixas where chave = 'teste|5') <> 'particular' then raise exception 'FALHOU: baixa de cliente particular deveria ficar como particular'; end if;
  if (select tipo from public.tga_clientes where codigo = 'C99999') <> 'particular' then raise exception 'FALHOU: cliente não foi classificado'; end if;
  perform public.importar_tga('baixados', 'hash-part-2', '{"pago":9000}'::jsonb, linhas, jsonb_build_object('C99999', jsonb_build_object('tipo', 'locadora', 'locadora_id', v_loc)));
  if (select situacao from public.tga_baixas where chave = 'teste|5') <> 'sem_nota' then raise exception 'FALHOU: cliente que virou locadora deveria ir para a fila de notas'; end if;
  rel := rel || 'particular; ';

  n_servico := public.nota_manual('NFS-e', '4999010', emis::timestamptz, 'CLIENTE SINTETICO', 40, hoje + 30, 'Boleto');
  n_peca := public.nota_manual('NF-e', '4999011', emis::timestamptz, 'CLIENTE SINTETICO', 30, hoje + 30, 'Boleto');
  update public.notas set cliente_doc = '12345678000195' where id in (n_servico, n_peca);
  select count(*) into n from public.sugerir_pv_tga('4999002-1') where array_length(nota_ids, 1) = 2 and nota_ids @> array[n_servico, n_peca];
  if n <> 1 then raise exception 'FALHOU: esperava 1 sugestão de serviço + peça, veio %', n; end if;
  r := public.vincular_pv_tga('4999002', emis, array[n_servico, n_peca]);
  if (r ->> 'conciliadas')::int < 1 then raise exception 'FALHOU: vínculo do PV não aplicou a baixa: %', r; end if;
  if (select valor from public.nota_recebimentos where nota_id = n_servico and estornado_em is null) <> 40
     or (select valor from public.nota_recebimentos where nota_id = n_peca and estornado_em is null) <> 30 then
    raise exception 'FALHOU: baixa do PV não foi repartida 40 e 30'; end if;
  if (select situacao from public.tga_baixas where chave = 'teste|2') <> 'conciliada' then raise exception 'FALHOU: baixa do PV não ficou conciliada'; end if;
  begin perform public.vincular_pv_tga('4999999', emis, array[n_servico]); raise exception 'FALHOU: ligou nota já ligada a outro PV';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  select id into v_rev from public.tga_baixas where chave = 'teste|4';
  if (select situacao from public.tga_baixas where id = v_rev) <> 'revisar' then raise exception 'FALHOU: linha que não confere foi aplicada'; end if;
  perform public.desvincular_pv_tga('4999002', emis);
  if (select tga_documento from public.notas where id = n_servico) <> '' then raise exception 'FALHOU: desvínculo não limpou a nota'; end if;
  rel := rel || 'vinculo_pv; ';

  -- 5. Em Aberto: guarda a lista, sem criar recebimento
  r := public.importar_tga('em_aberto', 'hash-ab-1', '{"pago":50500}'::jsonb, jsonb_build_array(jsonb_build_object(
    'documento', '4999003-1', 'doc_numero', '4999003', 'parcela', 1, 'emissao', emis, 'vencimento', hoje, 'tipo_doc', 'DP', 'portador', '',
    'original', 50000, 'juros', 500, 'multa', 0, 'pago', 50500, 'dias_atraso', 2)));
  if (select count(*) from public.tga_em_aberto) < 1 then raise exception 'FALHOU: Em Aberto não gravou'; end if;
  rel := rel || 'em_aberto; ';

  -- 6. valor bruto e documento da locadora
  perform public.definir_valor_bruto(v_nota, 1200);
  begin perform public.definir_valor_bruto(v_nota, -1); raise exception 'FALHOU: aceitou valor bruto negativo';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  select id into v_loc from public.locadoras limit 1;
  if v_loc is null then insert into public.locadoras (nome) values ('LOCADORA SINTETICA TESTE') returning id into v_loc; end if;
  perform public.vincular_documento_locadora('12.345.678/0001-95', v_loc, 'teste');
  if not exists (select 1 from public.locadora_documentos where documento = '12345678000195' and locadora_id = v_loc) then raise exception 'FALHOU: documento não vinculado'; end if;
  begin perform public.vincular_documento_locadora('123', v_loc); raise exception 'FALHOU: aceitou documento inválido';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  perform public.desvincular_documento_locadora('12345678000195');
  if exists (select 1 from public.locadora_documentos where documento = '12345678000195') then raise exception 'FALHOU: documento não foi desvinculado'; end if;
  rel := rel || 'locadora_e_bruto; ';

  -- 7. permissões: leitura só por política, nenhuma escrita direta, funções internas fechadas
  select count(*) into n from pg_policies where schemaname = 'public' and policyname = 'financeiro'
    and tablename in ('locadora_documentos', 'gestao_alteracoes', 'tga_importacoes', 'tga_clientes', 'tga_baixas', 'tga_em_aberto');
  if n <> 6 then raise exception 'FALHOU: política financeiro ausente (% de 6)', n; end if;
  if has_table_privilege('authenticated', 'public.tga_baixas', 'INSERT') or has_table_privilege('authenticated', 'public.gestao_alteracoes', 'UPDATE')
     or has_table_privilege('anon', 'public.tga_baixas', 'SELECT') then raise exception 'FALHOU: privilégio de tabela aberto demais'; end if;
  if has_function_privilege('authenticated', 'public._conciliar_tga()', 'EXECUTE') or has_function_privilege('anon', 'public.importar_tga(text,text,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'FALHOU: função aberta demais'; end if;
  rel := rel || 'permissoes; ';

  -- 8. idempotência das partes sensíveis da migração (a migração inteira deve ser rodada duas vezes à parte)
  alter table public.nota_parcelas add column if not exists vencimento_original date;
  update public.nota_parcelas set vencimento_original = vencimento where vencimento_original is null;
  rel := rel || 'idempotencia; ';

  raise exception 'TESTES OK: %', rel;
end
$teste$;
