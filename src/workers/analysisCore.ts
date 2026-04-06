import type {
  AdaptiveQuickMetric,
  AnalysisPayload,
  ChannelMetrics,
  ChannelTrace,
  DetectedPeak,
  DistanceUnit,
  LineCalibration,
  LineRoi,
  MorphologyClass,
  ParsedTiffImage,
  Point,
  PreprocessConfig
} from "../types";

export type SupportedRaster = Uint8Array | Uint16Array | Float32Array;

export interface StoredImage {
  image: ParsedTiffImage;
  rawChannels: SupportedRaster[];
  activeChannels: SupportedRaster[];
  preprocessing: PreprocessConfig;
}

interface PeakCandidate {
  index: number;
  value: number;
  prominence: number;
}

interface HalfMaxRegion {
  halfMax: number;
  leftCrossPx: number | null;
  rightCrossPx: number | null;
  fwhmPx: number | null;
}

const DEFAULT_LABELS = ["CH_A", "CH_B", "CH_C", "CH_D"];
const CHANNEL_COLORS = ["#d64550", "#2aa876", "#3b82f6", "#f59e0b"];

export function defaultPreprocessConfig(): PreprocessConfig {
  return {
    enabled: false,
    rollingBallRadius: 50
  };
}

export function makeParsedImage(
  imageId: string,
  filename: string,
  width: number,
  height: number,
  channels: SupportedRaster[]
): ParsedTiffImage {
  validateChannels(channels, width, height);
  const dtype = detectDtype(channels);

  return {
    imageId,
    filename,
    width,
    height,
    dtype,
    channelCount: channels.length,
    channelLabels: DEFAULT_LABELS.slice(0, channels.length),
    previewRgba: buildPreviewRgba(channels, width, height)
  };
}

export function validateChannels(
  channels: ArrayLike<number>[],
  width: number,
  height: number
): void {
  if (channels.length < 2 || channels.length > 4) {
    throw new Error("Only 2-, 3-, and 4-channel TIFF files are supported.");
  }

  for (const channel of channels) {
    if (channel.length !== width * height) {
      throw new Error("TIFF channel dimensions are inconsistent.");
    }
  }
}

export function detectDtype(channels: ArrayLike<number>[]): "uint8" | "uint16" {
  const first = channels[0];
  if (first instanceof Uint8Array) {
    return "uint8";
  }
  if (first instanceof Uint16Array) {
    return "uint16";
  }
  throw new Error("Only uint8 and uint16 TIFF files are supported.");
}

export function buildPreviewRgba(
  channels: ArrayLike<number>[],
  width: number,
  height: number
): Uint8ClampedArray {
  const normalized = channels.map((channel) => scaleChannelForPreview(channel));
  const pixels = width * height;
  const rgba = new Uint8ClampedArray(pixels * 4);

  const red = normalized[0];
  const green = normalized[1];
  const blue = normalized[2] ?? new Uint8Array(pixels);
  const gray = normalized[3];

  for (let index = 0; index < pixels; index += 1) {
    let r = red[index] ?? 0;
    let g = green[index] ?? 0;
    let b = blue[index] ?? 0;
    if (gray) {
      r = Math.min(255, r + gray[index]);
      g = Math.min(255, g + gray[index]);
      b = Math.min(255, b + gray[index]);
    }
    const offset = index * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = 255;
  }

  return rgba;
}

export function scaleChannelForPreview(channel: ArrayLike<number>): Uint8Array {
  const sampled: number[] = [];
  const stride = Math.max(1, Math.floor(channel.length / 50000));
  for (let index = 0; index < channel.length; index += stride) {
    sampled.push(Number(channel[index]));
  }
  const high = percentile(sampled, 99.5) || maxValue(sampled) || 1;
  const output = new Uint8Array(channel.length);
  for (let index = 0; index < channel.length; index += 1) {
    output[index] = Math.round(clamp((Number(channel[index]) / high) * 255, 0, 255));
  }
  return output;
}

