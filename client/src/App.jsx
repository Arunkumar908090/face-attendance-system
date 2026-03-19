import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { ScanFace, UserPlus, Camera, Lock, Home as HomeIcon } from 'lucide-react';
import AdaptiveEnroll from './pages/AdaptiveEnroll';
import Attendance from './pages/Attendance';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import Home from './pages/Home';
import LiquidBackground from './components/LiquidBackground';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

// Protective wrapper for Admin routes
const ProtectedRoute = ({ children }) => {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  // Obscure and secure the access route; only valid tokens survive
  return isAdmin ? children : <Navigate to="/admin-login" replace />;
};

// Nav Link component for active state styling
const NavLink = ({ to, label, className = '' }) => {
  const location = useLocation();
  const isActive = location.pathname === to || (location.pathname === '/admin' && to === '/admin-login');

  return (
    <Link
      to={to}
      className={`${isActive ? 'active' : ''} ${className}`}
    >
      {label}
    </Link>
  );
};

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent swiping by adding a strict overflow block on the main container
  return (
    <ErrorBoundary>
      <Router>
        <div className="app-container" style={{ paddingBottom: isMobile ? '80px' : '0', overflowX: 'hidden', touchAction: isMobile ? 'pan-y' : 'auto' }}>
          <LiquidBackground />

          <nav className="navbar" style={isMobile ? { padding: '1rem', display: 'flex', justifyContent: 'center', background: 'transparent', boxShadow: 'none', border: 'none' } : { margin: '1rem', borderRadius: 'var(--radius-lg)' }}>
            <Link to="/" className="nav-brand" style={{ textDecoration: 'none' }}>
              <ScanFace className="text-primary" size={isMobile ? 36 : 28} />
              { !isMobile && "FaceAttend" }
            </Link>

            {!isMobile && (
              <div className="nav-links">
                <NavLink to="/" label="Home" />
                <NavLink to="/register" label="Enroll" />
                <NavLink to="/attendance" label="Scanner" />
                <NavLink to="/admin-login" label={<><Lock size={18} /> Lecturer</>} />
              </div>
            )}
          </nav>

          {isMobile && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--border-light)', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem calc(1rem + env(safe-area-inset-bottom)) 2rem', boxShadow: '0 -10px 40px rgba(0,0,0,0.08)' }}>
              
              <Link to="/" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94a3b8', textDecoration: 'none' }}>
                <HomeIcon size={28} style={{ marginBottom: '4px' }} />
                <span style={{ fontSize: '12px', fontWeight: 800 }}>Home</span>
              </Link>
              
              <Link to="/register" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary)', color: 'white', borderRadius: '50px', padding: '0.85rem 3rem', fontWeight: 800, fontSize: '15px', textDecoration: 'none', boxShadow: '0 8px 25px rgba(59,130,246,0.3)' }}>
                ENROLL NOW
              </Link>
            </div>
          )}

          <main className="main-content" style={isMobile ? { padding: '1rem', paddingTop: '0' } : {}}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/register" element={<AdaptiveEnroll />} />
              <Route path="/attendance" element={isMobile ? <Navigate to="/" replace /> : <Attendance />} />
              <Route path="/admin-login" element={isMobile ? <Navigate to="/" replace /> : <AdminLogin />} />
              <Route
                path="/admin"
                element={
                  isMobile ? <Navigate to="/" replace /> :
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
