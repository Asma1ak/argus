document.addEventListener('DOMContentLoaded', () => {
  const textInput = document.getElementById('text-input');
  const analyzeBtn = document.getElementById('analyze-btn');
  const btnText = analyzeBtn.querySelector('.btn-text');
  const btnLoading = analyzeBtn.querySelector('.btn-loading');
  const errorDiv = document.getElementById('error');
  const resultDiv = document.getElementById('result');
  const languageSelect = document.getElementById('language-select');

  // Security: Escape HTML to prevent XSS
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Load saved language preference
  chrome.storage.local.get(['language'], (result) => {
    if (result.language) {
      languageSelect.value = result.language;
    }
  });

  // Save language preference when changed
  languageSelect.addEventListener('change', () => {
    chrome.storage.local.set({ language: languageSelect.value });
  });

  analyzeBtn.addEventListener('click', analyze);
  
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      analyze();
    }
  });

  async function analyze() {
    const text = textInput.value.trim();
    const language = languageSelect.value;
    
    if (!text) {
      showError('Please enter some text to analyze');
      return;
    }

    if (text.length < 10) {
      showError('Please enter at least 10 characters');
      return;
    }

    if (text.length > 5000) {
      showError('Text too long (maximum 5,000 characters)');
      return;
    }

    setLoading(true);
    hideError();
    hideResult();

    chrome.runtime.sendMessage(
      { action: 'analyzeText', text, language },
      (response) => {
        setLoading(false);
        
        if (response.success) {
          showResult(response.data);
        } else {
          showError(response.error || 'Failed to analyze text');
        }
      }
    );
  }

  function setLoading(loading) {
    analyzeBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoading.style.display = loading ? 'inline' : 'none';
  }

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  function hideError() {
    errorDiv.style.display = 'none';
  }

  function showResult(data) {
    const score = parseInt(data.score) || 0;
    const scoreClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
    
    let issuesHtml = '';
    if (data.issues && data.issues.length > 0) {
      issuesHtml = `
        <div class="issues-section">
          <div class="issues-header">Issues Found (${data.issues.length})</div>
          ${data.issues.map((issue, index) => `
            <div class="issue ${escapeHtml(issue.severity)}">
              <div class="issue-header">
                <span class="issue-name">${getTypeIcon(issue.type)} ${escapeHtml(issue.name)}</span>
                <span class="severity ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span>
              </div>
              ${issue.quote ? `<div class="issue-quote">"${escapeHtml(issue.quote)}"</div>` : ''}
              <p class="issue-explanation">${escapeHtml(issue.explanation)}</p>
              <p class="issue-suggestion">💡 ${escapeHtml(issue.suggestion)}</p>
              ${issue.counterArgument ? `
                <div class="issue-counter">
                  <div class="counter-header">
                    <span>💬 How to respond:</span>
                    <button class="copy-btn" data-index="${index}">📋 Copy</button>
                  </div>
                  <p class="counter-text">"${escapeHtml(issue.counterArgument)}"</p>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      issuesHtml = '<div class="clean">✅ No issues detected!</div>';
    }

    resultDiv.innerHTML = `
      <div class="score-section">
        <div class="score ${scoreClass}">${score}</div>
        <p class="summary">${escapeHtml(data.summary)}</p>
      </div>
      ${issuesHtml}
    `;
    
    resultDiv.style.display = 'block';
    
    // Add copy button handlers
    resultDiv.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.getAttribute('data-index'));
        const counterArg = data.issues[index]?.counterArgument;
        if (counterArg) {
          try {
            await navigator.clipboard.writeText(counterArg);
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy', 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        }
      });
    });
  }

  function hideResult() {
    resultDiv.style.display = 'none';
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
});
