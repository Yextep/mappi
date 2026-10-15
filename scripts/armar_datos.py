"""Une las fuentes descargadas en los archivos que usa Mappi: uno por municipio de Colombia.

Uso: python armar_datos.py FUENTES SALIDA

SALIDA/
  indice.json          versión, categorías y municipios (código, nombre, departamento, centro, caja y cantidad)
  limites.json         contornos simplificados de los municipios, para saber en cuál está el teléfono
  m/CODIGO.json.gz     lugares de cada municipio (código DANE)
  resumen.txt          cifras del armado

FUENTES es la carpeta que llena descargar_fuentes.py. Requiere duckdb.
"""
import csv
import gzip
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

import duckdb

sys.path.insert(0, os.path.dirname(__file__))
import categorias  # noqa: E402

DEPARTAMENTOS = {
    "05": "Antioquia", "08": "Atlántico", "11": "Bogotá D.C.", "13": "Bolívar", "15": "Boyacá", "17": "Caldas",
    "18": "Caquetá", "19": "Cauca", "20": "Cesar", "23": "Córdoba", "25": "Cundinamarca", "27": "Chocó",
    "41": "Huila", "44": "La Guajira", "47": "Magdalena", "50": "Meta", "52": "Nariño", "54": "Norte de Santander",
    "63": "Quindío", "66": "Risaralda", "68": "Santander", "70": "Sucre", "73": "Tolima", "76": "Valle del Cauca",
    "81": "Arauca", "85": "Casanare", "86": "Putumayo", "88": "San Andrés y Providencia", "91": "Amazonas",
    "94": "Guainía", "95": "Guaviare", "97": "Vaupés", "99": "Vichada",
}
# ISO 3166-2 (Overture) -> código DANE del departamento
ISO_DANE = {
    "CO-ANT": "05", "CO-ATL": "08", "CO-DC": "11", "CO-BOL": "13", "CO-BOY": "15", "CO-CAL": "17", "CO-CAQ": "18",
    "CO-CAU": "19", "CO-CES": "20", "CO-COR": "23", "CO-CUN": "25", "CO-CHO": "27", "CO-HUI": "41", "CO-LAG": "44",
    "CO-MAG": "47", "CO-MET": "50", "CO-NAR": "52", "CO-NSA": "54", "CO-QUI": "63", "CO-RIS": "66", "CO-SAN": "68",
    "CO-SUC": "70", "CO-TOL": "73", "CO-VAC": "76", "CO-ARA": "81", "CO-CAS": "85", "CO-PUT": "86", "CO-SAP": "88",
    "CO-AMA": "91", "CO-GUA": "94", "CO-GUV": "95", "CO-VAU": "97", "CO-VID": "99",
}
FUENTE_BIT = {"overture": 1, "osm": 2, "medellin": 4}
PRIORIDAD = {"overture": 0, "osm": 1, "medellin": 2}