export function analyzeStoredImage(
  stored: StoredImage,
  roi: LineRoi,
  calibration: LineCalibration
): AnalysisPayload {
  const traces = stored.activeChannels.map((channel, index) =>
    sampleTrace(
      channel,
      stored.image.width,
      stored.image.height,
      roi,
      stored.image.channelLabels[index],
      CHANNEL_COLORS[index] ?? "#64748b"
    )
  );

  const distancesPx = traces[0]?.distancesPx ?? [];
  const distancesPhysical = distancesPx.map((distance) => distance * calibration.pixelSize);
  const channelTraces: ChannelTrace[] = traces.map((trace) => ({
    label: trace.label,
    color: trace.color,
    rawValues: trace.rawValues,
    smoothedValues: trace.smoothedValues,
    normalizedValues: trace.normalizedValues
  }));
  const metrics = traces.map((trace) => buildChannelMetrics(trace, distancesPx, distancesPhysical, calibration.unit));

  return {
    profile: {
      distancesPx,
      distancesPhysical,
      traces: channelTraces,
      metrics
    }
  };
}

interface SampledTrace extends ChannelTrace {
  distancesPx: number[];
}

export function applyPreprocessToStored(stored: StoredImage, preprocessing: PreprocessConfig): StoredImage {
  const normalized: PreprocessConfig = {
    enabled: preprocessing.enabled,
    rollingBallRadius: Math.max(1, Math.round(preprocessing.rollingBallRadius))
  };

  if (
    stored.preprocessing.enabled === normalized.enabled &&
    stored.preprocessing.rollingBallRadius === normalized.rollingBallRadius
  ) {
    return stored;
  }

  const activeChannels = normalized.enabled
    ? preprocessChannels(stored.rawChannels, stored.image.width, stored.image.height, normalized.rollingBallRadius)
    : stored.rawChannels;

  return {
    ...stored,
    activeChannels,
    preprocessing: normalized,
    image: {
      ...stored.image,
      previewRgba: buildPreviewRgba(activeChannels, stored.image.width, stored.image.height)
    }
  };
}

export function preprocessChannels(
  channels: ArrayLike<number>[],
  width: number,
  height: number,
  rollingBallRadius: number
): Float32Array[] {
  return channels.map((channel) => rollingBallSubtract(channel, width, height, rollingBallRadius));
}

export function rollingBallSubtract(
  channel: ArrayLike<number>,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const source = Float32Array.from(channel, (value) => Number(value));
  if (radius <= 1) {
    return source;
  }

  const factor = Math.max(1, Math.min(8, Math.ceil(radius / 4)));
  const reduced = downsampleMean(source, width, height, factor);
  const reducedRadius = Math.max(1, Math.round(radius / factor));
  const blurred = diskMeanFilter(reduced.data, reduced.width, reduced.height, reducedRadius);

  const output = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const background = bilinearSample(blurred, reduced.width, reduced.height, x / factor, y / factor);
      output[index] = Math.max(source[index] - background, 0);
    }
  }

  return output;
}

export function downsampleMean(
  source: Float32Array,
  width: number,
  height: number,
  factor: number
): { data: Float32Array; width: number; height: number } {
  const reducedWidth = Math.ceil(width / factor);
  const reducedHeight = Math.ceil(height / factor);
  const reduced = new Float32Array(reducedWidth * reducedHeight);

  for (let ry = 0; ry < reducedHeight; ry += 1) {
    for (let rx = 0; rx < reducedWidth; rx += 1) {
      let total = 0;
      let count = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sy = ry * factor + dy;
        if (sy >= height) {
          continue;
        }
        for (let dx = 0; dx < factor; dx += 1) {
          const sx = rx * factor + dx;
          if (sx >= width) {
            continue;
          }
          total += source[sy * width + sx];
          count += 1;
        }
      }
      reduced[ry * reducedWidth + rx] = count > 0 ? total / count : 0;
    }
  }

  return { data: reduced, width: reducedWidth, height: reducedHeight };
}

export function diskOffsets(radius: number): Array<{ x: number; y: number }> {
  const offsets: Array<{ x: number; y: number }> = [];
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) {
        offsets.push({ x, y });
      }
    }
  }
  return offsets;
}

export function diskMeanFilter(
  source: ArrayLike<number>,
  width: number,
  height: number,
  radius: number
): Float32Array {
  const offsets = diskOffsets(radius);
  const output = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      let count = 0;
      for (const offset of offsets) {
        const sx = x + offset.x;
        const sy = y + offset.y;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
          continue;
        }
        total += Number(source[sy * width + sx]);
        count += 1;
      }
      output[y * width + x] = count > 0 ? total / count : 0;
    }
  }

  return output;
}

