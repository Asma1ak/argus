import { Link } from 'react-router-dom';
import styles from './EmptyState.module.css';

type EmptyStateType = 'history' | 'search' | 'error' | 'success';

interface EmptyStateProps {
  type?: EmptyStateType;
  title: string;
  description?: string;
  actionText?: string;
  actionLink?: string;
  onAction?: () => void;
}

const illustrations: Record<EmptyStateType, string> = {
  history: '📋',
  search: '🔍',
  error: '😕',
  success: '🎉',
};

export function EmptyState({
  type = 'history',
  title,
  description,
  actionText,
  actionLink,
  onAction,
}: EmptyStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.illustration}>
        <span className={styles.emoji}>{illustrations[type]}</span>
        <div className={styles.circles}>
          <div className={styles.circle1} />
          <div className={styles.circle2} />
          <div className={styles.circle3} />
        </div>
      </div>
      
      <h3 className={styles.title}>{title}</h3>
      
      {description && (
        <p className={styles.description}>{description}</p>
      )}
      
      {(actionText && (actionLink || onAction)) && (
        actionLink ? (
          <Link to={actionLink} className={styles.action}>
            {actionText}
          </Link>
        ) : (
          <button onClick={onAction} className={styles.action}>
            {actionText}
          </button>
        )
      )}
    </div>
  );
}

export default EmptyState;
