importScripts("spectre-parser.js?v=4");

self.onmessage = event => {
  try {
    self.postMessage({ type: "progress", value: 15, message: "正在合并续行并识别语句…" });
    const project = self.SpectreImport.parse(event.data.sources, { mainPath: event.data.mainPath, resolutions: event.data.resolutions });
    self.postMessage({ type: "progress", value: 80, message: "正在建立层级、网络和重复实例分组…" });
    self.postMessage({ type: "result", project });
  } catch (error) {
    self.postMessage({ type: "error", message: error && error.message ? error.message : String(error) });
  }
};