export function sampleTrace(
  channel: ArrayLike<number>,
  width: number,
  height: number,
  roi: LineRoi,
  label: string,
  color: string
): SampledTrace {
  const distancesPx = sampleDistances(roi);
  const rawValues = distancesPx.map((distance) => {
    const point = pointAlongLine(roi.start, roi.end, distance);
    return bilinearSample(channel, width, height, point.x, point.y);
  });
  const smoothedValues = movingAverage(rawValues, smoothingWindow(rawValues.length));
  const maxRaw = Math.max(...rawValues, 0);
  const normalizedValues =
    maxRaw > 0 ? rawValues.map((value) => value / maxRaw) : rawValues.map(() => 0);

  return {
    label,
    color,
    distancesPx,
    rawValues,
    smoothedValues,
    normalizedValues
  };
}

export function sampleDistances(roi: LineRoi): number[] {
  const total = Math.hypot(roi.end.x - roi.start.x, roi.end.y - roi.start.y);
  if (total === 0) {
    return [0];
  }
  const spacing = Math.max(roi.sampleSpacingPx, 0.5);
  const steps = Math.floor(total / spacing);
  const distances = Array.from({ length: steps + 1 }, (_, index) => index * spacing);
  if (distances[distances.length - 1] < total) {
    distances.push(total);
  }
  return distances;
}

export function pointAlongLine(start: Point, end: Point, distance: number): Point {
  const total = Math.hypot(end.x - start.x, end.y - start.y);
  if (total === 0) {
    return { ...start };
  }
  const ratio = clamp(distance / total, 0, 1);
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio
  };
}

export function bilinearSample(
  channel: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number
): number {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const x1 = clamp(Math.ceil(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const y1 = clamp(Math.ceil(y), 0, height - 1);
  const dx = x - x0;
  const dy = y - y0;

  const topLeft = Number(channel[y0 * width + x0]);
  const topRight = Number(channel[y0 * width + x1]);
  const bottomLeft = Number(channel[y1 * width + x0]);
  const bottomRight = Number(channel[y1 * width + x1]);

  const top = topLeft * (1 - dx) + topRight * dx;
  const bottom = bottomLeft * (1 - dx) + bottomRight * dx;
  return top * (1 - dy) + bottom * dy;
}

export function smoothingWindow(sampleCount: number): number {
  return makeOdd(clamp(Math.round(sampleCount * 0.03), 5, 21));
}

export function movingAverage(values: number[], windowSize: number): number[] {
  if (values.length <= 2 || windowSize <= 1) {
    return [...values];
  }
  const radius = Math.floor(windowSize / 2);
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const candidate = index + offset;
      if (candidate >= 0 && candidate < values.length) {
        total += values[candidate];
        count += 1;
      }
    }
    return count > 0 ? total / count : values[index];
  });
}

export function detectMeaningfulPeaks(values: number[]): PeakCandidate[] {
  if (values.length < 3) {
    return [];
  }

  const dynamicRange = Math.max(0, Math.max(...values) - Math.min(...values));
  if (dynamicRange === 0) {
    return [];
  }

  const minProminence = dynamicRange * 0.1;
  const candidates: PeakCandidate[] = [];
  for (let index = 1; index < values.length - 1; index += 1) {
    if (values[index] > values[index - 1] && values[index] >= values[index + 1]) {
      const prominence = computeProminence(values, index);
      if (prominence >= minProminence) {
        candidates.push({
          index,
          value: values[index],
          prominence
        });
      }
    }
  }

  const spaced: PeakCandidate[] = [];
  for (const candidate of [...candidates].sort((left, right) => right.prominence - left.prominence)) {
    if (spaced.every((selected) => Math.abs(selected.index - candidate.index) >= 5)) {
      spaced.push(candidate);
    }
  }

  return spaced.sort((left, right) => left.index - right.index);
}

export function computeProminence(values: number[], peakIndex: number): number {
  const peak = values[peakIndex];
  let leftMin = peak;
  for (let index = peakIndex - 1; index >= 0; index -= 1) {
    leftMin = Math.min(leftMin, values[index]);
    if (values[index] > peak) {
      break;
    }
  }
  let rightMin = peak;
  for (let index = peakIndex + 1; index < values.length; index += 1) {
    rightMin = Math.min(rightMin, values[index]);
    if (values[index] > peak) {
      break;
    }
  }
  return peak - Math.max(leftMin, rightMin);
}

