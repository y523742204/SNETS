(function () {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const C = window.Circuit;
  const defs = C.definitions;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const icons = {
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="10" y="10" width="4" height="4"/>',
    blocks: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    layers: '<path d="m12 3 10 6-10 6L2 9Zm-9 11 9 5 9-5M3 18l9 5 9-5"/>',
    folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1-1.5 2M12 17h.01"/>',
    "chevron-right": '<path d="m9 5 7 7-7 7"/>', "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 14v6h16v-6"/>',
    circuit: '<path d="m9 3-7 9 7 9m6-18 7 9-7 9M8 12h8"/><circle cx="12" cy="12" r="2"/>',
    search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>', mouse: '<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 2v6"/>',
    "file-circuit": '<path d="M14 2H5v20h14V7Z M14 2v5h5M8 12h8M8 16h8"/>',
    "file-code": '<path d="M14 2H5v20h14V7Z M14 2v5h5M10 11l-3 3 3 3m4-6 3 3-3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', cursor: '<path d="m4 3 6 18 3-7 7-3Z"/>',
    wire: '<path d="M5 6h8v12h6"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="18" r="2"/>',
    hand: '<path d="M8 13V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 4-3 7-7 7-3 0-5-1-7-4l-3-5a2 2 0 0 1 3-2l2 2Z"/>',
    undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5m-5 5 5 5" transform="translate(0 -3)"/>',
    redo: '<path d="M21 10H10a6 6 0 0 0 0 12m11-12-5-5m5 5-5 5" transform="translate(0 -3)"/>',
    rotate: '<path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    magnet: '<path d="M5 3v10a7 7 0 0 0 14 0V3h-4v10a3 3 0 0 1-6 0V3ZM5 7h4m6 0h4"/>',
    grid: '<path d="M8 3v18M16 3v18M3 8h18M3 16h18"/>', maximize: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    shield: '<path d="m12 3 8 3v6c0 4-3 7-8 10-5-3-8-6-8-10V6Z"/><path d="m8 12 3 3 5-6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', save: '<path d="M4 3h13l4 4v14H3V3Zm3 0v6h10V3M7 21v-8h10v8"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 5 5 3-3 4 4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    "align-grid": '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/><path d="M2 12h20M12 2v20"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] || icons.chip) + '</svg>';
  function hydrateIcons(scope = document) { scope.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }

  let state;
  try { state = C.validate(JSON.parse(localStorage.getItem("snets-circuit") || "null")); } catch (_) { state = C.demo(); }
  let selected = state.components[1]
    ? { kind: "component", id: state.components[1].id }
    : state.components[0]
      ? { kind: "component", id: state.components[0].id }
      : null;
  let activeTool = "select";
  let wireStart = null;
  let gridSize = 20;
  let snapEnabled = true;
  let showGrid = true;
  let category = "all";
  let undoStack = [];
  let redoStack = [];
  let drag = null;
  let pointer = { x: 0, y: 0 };
  let toastTimer;
  const svg = $("#schematic");

  function snapshot() { return C.clone(state); }
  function commit(before) { undoStack.push(before); if (undoStack.length > 80) undoStack.shift(); redoStack = []; persist(); }
  function persist() {
    try { localStorage.setItem("snets-circuit", JSON.stringify(state)); $("#save-status").innerHTML = icon("check-circle") + "已保存到本地"; } catch (_) { $("#save-status").textContent = "本地保存不可用"; }
  }
  function toast(message) { clearTimeout(toastTimer); const el = $("#toast"); el.textContent = message; el.classList.add("show"); toastTimer = setTimeout(() => el.classList.remove("show"), 2300); }
  function refFor(type) {
    const prefix = defs[type].prefix;
    let number = 1;
    const used = new Set(state.components.map(c => c.ref));
    while (used.has(prefix + number)) number++;
    return prefix + number;
  }
  const isConnected = (componentId, pinId) => state.wires.some(w => [w.from, w.to].some(end => end.component === componentId && end.pin === pinId));
  const endpointKey = end => end.component + ":" + end.pin;
  function preferredNetName(end) {
    const component = state.components.find(item => item.id === end.component);
    if (!component) return "";
    if (component.type === "vdd") return "VDD";
    if (component.type === "gnd") return "GND";
    if (["input", "output", "bidirectional"].includes(component.type)) return component.value.trim();
    return "";
  }
  function ensureNetNames() {
    const byEndpoint = new Map();
    state.wires.forEach(wire => [wire.from, wire.to].forEach(end => {
      const key = endpointKey(end);
      if (!byEndpoint.has(key)) byEndpoint.set(key, []);
      byEndpoint.get(key).push(wire);
    }));
    const used = new Set(state.wires.map(wire => wire.net).filter(Boolean));
    let autoIndex = 0;
    const nextAuto = () => { while (used.has("net" + autoIndex)) autoIndex++; const name = "net" + autoIndex++; used.add(name); return name; };
    const unseen = new Set(state.wires.map(wire => wire.id));
    while (unseen.size) {
      const firstId = unseen.values().next().value;
      const queue = [state.wires.find(wire => wire.id === firstId)];
      const group = [];
      while (queue.length) {
        const wire = queue.pop();
        if (!wire || !unseen.delete(wire.id)) continue;
        group.push(wire);
        [wire.from, wire.to].forEach(end => (byEndpoint.get(endpointKey(end)) || []).forEach(linked => { if (unseen.has(linked.id)) queue.push(linked); }));
      }
      const ends = group.flatMap(wire => [wire.from, wire.to]);
      const preferred = ends.map(preferredNetName).find(Boolean);
      const manual = group.map(wire => wire.net).find(name => name && !/^net\d+$/.test(name));
      const existing = group.map(wire => wire.net).find(Boolean);
      const name = preferred || manual || existing || nextAuto();
      group.forEach(wire => { wire.net = name; });
      used.add(name);
    }
  }
  function symbolPreview(type) { return '<svg class="symbol-preview" viewBox="-75 -70 150 140" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' + defs[type].body + '</svg>'; }

  const categoryLabels = { all: "全部元件", basic: "基础元件", transistor: "晶体管", device: "器件" };
  function renderLibrary() {
    const query = $("#component-search").value.trim().toLowerCase();
    const entries = Object.entries(defs).filter(([type, d]) => (category === "all" || d.category === category) && (type + " " + d.name + " " + d.title).toLowerCase().includes(query));
    $("#component-grid").innerHTML = entries.map(([type, d]) => '<button class="component-card" data-component-type="' + type + '" draggable="true" title="添加' + d.name + '"><span class="card-short">' + d.prefix + '</span>' + symbolPreview(type) + '<span class="component-title">' + d.name + '</span></button>').join("") || '<p class="muted-copy" style="grid-column:span 2">没有找到匹配的元件</p>';
    $("#library-count").textContent = entries.length;
    $("#library-section-label").innerHTML = (categoryLabels[category] || categoryLabels.all) + ' <span>点击或拖入画布</span>';
  }
  function componentMarkup(c) {
    const d = defs[c.type];
    const selectedClass = selected?.kind === "component" && selected.id === c.id ? " selected" : "";
    const isPort = c.type === "input" || c.type === "output" || c.type === "bidirectional";
    const isPower = c.type === "vdd" || c.type === "gnd";
    const labelX = isPower || isPort ? 0 : 45;
    const labelY = isPower ? (c.type === "vdd" ? -31 : 42) : (isPort ? -25 : -17);
    const main = isPower ? (c.type === "vdd" ? "VDD" : "GND") : (isPort ? c.value : c.ref);
    const detail = c.type === "pmos" || c.type === "nmos" ? "W=" + c.w + "μ  L=" + c.l + "μ" : (isPower || isPort ? "" : c.value);
    const box = selectedClass ? '<rect class="selection-box" x="-73" y="-72" width="146" height="144" rx="3"/>' : "";
    const pins = d.pins.map(pin => {
      const point = C.pinPoint(c, pin.id);
      return '<g class="component-pin' + (isConnected(c.id, pin.id) ? " connected" : "") + (wireStart?.component === c.id && wireStart.pin === pin.id ? " wiring" : "") + '" data-component="' + escapeHtml(c.id) + '" data-pin="' + escapeHtml(pin.id) + '" transform="translate(' + (point.x - c.x) + " " + (point.y - c.y) + ')"><circle r="13" fill="transparent"/><circle class="pin-dot" r="3"/><title>' + escapeHtml(c.ref + " · " + pin.name) + '</title></g>';
    }).join("");
    return '<g class="component' + selectedClass + '" data-id="' + escapeHtml(c.id) + '" transform="translate(' + c.x + " " + c.y + ')">' + box + '<rect x="-72" y="-70" width="144" height="140" fill="transparent"/><g class="symbol-body" transform="rotate(' + c.rotation + ')">' + d.body + '</g><g pointer-events="none"><text class="component-ref" x="' + labelX + '" y="' + labelY + '" text-anchor="' + (isPower || isPort ? "middle" : "start") + '">' + escapeHtml(main) + '</text>' + (detail ? '<text class="component-value" x="' + labelX + '" y="' + (labelY + 20) + '">' + escapeHtml(detail) + '</text>' : "") + '</g>' + pins + '</g>';
  }
  function renderCanvas() {
    if (!wireStart) $("#preview-layer").innerHTML = "";
    const selectedWire = selected?.kind === "wire" ? state.wires.find(wire => wire.id === selected.id) : null;
    const selectedNet = selectedWire?.net;
    $("#wire-layer").innerHTML = state.wires.map(w => {
      const path = C.wirePath(state, w);
      const highlighted = selectedNet && w.net === selectedNet;
      return '<g class="wire' + (highlighted ? " selected" : "") + '" data-wire="' + escapeHtml(w.id) + '" data-net="' + escapeHtml(w.net || "") + '"><path class="wire-hit" d="' + path + '"/><path class="wire-line" d="' + path + '" pointer-events="none"/></g>';
    }).join("");
    $("#component-layer").innerHTML = state.components.map(componentMarkup).join("");
    $("#empty-canvas").hidden = state.components.length > 0;
    $("#grid-bg").setAttribute("fill", showGrid ? "url(#dot-grid)" : "transparent");
    $("#dot-grid").setAttribute("width", gridSize); $("#dot-grid").setAttribute("height", gridSize);
    $("#component-stats").textContent = state.components.length + " 个元件";
    $("#wire-stats").textContent = state.wires.length + " 条连线";
    $("#minimap").innerHTML = state.wires.map(w => '<path d="' + C.wirePath(state, w) + '" fill="none" stroke="#9eb5d0" stroke-width="4"/>').join("") + state.components.map(c => '<rect x="' + (c.x - 16) + '" y="' + (c.y - 20) + '" width="32" height="40" fill="' + (selected?.id === c.id ? "#dfa58d" : "#afbfce") + '" rx="3"/>').join("");
  }
  function renderInspector() {
    const content = $("#properties-content");
    const component = selected?.kind === "component" ? state.components.find(c => c.id === selected.id) : null;
    if (!component) {
      if (selected?.kind === "wire") {
        const wire = state.wires.find(w => w.id === selected.id);
        const label = end => (state.components.find(c => c.id === end.component)?.ref || "?") + " / " + end.pin;
        const count = state.wires.filter(item => item.net === wire.net).length;
        content.innerHTML = '<div class="selected-component"><span class="selected-symbol">' + icon("wire") + '</span><div><h3>' + escapeHtml(wire.net) + '</h3><p>NET · ' + count + ' 条线段</p></div></div><div class="inspector-section"><div class="section-heading">网络属性</div><label class="field-label">NET 名称</label><input class="text-input mono" data-wire-prop="net" value="' + escapeHtml(wire.net) + '" maxlength="80"><label class="field-label">起点</label><div class="text-input" style="display:flex;align-items:center">' + escapeHtml(label(wire.from)) + '</div><label class="field-label">终点</label><div class="text-input" style="display:flex;align-items:center">' + escapeHtml(label(wire.to)) + '</div><p class="muted-copy">同名 NET 会同时高亮。拖动任意线段可平移该段，按 Delete 删除当前线段。</p></div>';
      } else content.innerHTML = '<div class="inspector-empty">' + icon("cursor") + '<h3>选择一个元件</h3><p>点击画布上的元件，<br>查看和编辑参数。</p></div>';
      return;
    }
    const d = defs[component.type];
    const fields = d.fields.map(([key, label, unit]) => '<label class="field-label">' + label + '</label><div class="unit-field"><input data-prop="' + key + '" class="text-input mono" value="' + escapeHtml(component[key]) + '" maxlength="80"><span>' + unit + '</span></div>').join("");
    const pins = d.pins.map(pin => '<tr><td class="pin-letter">' + escapeHtml(pin.id) + '</td><td>' + pin.name + '</td><td><span class="' + (isConnected(component.id, pin.id) ? "connected-badge" : "unconnected") + '">' + (isConnected(component.id, pin.id) ? "已连接" : "未连接") + '</span></td></tr>').join("");
    content.innerHTML = '<div class="selected-component"><span class="selected-symbol">' + symbolPreview(component.type) + '</span><div><h3>' + escapeHtml(component.ref) + ' / ' + d.name + '</h3><p>' + d.title + '</p></div><span class="selected-tag">实例</span></div><div class="inspector-section"><div class="section-heading">基本信息</div><label class="field-label">位号</label><input class="text-input mono" data-prop="ref" value="' + escapeHtml(component.ref) + '" maxlength="40"><label class="field-label">位置</label><div class="field-row"><div class="field-box"><span>X</span><input type="number" class="text-input mono" data-prop="x" value="' + component.x + '"></div><div class="field-box"><span>Y</span><input type="number" class="text-input mono" data-prop="y" value="' + component.y + '"></div></div><div class="rotation-row"><div class="unit-field"><input class="text-input mono" readonly value="' + component.rotation + '"><span>deg</span></div><button class="icon-button" data-action="rotate" title="旋转">' + icon("rotate") + '</button><button class="icon-button" data-action="duplicate" title="复制">' + icon("copy") + '</button></div></div>' + (fields ? '<div class="inspector-section"><div class="section-heading">电气参数</div>' + fields + '</div>' : "") + '<div class="inspector-section"><div class="section-heading">引脚连接<span class="count-badge">' + d.pins.length + '</span></div><table class="pin-table"><thead><tr><th>引脚</th><th>名称</th><th>状态</th></tr></thead><tbody>' + pins + '</tbody></table><div class="connection-note">' + icon("info") + '<span>点击画布中的引脚，即可开始连接。</span></div></div>';
  }
  function render() {
    renderCanvas(); renderInspector();
    $("#project-name").textContent = state.name; $("#canvas-title").textContent = state.name; $("#tab-name").textContent = state.name; $("#design-name").value = state.name; $("#project-card-name").textContent = state.name;
    $("#undo-btn").disabled = !undoStack.length; $("#redo-btn").disabled = !redoStack.length; $("#rotate-btn").disabled = selected?.kind !== "component"; $("#delete-btn").disabled = !selected;
    $("#layer-list").innerHTML = state.components.map(c => '<button class="layer-row' + (selected?.id === c.id ? " active" : "") + '" data-layer="' + escapeHtml(c.id) + '">' + symbolPreview(c.type) + '<span>' + escapeHtml(c.ref) + '</span><small>' + defs[c.type].name + '</small></button>').join("");
  }
  function pointFromEvent(event) {
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }
  function closestSegmentAxis(wire, point) {
    const points = C.route(C.endpoint(state, wire.from), C.endpoint(state, wire.to), wire.manual);
    let best = { distance: Infinity, axis: "x" };
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index];
      const b = points[index + 1];
      const vertical = a.x === b.x;
      const low = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
      const high = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      const along = vertical ? point.y : point.x;
      const outside = along < low ? low - along : along > high ? along - high : 0;
      const perpendicular = vertical ? Math.abs(point.x - a.x) : Math.abs(point.y - a.y);
      const distance = perpendicular + outside;
      if (distance < best.distance) best = { distance, axis: vertical ? "x" : "y" };
    }
    return best.axis;
  }
  function bounds() {
    if (!state.components.length) return { x: 50, y: 70, w: 850, h: 560 };
    const xs = state.components.map(c => c.x), ys = state.components.map(c => c.y);
    return { x: Math.min(...xs) - 100, y: Math.min(...ys) - 100, w: Math.max(...xs) - Math.min(...xs) + 200, h: Math.max(...ys) - Math.min(...ys) + 200 };
  }
  function fitView() { const b = bounds(); svg.setAttribute("viewBox", [b.x, b.y, Math.max(700, b.w), Math.max(520, b.h)].join(" ")); $("#zoom-value").textContent = "100%"; }
  function setTool(tool) { activeTool = tool; wireStart = null; $("#preview-layer").innerHTML = ""; svg.dataset.tool = tool; $$("[data-tool]").forEach(button => button.classList.toggle("active", button.dataset.tool === tool)); renderCanvas(); $("#status-text").textContent = tool === "wire" ? "连线工具：点击两个引脚" : tool === "pan" ? "拖动画布" : "就绪"; }
  function addComponent(type, x, y) { const before = snapshot(); const c = C.component(type, snapEnabled ? Math.round(x / gridSize) * gridSize : x, snapEnabled ? Math.round(y / gridSize) * gridSize : y, refFor(type)); state.components.push(c); selected = { kind: "component", id: c.id }; commit(before); render(); toast("已添加 " + defs[type].name); }
  function rotateSelected() { if (selected?.kind !== "component") return; const c = state.components.find(c => c.id === selected.id); const before = snapshot(); c.rotation = (c.rotation + 90) % 360; commit(before); render(); }
  function duplicateSelected() { if (selected?.kind !== "component") return; const original = state.components.find(c => c.id === selected.id); const before = snapshot(); const copy = C.clone(original); copy.id = C.id("c"); copy.ref = refFor(copy.type); copy.x += gridSize * 2; copy.y += gridSize * 2; state.components.push(copy); selected = { kind: "component", id: copy.id }; commit(before); render(); }
  function deleteSelected() { if (!selected) return; const before = snapshot(); if (selected.kind === "component") { state.components = state.components.filter(c => c.id !== selected.id); state.wires = state.wires.filter(w => w.from.component !== selected.id && w.to.component !== selected.id); } else state.wires = state.wires.filter(w => w.id !== selected.id); selected = null; commit(before); render(); }
  function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); state = undoStack.pop(); selected = null; wireStart = null; persist(); render(); }
  function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); state = redoStack.pop(); selected = null; persist(); render(); }
  function connectPin(componentId, pinId) {
    const end = { component: componentId, pin: pinId };
    if (!wireStart) { wireStart = end; activeTool = "wire"; $("#status-text").textContent = "选择目标引脚"; renderCanvas(); return; }
    if (wireStart.component === end.component && wireStart.pin === end.pin) { wireStart = null; renderCanvas(); return; }
    const duplicate = state.wires.some(w => [w.from, w.to].some(a => a.component === wireStart.component && a.pin === wireStart.pin) && [w.from, w.to].some(a => a.component === end.component && a.pin === end.pin));
    if (duplicate) { toast("这两个引脚已经连接"); wireStart = null; renderCanvas(); return; }
    const before = snapshot(); state.wires.push({ id: C.id("w"), from: wireStart, to: end }); ensureNetNames(); wireStart = null; commit(before); setTool("select"); render();
  }
  function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); }
  function exportJson() { download(state.name.replace(/\s+/g, "-") + ".snets.json", JSON.stringify(state, null, 2), "application/json"); toast("工程 JSON 已导出"); }
  function exportSvg() {
    const b = bounds(); const clone = svg.cloneNode(true); clone.setAttribute("viewBox", [b.x, b.y, b.w, b.h].join(" ")); clone.setAttribute("width", b.w); clone.setAttribute("height", b.h); clone.querySelector("#grid-bg")?.remove(); clone.querySelector("#preview-layer")?.remove(); clone.querySelectorAll(".selection-box,.selection-handle").forEach(el => el.remove());
    download(state.name.replace(/\s+/g, "-") + ".svg", '<?xml version="1.0" encoding="UTF-8"?>\n' + clone.outerHTML, "image/svg+xml"); toast("SVG 已导出");
  }
  function openDialog(title, html) { $("#dialog-title").textContent = title; $("#dialog-content").innerHTML = html; $("#app-dialog").showModal(); }
  function runCheck() {
    const issues = C.check(state);
    const summary = issues.length ? '<div class="check-summary" style="background:#fff8ef">' + icon("info") + '<div><strong>发现 ' + issues.length + ' 个连接问题</strong><small>点击问题可定位元件</small></div></div>' : '<div class="check-summary">' + icon("check-circle") + '<div><strong>连接检查通过</strong><small>未发现悬空引脚</small></div></div>';
    const rows = issues.map(issue => '<button class="issue-row" data-issue-component="' + escapeHtml(issue.component || "") + '">' + escapeHtml(issue.message) + '</button>').join("");
    openDialog("电路检查", summary + rows + '<p class="muted-copy">此检查验证连接完整性，不进行电气仿真。</p>');
  }

  svg.addEventListener("pointerdown", event => {
    const pin = event.target.closest(".component-pin");
    if (pin) { event.stopPropagation(); connectPin(pin.dataset.component, pin.dataset.pin); return; }
    const componentNode = event.target.closest(".component");
    if (componentNode && activeTool !== "pan") {
      const c = state.components.find(item => item.id === componentNode.dataset.id); const p = pointFromEvent(event);
      selected = { kind: "component", id: c.id }; drag = { kind: "component", id: c.id, offsetX: p.x - c.x, offsetY: p.y - c.y, before: snapshot(), moved: false }; svg.setPointerCapture(event.pointerId); render(); return;
    }
    const wire = event.target.closest(".wire");
    if (wire && activeTool !== "pan") {
      const item = state.wires.find(candidate => candidate.id === wire.dataset.wire);
      const p = pointFromEvent(event);
      selected = { kind: "wire", id: item.id };
      drag = { kind: "wire-segment", id: item.id, axis: closestSegmentAxis(item, p), start: p, before: snapshot(), moved: false };
      svg.setPointerCapture(event.pointerId);
      render();
      return;
    }
    if (activeTool === "pan") { const p = pointFromEvent(event); drag = { kind: "pan", point: p, viewBox: svg.getAttribute("viewBox").split(" ").map(Number) }; svg.setPointerCapture(event.pointerId); }
    else { selected = null; wireStart = null; render(); }
  });
  svg.addEventListener("pointermove", event => {
    const p = pointFromEvent(event); pointer = p; $("#cursor-position").textContent = "X: " + Math.round(p.x) + "   Y: " + Math.round(p.y);
    if (wireStart) { const start = C.endpoint(state, wireStart); $("#preview-layer").innerHTML = '<path class="wire-preview" d="' + C.pathData(C.route(start, p)) + '"/>'; }
    if (!drag) return;
    if (drag.kind === "component") { const c = state.components.find(item => item.id === drag.id); let x = p.x - drag.offsetX, y = p.y - drag.offsetY; if (snapEnabled) { x = Math.round(x / gridSize) * gridSize; y = Math.round(y / gridSize) * gridSize; } if (c.x !== x || c.y !== y) { c.x = x; c.y = y; drag.moved = true; renderCanvas(); } }
    if (drag.kind === "wire-segment") {
      const distance = Math.hypot(p.x - drag.start.x, p.y - drag.start.y);
      if (distance > 2 || drag.moved) {
        const wire = state.wires.find(item => item.id === drag.id);
        let value = drag.axis === "x" ? p.x : p.y;
        if (snapEnabled) value = Math.round(value / gridSize) * gridSize;
        wire.manual = { axis: drag.axis, value };
        drag.moved = true;
        renderCanvas();
      }
    }
    if (drag.kind === "pan") { const now = pointFromEvent(event); const box = drag.viewBox; svg.setAttribute("viewBox", [box[0] + drag.point.x - now.x, box[1] + drag.point.y - now.y, box[2], box[3]].join(" ")); }
  });
  svg.addEventListener("pointerup", event => { if (["component", "wire-segment"].includes(drag?.kind) && drag.moved) { commit(drag.before); render(); } drag = null; try { svg.releasePointerCapture(event.pointerId); } catch (_) {} });
  svg.addEventListener("wheel", event => { event.preventDefault(); const box = svg.viewBox.baseVal; const p = pointFromEvent(event); const factor = event.deltaY > 0 ? 1.12 : 0.89; const nw = box.width * factor, nh = box.height * factor; svg.setAttribute("viewBox", [p.x - (p.x - box.x) * factor, p.y - (p.y - box.y) * factor, nw, nh].join(" ")); $("#zoom-value").textContent = Math.round(100 * 800 / nw) + "%"; }, { passive: false });

  $("#component-grid").addEventListener("click", event => { const card = event.target.closest("[data-component-type]"); if (card) { const box = bounds(); addComponent(card.dataset.componentType, box.x + box.w / 2, box.y + box.h / 2); } });
  $("#component-grid").addEventListener("dragstart", event => { const card = event.target.closest("[data-component-type]"); if (card) event.dataTransfer.setData("text/snets-component", card.dataset.componentType); });
  svg.addEventListener("dragover", event => event.preventDefault());
  svg.addEventListener("drop", event => { event.preventDefault(); const type = event.dataTransfer.getData("text/snets-component"); if (defs[type]) { const p = pointFromEvent(event); addComponent(type, p.x, p.y); } });
  $("#component-search").addEventListener("input", renderLibrary);
  $$("[data-category]").forEach(button => button.addEventListener("click", () => { category = button.dataset.category; $$("[data-category]").forEach(b => b.classList.toggle("active", b === button)); renderLibrary(); }));
  $$("[data-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.tool)));
  $("#undo-btn").onclick = undo; $("#redo-btn").onclick = redo; $("#rotate-btn").onclick = rotateSelected; $("#delete-btn").onclick = deleteSelected; $("#fit-btn").onclick = fitView; $("#zoom-fit").onclick = fitView;
  $("#zoom-in").onclick = () => svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: svg.getBoundingClientRect().left + svg.clientWidth / 2, clientY: svg.getBoundingClientRect().top + svg.clientHeight / 2, cancelable: true }));
  $("#zoom-out").onclick = () => svg.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, clientX: svg.getBoundingClientRect().left + svg.clientWidth / 2, clientY: svg.getBoundingClientRect().top + svg.clientHeight / 2, cancelable: true }));
  $("#snap-btn").onclick = () => { snapEnabled = !snapEnabled; $("#snap-btn").classList.toggle("active", snapEnabled); $("#snap-btn").setAttribute("aria-pressed", snapEnabled); };
  $("#align-grid-btn").onclick = () => {
    if (!state.components.length && !state.wires.some(wire => wire.manual)) return toast("画布中没有需要对齐的对象");
    const before = snapshot();
    state.components.forEach(component => { component.x = Math.round(component.x / gridSize) * gridSize; component.y = Math.round(component.y / gridSize) * gridSize; });
    state.wires.forEach(wire => { if (wire.manual) wire.manual.value = Math.round(wire.manual.value / gridSize) * gridSize; });
    commit(before); render(); toast("全部元件和线段已对齐网格");
  };
  $("#grid-btn").onclick = () => { showGrid = !showGrid; $("#grid-btn").classList.toggle("active", showGrid); renderCanvas(); };
  $("#properties-content").addEventListener("change", event => {
    const wireInput = event.target.closest("[data-wire-prop]");
    if (wireInput && selected?.kind === "wire") {
      const wire = state.wires.find(item => item.id === selected.id);
      const nextName = wireInput.value.trim().slice(0, 80);
      if (!nextName) { toast("NET 名称不能为空"); renderInspector(); return; }
      const before = snapshot(); const previousName = wire.net;
      state.wires.filter(item => item.net === previousName).forEach(item => { item.net = nextName; });
      commit(before); render(); return;
    }
    const input = event.target.closest("[data-prop]"); if (!input || selected?.kind !== "component") return;
    const c = state.components.find(c => c.id === selected.id); const before = snapshot(); let value = input.value.trim();
    if (input.dataset.prop === "x" || input.dataset.prop === "y") value = Number(value);
    if (input.dataset.prop === "ref" && state.components.some(other => other.id !== c.id && other.ref === value)) { toast("位号不能重复"); renderInspector(); return; }
    if (!value && input.dataset.prop === "ref") { renderInspector(); return; }
    c[input.dataset.prop] = value; commit(before); render();
  });
  $("#properties-content").addEventListener("click", event => { const action = event.target.closest("[data-action]")?.dataset.action; if (action === "rotate") rotateSelected(); if (action === "duplicate") duplicateSelected(); });
  $("#layer-list").addEventListener("click", event => { const row = event.target.closest("[data-layer]"); if (row) { selected = { kind: "component", id: row.dataset.layer }; render(); } });
  $$(".rail-item[data-panel]").forEach(button => button.addEventListener("click", () => { $$(".rail-item[data-panel]").forEach(b => b.classList.toggle("active", b === button)); ["library", "layers", "files"].forEach(name => $("#" + name + "-content").hidden = name !== button.dataset.panel); $("#library-title").textContent = { library: "元件库", layers: "电路图层", files: "工程文件" }[button.dataset.panel]; }));
  $$("[data-inspector]").forEach(button => button.addEventListener("click", () => { $$("[data-inspector]").forEach(b => b.classList.toggle("active", b === button)); $("#properties-content").hidden = button.dataset.inspector !== "properties"; $("#design-content").hidden = button.dataset.inspector !== "design"; }));
  $("#design-name").addEventListener("change", event => { const value = event.target.value.trim(); if (!value) return render(); const before = snapshot(); state.name = value.slice(0, 80); commit(before); render(); });
  $("#grid-select").addEventListener("change", event => { gridSize = Number(event.target.value); $("#grid-size").textContent = gridSize; renderCanvas(); });
  $("#project-name").onclick = () => { const value = prompt("工程名称", state.name); if (value?.trim()) { const before = snapshot(); state.name = value.trim().slice(0, 80); commit(before); render(); } };
  $("#export-btn").onclick = event => { const menu = $("#export-menu"); menu.hidden = !menu.hidden; event.stopPropagation(); };
  $("#export-menu").addEventListener("click", event => { const type = event.target.closest("[data-export]")?.dataset.export; if (type === "json") exportJson(); if (type === "svg") exportSvg(); $("#export-menu").hidden = true; });
  document.addEventListener("click", event => { if (!event.target.closest("#export-menu") && !event.target.closest("#export-btn")) $("#export-menu").hidden = true; });
  $("#save-project-btn").onclick = exportJson; $("#import-btn").onclick = () => $("#file-input").click();
  $("#file-input").addEventListener("change", async event => { const file = event.target.files[0]; if (!file) return; try { const imported = C.validate(JSON.parse(await file.text())); const before = snapshot(); state = imported; ensureNetNames(); selected = null; commit(before); fitView(); render(); toast("工程已打开"); } catch (error) { openDialog("无法打开工程", '<p class="muted-copy">' + escapeHtml(error.message) + '</p>'); } event.target.value = ""; });
  function newProject() { const before = snapshot(); state = { version: 1, name: "未命名原理图", components: [], wires: [] }; selected = null; commit(before); render(); fitView(); }
  $("#new-btn").onclick = newProject; $("#new-tab-btn").onclick = newProject;
  function loadDemo() { const before = snapshot(); state = C.demo(); ensureNetNames(); selected = { kind: "component", id: "pmos" }; commit(before); render(); fitView(); toast("CMOS 示例已加载"); }
  $("#demo-btn").onclick = loadDemo; $("#empty-demo").onclick = loadDemo; $("#check-btn").onclick = runCheck;
  $("#help-btn").onclick = () => openDialog("使用帮助", '<p class="help-intro">从左侧元件库添加元件。拖动元件调整位置，点击两个引脚建立连线。</p><div class="shortcut-row"><span>选择工具</span><kbd>V</kbd></div><div class="shortcut-row"><span>连线工具</span><kbd>W</kbd></div><div class="shortcut-row"><span>旋转元件</span><kbd>R</kbd></div><div class="shortcut-row"><span>删除选择</span><kbd>Delete</kbd></div><div class="shortcut-row"><span>撤销 / 重做</span><span><kbd>Ctrl Z</kbd> <kbd>Ctrl Shift Z</kbd></span></div><div class="shortcut-row"><span>取消连线</span><kbd>Esc</kbd></div>');
  $("#close-dialog").onclick = () => $("#app-dialog").close();
  $("#dialog-content").addEventListener("click", event => { const id = event.target.closest("[data-issue-component]")?.dataset.issueComponent; if (id) { selected = { kind: "component", id }; $("#app-dialog").close(); render(); } });
  $("#open-library").onclick = () => $("#library-pane").classList.add("open"); $("#close-library").onclick = () => $("#library-pane").classList.remove("open");
  document.addEventListener("keydown", event => {
    if (event.target.matches("input,select,textarea")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (event.key === "Delete" || event.key === "Backspace") deleteSelected();
    if (event.key.toLowerCase() === "r") rotateSelected(); if (event.key.toLowerCase() === "w") setTool("wire"); if (event.key.toLowerCase() === "v") setTool("select"); if (event.key.toLowerCase() === "f") fitView();
    if (event.key === "Escape") { wireStart = null; setTool("select"); renderCanvas(); }
    if (event.key === "/") { event.preventDefault(); $("#component-search").focus(); }
  });
  window.addEventListener("resize", () => { if (window.innerWidth < 620) $("#library-pane").classList.remove("open"); });

  function registerWebMcp() {
    if (!document.modelContext?.registerTool) return;
    const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {}); } catch (_) {} };
    register({ name: "add_schematic_component", title: "添加原理图元件", description: "向当前 IC 原理图添加一个标准元件。", inputSchema: { type: "object", properties: { type: { type: "string", enum: Object.keys(defs) }, x: { type: "number" }, y: { type: "number" } }, required: ["type"], additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input) { if (!defs[input.type]) throw new Error("未知元件类型"); const b = bounds(); addComponent(input.type, Number.isFinite(input.x) ? input.x : b.x + b.w / 2, Number.isFinite(input.y) ? input.y : b.y + b.h / 2); return { added: input.type, componentCount: state.components.length }; } });
    register({ name: "check_schematic_connections", title: "检查原理图连接", description: "检查当前原理图中的悬空引脚。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute() { return { issues: C.check(state), componentCount: state.components.length, wireCount: state.wires.length }; } });
  }

  ensureNetNames(); hydrateIcons(); renderLibrary(); render(); requestAnimationFrame(fitView); persist(); registerWebMcp();
})();