PLATOS = {
    "pizza": ["pizza", "pizzas", "pizzeria"],
    "hamburguesa": ["burger", "burgers", "burguer", "hamburguesa", "hamburguesas", "hamburgueseria"],
    "perro caliente": ["perro", "perros", "perrada", "hot dog", "hotdog", "dogs"],
    "salchipapa": ["salchipapa", "salchipapas", "salchipapeteria", "salchi"],
    "arepa": ["arepa", "arepas", "arepazo", "arepera"],
    "pollo": ["pollo", "pollos", "broaster", "asadero", "chicken", "frisby", "macpollo", "kokoriko"],
    "carnes y parrilla": ["parrilla", "parrillada", "steak", "carne", "carnes", "asados", "churrasco", "barbacoa",
                          "bbq", "grill", "rodizio", "piqueteadero"],
    "pescado y mariscos": ["pescado", "pescao", "mariscos", "marisco", "pesquera", "frutos del mar", "bocachico"],
    "ceviche": ["ceviche", "cevicheria"],
    "sushi": ["sushi", "japones", "japonesa"],
    "comida china": ["china", "chino", "wok", "oriental", "chop suey"],
    "mexicana": ["mexicana", "mexicano", "taco", "tacos", "burrito"],
    "árabe": ["shawarma", "arabe", "kebab", "libanesa"],
    "italiana": ["italiana", "italia", "trattoria", "ristorante", "pasta", "pastas"],
    "helado": ["helado", "helados", "heladeria", "gelato", "paleteria", "ice cream"],
    "postres": ["postre", "postres", "pasteleria", "cake", "cakes", "reposteria", "cupcake", "brownie", "tortas"],
    "panadería": ["panaderia", "pan", "bakery", "almojabana", "pandebono"],
    "café": ["cafe", "coffee", "cafeteria", "tinto", "juan valdez"],
    "jugos": ["jugo", "jugos", "juice", "smoothie", "fruteria", "salpicon"],
    "empanada": ["empanada", "empanadas"],
    "buñuelo": ["bunuelo", "bunuelos"],
    "comida típica": ["tipico", "tipica", "corrientazo", "sancocho", "mute", "lechona", "tamal", "tamales", "bandeja",
                      "paisa", "llanero", "santandereano"],
    "desayunos": ["desayuno", "desayunos", "breakfast"],
    "sándwich": ["sandwich", "sanduche", "panino", "subway", "qbano"],
    "picada": ["picada", "picadas", "mazorcada"],
    "alitas": ["alitas", "wings"],
}
CATEGORIA_A_PLATOS = {
    "pizza_restaurant": ["pizza"], "burger_restaurant": ["hamburguesa"], "chicken_restaurant": ["pollo"],
    "seafood_restaurant": ["pescado y mariscos"], "chinese_restaurant": ["comida china"],
    "mexican_restaurant": ["mexicana"], "ice_cream_shop": ["helado"], "bakery": ["panadería"],
    "coffee_shop": ["café"], "cafe": ["café"], "dessert_shop": ["postres"], "cupcake_shop": ["postres"],
    "barbecue_restaurant": ["carnes y parrilla"], "steakhouse": ["carnes y parrilla"],
    "hot_dog_restaurant": ["perro caliente"], "sushi_restaurant": ["sushi"], "japanese_restaurant": ["sushi"],
    "italian_restaurant": ["italiana"], "breakfast_and_brunch_restaurant": ["desayunos"],
    "sandwich_shop": ["sándwich"], "colombian_restaurant": ["comida típica"], "lebanese_restaurant": ["árabe"],
    "smoothie_juice_bar": ["jugos"],
}
COMIDA = {"restaurante", "rapida", "cafe", "bar"}
PROBABLES_RAPIDA = ["hamburguesa", "perro caliente", "salchipapa"]
# Palabras que no identifican a un negocio al comparar nombres.
VACIAS = {"de", "la", "el", "los", "las", "y", "del", "e", "en", "sas", "s", "a", "and", "the", "ltda", "sa", "cia",
          "zomac", "bic", "mi", "su", "tu", "al", "con", "por", "para", "y/o", "no", "nro"}
TIPOS = {p for c in categorias.CATEGORIAS for s in c[4] for p in s.split()} | {
    "restaurante", "comidas", "comida", "rapidas", "rapida", "asadero", "pizzeria", "bar", "cafe", "cafeteria",
    "panaderia", "heladeria", "tienda", "drogueria", "farmacia", "ferreteria", "papeleria", "peluqueria", "almacen",
    "minimercado", "supermercado", "autoservicio", "miscelanea", "variedades", "distribuidora", "comercializadora",
    "inversiones", "servicios", "taller", "salon", "belleza", "spa", "hotel", "estanco", "licorera", "gimnasio",
    "consultorio", "clinica", "odontologia", "optica", "veterinaria", "boutique", "deposito", "granero", "fruver",
    "carniceria", "expendio", "punto", "venta", "y", "local", "centro", "express", "store", "shop"}
