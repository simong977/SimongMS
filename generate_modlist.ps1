$tag = "v1.0.0"
$repo = "simong977/SimongMS"
$output = @()

# ✅ 예외 파일은 절대 URL로 하드코딩 (변수 쓰지 않음)
$output += [PSCustomObject]@{
    filename = "cobblemon-spawn-notification-1.6-neoforge-1.3.7.jar"
    url      = "https://github.com/simong977/SimongMS/releases/download/v1.0.0/cobblemon-spawn-notification-1.6-neoforge-1.3.7.jar"
}

# mods 폴더의 .jar 파일들 가져오기
$mods = Get-ChildItem -Path ".\mods" -Filter "*.jar"

foreach ($mod in $mods) {
    $filename = $mod.Name

    # 예외 파일은 이미 추가됐으므로 제외
    if ($filename -eq "cobblemon-spawn-notification-1.6-neoforge-1.3.7.jar") {
        continue
    }

    $url = "https://github.com/$repo/releases/download/$tag/$filename"

    $output += [PSCustomObject]@{
        filename = $filename
        url      = $url
    }
}

# JSON으로 저장
$output | ConvertTo-Json -Depth 3 | Out-File -Encoding UTF8 "modlist.json"
