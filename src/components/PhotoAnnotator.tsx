'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Icon, icons } from '@/components/ui/Icon';

type Tool = 'freehand' | 'circle' | 'arrow' | 'text';

interface Point { x: number; y: number }

interface Stroke {
  tool: Tool;
  points: Point[];
  text?: string;
}

interface PhotoAnnotatorProps {
  imageUrl: string;
  onSave: (blob: Blob) => void;
  onClose: () => void;
}

const STROKE_COLOR = '#EF4444';
const STROKE_WIDTH = 3;
const FONT_SIZE = 20;

const TOOLS: { id: Tool; label: string; icon: readonly string[] | string }[] = [
  { id: 'freehand', label: 'Draw', icon: icons.edit },
  { id: 'circle', label: 'Circle', icon: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z' },
  { id: 'arrow', label: 'Arrow', icon: 'M5 12h14M12 5l7 7-7 7' },
  { id: 'text', label: 'Text', icon: 'M4 7V4h16v3M9 20h6M12 4v16' },
];

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, lineWidth = STROKE_WIDTH, fontSize = FONT_SIZE) {
  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'freehand') {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  } else if (stroke.tool === 'circle') {
    if (stroke.points.length < 2) return;
    const [start, end] = [stroke.points[0], stroke.points[stroke.points.length - 1]];
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    if (rx < 1 || ry < 1) return;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stroke.tool === 'arrow') {
    if (stroke.points.length < 2) return;
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLen = 16 * (lineWidth / STROKE_WIDTH);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  } else if (stroke.tool === 'text' && stroke.text) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(stroke.text);
    const padding = 4 * (fontSize / FONT_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(
      stroke.points[0].x - padding,
      stroke.points[0].y - fontSize - padding,
      metrics.width + padding * 2,
      fontSize + padding * 2
    );
    ctx.fillStyle = STROKE_COLOR;
    ctx.fillText(stroke.text, stroke.points[0].x, stroke.points[0].y);
  }
}

