# Gestão financeira e transparência: progresso

Arquivo de acompanhamento da frente "gestão financeira e transparência da empresa". Este repositório é público: aqui não entram senha, chave, nome de cliente, CPF nem valor real. Só contagens gerais e regras.

## Etapa atual e situação

**Etapa 0 (levantamento): concluída e aprovada pelo responsável em 14/11/2026** ("seguimos"), com as sete respostas gravadas.

**Etapa 1 (base e baixas): código e testes prontos em 14/11/2026, na branch `feat/gestao-base` (clone `neto-gestao`), sem commit.** Migração `0015` validada com rollback no Supabase (nada foi gravado em produção), importador do TGA e regras de cálculo com teste. Faltam a aplicação da migração em produção e o commit, que dependem da confirmação expressa do responsável, e as pendências abaixo (vínculo do documento do TGA com a nota, amostra de Em Aberto, tela). Ver "Etapa 1".

Ordem proposta das etapas: ver "Relatório da etapa 0" abaixo.

## Decisões do responsável (com data)

Respostas às perguntas da seção 4 do prompt, dadas em 13/11/2026 e aprovadas em 14/11/2026.

| # | Pergunta | Resposta | Data |
|---|---|---|---|
| 1 | O TGA exporta relatórios (planilha, CSV, XML)? Com que frequência? Há acesso ao banco dele? | Parcial: o TGA exporta relatórios e é programa instalado no Windows (não abre no navegador). Relatórios saem em PDF (a maioria só nesse formato); existem os de A Receber em Aberto e A Receber Baixados (ver "Relatórios do TGA conhecidos"). Exporta todos os dias; os arquivos já cobrem todas as lojas. Acesso ao banco ainda não informado. | 13/11/2026 |
| 2 | Todas as notas de venda entram no site pelo XML? | Sim, todas as notas saem pelo XML. | 13/11/2026 |
| 3 | Como as locadoras pagam hoje (prazo, portal, boleto, depósito)? | Algumas por boleto; a maioria por transferência em conta. Prazo e portal não informados. | 13/11/2026 |
| 4 | Antecipações: quais instituições, com que frequência, onde está o registro das já feitas? | Quatro locadoras permitem antecipar: Localiza, Movida, CS Brasil e Unidas. A antecipação é feita no **banco próprio das locadoras**, pelos portais delas; o registro das já feitas fica nesses portais (sem registro no site nem no TGA). Frequência não informada. | 13/11/2026 |
| 5 | Crediário: onde está o controle atual, quantos clientes ativos, qual a regra de juros e multa? | Controle ainda desorganizado. Regra: seguir os limites da legislação brasileira (valores exatos a conferir, ver nota abaixo). Número de clientes ativos: o responsável não sabe (13/11/2026). | 13/11/2026 |
| 6 | Depois de quantos dias de atraso uma parcela do crediário é considerada perdida? | 30 dias. | 13/11/2026 |
| 7 | Quem pode ver os números financeiros? | Só os dois donos (o responsável e o pai). Perfil Administrador; o pai hoje usa o WhatsApp, sem entrar no painel. As tabelas e relatórios novos serão restritos a Administrador. As tabelas atuais de contas a receber (`notas*`) ficam como estão (Administrador e Gerência): decisão do responsável em 13/11/2026, pois só ele e o pai conhecem o app. Se a Gerência passar a ter usuários, rever. | 13/11/2026 |

Nota sobre juros e multa do crediário: a multa de 2% sobre prestação em atraso é o limite do Código de Defesa do Consumidor (art. 52, §1º); o teto de juros de mora e a forma de cálculo ficam **a conferir** com contador ou advogado antes de implementar. Os percentuais serão parâmetros configuráveis, não valores fixos no código.

## Relatórios do TGA conhecidos (só estrutura, sem dados)

Origem: amostras em PDF da pasta de relatórios do responsável (fora do repositório). Todos saem em PDF; formato planilha/CSV ainda não confirmado.

