import { useState } from 'react';
import { useAnalysis } from '../../../context';
import { useToast } from '../../ui/Toast';
import styles from './ExportShare.module.css';

export function ExportShare() {
  const { result, exportAnalysis, getShareUrl } = useAnalysis();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!result) return null;

  const shareUrl = getShareUrl();

  const handleCopy = async () => {
    if (!shareUrl) return;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    
    setExporting(true);
    toast.info('Preparing PDF download...');
    
    try {
      await exportAnalysis('pdf');
      toast.success('PDF downloaded successfully!');
    } catch {
      toast.error('Failed to download PDF');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>Export & Share</h4>
      
      <div className={styles.actions}>
        <button 
          className={styles.button} 
          onClick={handleExport}
          disabled={exporting}
          aria-label="Export analysis as PDF"
        >
          {exporting ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Exporting...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={styles.icon} aria-hidden="true">
                <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V7.5L14.25 1.5H5.625z" />
              </svg>
              Export PDF
            </>
          )}
        </button>
      </div>

      {shareUrl && (
        <div className={styles.shareSection}>
          <label className={styles.label} htmlFor="share-url">Share Link</label>
          <div className={styles.shareInput}>
            <input 
              id="share-url"
              type="text" 
              value={shareUrl} 
              readOnly 
              className={styles.input}
              aria-describedby="share-hint"
            />
            <button 
              className={styles.copyButton} 
              onClick={handleCopy}
              aria-label={copied ? 'Link copied' : 'Copy share link'}
            >
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <span id="share-hint" className={styles.shareHint}>
            Anyone with this link can view your analysis
          </span>
        </div>
      )}
    </div>
  );
}
