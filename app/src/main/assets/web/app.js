'use strict';

(() => {
  // La lista publicada cada mes por la acción "Actualizar lugares" del repositorio.
  const REMOTO = 'https://raw.githubusercontent.com/Yextep/mappi/main/datos/lugares.json';
  const LOCAL = '../lugares.json';
  const CLAVE_ESTADO = 'mappi.estado.v1';
  const CLAVE_DATOS = 'mappi.datos.v1';
  const CLAVE_REVISION = 'mappi.revision.v1';
  const VERSION_APP = '1.0';
  const CENTRO = [7.0655, -73.8547];
  const UN_DIA = 24 * 60 * 60 * 1000;
  const POR_PAGINA = 60;

  const GRUPOS = {
    restaurante: { nombre: 'Restaurante', plural: 'Restaurantes', color: '--g-restaurante' },
    rapida: { nombre: 'Comida rápida', plural: 'Comida rápida', color: '--g-rapida' },
    cafe: { nombre: 'Café, panadería y postres', plural: 'Cafés y postres', color: '--g-cafe' },
    bar: { nombre: 'Bar', plural: 'Bares', color: '--g-bar' },
  };
  const ORDEN_GRUPOS = ['restaurante', 'rapida', 'cafe', 'bar'];

  // Nombre del plato tal como viene en lugares.json -> palabras con las que la gente lo busca.
  const SINONIMOS = {
    'pizza': ['pizza', 'pizzas', 'pizzeria'],
    'hamburguesa': ['hamburguesa', 'hamburguesas', 'burger', 'burguer', 'hamburgueseria'],
    'perro caliente': ['perro caliente', 'perros calientes', 'perro', 'perros', 'hot dog', 'hotdog', 'perrada'],
    'salchipapa': ['salchipapa', 'salchipapas', 'salchipapeteria'],
    'arepa': ['arepa', 'arepas', 'arepera'],
    'pollo': ['pollo', 'pollo asado', 'broaster', 'asadero', 'pollos'],
    'carnes y parrilla': ['carne', 'carnes', 'parrilla', 'parrillada', 'asado', 'asados', 'churrasco', 'steak', 'bbq', 'costillas', 'picada'],
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
    'comida típica': ['comida tipica', 'tipica', 'tipico', 'corrientazo', 'almuerzo', 'almuerzos', 'sancocho', 'mute', 'bandeja paisa', 'lechona', 'tamal', 'tamales', 'bollo'],
    'desayunos': ['desayuno', 'desayunos', 'calentado'],
    'sándwich': ['sandwich', 'sanduche', 'panini', 'sandwiches'],
    'picada': ['picada', 'picadas', 'mazorcada'],
    'alitas': ['alitas', 'alas', 'wings'],
    'crepes': ['crepe', 'crepes'],
  };
  const CHIPS = [
    ['Pizza', 'pizza'], ['Hamburguesa', 'hamburguesa'], ['Salchipapa', 'salchipapa'], ['Perro caliente', 'perro caliente'],
    ['Arepa', 'arepa'], ['Pollo', 'pollo'], ['Carnes', 'carnes y parrilla'], ['Mariscos', 'pescado y mariscos'],
    ['Comida china', 'comida china'], ['Comida típica', 'comida típica'], ['Desayunos', 'desayunos'], ['Helado', 'helado'],
    ['Postres', 'postres'], ['Café', 'café'], ['Jugos', 'jugos'], ['Panadería', 'panadería'], ['Sushi', 'sushi'],
    ['Mexicana', 'mexicana'], ['Árabe', 'árabe'], ['Alitas', 'alitas'],
  ];
  const VISTAS = [['todos', 'Todos'], ['favoritos', 'Favoritos'], ['visitados', 'Ya fui'], ['pendientes', 'No he ido']];

  const $ = (sel) => document.querySelector(sel);
  const hoja = $('#hoja');
  const contenido = $('#hoja-contenido');
  const entrada = $('#q');

  let datos = { version: '', fuentes: [], lugares: [] };
  let lugares = [];
  let porId = new Map();
  let estado = cargarEstado();
  let resultados = [];
  let ubicacion = null;
  let pila = [];
  let pagina = POR_PAGINA;
  let listo = false;
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
      favoritos: {}, visitados: {}, cerrados: {}, abiertos: {}, platos: {}, enlaces: {}, propios: [],
      ajustes: { grupos: ['restaurante', 'rapida', 'cafe'], ocultarCerrados: true, vista: 'todos' },
    };
  }
  function normalizarEstado(e) {
    const base = estadoVacio();
    if (!e || typeof e !== 'object') return base;
    for (const k of ['favoritos', 'visitados', 'cerrados', 'abiertos', 'platos', 'enlaces']) {
      if (e[k] && typeof e[k] === 'object' && !Array.isArray(e[k])) base[k] = e[k];
    }
    if (Array.isArray(e.propios)) {
      base.propios = e.propios.filter((p) => p && typeof p.nombre === 'string'
        && Number.isFinite(p.lat) && Number.isFinite(p.lon) && String(p.id || '').startsWith('yo:'));
    }
    if (e.ajustes && typeof e.ajustes === 'object') {
      const a = e.ajustes;
      if (Array.isArray(a.grupos)) base.ajustes.grupos = a.grupos.filter((g) => GRUPOS[g]);
      if (typeof a.ocultarCerrados === 'boolean') base.ajustes.ocultarCerrados = a.ocultarCerrados;
      if (VISTAS.some(([v]) => v === a.vista)) base.ajustes.vista = a.vista;
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

  // ---------- datos de lugares ----------
  function datosValidos(d) {
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d.version || '') && Array.isArray(d.lugares) && d.lugares.length > 100
      && d.lugares.every((l) => l && typeof l.id === 'string' && typeof l.nombre === 'string'
        && Number.isFinite(l.lat) && Number.isFinite(l.lon) && GRUPOS[l.grupo]);
  }
  async function cargarDatos() {
    const local = await (await fetch(LOCAL)).json();
    let guardado = null;
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS));
    } catch (e) { /* sin copia descargada */ }
    datos = datosValidos(guardado) && guardado.version > local.version ? guardado : local;
  }
  function reconstruir() {
    const propios = estado.propios.map((p) => ({
      id: p.id, nombre: p.nombre, lat: p.lat, lon: p.lon, grupo: GRUPOS[p.grupo] ? p.grupo : 'restaurante',
      platos: Array.isArray(p.platos) ? p.platos : [], telefono: p.telefono || '', propio: true, creado: p.creado,
      fuentes: ['usuario'],
    }));
    lugares = datos.lugares.concat(propios);
    for (const l of lugares) l._plano = plano(l.nombre);
    porId = new Map(lugares.map((l) => [l.id, l]));
    aplicar();
  }
  async function buscarActualizacion(manual) {
    if (!manual) {
      let ultima = 0;
      try { ultima = Number(localStorage.getItem(CLAVE_REVISION)) || 0; } catch (e) { /* sin registro */ }
      if (Date.now() - ultima < UN_DIA) return;
    }
    try {
      const respuesta = await fetch(REMOTO, { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const texto = await respuesta.text();
      const nuevo = JSON.parse(texto);
      if (!datosValidos(nuevo)) throw new Error('lista no válida');
      try { localStorage.setItem(CLAVE_REVISION, String(Date.now())); } catch (e) { /* sin espacio */ }
      if (nuevo.version > datos.version) {
        const antes = new Set(datos.lugares.map((l) => l.id));
        const nuevos = nuevo.lugares.filter((l) => !antes.has(l.id)).length;
        datos = nuevo;
        try { localStorage.setItem(CLAVE_DATOS, texto); } catch (e) { /* se usará otra vez la lista incluida */ }
        reconstruir();
        aviso(`Lista actualizada al ${fecha(nuevo.version)}${nuevos ? `: ${plural(nuevos, 'lugar nuevo', 'lugares nuevos')}` : ''}.`);
        if (pila.length && pila[pila.length - 1].tipo === 'menu') render();
      } else if (manual) {
        aviso(`Ya tienes la lista más reciente (${fecha(datos.version)}).`);
      }
    } catch (e) {
      if (manual) aviso('No se pudo buscar la actualización. Revisa la conexión a internet.');
    }
  }

  // ---------- búsqueda y filtros ----------
  function platosDeConsulta(q) {
    if (q.length < 3) return [];
    return Object.keys(SINONIMOS).filter((plato) => SINONIMOS[plato].some((s) => s === q || s.startsWith(q)
      || (s.length >= 4 && (q.startsWith(`${s} `) || q.endsWith(` ${s}`) || q === `${s}s`))));
  }
  function platosDe(l) {
    const mios = estado.platos[l.id] || [];
    return [...new Set([...(l.platos || []), ...mios])];
  }
  function puntaje(l, q, platosQ) {
    if (!q) return 1;
    const todos = platosDe(l);
    if (platosQ.some((p) => todos.includes(p))) return 4;
    if (l._plano.includes(q)) return 3;
    if (todos.some((p) => plano(p).includes(q))) return 3;
    if (platosQ.some((p) => (l.probables || []).includes(p))) return 1;
    return 0;
  }
  function posibleCierre(l) {
    if (estado.cerrados[l.id]) return 'usuario';
    if (l.registro && l.registro.estado === 'cancelado' && !estado.abiertos[l.id]) return 'registro';
    return null;
  }
  function pasaFiltros(l, vista) {
    if (estado.cerrados[l.id]) return false;
    if (vista === 'favoritos') return !!estado.favoritos[l.id];
    if (vista === 'visitados') return !!estado.visitados[l.id];
    if (!l.propio && !estado.ajustes.grupos.includes(l.grupo)) return false;
    if (estado.ajustes.ocultarCerrados && posibleCierre(l) === 'registro') return false;
    if (vista === 'pendientes') return !estado.visitados[l.id];
    return true;
  }
  function consultaActual() {
    return plano(entrada.value);
  }
  function filtrar(vista) {
    const q = consultaActual();
    const platosQ = platosDeConsulta(q);
    const lista = [];
    for (const l of lugares) {
      if (!pasaFiltros(l, vista)) continue;
      const p = puntaje(l, q, platosQ);
      if (p > 0) lista.push({ l, p, d: ubicacion ? distancia(ubicacion, l) : null });
    }
    lista.sort((a, b) => b.p - a.p || (a.d !== null ? a.d - b.d : 0) || a.l._plano.localeCompare(b.l._plano));
    return lista;
  }
  function ocultosPorCierre() {
    if (!estado.ajustes.ocultarCerrados) return 0;
    const q = consultaActual();
    const platosQ = platosDeConsulta(q);
    return lugares.filter((l) => posibleCierre(l) === 'registro' && !estado.cerrados[l.id]
      && (l.propio || estado.ajustes.grupos.includes(l.grupo)) && puntaje(l, q, platosQ) > 0).length;
  }
  function aplicar({ encuadrar = false } = {}) {
    resultados = filtrar(estado.ajustes.vista);
    pagina = POR_PAGINA;
    dibujarMarcadores();
    marcarChips();
    $('#limpiar').hidden = !entrada.value;
    if (encuadrar) encuadrarResultados();
    const tipo = pila.length ? pila[pila.length - 1].tipo : 'resumen';
    if (tipo === 'resumen' || tipo === 'lista' || tipo === 'filtros') render();
  }

  // ---------- mapa ----------
  // OpenFreeMap: mapa vectorial gratuito, sin clave ni límites de uso.
  const ESTILO = {
    claro: 'https://tiles.openfreemap.org/styles/positron',
    oscuro: 'https://tiles.openfreemap.org/styles/dark',
  };
  const LIMITES_MAPA = [[-74.3, 6.6], [-73.35, 7.45]];
  const SVG_FAV = '<svg viewBox="0 0 28 28"><circle class="fondo" cx="14" cy="14" r="12"/><path class="simbolo" d="M14 19.5s-5-3-6-6.1c-.7-2.1.7-4.1 2.8-4.1 1.3 0 2.4.7 3.2 1.9.8-1.2 1.9-1.9 3.2-1.9 2.1 0 3.5 2 2.8 4.1-1 3.1-6 6.1-6 6.1z"/></svg>';
  const SVG_FUI = '<svg viewBox="0 0 24 24"><circle class="fondo" cx="12" cy="12" r="10.5"/><path class="simbolo" d="M7.5 12.3l3 3 6-6.6"/></svg>';
  const oscuro = window.matchMedia('(prefers-color-scheme: dark)');
  let mapa = null;
  let capasListas = false;
  let geojson = { type: 'FeatureCollection', features: [] };
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
    try {
      mapa = new maplibregl.Map({
        container: 'mapa', style: estilo, center: [CENTRO[1], CENTRO[0]], zoom: 13.6, minZoom: 10, maxZoom: 19,
        maxBounds: LIMITES_MAPA, attributionControl: false, dragRotate: false, pitchWithRotate: false,
        touchPitch: false, fadeDuration: 0,
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
    if (ubicacion) dibujarUbicacion(false);
  }
  function agregarCapas() {
    const borde = color('--superficie');
    mapa.addSource('lugares', { type: 'geojson', data: geojson });
    mapa.addLayer({
      id: 'lugares', type: 'circle', source: 'lugares', filter: ['!', ['get', 'especial']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 6, 17, 9],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['get', 'opacidad'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 1.8],
        'circle-stroke-color': borde,
      },
    });
    if (mapa.getStyle().glyphs) {
      mapa.addLayer({
        id: 'nombres', type: 'symbol', source: 'lugares', minzoom: 15.5,
        layout: {
          'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
          'text-offset': [0, 1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true,
        },
        paint: { 'text-color': color('--texto'), 'text-halo-color': borde, 'text-halo-width': 1.5 },
      });
    }
    capasListas = true;
    dibujarMarcadores();
  }
  oscuro.addEventListener('change', async () => {
    if (!mapa) return;
    const estilo = await estiloMapa();
    capasListas = false;
    mapa.setStyle(estilo, { diff: false });
  });

  function dibujarMarcadores() {
    const gris = color('--texto-2');
    const colores = Object.fromEntries(ORDEN_GRUPOS.map((g) => [g, color(GRUPOS[g].color)]));
    geojson = {
      type: 'FeatureCollection',
      features: resultados.map(({ l }) => {
        const cierre = posibleCierre(l);
        return {
          type: 'Feature', geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
          properties: {
            id: l.id, nombre: l.nombre, color: cierre ? gris : colores[l.grupo], opacidad: cierre ? 0.55 : 0.95,
            especial: !!(estado.favoritos[l.id] || estado.visitados[l.id]),
          },
        };
      }),
    };
    if (!mapa) return;
    if (capasListas && mapa.getSource('lugares')) mapa.getSource('lugares').setData(geojson);
    for (const marca of marcasEspeciales) marca.remove();
    marcasEspeciales = resultados.filter(({ l }) => estado.favoritos[l.id] || estado.visitados[l.id]).map(({ l }) => {
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
      const tocados = mapa.queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: ['lugares'] });
      if (tocados.length) {
        const cerca = (f) => {
          const q = mapa.project(f.geometry.coordinates);
          return Math.hypot(q.x - p.x, q.y - p.y);
        };
        tocados.sort((a, b) => cerca(a) - cerca(b));
        abrirFicha(tocados[0].properties.id);
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
    if (!l || !mapa) return;
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
  function centrarEn(l, zoomMinimo = 16) {
    if (!mapa) return;
    mapa.easeTo({ center: [l.lon, l.lat], zoom: Math.max(mapa.getZoom(), zoomMinimo), offset: desplazamiento(), duration: 450 });
  }
  // Encuadra los resultados cercanos (5 km) para que un lugar rural no aleje el mapa de la ciudad.
  function encuadrarResultados() {
    if (!mapa || !resultados.length || resultados.length === lugares.length) return;
    const centro = { lat: CENTRO[0], lon: CENTRO[1] };
    const referencia = ubicacion && distancia(ubicacion, centro) < 15000 ? ubicacion : centro;
    const cercanos = resultados.filter(({ l }) => distancia(referencia, l) <= 5000);
    const limites = new maplibregl.LngLatBounds();
    for (const { l } of cercanos.length ? cercanos : resultados) limites.extend([l.lon, l.lat]);
    requestAnimationFrame(() => mapa.fitBounds(limites, {
      padding: { top: altoBarra() + 16, bottom: altoHoja() + 16, left: 28, right: 28 }, maxZoom: 16, duration: 500,
    }));
  }
  function centroMapa() {
    if (!mapa) return { lat: CENTRO[0], lon: CENTRO[1] };
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
  function ubicarme(centrar) {
    if (!navigator.geolocation) {
      if (centrar) aviso('Este teléfono no permite obtener la ubicación.');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      ubicacion = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy };
      $('#ubicarme').classList.add('activo');
      dibujarUbicacion(centrar);
      aplicar();
    }, () => {
      $('#ubicarme').classList.remove('activo');
      if (centrar) aviso('No pude obtener tu ubicación. Activa el GPS y dale permiso de ubicación a Mappi.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  // ---------- hoja inferior ----------
  function mostrar(vista, reemplazar = false) {
    if (reemplazar) pila.pop();
    pila.push(vista);
    render();
  }
  function atras() {
    if (!pila.length) return false;
    pila.pop();
    render();
    return true;
  }
  function vistaActual() {
    return pila.length ? pila[pila.length - 1] : { tipo: 'resumen' };
  }

  function render() {
    const v = vistaActual();
    hoja.dataset.vista = ['resumen', 'lista', 'ficha'].includes(v.tipo) ? v.tipo : 'panel';
    document.body.classList.toggle('modo-ubicar', v.tipo === 'ubicar');
    $('#mira').hidden = v.tipo !== 'ubicar';
    const lugar = v.id ? porId.get(v.id) : null;
    marcarSeleccion(v.tipo === 'ficha' || v.tipo === 'visita' ? lugar : null);
    const dibujar = {
      resumen: htmlResumen, lista: htmlResumen, ficha: () => htmlFicha(lugar), visita: () => htmlVisita(lugar),
      filtros: htmlFiltros, menu: htmlMenu, compartido: () => htmlCompartido(v), ubicar: htmlUbicar,
      nuevo: () => htmlNuevo(v), restaurar: () => htmlRestaurar(v), ocultos: htmlOcultos,
    }[v.tipo];
    if ((v.tipo === 'ficha' || v.tipo === 'visita') && !lugar) {
      pila.pop();
      render();
      return;
    }
    contenido.innerHTML = dibujar();
    contenido.scrollTop = 0;
    if (v.tipo === 'compartido') llenarCompartido(v);
  }

  function htmlSegmentos() {
    return `<div class="segmentos" role="group" aria-label="Qué lugares mostrar">${VISTAS.map(([clave, nombre]) => {
      const n = clave === estado.ajustes.vista ? resultados.length : filtrar(clave).length;
      return `<button type="button" class="segmento" data-accion="vista" data-vista="${clave}" aria-pressed="${clave === estado.ajustes.vista}">${nombre}<span class="cuenta">${n.toLocaleString('es-CO')}</span></button>`;
    }).join('')}</div>`;
  }
  // Cuántos filtros difieren de los iniciales (sin bares y sin posibles cerrados).
  function filtrosActivos() {
    const inicial = estadoVacio().ajustes;
    let n = ORDEN_GRUPOS.filter((g) => inicial.grupos.includes(g) !== estado.ajustes.grupos.includes(g)).length;
    if (estado.ajustes.ocultarCerrados !== inicial.ocultarCerrados) n += 1;
    return n;
  }
  function htmlResumen() {
    const v = vistaActual();
    const q = entrada.value.trim();
    const ocultos = ocultosPorCierre();
    const n = resultados.length;
    let detalle;
    if (v.tipo === 'lista') detalle = ubicacion ? 'Ordenados por cercanía' : 'Ordenados por nombre. Activa tu ubicación para verlos por cercanía.';
    else detalle = 'Toca para ver la lista';
    if (ocultos) detalle = `${plural(ocultos, 'posible cerrado oculto', 'posibles cerrados ocultos')} · ${detalle}`;
    const cuantos = filtrosActivos();
    let html = `${htmlSegmentos()}
      <div class="resumen">
        <button type="button" class="resumen-texto" data-accion="${v.tipo === 'lista' ? 'cerrar-lista' : 'abrir-lista'}">
          <strong>${plural(n, 'lugar', 'lugares')}</strong>${q ? ` con «${esc(q)}»` : ''}
          <small>${esc(detalle)}</small>
        </button>
        <button type="button" class="boton-filtros" data-accion="filtros">${icono('filtro')}Filtros${cuantos ? ` (${cuantos})` : ''}</button>
      </div>`;
    if (v.tipo === 'lista') html += htmlLista();
    return html;
  }
  function htmlVacio() {
    const q = entrada.value.trim();
    const vista = estado.ajustes.vista;
    if (vista === 'favoritos' && !Object.keys(estado.favoritos).length) {
      return '<div class="vacio"><strong>Todavía no tienes favoritos</strong>Abre un lugar y toca «Favorito».</div>';
    }
    if (vista === 'visitados' && !Object.keys(estado.visitados).length) {
      return '<div class="vacio"><strong>Todavía no has marcado visitas</strong>Abre un lugar y toca «Ya fui».</div>';
    }
    return `<div class="vacio"><strong>No encontré lugares${q ? ` con «${esc(q)}»` : ''}</strong>Prueba con otro plato, cambia a «Todos» o revisa los filtros.</div>`;
  }
  function htmlItem({ l, d }, q, platosQ) {
    const g = GRUPOS[l.grupo];
    const todos = platosDe(l);
    const probables = platosQ.filter((p) => !todos.includes(p) && (l.probables || []).includes(p));
    let platos = esc(todos.slice(0, 4).map(capital).join(', '));
    if (probables.length) platos += `${platos ? ' · ' : ''}<em>suele tener ${esc(probables.join(', '))}</em>`;
    const cierre = posibleCierre(l);
    const meta = [l.propio ? 'Agregado por ti' : g.nombre, d !== null ? distanciaTexto(d) : ''].filter(Boolean).join(' · ');
    return `<li><button type="button" class="item" data-id="${esc(l.id)}">
      <span class="punto" style="--c: var(${cierre ? '--texto-2' : g.color})"></span>
      <span class="item-texto">
        <span class="item-nombre"><span>${esc(l.nombre)}</span>${estado.favoritos[l.id] ? icono('corazon', 'fav') : ''}${estado.visitados[l.id] ? icono('check', 'fui') : ''}</span>
        <span class="item-meta">${esc(meta)}</span>
        ${platos ? `<span class="item-platos">${platos}</span>` : ''}
        ${cierre ? '<span><span class="etiqueta alerta">Puede haber cerrado</span></span>' : ''}
      </span>
    </button></li>`;
  }
  function htmlLista() {
    if (!resultados.length) return htmlVacio();
    const q = consultaActual();
    const platosQ = platosDeConsulta(q);
    const visibles = resultados.slice(0, pagina);
    let html = `<ul class="lista">${visibles.map((r) => htmlItem(r, q, platosQ)).join('')}</ul>`;
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
    const r = l.registro;
    const abierto = estado.abiertos[l.id];
    const nombreRegistro = r ? `<small>En el registro: ${esc(r.nombre)}</small>` : '';
    if (r && r.estado === 'cancelado') {
      if (abierto) return `<div class="estado-registro ok">Confirmaste que sigue abierto el ${fecha(abierto)}.<small>Su matrícula mercantil figura cancelada desde ${r.anio}.</small></div>`;
      return `<div class="estado-registro alerta"><strong>Puede haber cerrado.</strong> Su matrícula mercantil fue cancelada en ${r.anio}.${nombreRegistro}
        <div class="fila-botones"><button type="button" class="boton pequeno" data-accion="confirmar-abierto">Sigue abierto</button><button type="button" class="boton pequeno" data-accion="cerrado">Ya cerró</button></div></div>`;
    }
    if (abierto) return `<div class="estado-registro ok">Confirmaste que sigue abierto el ${fecha(abierto)}.</div>`;
    if (r && r.estado === 'al_dia') return `<div class="estado-registro ok">Matrícula mercantil renovada en ${r.anio}.${nombreRegistro}</div>`;
    if (r && r.estado === 'sin_renovar') return `<div class="estado-registro aviso">Matrícula activa, renovada por última vez en ${r.anio}.${nombreRegistro}</div>`;
    return '<div class="estado-registro neutra">No aparece con este nombre en el registro mercantil. Muchos negocios están registrados con otro nombre.</div>';
  }
  function telefonoDigitos(t) {
    return String(t || '').replace(/[^\d+]/g, '');
  }
  function urlWhatsapp(l) {
    const directo = urlSegura(l.whatsapp);
    if (directo) return directo;
    const d = String(l.telefono || '').replace(/\D/g, '');
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

  function htmlFicha(l) {
    const g = GRUPOS[l.grupo];
    const fav = !!estado.favoritos[l.id];
    const visita = estado.visitados[l.id];
    const confirmados = l.platos || [];
    const mios = (estado.platos[l.id] || []).filter((p) => !confirmados.includes(p));
    const probables = (l.probables || []).filter((p) => !confirmados.includes(p) && !mios.includes(p));
    const d = ubicacion ? distancia(ubicacion, l) : null;
    const contactos = [];
    if (l.telefono) contactos.push(`<a class="contacto" href="tel:${esc(telefonoDigitos(l.telefono))}">${icono('tel')}<span>${esc(l.telefono)}<small>Llamar</small></span></a>`);
    const wa = urlWhatsapp(l);
    if (wa) contactos.push(`<a class="contacto" href="${esc(wa)}" target="_blank" rel="noopener">${icono('chat')}<span>WhatsApp<small>${l.whatsapp ? 'Enlace publicado por el negocio' : 'Si ese celular tiene WhatsApp'}</small></span></a>`);
    const fb = urlSegura(l.facebook);
    if (fb) contactos.push(`<a class="contacto" href="${esc(fb)}" target="_blank" rel="noopener">${icono('enlace')}<span>Facebook<small>Fotos, carta y publicaciones recientes</small></span></a>`);
    const ig = urlSegura(l.instagram);
    if (ig) contactos.push(`<a class="contacto" href="${esc(ig)}" target="_blank" rel="noopener">${icono('enlace')}<span>Instagram<small>${esc(ig.replace(/^https?:\/\/(www\.)?/, ''))}</small></span></a>`);
    const web = urlSegura(l.web);
    if (web) contactos.push(`<a class="contacto" href="${esc(web)}" target="_blank" rel="noopener">${icono('enlace')}<span>Sitio web<small>${esc(web.replace(/^https?:\/\/(www\.)?/, ''))}</small></span></a>`);
    if (l.direccion) contactos.push(`<div class="contacto">${icono('pin')}<span>${esc(l.direccion)}<small>Dirección publicada por el negocio</small></span><button type="button" class="boton-icono" data-accion="copiar" data-texto="${esc(l.direccion)}" aria-label="Copiar dirección">${icono('copiar')}</button></div>`);
    const enlaces = (estado.enlaces[l.id] || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const fuentes = (l.fuentes || []).map((f) => ({ overture: 'Facebook (Overture Maps)', osm: 'OpenStreetMap', usuario: 'Tú' }[f] || f)).join(', ');

    return `
      <div class="cabecera-panel">
        <button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button>
        <span class="tipo"><span class="punto" style="--c: var(${g.color})"></span>${esc(g.nombre)}</span>
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

      <h3>Platos</h3>
      ${confirmados.length || mios.length || probables.length ? `<div class="platos">
        ${confirmados.map((p) => `<span class="plato">${esc(capital(p))}</span>`).join('')}
        ${mios.map((p) => `<span class="plato mio">${esc(capital(p))}<button type="button" data-accion="quitar-plato" data-plato="${esc(p)}" aria-label="Quitar ${esc(p)}">×</button></span>`).join('')}
        ${probables.map((p) => `<span class="plato probable">${esc(capital(p))}?</span>`).join('')}
      </div>` : '<p class="nota">Todavía no sabemos qué platos tiene.</p>'}
      ${probables.length ? '<p class="nota">Con «?»: platos que suelen tener los locales de comidas rápidas, sin confirmar.</p>' : ''}
      <form class="fila-botones acciones" data-formulario="plato">
        <input class="campo-plato" id="nuevo-plato" list="lista-platos" placeholder="Agregar un plato que viste aquí" aria-label="Plato" autocomplete="off" style="flex:1 1 160px;min-height:40px;padding:0 12px;border:1px solid var(--borde);border-radius:12px;background:var(--superficie-2)">
        <button type="submit" class="boton pequeno suave">Agregar</button>
      </form>

      <h3>Contacto</h3>
      ${contactos.length ? `<div class="contactos">${contactos.join('')}</div>` : '<p class="nota">No hay datos de contacto en las fuentes.</p>'}

      <h3>Fotos y carta</h3>
      <p class="nota">${fb || ig ? 'Las fotos y la carta están en sus redes: ábrelas desde Contacto.' : 'No hay fotos ni carta en las fuentes. Si ves un video de este lugar, compártelo a Mappi.'}</p>

      <h3>Videos y enlaces</h3>
      ${enlaces.length ? `<ul class="enlaces">${enlaces.map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${icono('video')}<span>${esc(nombreRed(e.url))} · ${esc(e.url.replace(/^https?:\/\/(www\.)?/, ''))}</span><small>${fecha(e.fecha)}</small></a></li>`).join('')}</ul>
        <p class="nota">El video más reciente es del ${fecha(enlaces[0].fecha)}: una buena señal de que sigue activo.</p>`
        : '<p class="nota">Cuando veas un video de este lugar en TikTok o Instagram, tócalo en «Compartir» y elige Mappi. Quedará guardado aquí con la fecha.</p>'}

      <div class="pie-ficha">
        ${l.ubicacion_dudosa ? '<p><strong>Ubicación aproximada:</strong> varios negocios comparten este punto en Facebook. Confirma la dirección antes de ir.</p>' : ''}
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
        <div class="campo"><label for="visita-nota">Nota (opcional)</label><textarea id="visita-nota" maxlength="500" placeholder="Qué pediste, qué tal estuvo, cuánto costó…">${esc(v ? v.nota : '')}</textarea></div>
        <div class="fila-botones acciones">
          <button type="submit" class="boton primario ancho">Guardar visita</button>
          ${v ? '<button type="button" class="boton peligro ancho" data-accion="quitar-visita">Quitar visita</button>' : ''}
        </div>
      </form>`;
  }

  function htmlFiltros() {
    const opciones = ORDEN_GRUPOS.map((g) => {
      const activo = estado.ajustes.grupos.includes(g);
      const n = lugares.filter((l) => l.grupo === g && !l.propio && !estado.cerrados[l.id]).length;
      return `<button type="button" class="opcion" data-accion="grupo" data-grupo="${g}" aria-pressed="${activo}"><span class="punto" style="--c: var(${GRUPOS[g].color}); margin:0"></span>${GRUPOS[g].plural} <span class="cuenta">${n}</span></button>`;
    }).join('');
    const cancelados = lugares.filter((l) => posibleCierre(l) === 'registro').length;
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Filtros</span></div>
      <div class="campo"><span class="rotulo">Tipos de lugar</span><div class="opciones">${opciones}</div></div>
      <label class="interruptor"><input type="checkbox" id="filtro-cerrados" ${estado.ajustes.ocultarCerrados ? 'checked' : ''}>
        <span>Ocultar posibles cerrados<small>${plural(cancelados, 'lugar tiene', 'lugares tienen')} la matrícula mercantil cancelada. Si los muestras, salen en gris y puedes confirmar si siguen abiertos.</small></span></label>
      <div class="fila-botones acciones"><button type="button" class="boton primario ancho" data-accion="atras">Ver ${plural(resultados.length, 'lugar', 'lugares')}</button></div>`;
  }

  function htmlMenu() {
    const ocultos = Object.keys(estado.cerrados).length;
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Mappi ${VERSION_APP}</span></div>
      <h3>Lista de lugares</h3>
      <p class="texto-panel"><strong>${plural(datos.lugares.length, 'lugar', 'lugares')}</strong>, actualizada el ${fecha(datos.version)}${estado.propios.length ? `, más ${plural(estado.propios.length, 'agregado', 'agregados')} por ti` : ''}.
        Cada mes se revisa otra vez con Facebook, OpenStreetMap y el registro mercantil.</p>
      <div class="fila-botones acciones"><button type="button" class="boton suave ancho" data-accion="actualizar">Buscar actualización</button></div>

      <h3>Lugares que marcaste como cerrados</h3>
      <p class="texto-panel">${ocultos ? plural(ocultos, 'lugar oculto', 'lugares ocultos') : 'Ninguno.'}</p>
      ${ocultos ? '<div class="fila-botones acciones"><button type="button" class="boton suave ancho" data-accion="ver-ocultos">Ver y restaurar</button></div>' : ''}

      <h3>Respaldo</h3>
      <p class="texto-panel">Tus favoritos, visitas, platos, videos y lugares agregados solo se guardan en este teléfono.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton suave ancho" data-accion="exportar">Guardar respaldo</button>
        <button type="button" class="boton suave ancho" data-accion="importar">Restaurar respaldo</button>
      </div>

      <h3>Fuentes</h3>
      <p class="texto-panel">${(datos.fuentes || []).map(esc).join('<br>')}<br>Mapa: © OpenStreetMap, © CARTO.</p>`;
  }

  function htmlOcultos() {
    const lista = Object.entries(estado.cerrados).map(([id, f]) => ({ l: porId.get(id), f })).filter((x) => x.l);
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
      <p class="texto-panel">Lo guardo en su ficha con la fecha de hoy. Así sabrás que el lugar sigue activo.</p>
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
      const candidatos = lugares.filter((l) => !q || l._plano.includes(q))
        .map((l) => ({ l, d: distancia(base, l) }))
        .sort((a, b) => (q ? (b.l._plano.startsWith(q) - a.l._plano.startsWith(q)) : 0) || a.d - b.d)
        .slice(0, 25);
      $('#compartido-lista').innerHTML = candidatos.length
        ? candidatos.map(({ l, d }) => `<li><button type="button" class="item" data-accion="guardar-video" data-id="${esc(l.id)}">
            <span class="punto" style="--c: var(${GRUPOS[l.grupo].color})"></span>
            <span class="item-texto"><span class="item-nombre"><span>${esc(l.nombre)}</span></span><span class="item-meta">${esc(GRUPOS[l.grupo].nombre)} · ${distanciaTexto(d)}</span></span></button></li>`).join('')
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
    const opciones = ORDEN_GRUPOS.map((g) => `<button type="button" class="opcion" data-accion="tipo-nuevo" data-grupo="${g}" aria-pressed="${(v.grupo || 'restaurante') === g}">${GRUPOS[g].nombre}</button>`).join('');
    return `
      <div class="cabecera-panel"><button type="button" class="boton-icono" data-accion="atras" aria-label="Volver">${icono('atras')}</button><span class="tipo">Lugar nuevo</span></div>
      <form data-formulario="nuevo">
        <div class="campo"><label for="nuevo-nombre">Nombre</label><input id="nuevo-nombre" required maxlength="80" autocomplete="off" value="${esc(v.nombre || '')}"></div>
        <div class="campo"><span class="rotulo">Tipo</span><div class="opciones">${opciones}</div></div>
        <div class="campo"><label for="nuevo-platos">Platos</label><input id="nuevo-platos" maxlength="160" autocomplete="off" placeholder="Ejemplo: salchipapa, hamburguesa" value="${esc(v.platos || '')}"><small>Sepáralos con comas.</small></div>
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
      <p class="texto-panel">El respaldo tiene ${plural(Object.keys(e.favoritos).length, 'favorito', 'favoritos')}, ${plural(Object.keys(e.visitados).length, 'visita', 'visitas')} y ${plural(e.propios.length, 'lugar agregado', 'lugares agregados')}.
        Lo que tienes ahora en el teléfono se reemplaza.</p>
      <div class="fila-botones acciones">
        <button type="button" class="boton primario ancho" data-accion="confirmar-restaurar">Reemplazar</button>
        <button type="button" class="boton ancho" data-accion="atras">Cancelar</button>
      </div>`;
  }

  // ---------- acciones ----------
  function abrirFicha(id) {
    const l = porId.get(id);
    if (!l) return;
    const v = vistaActual();
    mostrar({ tipo: 'ficha', id }, v.tipo === 'ficha');
    requestAnimationFrame(() => centrarEn(l));
  }
  function alternarFavorito(l) {
    if (estado.favoritos[l.id]) delete estado.favoritos[l.id];
    else estado.favoritos[l.id] = hoyISO();
    guardar();
    aviso(estado.favoritos[l.id] ? 'Agregado a favoritos.' : 'Quitado de favoritos.');
    aplicar();
    render();
  }
  function normalizarPlato(texto) {
    const q = plano(texto);
    if (!q) return '';
    const exacto = Object.keys(SINONIMOS).find((p) => plano(p) === q || SINONIMOS[p].includes(q));
    return exacto || texto.trim().toLowerCase().slice(0, 40);
  }
  function guardarVideo(id, url) {
    const lista = estado.enlaces[id] || (estado.enlaces[id] = []);
    if (!lista.some((e) => e.url === url)) lista.push({ url, fecha: hoyISO() });
    guardar();
  }
  function exportar() {
    const nombre = `Mappi-respaldo-${hoyISO()}.json`;
    const json = JSON.stringify({ app: 'Mappi', formato: 1, fecha: new Date().toISOString(), estado }, null, 1);
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

  contenido.addEventListener('click', (evento) => {
    const item = evento.target.closest('.item[data-id]:not([data-accion])');
    if (item) {
      abrirFicha(item.dataset.id);
      return;
    }
    const boton = evento.target.closest('[data-accion]');
    if (!boton) return;
    const v = vistaActual();
    const l = v.id ? porId.get(v.id) : null;
    switch (boton.dataset.accion) {
      case 'atras': atras(); break;
      case 'abrir-lista': mostrar({ tipo: 'lista' }); break;
      case 'cerrar-lista': atras(); break;
      case 'vista':
        estado.ajustes.vista = boton.dataset.vista;
        guardar();
        aplicar();
        break;
      case 'filtros': mostrar({ tipo: 'filtros' }); break;
      case 'mas': {
        const desde = contenido.scrollTop;
        pagina += POR_PAGINA;
        render();
        contenido.scrollTop = desde;
        break;
      }
      case 'grupo': {
        const g = boton.dataset.grupo;
        const grupos = new Set(estado.ajustes.grupos);
        if (grupos.has(g)) grupos.delete(g); else grupos.add(g);
        if (!grupos.size) {
          aviso('Deja al menos un tipo de lugar.');
          break;
        }
        estado.ajustes.grupos = ORDEN_GRUPOS.filter((x) => grupos.has(x));
        guardar();
        aplicar();
        break;
      }
      case 'favorito': alternarFavorito(l); break;
      case 'visita': mostrar({ tipo: 'visita', id: l.id }); break;
      case 'quitar-visita':
        delete estado.visitados[l.id];
        guardar();
        atras();
        aplicar();
        render();
        aviso('Visita quitada.');
        break;
      case 'quitar-plato': {
        estado.platos[l.id] = (estado.platos[l.id] || []).filter((p) => p !== boton.dataset.plato);
        if (!estado.platos[l.id].length) delete estado.platos[l.id];
        guardar();
        aplicar();
        render();
        break;
      }
      case 'confirmar-abierto':
        estado.abiertos[l.id] = hoyISO();
        guardar();
        aplicar();
        render();
        aviso('Gracias. Queda marcado como abierto.');
        break;
      case 'cerrado':
        estado.cerrados[l.id] = hoyISO();
        delete estado.abiertos[l.id];
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
        for (const k of ['favoritos', 'visitados', 'platos', 'enlaces']) delete estado[k][l.id];
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
      case 'actualizar': buscarActualizacion(true); break;
      case 'ver-ocultos': mostrar({ tipo: 'ocultos' }); break;
      case 'restaurar-oculto':
        delete estado.cerrados[boton.dataset.id];
        guardar();
        aplicar();
        render();
        break;
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
        guardarVideo(destino.id, v.url);
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
      case 'tipo-nuevo':
        v.grupo = boton.dataset.grupo;
        v.nombre = $('#nuevo-nombre').value;
        v.platos = $('#nuevo-platos').value;
        v.telefono = $('#nuevo-telefono').value;
        render();
        break;
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
    const l = v.id ? porId.get(v.id) : null;
    if (formulario === 'plato') {
      const plato = normalizarPlato($('#nuevo-plato').value);
      if (!plato) return;
      const lista = estado.platos[l.id] || (estado.platos[l.id] = []);
      if (!lista.includes(plato) && !(l.platos || []).includes(plato)) lista.push(plato);
      guardar();
      aplicar();
      render();
      aviso(`Agregado: ${plato}.`);
    } else if (formulario === 'visita') {
      const dia = $('#visita-fecha').value || hoyISO();
      estado.visitados[l.id] = { fecha: dia, nota: $('#visita-nota').value.trim().slice(0, 500) };
      guardar();
      atras();
      aplicar();
      render();
      aviso('Visita guardada.');
    } else if (formulario === 'nuevo') {
      const nombre = $('#nuevo-nombre').value.trim();
      if (!nombre) return;
      const platos = [...new Set($('#nuevo-platos').value.split(',').map(normalizarPlato).filter(Boolean))];
      const propio = {
        id: `yo:${Date.now().toString(36)}`, nombre: nombre.slice(0, 80), lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6),
        grupo: v.grupo || 'restaurante', platos, telefono: $('#nuevo-telefono').value.trim().slice(0, 20), creado: hoyISO(),
      };
      estado.propios.push(propio);
      if (v.url) guardarVideo(propio.id, v.url);
      guardar();
      pila = [];
      reconstruir();
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
  function marcarChips() {
    const q = consultaActual();
    for (const chip of document.querySelectorAll('#chips-platos .chip')) {
      chip.setAttribute('aria-pressed', String(plano(chip.textContent) === q));
    }
  }
  $('#chips-platos').innerHTML = CHIPS.map(([nombre, plato]) => `<button type="button" class="chip" data-plato="${esc(plato)}" aria-pressed="false">${esc(nombre)}</button>`).join('');
  $('#chips-platos').addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    entrada.value = chip.getAttribute('aria-pressed') === 'true' ? '' : chip.textContent;
    // Primero el mapa con los lugares de ese plato; la lista queda a un toque.
    pila = [];
    aplicar({ encuadrar: !!entrada.value });
    render();
  });
  const lista = document.createElement('datalist');
  lista.id = 'lista-platos';
  lista.innerHTML = Object.keys(SINONIMOS).map((p) => `<option value="${esc(p)}"></option>`).join('');
  document.body.appendChild(lista);

  let temporizadorBusqueda;
  entrada.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(() => {
      if (entrada.value && vistaActual().tipo !== 'lista') pila = [{ tipo: 'lista' }];
      aplicar();
      render();
    }, 150);
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
  const observarHoja = () => document.documentElement.style.setProperty('--alto-hoja', `${Math.round(altoHoja())}px`);
  if (window.ResizeObserver) new ResizeObserver(observarHoja).observe(hoja);
  window.addEventListener('resize', observarHoja);

  // ---------- puente con Android y pruebas ----------
  function recibirCompartido(texto) {
    if (!listo) {
      pendientesCompartidos.push(texto);
      return;
    }
    const url = primerEnlace(texto);
    pila = [{ tipo: 'compartido', url, q: '' }];
    render();
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
    primerResultado: () => (resultados[0] ? resultados[0].l.id : null),
    abrir: abrirFicha,
    vista: () => vistaActual().tipo,
    abierto: () => vistaActual().id || null,
    estado: () => JSON.parse(JSON.stringify(estado)),
    versionDatos: () => datos.version,
    hayMapa: () => !!mapa,
    zoom: () => (mapa ? mapa.getZoom() : null),
    zonaLibre: () => ({ arriba: altoBarra(), abajo: innerHeight - altoHoja() }),
    mapaListo: () => !!(mapa && capasListas && mapa.loaded() && mapa.areTilesLoaded()),
    puntoEnPantalla(id) {
      const l = porId.get(id);
      if (!mapa || !l) return null;
      const p = mapa.project([l.lon, l.lat]);
      return { x: p.x, y: p.y };
    },
    respaldoGuardado() { if (window.MappiAndroid) aviso('Respaldo guardado.'); },
  };

  iniciarMapa();
  cargarDatos().then(() => {
    reconstruir();
    render();
    observarHoja();
    listo = true;
    while (pendientesCompartidos.length) recibirCompartido(pendientesCompartidos.shift());
    ubicarme(false);
    buscarActualizacion(false);
  }).catch(() => {
    contenido.innerHTML = '<div class="vacio"><strong>No se pudo cargar la lista de lugares</strong>Cierra y vuelve a abrir Mappi.</div>';
  });
})();
