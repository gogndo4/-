@echo off
chcp 65001 >nul
echo [자존노트 동기화 실행]
python "%~dp0sync_esteem.py"
echo.
echo 로그 파일: %~dp0sync_esteem.log
pause
