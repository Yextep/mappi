"""Descarga las fuentes abiertas de negocios y locales de toda Colombia.

- Overture Maps: lugares (datos de Meta, Microsoft, Foursquare y otros) y límites de los municipios.
- OpenStreetMap: extracto de Colombia de Geofabrik, filtrado con osmium.
- DIVIPOLA: códigos DANE de los municipios (MinSalud en datos.gov.co).
- Registro mercantil: establecimientos matriculados o renovados en los últimos 10 años (Confecámaras en
  datos.gov.co), sin datos personales del propietario.
- Medellín: establecimientos activos de Industria y Comercio con coordenadas (Secretaría de Hacienda).

Requiere: pip install duckdb, y osmium-tool.
Uso: python descargar_fuentes.py CARPETA [fuente ...]   (fuentes: overture osm divipola registro medellin)
"""
import concurrent.futures
import csv
import http.client
import io
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "Mozilla/5.0 (compatible; Mappi/2.0; +https://github.com/Yextep/mappi)"
COLOMBIA = (-79.1, -4.3, -66.8, 13.5)  # lon_min, lat_min, lon_max, lat_max (incluye San Andrés)
ANIOS_REGISTRO = 10


def descargar(url, intentos=5, espera=20):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for intento in range(1, intentos + 1):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        # IncompleteRead (http.client.HTTPException): datos.gov.co a veces corta una página a la mitad.
        except (urllib.error.URLError, http.client.HTTPException, TimeoutError, ConnectionError) as e:
            codigo = getattr(e, "code", None)
            if (codigo is not None and codigo not in (408, 429, 500, 502, 503, 504)) or intento == intentos:
                raise
            time.sleep(espera * intento)


def ultimo_release_overture():
    xml = descargar("https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/").decode()
    return max(p.split("/")[1] for p in xml.split("<Prefix>")[1:] if p.startswith("release/2"))


def overture(salida):
    import duckdb
    release = ultimo_release_overture()
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    base = f"s3://overturemaps-us-west-2/release/{release}"
    x0, y0, x1, y1 = COLOMBIA
    con.execute(f"""
        COPY (
          SELECT id, names.primary AS nombre, ST_X(geometry) AS lon, ST_Y(geometry) AS lat,
                 taxonomy.primary AS primaria, taxonomy.hierarchy AS jerarquia, basic_category AS basica,
                 confidence AS confianza, phones AS telefonos, websites AS webs, socials AS redes,
                 addresses[1].freeform AS direccion, operating_status AS estado,
                 [s.dataset FOR s IN sources] AS origen
          FROM read_parquet('{base}/theme=places/type=place/*', hive_partitioning=1)
          WHERE bbox.xmin BETWEEN {x0} AND {x1} AND bbox.ymin BETWEEN {y0} AND {y1}
            AND coalesce(addresses[1].country, 'CO') = 'CO'
        ) TO '{salida}/overture_lugares.parquet' (FORMAT parquet, COMPRESSION zstd)""")
    # Municipios (geoBoundaries ADM2 dentro de Overture), con el departamento como código ISO 3166-2.
    con.execute(f"""
        COPY (
          SELECT division_id AS id, names.primary AS nombre, region, ST_AsWKB(geometry) AS geometria
          FROM read_parquet('{base}/theme=divisions/type=division_area/*', hive_partitioning=1)
          WHERE country = 'CO' AND subtype = 'county' AND is_land
        ) TO '{salida}/municipios.parquet' (FORMAT parquet)""")
    n = con.execute(f"SELECT count(*) FROM '{salida}/overture_lugares.parquet'").fetchone()[0]
    m = con.execute(f"SELECT count(*) FROM '{salida}/municipios.parquet'").fetchone()[0]
    with open(f"{salida}/overture_release.txt", "w") as f:
        f.write(release + "\n")
    print(f"Overture {release}: {n} lugares, {m} municipios")


def osm(salida):
    pbf = f"{salida}/colombia-latest.osm.pbf"
    if not os.path.exists(pbf):
        urllib.request.urlretrieve("https://download.geofabrik.de/south-america/colombia-latest.osm.pbf", pbf)
    filtrado = f"{salida}/osm_poi.osm.pbf"
    subprocess.run(["osmium", "tags-filter", "-O", "-o", filtrado, pbf, "nwr/shop", "nwr/amenity", "nwr/office",
                    "nwr/craft", "nwr/healthcare", "nwr/tourism", "nwr/leisure", "nwr/aeroway=aerodrome"], check=True)
    exportado = f"{salida}/osm_poi.geojsonseq"
    subprocess.run(["osmium", "export", "-O", "-f", "geojsonseq", "--format-option=print_record_separator=false",
                    "--geometry-types=point,polygon", "-a", "type,id", filtrado, "-o", exportado], check=True)
    claves = ("name", "brand", "amenity", "shop", "office", "craft", "healthcare", "tourism", "leisure", "aeroway",
              "cuisine", "phone", "contact:phone", "mobile", "contact:mobile", "website", "contact:website",
              "contact:facebook", "contact:instagram", "contact:whatsapp", "addr:street", "addr:housenumber",
              "addr:full", "opening_hours", "disused", "abandoned")
    n = 0
    with open(exportado, encoding="utf-8") as entrada, open(f"{salida}/osm_lugares.jsonl", "w", encoding="utf-8") as sal:
        for linea in entrada:
            f = json.loads(linea)
            p = f["properties"]
            if not p.get("name"):
                continue
            g = f["geometry"]
            if g["type"] == "Point":
                lon, lat = g["coordinates"]
            else:  # centro aproximado del contorno exterior
                anillo = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"][0][0]
                lon = sum(c[0] for c in anillo) / len(anillo)
                lat = sum(c[1] for c in anillo) / len(anillo)
            tipo = {"node": "n", "way": "w", "relation": "r"}[p["@type"]]
            sal.write(json.dumps({"id": f"{tipo}{p['@id']}", "lat": round(lat, 6), "lon": round(lon, 6),
                                  "tags": {k: p[k] for k in claves if k in p}}, ensure_ascii=False) + "\n")
            n += 1
    for archivo in (filtrado, exportado):
        os.remove(archivo)
    print(f"OpenStreetMap: {n} lugares con nombre")


