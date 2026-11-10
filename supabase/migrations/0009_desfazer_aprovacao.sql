-- NETO AUTO CENTER — Migração 0009: desfazer uma aprovação feita por engano.
-- Volta o orçamento para "Aguardando aprovação", limpa data e valor aprovados e devolve os itens aprovados
-- para "Proposto". Só antes de o serviço começar e com o veículo no pátio. Nada é apagado do histórico:
-- a aprovação continua lá e a anulação entra como evento "Correção" (não dispara aviso de aprovação no WhatsApp).
-- Pode rodar de novo sem problema.

create or replace function public.desfazer_aprovacao(p_at uuid, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
declare a public.atendimentos;
begin
  perform public.exige(array['Administrador','Gerência']);
  a := public._at(p_at);
  if a.aprovado_em is null then raise exception 'Este orçamento não está aprovado.'; end if;
  if a.sit_fisica <> 'patio' then raise exception 'O veículo já saiu do pátio.'; end if;
  if a.inicio_em is not null or a.sit_operacional not in ('Aguardando avaliação','Aguardando início') then
    raise exception 'O serviço já começou (%). Ajuste a situação operacional antes de desfazer a aprovação.', a.sit_operacional;
  end if;
  update public.orcamento_itens set status = 'Proposto', alterado_em = now(), alterado_por_nome = public.meu_nome()
  where atendimento_id = p_at and status = 'Aprovado';
  update public.atendimentos set aprovado_em = null, valor_aprovado = null, sit_comercial = 'Aguardando aprovação'
  where id = p_at;
  perform public._evento(p_at, 'Correção',
    'Aprovação desfeita (era ' || coalesce(public._brl(a.valor_aprovado), 'sem valor') || ', aprovada em '
    || to_char(a.aprovado_em at time zone 'America/Cuiaba', 'DD/MM/YYYY HH24:MI') || ')'
    || case when coalesce(p_motivo,'') <> '' then ': ' || p_motivo else '' end,
    now(), jsonb_build_object('status_anterior', 'Aprovado', 'status_novo', 'Aguardando aprovação',
      'aprovado_em', a.aprovado_em, 'valor_aprovado', a.valor_aprovado));
  if a.sit_operacional = 'Aguardando início' then perform public.mudar_operacional(p_at, 'Aguardando avaliação'); end if;
end $$;

revoke execute on function public.desfazer_aprovacao(uuid,text) from public, anon;
grant execute on function public.desfazer_aprovacao(uuid,text) to authenticated, service_role;
