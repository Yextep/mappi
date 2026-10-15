"""Categorías de Mappi y cómo se traducen las de cada fuente.

Cada lugar queda en una sola categoría. El orden de CATEGORIAS es el de los botones de la app.
"""
import re

# código, nombre, color claro, color oscuro, palabras con las que la gente la busca
CATEGORIAS = [
    ("restaurante", "Restaurantes", "#d2441b", "#ff6c3f",
     ["restaurante", "restaurantes", "almuerzo", "almuerzos", "corrientazo", "comida", "comidas"]),
    ("rapida", "Comida rápida", "#c88700", "#f2b630",
     ["comida rapida", "comidas rapidas", "rapidas", "fast food"]),
    ("cafe", "Cafés, panaderías y postres", "#8b5a3b", "#cf9a77",
     ["cafe", "cafeteria", "panaderia", "pasteleria", "heladeria", "postres", "reposteria", "tinto"]),
    ("bar", "Bares y discotecas", "#5a4bb4", "#a090ff",
     ["bar", "bares", "discoteca", "discotecas", "taberna", "cerveceria", "estanco", "gastrobar", "rumba"]),
    ("mercado", "Supermercados y tiendas", "#2f7d32", "#6fcf73",
     ["supermercado", "tienda", "tiendas", "mercado", "minimercado", "autoservicio", "fruver", "carniceria",
      "abarrotes", "licorera", "granero", "d1", "ara", "olimpica", "exito"]),
    ("drogueria", "Droguerías", "#0a7d6c", "#4fd1bd",
     ["drogueria", "droguerias", "farmacia", "farmacias", "medicamentos", "naturista"]),
    ("salud", "Salud", "#c2185b", "#ff6f9f",
     ["clinica", "clinicas", "hospital", "hospitales", "consultorio", "medico", "odontologia", "odontologo",
      "dentista", "laboratorio", "optica", "ips", "eps", "urgencias", "psicologo", "fisioterapia"]),
    ("ropa", "Ropa, calzado y accesorios", "#7b3fa0", "#c792ea",
     ["ropa", "boutique", "calzado", "zapatos", "zapateria", "tenis", "joyeria", "bisuteria", "almacen",
      "confecciones", "lenceria", "uniformes"]),
    ("ferreteria", "Ferreterías y construcción", "#6d5a2e", "#d4b26a",
     ["ferreteria", "ferreterias", "materiales", "construccion", "pinturas", "cemento", "electricos",
      "vidrios", "deposito"]),
    ("papeleria", "Papelerías y librerías", "#1e63b4", "#6aa8ff",
     ["papeleria", "papelerias", "libreria", "libros", "fotocopias", "copias", "impresiones", "miscelanea",
      "utiles"]),
    ("tecnologia", "Celulares y tecnología", "#3949ab", "#8c9eff",
     ["celulares", "celular", "tecnologia", "computadores", "computador", "electronica", "accesorios celular",
      "videojuegos", "reparacion celulares"]),
    ("hogar", "Hogar y muebles", "#8d6e63", "#c9a99c",
     ["muebles", "muebleria", "colchones", "electrodomesticos", "hogar", "decoracion", "cocina"]),
    ("belleza", "Belleza y peluquerías", "#d81b60", "#ff80ab",
     ["peluqueria", "barberia", "salon de belleza", "belleza", "spa", "unas", "manicure", "estetica",
      "tatuajes", "cosmeticos"]),
    ("hotel", "Hoteles y hospedaje", "#00838f", "#4dd0e1",
     ["hotel", "hoteles", "hostal", "hospedaje", "residencias", "motel", "cabanas", "alojamiento"]),
    ("banco", "Bancos y cajeros", "#1b5e20", "#81c784",
     ["banco", "bancos", "cajero", "cajeros", "corresponsal", "giros", "efecty", "bancolombia", "davivienda",
      "cooperativa"]),
    ("vehiculo", "Talleres y repuestos", "#455a64", "#90a4ae",
     ["taller", "talleres", "mecanico", "repuestos", "llantas", "montallantas", "lavadero", "motos",
      "concesionario", "lubricantes"]),
    ("gasolina", "Estaciones de gasolina", "#e65100", "#ffab40",
     ["gasolina", "gasolinera", "bomba", "estacion de servicio", "combustible", "terpel", "texaco", "primax"]),
    ("educacion", "Colegios y educación", "#5d4037", "#bcaaa4",
     ["colegio", "colegios", "escuela", "universidad", "instituto", "jardin infantil", "academia", "sena"]),
    ("deporte", "Gimnasios y deporte", "#00695c", "#64d8cb",
     ["gimnasio", "gym", "cancha", "canchas", "deporte", "piscina", "crossfit", "yoga", "futbol"]),
    ("mascotas", "Mascotas y veterinarias", "#ad6800", "#ffc46b",
     ["veterinaria", "veterinario", "mascotas", "pet shop", "peluqueria canina", "agropecuaria"]),
    ("iglesia", "Iglesias", "#6a1b9a", "#ce93d8",
     ["iglesia", "iglesias", "parroquia", "templo", "capilla", "misa", "cristiana"]),
    ("gobierno", "Entidades públicas", "#37474f", "#b0bec5",
     ["alcaldia", "notaria", "registraduria", "policia", "cai", "bomberos", "juzgado", "gobernacion",
      "fiscalia", "correo", "4-72", "servicios publicos"]),
    ("ocio", "Entretenimiento y turismo", "#b71c1c", "#ff8a80",
     ["parque", "parques", "cine", "museo", "teatro", "casino", "turismo", "piscina", "billar", "eventos"]),
    ("transporte", "Transporte", "#283593", "#9fa8da",
     ["terminal", "aeropuerto", "parqueadero", "taxi", "bus", "transporte", "mudanzas", "encomiendas"]),
    ("tienda", "Otras tiendas", "#6a4c93", "#b39ddb",
     ["floristeria", "regalos", "jugueteria", "variedades", "centro comercial", "miscelanea", "cacharreria",
      "optica", "relojeria", "sex shop", "compraventa"]),
    ("servicios", "Empresas y servicios", "#546e7a", "#a7b6be",
     ["abogado", "abogados", "contador", "inmobiliaria", "empresa", "oficina", "servicios", "lavanderia",
      "funeraria", "seguros", "publicidad", "fabrica"]),
]
CODIGOS = [c[0] for c in CATEGORIAS]

