import type {
  AnalysisPayload,
  LineCalibration,
  LineRoi,
  ParsedTiffImage,
  PreprocessConfig,
  WorkerRequest,
  WorkerResponse
} from "../types";

export class AnalysisWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  constructor() {
    this.worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), {
      type: "module"
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) {
        return;
      }
      this.pending.delete(response.id);
      if (response.type === "error") {
        entry.reject(new Error(response.message));
        return;
      }
      if (response.type === "parsed" || response.type === "preprocessed") {
        entry.resolve(response.image);
        return;
      }
      entry.resolve(response.analysis);
    };
  }

  async parseTiff(file: File): Promise<ParsedTiffImage> {
    const buffer = await file.arrayBuffer();
    return this.request<ParsedTiffImage>(
      {
        id: crypto.randomUUID(),
        type: "parse_tiff",
        filename: file.name,
        buffer
      },
      [buffer]
    );
  }

  applyPreprocess(imageId: string, preprocessing: PreprocessConfig): Promise<ParsedTiffImage> {
    return this.request<ParsedTiffImage>({
      id: crypto.randomUUID(),
      type: "apply_preprocess",
      imageId,
      preprocessing
    });
  }

  analyzeLine(imageId: string, roi: LineRoi, calibration: LineCalibration): Promise<AnalysisPayload> {
    return this.request<AnalysisPayload>({
      id: crypto.randomUUID(),
      type: "analyze_line",
      imageId,
      roi,
      calibration
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }

  private request<T>(payload: WorkerRequest, transfer?: Transferable[]): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(payload.id, { resolve, reject });
      this.worker.postMessage(payload, transfer ?? []);
    });
  }
}
