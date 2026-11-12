Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.ts' } |
  Select-Object ProcessId, CreationDate |
  Format-Table