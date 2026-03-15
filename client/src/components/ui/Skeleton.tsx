import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ 
  width = '100%', 
  height = '1rem', 
  borderRadius = '4px',
  className = ''
}: SkeletonProps) {
  return (
    <div 
      className={`${styles.skeleton} ${className}`}
      style={{ 
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.textContainer}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          width={i === lines - 1 ? '70%' : '100%'} 
          height="0.875rem"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Skeleton width={60} height={60} borderRadius="50%" />
        <div className={styles.cardHeaderText}>
          <Skeleton width="60%" height="1.25rem" />
          <Skeleton width="40%" height="0.875rem" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonIssueCard() {
  return (
    <div className={styles.issueCard}>
      <div className={styles.issueHeader}>
        <Skeleton width="50%" height="1rem" />
        <Skeleton width={60} height={24} borderRadius="9999px" />
      </div>
      <Skeleton width="30%" height="0.75rem" />
      <Skeleton height="3rem" borderRadius="8px" />
      <SkeletonText lines={2} />
    </div>
  );
}

export default Skeleton;
