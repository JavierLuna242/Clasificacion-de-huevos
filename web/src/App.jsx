import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import History from './pages/History';
import Scanner from './pages/Scanner';
import Stats from './pages/Stats';

const NAV = [
  ['/', 'Escáner'],
  ['/historial', 'Historial'],
  ['/estadisticas', 'Estadísticas'],
];

// Para agregar una pagina: crear pages/Algo.jsx, una <Route> abajo y una fila en NAV.
export default function App() {
  return (
    <div className="page">
      <header className="masthead">
        <div className="gingham" />
        <div className="masthead-inner">
          <img src="/logo.jpg" alt="EggClassify" className="logo" />
          <h1>EggClassify</h1>
          <p className="tagline">Clasificación de huevos fácil</p>
          <nav className="nav">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <div className="content">
        <Routes>
          <Route path="/" element={<Scanner />} />
          <Route path="/historial" element={<History />} />
          <Route path="/estadisticas" element={<Stats />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <footer className="footer">
        <div className="gingham" />
        <p>EggClassify · Detección con YOLO11 · Proyecto de Ciencia de Datos</p>
      </footer>
    </div>
  );
}
