import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { SkeletonCard, SkeletonIssueCard } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import api from '../services/api';
import { ISSUE_TYPE_INFO } from '../types';
import type { AnalysisResult } from '../types';
import styles from './HomePage.module.css';

function SharedPageSkeleton() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>👁️ Shared Analysis</h1>
        <p className={styles.description}>Loading shared analysis...</p>
      </section>
      <SkeletonCard />
      <div style={{ marginTop: '1rem' }}>
        <SkeletonIssueCard />
        <div style={{ marginTop: '0.75rem' }}><SkeletonIssueCard /></div>
      </div>
    </div>
  );
}

export default function SharedPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (shareId) {
      loadSharedAnalysis();
    }
  }, [shareId]);

  const loadSharedAnalysis = async () => {
    try {
      const data = await api.getSharedAnalysis(shareId!);
      setResult(data);
    } catch (err) {
      setError('Analysis not found or no longer available.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <SharedPageSkeleton />;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <EmptyState
          type="error"
          title="Analysis Not Found"
          description={error}
          actionText="Go to Home"
          actionLink="/"
        />
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.title}>
          <span aria-hidden="true">👁️</span> Shared Analysis
        </h1>
        <p className={styles.description}>Someone shared this critical thinking analysis with you</p>
      </section>

      <section className={styles.resultSection} aria-label="Analysis results">
        <div className={styles.resultHeader}>
          <div 
            className={`${styles.scoreCircle} ${styles[`score${result.score >= 80 ? 'High' : result.score >= 50 ? 'Medium' : 'Low'}`]}`}
            role="img"
            aria-label={`Score: ${result.score} out of 100`}
          >
            <span className={styles.scoreValue}>{result.score}</span>
            <span className={styles.scoreLabel}>Score</span>
          </div>
          <div className={styles.summary}>
            <h2>Analysis Summary</h2>
            <p>{result.summary}</p>
          </div>
        </div>

        {result.text && (
          <div className={styles.analyzedText}>
            <h3>Analyzed Text</h3>
            <blockquote className={styles.textPreview}>
              "{result.text.slice(0, 300)}{result.text.length > 300 ? '...' : ''}"
            </blockquote>
          </div>
        )}

        {result.issues.length > 0 ? (
          <div className={styles.issues}>
            <h3 id="shared-issues-heading">Issues Found ({result.issues.length})</h3>
            <div role="list" aria-labelledby="shared-issues-heading">
              {result.issues.map((issue) => (
                <article 
                  key={issue.id} 
                  className={`${styles.issueCard} ${styles[`severity${issue.severity}`]} ${styles.expanded}`}
                  role="listitem"
                >
                  <div className={styles.issueHeaderStatic}>
                    <div className={styles.issueHeaderLeft}>
                      <span className={styles.issueType}>
                        <span aria-hidden="true">{ISSUE_TYPE_INFO[issue.type]?.icon || '•'}</span> {issue.name}
                      </span>
                    </div>
                    <span className={`${styles.severityBadge} ${styles[issue.severity]}`}>
                      {issue.severity}
                    </span>
                  </div>
                  <div className={styles.issueContent}>
                    <div className={styles.issueTypeLabel}>
                      {ISSUE_TYPE_INFO[issue.type]?.label || issue.type}
                    </div>
                    <blockquote className={styles.quote}>"{issue.quote}"</blockquote>
                    <p className={styles.explanation}>
                      <strong>Why it's problematic:</strong> {issue.explanation}
                    </p>
                    <p className={styles.suggestion}>
                      <strong>Think critically:</strong> {issue.suggestion}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.noIssues}>
            <span className={styles.checkIcon} aria-hidden="true">✅</span>
            <h3>No issues detected!</h3>
            <p>This text appears well-reasoned and free of obvious logical fallacies.</p>
          </div>
        )}

        <div className={styles.sharedCta}>
          <p>Want to analyze your own text?</p>
          <Link to="/" className={styles.ctaButton}>Try Argus Free →</Link>
        </div>
      </section>
    </div>
  );
}
