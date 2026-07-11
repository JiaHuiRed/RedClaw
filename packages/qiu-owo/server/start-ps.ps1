$logFile = "D:\AI\KLX\Qiu\RedClaw\packages\qiu-owo\server\server.log"
$proc = Start-Process -FilePath "node.exe" -ArgumentList "`"D:\AI\KLX\Qiu\RedClaw\packages\qiu-owo\server\dev.mjs`"" -WorkingDirectory "D:\AI\KLX\Qiu\RedClaw\packages\qiu-owo\server" -PassThru -NoNewWindow -RedirectStandardOutput $logFile -RedirectStandardError $logFile
Write-Host "PID: $($proc.Id)"
