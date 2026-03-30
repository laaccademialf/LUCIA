<# 
  LUCIA Print Proxy — Локальний проксі друку етикеток
  ===================================================
  Встановіть один раз на ОДНОМУ ПК у закладі (касовий, адмін, будь-який
  що завжди увімкнений). Після цього ВСІ пристрої у тій самій мережі 
  (телефони, планшети, інші ПК) зможуть друкувати етикетки.

  Встановлення (один раз, запустити від адміністратора):
    install-print-proxy.bat

  Або вручну:
    powershell -ExecutionPolicy Bypass -File print-proxy.ps1

  Видалення:
    uninstall-print-proxy.bat
#>

$Port = 6101

# --- Detect own LAN IP for display ---
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown"
} | Select-Object -First 1).IPAddress

# --- Start HTTP listener on ALL interfaces ---
$listener = [System.Net.HttpListener]::new()
try {
    # Try to listen on all interfaces (requires admin/elevated)
    $listener.Prefixes.Add("http://+:$Port/")
} catch {
    # Fallback to localhost only if not elevated
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    $lanIp = "localhost (тільки цей ПК — запустіть від адміністратора для доступу з мобільних)"
}
$listener.Start()

Write-Host ""
Write-Host "  ==================================================" -ForegroundColor Cyan
Write-Host "  LUCIA Print Proxy" -ForegroundColor Cyan  
Write-Host "  ==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Цей ПК:     http://${lanIp}:$Port" -ForegroundColor Green
Write-Host "  Localhost:   http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "  Для мобільних та інших ПК у мережі вкажіть:" -ForegroundColor White
Write-Host "  Proxy URL =  http://${lanIp}:$Port" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Не закривайте це вікно поки друкуєте етикетки." -ForegroundColor White
Write-Host "  Ctrl+C щоб зупинити." -ForegroundColor White
Write-Host ""

function Send-ToPrinter {
    param([string]$PrinterIp, [int]$PrinterPort, [byte[]]$Data)
    
    $tcp = $null
    $stream = $null
    try {
        $tcp = [System.Net.Sockets.TcpClient]::new()
        $tcp.SendTimeout = 10000
        $tcp.ReceiveTimeout = 10000
        
        $connectTask = $tcp.ConnectAsync($PrinterIp, $PrinterPort)
        if (-not $connectTask.Wait(10000)) {
            throw "Connection timeout ($PrinterIp`:$PrinterPort)"
        }
        
        $stream = $tcp.GetStream()
        $stream.Write($Data, 0, $Data.Length)
        $stream.Flush()
        
        return $true
    }
    finally {
        if ($stream) { $stream.Close() }
        if ($tcp) { $tcp.Close() }
    }
}

function Get-RequestBody {
    param($Request)
    
    $reader = [System.IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

function Send-Response {
    param($Response, [int]$StatusCode, [string]$Json)
    
    # CORS headers
    $Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $Response.Headers.Add("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
    $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($Json)
    $Response.ContentLength64 = $buffer.Length
    $Response.OutputStream.Write($buffer, 0, $buffer.Length)
    $Response.OutputStream.Close()
}

# --- Main loop ---
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $path = $request.Url.AbsolutePath
        $method = $request.HttpMethod
        
        # CORS preflight
        if ($method -eq "OPTIONS") {
            Send-Response -Response $response -StatusCode 204 -Json ""
            continue
        }
        
        # Health check
        if ($path -eq "/health" -and $method -eq "GET") {
            Send-Response -Response $response -StatusCode 200 -Json '{"ok":true,"service":"lucia-print-proxy"}'
            continue
        }
        
        # Print endpoint
        if ($path -eq "/print" -and $method -eq "POST") {
            try {
                $bodyText = Get-RequestBody -Request $request
                $body = $bodyText | ConvertFrom-Json
                
                $data = $body.data
                $printerIp = [string]$body.printerIp
                $printerPort = if ($body.printerPort) { [int]$body.printerPort } else { 9100 }
                
                if (-not $data -or -not $printerIp) {
                    Send-Response -Response $response -StatusCode 400 -Json '{"ok":false,"error":"Missing data or printerIp"}'
                    continue
                }
                
                # Validate IP (basic)
                if ($printerIp -notmatch '^[\d.]+$' -and $printerIp -notmatch '^[a-zA-Z0-9._-]+$') {
                    Send-Response -Response $response -StatusCode 400 -Json '{"ok":false,"error":"Invalid printer IP"}'
                    continue
                }
                
                $bytes = [Convert]::FromBase64String($data)
                
                $ts = Get-Date -Format "HH:mm:ss"
                Write-Host "  [$ts] Друк -> $printerIp`:$printerPort ($($bytes.Length) bytes)" -ForegroundColor White -NoNewline
                
                Send-ToPrinter -PrinterIp $printerIp -PrinterPort $printerPort -Data $bytes | Out-Null
                
                Write-Host " OK" -ForegroundColor Green
                Send-Response -Response $response -StatusCode 200 -Json '{"ok":true}'
            }
            catch {
                Write-Host " FAIL: $($_.Exception.Message)" -ForegroundColor Red
                $errMsg = $_.Exception.Message -replace '"', '\"'
                Send-Response -Response $response -StatusCode 500 -Json "{`"ok`":false,`"error`":`"$errMsg`"}"
            }
            continue
        }
        
        # 404
        Send-Response -Response $response -StatusCode 404 -Json '{"ok":false,"error":"Not found"}'
    }
}
finally {
    $listener.Stop()
    Write-Host "`nProxy зупинено." -ForegroundColor Yellow
}
