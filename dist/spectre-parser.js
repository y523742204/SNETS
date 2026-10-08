(function (global) {
  "use strict";

  const ANALYSES = new Set(["ac", "dc", "dcop", "envlp", "hb", "hbnoise", "info", "noise", "options", "pac", "pnoise", "pss", "pxf", "save", "sens", "sp", "sweep", "tran", "xf"]);
  const PRIMITIVES = new Set(["bsource", "capacitor", "cccs", "ccvs", "diode", "inductor", "isource", "nport", "port", "pmos", "nmos", "resistor", "transformer", "vccs", "vcvs", "vsource"]);
  const ROUTING_VERSION = 2;
  const clone = value => JSON.parse(JSON.stringify(value));
  const slug = value => String(value || "item").replace(/[^A-Za-z0-9_.-]+/g, "_");
  const makeId = (prefix, scope, index) => prefix + "_" + slug(scope) + "_" + index;

  function stripInlineComment(line) {
    let quote = "", escaped = false;
    for (let i = 0; i < line.length - 1; i++) {
      const char = line[i];
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "/" && line[i + 1] === "/") return line.slice(0, i);
    }
    return line;
  }

  function statements(text, path) {
    const rows = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    const result = [];
    let buffer = "", start = 1;
    for (let index = 0; index < rows.length; index++) {
      let line = stripInlineComment(rows[index]);
      if (!buffer) start = index + 1;
      if (!line.trim() || /^\s*\*/.test(line)) continue;
      const continued = /\\\s*$/.test(line);
      line = line.replace(/\\\s*$/, "").trim();
      if (line) buffer += (buffer ? " " : "") + line;
      if (!continued && buffer) {
        result.push({ text: buffer, line: start, path: path || "netlist" });
        buffer = "";
      }
    }
    if (buffer) result.push({ text: buffer, line: start, path: path || "netlist", incomplete: true });
    return result;
  }

  function splitTokens(text) {
    const tokens = [];
    let token = "", quote = "", depth = 0, escaped = false;
    const push = () => { if (token) { tokens.push(token); token = ""; } };
    for (const char of String(text || "")) {
      if (escaped) { token += char; escaped = false; continue; }
      if (char === "\\") { token += char; escaped = true; continue; }
      if (quote) { token += char; if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { token += char; quote = char; continue; }
      if (char === "(") depth++;
      if (char === ")") depth = Math.max(0, depth - 1);
      if (/\s/.test(char) && depth === 0) { push(); continue; }
      token += char;
    }
    push();
    return tokens;
  }

  function parseParams(text) {
    const values = {};
    for (const token of splitTokens(text)) {
      const eq = token.indexOf("=");
      if (eq > 0) values[token.slice(0, eq)] = token.slice(eq + 1);
    }
    return values;
  }

  function parseInstance(statement) {
    const match = statement.text.match(/^(\S+)\s*\(([^)]*)\)\s+(\S+)(?:\s+(.*))?$/);
    if (!match) return null;
    const nodes = splitTokens(match[2]).filter(Boolean);
    if (!nodes.length) return null;
    return {
      ref: match[1],
      nodes,
      master: match[3],
      parametersRaw: (match[4] || "").trim(),
      parameters: parseParams(match[4] || ""),
      source: { path: statement.path, line: statement.line }
    };
  }

  function normalizePath(value) {
    const parts = String(value || "").replace(/\\/g, "/").split("/");
    const out = [];
    for (const part of parts) {
      if (!part || part === ".") continue;
      if (part === "..") out.pop(); else out.push(part);
    }
    return out.join("/");
  }

  function dirname(path) {
    const clean = String(path || "").replace(/\\/g, "/");
    return clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
  }

  function resolveFile(reference, sourcePath, sources, resolutions) {
    const ref = String(reference || "").replace(/^['"]|['"]$/g, "");
    const chosen = resolutions && resolutions[String(sourcePath || "") + "::" + ref];
    if (chosen && sources.some(item => item.path === chosen || item.name === chosen)) return { status: "resolved", path: chosen, selected: true };
    const relative = normalizePath((dirname(sourcePath) ? dirname(sourcePath) + "/" : "") + ref);
    const exact = sources.filter(item => normalizePath(item.path) === relative || normalizePath(item.name) === relative);
    if (exact.length === 1) return { status: "resolved", path: exact[0].path };
    const base = normalizePath(ref).split("/").pop();
    const matches = sources.filter(item => normalizePath(item.path).split("/").pop() === base || item.name === base);
    if (matches.length === 1) return { status: "resolved", path: matches[0].path };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches.map(item => item.path) };
    return { status: "missing" };
  }

  function inferSymbol(master, nodeCount, subcircuits) {
    const value = String(master || "").toLowerCase();
    if (subcircuits.has(master)) return { symbol: "subcircuit", confidence: "exact" };
    if (value === "nport") return { symbol: "nport", confidence: "exact" };
    if (value === "transformer") return { symbol: "transformer", confidence: "exact" };
    if (value === "vsource") return { symbol: "voltage", confidence: "exact" };
    if (value === "isource") return { symbol: "current", confidence: "exact" };
    if (value === "port") return { symbol: "port", confidence: "exact" };
    if (/pch|pmos/.test(value) && nodeCount === 4) return { symbol: "pmos", confidence: "inferred" };
    if (/nch|nmos/.test(value) && nodeCount === 4) return { symbol: "nmos", confidence: "inferred" };
    if (/dio/.test(value) && nodeCount === 2) return { symbol: "diode", confidence: "inferred" };
    if (/cap|mom/.test(value) || value === "capacitor") return { symbol: "capacitor", confidence: value === "capacitor" ? "exact" : "inferred" };
    if (/res|poly/.test(value) || value === "resistor") return { symbol: "resistor", confidence: value === "resistor" ? "exact" : "inferred" };
    if (/ind/.test(value) || value === "inductor") return { symbol: "inductor", confidence: value === "inductor" ? "exact" : "inferred" };
    return { symbol: "generic", confidence: "unknown" };
  }

  function pinNames(instance, subcircuits) {
    const child = subcircuits.get(instance.master);
    if (child && child.ports.length === instance.nodes.length) return child.ports.slice();
    if (["nmos", "pmos"].includes(instance.mapping.symbol) && instance.nodes.length === 4) return ["D", "G", "S", "B"];
    if (instance.mapping.symbol === "diode" && instance.nodes.length === 2) return ["A", "K"];
    if (["resistor", "capacitor", "inductor", "voltage", "current", "port"].includes(instance.mapping.symbol)) return instance.nodes.map((_, i) => String(i + 1));
    if (instance.mapping.symbol === "nport" && instance.nodes.length % 2 === 0) return instance.nodes.map((_, i) => "P" + (Math.floor(i / 2) + 1) + (i % 2 ? "-" : "+"));
    return instance.nodes.map((_, i) => String(i + 1));
  }

  function networkTable(circuit) {
    const map = new Map();
    circuit.ports.forEach((name, index) => map.set(name, { name, port: index, members: [] }));
    circuit.instances.forEach(instance => instance.nodes.forEach((name, index) => {
      if (!map.has(name)) map.set(name, { name, members: [] });
      map.get(name).members.push({ instance: instance.id, pin: index, pinName: instance.pinNames[index] });
    }));
    return [...map.values()];
  }

  function groupKey(instance) {
    return instance.master + "\u0000" + instance.parametersRaw + "\u0000" + instance.nodes.join("\u0000");
  }

  function groupSummary(circuit) {
    const groups = new Map();
    circuit.instances.forEach(instance => {
      const key = groupKey(instance);
      if (!groups.has(key)) groups.set(key, { key, master: instance.master, nodes: instance.nodes.slice(), parametersRaw: instance.parametersRaw, members: [] });
      groups.get(key).members.push(instance.id);
    });
    return [...groups.values()].filter(group => group.members.length > 1).sort((a, b) => b.members.length - a.members.length);
  }

  function parse(sources, options) {
    if (!Array.isArray(sources) || !sources.length) throw new Error("请选择 Spectre 主网表");
    const opts = options || {};
    const mainPath = opts.mainPath || sources[0].path || sources[0].name || "netlist";
    const main = sources.find(item => item.path === mainPath) || sources[0];
    const issues = [], includes = [], models = {}, parameters = {}, globals = [], metadata = [];
    const root = { id: "$root", name: "$root", ports: [], instances: [], source: { path: main.path || main.name, line: 1 } };
    const circuits = [root];
    const byName = new Map([[root.name, root]]);
    let current = root;
    let instanceIndex = 0;
    const visitedFiles = new Set();
    const collectStatements = (source, stack) => {
      const key = normalizePath(source.path || source.name);
      if (stack.includes(key)) {
        issues.push({ severity: "warning", code: "CIRCULAR_INCLUDE", message: "检测到循环 include：" + [...stack, key].join(" → "), source: { path: source.path || source.name, line: 1 } });
        return [];
      }
      if (visitedFiles.has(key)) return [];
      visitedFiles.add(key);
      const result = [];
      for (const statement of statements(source.text, source.path || source.name)) {
        result.push(statement);
        const match = statement.text.match(/^include\s+([^\s]+)/i);
        if (!match) continue;
        const resolution = resolveFile(match[1], statement.path, sources, opts.resolutions);
        if (resolution.status === "resolved") {
          const dependency = sources.find(item => item.path === resolution.path || item.name === resolution.path);
          if (dependency) result.push(...collectStatements(dependency, [...stack, key]));
        }
      }
      return result;
    };
    const allStatements = collectStatements(main, []);

    for (const statement of allStatements) {
      if (statement.incomplete) issues.push({ severity: "error", code: "INCOMPLETE_CONTINUATION", message: "文件末尾存在未完成的续行", source: { path: statement.path, line: statement.line } });
      let match = statement.text.match(/^subckt\s+(\S+)(?:\s+(.*))?$/i);
      if (match) {
        if (byName.has(match[1])) { issues.push({ severity: "error", code: "DUPLICATE_SUBCKT", message: "子电路重复定义：" + match[1], source: { path: statement.path, line: statement.line } }); continue; }
        current = { id: match[1], name: match[1], ports: splitTokens(match[2] || ""), instances: [], source: { path: statement.path, line: statement.line } };
        circuits.push(current); byName.set(current.name, current); continue;
      }
      if (/^ends(?:\s|$)/i.test(statement.text)) { current = root; continue; }
      match = statement.text.match(/^global\s+(.+)$/i);
      if (match) { globals.push(...splitTokens(match[1])); continue; }
      match = statement.text.match(/^parameters?\s+(.+)$/i);
      if (match) { Object.assign(parameters, parseParams(match[1])); continue; }
      match = statement.text.match(/^model\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
      if (match) { models[match[1]] = { name: match[1], type: match[2], parametersRaw: match[3] || "", parameters: parseParams(match[3] || ""), source: { path: statement.path, line: statement.line } }; continue; }
      match = statement.text.match(/^include\s+([^\s]+)(?:\s+(.*))?$/i);
      if (match) {
        const resolution = resolveFile(match[1], statement.path, sources, opts.resolutions);
        includes.push({ reference: match[1].replace(/^['"]|['"]$/g, ""), options: match[2] || "", source: { path: statement.path, line: statement.line }, ...resolution });
        continue;
      }
      if (/^simulator\s+lang=/i.test(statement.text)) { metadata.push({ kind: "language", text: statement.text, source: { path: statement.path, line: statement.line } }); continue; }
      const instance = parseInstance(statement);
      if (instance) { instance.id = makeId("inst", current.id, ++instanceIndex); current.instances.push(instance); continue; }
      if (statement.text.includes("(") || statement.text.includes(")")) issues.push({ severity: "error", code: "MALFORMED_INSTANCE", message: "无法确定实例的端子连接", text: statement.text, source: { path: statement.path, line: statement.line } });
      metadata.push({ kind: /^(save|simulatorOptions|\w+\s+info|\w+\s+(?:tran|dc|ac|hb|sp|pss|pac|noise))\b/i.test(statement.text) ? "analysis" : "unsupported", text: statement.text, source: { path: statement.path, line: statement.line } });
      if (!/^(save|\w+Options|\w+\s+info|\w+\s+(?:tran|dc|ac|hb|sp|pss|pac|noise))\b/i.test(statement.text) && !statement.text.includes("(")) issues.push({ severity: "warning", code: "UNSUPPORTED_STATEMENT", message: "未识别语句，已作为元数据保留", text: statement.text, source: { path: statement.path, line: statement.line } });
    }

    const subcircuits = new Map(circuits.slice(1).map(circuit => [circuit.name, circuit]));
    const analysisStatements = [];
    for (const circuit of circuits) {
      const structural = [];
      for (const instance of circuit.instances) {
        if (ANALYSES.has(instance.master.toLowerCase()) || (/^(dcop|tran|hb|sp|pss|pac|noise)/i.test(instance.ref) && !subcircuits.has(instance.master))) {
          analysisStatements.push({ ...instance, scope: circuit.id });
          continue;
        }
        instance.mapping = inferSymbol(instance.master, instance.nodes.length, subcircuits);
        instance.pinNames = pinNames(instance, subcircuits);
        structural.push(instance);
      }
      circuit.instances = structural;
      circuit.networks = networkTable(circuit);
      circuit.groups = groupSummary(circuit);
    }

    const unresolvedModels = new Map();
    circuits.forEach(circuit => circuit.instances.forEach(instance => {
      const known = subcircuits.has(instance.master) || PRIMITIVES.has(instance.master.toLowerCase()) || models[instance.master];
      if (!known && !unresolvedModels.has(instance.master)) unresolvedModels.set(instance.master, { name: instance.master, count: 0, examples: [] });
      const entry = unresolvedModels.get(instance.master);
      if (entry) { entry.count++; if (entry.examples.length < 3) entry.examples.push({ scope: circuit.id, ref: instance.ref, source: instance.source }); }
    }));

    includes.filter(item => item.status !== "resolved").forEach(item => issues.push({ severity: "warning", code: item.status === "ambiguous" ? "AMBIGUOUS_INCLUDE" : "MISSING_INCLUDE", message: (item.status === "ambiguous" ? "依赖文件存在同名歧义：" : "缺少依赖文件：") + item.reference, source: item.source, candidates: item.candidates }));
    [...unresolvedModels.values()].forEach(item => issues.push({ severity: "warning", code: "UNRESOLVED_MODEL", model: item.name, count: item.count, message: "未提供模型定义：" + item.name + "（" + item.count + " 个实例）", examples: item.examples }));

    const knownParameterValues = new Set(["auto", "auto_switch", "dc", "linear", "log", "no", "rawfile", "sine", "touchstone", "yes"]);
    const unresolvedParameters = new Map();
    circuits.forEach(circuit => circuit.instances.forEach(instance => Object.entries(instance.parameters || {}).forEach(([key, value]) => {
      if (key.toLowerCase() === "file") return;
      if (/^['"].*['"]$/.test(String(value))) return;
      const raw = String(value).replace(/^['"]|['"]$/g, "");
      if (!/^[A-Za-z_]\w*$/.test(raw) || knownParameterValues.has(raw.toLowerCase()) || Object.prototype.hasOwnProperty.call(parameters, raw)) return;
      if (!unresolvedParameters.has(raw)) unresolvedParameters.set(raw, []);
      if (unresolvedParameters.get(raw).length < 3) unresolvedParameters.get(raw).push({ scope: circuit.id, ref: instance.ref, key, source: instance.source });
    })));
    unresolvedParameters.forEach((examples, name) => issues.push({ severity: "warning", code: "UNRESOLVED_PARAMETER", message: "未定义参数：" + name, examples }));

    const fileRefs = [];
    circuits.forEach(circuit => circuit.instances.forEach(instance => {
      const ref = instance.parameters.file;
      if (!ref) return;
      const resolution = resolveFile(ref, instance.source.path, sources, opts.resolutions);
      const record = { scope: circuit.id, instance: instance.id, reference: ref.replace(/^['"]|['"]$/g, ""), source: instance.source, ...resolution };
      fileRefs.push(record);
      if (resolution.status !== "resolved") issues.push({ severity: "warning", code: resolution.status === "ambiguous" ? "AMBIGUOUS_ATTACHMENT" : "MISSING_ATTACHMENT", message: (resolution.status === "ambiguous" ? "附件存在同名歧义：" : "缺少附件：") + record.reference, source: instance.source, candidates: resolution.candidates });
    }));

    const attachments = sources.filter(item => item !== main).map(item => ({
      name: item.name || normalizePath(item.path).split("/").pop(), path: item.path || item.name,
      size: Number(item.size) || String(item.text || "").length, type: item.type || "text/plain",
      content: typeof item.text === "string" && String(item.text).length <= 5_000_000 ? item.text : null
    }));
    const top = root;
    const totalInstances = circuits.reduce((sum, circuit) => sum + circuit.instances.length, 0);
    const project = {
      version: 2,
      kind: "spectre",
      name: (main.name || normalizePath(main.path).split("/").pop() || "Spectre 工程").replace(/\.(scs|net|cir)$/i, ""),
      top: top.id,
      globals: [...new Set(globals)], parameters, models,
      circuits, includes, fileReferences: fileRefs, attachments,
      analyses: [...analysisStatements, ...metadata],
      issues,
      mappings: {}, layouts: {}, display: { expandedMembers: {} },
      source: { main: main.path || main.name, files: sources.map(item => ({ path: item.path || item.name, size: Number(item.size) || String(item.text || "").length })) },
      stats: { subcircuits: circuits.length - 1, topInstances: top.instances.length, totalInstances }
    };
    return validateProject(project);
  }

  function validateProject(input) {
    if (!input || input.version !== 2 || input.kind !== "spectre" || !Array.isArray(input.circuits)) throw new Error("这不是有效的 SNETS Spectre v2 工程");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 160) throw new Error("工程名称无效");
    if (input.circuits.length > 10000) throw new Error("子电路数量超过限制");
    const project = clone(input);
    const ids = new Set();
    for (const circuit of project.circuits) {
      if (!circuit || typeof circuit.id !== "string" || ids.has(circuit.id) || !Array.isArray(circuit.ports) || !Array.isArray(circuit.instances)) throw new Error("子电路定义无效");
      ids.add(circuit.id);
      if (circuit.instances.length > 100000) throw new Error("单层实例数量超过限制");
      const instanceIds = new Set();
      for (const instance of circuit.instances) {
        if (!instance || typeof instance.id !== "string" || instanceIds.has(instance.id) || typeof instance.ref !== "string" || typeof instance.master !== "string" || !Array.isArray(instance.nodes)) throw new Error("实例数据无效");
        if (instance.nodes.length > 512 || instance.nodes.some(name => typeof name !== "string")) throw new Error("实例端子数据无效");
        instanceIds.add(instance.id);
        instance.parametersRaw = String(instance.parametersRaw || "");
        instance.parameters = instance.parameters && typeof instance.parameters === "object" ? instance.parameters : parseParams(instance.parametersRaw);
        instance.mapping = instance.mapping || { symbol: "generic", confidence: "unknown" };
        instance.pinNames = Array.isArray(instance.pinNames) && instance.pinNames.length === instance.nodes.length ? instance.pinNames.map(String) : instance.nodes.map((_, index) => String(index + 1));
      }
      circuit.networks = networkTable(circuit);
      circuit.groups = groupSummary(circuit);
    }
    if (!ids.has(project.top)) throw new Error("顶层电路不存在");
    project.issues = Array.isArray(project.issues) ? project.issues : [];
    project.layouts = project.layouts && typeof project.layouts === "object" ? project.layouts : {};
    project.display = project.display && typeof project.display === "object" ? project.display : { expandedMembers: {} };
    project.display.expandedMembers ||= {};
    project.attachments = Array.isArray(project.attachments) ? project.attachments : [];
    project.mappings = project.mappings && typeof project.mappings === "object" ? project.mappings : {};
    return project;
  }

  function circuitMap(project) { return new Map(project.circuits.map(circuit => [circuit.id, circuit])); }
  function getCircuit(project, id) { return project.circuits.find(circuit => circuit.id === id) || project.circuits.find(circuit => circuit.id === project.top); }

  const snap20 = value => Math.round(value / 20) * 20;

  function netKind(value) {
    const name = String(value || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    if (/^(0|gnd|ground|vss|avss|dvss|vssa|vssd|vee)$/.test(name) || /(?:^|\d)(gnd|vss)$/.test(name)) return "ground";
    if (/^(vdd|vcc|avdd|dvdd|vdda|vddd|vpwr|power)$/.test(name) || /(?:^|\d)(vdd|vcc)$/.test(name)) return "power";
    if (/^(vb|vbn|vbp|vbias|bias|ibias|vcas|vctrl)/.test(name)) return "bias";
    return "signal";
  }

  function namedPinSide(name, net) {
    const compactName = String(name || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    const compactNet = String(net || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    const kind = netKind(net) !== "signal" ? netKind(net) : netKind(name);
    if (kind === "power") return "top";
    if (kind === "ground" || kind === "bias") return "bottom";
    if ([compactName, compactNet].some(value => /^(out|output|op|on|z|q|y|rfout|dout)/.test(value))) return "right";
    if ([compactName, compactNet].some(value => /^(in|input|ip|inn|inp|a|b|rf|rfin|din|clk)/.test(value))) return "left";
    return "";
  }

  function pinLayout(names, nodes, symbol) {
    const count = names.length, spacing = 20;
    const sides = { left: [], right: [], top: [], bottom: [] };
    if (symbol === "nport" && count > 2) {
      const pairCount = Math.ceil(count / 2), leftPairs = Math.ceil(pairCount / 2);
      names.forEach((name, index) => sides[Math.floor(index / 2) < leftPairs ? "left" : "right"].push({ name, index }));
    } else {
      names.forEach((name, index) => {
        const semantic = namedPinSide(name, nodes && nodes[index]);
        const fallback = index < Math.ceil(count / 2) ? "left" : "right";
        sides[semantic || fallback].push({ name, index });
      });
    }
    const verticalCount = Math.max(sides.left.length, sides.right.length, 1);
    const height = Math.max(120, Math.ceil((verticalCount * spacing + 60) / 40) * 40);
    const horizontalWidth = 120;
    const pins = [];
    const addVertical = (side, x) => {
      const values = sides[side], start = -Math.floor((values.length - 1) / 2) * spacing;
      values.forEach((item, offset) => pins.push({ id: String(item.index), name: item.name, x, y: start + offset * spacing, height }));
    };
    const addHorizontal = (side, y) => {
      const values = sides[side], start = Math.max(-horizontalWidth / 2, -Math.floor((values.length - 1) / 2) * spacing);
      values.forEach((item, offset) => pins.push({ id: String(item.index), name: item.name, x: Math.min(horizontalWidth / 2, start + offset * spacing), y, height }));
    };
    addVertical("left", -80); addVertical("right", 80);
    addHorizontal("top", -height / 2); addHorizontal("bottom", height / 2);
    return pins.sort((a, b) => Number(a.id) - Number(b.id));
  }

  function boxBody(title, height, pins) {
    const halfWidth = 60;
    const halfHeight = Math.max(40, height / 2 - 20);
    const stubs = (pins || []).map(pin => {
      if (pin.x < -halfWidth) return '<path d="M' + pin.x + ' ' + pin.y + 'H-' + halfWidth + '"/>';
      if (pin.x > halfWidth) return '<path d="M' + pin.x + ' ' + pin.y + 'H' + halfWidth + '"/>';
      if (pin.y < -halfHeight) return '<path d="M' + pin.x + ' ' + pin.y + 'V-' + halfHeight + '"/>';
      if (pin.y > halfHeight) return '<path d="M' + pin.x + ' ' + pin.y + 'V' + halfHeight + '"/>';
      return '';
    }).join("");
    return stubs + '<rect x="-' + halfWidth + '" y="-' + halfHeight + '" width="' + (halfWidth * 2) + '" height="' + (halfHeight * 2) + '" rx="5"/><text x="0" y="4" text-anchor="middle" fill="currentColor" stroke="none" font-size="12">' + title + '</text>';
  }

  function symbolBody(symbol, height, pins) {
    if (symbol === "nmos" || symbol === "pmos") return null;
    if (symbol === "resistor") return '<path d="M-60 0H-36L-27-18-9 18 9-18 27 18 36 0H60"/>';
    if (symbol === "capacitor") return '<path d="M-60 0H-10M10 0H60M-10-30V30M10-30V30"/>';
    if (symbol === "inductor") return '<path d="M-60 0H-36C-36-22-12-22-12 0C-12-22 12-22 12 0C12-22 36-22 36 0H60"/>';
    if (symbol === "voltage" || symbol === "current") return '<path d="M0-60V-36M0 36V60"/><circle r="36"/><path d="M-10-12H10M0-22V-2M-10 16H10"/>';
    if (symbol === "transformer") return boxBody("XFMR", height, pins);
    if (symbol === "diode") return '<path d="M-60 0H-18M18 0H60M-18-28V28L18 0ZM18-28V28"/>';
    const title = symbol === "nport" ? "N-PORT" : symbol === "subcircuit" ? "SUBCKT" : "DEVICE";
    return boxBody(title, height, pins);
  }

  function definition(component, baseDefinitions) {
    if (!component || !Array.isArray(component.dynamicPins)) return baseDefinitions[component && component.type] || baseDefinitions.generic;
    const pins = pinLayout(component.dynamicPins, component.nodes, component.symbol);
    const symbol = component.symbol || "generic";
    const compatible = baseDefinitions[component.type];
    const canUseBase = component.type !== "generic" && compatible && compatible.pins && compatible.pins.length === pins.length;
    if (canUseBase) {
      const available = compatible.pins.slice();
      const mappedPins = component.dynamicPins.map((name, index) => {
        const semanticIndex = available.findIndex(pin => String(pin.id).toLowerCase() === String(name).toLowerCase());
        const selectedIndex = semanticIndex >= 0 ? semanticIndex : Math.min(index, available.length - 1);
        const basePin = available[selectedIndex];
        if (semanticIndex >= 0) available.splice(selectedIndex, 1);
        return { ...basePin, id: String(index), name };
      });
      return { ...compatible, pins: mappedPins };
    }
    return {
      name: component.master || "自定义器件", title: component.master || "Imported Spectre instance", category: "device", prefix: "X", value: component.master || "",
      pins, fields: [], defaults: {}, body: symbolBody(symbol, pins[0]?.height || 100, pins), width: 160, height: pins[0]?.height || 100
    };
  }

  function standardType(symbol, pinCount) {
    if (["nmos", "pmos"].includes(symbol) && pinCount === 4) return symbol;
    if (["resistor", "capacitor", "inductor", "voltage", "current", "diode"].includes(symbol) && pinCount === 2) return symbol;
    if (symbol === "transformer" && pinCount === 6) return "transformer_ct";
    if (symbol === "nport" && pinCount === 4) return "nport";
    if (symbol === "port" && pinCount === 2) return "port";
    if (symbol === "port" && pinCount === 1) return "bidirectional";
    return "generic";
  }

  function layout(circuit, visible, saved) {
    const positions = {}, owner = new Map(), byId = new Map(visible.map(item => [item.id, item]));
    visible.forEach(item => (item.group ? item.memberIds : [item.id]).forEach(id => owner.set(id, item.id)));
    const neighbors = new Map(visible.map(item => [item.id, new Set()]));
    const degree = new Map(visible.map(item => [item.id, 0]));
    for (const net of circuit.networks) {
      if (netKind(net.name) !== "signal") continue;
      const ids = [...new Set(net.members.map(member => owner.get(member.instance)).filter(Boolean))];
      ids.forEach(id => degree.set(id, (degree.get(id) || 0) + Math.max(0, ids.length - 1)));
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        neighbors.get(ids[a]).add(ids[b]); neighbors.get(ids[b]).add(ids[a]);
      }
    }
    const role = item => {
      const symbol = item.mapping?.symbol || "generic", master = String(item.master || "").toLowerCase();
      if (["voltage", "current"].includes(symbol) || /^(vsource|isource)$/.test(master)) return "source";
      if (symbol === "port" || master === "port") return "port";
      return "signal";
    };
    const signalItems = visible.filter(item => role(item) !== "source");
    const sources = visible.filter(item => role(item) === "source");
    const seeds = new Set(signalItems.filter(item => role(item) === "port").map(item => item.id));
    const inputLimit = Math.ceil(circuit.ports.length / 2);
    circuit.networks.forEach(net => {
      if (!Number.isInteger(net.port) || net.port >= inputLimit || namedPinSide(circuit.ports[net.port], net.name) === "right") return;
      net.members.forEach(member => { const id = owner.get(member.instance); if (id && byId.has(id) && role(byId.get(id)) !== "source") seeds.add(id); });
    });
    if (!seeds.size && signalItems.length) {
      const endpoints = signalItems.filter(item => (neighbors.get(item.id)?.size || 0) <= 1);
      seeds.add((endpoints[0] || signalItems.slice().sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))[0]).id);
    }
    const ranks = new Map(), queue = [];
    seeds.forEach(id => { ranks.set(id, 0); queue.push(id); });
    while (queue.length) {
      const id = queue.shift(), nextRank = ranks.get(id) + 1;
      [...(neighbors.get(id) || [])].sort().forEach(next => {
        if (!ranks.has(next)) { ranks.set(next, nextRank); queue.push(next); }
      });
    }
    // Disconnected islands still receive deterministic local ranks instead of
    // being packed into one very tall column.
    for (const item of signalItems) {
      if (ranks.has(item.id)) continue;
      ranks.set(item.id, 0); queue.push(item.id);
      while (queue.length) {
        const id = queue.shift(), nextRank = ranks.get(id) + 1;
        for (const next of neighbors.get(id) || []) if (!ranks.has(next)) { ranks.set(next, nextRank); queue.push(next); }
      }
    }
    const columns = new Map();
    signalItems.forEach(item => { const rank = ranks.get(item.id) || 0; if (!columns.has(rank)) columns.set(rank, []); columns.get(rank).push(item); });
    const order = new Map();
    [...columns.keys()].sort((a, b) => a - b).forEach(rank => {
      columns.get(rank).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true })).forEach((item, index) => order.set(item.id, index));
    });
    // Median/barycenter sweeps keep connected blocks on similar rows and reduce
    // crossings without making the result depend on parser iteration order.
    for (let sweep = 0; sweep < 6; sweep++) {
      const rankOrder = [...columns.keys()].sort((a, b) => sweep % 2 ? b - a : a - b);
      rankOrder.forEach(rank => {
        const items = columns.get(rank);
        items.sort((a, b) => {
          const score = item => {
            const values = [...(neighbors.get(item.id) || [])].filter(id => ranks.get(id) !== rank).map(id => order.get(id)).filter(Number.isFinite);
            return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : order.get(item.id);
          };
          return score(a) - score(b) || a.ref.localeCompare(b.ref, undefined, { numeric: true });
        });
        items.forEach((item, index) => order.set(item.id, index));
      });
    }
    let maxY = 160;
    [...columns.keys()].sort((a, b) => a - b).forEach(rank => {
      let y = 160;
      for (const item of columns.get(rank)) {
        const estimatedHeight = Math.max(140, Math.ceil((Math.ceil(item.pinNames.length / 2) * 20 + 80) / 20) * 20);
        positions[item.id] = { x: 220 + rank * 320, y: snap20(y + estimatedHeight / 2), rotation: 0 };
        y = positions[item.id].y + estimatedHeight / 2 + 100;
        maxY = Math.max(maxY, positions[item.id].y + estimatedHeight / 2);
      }
    });
    const sourcePlacements = sources.map(item => {
      const connected = [];
      circuit.networks.forEach(net => {
        if (!net.members.some(member => owner.get(member.instance) === item.id)) return;
        net.members.forEach(member => { const id = owner.get(member.instance); if (id && id !== item.id && positions[id]) connected.push(positions[id].x); });
      });
      return { item, preferredX: connected.length ? connected.reduce((sum, value) => sum + value, 0) / connected.length : 220 };
    });
    sourcePlacements.sort((a, b) => a.preferredX - b.preferredX || a.item.ref.localeCompare(b.item.ref, undefined, { numeric: true }));
    let previousSourceX = -Infinity, previousSourceRow = -1;
    sourcePlacements.forEach(({ item, preferredX }, index) => {
      const row = Math.floor(index / 6);
      if (row !== previousSourceRow) { previousSourceX = -Infinity; previousSourceRow = row; }
      const minimumX = previousSourceX + 180;
      const x = Math.max(snap20(preferredX), minimumX);
      positions[item.id] = { x, y: snap20(maxY + 240 + row * 180), rotation: 0 };
      previousSourceX = x;
    });
    // Saved coordinates are hard constraints: manually adjusted drawings remain
    // stable when the circuit is reopened or another member is expanded.
    visible.forEach(item => {
      const existing = saved && saved[item.id];
      if (existing && Number.isFinite(existing.x) && Number.isFinite(existing.y)) positions[item.id] = { ...existing, x: snap20(existing.x), y: snap20(existing.y) };
      if (!positions[item.id]) positions[item.id] = { x: 220, y: 160, rotation: 0 };
    });
    return positions;
  }

  function view(project, circuitId) {
    const circuit = getCircuit(project, circuitId);
    const expanded = new Set(project.display?.expandedMembers?.[circuit.id] || []);
    const grouped = new Set();
    const visible = [];
    for (const group of circuit.groups || groupSummary(circuit)) {
      const collapsed = group.members.filter(id => !expanded.has(id));
      if (collapsed.length > 1) {
        collapsed.forEach(id => grouped.add(id));
        const representative = circuit.instances.find(instance => instance.id === collapsed[0]);
        visible.push({ ...representative, id: "group_" + representative.id, ref: representative.ref + " ×" + collapsed.length, group: true, memberIds: collapsed, memberCount: collapsed.length });
      }
    }
    circuit.instances.forEach(instance => { if (!grouped.has(instance.id)) visible.push(instance); });
    const saved = project.layouts?.[circuit.id] || {};
    const positions = layout(circuit, visible, saved);
    const components = visible.map(instance => {
      const mapping = project.mappings[instance.master] || instance.mapping || { symbol: "generic", confidence: "unknown" };
      const mappedPins = Array.isArray(mapping.pinNames) && mapping.pinNames.length === instance.pinNames.length ? mapping.pinNames : instance.pinNames;
      const pos = positions[instance.id];
      return {
        id: instance.id, type: standardType(mapping.symbol, instance.nodes.length), x: pos.x, y: pos.y, rotation: pos.rotation || 0,
        ...(pos.mirrorX === true ? { mirrorX: true } : {}), ...(pos.mirrorY === true ? { mirrorY: true } : {}),
        ref: instance.ref, value: instance.master, master: instance.master, symbol: mapping.symbol,
        mappingConfidence: mapping.confidence || "manual", dynamicPins: mappedPins.slice(), nodes: instance.nodes.slice(),
        parametersRaw: instance.parametersRaw, parameters: clone(instance.parameters || {}), source: clone(instance.source || {}),
        sourceInstanceId: instance.group ? null : instance.id,
        group: Boolean(instance.group), memberIds: instance.memberIds || [], memberCount: instance.memberCount || 1
      };
    });
    // A subcircuit declaration exposes ordered interface nets, but those nets are
    // not instances in the Spectre source. Materialize them as boundary symbols
    // and place signal input/output, supply and ground pins on their conventional
    // sides. The declaration order is still retained by boundaryPortIndex.
    const portComponents = [];
    if (circuit.id !== "$root" && circuit.ports.length) {
      const instanceXs = components.map(component => component.x);
      const instanceYs = components.map(component => component.y);
      const minX = instanceXs.length ? Math.min(...instanceXs) : 420;
      const maxX = instanceXs.length ? Math.max(...instanceXs) : 680;
      const minY = instanceYs.length ? Math.min(...instanceYs) : 180;
      const maxY = instanceYs.length ? Math.max(...instanceYs) : 340;
      const centerY = snap20((minY + maxY) / 2);
      const fallbackLeft = Math.ceil(circuit.ports.length / 2);
      const sides = { left: [], right: [], top: [], bottom: [] };
      circuit.ports.forEach((name, index) => {
        let side = namedPinSide(name, name);
        if (!side) side = index < fallbackLeft ? "left" : "right";
        sides[side].push({ name, index });
      });
      circuit.ports.forEach((name, index) => {
        const side = Object.keys(sides).find(key => sides[key].some(item => item.index === index));
        const sideIndex = sides[side].findIndex(item => item.index === index), sideCount = sides[side].length;
        let defaultPosition;
        if (side === "left" || side === "right") defaultPosition = {
          x: side === "left" ? minX - 220 : maxX + 220,
          y: snap20(centerY + (sideIndex - (sideCount - 1) / 2) * 100),
          rotation: side === "left" ? 0 : 180
        };
        else defaultPosition = {
          x: snap20((minX + maxX) / 2 + (sideIndex - (sideCount - 1) / 2) * 140),
          y: side === "top" ? minY - 180 : maxY + 180,
          rotation: side === "top" ? 90 : 270
        };
        const id = "boundary_port_" + index;
        const existing = saved[id];
        const position = existing && Number.isFinite(existing.x) && Number.isFinite(existing.y)
          ? { ...existing, x: Math.round(existing.x / 20) * 20, y: Math.round(existing.y / 20) * 20 }
          : defaultPosition;
        portComponents.push({
          id,
          type: "bidirectional",
          x: position.x,
          y: position.y,
          rotation: position.rotation || 0,
          ...(position.mirrorX === true ? { mirrorX: true } : {}), ...(position.mirrorY === true ? { mirrorY: true } : {}),
          ref: "PIN" + (index + 1),
          value: name,
          boundaryPort: true,
          boundaryPortIndex: index
        });
      });
      components.push(...portComponents);
    }
    const componentBySource = new Map();
    components.forEach(component => {
      if (component.group) component.memberIds.forEach(id => componentBySource.set(id, component));
      else componentBySource.set(component.id, component);
    });
    const wires = [];
    let wireIndex = 0;
    for (const net of circuit.networks) {
      const ends = [];
      if (Number.isInteger(net.port) && portComponents[net.port]) {
        ends.push({ component: portComponents[net.port].id, pin: "P" });
      }
      for (const member of net.members) {
        const component = componentBySource.get(member.instance);
        if (!component) continue;
        const source = circuit.instances.find(item => item.id === member.instance);
        const sourcePin = source ? member.pin : 0;
        const end = { component: component.id, pin: String(sourcePin) };
        if (!ends.some(item => item.component === end.component && item.pin === end.pin)) ends.push(end);
      }
      if (ends.length < 2) continue;
      const center = end => {
        const component = components.find(item => item.id === end.component);
        return component ? { x: component.x, y: component.y } : { x: 0, y: 0 };
      };
      const points = ends.map(center), minX = Math.min(...points.map(point => point.x)), maxX = Math.max(...points.map(point => point.x));
      const minY = Math.min(...points.map(point => point.y)), maxY = Math.max(...points.map(point => point.y));
      const kind = netKind(net.name);
      let axis, value;
      if (kind === "power") { axis = "y"; value = snap20(minY - 120); }
      else if (kind === "ground") { axis = "y"; value = snap20(maxY + 120); }
      else if (kind === "bias") { axis = "y"; value = snap20(maxY + 80); }
      else if (maxX - minX >= maxY - minY) {
        // Horizontally distributed terminals share one horizontal trunk. Use
        // the median terminal row so a common two-terminal row plus one branch
        // becomes a minimal T instead of two independent U-shaped detours.
        axis = "y";
        const rows = points.map(point => point.y).sort((a, b) => a - b);
        value = snap20(rows[Math.floor(rows.length / 2)]);
      } else {
        axis = "x";
        const columns = points.map(point => point.x).sort((a, b) => a - b);
        value = snap20(columns[Math.floor(columns.length / 2)]);
      }
      // Move a preferred channel away from unrelated symbols. End symbols are
      // ignored because their short stubs are expected to enter the channel.
      const endpointIds = new Set(ends.map(end => end.component));
      const spanMin = axis === "x" ? minY : minX, spanMax = axis === "x" ? maxY : maxX;
      const candidates = [0, 40, -40, 80, -80, 120, -120, 160, -160, 200, -200].map(offset => value + offset);
      value = candidates.map(candidate => {
        let collisions = 0;
        components.forEach(component => {
          if (endpointIds.has(component.id)) return;
          const halfHeight = Math.max(80, Math.ceil((component.dynamicPins?.length || 2) / 2) * 12);
          const crosses = axis === "x"
            ? Math.abs(component.x - candidate) < 120 && component.y + halfHeight > spanMin && component.y - halfHeight < spanMax
            : Math.abs(component.y - candidate) < halfHeight + 40 && component.x + 100 > spanMin && component.x - 100 < spanMax;
          if (crosses) collisions++;
        });
        return { candidate, score: collisions * 10000 + Math.abs(candidate - value) };
      }).sort((a, b) => a.score - b.score || a.candidate - b.candidate)[0].candidate;
      const anchorIndex = points.map((point, index) => ({ index, distance: Math.abs((axis === "x" ? point.x : point.y) - value) }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)[0].index;
      const anchor = ends[anchorIndex], branches = ends.filter((_, index) => index !== anchorIndex);
      branches.forEach((end, branchIndex) => {
        const id = "iw_" + (++wireIndex), storedRoute = saved.__wires && saved.__wires[id];
        wires.push({
          id, from: anchor, to: end, net: net.name, imported: true,
          auto: { axis, value }, showLabel: branchIndex === 0 && (ends.length > 2 || kind !== "signal"),
          ...(storedRoute && ["x", "y"].includes(storedRoute.axis) && Number.isFinite(storedRoute.value) ? { manual: { axis: storedRoute.axis, value: storedRoute.value } } : {}),
          ...(saved.__routingVersion === ROUTING_VERSION && Array.isArray(storedRoute?.waypoints) ? { waypoints: storedRoute.waypoints.map(point => ({ x: point.x, y: point.y })) } : {})
        });
      });
    }
    return { version: 1, name: circuit.id === "$root" ? project.name : circuit.name, components, wires, imported: { project: project.name, circuit: circuit.id, ports: circuit.ports.slice() } };
  }

  function syncLayout(project, circuitId, state) {
    const target = project.layouts[circuitId] ||= {};
    state.components.forEach(component => { target[component.id] = {
      x: component.x, y: component.y, rotation: component.rotation || 0,
      ...(component.mirrorX === true ? { mirrorX: true } : {}), ...(component.mirrorY === true ? { mirrorY: true } : {})
    }; });
    target.__wires = {};
    target.__routingVersion = ROUTING_VERSION;
    state.wires.forEach(wire => {
      if (wire.manual) target.__wires[wire.id] = { axis: wire.manual.axis, value: wire.manual.value };
      else if (Array.isArray(wire.waypoints) && wire.waypoints.length) target.__wires[wire.id] = { waypoints: wire.waypoints.map(point => ({ x: point.x, y: point.y })) };
    });
  }

  function setMemberExpanded(project, circuitId, instanceId, expanded) {
    const values = new Set(project.display.expandedMembers[circuitId] || []);
    expanded ? values.add(instanceId) : values.delete(instanceId);
    project.display.expandedMembers[circuitId] = [...values];
  }

  function deleteInstance(project, circuitId, instanceId) {
    const circuit = getCircuit(project, circuitId);
    circuit.instances = circuit.instances.filter(instance => instance.id !== instanceId);
    circuit.networks = networkTable(circuit); circuit.groups = groupSummary(circuit);
    delete project.layouts?.[circuitId]?.[instanceId];
    setMemberExpanded(project, circuitId, instanceId, false);
    project.stats = { subcircuits: project.circuits.length - 1, topInstances: getCircuit(project, project.top).instances.length, totalInstances: project.circuits.reduce((sum, item) => sum + item.instances.length, 0) };
  }

  function renameNet(project, circuitId, instanceId, pinIndex, nextName) {
    const circuit = getCircuit(project, circuitId);
    const instance = circuit.instances.find(item => item.id === instanceId);
    if (!instance || !Number.isInteger(pinIndex) || pinIndex < 0 || pinIndex >= instance.nodes.length || !nextName) return false;
    instance.nodes[pinIndex] = nextName;
    circuit.networks = networkTable(circuit); circuit.groups = groupSummary(circuit);
    return true;
  }

  function mergePins(project, circuitId, a, b) {
    const circuit = getCircuit(project, circuitId);
    const endpointNet = endpoint => {
      if (Number.isInteger(endpoint?.port)) return circuit.ports[endpoint.port];
      const instance = circuit.instances.find(item => item.id === endpoint?.instance);
      return instance && Number.isInteger(endpoint.pin) ? instance.nodes[endpoint.pin] : null;
    };
    const firstNet = endpointNet(a), secondNet = endpointNet(b);
    if (!firstNet || !secondNet) return false;
    // A declared interface name is the stable net name when a boundary pin is
    // connected to an internal terminal, regardless of click order.
    const keep = Number.isInteger(a?.port) ? firstNet : Number.isInteger(b?.port) ? secondNet : firstNet;
    const replace = keep === firstNet ? secondNet : firstNet;
    if (!keep || !replace || keep === replace) return true;
    circuit.instances.forEach(instance => { instance.nodes = instance.nodes.map(name => name === replace ? keep : name); });
    circuit.ports = circuit.ports.map(name => name === replace ? keep : name);
    circuit.networks = networkTable(circuit); circuit.groups = groupSummary(circuit);
    return true;
  }

  function hierarchy(project) {
    const byName = circuitMap(project), rows = [], visited = new Set();
    const walk = (id, depth) => {
      if (visited.has(id)) return;
      visited.add(id);
      const circuit = byName.get(id); if (!circuit) return;
      rows.push({ id, name: id === "$root" ? project.name : circuit.name, depth, count: circuit.instances.length });
      circuit.instances.forEach(instance => { if (byName.has(instance.master)) walk(instance.master, depth + 1); });
    };
    walk(project.top, 0);
    project.circuits.forEach(circuit => { if (!visited.has(circuit.id)) rows.push({ id: circuit.id, name: circuit.name, depth: 0, count: circuit.instances.length, detached: true }); });
    return rows;
  }

  global.SpectreImport = { parse, statements, splitTokens, parseParams, validateProject, inferSymbol, groupKey, groupSummary, networkTable, getCircuit, definition, view, syncLayout, setMemberExpanded, deleteInstance, renameNet, mergePins, hierarchy, clone };
})(typeof self !== "undefined" ? self : globalThis);
