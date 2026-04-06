export type DistanceUnit = "nm" | "um";
export type MorphologyClass =
  | "chaotic_noisy"
  | "two_clear_peaks"
  | "one_tall_many_small"
  | "lumpy_merged"
  | "single_peak"
  | "flat";
export type QuickMetricType = "auc" | "main_peak_fwhm" | "envelope_fwhm" | "peak_to_peak";

export interface Point {
  x: number;
  y: number;
}

export interface LineCalibration {
  pixelSize: number;
  unit: DistanceUnit;
}

export interface PreprocessConfig {
  enabled: boolean;
  rollingBallRadius: number;
}

export interface LineRoi {
  start: Point;
  end: Point;
  sampleSpacingPx: number;
}

export interface ParsedTiffImage {
  imageId: string;
  filename: string;
  width: number;
  height: number;
  dtype: "uint8" | "uint16";
  channelCount: number;
  channelLabels: string[];
  previewRgba: Uint8ClampedArray;
}

export interface ChannelTrace {
  label: string;
  color: string;
  rawValues: number[];
  smoothedValues: number[];
  normalizedValues: number[];
}

export interface DetectedPeak {
  index: number;
  distancePx: number;
  distancePhysical: number;
  intensity: number;
  prominence: number;
  halfMax: number;
  leftCrossPx: number | null;
  rightCrossPx: number | null;
  leftCrossPhysical: number | null;
  rightCrossPhysical: number | null;
  fwhmPx: number | null;
  fwhmPhysical: number | null;
}

export interface AdaptiveQuickMetric {
  morphologyClass: MorphologyClass;
  metricType: QuickMetricType;
  displayLabel: string;
  valuePx: number | null;
  valuePhysical: number | null;
  valueRaw: number | null;
}

export interface ChannelMetrics {
  peakIntensity: number;
  peakDistancePx: number;
  peakDistancePhysical: number;
  aucPx: number;
  aucPhysical: number;
  quickMetric: AdaptiveQuickMetric;
  peaks: DetectedPeak[];
}

export interface LineProfileResult {
  distancesPx: number[];
  distancesPhysical: number[];
  traces: ChannelTrace[];
  metrics: ChannelMetrics[];
}

export interface AnalysisPayload {
  profile: LineProfileResult;
}

export interface SelectedPeak {
  channelIndex: number;
  peakIndex: number;
}

export interface WorkerParseRequest {
  id: string;
  type: "parse_tiff";
  filename: string;
  buffer: ArrayBuffer;
}

export interface WorkerPreprocessRequest {
  id: string;
  type: "apply_preprocess";
  imageId: string;
  preprocessing: PreprocessConfig;
}

export interface WorkerAnalyzeRequest {
  id: string;
  type: "analyze_line";
  imageId: string;
  roi: LineRoi;
  calibration: LineCalibration;
}

export type WorkerRequest = WorkerParseRequest | WorkerPreprocessRequest | WorkerAnalyzeRequest;

export interface WorkerParsedResponse {
  id: string;
  type: "parsed";
  image: ParsedTiffImage;
}

export interface WorkerPreprocessedResponse {
  id: string;
  type: "preprocessed";
  image: ParsedTiffImage;
}

export interface WorkerAnalyzedResponse {
  id: string;
  type: "analyzed";
  analysis: AnalysisPayload;
}

export interface WorkerErrorResponse {
  id: string;
  type: "error";
  message: string;
}

export type WorkerResponse =
  | WorkerParsedResponse
  | WorkerPreprocessedResponse
  | WorkerAnalyzedResponse
  | WorkerErrorResponse;
