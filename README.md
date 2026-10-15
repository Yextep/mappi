# Mappi

App Android con el mapa de los lugares de comida de Barrancabermeja (Santander, Colombia). Busca por plato (pizza, hamburguesa, salchipapa, arepa…), abre la ficha de cada lugar y te manda a Google Maps o Waze para llegar.

Autor: Daniel Lezcano (Yextep).

## Instalar

Descarga `Mappi.apk` desde las [releases](https://github.com/Yextep/mappi/releases/latest) e instálalo. Requiere Android 7.0 o posterior. Todas las versiones se firman con la misma clave, así que cada versión nueva se instala encima de la anterior sin perder favoritos ni visitas.

Desde la 1.1, Mappi avisa sola cuando hay una versión nueva: al abrirse consulta [`version.json`](version.json) y, si hay una más reciente, muestra «Mappi X está disponible» con **Descargar** y **Más tarde**. Si eliges «Más tarde», no vuelve a preguntar en tres días, pero el menú marca la versión nueva con un punto. La 1.0 no tiene este aviso: hay que instalar la 1.1 a mano una vez.

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
- `version.json` y `scripts/publicar_version.py`: el aviso de versión nueva.

## Compilar y probar

GitHub Actions compila con cada cambio en `main` ([Compilar Mappi](.github/workflows/mappi-apk.yml)):

1. `scripts/prueba_navegador.cjs` recorre la interfaz en Chromium con tamaño de celular: búsqueda por plato, tocar un punto del mapa, ficha, favoritos y visitas después de recargar, video compartido, lugar propio, filtros, ocultar y restaurar, y el aviso de versión nueva (normal y obligatoria).
2. Compila el APK y ejecuta `MappiSmokeTest` en un emulador Android 15: mapa, búsqueda, ficha y botón atrás; favoritos entre aperturas; video compartido; aviso de versión nueva y bloqueo de servidores.
3. Firma `Mappi.apk` y guarda el APK, los resultados y las capturas como artefactos.

Para regenerar la lista a mano:

```sh
python -m pip install duckdb
python scripts/descargar_fuentes.py fuentes
python scripts/unir_fuentes.py fuentes datos/lugares.json docs/lugares.csv
```

## Publicar una versión nueva

1. Sube `versionCode` (un número entero, siempre mayor) y `versionName` en `app/build.gradle`, y haz push a `main`.
2. Espera a que «Compilar Mappi» termine en verde y anota el número de la ejecución.
3. Publícala:

   ```sh
   python scripts/publicar_version.py publicar RUN_ID --notas "Qué cambió, en una o dos frases"
   git pull
   ```

   El script comprueba que el APK tiene la firma de Mappi, crea la release `vX.Y` con `Mappi.apk` y cambia `version.json`. Desde ese momento, las apps instaladas ofrecen la descarga la próxima vez que se abran.

Otras órdenes: `estado` muestra el `version.json` publicado; `obligatoria` exige la última versión (las anteriores muestran solo el aviso, sin «Más tarde», hasta actualizar) y `opcional` quita esa exigencia. `--obligatoria` al publicar hace lo mismo en un paso.

| Campo de `version.json` | Efecto en las apps instaladas |
|---|---|
| `version`, `codigo` | Última versión publicada. Si `codigo` es mayor que el `versionCode` instalado, aparece el aviso. |
| `apk` | Descarga de esa versión. Solo se aceptan enlaces a las releases de este repositorio. |
| `notas` | Novedades que se muestran en el aviso. |
| `codigo_minimo` | Las versiones con un código menor quedan en el aviso hasta actualizar. |

La dirección de `version.json` va dentro de cada APK instalado: el repositorio debe seguir siendo público y conservar su nombre y el archivo su ruta.
