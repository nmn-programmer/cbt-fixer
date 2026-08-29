import { BoxCoord } from '../types/manualCropper';

/**
 * Sanitizes and validates a normalized bounding box coordinate.
 * Ensures xmin < xmax and ymin < ymax bounded between [0, 1].
 */
export function sanitizeBox(box?: Partial<BoxCoord> | null): BoxCoord {
  if (!box) {
    return { xmin: 0.035, ymin: 0.1, xmax: 0.49, ymax: 0.4 };
  }
  let xmin = typeof box.xmin === 'number' && !isNaN(box.xmin) ? box.xmin : 0.035;
  let ymin = typeof box.ymin === 'number' && !isNaN(box.ymin) ? box.ymin : 0.1;
  let xmax = typeof box.xmax === 'number' && !isNaN(box.xmax) ? box.xmax : 0.49;
  let ymax = typeof box.ymax === 'number' && !isNaN(box.ymax) ? box.ymax : 0.4;

  xmin = Math.max(0, Math.min(1, xmin));
  ymin = Math.max(0, Math.min(1, ymin));
  xmax = Math.max(0, Math.min(1, xmax));
  ymax = Math.max(0, Math.min(1, ymax));

  if (xmin >= xmax) {
    xmax = Math.min(1, xmin + 0.05);
  }
  if (ymin >= ymax) {
    ymax = Math.min(1, ymin + 0.05);
  }

  return { xmin, ymin, xmax, ymax };
}
