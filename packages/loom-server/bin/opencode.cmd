@echo off
REM OpenCode wrapper script for Windows

set "NODE=%LOOM_NODE_PATH%"
if "%NODE%"=="" set "NODE=node.exe"

set "SCRIPT_DIR=%~dp0"
set "SERVER_LIB=%SCRIPT_DIR%..\lib\cli.js"

"%NODE%" "%SERVER_LIB%" %*
