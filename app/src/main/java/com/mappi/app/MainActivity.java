package com.mappi.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String ORIGEN = "https://appassets.androidplatform.net";
    static final String INICIO = ORIGEN + "/assets/web/index.html";
    private static final int PEDIR_UBICACION = 51;
    private static final int ABRIR_RESPALDO = 52;
    private static final int GUARDAR_RESPALDO = 53;
    private static final int MAXIMO_RESPALDO = 8 * 1024 * 1024;
    // La página solo puede hablar con el mapa (OpenFreeMap) y con la lista mensual de lugares (GitHub).
    private static final Set<String> SERVIDORES = new HashSet<>(Arrays.asList(
            "tiles.openfreemap.org", "raw.githubusercontent.com"));

    private final ExecutorService trabajador = Executors.newSingleThreadExecutor();
    private WebView navegador;
    private FrameLayout contenedor;
    private WebViewAssetLoader cargador;
    boolean paginaLista;
    private String compartidoPendiente;
    private GeolocationPermissions.Callback permisoUbicacion;
    private String origenUbicacion;
    private ValueCallback<Uri[]> archivoElegido;
    private String respaldoPendiente;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        contenedor = new FrameLayout(this);
        ViewCompat.setOnApplyWindowInsetsListener(contenedor, (vista, insets) -> {
            int seguras = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets barras = insets.getInsets(seguras);
            Insets teclado = insets.getInsets(WindowInsetsCompat.Type.ime());
            vista.setPadding(barras.left, barras.top, barras.right, Math.max(barras.bottom, teclado.bottom));
            // El contenedor ya reservó esas zonas; el WebView recibe cero para no contarlas dos veces.
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(seguras | WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .setInsetsIgnoringVisibility(seguras, Insets.NONE)
                    .setDisplayCutout(null)
                    .build();
        });

        navegador = new WebView(this);
        navegador.setId(R.id.navegador);
        WebSettings ajustes = navegador.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setGeolocationEnabled(true);
        ajustes.setAllowFileAccess(false);
        ajustes.setAllowContentAccess(true);
        ajustes.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ajustes.setSupportMultipleWindows(false);
        ajustes.setUserAgentString(ajustes.getUserAgentString() + " Mappi/" + BuildConfig.VERSION_NAME);
        if (Build.VERSION.SDK_INT >= 33) ajustes.setAlgorithmicDarkeningAllowed(false);
        navegador.addJavascriptInterface(new Puente(), "MappiAndroid");

        cargador = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        navegador.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView vista, WebResourceRequest pedido) {
                Uri url = pedido.getUrl();
                if (esLocal(url)) return cargador.shouldInterceptRequest(url);
                if ("https".equals(url.getScheme()) && SERVIDORES.contains(url.getHost())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Bloqueado",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView vista, WebResourceRequest pedido) {
                if (esLocal(pedido.getUrl())) return false;
                abrirFuera(pedido.getUrl());
                return true;
            }

            @Override
            public void onPageFinished(WebView vista, String url) {
                if (!esLocal(Uri.parse(url))) return;
                paginaLista = true;
                entregarCompartido();
            }
        });
        navegador.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origen, GeolocationPermissions.Callback respuesta) {
                if (!esLocal(Uri.parse(origen))) {
                    respuesta.invoke(origen, false, false);
                } else if (tienePermisoUbicacion()) {
                    respuesta.invoke(origen, true, false);
                } else {
                    if (permisoUbicacion != null) permisoUbicacion.invoke(origenUbicacion, false, false);
                    permisoUbicacion = respuesta;
                    origenUbicacion = origen;
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION
                    }, PEDIR_UBICACION);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView vista, ValueCallback<Uri[]> respuesta, FileChooserParams parametros) {
                if (archivoElegido != null) archivoElegido.onReceiveValue(null);
                archivoElegido = respuesta;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(intent, ABRIR_RESPALDO);
                } catch (ActivityNotFoundException exc) {
                    archivoElegido.onReceiveValue(null);
                    archivoElegido = null;
                    avisar("No se pudo abrir el selector de archivos.");
                }
                return true;
            }
        });

        contenedor.addView(navegador, new FrameLayout.LayoutParams(-1, -1));
        setContentView(contenedor);
        aplicarColores();
        ViewCompat.requestApplyInsets(contenedor);
        recibir(getIntent());
        navegador.loadUrl(INICIO);
    }

    private boolean esOscuro() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    // Mismos colores de fondo que la página, para que no haya destellos al abrir.
    private void aplicarColores() {
        boolean oscuro = esOscuro();
        int fondo = Color.parseColor(oscuro ? "#0d1312" : "#eef2f0");
        contenedor.setBackgroundColor(fondo);
        navegador.setBackgroundColor(fondo);
        WindowInsetsControllerCompat barras = WindowCompat.getInsetsController(getWindow(), contenedor);
        barras.setAppearanceLightStatusBars(!oscuro);
        barras.setAppearanceLightNavigationBars(!oscuro);
    }

    @Override
    public void onWindowFocusChanged(boolean enfoque) {
        super.onWindowFocusChanged(enfoque);
        // Android puede restablecer el color de los íconos de las barras al cambiar de navegación.
        if (enfoque && contenedor != null) aplicarColores();
    }

    static boolean esLocal(Uri url) {
        return url != null && "https".equals(url.getScheme()) && "appassets.androidplatform.net".equals(url.getHost());
    }

    private boolean tienePermisoUbicacion() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] permisos, int[] resultados) {
        super.onRequestPermissionsResult(pedido, permisos, resultados);
        if (pedido != PEDIR_UBICACION || permisoUbicacion == null) return;
        permisoUbicacion.invoke(origenUbicacion, tienePermisoUbicacion(), false);
        permisoUbicacion = null;
    }

    // Rutas (Google Maps, Waze), llamadas, WhatsApp y redes se abren en sus propias apps.
    private void abrirFuera(Uri url) {
        String esquema = url.getScheme();
        Intent intent;
        if ("tel".equals(esquema)) intent = new Intent(Intent.ACTION_DIAL, url);
        else if ("https".equals(esquema) || "http".equals(esquema)) intent = new Intent(Intent.ACTION_VIEW, url);
        else return;
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException exc) {
            avisar("No hay una app para abrir este enlace.");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recibir(intent);
    }

    // Un video compartido desde TikTok o Instagram llega como texto con el enlace.
    private void recibir(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String texto = intent.getStringExtra(Intent.EXTRA_TEXT);
        String asunto = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (texto == null && asunto == null) return;
        compartidoPendiente = ((asunto == null ? "" : asunto + " ") + (texto == null ? "" : texto)).trim();
        entregarCompartido();
    }

    private void entregarCompartido() {
        if (!paginaLista || compartidoPendiente == null) return;
        String texto = compartidoPendiente;
        compartidoPendiente = null;
        navegador.evaluateJavascript("window.Mappi && Mappi.recibirCompartido(" + JSONObject.quote(texto) + ")", null);
    }

    // Lo único que la página puede pedirle a Android: guardar un respaldo donde el usuario elija.
    public final class Puente {
        @JavascriptInterface
        public void guardarRespaldo(String nombre, String json) {
            if (json == null || json.length() > MAXIMO_RESPALDO) return;
            String titulo = nombre != null && nombre.matches("[A-Za-z0-9._-]{1,80}") ? nombre : "Mappi-respaldo.json";
            runOnUiThread(() -> {
                if (isDestroyed()) return;
                respaldoPendiente = json;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, titulo);
                try {
                    startActivityForResult(intent, GUARDAR_RESPALDO);
                } catch (ActivityNotFoundException exc) {
                    respaldoPendiente = null;
                    avisar("No se pudo abrir el selector para guardar el respaldo.");
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent datos) {
        super.onActivityResult(pedido, resultado, datos);
        Uri elegido = resultado == RESULT_OK && datos != null ? datos.getData() : null;
        if (pedido == ABRIR_RESPALDO && archivoElegido != null) {
            archivoElegido.onReceiveValue(elegido == null ? null : new Uri[]{elegido});
            archivoElegido = null;
        } else if (pedido == GUARDAR_RESPALDO) {
            String json = respaldoPendiente;
            respaldoPendiente = null;
            if (elegido == null || json == null) return;
            trabajador.execute(() -> {
                try (OutputStream salida = getContentResolver().openOutputStream(elegido, "wt")) {
                    if (salida == null) throw new IllegalStateException("No se pudo abrir el archivo");
                    salida.write(json.getBytes(StandardCharsets.UTF_8));
                    runOnUiThread(() -> navegador.evaluateJavascript("window.Mappi && Mappi.respaldoGuardado()", null));
                } catch (Exception exc) {
                    Log.e("Mappi", "No se pudo guardar el respaldo", exc);
                    runOnUiThread(() -> avisar("No se pudo guardar el respaldo. Vuelve a intentarlo."));
                }
            });
        }
    }

    private void avisar(String mensaje) {
        if (!isDestroyed()) Toast.makeText(this, mensaje, Toast.LENGTH_LONG).show();
    }

    // Atrás cierra primero la ficha, la lista o el panel abierto; con el mapa limpio, sale de la app.
    @Override
    public void onBackPressed() {
        if (archivoElegido != null) {
            archivoElegido.onReceiveValue(null);
            archivoElegido = null;
            return;
        }
        if (!paginaLista) {
            super.onBackPressed();
            return;
        }
        navegador.evaluateJavascript("window.Mappi ? Mappi.atras() : false", valor -> {
            if (!"true".equals(valor) && !isFinishing()) super.onBackPressed();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        navegador.onResume();
    }

    @Override
    protected void onPause() {
        navegador.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (archivoElegido != null) archivoElegido.onReceiveValue(null);
        if (permisoUbicacion != null) permisoUbicacion.invoke(origenUbicacion, false, false);
        navegador.removeJavascriptInterface("MappiAndroid");
        navegador.destroy();
        trabajador.shutdown();
        super.onDestroy();
    }
}
