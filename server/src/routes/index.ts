import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from '../controllers/authController.js';
import { analysisController } from '../controllers/analysisController.js';
import { analyticsController, healthController } from '../controllers/analyticsController.js';
import { tierController } from '../controllers/tierController.js';
import { requireAuth, optionalAuth, verifyDownloadToken, requireAdmin } from '../middleware/auth.js';
import { validate, schemas, sanitizeText } from '../middleware/validation.js';
import { validateIdParam, validateShareId, sanitizeQueryParams, validateExportFormat } from '../middleware/paramValidation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import config from '../config/index.js';

const router = Router();

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Too many attempts, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for registration (prevent mass account creation)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: { success: false, error: { message: 'Too many registration attempts, try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Rate limit exceeded, please wait' } },
});

// ================================
// Health Routes
// ================================
router.get('/health', asyncHandler(healthController.check));
router.get('/health/detailed', requireAuth, asyncHandler(healthController.detailed)); // Require auth for detailed info

// ================================
// Auth Routes
// ================================
router.post('/auth/register', registrationLimiter, validate(schemas.register), asyncHandler(authController.register));
router.post('/auth/login', authLimiter, validate(schemas.login), asyncHandler(authController.login));
router.post('/auth/logout', asyncHandler(authController.logout));
router.get('/auth/me', requireAuth, asyncHandler(authController.me));
router.patch('/auth/preferences', requireAuth, validate(schemas.updatePreferences), asyncHandler(authController.updatePreferences));

// ================================
// Tier / Subscription Routes
// ================================
router.get('/tiers', asyncHandler(tierController.getTiers));
router.get('/tiers/usage', requireAuth, asyncHandler(tierController.getUsage));
router.get('/tiers/usage/history', requireAuth, asyncHandler(tierController.getUsageHistory));
router.get('/tiers/check', optionalAuth, asyncHandler(tierController.checkLimit));
router.post('/tiers/upgrade', requireAuth, validate(schemas.upgradeTier), asyncHandler(tierController.upgrade));
router.post('/tiers/downgrade', requireAuth, asyncHandler(tierController.downgrade));
router.post('/tiers/api-key', requireAuth, asyncHandler(tierController.generateApiKey));

// ================================
// Analysis Routes
// ================================
router.get('/analyze/languages', asyncHandler(analysisController.getLanguages));
router.post('/analyze', analysisLimiter, optionalAuth, sanitizeText, validate(schemas.analyzeText), asyncHandler(analysisController.analyze));
router.post('/analyze/url', analysisLimiter, optionalAuth, validate(schemas.analyzeUrl), asyncHandler(analysisController.analyzeUrl));
router.post('/analyze/extract', analysisLimiter, optionalAuth, validate(schemas.extractUrl), asyncHandler(analysisController.extractUrl));
router.get('/analyze/examples', asyncHandler(analysisController.getExamples));
router.get('/analyze/history', requireAuth, sanitizeQueryParams, asyncHandler(analysisController.getHistory));
router.get('/analyze/share/:shareId', validateShareId, asyncHandler(analysisController.getByShareId));
router.get('/analyze/:id', validateIdParam('id'), optionalAuth, asyncHandler(analysisController.getById));

// Download token endpoint - generates a short-lived token for secure downloads
router.get('/analyze/:id/download-token', validateIdParam('id'), optionalAuth, asyncHandler(authController.getDownloadToken));

// Export endpoint - uses download token for authentication (not regular auth)
router.get('/analyze/:id/export', validateIdParam('id'), validateExportFormat, verifyDownloadToken, asyncHandler(analysisController.exportAnalysis));

router.delete('/analyze/:id', validateIdParam('id'), requireAuth, asyncHandler(analysisController.delete));

// ================================
// Analytics Routes
// ================================
router.post('/analytics/track', optionalAuth, validate(schemas.trackEvent), asyncHandler(analyticsController.trackEvent));
router.get('/analytics/dashboard', requireAuth, sanitizeQueryParams, asyncHandler(analyticsController.getDashboard));

export default router;
