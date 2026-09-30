const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadBrowserScript(name, sandbox) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "dist", name), "utf8"), sandbox, { filename: name });
}

function parser() {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  return sandbox.SpectreImport;
}

test("parses hierarchy, continuations, escaped names and analysis statements", () => {
  const S = parser();
  const project = S.parse([{ name: "demo.scs", path: "demo.scs", text: `
simulator lang=spectre
global 0
parameters width=2u
X0 (in out) gain_cell
noise1 (out 0) hbnoise start=1k stop=1M
subckt gain_cell A Z
  M\\<0\\> (Z A 0 0) nch_lvt l=60n \\
    w=width nf=2
ends gain_cell
tran1 tran stop=10n
` }]);
  assert.equal(project.stats.subcircuits, 1);
  assert.equal(project.stats.topInstances, 1);
  assert.equal(project.circuits[1].instances[0].ref, "M\\<0\\>");
  assert.deepEqual(Array.from(project.circuits[1].instances[0].nodes), ["Z", "A", "0", "0"]);
  assert.equal(project.circuits[1].instances[0].parameters.w, "width");
  assert.equal(project.analyses.some(item => item.master === "hbnoise"), true);
  assert.equal(project.analyses.some(item => item.text === "tran1 tran stop=10n"), true);
});

test("resolves include files and reports circular dependencies", () => {
  const S = parser();
  const project = S.parse([
    { name: "main.scs", path: "main.scs", text: 'include "models/a.scs"\nX0 (a b) child' },
    { name: "a.scs", path: "models/a.scs", text: 'include "../main.scs"\nsubckt child A B\nR0 (A B) resistor r=1k\nends child' }
  ]);
  assert.equal(project.circuits.some(circuit => circuit.name === "child"), true);
  assert.equal(project.issues.some(issue => issue.code === "CIRCULAR_INCLUDE"), true);
  assert.equal(project.includes[0].status, "resolved");
});

test("accepts an explicit choice when duplicate dependency names are ambiguous", () => {
  const S = parser();
  const sources = [
    { name: "main.scs", path: "main.scs", text: 'include "models.scs"\nX0 (a b) chosen' },
    { name: "models.scs", path: "pdk_a/models.scs", text: 'subckt ignored A B\nends ignored' },
    { name: "models.scs", path: "pdk_b/models.scs", text: 'subckt chosen A B\nends chosen' }
  ];
  const ambiguous = S.parse(sources);
  assert.equal(ambiguous.issues.some(issue => issue.code === "AMBIGUOUS_INCLUDE"), true);
  const resolved = S.parse(sources, { resolutions: { "main.scs::models.scs": "pdk_b/models.scs" } });
  assert.equal(resolved.circuits.some(circuit => circuit.name === "chosen"), true);
  assert.equal(resolved.issues.some(issue => issue.code === "AMBIGUOUS_INCLUDE"), false);
});

test("folds only instances with identical master, parameters and ordered nodes", () => {
  const S = parser();
  const project = S.parse([{ name: "groups.scs", path: "groups.scs", text: `
subckt top A B C
I0 (A B) cell p=1
I1 (A B) cell p=1
I2 (B A) cell p=1
I3 (A B) cell p=2
ends top
X0 (a b c) top
` }]);
  const top = project.circuits.find(circuit => circuit.name === "top");
  assert.deepEqual(Array.from(top.groups, group => group.members.length), [2]);
  const view = S.view(project, "top");
  assert.equal(view.components.filter(component => !component.boundaryPort).length, 3);
  assert.equal(view.components.filter(component => component.group).length, 1);
});

test("shows ordered subcircuit ports inside the child view and connects them to internal nets", () => {
  const S = parser();
  const project = S.parse([{ name: "ports.scs", path: "ports.scs", text: `
subckt child IN OUT VSS
R0 (IN OUT) resistor r=1k
R1 (OUT VSS) resistor r=2k
ends child
X0 (vin vout 0) child
` }]);
  const view = S.view(project, "child");
  const ports = view.components.filter(component => component.boundaryPort);
  assert.deepEqual(Array.from(ports, component => component.value), ["IN", "OUT", "VSS"]);
  assert.deepEqual(Array.from(ports, component => component.boundaryPortIndex), [0, 1, 2]);
  assert.equal(ports.every(component => component.type === "bidirectional"), true);
  for (const port of ports) {
    assert.equal(view.wires.some(wire => wire.from.component === port.id || wire.to.component === port.id), true);
  }
});

