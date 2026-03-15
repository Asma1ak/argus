import * as cheerio from 'cheerio';
import logger from '../utils/logger.js';
import { Errors } from '../utils/apiResponse.js';

export interface ExtractedContent {
  url: string;
  title: string;
  description: string;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  content: string;
  wordCount: number;
  extractedAt: string;
}

// User agent to avoid being blocked
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Timeout for fetching URLs
const FETCH_TIMEOUT = 15000;

// Max content length (5MB)
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024;

// Elements to remove before extracting content
const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'embed',
  'object',
  'nav',
  'header:not(article header)',
  'footer:not(article footer)',
  'aside',
  '.sidebar',
  '.navigation',
  '.nav',
  '.menu',
  '.advertisement',
  '.ad',
  '.ads',
  '.social-share',
  '.share-buttons',
  '.comments',
  '.comment-section',
  '.related-posts',
  '.recommended',
  '.newsletter',
  '.subscription',
  '.popup',
  '.modal',
  '.cookie-banner',
  '.gdpr',
  '[role="navigation"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
];

// Selectors for main content (in order of priority)
const CONTENT_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.article-content',
  '.article-body',
  '.post-content',
  '.post-body',
  '.entry-content',
  '.content-body',
  '.story-body',
  '#article-body',
  '#content',
  '.content',
];

class UrlExtractorService {
  /**
   * Validate URL format and check for SSRF
   */
  private validateUrl(url: string): URL {
    try {
      const parsed = new URL(url);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }
      
      const hostname = parsed.hostname.toLowerCase();
      
      // Block localhost variations
      if (
        hostname === 'localhost' ||
        hostname === 'localhost.localdomain' ||
        hostname.endsWith('.localhost')
      ) {
        throw new Error('Localhost not allowed');
      }
      
      // Block IP addresses (IPv4)
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (ipv4Regex.test(hostname)) {
        const parts = hostname.split('.').map(Number);
        
        // Block all private/reserved IPv4 ranges
        if (
          parts[0] === 0 ||                                    // 0.0.0.0/8
          parts[0] === 10 ||                                   // 10.0.0.0/8
          parts[0] === 127 ||                                  // 127.0.0.0/8 (loopback)
          (parts[0] === 169 && parts[1] === 254) ||           // 169.254.0.0/16 (link-local)
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
          (parts[0] === 192 && parts[1] === 168) ||           // 192.168.0.0/16
          (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24 (TEST-NET)
          parts[0] >= 224                                      // Multicast & reserved
        ) {
          throw new Error('Private/reserved IP addresses not allowed');
        }
      }
      
      // Block IPv6 addresses (all of them for simplicity)
      if (hostname.includes(':') || hostname.startsWith('[')) {
        throw new Error('IPv6 addresses not allowed');
      }
      
      // Block cloud metadata endpoints
      const blockedHosts = [
        'metadata.google.internal',
        'metadata.goog',
        '169.254.169.254',       // AWS/GCP/Azure metadata
        'metadata.azure.com',
        'metadata.consul.local',
        'kubernetes.default.svc',
        'kubernetes.default',
      ];
      
      if (blockedHosts.some(blocked => hostname === blocked || hostname.endsWith('.' + blocked))) {
        throw new Error('Blocked endpoint');
      }
      
      // Block internal domains (customize for your infrastructure)
      const internalPatterns = [
        /\.internal$/,
        /\.local$/,
        /\.corp$/,
        /\.intranet$/,
      ];
      
      if (internalPatterns.some(pattern => pattern.test(hostname))) {
        throw new Error('Internal domains not allowed');
      }
      
      return parsed;
    } catch (err) {
      throw Errors.BadRequest('Invalid URL format. Please provide a valid http or https URL.');
    }
  }

