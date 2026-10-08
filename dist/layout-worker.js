"use strict";

self.importScripts("./component-library.js?v=4", "./model.js?v=13");

self.onmessage = event => {
  try {
    self.postMessage({ type: "progress", message: "保持元件位置，正在重新规划避障连线…" });
    const state = self.Circuit.validate(event.data.state);
    const organized = self.Circuit.organize(state);
    self.postMessage({ type: "result", state: organized });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "整理失败" });
  }
};
