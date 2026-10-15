#!/usr/bin/env bash
# Pruebas en el emulador de GitHub Actions. Ubica el emulador en Barrancabermeja y conserva las capturas.
set -u

adb emu geo fix -73.8547 7.0653 || true
./gradlew --no-daemon connectedDebugAndroidTest
estado=$?
for vista in mapa ficha video; do
    adb pull "/sdcard/Download/mappi-android-$vista.png" "docs/mappi-android-$vista.png" || true
done
exit "$estado"
