# Notas de compra: fila e exclusão

Fila independente com a regra aprovada: excluir a cópia no site quando houver confirmação de entrada no TGA ou quando completar um ano da emissão, o que ocorrer primeiro. Não altera o módulo de vendas/recebimentos nem grava no TGA.

## Implantação em ambiente separado

1. Fazer backup dos dados afetados antes de aplicar migrações. Validar primeiro em ambiente separado; aplicar ao ambiente de produção somente após autorização do responsável.
2. Aplicar `0010_notas_compra.sql` depois das migrações existentes.
3. Aplicar `0011_limpeza_compras_agendada.sql`. Exige pg_cron disponível; não há fallback silencioso. O trabalho nomeado `limpar-notas-compra` roda a cada minuto, inclusive com o site fechado. A execução deve ocorrer como proprietário das funções, normalmente postgres. Confirmar execução bem-sucedida em cron.job_run_details.
4. Publicar o frontend somente após aprovação. Para Administrador/Gerência, a área aparece como Notas de compra no menu lateral e como Compras na barra de abas do celular. A área existente de Notas permanece independente. Relatórios continua no menu lateral e fica em Mais no celular, preservando cinco abas com espaço para leitura.

## Contrato dos conectores pendentes

Ainda não há conexão com a SEFAZ/provedor nem com o TGA. A tela inicialmente ficará vazia. Isso não significa que não existem notas emitidas para a empresa. A conexão fiscal precisa ser escolhida/autorizada e a leitura das entradas do TGA precisa ser documentada antes de ativar a automação completa.

O servidor fiscal autorizado chama `receber_nota_compra` com chave, número, série, emissão, fornecedor, valor decimal e XML original. Antes disso deve verificar assinatura, protocolo, destinatário, eventos e conformidade do XML. Esta função trata persistência e retenção; não substitui validação fiscal. Ela não deve ser chamada diretamente pelo navegador. Não há chave service_role no frontend.

O conector TGA autorizado chama `confirmar_entrada_compra_tga` somente ao identificar, pela chave completa, entrada efetiva e não estornada. O contrato ainda não determina como ler esses dados do TGA. Não inferir entrada a partir do download de XML ou de número de nota sem emitente/série. Uma confirmação pode chegar antes da nota e já bloqueia sua importação posterior. Confirmações duplicadas são idempotentes.

As duas funções são exclusivas de service_role; o navegador não pode importar ou confirmar exclusão. Usar um processo servidor confiável com a chave em segredo. Não enviar o cadastro ou XML a terceiros diferentes do serviço fiscal escolhido.

## Exclusão e lista

- Exclusão após confirmação é transacional: remove a linha e seu XML; registra apenas chave, motivo e data em esquema privado.
- Um ano é calculado no fuso America/Cuiaba, por aniversário da emissão. Em 29/02, o aniversário no ano seguinte é 28/02. Notas antigas já são descartadas ao receber.
- O agendamento apaga notas vencidas em até aproximadamente um minuto, sujeito ao funcionamento do banco/agendador. A lista oculta vencidas imediatamente ao consultar. Uma tela aberta consulta novamente a cada 30 segundos e ao voltar à aba.
- Não existe arquivo duplicado em Storage: o XML fica apenas na linha de compra. A limpeza não envolve bucket de anexos.
- O controle mínimo de chaves evita reimportação. Não contém fornecedor, valores, itens ou XML; não é exibido no site.
- Backups e WAL seguem a retenção da infraestrutura. Esta implementação não promete eliminação imediata de cópias em backups. A cópia no TGA não é afetada; sua guarda não foi verificada.
- Estornos no TGA após exclusão não restauram automaticamente o XML. Definir recuperação excepcional antes da ativação do conector.

## Validação e reversão

Executar `supabase/tests/notas_compra.sql` somente em um banco de teste, com o proprietário das funções. Os registros são sintéticos e toda a transação é revertida. Além disso, executar npm test e npm run build.

Para suspender novas exclusões por idade: `select cron.unschedule('limpar-notas-compra');`. Suspender também o conector TGA para interromper exclusões por confirmação. Reverter o frontend não restaura arquivos já excluídos. Não remover tabelas ou desfazer o registro privado de chaves sem plano de recuperação. Restaurar XML excluído depende de cópia externa apropriada e revisão do motivo da exclusão.
