@echo off
rem Liga o robo de WhatsApp e o religa se ele parar. Usado pela tarefa agendada "NETO - robo WhatsApp".
rem O registro fica em bot\bot.log.
cd /d "%~dp0"
:loop
echo %date% %time% ^| iniciando o robo >> bot.log
fnm exec --using=default node index.js >> bot.log 2>&1
echo %date% %time% ^| robo parou (codigo %errorlevel%), religando em 15 s >> bot.log
timeout /t 15 /nobreak > nul
goto loop