| Relatório | Colunas e conteúdo | Serve para |
|---|---|---|
| Relatório de Vendas Geral (tipos de movimento 2.2.03, e outro com 2.2.06 a 2.2.23 para notas) | Código e nome do cliente (código interno do TGA, sem CNPJ), documento, série, emissão, vendedor, valor bruto, descontos, despesa, valor líquido, status (Pend./Aten.); totais por dia; rodapé com total geral, total à vista e total a prazo | Conferir o faturado (bruto x líquido) e casar notas pelo número do documento. Não traz vencimento nem pagamento |
| Extrato de Movimentação de Contas/Caixas (ex.: Caixa Diário) | Por conta/caixa: data, histórico ("REC. DOC nnnn DE cliente"), cliente, tipo do documento (DUPLICATA), nº do documento, valor original, valor baixado, créditos, débitos, saldo; mostra baixa parcial | **Fonte das baixas (recebimentos)** |
| Lançamentos: A Receber, Em Aberto (emissão desde 01/01/2026; amostra de 13/11/2026) | Agrupado por cliente (código interno do TGA, nome, telefone e cidade; **não registrar telefone**): data de emissão, vencimento, documento com sufixo de parcela (ex.: `nnnnnnn-1`), PO, tipo do documento (DP = duplicata), valor original, juros, multa, valor total e dias de atraso; total por cliente e total geral | **Fonte das duplicatas em aberto e do vencimento.** O TGA já calcula juros e dias de atraso; o sufixo `-n` casa com a parcela `n` da nota do site. Não traz data de pagamento: o que sai da lista foi baixado, então a baixa se deduz comparando dois relatórios de datas diferentes ou pelo Extrato |
| Lançamentos: A Receber, Baixados (emissão desde 01/01/2026; amostra de 13/11/2026) | Agrupado por cliente: histórico (ex.: "BAIXA PARCIAL DOC …"), emissão, vencimento, **data da baixa**, documento com sufixo de parcela, PO, tipo (DP), valor original, juros, desconto, multa, **valor pago**, dias de atraso; total geral, total sem devolução e total de devoluções | **Fonte das baixas (recebimentos).** Cobre todos os serviços num só arquivo (informado pelo responsável). Tem baixa parcial, desconto e devolução. No texto extraído, o nome do cliente e o histórico às vezes se sobrepõem (colunas coladas): o leitor deve usar só documento, datas e valores |
| Relatório de Comissão sobre Faturamento | Por funcionário e período: data, documento, série, produto/serviço, modelo, placa, condição, quantidade, valor base, %, comissão | Não é financeiro de recebimento |
| Orçamento e Ordem de Serviço impressos | Documento por placa | Fora do escopo |

Decisão do responsável (13/11/2026): o formato é PDF porque a maioria dos relatórios do TGA só sai assim; ele sobe todos os serviços num único arquivo por relatório. Os dois relatórios necessários (A Receber em Aberto e A Receber Baixados) existem e saem em PDF. O texto do PDF é extraível (`pdftotext -layout`), então a carga será por importação de PDF, com conferência dos totais do rodapé.

Frequência (13/11/2026): o responsável exporta **todos os dias**. Existe a Loja 2, mas os relatórios enviados (A Receber em Aberto e Baixados) já cobrem todas as lojas num só arquivo.

Pendente: acesso ao banco do TGA.

## Etapa 1: base e baixas (14/11/2026)

### Entregue

