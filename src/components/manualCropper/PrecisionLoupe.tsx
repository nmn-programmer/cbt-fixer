import React, { useEffect, useRef } from 'react';

interface PrecisionLoupeProps {
  visible: boolean;
  pos: { x: number; y: number };
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  zoomLevel?: number;
  label?: string;
  loupeSize?: number;
}

export const PrecisionLoupe: React.FC<PrecisionLoupeProps> = ({
  visible,
  pos,
  canvasRef,
  zoomLevel = 2.5,
  label = '2.5x Magnifier',
  loupeSize = 160,
}) => {
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible || !canvasRef.current || !loupeCanvasRef.current) return;

    const sourceCanvas = canvasRef.current;
    const loupeCanvas = loupeCanvasRef.current;
    const ctx = loupeCanvas.getContext('2d');
    if (!ctx) return;

    const rect = sourceCanvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const sourceX = pos.x - rect.left;
    const sourceY = pos.y - rect.top;

    // Convert mouse screen coordinates to source canvas pixel scale
    const scaleX = sourceCanvas.width / rect.width;
    const scaleY = sourceCanvas.height / rect.height;

    const canvasCenterX = sourceX * scaleX;
    const canvasCenterY = sourceY * scaleY;

    const sw = (loupeSize / zoomLevel) * scaleX;
    const sh = (loupeSize / zoomLevel) * scaleY;
    const sx = canvasCenterX - sw / 2;
    const sy = canvasCenterY - sh / 2;

    ctx.clearRect(0, 0, loupeSize, loupeSize);

    // Save context for circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(loupeSize / 2, loupeSize / 2, loupeSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, loupeSize, loupeSize);

    try {
      ctx.drawImage(
        sourceCanvas,
        Math.max(0, sx),
        Math.max(0, sy),
        sw,
        sh,
        0,
        0,
        loupeSize,
        loupeSize
      );
    } catch (e) {
      // Ignore out of bounds copy errors
    }

    // Crosshair target in center
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(loupeSize / 2 - 10, loupeSize / 2);
    ctx.lineTo(loupeSize / 2 + 10, loupeSize / 2);
    ctx.moveTo(loupeSize / 2, loupeSize / 2 - 10);
    ctx.lineTo(loupeSize / 2, loupeSize / 2 + 10);
    ctx.stroke();

    ctx.restore();
  }, [visible, pos, canvasRef, zoomLevel, loupeSize]);

  if (!visible) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 shadow-2xl rounded-full border-2 border-indigo-500 bg-slate-900 overflow-hidden"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y - 100}px`,
        width: `${loupeSize}px`,
        height: `${loupeSize}px`,
      }}
    >
      <canvas
        ref={loupeCanvasRef}
        width={loupeSize}
        height={loupeSize}
        className="block rounded-full"
      />
      {label && (
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white bg-slate-950/80 px-1.5 py-0.5 rounded-full border border-indigo-500/40 uppercase tracking-widest whitespace-nowrap">
          {label}
        </span>
      )}
    </div>
  );
};
