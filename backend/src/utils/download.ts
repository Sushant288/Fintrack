import { Response } from 'express';

export interface DownloadOptions {
  filename: string;
  contentType: string;
}

/**
 * Configures HTTP response headers for safe and private file downloads (CSV, PDF).
 */
export function setDownloadHeaders(res: Response, opts: DownloadOptions): void {
  res.setHeader('Content-Type', opts.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${opts.filename}"`);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}
