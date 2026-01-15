import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { ScanFace, UserPlus, Camera, Lock, Home as HomeIcon } from 'lucide-react';
import Register from './pages/Register';
import Attendance from './pages/Attendance';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import Home from './pages/Home';
import LiquidBackground from './components/LiquidBackground';
import './index.css';

// Protective wrapper for Admin routes
const ProtectedRoute = ({ children }) => {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  return isAdmin ? children : <Navigate to="/admin-login" replace />;
};

// Nav Link component for active state styling
const NavLink = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`nav-link ${isActive ? 'active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0.6rem 1.25rem',
        borderRadius: '50px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        // Colors handled by css class 'nav-links a' but inline overrides if needed
        textDecoration: 'none',
        fontSize: '0.95rem'
      }}
    >
      <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <LiquidBackground />

        <nav className="navbar">
          <Link to="/" className="nav-brand">
            <div style={{ background: 'var(--primary)', color: 'white', padding: '8px', borderRadius: '12px', boxShadow: '0 0 15px var(--primary-glow)' }}>
              <ScanFace size={24} />
            </div>
            <span>FaceAttend</span>
          </Link>

          <div className="nav-links">
            <NavLink to="/" icon={HomeIcon} label="Home" />
            <NavLink to="/register" icon={UserPlus} label="Enroll" />
            <NavLink to="/attendance" icon={Camera} label="Scanner" />
            <NavLink to="/admin" icon={Lock} label="Admin" />
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
