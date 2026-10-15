"""Une Overture Maps, OpenStreetMap y el registro mercantil en el listado que usa la app.

Uso: python unir_fuentes.py CARPETA_FUENTES datos/lugares.json docs/lugares.csv

CARPETA_FUENTES es la que llena descargar_fuentes.py.
"""
import csv
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from zoneinfo import ZoneInfo

PLATOS = {
    "pizza": ["pizza", "pizzas", "pizzeria", "pizzzas"],
    "hamburguesa": ["burger", "burgers", "burguer", "hamburguesa", "hamburguesas", "hamburgueseria"],
    "perro caliente": ["perro", "perros", "perrada", "hot dog", "hotdog", "dogs"],
    "salchipapa": ["salchipapa", "salchipapas", "salchipapeteria", "salchi"],
    "arepa": ["arepa", "arepas", "arepazo", "arepera", "arepiz"],
    "pollo": ["pollo", "pollos", "broaster", "asadero", "chicken", "frisby", "macpollo", "kokoriko", "bambroaster"],
    "carnes y parrilla": ["parrilla", "parrillada", "steak", "carne", "carnes", "asados", "churrasco", "barbacoa",
                          "bbq", "grill", "rodizio", "piqueteadero"],
    "pescado y mariscos": ["pescado", "pescao", "mariscos", "marisco", "marina", "pesquera", "mar azul",
                           "frutos del mar", "bocachico", "cevicheria"],
    "ceviche": ["ceviche", "cevicheria", "cevi"],
    "sushi": ["sushi", "japones", "japonesa"],
    "comida china": ["china", "chino", "wok", "shanghai", "oriental", "chop suey"],
    "mexicana": ["mexicana", "mexicano", "mex", "taco", "tacos", "burrito", "tex", "orale"],
    "árabe": ["shawarma", "arabe", "kebab", "libanesa"],
    "italiana": ["italiana", "italia", "trattoria", "ristorante", "pasta", "pastas"],
    "helado": ["helado", "helados", "heladeria", "gelato", "paleteria", "ice cream", "mimos", "popsy"],
    "postres": ["postre", "postres", "pasteleria", "cake", "cakes", "reposteria", "dulce", "dulces", "cupcake",
                "cupcakes", "brownie", "tortas"],
    "panadería": ["panaderia", "pan", "bakery", "almojabana", "pandebono"],
    "café": ["cafe", "coffee", "cafeteria", "tinto", "juan valdez"],
    "jugos": ["jugo", "jugos", "juice", "smoothie", "fruteria", "salpicon"],
    "empanada": ["empanada", "empanadas"],
    "buñuelo": ["bunuelo", "bunuelos"],
    "comida típica": ["tipico", "tipica", "corrientazo", "sancocho", "mute", "lechona", "tamal", "tamales", "bandeja",
                      "paisa", "llanero", "santandereano", "bollo", "bollos"],
    "desayunos": ["desayuno", "desayunos", "breakfast"],
    "sándwich": ["sandwich", "sanduche", "panino", "paninos", "subway", "qbano"],
    "picada": ["picada", "picadas", "pikada", "pikadas", "mazorcada"],
    "alitas": ["alitas", "wings"],
    "crepes": ["crepe", "crepes"],
}
CATEGORIA_A_PLATOS = {
    "pizza_restaurant": ["pizza"], "burger_restaurant": ["hamburguesa"], "chicken_restaurant": ["pollo"],
    "seafood_restaurant": ["pescado y mariscos"], "chinese_restaurant": ["comida china"],
    "mexican_restaurant": ["mexicana"], "ice_cream_shop": ["helado"], "bakery": ["panadería"],
    "coffee_shop": ["café"], "cafe": ["café"], "dessert_shop": ["postres"], "cupcake_shop": ["postres"],
    "barbecue_restaurant": ["carnes y parrilla"], "steakhouse": ["carnes y parrilla"],
    "bar_and_grill_restaurant": ["carnes y parrilla"], "smoothie_juice_bar": ["jugos"],
    "hot_dog_restaurant": ["perro caliente"], "sushi_restaurant": ["sushi"], "japanese_restaurant": ["sushi"],
    "italian_restaurant": ["italiana"], "breakfast_and_brunch_restaurant": ["desayunos"],
    "sandwich_shop": ["sándwich"], "colombian_restaurant": ["comida típica"], "lebanese_restaurant": ["árabe"],
    # OSM cuisine=*
    "pizza": ["pizza"], "burger": ["hamburguesa"], "chicken": ["pollo"], "fish": ["pescado y mariscos"],
    "seafood": ["pescado y mariscos"], "steak_house": ["carnes y parrilla"], "ice_cream": ["helado"],
    "regional": ["comida típica"], "italian": ["italiana"], "hotdog": ["perro caliente"],
    "sausage": ["perro caliente"],
}
# Un local de "comidas rápidas" en Colombia casi siempre vende estos platos, pero no está confirmado.
PROBABLES_RAPIDA = ["hamburguesa", "perro caliente", "salchipapa"]
BARES = {"bar", "beer_bar", "sports_bar", "wine_bar", "lounge", "brewery", "winery", "pub", "cocktail_bar"}
RAPIDA = {"fast_food_restaurant", "fast_food", "burger_restaurant", "hot_dog_restaurant", "food_truck_stand",
          "pizza_restaurant", "chicken_restaurant", "sandwich_shop"}
