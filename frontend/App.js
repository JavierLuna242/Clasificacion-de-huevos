import { useEffect, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { Image, Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CLASSIFY_ENDPOINT } from './src/config';
import logo from './assets/logo.jpg';

const COLORS = { good: '#4caf82', bad: '#e2664f', accent: '#3a7bbf' };
const SCAN_INTERVAL_MS = 1200;
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
// un solo frame fallido no las haga parpadear.
function mergeDetections(tracked, detections, now) {
  const used = new Set();
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
    if (!used.has(i)) kept.push({ ...d, lastSeen: now });
  });

  return kept.filter((e) => now - e.lastSeen <= TRACK_GRACE_MS);
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const { width: winWidth } = useWindowDimensions();

  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [eggs, setEggs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  // Relacion alto/ancho real de las fotos, calibrada con la primera captura.
  // Sin esto el visor (fullscreen, "cover") recorta distinto que la foto que
  // clasifica el modelo y las cajas quedan desalineadas.
  const aspectRef = useRef(null);

  const scan = async () => {
    if (!cameraRef.current) return;
    setBusy(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.6, shutterSound: false });
      if (aspectRef.current == null) {
        const { width, height } = await new Promise((resolve, reject) =>
          Image.getSize(shot.uri, (w, h) => resolve({ width: w, height: h }), reject)
        );
        aspectRef.current = height / width;
      }
      // El objeto {uri,name,type} de FormData falla en RN nuevo ("Unsupported
      // FormData part implementation"); un Blob real sí funciona siempre.
      const blob = await (await fetch(shot.uri)).blob();
      const form = new FormData();
      form.append('image', blob, 'huevo.jpg');

      const res = await fetch(CLASSIFY_ENDPOINT, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Servidor respondió ${res.status}`);
      const data = await res.json();
      setEggs((prev) => mergeDetections(prev, data.eggs ?? [], Date.now()));
      setErrorMsg(null);
    } catch (err) {
      setErrorMsg('Sin conexión con el servidor, reintentando…');
    } finally {
      setBusy(false);
    }
  };

  // Escaneo continuo: toma una foto, espera la respuesta y agenda la
  // siguiente. Nunca hay dos peticiones en vuelo.
  useEffect(() => {
    if (!permission?.granted || paused) return undefined;
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
  }, [permission?.granted, paused]);

  if (!permission || !permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Image source={logo} style={styles.permissionLogo} />
        <Text style={styles.permissionTitle}>EggClassify</Text>
        <Text style={styles.permissionTagline}>Clasificación de huevos fácil</Text>
        <Text style={styles.permissionText}>
          Necesitamos acceso a tu cámara para poder escanear y clasificar los huevos.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Dar acceso a la cámara</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const aspect = aspectRef.current ?? 4 / 3; // estimado hasta calibrar con la primera foto
  const camWidth = winWidth;
  const camHeight = winWidth * aspect;

  let hint = 'Apunta la cámara a los huevos';
  if (paused) hint = 'Escaneo en pausa';
  else if (errorMsg) hint = errorMsg;
  else if (busy) hint = 'Analizando…';

  return (
    <View style={styles.container}>
      <View style={[styles.camWrap, { width: camWidth, height: camHeight }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        {!paused &&
          eggs.map((egg, i) => {
            const isGood = egg.label === 'bueno';
            const color = isGood ? COLORS.good : COLORS.bad;
            const [x1, y1, x2, y2] = egg.box;
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    borderColor: color,
                    left: x1 * camWidth,
                    top: y1 * camHeight,
                    width: (x2 - x1) * camWidth,
                    height: (y2 - y1) * camHeight,
                  },
                ]}
              >
                <Text style={[styles.boxLabel, { backgroundColor: color }]}>
                  {egg.label} {Math.round(egg.confidence * 100)}%
                </Text>
              </View>
            );
          })}
      </View>

      <SafeAreaView style={styles.header} pointerEvents="none">
        <Image source={logo} style={styles.headerLogo} />
        <Text style={styles.headerText}>EggClassify</Text>
      </SafeAreaView>

      <BlurView intensity={50} tint="dark" style={styles.bottomPanel}>
        <SafeAreaView>
          <Text style={styles.hint}>{hint}</Text>
          <View style={styles.pauseRow}>
            <Pressable style={styles.pauseButton} onPress={() => setPaused((p) => !p)} hitSlop={12}>
              <Text style={styles.pauseButtonText}>{paused ? '▶  Reanudar' : '⏸  Pausar'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </BlurView>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },

  permissionContainer: {
    flex: 1,
    backgroundColor: '#eaf3f8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  permissionLogo: { width: 96, height: 96, borderRadius: 20, marginBottom: 8 },
  permissionTitle: { fontSize: 24, fontWeight: '800', color: '#16324f' },
  permissionTagline: { fontSize: 14, color: '#3a7bbf', fontWeight: '600', marginBottom: 8 },
  permissionText: { fontSize: 15, color: '#708ba0', textAlign: 'center', lineHeight: 21 },
  permissionButton: {
    marginTop: 12,
    backgroundColor: '#3a7bbf',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  camWrap: { backgroundColor: '#000' },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 8,
  },
  headerLogo: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  headerText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },

  box: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 6,
  },
  boxLabel: {
    position: 'absolute',
    top: -22,
    left: -2.5,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },

  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  hint: {
    textAlign: 'center',
    color: '#E5E5EA',
    fontSize: 14,
    marginBottom: 16,
  },
  pauseRow: { alignItems: 'center', paddingBottom: 20 },
  pauseButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  pauseButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
