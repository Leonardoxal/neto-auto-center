# Lê a planilha "A Receber, Em Aberto" do TGA (.xls ou .xlsx) pelo Excel, em modo somente leitura, e escreve um JSON no console.
# Usado por importar-tga.mjs. Precisa do Microsoft Excel instalado. Não grava nem altera o arquivo.
param([Parameter(Mandatory)][string]$Arquivo)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$wb = $null
try {
  $wb = $excel.Workbooks.Open((Resolve-Path -LiteralPath $Arquivo).Path, 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $n = $ws.UsedRange.Rows.Count
  $v = $ws.Range("A1:S$n").Value2
  $linhas = New-Object System.Collections.ArrayList
  $total = $null
  for ($r = 1; $r -le $n; $r++) {
    $doc = $v[$r,9]
    if ($doc -is [string] -and $doc -match '^\S+-\d+$') {
      $o = [ordered]@{}
      $o.cliente = [string]($v[$r,1]); $o.emissao = [double]($v[$r,6]); $o.vencimento = [double]($v[$r,7]); $o.doc = $doc
      $o.portador = [string]($v[$r,10]); $o.td = [string]($v[$r,11]); $o.original = [double]($v[$r,12]); $o.juros = [double]($v[$r,13])
      $o.multa = [double]($v[$r,15]); $o.total = [double]($v[$r,16]); $o.dias = [double]($v[$r,18])
      [void]$linhas.Add([pscustomobject]$o)
    } elseif (([string]($v[$r,1])) -match 'T\s*O\s*T\s*A\s*L\s+G\s*E\s*R\s*A\s*L' -and $null -ne $v[$r,16]) {
      $total = [double]($v[$r,16])
    }
  }
  [pscustomobject]@{ total = $total; linhas = @($linhas) } | ConvertTo-Json -Depth 4 -Compress
} finally {
  if ($wb) { $wb.Close($false) }
  $excel.Quit()
}
