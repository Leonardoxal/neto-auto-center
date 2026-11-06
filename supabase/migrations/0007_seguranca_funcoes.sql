-- NETO AUTO CENTER — Migração 0007: funções só para usuários logados.
-- Antes, todas as funções `security definer` podiam ser chamadas pelo papel `anon` (a chave pública
-- que vai dentro do site). A maioria barrava no `exige()`, mas `anexos_para_limpar()` e
-- `espaco_anexos()` não tinham essa checagem e devolviam dados sem login.
-- Não mexe em dados. Pode rodar de novo sem problema.
-- Para desfazer: grant execute on function <nome> to anon;

-- 1. Ninguém sem login executa funções do esquema public.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- funções internas (prefixo "_") e de gatilho continuam fechadas também para o app
    if left(f.proname, 1) <> '_' and f.proname not in ('novo_usuario', 'rls_auto_enable') then
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- 2. Funções criadas daqui em diante também nascem fechadas para anon.
alter default privileges in schema public revoke execute on functions from public, anon;

-- 3. As duas funções que não exigiam perfil passam a exigir usuário ativo.
create or replace function public.anexos_para_limpar()
returns setof public.anexos language sql stable security definer set search_path = public as $$
  select x.* from public.anexos x join public.atendimentos a on a.id = x.atendimento_id
  where public.meu_perfil() is not null
    and x.removido_em is null and a.sit_fisica <> 'patio' and a.saida is not null
    and a.saida < now() - make_interval(days => (select anexos_dias_apos_saida from public.configuracoes where id = 1))
  limit 200
$$;

create or replace function public.espaco_anexos()
returns table (bytes bigint, arquivos bigint) language sql stable security definer set search_path = public as $$
  select coalesce(sum(tamanho),0)::bigint, count(*) from public.anexos
  where removido_em is null and public.meu_perfil() is not null
$$;

-- 4. search_path fixo nas duas funções auxiliares apontadas pelo linter do Supabase.
alter function public._brl(numeric) set search_path = public;
alter function public._item_total(public.orcamento_itens) set search_path = public;
