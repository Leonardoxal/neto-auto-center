-- NETO AUTO CENTER — Migração 0008: robô de WhatsApp.
-- Só acrescenta: coluna de origem nos eventos, lista de números autorizados, registro de mensagens
-- processadas (contra duplicidade) e duas funções que o robô usa para finalizar e entregar.
-- As funções do robô só podem ser chamadas com a chave service_role, que fica apenas no computador do robô.
-- Pode rodar de novo sem problema.

-- 1. De onde veio cada evento do histórico. Tudo o que já existe e o que vem do app é "painel".
alter table public.eventos add column if not exists origem text not null default 'painel';
do $$ begin
  alter table public.eventos add constraint eventos_origem_ck check (origem in ('painel','whatsapp'));
exception when duplicate_object then null; end $$;

-- 2. Números que podem falar com o robô. Telefone só com dígitos, com DDI e DDD (ex.: 5565999998888).
create table if not exists public.whatsapp_autorizados (
  telefone text primary key check (telefone ~ '^[0-9]{12,13}$'),
  nome text not null,
  papel text not null check (papel in ('admin','operacao')),
  recebe_relatorios boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.whatsapp_autorizados enable row level security;
drop policy if exists admin_gerir on public.whatsapp_autorizados;
create policy admin_gerir on public.whatsapp_autorizados for all to authenticated
  using (public.meu_perfil() = 'Administrador') with check (public.meu_perfil() = 'Administrador');

-- 3. Cada mensagem que alterou dados fica registrada pelo id do WhatsApp: a mesma mensagem nunca grava duas vezes.
create table if not exists public.whatsapp_mensagens (
  id text primary key,
  telefone text not null,
  acao text not null,
  atendimento_id uuid references public.atendimentos(id),
  em timestamptz not null default now()
);
alter table public.whatsapp_mensagens enable row level security;

-- 4. Funções do robô. A checagem comum devolve o nome de quem mandou a mensagem.
create or replace function public._bot_inicio(p_msg text, p_tel text, p_at uuid, p_acao text)
returns text language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from public.whatsapp_autorizados where telefone = p_tel and ativo;
  if v_nome is null then raise exception 'Número não autorizado.' using errcode = '42501'; end if;
  -- id repetido = mensagem já processada (unique_violation, código 23505)
  insert into public.whatsapp_mensagens (id, telefone, acao, atendimento_id) values (p_msg, p_tel, p_acao, p_at);
  if not exists (select 1 from public.atendimentos where id = p_at and sit_fisica = 'patio' and not arquivado) then
    raise exception 'Este veículo não está mais no pátio.';
  end if;
  return v_nome;
end $$;

create or replace function public.bot_finalizar(p_msg text, p_tel text, p_at uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_nome text; a public.atendimentos;
begin
  v_nome := public._bot_inicio(p_msg, p_tel, p_at, 'finalizar');
  select * into a from public.atendimentos where id = p_at for update;
  if a.sit_operacional = 'Serviço concluído' then raise exception 'O serviço deste veículo já estava finalizado.'; end if;
  if a.sit_comercial in ('Recusado','Cancelado') then raise exception 'O orçamento deste veículo está %.', lower(a.sit_comercial); end if;
  update public.esperas set fim = now() where atendimento_id = p_at and fim is null;
  update public.atendimentos set sit_operacional = 'Serviço concluído', oper_desde = now(), concluido_em = now(), atualizado_em = now()
  where id = p_at;
  insert into public.eventos (atendimento_id, tipo, descricao, usuario_nome, origem, dados)
  values (p_at, 'Operacional', a.sit_operacional || ' → Serviço concluído', v_nome, 'whatsapp',
          jsonb_build_object('status_anterior', a.sit_operacional, 'status_novo', 'Serviço concluído', 'telefone', p_tel));
  return a.sit_operacional;
end $$;

create or replace function public.bot_entregar(p_msg text, p_tel text, p_at uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_nome text; a public.atendimentos;
begin
  v_nome := public._bot_inicio(p_msg, p_tel, p_at, 'entregar');
  select * into a from public.atendimentos where id = p_at for update;
  -- serviço finalizado e veículo entregue são acontecimentos diferentes: um não substitui o outro
  if a.sit_operacional <> 'Serviço concluído' then
    raise exception 'O serviço ainda não foi finalizado. Envie primeiro: % finalizado', a.placa;
  end if;
  update public.atendimentos set sit_fisica = 'entregue', saida = now(), atualizado_em = now() where id = p_at;
  update public.esperas set fim = now() where atendimento_id = p_at and fim is null;
  insert into public.eventos (atendimento_id, tipo, descricao, usuario_nome, origem, dados)
  values (p_at, 'Saída', 'Veículo entregue', v_nome, 'whatsapp',
          jsonb_build_object('status_anterior', 'No pátio', 'status_novo', 'Entregue', 'telefone', p_tel));
  return 'entregue';
end $$;

revoke execute on function public._bot_inicio(text,text,uuid,text) from public, anon, authenticated;
revoke execute on function public.bot_finalizar(text,text,uuid) from public, anon, authenticated;
revoke execute on function public.bot_entregar(text,text,uuid) from public, anon, authenticated;
grant execute on function public.bot_finalizar(text,text,uuid) to service_role;
grant execute on function public.bot_entregar(text,text,uuid) to service_role;
