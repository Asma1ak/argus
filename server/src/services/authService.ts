import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/index.js';
import prisma from '../config/database.js';
import { JWTPayload, UserPublic, RegisterInput, LoginInput, AuthResponse } from '../types/index.js';
import { Errors } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

const SALT_ROUNDS = 12;

// Brute force protection - track by both email and IP
const loginAttempts = new Map<string, { count: number; lastAttempt: Date; lockedUntil?: Date }>();
const ipAttempts = new Map<string, { count: number; lastAttempt: Date; lockedUntil?: Date }>();
const MAX_ATTEMPTS = 5;
const MAX_IP_ATTEMPTS = 20; // Higher threshold for IP (shared IPs)
const LOCKOUT_MINUTES = [1, 5, 15, 60, 240]; // Progressive lockout

// CSRF token storage (in production, use Redis)
const csrfTokens = new Map<string, { token: string; expiresAt: Date }>();

function getLoginKey(email: string): string {
  return `email:${email.toLowerCase()}`;
}

function getIpKey(ip: string): string {
  // Normalize IP
  return `ip:${ip.replace(/^::ffff:/, '')}`;
}

function checkBruteForce(email: string, ip?: string): void {
  // Check email-based lockout
  const emailKey = getLoginKey(email);
  const emailAttempts = loginAttempts.get(emailKey);
  
  if (emailAttempts?.lockedUntil && new Date() < emailAttempts.lockedUntil) {
    const remainingMs = emailAttempts.lockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw Errors.TooManyRequests(`Account temporarily locked. Try again in ${remainingMin} minute(s).`);
  }

  // Check IP-based lockout
  if (ip) {
    const ipKey = getIpKey(ip);
    const ipAttemptsData = ipAttempts.get(ipKey);
    
    if (ipAttemptsData?.lockedUntil && new Date() < ipAttemptsData.lockedUntil) {
      const remainingMs = ipAttemptsData.lockedUntil.getTime() - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      throw Errors.TooManyRequests(`Too many login attempts from this IP. Try again in ${remainingMin} minute(s).`);
    }
  }
}

function recordFailedAttempt(email: string, ip?: string): void {
  // Record email-based attempt
  const emailKey = getLoginKey(email);
  const emailAttemptsData = loginAttempts.get(emailKey) || { count: 0, lastAttempt: new Date() };
  
  emailAttemptsData.count += 1;
  emailAttemptsData.lastAttempt = new Date();
  
  if (emailAttemptsData.count >= MAX_ATTEMPTS) {
    const lockoutIndex = Math.min(Math.floor((emailAttemptsData.count - MAX_ATTEMPTS) / 2), LOCKOUT_MINUTES.length - 1);
    const lockoutMinutes = LOCKOUT_MINUTES[lockoutIndex];
    emailAttemptsData.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
    logger.warn(`Account locked for ${lockoutMinutes} minutes`, { email: email.slice(0, 3) + '***' });
  }
  
  loginAttempts.set(emailKey, emailAttemptsData);

  // Record IP-based attempt
  if (ip) {
    const ipKey = getIpKey(ip);
    const ipAttemptsData = ipAttempts.get(ipKey) || { count: 0, lastAttempt: new Date() };
    
    ipAttemptsData.count += 1;
    ipAttemptsData.lastAttempt = new Date();
    
    if (ipAttemptsData.count >= MAX_IP_ATTEMPTS) {
      const lockoutIndex = Math.min(Math.floor((ipAttemptsData.count - MAX_IP_ATTEMPTS) / 5), LOCKOUT_MINUTES.length - 1);
      const lockoutMinutes = LOCKOUT_MINUTES[lockoutIndex];
      ipAttemptsData.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
      logger.warn(`IP locked for ${lockoutMinutes} minutes`, { ip: ip.slice(0, 8) + '***' });
    }
    
    ipAttempts.set(ipKey, ipAttemptsData);
  }
}

function clearFailedAttempts(email: string, ip?: string): void {
  const emailKey = getLoginKey(email);
  loginAttempts.delete(emailKey);
  
  // Don't clear IP attempts on success - prevents shared IP abuse
}

// Cleanup old entries periodically
setInterval(() => {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
  
  for (const [key, value] of loginAttempts.entries()) {
    if (value.lastAttempt < cutoff) {
      loginAttempts.delete(key);
    }
  }
  
  for (const [key, value] of ipAttempts.entries()) {
    if (value.lastAttempt < cutoff) {
      ipAttempts.delete(key);
    }
  }
  
  // Cleanup expired CSRF tokens
  const now = new Date();
  for (const [key, value] of csrfTokens.entries()) {
    if (value.expiresAt < now) {
      csrfTokens.delete(key);
    }
  }
}, 60 * 60 * 1000); // Every hour

