'use client';

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import SignaturePadLib from 'signature_pad';

export interface SignaturePadHandle {
  toDataURL: () => string;
  isEmpty: () => boolean;
  clear: () => void;
}

interface Props {
  onEnd?: () => void;
  width?: number;
  height?: number;
}

const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  function SignaturePad({ onEnd, width = 500, height = 200 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePadLib | null>(null);

    const handleEnd = useCallback(() => {
      onEnd?.();
    }, [onEnd]);

    useEffect(() => {
      if (!canvasRef.current) return;
      const pad = new SignaturePadLib(canvasRef.current, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
      });
      pad.addEventListener('endStroke', handleEnd);
      padRef.current = pad;

      return () => {
        pad.off();
      };
    }, [handleEnd]);

    useImperativeHandle(ref, () => ({
      toDataURL: () => padRef.current?.toDataURL('image/png') || '',
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      clear: () => padRef.current?.clear(),
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-gray-300 rounded-lg cursor-crosshair touch-none"
        style={{ width: '100%', height: `${height}px` }}
      />
    );
  }
);

export default SignaturePad;