# Rasgos de una persona natural registrada como contribuyente (su casa no es un local para el mapa).
_NOMBRES_PERSONA = set("""maria jose luis juan carlos ana jorge luz andres diana sandra claudia martha gloria angela
    jhon john edwin oscar william alexander alejandro fernando francisco javier jesus manuel miguel pedro ricardo
    sergio victor yolanda adriana alba beatriz blanca carmen carolina catalina cecilia elizabeth esperanza fabio
    gabriel gustavo hector henry hernan ivan jaime julian julio leidy liliana lina marcela mario mauricio monica
    nelson nancy olga orlando patricia paula rosa ruben ruth sara sofia teresa valentina wilson yaneth jairo
    alberto antonio arturo camilo cristian daniel david diego eduardo enrique felipe german guillermo hugo isabel
    jairo jenny johana juliana laura lucia lorena margarita mery milena natalia nidia rocio rodrigo rafael ramiro
    stella viviana yesenia yuli eliana erika ximena ingrid janeth gonzalez rodriguez gomez lopez martinez garcia
    hernandez perez sanchez ramirez diaz torres rojas vargas moreno jimenez munoz castro ortiz gutierrez alvarez
    ruiz suarez romero valencia quintero restrepo giraldo osorio cardona henao zapata arango mejia velez gaviria
    ospina montoya marin salazar arias castano rios agudelo correa estrada londono duque echeverri betancur jaramillo
    toro villa ochoa posada uribe hoyos acevedo bedoya cano franco mesa sierra vasquez vanegas zuluaga rendon""".split())


