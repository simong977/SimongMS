$tag = "v1.0.0"
$repo = "simong977/SimongMS"
$output = @()

# ✅ 1. 예외 파일 고정된 URL로 추가 (절대 경로, 변수 안 씀)
$output += [PSCustomObject]@{
    filename = "Cobblemon-neoforge-1.6.1+1.21.1.jar"
    url      = "https://github.com/simong977/SimongMS/releases/download/v1.0.0/Cobblemon-neoforge-1.6.1+1.21.1.jar"
}

# ✅ 2. mods 폴더에서 나머지 파일 처리
$mods = Get-ChildItem -Path ".\mods" -Filter "*.jar"

foreach ($mod in $mods) {
    $filename = $mod.Name

    # 예외 파일은 중복 추가하지 않음
    if ($filename -eq "Cobblemon-neoforge-1.6.1+1.21.1.jar") {
        continue
    }

    $url = "https://github.com/$repo/releases/download/$tag/$filename"

    $output += [PSCustomObject]@{
        filename = $filename
        url      = $url
    }
}

# ✅ 3. JSON 저장
$output | ConvertTo-Json -Depth 3 | Out-File -Encoding UTF8 "modlist.json"
