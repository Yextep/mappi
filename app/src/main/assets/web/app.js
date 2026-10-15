'use strict';

(() => {
  // Datos publicados cada mes por la acción «Actualizar lugares» en la rama «datos» del repositorio.
  const DATOS = 'https://raw.githubusercontent.com/Yextep/mappi/datos/';
  // Índice y límites de municipios incluidos en el APK, para arrancar sin conexión.
  const LOCAL = '../';
  // La escribe scripts/publicar_version.py. Las apps instaladas la consultan siempre aquí: no cambiar esta dirección.
  const MANIFIESTO = 'https://raw.githubusercontent.com/Yextep/mappi/main/version.json';
  const DESCARGAS = 'https://github.com/Yextep/mappi/releases/download/';
  const CLAVE_ESTADO = 'mappi.estado.v1';
  const CLAVE_POSPUESTA = 'mappi.pospuesta.v1';
  const CLAVE_REVISION = 'mappi.revision.v2';
  const CACHE = 'mappi-datos-v2';
  const UN_DIA = 24 * 60 * 60 * 1000;
  const POR_PAGINA = 60;
  // La versión 1 solo tenía Barrancabermeja: lo que se guardó entonces es de allá.
  const MUNICIPIO_V1 = '68081';
  const COLOMBIA = [[-82.5, -5.2], [-65.5, 14.2]];

  // Nombre del plato tal como viene en los datos -> palabras con las que la gente lo busca.
  const SINONIMOS = {
    'pizza': ['pizza', 'pizzas', 'pizzeria'],
    'hamburguesa': ['hamburguesa', 'hamburguesas', 'burger', 'burguer', 'hamburgueseria'],
    'perro caliente': ['perro caliente', 'perros calientes', 'perro', 'perros', 'hot dog', 'hotdog', 'perrada'],
    'salchipapa': ['salchipapa', 'salchipapas', 'salchipapeteria'],
    'arepa': ['arepa', 'arepas', 'arepera'],
    'pollo': ['pollo', 'pollo asado', 'broaster', 'asadero', 'pollos'],
    'carnes y parrilla': ['carne', 'carnes', 'parrilla', 'parrillada', 'asado', 'asados', 'churrasco', 'steak', 'bbq', 'costillas'],
    'pescado y mariscos': ['pescado', 'mariscos', 'marisco', 'mojarra', 'bocachico', 'camarones', 'camaron'],
    'ceviche': ['ceviche', 'cevicheria', 'coctel'],
    'sushi': ['sushi', 'japonesa', 'japones'],
    'comida china': ['comida china', 'china', 'chino', 'arroz chino', 'wok'],
    'mexicana': ['mexicana', 'mexicano', 'tacos', 'taco', 'burrito', 'burritos', 'nachos'],
    'árabe': ['arabe', 'shawarma', 'kebab'],
    'italiana': ['italiana', 'pasta', 'pastas', 'lasagna', 'lasana'],
    'helado': ['helado', 'helados', 'heladeria', 'paleta', 'paletas'],
    'postres': ['postre', 'postres', 'torta', 'tortas', 'pastel', 'reposteria', 'pasteleria'],
    'panadería': ['panaderia', 'pan', 'pandebono', 'almojabana'],
    'café': ['cafe', 'tinto', 'capuchino', 'cafeteria'],
    'jugos': ['jugo', 'jugos', 'batido', 'batidos', 'salpicon', 'limonada'],
    'empanada': ['empanada', 'empanadas'],
    'buñuelo': ['bunuelo', 'bunuelos'],
    'comida típica': ['comida tipica', 'tipica', 'tipico', 'corrientazo', 'sancocho', 'mute', 'bandeja paisa', 'lechona', 'tamal', 'tamales'],
    'desayunos': ['desayuno', 'desayunos', 'calentado'],
    'sándwich': ['sandwich', 'sanduche', 'panini', 'sandwiches'],
    'picada': ['picada', 'picadas', 'mazorcada'],
    'alitas': ['alitas', 'alas', 'wings'],
  };
  const CHIPS_PLATOS = [
    ['Pizza', 'pizza'], ['Hamburguesa', 'hamburguesa'], ['Salchipapa', 'salchipapa'], ['Perro caliente', 'perro caliente'],
    ['Arepa', 'arepa'], ['Pollo', 'pollo'], ['Carnes', 'carnes y parrilla'], ['Mariscos', 'pescado y mariscos'],
    ['Comida china', 'comida china'], ['Comida típica', 'comida típica'], ['Desayunos', 'desayunos'], ['Helado', 'helado'],
    ['Postres', 'postres'], ['Café', 'café'], ['Jugos', 'jugos'], ['Panadería', 'panadería'], ['Sushi', 'sushi'],
    ['Mexicana', 'mexicana'], ['Árabe', 'árabe'], ['Alitas', 'alitas'],
  ];
  const COMIDA = new Set(['restaurante', 'rapida', 'cafe', 'bar']);
  const VISTAS = [['todos', 'Todos'], ['favoritos', 'Favoritos'], ['calificados', 'Calificados'], ['visitados', 'Ya fui'], ['pendientes', 'No he ido']];
  const GUARDADAS = new Set(['favoritos', 'calificados', 'visitados']);
  const FUENTES = [[1, 'Overture Maps (Facebook, Microsoft y otros)'], [2, 'OpenStreetMap'], [4, 'Industria y Comercio de Medellín']];
  const NOMBRES_ESTRELLAS = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];
  // Lo que se guarda por lugar; la clave es el id del lugar.
  const MAPAS_POR_ID = ['favoritos', 'visitados', 'cerrados', 'abiertos', 'platos', 'enlaces', 'calificaciones', 'guardados'];

  const $ = (sel) => document.querySelector(sel);
  const hoja = $('#hoja');
  const contenido = $('#hoja-contenido');
  const entrada = $('#q');

  let indice = { version: '', fuentes: [], categorias: [], municipios: [] };
  let limites = { version: '', municipios: {} };
  let categorias = new Map();
  let ordenCategorias = [];
  let municipiosPorCodigo = new Map();
  let municipio = null;
  let datosMunicipio = null;
  let cargando = null;
  let errorCarga = '';
  const descargados = new Set();
  let lugares = [];
  let porId = new Map();
  let estado = cargarEstado();
  let resultados = [];
  let ordenados = false;
  let conteos = {};
  let ubicacion = null;
  let buscandoUbicacion = false;
  let pila = [];
  let pagina = POR_PAGINA;
  let listo = false;
  const app = versionInstalada();
  let nuevaVersion = null;
  let versionRevisada = false;
  const pendientesCompartidos = [];

  // ---------- utilidades ----------
  const plano = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const urlSegura = (u) => {
    try {
      const url = new URL(String(u || '').trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (e) {
      return '';
    }
  };
  const hoyISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const formatoFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  const fecha = (iso) => {
    const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    return a ? formatoFecha.format(new Date(a, (m || 1) - 1, d || 1)) : '';
  };
  const formatoKm = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
  const distanciaTexto = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${formatoKm.format(m / 1000)} km`);
  const plural = (n, uno, varios) => `${n.toLocaleString('es-CO')} ${n === 1 ? uno : varios}`;
  const icono = (nombre, clase = '') => `<svg class="icono ${clase}"><use href="#i-${nombre}"/></svg>`;
  const color = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const oscuro = window.matchMedia('(prefers-color-scheme: dark)');
  const colorCategoria = (c) => {
    const cat = categorias.get(c);
    if (!cat) return color('--texto-2');
    return oscuro.matches ? cat.oscuro : cat.color;
  };
  const nombreCategoria = (c) => (categorias.get(c) || { n: 'Lugar' }).n;

  function distancia(a, b) {
    const r = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * r / 2) ** 2
      + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  let temporizadorAviso;
  function aviso(texto) {
    const el = $('#aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => { el.hidden = true; }, 3800);
  }

  // ---------- estado guardado en el teléfono ----------
  function estadoVacio() {
    return {
      favoritos: {}, visitados: {}, cerrados: {}, abiertos: {}, platos: {}, enlaces: {}, calificaciones: {}, guardados: {},
      propios: [],
      ajustes: { ocultas: [], categoria: '', ocultarCerrados: true, vista: 'todos', municipio: '', fijo: false, orden: 'mejores' },
    };
  }
  // Los identificadores de la versión 1 («ov:uuid», «osm:node/123») pasan al formato corto de la 2.
  function idNuevo(id) {
    const s = String(id);
    if (s.startsWith('ov:')) return `o${s.slice(3).replace(/-/g, '').slice(0, 12)}`;
    const osm = s.match(/^osm:(node|way|relation)\/(\d+)$/);
    if (osm) return `${osm[1][0]}${osm[2]}`;
    return s;
  }
  function normalizarEstado(e) {
    const base = estadoVacio();
    if (!e || typeof e !== 'object') return base;
    for (const k of MAPAS_POR_ID) {
      if (!e[k] || typeof e[k] !== 'object' || Array.isArray(e[k])) continue;
      for (const [id, valor] of Object.entries(e[k])) {
        const nuevo = idNuevo(id);
        base[k][nuevo] = valor;
        // Lo guardado en la versión 1 es de Barrancabermeja.
        if (nuevo !== id && k !== 'guardados' && !base.guardados[nuevo]) base.guardados[nuevo] = { m: MUNICIPIO_V1 };
      }
    }
    for (const [id, c] of Object.entries(base.calificaciones)) {
      if (!c || !Number.isInteger(c.estrellas) || c.estrellas < 1 || c.estrellas > 5) delete base.calificaciones[id];
    }
    if (Array.isArray(e.propios)) {
      base.propios = e.propios.filter((p) => p && typeof p.nombre === 'string'
        && Number.isFinite(p.lat) && Number.isFinite(p.lon) && String(p.id || '').startsWith('yo:'))
        .map((p) => ({ ...p, cat: p.cat || p.grupo || 'restaurante', m: p.m || MUNICIPIO_V1 }));
    }
    if (e.ajustes && typeof e.ajustes === 'object') {
      const a = e.ajustes;
      if (Array.isArray(a.ocultas)) base.ajustes.ocultas = a.ocultas.filter((c) => typeof c === 'string');
      if (typeof a.categoria === 'string') base.ajustes.categoria = a.categoria;
      if (typeof a.ocultarCerrados === 'boolean') base.ajustes.ocultarCerrados = a.ocultarCerrados;
      if (VISTAS.some(([v]) => v === a.vista)) base.ajustes.vista = a.vista;
      if (/^\d{5}$/.test(a.municipio || '')) base.ajustes.municipio = a.municipio;
      if (typeof a.fijo === 'boolean') base.ajustes.fijo = a.fijo;
      if (a.orden === 'peores') base.ajustes.orden = 'peores';
      // Quien usaba la versión 1 seguía en Barrancabermeja.
      if (Array.isArray(a.grupos) && !base.ajustes.municipio) base.ajustes.municipio = MUNICIPIO_V1;
    }
    return base;
  }
  function cargarEstado() {
    try {
      return normalizarEstado(JSON.parse(localStorage.getItem(CLAVE_ESTADO)));
    } catch (e) {
      return estadoVacio();
    }
  }
  function guardar() {
    try {
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
    } catch (e) {
      aviso('No se pudo guardar el cambio en el teléfono.');
    }
  }
  // Copia mínima de un lugar marcado, para listarlo aunque su municipio no esté abierto.
  function recordar(l) {
    if (!l || l.propio) return;
    estado.guardados[l.id] = { n: l.nombre, lat: l.lat, lon: l.lon, c: l.cat, m: l.m || (municipio && municipio.c) };
  }
  function enUso(id) {
    return ['favoritos', 'visitados', 'cerrados', 'abiertos', 'platos', 'enlaces', 'calificaciones'].some((k) => estado[k][id]);
  }
  function olvidarSiNoSeUsa(id) {
    if (!enUso(id)) delete estado.guardados[id];
  }

  // ---------- índice de municipios y categorías ----------
  async function leerJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  async function abrirCache() {
    try {
      return window.caches ? await caches.open(CACHE) : null;
    } catch (e) {
      return null;
    }
  }
  async function delCache(url) {
    const c = await abrirCache();
    const r = c && await c.match(url);
    return r ? r.json() : null;
  }
  async function aCache(url, texto) {
    const c = await abrirCache();
    if (c) await c.put(url, new Response(texto, { headers: { 'Content-Type': 'application/json' } }));
  }
  const indiceValido = (d) => d && d.formato === 2 && /^\d{4}-\d{2}-\d{2}$/.test(d.version || '')
    && Array.isArray(d.categorias) && d.categorias.length > 10 && Array.isArray(d.municipios) && d.municipios.length > 900;
  function usarIndice(d) {
    indice = d;
    categorias = new Map(d.categorias.map((c, i) => [c.c, { ...c, i }]));
    ordenCategorias = d.categorias.map((c) => c.c);
    municipiosPorCodigo = new Map(d.municipios.map((m) => [m.c, m]));
    if (municipio) municipio = municipiosPorCodigo.get(municipio.c) || municipio;
  }
  async function cargarIndice() {
    const local = await leerJSON(`${LOCAL}indice.json`);
    const guardado = await delCache(`${DATOS}indice.json`).catch(() => null);
    usarIndice(indiceValido(guardado) && guardado.version > local.version ? guardado : local);
    const limitesLocales = await leerJSON(`${LOCAL}limites.json`);
    const limitesGuardados = await delCache(`${DATOS}limites.json`).catch(() => null);
    limites = limitesGuardados && limitesGuardados.version > limitesLocales.version ? limitesGuardados : limitesLocales;
    const c = await abrirCache();
    if (c) {
      for (const req of await c.keys()) {
        const m = req.url.match(/\/m\/(\d{5})\.json\.gz$/);
        if (m) descargados.add(m[1]);
      }
    }
  }
  // Una vez al día: si hay datos nuevos, se renueva el índice y el municipio abierto.
  async function revisarDatos(manual) {
    if (!manual) {
      let ultima = 0;
      try { ultima = Number(localStorage.getItem(CLAVE_REVISION)) || 0; } catch (e) { /* sin registro */ }
      if (Date.now() - ultima < UN_DIA) return;
    }
    try {
      const respuesta = await fetch(`${DATOS}indice.json`, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const texto = await respuesta.text();
      const nuevo = JSON.parse(texto);
      if (!indiceValido(nuevo)) throw new Error('índice no válido');
      try { localStorage.setItem(CLAVE_REVISION, String(Date.now())); } catch (e) { /* sin espacio */ }
      if (nuevo.version > indice.version) {
        await aCache(`${DATOS}indice.json`, texto);
        if (nuevo.version > limites.version) {
          const r = await fetch(`${DATOS}limites.json`, { cache: 'no-store' });
          if (r.ok) {
            const t = await r.text();
            limites = JSON.parse(t);
            await aCache(`${DATOS}limites.json`, t);
          }
        }
        usarIndice(nuevo);
        if (municipio) {
          await abrirMunicipio(municipio.c, { encuadrar: false });
          aviso(`Lugares actualizados al ${fecha(nuevo.version)}.`);
        }
      } else if (manual) {
        aviso(`Ya tienes los datos más recientes (${fecha(indice.version)}).`);
      }
    } catch (e) {
      if (manual) aviso('No se pudo buscar la actualización. Revisa la conexión a internet.');
    }
  }

  function dentroDe(anillo, x, y) {
    let adentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i];
      const [xj, yj] = anillo[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) adentro = !adentro;
    }
    return adentro;
  }
  function municipioEn(lat, lon) {
    for (const m of indice.municipios) {
      const [x0, y0, x1, y1] = m.caja;
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      const anillos = limites.municipios[m.c] || [];
      if (anillos.some((a) => dentroDe(a, lon, lat))) return m;
    }
    return null;
  }

  // ---------- lugares del municipio ----------
  async function leerGzip(respuesta) {
    if (!window.DecompressionStream) throw new Error('Este teléfono no puede descomprimir los datos');
    const flujo = respuesta.body.pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flujo).text());
  }
  const datosValidos = (d) => d && d.formato === 2 && Array.isArray(d.id) && Array.isArray(d.nombres)
    && d.id.length === d.nombres.length && d.lat.length === d.id.length && d.lon.length === d.id.length;
  async function descargarMunicipio(m) {
    const url = `${DATOS}m/${m.c}.json.gz`;
    const cache = await abrirCache();
    let datos = null;
    try {
      const guardado = cache && await cache.match(url);
      if (guardado) datos = await leerGzip(guardado);
    } catch (e) { datos = null; }
    if (datosValidos(datos) && datos.version >= indice.version) return datos;
    try {
      const respuesta = await fetch(url, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const copia = respuesta.clone();
      const nuevos = await leerGzip(respuesta);
      if (!datosValidos(nuevos)) throw new Error('datos no válidos');
      if (cache) {
        await cache.put(url, copia);
        descargados.add(m.c);
      }
      return nuevos;
    } catch (e) {
      if (datosValidos(datos)) return datos;  // sin conexión: la copia anterior sirve
      throw e;
    }
  }
  async function abrirMunicipio(codigo, { encuadrar = true } = {}) {
    const m = municipiosPorCodigo.get(codigo);
    if (!m) return false;
    cargando = m;
    errorCarga = '';
    render();
    try {
      const datos = await descargarMunicipio(m);
      if (cargando !== m) return false;
      datosMunicipio = datos;
      municipio = m;
      estado.ajustes.municipio = m.c;
      guardar();
      reconstruir();
      if (encuadrar) encuadrarMunicipio();
      // Lo compartido mientras no había un municipio abierto se entrega ahora.
      if (listo) setTimeout(entregarCompartidos);
      return true;
    } catch (e) {
      if (cargando === m) errorCarga = `No se pudieron descargar los lugares de ${m.n}. Revisa la conexión a internet.`;
      return false;
    } finally {
      if (cargando === m) cargando = null;
      render();
    }
  }
  function reconstruir() {
    const d = datosMunicipio;
    const nuevos = [];
    if (d) {
      let lat = 0;
      let lon = 0;
      for (let i = 0; i < d.id.length; i++) {
        lat += d.lat[i];
        lon += d.lon[i];
        const extra = d.extra[i] || {};
        nuevos.push({
          id: d.id[i], nombre: d.nombres[i], lat: lat / 1e5, lon: lon / 1e5,
          cat: (indice.categorias[d.cat[i]] || {}).c || 'servicios', tel: d.tel[i] || '', dir: d.dir[i] || '',
          fuentes: d.fuentes[i] || 0, reg: d.reg[i] || 0, regAnio: d.regAnio[i] || 0, m: d.codigo,
          fb: extra.fb || '', ig: extra.ig || '', web: extra.web || '', wa: extra.wa || '',
          platos: extra.platos || [], probables: extra.probables || [], regNombre: extra.regNombre || '', dudosa: !!extra.dudosa,
        });
      }
    }
    const codigo = municipio ? municipio.c : '';
    for (const p of estado.propios) {
      if (p.m !== codigo) continue;
      nuevos.push({
        id: p.id, nombre: p.nombre, lat: p.lat, lon: p.lon, cat: categorias.has(p.cat) ? p.cat : 'restaurante',
        platos: Array.isArray(p.platos) ? p.platos : [], probables: [], tel: p.telefono || '', dir: '', fuentes: 0, reg: 0,
        regAnio: 0, propio: true, creado: p.creado, m: p.m,
      });
    }
    for (const l of nuevos) {
      const sen = Math.sin(l.lat * Math.PI / 180);
      l._x = (l.lon + 180) / 360;
      l._y = 0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI);
    }
    lugares = nuevos;
    porId = new Map(lugares.map((l) => [l.id, l]));
    zona = zonaCentral(lugares);
    prepararBusqueda(nuevos);
    // Completa las copias de lo marcado en la versión 1 (solo tenían el municipio).
    let cambio = false;
    for (const [id, g] of Object.entries(estado.guardados)) {
      const l = porId.get(id);
      if (l && (!g.n || g.n !== l.nombre)) {
        recordar(l);
        cambio = true;
      }
    }
    if (cambio) guardar();
    aplicar();
  }

  // Normaliza los nombres por partes mientras el teléfono está libre: la primera búsqueda en una ciudad grande es más rápida.
  function prepararBusqueda(lista) {
    let i = 0;
    const paso = () => {
      if (lista !== lugares) return;
      const fin = Math.min(lista.length, i + 15000);
      for (; i < fin; i++) nombrePlano(lista[i]);
      if (i < lista.length) setTimeout(paso, 16);
    };
    setTimeout(paso, 300);
  }

  // ---------- versiones nuevas de la app ----------
  // El APK dice qué versión es; en el navegador de las pruebas no hay nada que actualizar.
  function versionInstalada() {
    try {
      const v = JSON.parse(window.MappiAndroid.version());
      if (typeof v.nombre === 'string' && Number.isInteger(v.codigo) && v.codigo > 0) return v;
    } catch (e) { /* fuera de Android */ }
    return { nombre: '', codigo: 0 };
  }
  // Solo se aceptan descargas de las releases del repositorio; Android además exige la misma firma para instalar encima.
  function aplicarManifiesto(m) {
    if (!app.codigo || !m || typeof m.version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(m.version)
      || !Number.isInteger(m.codigo) || typeof m.apk !== 'string' || !m.apk.startsWith(DESCARGAS) || !m.apk.endsWith('.apk')) return false;
    nuevaVersion = m.codigo > app.codigo ? {
      version: m.version, codigo: m.codigo, apk: m.apk,
      notas: typeof m.notas === 'string' ? m.notas.trim().slice(0, 500) : '',
      obligatoria: Number.isInteger(m.codigo_minimo) && app.codigo < m.codigo_minimo,
    } : null;
    const boton = $('#abrir-menu');
    boton.classList.toggle('con-novedad', !!nuevaVersion);
    boton.setAttribute('aria-label', nuevaVersion ? 'Hay una versión nueva de Mappi. Datos, respaldo y lugares ocultos' : 'Datos, respaldo y lugares ocultos');
    return true;
  }
  async function revisarVersion(manual) {
    if (!app.codigo) return;
    try {
      const respuesta = await fetch(MANIFIESTO, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      if (!aplicarManifiesto(await respuesta.json())) throw new Error('version.json no válido');
      ofrecerVersion(manual);
    } catch (e) {
      // Sin conexión: se revisa otra vez la próxima vez que se abra la app.
    } finally {
      versionRevisada = true;
    }
  }
  // Al abrir la app el aviso aparece solo si no hay otra cosa en pantalla y no se pospuso hace poco.
  function ofrecerVersion(manual) {
    if (!nuevaVersion || vistaActual().tipo === 'version') return;
    if (nuevaVersion.obligatoria) {
      pila = [{ tipo: 'version' }];
      render();
      return;
    }
    if (!manual) {
      let pospuesta = null;
      try { pospuesta = JSON.parse(localStorage.getItem(CLAVE_POSPUESTA)); } catch (e) { /* nada pospuesto */ }
      if (pila.length || (pospuesta && pospuesta.codigo === nuevaVersion.codigo && Date.now() < pospuesta.hasta)) return;
    }
    mostrar({ tipo: 'version' });
  }
  function posponerVersion() {
    try {
      localStorage.setItem(CLAVE_POSPUESTA, JSON.stringify({ codigo: nuevaVersion.codigo, hasta: Date.now() + 3 * UN_DIA }));
    } catch (e) { /* se vuelve a ofrecer en la próxima apertura */ }
    atras();
  }

  // ---------- búsqueda y filtros ----------
  function platosDeConsulta(q) {
    if (q.length < 3) return [];
    return Object.keys(SINONIMOS).filter((plato) => SINONIMOS[plato].some((s) => s === q || s.startsWith(q)
      || (s.length >= 4 && (q.startsWith(`${s} `) || q.endsWith(` ${s}`) || q === `${s}s`))));
  }
  function categoriasDeConsulta(q) {
    if (q.length < 3) return [];
    return ordenCategorias.filter((c) => {
      const cat = categorias.get(c);
      return plano(cat.n) === q || (cat.s || []).some((s) => s === q || (q.length >= 4 && s.startsWith(q)) || q === `${s}s`);
    });
  }
  function platosDe(l) {
    const mios = estado.platos[l.id] || [];
    return [...new Set([...(l.platos || []), ...mios])];
  }
  function nombrePlano(l) {
    if (l._plano === undefined) l._plano = plano(l.nombre);
    return l._plano;
  }
  // Se llama una vez por lugar en cada búsqueda (300.000 veces en Medellín): sin copias ni normalizar de nuevo.
  function puntaje(l, q, platosQ, catsQ) {
    if (!q) return 1;
    if (catsQ.length && catsQ.includes(l.cat)) return 4;
    const mios = estado.platos[l.id];
    const conPlatos = l.platos.length > 0 || !!mios;
    if (platosQ.length && conPlatos) {
      for (const p of platosQ) if (l.platos.includes(p) || (mios && mios.includes(p))) return 4;
    }
    if (nombrePlano(l).includes(q)) return 3;
    if (conPlatos) {
      if (l._platosPlano === undefined) l._platosPlano = plano(l.platos.join(' '));
      if (l._platosPlano.includes(q) || (mios && plano(mios.join(' ')).includes(q))) return 3;
    }
    if (platosQ.length && l.probables.length) for (const p of platosQ) if (l.probables.includes(p)) return 1;
    return 0;
  }
  function posibleCierre(l) {
    if (estado.cerrados[l.id]) return 'usuario';
    // Industria y Comercio de Medellín solo publica establecimientos activos.
    if (l.reg === 3 && !(l.fuentes & 4) && !estado.abiertos[l.id]) return 'registro';
    return null;
  }
  function pasaCategoria(l) {
    if (l.propio) return true;
    const elegida = estado.ajustes.categoria;
    if (elegida) return l.cat === elegida;
    return !estado.ajustes.ocultas.includes(l.cat);
  }
  function consultaActual() {
    return plano(entrada.value);
  }
  // Lugar marcado de otro municipio: solo se conoce su copia mínima.
  function lugarGuardado(id) {
    const l = porId.get(id);
    if (l) return l;
    const g = estado.guardados[id];
    if (!g || !g.n) return null;
    return { id, nombre: g.n, lat: g.lat, lon: g.lon, cat: g.c, m: g.m, otro: true, platos: [], probables: [], fuentes: 0, reg: 0 };
  }
  function listaGuardada(vista, q, platosQ, catsQ) {
    const mapa = vista === 'favoritos' ? estado.favoritos : vista === 'visitados' ? estado.visitados : estado.calificaciones;
    const lista = [];
    for (const id of Object.keys(mapa)) {
      const l = lugarGuardado(id);
      if (!l || estado.cerrados[id]) continue;
      const p = puntaje(l, q, platosQ, catsQ);
      if (p > 0) lista.push({ l, p, d: ubicacion ? distancia(ubicacion, l) : null });
    }
    return lista;
  }
  function aplicar({ encuadrar = false } = {}) {
    const q = consultaActual();
    const platosQ = platosDeConsulta(q);
    const catsQ = categoriasDeConsulta(q);
    const vista = estado.ajustes.vista;
    const todos = [];
    let pendientes = 0;
    for (const l of lugares) {
      if (estado.cerrados[l.id] || !pasaCategoria(l)) continue;
      if (estado.ajustes.ocultarCerrados && posibleCierre(l) === 'registro') continue;
      const p = puntaje(l, q, platosQ, catsQ);
      if (p <= 0) continue;
      todos.push({ l, p, d: null });
      if (!estado.visitados[l.id]) pendientes += 1;
    }
    conteos = { todos: todos.length, pendientes };
    for (const v of GUARDADAS) conteos[v] = listaGuardada(v, q, platosQ, catsQ).length;
    if (vista === 'todos') resultados = todos;
    else if (vista === 'pendientes') resultados = todos.filter((r) => !estado.visitados[r.l.id]);
    else resultados = listaGuardada(vista, q, platosQ, catsQ);
    ordenados = false;
    pagina = POR_PAGINA;
    actualizarTeselas();
    marcarChips();
    $('#limpiar').hidden = !entrada.value;
    if (encuadrar) encuadrarResultados();
    const tipo = pila.length ? pila[pila.length - 1].tipo : 'resumen';
    if (tipo === 'resumen' || tipo === 'lista' || tipo === 'filtros') render();
  }
  // La lista se ordena solo cuando se muestra: en Bogotá son más de 100.000 lugares.
  function ordenar() {
    if (ordenados) return;
    if (ubicacion) for (const r of resultados) r.d = distancia(ubicacion, r.l);
    if (estado.ajustes.vista === 'calificados') {
      const signo = estado.ajustes.orden === 'peores' ? 1 : -1;
      const estrellas = (r) => estado.calificaciones[r.l.id].estrellas;
      resultados.sort((a, b) => signo * (estrellas(a) - estrellas(b)) || (a.d ?? 0) - (b.d ?? 0));
    } else if (ubicacion) {
      resultados.sort((a, b) => b.p - a.p || a.d - b.d);
    } else {
      resultados.sort((a, b) => b.p - a.p || (nombrePlano(a.l) < nombrePlano(b.l) ? -1 : 1));
    }
    ordenados = true;
  }

  // ---------- teselas vectoriales hechas en el teléfono ----------
  // MapLibre pide cada tesela a «mappi://»; se arma con los lugares visibles, sin pasar por GeoJSON.
  const EXTENSION = 4096;
  const NIVEL_INDICE = 14;
  const codificador = new TextEncoder();
  let visibles = [];
  let cubos = new Map();
  let versionTeselas = 0;
  class Pbf {
    constructor() { this.b = []; }
    varint(v) {
      while (v > 127) {
        this.b.push((v & 127) | 128);
        v = Math.floor(v / 128);
      }
      this.b.push(v);
    }
    clave(campo, tipo) { this.varint(campo * 8 + tipo); }
    bytes(campo, bytes) {
      this.clave(campo, 2);
      this.varint(bytes.length);
      for (let i = 0; i < bytes.length; i++) this.b.push(bytes[i]);
    }
    texto(campo, s) { this.bytes(campo, codificador.encode(s)); }
    entero(campo, v) {
      this.clave(campo, 0);
      this.varint(v);
    }
    empacados(campo, valores) {
      const p = new Pbf();
      for (const v of valores) p.varint(v);
      this.bytes(campo, p.b);
    }
  }
  const zigzag = (n) => (n << 1) ^ (n >> 31);
  function estadoPunto(l) {
    if (estado.favoritos[l.id] || estado.visitados[l.id]) return 3;
    if (l.propio) return 2;
    return posibleCierre(l) ? 1 : 0;
  }
  function actualizarTeselas() {
    visibles = resultados.filter((r) => !r.l.otro && r.l.m === (municipio && municipio.c)).map((r) => r.l);
    cubos = new Map();
    const n = 2 ** NIVEL_INDICE;
    visibles.forEach((l, i) => {
      const k = Math.floor(l._x * n) * n + Math.floor(l._y * n);
      const cubo = cubos.get(k);
      if (cubo) cubo.push(i); else cubos.set(k, [i]);
    });
    versionTeselas += 1;
    refrescarTeselas();
    dibujarEspeciales();
  }
  // Varios cambios seguidos (calificar, filtrar, buscar) recargan las teselas una sola vez por cuadro.
  let refrescoPendiente = false;
  function refrescarTeselas() {
    if (refrescoPendiente) return;
    refrescoPendiente = true;
    requestAnimationFrame(() => {
      refrescoPendiente = false;
      if (mapa && capasListas && mapa.getSource('lugares')) mapa.getSource('lugares').setTiles([urlTeselas()]);
    });
  }
  // Al recargar teselas, MapLibre cancela las pendientes y deja esa cancelación sin atender: no es un error.
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason && (e.reason.name === 'AbortError' || e.reason.message === 'AbortError')) e.preventDefault();
  });
  const urlTeselas = () => `mappi://lugares/{z}/{x}/{y}?v=${versionTeselas}`;
  function candidatos(z, x, y) {
    const n = 2 ** NIVEL_INDICE;
    if (z >= NIVEL_INDICE) {
      const corrimiento = z - NIVEL_INDICE;
      return cubos.get((x >> corrimiento) * n + (y >> corrimiento)) || [];
    }
    const escala = 2 ** (NIVEL_INDICE - z);
    const x0 = x * escala;
    const y0 = y * escala;
    const lista = [];
    for (const [k, cubo] of cubos) {
      const cx = Math.floor(k / n);
      const cy = k % n;
      if (cx >= x0 && cx < x0 + escala && cy >= y0 && cy < y0 + escala) for (const i of cubo) lista.push(i);
    }
    return lista;
  }
  function tesela(z, x, y) {
    const capa = new Pbf();
    capa.entero(15, 2);
    capa.texto(1, 'lugares');
    const valores = [];
    const posiciones = new Map();
    const valor = (tipo, v) => {
      const k = tipo + v;
      let i = posiciones.get(k);
      if (i === undefined) {
        i = valores.length;
        posiciones.set(k, i);
        valores.push([tipo, v]);
      }
      return i;
    };
    const n = 2 ** z;
    const conNombre = z >= 15;
    // Lejos, un punto por cada 4 píxeles basta y la tesela pesa poco.
    const ocupado = z < 14 ? new Set() : null;
    const celdaBits = 5;  // 32 unidades: 4 píxeles en teselas de 512
    for (const i of candidatos(z, x, y)) {
      const l = visibles[i];
      const px = Math.round((l._x * n - x) * EXTENSION);
      const py = Math.round((l._y * n - y) * EXTENSION);
      if (px < 0 || px >= EXTENSION || py < 0 || py >= EXTENSION) continue;
      if (ocupado) {
        const celda = (px >> celdaBits) * 128 + (py >> celdaBits);
        if (ocupado.has(celda)) continue;
        ocupado.add(celda);
      }
      const f = new Pbf();
      f.entero(1, i + 1);
      const etiquetas = [0, valor('u', (categorias.get(l.cat) || { i: 0 }).i), 1, valor('u', estadoPunto(l))];
      if (conNombre) etiquetas.push(2, valor('s', l.nombre));
      f.empacados(2, etiquetas);
      f.entero(3, 1);
      f.empacados(4, [9, zigzag(px), zigzag(py)]);
      capa.bytes(2, f.b);
    }
    for (const k of ['c', 'e', 'n']) capa.texto(3, k);
    for (const [tipo, v] of valores) {
      const val = new Pbf();
      if (tipo === 's') val.texto(1, v); else val.entero(5, v);
      capa.bytes(4, val.b);
    }
    capa.entero(5, EXTENSION);
    const t = new Pbf();
    t.bytes(3, capa.b);
    return new Uint8Array(t.b).buffer;
  }
  if (window.maplibregl) {
    maplibregl.addProtocol('mappi', async (params) => {
      const m = params.url.match(/(\d+)\/(\d+)\/(\d+)/);
      return { data: m ? tesela(+m[1], +m[2], +m[3]) : new ArrayBuffer(0) };
    });
  }

  // ---------- mapa ----------
  // OpenFreeMap: mapa vectorial gratuito, sin clave ni límites de uso.
  const ESTILO = {
    claro: 'https://tiles.openfreemap.org/styles/positron',
    oscuro: 'https://tiles.openfreemap.org/styles/dark',
  };
  const SVG_FAV = '<svg viewBox="0 0 28 28"><circle class="fondo" cx="14" cy="14" r="12"/><path class="simbolo" d="M14 19.5s-5-3-6-6.1c-.7-2.1.7-4.1 2.8-4.1 1.3 0 2.4.7 3.2 1.9.8-1.2 1.9-1.9 3.2-1.9 2.1 0 3.5 2 2.8 4.1-1 3.1-6 6.1-6 6.1z"/></svg>';
  const SVG_FUI = '<svg viewBox="0 0 24 24"><circle class="fondo" cx="12" cy="12" r="10.5"/><path class="simbolo" d="M7.5 12.3l3 3 6-6.6"/></svg>';
  let mapa = null;
  let capasListas = false;
  let zona = null;
  let marcasEspeciales = [];
  let marcaSeleccion = null;
  let marcaYo = null;

  function estiloSinConexion() {
    return { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': color('--fondo') } }] };
  }
  async function estiloMapa() {
    try {
      const respuesta = await fetch(oscuro.matches ? ESTILO.oscuro : ESTILO.claro);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const estilo = await respuesta.json();
      // Calles y barrios con su nombre en español cuando OpenStreetMap lo tiene.
      for (const capa of estilo.layers) {
        const texto = capa.layout && capa.layout['text-field'];
        if (texto && JSON.stringify(texto).includes('name')) {
          capa.layout['text-field'] = ['coalesce', ['get', 'name:es'], ['get', 'name'], ['get', 'name:latin']];
        }
      }
      return estilo;
    } catch (e) {
      return estiloSinConexion();
    }
  }
  async function iniciarMapa() {
    const estilo = await estiloMapa();
    const inicio = municipiosPorCodigo.get(estado.ajustes.municipio);
    try {
      mapa = new maplibregl.Map({
        container: 'mapa', style: estilo, center: inicio ? [inicio.lon, inicio.lat] : [-74.1, 4.6],
        zoom: inicio ? 13 : 5, minZoom: 4.5, maxZoom: 19, maxBounds: COLOMBIA, attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0,
      });
    } catch (e) {
      mapa = null;
      $('#mapa').innerHTML = '<p class="sin-mapa">Este teléfono no pudo dibujar el mapa. La búsqueda, la lista y las fichas siguen funcionando.</p>';
      return;
    }
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
    mapa.on('style.load', agregarCapas);
    mapa.on('click', alTocarMapa);
    // La ubicación o el municipio pudieron llegar antes que el mapa.
    if (ubicacion) dibujarUbicacion(false);
    if (municipio) encuadrarMunicipio();
  }
  function agregarCapas() {
    const borde = color('--superficie');
    const gris = color('--texto-2');
    const colores = ['match', ['get', 'c']];
    indice.categorias.forEach((c, i) => colores.push(i, oscuro.matches ? c.oscuro : c.color));
    colores.push(gris);
    mapa.addSource('lugares', { type: 'vector', tiles: [urlTeselas()], minzoom: 0, maxzoom: 16 });
    mapa.addLayer({
      id: 'lugares', type: 'circle', source: 'lugares', 'source-layer': 'lugares', filter: ['!=', ['get', 'e'], 3],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 1.5, 12, 2.5, 14, 5, 17, 9],
        'circle-color': ['case', ['==', ['get', 'e'], 1], gris, ['==', ['get', 'e'], 2], color('--g-propio'), colores],
        'circle-opacity': ['case', ['==', ['get', 'e'], 1], 0.55, 0.95],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 14, 1.6],
        'circle-stroke-color': borde,
      },
    });
    if (mapa.getStyle().glyphs) {
      mapa.addLayer({
        id: 'nombres', type: 'symbol', source: 'lugares', 'source-layer': 'lugares', minzoom: 15.5,
        layout: {
          'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true,
        },
        paint: { 'text-color': color('--texto'), 'text-halo-color': borde, 'text-halo-width': 1.5 },
      });
    }
    capasListas = true;
    dibujarEspeciales();
  }
  oscuro.addEventListener('change', async () => {
    if (!mapa) return;
    const estilo = await estiloMapa();
    capasListas = false;
    mapa.setStyle(estilo, { diff: false });
  });

  // Favoritos y visitados van como marcas propias encima de los puntos.
  function dibujarEspeciales() {
    if (!mapa) return;
    for (const marca of marcasEspeciales) marca.remove();
    marcasEspeciales = visibles.filter((l) => estado.favoritos[l.id] || estado.visitados[l.id]).slice(0, 300).map((l) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = estado.favoritos[l.id] ? 'marca-fav' : 'marca-fui';
      el.setAttribute('aria-label', l.nombre);
      el.innerHTML = estado.favoritos[l.id] ? SVG_FAV : SVG_FUI;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirFicha(l.id);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(mapa);
    });
  }
  function alTocarMapa(e) {
    const objetivo = e.originalEvent && e.originalEvent.target;
    if (objetivo && objetivo.closest && objetivo.closest('.maplibregl-marker')) return;
    if (capasListas && vistaActual().tipo !== 'ubicar') {
      // Margen de 14 px alrededor del dedo para no tener que acertar al punto exacto.
      const p = e.point;
      const tocados = mapa.queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: ['lugares'] })
        .map((f) => visibles[f.id - 1]).filter(Boolean);
      if (tocados.length) {
        const cerca = (l) => {
          const q = mapa.project([l.lon, l.lat]);
          return Math.hypot(q.x - p.x, q.y - p.y);
        };
        tocados.sort((a, b) => cerca(a) - cerca(b));
        abrirFicha(tocados[0].id);
        return;
      }
    }
    const tipo = vistaActual().tipo;
    if (tipo === 'ficha' || tipo === 'lista') atras();
  }
  function marcarSeleccion(l) {
    if (marcaSeleccion) {
      marcaSeleccion.remove();
      marcaSeleccion = null;
    }
    if (!l || !mapa || l.otro) return;
    const el = document.createElement('div');
    el.className = 'marca-sel';
    el.innerHTML = '<span></span>';
    marcaSeleccion = new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(mapa);
  }
  function altoHoja() {
    return hoja.getBoundingClientRect().height;
  }
  function altoBarra() {
    return $('.barra').getBoundingClientRect().bottom;
  }
  // Desplazamiento para que un punto quede en el espacio libre entre la barra superior y la hoja.
  const desplazamiento = () => [0, (altoBarra() - altoHoja()) / 2];
  const margenes = () => ({ top: altoBarra() + 16, bottom: altoHoja() + 16, left: 28, right: 28 });
  function centrarEn(l, zoomMinimo = 16) {
    if (!mapa) return;
    mapa.easeTo({ center: [l.lon, l.lat], zoom: Math.max(mapa.getZoom(), zoomMinimo), offset: desplazamiento(), duration: 450 });
  }
  // El casco urbano: entre los percentiles 10 y 90 de los lugares, para que lo rural no aleje el mapa.
  function zonaCentral(lista) {
    if (!lista.length) return null;
    const lats = lista.map((l) => l.lat).sort((a, b) => a - b);
    const lons = lista.map((l) => l.lon).sort((a, b) => a - b);
    const p = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    return [[p(lons, 0.1), p(lats, 0.1)], [p(lons, 0.9), p(lats, 0.9)]];
  }
  function encuadrarMunicipio() {
    if (!mapa || !municipio) return;
    if (ubicacion && municipioEn(ubicacion.lat, ubicacion.lon) === municipio) {
      mapa.jumpTo({ center: [ubicacion.lon, ubicacion.lat], zoom: 15 });
      return;
    }
    if (zona) requestAnimationFrame(() => mapa.fitBounds(zona, { padding: margenes(), maxZoom: 15, duration: 0 }));
    else mapa.jumpTo({ center: [municipio.lon, municipio.lat], zoom: 13 });
  }
  // Encuadra los resultados cercanos (5 km) para que un lugar rural no aleje el mapa de la ciudad.
  function encuadrarResultados() {
    if (!mapa || !visibles.length || visibles.length === lugares.length) return;
    const centro = zona ? { lat: (zona[0][1] + zona[1][1]) / 2, lon: (zona[0][0] + zona[1][0]) / 2 } : { lat: municipio.lat, lon: municipio.lon };
    const referencia = ubicacion && distancia(ubicacion, centro) < 15000 ? ubicacion : centro;
    const cercanos = visibles.filter((l) => distancia(referencia, l) <= 5000);
    const limitesMapa = new maplibregl.LngLatBounds();
    for (const l of cercanos.length ? cercanos : visibles) limitesMapa.extend([l.lon, l.lat]);
    requestAnimationFrame(() => mapa.fitBounds(limitesMapa, { padding: margenes(), maxZoom: 16, duration: 500 }));
  }
  function centroMapa() {
    if (!mapa) return municipio ? { lat: municipio.lat, lon: municipio.lon } : { lat: 4.6, lon: -74.1 };
    const c = mapa.getCenter();
    return { lat: c.lat, lon: c.lng };
  }

  // ---------- ubicación ----------
  function dibujarUbicacion(centrar) {
    if (!mapa || !ubicacion) return;
    if (!marcaYo) {
      const el = document.createElement('div');
      el.className = 'yo-punto';
      el.innerHTML = '<span></span>';
      marcaYo = new maplibregl.Marker({ element: el }).setLngLat([ubicacion.lon, ubicacion.lat]).addTo(mapa);
    } else {
      marcaYo.setLngLat([ubicacion.lon, ubicacion.lat]);
    }
    if (centrar) {
      mapa.easeTo({ center: [ubicacion.lon, ubicacion.lat], zoom: Math.max(mapa.getZoom(), 16), offset: desplazamiento(), duration: 600 });
    }
  }
  // Con la ubicación se abre el municipio donde está el teléfono, salvo que la persona haya elegido otro a mano.
  function ubicarme(manual) {
    if (!navigator.geolocation) {
      if (manual) aviso('Este teléfono no permite obtener la ubicación.');
      sinUbicacion();
      return;
    }
    buscandoUbicacion = true;
    render();
    navigator.geolocation.getCurrentPosition(async (pos) => {
      buscandoUbicacion = false;
      ubicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy };
      $('#ubicarme').classList.add('activo');
      const aqui = municipioEn(ubicacion.lat, ubicacion.lon);
      if (aqui && (!municipio || aqui.c !== municipio.c) && (manual || !estado.ajustes.fijo || !municipio)) {
        estado.ajustes.fijo = false;
        const ok = await abrirMunicipio(aqui.c, { encuadrar: false });
        if (ok) aviso(`Estás en ${aqui.n}: ${plural(lugares.length, 'lugar', 'lugares')}.`);
      }
      dibujarUbicacion(manual || !!aqui);
      aplicar();
      if (!aqui && !municipio) sinUbicacion();
    }, () => {
      buscandoUbicacion = false;
      $('#ubicarme').classList.remove('activo');
      if (manual) aviso('No pude obtener tu ubicación. Activa el GPS y dale permiso de ubicación a Mappi.');
      sinUbicacion();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function sinUbicacion() {
    buscandoUbicacion = false;
    if (!municipio && !cargando && !pila.length) mostrar({ tipo: 'municipios' });
    else render();
  }

  // ---------- hoja inferior ----------
  function mostrar(vista, reemplazar = false) {
    if (reemplazar) pila.pop();
    pila.push(vista);
    render();
  }
  function atras() {
    // Con una actualización obligatoria, atrás deja que Android cierre la app.
    if (!pila.length || (nuevaVersion && nuevaVersion.obligatoria)) return false;
    pila.pop();
    render();
    return true;
  }
  function vistaActual() {
    return pila.length ? pila[pila.length - 1] : { tipo: 'resumen' };
  }

  function render() {
    if (nuevaVersion && nuevaVersion.obligatoria && vistaActual().tipo !== 'version') pila = [{ tipo: 'version' }];
    const v = vistaActual();
    document.body.classList.toggle('obligatoria', v.tipo === 'version' && !!nuevaVersion && nuevaVersion.obligatoria);
    hoja.dataset.vista = ['resumen', 'lista', 'ficha'].includes(v.tipo) ? v.tipo : 'panel';
    document.body.classList.toggle('modo-ubicar', v.tipo === 'ubicar');
    $('#mira').hidden = v.tipo !== 'ubicar';
    const lugar = v.id ? lugarGuardado(v.id) : null;
    marcarSeleccion(v.tipo === 'ficha' || v.tipo === 'visita' ? lugar : null);
    const dibujar = {
      resumen: htmlResumen, lista: htmlResumen, ficha: () => htmlFicha(lugar), visita: () => htmlVisita(lugar),
      filtros: htmlFiltros, menu: htmlMenu, compartido: () => htmlCompartido(v), ubicar: htmlUbicar,
      nuevo: () => htmlNuevo(v), restaurar: () => htmlRestaurar(v), ocultos: htmlOcultos, version: htmlVersion,
      municipios: htmlMunicipios,
    }[v.tipo];
    if (((v.tipo === 'ficha' || v.tipo === 'visita') && !lugar) || (v.tipo === 'version' && !nuevaVersion)) {
      pila.pop();
      render();
      return;
    }
    contenido.innerHTML = dibujar();
    contenido.scrollTop = 0;
    if (v.tipo === 'compartido') llenarCompartido(v);
    if (v.tipo === 'municipios') llenarMunicipios(v);
  }

  function htmlSegmentos() {
    return `<div class="segmentos" role="group" aria-label="Qué lugares mostrar">${VISTAS.map(([clave, nombre]) => {
      const n = conteos[clave] || 0;
      return `<button type="button" class="segmento" data-accion="vista" data-vista="${clave}" aria-pressed="${clave === estado.ajustes.vista}">${nombre}<span class="cuenta">${n.toLocaleString('es-CO')}</span></button>`;
    }).join('')}</div>`;
  }
  function filtrosActivos() {
    let n = estado.ajustes.ocultas.length;
    if (!estado.ajustes.ocultarCerrados) n += 1;
    return n;
  }
  function htmlMunicipioActual() {
    if (cargando) {
      return `<div class="municipio-actual cargando"><span class="girando"></span><span><strong>Cargando ${esc(cargando.n)}…</strong><small>${cargando.kb ? `${cargando.kb.toLocaleString('es-CO')} KB la primera vez; después funciona sin internet.` : ''}</small></span></div>`;
    }
    if (!municipio) return '';
    return `<button type="button" class="municipio-actual" data-accion="municipios">${icono('pin')}<span><strong>${esc(municipio.n)}</strong><small>${esc(municipio.d)} · Cambiar de municipio</small></span></button>`;
  }
  function htmlResumen() {
    const v = vistaActual();
    if (!municipio) {
      if (errorCarga) return `${htmlMunicipioActual()}<div class="vacio"><strong>Sin conexión</strong>${esc(errorCarga)}</div><div class="fila-botones acciones"><button type="button" class="boton primario ancho" data-accion="municipios">Elegir municipio</button></div>`;
      if (cargando) return htmlMunicipioActual();
      return `<div class="vacio"><strong>${buscandoUbicacion ? 'Buscando tu ubicación…' : '¿En qué municipio estás?'}</strong>Mappi muestra los negocios del municipio donde estás.</div>
        <div class="fila-botones acciones"><button type="button" class="boton primario ancho" data-accion="municipios">Elegir municipio</button><button type="button" class="boton ancho" data-accion="ubicarme">${icono('ubicar')}Usar mi ubicación</button></div>`;
    }
    const q = entrada.value.trim();
    const n = resultados.length;
    let detalle;
    if (v.tipo === 'lista') {
      if (estado.ajustes.vista === 'calificados') detalle = estado.ajustes.orden === 'peores' ? 'Los peores primero' : 'Los mejores primero';
      else detalle = ubicacion ? 'Ordenados por cercanía' : 'Ordenados por nombre. Activa tu ubicación para verlos por cercanía.';
    } else detalle = 'Toca para ver la lista';
    const cat = estado.ajustes.categoria ? categorias.get(estado.ajustes.categoria) : null;
    const cuantos = filtrosActivos();
    let html = `${htmlMunicipioActual()}${errorCarga ? `<p class="nota alerta">${esc(errorCarga)}</p>` : ''}${htmlSegmentos()}
      <div class="resumen">
        <button type="button" class="resumen-texto" data-accion="${v.tipo === 'lista' ? 'cerrar-lista' : 'abrir-lista'}">
          <strong>${plural(n, 'lugar', 'lugares')}</strong>${cat ? ` · ${esc(cat.n.toLowerCase())}` : ''}${q ? ` con «${esc(q)}»` : ''}
          <small>${esc(detalle)}</small>
        </button>
        <button type="button" class="boton-filtros" data-accion="filtros">${icono('filtro')}Filtros${cuantos ? ` (${cuantos})` : ''}</button>
      </div>`;
    if (v.tipo === 'lista') {
      if (estado.ajustes.vista === 'calificados' && n) {
        html += `<div class="fila-botones orden"><button type="button" class="opcion" data-accion="orden" data-orden="mejores" aria-pressed="${estado.ajustes.orden !== 'peores'}">Mejores primero</button><button type="button" class="opcion" data-accion="orden" data-orden="peores" aria-pressed="${estado.ajustes.orden === 'peores'}">Peores primero</button></div>`;
      }
      html += htmlLista();
    }
    return html;
  }
  function htmlVacio() {
    const q = entrada.value.trim();
    const vista = estado.ajustes.vista;
    if (vista === 'favoritos' && !Object.keys(estado.favoritos).length) {
      return '<div class="vacio"><strong>Todavía no tienes favoritos</strong>Abre un lugar y toca «Favorito».</div>';
    }
    if (vista === 'calificados' && !Object.keys(estado.calificaciones).length) {
      return '<div class="vacio"><strong>Todavía no has calificado lugares</strong>Abre un lugar y dale de 1 a 5 estrellas. Solo tú las ves.</div>';
    }
    if (vista === 'visitados' && !Object.keys(estado.visitados).length) {
      return '<div class="vacio"><strong>Todavía no has marcado visitas</strong>Abre un lugar y toca «Ya fui».</div>';
    }
    return `<div class="vacio"><strong>No encontré lugares${q ? ` con «${esc(q)}»` : ''}</strong>Prueba con otra palabra, cambia a «Todos» o revisa los filtros.</div>`;
  }
  function estrellasTexto(n) {
    const estrella = (llena) => `<svg class="icono${llena ? ' llena' : ''}"><use href="#i-estrella"/></svg>`;
    return `<span class="estrellas-mini" role="img" aria-label="${n} de 5 estrellas">${[1, 2, 3, 4, 5].map((i) => estrella(i <= n)).join('')}</span>`;
  }
  function htmlItem({ l, d }, platosQ) {
    const todos = platosDe(l);
    const probables = platosQ.filter((p) => !todos.includes(p) && (l.probables || []).includes(p));
    let platos = COMIDA.has(l.cat) ? esc(todos.slice(0, 4).map(capital).join(', ')) : '';
    if (probables.length) platos += `${platos ? ' · ' : ''}<em>suele tener ${esc(probables.join(', '))}</em>`;
    const cierre = posibleCierre(l);
    const otro = l.otro && l.m !== (municipio && municipio.c) ? municipiosPorCodigo.get(l.m) : null;
    const meta = [l.propio ? 'Agregado por ti' : nombreCategoria(l.cat), otro ? `en ${otro.n}` : '', d !== null && d !== undefined ? distanciaTexto(d) : ''].filter(Boolean).join(' · ');
    const calif = estado.calificaciones[l.id];
    return `<li><button type="button" class="item" data-id="${esc(l.id)}">
      <span class="punto" style="--c: ${cierre ? 'var(--texto-2)' : colorCategoria(l.cat)}"></span>
      <span class="item-texto">
        <span class="item-nombre"><span>${esc(l.nombre)}</span>${estado.favoritos[l.id] ? icono('corazon', 'fav') : ''}${estado.visitados[l.id] ? icono('check', 'fui') : ''}</span>
        <span class="item-meta">${esc(meta)}</span>
        ${calif ? `<span class="item-calificacion">${estrellasTexto(calif.estrellas)}${calif.nota ? ` <span class="item-nota">${esc(calif.nota)}</span>` : ''}</span>` : ''}
        ${platos ? `<span class="item-platos">${platos}</span>` : ''}
        ${cierre ? '<span><span class="etiqueta alerta">Puede haber cerrado</span></span>' : ''}
      </span>
    </button></li>`;
  }
  function htmlLista() {
    if (!resultados.length) return htmlVacio();
    ordenar();
    const platosQ = platosDeConsulta(consultaActual());
    const visiblesLista = resultados.slice(0, pagina);
    let html = `<ul class="lista">${visiblesLista.map((r) => htmlItem(r, platosQ)).join('')}</ul>`;
    if (resultados.length > pagina) {
      html += `<button type="button" class="boton suave mas-resultados" data-accion="mas">Ver ${Math.min(POR_PAGINA, resultados.length - pagina)} más de ${(resultados.length - pagina).toLocaleString('es-CO')}</button>`;
    }
    return html;
  }

  function htmlEstadoRegistro(l) {
    if (l.propio) return '<div class="estado-registro neutra">Lo agregaste tú. Solo está en este teléfono.</div>';
    if (estado.cerrados[l.id]) {
      return `<div class="estado-registro alerta">Marcaste que cerró el ${fecha(estado.cerrados[l.id])}. No aparece en el mapa.
        <div class="fila-botones"><button type="button" class="boton pequeno" data-accion="reabrir">Sigue abierto</button></div></div>`;
    }
    const abierto = estado.abiertos[l.id];
    const nombreRegistro = l.regNombre ? `<small>En el registro: ${esc(l.regNombre)}</small>` : '';
    const ica = l.fuentes & 4 ? '<small>Figura como establecimiento activo en Industria y Comercio de Medellín.</small>' : '';
    if (l.reg === 3) {
      if (abierto) return `<div class="estado-registro ok">Confirmaste que sigue abierto el ${fecha(abierto)}.<small>Su matrícula mercantil figura cancelada desde ${l.regAnio}.</small></div>`;
      if (ica) return `<div class="estado-registro aviso">Su matrícula mercantil figura cancelada desde ${l.regAnio}.${ica}${nombreRegistro}</div>`;
      return `<div class="estado-registro alerta"><strong>Puede haber cerrado.</strong> Su matrícula mercantil fue cancelada en ${l.regAnio}.${nombreRegistro}
        <div class="fila-botones"><button type="button" class="boton pequeno" data-accion="confirmar-abierto">Sigue abierto</button><button type="button" class="boton pequeno" data-accion="cerrado">Ya cerró</button></div></div>`;
    }
    if (abierto) return `<div class="estado-registro ok">Confirmaste que sigue abierto el ${fecha(abierto)}.</div>`;
    if (l.reg === 1) return `<div class="estado-registro ok">Matrícula mercantil renovada en ${l.regAnio}.${nombreRegistro}${ica}</div>`;
    if (l.reg === 2) {
      const anios = new Date().getFullYear() - l.regAnio;
      return `<div class="estado-registro ${anios >= 3 ? 'alerta' : 'aviso'}">${anios >= 3 ? `<strong>Puede haber cerrado.</strong> Su matrícula no se renueva desde ${l.regAnio}.` : `Matrícula activa, renovada por última vez en ${l.regAnio}.`}${nombreRegistro}${ica}</div>`;
    }
    if (ica) return `<div class="estado-registro ok">Establecimiento activo en Industria y Comercio de Medellín.</div>`;
    return '<div class="estado-registro neutra">No aparece con este nombre en el registro mercantil. Muchos negocios están registrados con otro nombre.</div>';
  }
  function telefonoDigitos(t) {
    return String(t || '').replace(/[^\d+]/g, '');
  }
  function urlWhatsapp(l) {
    const directo = urlSegura(l.wa);
    if (directo) return directo;
    const d = String(l.tel || '').replace(/\D/g, '');
    if (/^573\d{9}$/.test(d)) return `https://wa.me/${d}`;
    if (/^3\d{9}$/.test(d)) return `https://wa.me/57${d}`;
    return '';
  }
  const urlGoogle = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`;
  const urlWaze = (l) => `https://waze.com/ul?ll=${l.lat},${l.lon}&navigate=yes`;
  function nombreRed(url) {
    const h = new URL(url).hostname.replace(/^www\.|^m\.|^vm\./, '');
    if (h.includes('tiktok')) return 'TikTok';
    if (h.includes('instagram')) return 'Instagram';
    if (h.includes('facebook') || h === 'fb.watch') return 'Facebook';
    if (h.includes('youtu')) return 'YouTube';
    return h;
  }
  function htmlCalificacion(l) {
    const c = estado.calificaciones[l.id];
    const n = c ? c.estrellas : 0;
    return `
      <h3>Tu calificación</h3>
      <div class="estrellas" role="group" aria-label="Calificación de 1 a 5 estrellas">
        ${[1, 2, 3, 4, 5].map((i) => `<button type="button" class="estrella" data-accion="estrellas" data-n="${i}" aria-pressed="${i <= n}" aria-label="${i} ${i === 1 ? 'estrella' : 'estrellas'}: ${NOMBRES_ESTRELLAS[i]}">${icono('estrella')}</button>`).join('')}
        <span class="estrellas-texto">${n ? NOMBRES_ESTRELLAS[n] : 'Sin calificar'}</span>
      </div>
      ${n ? `<form class="comentario" data-formulario="comentario">
        <textarea id="comentario" maxlength="280" rows="2" placeholder="Comentario corto: qué pediste, cómo te atendieron…">${esc(c.nota || '')}</textarea>
        <div class="fila-botones"><button type="submit" class="boton pequeno suave">Guardar comentario</button><button type="button" class="boton pequeno peligro" data-accion="quitar-calificacion">Quitar calificación</button></div>
      </form>
      <p class="nota">Calificado el ${fecha(c.fecha)}. Solo tú la ves.</p>` : '<p class="nota">Califica tus lugares para recordar los mejores y los peores. Solo tú lo ves.</p>'}`;
  }

  function htmlFicha(l) {
    if (l.otro) {
      const m = municipiosPorCodigo.get(l.m);
      return `<div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">${esc(nombreCategoria(l.cat))}</span></div>
        <h2>${esc(l.nombre)}</h2><p class="texto-panel">Está en ${esc(m ? m.n : 'otro municipio')}.</p>
        <div class="fila-botones acciones"><button type="button" class="boton primario ancho" data-accion="ir-guardado" data-id="${esc(l.id)}">Abrir ${esc(m ? m.n : 'el municipio')}</button></div>`;
    }
    const fav = !!estado.favoritos[l.id];
    const visita = estado.visitados[l.id];
    const comida = COMIDA.has(l.cat);
    const confirmados = l.platos || [];
    const mios = (estado.platos[l.id] || []).filter((p) => !confirmados.includes(p));
    const probables = (l.probables || []).filter((p) => !confirmados.includes(p) && !mios.includes(p));
    const d = ubicacion ? distancia(ubicacion, l) : null;
    const contactos = [];
    if (l.tel) contactos.push(`<a class="contacto" href="tel:${esc(telefonoDigitos(l.tel))}">${icono('tel')}<span>${esc(l.tel)}<small>Llamar</small></span></a>`);
    const wa = urlWhatsapp(l);
    if (wa) contactos.push(`<a class="contacto" href="${esc(wa)}" target="_blank" rel="noopener">${icono('chat')}<span>WhatsApp<small>${l.wa ? 'Enlace publicado por el negocio' : 'Si ese celular tiene WhatsApp'}</small></span></a>`);
    const fb = urlSegura(l.fb);
    if (fb) contactos.push(`<a class="contacto" href="${esc(fb)}" target="_blank" rel="noopener">${icono('enlace')}<span>Facebook<small>Fotos, productos y publicaciones recientes</small></span></a>`);
    const ig = urlSegura(l.ig);
    if (ig) contactos.push(`<a class="contacto" href="${esc(ig)}" target="_blank" rel="noopener">${icono('enlace')}<span>Instagram<small>${esc(ig.replace(/^https?:\/\/(www\.)?/, ''))}</small></span></a>`);
    const web = urlSegura(l.web);
    if (web) contactos.push(`<a class="contacto" href="${esc(web)}" target="_blank" rel="noopener">${icono('enlace')}<span>Sitio web<small>${esc(web.replace(/^https?:\/\/(www\.)?/, ''))}</small></span></a>`);
    if (l.dir) contactos.push(`<div class="contacto">${icono('pin')}<span>${esc(l.dir)}<small>Dirección en las fuentes</small></span><button type="button" class="boton-icono" data-accion="copiar" data-texto="${esc(l.dir)}" aria-label="Copiar dirección">${icono('copiar')}</button></div>`);
    const enlaces = (estado.enlaces[l.id] || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const fuentes = l.propio ? 'Tú' : FUENTES.filter(([bit]) => l.fuentes & bit).map(([, n]) => n).join(', ');

    return `
      <div class="cabecera-panel">
        <button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button>
        <span class="tipo"><span class="punto" style="--c: ${colorCategoria(l.cat)}"></span>${esc(nombreCategoria(l.cat))}</span>
        <span class="espacio"></span>
        ${d !== null ? `<span class="item-meta">a ${distanciaTexto(d)}</span>` : ''}
      </div>
      <h2>${esc(l.nombre)}</h2>
      ${htmlEstadoRegistro(l)}
      <div class="fila-botones acciones">
        <a class="boton primario ancho" href="${urlGoogle(l)}" target="_blank" rel="noopener">${icono('ruta')}Cómo llegar</a>
        <a class="boton ancho" href="${urlWaze(l)}" target="_blank" rel="noopener">Ir con Waze</a>
      </div>
      <div class="fila-botones acciones">
        <button type="button" class="boton ancho ${fav ? 'activo-fav' : ''}" data-accion="favorito" aria-pressed="${fav}">${icono('corazon')}${fav ? 'En favoritos' : 'Favorito'}</button>
        <button type="button" class="boton ancho ${visita ? 'activo-fui' : ''}" data-accion="visita" aria-pressed="${!!visita}">${icono('check')}Ya fui</button>
      </div>
      ${visita ? `<p class="nota">Fuiste el ${fecha(visita.fecha)}${visita.nota ? `: ${esc(visita.nota)}` : '.'}</p>` : ''}
      ${htmlCalificacion(l)}

      ${comida || mios.length ? `<h3>Platos</h3>
      ${confirmados.length || mios.length || probables.length ? `<div class="platos">
        ${confirmados.map((p) => `<span class="plato">${esc(capital(p))}</span>`).join('')}
        ${mios.map((p) => `<span class="plato mio">${esc(capital(p))}<button type="button" data-accion="quitar-plato" data-plato="${esc(p)}" aria-label="Quitar ${esc(p)}">×</button></span>`).join('')}
        ${probables.map((p) => `<span class="plato probable">${esc(capital(p))}?</span>`).join('')}
      </div>` : '<p class="nota">Todavía no sabemos qué platos tiene.</p>'}
      ${probables.length ? '<p class="nota">Con «?»: platos que suelen tener los locales de comidas rápidas, sin confirmar.</p>' : ''}
      <form class="fila-botones acciones" data-formulario="plato">
        <input class="campo-plato" id="nuevo-plato" list="lista-platos" placeholder="Agregar un plato que viste aquí" aria-label="Plato" autocomplete="off">
        <button type="submit" class="boton pequeno suave">Agregar</button>
      </form>` : ''}

      <h3>Contacto</h3>
      ${contactos.length ? `<div class="contactos">${contactos.join('')}</div>` : '<p class="nota">No hay datos de contacto en las fuentes.</p>'}

      <h3>Videos y enlaces</h3>
      ${enlaces.length ? `<ul class="enlaces">${enlaces.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${icono('video')}<span>${esc(nombreRed(e.url))} · ${esc(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</span><small>${fecha(e.fecha)}</small></a></li>`).join('')}</ul>
        <p class="nota">El video más reciente es del ${fecha(enlaces[0].fecha)}: una buena señal de que sigue activo.</p>`
        : '<p class="nota">Cuando veas un video de este lugar en TikTok o Instagram, tócalo en «Compartir» y elige Mappi. Quedará guardado aquí con la fecha.</p>'}

      <div class="pie-ficha">
        ${l.dudosa ? '<p><strong>Ubicación aproximada:</strong> varios negocios comparten este punto en Facebook. Confirma la dirección antes de ir.</p>' : ''}
        <p>Fuente: ${esc(fuentes)}${l.propio && l.creado ? `, ${fecha(l.creado)}` : ''}.</p>
        <div class="fila-botones">
          ${l.propio ? '<button type="button" class="boton pequeno peligro" data-accion="eliminar-propio">Eliminar este lugar</button>'
            : estado.cerrados[l.id] ? '' : '<button type="button" class="boton pequeno peligro" data-accion="cerrado">Ya cerró: ocultarlo</button>'}
        </div>
      </div>`;
  }

  function htmlVisita(l) {
    const v = estado.visitados[l.id];
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button></div>
      <h2>¿Cuándo fuiste a ${esc(l.nombre)}?</h2>
      <form data-formulario="visita">
        <div class="campo"><label for="visita-fecha">Fecha</label><input type="date" id="visita-fecha" value="${esc(v ? v.fecha : hoyISO())}" max="${hoyISO()}" required></div>
        <div class="campo"><label for="visita-nota">Nota (opcional)</label><textarea id="visita-nota" maxlength="500" placeholder="Qué compraste, qué tal estuvo, cuánto costó…">${esc(v ? v.nota : '')}</textarea></div>
        <div class="fila-botones acciones">
          <button type="submit" class="boton primario ancho">Guardar visita</button>
          ${v ? '<button type="button" class="boton peligro ancho" data-accion="quitar-visita">Quitar visita</button>' : ''}
        </div>
      </form>`;
  }

  function htmlFiltros() {
    const cuenta = new Map();
    for (const l of lugares) if (!l.propio && !estado.cerrados[l.id]) cuenta.set(l.cat, (cuenta.get(l.cat) || 0) + 1);
    const opciones = ordenCategorias.filter((c) => cuenta.get(c)).map((c) => {
      const activo = !estado.ajustes.ocultas.includes(c);
      return `<button type="button" class="opcion" data-accion="ocultar-categoria" data-categoria="${c}" aria-pressed="${activo}"><span class="punto" style="--c: ${colorCategoria(c)}; margin:0"></span>${esc(nombreCategoria(c))} <span class="cuenta">${cuenta.get(c).toLocaleString('es-CO')}</span></button>`;
    }).join('');
    const cancelados = lugares.filter((l) => posibleCierre(l) === 'registro').length;
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Filtros</span></div>
      <div class="campo"><span class="rotulo">Qué mostrar en ${esc(municipio ? municipio.n : 'el mapa')}</span><div class="opciones">${opciones || '<span class="nota">Todavía no hay lugares cargados.</span>'}</div></div>
      <div class="fila-botones"><button type="button" class="boton pequeno suave" data-accion="todas-categorias">Mostrar todo</button></div>
      <label class="interruptor"><input type="checkbox" id="filtro-cerrados" ${estado.ajustes.ocultarCerrados ? 'checked' : ''}>
        <span>Ocultar posibles cerrados<small>${plural(cancelados, 'lugar tiene', 'lugares tienen')} la matrícula mercantil cancelada. Si los muestras, salen en gris y puedes confirmar si siguen abiertos.</small></span></label>
      <div class="fila-botones acciones"><button type="button" class="boton primario ancho" data-accion="atras">Ver ${plural(resultados.length, 'lugar', 'lugares')}</button></div>`;
  }

  function htmlMenu() {
    const ocultos = Object.keys(estado.cerrados).length;
    const total = indice.municipios.reduce((s, m) => s + m.total, 0);
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Mappi${app.nombre ? ` ${esc(app.nombre)}` : ''}</span></div>
      ${nuevaVersion ? `<div class="novedad">
        <span><strong>Mappi ${esc(nuevaVersion.version)} está disponible</strong><small>Tienes la versión ${esc(app.nombre)}.</small></span>
        <button type="button" class="boton primario pequeno" data-accion="ver-version">Ver</button></div>` : ''}
      <h3>Datos</h3>
      <p class="texto-panel"><strong>${plural(total, 'lugar', 'lugares')}</strong> en ${plural(indice.municipios.filter((m) => m.total).length, 'municipio', 'municipios')} de Colombia, actualizados el ${fecha(indice.version)}.
        ${municipio ? `Tienes abierto ${esc(municipio.n)} (${plural(lugares.length, 'lugar', 'lugares')}).` : ''}
        ${descargados.size ? `${plural(descargados.size, 'municipio descargado', 'municipios descargados')} para usar sin internet.` : ''}
        Cada mes se revisan otra vez todas las fuentes.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton suave ancho" data-accion="actualizar">Buscar actualizaciones</button>
        <button type="button" class="boton suave ancho" data-accion="municipios">Cambiar de municipio</button>
      </div>

      <h3>Lugares que marcaste como cerrados</h3>
      <p class="texto-panel">${ocultos ? plural(ocultos, 'lugar oculto', 'lugares ocultos') : 'Ninguno.'}</p>
      ${ocultos ? '<div class="fila-botones acciones"><button type="button" class="boton suave ancho" data-accion="ver-ocultos">Ver y restaurar</button></div>' : ''}

      <h3>Respaldo</h3>
      <p class="texto-panel">Tus favoritos, calificaciones, visitas, platos, videos y lugares agregados solo se guardan en este teléfono.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton suave ancho" data-accion="exportar">Guardar respaldo</button>
        <button type="button" class="boton suave ancho" data-accion="importar">Restaurar respaldo</button>
      </div>

      <h3>Fuentes</h3>
      <p class="texto-panel">${(indice.fuentes || []).map(esc).join('<br>')}<br>Mapa: OpenFreeMap, © OpenMapTiles, © OpenStreetMap.</p>
      <h3>Licencia</h3>
      <p class="texto-panel">Mappi es un proyecto de Daniel Lezcano (Yextep). Uso no comercial: si reutilizas el código, da el crédito. Los datos conservan la licencia de cada fuente.</p>`;
  }

  function htmlVersion() {
    const n = nuevaVersion;
    return `
      <div class="cabecera-panel">${n.obligatoria ? '' : `<button type="button" class="boton-icono" data-accion="atras" aria-label="Cerrar">${icono('x')}</button>`}<span class="tipo">Actualización</span></div>
      <h2>Mappi ${esc(n.version)} está disponible</h2>
      <p class="texto-panel">${n.obligatoria
        ? `La versión ${esc(app.nombre)} ya no funciona. Actualiza para seguir usando Mappi.`
        : `Tienes la versión ${esc(app.nombre)}.`}</p>
      ${n.notas ? `<p class="notas-version">${esc(n.notas)}</p>` : ''}
      <p class="texto-panel">Se descarga de GitHub. Abre el archivo y toca «Actualizar»: se instala encima y conservas tus favoritos, visitas y lugares.</p>
      <div class="fila-botones acciones">
        <a class="boton primario ancho" href="${esc(n.apk)}" target="_blank" rel="noopener">${icono('descargar')}Descargar</a>
        ${n.obligatoria ? '' : '<button type="button" class="boton ancho" data-accion="posponer-version">Más tarde</button>'}
      </div>`;
  }

  function htmlMunicipios() {
    return `
      <div class="cabecera-panel">${municipio || pila.length > 1 ? `<button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button>` : ''}<span class="tipo">Municipio</span></div>
      <h2>¿Qué municipio quieres ver?</h2>
      <p class="texto-panel">${plural(indice.municipios.length, 'municipio', 'municipios')} de Colombia. Se descarga solo el que elijas.</p>
      <div class="campo"><input id="municipio-q" type="search" placeholder="Busca por municipio o departamento" autocomplete="off" aria-label="Buscar municipio"></div>
      ${ubicacion ? '' : `<div class="fila-botones acciones"><button type="button" class="boton ancho" data-accion="ubicarme">${icono('ubicar')}Usar mi ubicación</button></div>`}
      <ul class="lista" id="municipio-lista"></ul>`;
  }
  function llenarMunicipios(v) {
    const caja = $('#municipio-q');
    caja.value = v.q || '';
    const pintar = () => {
      v.q = caja.value;
      const q = plano(caja.value);
      let lista = indice.municipios.filter((m) => m.total && (!q || plano(`${m.n} ${m.d}`).includes(q)));
      if (ubicacion && !q) {
        lista = lista.map((m) => ({ m, d: distancia(ubicacion, m) })).sort((a, b) => a.d - b.d).map((x) => x.m);
      } else {
        lista.sort((a, b) => (q ? (plano(b.n).startsWith(q) - plano(a.n).startsWith(q)) : 0) || b.total - a.total);
      }
      $('#municipio-lista').innerHTML = lista.slice(0, 40).map((m) => `<li><button type="button" class="item" data-accion="elegir-municipio" data-codigo="${m.c}">
          <span class="punto" style="--c: var(${municipio && municipio.c === m.c ? '--brasa' : '--rio'})"></span>
          <span class="item-texto"><span class="item-nombre"><span>${esc(m.n)}</span></span>
          <span class="item-meta">${esc(m.d)} · ${plural(m.total, 'lugar', 'lugares')}${descargados.has(m.c) ? ' · descargado' : ` · ${m.kb.toLocaleString('es-CO')} KB`}</span></span></button></li>`).join('')
        || `<li class="vacio"><strong>No encontré «${esc(caja.value)}»</strong></li>`;
    };
    caja.addEventListener('input', pintar);
    pintar();
  }

  function htmlOcultos() {
    const lista = Object.entries(estado.cerrados).map(([id, f]) => ({ l: lugarGuardado(id), f, id })).filter((x) => x.l);
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Ocultos</span></div>
      ${lista.length ? `<ul class="lista">${lista.map(({ l, f }) => `<li><div class="item"><span class="punto" style="--c: var(--texto-2)"></span>
        <span class="item-texto"><span class="item-nombre"><span>${esc(l.nombre)}</span></span><span class="item-meta">Marcado como cerrado el ${fecha(f)}</span></span>
        <button type="button" class="boton pequeno" data-accion="restaurar-oculto" data-id="${esc(l.id)}">Mostrar</button></div></li>`).join('')}</ul>`
        : '<div class="vacio"><strong>No hay lugares ocultos</strong></div>'}`;
  }

  function primerEnlace(texto) {
    const m = String(texto || '').match(/https?:\/\/[^\s<>"']+/i);
    return m ? urlSegura(m[0].replace(/[),.;!?]+$/, '')) : '';
  }
  function htmlCompartido(v) {
    if (!v.url) {
      return `<div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button></div>
        <h2>No encontré un enlace</h2><p class="texto-panel">Comparte el video desde el botón «Compartir» de TikTok o Instagram para que llegue con su enlace.</p>`;
    }
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Cancelar">${icono('x')}</button><span class="tipo">Video de ${esc(nombreRed(v.url))}</span></div>
      <h2>¿De qué lugar es?</h2>
      <p class="texto-panel">Lo guardo en su ficha con la fecha de hoy. Así sabrás que el lugar sigue activo.${municipio ? ` Busco en ${esc(municipio.n)}.` : ''}</p>
      <div class="url-compartida">${esc(v.url)}</div>
      <div class="campo"><label for="compartido-q">Buscar el lugar</label><input id="compartido-q" type="search" placeholder="Escribe el nombre que sale en el video" autocomplete="off" value="${esc(v.q || '')}"></div>
      <ul class="lista" id="compartido-lista"></ul>
      <div class="fila-botones acciones"><button type="button" class="boton ancho" data-accion="nuevo-desde-video">${icono('mas')}No está en el mapa: agregarlo</button></div>`;
  }
  function llenarCompartido(v) {
    const caja = $('#compartido-q');
    const pintar = () => {
      v.q = caja.value;
      const q = plano(caja.value);
      const base = ubicacion || centroMapa();
      const candidatosLista = [];
      for (const l of lugares) if (!q || nombrePlano(l).includes(q)) candidatosLista.push({ l, d: distancia(base, l) });
      candidatosLista.sort((a, b) => (q ? (nombrePlano(b.l).startsWith(q) - nombrePlano(a.l).startsWith(q)) : 0) || a.d - b.d);
      $('#compartido-lista').innerHTML = candidatosLista.length
        ? candidatosLista.slice(0, 25).map(({ l, d }) => `<li><button type="button" class="item" data-accion="guardar-video" data-id="${esc(l.id)}">
            <span class="punto" style="--c: ${colorCategoria(l.cat)}"></span>
            <span class="item-texto"><span class="item-nombre"><span>${esc(l.nombre)}</span></span><span class="item-meta">${esc(nombreCategoria(l.cat))} · ${distanciaTexto(d)}</span></span></button></li>`).join('')
        : `<li class="vacio"><strong>No está «${esc(caja.value)}»</strong>Agrégalo con el botón de abajo.</li>`;
    };
    caja.addEventListener('input', pintar);
    pintar();
  }

  function htmlUbicar() {
    return `<h2>Agregar un lugar</h2>
      <p class="texto-panel">Mueve el mapa hasta que el pin quede sobre el lugar.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton primario ancho" data-accion="usar-punto">Usar este punto</button>
        <button type="button" class="boton ancho" data-accion="atras">Cancelar</button>
      </div>`;
  }
  function htmlNuevo(v) {
    const elegida = v.cat || 'restaurante';
    const opciones = ordenCategorias.map((c) => `<option value="${c}" ${c === elegida ? 'selected' : ''}>${esc(nombreCategoria(c))}</option>`).join('');
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Lugar nuevo</span></div>
      <form data-formulario="nuevo">
        <div class="campo"><label for="nuevo-nombre">Nombre</label><input id="nuevo-nombre" required maxlength="80" autocomplete="off" value="${esc(v.nombre || '')}"></div>
        <div class="campo"><label for="nuevo-categoria">Tipo</label><select id="nuevo-categoria">${opciones}</select></div>
        <div class="campo"><label for="nuevo-platos">Platos o productos (opcional)</label><input id="nuevo-platos" maxlength="160" autocomplete="off" placeholder="Ejemplo: salchipapa, hamburguesa" value="${esc(v.platos || '')}"><small>Sepáralos con comas.</small></div>
        <div class="campo"><label for="nuevo-telefono">Teléfono (opcional)</label><input id="nuevo-telefono" type="tel" maxlength="20" autocomplete="off" value="${esc(v.telefono || '')}"></div>
        ${v.url ? `<div class="campo"><span class="rotulo">Video</span><div class="url-compartida">${esc(v.url)}</div></div>` : ''}
        <div class="fila-botones acciones"><button type="submit" class="boton primario ancho">Guardar lugar</button></div>
      </form>`;
  }
  function htmlRestaurar(v) {
    const e = v.estado;
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Cancelar">${icono('x')}</button><span class="tipo">Restaurar respaldo</span></div>
      <h2>¿Reemplazar lo que tienes ahora?</h2>
      <p class="texto-panel">El respaldo tiene ${plural(Object.keys(e.favoritos).length, 'favorito', 'favoritos')}, ${plural(Object.keys(e.calificaciones).length, 'calificación', 'calificaciones')}, ${plural(Object.keys(e.visitados).length, 'visita', 'visitas')} y ${plural(e.propios.length, 'lugar agregado', 'lugares agregados')}.
        Lo que tienes ahora en el teléfono se reemplaza.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton primario ancho" data-accion="confirmar-restaurar">Reemplazar</button>
        <button type="button" class="boton ancho" data-accion="atras">Cancelar</button>
      </div>`;
  }

  // ---------- acciones ----------
  function abrirFicha(id) {
    const l = lugarGuardado(id);
    if (!l) return;
    const v = vistaActual();
    mostrar({ tipo: 'ficha', id }, v.tipo === 'ficha');
    if (!l.otro) requestAnimationFrame(() => centrarEn(l));
  }
  // Un lugar guardado de otro municipio: primero se abre su municipio.
  async function irAGuardado(id) {
    const g = estado.guardados[id];
    if (!g || !g.m) return;
    estado.ajustes.fijo = true;
    pila = [];
    if (await abrirMunicipio(g.m, { encuadrar: false })) abrirFicha(id);
  }
  function alternarFavorito(l) {
    if (estado.favoritos[l.id]) delete estado.favoritos[l.id];
    else {
      estado.favoritos[l.id] = hoyISO();
      recordar(l);
    }
    olvidarSiNoSeUsa(l.id);
    guardar();
    aviso(estado.favoritos[l.id] ? 'Agregado a favoritos.' : 'Quitado de favoritos.');
    aplicar();
    render();
  }
  function calificar(l, estrellas, nota) {
    const antes = estado.calificaciones[l.id];
    estado.calificaciones[l.id] = {
      estrellas, nota: (nota ?? (antes ? antes.nota : '')).trim().slice(0, 280), fecha: hoyISO(),
    };
    recordar(l);
    guardar();
    aplicar();
    render();
  }
  function normalizarPlato(texto) {
    const q = plano(texto);
    if (!q) return '';
    const exacto = Object.keys(SINONIMOS).find((p) => plano(p) === q || SINONIMOS[p].includes(q));
    return exacto || texto.trim().toLowerCase().slice(0, 40);
  }
  function guardarVideo(l, url) {
    const lista = estado.enlaces[l.id] || (estado.enlaces[l.id] = []);
    if (!lista.some((e) => e.url === url)) lista.push({ url, fecha: hoyISO() });
    recordar(l);
    guardar();
  }
  function exportar() {
    const nombre = `Mappi-respaldo-${hoyISO()}.json`;
    const json = JSON.stringify({ app: 'Mappi', formato: 2, fecha: new Date().toISOString(), estado }, null, 1);
    if (window.MappiAndroid && window.MappiAndroid.guardarRespaldo) {
      window.MappiAndroid.guardarRespaldo(nombre, json);
      return;
    }
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 5000);
  }
  function elegirCategoria(c) {
    estado.ajustes.categoria = estado.ajustes.categoria === c ? '' : c;
    if (estado.ajustes.categoria && estado.ajustes.ocultas.includes(c)) {
      estado.ajustes.ocultas = estado.ajustes.ocultas.filter((x) => x !== c);
    }
    if (!COMIDA.has(estado.ajustes.categoria) && platosDeConsulta(consultaActual()).length) entrada.value = '';
    guardar();
    pila = [];
    aplicar({ encuadrar: !!estado.ajustes.categoria });
    render();
  }

  contenido.addEventListener('click', (evento) => {
    const item = evento.target.closest('.item[data-id]:not([data-accion])');
    if (item) {
      const l = lugarGuardado(item.dataset.id);
      if (l && l.otro) irAGuardado(l.id); else abrirFicha(item.dataset.id);
      return;
    }
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    const v = vistaActual();
    const l = v.id ? lugarGuardado(v.id) : null;
    switch (boton.dataset.accion) {
      case 'atras': atras(); break;
      case 'abrir-lista': mostrar({ tipo: 'lista' }); break;
      case 'cerrar-lista': atras(); break;
      case 'vista':
        estado.ajustes.vista = boton.dataset.vista;
        guardar();
        aplicar();
        break;
      case 'orden':
        estado.ajustes.orden = boton.dataset.orden;
        guardar();
        ordenados = false;
        render();
        break;
      case 'filtros': mostrar({ tipo: 'filtros' }); break;
      case 'municipios': mostrar({ tipo: 'municipios' }); break;
      case 'ubicarme': ubicarme(true); break;
      case 'elegir-municipio': {
        const codigo = boton.dataset.codigo;
        estado.ajustes.fijo = true;
        pila = [];
        if (municipio && municipio.c === codigo) {
          encuadrarMunicipio();
          render();
        } else abrirMunicipio(codigo);
        break;
      }
      case 'mas': {
        const desde = contenido.scrollTop;
        pagina += POR_PAGINA;
        render();
        contenido.scrollTop = desde;
        break;
      }
      case 'ocultar-categoria': {
        const c = boton.dataset.categoria;
        const ocultas = new Set(estado.ajustes.ocultas);
        if (ocultas.has(c)) ocultas.delete(c); else ocultas.add(c);
        estado.ajustes.ocultas = [...ocultas];
        if (estado.ajustes.categoria === c) estado.ajustes.categoria = '';
        guardar();
        aplicar();
        break;
      }
      case 'todas-categorias':
        estado.ajustes.ocultas = [];
        estado.ajustes.categoria = '';
        guardar();
        aplicar();
        break;
      case 'favorito': alternarFavorito(l); break;
      case 'estrellas': calificar(l, Number(boton.dataset.n)); aviso(`Calificado con ${boton.dataset.n} de 5.`); break;
      case 'quitar-calificacion':
        delete estado.calificaciones[l.id];
        olvidarSiNoSeUsa(l.id);
        guardar();
        aplicar();
        render();
        aviso('Calificación quitada.');
        break;
      case 'visita': mostrar({ tipo: 'visita', id: l.id }); break;
      case 'quitar-visita':
        delete estado.visitados[l.id];
        olvidarSiNoSeUsa(l.id);
        guardar();
        atras();
        aplicar();
        render();
        aviso('Visita quitada.');
        break;
      case 'quitar-plato': {
        estado.platos[l.id] = (estado.platos[l.id] || []).filter((p) => p !== boton.dataset.plato);
        if (!estado.platos[l.id].length) delete estado.platos[l.id];
        olvidarSiNoSeUsa(l.id);
        guardar();
        aplicar();
        render();
        break;
      }
      case 'confirmar-abierto':
        estado.abiertos[l.id] = hoyISO();
        recordar(l);
        guardar();
        aplicar();
        render();
        aviso('Gracias. Queda marcado como abierto.');
        break;
      case 'cerrado':
        estado.cerrados[l.id] = hoyISO();
        delete estado.abiertos[l.id];
        recordar(l);
        guardar();
        atras();
        aplicar();
        aviso(`${l.nombre} quedó oculto. Puedes restaurarlo desde el menú.`);
        break;
      case 'reabrir':
        delete estado.cerrados[l.id];
        estado.abiertos[l.id] = hoyISO();
        guardar();
        aplicar();
        render();
        break;
      case 'eliminar-propio':
        estado.propios = estado.propios.filter((p) => p.id !== l.id);
        for (const k of MAPAS_POR_ID) delete estado[k][l.id];
        guardar();
        atras();
        reconstruir();
        aviso('Lugar eliminado.');
        break;
      case 'copiar': {
        const texto = boton.dataset.texto;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto).then(() => aviso('Dirección copiada.'), () => aviso(texto));
        } else aviso(texto);
        break;
      }
      case 'actualizar':
        revisarDatos(true);
        revisarVersion(true);
        break;
      case 'ver-version': mostrar({ tipo: 'version' }); break;
      case 'posponer-version': posponerVersion(); break;
      case 'ver-ocultos': mostrar({ tipo: 'ocultos' }); break;
      case 'restaurar-oculto':
        delete estado.cerrados[boton.dataset.id];
        olvidarSiNoSeUsa(boton.dataset.id);
        guardar();
        aplicar();
        render();
        break;
      case 'ir-guardado': irAGuardado(boton.dataset.id); break;
      case 'exportar': exportar(); break;
      case 'importar': $('#archivo-respaldo').click(); break;
      case 'confirmar-restaurar':
        estado = v.estado;
        guardar();
        pila = [];
        reconstruir();
        render();
        aviso('Respaldo restaurado.');
        break;
      case 'guardar-video': {
        const destino = porId.get(boton.dataset.id);
        guardarVideo(destino, v.url);
        pila = [];
        aplicar();
        abrirFicha(destino.id);
        aviso(`Video guardado en ${destino.nombre}.`);
        break;
      }
      case 'nuevo-desde-video': mostrar({ tipo: 'ubicar', url: v.url, nombre: v.q || '' }); break;
      case 'usar-punto': {
        const c = centroMapa();
        mostrar({ tipo: 'nuevo', lat: c.lat, lon: c.lon, url: v.url, nombre: v.nombre }, true);
        setTimeout(() => $('#nuevo-nombre') && $('#nuevo-nombre').focus(), 50);
        break;
      }
      default: break;
    }
  });

  contenido.addEventListener('change', (evento) => {
    if (evento.target.id === 'filtro-cerrados') {
      estado.ajustes.ocultarCerrados = evento.target.checked;
      guardar();
      aplicar();
    }
  });

  contenido.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const formulario = evento.target.dataset.formulario;
    const v = vistaActual();
    const l = v.id ? lugarGuardado(v.id) : null;
    if (formulario === 'plato') {
      const plato = normalizarPlato($('#nuevo-plato').value);
      if (!plato) return;
      const lista = estado.platos[l.id] || (estado.platos[l.id] = []);
      if (!lista.includes(plato) && !(l.platos || []).includes(plato)) lista.push(plato);
      recordar(l);
      guardar();
      aplicar();
      render();
      aviso(`Agregado: ${plato}.`);
    } else if (formulario === 'comentario') {
      const c = estado.calificaciones[l.id];
      if (!c) return;
      calificar(l, c.estrellas, $('#comentario').value);
      aviso('Comentario guardado.');
    } else if (formulario === 'visita') {
      const dia = $('#visita-fecha').value || hoyISO();
      estado.visitados[l.id] = { fecha: dia, nota: $('#visita-nota').value.trim().slice(0, 500) };
      recordar(l);
      guardar();
      atras();
      aplicar();
      render();
      aviso('Visita guardada.');
    } else if (formulario === 'nuevo') {
      const nombre = $('#nuevo-nombre').value.trim();
      if (!nombre) return;
      const platos = [...new Set($('#nuevo-platos').value.split(',').map(normalizarPlato).filter(Boolean))];
      const donde = municipioEn(v.lat, v.lon) || municipio;
      const propio = {
        id: `yo:${Date.now().toString(36)}`, nombre: nombre.slice(0, 80), lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6),
        cat: $('#nuevo-categoria').value, platos, telefono: $('#nuevo-telefono').value.trim().slice(0, 20), creado: hoyISO(),
        m: donde ? donde.c : '',
      };
      estado.propios.push(propio);
      guardar();
      pila = [];
      reconstruir();
      const nuevo = porId.get(propio.id);
      if (v.url && nuevo) guardarVideo(nuevo, v.url);
      abrirFicha(propio.id);
      aviso(`${propio.nombre} quedó en tu mapa.`);
    }
  });

  $('#archivo-respaldo').addEventListener('change', (evento) => {
    const archivo = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const contenidoRespaldo = JSON.parse(lector.result);
        if (!contenidoRespaldo || contenidoRespaldo.app !== 'Mappi' || !contenidoRespaldo.estado) throw new Error('no es de Mappi');
        mostrar({ tipo: 'restaurar', estado: normalizarEstado(contenidoRespaldo.estado) });
      } catch (e) {
        aviso('Ese archivo no es un respaldo de Mappi.');
      }
    };
    lector.onerror = () => aviso('No se pudo leer el archivo.');
    lector.readAsText(archivo);
  });

  // ---------- barra superior ----------
  function pintarChips() {
    const cuenta = new Map();
    for (const l of lugares) cuenta.set(l.cat, (cuenta.get(l.cat) || 0) + 1);
    const presentes = ordenCategorias.filter((c) => !lugares.length || cuenta.get(c));
    $('#chips').innerHTML = presentes.map((c) => `<button type="button" class="chip" data-categoria="${c}" aria-pressed="false"><span class="punto" style="--c: ${colorCategoria(c)}"></span>${esc(nombreCategoria(c))}</button>`).join('');
    $('#chips-platos').innerHTML = CHIPS_PLATOS.map(([nombre, plato]) => `<button type="button" class="chip" data-plato="${esc(plato)}" aria-pressed="false">${esc(nombre)}</button>`).join('');
  }
  let chipsDe = '';
  function marcarChips() {
    const clave = `${municipio ? municipio.c : ''}:${indice.version}:${oscuro.matches}`;
    if (clave !== chipsDe) {
      chipsDe = clave;
      pintarChips();
    }
    const q = consultaActual();
    for (const chip of document.querySelectorAll('#chips .chip')) {
      chip.setAttribute('aria-pressed', String(chip.dataset.categoria === estado.ajustes.categoria));
    }
    for (const chip of document.querySelectorAll('#chips-platos .chip')) {
      chip.setAttribute('aria-pressed', String(plano(chip.textContent) === q));
    }
    $('#chips-platos').hidden = !COMIDA.has(estado.ajustes.categoria);
  }
  $('#chips').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (chip) elegirCategoria(chip.dataset.categoria);
  });
  $('#chips-platos').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    entrada.value = chip.getAttribute('aria-pressed') === 'true' ? '' : chip.textContent;
    // Primero el mapa con los lugares de ese plato; la lista queda a un toque.
    pila = [];
    aplicar({ encuadrar: !!entrada.value });
    render();
  });
  const listaPlatos = document.createElement('datalist');
  listaPlatos.id = 'lista-platos';
  listaPlatos.innerHTML = Object.keys(SINONIMOS).map((p) => `<option value="${esc(p)}"></option>`).join('');
  document.body.appendChild(listaPlatos);

  let temporizadorBusqueda;
  entrada.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      if (entrada.value && vistaActual().tipo !== 'lista') pila = [{ tipo: 'lista' }];
      aplicar();
      render();
    }, lugares.length > 50000 ? 300 : 150);
  });
  $('#form-busqueda').addEventListener('submit', (evento) => {
    evento.preventDefault();
    clearTimeout(temporizadorBusqueda);
    entrada.blur();
    pila = [{ tipo: 'lista' }];
    aplicar({ encuadrar: true });
    render();
  });
  $('#limpiar').addEventListener('click', () => {
    entrada.value = '';
    pila = [];
    aplicar();
    render();
  });
  $('#abrir-menu').addEventListener('click', () => mostrar({ tipo: 'menu' }));
  $('#ubicarme').addEventListener('click', () => ubicarme(true));
  $('#agregar').addEventListener('click', () => mostrar({ tipo: 'ubicar' }));
  $('#asa').addEventListener('click', () => {
    const tipo = vistaActual().tipo;
    if (tipo === 'resumen') mostrar({ tipo: 'lista' });
    else atras();
  });

  // La hoja cambia de alto; los controles del mapa y los avisos se ubican justo encima.
  const observarHoja = () => {
    document.documentElement.style.setProperty('--alto-hoja', `${Math.round(altoHoja())}px`);
    // Si la hoja casi llega a la barra, los botones flotantes no caben encima.
    document.body.classList.toggle('hoja-alta', altoHoja() > innerHeight - altoBarra() - 130);
  };
  if (window.ResizeObserver) new ResizeObserver(observarHoja).observe(hoja);
  window.addEventListener('resize', observarHoja);

  // ---------- puente con Android y pruebas ----------
  function recibirCompartido(texto) {
    if (!listo || !municipio) {
      pendientesCompartidos.push(texto);
      return;
    }
    const url = primerEnlace(texto);
    pila = [{ tipo: 'compartido', url, q: '' }];
    render();
  }
  function entregarCompartidos() {
    while (municipio && pendientesCompartidos.length) recibirCompartido(pendientesCompartidos.shift());
  }
  window.Mappi = {
    get listo() { return listo; },
    atras,
    recibirCompartido,
    totalLugares: () => lugares.length,
    resultados: () => resultados.length,
    buscar(texto) {
      entrada.value = texto;
      pila = texto ? [{ tipo: 'lista' }] : [];
      aplicar({ encuadrar: !!texto });
      render();
      return resultados.length;
    },
    categoria(c) {
      if (estado.ajustes.categoria !== c) elegirCategoria(c);
      return resultados.length;
    },
    primerResultado: () => {
      ordenar();
      return resultados[0] ? resultados[0].l.id : null;
    },
    abrir: abrirFicha,
    vista: () => vistaActual().tipo,
    abierto: () => vistaActual().id || null,
    estado: () => JSON.parse(JSON.stringify(estado)),
    versionDatos: () => indice.version,
    municipio: () => (municipio ? municipio.c : null),
    cargando: () => !!cargando,
    abrirMunicipio: (codigo) => abrirMunicipio(codigo),
    municipioEn: (lat, lon) => (municipioEn(lat, lon) || {}).c || null,
    calificar(id, estrellas, nota) {
      const l = lugarGuardado(id);
      if (!l) return false;
      calificar(l, estrellas, nota);
      return true;
    },
    hayMapa: () => !!mapa,
    zoom: () => (mapa ? mapa.getZoom() : null),
    zonaLibre: () => ({ arriba: altoBarra(), abajo: innerHeight - altoHoja() }),
    mapaListo: () => !!(mapa && capasListas && mapa.loaded() && mapa.areTilesLoaded()),
    puntosEnMapa: () => (mapa && capasListas ? mapa.queryRenderedFeatures({ layers: ['lugares'] }).length : 0),
    puntoEnPantalla(id) {
      const l = porId.get(id);
      if (!mapa || !l) return null;
      const p = mapa.project([l.lon, l.lat]);
      return { x: p.x, y: p.y };
    },
    respaldoGuardado() { if (window.MappiAndroid) aviso('Respaldo guardado.'); },
    versionApp: () => ({ ...app }),
    nuevaVersion: () => (nuevaVersion ? { ...nuevaVersion } : null),
    versionRevisada: () => versionRevisada || !app.codigo,
    // Las pruebas entregan un version.json sin publicarlo.
    probarManifiesto(m) {
      if (!aplicarManifiesto(m)) return false;
      ofrecerVersion(false);
      return !!nuevaVersion;
    },
  };

  async function iniciar() {
    try {
      await cargarIndice();
    } catch (e) {
      contenido.innerHTML = '<div class="vacio"><strong>No se pudo iniciar Mappi</strong>Cierra y vuelve a abrir la app.</div>';
      return;
    }
    iniciarMapa();
    marcarChips();
    render();
    observarHoja();
    if (estado.ajustes.municipio) await abrirMunicipio(estado.ajustes.municipio);
    listo = true;
    render();
    entregarCompartidos();
    ubicarme(false);
    revisarDatos(false);
    revisarVersion(false);
  }
  iniciar();
})();
