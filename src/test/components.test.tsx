import { fireEvent, render, screen } from "@testing-library/react";

import { ChannelMetricCard } from "../components/ChannelMetricCard";
import { SignalChart } from "../components/SignalChart";
import type { ChannelMetrics } from "../types";

const metrics: ChannelMetrics = {
  peakIntensity: 12,
  peakDistancePx: 3,
  peakDistancePhysical: 0.3,
  aucPx: 18,
  aucPhysical: 1.8,
  quickMetric: {
    morphologyClass: "single_peak",
    metricType: "main_peak_fwhm",
    displayLabel: "Primary unit: 0.120 um",
    valuePx: 1.2,
    valuePhysical: 0.12,
    valueRaw: 0.12
  },
  peaks: [
    {
      index: 3,
      distancePx: 3,
      distancePhysical: 0.3,
      intensity: 12,
      prominence: 7,
      halfMax: 6,
      leftCrossPx: 2.4,
      rightCrossPx: 3.6,
      leftCrossPhysical: 0.24,
      rightCrossPhysical: 0.36,
      fwhmPx: 1.2,
      fwhmPhysical: 0.12
    }
  ]
};

describe("UI components", () => {
  it("lets the user select a peak row, explains multi-peak FWHM, and shows a renamed channel label", () => {
    const handleSelect = vi.fn();

    render(
      <ChannelMetricCard
        label="PSD95"
        color="#d64550"
        unit="um"
        metrics={metrics}
        selectedPeakIndex={null}
        onSelectPeak={handleSelect}
      />
    );

    expect(screen.getByRole("heading", { name: /PSD95/i })).toBeInTheDocument();
    expect(screen.getByText(/Each detected peak has its own FWHM/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /#3/i }));
    expect(handleSelect).toHaveBeenCalledWith(3);
  });

  it("renders x-axis tick labels, the selected peak guide, and a renamed chart legend label", () => {
    render(
      <SignalChart
        title="Raw Intensity Profile"
        subtitle="test chart"
        distances={[0, 0.1, 0.2, 0.3, 0.4]}
        xUnit="um"
        yLabel="Gray value"
        traces={[
          {
            label: "Synapse A",
            color: "#d64550",
            values: [0, 2, 12, 2, 0]
          }
        ]}
        peakGroups={[
          {
            channelIndex: 0,
            color: "#d64550",
            peaks: metrics.peaks
          }
        ]}
        selectedGuide={{ color: "#d64550", peak: metrics.peaks[0] }}
      />
    );

    expect(screen.getByText(/Selected peak guide/i)).toBeInTheDocument();
    expect(screen.getByText("0.100")).toBeInTheDocument();
    expect(screen.getByText("0.400")).toBeInTheDocument();
    expect(screen.getByText("Synapse A")).toBeInTheDocument();
  });
});
