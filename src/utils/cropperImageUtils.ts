import { BoxCoord } from '../types/manualCropper';

/**
 * Scans pixel luminescences within a normalized BoxCoord on a rendered canvas
 * and detects the tighter bounding box of the non-white ink/content.
 */
export function detectContentBoundsInCanvas(
  canvas: HTMLCanvasElement,
  box: BoxCoord,
  paddingPercent: number = 0.008,
  lumThreshold: number = 242
): BoxCoord {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return box;

  const canvasW = canvas.width;
  const canvasH = canvas.height;

  const pxMinX = Math.max(0, Math.floor(box.xmin * canvasW));
  const pxMinY = Math.max(0, Math.floor(box.ymin * canvasH));
  const pxMaxX = Math.min(canvasW, Math.ceil(box.xmax * canvasW));
  const pxMaxY = Math.min(canvasH, Math.ceil(box.ymax * canvasH));

  const width = pxMaxX - pxMinX;
  const height = pxMaxY - pxMinY;

  if (width <= 10 || height <= 10) return box;

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(pxMinX, pxMinY, width, height);
  } catch (err) {
    console.error('Failed to get image data for smart trim:', err);
    return box;
  }

  const data = imgData.data;

  let minContentX = width;
  let minContentY = height;
  let maxContentX = 0;
  let maxContentY = 0;
  let foundContent = false;

  // Step in 2px increments for high performance even on 4K renders
  const step = 2;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a > 30) {
        // Luminance calculation
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < lumThreshold) {
          foundContent = true;
          if (x < minContentX) minContentX = x;
          if (x > maxContentX) maxContentX = x;
          if (y < minContentY) minContentY = y;
          if (y > maxContentY) maxContentY = y;
        }
      }
    }
  }

  if (!foundContent) return box;

  // Add slight safety padding
  const padX = Math.max(2, Math.floor(width * paddingPercent));
  const padY = Math.max(2, Math.floor(height * paddingPercent));

  minContentX = Math.max(0, minContentX - padX);
  minContentY = Math.max(0, minContentY - padY);
  maxContentX = Math.min(width, maxContentX + padX);
  maxContentY = Math.min(height, maxContentY + padY);

  // Convert back to normalized coordinates
  const newXmin = (pxMinX + minContentX) / canvasW;
  const newYmin = (pxMinY + minContentY) / canvasH;
  const newXmax = (pxMinX + maxContentX) / canvasW;
  const newYmax = (pxMinY + maxContentY) / canvasH;

  return {
    xmin: Math.max(0, Math.min(1, newXmin)),
    ymin: Math.max(0, Math.min(1, newYmin)),
    xmax: Math.max(0, Math.min(1, newXmax)),
    ymax: Math.max(0, Math.min(1, newYmax)),
  };
}

/**
 * Extracts and renders a normalized BoxCoord from the canvas into a crisp PNG Blob.
 */
export async function renderCropBoxToBlob(
  canvas: HTMLCanvasElement,
  box: BoxCoord,
  options: { autoWhiten?: boolean; sharpen?: boolean } = {}
): Promise<Blob> {
  const canvasW = canvas.width;
  const canvasH = canvas.height;

  const sx = Math.max(0, Math.floor(box.xmin * canvasW));
  const sy = Math.max(0, Math.floor(box.ymin * canvasH));
  const sw = Math.min(canvasW - sx, Math.ceil((box.xmax - box.xmin) * canvasW));
  const sh = Math.min(canvasH - sy, Math.ceil((box.ymax - box.ymin) * canvasH));

  if (sw <= 0 || sh <= 0) {
    throw new Error('Invalid crop dimensions');
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Failed to create canvas context');

  // Fill pure white background
  outCtx.fillStyle = '#FFFFFF';
  outCtx.fillRect(0, 0, sw, sh);

  outCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  if (options.autoWhiten) {
    try {
      const imgData = outCtx.getImageData(0, 0, sw, sh);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum > 238) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
        }
      }
      outCtx.putImageData(imgData, 0, 0);
    } catch {
      // Ignore if tainted
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create blob from crop'));
    }, 'image/png');
  });
}

/**
 * Stitches multiple image blobs vertically with an optional divider gap.
 */
