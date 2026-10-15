"""Crea la firma de Mappi una sola vez, la guarda en este equipo y la sube como secreto a GitHub.

Todas las versiones deben firmarse con la misma clave para instalarse encima de la anterior.
"""
import base64
import os
from pathlib import Path
import secrets
import subprocess

REPOSITORIO = 'Yextep/mappi'
carpeta = Path('/root/.local/share/mappi/signing')
carpeta.mkdir(parents=True, exist_ok=True)
carpeta.chmod(0o700)
archivo_clave = carpeta / 'password'
almacen = carpeta / 'mappi.p12'
if not archivo_clave.exists():
    fd = os.open(archivo_clave, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as salida:
        salida.write(secrets.token_urlsafe(40))
if not almacen.exists():
    subprocess.run([
        'keytool', '-genkeypair', '-keystore', str(almacen), '-storetype', 'PKCS12',
        '-storepass:file', str(archivo_clave), '-keypass:file', str(archivo_clave),
        '-alias', 'mappi', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
        '-dname', 'CN=Mappi, OU=Android, O=Mappi', '-noprompt',
    ], check=True)
    almacen.chmod(0o600)
for nombre, valor in (
    ('MAPPI_SIGNING_KEYSTORE', base64.b64encode(almacen.read_bytes())),
    ('MAPPI_SIGNING_PASSWORD', archivo_clave.read_bytes()),
):
    subprocess.run(['gh', 'secret', 'set', nombre, '--repo', REPOSITORIO], input=valor, check=True)
print('Firma de Mappi lista y guardada en', carpeta)
