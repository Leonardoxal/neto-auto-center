# Notas de compra: fila e exclusão

Fila independente com a regra aprovada: excluir a cópia no site quando houver confirmação de entrada no TGA ou quando completar um ano da emissão, o que ocorrer primeiro. Não altera o módulo de vendas/recebimentos nem grava no TGA.

## Implantação em ambiente separado

1. Fazer backup dos dados afetados antes de aplicar migrações. Validar primeiro em ambiente separado; aplicar ao ambiente de produção somente após autorização do responsável.
2. Aplicar `0010_notas_compra.sql` depois das migrações existentes.
3. Aplicar `0011_limpeza_compras_agendada.sql`. Exige pg_cron disponível; não há fallback silencioso. O trabalho nomeado `limpar-notas-compra` roda a cada minuto, inclusive com o site fechado. A execução deve ocorrer como proprietário das funções, normalmente postgres. Confirmar execução bem-sucedida em cron.job_run_details.
4. Publicar o frontend somente após aprovação. Para Administrador/Gerência, a área aparece como Notas de compra no menu lateral e como Compras na barra de abas do celular. A área existente de Notas permanece independente. Relatórios continua no menu lateral e fica em Mais no celular, preservando cinco abas com espaço para leitura.

## Contrato dos conectores pendentes

A conexão com a SEFAZ é feita pelo conector fiscal (seção "Conector fiscal" abaixo). A conexão com o TGA ainda não existe e a leitura das entradas do TGA precisa ser documentada antes de ativar a automação completa. Enquanto o conector não estiver instalado e com notas recebidas, a tela fica vazia: isso não significa que não existem notas emitidas para a empresa.

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

## Conector fiscal (busca na SEFAZ)

### Decisões registradas (2026-11-13)

- **Certificado:** A1 (arquivo `.pfx`), confirmado pelo responsável. Fica só no computador da oficina, em pasta fora do repositório e fora do OneDrive, com caminho e senha em `bot/.env`. Nunca vai ao repositório, ao banco, a log ou ao navegador. O `.gitignore` bloqueia `*.pfx`, `*.p12`, `*.pem`, `*.key` e `bot/certificado/`.
- **Ciência da Operação: não autorizada.** O conector não envia nenhum evento fiscal. Consequência: para notas de terceiros a SEFAZ entrega primeiro só o resumo, e o XML completo só chega depois que a ciência é registrada por outro meio. Sem isso a fila pode ficar quase vazia mesmo com tudo funcionando. Confirmação, Desconhecimento e Operação não Realizada nunca serão automáticos. Para mudar esta decisão é preciso autorização expressa do responsável.
- **Ambiente:** homologação por padrão (`FISCAL_AMBIENTE=homologacao`). Data para produção: **pendente**. A primeira execução em produção é acompanhada pelo responsável.

### Como funciona

