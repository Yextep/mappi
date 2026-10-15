// Recorre la interfaz de Mappi en Chromium con tamaño de celular y guarda capturas en docs/.
// Uso: node scripts/prueba_navegador.cjs CARPETA_DATOS
//   CARPETA_DATOS es la salida de armar_datos.py (o la rama «datos»): indice.json, limites.json y m/*.json.gz.
// Requiere el paquete playwright y su Chromium.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const WEB = path.join(RAIZ, 'app/src/main/assets/web');
const INCLUIDOS = path.join(RAIZ, 'datos');
const DATOS = path.resolve(process.argv[2] || process.env.MAPPI_DATOS || path.join(RAIZ, 'salida'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };
const BARRANCA = '68081';
const MEDELLIN = '05001';

// Sirve los archivos con las mismas rutas que WebViewAssetLoader en Android.
function servidor() {
  return http.createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = null;
    if (/^\/assets\/[a-z]+\.json$/.test(ruta)) archivo = path.join(INCLUIDOS, path.basename(ruta));
    else if (ruta.startsWith('/assets/web/')) archivo = path.join(WEB, ruta.slice('/assets/web/'.length));
    if (!archivo || !archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
}

function comprobar(condicion, mensaje) {
  if (!condicion) throw new Error(`Falló: ${mensaje}`);
  console.log(`ok - ${mensaje}`);
}

async function abrir(navegador, url, opciones = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-CO', timezoneId: 'America/Bogota', colorScheme: opciones.oscuro ? 'dark' : 'light',
    geolocation: { latitude: 7.0653, longitude: -73.8547 },
    permissions: opciones.sinUbicacion ? [] : ['geolocation'],
  });
  const errores = [];
  const pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => errores.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  // GitHub no participa en la prueba: los datos salen de la carpeta local.
  await pagina.route('https://raw.githubusercontent.com/**', (ruta) => ruta.fulfill({ status: 404, body: '' }));
  await pagina.route('https://raw.githubusercontent.com/Yextep/mappi/datos/**', (ruta) => {
    const archivo = path.join(DATOS, new URL(ruta.request().url()).pathname.split('/datos/')[1]);
    if (!archivo.startsWith(DATOS) || !fs.existsSync(archivo)) return ruta.fulfill({ status: 404, body: '' });
    return ruta.fulfill({ status: 200, body: fs.readFileSync(archivo), headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: archivo.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  });
  if (opciones.preparar) await opciones.preparar(pagina);
  await pagina.goto(url);
  await pagina.waitForFunction(() => window.Mappi && window.Mappi.listo, null, { timeout: 30000 });
  return { contexto, pagina, errores };
}

async function esperarMunicipio(pagina, codigo) {
  await pagina.waitForFunction((c) => Mappi.municipio() === c && !Mappi.cargando(), codigo, { timeout: 60000 });
}

async function esperarMapa(pagina) {
  await pagina.waitForTimeout(700);
  await pagina.waitForFunction(() => Mappi.mapaListo(), null, { timeout: 20000 })
    .catch(() => console.log('aviso - el mapa base no terminó de cargar (¿sin internet?)'));
  await pagina.waitForTimeout(300);
}

async function main() {
  comprobar(fs.existsSync(path.join(DATOS, 'm', `${BARRANCA}.json.gz`)), `hay datos de prueba en ${DATOS}`);
  const http_ = servidor();
  await new Promise((r) => http_.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${http_.address().port}/assets/web/index.html`;
  const docs = path.join(RAIZ, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  // El Chromium completo (no el headless shell) es el que dibuja MapLibre de forma fiable sin GPU.
  const navegador = await chromium.launch({ channel: 'chromium' });
  try {
    const { contexto, pagina, errores } = await abrir(navegador, url);
    await esperarMunicipio(pagina, BARRANCA);
    comprobar(true, 'con la ubicación abre Barrancabermeja sin preguntar');
    const total = await pagina.evaluate(() => Mappi.totalLugares());
    comprobar(total >= 2500, `carga los lugares de Barrancabermeja (${total})`);
    const visibles = await pagina.evaluate(() => Mappi.resultados());
    comprobar(visibles > 2000 && visibles <= total, `sin posibles cerrados quedan ${visibles} visibles`);
    comprobar(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no hay desplazamiento horizontal');
    comprobar(await pagina.isVisible('.municipio-actual:has-text("Barrancabermeja")'), 'la hoja dice en qué municipio estás');
    await pagina.waitForFunction(() => Mappi.hayMapa(), null, { timeout: 20000 }).catch(() => {});
    comprobar(await pagina.evaluate(() => Mappi.hayMapa()), 'MapLibre crea el mapa');
    await esperarMapa(pagina);
    const puntos = await pagina.evaluate(() => Mappi.puntosEnMapa());
    console.log(`info - puntos dibujados en pantalla: ${puntos}`);
    await pagina.screenshot({ path: path.join(docs, 'mappi-inicio.png') });

    await pagina.click('#chips .chip[data-categoria="drogueria"]');
    const droguerias = await pagina.evaluate(() => Mappi.resultados());
    comprobar(droguerias >= 15 && droguerias < 200, `la categoría Droguerías muestra ${droguerias} lugares`);
    comprobar(await pagina.isHidden('#chips-platos'), 'los platos solo aparecen con una categoría de comida');
    await pagina.click('#chips .chip[data-categoria="drogueria"]');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) === visibles, 'tocar otra vez la categoría vuelve a mostrar todo');

    await pagina.click('#chips .chip[data-categoria="rapida"]');
    comprobar(await pagina.isVisible('#chips-platos'), 'con Comida rápida aparecen los platos');
    await pagina.click('#chips-platos .chip[data-plato="pizza"]');
    const pizzas = await pagina.evaluate(() => Mappi.resultados());
    comprobar(pizzas >= 10 && (await pagina.evaluate(() => Mappi.vista())) === 'resumen', `el plato Pizza muestra ${pizzas} lugares en el mapa`);
    await esperarMapa(pagina);
    const zoomPizza = await pagina.evaluate(() => Mappi.zoom());
    comprobar(zoomPizza >= 12, `el mapa encuadra las pizzerías de la ciudad (zoom ${zoomPizza.toFixed(1)})`);
    await pagina.screenshot({ path: path.join(docs, 'mappi-pizza-mapa.png') });
    const objetivo = await pagina.evaluate(() => Mappi.primerResultado());
    const punto = await pagina.evaluate((x) => Mappi.puntoEnPantalla(x), objetivo);
    if (puntos > 0) {
      await pagina.mouse.click(punto.x + 6, punto.y + 6);
      await pagina.waitForTimeout(300);
      comprobar((await pagina.evaluate(() => Mappi.vista())) === 'ficha', 'tocar un punto del mapa (con 6 px de error) abre su ficha');
      await pagina.evaluate(() => Mappi.atras());
    } else {
      console.log('aviso - este navegador no dibuja WebGL: no se prueba el toque sobre el mapa');
    }
    await pagina.click('.resumen-texto');
    comprobar((await pagina.evaluate(() => Mappi.vista())) === 'lista', 'tocar el resumen abre la lista');
    comprobar(await pagina.isVisible('.item-meta:has-text(" m")') || await pagina.isVisible('.item-meta:has-text(" km")'), 'la lista muestra distancias con la ubicación');
    await pagina.screenshot({ path: path.join(docs, 'mappi-pizza.png') });
    await pagina.click('#chips .chip[data-categoria="rapida"]');

    await pagina.fill('#q', 'salchipapa');
    await pagina.waitForFunction(() => /salchipapa/.test(document.querySelector('.resumen').textContent));
    const salchipapa = await pagina.evaluate(() => Mappi.resultados());
    comprobar(salchipapa > 20, `salchipapa encuentra ${salchipapa} lugares (confirmados y probables)`);
    comprobar(await pagina.isVisible('em:has-text("suele tener salchipapa")'), 'los platos probables se marcan como «suele tener»');
    await pagina.fill('#q', 'ferreteria');
    await pagina.waitForFunction(() => /ferreteria/.test(document.querySelector('.resumen').textContent));
    comprobar((await pagina.evaluate(() => Mappi.resultados())) >= 30, 'buscar «ferreteria» encuentra la categoría completa');

    await pagina.fill('#q', 'arepa');
    await pagina.waitForFunction(() => /arepa/.test(document.querySelector('.resumen').textContent));
    await pagina.click('.lista .item >> nth=0');
    await pagina.waitForSelector('h2');
    const nombre = await pagina.textContent('h2');
    comprobar((await pagina.evaluate(() => Mappi.vista())) === 'ficha', `abre la ficha de ${nombre}`);
    comprobar(await pagina.isVisible('a:has-text("Cómo llegar")[href^="https://www.google.com/maps/dir/"]'), 'la ficha enlaza la ruta en Google Maps');
    comprobar(await pagina.isVisible('a:has-text("Ir con Waze")[href^="https://waze.com/ul"]'), 'la ficha enlaza la ruta en Waze');
    await pagina.waitForTimeout(700);
    const visible = await pagina.evaluate(() => {
      const zona = Mappi.zonaLibre();
      const p = Mappi.puntoEnPantalla(Mappi.abierto());
      return p && p.y > zona.arriba && p.y < zona.abajo;
    });
    comprobar(visible, 'con la ficha abierta, el lugar queda visible en el mapa entre la barra y la hoja');
    await esperarMapa(pagina);
    await pagina.screenshot({ path: path.join(docs, 'mappi-ficha.png') });

    await pagina.click('button[data-accion="favorito"]');
    await pagina.click('button.estrella[data-n="4"]');
    await pagina.fill('#comentario', 'La de huevo es la mejor');
    await pagina.click('button:has-text("Guardar comentario")');
    await pagina.waitForSelector('.estrellas-texto:has-text("Bueno")');
    await pagina.screenshot({ path: path.join(docs, 'mappi-calificacion.png') });
    await pagina.click('button[data-accion="visita"]');
    await pagina.fill('#visita-nota', 'Arepa de huevo muy buena');
    await pagina.click('button:has-text("Guardar visita")');
    await pagina.waitForSelector('.nota:has-text("Arepa de huevo")');
    const id = await pagina.evaluate(() => Object.keys(Mappi.estado().favoritos)[0]);
    const estadoGuardado = await pagina.evaluate(() => Mappi.estado());
    comprobar(!!id && !!estadoGuardado.visitados[id], 'guarda favorito y visita con nota');
    comprobar(estadoGuardado.calificaciones[id] && estadoGuardado.calificaciones[id].estrellas === 4
      && estadoGuardado.calificaciones[id].nota === 'La de huevo es la mejor', 'guarda la calificación de 4 estrellas con su comentario');

    await pagina.reload();
    await pagina.waitForFunction(() => window.Mappi && window.Mappi.listo);
    await esperarMunicipio(pagina, BARRANCA);
    comprobar(await pagina.evaluate((x) => !!Mappi.estado().favoritos[x] && !!Mappi.estado().calificaciones[x], id), 'favorito y calificación siguen después de recargar');
    await pagina.click('button[data-vista="favoritos"]');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) === 1, 'la vista Favoritos muestra 1 lugar');
    await pagina.click('button[data-vista="todos"]');
    const otroLugar = await pagina.evaluate(() => {
      Mappi.buscar('drogueria');
      const otro = Mappi.primerResultado();
      Mappi.calificar(otro, 2, 'Siempre cerrado');
      Mappi.buscar('');
      return otro;
    });
    await pagina.click('button[data-vista="calificados"]');
    await pagina.click('.resumen-texto');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) === 2, 'la vista Calificados muestra 2 lugares');
    comprobar((await pagina.evaluate(() => Mappi.primerResultado())) === id, 'los mejores calificados van primero');
    await pagina.click('button[data-orden="peores"]');
    comprobar((await pagina.evaluate(() => Mappi.primerResultado())) === otroLugar, '«Peores primero» invierte el orden');
    await pagina.screenshot({ path: path.join(docs, 'mappi-calificados.png') });
    await pagina.click('button[data-vista="pendientes"]');
    comprobar(!(await pagina.evaluate((x) => [...document.querySelectorAll('.item')].some((b) => b.dataset.id === x), id)), 'la vista No he ido excluye el lugar visitado');
    await pagina.click('button[data-vista="todos"]');

    await pagina.evaluate(() => Mappi.recibirCompartido('Miren este lugar 😋 https://vm.tiktok.com/ZMh3xYz12/ #barranca'));
    await pagina.waitForSelector('#compartido-q');
    comprobar(await pagina.isVisible('.tipo:has-text("Video de TikTok")'), 'recibe un video compartido de TikTok');
    await pagina.fill('#compartido-q', 'pizza');
    await pagina.click('#compartido-lista .item >> nth=0');
    await pagina.waitForSelector('.enlaces a[href="https://vm.tiktok.com/ZMh3xYz12/"]');
    comprobar(true, 'el video queda guardado en la ficha del lugar elegido');
    await pagina.screenshot({ path: path.join(docs, 'mappi-video.png') });

    await pagina.evaluate(() => Mappi.buscar(''));
    await pagina.click('#agregar');
    await pagina.waitForSelector('button:has-text("Usar este punto")');
    comprobar(await pagina.isVisible('#mira'), 'el modo agregar muestra el pin en el centro');
    await pagina.click('button:has-text("Usar este punto")');
    await pagina.fill('#nuevo-nombre', 'Salchipapas Don Chucho');
    await pagina.selectOption('#nuevo-categoria', 'rapida');
    await pagina.fill('#nuevo-platos', 'salchipapas, perro');
    await pagina.click('button:has-text("Guardar lugar")');
    await pagina.waitForSelector('h2:has-text("Salchipapas Don Chucho")');
    const propio = await pagina.evaluate(() => Mappi.estado().propios[0]);
    comprobar(propio && propio.platos.join() === 'salchipapa,perro caliente' && propio.m === BARRANCA, 'agrega un lugar propio con sus platos normalizados y su municipio');
    comprobar((await pagina.evaluate(() => Mappi.buscar('salchipapa') && Mappi.primerResultado())) !== null
      && (await pagina.evaluate(() => [...document.querySelectorAll('.item-nombre')].some((e) => e.textContent.includes('Don Chucho')))), 'el lugar propio aparece al buscar su plato');

    await pagina.evaluate(() => Mappi.buscar(''));
    const todos = await pagina.evaluate(() => Mappi.resultados());
    await pagina.click('button[data-accion="filtros"]');
    await pagina.click('button[data-accion="ocultar-categoria"][data-categoria="educacion"]');
    const sinColegios = await pagina.evaluate(() => Mappi.resultados());
    comprobar(sinColegios < todos, `ocultar Colegios baja de ${todos} a ${sinColegios}`);
    await pagina.uncheck('#filtro-cerrados');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) > sinColegios, 'mostrar posibles cerrados agrega lugares');
    await pagina.screenshot({ path: path.join(docs, 'mappi-filtros.png') });
    await pagina.check('#filtro-cerrados');
    await pagina.click('button[data-accion="todas-categorias"]');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) === todos, '«Mostrar todo» deshace los filtros de categoría');
    comprobar(await pagina.evaluate(() => Mappi.atras()), 'el botón atrás de Android cierra los filtros');

    const otro = await pagina.evaluate(() => Mappi.primerResultado());
    await pagina.evaluate((x) => Mappi.abrir(x), otro);
    await pagina.click('button:has-text("Ya cerró: ocultarlo")');
    comprobar(await pagina.evaluate((x) => !!Mappi.estado().cerrados[x] && Mappi.primerResultado() !== x, otro), 'marcar «Ya cerró» oculta el lugar');
    await pagina.click('#abrir-menu');
    await pagina.click('button:has-text("Ver y restaurar")');
    await pagina.click('button[data-accion="restaurar-oculto"]');
    comprobar(await pagina.evaluate((x) => !Mappi.estado().cerrados[x], otro), 'el lugar oculto se puede restaurar');
    while (await pagina.evaluate(() => Mappi.atras()));
    comprobar((await pagina.evaluate(() => Mappi.vista())) === 'resumen', 'atrás vuelve hasta el mapa');

    // Cambiar de municipio: Medellín es de los más grandes.
    await pagina.click('.municipio-actual');
    await pagina.fill('#municipio-q', 'medellin');
    const inicioCarga = Date.now();
    await pagina.click('#municipio-lista .item >> nth=0');
    await esperarMunicipio(pagina, MEDELLIN);
    const segundos = (Date.now() - inicioCarga) / 1000;
    const enMedellin = await pagina.evaluate(() => Mappi.totalLugares());
    comprobar(enMedellin > 40000, `elegir Medellín carga ${enMedellin} lugares en ${segundos.toFixed(1)} s`);
    const tiempoBusqueda = await pagina.evaluate(() => {
      const t = performance.now();
      Mappi.buscar('drogueria');
      Mappi.primerResultado();
      return performance.now() - t;
    });
    comprobar(tiempoBusqueda < 1500, `buscar y ordenar en Medellín tarda ${Math.round(tiempoBusqueda)} ms`);
    await pagina.evaluate(() => Mappi.buscar(''));
    await esperarMapa(pagina);
    await pagina.screenshot({ path: path.join(docs, 'mappi-medellin.png') });
    await pagina.click('button[data-vista="favoritos"]');
    await pagina.click('.resumen-texto');
    comprobar(await pagina.isVisible('.item-meta:has-text("en Barrancabermeja")'), 'los favoritos de otro municipio siguen en la lista');
    await pagina.click('.lista .item >> nth=0');
    await esperarMunicipio(pagina, BARRANCA);
    await pagina.waitForFunction((x) => Mappi.vista() === 'ficha' && Mappi.abierto() === x, id);
    comprobar(true, 'tocar un favorito de otro municipio abre ese municipio y su ficha');
    await pagina.evaluate(() => { while (Mappi.atras()); });
    await pagina.click('button[data-vista="todos"]');

    comprobar(errores.length === 0, `sin errores de JavaScript${errores.length ? `: ${errores.join(' | ')}` : ''}`);
    await contexto.close();

    // Lo guardado con la versión 1 (solo Barrancabermeja) pasa al formato de la 2.
    const v1 = await abrir(navegador, url, {
      sinUbicacion: true,
      preparar: (p) => p.addInitScript(() => {
        if (localStorage.getItem('mappi.estado.v1')) return;
        localStorage.setItem('mappi.estado.v1', JSON.stringify({
          favoritos: { 'ov:52ec41be-2a57-4f74-b37b-9d90a273d8aa': '2026-10-01' }, visitados: {}, cerrados: {}, abiertos: {},
          platos: {}, enlaces: {}, propios: [], ajustes: { grupos: ['restaurante', 'rapida', 'cafe'], ocultarCerrados: true, vista: 'todos' },
        }));
      }),
    });
    await esperarMunicipio(v1.pagina, BARRANCA);
    const migrado = await v1.pagina.evaluate(() => Mappi.estado());
    comprobar(migrado.favoritos.o52ec41be2a57 && migrado.guardados.o52ec41be2a57 && migrado.guardados.o52ec41be2a57.n,
      'los favoritos de la versión 1 pasan al formato nuevo y se abre Barrancabermeja');
    await v1.contexto.close();

    // Sin ubicación ni municipio guardado, se pide elegirlo.
    const nuevo = await abrir(navegador, url, { sinUbicacion: true });
    await nuevo.pagina.waitForSelector('#municipio-q', { timeout: 20000 });
    comprobar(true, 'sin permiso de ubicación pregunta el municipio');
    await nuevo.pagina.screenshot({ path: path.join(docs, 'mappi-municipios.png') });
    await nuevo.contexto.close();

    const oscuro = await abrir(navegador, url, { oscuro: true });
    await esperarMunicipio(oscuro.pagina, BARRANCA);
    await oscuro.pagina.evaluate(() => Mappi.categoria('restaurante'));
    await esperarMapa(oscuro.pagina);
    await oscuro.pagina.screenshot({ path: path.join(docs, 'mappi-oscuro.png') });
    comprobar(oscuro.errores.length === 0, 'el tema oscuro carga sin errores');
    await oscuro.contexto.close();

    // Aviso de versión nueva: se simula el APK 2.0 y un version.json publicado con la 2.1.
    const manifiesto = {
      version: '2.1', codigo: 4, apk: 'https://github.com/Yextep/mappi/releases/download/v2.1/Mappi.apk',
      notas: 'Fotos de la carta en la ficha.', codigo_minimo: 0,
    };
    const conVersion = (m) => async (pagina) => {
      await pagina.addInitScript(() => { window.MappiAndroid = { version: () => '{"nombre":"2.0","codigo":3}' }; });
      await pagina.route('https://raw.githubusercontent.com/Yextep/mappi/main/version.json',
        (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) }));
    };
    const nueva = await abrir(navegador, url, { preparar: conVersion(manifiesto) });
    await esperarMunicipio(nueva.pagina, BARRANCA);
    await nueva.pagina.waitForFunction(() => Mappi.versionRevisada());
    await nueva.pagina.waitForFunction(() => Mappi.vista() === 'version', null, { timeout: 5000 }).catch(() => {});
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'version'
      && await nueva.pagina.isVisible(`a:has-text("Descargar")[href="${manifiesto.apk}"]`), 'al abrir la app avisa de Mappi 2.1 con su enlace de descarga');
    comprobar(await nueva.pagina.isVisible('.notas-version:has-text("Fotos de la carta en la ficha.")'), 'el aviso muestra las novedades');
    await nueva.pagina.screenshot({ path: path.join(docs, 'mappi-actualizacion.png') });
    await nueva.pagina.click('button:has-text("Más tarde")');
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'resumen', '«Más tarde» cierra el aviso');
    await nueva.pagina.reload();
    await nueva.pagina.waitForFunction(() => window.Mappi && Mappi.listo && Mappi.versionRevisada());
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'resumen' && await nueva.pagina.isVisible('#abrir-menu.con-novedad'),
      'después de «Más tarde» no insiste al abrir, pero el botón del menú lleva un punto');
    await nueva.pagina.click('#abrir-menu');
    comprobar(await nueva.pagina.isVisible('.novedad:has-text("Mappi 2.1 está disponible")'), 'el menú ofrece la versión nueva');
    comprobar(!(await nueva.pagina.evaluate((m) => Mappi.probarManifiesto({ ...m, apk: 'https://example.com/Mappi.apk' }), manifiesto))
      && (await nueva.pagina.evaluate(() => Mappi.nuevaVersion().apk)) === manifiesto.apk, 'ignora un version.json que descarga de otro sitio');
    comprobar(nueva.errores.length === 0, 'el aviso de versión no produce errores');
    await nueva.contexto.close();

    const obligatoria = await abrir(navegador, url, { preparar: conVersion({ ...manifiesto, codigo_minimo: 4 }) });
    await obligatoria.pagina.waitForFunction(() => Mappi.versionRevisada() && Mappi.vista() === 'version', null, { timeout: 30000 });
    comprobar(!(await obligatoria.pagina.isVisible('button:has-text("Más tarde")')), 'una actualización obligatoria no se puede posponer');
    comprobar(!(await obligatoria.pagina.evaluate(() => Mappi.atras()))
      && (await obligatoria.pagina.evaluate(() => Mappi.buscar('pizza') >= 0 && Mappi.vista())) === 'version', 'ni atrás ni la búsqueda salen del aviso obligatorio');
    await obligatoria.pagina.screenshot({ path: path.join(docs, 'mappi-obligatoria.png') });
    await obligatoria.contexto.close();
  } finally {
    await navegador.close();
    http_.close();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
