# CragShade

App web (mobile first) para saber cuándo una pared de escalada está al sol o a la sombra. Los usuarios suben
fotos esféricas hechas desde la pared; cada foto es un punto en el mapa. Al abrirla se ve el sol dibujado sobre la
panorámica (con su trayectoria del día y marcas horarias), con sliders de fecha y hora.

## Arrancar

```sh
make install   # uv sync + npm install
make dev       # FastAPI en 127.0.0.1:8370 + Vite en https://0.0.0.0:5173 (proxy /api y /media)
make test      # pytest + vitest + svelte-check
make sample    # genera samples/sample-madrid.jpg, panorámica sintética para probar
```

Vite sirve **HTTPS** con certificado autofirmado (`@vitejs/plugin-basic-ssl`): la brújula y la geolocalización solo
funcionan en contexto seguro. Desde el móvil: `https://<ip-de-arc2>:5173` (por Tailscale `https://100.64.0.216:5173`)
y aceptar el aviso del certificado. El puerto del backend se cambia con `BACKEND_PORT=…`.

Datos en `backend/data/` (SQLite `cragshade.db` + `media/<id>/{original,web,thumb}.jpg`).

## Cómo se orienta una foto

Todo depende de saber a qué azimut mira el centro de la panorámica (`heading_true`):
`azimut = heading + yaw`. El `PoseHeadingDegrees` que guarda el móvil no es fiable, así que al subir hay un paso
de orientación:

1. **Con el sol** (preferido): si el sol sale en la foto, el usuario lo toca. Con la hora EXIF y la posición,
   `heading = azimut_sol − yaw_tocado`. La altura del punto tocado se compara con la calculada (±5°) para detectar
   una hora o zona horaria mal puestas. Precisión ~1–2°, sin brújula.
2. **Con brújula** (estando en el sitio):
   - Comprobación de calibración: gesto del ocho obligatorio (hay que barrer ≥10 de 12 sectores de rumbo y ≥90°
     de inclinación). En iOS además `webkitCompassAccuracy ≤ 15°`. Android no expone precisión.
   - El usuario apunta la cámara trasera a un elemento visible y lo centra bajo la cruz de la panorámica. Hace falta
     el móvil quieto (desviación < 3° en 1,2 s) y en vertical.
   - Se piden 3 referencias separadas ≥60°; se promedian y si alguna se desvía >10° se rechaza. Una brújula mal
     calibrada da errores que dependen de la dirección, y esto los detecta.
   - Se corrige la declinación magnética (modelo WMM, paquete `geomagnetism`).
3. **Verificación**: N/E/S/O y sol a la hora de la foto sobre la panorámica, con ajuste fino ±10°.

Se guardan el método y el error estimado, que se muestran en el visor.

## Estructura

- `backend/app/` — FastAPI (`main.py`), SQLite (`db.py`), versión web ≤4096 px y miniatura (`images.py`).
- `frontend/src/lib/` — `sun.ts` (suncalc), `heading.ts` (ángulos, solución de brújula), `compass.ts` (sensores),
  `time.ts` (zona horaria del lugar con `tz-lookup`), `exif.ts` (EXIF + GPano), `overlays.ts` (marcadores),
  `Pano.svelte` (Photo Sphere Viewer).
- `frontend/src/routes/` — mapa (Leaflet), visor, asistente de subida.
- `scripts/make_sample.py` — panorámica sintética; `scripts/e2e.py` — prueba en Chromium headless del flujo completo
  (`uv run --no-project --with playwright python scripts/e2e.py`).

## Pendiente de probar en campo

- Que `webkitCompassHeading` en iOS dé el rumbo de la cámara con el móvil en vertical (así lo usan las webs de AR,
  pero no está documentado).
- Photo Spheres parciales reales de Android (recorte GPano).

## Despliegue (k3s de Oracle)

- Cada push a `main` pasa los tests y publica `ghcr.io/adrianlzt/cragshade:{main,<sha>}` (arm64) con
  `.github/workflows/image.yml`.
- Manifiestos en `deploy/k8s.yaml` (namespace `cragshade`, PVC `local-path` de 5 Gi, Traefik + Let's Encrypt):
  `KUBE_ADMIN=1 kubectl --context oracle-frankfurt-nixos-ts apply -f deploy/k8s.yaml`
- Nueva versión: `KUBE_ADMIN=1 kubectl --context oracle-frankfurt-nixos-ts -n cragshade rollout restart deploy/cragshade`
  (la imagen `:main` se descarga con `imagePullPolicy: Always`).
- URL: https://cragshade.k8s.adrianlzt.com

### Almacenamiento (Cloudflare R2)

En producción las fotos van a R2 (`media/<id>/{web,thumb}.jpg`, servidas desde el dominio público del bucket) y
Litestream replica la SQLite al mismo bucket (`litestream/`). Al arrancar en un volumen vacío, el init container
restaura la base de datos. Sin `CRAGSHADE_S3_BUCKET` la app guarda en disco (desarrollo).
El original solo se guarda con `CRAGSHADE_KEEP_ORIGINAL=1`.

- Bucket `cragshade` con dominio público `cragshade-media.adrianlzt.com` y esta política CORS (el visor carga la
  panorámica como textura WebGL, que exige CORS):
  ```json
  [{"AllowedOrigins": ["https://cragshade.k8s.adrianlzt.com", "https://localhost:5173"],
    "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}]
  ```
- Token R2 "Object Read & Write" limitado al bucket, en gopass `cragshade/r2`. Secret:
  ```sh
  KUBE_ADMIN=1 kubectl --context oracle-frankfurt-nixos-ts -n cragshade create secret generic cragshade-s3 \
    --from-literal=AWS_ACCESS_KEY_ID=… --from-literal=AWS_SECRET_ACCESS_KEY=… \
    --from-literal=CRAGSHADE_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com \
    --from-literal=CRAGSHADE_S3_BUCKET=cragshade --from-literal=CRAGSHADE_MEDIA_URL=https://cragshade-media.adrianlzt.com
  ```