- Código em `bot/fiscal/`, processo separado do WhatsApp (`bot/fiscal-iniciar.cmd`, disparado por `bot/iniciar.cmd`; registro em `bot/fiscal.log`, só com chave de acesso, NSU e código de retorno).
- Serviço nacional `NFeDistribuicaoDFe` (Ambiente Nacional), SOAP 1.2 com certificado de cliente, UF autora Mato Grosso (código IBGE 51). Endereços conferidos em 13/11/2026 no Portal Nacional da NF-e: produção `https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`, homologação `https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`, versão do serviço 1.00. O WSDL de homologação confirmou o namespace e o SOAPAction.
- Consulta por `ultNSU`, em laço, até alcançar o `maxNSU`. O NSU só avança depois que o lote inteiro foi entregue; a entrega é idempotente (`existente`/`excluida`).
- Intervalo: depois de `cStat` 137 (sem documentos) a próxima consulta só ocorre 61 minutos depois. Consultar antes gera `cStat` 656 (consumo indevido) e bloqueia o CNPJ por 1 hora. O horário fica no banco e vale também para o botão Buscar agora.
- Validação antes de `receber_nota_compra`: XML sem DOCTYPE/entidades, com tamanho máximo (5 MB, também na descompressão); protocolo com `cStat` de autorizada, chave igual à do protocolo e `digVal` igual ao da assinatura; assinatura digital verificada e dados lidos só da parte assinada; destinatário igual ao CNPJ da empresa; valor em texto com duas casas, sem ponto flutuante.
- Cancelamento registrado pela SEFAZ chama `cancelar_nota_compra`: a nota sai da fila e não pode ser reimportada (motivo `cancelada`). Carta de correção: só contagem.
- Estado no banco (`compras_privado.conector_fiscal`, uma linha por ambiente): último NSU, última consulta, próxima consulta permitida, resultado, último erro (texto curto), validade do certificado, sinal de vida e pedido de busca. Trocar de computador não reinicia a busca.
- Tela: `status_conector_compras()` e `pedir_busca_compras()` (só Administrador e Gerência). Tempo real por Broadcast em canal privado `compras`: gatilhos em `notas_compra` e no estado do conector enviam apenas "mudou", sem dado da nota; a tela busca de novo as listas. A política em `realtime.messages` usa `_pode_ver_compras()`, com a mesma regra do `exige`. A consulta a cada 30 segundos continua como reserva, e a tela mostra "ao vivo" ou "reconectando…".

### Migrações do conector

| Migração | Conteúdo | Situação em 13/11/2026 |
|---|---|---|
| `0012_conector_fiscal_compras.sql` | estado do conector | validada com rollback e aplicada em produção |
| `0013_cancelamento_nota_compra.sql` | motivo `cancelada` e `cancelar_nota_compra` | validada com rollback, **ainda não aplicada** |
| `0014_painel_conector_compras.sql` | status, pedido de busca, Broadcast e política do canal | validada com rollback, **ainda não aplicada** |

A tela funciona antes da `0014`: sem a função do painel ela mostra só a lista. O teste com rollback não exercitou o bloqueio de um usuário de perfil comum (o banco só tinha Administrador); o caso sem login e o do Administrador foram exercitados. Repita esse teste quando houver um usuário de perfil comum.

### Operação

- **Instalar o certificado:** copie o `.pfx` para uma pasta fora do repositório e do OneDrive, preencha `CERT_PFX_CAMINHO` e `CERT_PFX_SENHA` em `bot/.env` e rode `npm run certificado` em `bot/` (mostra só titular, CNPJ e validade).
- **Renovação:** troque o arquivo, ajuste `bot/.env`, rode `npm run certificado` e reinicie o conector. A aba avisa a partir de 30 dias antes de vencer.
- **Parar:** feche a janela "NETO - fiscal" ou encerre o processo `node` do conector. Parar o conector fiscal não afeta o WhatsApp.
- **Bloqueio da SEFAZ (656):** esperar cerca de 1 hora. O conector já respeita o intervalo; não repita `npm run consulta-teste`.
- **Computador desligado:** não há perda. A SEFAZ guarda os documentos por cerca de 90 dias e a busca continua do último NSU.

### Itens a conferir com documentos reais

Os nomes dos elementos raiz (`nfeProc`, `resNFe`, `procEventoNFe`, `resEvento`), os códigos `cStat` de nota autorizada (100 e 150) e de evento registrado (135, 136 e 155), os códigos de tipo de evento (110111 cancelamento, 110110 carta de correção), a versão `1.01` do leiaute `distDFeInt` (aceita na consulta de homologação de 13/11/2026) e o intervalo de 1 hora na versão vigente da Nota Técnica 2014.002 (existe a versão 1.40, de CNPJ alfanumérico) ainda não foram verificados contra documentos reais. A assinatura é verificada com o certificado embutido, sem validar a cadeia ICP-Brasil (o documento vem direto da SEFAZ por TLS). Nenhuma nota real foi recebida até aqui.
