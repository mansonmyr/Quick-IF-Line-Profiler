# Quick Immunofluorescence image Line Profiler (QILP)

A browser-only TIFF line intensity profiler for 2-, 3-, and 4-channel scientific TIFF files stored as `uint8` or `uint16` data. 

					[** 🔗 Launch Live Demo **](https://qilp.netlify.app) 
---

## What The App Does

The app lets you:

- Upload a multi-channel TIFF from your browser.
- Draw one straight line ROI on the image preview.
- Enter a physical pixel size in `um` or `nm`.
- Optionally apply rolling-ball background subtraction in the browser.
- Measure each channel along the line ROI.
- View one raw intensity chart with channel overlays and peak markers.
- Inspect adaptive quick metrics and detailed per-peak measurements.
- Export the results as 720p TIFF, CSV, and JSON.
---

## How To Run Locally

Install dependencies and start the development server:

```bash
cd 'your folder path'
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

To test the production-style build locally:

```bash
cd 'your folder path'
npm run build
npm run preview
```
---

## How To Use The Software

1. Upload a `.tif` or `.tiff` file in the upload panel.
2. Draw a single straight line ROI on the preview image.
3. Enter the physical pixel size.
   Example: `0.1 um` per pixel or `65 nm` per pixel.
4. If needed, enable rolling-ball background subtraction and enter a radius in pixels.
5. Click `Preview / Apply` to refresh the preview and the line measurements.
6. Inspect the raw intensity chart.
7. Review the adaptive quick metric and detailed peak table for each channel.
8. Click a peak row to overlay that peak's half-maximum guide on the chart.
9. Export the result as:
   - `TIFF` for the plotted chart at a fixed 1280 x 720 output
   - `CSV` for sampled numeric traces
   - `JSON` for the full structured analysis result
---

## Rolling-Ball Background Subtraction

The app includes a rolling-ball-style background subtraction step. Suggest to start at 500 px to observe the effect.

## What The Intensity Chart Means

The chart is the main output of this app.

- X-axis:
  - Distance along the drawn line ROI.
  - Displayed in the calibrated unit you selected: `um` or `nm`.
- Y-axis:
  - Raw gray value sampled from each channel along the line.
- Colored traces:
  - One trace per channel.
- Peak markers:
  - Peaks detected from the smoothed analysis trace.
  - The plotted line itself still reflects the active sampled signal.
- Selected peak guide:
  - Appears when you click a peak row in a metric card.
  - Shows the half-maximum line and the left/right crossing points used for that peak's FWHM.

If rolling-ball subtraction is enabled, the chart reflects the processed signal after background subtraction. If it is disabled, the chart reflects the original raw signal.

## Metric Meaning And Interpretation

### Peak Intensity

**Meaning**

- The maximum sampled intensity value along the line for that channel.

**Best for**

- Checking whether one structure is brighter than another.
- Comparing local signal strength or local protein density.

**Interpretation**

- Higher Peak Intensity means the strongest point on that trace is brighter.
- This does not tell you whether the structure is wider.
- A narrow bright peak and a broad dimmer structure can still have very different Peak Intensity values.

### Peak Position

**Meaning**

- The distance along the line where the maximum intensity occurs.

**Best for**

- Locating where the strongest part of a structure sits along the ROI.
- Comparing whether peaks from different channels line up spatially.

**Interpretation**

- Similar Peak Position values suggest the brightest points occur in similar locations.
- Different Peak Position values suggest the channel maxima are offset along the line.

### Detected Peaks

**Meaning**

- The number of meaningful peaks identified from the smoothed trace.
- Each listed row represents one detected local maximum.

**Best for**

- Understanding whether the signal is single-peaked, multi-peaked, merged, or noisy.

**Interpretation**

- One detected peak often indicates one dominant unit or one dominant structure along the ROI.
- Several detected peaks may indicate repeated units, neighboring puncta, or a lumpy merged structure.
- Use the peak table together with the quick metric, not in isolation.

### FWHM (Full Width At Half Maximum)

**Meaning**

- The width of a peak measured at half of that peak's height above baseline.
- It is the distance between the left and right half-maximum crossing points.

**Best for**

- Checking whether a structure is compact or more spread out.
- Comparing apparent width or diffusion along the line.

**Interpretation**

- Smaller FWHM suggests a narrower or sharper feature.
- Larger FWHM suggests a broader or more diffuse feature.
- FWHM is peak-specific in this app.

### AUC (Area Under The Curve)

**Meaning**

- The integrated signal across the entire line segment.
- It combines both intensity and width.

**Best for**

- Checking whether the total amount of signal is higher.
- Comparing overall signal load rather than only the brightest point.

**Interpretation**

- Higher AUC means more total accumulated signal along the ROI.
- AUC can increase because the signal is brighter, wider, or both.
- AUC is often the most stable summary when the trace is noisy or highly irregular.
---

## How To Understand Multi-Peak FWHM

Multi-peak traces should not be reduced to one universal width value. This app keeps the interpretation explicit:

- Every detected peak gets its own FWHM row.
- Clicking a peak row overlays that peak's half-maximum guide on the chart.
- The adaptive quick metric highlights the best single summary for the overall trace shape.

Use the quick metric like this:

- `Lumpy/Merged Peaks`
  - Recommended quick metric: `Envelope FWHM`
  - Interpretation: overall width of the merged structure
  - Typical wording: `Total width: X um`
- `One Tall + Many Small`
  - Recommended quick metric: `Main Peak FWHM`
  - Interpretation: width of the primary dominant unit
  - Typical wording: `Primary unit: X um`
- `Two Clear Peaks`
  - Recommended quick metric: `Peak-to-Peak`
  - Interpretation: spacing between the two dominant units
  - Typical wording: `Spacing: X um`
- `Chaotic/Noisy`
  - Recommended quick metric: `AUC`
  - Interpretation: total signal when peak width is not stable enough to summarize cleanly
  - Typical wording: `Total Signal: Y units`

In short: use the peak table for local detail, and use the highlighted quick metric for the overall take-home interpretation.
---

## Export Formats

### TIFF

- Exports the displayed intensity chart as a TIFF image at a fixed 1280 x 720 output.
- Best when you want one consistent high-resolution chart export option without extra scaling controls.

### CSV

- Exports sampled distances plus each channel's raw, smoothed, and normalized traces.
- Best for spreadsheet review or external plotting.

### JSON

- Exports the image metadata, ROI, calibration, preprocessing settings, traces, quick metrics, AUC values, peak list, and FWHM-related measurements.
- Best for reproducible analysis records or downstream scripting.
---

## Current Limits

- One straight line ROI at a time.
- TIFF support is limited to 2-, 3-, and 4-channel files.
- TIFF data types are limited to `uint8` and `uint16`.
- Rolling-ball subtraction is a browser-side approximation intended for interactive profiling in this app.
---

# Disclaimer
This repository was a Vibe Coding Project for non-coding specialist (like me).
This project was developed using a combination of open computational platforms and AI-assisted coding tools:
	•	Codex

# Citation
If you use this software, please cite it as: K.H.,Ooi.(2026). Quick-IF-Line-Profiler. version: 1.0.0. date-released: 2026-04-07. https://github.com/mansonmyr/Quick-IF-Line-Profiler