class AuthService {
  /**
   * Hash a password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compare password with hash
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  generateToken(payload: JWTPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as JWTPayload;
    } catch {
      throw Errors.Unauthorized('Invalid or expired token');
    }
  }

  /**
   * Transform user to public format
   */
  toPublicUser(user: { 
    id: string; 
    email: string; 
    name: string | null; 
    avatar: string | null; 
    createdAt: Date; 
    analysisCount: number;
    tier: string;
    tierExpiresAt: Date | null;
    apiKey: string | null;
  }): UserPublic {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      createdAt: user.createdAt,
      analysisCount: user.analysisCount,
      tier: user.tier as 'free' | 'pro' | 'enterprise',
      tierExpiresAt: user.tierExpiresAt,
      apiKey: user.apiKey ? '••••••••' + user.apiKey.slice(-8) : null, // Mask API key
    };
  }

  /**
   * Validate password strength
   */
  validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    
    if (password.length < 12) {
      // For shorter passwords, require more complexity
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /\d/.test(password);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
      
      const complexity = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      
      if (complexity < 3) {
        return { 
          valid: false, 
          message: 'Password must contain at least 3 of: uppercase, lowercase, number, special character' 
        };
      }
    }
    
    // Check for common passwords
    const commonPasswords = [
      'password', '12345678', 'qwerty123', 'letmein', 'welcome', 
      'admin123', 'password1', 'Password1', 'password123'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      return { valid: false, message: 'Password is too common. Please choose a stronger password.' };
    }
    
    return { valid: true };
  }

  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { email, password, name } = input;

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw Errors.Conflict('Email already registered');
    }

    // Validate password strength
    const passwordCheck = this.validatePassword(password);
    if (!passwordCheck.valid) {
      throw Errors.BadRequest(passwordCheck.message!);
    }

    // Create user
    const passwordHash = await this.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        preferences: {
          create: {
            theme: 'dark',
            emailNotifications: true,
          },
        },
      },
    });

    // Log without exposing full email
    const maskedEmail = email.slice(0, 3) + '***@' + email.split('@')[1];
    logger.info(`New user registered: ${maskedEmail}`);

    // Generate token
    const token = this.generateToken({ userId: user.id, email: user.email });

    return {
      user: this.toPublicUser(user),
      token,
    };
  }

  /**
   * Login user
   */
  async login(input: LoginInput, ip?: string): Promise<AuthResponse> {
    const { email, password } = input;

    // Check for brute force lockout
    checkBruteForce(email, ip);

    // Find user - use same error for non-existent user to prevent enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      recordFailedAttempt(email, ip);
      throw Errors.Unauthorized('Invalid email or password');
    }

    // Verify password
    const valid = await this.comparePassword(password, user.passwordHash);
    if (!valid) {
      recordFailedAttempt(email, ip);
      throw Errors.Unauthorized('Invalid email or password');
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(email, ip);

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Log without exposing full email
    const maskedEmail = email.slice(0, 3) + '***@' + email.split('@')[1];
    logger.info(`User logged in: ${maskedEmail}`);

    // Generate token
    const token = this.generateToken({ userId: user.id, email: user.email });

    return {
      user: this.toPublicUser(user),
      token,
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserPublic | null> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user ? this.toPublicUser(user) : null;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, prefs: { theme?: string; emailNotifications?: boolean }): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      update: prefs,
      create: { userId, ...prefs },
    });
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string) {
    return prisma.userPreferences.findUnique({ where: { userId } });
  }

  /**
   * Generate a short-lived download token for secure file downloads
   */
  generateDownloadToken(analysisId: string, userId?: string): string {
    return jwt.sign(
      { 
        analysisId, 
        userId,
        type: 'download' 
      }, 
      config.jwt.secret, // Use same secret for simplicity
      { expiresIn: '5m' } // 5 minutes
    );
  }

  /**
   * Verify a download token
   */
  verifyDownloadToken(token: string): { analysisId: string; userId?: string } | null {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as { 
        analysisId: string; 
        userId?: string; 
        type: string 
      };
      
      if (payload.type !== 'download') {
        return null;
      }
      
      return { analysisId: payload.analysisId, userId: payload.userId };
    } catch {
      return null;
    }
  }

  /**
   * Get cookie options for setting auth cookie
   */
  getCookieOptions() {
    return {
      httpOnly: config.cookie.httpOnly,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      maxAge: config.cookie.maxAge,
      path: config.cookie.path,
    };
  }

  /**
   * Get cookie name
   */
  getCookieName() {
    return config.cookie.name;
  }

  /**
   * Generate a CSRF token for a session
   */
  generateCsrfToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    csrfTokens.set(sessionId, { token, expiresAt });
    
    return token;
  }

  /**
   * Verify a CSRF token (timing-safe)
   */
  verifyCsrfToken(sessionId: string, token: string): boolean {
    const stored = csrfTokens.get(sessionId);
    
    if (!stored || stored.expiresAt < new Date()) {
      return false;
    }
    
    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(stored.token, 'utf8'),
        Buffer.from(token, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Timing-safe string comparison (for API keys, tokens, etc.)
   */
  timingSafeCompare(a: string, b: string): boolean {
    try {
      if (a.length !== b.length) {
        // Still do comparison to maintain constant time
        crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(a, 'utf8'));
        return false;
      }
      return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
    } catch {
      return false;
    }
  }

  /**
   * Hash an API key for secure storage
   */
  hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Sanitize user input (prevent XSS in stored data)
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim()
      .slice(0, 1000); // Limit length
  }
}

export default new AuthService();
