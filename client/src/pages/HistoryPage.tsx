import { useEffect, useState, useCallback, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { useToast } from '../components/ui/Toast';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Skeleton } from '../components/ui/Skeleton';
import api from '../services/api';
import type { AnalysisHistoryItem } from '../types';
import styles from './HistoryPage.module.css';

// Memoized history card component for better performance
const HistoryCard = memo(function HistoryCard({
  item,
  onDelete,
}: {
  item: AnalysisHistoryItem;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={`${styles.score} ${item.score >= 80 ? styles.high : item.score >= 50 ? styles.medium : styles.low}`}>
          {item.score}
        </span>
        <div className={styles.meta}>
          <span>{item.issueCount} issue{item.issueCount !== 1 ? 's' : ''}</span>
          <span>{new Date(item.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <p className={styles.preview}>{item.textPreview}</p>
      <p className={styles.summary}>{item.summary}</p>
      <div className={styles.actions}>
        {item.shareId && (
          <Link to={`/share/${item.shareId}`} className={styles.viewLink}>View →</Link>
        )}
        <button 
          onClick={() => onDelete(item.id)} 
          className={styles.deleteButton}
          aria-label="Delete this analysis"
        >
          Delete
        </button>
      </div>
    </div>
  );
});

export default function HistoryPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
      return;
    }

    if (isAuthenticated) {
      loadHistory();
    }
  }, [isAuthenticated, isLoading, navigate]);

  const loadHistory = async (offset = 0, append = false) => {
    try {
      const { analyses, hasMore: more } = await api.getHistory(20, offset);
      setHistory(prev => append ? [...prev, ...analyses] : analyses);
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadHistory(history.length, true);
  }, [loadingMore, hasMore, history.length]);

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await api.deleteAnalysis(deleteId);
      setHistory(history.filter(h => h.id !== deleteId));
      toast.success('Analysis deleted');
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete analysis');
    } finally {
      setDeleteId(null);
    }
  };

  // Memoized delete handler
  const onDelete = useCallback((id: string) => setDeleteId(id), []);

  if (loading) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Analysis History</h1>
        <div className={styles.list}>
          {[1, 2, 3].map(i => (
            <div key={i} className={styles.card}>
              <div className={styles.cardHeader}>
                <Skeleton width={50} height={50} borderRadius="50%" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="40%" height="1rem" />
                  <Skeleton width="60%" height="0.875rem" />
                </div>
              </div>
              <Skeleton width="100%" height="0.875rem" />
              <Skeleton width="80%" height="0.875rem" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Analysis History</h1>

      {history.length === 0 ? (
        <EmptyState
          type="history"
          title="No analyses yet"
          description="Start analyzing texts to build your history and track your critical thinking journey."
          actionText="Analyze your first text"
          actionLink="/"
        />
      ) : (
        <>
          <div className={styles.list}>
            {history.map((item) => (
              <HistoryCard key={item.id} item={item} onDelete={onDelete} />
            ))}
          </div>
          
          {hasMore && (
            <div className={styles.loadMore}>
              <button 
                onClick={loadMore} 
                disabled={loadingMore}
                className={styles.loadMoreButton}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        isOpen={deleteId !== null}
        title="Delete Analysis"
        message="Are you sure you want to delete this analysis? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
