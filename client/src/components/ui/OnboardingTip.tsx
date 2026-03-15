import { useState, useEffect } from 'react';
import styles from './OnboardingTip.module.css';

interface OnboardingTipProps {
  id: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom';
  children: React.ReactNode;
}

export function OnboardingTip({ 
  id, 
  title, 
  description, 
  position = 'bottom',
  children 
}: OnboardingTipProps) {
  const [show, setShow] = useState(false);
  const storageKey = `onboarding_${id}_dismissed`;

  useEffect(() => {
    // Check if user has dismissed this tip
    const dismissed = localStorage.getItem(storageKey);
    if (!dismissed) {
      // Show tip after a small delay
      const timer = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(storageKey, 'true');
  };

  return (
    <div className={styles.container}>
      {children}
      
      {show && (
        <div 
          className={`${styles.tip} ${styles[position]}`}
          role="tooltip"
          aria-live="polite"
        >
          <div className={styles.tipContent}>
            <div className={styles.tipIcon}>💡</div>
            <div>
              <strong className={styles.tipTitle}>{title}</strong>
              <p className={styles.tipDescription}>{description}</p>
            </div>
          </div>
          <button 
            className={styles.tipDismiss} 
            onClick={handleDismiss}
            aria-label="Dismiss tip"
          >
            Got it!
          </button>
          <div className={styles.tipArrow} />
        </div>
      )}
    </div>
  );
}

export function WelcomeBanner() {
  const [show, setShow] = useState(false);
  const storageKey = 'onboarding_welcome_dismissed';

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    if (!dismissed) {
      setShow(true);
    }
  }, []);

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(storageKey, 'true');
  };

  if (!show) return null;

  return (
    <div className={styles.welcomeBanner} role="region" aria-label="Welcome message">
      <div className={styles.welcomeContent}>
        <span className={styles.welcomeIcon}>👋</span>
        <div>
          <strong>Welcome to Argus!</strong>
          <p>Paste any text below to analyze it for logical fallacies, cognitive biases, and manipulation tactics. Try one of the examples to see how it works!</p>
        </div>
      </div>
      <button 
        className={styles.welcomeDismiss} 
        onClick={handleDismiss}
        aria-label="Dismiss welcome message"
      >
        ×
      </button>
    </div>
  );
}

export default OnboardingTip;
