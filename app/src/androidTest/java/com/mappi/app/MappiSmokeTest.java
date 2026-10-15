package com.mappi.app;

import android.content.Intent;
import android.os.ParcelFileDescriptor;
import android.webkit.WebView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

@RunWith(AndroidJUnit4.class)
public class MappiSmokeTest {
    private String evaluar(ActivityScenario<MainActivity> escenario, String codigo) throws Exception {
        CountDownLatch listo = new CountDownLatch(1);
        AtomicReference<String> resultado = new AtomicReference<>("");
        escenario.onActivity(actividad -> {
            WebView vista = actividad.findViewById(R.id.navegador);
            vista.evaluateJavascript(codigo, valor -> {
                resultado.set(valor);
                listo.countDown();
            });
        });
        assertTrue("El WebView no respondió", listo.await(15, TimeUnit.SECONDS));
        return resultado.get();
    }

    private boolean esperar(ActivityScenario<MainActivity> escenario, String condicion, int segundos) throws Exception {
        for (int intento = 0; intento < segundos * 2; intento++) {
            if ("true".equals(evaluar(escenario, condicion))) return true;
            Thread.sleep(500);
        }
        return false;
    }

    private void exigir(ActivityScenario<MainActivity> escenario, String condicion) throws Exception {
        if (!esperar(escenario, condicion, 60)) fail("No se cumplió: " + condicion);
    }

    private String shell(String comando) throws Exception {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(comando);
        try (InputStream entrada = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
             ByteArrayOutputStream salida = new ByteArrayOutputStream()) {
            byte[] bloque = new byte[4096];
            int leidos;
            while ((leidos = entrada.read(bloque)) != -1) salida.write(bloque, 0, leidos);
            return salida.toString("UTF-8");
        }
    }

    private void captura(String nombre) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Thread.sleep(1200);
        shell("screencap -p /sdcard/Download/mappi-android-" + nombre + ".png");
    }

    @Before
    public void prepararUbicacion() throws Exception {
        // El emulador se ubica en Barrancabermeja desde scripts/android_smoke.sh.
        shell("pm grant com.mappi.app android.permission.ACCESS_FINE_LOCATION");
        shell("pm grant com.mappi.app android.permission.ACCESS_COARSE_LOCATION");
    }

    @Test
    public void muestraElMapaBuscaYAbreUnaFicha() throws Exception {
        try (ActivityScenario<MainActivity> escenario = ActivityScenario.launch(MainActivity.class)) {
            exigir(escenario, "!!(window.Mappi && Mappi.listo)");
            assertTrue("La lista incluida debe tener más de 600 lugares",
                    Integer.parseInt(evaluar(escenario, "Mappi.totalLugares()")) > 600);
            exigir(escenario, "Mappi.hayMapa()");
            if (!esperar(escenario, "Mappi.mapaListo()", 45)) System.out.println("El mapa base no terminó de cargar a tiempo");
            captura("mapa");

            assertTrue("Pizza debe encontrar lugares",
                    Integer.parseInt(evaluar(escenario, "Mappi.buscar('pizza')")) >= 10);
            evaluar(escenario, "Mappi.abrir(Mappi.primerResultado())");
            exigir(escenario, "Mappi.vista() === 'ficha' && !!document.querySelector('a[href^=\"https://www.google.com/maps/dir/\"]')");
            esperar(escenario, "Mappi.mapaListo()", 20);
            captura("ficha");

            // Atrás cierra la ficha y la lista antes de salir de la app.
            escenario.onActivity(MainActivity::onBackPressed);
            exigir(escenario, "Mappi.vista() === 'lista'");
            escenario.onActivity(MainActivity::onBackPressed);
            exigir(escenario, "Mappi.vista() === 'resumen'");
            escenario.onActivity(actividad -> assertFalse(actividad.isFinishing()));
        }
    }

    @Test
    public void guardaFavoritosEntreAperturas() throws Exception {
        String id;
        try (ActivityScenario<MainActivity> escenario = ActivityScenario.launch(MainActivity.class)) {
            exigir(escenario, "!!(window.Mappi && Mappi.listo)");
            id = evaluar(escenario, "Mappi.buscar('hamburguesa') && Mappi.primerResultado()");
            evaluar(escenario, "Mappi.abrir(" + id + ")");
            exigir(escenario, "!!document.querySelector('button[data-accion=favorito]')");
            evaluar(escenario, "document.querySelector('button[data-accion=favorito]').click()");
            exigir(escenario, "!!Mappi.estado().favoritos[" + id + "]");
        }
        try (ActivityScenario<MainActivity> escenario = ActivityScenario.launch(MainActivity.class)) {
            exigir(escenario, "!!(window.Mappi && Mappi.listo)");
            assertEquals("true", evaluar(escenario, "!!Mappi.estado().favoritos[" + id + "]"));
            evaluar(escenario, "document.querySelector('button[data-vista=favoritos]').click()");
            exigir(escenario, "Mappi.resultados() === 1");
        }
    }

    @Test
    public void recibeUnVideoCompartido() throws Exception {
        Intent intent = new Intent(ApplicationProvider.getApplicationContext(), MainActivity.class)
                .setAction(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, "Miren este sitio https://vm.tiktok.com/ZMprueba01/ #barranca");
        try (ActivityScenario<MainActivity> escenario = ActivityScenario.launch(intent)) {
            exigir(escenario, "!!(window.Mappi && Mappi.listo) && Mappi.vista() === 'compartido'");
            exigir(escenario, "document.querySelector('.url-compartida').textContent.includes('vm.tiktok.com/ZMprueba01')");
            captura("video");
        }
    }

    @Test
    public void bloqueaServidoresNoPermitidos() throws Exception {
        try (ActivityScenario<MainActivity> escenario = ActivityScenario.launch(MainActivity.class)) {
            exigir(escenario, "!!(window.Mappi && Mappi.listo)");
            evaluar(escenario, "fetch('https://example.com/').then(r => window.__prueba = 'status ' + r.status, () => window.__prueba = 'bloqueado')");
            exigir(escenario, "!!window.__prueba");
            assertEquals("\"bloqueado\"", evaluar(escenario, "window.__prueba"));
        }
    }
}
