// Recorre la interfaz de Mappi en Chromium con tamaño de celular y guarda capturas en docs/.
// Uso: node scripts/prueba_navegador.cjs   (requiere el paquete playwright y su Chromium)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const WEB = path.join(RAIZ, 'app/src/main/assets/web');
const DATOS = path.join(RAIZ, 'datos/lugares.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' };

// Sirve los archivos con las mismas rutas que WebViewAssetLoader en Android.
function servidor() {
  return http.createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = null;
    if (ruta === '/assets/lugares.json') archivo = DATOS;
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
    geolocation: { latitude: 7.0653, longitude: -73.8547 }, permissions: ['geolocation'],
  });
  const errores = [];
  const pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => errores.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text()); });
  // La lista publicada en GitHub no participa en la prueba: se usa la incluida en la app.
  await pagina.route('https://raw.githubusercontent.com/**', (ruta) => ruta.fulfill({ status: 404, body: '' }));
  if (opciones.preparar) await opciones.preparar(pagina);
  await pagina.goto(url);
  await pagina.waitForFunction(() => window.Mappi && window.Mappi.listo, null, { timeout: 15000 });
  return { contexto, pagina, errores };
}

async function esperarMapa(pagina) {
  await pagina.waitForTimeout(700);
  await pagina.waitForFunction(() => Mappi.mapaListo(), null, { timeout: 20000 })
    .catch(() => console.log('aviso - el mapa base no terminó de cargar (¿sin internet?)'));
  await pagina.waitForTimeout(300);
}

