import LiveScanner from '../components/LiveScanner';

const STEPS = [
  ['Apunta', 'Coloca los huevos frente a la cámara, con buena luz.'],
  ['Analiza', 'El modelo YOLO11 los detecta y clasifica en vivo, cada ~1.2s.'],
  ['Resultado', 'Ve cuáles están buenos y cuáles rotos, con su confianza.'],
];

export default function Scanner() {
  return (
    <>
      <section className="hero">
        <div>
          <span className="badge">YOLO11 · Tiempo real</span>
          <h2>Detecta huevos rotos en tiempo real</h2>
          <p>
            Apunta la cámara a los huevos y un modelo YOLO11 los detecta, clasifica como{' '}
            <strong className="mark-good">bueno</strong> o <strong className="mark-bad">roto</strong> y te
            muestra el resultado al instante.
          </p>
        </div>

        <ol className="recipe">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="egg-num">{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <LiveScanner />
    </>
  );
}