# Categorías de Overture (taxonomy.hierarchy). Se busca de la más específica a la más general.
_OVERTURE = {
    "restaurante": """restaurant food_and_drink casual_eatery diner buffet_restaurant soup_restaurant comfort_food_restaurant
        bistro food_court caterer""",
    "rapida": """fast_food_restaurant burger_restaurant pizza_restaurant hot_dog_restaurant chicken_restaurant
        chicken_wings_restaurant sandwich_shop food_truck_stand taco_restaurant pizza_delivery_service fish_and_chips_restaurant
        doner_kebab_restaurant food_delivery_service""",
    "cafe": """cafe coffee_shop bakery ice_cream_shop dessert_shop cupcake_shop candy_store chocolatier frozen_yogurt_shop
        donut_shop gelato_shop tea_room bubble_tea_shop shaved_ice_shop smoothie_juice_bar pancake_house pie_shop
        bagel_shop patisserie_cake_shop hong_kong_style_cafe internet_cafe coffee_and_tea_supplies juice_bar""",
    "bar": """bar pub cocktail_bar beer_bar brewery lounge sports_bar wine_bar beer_garden gastropub tapas_bar gay_bar
        winery distillery dive_bar whiskey_bar hotel_bar irish_pub speakeasy hookah_bar dance_club salsa_club
        adult_entertainment_venue strip_club karaoke_venue nightlife_venue jazz_and_blues_venue""",
    "mercado": """grocery_store supermarket convenience_store butcher_shop produce_store fishmonger liquor_store
        warehouse_club_store superstore farmers_market public_market food_and_beverage_store health_food_store
        organic_grocery_store cheese_shop specialty_foods_store wholesale_grocer seafood_market dairy_store
        beer_wine_spirits_store korean_grocery_store ethical_grocery_store health_market pasta_store night_market
        meat_wholesaler market""",
    "drogueria": "pharmacy drugstore pharmacy_and_drug_store vitamin_and_supplement_store medical_supply_store",
    "salud": """health_care hospital dental_clinic doctors_office outpatient_care_facility general_dentistry optometry
        laboratory_testing eyewear_store vision_or_eye_care_clinic""",
    "ropa": """clothing_store womens_clothing_store mens_clothing_store childrens_clothing_store fashion_and_apparel_store
        shoe_store jewelry_store fashion_accessories_store fashion_boutique lingerie_store uniform_store swimwear_store
        bridal_shop handbag_store hat_store designer_clothing traditional_clothing maternity_wear sportswear_store
        leather_goods_store second_hand_clothing_store custom_clothing_store formal_wear_store watch_store
        sunglasses_store orthopedic_shoe_store custom_t_shirt_store luggage_store""",
    "ferreteria": """hardware_store building_supply_store lumber_store home_improvement_store paint_store
        electrical_supply_store hardware_home_and_garden_store glass_and_mirror_sales_service woodworking_supply_store""",
    "papeleria": """office_supply_store bookstore arts_crafts_and_hobby_store educational_supply_store cards_and_stationery_store
        newspaper_and_magazines_store printing_service academic_bookstore books_music_and_video_store craft_store
        comic_books_store""",
    "tecnologia": """mobile_phone_store computer_store electronics_store video_game_store it_service_and_computer_repair
        camera_and_photography_store audio_visual_equipment_store car_stereo_store home_theater_systems_stores
        computer_hardware_company""",
    "hogar": """furniture_store home_goods_store mattress_store appliance_store linen_store lighting_store carpet_store
        kitchen_supply_store home_decor_store furniture_accessory_store bedding_and_bath_store kitchen_and_bath_store
        window_treatment_store nursery_and_gardening_store""",
    "belleza": """beauty_salon barber hair_salon nail_salon spa day_spa health_spa medical_spa tattoo_and_piercing tattoo
        piercing beauty_supply_store hair_supply_store cosmetics_and_fragrance_store makeup_artist laser_hair_removal
        skin_care_and_makeup massage_therapy tanning_salon waxing hair_removal personal_or_beauty_service
        personal_care_and_beauty_store hair_stylist hair_extensions""",
    "hotel": "lodging hotel",
    "banco": """bank_or_credit_union bank credit_union atm money_transfer_service currency_exchange installment_loans
        financial_service""",
    "vehiculo": """automotive_repair motorcycle_repair auto_parts_store vehicle_parts_store car_wash tire_dealer_and_repair
        motorcycle_dealer auto_dealer used_auto_dealer oil_change_station auto_detailing automotive_service
        auto_body_shop truck_repair bike_store bike_repair_maintenance motorsports_store auto_customization
        car_window_tinting tire_shop truck_dealer""",
    "gasolina": "gas_station fueling_station",
    "educacion": "education day_care_preschool place_of_learning",
    "deporte": """gym sports_and_recreation sporting_goods_store dance_studio martial_arts_club yoga_studio pilates_studio
        swimming_pool soccer_field""",
    "mascotas": """veterinarian animal_or_pet_service pet_store pet_groomer pet_boarding aquatic_pet_store animal_hospital
        emergency_pet_hospital""",
    "iglesia": """christian_place_of_worship religious_organization roman_catholic_place_of_worship pentecostal_place_of_worship
        protestant_place_of_worship baptist_place_of_worship place_of_worship jewish_place_of_worship
        buddhist_place_of_worship muslim_place_of_worship hindu_place_of_worship religious_school""",
    "gobierno": "community_and_government notary_public post_office",
    "ocio": """arts_and_entertainment cultural_and_historic park amusement_park museum movie_theater casino cultural_center""",
    "transporte": """bus_station airport airport_terminal train_station taxi_service parking metro_station
        public_transit_facility_or_service""",
    "tienda": """shopping shopping_mall flowers_and_gifts_store florist gift_shop toy_store party_supply_store
        discount_store department_store pawn_shop second_hand_store souvenir_store antique_store tobacco_shop
        smoke_and_vape_store adult_store fabric_store musical_instrument_store costume_store""",
    "servicios": "services_and_business travel_and_transportation lifestyle_services",
}
OVERTURE = {}
for _codigo, _claves in _OVERTURE.items():
    for _clave in _claves.split():
        OVERTURE.setdefault(_clave, _codigo)
