// La web y la API viven en el mismo origen (el backend sirve ambas), asi que
// una ruta relativa funciona sin importar el dominio/IP o si es http/https.
// En "npm run dev" (Vite en :5173) apunta al dominio publico (Cloudflare Tunnel),
// porque ahi la API no esta en el mismo origen.
export const CLASSIFY_ENDPOINT = import.meta.env.DEV
  ? 'https://eggclassify.javier.life/classify'
  : '/classify';

export const SCAN_INTERVAL_MS = 1200;

// El modelo trabaja a 640 px: enviar frames mas grandes solo encarece la
// codificacion JPEG y la subida sin mejorar la deteccion.
export const MAX_SCAN_WIDTH = 960;

export const COLORS = { good: '#4caf82', bad: '#e2664f' };
