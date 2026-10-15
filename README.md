# 🥚 EggClassify

Clasificación de huevos en tiempo real (**bueno** / **roto**) usando un modelo **YOLO11** entrenado a medida, accesible desde una **app móvil (Expo Go)** y desde el **navegador**, apuntando la cámara al huevo.

Proyecto de la asignatura Ciencia de Datos — 6.º semestre.

---

## Tabla de contenido

- [Cómo funciona](#cómo-funciona)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Stack técnico](#stack-técnico)
- [Backend (API)](#backend-api)
- [App móvil (Expo Go)](#app-móvil-expo-go)
- [Web](#web)
- [Despliegue (Azure + Cloudflare Tunnel)](#despliegue-azure--cloudflare-tunnel)
- [Solución de problemas](#solución-de-problemas)

---

## Cómo funciona

1. El cliente (app móvil o web) toma una foto con la cámara cada ~1.2 s.
2. La envía por `multipart/form-data` al backend (`POST /classify`).
3. El backend corre el modelo YOLO11 sobre la imagen y devuelve, por cada huevo detectado, su clasificación, confianza y la posición del recuadro (coordenadas normalizadas 0–1).
4. El cliente dibuja un recuadro de color sobre cada huevo (verde = bueno, rojo = roto) directamente sobre la cámara en vivo.

**Contrato de la API** (`POST /classify`, respuesta):

```json
{
  "eggs": [
    { "label": "bueno", "confidence": 0.87, "box": [0.12, 0.30, 0.45, 0.71] },
    { "label": "roto", "confidence": 0.64, "box": [0.55, 0.28, 0.83, 0.69] }
  ],
  "count": 2
}
```

`box` es `[x1, y1, x2, y2]` normalizado respecto al ancho/alto de la imagen completa, para que cada cliente lo escale a su propio tamaño de pantalla.

---

## Estructura del repositorio

```
.
├── backend/            # API FastAPI + modelo YOLO11
│   ├── app/main.py     # endpoints /health, /classify + sirve la web estatica
│   ├── model/best.pt   # modelo entrenado (clases: bueno, roto)
│   └── requirements.txt
├── frontend/            # App Expo (React Native) para Expo Go
│   └── App.js
├── web/                 # App web (React + Vite)
│   └── src/App.jsx
```

---

## Stack técnico

| Capa      | Tecnología                                                        |
| --------- | ------------------------------------------------------------------ |
| Modelo    | YOLO11 (Ultralytics), 2 clases: `bueno`, `roto`                    |
| Backend   | FastAPI, Uvicorn, Pillow, PyTorch (CPU)                             |
| App móvil | Expo SDK 57, React Native, `expo-camera`, `expo-blur`               |
| Web       | React 19, Vite, cámara del navegador (`getUserMedia`)               |
| Servidor  | Debian (Azure) con dominio + Cloudflare Tunnel                           |

---

## Backend (API)

Corre en la VM de Azure, siempre activo mientras la VM esté encendida.

- **`GET /health`** — chequeo de salud (`{"status": "ok"}`).
- **`POST /classify`** — recibe el campo `image` (form-data) y devuelve las detecciones (ver [Cómo funciona](#cómo-funciona)).
- Sirve además la build de `web/` como sitio estático en `/`, en el mismo proceso.

Detalles relevantes del modelo (`backend/app/main.py`):

- `agnostic_nms=True` — evita que un mismo huevo quede con dos cajas encimadas (una "bueno" y una "roto").
- `ImageOps.exif_transpose` — corrige la rotación EXIF de fotos de iPhone antes de clasificar.
- Analiza la imagen completa (sin recorte de zona fija), así que detecta varios huevos aunque estén repartidos por todo el encuadre.

### Correrlo en local (opcional, para desarrollo)

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn app.main:app --reload --port 8082
```

---

## App móvil (Expo Go)

```bash
cd frontend
npm install
npm start
```

Escanea el QR que aparece en la terminal con la app **Expo Go** en tu celular (misma red WiFi que la computadora).

La URL del backend está fija en [`frontend/src/config.js`](frontend/src/config.js).

---

## Web

```bash
cd web
npm install
npm run dev      # desarrollo, http://localhost:5173
npm run build    # build de produccion -> web/dist/
```

Requiere HTTPS (o `localhost`) para que el navegador permita usar la cámara — por eso en producción se sirve por `https://eggclassify.javier.life` (ver [Despliegue](#despliegue-azure--cloudflare-tunnel)).

La URL del backend está en [`web/src/config.js`](web/src/config.js).

---

## Despliegue (Azure + Cloudflare Tunnel)

La API y la web corren juntas en una VM Debian 12 de Azure (≥ 2 vCPU / 4 GB RAM, usuario `azureuser`), publicadas en **https://eggclassify.javier.life** mediante un Cloudflare Tunnel (HTTPS real, sin abrir puertos; solo el 22 para SSH).

**Cloudflare** (Zero Trust → Networks → Tunnels): Public hostname con subdominio `EggClassify`, dominio `javier.life` y Service URL `http://localhost:8082`. La VM corre `cloudflared` como servicio.

**En la VM**, en `~/egg-api/`:

```
app/  model/best.pt  requirements.txt  web/ (build de Vite)  venv/
```

- Crear el entorno: `python3 -m venv venv`, luego `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` y `pip install -r requirements.txt` (necesita `libgl1` y `libglib2.0-0`).
- Servicio `systemd` `egg-api` que ejecuta `venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8082` (solo local: el tunnel es la única entrada).

**Actualizar:** compilar la web (`npm run build` en `web/`), subir `web/dist` como `~/egg-api/web` (y `backend/app` y `backend/model` si cambiaron) y ejecutar `sudo systemctl restart egg-api`.

---

## Solución de problemas

- **La web no carga tras reiniciar la VM**: revisa `sudo systemctl status egg-api cloudflared`; ambos arrancan solos. Como el acceso es por el tunnel, la IP pública de la VM puede cambiar sin afectar nada.
- **La cámara no funciona en el navegador**: solo funciona sobre HTTPS o `localhost` — asegúrate de entrar por `https://` y no por `http://`.
- **Detecciones erráticas / parpadeo**: ver el bloque `mergeDetections` en `frontend/App.js` y `web/src/App.jsx` — cada huevo se mantiene visible ~2.5 s desde la última vez que se detectó, para suavizar fallos de un solo frame.
