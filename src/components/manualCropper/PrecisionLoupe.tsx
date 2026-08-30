import React, { useEffect, useRef } from 'react';

interface PrecisionLoupeProps {
  visible: boolean;
  sourceCanvas: HTMLCanvasElement | null;
  cursorX: number; // relative to canvas container (0..containerWidth)
  cursorY: number; // relative to canvas container (0..containerHeight)
  containerWidth: number;
  containerHeight: number;
  zoom?: number;
  diameter?: number;
  label?: string;
}

export const PrecisionLoupe: React.FC<PrecisionLoupeProps> = ({
  visible,
  sourceCanvas,
  cursorX,
  cursorY,
  containerWidth,
  containerHeight,
  zoom = 2.5,
  diameter = 130,
  label,
}) => {
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !sourceCanvas || !loupeCanvasRef.current) return;

    const loupeCanvas = loupeCanvasRef.current;
    const ctx = loupeCanvas.getContext('2d');
    if (!ctx) return;

    const canvasW = sourceCanvas.width;
    const canvasH = sourceCanvas.height;

    // Normalized coordinates
    const normX = Math.max(0, Math.min(1, cursorX / (containerWidth || 1)));
    const normY = Math.max(0, Math.min(1, cursorY / (containerHeight || 1)));

    const srcX = normX * canvasW;
    const srcY = normY * canvasH;

    const sampleW = diameter / zoom;
    const sampleH = diameter / zoom;
    const srcLeft = srcX - sampleW / 2;
    const srcTop = srcY - sampleH / 2;

    ctx.clearRect(0, 0, diameter, diameter);

    // Fill neutral background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, diameter, diameter);

    // Draw magnified snippet
    ctx.imageSmoothingEnabled = false; // keep crisp pixels
    ctx.drawImage(sourceCanvas, srcLeft, srcTop, sampleW, sampleH, 0, 0, diameter, diameter);

    // Draw Crosshairs
    const center = diameter / 2;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; // Red crosshair
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    // Horizontal line
    ctx.moveTo(0, center);
    ctx.lineTo(center - 6, center);
    ctx.moveTo(center + 6, center);
    ctx.lineTo(diameter, center);

    // Vertical line
    ctx.moveTo(center, 0);
    ctx.lineTo(center, center - 6);
    ctx.moveTo(center, center + 6);
    ctx.lineTo(center, diameter);
    ctx.stroke();

    // Center targeting ring
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.beginPath();
    ctx.arc(center, center, 5, 0, Math.PI * 2);
    ctx.stroke();
  }, [visible, sourceCanvas, cursorX, cursorY, containerWidth, containerHeight, zoom, diameter]);

  if (!visible || !sourceCanvas) return null;

  // Position loupe offset from cursor so it doesn't obstruct finger/cursor
  const isRightSide = cursorX < containerWidth / 2;
  const isBottomSide = cursorY < containerHeight / 2;

  const posX = isRightSide ? cursorX + 24 : cursorX - diameter - 24;
  const posY = isBottomSide ? cursorY + 24 : cursorY - diameter - 24;

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-full shadow-2xl border-2 border-indigo-400 bg-slate-950 overflow-hidden flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-100 ring-4 ring-black/40"
      style={{
        width: diameter,
        height: diameter,
        left: Math.max(10, Math.min(containerWidth - diameter - 10, posX)),
        top: Math.max(10, Math.min(containerHeight - diameter - 10, posY)),
      }}
    >
      <canvas ref={loupeCanvasRef} width={diameter} height={diameter} className="w-full h-full block" />
      {label && (
        <div className="absolute bottom-1 bg-black/80 text-[9px] text-white font-mono px-1.5 py-0.2 rounded-full border border-slate-700">
          {label}
        </div>
      )}
    </div>
  );
};
