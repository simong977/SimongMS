$tag = "v1.0.0"
$repo = "simong977/SimongMS"
$output = @()

# ✅ 1. 예외 파일: 릴리즈 링크 (인코딩 처리 필요)
$output += [PSCustomObject]@{
    filename = "Cobblemon-neoforge-1.6.1+1.21.1.jar"
    url      = "https://github.com/$repo/releases/download/$tag/Cobblemon-neoforge-1.6.1%2B1.21.1.jar"
}

# ✅ 2. 나머지 mods 폴더의 파일은 raw.githubusercontent 링크 사용
$mods = Get-ChildItem -Path ".\mods" -Filter "*.jar"

foreach ($mod in $mods) {
    $filename = $mod.Name

    # 예외 파일은 제외
    if ($filename -eq "Cobblemon-neoforge-1.6.1+1.21.1.jar") {
        continue
    }

    # raw.githubusercontent.com 경로 생성
    $url = "https://raw.githubusercontent.com/$repo/main/mods/$filename"

    $output += [PSCustomObject]@{
        filename = $filename
        url      = $url
    }
}

# ✅ 3. JSON 저장
$output | ConvertTo-Json -Depth 3 | Out-File -Encoding UTF8 "modlist.json"