export function PhotoAnnotator({ imageUrl, onSave, onClose }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgBlobUrlRef = useRef<string | null>(null);

  // Drawing state in refs for real-time performance (no React render cycle)
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const toolRef = useRef<Tool>('freehand');
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const isDrawingRef = useRef(false);

  // React state only for things that need UI re-render
  const [tool, setTool] = useState<Tool>('freehand');
  const [strokeCount, setStrokeCount] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [textInput, setTextInput] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState('');
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const textInputRef = useRef<HTMLInputElement>(null);

  // Keep tool ref in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);

  // Load image via fetch to avoid CORS canvas tainting
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        if (cancelled) return;

        const blobUrl = URL.createObjectURL(blob);
        imgBlobUrlRef.current = blobUrl;

        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          setImgLoaded(true);
        };
        img.src = blobUrl;
      } catch {
        // If fetch fails, try direct load as fallback
        const img = new Image();
        img.onload = () => {
          if (cancelled) return;
          imgRef.current = img;
          setImgLoaded(true);
        };
        img.src = imageUrl;
      }
    })();

    return () => {
      cancelled = true;
      if (imgBlobUrlRef.current) {
        URL.revokeObjectURL(imgBlobUrlRef.current);
      }
    };
  }, [imageUrl]);

  // Size canvas to fit container
  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !containerRef.current) return;

    const resize = () => {
      const container = containerRef.current;
      const img = imgRef.current;
      if (!container || !img) return;

      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const containerRatio = maxW / maxH;

      let w: number, h: number;
      if (imgRatio > containerRatio) {
        w = maxW;
        h = maxW / imgRatio;
      } else {
        h = maxH;
        w = maxH * imgRatio;
      }

      const size = { w: Math.round(w), h: Math.round(h) };
      canvasSizeRef.current = size;
      setCanvasSize(size);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [imgLoaded]);

  // Full redraw — image + all committed strokes
  const fullRedraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, []);

  // Redraw when canvas size changes or strokes change
  useEffect(() => {
    fullRedraw();
  }, [fullRedraw, canvasSize, strokeCount]);

  // --- Direct canvas drawing (no React state) ---

  const getPos = (e: React.TouchEvent | React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    if ('clientX' in e) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    return { x: 0, y: 0 };
  };

  const drawCurrentStroke = () => {
    const canvas = canvasRef.current;
    const stroke = currentStrokeRef.current;
    if (!canvas || !stroke) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw everything (image + committed strokes) then overlay current
    fullRedraw();
    drawStroke(ctx, stroke);
  };

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const pos = getPos(e);

    if (toolRef.current === 'text') {
      setTextInput(pos);
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    isDrawingRef.current = true;
    currentStrokeRef.current = { tool: toolRef.current, points: [pos] };
  };

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const pos = getPos(e);

    if (currentStrokeRef.current.tool === 'freehand') {
      currentStrokeRef.current.points.push(pos);
    } else {
      // Circle/Arrow: keep start, update end
      currentStrokeRef.current.points = [currentStrokeRef.current.points[0], pos];
    }

    drawCurrentStroke();
  };

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !currentStrokeRef.current) return;

    if (currentStrokeRef.current.points.length >= 2) {
      strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
      setStrokeCount(strokesRef.current.length);
    }

    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    fullRedraw();
  };

  const commitText = () => {
    if (textInput && textValue.trim()) {
      strokesRef.current = [...strokesRef.current, {
        tool: 'text',
        points: [textInput],
        text: textValue.trim(),
      }];
      setStrokeCount(strokesRef.current.length);
    }
    setTextInput(null);
    setTextValue('');
  };

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
  };

  const clearAll = () => {
    strokesRef.current = [];
    setStrokeCount(0);
  };

  const handleSave = async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaving(true);

    // Export at full image resolution
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = img.naturalWidth;
    exportCanvas.height = img.naturalHeight;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) { setSaving(false); return; }

    ctx.drawImage(img, 0, 0);

    const scaleX = img.naturalWidth / canvasSizeRef.current.w;
    const scaleY = img.naturalHeight / canvasSizeRef.current.h;

    for (const stroke of strokesRef.current) {
      const scaled: Stroke = {
        ...stroke,
        points: stroke.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })),
      };
      const scaledLineWidth = STROKE_WIDTH * scaleX;
      const scaledFontSize = FONT_SIZE * scaleX;
      drawStroke(ctx, scaled, scaledLineWidth, scaledFontSize);
    }

    exportCanvas.toBlob(blob => {
      if (blob) onSave(blob);
      setSaving(false);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-700 shrink-0">
        <button onClick={onClose} className="text-slate-400 hover:text-white transition p-1">
          <Icon d={icons.x} size={22} />
        </button>
        <span className="text-sm font-medium text-slate-300">Annotate Photo</span>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={strokeCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            Undo
          </button>
          <button
            onClick={clearAll}
            disabled={strokeCount === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white disabled:opacity-30 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden relative p-2">
        {!imgLoaded ? (
          <div className="text-slate-500 text-sm">Loading image...</div>
        ) : (
          <div className="relative" style={{ width: canvasSize.w, height: canvasSize.h }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              className="block rounded-lg"
              style={{ touchAction: 'none', width: canvasSize.w, height: canvasSize.h }}
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
            />
            {/* Floating text input */}
            {textInput && (
              <div
                className="absolute"
                style={{ left: textInput.x, top: textInput.y - 36 }}
              >
                <input
                  ref={textInputRef}
                  type="text"
                  value={textValue}
                  onChange={e => setTextValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitText(); }}
                  onBlur={commitText}
                  className="bg-black/70 border border-red-500/60 rounded px-2 py-1 text-sm text-red-400 font-bold focus:outline-none focus:border-red-400 min-w-[120px]"
                  placeholder="Type label..."
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="shrink-0 bg-slate-900/90 border-t border-slate-700 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex gap-1">
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`
                  w-11 h-11 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all border
                  ${tool === t.id
                    ? 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300'
                  }
                `}
                title={t.label}
              >
                <Icon d={t.icon} size={16} />
                <span className="text-[8px] font-medium leading-none">{t.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={strokeCount === 0 || saving}
            className="px-5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-40 hover:bg-red-600 transition"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
