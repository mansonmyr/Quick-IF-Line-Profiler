import type { ChannelMetrics, DistanceUnit } from "../types";
import { formatDistance, formatNumber } from "../workers/analysisCore";

interface ChannelMetricCardProps {
  label: string;
  color: string;
  unit: DistanceUnit;
  metrics: ChannelMetrics;
  selectedPeakIndex: number | null;
  onSelectPeak: (peakIndex: number | null) => void;
}

export function ChannelMetricCard({
  label,
  color,
  unit,
  metrics,
  selectedPeakIndex,
  onSelectPeak
}: ChannelMetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-header">
        <div className="metric-swatch" style={{ background: color }} />
        <div>
          <p className="eyebrow">Channel</p>
          <h3>{label}</h3>
        </div>
      </div>

      <div className="quick-metric">
        <p className="quick-metric-label">Recommended quick metric</p>
        <strong>{metrics.quickMetric.displayLabel}</strong>
        <span>{humanizeClass(metrics.quickMetric.morphologyClass)}</span>
      </div>

      <div className="metric-grid">
        <div>
          <small>Peak Intensity</small>
          <strong>{formatNumber(metrics.peakIntensity)}</strong>
        </div>
        <div>
          <small>Peak Position</small>
          <strong>{formatDistance(metrics.peakDistancePhysical, unit)}</strong>
        </div>
        <div>
          <small>AUC</small>
          <strong>{formatNumber(metrics.aucPhysical)}</strong>
        </div>
        <div>
          <small>Detected Peaks</small>
          <strong>{metrics.peaks.length}</strong>
        </div>
      </div>

      <p className="metric-note">
        Each detected peak has its own FWHM. Click a peak row to view that peak's half-maximum guide on the chart.
        For merged traces, use the highlighted quick metric as the overall interpretation.
      </p>

      <div className="peak-list">
        <div className="peak-row peak-row-header">
          <span>Peak</span>
          <span>Position</span>
          <span>Height</span>
          <span>FWHM</span>
        </div>
        {metrics.peaks.length > 0 ? (
          metrics.peaks.map((peak) => (
            <button
              key={peak.index}
              type="button"
              className={selectedPeakIndex === peak.index ? "peak-row peak-row-button selected" : "peak-row peak-row-button"}
              onClick={() => onSelectPeak(selectedPeakIndex === peak.index ? null : peak.index)}
            >
              <span>#{peak.index}</span>
              <span>{formatDistance(peak.distancePhysical, unit)}</span>
              <span>{formatNumber(peak.intensity)}</span>
              <span>{formatDistance(peak.fwhmPhysical, unit)}</span>
            </button>
          ))
        ) : (
          <div className="peak-empty">No meaningful peaks detected on the smoothed trace.</div>
        )}
      </div>
    </article>
  );
}

function humanizeClass(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
