-- Nota de compra cancelada na SEFAZ sai da fila e não pode ser reimportada. Aditiva: não edita a 0010.
alter table compras_privado.notas_excluidas drop constraint if exists notas_excluidas_motivo_check;
alter table compras_privado.notas_excluidas
  add constraint notas_excluidas_motivo_check check (motivo in ('entrada_tga', 'prazo', 'cancelada'));

-- Mesmo desenho de confirmar_entrada_compra_tga: o cancelamento pode chegar antes da nota e já bloqueia a importação.
create or replace function public.cancelar_nota_compra(p_chave text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_chave is null or p_chave !~ '^[0-9]{44}$' then raise exception 'Chave de acesso inválida.'; end if;
  perform pg_advisory_xact_lock(773422, 1);
  insert into compras_privado.notas_excluidas (chave, motivo)
  values (p_chave, 'cancelada') on conflict (chave) do nothing;
  delete from public.notas_compra where chave = p_chave;
end $$;
revoke all on function public.cancelar_nota_compra(text) from public, anon, authenticated;
grant execute on function public.cancelar_nota_compra(text) to service_role;
