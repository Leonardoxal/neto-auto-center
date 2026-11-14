@echo off
rem Mantém as notas de venda do TGA sincronizadas com o site (envia as novas a cada 2 minutos).
rem Para iniciar com o Windows: Win+R, digite shell:startup e coloque aqui um ATALHO para este arquivo.
title Sincronizar notas do TGA
cd /d "%~dp0.."
"%APPDATA%\fnm\aliases\default\node.exe" scripts\sincronizar-notas.mjs --enviar --vigiar
pause
