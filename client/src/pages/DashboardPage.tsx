import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../services/api';
import type { AnalyticsDashboard } from '../types';
import styles from './DashboardPage.module.css';

function DashboardSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Skeleton width={250} height={32} />
        <Skeleton width={150} height={40} />
      </div>
      
      <div className={styles.overviewGrid}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={styles.statCard}>
            <Skeleton width={60} height={36} />
            <Skeleton width={100} height={16} />
          </div>
        ))}
      </div>
      
      <div className={styles.grid}>
        <div className={styles.card}>
          <Skeleton width={150} height={24} />
          <Skeleton height={200} />
        </div>
        <div className={styles.card}>
          <Skeleton width={150} height={24} />
          <Skeleton height={200} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isAuthenticated) {
      loadDashboard();
    }
  }, [isAuthenticated, isLoading, navigate, days]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.getDashboard(days);
      setDashboard(data);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!dashboard) {
    return (
      <div className={styles.page}>
        <EmptyState
          type="error"
          title="Failed to load dashboard"
          description="We couldn't load your analytics data. Please try again."
          actionText="Retry"
          onAction={loadDashboard}
        />
      </div>
    );
  }

  const { overview, trends, topIssues, scoreDistribution } = dashboard;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span aria-hidden="true">📊</span> Analytics Dashboard
        </h1>
        <label htmlFor="days-select" className="sr-only">Time period</label>
        <select 
          id="days-select"
          value={days} 
          onChange={(e) => setDays(Number(e.target.value))}
          className={styles.select}
          aria-label="Select time period"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Overview Cards */}
      <div className={styles.overviewGrid} role="group" aria-label="Statistics overview">
        <div className={styles.statCard}>
          <span className={styles.statValue}>{overview.totalAnalyses}</span>
          <span className={styles.statLabel}>Total Analyses</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{overview.totalUsers}</span>
          <span className={styles.statLabel}>Total Users</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{overview.avgScore}</span>
          <span className={styles.statLabel}>Avg Score</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{overview.avgIssueCount}</span>
          <span className={styles.statLabel}>Avg Issues</span>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Trends Chart */}
        <section className={styles.card} aria-labelledby="trends-heading">
          <h3 id="trends-heading">Daily Analyses</h3>
          <div className={styles.chart} role="img" aria-label={`Bar chart showing daily analyses over the last ${trends.length} days`}>
            {trends.slice(-14).map((day, i) => (
              <div key={i} className={styles.bar}>
                <div 
                  className={styles.barFill} 
                  style={{ height: `${Math.max(5, (day.analyses / Math.max(...trends.map(t => t.analyses), 1)) * 100)}%` }}
                  title={`${day.date}: ${day.analyses} analyses`}
                />
                <span className={styles.barLabel}>{day.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Score Distribution */}
        <section className={styles.card} aria-labelledby="distribution-heading">
          <h3 id="distribution-heading">Score Distribution</h3>
          <div className={styles.distribution}>
            {scoreDistribution.map((range) => (
              <div key={range.range} className={styles.distRow}>
                <span className={styles.distLabel}>{range.range}</span>
                <div className={styles.distBar} role="progressbar" aria-valuenow={range.count} aria-label={`${range.range}: ${range.count} analyses`}>
                  <div 
                    className={styles.distFill}
                    style={{ 
                      width: `${Math.max(5, (range.count / Math.max(...scoreDistribution.map(r => r.count), 1)) * 100)}%`,
                      background: range.range.startsWith('81') ? 'var(--success)' : 
                                  range.range.startsWith('61') ? '#22c55e' :
                                  range.range.startsWith('41') ? 'var(--warning)' :
                                  range.range.startsWith('21') ? '#f97316' : 'var(--danger)'
                    }}
                  />
                </div>
                <span className={styles.distCount}>{range.count}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top Issues */}
        <section className={styles.card} aria-labelledby="issues-heading">
          <h3 id="issues-heading">Top Issues Detected</h3>
          {topIssues.length === 0 ? (
            <p className={styles.empty}>No issues detected yet</p>
          ) : (
            <ul className={styles.issueList} aria-label="Top detected issues">
              {topIssues.slice(0, 8).map((issue, i) => (
                <li key={i} className={styles.issueItem}>
                  <span className={styles.issueIcon} aria-hidden="true">
                    {issue.type === 'fallacy' ? '⚠️' : issue.type === 'bias' ? '🧠' : issue.type === 'heuristic' ? '⚡' : '🎭'}
                  </span>
                  <span className={styles.issueName}>{issue.name}</span>
                  <span className={styles.issueCount}>{issue.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
