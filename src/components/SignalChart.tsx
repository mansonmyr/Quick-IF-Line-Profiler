import type { Ref } from "react";

import type { DetectedPeak } from "../types";
import { formatNumber } from "../workers/analysisCore";

interface ChartTrace {
  label: string;
  color: string;
  values: number[];
}

interface PeakGroup {
  channelIndex: number;
  color: string;
  peaks: DetectedPeak[];
}

interface SelectedGuide {
  color: string;
  peak: DetectedPeak;
}

interface SignalChartProps {
  title: string;
  subtitle: string;
  distances: number[];
  xUnit: string;
  yLabel: string;
  traces: ChartTrace[];
  peakGroups?: PeakGroup[];
  selectedGuide?: SelectedGuide | null;
  svgRef?: Ref<SVGSVGElement>;
}

const CHART_WIDTH = 920;
const CHART_HEIGHT = 340;
const LEFT = 68;
const RIGHT = 24;
const TOP = 24;
const BOTTOM = 64;

export function buildAxisTicks(maxValue: number, count = 5): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return [0];
  }
  if (count <= 2) {
    return [0, maxValue];
  }
  return Array.from({ length: count }, (_, index) => (maxValue * index) / (count - 1));
}

export function SignalChart({
  title,
  subtitle,
  distances,
  xUnit,
  yLabel,
  traces,
  peakGroups,
  selectedGuide,
  svgRef
}: SignalChartProps) {
  if (distances.length === 0 || traces.length === 0) {
    return (
      <section className="panel chart-panel">
        <div className="panel-heading">
          <p className="eyebrow">Chart</p>
          <h2>{title}</h2>
          <p className="panel-copy">{subtitle}</p>
        </div>
        <div className="empty-state compact">Draw a line ROI and enter pixel calibration to generate this chart.</div>
      </section>
    );
  }

  const actualMaxDistance = Math.max(...distances, 0);
  const actualMaxValue = Math.max(...traces.flatMap((trace) => trace.values), 0);
  const safeMaxDistance = actualMaxDistance > 0 ? actualMaxDistance : 1;
  const safeMaxValue = actualMaxValue > 0 ? actualMaxValue : 1;
  const plotWidth = CHART_WIDTH - LEFT - RIGHT;
  const plotHeight = CHART_HEIGHT - TOP - BOTTOM;
  const xTicks = buildAxisTicks(actualMaxDistance, 5);
  const yTicks = buildAxisTicks(actualMaxValue, 5);

  const xScale = (value: number) => LEFT + (value / safeMaxDistance) * plotWidth;
  const yScale = (value: number) => TOP + plotHeight - (value / safeMaxValue) * plotHeight;

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <p className="eyebrow">Chart</p>
        <h2>{title}</h2>
        <p className="panel-copy">{subtitle}</p>
      </div>
      <svg
        ref={svgRef}
        className="signal-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={title}
      >
        <rect x={0} y={0} width={CHART_WIDTH} height={CHART_HEIGHT} fill="#08111f" rx={24} />

        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={LEFT}
              x2={CHART_WIDTH - RIGHT}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="rgba(148, 163, 184, 0.18)"
              strokeWidth={1}
            />
            <text
              x={LEFT - 10}
              y={yScale(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="rgba(226, 232, 240, 0.9)"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <g key={`x-${tick}`}>
            <line
              x1={xScale(tick)}
              x2={xScale(tick)}
              y1={TOP}
              y2={TOP + plotHeight}
              stroke="rgba(148, 163, 184, 0.14)"
              strokeWidth={1}
            />
            <text
              x={xScale(tick)}
              y={TOP + plotHeight + 18}
              textAnchor="middle"
              fontSize={11}
              fill="rgba(226, 232, 240, 0.9)"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP + plotHeight} stroke="#94a3b8" strokeWidth={1.2} />
        <line
          x1={LEFT}
          x2={CHART_WIDTH - RIGHT}
          y1={TOP + plotHeight}
          y2={TOP + plotHeight}
          stroke="#94a3b8"
          strokeWidth={1.2}
        />

        {traces.map((trace) => (
          <path
            key={trace.label}
            d={trace.values
              .map((value, index) => `${index === 0 ? "M" : "L"} ${xScale(distances[index])} ${yScale(value)}`)
              .join(" ")}
            fill="none"
            stroke={trace.color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {peakGroups?.map((group) =>
          group.peaks.map((peak) => (
            <circle
              key={`${group.channelIndex}-${peak.index}`}
              cx={xScale(peak.distancePhysical)}
              cy={yScale(peak.intensity)}
              r={4}
              fill={group.color}
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))
        )}

        {selectedGuide?.peak.leftCrossPhysical != null && selectedGuide.peak.rightCrossPhysical != null ? (
          <>
            <line
              x1={xScale(selectedGuide.peak.leftCrossPhysical)}
              x2={xScale(selectedGuide.peak.rightCrossPhysical)}
              y1={yScale(selectedGuide.peak.halfMax)}
              y2={yScale(selectedGuide.peak.halfMax)}
              stroke={selectedGuide.color}
              strokeWidth={2}
              strokeDasharray="6 5"
            />
            <line
              x1={xScale(selectedGuide.peak.leftCrossPhysical)}
              x2={xScale(selectedGuide.peak.leftCrossPhysical)}
              y1={yScale(0)}
              y2={yScale(selectedGuide.peak.halfMax)}
              stroke={selectedGuide.color}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <line
              x1={xScale(selectedGuide.peak.rightCrossPhysical)}
              x2={xScale(selectedGuide.peak.rightCrossPhysical)}
              y1={yScale(0)}
              y2={yScale(selectedGuide.peak.halfMax)}
              stroke={selectedGuide.color}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={xScale(selectedGuide.peak.leftCrossPhysical)}
              y={yScale(selectedGuide.peak.halfMax) - 8}
              fontSize={11}
              fill="#e2e8f0"
            >
              Selected peak guide
            </text>
          </>
        ) : null}

        <text x={CHART_WIDTH / 2} y={CHART_HEIGHT - 10} textAnchor="middle" fontSize={12} fill="#cbd5e1">
          Distance ({xUnit})
        </text>
        <text
          x={16}
          y={CHART_HEIGHT / 2}
          textAnchor="middle"
          fontSize={12}
          fill="#cbd5e1"
          transform={`rotate(-90 16 ${CHART_HEIGHT / 2})`}
        >
          {yLabel}
        </text>
      </svg>
      <div className="chart-legend">
        {traces.map((trace) => (
          <span key={trace.label} className="legend-item">
            <i style={{ background: trace.color }} />
            {trace.label}
          </span>
        ))}
      </div>
    </section>
  );
}
