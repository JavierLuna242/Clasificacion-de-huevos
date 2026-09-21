import io
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from ultralytics import YOLO

MODEL_PATH = "model/best.pt"
CONF_THRESHOLD = 0.25

app = FastAPI(title="Clasificador de Huevos")
model = YOLO(MODEL_PATH)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/classify")
async def classify(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(400, "El archivo debe ser una imagen")

    data = await image.read()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(400, "No se pudo leer la imagen")

    result = model.predict(img, conf=CONF_THRESHOLD, verbose=False)[0]

    # Un huevo roto sigue roto aunque también se detecte una zona "buena":
    # la clase roto manda si aparece.
    best_roto = 0.0
    best_bueno = 0.0
    for box in result.boxes:
        name = result.names[int(box.cls[0])]
        score = float(box.conf[0])
        if name == "roto":
            best_roto = max(best_roto, score)
        elif name == "bueno":
            best_bueno = max(best_bueno, score)

    label: Optional[str] = None
    confidence = 0.0
    if best_roto > 0:
        label, confidence = "roto", best_roto
    elif best_bueno > 0:
        label, confidence = "bueno", best_bueno

    return {"label": label, "confidence": confidence, "detections": len(result.boxes)}
