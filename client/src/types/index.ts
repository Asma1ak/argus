// ================================
// API Types
// ================================

export type IssueType = 'fallacy' | 'bias' | 'heuristic' | 'manipulation';
export type IssueSeverity = 'low' | 'medium' | 'high';
export type Theme = 'dark' | 'light' | 'system';
export type TierType = 'free' | 'pro' | 'enterprise';

// Tier definitions
export interface Tier {
  id: TierType;
  name: string;
  dailyLimit: number | 'Unlimited';
  maxTextLength: number;
  features: string[];
  price: number;
}

export interface UsageInfo {
  tier: TierType;
  tierName: string;
  dailyLimit: number;
  dailyUsed: number;
  dailyRemaining: number;
  percentUsed: number;
  canAnalyze: boolean;
  resetAt: string;
  maxTextLength: number;
  features: string[];
}

export interface UsageHistoryItem {
  date: string;
  count: number;
}

// URL extraction types
export interface UrlSource {
  url: string;
  title: string;
  description: string;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  wordCount: number;
  extractedAt: string;
}

export interface ExtractedContent extends UrlSource {
  content: string;
}

// Subcategories for more detailed classification
export type FallacySubtype = 
  | 'formal'           // Structure errors
  | 'relevance'        // Relevance fallacies
  | 'weak_induction'   // Weak induction
  | 'presumption'      // Presumption fallacies
  | 'ambiguity';       // Ambiguity fallacies

export type BiasSubtype =
  | 'judgment'         // Judgment & Decision
  | 'social'           // Social & Self
  | 'memory'           // Memory biases
  | 'probability'      // Probability & Pattern
  | 'metacognitive'    // Metacognitive
  | 'economic';        // Economic & Value

export type ManipulationSubtype =
  | 'conversational'   // Debate manipulation
  | 'psychological'    // Influence tactics
  | 'coercive'         // Control tactics
  | 'propaganda';      // Propaganda techniques

export interface Issue {
  id: number;
  type: IssueType;
  subtype?: FallacySubtype | BiasSubtype | ManipulationSubtype;
  name: string;
  severity: IssueSeverity;
  quote: string;
  explanation: string;
  suggestion: string;
  counterArgument?: string;
}

// Issue type display info
export const ISSUE_TYPE_INFO: Record<IssueType, { icon: string; label: string; description: string }> = {
  fallacy: {
    icon: '⚠️',
    label: 'Logical Fallacy',
    description: 'An error in reasoning that undermines the logic of an argument'
  },
  bias: {
    icon: '🧠',
    label: 'Cognitive Bias',
    description: 'A systematic pattern of deviation from rational judgment'
  },
  heuristic: {
    icon: '⚡',
    label: 'Heuristic',
    description: 'A mental shortcut that can lead to incorrect conclusions'
  },
  manipulation: {
    icon: '🎭',
    label: 'Manipulation Tactic',
    description: 'A technique used to influence or control through unfair means'
  }
};

// Severity display info
export const SEVERITY_INFO: Record<IssueSeverity, { color: string; label: string }> = {
  low: { color: '#10b981', label: 'Low Impact' },
  medium: { color: '#f59e0b', label: 'Medium Impact' },
  high: { color: '#ef4444', label: 'High Impact' }
};

export interface AnalysisResult {
  id: string;
  shareId?: string;
  text?: string;
  summary: string;
  score: number;
  issues: Issue[];
  analyzedAt: string;
  metadata: {
    issueCount: number;
    severityCounts: Record<IssueSeverity, number>;
    typeCounts: Record<IssueType, number>;
  };
}

export interface AnalysisHistoryItem {
  id: string;
  textPreview: string;
  summary: string;
  score: number;
  issueCount: number;
  shareId: string | null;
  createdAt: string;
}

// ================================
// User Types
// ================================

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  createdAt: string;
  analysisCount: number;
  tier: TierType;
  tierExpiresAt?: string;
  apiKey?: string;
}

export interface UserPreferences {
  theme: Theme;
  emailNotifications: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  preferences: UserPreferences | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ================================
// Analytics Types
// ================================

export interface AnalyticsDashboard {
  overview: {
    totalAnalyses: number;
    totalUsers: number;
    avgScore: number;
    avgIssueCount: number;
  };
  trends: {
    date: string;
    analyses: number;
    users: number;
    avgScore: number;
  }[];
  topIssues: {
    name: string;
    type: IssueType;
    count: number;
  }[];
  scoreDistribution: {
    range: string;
    count: number;
  }[];
}

// ================================
// API Response Types
// ================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// ================================
// Component Props Types
// ================================

export interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
}

export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'email' | 'password';
  error?: string;
  disabled?: boolean;
  label?: string;
}

// ================================
// Example Types
// ================================

export interface Example {
  id: number;
  title: string;
  text: string;
}
