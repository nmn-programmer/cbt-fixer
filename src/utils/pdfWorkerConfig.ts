import * as pdfjsModule from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let isWorkerInitialized = false;

/**
 * Initializes and returns the pdfjsLib instance with a verified worker source configured.
 * Guarantees that GlobalWorkerOptions.workerSrc is safely assigned before any getDocument calls.
 */
export async function getPdfjsLib(): Promise<typeof pdfjsModule> {
  const lib = await import('pdfjs-dist');
  
  if (!isWorkerInitialized || !lib.GlobalWorkerOptions.workerSrc) {
    try {
      // 1. Prefer the bundled Vite worker URL
      if (pdfWorkerUrl) {
        lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      } else {
        lib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      }
    } catch {
      // 2. Fallback to unpkg/cdnjs if URL resolution fails
      const version = lib.version || '4.10.38';
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    }
    isWorkerInitialized = true;
  }

  return lib;
}
