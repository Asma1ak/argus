import { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react';
import api from '../services/api';
import type { User, UserPreferences, AuthState } from '../types';

type AuthAction =
  | { type: 'LOADING' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; preferences?: UserPreferences } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_PREFERENCES'; payload: UserPreferences }
  | { type: 'ERROR' };

const initialState: AuthState = {
  user: null,
  token: null, // No longer used - auth is via httpOnly cookie
  preferences: null,
  isAuthenticated: false,
  isLoading: true,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOADING':
      return { ...state, isLoading: true };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: null, // Token is stored in httpOnly cookie, not accessible to JS
        preferences: action.payload.preferences || null,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'LOGOUT':
      return { ...initialState, isLoading: false };
    case 'UPDATE_PREFERENCES':
      return { ...state, preferences: action.payload };
    case 'ERROR':
      return { ...state, isLoading: false };
    default:
      return state;
  }
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing session on mount
  // The httpOnly cookie is sent automatically with the request
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user, preferences } = await api.getMe();
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, preferences } });
      } catch {
        // No valid session - user needs to log in
        dispatch({ type: 'ERROR' });
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: 'LOADING' });
    try {
      // Server sets httpOnly cookie, we just get user data back
      const { user } = await api.login(email, password);
      // Fetch preferences after login
      try {
        const { preferences } = await api.getMe();
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user, preferences } });
      } catch {
        // Preferences fetch failed, but login succeeded
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });
      }
    } catch (error) {
      dispatch({ type: 'ERROR' });
      throw error;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    dispatch({ type: 'LOADING' });
    try {
      // Server sets httpOnly cookie, we just get user data back
      const { user } = await api.register(email, password, name);
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });
    } catch (error) {
      dispatch({ type: 'ERROR' });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Call server to clear the httpOnly cookie
      await api.logout();
    } catch {
      // Even if server call fails, clear local state
    }
    dispatch({ type: 'LOGOUT' });
  }, []);

  const updatePreferences = useCallback(async (prefs: Partial<UserPreferences>) => {
    const { preferences } = await api.updatePreferences(prefs);
    dispatch({ type: 'UPDATE_PREFERENCES', payload: preferences });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
