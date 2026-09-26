import io
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from ultralytics import YOLO

MODEL_PATH = "model/best.pt"
# Con huevos reales el modelo suele detectar con menos confianza que en
# pruebas de laboratorio; se corre con conf bajo y se filtra aca para poder
# loguear (y eventualmente bajar) el umbral sin volver a desplegar.
DETECT_CONF = 0.05
LABEL_CONF_THRESHOLD = 0.15
IMG_SIZE = 640

logger = logging.getLogger("uvicorn.error")

app = FastAPI(title="Clasificador de Huevos")
# Sin auth ni datos sensibles en este endpoint: se permite cualquier origen
# para que tanto la web como futuras pruebas locales puedan llamarlo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
model = YOLO(MODEL_PATH)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/classify")
async def classify(image: UploadFile = File(...)):
    data = await image.read()
    try:
        # exif_transpose: las fotos de iPhone guardan los pixeles "acostados"
        # con una bandera EXIF de rotacion; sin esto, las cajas del modelo
        # quedan calculadas sobre una imagen con ancho/alto invertidos
        # respecto a la que ve el usuario en pantalla.
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:
        raise HTTPException(400, "No se pudo leer la imagen")

    # agnostic_nms: sin esto, un mismo huevo puede quedar con dos cajas
    # encimadas (una "bueno" y una "roto") porque la supresion de duplicados
    # de YOLO solo compara cajas de la MISMA clase.
    result = model.predict(
        img, conf=DETECT_CONF, imgsz=IMG_SIZE, iou=0.5, agnostic_nms=True, verbose=False
    )[0]

    eggs = []
    for box in result.boxes:
        name = result.names[int(box.cls[0])]
        score = float(box.conf[0])
        logger.info("deteccion cruda: %s conf=%.3f", name, score)
        if score >= LABEL_CONF_THRESHOLD:
            x1, y1, x2, y2 = box.xyxyn[0].tolist()  # normalizadas 0-1
            eggs.append({
                "label": name,
                "confidence": round(score, 3),
                "box": [round(x1, 4), round(y1, 4), round(x2, 4), round(y2, 4)],
            })

    eggs.sort(key=lambda e: e["confidence"], reverse=True)
    return {"eggs": eggs, "count": len(eggs)}


# Al final: sirve la web (build de Vite) en "/". Va despues de las rutas de
# arriba para que /health y /classify sigan respondiendo como API.
app.mount("/", StaticFiles(directory="web", html=True), name="web")
