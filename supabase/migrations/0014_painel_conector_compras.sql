-- Painel do conector fiscal e aviso em tempo real das notas de compra. Aditiva.

-- Quem pode ver: o mesmo perfil que lista as notas (Administrador e Gerência), via public.exige.
create or replace function public._pode_ver_compras()
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador', 'Gerência']);
  return true;
exception when insufficient_privilege then
  return false;
end $$;
revoke all on function public._pode_ver_compras() from public, anon;
grant execute on function public._pode_ver_compras() to authenticated;

-- Estado do conector do ambiente que deu sinal de vida mais recentemente. `agora` evita depender do relógio do aparelho.
create or replace function public.status_conector_compras()
returns table (
  ambiente text, ultima_consulta timestamptz, proxima_consulta timestamptz, ultimo_resultado text,
  ultimo_erro text, certificado_validade timestamptz, ultimo_sinal timestamptz, busca_pedida_em timestamptz,
  agora timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.exige(array['Administrador', 'Gerência']);
  return query select c.ambiente, c.ultima_consulta, c.proxima_consulta, c.ultimo_resultado, c.ultimo_erro,
      c.certificado_validade, c.ultimo_sinal, c.busca_pedida_em, now()
    from compras_privado.conector_fiscal c order by c.ultimo_sinal desc nulls last limit 1;
end $$;
revoke all on function public.status_conector_compras() from public, anon;
grant execute on function public.status_conector_compras() to authenticated;

-- "Buscar agora": só grava um pedido; o conector o atende na volta seguinte e nunca antes do horário permitido pela SEFAZ.
create or replace function public.pedir_busca_compras()
returns void language plpgsql security definer set search_path = public as $$
declare alvo text; liberada timestamptz;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  select c.ambiente, c.proxima_consulta into alvo, liberada
    from compras_privado.conector_fiscal c order by c.ultimo_sinal desc nulls last limit 1;
  if alvo is null then raise exception 'O conector fiscal ainda não foi iniciado.'; end if;
  if liberada is not null and liberada > now() then raise exception 'A SEFAZ ainda não permite nova consulta.'; end if;
  update compras_privado.conector_fiscal set busca_pedida_em = now() where ambiente = alvo;
end $$;
revoke all on function public.pedir_busca_compras() from public, anon;
grant execute on function public.pedir_busca_compras() to authenticated;

-- Aviso "mudou" no canal privado `compras`. Sem nenhum dado da nota. Falha de Realtime nunca derruba a gravação.
create or replace function public._avisar_compras()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'mudou', 'compras', true);
  exception when others then
    null;
  end;
  return null;
end $$;
revoke all on function public._avisar_compras() from public, anon, authenticated;

drop trigger if exists avisar_notas_compra on public.notas_compra;
create trigger avisar_notas_compra after insert or delete on public.notas_compra
  for each statement execute function public._avisar_compras();

drop trigger if exists avisar_conector_compras on compras_privado.conector_fiscal;
create trigger avisar_conector_compras after insert or update on compras_privado.conector_fiscal
  for each statement execute function public._avisar_compras();

-- Só quem passa por _pode_ver_compras escuta o canal `compras`.
drop policy if exists "compras_recebe_aviso" on realtime.messages;
create policy "compras_recebe_aviso" on realtime.messages
  for select to authenticated
  using ((select realtime.topic()) = 'compras' and (select public._pode_ver_compras()));
