import { Response } from 'express';
import authService from '../services/authService.js';
import analyticsService from '../services/analyticsService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { AuthRequest, RegisterInput, LoginInput } from '../types/index.js';

export const authController = {
  async register(req: AuthRequest, res: Response) {
    const input: RegisterInput = req.body;
    const result = await authService.register(input);

    // Set httpOnly cookie with JWT
    res.cookie(
      authService.getCookieName(),
      result.token,
      authService.getCookieOptions()
    );

    // Track signup
    await analyticsService.trackEvent(
      { event: 'user_signup' },
      { userId: result.user.id, userAgent: req.headers['user-agent'] }
    );

    // Return user data without token (token is in cookie)
    return sendSuccess(res, { user: result.user }, 201);
  },

  async login(req: AuthRequest, res: Response) {
    const input: LoginInput = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const result = await authService.login(input, ip);

    // Set httpOnly cookie with JWT
    res.cookie(
      authService.getCookieName(),
      result.token,
      authService.getCookieOptions()
    );

    // Track login
    await analyticsService.trackEvent(
      { event: 'user_login' },
      { userId: result.user.id, userAgent: req.headers['user-agent'] }
    );

    // Return user data without token (token is in cookie)
    return sendSuccess(res, { user: result.user });
  },

  async logout(req: AuthRequest, res: Response) {
    // Clear the auth cookie
    res.clearCookie(authService.getCookieName(), {
      httpOnly: true,
      secure: authService.getCookieOptions().secure,
      sameSite: authService.getCookieOptions().sameSite,
      path: '/',
    });

    return sendSuccess(res, { message: 'Logged out successfully' });
  },

  async me(req: AuthRequest, res: Response) {
    const user = await authService.getUserById(req.user!.userId);
    const preferences = await authService.getPreferences(req.user!.userId);
    
    return sendSuccess(res, { user, preferences });
  },

  async updatePreferences(req: AuthRequest, res: Response) {
    await authService.updatePreferences(req.user!.userId, req.body);
    const preferences = await authService.getPreferences(req.user!.userId);
    
    return sendSuccess(res, { preferences });
  },

  /**
   * Generate a short-lived download token for secure file downloads
   */
  async getDownloadToken(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const userId = req.user?.userId;

    const downloadToken = authService.generateDownloadToken(id, userId);

    return sendSuccess(res, { downloadToken, expiresIn: '5m' });
  },
};

export default authController;
