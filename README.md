# Mappi

App Android con el mapa de los negocios y locales de Colombia: restaurantes, comidas rápidas, supermercados, tiendas, droguerías, papelerías, ferreterías, bares, clínicas, hospitales, bancos, talleres y más. Detecta el municipio donde estás, muestra sus lugares y te manda a Google Maps o Waze para llegar.

Autor: Daniel Lezcano (Yextep).

## Instalar

Descarga `Mappi.apk` desde las [releases](https://github.com/Yextep/mappi/releases/latest) e instálalo. Requiere Android 7.0 o posterior. Todas las versiones se firman con la misma clave, así que cada versión nueva se instala encima de la anterior sin perder favoritos, calificaciones ni visitas.

Desde la 1.1, Mappi avisa sola cuando hay una versión nueva: al abrirse consulta [`version.json`](version.json) y, si hay una más reciente, muestra «Mappi X está disponible» con **Descargar** y **Más tarde**. Si eliges «Más tarde», no vuelve a preguntar en tres días, pero el menú marca la versión nueva con un punto. La 1.0 no tiene este aviso: hay que instalar una versión nueva a mano una vez.

## Funciones

- **Tu municipio**: con el permiso de ubicación, Mappi abre el municipio donde estás. También puedes elegir cualquiera de los 1.121 municipios con datos. Solo se descarga el que abres (Barrancabermeja pesa unos 150 KB; Medellín, el más grande, unos 8 MB) y queda guardado para usarlo sin internet.
- **Categorías**: Restaurantes, Comida rápida, Cafés y panaderías, Bares, Supermercados y tiendas, Droguerías, Salud, Ropa, Ferreterías, Papelerías, Tecnología, Hogar, Belleza, Hoteles, Bancos, Talleres, Gasolineras, Colegios, Deporte, Mascotas, Iglesias, Entidades públicas, Entretenimiento, Transporte, Otras tiendas y Empresas.
- **Buscar** por nombre, por categoría («droguería», «ferretería», «cajero») o por plato («pizza», «salchipapa»). Con una categoría de comida aparecen los botones de platos.
- **Ficha** con el estado en el registro mercantil, los botones «Cómo llegar» (Google Maps) e «Ir con Waze», teléfono, WhatsApp, Facebook, Instagram y dirección.
- **Posibles cerrados**: si la matrícula mercantil del negocio está cancelada, se oculta por defecto y la ficha lo advierte; si no se renueva hace tres años o más, la ficha también avisa. Desde la ficha puedes confirmar «Sigue abierto» o «Ya cerró».
- **Favoritos**, **Ya fui** (con fecha y nota) y **Calificaciones** de 1 a 5 estrellas con un comentario corto. Son personales: solo tú las ves. La vista «Calificados» ordena tus lugares de mejores a peores, o al revés. Lo marcado en otros municipios sigue en tus listas.
- **Videos**: en TikTok o Instagram toca «Compartir» y elige «Guardar en Mappi». Eliges el lugar y el enlace queda en su ficha con la fecha, como señal de que sigue activo.
- **Agregar lugares** que no estén en el mapa, **marcar platos** que viste y **ocultar los que cerraron** (se pueden restaurar desde el menú).
- **Respaldo**: guardar y restaurar un archivo con todo lo anterior.
- Tema claro u oscuro según el teléfono.

Tus favoritos, calificaciones, visitas, videos y lugares agregados se guardan solo en el teléfono. Tu ubicación no sale del teléfono: el municipio se calcula ahí mismo. La app solo se conecta a `tiles.openfreemap.org` (el mapa) y a `raw.githubusercontent.com` (los datos y el aviso de versión); cualquier otro servidor está bloqueado.

## De dónde salen los lugares

| Fuente | Qué aporta | Licencia |
|---|---|---|
| [Overture Maps](https://overturemaps.org), tema *places* | Unos 640.000 lugares de Colombia con ubicación, teléfono y redes (datos de Meta, Microsoft, Foursquare y otros) | CDLA-Permissive-2.0 y ODbL |
| [OpenStreetMap](https://www.openstreetmap.org) (extracto de [Geofabrik](https://download.geofabrik.de/south-america/colombia.html)) | Unos 178.000 lugares con nombre, mapeados por la comunidad | ODbL |
| [Industria y Comercio de Medellín](https://www.medellin.gov.co/servidormapas/rest/services/ccio_ind_turism/VC_Act_Comercial_Empresarial/MapServer) (Secretaría de Hacienda) | Unos 360.000 establecimientos activos de Medellín con coordenadas | CC BY-SA 4.0 |
| [Registro mercantil](https://www.datos.gov.co/Comercio-Industria-y-Turismo/Establecimientos-Agencias-Sucursales/nb3d-v3n7) (Confecámaras, datos.gov.co) | Si la matrícula de un negocio está al día, sin renovar o cancelada (3,6 millones de matrículas de los últimos 10 años) | CC BY-SA 4.0 |
| [geoBoundaries](https://www.geoboundaries.org) (vía Overture) y [DIVIPOLA](https://www.datos.gov.co/d/pqwj-3fi4) | Límites y códigos DANE de los municipios | CC BY 4.0 |

El registro mercantil no trae dirección ni coordenadas, así que no agrega lugares al mapa: se cruza por nombre con los lugares de las otras fuentes. Como no hay una tabla pública de qué cámara de comercio atiende cada municipio, se deduce de los datos: cada municipio queda con la cámara que más nombres comparte con él. El nombre en Facebook no siempre coincide con el del registro, así que «matrícula cancelada» es una señal y no una prueba.

En Medellín se descartan los contribuyentes sin establecimiento, los «SIN NOMBRE» y los que solo tienen el nombre de una persona, porque suelen ser su vivienda.

Para no mostrar dos veces el mismo negocio, se comparan los lugares cercanos. Se unen si se llaman igual, si comparten teléfono, página o dirección, o si todas las palabras que distinguen a uno están en el otro y alguna es poco común en el municipio: «Kabuki Cocina Japonesa» y «Kabuki Cocina Peruana y Japonesa». No se unen si el nombre muestra que son sitios distintos: otro número de sede («Dulces Sueños 1» y «Dulces Sueños 2»), otro tipo de sitio («Parque San Vicente» e «Iglesia San Vicente»), el cajero junto al banco o un local dentro de un centro comercial. El nombre del barrio o de la calle («Laureles», «La 70») no cuenta, porque lo llevan muchos negocios de la zona. Un negocio que aparece con nombres del todo distintos en cada fuente, por ejemplo el nombre legal en Industria y Comercio y el comercial en Facebook, no se puede reconocer y puede verse dos veces.

La acción [Actualizar lugares](.github/workflows/actualizar-datos.yml) se ejecuta el día 5 de cada mes: descarga las fuentes, une el mismo negocio visto en varias, lo clasifica en una categoría, lo cruza con el registro y publica un archivo por municipio en la rama [`datos`](https://github.com/Yextep/mappi/tree/datos). Si una fuente falla y los datos salen recortados, no se publica nada y queda el mes anterior. La app revisa una vez al día si hay datos nuevos.

Otras fuentes revisadas: [Foursquare OS Places](https://huggingface.co/datasets/foursquare/fsq-os-places) (Apache 2.0) necesita una cuenta de Hugging Face; [AllThePlaces](https://www.alltheplaces.xyz) (CC0) aporta cadenas que Overture ya incluye en parte; el [REPS](https://www.datos.gov.co/d/c36g-9fc2) del Ministerio de Salud (76.821 sedes) trae direcciones pero no coordenadas. Google Places, TikTok e Instagram no permiten copiar sus datos.

El mapa es de [OpenFreeMap](https://openfreemap.org): gratis, sin clave de API, con datos de OpenStreetMap y OpenMapTiles.

## Estructura

- `app/src/main/assets/web/`: la interfaz (HTML, CSS y JavaScript), con [MapLibre GL JS](https://maplibre.org) 4.7.1 incluido. Los puntos del mapa se dibujan con teselas vectoriales que la app arma en el teléfono a partir de los datos del municipio, sin pasar por GeoJSON: así Medellín, con más de 300.000 lugares, se mueve fluida.
- `app/src/main/java/com/mappi/app/MainActivity.java`: el WebView, los permisos de ubicación, «Compartir», las rutas externas y el respaldo.
- `datos/`: el índice de municipios y sus límites, incluidos en el APK para arrancar sin conexión.
- `scripts/descargar_fuentes.py`, `scripts/categorias.py` y `scripts/armar_datos.py`: arman los datos.
- `version.json` y `scripts/publicar_version.py`: el aviso de versión nueva.

## Compilar y probar

GitHub Actions compila con cada cambio en `main` ([Compilar Mappi](.github/workflows/mappi-apk.yml)):

1. `scripts/prueba_navegador.cjs` recorre la interfaz en Chromium con tamaño de celular y los datos de la rama `datos`: detectar el municipio, categorías, platos, búsqueda, ficha, favoritos, calificaciones y visitas después de recargar, video compartido, lugar propio, filtros, ocultar y restaurar, cambiar a Medellín y volver a un favorito de otro municipio, lo guardado con la versión 1 y el aviso de versión nueva (normal y obligatoria).
2. Compila el APK y ejecuta `MappiSmokeTest` en un emulador Android 15: mapa, búsqueda, ficha y botón atrás; favoritos y calificación entre aperturas; video compartido; aviso de versión nueva y bloqueo de servidores.
3. Firma `Mappi.apk` y guarda el APK, los resultados y las capturas como artefactos.

Para regenerar los datos a mano (tarda unos 20 minutos y necesita unos 4 GB de memoria):

```sh
python -m pip install duckdb
sudo apt-get install osmium-tool
python scripts/descargar_fuentes.py fuentes
python scripts/armar_datos.py fuentes salida
node scripts/prueba_navegador.cjs salida
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

## Licencia

El código de Mappi se publica bajo la [PolyForm Noncommercial 1.0.0 con la Commons Clause](LICENSE): puedes usarlo, estudiarlo y modificarlo sin fines comerciales, siempre que conserves el aviso de autoría de Daniel Lezcano (Yextep) y la licencia completa. No se permite venderlo ni ofrecer un producto o servicio pago basado en él.

Los datos de lugares no quedan bajo esa licencia: conservan la de cada fuente (ODbL, CC BY-SA 4.0, CDLA-Permissive-2.0 y CC BY 4.0), que permiten reutilizarlos dando crédito a cada fuente. MapLibre GL JS conserva su licencia BSD-3-Clause.
