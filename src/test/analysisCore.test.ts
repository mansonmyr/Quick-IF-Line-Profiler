import {
  applyPreprocessToStored,
  bilinearSample,
  buildPreviewRgba,
  classifyTraceMorphology,
  defaultPreprocessConfig,
  detectMeaningfulPeaks,
  findHalfMaxRegion,
  makeParsedImage,
  movingAverage,
  rollingBallSubtract,
  sampleDistances,
  trapezoidalArea
} from "../workers/analysisCore";

describe("analysisCore", () => {
  it("builds an RGB preview for up to four channels", () => {
    const channels = [
      Uint16Array.from([100, 0, 0, 100]),
      Uint16Array.from([0, 100, 0, 100]),
      Uint16Array.from([0, 0, 100, 100]),
      Uint16Array.from([0, 0, 0, 50])
    ];

    const rgba = buildPreviewRgba(channels, 2, 2);

    expect(rgba).toHaveLength(16);
    expect(rgba[0]).toBeGreaterThan(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[15]).toBe(255);
  });

  it("samples distances at 1 px spacing and includes the terminal point", () => {
    const distances = sampleDistances({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 2.4 },
      sampleSpacingPx: 1
    });

    expect(distances).toEqual([0, 1, 2, 2.4]);
  });

  it("performs bilinear interpolation on the sampled line", () => {
    const channel = Float64Array.from([
      0, 10, 20,
      30, 40, 50,
      60, 70, 80
    ]);

    const sampled = bilinearSample(channel, 3, 3, 1.5, 1.5);
    expect(sampled).toBeCloseTo(60, 4);
  });

  it("computes trapezoidal AUC", () => {
    expect(trapezoidalArea([0, 1, 2], [0, 2, 0])).toBeCloseTo(2, 6);
  });

  it("detects a single dominant peak and computes FWHM", () => {
    const values = movingAverage([0, 1, 4, 10, 4, 1, 0], 5);
    const peaks = detectMeaningfulPeaks(values);
    const region = findHalfMaxRegion(values, peaks[0].index, 0, peaks[0].value);

    expect(peaks).toHaveLength(1);
    expect(region.fwhmPx).not.toBeNull();
    expect(region.rightCrossPx).toBeGreaterThan(region.leftCrossPx ?? 0);
  });

  it("classifies two clear peaks", () => {
    const values = [0, 0, 1, 5, 10, 5, 1, 0, 0, 1, 5, 9, 5, 1, 0, 0];
    const peaks = detectMeaningfulPeaks(values);
    const result = classifyTraceMorphology(values, peaks);

    expect(result.morphologyClass).toBe("two_clear_peaks");
  });

  it("classifies one tall peak with smaller neighbors", () => {
    const values = [0, 0, 1, 3, 4, 3, 1, 0, 0, 0, 1, 5, 12, 5, 1, 0, 0, 1, 2, 3, 2, 1, 0];
    const peaks = detectMeaningfulPeaks(values);
    const result = classifyTraceMorphology(values, peaks);

    expect(result.morphologyClass).toBe("one_tall_many_small");
  });

  it("classifies lumpy merged traces when nearby peaks share a half-max envelope", () => {
    const values = [0, 0, 1, 3, 6, 8, 7, 6.4, 6.3, 6.6, 7.3, 8.1, 6, 3, 1, 0, 0];
    const peaks = detectMeaningfulPeaks(values);
    const result = classifyTraceMorphology(values, peaks);

    expect(result.morphologyClass).toBe("lumpy_merged");
  });

  it("classifies highly multi-peak traces as chaotic_noisy", () => {
    const values = [0, 0, 10, 0, 0, 0, 0, 9, 0, 0, 0, 0, 8, 0, 0, 0, 0, 7, 0, 0, 0, 0, 6, 0, 0, 0, 0];
    const peaks = detectMeaningfulPeaks(values);
    const result = classifyTraceMorphology(values, peaks);

    expect(peaks.length).toBeGreaterThan(4);
    expect(result.morphologyClass).toBe("chaotic_noisy");
  });

  it("removes a uniform background with rolling-ball subtraction", () => {
    const channel = Uint16Array.from(Array.from({ length: 25 }, () => 100));
    const output = rollingBallSubtract(channel, 5, 5, 2);

    expect(Math.max(...Array.from(output))).toBeCloseTo(0, 5);
  });

  it("refreshes preview pixels and active channels after preprocessing", () => {
    const channelA = Uint16Array.from([
      10, 10, 10,
      10, 60, 10,
      10, 10, 10
    ]);
    const channelB = Uint16Array.from([
      5, 5, 5,
      5, 20, 5,
      5, 5, 5
    ]);

    const image = makeParsedImage("img-1", "test.tif", 3, 3, [channelA, channelB]);
    const stored = {
      image,
      rawChannels: [channelA, channelB],
      activeChannels: [channelA, channelB],
      preprocessing: defaultPreprocessConfig()
    };

    const processed = applyPreprocessToStored(stored, {
      enabled: true,
      rollingBallRadius: 2
    });

    expect(processed).not.toBe(stored);
    expect(processed.activeChannels[0]).not.toBe(channelA);
    expect(Array.from(processed.image.previewRgba)).not.toEqual(Array.from(image.previewRgba));

    const reverted = applyPreprocessToStored(processed, {
      enabled: false,
      rollingBallRadius: 2
    });

    expect(reverted.activeChannels[0]).toBe(channelA);
  });
});
