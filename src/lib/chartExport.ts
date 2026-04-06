const DEFAULT_DPI = 300;
export const TIFF_EXPORT_WIDTH = 1280;
export const TIFF_EXPORT_HEIGHT = 720;
const TIFF_BACKGROUND = "#08111f";

function svgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBoxAttribute = svg.getAttribute("viewBox");
  if (viewBoxAttribute) {
    const parts = viewBoxAttribute
      .split(/[\s,]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return {
    width: Number(svg.getAttribute("width") ?? 920),
    height: Number(svg.getAttribute("height") ?? 340)
  };
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svgDimensions(svg);
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  }
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(clone);
}

export function encodeRgbTiff(
  width: number,
  height: number,
  rgba: Uint8ClampedArray | Uint8Array,
  dpi = DEFAULT_DPI
): Uint8Array {
  const entryCount = 12;
  const ifdOffset = 8;
  const ifdSize = 2 + entryCount * 12 + 4;
  const bitsPerSampleOffset = ifdOffset + ifdSize;
  const xResolutionOffset = bitsPerSampleOffset + 6;
  const yResolutionOffset = xResolutionOffset + 8;
  const pixelOffset = yResolutionOffset + 8;
  const stripByteCount = width * height * 3;
  const buffer = new ArrayBuffer(pixelOffset + stripByteCount);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entryCount, true);

  let entryOffset = ifdOffset + 2;
  const writeEntry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (type === 3 && count === 1) {
      view.setUint16(entryOffset + 8, value, true);
      view.setUint16(entryOffset + 10, 0, true);
    } else {
      view.setUint32(entryOffset + 8, value, true);
    }
    entryOffset += 12;
  };

  writeEntry(256, 4, 1, width);
  writeEntry(257, 4, 1, height);
  writeEntry(258, 3, 3, bitsPerSampleOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, pixelOffset);
  writeEntry(277, 3, 1, 3);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, stripByteCount);
  writeEntry(282, 5, 1, xResolutionOffset);
  writeEntry(283, 5, 1, yResolutionOffset);
  writeEntry(296, 3, 1, 2);
  view.setUint32(entryOffset, 0, true);

  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint32(xResolutionOffset, dpi, true);
  view.setUint32(xResolutionOffset + 4, 1, true);
  view.setUint32(yResolutionOffset, dpi, true);
  view.setUint32(yResolutionOffset + 4, 1, true);

  let pixelWriteOffset = pixelOffset;
  for (let index = 0; index < width * height; index += 1) {
    const rgbaOffset = index * 4;
    bytes[pixelWriteOffset] = rgba[rgbaOffset];
    bytes[pixelWriteOffset + 1] = rgba[rgbaOffset + 1];
    bytes[pixelWriteOffset + 2] = rgba[rgbaOffset + 2];
    pixelWriteOffset += 3;
  }

  return bytes;
}

async function renderSvgTo720pCanvas(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  const markup = serializeSvg(svg);
  const svgBlob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const { width, height } = svgDimensions(svg);

  try {
    return await new Promise<HTMLCanvasElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = TIFF_EXPORT_WIDTH;
        canvas.height = TIFF_EXPORT_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Canvas context is not available."));
          return;
        }

        context.fillStyle = TIFF_BACKGROUND;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        const scale = Math.min(canvas.width / width, canvas.height / height);
        const drawWidth = width * scale;
        const drawHeight = height * scale;
        const offsetX = (canvas.width - drawWidth) / 2;
        const offsetY = (canvas.height - drawHeight) / 2;
        context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
        resolve(canvas);
      };
      image.onerror = () => reject(new Error("Unable to render the SVG chart for TIFF export."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadSvgAsTiff(
  svg: SVGSVGElement,
  filename: string,
  dpi = DEFAULT_DPI
): Promise<void> {
  const canvas = await renderSvgTo720pCanvas(svg);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is not available.");
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const tiffBytes = encodeRgbTiff(canvas.width, canvas.height, imageData.data, dpi);
  downloadBlob(new Blob([tiffBytes], { type: "image/tiff" }), filename);
}