- **`supabase/migrations/0015_gestao_base.sql`** (aditiva, idempotente, `numeric`, leitura Administrador e Gerência pela política `financeiro`, escrita só por funções `security definer` com `exige`, tabelas sem escrita direta nem acesso do `anon`):
  - `locadora_documentos` (CPF/CNPJ só com dígitos para locadora; várias filiais por locadora) e as funções `vincular_documento_locadora` e `desvincular_documento_locadora`.
  - `nota_parcelas.vencimento_original` (preenchido com o vencimento atual nas parcelas existentes e, nas novas, por gatilho). `salvar_parcelas` foi refeita para preservar o original por número de parcela.
  - `notas.valor_bruto` opcional (`definir_valor_bruto`), `notas.tga_documento` e `notas.tga_emissao` (vínculo com o lançamento do TGA).
  - `gestao_alteracoes`: trilha que só acrescenta (quem, quando, antes, depois, motivo), alimentada por gatilhos em recebimentos (inclusive estorno) e ajustes de parcela, e pelas funções novas. Vale para notas com e sem atendimento. Resolve a divergência 10.
  - `nota_recebimentos` ganhou `origem` (manual ou tga), `juros`, `multa` e `desconto`. O `valor` continua sendo o principal baixado, então saldo e situação seguem as regras de `receber.ts`.
  - `tga_importacoes`, `tga_baixas` e `tga_em_aberto`, mais `importar_tga`, `conciliar_tga` e `vincular_baixa_tga`.
- **`src/lib/tga.ts`**: leitor dos PDFs do TGA (texto por `pdftotext -raw`, não `-layout`: o modo `-layout` embaralha colunas e perde o documento de algumas linhas). Só documento com sufixo de parcela, datas, tipo, portador e valores; nome, código e telefone do cliente não são lidos. Confere cada linha, cada total de cliente e o total geral do rodapé.
- **`scripts/importar-tga.mjs`**: `node scripts/importar-tga.mjs <baixados|em_aberto> <pdf> [--enviar]`. Sem `--enviar` só confere. Recusa o arquivo se houver divergência. Credenciais em `scripts/.env` (ver `scripts/.env.example`; arquivo ignorado pelo git).
- **`src/lib/gestao.ts`**: centavos inteiros, `totalBaixa`, dias de atraso, atraso no pagamento, pago em dia, prazo concedido, faixas de atraso (1-15, 16-30, 31-60, 61-90, mais de 90), perda após 30 dias, soma que vira nulo (e `brl(null)` = "Dados insuficientes", nunca zero).
- **`supabase/tests/0015_gestao_base.test.sql`**: teste da migração com dados sintéticos (termina sempre com erro proposital que desfaz tudo).

### Como as baixas funcionam

- Cada linha de Baixados vira uma linha em `tga_baixas` com chave estável (documento, datas, valores e ordem entre linhas idênticas): importar o mesmo arquivo, ou um arquivo que repete linhas antigas, não duplica nada. O servidor confere de novo a soma contra o rodapé e recusa se não bater.
- Baixa parcial, juros, multa e desconto: o recebimento criado usa o valor original da linha como principal e guarda juros, multa e desconto à parte. Total pago = principal + juros + multa - desconto.
- Devolução (tipo `DV`) não vira recebimento: fica em `tga_baixas` como `devolucao`. No total do TGA ela soma no valor original e subtrai do pago (conferido nos totais do PDF real).
- Linha cuja conta não fecha (ex.: juros mostrado mas não cobrado, original negativo ou zero) entra na tabela como `revisar` e só é aplicada por vínculo manual.
- Estorno em vez de apagar: o recebimento estornado continua na tabela, e uma baixa já aplicada não é aplicada de novo mesmo depois do estorno.
- Em Aberto é guardado como retrato (`tga_em_aberto`, por importação). Nada é baixado a partir dele nesta etapa.

### Locadora x particular (decisão do responsável, 14/11/2026)

