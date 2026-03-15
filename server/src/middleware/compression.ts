import { Request, Response, NextFunction } from 'express';
import { createGzip, createDeflate } from 'zlib';
import { Transform } from 'stream';

/**
 * Compression middleware for API responses
 * Compresses responses > 1KB using gzip or deflate
 */
export function compressionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if client doesn't accept compression
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  // Skip for small responses or already compressed
  if (req.headers['x-no-compression']) {
    return next();
  }

  // Store original methods
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  
  let chunks: Buffer[] = [];
  let isCompressing = false;

  // Override write to collect chunks
  res.write = function(chunk: any, encodingOrCallback?: any, callback?: any): boolean {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    
    // Handle overloaded signatures
    if (typeof encodingOrCallback === 'function') {
      encodingOrCallback();
      return true;
    }
    if (typeof callback === 'function') {
      callback();
      return true;
    }
    return true;
  };

  // Override end to compress and send
  res.end = function(chunk?: any, encodingOrCallback?: any, callback?: any): Response {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);
    
    // Only compress if response is large enough (> 1KB)
    if (body.length < 1024) {
      res.setHeader('Content-Length', body.length);
      originalWrite(body);
      return originalEnd();
    }

    // Determine compression method
    let encoding: string | null = null;
    let compress: Transform | null = null;

    if (acceptEncoding.includes('gzip')) {
      encoding = 'gzip';
      compress = createGzip({ level: 6 });
    } else if (acceptEncoding.includes('deflate')) {
      encoding = 'deflate';
      compress = createDeflate({ level: 6 });
    }

    if (!compress || !encoding) {
      res.setHeader('Content-Length', body.length);
      originalWrite(body);
      return originalEnd();
    }

    // Remove content-length as it will change
    res.removeHeader('Content-Length');
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Vary', 'Accept-Encoding');

    const compressedChunks: Buffer[] = [];
    
    compress.on('data', (chunk: Buffer) => {
      compressedChunks.push(chunk);
    });

    compress.on('end', () => {
      const compressed = Buffer.concat(compressedChunks);
      res.setHeader('Content-Length', compressed.length);
      originalWrite(compressed);
      originalEnd();
    });

    compress.write(body);
    compress.end();

    return res;
  };

  next();
}

/**
 * Simple compression stats tracking
 */
export const compressionStats = {
  totalOriginal: 0,
  totalCompressed: 0,
  requestCount: 0,
  
  record(original: number, compressed: number): void {
    this.totalOriginal += original;
    this.totalCompressed += compressed;
    this.requestCount++;
  },
  
  getStats() {
    return {
      totalOriginal: this.totalOriginal,
      totalCompressed: this.totalCompressed,
      savedBytes: this.totalOriginal - this.totalCompressed,
      compressionRatio: this.totalOriginal > 0 
        ? (1 - this.totalCompressed / this.totalOriginal) * 100 
        : 0,
      requestCount: this.requestCount,
    };
  },
};

export default compressionMiddleware;
