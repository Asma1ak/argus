import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider, ThemeProvider, AnalysisProvider, useAuth } from './context';
import { ThemeToggle } from './components/features/theme/ThemeToggle';
import { UsageBadge, PricingModal } from './components/features/tier';
import { ErrorBoundary, ToastProvider, MobileMenu } from './components/ui';
import './styles/index.css';

// Lazy load pages for better performance
import { Suspense, lazy, useState } from 'react';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const SharedPage = lazy(() => import('./pages/SharedPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));

function Header() {
  const { isAuthenticated, user, logout } = useAuth();
  const [showPricing, setShowPricing] = useState(false);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <>
      <header className="header">
        <Link to="/" className="logo">
          <img src="/favicon.svg" alt="Argus" className="logo-icon" />
          <span className="logo-text">ARGUS</span>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="nav desktop-nav" aria-label="Main navigation">
          {isAuthenticated ? (
            <>
              <UsageBadge onUpgradeClick={() => setShowPricing(true)} />
              <Link to="/history">History</Link>
              <Link to="/dashboard">Dashboard</Link>
              <button 
                onClick={handleLogout} 
                className="nav-logout-btn"
                aria-label="Log out of your account"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/pricing">Pricing</Link>
              <Link to="/login">Login</Link>
              <Link to="/register" className="nav-register-btn">Sign Up</Link>
            </>
          )}
          <ThemeToggle />
        </nav>

        {/* Mobile Navigation */}
        <MobileMenu onUpgradeClick={() => setShowPricing(true)} />
      </header>
      
      <PricingModal 
        isOpen={showPricing} 
        onClose={() => setShowPricing(false)}
        currentTier={user?.tier || 'free'}
      />
    </>
  );
}

function Loading() {
  return (
    <div className="loading-container" role="status" aria-label="Loading">
      <div className="loading-spinner" />
      <span className="loading-text">Loading...</span>
    </div>
  );
}

function AppContent() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <div className="container">
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/share/:shareId" element={<SharedPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <footer className="footer">
        <p>Built with 🧠 for critical thinkers • <a href="https://github.com/yourusername/argus" target="_blank" rel="noopener noreferrer">GitHub</a></p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AnalysisProvider>
              <ToastProvider>
                <AppContent />
              </ToastProvider>
            </AnalysisProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
