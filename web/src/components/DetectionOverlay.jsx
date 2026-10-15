import { COLORS } from '../config';

// Dibuja las cajas sobre el contenedor padre (debe ser position: relative).
export default function DetectionOverlay({ eggs }) {
  return eggs.map((egg, i) => {
    const color = egg.label === 'bueno' ? COLORS.good : COLORS.bad;
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
  });
}
