# mystationbox · instala a impressão automática neste PC (15/11/2026). Corre a partir do INSTALAR.bat.
# 1) guarda o código da estação protegido pelo Windows; 2) descarrega o SumatraPDF (programa gratuito que imprime PDF sem janelas);
# 3) pergunta qual é a impressora; 4) cria a tarefa que corre de 15 em 15 minutos; 5) corre uma vez para experimentar.
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$pasta = Join-Path $env:LOCALAPPDATA 'mystationbox-impressao'
New-Item -ItemType Directory -Force -Path $pasta | Out-Null
Write-Host ''
Write-Host 'mystationbox - impressao automatica das FlashRede' -ForegroundColor Cyan
Write-Host ''
# 1) código
$fc = Join-Path $aqui 'codigo.txt'
if (Test-Path $fc) {
  (Get-Content $fc -Raw).Trim() | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString | Set-Content (Join-Path $pasta 'codigo.dat')
  Remove-Item $fc
  Write-Host '1. Codigo da estacao guardado (protegido pelo Windows).' -ForegroundColor Green
} elseif (Test-Path (Join-Path $pasta 'codigo.dat')) {
  Write-Host '1. Codigo da estacao: ja estava guardado.' -ForegroundColor Green
} else { throw 'Falta o ficheiro codigo.txt nesta pasta.' }
# 2) SumatraPDF
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$sdir = Join-Path $pasta 'sumatra'
if (-not (Get-ChildItem $sdir -Filter 'SumatraPDF*.exe' -Recurse -ErrorAction SilentlyContinue)) {
  $bits = if ([Environment]::Is64BitOperatingSystem) { '-64' } else { '' }
  $zip = Join-Path $env:TEMP 'sumatra.zip'
  Write-Host '2. A descarregar o SumatraPDF (sumatrapdfreader.org)...'
  Invoke-WebRequest -Uri ("https://www.sumatrapdfreader.org/dl/rel/3.5.2/SumatraPDF-3.5.2" + $bits + ".zip") -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $sdir -Force
  Remove-Item $zip
}
Write-Host '2. SumatraPDF pronto.' -ForegroundColor Green
# 3) impressora
$lista = @(Get-CimInstance Win32_Printer | Sort-Object Name)
Write-Host ''
Write-Host '3. Impressoras deste PC:'
for ($i = 0; $i -lt $lista.Count; $i++) { Write-Host ("   " + ($i + 1) + ") " + $lista[$i].Name + $(if ($lista[$i].Default) { '   (predefinida)' } else { '' })) }
$sug = 0; for ($i = 0; $i -lt $lista.Count; $i++) { if ($lista[$i].Name -match 'OKI') { $sug = $i + 1; break } }
$esc = Read-Host ("   Numero da impressora OKI" + $(if ($sug) { " [Enter = $sug]" } else { '' }))
if (-not $esc -and $sug) { $esc = $sug }
$imp = $lista[[int]$esc - 1].Name
Set-Content (Join-Path $pasta 'impressora.txt') $imp -Encoding UTF8
Write-Host ("   Escolhida: " + $imp) -ForegroundColor Green
# 4) tarefa
Copy-Item (Join-Path $aqui 'imprimir.ps1') (Join-Path $pasta 'imprimir.ps1') -Force
$cmd = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $pasta 'imprimir.ps1') + '"'
schtasks /Create /F /TN 'mystationbox impressao' /SC MINUTE /MO 15 /TR $cmd | Out-Null
Write-Host '4. Tarefa criada: verifica de 15 em 15 minutos.' -ForegroundColor Green
# 5) experimentar
Write-Host '5. A verificar agora...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $pasta 'imprimir.ps1')
$ult = Get-Content (Join-Path $pasta 'impressao.log') -Tail 5 -ErrorAction SilentlyContinue
if ($ult) { $ult | ForEach-Object { Write-Host ("   " + $_) } } else { Write-Host '   Nada por imprimir agora. Fica a verificar sozinho.' }
Write-Host ''
Write-Host 'Instalacao concluida.' -ForegroundColor Cyan