export function findHalfMaxRegion(
  values: number[],
  peakIndex: number,
  baseline: number,
  referencePeak: number
): HalfMaxRegion {
  const halfMax = baseline + 0.5 * (referencePeak - baseline);
  let leftIndex = peakIndex;
  while (leftIndex > 0 && values[leftIndex] >= halfMax) {
    leftIndex -= 1;
  }

  let rightIndex = peakIndex;
  while (rightIndex < values.length - 1 && values[rightIndex] >= halfMax) {
    rightIndex += 1;
  }

  const leftCrossPx =
    leftIndex === 0 && values[leftIndex] >= halfMax
      ? null
      : interpolateCrossing(leftIndex, values[leftIndex], leftIndex + 1, values[leftIndex + 1], halfMax);
  const rightCrossPx =
    rightIndex === values.length - 1 && values[rightIndex] >= halfMax
      ? null
      : interpolateCrossing(
          rightIndex - 1,
          values[rightIndex - 1],
          rightIndex,
          values[rightIndex],
          halfMax
        );

  return {
    halfMax,
    leftCrossPx,
    rightCrossPx,
    fwhmPx:
      leftCrossPx != null && rightCrossPx != null && rightCrossPx >= leftCrossPx
        ? rightCrossPx - leftCrossPx
        : null
  };
}

export function interpolateCrossing(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  target: number
): number {
  if (y1 === y2) {
    return x1;
  }
  return x1 + ((target - y1) / (y2 - y1)) * (x2 - x1);
}

export function trapezoidalArea(xs: number[], ys: number[]): number {
  if (xs.length < 2 || ys.length < 2) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < xs.length; index += 1) {
    total += ((ys[index - 1] + ys[index]) / 2) * (xs[index] - xs[index - 1]);
  }
  return total;
}

export function classifyTraceMorphology(
  smoothedValues: number[],
  peaks: PeakCandidate[]
): {
  morphologyClass: MorphologyClass;
  dominantPeak: PeakCandidate | null;
  dominantRegion: HalfMaxRegion | null;
  peaksInsideDominantRegion: number;
} {
  if (smoothedValues.length === 0) {
    return {
      morphologyClass: "flat",
      dominantPeak: null,
      dominantRegion: null,
      peaksInsideDominantRegion: 0
    };
  }

  const dynamicRange = Math.max(0, Math.max(...smoothedValues) - Math.min(...smoothedValues));
  const baseline = percentile(smoothedValues, 5);
  const dominantPeak = [...peaks].sort((left, right) => right.prominence - left.prominence)[0] ?? null;
  const dominantRegion =
    dominantPeak != null
      ? findHalfMaxRegion(smoothedValues, dominantPeak.index, baseline, dominantPeak.value)
      : null;
  const peaksInsideDominantRegion =
    dominantRegion?.leftCrossPx != null && dominantRegion.rightCrossPx != null
      ? peaks.filter(
          (peak) =>
            peak.index >= Math.floor(dominantRegion.leftCrossPx) &&
            peak.index <= Math.ceil(dominantRegion.rightCrossPx)
        ).length
      : 0;

  if (dynamicRange === 0 || peaks.length === 0 || dominantPeak == null) {
    return {
      morphologyClass: "flat",
      dominantPeak,
      dominantRegion,
      peaksInsideDominantRegion
    };
  }

  const roughness =
    dynamicRange === 0
      ? 0
      : sumAbsoluteDiff(smoothedValues) / (dynamicRange * Math.max(smoothedValues.length, 1));
  const roughnessFlag = smoothedValues.length >= 15 && peaks.length > 2 && roughness > 0.22;

  if (
    peaks.length > 4 ||
    roughnessFlag ||
    dominantRegion?.leftCrossPx == null ||
    dominantRegion.rightCrossPx == null
  ) {
    return {
      morphologyClass: "chaotic_noisy",
      dominantPeak,
      dominantRegion,
      peaksInsideDominantRegion
    };
  }

  const sortedByProminence = [...peaks].sort((left, right) => right.prominence - left.prominence);
  const first = sortedByProminence[0];
  const second = sortedByProminence[1];

  if (peaks.length === 2 && first && second) {
    const bothStrong =
      first.prominence >= dynamicRange * 0.2 && second.prominence >= dynamicRange * 0.2;
    const heightRatio = Math.min(first.value, second.value) / Math.max(first.value, second.value);
    const largerRegion =
      first.value >= second.value
        ? findHalfMaxRegion(smoothedValues, first.index, baseline, first.value)
        : findHalfMaxRegion(smoothedValues, second.index, baseline, second.value);
    const spacing = Math.abs(first.index - second.index);
    if (
      bothStrong &&
      heightRatio >= 0.6 &&
      largerRegion.fwhmPx != null &&
      spacing >= 0.75 * largerRegion.fwhmPx
    ) {
      return {
        morphologyClass: "two_clear_peaks",
        dominantPeak,
        dominantRegion,
        peaksInsideDominantRegion
      };
    }
  }

  if (peaksInsideDominantRegion > 1) {
    return {
      morphologyClass: "lumpy_merged",
      dominantPeak,
      dominantRegion,
      peaksInsideDominantRegion
    };
  }

  if (peaks.length >= 2 && first && second && second.prominence > 0) {
    if (first.prominence / second.prominence >= 1.8) {
      return {
        morphologyClass: "one_tall_many_small",
        dominantPeak,
        dominantRegion,
        peaksInsideDominantRegion
      };
    }
  }

  if ((peaks.length >= 2 && peaks.length <= 4) || peaksInsideDominantRegion > 1) {
    return {
      morphologyClass: "lumpy_merged",
      dominantPeak,
      dominantRegion,
      peaksInsideDominantRegion
    };
  }

  return {
    morphologyClass: "single_peak",
    dominantPeak,
    dominantRegion,
    peaksInsideDominantRegion
  };
}

