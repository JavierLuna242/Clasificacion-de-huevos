// La web y la API viven en el mismo origen (el backend sirve ambas), asi que
// una ruta relativa funciona sin importar el dominio/IP o si es http/https.
// En "npm run dev" (Vite en :5173) apunta directo al EC2 por HTTPS, porque
// ahi la API no esta en el mismo origen.
export const CLASSIFY_ENDPOINT = import.meta.env.DEV
  ? 'https://54.83.16.222:8443/classify'
  : '/classify';

export const SCAN_INTERVAL_MS = 1200;