DULCE = {"ice_cream_shop", "ice_cream", "dessert_shop", "cupcake_shop", "candy_store", "bakery",
         "coffee_shop", "cafe", "smoothie_juice_bar", "delicatessen"}
VACIAS = {"restaurante", "restaurant", "barrancabermeja", "bca", "barranca", "de", "la", "el", "los", "las", "y",
          "del", "sas", "s", "a", "and", "the", "comidas", "comida", "rapidas", "rapida", "asadero", "pizzeria",
          "bar", "cafe", "cafeteria", "panaderia", "heladeria"}
# Claves que solo nombran un plato o un tipo de local: no identifican a un negocio en el registro.
GENERICAS = {p for claves in PLATOS.values() for p in claves} | {"express", "food", "gourmet", "delicias"}


def plano(texto):
    texto = unicodedata.normalize("NFKD", (texto or "").lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def clave_nombre(nombre):
    return " ".join(p for p in plano(nombre).split() if p not in VACIAS)


def distancia_m(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def platos_de(nombre, categorias):
    texto = f" {plano(nombre)} "
    encontrados = {p for p, claves in PLATOS.items() if any(f" {c} " in texto for c in claves)}
    for categoria in categorias:
        encontrados.update(CATEGORIA_A_PLATOS.get(categoria, []))
    return sorted(encontrados)


def grupo_de(categorias, platos):
    if any(c in BARES for c in categorias):
        return "bar"
    if any(c in RAPIDA for c in categorias) or {"hamburguesa", "perro caliente", "salchipapa", "pizza", "picada"} & set(platos):
        return "rapida"
    if any(c in DULCE for c in categorias) or {"helado", "postres", "panadería", "café", "jugos"} & set(platos):
        return "cafe"
    return "restaurante"


def probables_de(nombre, grupo, platos):
    texto = plano(nombre)
    if grupo == "rapida" or "comidas rapidas" in texto or "comida rapida" in texto or "fast food" in texto:
        return [p for p in PROBABLES_RAPIDA if p not in platos]
    return []


def telefono(crudo):
    d = re.sub(r"\D", "", crudo or "")
    if len(d) == 12 and d.startswith("57"):
        d = d[2:]
    if len(d) == 10 and d.startswith("577"):  # +57 7xxxxxxx: fijo antiguo con indicativo de país
        d = d[2:]
    if len(d) == 10 and d.startswith("3"):
        return f"+57 {d[:3]} {d[3:6]} {d[6:]}"
    if len(d) == 10 and d.startswith("60"):
        return f"+57 {d[:3]} {d[3:6]} {d[6:]}"
    if len(d) == 8 and d.startswith("7"):  # fijo antiguo de Santander: 7 + 7 dígitos -> 607
        return f"+57 607 {d[1:4]} {d[4:]}"
    return crudo or ""


def desde_overture(x):
    cats = [x["taxonomy"]["primary"]] + list(x["taxonomy"].get("alternates") or [])
    webs = x.get("websites") or []
    insta = next((w for w in webs if "instagram.com" in w), "")
    whatsapp = next((w for w in webs if "wa.me" in w or "wa.link" in w or "whatsapp" in w), "")
    web = next((w for w in webs if w not in (insta, whatsapp) and "facebook.com" not in w), "")
    dir_ = (x.get("addresses") or [{}])[0]
    return {
        "id": "ov:" + x["id"],
        "nombre": x["names"]["primary"].strip(),
        "lat": round(x["lat"], 6), "lon": round(x["lon"], 6),
        "categorias": cats,
        "telefono": telefono((x.get("phones") or [""])[0]),
        "facebook": (x.get("socials") or [""])[0],
        "instagram": insta, "whatsapp": whatsapp, "web": web,
        "direccion": (dir_.get("freeform") or "").strip(),
        "confianza": round(x.get("confidence") or 0, 2),
        "fuentes": ["overture"],
    }


def desde_osm(e):
    t = e["tags"]
    lat = e.get("lat", e.get("center", {}).get("lat"))
    lon = e.get("lon", e.get("center", {}).get("lon"))
    cats = [t.get("amenity", "")] + [c for c in t.get("cuisine", "").split(";") if c]
    return {
        "id": f"osm:{e['type']}/{e['id']}",
        "nombre": t.get("name", "").strip(),
        "lat": round(lat, 6), "lon": round(lon, 6),
        "categorias": cats,
        "telefono": telefono(t.get("phone") or t.get("contact:phone")),
        "facebook": t.get("contact:facebook", ""), "instagram": t.get("contact:instagram", ""),
        "whatsapp": "", "web": t.get("website", ""),
        "direccion": " ".join(filter(None, [t.get("addr:street"), t.get("addr:housenumber")])),
        "confianza": None,
        "fuentes": ["osm"],
    }


def mismo_lugar(a, b):
    ka, kb = clave_nombre(a["nombre"]), clave_nombre(b["nombre"])
    if not ka or not kb:
        return False
    d = distancia_m((a["lat"], a["lon"]), (b["lat"], b["lon"]))
    parecido = SequenceMatcher(None, ka, kb).ratio()
    contenido = min(len(ka), len(kb)) >= 4 and (ka in kb or kb in ka)
    return (parecido >= 0.8 or contenido) and d <= 300


def fusionar(base, otro):
    for campo in ("telefono", "facebook", "instagram", "whatsapp", "web", "direccion"):
        if not base[campo] and otro[campo]:
            base[campo] = otro[campo]
    base["categorias"] = list(dict.fromkeys(base["categorias"] + otro["categorias"]))
    base["fuentes"] = sorted(set(base["fuentes"]) | set(otro["fuentes"]))


class Registro:
    """Matrículas de comida de la Cámara de Comercio de Barrancabermeja, buscables por nombre."""

    def __init__(self, filas, hoy):
        # La renovación vence el 31 de marzo: desde abril, "al día" significa renovada este año.
        self.anio_vigente = hoy.year if hoy.month > 3 else hoy.year - 1
        self.por_clave = defaultdict(list)
        for fila in filas:
            k = clave_nombre(fila.get("razon_social", ""))
            if len(k) >= 4 and k not in GENERICAS:
                self.por_clave[k].append(fila)
        self.claves = list(self.por_clave)

    def estado(self, nombre):
        k = clave_nombre(nombre)
        if len(k) < 4 or k in GENERICAS:
            return None
        filas = self.por_clave.get(k)
        if not filas and len(k) >= 6:
            parecida = max(self.claves, key=lambda c: SequenceMatcher(None, k, c).ratio(), default=None)
            if parecida and SequenceMatcher(None, k, parecida).ratio() >= 0.9:
                filas = self.por_clave[parecida]
        if not filas:
            return None
        activas = [f for f in filas if f.get("estado_matricula") == "ACTIVA"]
        if activas:
            mejor = max(activas, key=lambda f: f.get("ultimo_ano_renovado") or "0")
            anio = int(mejor.get("ultimo_ano_renovado") or 0)
            estado = "al_dia" if anio >= self.anio_vigente else "sin_renovar"
        else:
            mejor = max(filas, key=lambda f: f.get("fecha_cancelacion") or "0")
            anio = int((mejor.get("fecha_cancelacion") or mejor.get("ultimo_ano_renovado") or "0")[:4])
            estado = "cancelado"
        return {"estado": estado, "anio": anio, "nombre": mejor["razon_social"].strip()}


def para_app(l):
    """Quita campos vacíos para que el archivo que viaja en la app sea pequeño."""
    salida = {"id": l["id"], "nombre": l["nombre"], "lat": l["lat"], "lon": l["lon"], "grupo": l["grupo"]}
    for campo in ("platos", "probables", "telefono", "whatsapp", "facebook", "instagram", "web", "direccion",
                  "registro"):
        if l.get(campo):
            salida[campo] = l[campo]
    if l["ubicacion_dudosa"]:
        salida["ubicacion_dudosa"] = True
    if l["confianza"] is not None:
        salida["confianza"] = l["confianza"]
    salida["fuentes"] = l["fuentes"]
    return salida


def main(fuentes, salida_json, salida_csv):
    hoy = datetime.now(ZoneInfo("America/Bogota")).date()
    overture = [desde_overture(x) for x in json.load(open(f"{fuentes}/overture_comida_municipio.json", encoding="utf-8"))]
    osm = [desde_osm(e) for e in json.load(open(f"{fuentes}/osm.json", encoding="utf-8"))["elements"]]
    osm = [o for o in osm if o["nombre"]]  # sin nombre no sirve para buscar
    registro = Registro(json.load(open(f"{fuentes}/registro_mercantil_comida.json", encoding="utf-8")), hoy)

    lugares = []
    for lugar in sorted(overture, key=lambda l: -(l["confianza"] or 0)) + osm:
        igual = next((l for l in lugares if mismo_lugar(l, lugar)), None)
        if igual:
            fusionar(igual, lugar)
        else:
            lugares.append(lugar)

    puntos = Counter((round(l["lat"], 4), round(l["lon"], 4)) for l in lugares)
    for l in lugares:
        l["platos"] = platos_de(l["nombre"], l["categorias"])
        l["grupo"] = grupo_de(l["categorias"], l["platos"])
        l["probables"] = probables_de(l["nombre"], l["grupo"], l["platos"])
        l["ubicacion_dudosa"] = puntos[(round(l["lat"], 4), round(l["lon"], 4))] >= 3
        l["registro"] = registro.estado(l["nombre"])
    lugares.sort(key=lambda l: plano(l["nombre"]))

    with open(salida_json, "w", encoding="utf-8") as f:
        json.dump({
            "version": hoy.isoformat(),
            "fuentes": [
                "Overture Maps Foundation, tema places (datos de Meta). CDLA-Permissive-2.0.",
                "© colaboradores de OpenStreetMap. ODbL.",
                "Registro mercantil: Confecámaras en datos.gov.co. CC BY-SA 4.0.",
            ],
            "lugares": [para_app(l) for l in lugares],
        }, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    campos = ["nombre", "grupo", "platos", "probables", "registro", "lat", "lon", "telefono", "whatsapp", "facebook",
              "instagram", "web", "direccion", "confianza", "ubicacion_dudosa", "fuentes", "id"]
    with open(salida_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        for l in lugares:
            r = l["registro"]
            w.writerow({**l, "platos": "; ".join(l["platos"]), "probables": "; ".join(l["probables"]),
                        "registro": f"{r['estado']} {r['anio']}" if r else "", "fuentes": "; ".join(l["fuentes"])})

    print("versión:", hoy.isoformat(), "| total lugares:", len(lugares))
    print("por grupo:", dict(Counter(l["grupo"] for l in lugares)))
    print("registro:", dict(Counter(l["registro"]["estado"] if l["registro"] else "sin registro" for l in lugares)))
    print("con teléfono:", sum(bool(l["telefono"]) for l in lugares),
          "| con plato confirmado:", sum(bool(l["platos"]) for l in lugares),
          "| solo platos probables:", sum(bool(l["probables"]) and not l["platos"] for l in lugares))
    print("ubicación dudosa:", sum(l["ubicacion_dudosa"] for l in lugares))


if __name__ == "__main__":
    main(*sys.argv[1:4])