# Temas de Overture que no son negocios (ríos, montañas, sitios históricos sin dueño).
OVERTURE_EXCLUIDOS = {"geographic_entities", "historic_site", "monument", "fort", "palace", "castle", "cemetery",
                      "sculpture_statue", "street_art", "public_fountain", "public_plaza", "public_restroom"}

# Etiquetas de OpenStreetMap: clave=valor, o solo la clave como respaldo.
_OSM = {
    "restaurante": "amenity=restaurant amenity=food_court",
    "rapida": "amenity=fast_food",
    "cafe": "amenity=cafe amenity=ice_cream shop=bakery shop=pastry shop=confectionery shop=chocolate shop=coffee",
    "bar": "amenity=bar amenity=pub amenity=nightclub amenity=biergarten",
    "mercado": """shop=supermarket shop=convenience shop=greengrocer shop=butcher shop=alcohol shop=beverages
        shop=seafood shop=dairy shop=deli shop=food shop=wholesale amenity=marketplace shop=general shop=frozen_food""",
    "drogueria": "amenity=pharmacy shop=chemist shop=medical_supply shop=herbalist shop=nutrition_supplements",
    "salud": """amenity=hospital amenity=clinic amenity=doctors amenity=dentist healthcare shop=optician""",
    "ropa": """shop=clothes shop=shoes shop=jewelry shop=boutique shop=bag shop=fashion_accessories shop=watches""",
    "ferreteria": "shop=hardware shop=doityourself shop=paint shop=building_materials shop=trade shop=glaziery",
    "papeleria": "shop=stationery shop=books shop=copyshop shop=newsagent",
    "tecnologia": "shop=mobile_phone shop=electronics shop=computer shop=video_games",
    "hogar": "shop=furniture shop=appliance shop=bed shop=houseware shop=interior_decoration shop=lighting shop=garden_centre",
    "belleza": "shop=hairdresser shop=beauty shop=cosmetics shop=tattoo shop=massage leisure=spa",
    "hotel": "tourism=hotel tourism=hostel tourism=guest_house tourism=motel tourism=apartment tourism=chalet tourism=camp_site",
    "banco": "amenity=bank amenity=atm amenity=bureau_de_change amenity=money_transfer",
    "vehiculo": "shop=car_repair shop=car_parts shop=tyres shop=car shop=motorcycle shop=bicycle amenity=car_wash shop=motorcycle_repair",
    "gasolina": "amenity=fuel",
    "educacion": "amenity=school amenity=college amenity=university amenity=kindergarten amenity=language_school amenity=driving_school",
    "deporte": "leisure=sports_centre leisure=fitness_centre leisure=pitch leisure=swimming_pool shop=sports leisure=stadium",
    "mascotas": "amenity=veterinary shop=pet shop=pet_grooming",
    "iglesia": "amenity=place_of_worship",
    "gobierno": """amenity=townhall amenity=police amenity=fire_station amenity=post_office amenity=courthouse
        office=government amenity=community_centre amenity=social_facility""",
    "ocio": """leisure=park amenity=cinema amenity=theatre amenity=arts_centre tourism=museum tourism=attraction
        tourism=zoo tourism=theme_park amenity=casino leisure=water_park leisure=amusement_arcade amenity=library""",
    "transporte": "amenity=bus_station amenity=parking amenity=taxi aeroway=aerodrome amenity=ferry_terminal",
    "tienda": "shop amenity=vending_machine",
    "servicios": "office craft",
}
OSM = {}
for _codigo, _claves in _OSM.items():
    for _clave in _claves.split():
        OSM.setdefault(_clave, _codigo)
