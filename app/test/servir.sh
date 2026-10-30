#!/bin/sh
# Serves the app with the shared contract fixture (pipeline/fixtures/contrato/app-data) as its
# data, on http://localhost:8766/. For node tests and browser checks before the real build lands.
set -e
raiz=$(cd "$(dirname "$0")/../.." && pwd)
destino="${TMPDIR:-/tmp}/redacao-fixture"
rm -rf "$destino"
mkdir -p "$destino"
cp -R "$raiz/app/." "$destino/"
rm -rf "$destino/data"
cp -R "$raiz/pipeline/fixtures/contrato/app-data" "$destino/data"
mkdir -p "$destino/ds"
cp "$raiz/design-system/tokens.css" "$raiz/design-system/components/bundle.css" "$raiz/design-system/components/bundle.js" "$destino/ds/"
cd "$destino"
exec python3 -m http.server "${PORTA:-8766}"
