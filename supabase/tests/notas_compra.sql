-- Executar somente em banco isolado após 0010, usando o proprietário das funções.
begin;
do $$
declare k text := repeat('1',44); k2 text := repeat('2',44); antigo text := repeat('3',44);
  limite timestamptz; retorno text;
begin
  retorno := public.receber_nota_compra(k,'1','1',now() - interval '1 day','Fornecedor de teste',10.01,'<teste/>');
  assert retorno = 'recebida', 'Deve receber nota recente.';
  assert public.receber_nota_compra(k,'1','1',now() - interval '1 day','Fornecedor de teste',10.01,'<teste/>') = 'existente', 'Reenvio não deve duplicar.';
  assert (select count(*) = 1 from public.notas_compra where chave = k);
  perform public.confirmar_entrada_compra_tga(k);
  assert not exists (select 1 from public.notas_compra where chave = k), 'Entrada deve excluir conteúdo e XML.';
  assert (select motivo = 'entrada_tga' from compras_privado.notas_excluidas where chave = k);
  assert public.receber_nota_compra(k,'1','1',now() - interval '1 day','Fornecedor de teste',10.01,'<teste/>') = 'excluida', 'Não deve recuperar excluída.';
  perform public.confirmar_entrada_compra_tga(k);
  perform public.confirmar_entrada_compra_tga(k2);
  assert public.receber_nota_compra(k2,'2','1',now() - interval '1 day','Fornecedor de teste',10,'<teste/>') = 'excluida', 'Entrada anterior ao recebimento deve impedir importação.';
  assert public.receber_nota_compra(antigo,'3','1',now() - interval '1 year','Fornecedor de teste',10,'<teste/>') = 'excluida', 'Um ano exato deve excluir mesmo sem entrada.';
  assert not exists (select 1 from public.notas_compra where chave = antigo);
  assert (select motivo = 'prazo' from compras_privado.notas_excluidas where chave = antigo);

  perform public.receber_nota_compra(repeat('4',44),'4','1',now() - interval '1 day','Fornecedor de teste',10,'<teste/>');
  update public.notas_compra set expira_em = now() where chave = repeat('4',44);
  perform public.receber_nota_compra(repeat('5',44),'5','1',now() - interval '1 day','Fornecedor de teste',10,'<teste/>');
  update public.notas_compra set expira_em = now() + interval '1 second' where chave = repeat('5',44);
  assert public._limpar_notas_compra() = 1, 'Limpeza deve incluir o limite e preservar notas recentes.';
  assert exists (select 1 from public.notas_compra where chave = repeat('5',44));
  assert not exists (select 1 from public.notas_compra where chave = repeat('4',44));
  assert public._limpar_notas_compra() = 0, 'Limpeza repetida não deve criar novos registros.';

  limite := (('2024-02-29 12:30:00-04'::timestamptz at time zone 'America/Cuiaba') + interval '1 year') at time zone 'America/Cuiaba';
  assert limite = '2025-02-28 12:30:00-04'::timestamptz, 'Ano deve ser calendário, com tratamento de 29/02.';
  begin
    perform public.receber_nota_compra('errada','1','1',now(),'Teste',10,'<teste/>');
    raise exception 'Chave inválida foi aceita.';
  exception when raise_exception then
    if sqlerrm <> 'Chave de acesso inválida.' then raise; end if;
  end;
  begin
    perform public.receber_nota_compra(repeat('6',44),'6','1',now(),'Teste',10.001,'<teste/>');
    raise exception 'Valor com centavos fracionados foi aceito.';
  exception when raise_exception then
    if sqlerrm <> 'Dados da nota incompletos ou inválidos.' then raise; end if;
  end;

  assert not has_table_privilege('authenticated','public.notas_compra','SELECT');
  assert not has_schema_privilege('authenticated','compras_privado','USAGE');
  assert not has_function_privilege('anon','public.listar_notas_compra()','EXECUTE');
  assert not has_function_privilege('authenticated','public.confirmar_entrada_compra_tga(text)','EXECUTE');
  assert not has_function_privilege('authenticated','public.receber_nota_compra(text,text,text,timestamptz,text,numeric,text)','EXECUTE');
  assert not has_function_privilege('authenticated','public._limpar_notas_compra()','EXECUTE');
  assert has_function_privilege('service_role','public.confirmar_entrada_compra_tga(text)','EXECUTE');
end $$;
rollback;
