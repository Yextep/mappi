# Mappi

App Android con el mapa de los lugares de comida de Barrancabermeja (Santander, Colombia). Busca por plato (pizza, hamburguesa, salchipapa, arepa…), abre la ficha de cada lugar y te manda a Google Maps o Waze para llegar.

Autor: Daniel Lezcano (Yextep).

## Instalar

Descarga `Mappi.apk` desde las [releases](https://github.com/Yextep/mappi/releases/latest) e instálalo. Requiere Android 7.0 o posterior. Todas las versiones se firman con la misma clave, así que cada versión nueva se instala encima de la anterior sin perder favoritos ni visitas.

## Funciones

- **Mapa** de Barrancabermeja con tu ubicación y un punto por lugar, de un color según el tipo: restaurante, comida rápida, café y postres, o bar. Al acercarte aparecen los nombres.
- **Buscar** por plato o por nombre. Los botones de platos muestran en el mapa los lugares que los venden. Los locales de comidas rápidas que no dicen qué venden salen como «suele tener salchipapa», para no darlo por confirmado.
- **Ficha** con el estado en el registro mercantil, los botones «Cómo llegar» (Google Maps) e «Ir con Waze», teléfono, WhatsApp, Facebook, Instagram y dirección. Las fotos y la carta están en las redes del lugar.
- **Favoritos** y **Ya fui**, con fecha y nota. Filtros: Todos, Favoritos, Ya fui y No he ido.
- **Videos**: en TikTok o Instagram toca «Compartir» y elige «Guardar en Mappi». Eliges el lugar y el enlace queda en su ficha con la fecha, como señal de que sigue activo. Si el lugar no está en el mapa, lo agregas ahí mismo.
- **Agregar lugares** que no estén en el mapa, **marcar platos** que viste y **ocultar los que cerraron** (se pueden restaurar desde el menú).
- **Respaldo**: guardar y restaurar un archivo con todo lo anterior.
- Tema claro u oscuro según el teléfono.

Tus favoritos, visitas, videos y lugares agregados se guardan solo en el teléfono. Tu ubicación no sale del teléfono. La app solo se conecta a `tiles.openfreemap.org` (el mapa) y a `raw.githubusercontent.com` (la lista de lugares); cualquier otro servidor está bloqueado.

## De dónde salen los lugares

| Fuente | Qué aporta | Licencia |
|---|---|---|
| [Overture Maps](https://overturemaps.org), tema *places* | Lugares de páginas de Facebook (datos de Meta): ubicación, teléfono y redes | CDLA-Permissive-2.0 |
| [OpenStreetMap](https://www.openstreetmap.org) | Lugares mapeados por la comunidad | ODbL |
| [Registro mercantil](https://www.datos.gov.co/Comercio-Industria-y-Turismo/Establecimientos-Agencias-Sucursales/nb3d-v3n7) (Confecámaras, datos.gov.co) | Si la matrícula del negocio está al día, sin renovar o cancelada | CC BY-SA 4.0 |

La acción [Actualizar lugares](.github/workflows/actualizar-datos.yml) se ejecuta el día 5 de cada mes. Descarga las tres fuentes, las une en `datos/lugares.json` y publica el cambio. La app revisa esa lista una vez al día y la usa si es más nueva que la que trae el APK. Si una fuente falla y la lista sale con menos de 450 lugares, no se publica.

Los negocios cuya matrícula fue cancelada se ocultan por defecto como «posibles cerrados». El nombre en Facebook no siempre coincide con el del registro, así que es una señal y no una prueba: desde la ficha puedes confirmar «Sigue abierto» o «Ya cerró». `docs/lugares.csv` tiene la misma lista para revisarla en una hoja de cálculo.

El mapa es de [OpenFreeMap](https://openfreemap.org): gratis, sin clave de API, con datos de OpenStreetMap y OpenMapTiles.

## Estructura

- `app/src/main/assets/web/`: la interfaz (HTML, CSS y JavaScript), con [MapLibre GL JS](https://maplibre.org) 4.7.1 incluido.
- `app/src/main/java/com/mappi/app/MainActivity.java`: el WebView, los permisos de ubicación, «Compartir», las rutas externas y el respaldo.
- `datos/lugares.json`: la lista que viaja en el APK y que se actualiza cada mes.
- `scripts/descargar_fuentes.py` y `scripts/unir_fuentes.py`: arman la lista.

## Compilar y probar

GitHub Actions compila con cada cambio en `main` ([Compilar Mappi](.github/workflows/mappi-apk.yml)):

1. `scripts/prueba_navegador.cjs` recorre la interfaz en Chromium con tamaño de celular: búsqueda por plato, tocar un punto del mapa, ficha, favoritos y visitas después de recargar, video compartido, lugar propio, filtros, ocultar y restaurar.
2. Compila el APK y ejecuta `MappiSmokeTest` en un emulador Android 15: mapa, búsqueda, ficha y botón atrás; favoritos entre aperturas; video compartido y bloqueo de servidores.
3. Firma `Mappi.apk` y guarda el APK, los resultados y las capturas como artefactos.

Para regenerar la lista a mano:

```sh
python -m pip install duckdb
python scripts/descargar_fuentes.py fuentes
python scripts/unir_fuentes.py fuentes datos/lugares.json docs/lugares.csv
```

Para una versión nueva, sube `versionCode` y `versionName` en `app/build.gradle` y `VERSION_APP` en `app/src/main/assets/web/app.js`.
