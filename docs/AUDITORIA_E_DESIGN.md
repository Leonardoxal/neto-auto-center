# NETO AUTO CENTER — Auditoria do sistema e direção visual "Underground Garage"

Documento de referência do redesign. A regra: a lógica, o banco, as rotas e as permissões ficam como estão;
muda só a camada visual.

## 1. Para que o sistema serve

Sistema **interno** da oficina NETO AUTO CENTER (Tangará da Serra/MT) para acompanhar cada passagem de um veículo
de locadora ou cliente pela oficina: entrada, orçamento, aprovação, execução, faturamento, recebimento e saída.
Não há parte pública: tudo exige login (Supabase Auth, cadastro de contas só pelo administrador).

Quem usa:
- **Leonardo** (Administrador): tudo, inclusive usuários, notas e relatórios.
- **Gerência / Recepção / Operacional**: perfis com permissões menores (tabela `PERM` em `src/lib/domain.ts`,
  repetida no banco pelas funções `exige()` + RLS).
- **Pai do Leonardo**: hoje pelo **robô de WhatsApp** (`bot/`), sem entrar no painel.

## 2. Telas (React + Vite, PWA; navegação por abas + pilha, sem rotas de URL)

| Tela | Função | Dados | Ações | Dependências |
|---|---|---|---|---|
| Login / Nova senha | Entrar; trocar senha pelo link do e-mail | Supabase Auth | Entrar, esqueci a senha | `supabase.auth` |
| Início (`Inicio`) | Painel da oficina | `ativos` (pátio), contagem de entregues hoje | Abrir listas, nova entrada | `store`, `LISTAS` |
| Pátio ativo (`Patio`) | Garagem: todos os veículos ativos | `ativos` + itens + nº de anexos | Busca, listas, filtros (locadora, responsável, tempo, data), 3 vistas (etapas, tabela, quadro), presença, adicionar modelo | `store`, `VCard` |
| Parados (`Parados`) | Veículos sem atualização há X dias | `ativos` | Abrir ficha | `store` |
| Ficha (`Ficha`) | Atendimento completo | atendimento + revisões, descontos, notas, esperas, movimentações, eventos, itens, anexos | Lançar orçamento, enviar, desconto, aprovar, recusar, nota fiscal, mover, saída, editar, arquivar, voltar ao pátio, mudar situações, presença, itens, anexos, cancelar nota, modelo | ~20 funções RPC |
| Entrada (folha) | Registrar veículo | locadoras, áreas, usuários, histórico da placa | Salvar entrada (+ nova locadora) | `registrar_entrada` |
| Notas fiscais (`Notas`) | Contas a receber | `notas`, parcelas, recebimentos | Importar XML/ZIP, nota manual, parcelas, receber, estornar, PDF/CSV | RPCs de `0006` |
| Relatórios (`Relatorios`) | Indicadores por período | histórico completo | Filtros, PDF, encaminhar, CSV | `relatorios.ts`, `pdf.ts` |
| Histórico de veículos (`Historico`) | Atendimentos encerrados | `atendimentos` | Buscar, abrir ficha | — |
| Cadastros (`Cadastros`) | Conta, usuários, locadoras, áreas, anexos, oficina | usuários, locadoras, áreas, configurações | Senha, sair, perfis, nova locadora/área, prazo de limpeza | RLS admin |
| Locadora (`LocadoraFicha`) | Cliente e seus atendimentos | locadora + atendimentos | Editar | — |
| Mais | Menu do celular | — | Navegar | — |

## 3. Fluxo real (código e banco)

```
ENTRADA (registrar_entrada) ─ placa + locadora obrigatórias, modelo obrigatório na tela
  ↓ orçamento: valor ou itens (registrar_orcamento / adicionar_itens) — sem valor = "pendente", nunca R$ 0
  ↓ ENVIO (enviar_orcamento) → "Aguardando aprovação"; tempo de aprovação conta daqui
  ↓ DESCONTO (opcional, registrar_desconto) → "Em negociação"
  ↓ APROVAÇÃO (aprovar_orcamento / aprovar_com_itens) ou RECUSA
  ↓ OPERACIONAL: Aguardando início → Em execução ↔ esperas (peças, autorização, terceirizado) → Serviço concluído
  ↓ NOTA FISCAL (emitir_nota / importação de XML) — não tira do pátio
  ↓ SAÍDA (registrar_saida: entregue ou retirado) — só isto tira do pátio
```
Cinco situações independentes (física, comercial, operacional, fiscal, financeira). Toda operação grava em
`eventos` (data, usuário, origem `painel`/`whatsapp`). O robô grava "finalizado" e "entregue" pelas
funções `bot_finalizar` / `bot_entregar`.