test("maps imported primitives to the standard library and keeps every pin on the 20px grid", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const project = sandbox.SpectreImport.parse([{ name: "grid.scs", path: "grid.scs", text: `
subckt cell A B C D E
M0 (A B C D) nch_lvt w=1u l=60n
R0 (A B) resistor r=1k
L0 (B C) inductor l=1n
D0 (C D) ndio
ends cell
X0 (a b c d e) cell
` }]);
  const view = sandbox.Circuit.validate(sandbox.SpectreImport.view(project, "cell"));
  const instances = view.components.filter(component => !component.boundaryPort);
  assert.deepEqual(Array.from(instances, component => component.type), ["nmos", "resistor", "inductor", "diode"]);
  for (const definition of Object.values(sandbox.SNETS_COMPONENT_LIBRARY)) {
    for (const pin of definition.pins) {
      assert.equal(Math.abs(pin.x % 20), 0);
      assert.equal(Math.abs(pin.y % 20), 0);
    }
  }
  for (const component of view.components) {
    assert.equal(Math.abs(component.x % 20), 0);
    assert.equal(Math.abs(component.y % 20), 0);
    for (const pin of sandbox.Circuit.definition(component).pins) {
      assert.equal(Math.abs(pin.x % 20), 0);
      assert.equal(Math.abs(pin.y % 20), 0);
      const endpoint = sandbox.Circuit.pinPoint(component, pin.id);
      assert.equal(Math.abs(endpoint.x % 20), 0);
      assert.equal(Math.abs(endpoint.y % 20), 0);
    }
  }
});

test("preserves every signal and reference terminal of a 29-port nport", () => {
  const S = parser();
  const nodes = Array.from({ length: 29 }, (_, index) => `${index + 1} gnd`).join(" ");
  const project = S.parse([{ name: "nport.scs", path: "nport.scs", text: `subckt n29 ${Array.from({ length: 29 }, (_, i) => i + 1).join(" ")} gnd\nN0 (${nodes}) nport file="x.s29p"\nends n29` }]);
  const instance = project.circuits[1].instances[0];
  assert.equal(instance.nodes.length, 58);
  assert.equal(instance.pinNames.length, 58);
  assert.equal(S.view(project, "n29").components[0].dynamicPins.length, 58);
});

test("v1 model validation remains compatible", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const demo = sandbox.Circuit.demo();
  assert.equal(sandbox.Circuit.validate(demo).version, 1);
});

test("v2 project survives JSON round trip with hierarchy and groups intact", () => {
  const S = parser();
  const project = S.parse([{ name: "roundtrip.scs", path: "roundtrip.scs", text: "subckt child A B\nR0 (A B) resistor r=1k\nR1 (A B) resistor r=1k\nends child\nX0 (in out) child" }]);
  project.layouts.child = { group_inst_child_2: { x: 320, y: 220, rotation: 0 } };
  const restored = S.validateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.circuits.length, 2);
  assert.equal(restored.circuits[1].groups[0].members.length, 2);
  assert.equal(restored.circuits[0].instances[0].master, "child");
});

test("lays out imported signal flow from left to right and keeps sources below it", () => {
  const S = parser();
  const project = S.parse([{ name: "flow.scs", path: "flow.scs", text: `
P0 (vin 0) port
X0 (vin mid 0) input_stage
X1 (mid vout vdd 0) output_stage
V0 (vdd 0) vsource dc=1.8
V1 (vbias 0) vsource dc=0.8
subckt input_stage IN OUT VSS
R0 (IN OUT) resistor r=1k
R1 (OUT VSS) resistor r=2k
ends input_stage
subckt output_stage IN OUT VDD VSS
R0 (IN OUT) resistor r=1k
R1 (VDD VSS) resistor r=2k
ends output_stage
` }]);
  const view = S.view(project, "$root");
  const byRef = Object.fromEntries(view.components.map(component => [component.ref, component]));
  assert.ok(byRef.P0.x < byRef.X0.x);
  assert.ok(byRef.X0.x < byRef.X1.x);
  assert.ok(byRef.V0.y > Math.max(byRef.P0.y, byRef.X0.y, byRef.X1.y));
  assert.notDeepEqual([byRef.V0.x, byRef.V0.y], [byRef.V1.x, byRef.V1.y]);
});