- **Locadoras** (maioria) valem pela nota fiscal: o PV do TGA é ligado às notas de serviço e de peça (tela "Baixas do TGA", aba Locadoras).
- **Demais clientes (particulares)** valem só pelo PV, mesmo que tenham nota. A posição vem do último "A Receber, Em Aberto" importado (aba Particulares: em aberto, vencido, atraso por faixa, lista de PVs) e não precisa de ligação com nota.
- **Como o sistema decide:** o nome do cliente no TGA é comparado, no computador de quem importa, com o nome das locadoras cadastradas (sem acento nem espaço: qualquer nome com LOCALIZA vira Localiza). O banco recebe só o código do cliente no TGA (`tga_clientes`: código, tipo, locadora), nunca o nome nem o telefone. Cliente que passa a ser locadora volta sozinho para a fila de ligação.
- **Formatos:** Baixados pelo PDF (`pdftotext`); Em Aberto pelo `.xls`/`.xlsx` (lido pelo Excel em `scripts/xls-para-json.ps1`, precisa do Excel instalado). Com a planilha real: 2.121 linhas, soma conferida com o rodapé.
- **Nome do cliente (decidido em 14/11/2026):** a migração `0016` guarda o nome em `tga_clientes.nome` (dado pessoal; leitura só de Administrador e Gerência, nunca em log, teste ou repositório). A aba **Cobranças** lista os particulares pelo cadastro do cliente.
- **Telas (14/11/2026):** aba **Financeiro** reúne Notas fiscais, Cobranças e Compras. **Baixas do TGA** (dentro de Notas) mostra só locadoras, que são controladas por nota fiscal; **Cobranças** mostra só particulares, por cliente e por PV.

### Lançamentos internos e serviço à vista (relato do responsável, 14/11/2026)

- Quando a locadora aprova um valor, sai a nota fiscal e, às vezes, um segundo movimento no TGA só para lançar a mão de obra do mecânico, sem nenhuma das duas lojas (para não dar conflito nos relatórios). É interno: não é venda nem conta a receber.
- Serviço que sai com cliente "consumidor" (cadastro sem nome verdadeiro) é pago na hora, com vendedora própria no TGA (a vendedora não aparece nos relatórios A Receber).
- Decisão: importar tudo e tratar depois. Ainda não há marca para distinguir esses movimentos no Em Aberto e no Baixados (clientes genéricos aparecem com nome como "CLIENTE"). Até lá, podem ser contados como particulares. Pendência para a etapa 2: marcar cliente genérico como `consumidor` (fora de "a receber"), antes de usar os números.

### Entrada simultânea das notas de venda (14/11/2026)

- O computador do responsável é o servidor do TGA (`C:\TGA`, banco Firebird ativo em `D:\TGA\Dados\TGA.FDB`). O TGA grava cada nota emitida em `C:\TGA\NFe\XML\AAAAMM\NFe\*-nfe.xml` e `C:\TGA\NFSe\XML\AAAAMM\Notas\*-nfse.xml`.
- `scripts/sincronizar-notas.mjs` lê essas pastas (só leitura) e envia as notas novas pela função `importar_notas`, a mesma da importação de ZIP. `--enviar --vigiar` repete a cada 2 minutos; `scripts/sincronizar-notas.cmd` o inicia (atalho em `shell:startup`). O que já foi enviado fica em `scripts/.estado-notas.json` (fora do git).
- Primeira execução: 343 notas lidas (set a nov), 47 novas e 296 que já existiam, sem duplicar.
- Não faz: baixas e contas em aberto (o TGA só entrega relatório exportado; o banco Firebird poderia dar isso, mas exige usuário de leitura). A porta 3050 do Firebird está aberta para a rede (`0.0.0.0`): conferir a senha com quem mantém o TGA.

### Resultado com o PDF real de Baixados (sem expor dados)

2.097 linhas lidas. Soma do valor pago e do valor original iguais ao total do rodapé e aos totais de cada cliente (conferido). 21 linhas não fecham a conta no próprio TGA. Há diferença de centavos em juros no total de alguns clientes (arredondamento do TGA): aparece como aviso, não bloqueia.

### Pendências e riscos (etapa 1)

