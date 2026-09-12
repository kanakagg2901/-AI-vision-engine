export async function detectBackend() {
  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    } catch (e) {
      console.warn("WebGPU check failed, falling back to WASM", e);
    }
  }
  return "wasm";
}