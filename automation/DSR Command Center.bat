@echo off
REM DSR Command Center launcher
REM Double-click this to start your daily DSR workflow.

title DSR Command Center
cd /d "%~dp0"
python command_center.py
if errorlevel 1 (
    echo.
    echo [!] Command center exited with an error.
    pause
)