1. **Documento do TGA não é o número da nota (confirmado pelo responsável em 14/11/2026).** O documento do TGA é o pedido de venda (PV, formato `0001231-2`); a duplicata do TGA é a soma da nota de serviço e da nota de peça, que no site continuam separadas. O número do PV não aparece em nenhum campo das notas (`os` e `pedido` são da locadora). Testes com dados reais: por número só 2 de 1.595 baixas casam com a emissão; por valor e vencimento só cerca de 1 em 5 parcelas tem um único par no Em Aberto. Solução feita: o PV é ligado às notas por confirmação. `sugerir_pv_tga` sugere uma nota, ou duas do mesmo cliente com emissão até 10 dias de diferença, cuja soma das parcelas feche o valor baixado; `vincular_pv_tga` grava o PV (documento e emissão do TGA) nas notas e aplica as baixas repartidas entre elas na proporção do saldo; as próximas baixas desse PV entram sozinhas. Tela: Notas, botão "Baixas do TGA". Limite: a repartição é uma estimativa se a locadora paga serviço e peça em dias diferentes (estornar e refazer à mão). Sem sugestão (valor da duplicata diferente da soma das notas), ainda não há ligação manual livre.
   **Entrada automática das notas de venda** (sem mandar XML): não faz parte desta frente; depende do conector fiscal.
2. **Formato de Em Aberto não verificado.** A amostra foi sobrescrita (o arquivo `RELATÓRIO LOJA 1.pdf` agora é o de Baixados). O leitor de Em Aberto segue a descrição da etapa 0 e tem teste só com texto sintético. Pedir ao responsável que exporte de novo, com nome distinto para cada relatório.
3. **Tela só do vínculo do PV.** O vínculo documento para locadora (`vincular_documento_locadora`) e o valor bruto (`definir_valor_bruto`) ainda só existem como funções do banco. A tela fica para a etapa 2. O formato `.xls` do Em Aberto (colunas limpas) é melhor que o PDF; o importador ainda lê só PDF.
4. **Leitura da Gerência.** O prompt da etapa 1 pede leitura para Administrador e Gerência; a decisão 7 diz "só os dois donos". Está como no prompt; se for só Administrador, é trocar o perfil na política `financeiro` e nas funções.
5. **Importar notas depois das baixas.** `conciliar_tga()` roda de novo as pendentes (a importação de baixas já chama).
6. **`salvar_parcelas` e estornos.** Refazer parcelas apaga as parcelas e, em cascata, recebimentos estornados da nota (comportamento da `0006`). A baixa do TGA ligada a um recebimento apagado fica `conciliada` sem recebimento. Pouco provável, registrado como risco.

### Validação

- `npm test` e `npm run build`: passaram (ver relatório ao responsável). Os testes do leitor e das regras são `src/lib/tga.test.ts` e `src/lib/gestao.test.ts`.
- Migração `0015` mais teste SQL rodados no Supabase de produção dentro de uma transação desfeita (rollback): 11 conferências passaram (vencimento original, trilha imutável, importação, sem duplicar, divergência de rodapé, estorno, vínculo manual, Em Aberto, locadora e valor bruto, permissões, idempotência de colunas). Depois disso confirmado que nada ficou gravado. A migração inteira **não** foi rodada duas vezes seguidas (sem banco de teste local, o Docker não estava ativo): só as partes sensíveis (colunas e atualização do vencimento original); as demais usam `if not exists`, `create or replace` e `drop ... if exists`.

## O que foi feito (etapa 0)

- Leitura do prompt, do `README.md`, de `docs/AUDITORIA_E_DESIGN.md` e de `docs/NOTAS_COMPRA.md` (todos existem).
- Leitura de `supabase/migrations/0006_contas_a_receber.sql`, `src/lib/receber.ts`, `src/screens/Notas.tsx`, `src/lib/xmlnotas.ts`, `src/lib/relatorios.ts`, `src/screens/Relatorios.tsx`, `src/lib/pdf.ts`, `src/ui/ui.tsx` e da pasta `bot/`.
- Consulta somente de leitura ao Supabase de produção (políticas de acesso, lista de tabelas, lista de migrações e contagens de linhas). Nada foi alterado.
- Criação deste arquivo. `docs/GESTAO_PROGRESSO.md` não existia.

## Testes

Etapa 0: nenhum (não havia código). Etapa 1: ver "Validação" acima.

## O que ficou pela metade

