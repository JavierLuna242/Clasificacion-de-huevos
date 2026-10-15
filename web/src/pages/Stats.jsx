import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COLORS } from '../config';
import { useHistory } from '../lib/history';

const DAY_MS = 86_400_000;
const RANGES = [
  [7, '7 días'],
  [30, '30 días'],
  [0, 'Todo'],
];

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local

// Totales por día; con rango fijo incluye los días sin datos para no distorsionar la gráfica.
function groupByDay(records, range, now) {
  const days = new Map();
  if (range) {
    for (let i = range - 1; i >= 0; i--) days.set(dayKey(now - i * DAY_MS), { good: 0, bad: 0 });
  }
  [...records].reverse().forEach((r) => {
    const k = dayKey(r.date);
    if (!days.has(k)) days.set(k, { good: 0, bad: 0 });
    days.get(k).good += r.good;
    days.get(k).bad += r.bad;
  });
  return [...days].slice(-60);
}

export default function Stats() {
  const history = useHistory();
  const [range, setRange] = useState(7);
  const [now] = useState(Date.now); // fijo al montar: mantiene el render puro

  const cutoff = range ? now - range * DAY_MS : 0;
  const records = history.filter((r) => +new Date(r.date) >= cutoff);
  const good = records.reduce((n, r) => n + r.good, 0);
  const bad = records.reduce((n, r) => n + r.bad, 0);
  const total = good + bad;
  const badPct = total ? Math.round((bad / total) * 100) : 0;
  const days = groupByDay(records, range, now);
  const maxDay = Math.max(1, ...days.map(([, d]) => d.good + d.bad));

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h2>Estadísticas</h2>
          <p className="muted">Calculadas con el historial de este navegador</p>
        </div>
        <div className="tabs">
          {RANGES.map(([id, label]) => (
            <button key={id} className={`tab${range === id ? ' active' : ''}`} onClick={() => setRange(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <div className="card empty">
          <p className="muted">No hay datos en este periodo.</p>
          <Link className="btn" to="/">
            Ir al escáner
          </Link>
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="card kpi">
              <span className="stat-label">Huevos analizados</span>
              <span className="kpi-value">{total}</span>
            </div>
            <div className="card kpi">
              <span className="stat-label">Buenos</span>
              <span className="kpi-value" style={{ color: COLORS.good }}>
                {good}
              </span>
            </div>
            <div className="card kpi">
              <span className="stat-label">Rotos</span>
              <span className="kpi-value" style={{ color: COLORS.bad }}>
                {bad}
              </span>
            </div>
            <div className="card kpi">
              <span className="stat-label">Registros</span>
              <span className="kpi-value">{records.length}</span>
            </div>
          </div>

          <div className="stats-grid">
            <div className="card">
              <h2 className="card-title">Huevos por día</h2>
              <div className="bars">
                {days.map(([day, d]) => (
                  <div key={day} className="bar-col" title={`${day}: ${d.good} buenos, ${d.bad} rotos`}>
                    <div className="bar">
                      <div style={{ height: `${(d.bad / maxDay) * 100}%`, background: COLORS.bad }} />
                      <div style={{ height: `${(d.good / maxDay) * 100}%`, background: COLORS.good }} />
                    </div>
                    <span className="bar-label">{day.slice(8)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">Proporción</h2>
              <div
                className="donut"
                style={{
                  background: `conic-gradient(${COLORS.bad} 0 ${badPct}%, ${COLORS.good} ${badPct}% 100%)`,
                }}
              >
                <div className="donut-hole">
                  <strong>{badPct}%</strong>
                  <span className="stat-label">rotos</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
