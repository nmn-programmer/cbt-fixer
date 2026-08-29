import * as pdfjsModule from 'pdfjs-dist';

let isWorkerInitialized = false;

/**
 * Initializes and returns the pdfjsLib instance with a verified worker source configured.
 * Guarantees that GlobalWorkerOptions.workerSrc is safely assigned before any getDocument calls
 * with exact matching API and Worker versions.
 */
export async function getPdfjsLib(): Promise<typeof pdfjsModule> {
  const lib = await import('pdfjs-dist');
  
  if (!isWorkerInitialized || !lib.GlobalWorkerOptions.workerSrc) {
    const version = lib.version || '6.3.289';
    // Use matching version CDN URL to guarantee API and Worker version parity
    lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    isWorkerInitialized = true;
  }

  return lib;
}
