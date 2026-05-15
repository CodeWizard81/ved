$ErrorActionPreference = 'Stop'

$buildDir = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\build') -ErrorAction SilentlyContinue
if ($null -eq $buildDir) {
  exit 0
}

$expected = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\build'))
if ($buildDir.Path -ne $expected) {
  throw "Refusing to remove unexpected build path: $($buildDir.Path)"
}

Remove-Item -LiteralPath $buildDir.Path -Recurse -Force