test("routes multi-terminal nets through one shared orthogonal trunk", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const project = sandbox.SpectreImport.parse([{ name: "trunk.scs", path: "trunk.scs", text: `
P0 (bus 0) port
R0 (bus n1) resistor r=1k
R1 (bus n2) resistor r=2k
R2 (bus n3) resistor r=3k
` }]);
  const state = sandbox.Circuit.validate(sandbox.SpectreImport.view(project, "$root"));
  const bus = state.wires.filter(wire => wire.net === "bus");
  assert.equal(bus.length, 3);
  assert.equal(new Set(bus.map(wire => wire.auto.axis + ":" + wire.auto.value)).size, 1);
  assert.equal(bus.filter(wire => wire.showLabel).length, 1);
  bus.forEach(wire => {
    const route = sandbox.Circuit.wireRoute(state, wire);
    assert.ok(route.length >= 2);
    for (let index = 1; index < route.length; index++) {
      assert.ok(route[index - 1].x === route[index].x || route[index - 1].y === route[index].y);
    }
  });
});

test("places semantic dynamic pins on conventional symbol sides", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const component = {
    type: "generic", master: "amp", symbol: "subcircuit",
    dynamicPins: ["IN", "OUT", "VDD", "VSS"], nodes: ["vin", "vout", "vdd", "0"]
  };
  const pins = sandbox.Circuit.definition(component).pins;
  assert.ok(pins[0].x < 0);
  assert.ok(pins[1].x > 0);
  assert.ok(pins[2].y < 0);
  assert.ok(pins[3].y > 0);
  pins.forEach(pin => { assert.equal(Math.abs(pin.x % 20), 0); assert.equal(Math.abs(pin.y % 20), 0); });
});

test("organizes components compactly and routes every wire around unrelated symbols", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const C = sandbox.Circuit, organized = C.organize(C.demo());
  const input = organized.components.find(component => component.type === "input");
  const output = organized.components.find(component => component.type === "output");
  assert.ok(input.x < output.x);
  const boxes = organized.components.map(component => C.componentBounds(component));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    assert.equal(boxes[a].right > boxes[b].left && boxes[a].left < boxes[b].right && boxes[a].bottom > boxes[b].top && boxes[a].top < boxes[b].bottom, false);
  }
  const crossesInterior = (a, b, box) => a.x === b.x
    ? a.x > box.left && a.x < box.right && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.bottom
    : a.y > box.top && a.y < box.bottom && Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < box.right;
  organized.wires.forEach(wire => {
    assert.ok(Array.isArray(wire.waypoints));
    const points = C.wireRoute(organized, wire);
    for (let index = 1; index < points.length; index++) {
      assert.ok(points[index - 1].x === points[index].x || points[index - 1].y === points[index].y);
      organized.components.filter(component => ![wire.from.component, wire.to.component].includes(component.id)).forEach(component => {
        assert.equal(crossesInterior(points[index - 1], points[index], C.componentBounds(component, 20)), false, `${wire.id} crosses ${component.id}`);
      });
    }
  });
  const hasPositiveOverlap = (a, b, c, d) => {
    if (a.y === b.y && c.y === d.y && a.y === c.y) return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
    if (a.x === b.x && c.x === d.x && a.x === c.x) return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
    return false;
  };
  const parents = organized.wires.map((_, index) => index), find = index => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (a, b) => { const ar = find(a), br = find(b); if (ar !== br) parents[br] = ar; };
  const endpointOwners = new Map(), netOwners = new Map();
  organized.wires.forEach((wire, index) => {
    [wire.from, wire.to].forEach(end => { const key = end.component + ":" + end.pin; if (endpointOwners.has(key)) union(index, endpointOwners.get(key)); else endpointOwners.set(key, index); });
    if (wire.net) { if (netOwners.has(wire.net)) union(index, netOwners.get(wire.net)); else netOwners.set(wire.net, index); }
  });
  for (let first = 0; first < organized.wires.length; first++) for (let second = first + 1; second < organized.wires.length; second++) {
    const a = organized.wires[first], b = organized.wires[second];
    if (find(first) === find(second)) continue;
    const aPoints = C.wireRoute(organized, a), bPoints = C.wireRoute(organized, b);
    for (let ai = 1; ai < aPoints.length; ai++) for (let bi = 1; bi < bPoints.length; bi++) {
      assert.equal(hasPositiveOverlap(aPoints[ai - 1], aPoints[ai], bPoints[bi - 1], bPoints[bi]), false, `${a.id} overlaps ${b.id}`);
    }
  }
  assert.equal(JSON.stringify(C.validate(JSON.parse(JSON.stringify(organized)))), JSON.stringify(organized));
});

