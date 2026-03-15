// ================================
// Core Application Types
// ================================

import { Request } from 'express';

// ================================
// Issue & Analysis Types
// ================================

export type IssueType = 'fallacy' | 'bias' | 'heuristic' | 'manipulation';
export type Severity = 'low' | 'medium' | 'high';
export type IssueSeverity = Severity; // Alias for compatibility

export interface Issue {
  id?: number;
  type: IssueType;
  name: string;
  explanation: string;
  quote: string;
  suggestion: string;
  counterArgument?: string;
  severity: Severity;
}

export interface AnalysisMetadata {
  issueCount: number;
  severityCounts: Record<Severity, number>;
  typeCounts: Record<string, number>;
}

export interface AnalysisResult {
  id: string;
  text?: string;
  score: number;
  summary: string;
  issues: Issue[];
  metadata: AnalysisMetadata;
  analyzedAt: string;
  shareId?: string;
  isPublic?: boolean;
}

// ================================
// Auth Types
// ================================

export type TierType = 'free' | 'pro' | 'enterprise';

export interface UserPublic {
  id: string;
  email: string;
  name: string | null;
  avatar?: string | null;
  createdAt: Date;
  analysisCount?: number;
  tier: TierType;
  tierExpiresAt?: Date | null;
  apiKey?: string | null;
  preferences?: {
    theme: string;
    emailNotifications: boolean;
  } | null;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export interface AuthPayload {
  userId: string;
  email: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserPublic;
  token: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  sessionId?: string;
  authMethod?: 'jwt' | 'apiKey';
  downloadContext?: {
    analysisId: string;
    userId?: string;
  };
  cookies: Record<string, string>;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
  sessionId?: string;
  cookies: Record<string, string>;
}

// ================================
// Analytics Types
// ================================

export interface AnalyticsEventInput {
  event: string;
  properties?: Record<string, unknown>;
  analysisId?: string;
  sessionId?: string;
}

export interface AnalyticsDashboard {
  overview: {
    totalAnalyses: number;
    totalUsers: number;
    avgScore: number;
    avgIssueCount: number;
  };
  trends: Array<{
    date: string;
    analyses: number;
    users: number;
    avgScore: number;
  }>;
  topIssues: Array<{
    name: string;
    type: IssueType;
    count: number;
  }>;
  scoreDistribution: Array<{
    range: string;
    count: number;
  }>;
}

// ================================
// Config Types
// ================================

export interface AppConfig {
  port: number;
  nodeEnv: string;
  clientUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  groq: {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
  };
  maxTextLength: number;
}

// ================================
// API Response Types
// ================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp?: string;
  meta?: {
    timestamp: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
  };
  timestamp?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;
