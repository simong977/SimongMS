$baseUrl = "https://raw.githubusercontent.com/simong977/SimongMS/main/mods"
$modsPath = Join-Path $PSScriptRoot "mods"
$modFiles = Get-ChildItem -Path $modsPath -Filter *.jar
$entries = @()

foreach ($file in $modFiles) {
    $encodedFileName = [System.Uri]::EscapeDataString($file.Name)

    $entry = @{
        filename = $file.Name                  # 실제 파일명 (공백 포함)
        url      = "$baseUrl/$encodedFileName" # 공백 → %20 등 인코딩
    }
    $entries += $entry
}

# 결과는 현재 폴더에 저장 (modlist.json)
$entries | ConvertTo-Json -Depth 2 | Out-File "$PSScriptRoot\modlist.json" -Encoding UTF8
