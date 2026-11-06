@echo off
rem ---------------------------------------------------------------------------
rem  DSH desktop pet / manual launcher (double-click this file)
rem
rem  Why this exists: the DSH host process cannot always create child processes
rem  (observed: CreateProcess succeeds but the PowerShell engine never starts --
rem  no events, no script execution). Starting it from your own session avoids
rem  that entirely: same window, same features.
rem
rem  The pet registers its own pid in %USERPROFILE%\.dsh-skin\pet.pid, so the
rem  panel still shows "running" and its "put her away" button can stop her.
rem
rem  ASCII only on purpose: cmd.exe parses this file with the active code page,
rem  and non-ASCII comments break the parser before chcp can take effect.
rem ---------------------------------------------------------------------------
setlocal
set "PS1=%~dp0pet.ps1"
set "CFG=%USERPROFILE%\.dsh-skin\pet-config.json"

if not exist "%PS1%" (
  echo [dsh-skin] pet.ps1 not found next to this file.
  pause
  exit /b 1
)

if not exist "%CFG%" (
  echo [dsh-skin] config not found: %CFG%
  echo Open DSH - Appearance - Desktop pet, then click "Apply" once to write it.
  pause
  exit /b 1
)

start "" /min powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%PS1%" -Config "%CFG%"
exit /b 0