Nada desta frente além das pendências da etapa 1 acima. Fora dela: o trabalho do conector fiscal continua sem commit na branch `feat/conector-fiscal` (arquivos de `bot/fiscal/`, migrações `0012` a `0014`, `src/screens/Compras.tsx`, `src/lib/conectorCompras*`). Esta frente não mexe nesses arquivos.

## Dúvidas

As sete perguntas da tabela de decisões, mais a divergência 3 abaixo (de onde virão as baixas dos recebimentos), que afeta a ordem das etapas.

## Riscos

1. **Relatório financeiro enganoso por falta de baixas.** Hoje só há 1 recebimento registrado para cerca de 1,4 mil notas. Se os relatórios de recebimento forem ligados agora, quase tudo aparece como "vencido". Sem a fonte das baixas (TGA, extrato, planilha), a etapa de recebimentos deve mostrar "Dados insuficientes" em vez de números.
2. **Duas fontes de "faturado".** Ver divergência 5. Misturar as duas gera números diferentes para o mesmo mês.
3. **Vazamento por permissão no banco.** Ver divergência 6. Relatório novo só pode ler tabelas restritas a Administrador e Gerência.
4. **Dados de crediário são pessoais** (cliente final, possivelmente pessoa física). O repositório é público: só o esquema vai para o código; os dados ficam no banco, com acesso restrito. Avaliar com o responsável o que pode ser guardado.
5. **Mesma árvore de trabalho do conector fiscal.** Para não misturar commits, esta frente deve sair de uma branch própria depois que o conector for commitado (ou em clone separado).
6. **Cálculo financeiro em ponto flutuante.** O banco usa `numeric(12,2)`; o TypeScript usa `number`. Valores devem ser tratados em centavos inteiros e as taxas (potência) só no resultado final, com teste por regra.

## Divergências entre o prompt (seção 2) e o código

