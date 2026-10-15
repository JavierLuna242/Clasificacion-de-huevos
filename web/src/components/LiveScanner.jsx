import { useEffect, useRef, useState } from 'react';
import { COLORS, SCAN_INTERVAL_MS } from '../config';
import { classify, toJpeg, toThumb } from '../lib/api';
import { addRecord } from '../lib/history';
import { countLabels, mergeDetections } from '../lib/tracking';
import DetectionOverlay from './DetectionOverlay';
import StatRow from './StatRow';

const EMPTY = { total: 0, good: 0, bad: 0 };

export default function LiveScanner() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const eggsRef = useRef([]); // huevos rastreados (fuente de verdad; el estado solo pinta)
  const sessionRef = useRef(EMPTY);
  const thumbRef = useRef(null); // ultima miniatura con huevos nuevos

  const [ready, setReady] = useState(false);
  const [camError, setCamError] = useState(null);
  const [aspect, setAspect] = useState(4 / 3); // alto/ancho; se recalibra al abrir la cámara
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [eggs, setEggs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [session, setSession] = useState(EMPTY);

  // Pide la cámara una sola vez al montar.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      // 720p/30fps: sin pedir nada el navegador suele dar 640x480, pero pedir
      // mas (p. ej. 1920x1440) hace que webcams USB como las Logitech caigan
      // a modos de pocos fps y el video se ve entrecortado.
      ?.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
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

  // Guarda la sesión en el historial (si hubo huevos) y arranca otra en cero.
  const saveSession = () => {
    const s = sessionRef.current;
    if (!s.total) return;
    addRecord({ name: 'Sesión en vivo', ...s, thumb: thumbRef.current });
    sessionRef.current = EMPTY;
    setSession(EMPTY);
  };

  // Al salir de la pantalla (cambiar de pestaña/página) la sesión se guarda sola.
  useEffect(() => saveSession, []);

  const scan = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    setBusy(true);
    try {
      const found = await classify(await toJpeg(video, video.videoWidth, video.videoHeight));
      const { merged, added } = mergeDetections(eggsRef.current, found, Date.now());
      eggsRef.current = merged;
      setEggs(merged);
      if (added.length > 0) {
        const c = countLabels(added);
        const s = sessionRef.current;
        sessionRef.current = { total: s.total + c.total, good: s.good + c.good, bad: s.bad + c.bad };
        setSession(sessionRef.current);
        thumbRef.current = toThumb(video, video.videoWidth, video.videoHeight);
      }
      setErrorMsg(null);
    } catch {
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

  const now = countLabels(eggs);

  let hint = 'Apunta la cámara a los huevos';
  if (camError) hint = 'No se pudo acceder a la cámara';
  else if (paused) hint = 'Escaneo en pausa';
  else if (errorMsg) hint = errorMsg;
  else if (busy) hint = 'Analizando…';
  const statusKind = camError || errorMsg ? 'warn' : paused ? 'idle' : 'live';

  return (
    <div className="layout">
      <section className="card frame">
        <div className="video-frame" style={{ aspectRatio: `1 / ${aspect}` }}>
          <video ref={videoRef} autoPlay playsInline muted className="video" />

          {camError && (
            <div className="cam-error">
              <p>{camError}</p>
              <p className="cam-error-hint">Habilita el acceso a la cámara en el navegador y recarga.</p>
            </div>
          )}

          {!paused && <DetectionOverlay eggs={eggs} />}

          <div className={`status ${statusKind}`}>
            <i />
            {hint}
          </div>
        </div>

        <div className="controls">
          <button className="btn btn-primary" onClick={() => setPaused((p) => !p)} disabled={!ready}>
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
        <div className="card chalkboard">
          <h2 className="card-title">En cámara ahora</h2>
          {eggs.length === 0 ? (
            <p className="chalk-empty">🔍 Aún no se detecta ningún huevo.</p>
          ) : (
            <>
              <StatRow {...now} />
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

        <div className="card">
          <h2 className="card-title">Sesión</h2>
          <StatRow {...session} totalLabel="escaneados" />
          <button className="btn btn-block" onClick={saveSession} disabled={!session.total}>
            Terminar y guardar en el historial
          </button>
        </div>
      </section>
    </div>
  );
}
