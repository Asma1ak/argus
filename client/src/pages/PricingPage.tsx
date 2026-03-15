import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { Tier } from '../types';
import styles from './PricingPage.module.css';

export default function PricingPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    try {
      const { tiers } = await api.getTiers();
      setTiers(tiers);
    } catch (err) {
      console.error('Failed to load tiers:', err);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>Simple, Transparent Pricing</h1>
        <p className={styles.subtitle}>
          Choose the plan that fits your critical thinking needs
        </p>
      </section>

      <div className={styles.tiers}>
        {tiers.map((tier) => (
          <div 
            key={tier.id} 
            className={`${styles.tierCard} ${tier.id === 'pro' ? styles.recommended : ''}`}
          >
            {tier.id === 'pro' && <div className={styles.recommendedBadge}>Most Popular</div>}
            
            <h2 className={styles.tierName}>{tier.name}</h2>
            
            <div className={styles.price}>
              <span className={styles.amount}>${tier.price}</span>
              {tier.price > 0 && <span className={styles.period}>/month</span>}
            </div>

            <div className={styles.limit}>
              {tier.dailyLimit === 'Unlimited' ? (
                <span className={styles.unlimited}>∞ Unlimited analyses</span>
              ) : (
                <span>📊 {tier.dailyLimit} analyses/day</span>
              )}
            </div>

            <ul className={styles.features}>
              {tier.features.map((feature, i) => (
                <li key={i}>✓ {feature}</li>
              ))}
            </ul>

            <Link 
              to="/register"
              className={`${styles.ctaBtn} ${styles[tier.id]}`}
            >
              {tier.price === 0 ? 'Get Started Free' : `Start ${tier.name} Plan`}
            </Link>
          </div>
        ))}
      </div>

      <section className={styles.faq}>
        <h2>Frequently Asked Questions</h2>
        
        <div className={styles.faqGrid}>
          <div className={styles.faqItem}>
            <h3>What counts as an analysis?</h3>
            <p>Each time you submit text for analysis, it counts as one analysis. The same text analyzed multiple times counts as multiple analyses.</p>
          </div>
          
          <div className={styles.faqItem}>
            <h3>When do my daily limits reset?</h3>
            <p>Daily limits reset at midnight UTC. If you're on the Free plan and run out, you can upgrade anytime for immediate access to more analyses.</p>
          </div>
          
          <div className={styles.faqItem}>
            <h3>Can I cancel anytime?</h3>
            <p>Yes! You can downgrade or cancel your subscription at any time. You'll keep access until the end of your billing period.</p>
          </div>
          
          <div className={styles.faqItem}>
            <h3>Do you offer team plans?</h3>
            <p>Enterprise plans include team management features. Contact us for custom team pricing and features.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
