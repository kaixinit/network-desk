param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$notes = New-Object 'System.Collections.Generic.List[string]'
function Read-Optional([string]$Name, [scriptblock]$Action) {
    try { & $Action } catch { $notes.Add($Name + ': unavailable (' + $_.Exception.GetType().Name + ')'); return $null }
}
$zone = Read-Optional 'timezone' { Get-TimeZone }
$offset = [TimeZoneInfo]::Local.GetUtcOffset([DateTime]::Now)
$sign = if ($offset.TotalMinutes -lt 0) { '-' } else { '+' }
$absoluteMinutes = [Math]::Abs([int]$offset.TotalMinutes)
$offsetLabel = '{0}{1:00}:{2:00}' -f $sign, [int][Math]::Floor($absoluteMinutes / 60), ($absoluteMinutes % 60)
$os = Read-Optional 'operating system' { Get-CimInstance Win32_OperatingSystem | Select-Object -First 1 Caption, Version, OSArchitecture }
$systemLocale = Read-Optional 'system locale' { (Get-WinSystemLocale).Name }
$homeLocation = Read-Optional 'home location' { Get-WinHomeLocation }
$languages = Read-Optional 'language list' { @(Get-WinUserLanguageList | ForEach-Object { $_.LanguageTag }) }
$proxy = Read-Optional 'Windows internet proxy' {
    $settings = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
    [ordered]@{ enabled = [bool]$settings.ProxyEnable; proxyServer = $settings.ProxyServer; autoConfigURL = $settings.AutoConfigURL }
}
$dns = Read-Optional 'configured DNS' { @(Get-DnsClientServerAddress | Where-Object { $_.ServerAddresses.Count -gt 0 } | ForEach-Object { [ordered]@{ interface = $_.InterfaceAlias; addressFamily = [string]$_.AddressFamily; servers = @($_.ServerAddresses) } }) }
$bindings = Read-Optional 'IPv6 bindings' { @(Get-NetAdapterBinding -ComponentID ms_tcpip6 | ForEach-Object { [ordered]@{ name = $_.Name; enabled = [bool]$_.Enabled } }) }
$adapters = Read-Optional 'network adapters' { @(Get-NetAdapter | ForEach-Object { [ordered]@{ name = $_.Name; description = $_.InterfaceDescription; status = [string]$_.Status; index = $_.ifIndex } }) }
$possibleTun = @($adapters | Where-Object { ($_.name + ' ' + $_.description) -match '(?i)tun|tap|wintun|clash|meta|sing.?box|wireguard' })
$notes.Add('Adapter IPv6 binding does not prove actual IPv6 traffic routing.')
$notes.Add('Configured DNS servers do not prove which resolver the browser uses.')
$notes.Add('Proxy settings and adapter names cannot verify global mode or the browser extension route.')
$notes.Add('This script reads settings only; it does not change the OS, proxy, adapters, registry or firewall.')
$report = [ordered]@{
    schema = 'network-desk/system-v1'
    collectedAt = [DateTime]::UtcNow.ToString('o')
    collector = 'Network Desk read-only PowerShell collector 1.0'
    os = [ordered]@{ name = $os.Caption; version = $os.Version; architecture = $os.OSArchitecture; processBits = [IntPtr]::Size * 8 }
    timezone = [ordered]@{ id = $zone.Id; utcOffset = $offsetLabel }
    region = [ordered]@{ culture = [Globalization.CultureInfo]::CurrentCulture.Name; uiLanguage = [Globalization.CultureInfo]::CurrentUICulture.Name; systemLocale = $systemLocale; homeLocation = [string]$homeLocation.HomeLocation; geoId = $homeLocation.GeoId; languageList = @($languages) }
    network = [ordered]@{ windowsProxy = $proxy; configuredDns = @($dns); ipv6Bindings = @($bindings); adapters = @($adapters); possibleTunAdapters = @($possibleTun) }
    limitations = @($notes)
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $reportDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'reports'
    if (-not (Test-Path -LiteralPath $reportDirectory)) { New-Item -ItemType Directory -Path $reportDirectory | Out-Null }
    $OutputPath = Join-Path $reportDirectory ('system-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
}
$fullOutput = [IO.Path]::GetFullPath($OutputPath)
$encoding = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($fullOutput, ($report | ConvertTo-Json -Depth 12), $encoding)
Write-Output ('System report saved: ' + $fullOutput)