1. **Numeração de migrações.** `0010` e `0011` existem (notas de compra) e `0012` a `0014` pertencem ao conector fiscal. As migrações desta frente começam em `0015`.
2. **Estado das migrações em produção.** `docs/NOTAS_COMPRA.md` diz que `0013` e `0014` "ainda não foram aplicadas", mas a lista de produção já mostra `cancelamento_nota_compra` e `painel_conector_compras`. O texto do documento está desatualizado (arquivo do conector; não foi alterado aqui). Além disso, a lista de migrações de produção não traz `0001`, `0003`, `0004`, `0005` e `0006`, apesar de as tabelas existirem: foram aplicadas pelo SQL Editor, então a lista não serve para saber o que falta.
3. **Contas a receber quase sem baixa.** A tabela `notas` tem cerca de 1,4 mil notas (jan a nov de 2026, 94 clientes distintos, 762 NF-e e 682 NFS-e) e cerca de 1,46 mil parcelas, mas só 1 recebimento. Nenhuma nota cancelada, o que sugere que cancelamentos não chegam pelo XML de venda. O prompt trata "recebido" como dado existente; hoje não existe.
4. **Nota não está ligada à locadora.** `notas` guarda `cliente` e `cliente_doc` em texto; `locadoras` (9 cadastradas) não tem CNPJ. Para a ficha por locadora (3.2) falta um mapeamento CNPJ para locadora (e o cliente não locadora, como fica?). Só 22 notas estão ligadas a um atendimento.
5. **Dois "faturados".** O relatório "Faturamento" atual lê `atendimentos.notas_fiscais` (tabela `notas_fiscais`, 22 linhas, por atendimento). A tabela `notas` (contas a receber, cerca de 1,4 mil linhas) não é lida por nenhum relatório. Os novos relatórios devem partir de `notas` e a tela antiga precisa de uma nota explicando a diferença.
6. **Restrição no banco.** O prompt pede relatórios restritos a Administrador e Gerência no banco. Hoje `Relatorios.tsx` só esconde a tela (`PERM.relatorios`); as tabelas que ele lê (`atendimentos`, `notas_fiscais`, `descontos`) têm leitura liberada para qualquer perfil ativo. Só `notas`, `nota_parcelas` e `nota_recebimentos` têm política restrita a Administrador e Gerência. As tabelas novas seguem o padrão da `0006` (política `financeiro` + escrita só por funções `security definer` com `exige`).
7. **Prazo combinado não é guardado.** As parcelas vêm da duplicata do XML ou da condição de pagamento (`parcelasPorCondicao`). `salvar_parcelas` apaga e refaz as parcelas (permitido só sem recebimento), então o vencimento original se perde. Para "prazo combinado x real" (3.1) é preciso gravar o vencimento original na parcela.
8. **Valor bruto x líquido em NFS-e.** `xmlnotas.ts` usa `ValorLiquido` quando existe, e `vNF` na NF-e. Notas com retenção ficam com o valor menor que o faturado. Registrar a regra no relatório ou guardar o valor bruto à parte.
9. **Importação não atualiza valor nem parcelas.** `importar_notas` com chave repetida só atualiza descrição, placa, OS, pedido, modelo, km e cancelada. Valor e parcelas ficam como na primeira importação.
10. **Sem trilha para notas sem atendimento.** Recebimento e estorno só geram evento quando a nota está ligada a atendimento (22 de cerca de 1,4 mil). `estornar_recebimento` guarda quem, quando e motivo na própria linha (ok, estorna sem apagar), mas ajustes de parcela não deixam rastro.
11. **Cards mostram "—", não "Dados insuficientes".** `fmtCard` devolve "—" para valor nulo; "Dados insuficientes" só aparece em células de tabela. Cards financeiros precisam do texto exigido no prompt.
12. **Reaproveitável.** `pdf.ts` gera PDF de qualquer `Relatorio` (`cards`, `pre`, `main`) e `csv()` também; `ui.tsx` já tem `Tile`, `Seg`, `Section`, `Field` e `useSheet`. Os relatórios novos devem produzir esse mesmo formato. Datas: `hoje()` (UTC−4) em `receber.ts` e `range()` em `relatorios.ts`.
13. **Robô de WhatsApp.** Sem nenhum comando financeiro. Usa `service_role` e o campo `recebe_relatorios` (que hoje significa relatório do pátio). O resumo semanal precisa de um campo próprio para não mandar números financeiros a quem só recebe o pátio.
14. **Detalhes menores.** A chave de NFS-e em `xmlnotas.ts` tem o CNPJ da empresa fixo no código. Está no repositório público (dado da empresa, não pessoal), mas deveria virar configuração. `pg_cron` está instalado em produção; `pg_net` não.

## Relatório da etapa 0

### O que existe

- Contas a receber (`0006`): `notas`, `nota_parcelas`, `nota_recebimentos`, com baixa parcial, estorno sem apagar e leitura restrita a Administrador e Gerência. Importação de XML (NF-e e NFS-e, inclusive ZIP) e nota manual. Funções puras de situação, saldo e vencido em `receber.ts`, com teste.
- Tela Notas: abertas, vencidas, recebidas, filtros, receber, estornar, ajustar parcelas.
- Relatórios operacionais (pátio, aprovações, faturamento por atendimento, por locadora, fechamento), PDF, encaminhar e CSV.
- Conector fiscal (SEFAZ, compras): outra frente, não toca vendas.
- Robô de WhatsApp com relatórios do pátio.

### O que falta

- Fonte confiável das baixas (hoje 1 recebimento).
- Mapeamento nota para locadora (CNPJ).
- Vencimento original da parcela e valor bruto da nota.
- Faixas de atraso, prazo médio combinado x real, % pago em dia, concentração, previsão (3.1) e ficha por locadora (3.2).
- Antecipações, instituições e taxa de referência (3.3).
- Crediário (3.4).
- Visão da direção e resumo semanal (3.5).
- Tudo que depende do TGA (3.6).

### Desenho das tabelas novas (esboço, só após aprovação)

Todas com `numeric`, RLS de leitura só para Administrador e Gerência (política `financeiro`), escrita só por funções `security definer` com `exige`, estorno em vez de exclusão, e nome de quem fez e quando.

