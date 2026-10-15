"""Descarga las fuentes abiertas de lugares de comida de Barrancabermeja.

- Overture Maps (tema places, datos de Meta/Facebook), recortado al límite del municipio.
- OpenStreetMap (Overpass).
- Registro mercantil de la Cámara de Comercio de Barrancabermeja (datos.gov.co, Confecámaras),
  solo actividades de comida (CIIU 56xx, 1081, 1082) y sin datos personales del propietario.

Requiere: pip install duckdb
Uso: python descargar_fuentes.py CARPETA_SALIDA [RELEASE_OVERTURE]
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import duckdb

USER_AGENT = "Mappi/0.1 (app personal de restaurantes de Barrancabermeja)"
OSM_MUNICIPIO = "R1315086"
BBOX = (-74.0950, 6.7930, -73.5381, 7.2567)  # lon_min, lat_min, lon_max, lat_max del municipio


def descargar(url, datos=None, intentos=3):
    req = urllib.request.Request(url, data=datos, headers={"User-Agent": USER_AGENT})
    for intento in range(1, intentos + 1):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:  # Overpass responde 429/504 cuando está saturado
            if e.code not in (429, 502, 503, 504) or intento == intentos:
                raise
            time.sleep(30 * intento)


def ultimo_release_overture():
    xml = descargar("https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/").decode()
    releases = [p.split("/")[1] for p in xml.split("<Prefix>")[1:] if p.startswith("release/2")]
    return max(releases)


def overture(salida, release):
    limite = json.loads(descargar(
        f"https://nominatim.openstreetmap.org/lookup?osm_ids={OSM_MUNICIPIO}&format=geojson&polygon_geojson=1"
    ))["features"][0]["geometry"]
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    fuente = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"
    x0, y0, x1, y1 = BBOX
    filas = con.execute(f"""
        SELECT to_json(t) FROM (
          SELECT * EXCLUDE (geometry), ST_X(geometry) AS lon, ST_Y(geometry) AS lat
          FROM read_parquet('{fuente}', hive_partitioning=1)
          WHERE bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1}
            AND taxonomy.hierarchy[1] = 'food_and_drink'
            AND ST_Contains(ST_GeomFromGeoJSON(?), geometry)
        ) t
    """, [json.dumps(limite)]).fetchall()
    lugares = [json.loads(f[0]) for f in filas]
    with open(f"{salida}/overture_comida_municipio.json", "w", encoding="utf-8") as f:
        json.dump(lugares, f, ensure_ascii=False)
    print(f"Overture {release}: {len(lugares)} lugares de comida")


def osm(salida):
    consulta = (
        '[out:json][timeout:90];area["name"="Barrancabermeja"]["boundary"="administrative"]->.a;'
        '(nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|ice_cream|bar|pub)$"](area.a););out center tags;'
    )
    datos = descargar("https://overpass-api.de/api/interpreter",
                      urllib.parse.urlencode({"data": consulta}).encode())
    with open(f"{salida}/osm.json", "wb") as f:
        f.write(datos)
    print(f"OpenStreetMap: {len(json.loads(datos)['elements'])} lugares")


def registro_mercantil(salida):
    params = urllib.parse.urlencode({
        "$select": "matricula,razon_social,estado_matricula,ultimo_ano_renovado,fecha_renovacion,"
                   "fecha_matricula,fecha_cancelacion,cod_ciiu_act_econ_pri,cod_ciiu_act_econ_sec,categoria_matricula",
        "$where": "camara_comercio='BARRANCABERMEJA' AND (starts_with(cod_ciiu_act_econ_pri,'56') "
                  "OR starts_with(cod_ciiu_act_econ_sec,'56') OR cod_ciiu_act_econ_pri in ('1081','1082'))",
        "$limit": "50000",
    })
    datos = descargar(f"https://www.datos.gov.co/resource/nb3d-v3n7.json?{params}")
    with open(f"{salida}/registro_mercantil_comida.json", "wb") as f:
        f.write(datos)
    print(f"Registro mercantil: {len(json.loads(datos))} matrículas de comida")


if __name__ == "__main__":
    carpeta = sys.argv[1]
    os.makedirs(carpeta, exist_ok=True)
    overture(carpeta, sys.argv[2] if len(sys.argv) > 2 else ultimo_release_overture())
    osm(carpeta)
    registro_mercantil(carpeta)