OSM_CLAVES = ("amenity", "shop", "tourism", "leisure", "healthcare", "office", "craft", "aeroway")
# Elementos de OSM que no son lugares a los que uno va.
OSM_EXCLUIDOS = {"amenity=parking_space", "amenity=bench", "amenity=waste_basket", "amenity=toilets",
                 "amenity=drinking_water", "amenity=shelter", "amenity=parking_entrance", "amenity=bicycle_parking",
                 "amenity=recycling", "amenity=telephone", "amenity=fountain", "amenity=clock", "amenity=grave_yard",
                 "leisure=pitch", "tourism=information", "tourism=viewpoint", "tourism=artwork", "leisure=playground",
                 "leisure=garden", "leisure=nature_reserve", "amenity=waste_disposal", "amenity=post_box",
                 "amenity=vending_machine", "amenity=charging_station", "amenity=motorcycle_parking",
                 "leisure=picnic_table", "leisure=outdoor_seating", "amenity=hunting_stand", "leisure=track"}


def desde_overture(jerarquia, primaria, basica):
    """Categoría Mappi de un lugar de Overture, o None si no es un negocio."""
    claves = list(reversed(jerarquia or [])) or [primaria]
    if any(c in OVERTURE_EXCLUIDOS for c in claves + [primaria]):
        return None
    for clave in claves + [basica]:
        if clave in OVERTURE:
            return OVERTURE[clave]
    return "servicios" if primaria or basica else None