export function buildChannelMetrics(
  trace: SampledTrace,
  distancesPx: number[],
  distancesPhysical: number[],
  unit: DistanceUnit
): ChannelMetrics {
  const baseline = percentile(trace.smoothedValues, 5);
  const peakCandidates = detectMeaningfulPeaks(trace.smoothedValues);
  const sortedByProminence = [...peakCandidates].sort((left, right) => right.prominence - left.prominence);
  const primaryPeak = sortedByProminence[0] ?? null;
  const physicalPerPixel =
    distancesPx[1] != null && distancesPx[1] !== 0 && distancesPhysical[1] != null
      ? distancesPhysical[1] / distancesPx[1]
      : 1;

  const peaks: DetectedPeak[] = peakCandidates.map((peak) => {
    const region = findHalfMaxRegion(trace.smoothedValues, peak.index, baseline, peak.value);
    return {
      index: peak.index,
      distancePx: distancesPx[peak.index] ?? peak.index,
      distancePhysical: distancesPhysical[peak.index] ?? peak.index,
      intensity: trace.rawValues[peak.index] ?? peak.value,
      prominence: peak.prominence,
      halfMax: region.halfMax,
      leftCrossPx: region.leftCrossPx,
      rightCrossPx: region.rightCrossPx,
      leftCrossPhysical: region.leftCrossPx != null ? region.leftCrossPx * physicalPerPixel : null,
      rightCrossPhysical: region.rightCrossPx != null ? region.rightCrossPx * physicalPerPixel : null,
      fwhmPx: region.fwhmPx,
      fwhmPhysical: region.fwhmPx != null ? region.fwhmPx * physicalPerPixel : null
    };
  });

  const peakIntensity = Math.max(...trace.rawValues, 0);
  const peakIndex = trace.rawValues.indexOf(peakIntensity);
  const aucPx = trapezoidalArea(distancesPx, trace.rawValues);
  const aucPhysical = trapezoidalArea(distancesPhysical, trace.rawValues);
  const classification = classifyTraceMorphology(trace.smoothedValues, peakCandidates);

  const quickMetric = buildQuickMetric(
    classification.morphologyClass,
    peaks,
    primaryPeak,
    distancesPx,
    distancesPhysical,
    aucPx,
    aucPhysical,
    unit
  );

  return {
    peakIntensity,
    peakDistancePx: distancesPx[peakIndex] ?? 0,
    peakDistancePhysical: distancesPhysical[peakIndex] ?? 0,
    aucPx,
    aucPhysical,
    quickMetric,
    peaks
  };
}