def plano(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def clave(nombre):
    return " ".join(p for p in plano(nombre).split() if p not in VACIAS)


def clave_sin_tipo(nombre):
    return " ".join(p for p in plano(nombre).split() if p not in VACIAS and p not in TIPOS)


def parece_persona(nombre):
    palabras = plano(nombre).split()
    return 2 <= len(palabras) <= 5 and sum(p in _NOMBRES_PERSONA for p in palabras) >= len(palabras) - 1 \
        and not any(p in TIPOS for p in palabras)


def distancia_m(lat1, lon1, lat2, lon2):
    x = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    y = math.radians(lat2 - lat1)
    return 6371000 * math.hypot(x, y)


_SINONIMOS = [(c[0], [f" {s} " for s in c[4]]) for c in categorias.CATEGORIAS]


def categoria_por_nombre(nombre):
    texto = f" {plano(nombre)} "
    for codigo, palabras in _SINONIMOS:
        if any(p in texto for p in palabras):
            return codigo
    return None


def telefono(crudo):
    d = re.sub(r"\D", "", crudo or "")
    if len(d) == 12 and d.startswith("57"):
        d = d[2:]
    if len(d) == 10 and (d.startswith("3") or d.startswith("60")):
        return f"+57 {d[:3]} {d[3:6]} {d[6:]}"
    if len(d) == 7:  # fijo sin indicativo: se deja como viene
        return f"{d[:3]} {d[3:]}"
    return (crudo or "").strip()[:30]


def platos_de(nombre, cats_overture):
    texto = f" {plano(nombre)} "
    encontrados = {p for p, claves in PLATOS.items() if any(f" {c} " in texto for c in claves)}
    for c in cats_overture:
        encontrados.update(CATEGORIA_A_PLATOS.get(c, []))
    return sorted(encontrados)


# ---------------------------------------------------------------- municipios
def municipios(con, fuentes):
    con.execute(f"""CREATE TABLE muni AS SELECT id, nombre, region, ST_GeomFromWKB(geometria) AS geom
                    FROM '{fuentes}/municipios.parquet'""")
    divipola = json.load(open(f"{fuentes}/divipola.json", encoding="utf-8"))
    con.execute("CREATE TABLE divi (codigo VARCHAR, nombre VARCHAR, lat DOUBLE, lon DOUBLE)")
    con.executemany("INSERT INTO divi VALUES (?, ?, ?, ?)", [
        (d["idmupio"].zfill(5), d["nommpio"], float(d["mpiolatitud"]), float(d["mpiolongitud"])) for d in divipola])
    oficiales = {d["idmupio"].zfill(5): d["nommpio"] for d in divipola}
    poligonos = con.execute("SELECT id, nombre, region FROM muni").fetchall()
    contenidos = defaultdict(list)
    for mid, codigo in con.execute("""SELECT m.id, d.codigo FROM muni m JOIN divi d
                                      ON ST_Contains(m.geom, ST_Point(d.lon, d.lat))""").fetchall():
        contenidos[mid].append(codigo)

    def parecido(a, b):
        a, b = plano(re.sub(r"\(.*?\)", "", a)), plano(re.sub(r"\(.*?\)", "", b))
        if a == b:
            return 1.0
        pa, pb = set(a.split()) - VACIAS, set(b.split()) - VACIAS
        if pa and pb and (pa <= pb or pb <= pa):  # «Buga» y «Guadalajara de Buga», pero no «Bugalagrande»
            return 0.95
        return SequenceMatcher(None, a, b).ratio()

    codigo_de = {}
    usados = set()

    def asignar(mid, codigo):
        codigo_de[mid] = codigo
        usados.add(codigo)

    # 1) mismo nombre dentro del departamento; 2) el único punto DIVIPOLA que cae dentro; 3) nombre parecido.
    for mid, nombre, region in poligonos:
        depto = ISO_DANE.get(region, "")
        opciones = [(parecido(nombre, n), c) for c, n in oficiales.items() if c.startswith(depto) and c not in usados]
        if opciones and max(opciones)[0] >= 0.9:
            asignar(mid, max(opciones)[1])
    for mid, nombre, region in poligonos:
        libres = [c for c in contenidos.get(mid, []) if c not in usados]
        if mid not in codigo_de and len(libres) == 1:
            asignar(mid, libres[0])
    for mid, nombre, region in poligonos:
        depto = ISO_DANE.get(region, "")
        opciones = [(parecido(nombre, n), c) for c, n in oficiales.items() if c.startswith(depto) and c not in usados]
        if mid not in codigo_de and opciones and max(opciones)[0] >= 0.6:
            asignar(mid, max(opciones)[1])
    nombre_de = {mid: oficiales[c] for mid, c in codigo_de.items()}
    con.execute("CREATE TABLE codigos (id VARCHAR, codigo VARCHAR, nombre_oficial VARCHAR)")
    con.executemany("INSERT INTO codigos VALUES (?, ?, ?)", [(m, c, nombre_de[m]) for m, c in codigo_de.items()])
    con.execute("""CREATE TABLE municipio AS
        SELECT c.codigo, c.nombre_oficial AS nombre, m.geom,
               ST_SimplifyPreserveTopology(m.geom, 0.0015) AS simple,
               ST_XMin(m.geom) x0, ST_YMin(m.geom) y0, ST_XMax(m.geom) x1, ST_YMax(m.geom) y1,
               ST_X(ST_PointOnSurface(m.geom)) cx, ST_Y(ST_PointOnSurface(m.geom)) cy
        FROM muni m JOIN codigos c USING (id)""")
    sin = con.execute("SELECT count(*) FROM muni WHERE id NOT IN (SELECT id FROM codigos)").fetchone()[0]
    print(f"municipios con código DANE: {len(codigo_de)} (sin código: {sin})")


# ---------------------------------------------------------------- lugares
def cargar_lugares(con, fuentes):
    con.execute(f"""CREATE TABLE crudo AS
        SELECT 'overture' AS fuente, 'o' || substr(replace(id, '-', ''), 1, 12) AS id, nombre, lat, lon,
               to_json(struct_pack(primaria, jerarquia, basica, confianza, telefonos, webs, redes, direccion, estado,
                                   origen)) AS datos
        FROM '{fuentes}/overture_lugares.parquet' WHERE nombre IS NOT NULL""")
    if os.path.exists(f"{fuentes}/osm_lugares.jsonl"):
        con.execute(f"""INSERT INTO crudo SELECT 'osm', id, json_extract_string(tags, '$.name'), lat, lon, tags::VARCHAR
                        FROM read_json('{fuentes}/osm_lugares.jsonl', format='newline_delimited',
                                       columns={{id: 'VARCHAR', lat: 'DOUBLE', lon: 'DOUBLE', tags: 'JSON'}})""")
    if os.path.exists(f"{fuentes}/medellin.jsonl"):
        con.execute(f"""INSERT INTO crudo
            SELECT 'medellin', 'm' || coalesce(ltrim(id_contrato, '0'), objectid::VARCHAR), trim(nombre_establecimiento),
                   latitud, longitud, to_json(struct_pack(ciiu := codigociiu, barrio := nombre_barrio))::VARCHAR
            FROM read_json('{fuentes}/medellin.jsonl', format='newline_delimited',
                           columns={{objectid: 'BIGINT', id_contrato: 'VARCHAR', nombre_establecimiento: 'VARCHAR',
                                    codigociiu: 'VARCHAR', latitud: 'DOUBLE', longitud: 'DOUBLE',
                                    nombre_barrio: 'VARCHAR'}})
            WHERE latitud BETWEEN -5 AND 14 AND longitud BETWEEN -80 AND -66""")
    con.execute("""CREATE TABLE ubicado AS
        SELECT c.*, m.codigo FROM crudo c JOIN municipio m ON ST_Contains(m.simple, ST_Point(c.lon, c.lat))""")
    for fuente, n in con.execute("SELECT fuente, count(*) FROM ubicado GROUP BY 1 ORDER BY 1").fetchall():
        print(f"  {fuente}: {n} lugares dentro de un municipio")


def lugar(fuente, id_, nombre, lat, lon, datos):
    d = json.loads(datos) if datos else {}
    l = {"id": id_, "nombre": " ".join(nombre.split())[:120], "lat": lat, "lon": lon, "fuentes": FUENTE_BIT[fuente],
         "fuente": fuente, "tel": "", "fb": "", "ig": "", "web": "", "wa": "", "dir": "", "cats": [], "ica": False}
    if fuente == "overture":
        if (d.get("estado") or "") in ("permanently_closed", "closed"):
            return None
        cat = categorias.desde_overture(d.get("jerarquia"), d.get("primaria"), d.get("basica"))
        if cat is None and not d.get("jerarquia") and not d.get("basica"):
            cat = categoria_por_nombre(nombre)
        if cat is None:
            return None
        if cat in ("servicios", "tienda"):
            cat = categoria_por_nombre(nombre) or cat
        l["cat"] = cat
        l["cats"] = [c for c in [d.get("primaria")] if c]
        l["conf"] = d.get("confianza") or 0
        webs = d.get("webs") or []
        l["ig"] = next((w for w in webs if "instagram.com" in w), "")
        l["wa"] = next((w for w in webs if "wa.me" in w or "whatsapp" in w or "wa.link" in w), "")
        l["web"] = next((w for w in webs if w not in (l["ig"], l["wa"]) and "facebook.com" not in w), "")
        l["fb"] = next((r for r in d.get("redes") or [] if "facebook.com" in r), "")
        l["tel"] = telefono((d.get("telefonos") or [""])[0])
        l["dir"] = (d.get("direccion") or "").strip()
    elif fuente == "osm":
        if d.get("disused") or d.get("abandoned"):
            return None
        cat = categorias.desde_osm(d)
        if cat is None:
            return None
        if cat in ("servicios", "tienda"):
            cat = categoria_por_nombre(nombre) or cat
        l["cat"] = cat
        l["cats"] = [c for c in (d.get("cuisine") or "").split(";") if c]
        l["tel"] = telefono(d.get("phone") or d.get("contact:phone") or d.get("mobile") or d.get("contact:mobile"))
        l["web"] = d.get("website") or d.get("contact:website") or ""
        l["fb"] = d.get("contact:facebook") or ""
        l["ig"] = d.get("contact:instagram") or ""
        l["wa"] = d.get("contact:whatsapp") or ""
        l["dir"] = d.get("addr:full") or " ".join(filter(None, [d.get("addr:street"), d.get("addr:housenumber")]))
        l["conf"] = 0.8
    else:  # Medellín: está activo en Industria y Comercio
        if parece_persona(nombre):
            return None
        l["cat"] = categorias.desde_ciiu(d.get("ciiu")) or categoria_por_nombre(nombre) or "servicios"
        if l["cat"] in ("servicios", "tienda"):
            l["cat"] = categoria_por_nombre(nombre) or l["cat"]
        l["nombre"] = l["nombre"].title() if l["nombre"].isupper() else l["nombre"]
        l["ica"] = True
        l["conf"] = 0.7
        barrio = (d.get("barrio") or "").strip()
        l["dir"] = f"Barrio {barrio.title()}" if barrio and barrio != "0000" else ""
    if not l["nombre"] or len(clave(l["nombre"])) < 2:
        return None
    return l


def mismo_lugar(a, b):
    if distancia_m(a["lat"], a["lon"], b["lat"], b["lon"]) > 250:
        return False
    ka, kb = a["_clave"], b["_clave"]
    if ka == kb:
        return True
    sa, sb = a["_sin_tipo"], b["_sin_tipo"]
    if sa and sa == sb and len(sa) >= 4:
        return True
    contenido = min(len(sa), len(sb)) >= 5 and (sa in sb or sb in sa)
    return contenido or SequenceMatcher(None, ka, kb).ratio() >= 0.85


def fusionar(base, otro):
    for campo in ("tel", "fb", "ig", "web", "wa", "dir"):
        if not base[campo] and otro[campo]:
            base[campo] = otro[campo]
    if base["cat"] in ("servicios", "tienda") and otro["cat"] not in ("servicios", "tienda"):
        base["cat"] = otro["cat"]
    base["cats"] = list(dict.fromkeys(base["cats"] + otro["cats"]))
    base["fuentes"] |= otro["fuentes"]
    base["ica"] = base["ica"] or otro["ica"]
    base["conf"] = max(base.get("conf", 0), otro.get("conf", 0))


def deduplicar(lugares):
    """Une el mismo negocio visto en varias fuentes. Bloquea por celdas de ~250 m y por las palabras raras del nombre."""
    frecuencia = Counter(p for l in lugares for p in set(l["_sin_tipo"].split() or l["_clave"].split()))
    indice = defaultdict(list)
    salida = []
    for l in sorted(lugares, key=lambda x: (PRIORIDAD[x["fuente"]], -x.get("conf", 0))):
        palabras = sorted(set(l["_sin_tipo"].split() or l["_clave"].split()), key=lambda p: frecuencia[p])[:2]
        celda = (round(l["lat"] / 0.0025), round(l["lon"] / 0.0025))
        igual = None
        for p in palabras:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for otro in indice.get((celda[0] + dx, celda[1] + dy, p), ()):
                        if mismo_lugar(otro, l):
                            igual = otro
                            break
                    if igual:
                        break
                if igual:
                    break
            if igual:
                break
        if igual:
            fusionar(igual, l)
            continue
        salida.append(l)
        for p in palabras:
            indice[(celda[0], celda[1], p)].append(l)
    return salida


# ---------------------------------------------------------------- registro mercantil
class Registro:
    """Matrículas de los últimos 10 años, buscables por cámara de comercio y nombre."""

    def __init__(self, archivo, claves_utiles, hoy):
        # La renovación vence el 31 de marzo: desde abril, «al día» significa renovada este año.
        self.anio_vigente = hoy.year if hoy.month > 3 else hoy.year - 1
        self.por_camara = defaultdict(lambda: defaultdict(list))
        self.camaras_de = defaultdict(set)
        n = 0
        with open(archivo, encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                k = clave(fila["razon_social"])
                if k not in claves_utiles:
                    continue
                camara = fila["camara_comercio"]
                self.por_camara[camara][k].append((fila["estado_matricula"], fila["ultimo_ano_renovado"],
                                                   fila["fecha_cancelacion"], fila["razon_social"].strip(),
                                                   fila["cod_ciiu_act_econ_pri"]))
                self.camaras_de[k].add(camara)
                n += 1
        print(f"registro: {n} matrículas con un nombre que aparece en el mapa")

    def votar(self, lugares):
        votos = Counter()
        for l in lugares:
            for camara in self.camaras_de.get(l["_clave"], ()):
                votos[camara] += 1
        return votos

    def estado(self, camara, l):
        filas = self.por_camara[camara].get(l["_clave"])
        if not filas or len(l["_clave"]) < 4:
            return None
        activas = [f for f in filas if f[0] == "ACTIVA"]
        if activas:
            mejor = max(activas, key=lambda f: f[1] or "0")
            anio = int(mejor[1] or 0) if (mejor[1] or "0").isdigit() else 0
            return ("al_dia" if anio >= self.anio_vigente else "sin_renovar", anio, mejor[3])
        mejor = max(filas, key=lambda f: f[2] or "0")
        texto = (mejor[2] or mejor[1] or "0")[:4]
        return ("cancelado", int(texto) if texto.isdigit() else 0, mejor[3])


def asignar_camaras(registro, por_municipio, centros):
    """Cada municipio queda con la cámara que más nombres comparte con él; si no hay datos, la del vecino más cercano."""
    elegida = {}
    for codigo, lugares in por_municipio.items():
        votos = registro.votar(lugares)
        if votos:
            camara, n = votos.most_common(1)[0]
            if n >= 3 and n >= 0.3 * sum(votos.values()):
                elegida[codigo] = camara
    for codigo in por_municipio:
        if codigo in elegida:
            continue
        cx, cy = centros[codigo]
        vecinos = [(distancia_m(cy, cx, centros[c][1], centros[c][0]), c) for c in elegida if c[:2] == codigo[:2]]
        if vecinos:
            elegida[codigo] = elegida[min(vecinos)[1]]
    return elegida


# ---------------------------------------------------------------- salida
REGISTRO_CODIGO = {"al_dia": 1, "sin_renovar": 2, "cancelado": 3}


def morton(lat, lon):
    x, y = int((lon + 80) * 2000), int((lat + 5) * 2000)
    m = 0
    for i in range(16):
        m |= ((x >> i) & 1) << (2 * i) | ((y >> i) & 1) << (2 * i + 1)
    return m


def archivo_municipio(version, codigo, nombre, lugares):
    lugares.sort(key=lambda l: morton(l["lat"], l["lon"]))
    cats = categorias.CODIGOS
    lat, lon, ult_lat, ult_lon = [], [], 0, 0
    for l in lugares:
        a, b = round(l["lat"] * 1e5), round(l["lon"] * 1e5)
        lat.append(a - ult_lat)
        lon.append(b - ult_lon)
        ult_lat, ult_lon = a, b
    extra = {}
    for i, l in enumerate(lugares):
        e = {k: l[k] for k in ("fb", "ig", "web", "wa") if l[k]}
        if l.get("platos"):
            e["platos"] = l["platos"]
        if l.get("probables"):
            e["probables"] = l["probables"]
        if l.get("registro"):
            e["regNombre"] = l["registro"][2]
        if l.get("dudosa"):
            e["dudosa"] = 1
        if e:
            extra[str(i)] = e
    return {
        "formato": 2, "version": version, "codigo": codigo, "nombre": nombre,
        "departamento": DEPARTAMENTOS.get(codigo[:2], ""),
        "id": [l["id"] for l in lugares],
        "nombres": [l["nombre"] for l in lugares],
        "lat": lat, "lon": lon,
        "cat": [cats.index(l["cat"]) for l in lugares],
        "tel": [l["tel"] for l in lugares],
        "dir": [l["dir"][:120] for l in lugares],
        "fuentes": [l["fuentes"] for l in lugares],
        "reg": [REGISTRO_CODIGO[l["registro"][0]] if l.get("registro") else 0 for l in lugares],
        "regAnio": [l["registro"][1] if l.get("registro") else 0 for l in lugares],
        "extra": extra,
    }


def anillos(geojson):
    g = json.loads(geojson)
    poligonos = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]] if g["type"] == "Polygon" else []
    return [[[round(x, 4), round(y, 4)] for x, y in anillo] for poligono in poligonos for anillo in poligono[:1]]


