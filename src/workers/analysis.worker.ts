import { fromArrayBuffer } from "geotiff";

import type { WorkerRequest, WorkerResponse } from "../types";
import {
  analyzeStoredImage,
  applyPreprocessToStored,
  defaultPreprocessConfig,
  makeParsedImage,
  type StoredImage
} from "./analysisCore";

const store = new Map<string, StoredImage>();

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "parse_tiff") {
      const stored = await parseTiffFile(request.filename, request.buffer);
      store.set(stored.image.imageId, stored);
      postMessage({
        id: request.id,
        type: "parsed",
        image: stored.image
      } satisfies WorkerResponse);
      return;
    }

    const stored = store.get(request.imageId);
    if (!stored) {
      throw new Error("Image data is no longer available in the worker.");
    }

    if (request.type === "apply_preprocess") {
      const updated = applyPreprocessToStored(stored, request.preprocessing);
      store.set(request.imageId, updated);
      postMessage({
        id: request.id,
        type: "preprocessed",
        image: updated.image
      } satisfies WorkerResponse);
      return;
    }

    const analysis = analyzeStoredImage(stored, request.roi, request.calibration);
    postMessage({
      id: request.id,
      type: "analyzed",
      analysis
    } satisfies WorkerResponse);
  } catch (error) {
    postMessage({
      id: request.id,
      type: "error",
      message: error instanceof Error ? error.message : "Unknown worker error"
    } satisfies WorkerResponse);
  }
};

async function parseTiffFile(filename: string, buffer: ArrayBuffer): Promise<StoredImage> {
  const tiff = await fromArrayBuffer(buffer);
  const imageCount = await tiff.getImageCount();
  const firstImage = await tiff.getImage(0);
  const width = firstImage.getWidth();
  const height = firstImage.getHeight();

  let channels = await parsePages(tiff, imageCount, width, height);
  if (channels.length === 0) {
    const rasters = await firstImage.readRasters({ interleave: false });
    channels = normalizeSampleRasters(rasters, width, height);
  }

  const imageId = self.crypto.randomUUID();
  return {
    image: makeParsedImage(imageId, filename, width, height, channels),
    rawChannels: channels,
    activeChannels: channels,
    preprocessing: defaultPreprocessConfig()
  };
}

async function parsePages(
  tiff: Awaited<ReturnType<typeof fromArrayBuffer>>,
  imageCount: number,
  width: number,
  height: number
): Promise<Array<Uint8Array | Uint16Array>> {
  if (imageCount < 2 || imageCount > 4) {
    return [];
  }

  const channels: Array<Uint8Array | Uint16Array> = [];
  for (let index = 0; index < imageCount; index += 1) {
    const image = await tiff.getImage(index);
    if (image.getWidth() !== width || image.getHeight() !== height) {
      return [];
    }
    const rasters = await image.readRasters({ interleave: false, samples: [0] });
    const firstRaster = Array.isArray(rasters) ? rasters[0] : rasters;
    if (!(firstRaster instanceof Uint8Array) && !(firstRaster instanceof Uint16Array)) {
      throw new Error("Only uint8 and uint16 TIFF files are supported.");
    }
    channels.push(firstRaster);
  }
  return channels;
}

function normalizeSampleRasters(
  rasters: Awaited<ReturnType<Awaited<ReturnType<typeof fromArrayBuffer>>["getImage"]>["readRasters"]>,
  width: number,
  height: number
): Array<Uint8Array | Uint16Array> {
  const values = Array.isArray(rasters) ? rasters : [rasters];
  if (values.length < 2 || values.length > 4) {
    throw new Error("Only 2-, 3-, and 4-channel TIFF files are supported.");
  }

  const channels: Array<Uint8Array | Uint16Array> = [];
  for (const raster of values) {
    if (!(raster instanceof Uint8Array) && !(raster instanceof Uint16Array)) {
      throw new Error("Only uint8 and uint16 TIFF files are supported.");
    }
    if (raster.length !== width * height) {
      throw new Error("Unexpected TIFF raster shape.");
    }
    channels.push(raster);
  }
  return channels;
}