export function buildQuickMetric(
  morphologyClass: MorphologyClass,
  peaks: DetectedPeak[],
  primaryPeak: PeakCandidate | null,
  distancesPx: number[],
  distancesPhysical: number[],
  aucPx: number,
  aucPhysical: number,
  unit: DistanceUnit
): AdaptiveQuickMetric {
  const dominantPeak = primaryPeak ? peaks.find((peak) => peak.index === primaryPeak.index) ?? null : null;
  const sortedByProminence = [...peaks].sort((left, right) => right.prominence - left.prominence);

  const mainPeakMetric = (): AdaptiveQuickMetric => ({
    morphologyClass,
    metricType: "main_peak_fwhm",
    displayLabel: `Primary unit: ${formatDistance(dominantPeak?.fwhmPhysical ?? null, unit)}`,
    valuePx: dominantPeak?.fwhmPx ?? null,
    valuePhysical: dominantPeak?.fwhmPhysical ?? null,
    valueRaw: dominantPeak?.fwhmPhysical ?? null
  });

  const envelopeMetric = (): AdaptiveQuickMetric => ({
    morphologyClass,
    metricType: "envelope_fwhm",
    displayLabel: `Total width: ${formatDistance(dominantPeak?.fwhmPhysical ?? null, unit)}`,
    valuePx: dominantPeak?.fwhmPx ?? null,
    valuePhysical: dominantPeak?.fwhmPhysical ?? null,
    valueRaw: dominantPeak?.fwhmPhysical ?? null
  });

  const peakToPeakMetric = (): AdaptiveQuickMetric => {
    const strongest = sortedByProminence[0];
    const second = sortedByProminence[1];
    const spacingPx =
      strongest && second ? Math.abs((distancesPx[strongest.index] ?? 0) - (distancesPx[second.index] ?? 0)) : null;
    const spacingPhysical =
      strongest && second
        ? Math.abs((distancesPhysical[strongest.index] ?? 0) - (distancesPhysical[second.index] ?? 0))
        : null;
    return {
      morphologyClass,
      metricType: "peak_to_peak",
      displayLabel: `Spacing: ${formatDistance(spacingPhysical, unit)}`,
      valuePx: spacingPx,
      valuePhysical: spacingPhysical,
      valueRaw: spacingPhysical
    };
  };

  const aucMetric = (): AdaptiveQuickMetric => ({
    morphologyClass,
    metricType: "auc",
    displayLabel: `Total Signal: ${formatNumber(aucPhysical)} units`,
    valuePx: aucPx,
    valuePhysical: aucPhysical,
    valueRaw: aucPhysical
  });

  if (morphologyClass === "chaotic_noisy" || morphologyClass === "flat") {
    return aucMetric();
  }
  if (morphologyClass === "two_clear_peaks") {
    return peakToPeakMetric();
  }
  if (morphologyClass === "lumpy_merged") {
    return envelopeMetric();
  }
  return mainPeakMetric();
}

export function exportCsv(analysis: AnalysisPayload): string {
  const headers = [
    "distance_px",
    "distance_physical",
    ...analysis.profile.traces.flatMap((trace) => [
      `${trace.label}_raw`,
      `${trace.label}_smoothed`,
      `${trace.label}_normalized`
    ])
  ];

  const rows = analysis.profile.distancesPx.map((distancePx, index) => [
    distancePx,
    analysis.profile.distancesPhysical[index],
    ...analysis.profile.traces.flatMap((trace) => [
      trace.rawValues[index],
      trace.smoothedValues[index],
      trace.normalizedValues[index]
    ])
  ]);

  return [headers.join(","), ...rows.map((row) => row.map((value) => value.toString()).join(","))].join("\n");
}

export function formatDistance(value: number | null, unit: DistanceUnit): string {
  return value == null ? `N/A ${unit}` : `${formatNumber(value)} ${unit}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  if (Math.abs(value) >= 1000) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sorted[lower];
  }
  const fraction = rank - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

export function sumAbsoluteDiff(values: number[]): number {
  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs(values[index] - values[index - 1]);
  }
  return total;
}

export function maxValue(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function makeOdd(value: number): number {
  return value % 2 === 0 ? value + 1 : value;
}
