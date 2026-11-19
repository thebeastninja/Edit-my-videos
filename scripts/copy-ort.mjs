// Copies the ONNX Runtime WebAssembly files used by in-browser captions into
// public/ort, so they're served from our own site instead of a third-party CDN.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join("node_modules", "onnxruntime-web", "dist");
const dest = join("public", "ort");
const files = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

mkdirSync(dest, { recursive: true });
for (const f of files) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.warn(`copy-ort: missing ${from}`);
    continue;
  }
  copyFileSync(from, join(dest, f));
}
console.log(`copy-ort: copied ${files.length} files to ${dest}`);
