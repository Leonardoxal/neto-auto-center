-- Exige pg_cron disponível na instância; falha explicitamente se não puder ativá-lo.
create extension if not exists pg_cron;
select cron.schedule('limpar-notas-compra', '* * * * *', $$select public._limpar_notas_compra();$$);