def divipola(salida):
    datos = json.loads(descargar("https://www.datos.gov.co/resource/pqwj-3fi4.json?$limit=5000"))
    with open(f"{salida}/divipola.json", "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False)
    print(f"DIVIPOLA: {len(datos)} municipios")


def registro(salida):
    """Solo lo necesario para saber si un negocio sigue matriculado; no se baja la identificación del propietario."""
    anio = time.gmtime().tm_year - ANIOS_REGISTRO
    campos = ("camara_comercio,matricula,razon_social,estado_matricula,ultimo_ano_renovado,fecha_matricula,"
              "fecha_cancelacion,cod_ciiu_act_econ_pri")
    filtro = f"fecha_matricula >= '{anio}0101' OR ultimo_ano_renovado >= '{anio}'"
    total = int(json.loads(descargar("https://www.datos.gov.co/resource/nb3d-v3n7.json?" + urllib.parse.urlencode(
        {"$select": "count(*)", "$where": filtro})))[0]["count"])
    pagina = 50000

    def bajar(desde):
        return descargar("https://www.datos.gov.co/resource/nb3d-v3n7.csv?" + urllib.parse.urlencode(
            {"$select": campos, "$where": filtro, "$order": ":id", "$limit": pagina, "$offset": desde})).decode("utf-8")

    n = 0
    # Se escribe aparte y se renombra al final: un archivo a medias nunca queda como si estuviera completo.
    temporal = f"{salida}/registro.csv.parcial"
    with open(temporal, "w", encoding="utf-8", newline="") as f, \
            concurrent.futures.ThreadPoolExecutor(4) as hilos:
        escritor = csv.writer(f)
        escritor.writerow(campos.split(","))
        for texto in hilos.map(bajar, range(0, total, pagina)):
            filas = list(csv.reader(io.StringIO(texto)))[1:]
            escritor.writerows(filas)
            n += len(filas)
    if n < total * 0.98:
        os.remove(temporal)
        sys.exit(f"Registro mercantil incompleto: {n} de {total}")
    os.replace(temporal, f"{salida}/registro.csv")
    print(f"Registro mercantil desde {anio}: {n} matrículas")


def medellin(salida):
    capa = ("https://www.medellin.gov.co/servidormapas/rest/services/ccio_ind_turism/"
            "VC_Act_Comercial_Empresarial/MapServer/0/query")
    filtro = ("nombre_establecimiento NOT LIKE 'NO POSEE%' AND nombre_establecimiento NOT LIKE 'SIN NOMBRE%' "
              "AND nombre_establecimiento <> ' '")

    def consultar(**parametros):
        return json.loads(descargar(capa + "?" + urllib.parse.urlencode({"f": "json", **parametros})))

    extremos = consultar(where="1=1", outStatistics=json.dumps([
        {"statisticType": "min", "onStatisticField": "objectid", "outStatisticFieldName": "minimo"},
        {"statisticType": "max", "onStatisticField": "objectid", "outStatisticFieldName": "maximo"}]))
    a = extremos["features"][0]["attributes"]
    minimo, maximo = int(a["minimo"]), int(a["maximo"])
    tramos = 8
    paso = (maximo - minimo) // tramos + 1

    def tramo(i):
        desde, hasta = minimo + i * paso - 1, minimo + (i + 1) * paso - 1
        filas = []
        while True:
            d = consultar(where=f"({filtro}) AND objectid > {desde} AND objectid <= {hasta}",
                          outFields="objectid,id_contrato,nombre_establecimiento,codigociiu,latitud,longitud,nombre_barrio",
                          orderByFields="objectid", resultRecordCount=2000, returnGeometry="false")
            lote = [f["attributes"] for f in d.get("features", [])]
            filas += lote
            if not lote or not d.get("exceededTransferLimit"):
                return filas
            desde = lote[-1]["objectid"]

    with concurrent.futures.ThreadPoolExecutor(tramos) as hilos:
        filas = [f for parte in hilos.map(tramo, range(tramos)) for f in parte]
    with open(f"{salida}/medellin.jsonl", "w", encoding="utf-8") as f:
        for fila in filas:
            f.write(json.dumps(fila, ensure_ascii=False) + "\n")
    print(f"Medellín: {len(filas)} establecimientos")


FUENTES = {"overture": overture, "osm": osm, "divipola": divipola, "registro": registro, "medellin": medellin}

if __name__ == "__main__":
    carpeta = sys.argv[1]
    os.makedirs(carpeta, exist_ok=True)
    for nombre in sys.argv[2:] or FUENTES:
        FUENTES[nombre](carpeta)
