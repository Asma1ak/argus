// Configuration
const API_URL = 'http://localhost:3001/api';
const MAX_TEXT_LENGTH = 5000;

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'argus-analyze',
    title: '🔍 Analyze with Argus',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'argus-analyze' && info.selectionText) {
    // Get saved language preference
    chrome.storage.local.get(['language'], (result) => {
      const language = result.language || 'auto';
      // Send the selected text to the content script for analysis
      chrome.tabs.sendMessage(tab.id, {
        action: 'analyze',
        text: info.selectionText,
        language
      });
    });
  }
});

// Handle messages from popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeText') {
    const language = request.language || 'auto';
    analyzeText(request.text, language)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

// Sanitize and validate input
function validateInput(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text is required');
  }
  
  const trimmed = text.trim();
  
  if (trimmed.length === 0) {
    throw new Error('Please select some text to analyze');
  }
  
  if (trimmed.length < 10) {
    throw new Error('Text too short (minimum 10 characters)');
  }
  
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new Error(`Text too long (maximum ${MAX_TEXT_LENGTH.toLocaleString()} characters)`);
  }
  
  return trimmed;
}

// Analyze text using the API
async function analyzeText(text, language = 'auto') {
  // Validate and sanitize input
  const validatedText = validateInput(text);
  
  try {
    const response = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: validatedText, language }),
    });

    const json = await response.json();

    if (!response.ok || !json.success) {
      throw new Error(json.error?.message || 'Failed to analyze text');
    }

    return json.data;
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Cannot connect to Argus server. Is it running on localhost:3001?');
    }
    throw error;
  }
}
