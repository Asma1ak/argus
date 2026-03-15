import { useState, useMemo } from 'react';
import { useAnalysis } from '../context';
import { useToast } from '../components/ui/Toast';
import { WelcomeBanner } from '../components/ui/OnboardingTip';
import { ExportShare } from '../components/features/export/ExportShare';
import { ISSUE_TYPE_INFO } from '../types';
import type { IssueType, IssueSeverity } from '../types';
import styles from './HomePage.module.css';

const EXAMPLES = [
  { id: 1, title: 'Bandwagon', text: "Everyone is buying this product, so it must be the best option!" },
  { id: 2, title: 'Ad Hominem', text: "You can't trust his research because he's not even a real scientist - he dropped out of college." },
  { id: 3, title: 'False Dichotomy', text: "You're either with us or against us. There's no middle ground in this debate." },
  { id: 4, title: 'Slippery Slope', text: "If we allow students to redo one test, soon they'll expect to redo every assignment, and eventually no one will take deadlines seriously." },
  { id: 5, title: 'Appeal to Fear', text: "If you don't buy our security system today, your family could be the next victim of a break-in." },
];

const SEVERITY_OPTIONS: { value: IssueSeverity | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📊' },
  { value: 'high', label: 'High', icon: '🔴' },
  { value: 'medium', label: 'Medium', icon: '🟡' },
  { value: 'low', label: 'Low', icon: '🟢' },
];

const CATEGORY_OPTIONS: { value: IssueType | 'all'; label: string; icon: string }[] = [
  { value: 'all', label: 'All Types', icon: '📋' },
  { value: 'fallacy', label: 'Fallacies', icon: '⚠️' },
  { value: 'bias', label: 'Biases', icon: '🧠' },
  { value: 'heuristic', label: 'Heuristics', icon: '⚡' },
  { value: 'manipulation', label: 'Manipulation', icon: '🎭' },
];

// URL detection regex
const URL_REGEX = /^https?:\/\/[^\s]+$/;

