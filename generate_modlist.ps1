$tag = "v1.0.0"
$repo = "simong977/SimongMS"
$output = @()

# ✅ 1. 예외 파일 고정된 URL로 추가 (URL 내 +를 %2B로 인코딩)
$output += [PSCustomObject]@{
    filename = "Cobblemon-neoforge-1.6.1+1.21.1.jar"
    url      = "https://github.com/simong977/SimongMS/releases/download/v1.0.0/Cobblemon-neoforge-1.6.1%2B1.21.1.jar"
}

# ✅ 2. mods 폴더에서 나머지 파일 처리
$mods = Get-ChildItem -Path ".\mods" -Filter "*.jar"

foreach ($mod in $mods) {
    $filename = $mod.Name

    # 예외 파일은 중복 추가하지 않음
    if ($filename -eq "Cobblemon-neoforge-1.6.1+1.21.1.jar") {
        continue
    }

    # ⚠️ 파일 이름을 URL-safe 하게 인코딩 (+ → %2B 등)
    $encodedFilename = [System.Uri]::EscapeDataString($filename)

    $url = "https://github.com/$repo/releases/download/$tag/$encodedFilename"

    $output += [PSCustomObject]@{
        filename = $filename
        url      = $url
    }
}

# ✅ 3. JSON 저장
$output | ConvertTo-Json -Depth 3 | Out-File -Encoding UTF8 "modlist.json"
