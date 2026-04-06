import {
  encodeRgbTiff,
  serializeSvg,
  TIFF_EXPORT_HEIGHT,
  TIFF_EXPORT_WIDTH
} from "../lib/chartExport";

describe("chartExport", () => {
  it("serializes an SVG with explicit dimensions and namespaces", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 60");
    svg.innerHTML = '<rect x="0" y="0" width="120" height="60" fill="#000" />';

    const markup = serializeSvg(svg);

    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(markup).toContain('width="120"');
    expect(markup).toContain('height="60"');
  });

  it("uses a fixed 720p TIFF export preset", () => {
    expect(TIFF_EXPORT_WIDTH).toBe(1280);
    expect(TIFF_EXPORT_HEIGHT).toBe(720);
  });

  it("encodes an RGB TIFF with the expected dimensions and pixel data", () => {
    const rgba = Uint8ClampedArray.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255
    ]);
    const bytes = encodeRgbTiff(2, 2, rgba, 300);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ifdOffset = view.getUint32(4, true);
    const entryCount = view.getUint16(ifdOffset, true);
    const entries = new Map<number, { type: number; count: number; value: number }>();

    let offset = ifdOffset + 2;
    for (let index = 0; index < entryCount; index += 1) {
      const tag = view.getUint16(offset, true);
      const type = view.getUint16(offset + 2, true);
      const count = view.getUint32(offset + 4, true);
      const value = type === 3 && count === 1 ? view.getUint16(offset + 8, true) : view.getUint32(offset + 8, true);
      entries.set(tag, { type, count, value });
      offset += 12;
    }

    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("II");
    expect(view.getUint16(2, true)).toBe(42);
    expect(entries.get(256)?.value).toBe(2);
    expect(entries.get(257)?.value).toBe(2);
    expect(entries.get(279)?.value).toBe(12);

    const stripOffset = entries.get(273)?.value ?? 0;
    expect(Array.from(bytes.slice(stripOffset, stripOffset + 6))).toEqual([255, 0, 0, 0, 255, 0]);
  });
});
