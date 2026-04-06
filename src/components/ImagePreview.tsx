import { useEffect, useRef, useState } from "react";

import type { LineRoi, ParsedTiffImage, Point } from "../types";

interface ImagePreviewProps {
  image: ParsedTiffImage | null;
  roi: LineRoi | null;
  onRoiChange: (roi: LineRoi | null) => void;
}

type DragMode = "start" | "end" | "new";

export function ImagePreview({ image, roi, onRoiChange }: ImagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) {
      return;
    }
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const frame = new ImageData(image.previewRgba, image.width, image.height);
    context.putImageData(frame, 0, 0);
  }, [image]);

  function toImagePoint(event: React.PointerEvent<SVGSVGElement>): Point | null {
    const svg = overlayRef.current;
    if (!svg || !image) {
      return null;
    }
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * image.width;
    const y = ((event.clientY - rect.top) / rect.height) * image.height;
    return {
      x: clamp(x, 0, image.width),
      y: clamp(y, 0, image.height)
    };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!image) {
      return;
    }
    const point = toImagePoint(event);
    if (!point) {
      return;
    }

    const threshold = 12 * (image.width / Math.max(overlayRef.current?.getBoundingClientRect().width ?? image.width, 1));
    if (roi && distance(point, roi.start) <= threshold) {
      setDragMode("start");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (roi && distance(point, roi.end) <= threshold) {
      setDragMode("end");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    onRoiChange({
      start: point,
      end: point,
      sampleSpacingPx: 1
    });
    setDragMode("new");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!image || !dragMode) {
      return;
    }
    const point = toImagePoint(event);
    if (!point) {
      return;
    }
    if (dragMode === "start" && roi) {
      onRoiChange({ ...roi, start: point });
      return;
    }
    if (dragMode === "end" && roi) {
      onRoiChange({ ...roi, end: point });
      return;
    }
    onRoiChange({
      start: roi?.start ?? point,
      end: point,
      sampleSpacingPx: 1
    });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragMode(null);
  }

  return (
    <section className="panel preview-panel">
      <div className="panel-heading">
        <p className="eyebrow">Step 2</p>
        <h2>Draw Line ROI</h2>
        <p className="panel-copy">
          Draw one line across the structure of interest, then drag either endpoint to refine it.
        </p>
      </div>
      {image ? (
        <div className="preview-shell" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
          <canvas ref={canvasRef} className="preview-canvas" />
          <svg
            ref={overlayRef}
            className="preview-overlay"
            viewBox={`0 0 ${image.width} ${image.height}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setDragMode(null)}
          >
            <rect x={0} y={0} width={image.width} height={image.height} fill="transparent" />
            {roi ? (
              <>
                <line
                  x1={roi.start.x}
                  y1={roi.start.y}
                  x2={roi.end.x}
                  y2={roi.end.y}
                  stroke="#f8fafc"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <circle cx={roi.start.x} cy={roi.start.y} r={8} fill="#d64550" stroke="#fff" strokeWidth={2} />
                <circle cx={roi.end.x} cy={roi.end.y} r={8} fill="#3b82f6" stroke="#fff" strokeWidth={2} />
              </>
            ) : null}
          </svg>
        </div>
      ) : (
        <div className="empty-state">Upload a TIFF file to start the preview.</div>
      )}
    </section>
  );
}

function distance(left: Point, right: Point): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
