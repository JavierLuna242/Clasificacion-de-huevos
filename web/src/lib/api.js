import { CLASSIFY_ENDPOINT, MAX_SCAN_WIDTH } from '../config';

// Reduce la imagen (video o canvas) a MAX_SCAN_WIDTH y la codifica en JPEG.
export function toJpeg(source, width, height, quality = 0.8) {
  const ratio = Math.min(1, MAX_SCAN_WIDTH / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Miniatura pequena (data URL) para guardar en el historial.
export function toThumb(source, width, height) {
  const w = 120;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = Math.round((w * height) / width);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
}

// Devuelve la lista de huevos detectados: [{ label, confidence, box }].
export async function classify(blob) {
  const form = new FormData();
  form.append('image', blob, 'huevo.jpg');
  const res = await fetch(CLASSIFY_ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Servidor respondió ${res.status}`);
  const data = await res.json();
  return data.eggs ?? [];
}
