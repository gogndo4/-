@echo off
chcp 65001 >nul
echo [스레드 초안 생성 실행]
python "%~dp0draft_threads.py"
echo.
echo 로그 파일: %~dp0draft_threads.log
pause