  /**
   * Fetch HTML content from URL
   */
  private async fetchUrl(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw Errors.BadRequest(`Failed to fetch URL: HTTP ${response.status}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        throw Errors.BadRequest('URL does not point to an HTML page');
      }

      // Check content length
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > MAX_CONTENT_LENGTH) {
        throw Errors.BadRequest('Page is too large to process');
      }

      const html = await response.text();
      
      if (html.length > MAX_CONTENT_LENGTH) {
        throw Errors.BadRequest('Page content is too large to process');
      }

      return html;
    } catch (err: any) {
      clearTimeout(timeout);
      
      if (err.name === 'AbortError') {
        throw Errors.BadRequest('Request timed out. The website took too long to respond.');
      }
      
      if (err.statusCode) throw err; // Re-throw API errors
      
      logger.error('URL fetch error:', err);
      throw Errors.BadRequest('Failed to fetch URL. Please check the URL and try again.');
    }
  }

  /**
   * Extract metadata from HTML
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractMetadata($: any): Partial<ExtractedContent> {
    // Title
    const title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('h1').first().text().trim() ||
      $('title').text().trim() ||
      'Untitled';

    // Description
    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    // Author
    const author =
      $('meta[name="author"]').attr('content') ||
      $('meta[property="article:author"]').attr('content') ||
      $('[rel="author"]').first().text().trim() ||
      $('.author-name').first().text().trim() ||
      null;

    // Published date
    const publishedDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publish-date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime') ||
      null;

    // Site name
    const siteName =
      $('meta[property="og:site_name"]').attr('content') ||
      null;

    return { title, description, author, publishedDate, siteName };
  }

  /**
   * Extract main content from HTML
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractContent($: any): string {
    // Remove unwanted elements
    REMOVE_SELECTORS.forEach(selector => {
      $(selector).remove();
    });

    // Try to find main content using selectors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contentElement: any = null;
    
    for (const selector of CONTENT_SELECTORS) {
      const elements = $(selector);
      if (elements.length > 0) {
        // Pick the one with most text content
        let maxLength = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        elements.each((_: number, el: any) => {
          const text = $(el).text().trim();
          if (text.length > maxLength) {
            maxLength = text.length;
            contentElement = $(el);
          }
        });
        if (contentElement && maxLength > 200) break;
      }
    }

    // Fallback to body
    if (!contentElement) {
      contentElement = $('body');
    }

    // Extract paragraphs and headings
    const textParts: string[] = [];
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentElement!.find('h1, h2, h3, h4, h5, h6, p, li, blockquote, td, th').each((_: number, el: any) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        // Add newlines for headings
        const tagName = $(el).prop('tagName')?.toLowerCase();
        if (tagName && tagName.startsWith('h')) {
          textParts.push(`\n${text}\n`);
        } else {
          textParts.push(text);
        }
      }
    });

    // Join and clean up
    let content = textParts.join('\n');
    
    // Clean up whitespace
    content = content
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
      .replace(/[ \t]+/g, ' ')      // Collapse spaces
      .trim();

    return content;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extract content from a URL
   */
  async extract(url: string): Promise<ExtractedContent> {
    logger.info(`Extracting content from URL: ${url}`);

    // Validate URL
    const parsedUrl = this.validateUrl(url);
    
    // Fetch HTML
    const html = await this.fetchUrl(parsedUrl.toString());
    
    // Parse HTML
    const $ = cheerio.load(html);
    
    // Extract metadata
    const metadata = this.extractMetadata($);
    
    // Extract content
    const content = this.extractContent($);
    
    if (content.length < 100) {
      throw Errors.BadRequest('Could not extract enough content from this URL. The page may be behind a paywall, require JavaScript, or have an unusual structure.');
    }

    const wordCount = this.countWords(content);
    
    logger.info(`Extracted ${wordCount} words from ${url}`);

    return {
      url: parsedUrl.toString(),
      title: metadata.title || 'Untitled',
      description: metadata.description || '',
      author: metadata.author || null,
      publishedDate: metadata.publishedDate || null,
      siteName: metadata.siteName || parsedUrl.hostname,
      content,
      wordCount,
      extractedAt: new Date().toISOString(),
    };
  }
}

export const urlExtractorService = new UrlExtractorService();
export default urlExtractorService;
