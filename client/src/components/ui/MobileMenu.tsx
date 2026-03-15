import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context';
import { ThemeToggle } from '../features/theme/ThemeToggle';
import styles from './MobileMenu.module.css';

interface MobileMenuProps {
  onUpgradeClick: () => void;
}

export function MobileMenu({ onUpgradeClick }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  return (
    <>
      {/* Hamburger Button */}
      <button 
        className={styles.hamburger}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
      >
        <span className={`${styles.bar} ${isOpen ? styles.open : ''}`} />
        <span className={`${styles.bar} ${isOpen ? styles.open : ''}`} />
        <span className={`${styles.bar} ${isOpen ? styles.open : ''}`} />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div 
          className={styles.overlay} 
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Menu */}
      <nav className={`${styles.menu} ${isOpen ? styles.open : ''}`} aria-label="Mobile navigation">
        <div className={styles.menuHeader}>
          <span className={styles.menuTitle}>Menu</span>
          <ThemeToggle />
        </div>

        {isAuthenticated && user && (
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              {user.name?.charAt(0) || user.email.charAt(0).toUpperCase()}
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{user.name || 'User'}</span>
              <span className={styles.userEmail}>{user.email}</span>
              <span className={`${styles.tierBadge} ${styles[user.tier || 'free']}`}>
                {user.tier?.toUpperCase() || 'FREE'}
              </span>
            </div>
          </div>
        )}

        <div className={styles.links}>
          <Link to="/" className={styles.link}>
            <span className={styles.linkIcon}>🏠</span>
            Home
          </Link>
          
          {isAuthenticated ? (
            <>
              <Link to="/history" className={styles.link}>
                <span className={styles.linkIcon}>📜</span>
                History
              </Link>
              <Link to="/dashboard" className={styles.link}>
                <span className={styles.linkIcon}>📊</span>
                Dashboard
              </Link>
              {user?.tier === 'free' && (
                <button 
                  className={`${styles.link} ${styles.upgrade}`}
                  onClick={() => { onUpgradeClick(); setIsOpen(false); }}
                >
                  <span className={styles.linkIcon}>⚡</span>
                  Upgrade to Pro
                </button>
              )}
              <button 
                className={`${styles.link} ${styles.logout}`}
                onClick={handleLogout}
              >
                <span className={styles.linkIcon}>🚪</span>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/pricing" className={styles.link}>
                <span className={styles.linkIcon}>💰</span>
                Pricing
              </Link>
              <Link to="/login" className={styles.link}>
                <span className={styles.linkIcon}>🔑</span>
                Login
              </Link>
              <Link to="/register" className={`${styles.link} ${styles.register}`}>
                <span className={styles.linkIcon}>✨</span>
                Sign Up Free
              </Link>
            </>
          )}
        </div>

        <div className={styles.menuFooter}>
          <p>Argus • Critical Thinking Assistant</p>
        </div>
      </nav>
    </>
  );
}

export default MobileMenu;
