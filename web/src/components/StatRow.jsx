export default function StatRow({ total, good, bad, totalLabel = 'huevos' }) {
  return (
    <div className="stat-row">
      <div className="stat">
        <span className="stat-value">{total}</span>
        <span className="stat-label">{totalLabel}</span>
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
  );
}
