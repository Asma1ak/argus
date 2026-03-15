import type {
  ApiResponse,
  AnalysisResult,
  AnalysisHistoryItem,
  User,
  UserPreferences,
  Example,
  AnalyticsDashboard,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001/api';

class ApiError extends Error {
  statusCode: number;
  details: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ApiService {
  private baseUrl: string;
  // No longer storing token in memory or localStorage
  // Auth is handled via httpOnly cookies

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get CSRF token from cookie
   */
  private getCsrfToken(): string | null {
    const match = document.cookie.match(/argus_csrf=([^;]+)/);
    return match ? match[1] : null;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add CSRF token for state-changing requests
    const method = options.method?.toUpperCase() || 'GET';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = this.getCsrfToken();
      if (csrfToken) {
        (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
      }
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include', // IMPORTANT: Include cookies in all requests
      });

      const data: ApiResponse<T> = await response.json();

      if (!response.ok || !data.success) {
        throw new ApiError(
          data.error?.message || 'Request failed',
          response.status,
          data.error?.details
        );
      }

      return data.data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Network error. Please check your connection.', 0);
    }
  }

  // ================================
  // Auth
  // ================================

  async register(email: string, password: string, name?: string) {
    // Server sets httpOnly cookie, we just get user data back
    const data = await this.request<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
    return data;
  }

  async login(email: string, password: string) {
    // Server sets httpOnly cookie, we just get user data back
    const data = await this.request<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return data;
  }

  async getMe() {
    return this.request<{ user: User; preferences: UserPreferences }>('/auth/me');
  }

  async updatePreferences(prefs: Partial<UserPreferences>) {
    return this.request<{ preferences: UserPreferences }>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(prefs),
    });
  }

  async logout() {
    // Call server to clear httpOnly cookie
    await this.request<{ message: string }>('/auth/logout', {
      method: 'POST',
    });
  }

  // ================================
  // Tier / Subscription
  // ================================

  async getTiers() {
    return this.request<{ tiers: Tier[] }>('/tiers');
  }

  async getUsage() {
    return this.request<{ usage: UsageInfo }>('/tiers/usage');
  }

  async getUsageHistory(days = 30) {
    return this.request<{ history: UsageHistoryItem[]; usage: UsageInfo }>(`/tiers/usage/history?days=${days}`);
  }

  async checkLimit() {
    return this.request<{ canAnalyze: boolean; reason?: string; usage?: UsageInfo }>('/tiers/check');
  }

  async upgradeTier(tier: 'pro' | 'enterprise') {
    return this.request<{ message: string; usage: UsageInfo }>('/tiers/upgrade', {
      method: 'POST',
      body: JSON.stringify({ tier }),
    });
  }

  async downgradeTier() {
    return this.request<{ message: string; usage: UsageInfo }>('/tiers/downgrade', {
      method: 'POST',
    });
  }

  async generateApiKey() {
    return this.request<{ apiKey: string; message: string }>('/tiers/api-key', {
      method: 'POST',
    });
  }

  // ================================
  // Analysis
  // ================================

  async getLanguages() {
    return this.request<{ languages: Record<string, string> }>('/analyze/languages');
  }

  async analyze(text: string, language: string = 'auto') {
    return this.request<AnalysisResult>('/analyze', {
      method: 'POST',
      body: JSON.stringify({ text, language }),
    });
  }

  async analyzeUrl(url: string, language: string = 'auto') {
    return this.request<AnalysisResult & { source: UrlSource }>('/analyze/url', {
      method: 'POST',
      body: JSON.stringify({ url, language }),
    });
  }

  async extractUrl(url: string) {
    return this.request<{ extracted: ExtractedContent }>('/analyze/extract', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async getAnalysis(id: string) {
    return this.request<AnalysisResult>(`/analyze/${id}`);
  }

  async getSharedAnalysis(shareId: string) {
    return this.request<AnalysisResult>(`/analyze/share/${shareId}`);
  }

  async getHistory(limit = 20, offset = 0) {
    return this.request<{ analyses: AnalysisHistoryItem[]; total: number; hasMore: boolean }>(
      `/analyze/history?limit=${limit}&offset=${offset}`
    );
  }

  async deleteAnalysis(id: string) {
    return this.request<{ deleted: boolean }>(`/analyze/${id}`, { method: 'DELETE' });
  }

  async getExamples() {
    return this.request<{ examples: Example[] }>('/analyze/examples');
  }

  /**
   * Get a short-lived download token for secure file exports
   * This prevents JWT exposure in URLs
   */
  async getDownloadToken(id: string): Promise<string> {
    const data = await this.request<{ downloadToken: string; expiresIn: string }>(
      `/analyze/${id}/download-token`
    );
    return data.downloadToken;
  }

  /**
   * Download export file using secure download token
   */
  async downloadExport(id: string, format: 'json' | 'pdf'): Promise<void> {
    try {
      // First, get a short-lived download token
      const downloadToken = await this.getDownloadToken(id);
      
      // Use the download token in the URL (safe because it's short-lived and single-purpose)
      const url = `${SERVER_URL}/analyze/${id}/export?format=${format}&downloadToken=${downloadToken}`;
      
      // Fetch the file
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new ApiError('Failed to download file', response.status);
      }

      // Get the blob
      const blob = await response.blob();
      
      // Create download link
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `argus-analysis-${id}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Failed to download export', 0);
    }
  }

  getShareUrl(shareId: string) {
    return `${window.location.origin}/share/${shareId}`;
  }

  // ================================
  // Analytics
  // ================================

  async trackEvent(event: string, properties?: Record<string, unknown>) {
    return this.request<{ tracked: boolean }>('/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ event, properties, sessionId: this.getSessionId() }),
    });
  }

  async getDashboard(days = 30) {
    return this.request<AnalyticsDashboard>(`/analytics/dashboard?days=${days}`);
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  }

  // ================================
  // Health
  // ================================

  async healthCheck() {
    return this.request<{ status: string }>('/health');
  }
}

export const api = new ApiService();
export { ApiError };
export default api;
