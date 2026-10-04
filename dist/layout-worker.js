"use strict";

self.importScripts("./component-library.js", "./model.js");

self.onmessage = event => {
  try {
    self.postMessage({ type: "progress", message: "正在计算器件布局和避障连线…" });
    const state = self.Circuit.validate(event.data.state);
    const organized = self.Circuit.organize(state);
    self.postMessage({ type: "result", state: organized });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "整理失败" });
  }
};
