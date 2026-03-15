import { useState, useEffect } from 'react';
import api from '../../../services/api';
import type { Tier, UsageInfo, TierType } from '../../../types';
import styles from './PricingModal.module.css';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier?: TierType;
  onUpgrade?: (usage: UsageInfo) => void;
}

export function PricingModal({ isOpen, onClose, currentTier = 'free', onUpgrade }: PricingModalProps) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTiers();
    }
  }, [isOpen]);

  const loadTiers = async () => {
    try {
      const { tiers } = await api.getTiers();
      setTiers(tiers);
    } catch (err) {
      console.error('Failed to load tiers:', err);
    }
  };

  const handleUpgrade = async (tier: TierType) => {
    if (tier === 'free' || tier === currentTier) return;
    
    setUpgrading(tier);
    setError(null);
    setSuccess(null);

    try {
      const { message, usage } = await api.upgradeTier(tier);
      setSuccess(message);
      onUpgrade?.(usage);
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to upgrade');
    } finally {
      setUpgrading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>×</button>
        
        <h2 className={styles.title}>Choose Your Plan</h2>
        <p className={styles.subtitle}>Unlock more analyses and premium features</p>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}

        <div className={styles.tiers}>
          {tiers.map((tier) => (
            <div 
              key={tier.id} 
              className={`${styles.tierCard} ${tier.id === 'pro' ? styles.recommended : ''}`}
              data-current={tier.id === currentTier}
            >
              {tier.id === 'pro' && <div className={styles.recommendedBadge}>Most Popular</div>}
              
              <h3 className={styles.tierName}>{tier.name}</h3>
              
              <div className={styles.price}>
                <span className={styles.amount}>${tier.price}</span>
                {tier.price > 0 && <span className={styles.period}>/month</span>}
              </div>

              <div className={styles.limit}>
                {tier.dailyLimit === 'Unlimited' ? (
                  <span className={styles.unlimited}>Unlimited analyses</span>
                ) : (
                  <span>{tier.dailyLimit} analyses/day</span>
                )}
              </div>

              <ul className={styles.features}>
                {tier.features.map((feature, i) => (
                  <li key={i}>✓ {feature}</li>
                ))}
              </ul>

              <button 
                className={styles.selectBtn}
                onClick={() => handleUpgrade(tier.id)}
                disabled={tier.id === currentTier || tier.id === 'free' || upgrading !== null}
                data-tier={tier.id}
              >
                {upgrading === tier.id ? (
                  'Processing...'
                ) : tier.id === currentTier ? (
                  'Current Plan'
                ) : tier.id === 'free' ? (
                  'Free Forever'
                ) : (
                  `Upgrade to ${tier.name}`
                )}
              </button>
            </div>
          ))}
        </div>

        <p className={styles.note}>
          💡 For demo purposes, upgrades are instant. In production, this would integrate with Stripe.
        </p>
      </div>
    </div>
  );
}

export default PricingModal;
