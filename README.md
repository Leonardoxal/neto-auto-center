# NETO AUTO CENTER — Gestão Operacional

Sistema interno da NETO AUTO CENTER (Tangará da Serra/MT) para controle de pátio, atendimentos, orçamentos, aprovações, faturamento e relatórios. É um site que se instala no celular e no computador como aplicativo (PWA).

- **App:** React + TypeScript + Vite, instalável (PWA)
- **Banco, login e permissões:** Supabase (plano gratuito)
- **Hospedagem:** Vercel (plano gratuito)
- **Endereço:** https://neto-auto-center.vercel.app

## Instalação (uma vez)

### 1. Banco de dados (Supabase)
1. No painel do projeto, abra **SQL Editor › New query**.
2. Cole o conteúdo de cada arquivo da pasta `supabase/migrations/`, **na ordem** (`0001_base.sql`, depois `0002_presenca.sql`…), e clique em **Run** a cada um. Pode rodar de novo sem problema.
3. Em **Authentication › Sign In / Providers**, deixe **Email** ligado e **desligue "Allow new users to sign up"**. Assim só o administrador cria contas.
4. Em **Authentication › URL Configuration**, coloque o endereço do sistema na Vercel em **Site URL** (para o link de "Esqueci a senha" funcionar).
5. Em **Authentication › Users › Add user › Create new user**, crie o seu usuário com **Auto Confirm User** marcado. **O primeiro usuário criado vira Administrador.**

### 2. Site (Vercel)
1. Em vercel.com, **Add New › Project** e importe o repositório `neto-auto-center`.
2. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave anon / publishable
3. Clique em **Deploy**.

### 3. Instalar no celular
- **iPhone (Safari):** abra o endereço › Compartilhar › Adicionar à Tela de Início.
- **Android (Chrome):** abra o endereço › menu ⋮ › Instalar app.

## Funcionários
1. Supabase › **Authentication › Users › Add user** com e-mail, senha provisória e **Auto Confirm User**.
2. O funcionário aparece no app como **Operacional**. O administrador muda o perfil em **Cadastros › Usuários**.
3. O funcionário troca a senha em **Cadastros › Minha senha**.

| Perfil | Pode |
|---|---|
| Administrador | Tudo, incluindo usuários, áreas e configurações |
| Gerência | Aprovar, descontos, notas, saída, arquivar, corrigir datas, relatórios |
| Recepção | Entradas, orçamentos, envio, saída, edição, locadoras |
| Operacional | Consultar, movimentar e mudar a situação operacional |

As permissões são verificadas no banco (funções `security definer` + RLS), não só na tela.

## Regras principais
- Cada passagem de uma placa é um **atendimento** separado (AT-0001…), com histórico próprio. Nada é apagado; arquivar só tira das listas.
- Cinco situações independentes: física, comercial, operacional, fiscal e financeira.
- Aprovar ou emitir nota não tira do pátio. Só o registro de saída tira.
- Orçamento sem valor fica **pendente**, nunca R$ 0,00. Revisões e negociações nunca são sobrescritas.
- Tempo de aprovação conta a partir do **envio** do orçamento. Faltando evento: "Dados insuficientes".
- Toda operação gera um evento com data, hora e usuário (tabela `eventos`).
- Fuso: America/Cuiaba (UTC−4).

## Desenvolvimento
```bash
cp .env.example .env.local   # preencha com os dados do Supabase
npm install
npm run dev     # http://localhost:5173
npm test        # testes das regras de cálculo
npm run build   # versão de produção em dist/
```

## Entregas
1. **Base e pátio** (esta): login e perfis, locadoras, entrada rápida, pátio (lista, tabela, quadro), ficha com orçamento, envio, desconto, aprovação, recusa, nota fiscal, movimentação, saída, edição, arquivamento, histórico, cadastros.
2. Telas de aprovações, serviços em execução e faturamento.
3. Agenda, tarefas e anotações.
4. Dashboard, relatórios, PDF com Encaminhar, CSV e backup.
