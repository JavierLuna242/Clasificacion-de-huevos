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
- [Despliegue en AWS EC2](#despliegue-en-aws-ec2)
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
│   ├── requirements.txt
│   └── deploy/         # systemd units + script de despliegue al EC2
├── frontend/            # App Expo (React Native) para Expo Go
│   └── App.js
├── web/                 # App web (React + Vite)
│   └── src/App.jsx
└── losherederos.pem     # llave SSH de la instancia EC2 (no se sube a git)
```

---

## Stack técnico

| Capa      | Tecnología                                                        |
| --------- | ------------------------------------------------------------------ |
| Modelo    | YOLO11 (Ultralytics), 2 clases: `bueno`, `roto`                    |
| Backend   | FastAPI, Uvicorn, Pillow, PyTorch (CPU)                             |
| App móvil | Expo SDK 57, React Native, `expo-camera`, `expo-blur`               |
| Web       | React 19, Vite, cámara del navegador (`getUserMedia`)               |
| Servidor  | AWS EC2 (Ubuntu), systemd, certificado TLS autofirmado              |

---

## Backend (API)

Corre en la instancia EC2, siempre activo mientras la instancia esté encendida.

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
./venv/bin/uvicorn app.main:app --reload --port 8080
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

Requiere HTTPS (o `localhost`) para que el navegador permita usar la cámara — por eso en producción se sirve por `https://54.83.16.222:8443` (ver [Despliegue](#despliegue-en-aws-ec2)).

La URL del backend está en [`web/src/config.js`](web/src/config.js).

---

## Despliegue en AWS EC2

Todo el despliegue (backend + modelo + web) se hace con un solo script:

```bash
bash backend/deploy/deploy.sh
```

Qué hace:

1. Compila la web (`npm run build`).
2. Sube el código, el modelo y la web compilada a la instancia por `scp`.
3. Instala dependencias del sistema y del `venv` de Python.
4. Genera un certificado TLS autofirmado si no existe (`backend/certs/` en el servidor).
5. Instala y reinicia dos servicios `systemd`, ambos habilitados para arrancar solos si la instancia se reinicia:

| Servicio            | Puerto | Protocolo | Para                                  |
| -------------------- | ------ | --------- | -------------------------------------- |
| `egg-api.service`     | 8080   | HTTP      | App móvil (Expo Go, sin restricción de HTTPS) |
| `egg-api-tls.service` | 8443   | HTTPS     | Web (el navegador exige HTTPS para dar acceso a la cámara) |

Ambos puertos deben estar abiertos en el **Security Group** de la instancia (Custom TCP, origen `0.0.0.0/0`).

> El certificado de `egg-api-tls` es autofirmado (no hay dominio propio), así que el navegador muestra una advertencia la primera vez — hay que aceptar "Avanzado → Continuar" una sola vez por dispositivo.

---

## Solución de problemas

- **La web no carga tras apagar/prender la instancia**: revisa si la IP pública cambió (pasa si la instancia no tiene una *Elastic IP* asignada). Los servicios arrancan solos, pero si la IP cambió hay que actualizar `frontend/src/config.js`, `web/src/config.js` y volver a desplegar.
- **La cámara no funciona en el navegador**: solo funciona sobre HTTPS o `localhost` — asegúrate de entrar por `https://` y no por `http://`.
- **Detecciones erráticas / parpadeo**: ver el bloque `mergeDetections` en `frontend/App.js` y `web/src/App.jsx` — cada huevo se mantiene visible ~2.5 s desde la última vez que se detectó, para suavizar fallos de un solo frame.