test("persists organized Spectre waypoints in the v2 layout", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const S = sandbox.SpectreImport, C = sandbox.Circuit;
  const project = S.parse([{ name: "persist.scs", path: "persist.scs", text: `
subckt cell IN OUT VSS
R0 (IN MID) resistor r=1k
R1 (MID OUT) resistor r=1k
R2 (MID VSS) resistor r=2k
ends cell
X0 (vin vout 0) cell
` }]);
  const organized = C.organize(C.validate(S.view(project, "cell")));
  S.syncLayout(project, "cell", organized);
  const restored = C.validate(S.view(S.validateProject(JSON.parse(JSON.stringify(project))), "cell"));
  const routed = organized.wires.filter(wire => wire.waypoints.length > 0);
  assert.ok(routed.length > 0);
  routed.forEach(wire => assert.deepEqual(Array.from(restored.wires.find(item => item.id === wire.id).waypoints, point => [point.x, point.y]), Array.from(wire.waypoints, point => [point.x, point.y])));
  assert.deepEqual(Array.from(restored.components, component => [component.id, component.x, component.y]), Array.from(organized.components, component => [component.id, component.x, component.y]));
});

test("reports unresolved model metadata and applies one manual mapping to every matching instance", () => {
  const S = parser();
  const project = S.parse([{ name: "models.scs", path: "models.scs", text: `
M0 (d0 g0 s0 b0) nch_lvt w=2u l=60n
M1 (d1 g1 s1 b1) nch_lvt w=4u l=60n
M2 (d2 g2 s2 b2) nch_lvt w=8u l=60n
` }]);
  const issue = project.issues.find(item => item.code === "UNRESOLVED_MODEL");
  assert.equal(issue.model, "nch_lvt");
  assert.equal(issue.count, 3);
  project.mappings.nch_lvt = { symbol: "nmos", confidence: "manual" };
  const matches = S.view(project, "$root").components.filter(component => component.master === "nch_lvt");
  assert.equal(matches.length, 3);
  assert.equal(matches.every(component => component.type === "nmos"), true);
  assert.equal(matches.every(component => component.mappingConfidence === "manual"), true);
});

test("draws a visible stub from every dynamic subcircuit pin to its box", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const component = {
    type: "generic", master: "amp", symbol: "subcircuit",
    dynamicPins: ["IN", "OUT", "VDD", "VSS"], nodes: ["vin", "vout", "vdd", "0"]
  };
  const definition = sandbox.Circuit.definition(component);
  assert.match(definition.body, /M-80 0H-60/);
  assert.match(definition.body, /M80 0H60/);
  assert.match(definition.body, /M0 -60V-40/);
  assert.match(definition.body, /M0 60V40/);
});

test("provides a two-terminal standard PORT and maps Spectre port instances to it", () => {
  const sandbox = { self: null };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  loadBrowserScript("component-library.js", sandbox);
  loadBrowserScript("spectre-parser.js", sandbox);
  loadBrowserScript("model.js", sandbox);
  const C = sandbox.Circuit, S = sandbox.SpectreImport;
  assert.equal(C.definitions.port.name, "射频端口 PORT");
  assert.deepEqual(Array.from(C.definitions.port.pins, pin => pin.id), ["1", "2"]);
  const localPort = C.component("port", 100, 100, "PORT1");
  assert.equal(localPort.num, "1");
  const project = S.parse([{ name: "port.scs", path: "port.scs", text: "PORT0 (rf 0) port r=50 num=1" }]);
  assert.equal(project.issues.some(issue => issue.code === "UNRESOLVED_MODEL"), false);
  const importedPort = S.view(project, "$root").components[0];
  assert.equal(importedPort.type, "port");
  assert.equal(C.definition(importedPort).pins.length, 2);
  assert.deepEqual(Array.from(importedPort.nodes), ["rf", "0"]);
});
