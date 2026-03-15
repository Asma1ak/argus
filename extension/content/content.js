// Content script for Argus extension
// Handles displaying analysis results on the page

let currentTooltip = null;

// Security: Escape HTML to prevent XSS attacks
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyze') {
    showLoading();
    
    chrome.runtime.sendMessage(
      { action: 'analyzeText', text: request.text, language: request.language || 'auto' },
      (response) => {
        hideLoading();
        if (response.success) {
          showResults(response.data);
        } else {
          showError(response.error);
        }
      }
    );
  }
});

function showLoading() {
  removeExisting();
  
  const loading = document.createElement('div');
  loading.id = 'argus-loading';
  loading.innerHTML = `
    <div class="argus-spinner"></div>
    <span>Analyzing with Argus...</span>
  `;
  document.body.appendChild(loading);
}

function hideLoading() {
  const loading = document.getElementById('argus-loading');
  if (loading) loading.remove();
}

function showError(message) {
  removeExisting();
  
  const error = document.createElement('div');
  error.id = 'argus-tooltip';
  error.className = 'argus-error';
  error.innerHTML = `
    <div class="argus-header">
      <span>⚠️ Argus</span>
      <button class="argus-close">&times;</button>
    </div>
    <p>${escapeHtml(message)}</p>
  `;
  
  document.body.appendChild(error);
  positionTooltip(error);
  
  error.querySelector('.argus-close').addEventListener('click', removeExisting);
  currentTooltip = error;
}

function showResults(result) {
  removeExisting();
  
  const tooltip = document.createElement('div');
  tooltip.id = 'argus-tooltip';
  
  const score = parseInt(result.score) || 0;
  const scoreClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
  
  let issuesHtml = '';
  if (result.issues && result.issues.length > 0) {
    issuesHtml = result.issues.map(issue => `
      <div class="argus-issue ${escapeHtml(issue.severity)}">
        <div class="argus-issue-header">
          <span class="argus-issue-type">${getTypeIcon(issue.type)} ${escapeHtml(issue.name)}</span>
          <span class="argus-severity ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>
        </div>
        ${issue.quote ? `<blockquote class="argus-quote">"${escapeHtml(issue.quote)}"</blockquote>` : ''}
        <p class="argus-explanation">${escapeHtml(issue.explanation)}</p>
        <p class="argus-suggestion">💡 ${escapeHtml(issue.suggestion)}</p>
        ${issue.counterArgument ? `
          <div class="argus-counter">
            <div class="argus-counter-header">
              <span>💬 How to respond:</span>
              <button class="argus-copy-btn" data-text="${escapeHtml(issue.counterArgument)}">📋 Copy</button>
            </div>
            <p class="argus-counter-text">"${escapeHtml(issue.counterArgument)}"</p>
          </div>
        ` : ''}
      </div>
    `).join('');
  } else {
    issuesHtml = '<p class="argus-clean">✅ No critical thinking issues detected!</p>';
  }
  
  tooltip.innerHTML = `
    <div class="argus-header">
      <span>👁️ Argus Analysis</span>
      <button class="argus-close">&times;</button>
    </div>
    <div class="argus-score-row">
      <div class="argus-score ${scoreClass}">${score}</div>
      <p class="argus-summary">${escapeHtml(result.summary)}</p>
    </div>
    <div class="argus-issues">
      ${issuesHtml}
    </div>
  `;
  
  document.body.appendChild(tooltip);
  positionTooltip(tooltip);
  
  tooltip.querySelector('.argus-close').addEventListener('click', removeExisting);
  
  // Add copy button handlers
  tooltip.querySelectorAll('.argus-copy-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-text');
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy', 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });
  });
  
  currentTooltip = tooltip;
}

function getTypeIcon(type) {
  const icons = {
    'fallacy': '⚠️',
    'bias': '🧠',
    'heuristic': '⚡',
    'manipulation': '🎭'
  };
  return icons[type] || '❓';
}

function positionTooltip(tooltip) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    tooltip.style.top = `${window.scrollY + rect.bottom + 10}px`;
    tooltip.style.left = `${Math.max(10, rect.left)}px`;
  }
}

function removeExisting() {
  const existing = document.getElementById('argus-tooltip');
  if (existing) existing.remove();
  
  const loading = document.getElementById('argus-loading');
  if (loading) loading.remove();
  
  currentTooltip = null;
}

// Close tooltip when clicking outside
document.addEventListener('click', (e) => {
  if (currentTooltip && !currentTooltip.contains(e.target)) {
    removeExisting();
  }
});

// Close tooltip on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    removeExisting();
  }
});