## 4. Dados

- **Supabase** (PostgreSQL 17, plano gratuito): `atendimentos`, `veiculos`, `locadoras`, `usuarios`, `areas`,
  `orcamento_revisoes`, `orcamento_itens`, `descontos`, `esperas`, `movimentacoes`, `notas_fiscais`, `eventos`,
  `anexos` (+ bucket privado `anexos`), `notas`/`nota_parcelas`/`nota_recebimentos`, `configuracoes`,
  `whatsapp_autorizados`, `whatsapp_mensagens`; `tarefas`/`anotacoes` existem no banco sem tela.
- Escrita só por funções `security definer` com checagem de perfil; leitura por RLS para usuário ativo.
- Frontend: `VITE_SUPABASE_URL` e chave publicável (pública por natureza). A chave `service_role` fica só em
  `bot/.env` no computador da oficina.
- Integrações: WhatsApp (Baileys, `bot/`), Wikimedia Commons (fotos ilustrativas), Google Fonts.

## 5. Situação das funcionalidades

- **Funcionando:** login e perfis; entrada; orçamento por valor e por itens; envio, desconto, aprovação, recusa;
  situações; esperas; presença; movimentação; notas fiscais e contas a receber; anexos com limpeza; relatórios
  com PDF/CSV; histórico; cadastros; foto do modelo; robô de WhatsApp (comandos, avisos, relatórios).
- **Parcial:** status operacional pouco usado na prática (veículos entregues sem "Serviço concluído").
- **Não implementado:** ano, versão e quilometragem do veículo (não existem no banco); tarefas e anotações
  (tabelas sem tela); categorias de serviço (o serviço é texto livre).

## 6. Problemas encontrados

- Visual com cara de app genérico (reclamação do dono) — tratado neste redesign.
- Cor de status não seguia uma regra por estado (só verde/laranja/vermelho) — tratado: cada estado tem cor.
- O modelo aparecia escondido em "Mais informações" — já corrigido antes (obrigatório + botão "Adicionar").
- Segurança já corrigida: funções fechadas para `anon` (migração 0007).
- Proteção contra senhas vazadas desligada no Supabase (configuração do painel do Supabase).

## 7. Direção visual — editorial automotivo

Referência de atmosfera: fotografia de carro em jogos de corrida modernos e revistas automotivas. Não é uma
cópia de nenhum jogo e não tem cara de jogo: nada de neon, brilho, roxo, HUD ou elementos inclinados.

- **Cores:** preto `#0A0A0B`, grafite `#141516`/`#1C1D1F`, cinza metálico `#8C9096`, branco `#F4F4F2`,
  vermelho NETO `#D71920` (único destaque: marca, ação principal, item ativo). Outras cores só para estados.
- **Estados (sóbrios):** diagnóstico azul aço · orçamento ocre · aguardando aprovação laranja queimado ·
  aprovado verde · em execução vermelho NETO · espera bronze · finalizado branco · recusado cinza riscado.
  Regra única em `tom()` e `estadoPrincipal()` (`src/lib/domain.ts`).
- **Tipografia:** Barlow Condensed (títulos, maiúsculas, peso 700) e Barlow (texto); números com
  algarismos tabulares, sem fonte "de painel".
- **Composição:** a foto do carro ocupa a largura; o texto se integra à imagem; listas em linhas separadas
  por filetes, não em caixas. Cantos retos ou quase retos; sombras só para dar profundidade à foto.
- **Telas-chave:** login com foto grande e a marca; início com o carro em destaque, o número de veículos na
  oficina em tipografia grande, um placar por situação e a lista de veículos com foto; ficha com a foto do
  modelo no topo e os dados abaixo.
- **Movimento:** zoom lento na foto de capa e leve aproximação da foto no hover; nada que esconda conteúdo
  (sem animação começando invisível). Respeita `prefers-reduced-motion`.
- **Fotos:** hoje ilustrativas por modelo (Wikimedia Commons, com crédito). Fotos reais da NETO podem
  substituir a capa do login sem mudar código além do nome do arquivo.
- **Não implementado por falta de dado:** ano, versão e quilometragem (não existem no banco) e categorias de
  serviço (o serviço é texto livre).

