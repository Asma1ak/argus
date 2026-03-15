import { useState, useEffect } from 'react';
import { useAuth } from '../../../context';
import api from '../../../services/api';
import type { UsageInfo } from '../../../types';
import styles from './UsageBadge.module.css';

interface UsageBadgeProps {
  onUpgradeClick?: () => void;
}

export function UsageBadge({ onUpgradeClick }: UsageBadgeProps) {
  const { isAuthenticated } = useAuth();
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadUsage();
    }
  }, [isAuthenticated]);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const { usage } = await api.getUsage();
      setUsage(usage);
    } catch (err) {
      console.error('Failed to load usage:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  // Show skeleton while loading
  if (loading) {
    return (
      <div className={styles.badge} aria-label="Loading usage...">
        <div className={`${styles.tierBadge} ${styles.skeleton}`} />
        <div className={styles.usageInfo}>
          <div className={`${styles.usageBar} ${styles.skeleton}`} />
        </div>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const isLow = usage.dailyRemaining <= 1 && usage.tier === 'free';
  const isUnlimited = usage.dailyLimit === Infinity || usage.tier === 'enterprise';

  return (
    <div className={styles.badge} role="status" aria-label={`${usage.tierName} tier: ${isUnlimited ? 'Unlimited' : `${usage.dailyRemaining} of ${usage.dailyLimit} analyses remaining`}`}>
      <div className={styles.tierBadge} data-tier={usage.tier}>
        {usage.tierName}
      </div>
      
      {!isUnlimited && (
        <div className={styles.usageInfo}>
          <div className={styles.usageBar} role="progressbar" aria-valuenow={usage.dailyUsed} aria-valuemax={usage.dailyLimit}>
            <div 
              className={styles.usageProgress} 
              style={{ width: `${usage.percentUsed}%` }}
              data-low={isLow}
            />
          </div>
          <span className={styles.usageText} data-low={isLow}>
            {usage.dailyRemaining}/{usage.dailyLimit}
          </span>
        </div>
      )}

      {usage.tier === 'free' && onUpgradeClick && (
        <button 
          className={styles.upgradeBtn} 
          onClick={onUpgradeClick}
          aria-label="Upgrade your plan"
        >
          <span aria-hidden="true">⚡</span> Upgrade
        </button>
      )}
    </div>
  );
}

export default UsageBadge;
