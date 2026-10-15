import { Link } from 'react-router-dom';
import { clearHistory, removeRecord, useHistory } from '../lib/history';

export default function History() {
  const history = useHistory();

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <h2>Historial</h2>
          <p className="muted">Guardado en este navegador · {history.length} registros</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-danger"
            disabled={!history.length}
            onClick={() => window.confirm('¿Borrar todo el historial?') && clearHistory()}
          >
            Borrar todo
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="card empty">
          <p className="muted">Aún no hay registros.</p>
          <Link className="btn" to="/">
            Ir al escáner
          </Link>
        </div>
      ) : (
        <ul className="history-list">
          {history.map((r) => (
            <li key={r.id} className="card history-item">
              {r.thumb ? <img src={r.thumb} alt="" className="thumb" /> : <div className="thumb thumb-empty">🥚</div>}
              <div className="history-main">
                <strong>{r.name}</strong>
                <span className="muted">
                  {new Date(r.date).toLocaleString('es')}
                </span>
              </div>
              <div className="chips">
                <span className="chip">{r.total} huevos</span>
                <span className="chip chip-good">{r.good} buenos</span>
                <span className="chip chip-bad">{r.bad} rotos</span>
              </div>
              <button className="icon-btn" title="Eliminar" onClick={() => removeRecord(r.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
