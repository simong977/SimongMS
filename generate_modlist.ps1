$baseUrl = "https://raw.githubusercontent.com/simong977/SimongMS/main/mods"
$modsPath = Join-Path $PSScriptRoot "mods"
$modFiles = Get-ChildItem -Path $modsPath -Filter *.jar
$entries = @()

foreach ($file in $modFiles) {
    $entry = @{
        filename = $file.Name
        url = "$baseUrl/$($file.Name)"
    }
    $entries += $entry
}

# 결과는 현재 폴더에 저장 (modlist.json)
$entries | ConvertTo-Json -Depth 2 | Out-File "$PSScriptRoot\modlist.json" -Encoding UTF8
