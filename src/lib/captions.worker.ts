/// <reference lib="webworker" />
// Runs Whisper speech-to-text in a background thread, entirely on the user's
// device. The model downloads once from the Hugging Face Hub and is then
// cached by the browser.

import { env, pipeline } from "@huggingface/transformers";

export interface WorkerWord {
  text: string;
  start: number;
  end: number;
}

export type WorkerRequest = { type: "transcribe"; audio: Float32Array; language: string | null };

export type WorkerResponse =
  | { type: "progress"; stage: "download"; progress: number }
  | { type: "progress"; stage: "load" | "transcribe" }
  | { type: "result"; words: WorkerWord[]; device: string }
  | { type: "error"; message: string };

// Models to try, best first. "_timestamped" exports include what's needed for
// word-level timing.
const MODELS = ["onnx-community/whisper-base_timestamped", "onnx-community/whisper-base"];

// Serve the WebAssembly runtime from our own site (see scripts/copy-ort.mjs).
const isOldSafari = /^((?!chrome|android).)*safari/i.test(self.navigator.userAgent) && !("gpu" in self.navigator);
const suffix = isOldSafari ? "" : ".asyncify";
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${self.location.origin}/ort/ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${self.location.origin}/ort/ort-wasm-simd-threaded${suffix}.wasm`,
  };
}
env.allowLocalModels = false;

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
let loaded: Promise<{ run: Transcriber; device: string }> | null = null;

const post = (msg: WorkerResponse) => self.postMessage(msg);

async function hasWebGPU() {
  try {
    const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return Boolean(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load() {
  const device = (await hasWebGPU()) ? "webgpu" : "wasm";
  const dtype =
    device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : { encoder_model: "q8", decoder_model_merged: "q8" };
  let lastError: unknown;
  for (const model of MODELS) {
    try {
      const run = await pipeline("automatic-speech-recognition", model, {
        device,
        dtype: dtype as never,
        progress_callback: (info: { status: string; progress?: number }) => {
          if (info.status === "progress_total" && typeof info.progress === "number") {
            post({ type: "progress", stage: "download", progress: info.progress / 100 });
          }
        },
      });
      return { run: run as unknown as Transcriber, device };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

interface Chunk {
  text: string;
  timestamp: [number, number | null];
}

/** Turns phrase-level chunks into words, spreading time by word length. */
function splitChunks(chunks: Chunk[]): WorkerWord[] {
  const words: WorkerWord[] = [];
  for (const c of chunks) {
    const parts = c.text.trim().split(/\s+/).filter(Boolean);
    const [start, endRaw] = c.timestamp;
    const end = endRaw ?? start + parts.length * 0.35;
    const totalChars = parts.reduce((s, p) => s + p.length, 0) || 1;
    let t = start;
    for (const p of parts) {
      const d = ((end - start) * p.length) / totalChars;
      words.push({ text: p, start: t, end: t + d });
      t += d;
    }
  }
  return words;
}

self.addEventListener("message", async (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== "transcribe") return;
  try {
    post({ type: "progress", stage: "load" });
    loaded ??= load();
    const { run, device } = await loaded;
    post({ type: "progress", stage: "transcribe" });

    const base = {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      ...(e.data.language ? { language: e.data.language } : {}),
    };
    let words: WorkerWord[];
    try {
      const out = (await run(e.data.audio, { ...base, return_timestamps: "word" })) as { chunks?: Chunk[] };
      words = (out.chunks ?? []).map((c) => ({
        text: c.text.trim(),
        start: c.timestamp[0],
        end: c.timestamp[1] ?? c.timestamp[0] + 0.3,
      }));
    } catch {
      // This model can't do word timing: use phrase timing and split it up.
      const out = (await run(e.data.audio, { ...base, return_timestamps: true })) as { chunks?: Chunk[] };
      words = splitChunks(out.chunks ?? []);
    }
    post({ type: "result", words: words.filter((w) => w.text), device });
  } catch (err) {
    loaded = null;
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
});
