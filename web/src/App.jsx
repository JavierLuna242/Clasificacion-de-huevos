import { useEffect, useRef, useState } from 'react';
import { CLASSIFY_ENDPOINT, SCAN_INTERVAL_MS } from './config';
import './index.css';

const COLORS = { good: '#4caf82', bad: '#e2664f' };
const TRACK_GRACE_MS = 2500; // ~2 capturas: un huevo que no se detecta una vez no desaparece de golpe

function boxIou([ax1, ay1, ax2, ay2], [bx1, by1, bx2, by2]) {
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const inter = ix * iy;
  const union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter;
  return union > 0 ? inter / union : 0;
}

// Empareja las detecciones nuevas con las que ya veniamos mostrando (por
// solape de caja) y les da un tiempo de gracia antes de quitarlas, para que
// un solo frame fallido no las haga parpadear. Devuelve tambien cuales son
// huevos "nuevos" (no vistos antes) para poder acumular el total de la sesion.
function mergeDetections(tracked, detections, now) {
  const used = new Set();
  const added = [];
  const kept = tracked.map((t) => {
    let bestIdx = -1;
    let bestIou = 0.3;
    detections.forEach((d, i) => {
      if (used.has(i)) return;
      const v = boxIou(t.box, d.box);
      if (v > bestIou) {
        bestIou = v;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      return { ...detections[bestIdx], lastSeen: now };
    }
    return t;
  });

  detections.forEach((d, i) => {
    if (!used.has(i)) {
      const entry = { ...d, lastSeen: now };
      kept.push(entry);
      added.push(entry);
    }
  });

  return { merged: kept.filter((e) => now - e.lastSeen <= TRACK_GRACE_MS), added };
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
  const streamRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [aspect, setAspect] = useState(4 / 3); // alto/ancho; se recalibra al abrir la cámara
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [eggs, setEggs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [session, setSession] = useState({ total: 0, good: 0, bad: 0 });

  // Pide la cámara una sola vez al montar.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      // Sin esto el navegador suele dar 640x480 por defecto, mucho peor que
      // la camara del celular con Expo Go.
      ?.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          setAspect(video.videoHeight / video.videoWidth);
          setReady(true);
        };
      })
      .catch((err) => setCamError(err.message || 'No se pudo acceder a la cámara'));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const scan = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setBusy(true);
    try {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));

      const form = new FormData();
      form.append('image', blob, 'huevo.jpg');

      const res = await fetch(CLASSIFY_ENDPOINT, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Servidor respondió ${res.status}`);
      const data = await res.json();
      setEggs((prev) => {
        const { merged, added } = mergeDetections(prev, data.eggs ?? [], Date.now());
        if (added.length > 0) {
          const addedGood = added.filter((e) => e.label === 'bueno').length;
          setSession((s) => ({
            total: s.total + added.length,
            good: s.good + addedGood,
            bad: s.bad + (added.length - addedGood),
          }));
        }
        return merged;
      });
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg('Sin conexión con el servidor, reintentando…');
    } finally {
      setBusy(false);
    }
  };

  // Escaneo continuo: captura, espera respuesta, agenda la siguiente.
  // Nunca hay dos peticiones en vuelo.
  useEffect(() => {
    if (!ready || paused) return undefined;
    let cancelled = false;
    let timer;

    const tick = async () => {
      if (cancelled) return;
      await scan();
      if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, paused]);

  const good = eggs.filter((e) => e.label === 'bueno').length;
  const bad = eggs.filter((e) => e.label === 'roto').length;

  let hint = 'Apunta la cámara a los huevos';
  if (camError) hint = 'No se pudo acceder a la cámara';
  else if (paused) hint = 'Escaneo en pausa';
  else if (errorMsg) hint = errorMsg;
  else if (busy) hint = 'Analizando…';

  return (
    <div className="page">
      <header className="topbar">
        <img src="/logo.jpg" alt="EggClassify" className="logo" />
        <div>
          <h1>EggClassify</h1>
          <p className="tagline">Clasificación de huevos fácil</p>
        </div>
      </header>

      <section className="hero">
        <h2>Detecta huevos rotos en tiempo real</h2>
        <p>
          Apunta la cámara a los huevos y un modelo YOLO11 los detecta, clasifica como{' '}
          <strong>bueno</strong> o <strong>roto</strong> y te muestra el resultado al instante.
        </p>
      </section>

      <main className="layout">
        <section className="scanner-card">
          <div className="video-frame" style={{ aspectRatio: `1 / ${aspect}` }}>
            <video ref={videoRef} autoPlay playsInline muted className="video" />

            {camError && (
              <div className="cam-error">
                <p>{camError}</p>
                <p className="cam-error-hint">Habilita el acceso a la cámara en el navegador y recarga.</p>
              </div>
            )}

            {!paused &&
              eggs.map((egg, i) => {
                const isGood = egg.label === 'bueno';
                const color = isGood ? COLORS.good : COLORS.bad;
                const [x1, y1, x2, y2] = egg.box;
                return (
                  <div
                    key={i}
                    className="egg-box"
                    style={{
                      borderColor: color,
                      left: `${x1 * 100}%`,
                      top: `${y1 * 100}%`,
                      width: `${(x2 - x1) * 100}%`,
                      height: `${(y2 - y1) * 100}%`,
                    }}
                  >
                    <span className="egg-tag" style={{ background: color }}>
                      {egg.label} {Math.round(egg.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
          </div>

          <p className="hint">{hint}</p>

          <div className="controls">
            <button className="pause-btn" onClick={() => setPaused((p) => !p)} disabled={!ready}>
              {paused ? '▶  Reanudar' : '⏸  Pausar'}
            </button>
            <div className="legend">
              <span className="legend-item">
                <i style={{ background: COLORS.good }} /> Bueno
              </span>
              <span className="legend-item">
                <i style={{ background: COLORS.bad }} /> Roto
              </span>
            </div>
          </div>
        </section>

        <section className="side">
          <div className="summary-card">
            <h2>En cámara ahora</h2>
            {eggs.length === 0 ? (
              <p className="summary-empty">🔍 Aún no se detecta ningún huevo.</p>
            ) : (
            <>
              <div className="stat-row">
                <div className="stat">
                  <span className="stat-value">{eggs.length}</span>
                  <span className="stat-label">huevos</span>
                </div>
                <div className="stat stat-good">
                  <span className="stat-value">{good}</span>
                  <span className="stat-label">buenos</span>
                </div>
                <div className="stat stat-bad">
                  <span className="stat-value">{bad}</span>
                  <span className="stat-label">rotos</span>
                </div>
              </div>
              <ul className="egg-list">
                {eggs.map((egg, i) => (
                  <li key={i} className={egg.label === 'bueno' ? 'good' : 'bad'}>
                    <span>Huevo {i + 1}</span>
                    <span>
                      {egg.label} · {Math.round(egg.confidence * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
            )}
          </div>

          <div className="summary-card">
            <h2>Sesión</h2>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-value">{session.total}</span>
                <span className="stat-label">escaneados</span>
              </div>
              <div className="stat stat-good">
                <span className="stat-value">{session.good}</span>
                <span className="stat-label">buenos</span>
              </div>
              <div className="stat stat-bad">
                <span className="stat-value">{session.bad}</span>
                <span className="stat-label">rotos</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="how">
        <div className="how-step">
          <span className="how-num">1</span>
          <h3>Apunta</h3>
          <p>Coloca los huevos frente a la cámara, con buena luz.</p>
        </div>
        <div className="how-step">
          <span className="how-num">2</span>
          <h3>Analiza</h3>
          <p>El modelo YOLO11 los detecta y clasifica en vivo, cada ~1.2s.</p>
        </div>
        <div className="how-step">
          <span className="how-num">3</span>
          <h3>Resultado</h3>
          <p>Ve cuáles están buenos y cuáles rotos, con su confianza.</p>
        </div>
      </section>

      <footer className="footer">
        <p>EggClassify · Detección con YOLO11 · Proyecto de Ciencia de Datos</p>
      </footer>
    </div>
  );
}