async function main() {
  const http_ = servidor();
  await new Promise((r) => http_.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${http_.address().port}/assets/web/index.html`;
  const docs = path.join(RAIZ, 'docs');
  // El Chromium completo (no el headless shell) es el que dibuja MapLibre de forma fiable sin GPU.
  const navegador = await chromium.launch({ channel: 'chromium' });
  try {
    const { contexto, pagina, errores } = await abrir(navegador, url);
    const total = await pagina.evaluate(() => Mappi.totalLugares());
    comprobar(total >= 600, `carga la lista incluida (${total} lugares)`);
    const visibles = await pagina.evaluate(() => Mappi.resultados());
    comprobar(visibles > 300 && visibles < total, `sin bares ni posibles cerrados quedan ${visibles} visibles`);
    comprobar(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no hay desplazamiento horizontal');
    await pagina.waitForFunction(() => Mappi.hayMapa(), null, { timeout: 20000 }).catch(() => {});
    comprobar(await pagina.evaluate(() => Mappi.hayMapa()), 'MapLibre crea el mapa');
    await esperarMapa(pagina);
    await pagina.screenshot({ path: path.join(docs, 'mappi-inicio.png') });

    await pagina.click('#chips-platos .chip[data-plato="pizza"]');
    const pizzas = await pagina.evaluate(() => Mappi.resultados());
    comprobar(pizzas >= 15 && (await pagina.evaluate(() => Mappi.vista())) === 'resumen', `el plato Pizza muestra ${pizzas} lugares en el mapa`);
    await esperarMapa(pagina);
    const zoomPizza = await pagina.evaluate(() => Mappi.zoom());
    comprobar(zoomPizza >= 12, `el mapa encuadra las pizzerías de la ciudad, no las rurales a 25 km (zoom ${zoomPizza.toFixed(1)})`);
    await pagina.screenshot({ path: path.join(docs, 'mappi-pizza-mapa.png') });
    const objetivo = await pagina.evaluate(() => Mappi.primerResultado());
    const punto = await pagina.evaluate((x) => Mappi.puntoEnPantalla(x), objetivo);
    await pagina.mouse.click(punto.x + 6, punto.y + 6);
    await pagina.waitForTimeout(300);
    comprobar((await pagina.evaluate(() => Mappi.vista())) === 'ficha', 'tocar un punto del mapa (con 6 px de error) abre su ficha');
    await pagina.evaluate(() => Mappi.atras());
    await pagina.click('.resumen-texto');
    comprobar((await pagina.evaluate(() => Mappi.vista())) === 'lista', 'tocar el resumen abre la lista');
    comprobar(await pagina.isVisible('.item-meta:has-text(" m")') || await pagina.isVisible('.item-meta:has-text(" km")'), 'la lista muestra distancias con la ubicación');
    await pagina.screenshot({ path: path.join(docs, 'mappi-pizza.png') });

    await pagina.fill('#q', 'salchipapa');
    await pagina.waitForFunction(() => document.querySelector('.resumen-texto strong') && /salchipapa/.test(document.querySelector('.resumen').textContent));
    const salchipapa = await pagina.evaluate(() => Mappi.resultados());
    comprobar(salchipapa > 20, `salchipapa encuentra ${salchipapa} lugares (confirmados y probables)`);
    comprobar(await pagina.isVisible('em:has-text("suele tener salchipapa")'), 'los platos probables se marcan como «suele tener»');

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
    await pagina.click('button[data-accion="visita"]');
    await pagina.fill('#visita-nota', 'Arepa de huevo muy buena');
    await pagina.click('button:has-text("Guardar visita")');
    await pagina.waitForSelector('.nota:has-text("Arepa de huevo")');
    const id = await pagina.evaluate(() => Object.keys(Mappi.estado().favoritos)[0]);
    comprobar(!!id && (await pagina.evaluate((x) => !!Mappi.estado().visitados[x], id)), 'guarda favorito y visita con nota');

    await pagina.reload();
    await pagina.waitForFunction(() => window.Mappi && window.Mappi.listo);
    comprobar(await pagina.evaluate((x) => !!Mappi.estado().favoritos[x] && !!Mappi.estado().visitados[x], id), 'favorito y visita siguen después de recargar');
    await pagina.click('button[data-vista="favoritos"]');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) === 1, 'la vista Favoritos muestra 1 lugar');
    await pagina.click('button[data-vista="pendientes"]');
    comprobar(!(await pagina.evaluate((x) => Mappi.buscar('') >= 0 && [...document.querySelectorAll('.item')].some((b) => b.dataset.id === x), id)), 'la vista No he ido excluye el lugar visitado');
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
    await pagina.fill('#nuevo-platos', 'salchipapas, perro');
    await pagina.click('button:has-text("Guardar lugar")');
    await pagina.waitForSelector('h2:has-text("Salchipapas Don Chucho")');
    const propio = await pagina.evaluate(() => Mappi.estado().propios[0]);
    comprobar(propio && propio.platos.join() === 'salchipapa,perro caliente', 'agrega un lugar propio con sus platos normalizados');
    comprobar((await pagina.evaluate(() => Mappi.buscar('salchipapa') && Mappi.primerResultado())) !== null
      && (await pagina.evaluate(() => [...document.querySelectorAll('.item-nombre')].some((e) => e.textContent.includes('Don Chucho')))), 'el lugar propio aparece al buscar su plato');

    await pagina.evaluate(() => Mappi.buscar(''));
    const sinBares = await pagina.evaluate(() => Mappi.resultados());
    await pagina.click('button[data-accion="filtros"]');
    await pagina.click('button[data-grupo="bar"]');
    const conBares = await pagina.evaluate(() => Mappi.resultados());
    comprobar(conBares > sinBares, `activar bares sube de ${sinBares} a ${conBares}`);
    await pagina.uncheck('#filtro-cerrados');
    comprobar((await pagina.evaluate(() => Mappi.resultados())) > conBares, 'mostrar posibles cerrados agrega lugares');
    await pagina.screenshot({ path: path.join(docs, 'mappi-filtros.png') });
    await pagina.check('#filtro-cerrados');
    await pagina.click('button[data-grupo="bar"]');
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

    comprobar(errores.length === 0, `sin errores de JavaScript${errores.length ? `: ${errores.join(' | ')}` : ''}`);
    await contexto.close();

    const oscuro = await abrir(navegador, url, { oscuro: true });
    await oscuro.pagina.evaluate(() => Mappi.buscar('hamburguesa'));
    await esperarMapa(oscuro.pagina);
    await oscuro.pagina.screenshot({ path: path.join(docs, 'mappi-oscuro.png') });
    comprobar(oscuro.errores.length === 0, 'el tema oscuro carga sin errores');
    await oscuro.contexto.close();

    // Aviso de versión nueva: se simula el APK 1.1 y un version.json publicado con la 1.2.
    const manifiesto = {
      version: '1.2', codigo: 3, apk: 'https://github.com/Yextep/mappi/releases/download/v1.2/Mappi.apk',
      notas: 'Fotos de la carta en la ficha.', codigo_minimo: 0,
    };
    const conVersion = (m) => async (pagina) => {
      await pagina.addInitScript(() => { window.MappiAndroid = { version: () => '{"nombre":"1.1","codigo":2}' }; });
      await pagina.route('https://raw.githubusercontent.com/Yextep/mappi/main/version.json',
        (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m) }));
    };
    const nueva = await abrir(navegador, url, { preparar: conVersion(manifiesto) });
    await nueva.pagina.waitForFunction(() => Mappi.versionRevisada());
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'version'
      && await nueva.pagina.isVisible(`a:has-text("Descargar")[href="${manifiesto.apk}"]`), 'al abrir la app avisa de Mappi 1.2 con su enlace de descarga');
    comprobar(await nueva.pagina.isVisible('.notas-version:has-text("Fotos de la carta en la ficha.")'), 'el aviso muestra las novedades');
    await nueva.pagina.screenshot({ path: path.join(docs, 'mappi-actualizacion.png') });
    await nueva.pagina.click('button:has-text("Más tarde")');
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'resumen', '«Más tarde» cierra el aviso');
    await nueva.pagina.reload();
    await nueva.pagina.waitForFunction(() => window.Mappi && Mappi.listo && Mappi.versionRevisada());
    comprobar((await nueva.pagina.evaluate(() => Mappi.vista())) === 'resumen' && await nueva.pagina.isVisible('#abrir-menu.con-novedad'),
      'después de «Más tarde» no insiste al abrir, pero el botón del menú lleva un punto');
    await nueva.pagina.click('#abrir-menu');
    comprobar(await nueva.pagina.isVisible('.novedad:has-text("Mappi 1.2 está disponible")'), 'el menú ofrece la versión nueva');
    comprobar(!(await nueva.pagina.evaluate((m) => Mappi.probarManifiesto({ ...m, apk: 'https://example.com/Mappi.apk' }), manifiesto))
      && (await nueva.pagina.evaluate(() => Mappi.nuevaVersion().apk)) === manifiesto.apk, 'ignora un version.json que descarga de otro sitio');
    comprobar(nueva.errores.length === 0, 'el aviso de versión no produce errores');
    await nueva.contexto.close();

    const obligatoria = await abrir(navegador, url, { preparar: conVersion({ ...manifiesto, codigo_minimo: 3 }) });
    await obligatoria.pagina.waitForFunction(() => Mappi.versionRevisada());
    comprobar((await obligatoria.pagina.evaluate(() => Mappi.vista())) === 'version'
      && !(await obligatoria.pagina.isVisible('button:has-text("Más tarde")')), 'una actualización obligatoria no se puede posponer');
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
