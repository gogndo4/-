@echo off
chcp 65001 >nul
echo [출력 시스템 동기화 실행]
python "%~dp0sync_output.py"
echo.
echo 로그 파일: %~dp0sync_output.log
pause
