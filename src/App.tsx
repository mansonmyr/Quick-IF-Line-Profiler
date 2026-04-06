import { startTransition, useEffect, useMemo, useRef, useState } from "react";

import { ChannelMetricCard } from "./components/ChannelMetricCard";
import { FileDropzone } from "./components/FileDropzone";
import { ImagePreview } from "./components/ImagePreview";
import { SignalChart } from "./components/SignalChart";
import { AnalysisWorkerClient } from "./lib/analysisWorker";
import { downloadSvgAsTiff } from "./lib/chartExport";
import type {
  AnalysisPayload,
  DistanceUnit,
  LineRoi,
  ParsedTiffImage,
  PreprocessConfig,
  SelectedPeak
} from "./types";
import { exportCsv, formatNumber } from "./workers/analysisCore";

const DEFAULT_PREPROCESS: PreprocessConfig = {
  enabled: false,
  rollingBallRadius: 50
};

export default function App() {
  const workerRef = useRef<AnalysisWorkerClient | null>(null);
  const rawChartRef = useRef<SVGSVGElement | null>(null);
  const requestCounterRef = useRef(0);

  const [image, setImage] = useState<ParsedTiffImage | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [roi, setRoi] = useState<LineRoi | null>(null);
  const [pixelSize, setPixelSize] = useState("0.1");
  const [unit, setUnit] = useState<DistanceUnit>("um");
  const [selectedPeak, setSelectedPeak] = useState<SelectedPeak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applyingPreprocess, setApplyingPreprocess] = useState(false);
  const [exportingTiff, setExportingTiff] = useState(false);
  const [csvUrl, setCsvUrl] = useState<string | null>(null);
  const [jsonUrl, setJsonUrl] = useState<string | null>(null);
  const [preprocessEnabled, setPreprocessEnabled] = useState(DEFAULT_PREPROCESS.enabled);
  const [preprocessRadiusInput, setPreprocessRadiusInput] = useState(String(DEFAULT_PREPROCESS.rollingBallRadius));
  const [appliedPreprocess, setAppliedPreprocess] = useState<PreprocessConfig>(DEFAULT_PREPROCESS);
  const [channelLabelInputs, setChannelLabelInputs] = useState<string[]>([]);

  useEffect(() => {
    const worker = new AnalysisWorkerClient();
    workerRef.current = worker;
    return () => worker.dispose();
  }, []);

  useEffect(() => {
    setSelectedPeak(null);
  }, [analysis]);

  const pendingPreprocess = useMemo<PreprocessConfig | null>(() => {
    const radius = Number(preprocessRadiusInput);
    if (preprocessEnabled && (!Number.isFinite(radius) || radius <= 0)) {
      return null;
    }
    return {
      enabled: preprocessEnabled,
      rollingBallRadius: Number.isFinite(radius) ? radius : DEFAULT_PREPROCESS.rollingBallRadius
    };
  }, [preprocessEnabled, preprocessRadiusInput]);

  const normalizedPendingPreprocess = useMemo<PreprocessConfig | null>(() => {
    if (!pendingPreprocess) {
      return null;
    }
    return normalizePreprocessConfig(pendingPreprocess);
  }, [pendingPreprocess]);

  const preprocessDirty =
    normalizedPendingPreprocess != null &&
    (normalizedPendingPreprocess.enabled !== appliedPreprocess.enabled ||
      normalizedPendingPreprocess.rollingBallRadius !== appliedPreprocess.rollingBallRadius);

  const displayChannelLabels = useMemo(
    () => resolveDisplayLabels(image, channelLabelInputs),
    [channelLabelInputs, image]
  );

  const displayAnalysis = useMemo(
    () => applyDisplayLabelsToAnalysis(analysis, displayChannelLabels),
    [analysis, displayChannelLabels]
  );

  useEffect(() => {
    if (!displayAnalysis || !image || !roi) {
      setCsvUrl(null);
      setJsonUrl(null);
      return;
    }

    const csvBlob = new Blob([exportCsv(displayAnalysis)], { type: "text/csv;charset=utf-8" });
    const jsonBlob = new Blob(
      [
        JSON.stringify(
          {
            image: {
              imageId: image.imageId,
              filename: image.filename,
              width: image.width,
              height: image.height,
              channelCount: image.channelCount,
              dtype: image.dtype,
              channelLabels: displayChannelLabels
            },
            roi,
            calibration: {
              pixelSize: Number(pixelSize),
              unit
            },
            preprocessing: appliedPreprocess,
            analysis: displayAnalysis
          },
          null,
          2
        )
      ],
      { type: "application/json;charset=utf-8" }
    );

    const nextCsvUrl = URL.createObjectURL(csvBlob);
    const nextJsonUrl = URL.createObjectURL(jsonBlob);
    setCsvUrl(nextCsvUrl);
    setJsonUrl(nextJsonUrl);
    return () => {
      URL.revokeObjectURL(nextCsvUrl);
      URL.revokeObjectURL(nextJsonUrl);
    };
  }, [appliedPreprocess, displayAnalysis, displayChannelLabels, image, pixelSize, roi, unit]);

  useEffect(() => {
    const calibration = Number(pixelSize);
    const worker = workerRef.current;

    if (!worker || !image || !roi || !Number.isFinite(calibration) || calibration <= 0) {
      return;
    }

    setAnalyzing(true);
    setError(null);
    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;

    const timer = window.setTimeout(() => {
      void worker
        .analyzeLine(image.imageId, roi, {
          pixelSize: calibration,
          unit
        })
        .then((nextAnalysis) => {
          if (requestCounterRef.current !== requestId) {
            return;
          }
          startTransition(() => {
            setAnalysis(nextAnalysis);
            setAnalyzing(false);
          });
        })
        .catch((reason) => {
          if (requestCounterRef.current !== requestId) {
            return;
          }
          setError(reason instanceof Error ? reason.message : "Line analysis failed.");
          setAnalyzing(false);
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [image, pixelSize, roi, unit]);

  const selectedGuide = useMemo(() => {
    if (!analysis || !selectedPeak) {
      return null;
    }
    const channel = analysis.profile.traces[selectedPeak.channelIndex];
    const metrics = analysis.profile.metrics[selectedPeak.channelIndex];
    const peak = metrics?.peaks.find((candidate) => candidate.index === selectedPeak.peakIndex);
    if (!channel || !peak) {
      return null;
    }
    return { color: channel.color, peak };
  }, [analysis, selectedPeak]);

  const rawChartTraces =
    displayAnalysis?.profile.traces.map((trace) => ({
      label: trace.label,
      color: trace.color,
      values: trace.rawValues
    })) ?? [];

  const chartSubtitle = appliedPreprocess.enabled
    ? `Rolling-ball background subtraction is active at ${appliedPreprocess.rollingBallRadius} px. Peak markers come from the smoothed trace while the plotted values show the processed channel intensities.`
    : "Peak markers come from the smoothed trace while the plotted values remain the original raw channel intensities.";

  async function handleFileSelect(file: File) {
    const worker = workerRef.current;
    if (!worker) {
      return;
    }

    setLoadingImage(true);
    setError(null);
    setAnalysis(null);
    setRoi(null);
    setSelectedPeak(null);

    try {
      const parsed = await worker.parseTiff(file);
      startTransition(() => {
        setImage(parsed);
        setChannelLabelInputs(parsed.channelLabels);
        setPreprocessEnabled(DEFAULT_PREPROCESS.enabled);
        setPreprocessRadiusInput(String(DEFAULT_PREPROCESS.rollingBallRadius));
        setAppliedPreprocess(DEFAULT_PREPROCESS);
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to parse the TIFF file.");
    } finally {
      setLoadingImage(false);
    }
  }

  async function handleApplyPreprocess() {
    const worker = workerRef.current;
    if (!worker || !image) {
      return;
    }
    if (!normalizedPendingPreprocess) {
      setError("Enter a positive rolling-ball radius before applying background subtraction.");
      return;
    }

    setApplyingPreprocess(true);
    setError(null);
    setSelectedPeak(null);

    try {
      const nextImage = await worker.applyPreprocess(image.imageId, normalizedPendingPreprocess);
      startTransition(() => {
        setImage(nextImage);
        setAnalysis(null);
        setAppliedPreprocess(normalizedPendingPreprocess);
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the rolling-ball preprocessing.");
    } finally {
      setApplyingPreprocess(false);
    }
  }

  function handleChannelLabelChange(channelIndex: number, nextValue: string) {
    setChannelLabelInputs((current) => {
      const next = [...current];
      next[channelIndex] = nextValue;
      return next;
    });
  }

  async function handleExportTiff() {
    if (!rawChartRef.current) {
      return;
    }
    setExportingTiff(true);
    setError(null);
    try {
      await downloadSvgAsTiff(rawChartRef.current, "line-profile-chart-720p.tif");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export the chart as TIFF.");
    } finally {
      setExportingTiff(false);
    }
  }

  const statusLabel = loadingImage
    ? "Parsing TIFF..."
    : applyingPreprocess
      ? "Updating preview and signal..."
      : analyzing
        ? "Analyzing line ROI..."
        : "Ready";
  const preprocessingLabel = appliedPreprocess.enabled
    ? `Rolling-ball active (${appliedPreprocess.rollingBallRadius} px)`
    : "Raw signal";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Adaptive Netlify Line Profiler</p>
          <h1>Browser-only TIFF line analysis for Netlify deployment</h1>
          <p className="hero-copy">
            Draw one line, calibrate the pixel size, optionally apply rolling-ball background subtraction,
            rename the channel labels, and inspect raw intensity, adaptive quick metrics, FWHM, AUC, and peak locations without any backend service.
          </p>
        </div>
        <div className="hero-stats">
          <span className="hero-chip">Static SPA</span>
          <span className="hero-chip">Worker-based analysis</span>
          <span className="hero-chip">720p TIFF export</span>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="top-grid">
        <div className="left-column">
          <FileDropzone busy={loadingImage} onFileSelect={handleFileSelect} />
          <section className="panel calibration-panel">
            <div className="panel-heading">
              <p className="eyebrow">Step 3</p>
              <h2>Calibration, Labels, Preprocessing, and Export</h2>
              <p className="panel-copy">
                Enter the physical pixel size, rename channels for clearer interpretation, and optionally subtract broad background signal before exporting the updated profile.
              </p>
            </div>

            <div className="control-grid">
              <label className="field">
                <span>Pixel size</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={pixelSize}
                  onChange={(event) => setPixelSize(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Unit</span>
                <select value={unit} onChange={(event) => setUnit(event.target.value as DistanceUnit)}>
                  <option value="um">um</option>
                  <option value="nm">nm</option>
                </select>
              </label>
            </div>

            {image ? (
              <div className="label-editor-block">
                <div className="subsection-heading">
                  <h3>Channel labels</h3>
                  <p className="panel-copy compact-copy">
                    Renamed labels are applied to the chart legend, metric cards, CSV headers, and JSON export.
                  </p>
                </div>
                <div className="channel-label-grid">
                  {image.channelLabels.map((defaultLabel, channelIndex) => (
                    <label className="field" key={`${image.imageId}-${channelIndex}`}>
                      <span>Channel {channelIndex + 1}</span>
                      <input
                        type="text"
                        value={channelLabelInputs[channelIndex] ?? defaultLabel}
                        placeholder={defaultLabel}
                        onChange={(event) => handleChannelLabelChange(channelIndex, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="preprocess-block">
              <div className="subsection-heading">
                <h3>Rolling-ball background subtraction</h3>
                <p className="panel-copy compact-copy">
                  Use the radius as the subtraction strength. Larger radii remove broader background haze, while smaller radii stay closer to the raw image. Click Preview / Apply to refresh both the image preview and the measured traces.
                </p>
              </div>
              <div className="preprocess-grid">
                <label className="toggle-field">
                  <input
                    type="checkbox"
                    checked={preprocessEnabled}
                    onChange={(event) => setPreprocessEnabled(event.target.checked)}
                  />
                  <span>Enable rolling-ball subtraction</span>
                </label>
                <label className="field">
                  <span>Rolling-ball radius (px)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={preprocessRadiusInput}
                    onChange={(event) => setPreprocessRadiusInput(event.target.value)}
                    disabled={!preprocessEnabled}
                  />
                </label>
                <div className="button-field">
                  <span>Refresh preview and metrics</span>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void handleApplyPreprocess()}
                    disabled={!image || !normalizedPendingPreprocess || !preprocessDirty || applyingPreprocess}
                  >
                    {applyingPreprocess ? "Applying..." : "Preview / Apply"}
                  </button>
                </div>
              </div>
              <p className="helper-copy">
                Disable the toggle and apply again whenever you want to go back to the original raw signal.
              </p>
            </div>

            <div className="meta-block">
              <span>Image</span>
              <strong>{image ? `${image.filename} (${image.width} x ${image.height})` : "No TIFF loaded"}</strong>
            </div>
            <div className="meta-block">
              <span>Status</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className="meta-block">
              <span>Active preview</span>
              <strong>{preprocessingLabel}</strong>
            </div>
            <div className="meta-block">
              <span>Chart export</span>
              <strong>TIFF only, fixed at 1280 x 720</strong>
            </div>

            <div className="export-actions">
              <button
                type="button"
                className="export-button"
                onClick={() => void handleExportTiff()}
                disabled={!displayAnalysis || exportingTiff}
              >
                {exportingTiff ? "Exporting TIFF..." : "Export TIFF (720p)"}
              </button>
              <a className={csvUrl ? "export-link" : "export-link disabled"} href={csvUrl ?? undefined} download="line-profile.csv">
                Export CSV
              </a>
              <a
                className={jsonUrl ? "export-link" : "export-link disabled"}
                href={jsonUrl ?? undefined}
                download="line-profile.json"
              >
                Export JSON
              </a>
            </div>
          </section>
        </div>

        <ImagePreview image={image} roi={roi} onRoiChange={setRoi} />
      </section>

      <section className="chart-stack">
        <SignalChart
          title="Intensity Profile"
          subtitle={chartSubtitle}
          distances={displayAnalysis?.profile.distancesPhysical ?? []}
          xUnit={unit}
          yLabel="Gray value"
          traces={rawChartTraces}
          peakGroups={displayAnalysis?.profile.metrics.map((metrics, channelIndex) => ({
            channelIndex,
            color: displayAnalysis.profile.traces[channelIndex].color,
            peaks: metrics.peaks
          }))}
          selectedGuide={selectedGuide}
          svgRef={rawChartRef}
        />
      </section>

      <section className="panel metrics-panel">
        <div className="panel-heading">
          <p className="eyebrow">Step 4</p>
          <h2>Adaptive Metrics</h2>
          <p className="panel-copy">
            Every channel shows Peak Intensity, Peak Position, AUC, and detected peaks. The highlighted quick metric adapts to the trace shape so you can separate total width, primary width, spacing, and total signal more quickly.
          </p>
        </div>
        <p className="metric-guidance">
          Each detected peak has its own FWHM. Click a peak row to overlay that half-maximum guide on the chart; for merged or lumpy traces, use the recommended quick metric as the overall interpretation.
        </p>
        {displayAnalysis ? (
          <>
            <div className="summary-strip">
              <span>Samples {displayAnalysis.profile.distancesPx.length}</span>
              <span>Channels {displayAnalysis.profile.traces.length}</span>
              <span>
                ROI length {formatNumber(displayAnalysis.profile.distancesPhysical.at(-1) ?? 0)} {unit}
              </span>
              <span>{preprocessingLabel}</span>
            </div>
            <div className="metric-card-grid">
              {displayAnalysis.profile.metrics.map((metrics, channelIndex) => (
                <ChannelMetricCard
                  key={`${channelIndex}-${displayAnalysis.profile.traces[channelIndex].label}`}
                  label={displayAnalysis.profile.traces[channelIndex].label}
                  color={displayAnalysis.profile.traces[channelIndex].color}
                  unit={unit}
                  metrics={metrics}
                  selectedPeakIndex={
                    selectedPeak?.channelIndex === channelIndex ? selectedPeak.peakIndex : null
                  }
                  onSelectPeak={(peakIndex) =>
                    setSelectedPeak(
                      peakIndex == null
                        ? null
                        : {
                            channelIndex,
                            peakIndex
                          }
                    )
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state compact">
            Load a TIFF, draw a line ROI, and enter a positive pixel size to populate the adaptive metrics.
          </div>
        )}
      </section>
    </main>
  );
}

function normalizePreprocessConfig(config: PreprocessConfig): PreprocessConfig {
  return {
    enabled: config.enabled,
    rollingBallRadius: Math.max(1, Math.round(config.rollingBallRadius))
  };
}

function resolveDisplayLabels(image: ParsedTiffImage | null, inputs: string[]): string[] {
  if (!image) {
    return [];
  }
  return image.channelLabels.map((defaultLabel, index) => {
    const candidate = inputs[index]?.trim();
    return candidate ? candidate : defaultLabel;
  });
}

function applyDisplayLabelsToAnalysis(
  analysis: AnalysisPayload | null,
  labels: string[]
): AnalysisPayload | null {
  if (!analysis) {
    return null;
  }
  return {
    profile: {
      ...analysis.profile,
      traces: analysis.profile.traces.map((trace, index) => ({
        ...trace,
        label: labels[index] ?? trace.label
      }))
    }
  };
}
