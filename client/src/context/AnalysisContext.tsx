import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react';
import api, { ApiError } from '../services/api';
import type { AnalysisResult, AnalysisHistoryItem, UrlSource } from '../types';

// Supported languages
const DEFAULT_LANGUAGES: Record<string, string> = {
  auto: 'Auto-detect',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  pl: 'Polski',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
};

interface AnalysisState {
  text: string;
  url: string;
  inputMode: 'text' | 'url';
  language: string;
  languages: Record<string, string>;
  result: (AnalysisResult & { source?: UrlSource }) | null;
  history: AnalysisHistoryItem[];
  loading: boolean;
  error: string | null;
}

type AnalysisAction =
  | { type: 'SET_TEXT'; payload: string }
  | { type: 'SET_URL'; payload: string }
  | { type: 'SET_INPUT_MODE'; payload: 'text' | 'url' }
  | { type: 'SET_LANGUAGE'; payload: string }
  | { type: 'SET_LANGUAGES'; payload: Record<string, string> }
  | { type: 'ANALYZE_START' }
  | { type: 'ANALYZE_SUCCESS'; payload: AnalysisResult & { source?: UrlSource } }
  | { type: 'ANALYZE_ERROR'; payload: string }
  | { type: 'SET_HISTORY'; payload: AnalysisHistoryItem[] }
  | { type: 'CLEAR_RESULT' }
  | { type: 'CLEAR_ERROR' };

const initialState: AnalysisState = {
  text: '',
  url: '',
  inputMode: 'text',
  language: localStorage.getItem('argus-language') || 'auto',
  languages: DEFAULT_LANGUAGES,
  result: null,
  history: [],
  loading: false,
  error: null,
};

function analysisReducer(state: AnalysisState, action: AnalysisAction): AnalysisState {
  switch (action.type) {
    case 'SET_TEXT':
      return { ...state, text: action.payload, error: null };
    case 'SET_URL':
      return { ...state, url: action.payload, error: null };
    case 'SET_INPUT_MODE':
      return { ...state, inputMode: action.payload, error: null };
    case 'SET_LANGUAGE':
      localStorage.setItem('argus-language', action.payload);
      return { ...state, language: action.payload };
    case 'SET_LANGUAGES':
      return { ...state, languages: action.payload };
    case 'ANALYZE_START':
      return { ...state, loading: true, error: null, result: null };
    case 'ANALYZE_SUCCESS':
      return { ...state, loading: false, result: action.payload };
    case 'ANALYZE_ERROR':
      return { ...state, loading: false, error: action.payload };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'CLEAR_RESULT':
      return { ...state, result: null };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    default:
      return state;
  }
}

interface AnalysisContextValue extends AnalysisState {
  setText: (text: string) => void;
  setUrl: (url: string) => void;
  setInputMode: (mode: 'text' | 'url') => void;
  setLanguage: (language: string) => void;
  analyze: () => Promise<void>;
  analyzeUrl: () => Promise<void>;
  loadHistory: () => Promise<void>;
  clearResult: () => void;
  clearError: () => void;
  exportAnalysis: (format: 'json' | 'pdf') => Promise<void>;
  getShareUrl: () => string | null;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(analysisReducer, initialState);

  // Load languages from API on mount
  useEffect(() => {
    api.getLanguages()
      .then(({ languages }) => dispatch({ type: 'SET_LANGUAGES', payload: languages }))
      .catch(() => console.log('Using default languages'));
  }, []);

  const setText = useCallback((text: string) => {
    dispatch({ type: 'SET_TEXT', payload: text });
  }, []);

  const setUrl = useCallback((url: string) => {
    dispatch({ type: 'SET_URL', payload: url });
  }, []);

  const setInputMode = useCallback((mode: 'text' | 'url') => {
    dispatch({ type: 'SET_INPUT_MODE', payload: mode });
  }, []);

  const setLanguage = useCallback((language: string) => {
    dispatch({ type: 'SET_LANGUAGE', payload: language });
  }, []);

  const analyze = useCallback(async () => {
    if (!state.text.trim()) return;

    dispatch({ type: 'ANALYZE_START' });

    try {
      const result = await api.analyze(state.text, state.language);
      dispatch({ type: 'ANALYZE_SUCCESS', payload: result });
      
      // Track event
      api.trackEvent('analysis_created', { 
        score: result.score, 
        issueCount: result.issues.length,
        language: state.language 
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Analysis failed';
      dispatch({ type: 'ANALYZE_ERROR', payload: message });
    }
  }, [state.text, state.language]);

  const analyzeUrlFn = useCallback(async () => {
    if (!state.url.trim()) return;

    dispatch({ type: 'ANALYZE_START' });

    try {
      const result = await api.analyzeUrl(state.url, state.language);
      dispatch({ type: 'ANALYZE_SUCCESS', payload: result });
      
      // Track event
      api.trackEvent('url_analysis_created', { 
        score: result.score, 
        issueCount: result.issues.length,
        language: state.language,
        siteName: result.source?.siteName,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to analyze URL';
      dispatch({ type: 'ANALYZE_ERROR', payload: message });
    }
  }, [state.url, state.language]);

  const loadHistory = useCallback(async () => {
    try {
      const { analyses } = await api.getHistory();
      dispatch({ type: 'SET_HISTORY', payload: analyses });
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, []);

  const clearResult = useCallback(() => {
    dispatch({ type: 'CLEAR_RESULT' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  const exportAnalysis = useCallback(async (format: 'json' | 'pdf') => {
    if (!state.result) return;
    
    try {
      // Use secure download with short-lived token
      await api.downloadExport(state.result.id, format);
      api.trackEvent('analysis_exported', { format, analysisId: state.result.id });
    } catch (error) {
      console.error('Export failed:', error);
      // Could show a toast notification here
    }
  }, [state.result]);

  const getShareUrl = useCallback(() => {
    if (!state.result?.shareId) return null;
    return api.getShareUrl(state.result.shareId);
  }, [state.result]);

  return (
    <AnalysisContext.Provider
      value={{
        ...state,
        setText,
        setUrl,
        setInputMode,
        setLanguage,
        analyze,
        analyzeUrl: analyzeUrlFn,
        loadHistory,
        clearResult,
        clearError,
        exportAnalysis,
        getShareUrl,
      }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error('useAnalysis must be used within AnalysisProvider');
  }
  return context;
}