def desde_osm(etiquetas):
    for clave in OSM_CLAVES:
        valor = etiquetas.get(clave)
        if not valor:
            continue
        par = f"{clave}={valor}"
        if par in OSM_EXCLUIDOS:
            return None
        if par in OSM:
            return OSM[par]
        if clave in OSM:
            return OSM[clave]
    return None


# Clasificación CIIU Rev. 4 A.C. (registro mercantil y alcaldías). Se prueba el código completo y luego sus prefijos.
_CIIU = {
    "5611": "restaurante", "5612": "restaurante", "5619": "rapida", "5613": "cafe", "5621": "restaurante",
    "5629": "restaurante", "5630": "bar", "1081": "cafe", "1082": "cafe", "1084": "restaurante",
    "4711": "mercado", "4719": "tienda", "4721": "mercado", "4722": "mercado", "4723": "mercado", "4724": "mercado",
    "4729": "mercado", "4773": "drogueria", "4774": "tienda", "4775": "tienda", "4741": "tecnologia",
    "4742": "tecnologia", "4751": "ropa", "4752": "ferreteria", "4753": "hogar", "4754": "hogar", "4755": "hogar",
    "4759": "hogar", "4761": "papeleria", "4762": "deporte", "4769": "tienda", "4771": "ropa", "4772": "ropa",
    "4731": "gasolina", "4732": "vehiculo", "45": "vehiculo", "86": "salud", "87": "salud", "75": "mascotas",
    "55": "hotel", "64": "banco", "65": "banco", "66": "banco", "85": "educacion", "8810": "salud",
    "9311": "deporte", "9312": "deporte", "9319": "deporte", "932": "ocio", "90": "ocio", "91": "ocio", "92": "ocio",
    "5914": "ocio", "9602": "belleza", "9491": "iglesia", "84": "gobierno", "5310": "gobierno", "49": "transporte",
    "50": "transporte", "51": "transporte", "52": "transporte", "46": "tienda", "47": "tienda",
    "1811": "papeleria", "1812": "papeleria", "9511": "tecnologia", "9512": "tecnologia", "9521": "tecnologia",
    "9522": "hogar", "9523": "ropa", "9524": "hogar",
}


def desde_ciiu(codigo):
    codigo = re.sub(r"\D", "", codigo or "")
    for largo in (4, 3, 2):
        if codigo[:largo] in _CIIU:
            return _CIIU[codigo[:largo]]
    return "servicios" if codigo else None
