"""Publica versiones de Mappi y controla el aviso de actualización de las apps instaladas.

  python scripts/publicar_version.py estado
  python scripts/publicar_version.py publicar RUN_ID [--notas "Qué cambió"] [--obligatoria] [--guardar CARPETA]
  python scripts/publicar_version.py obligatoria
  python scripts/publicar_version.py opcional

RUN_ID es una ejecución exitosa de «Compilar Mappi». Su APK firmado se publica como release vX.Y y
version.json pasa a apuntar a ella: las apps instaladas lo leen al abrirse y ofrecen descargarla.
Requiere gh con sesión iniciada. version.json se cambia en GitHub; después haz git pull.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

REPO = 'Yextep/mappi'
FLUJO = 'Compilar Mappi'
ARTEFACTO = 'Mappi-APK'
# Huella de la clave de firma. Un APK firmado con otra no se puede instalar encima, así que no se publica.
CERTIFICADO = 'fcefb8fbe893031092ecd8ab5e00f31b41eececd633b9cd6f9201cc4b1f916a9'


def gh(*args):
    resultado = subprocess.run(['gh', *args], capture_output=True, text=True)
    if resultado.returncode != 0:
        sys.exit(f"gh {' '.join(args[:2])} falló: {resultado.stderr.strip()}")
    return resultado.stdout


def leer_manifiesto():
    datos = json.loads(gh('api', f'repos/{REPO}/contents/version.json'))
    return json.loads(base64.b64decode(datos['content'])), datos['sha']


def escribir_manifiesto(manifiesto, sha, mensaje):
    contenido = base64.b64encode((json.dumps(manifiesto, ensure_ascii=False, indent=2) + '\n').encode()).decode()
    gh('api', '-X', 'PUT', f'repos/{REPO}/contents/version.json',
       '-f', f'message={mensaje}', '-f', f'content={contenido}', '-f', f'sha={sha}')
    print(json.dumps(manifiesto, ensure_ascii=False, indent=2))
    print('version.json actualizado en GitHub. Haz git pull para traer el cambio.')


def version_compilada(commit):
    datos = json.loads(gh('api', f'repos/{REPO}/contents/app/build.gradle?ref={commit}'))
    gradle = base64.b64decode(datos['content']).decode()
    return re.search(r"versionName '([^']+)'", gradle).group(1), int(re.search(r'versionCode (\d+)', gradle).group(1))


def revisar_firma(apk):
    casas = [os.environ.get('ANDROID_HOME', ''), '/opt/android-sdk']
    herramientas = sorted(p for casa in casas if casa for p in Path(casa).glob('build-tools/*/apksigner'))
    if not herramientas:
        print('Aviso: no se encontró apksigner; se confía en la firma que verificó GitHub Actions.')
        return
    salida = subprocess.run([str(herramientas[-1]), 'verify', '--print-certs', str(apk)],
                            check=True, capture_output=True, text=True).stdout
    if CERTIFICADO not in salida:
        sys.exit('El APK no tiene la firma de Mappi. No se publicó nada.')


def publicar(run_id, notas, obligatoria, guardar):
    ejecucion = json.loads(gh('run', 'view', run_id, '--repo', REPO, '--json', 'conclusion,headSha,workflowName'))
    if ejecucion['workflowName'] != FLUJO or ejecucion['conclusion'] != 'success':
        sys.exit(f'La ejecución {run_id} no es una compilación exitosa de «{FLUJO}». No se publicó nada.')
    nombre, codigo = version_compilada(ejecucion['headSha'])
    manifiesto, sha = leer_manifiesto()
    if codigo <= manifiesto.get('codigo', 0):
        sys.exit(f"Mappi {nombre} (código {codigo}) no es más nueva que la publicada "
                 f"({manifiesto.get('version')}, código {manifiesto.get('codigo')}). Sube versionCode en app/build.gradle.")
    notas = notas.strip() or f'Mappi {nombre}.'
    with tempfile.TemporaryDirectory() as carpeta:
        gh('run', 'download', run_id, '--repo', REPO, '-n', ARTEFACTO, '-D', carpeta)
        apk = Path(carpeta) / 'Mappi.apk'
        revisar_firma(apk)
        gh('release', 'create', f'v{nombre}', str(apk), '--repo', REPO, '--target', ejecucion['headSha'],
           '--title', f'Mappi {nombre}', '--notes', notas, '--latest')
        if guardar:
            destino = Path(guardar) / 'Mappi.apk'
            shutil.copyfile(apk, destino)
            print(f'Copia del APK en {destino}')
    manifiesto.update(version=nombre, codigo=codigo, notas=notas,
                      apk=f'https://github.com/{REPO}/releases/download/v{nombre}/Mappi.apk')
    if obligatoria:
        manifiesto['codigo_minimo'] = codigo
    escribir_manifiesto(manifiesto, sha, f'Publicar Mappi {nombre}')


def main():
    analizador = argparse.ArgumentParser(description='Publica versiones de Mappi y controla el aviso de actualización.')
    ordenes = analizador.add_subparsers(dest='orden', required=True)
    ordenes.add_parser('estado', help='Muestra el version.json publicado.')
    orden = ordenes.add_parser('publicar', help='Publica el APK de una compilación exitosa y avisa a las apps instaladas.')
    orden.add_argument('run_id')
    orden.add_argument('--notas', default='', help='Novedades que verá la gente en el aviso y en la release.')
    orden.add_argument('--obligatoria', action='store_true', help='Las versiones anteriores dejan de funcionar hasta actualizar.')
    orden.add_argument('--guardar', metavar='CARPETA', help='Guarda también una copia de Mappi.apk en esa carpeta.')
    ordenes.add_parser('obligatoria', help='Exige la última versión publicada a todas las apps instaladas.')
    ordenes.add_parser('opcional', help='Quita la exigencia: las versiones anteriores vuelven a funcionar.')
    args = analizador.parse_args()
    if args.orden == 'estado':
        print(json.dumps(leer_manifiesto()[0], ensure_ascii=False, indent=2))
    elif args.orden == 'publicar':
        publicar(args.run_id, args.notas, args.obligatoria, args.guardar)
    else:
        manifiesto, sha = leer_manifiesto()
        exigir = args.orden == 'obligatoria'
        manifiesto['codigo_minimo'] = manifiesto.get('codigo', 0) if exigir else 0
        escribir_manifiesto(manifiesto, sha, f"Exigir Mappi {manifiesto.get('version')}" if exigir else 'Actualización de Mappi opcional')


if __name__ == '__main__':
    main()
