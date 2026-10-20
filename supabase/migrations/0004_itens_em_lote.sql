-- NETO AUTO CENTER — Migração 0004: lançar vários itens do orçamento de uma vez.
-- Gera uma única revisão de valor e um único evento no histórico.
-- Rode no Supabase em SQL Editor › New query › colar tudo › Run. Pode rodar de novo sem problema.

create or replace function public.adicionar_itens(p_at uuid, p_itens jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare a public.atendimentos; it jsonb; n int := 0; soma numeric := 0; q numeric; v numeric; d text; nomes text[] := '{}';
begin
  perform public.exige(array['Administrador','Gerência','Recepção']);
  a := public._at(p_at);
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Inclua pelo menos um item.'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    d := trim(coalesce(it->>'descricao',''));
    q := coalesce((it->>'quantidade')::numeric, 1);
    v := (it->>'valor_unitario')::numeric;
    if d = '' then raise exception 'Há uma linha sem descrição.'; end if;
    if q <= 0 then raise exception 'Quantidade inválida em "%".', d; end if;
    if v is null or v < 0 then raise exception 'Valor inválido em "%".', d; end if;
    insert into public.orcamento_itens (atendimento_id, tipo, descricao, quantidade, valor_unitario, obs, criado_por, criado_por_nome)
    values (p_at, coalesce(nullif(it->>'tipo',''),'Peça'), d, q, v, coalesce(it->>'obs',''), auth.uid(), public.meu_nome());
    n := n + 1; soma := soma + round(q * v, 2); nomes := nomes || d;
  end loop;
  perform public._evento(p_at, 'Orçamento', n || case when n = 1 then ' item incluído: ' else ' itens incluídos: ' end
    || array_to_string(nomes, ', ') || ' (' || public._brl(soma) || ')'
    || case when a.aprovado_em is not null then ' · aguardando autorização complementar' else '' end);
  perform public._sync_itens(p_at, n || case when n = 1 then ' item incluído' else ' itens incluídos' end);
  return n;
end $$;
