# mystationbox · impressão automática da estação (15/11/2026).
# Corre de 15 em 15 minutos (tarefa «mystationbox impressao»): pergunta à app se há FlashRede por imprimir e manda-as para a impressora escolhida.
# Não apaga nada e só fala com a função msb-imprimir, com o código desta estação (guardado protegido pelo Windows em codigo.dat).
$ErrorActionPreference = 'Stop'
$pasta = Join-Path $env:LOCALAPPDATA 'mystationbox-impressao'
$url = 'https://cttxkrqduclhaqmaxyls.supabase.co/functions/v1/msb-imprimir'
$log = Join-Path $pasta 'impressao.log'
function Registo($t) { Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $t) -Encoding UTF8 }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $seguro = Get-Content (Join-Path $pasta 'codigo.dat') | ConvertTo-SecureString
  $codigo = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro))
  $impressora = (Get-Content (Join-Path $pasta 'impressora.txt') -Raw -Encoding UTF8).Trim()
  $sumatra = (Get-ChildItem (Join-Path $pasta 'sumatra') -Filter 'SumatraPDF*.exe' -Recurse | Select-Object -First 1).FullName
  $cab = @{ 'x-impressora' = $codigo }
  function Pedido($corpo) { ,([Text.Encoding]::UTF8.GetBytes(($corpo | ConvertTo-Json -Compress))) }   # a vírgula impede o PowerShell de desfazer os bytes numa lista
  $r = Invoke-RestMethod -Uri $url -Method Post -Headers $cab -ContentType 'application/json; charset=utf-8' -Body (Pedido @{ acao = 'pendentes'; impressora = $impressora }) -UseBasicParsing
  foreach ($f in $r.pendentes) {
    try {
      for ($i = 0; $i -lt $f.n; $i++) {
        $pdf = Join-Path $env:TEMP ("msb_flashrede_" + $f.id + "_" + $i + ".pdf")
        Invoke-WebRequest -Uri $url -Method Post -Headers $cab -ContentType 'application/json; charset=utf-8' -Body (Pedido @{ acao = 'ficheiro'; id = [int]$f.id; i = $i }) -OutFile $pdf -UseBasicParsing
        $p = Start-Process -FilePath $sumatra -ArgumentList @('-print-to', ('"' + $impressora + '"'), '-print-settings', 'fit', '-silent', '-exit-on-print', ('"' + $pdf + '"')) -Wait -PassThru -WindowStyle Hidden
        if ($p.ExitCode -ne 0) { throw ("O SumatraPDF terminou com o codigo " + $p.ExitCode) }
        Remove-Item $pdf -ErrorAction SilentlyContinue
      }
      Invoke-RestMethod -Uri $url -Method Post -Headers $cab -ContentType 'application/json; charset=utf-8' -Body (Pedido @{ acao = 'impresso'; id = [int]$f.id; ok = $true }) -UseBasicParsing | Out-Null
      Registo ("Impresso: FlashRede " + $f.id + " (" + $f.n + " PDF)")
    } catch {
      Registo ("Falhou a FlashRede " + $f.id + ": " + $_.Exception.Message)
      Invoke-RestMethod -Uri $url -Method Post -Headers $cab -ContentType 'application/json; charset=utf-8' -Body (Pedido @{ acao = 'impresso'; id = [int]$f.id; ok = $false; erro = $_.Exception.Message }) -UseBasicParsing | Out-Null
    }
  }
} catch {
  Registo ("Erro: " + $_.Exception.Message)
}
if ((Test-Path $log) -and (Get-Item $log).Length -gt 200KB) { Get-Content $log -Tail 500 | Set-Content $log -Encoding UTF8 }