export default function HomePage() {
  const { 
    text, 
    setText, 
    url,
    setUrl,
    inputMode,
    setInputMode,
    language, 
    setLanguage, 
    languages, 
    analyze,
    analyzeUrl, 
    result, 
    loading, 
    error, 
    clearError 
  } = useAnalysis();
  
  const toast = useToast();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<IssueType | 'all'>('all');
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  // Filter issues based on selected filters
  const filteredIssues = useMemo(() => {
    if (!result?.issues) return [];
    
    return result.issues.filter(issue => {
      const matchesSeverity = severityFilter === 'all' || issue.severity === severityFilter;
      const matchesCategory = categoryFilter === 'all' || issue.type === categoryFilter;
      return matchesSeverity && matchesCategory;
    });
  }, [result?.issues, severityFilter, categoryFilter]);

  // Count issues by severity and category for filter badges
  const issueCounts = useMemo(() => {
    if (!result?.issues) return { severity: {}, category: {} };
    
    const severity: Record<string, number> = { all: result.issues.length };
    const category: Record<string, number> = { all: result.issues.length };
    
    result.issues.forEach(issue => {
      severity[issue.severity] = (severity[issue.severity] || 0) + 1;
      category[issue.type] = (category[issue.type] || 0) + 1;
    });
    
    return { severity, category };
  }, [result?.issues]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleAnalyze();
    }
  };

  const handleAnalyze = () => {
    resetFilters();
    if (inputMode === 'url') {
      analyzeUrl();
    } else {
      analyze();
    }
  };

  // Auto-detect URL when pasting in text mode
  const handleTextPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text').trim();
    
    // Check if pasted content is a URL
    if (URL_REGEX.test(pastedText) && inputMode === 'text') {
      e.preventDefault();
      setUrl(pastedText);
      setInputMode('url');
      toast.info('URL detected! Switched to URL mode.');
    }
  };

  const copyCounterArgument = async (id: number, counterText: string) => {
    try {
      await navigator.clipboard.writeText(counterText);
      setCopiedId(id);
      toast.success('Counter-argument copied!');
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy');
    }
  };

  const toggleIssue = (id: number) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllIssues = () => {
    if (allExpanded) {
      setExpandedIssues(new Set());
    } else {
      setExpandedIssues(new Set(filteredIssues.map(i => i.id)));
    }
    setAllExpanded(!allExpanded);
  };

  // Reset filters when new result comes in
  const resetFilters = () => {
    setSeverityFilter('all');
    setCategoryFilter('all');
    setExpandedIssues(new Set(result?.issues.map(i => i.id) || []));
    setAllExpanded(true);
  };

  const isValidUrl = (str: string) => {
    try {
      const u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const canAnalyze = inputMode === 'url' 
    ? url.trim() && isValidUrl(url.trim())
    : text.trim();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.logoLarge}>
          <img src="/logo.svg" alt="Argus" className={styles.heroLogo} />
        </div>
        <h1 className={styles.title}>Argus</h1>
        <p className={styles.subtitle}>Critical Thinking Assistant</p>
        <p className={styles.description}>
          Analyze any text for logical fallacies, cognitive biases, and manipulation tactics
        </p>
      </section>

      {!result && <WelcomeBanner />}

      <section className={styles.inputSection}>
        {/* Input Mode Toggle */}
        <div className={styles.inputModeToggle}>
          <button 
            className={`${styles.modeBtn} ${inputMode === 'text' ? styles.active : ''}`}
            onClick={() => setInputMode('text')}
          >
            📝 Text
          </button>
          <button 
            className={`${styles.modeBtn} ${inputMode === 'url' ? styles.active : ''}`}
            onClick={() => setInputMode('url')}
          >
            🔗 URL
          </button>
        </div>

        <div className={styles.languageRow}>
          <label htmlFor="language-select" className={styles.languageLabel}>
            🌐 Response Language:
          </label>
          <select
            id="language-select"
            className={styles.languageSelect}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {Object.entries(languages).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {inputMode === 'text' ? (
          <>
            <label htmlFor="analysis-text" className="sr-only">Text to analyze</label>
            <textarea
              id="analysis-text"
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handleTextPaste}
              placeholder="Paste any argument, article, or text you want to analyze..."
              rows={6}
              maxLength={5000}
              aria-describedby="char-count"
            />
            
            <div className={styles.inputFooter}>
              <span id="char-count" className={styles.charCount}>{text.length.toLocaleString()} / 5,000</span>
              <button
                className={styles.analyzeButton}
                onClick={handleAnalyze}
                disabled={loading || !canAnalyze}
                aria-busy={loading}
              >
                {loading ? 'Analyzing...' : '🔍 Analyze'}
              </button>
            </div>
            
            <div className={styles.examples} role="group" aria-label="Example texts">
              <span>Try:</span>
              {EXAMPLES.map((ex) => (
                <button 
                  key={ex.id} 
                  onClick={() => setText(ex.text)} 
                  className={styles.exampleChip}
                  aria-label={`Try example: ${ex.title}`}
                >
                  {ex.title}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className={styles.urlInputWrapper}>
              <span className={styles.urlIcon} aria-hidden="true">🌐</span>
              <label htmlFor="analysis-url" className="sr-only">URL to analyze</label>
              <input
                id="analysis-url"
                type="url"
                className={styles.urlInput}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="https://example.com/article"
                aria-describedby="url-hint"
              />
              {url && (
                <button 
                  className={styles.clearUrlBtn} 
                  onClick={() => setUrl('')}
                  aria-label="Clear URL"
                >
                  ×
                </button>
              )}
            </div>
            
            <div id="url-hint" className={styles.urlHint}>
              <span aria-hidden="true">💡</span>
              <span>Paste a URL to extract and analyze article content. Works best with news articles and blog posts.</span>
            </div>
            
            <div className={styles.inputFooter}>
              <span className={styles.charCount} role="status">
                {url && isValidUrl(url) ? '✓ Valid URL' : url ? '⚠️ Invalid URL' : ''}
              </span>
              <button
                className={styles.analyzeButton}
                onClick={handleAnalyze}
                disabled={loading || !canAnalyze}
                aria-busy={loading}
              >
                {loading ? 'Extracting & Analyzing...' : '🔍 Analyze URL'}
              </button>
            </div>
          </>
        )}
      </section>

      {error && (
        <div className={styles.error}>
          <span>⚠️ {error}</span>
          <button onClick={clearError}>×</button>
        </div>
      )}

      {result && (
        <section className={styles.resultSection}>
          {/* Source info for URL analysis */}
          {result.source && (
            <div className={styles.sourceInfo}>
              <div className={styles.sourceHeader}>
                <span className={styles.sourceIcon}>📄</span>
                <div className={styles.sourceMeta}>
                  <h3 className={styles.sourceTitle}>{result.source.title}</h3>
                  <div className={styles.sourceDetails}>
                    <span>{result.source.siteName}</span>
                    {result.source.author && <span>• {result.source.author}</span>}
                    <span>• {result.source.wordCount.toLocaleString()} words</span>
                  </div>
                </div>
              </div>
              <a href={result.source.url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>
                View Original ↗
              </a>
            </div>
          )}

          <div className={styles.resultHeader}>
            <div className={`${styles.scoreCircle} ${styles[`score${result.score >= 80 ? 'High' : result.score >= 50 ? 'Medium' : 'Low'}`]}`}>
              <span className={styles.scoreValue}>{result.score}</span>
              <span className={styles.scoreLabel}>Score</span>
            </div>
            <div className={styles.summary}>
              <h2>Analysis Summary</h2>
              <p>{result.summary}</p>
            </div>
          </div>

          {result.issues.length > 0 ? (
            <div className={styles.issues}>
              <div className={styles.issuesHeader}>
                <h3 id="issues-heading">Issues Found ({result.issues.length})</h3>
                <button 
                  className={styles.expandAllBtn}
                  onClick={toggleAllIssues}
                  aria-expanded={allExpanded}
                  aria-label={allExpanded ? 'Collapse all issues' : 'Expand all issues'}
                >
                  {allExpanded ? '🔼 Collapse All' : '🔽 Expand All'}
                </button>
              </div>

              {/* Filters */}
              <div className={styles.filters} role="group" aria-label="Filter issues">
                <fieldset className={styles.filterGroup}>
                  <legend className={styles.filterLabel}>Severity:</legend>
                  <div className={styles.filterButtons} role="radiogroup" aria-label="Filter by severity">
                    {SEVERITY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`${styles.filterBtn} ${severityFilter === opt.value ? styles.active : ''}`}
                        onClick={() => setSeverityFilter(opt.value)}
                        data-severity={opt.value}
                        role="radio"
                        aria-checked={severityFilter === opt.value}
                        aria-label={`${opt.label}${issueCounts.severity[opt.value] !== undefined ? `: ${issueCounts.severity[opt.value]} issues` : ''}`}
                      >
                        <span className={styles.filterIcon} aria-hidden="true">{opt.icon}</span>
                        <span className={styles.filterText}>{opt.label}</span>
                        {issueCounts.severity[opt.value] !== undefined && (
                          <span className={styles.filterCount} aria-hidden="true">{issueCounts.severity[opt.value]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className={styles.filterGroup}>
                  <legend className={styles.filterLabel}>Category:</legend>
                  <div className={styles.filterButtons} role="radiogroup" aria-label="Filter by category">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`${styles.filterBtn} ${categoryFilter === opt.value ? styles.active : ''}`}
                        onClick={() => setCategoryFilter(opt.value)}
                        data-category={opt.value}
                        role="radio"
                        aria-checked={categoryFilter === opt.value}
                        aria-label={`${opt.label}${issueCounts.category[opt.value] !== undefined ? `: ${issueCounts.category[opt.value]} issues` : ''}`}
                      >
                        <span className={styles.filterIcon} aria-hidden="true">{opt.icon}</span>
                        <span className={styles.filterText}>{opt.label}</span>
                        {issueCounts.category[opt.value] !== undefined && (
                          <span className={styles.filterCount} aria-hidden="true">{issueCounts.category[opt.value]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* Filtered results info */}
              {(severityFilter !== 'all' || categoryFilter !== 'all') && (
                <div className={styles.filterInfo} role="status" aria-live="polite">
                  Showing {filteredIssues.length} of {result.issues.length} issues
                  <button className={styles.clearFilters} onClick={() => { setSeverityFilter('all'); setCategoryFilter('all'); }}>
                    Clear filters
                  </button>
                </div>
              )}

              {/* Issue cards */}
              <div role="list" aria-labelledby="issues-heading">
              {filteredIssues.length > 0 ? (
                filteredIssues.map((issue) => {
                  const isExpanded = expandedIssues.has(issue.id);
                  return (
                    <article 
                      key={issue.id} 
                      className={`${styles.issueCard} ${styles[`severity${issue.severity}`]} ${isExpanded ? styles.expanded : styles.collapsed}`}
                      role="listitem"
                    >
                      <button 
                        className={styles.issueHeader}
                        onClick={() => toggleIssue(issue.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`issue-content-${issue.id}`}
                      >
                        <div className={styles.issueHeaderLeft}>
                          <span className={styles.expandIcon} aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
                          <span className={styles.issueType}>
                            <span aria-hidden="true">{ISSUE_TYPE_INFO[issue.type]?.icon || '•'}</span> {issue.name}
                          </span>
                        </div>
                        <span className={`${styles.severityBadge} ${styles[issue.severity]}`}>
                          {issue.severity}
                        </span>
                      </button>
                      
                      {isExpanded && (
                        <div id={`issue-content-${issue.id}`} className={styles.issueContent}>
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
                          
                          {issue.counterArgument && (
                            <div className={styles.counterArgument}>
                              <div className={styles.counterHeader}>
                                <span><span aria-hidden="true">💬</span> <strong>How to respond:</strong></span>
                                <button 
                                  className={styles.copyButton}
                                  onClick={(e) => { e.stopPropagation(); copyCounterArgument(issue.id, issue.counterArgument!); }}
                                  aria-label={copiedId === issue.id ? 'Copied to clipboard' : 'Copy counter-argument'}
                                >
                                  {copiedId === issue.id ? '✓ Copied!' : '📋 Copy'}
                                </button>
                              </div>
                              <p className={styles.counterText}>"{issue.counterArgument}"</p>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <div className={styles.noFilterResults} role="status">
                  <p>No issues match the current filters.</p>
                  <button onClick={() => { setSeverityFilter('all'); setCategoryFilter('all'); }}>
                    Show all issues
                  </button>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className={styles.noIssues}>
              <span className={styles.checkIcon}>✅</span>
              <h3>No issues detected!</h3>
              <p>This text appears well-reasoned and free of obvious logical fallacies.</p>
            </div>
          )}

          <ExportShare />
        </section>
      )}
    </div>
  );
}
