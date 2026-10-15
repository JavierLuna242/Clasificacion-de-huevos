export const TRACK_GRACE_MS = 2500; // ~2 capturas: un huevo que no se detecta una vez no desaparece de golpe

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
export function mergeDetections(tracked, detections, now) {
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

export function countLabels(eggs) {
  const good = eggs.filter((e) => e.label === 'bueno').length;
  return { total: eggs.length, good, bad: eggs.length - good };
}
