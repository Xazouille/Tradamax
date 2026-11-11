# Petit serveur local pour tester Tradamax sans Python (Windows PowerShell).
# Usage : powershell -ExecutionPolicy Bypass -File .claude\serveur-local.ps1
# Puis ouvrir http://localhost:8123/?demo
param([int]$Port = 8123)
$root = Split-Path -Parent $PSScriptRoot
$types = @{ ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8"; ".txt" = "text/plain; charset=utf-8"; ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg" }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Tradamax en local : http://localhost:$Port/?demo  (Ctrl+C pour arreter)"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
    if ($rel -eq "") { $rel = "index.html" }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $ok = $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $path -PathType Leaf) -and ($path -notmatch "docs-prives")
    if ($ok) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] } else { $ctx.Response.ContentType = "application/octet-stream" }
      $ctx.Response.Headers.Add("Cache-Control", "no-store")
      $ctx.Response.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne "HEAD") { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
    } catch { try { $ctx.Response.Abort() } catch {} }
  }
} finally {
  $listener.Stop()
}
