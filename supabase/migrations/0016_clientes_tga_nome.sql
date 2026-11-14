-- NETO AUTO CENTER — Migração 0016: nome do cliente do TGA, para a aba Cobranças mostrar os particulares pelo cadastro do cliente.
-- Dado pessoal: o nome fica só neste banco, com leitura restrita a Administrador e Gerência (política `financeiro` da 0015).
-- Nunca em log, teste, repositório nem relatório enviado por WhatsApp. Só acrescenta. Pode rodar de novo sem problema.

alter table public.tga_clientes add column if not exists nome text not null default '';

-- Atualiza o cadastro de clientes do TGA antes de cada importação: {"C02170": {"tipo": "particular", "locadora_id": null, "nome": "..."}}
create or replace function public.atualizar_clientes_tga(p_clientes jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform public.exige(array['Administrador', 'Gerência']);
  insert into public.tga_clientes (codigo, tipo, locadora_id, nome)
  select c.key, c.value ->> 'tipo', nullif(c.value ->> 'locadora_id', '')::uuid, left(coalesce(c.value ->> 'nome', ''), 200)
  from jsonb_each(coalesce(p_clientes, '{}'::jsonb)) c
  on conflict (codigo) do update set tipo = excluded.tipo, locadora_id = excluded.locadora_id, nome = excluded.nome, atualizado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.atualizar_clientes_tga(jsonb) from public, anon;