export async function stitchBlobsVertically(
  blobs: Blob[],
  gap: number = 12
): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  if (blobs.length === 0) {
    throw new Error('No blobs to stitch');
  }

  if (blobs.length === 1) {
    const url = URL.createObjectURL(blobs[0]);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ blob: blobs[0], url, width: img.width, height: img.height });
      };
      img.src = url;
    });
  }

  const loadedImages: HTMLImageElement[] = await Promise.all(
    blobs.map(
      (b) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          const u = URL.createObjectURL(b);
          img.onload = () => {
            URL.revokeObjectURL(u);
            resolve(img);
          };
          img.onerror = reject;
          img.src = u;
        })
    )
  );

  const maxWidth = Math.max(...loadedImages.map((img) => img.width));
  const totalHeight = loadedImages.reduce((sum, img) => sum + img.height, 0) + (loadedImages.length - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create stitching canvas context');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, maxWidth, totalHeight);

  let currentY = 0;
  for (let i = 0; i < loadedImages.length; i++) {
    const img = loadedImages[i];
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;

    if (i < loadedImages.length - 1 && gap > 0) {
      // Draw subtle dashed divider line
      ctx.save();
      ctx.strokeStyle = '#E2E8F0';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY + gap / 2);
      ctx.lineTo(maxWidth, currentY + gap / 2);
      ctx.stroke();
      ctx.restore();

      currentY += gap;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve({ blob, url, width: maxWidth, height: totalHeight });
      } else {
        reject(new Error('Failed to generate stitched blob'));
      }
    }, 'image/png');
  });
}

/**
 * Magnetically snaps box ymin and ymax to clean horizontal whitespace valleys (local ink minima)
 * within a search radius of +/- searchRadiusPx to prevent cutting through math formulas or text.
 */
export function snapBoxToHorizontalWhitespaceValleys(
  canvas: HTMLCanvasElement,
  box: BoxCoord,
  searchRadiusPx: number = 18,
  inkThreshold: number = 220
): BoxCoord {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return box;

  const w = canvas.width;
  const h = canvas.height;

  const pxXmin = Math.max(0, Math.floor(box.xmin * w));
  const pxXmax = Math.min(w, Math.ceil(box.xmax * w));
  const colWidth = Math.max(10, pxXmax - pxXmin);

  const initialYminPx = Math.floor(box.ymin * h);
  const initialYmaxPx = Math.floor(box.ymax * h);

  // Helper to compute horizontal line ink score (number of dark pixels along horizontal slice)
  const getLineInk = (yPx: number): number => {
    if (yPx < 0 || yPx >= h) return 99999;
    try {
      const lineData = ctx.getImageData(pxXmin, yPx, colWidth, 1).data;
      let darkCount = 0;
      for (let i = 0; i < lineData.length; i += 4) {
        const lum = 0.299 * lineData[i] + 0.587 * lineData[i + 1] + 0.114 * lineData[i + 2];
        if (lum < inkThreshold) darkCount++;
      }
      return darkCount;
    } catch {
      return 0;
    }
  };

  // Find best whitespace valley near ymin
  let bestYminPx = initialYminPx;
  let minInkTop = getLineInk(initialYminPx);

  for (let dy = -searchRadiusPx; dy <= searchRadiusPx; dy++) {
    const testY = initialYminPx + dy;
    const ink = getLineInk(testY);
    if (ink < minInkTop) {
      minInkTop = ink;
      bestYminPx = testY;
      if (ink === 0) break; // Perfect clean whitespace
    }
  }

  // Find best whitespace valley near ymax
  let bestYmaxPx = initialYmaxPx;
  let minInkBottom = getLineInk(initialYmaxPx);

  for (let dy = -searchRadiusPx; dy <= searchRadiusPx + 10; dy++) {
    const testY = initialYmaxPx + dy;
    const ink = getLineInk(testY);
    if (ink < minInkBottom) {
      minInkBottom = ink;
      bestYmaxPx = testY;
      if (ink === 0) break; // Perfect clean whitespace
    }
  }

  return {
    xmin: box.xmin,
    xmax: box.xmax,
    ymin: Math.max(0, Math.min(0.98, bestYminPx / h)),
    ymax: Math.min(1.0, Math.max(box.ymin + 0.02, bestYmaxPx / h)),
  };
}

/**
 * Extracts raw text within a normalized BoxCoord from a PDF.js page.
 */
export async function getTextInBoxFromPdfPage(pdfPage: any, box: BoxCoord): Promise<string> {
  if (!pdfPage) return '';
  try {
    const textContent = await pdfPage.getTextContent();
    const viewport = pdfPage.getViewport({ scale: 1.0 });

    const viewW = viewport.width;
    const viewH = viewport.height;

    const pxMinX = box.xmin * viewW;
    const pxMaxX = box.xmax * viewW;
    const pxMinY = box.ymin * viewH;
    const pxMaxY = box.ymax * viewH;

    const matchedStrings: string[] = [];

    for (const item of textContent.items) {
      if (!item.str || !item.transform) continue;

      // item.transform: [scaleX, skewY, skewX, scaleY, tx, ty]
      // In PDF coordinates, origin is bottom-left
      const tx = item.transform[4];
      const ty = item.transform[5];
      const pdfY = viewH - ty; // convert to top-left coordinate

      if (tx >= pxMinX - 15 && tx <= pxMaxX + 15 && pdfY >= pxMinY - 15 && pdfY <= pxMaxY + 15) {
        matchedStrings.push(item.str);
      }
    }

    return matchedStrings.join(' ').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.error('Failed to extract text from PDF page:', err);
    return '';
  }
}
