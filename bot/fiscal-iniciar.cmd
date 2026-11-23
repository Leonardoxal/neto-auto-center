@echo off
rem Liga o conector fiscal (busca de notas de compra na SEFAZ) e o religa se parar. Disparado por iniciar.cmd.
rem O registro fica em bot\fiscal.log (sem XML, sem chave privada, sem senha).
cd /d "%~dp0"
:loop
echo %date% %time% ^| iniciando o conector fiscal >> fiscal.log
fnm exec --using=default node fiscal/iniciar.js >> fiscal.log 2>&1
echo %date% %time% ^| conector fiscal parou (codigo %errorlevel%), religando em 60 s >> fiscal.log
timeout /t 60 /nobreak > nul
goto loop