def main(fuentes, salida):
    hoy = datetime.now(ZoneInfo("America/Bogota")).date()
    version = hoy.isoformat()
    os.makedirs(f"{salida}/m", exist_ok=True)
    con = duckdb.connect()
    con.execute("SET enable_progress_bar = false; INSTALL spatial; LOAD spatial;")
    municipios(con, fuentes)
    cargar_lugares(con, fuentes)

    por_municipio = defaultdict(list)
    descartados = Counter()
    for fila in con.execute("SELECT fuente, id, nombre, lat, lon, datos, codigo FROM ubicado").fetchall():
        l = lugar(*fila[:6])
        if l is None:
            descartados[fila[0]] += 1
            continue
        if l["fuente"] == "overture" and l["conf"] < 0.2:
            descartados["overture_baja_confianza"] += 1
            continue
        l["_clave"], l["_sin_tipo"] = clave(l["nombre"]), clave_sin_tipo(l["nombre"])
        por_municipio[fila[6]].append(l)
    print("descartados:", dict(descartados))
    con.execute("DROP TABLE crudo; DROP TABLE ubicado;")

    for codigo in por_municipio:
        por_municipio[codigo] = deduplicar(por_municipio[codigo])
    centros = {c: (x, y) for c, x, y in con.execute("SELECT codigo, cx, cy FROM municipio").fetchall()}

    registro = None
    if os.path.exists(f"{fuentes}/registro.csv"):
        claves_utiles = {l["_clave"] for ls in por_municipio.values() for l in ls if len(l["_clave"]) >= 4}
        registro = Registro(f"{fuentes}/registro.csv", claves_utiles, hoy)
        camaras = asignar_camaras(registro, por_municipio, centros)
        print(f"cámaras asignadas a {len(camaras)} municipios")
    estados = Counter()
    for codigo, lugares in por_municipio.items():
        puntos = Counter((round(l["lat"], 5), round(l["lon"], 5)) for l in lugares if l["fuentes"] == 1)
        for l in lugares:
            if l["cat"] in COMIDA:
                l["platos"] = platos_de(l["nombre"], l["cats"])
                if l["cat"] == "rapida" or "comidas rapidas" in plano(l["nombre"]):
                    l["probables"] = [p for p in PROBABLES_RAPIDA if p not in l["platos"]]
            l["dudosa"] = l["fuentes"] == 1 and puntos[(round(l["lat"], 5), round(l["lon"], 5))] >= 4
            l["registro"] = registro.estado(camaras[codigo], l) if registro and codigo in camaras else None
            estados[l["registro"][0] if l["registro"] else "sin registro"] += 1

    datos_municipios = con.execute(
        "SELECT codigo, nombre, x0, y0, x1, y1, cx, cy, ST_AsGeoJSON(simple) FROM municipio ORDER BY codigo").fetchall()
    indice, limites = [], {}
    total = Counter()
    for codigo, nombre, x0, y0, x1, y1, cx, cy, geo in datos_municipios:
        lugares = por_municipio.get(codigo, [])
        limites[codigo] = anillos(geo)
        datos = archivo_municipio(version, codigo, nombre, lugares)
        cuerpo = gzip.compress(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)
        with open(f"{salida}/m/{codigo}.json.gz", "wb") as f:
            f.write(cuerpo)
        for l in lugares:
            total[l["cat"]] += 1
        indice.append({"c": codigo, "n": nombre, "d": DEPARTAMENTOS.get(codigo[:2], ""), "lat": round(cy, 4),
                       "lon": round(cx, 4), "caja": [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
                       "total": len(lugares), "kb": math.ceil(len(cuerpo) / 1024)})
    with open(f"{salida}/indice.json", "w", encoding="utf-8") as f:
        json.dump({
            "formato": 2, "version": version,
            "fuentes": [
                "Overture Maps Foundation, tema places (Meta, Microsoft, Foursquare y otros). CDLA-Permissive-2.0 y ODbL.",
                "© colaboradores de OpenStreetMap. ODbL.",
                "Registro mercantil: Confecámaras en datos.gov.co. CC BY-SA 4.0.",
                "Establecimientos de Industria y Comercio: Alcaldía de Medellín. CC BY-SA 4.0.",
                "Límites municipales: geoBoundaries (CC BY 4.0) y DIVIPOLA (DANE, MinSalud).",
            ],
            "categorias": [{"c": c, "n": n, "color": claro, "oscuro": oscuro, "s": s}
                           for c, n, claro, oscuro, s in categorias.CATEGORIAS],
            "municipios": indice,
        }, f, ensure_ascii=False, separators=(",", ":"))
    with open(f"{salida}/limites.json", "w", encoding="utf-8") as f:
        json.dump({"version": version, "municipios": limites}, f, separators=(",", ":"))
    resumen = [
        f"versión: {version}",
        f"lugares: {sum(m['total'] for m in indice)} en {sum(1 for m in indice if m['total'])} municipios",
        "por categoría: " + ", ".join(f"{c} {n}" for c, n in total.most_common()),
        "registro: " + ", ".join(f"{e} {n}" for e, n in estados.most_common()),
        "más grandes: " + ", ".join(f"{m['n']} {m['total']} ({m['kb']} KB)"
                                    for m in sorted(indice, key=lambda m: -m["total"])[:8]),
    ]
    with open(f"{salida}/resumen.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(resumen) + "\n")
    por_fuente = Counter()
    for lugares in por_municipio.values():
        for l in lugares:
            for fuente, bit in FUENTE_BIT.items():
                if l["fuentes"] & bit:
                    por_fuente[fuente] += 1
    with open(f"{salida}/resumen.json", "w", encoding="utf-8") as f:
        json.dump({"version": version, "lugares": sum(m["total"] for m in indice),
                   "municipios_con_lugares": sum(1 for m in indice if m["total"]),
                   "por_fuente": por_fuente, "registro": estados, "por_categoria": total}, f, ensure_ascii=False)
    print("\n".join(resumen))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