- **`0015_gestao_base.sql`**
  - `locadora_documentos` (`cnpj` chave, `locadora_id`): liga o documento do cliente da nota a uma locadora; permite várias filiais por locadora.
  - `nota_parcelas.vencimento_original date` (preenchido com o vencimento atual; ver divergência 7), `notas.valor_bruto numeric(12,2)` (opcional, ver divergência 8).
  - Trilha de alterações financeiras para notas sem atendimento (ver divergência 10): tabela própria de log ou uso de `eventos`, a decidir.
- **`0016_antecipacoes.sql`**
  - `instituicoes_financeiras` (`id`, `nome`, `tipo`, `ativo`).
  - `antecipacoes` (`id`, `instituicao_id`, `data_operacao`, `valor_bruto`, `valor_liquido`, `coobrigacao boolean`, `situacao` entre vigente, liquidada, recomprada, `obs`, usuário e data, campos de estorno). Custo = bruto menos líquido, calculado, não gravado.
  - `antecipacao_titulos` (`antecipacao_id`, `parcela_id`, `valor`, `vencimento_original`): permite prazo antecipado ponderado e dias de caixa ganhos. Cada título só pode estar em uma antecipação não estornada.
  - `taxas_referencia` (`data`, `indicador`, `taxa_mensal numeric(9,6)`, `fonte`, `obs`): entrada manual no início; nenhuma consulta externa.
  - Taxa mensal = (bruto / líquido) elevado a (30 / prazo) menos 1, em TypeScript, com teste.
- **`0017_crediario.sql`**
  - `crediario_contratos` (`cliente_nome`, `cliente_doc`, `nota_id` opcional, `valor_original`, `juros_mensal`, `multa`, `data_contrato`, `obs`).
  - `crediario_parcelas` (`contrato_id`, `numero`, `vencimento`, `valor`).
  - `crediario_pagamentos` (`parcela_id`, `data`, `valor`, `forma`, campos de estorno).
  - Prazo para "perdida" em `configuracoes`, sem tabela nova.
- **`0018_resumo_semanal.sql`**: `whatsapp_autorizados.recebe_financeiro boolean default false`.

Cálculos (faixas de atraso 1-15, 16-30, 31-60, 61-90, +90; prazo médio; % em dia; concentração; previsão) ficam em `src/lib/gestao.ts`, funções puras com teste por regra, e alimentam o mesmo formato `Relatorio` usado em `relatorios.ts` e `pdf.ts`.

### Ordem proposta das etapas

Numeração e critérios de aceite conforme a seção 6 do prompt (ajustar se o texto original divergir).

1. **Base e baixas:** mapeamento CNPJ para locadora, vencimento original, e uma forma de carregar as baixas (depende das respostas 1 e 3). Sem isso, relatórios mostram "Dados insuficientes".
2. **Recebimentos (3.1) e ficha por locadora (3.2).**
3. **Antecipações e taxa de referência (3.3).**
4. **Crediário (3.4).**
5. **Visão da direção e resumo semanal por WhatsApp (3.5).**
6. **Integração com o TGA (3.6),** só se a resposta 1 mostrar um caminho seguro; não duplicar o que o TGA já faz (a Manifestação do Destinatário e a consulta à SEFAZ continuam lá).

Cada etapa: migração aditiva e idempotente, teste, aplicação em banco de teste antes de produção, e nenhum commit, push, migração em produção ou publicação sem confirmação expressa do responsável.

## Relatório para o gestor

Levantamento feito. O site já controla contas a receber de cerca de 1,4 mil notas de 2026, mas quase nada foi baixado como recebido, então os números de atraso ainda não seriam confiáveis. Para começar, preciso saber de onde virão os recebimentos (relatório do TGA, extrato ou planilha) e como cada locadora paga. Também falta ligar as notas às locadoras pelo CNPJ. Antecipações e crediário entram como cadastros novos, sem mexer no que já existe. Nada foi alterado no sistema nem no banco.
