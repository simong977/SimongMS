$baseUrl = "https://raw.githubusercontent.com/simong977/SimongMS/main/resourcepacks"
$packsPath = Join-Path $PSScriptRoot "resourcepacks"
$packFiles = Get-ChildItem -Path $packsPath -Filter *.zip
$entries = @()

foreach ($file in $packFiles) {
    $entry = @{
        filename = $file.Name
        url = "$baseUrl/$($file.Name)"
    }
    $entries += $entry
}

# ��� ���� ����
$entries | ConvertTo-Json -Depth 2 | Out-File "$PSScriptRoot\resourcepacklist.json" -Encoding UTF8
