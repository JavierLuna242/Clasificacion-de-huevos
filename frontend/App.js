import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Animated,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CLASSIFY_ENDPOINT } from './src/config';

const COLORS = {
  good: '#34C759',
  bad: '#FF3B30',
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const scale = useRef(new Animated.Value(1)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  const showCard = () => {
    cardAnim.setValue(0);
    Animated.spring(cardAnim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionEmoji}>🥚</Text>
        <Text style={styles.permissionTitle}>Escáner de Huevos</Text>
        <Text style={styles.permissionText}>
          Necesitamos acceso a tu cámara para poder escanear y clasificar los huevos.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Dar acceso a la cámara</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const scan = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      const form = new FormData();
      form.append('image', {
        uri: photo.uri,
        name: 'huevo.jpg',
        type: 'image/jpeg',
      });

      const res = await fetch(CLASSIFY_ENDPOINT, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Servidor respondió ${res.status}`);
      const data = await res.json();
      setResult(data);
      showCard();
    } catch (err) {
      Alert.alert('Error al clasificar', err.message);
    } finally {
      setBusy(false);
    }
  };

  const isGood = result?.label === 'bueno';

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.header} pointerEvents="none">
        <Text style={styles.headerText}>Escáner de Huevos</Text>
      </SafeAreaView>

      <View style={styles.guideFrame} pointerEvents="none">
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      {result && (
        <Animated.View
          style={[
            styles.resultCard,
            {
              borderColor: isGood ? COLORS.good : COLORS.bad,
              opacity: cardAnim,
              transform: [
                { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
              ],
            },
          ]}
        >
          <BlurView intensity={60} tint="dark" style={styles.resultCardBlur}>
            <Text style={styles.resultEmoji}>{isGood ? '✅' : '❌'}</Text>
            <Text style={[styles.resultLabel, { color: isGood ? COLORS.good : COLORS.bad }]}>
              {isGood ? 'Huevo bueno' : 'Huevo roto'}
            </Text>
            {typeof result.confidence === 'number' && (
              <Text style={styles.resultConfidence}>
                {Math.round(result.confidence * 100)}% de confianza
              </Text>
            )}
          </BlurView>
        </Animated.View>
      )}

      <BlurView intensity={50} tint="dark" style={styles.bottomPanel}>
        <SafeAreaView>
          <Text style={styles.hint}>
            {busy ? 'Analizando huevo…' : 'Centra el huevo en el marco y escanea'}
          </Text>
          <View style={styles.shutterRow}>
            <Pressable
              onPressIn={pressIn}
              onPressOut={pressOut}
              onPress={scan}
              disabled={busy}
              hitSlop={12}
            >
              <Animated.View
                style={[
                  styles.shutterOuter,
                  { transform: [{ scale }], opacity: busy ? 0.5 : 1 },
                ]}
              >
                <View style={styles.shutterInner} />
              </Animated.View>
            </Pressable>
          </View>
        </SafeAreaView>
      </BlurView>

      <StatusBar style="light" />
    </View>
  );
}

const FRAME_SIZE = 240;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  permissionContainer: {
    flex: 1,
    backgroundColor: '#0B0B0C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionEmoji: { fontSize: 56, marginBottom: 8 },
  permissionTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  permissionText: { fontSize: 15, color: '#9BA1A6', textAlign: 'center', lineHeight: 21 },
  permissionButton: {
    marginTop: 12,
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  permissionButtonText: { fontSize: 16, fontWeight: '600', color: '#000' },

  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  header: { alignItems: 'center', paddingTop: 8 },
  headerText: { color: '#fff', fontSize: 17, fontWeight: '600', letterSpacing: 0.3 },

  guideFrame: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    marginLeft: -FRAME_SIZE / 2,
    marginTop: -FRAME_SIZE / 2 - 40,
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },

  resultCard: {
    position: 'absolute',
    bottom: 220,
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  resultCardBlur: {
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 4,
  },
  resultEmoji: { fontSize: 28 },
  resultLabel: { fontSize: 19, fontWeight: '700' },
  resultConfidence: { fontSize: 13, color: '#D1D1D6' },

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
    marginBottom: 18,
  },
  shutterRow: { alignItems: 'center', paddingBottom: 14 },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
});
