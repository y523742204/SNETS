(function (global) {
  "use strict";

  const definitions = global.SNETS_COMPONENT_LIBRARY;
  if (!definitions || typeof definitions !== "object") {
    throw new Error("元件库未加载，请先加载 component-library.js");
  }

  for (const [type, definition] of Object.entries(definitions)) {
    if (!definition || !definition.name || !definition.prefix || !Array.isArray(definition.pins) || !Array.isArray(definition.fields) || typeof definition.body !== "string") {
      throw new Error("元件库定义无效：" + type);
    }
    const pinIds = new Set();
    for (const pin of definition.pins) {
      if (!pin.id || pinIds.has(pin.id) || !Number.isFinite(pin.x) || !Number.isFinite(pin.y)) {
        throw new Error("元件引脚定义无效：" + type);
      }
      pinIds.add(pin.id);
    }
    definition.defaults ||= {};
    definition.value ??= "";
  }

  let sequence = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const makeId = prefix => prefix + "_" + Date.now().toString(36) + "_" + (++sequence).toString(36);

  function component(type, x, y, ref, identifier) {
    const definition = definitions[type];
    if (!definition) throw new Error("未知元件类型");
    return { id: identifier || makeId("c"), type, x, y, rotation: 0, ref, value: definition.value, ...definition.defaults };
  }

  function pinPoint(componentInstance, pinId) {
    const pin = definitions[componentInstance.type].pins.find(item => item.id === pinId);
    if (!pin) throw new Error("无效引脚");
    const radians = (componentInstance.rotation || 0) * Math.PI / 180;
    const cos = Math.round(Math.cos(radians));
    const sin = Math.round(Math.sin(radians));
    return {
      x: componentInstance.x + pin.x * cos - pin.y * sin,
      y: componentInstance.y + pin.x * sin + pin.y * cos
    };
  }

  function endpoint(state, end) {
    const componentInstance = state.components.find(item => item.id === end.component);
    if (!componentInstance) throw new Error("连线引用了不存在的元件");
    return pinPoint(componentInstance, end.pin);
  }

  function route(start, end, manual) {
    if (manual?.axis === "x" && Number.isFinite(manual.value)) {
      return [start, { x: manual.value, y: start.y }, { x: manual.value, y: end.y }, end];
    }
    if (manual?.axis === "y" && Number.isFinite(manual.value)) {
      return [start, { x: start.x, y: manual.value }, { x: end.x, y: manual.value }, end];
    }
    if (start.x === end.x || start.y === end.y) return [start, end];
    const midpoint = (start.x + end.x) / 2;
    return [start, { x: midpoint, y: start.y }, { x: midpoint, y: end.y }, end];
  }

  const pathData = points => points.map((point, index) => (index ? "L" : "M") + point.x + " " + point.y).join(" ");
  const wirePath = (state, wire) => pathData(route(endpoint(state, wire.from), endpoint(state, wire.to), wire.manual));

  function demo() {
    const required = ["vdd", "pmos", "nmos", "gnd", "input", "output", "capacitor"];
    if (required.some(type => !definitions[type])) return { version: 1, name: "未命名原理图", components: [], wires: [] };
    const components = [
      component("vdd", 480, 120, "VDD", "supply"), component("pmos", 460, 240, "M1", "pmos"),
      component("nmos", 460, 440, "M2", "nmos"), component("gnd", 480, 560, "GND", "ground"),
      component("input", 190, 340, "IN1", "vin"), component("output", 780, 340, "OUT1", "vout"),
      component("capacitor", 660, 440, "C1", "load"), component("gnd", 660, 560, "GND2", "loadgnd")
    ];
    const wire = (a, aPin, b, bPin) => ({ id: makeId("w"), from: { component: a, pin: aPin }, to: { component: b, pin: bPin } });
    return { version: 1, name: "CMOS 反相器", components, wires: [
      wire("supply", "V", "pmos", "S"), wire("supply", "V", "pmos", "B"),
      wire("pmos", "D", "nmos", "D"), wire("nmos", "S", "ground", "0"), wire("nmos", "B", "ground", "0"),
      wire("vin", "P", "pmos", "G"), wire("vin", "P", "nmos", "G"), wire("pmos", "D", "vout", "P"),
      wire("vout", "P", "load", "1"), wire("load", "2", "loadgnd", "0")
    ] };
  }

  function validate(input) {
    if (!input || input.version !== 1 || !Array.isArray(input.components) || !Array.isArray(input.wires)) throw new Error("这不是有效的 SNETS 工程文件");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) throw new Error("工程名称无效");
    if (input.components.length > 1000 || input.wires.length > 4000) throw new Error("工程过大");
    const ids = new Set();
    const components = input.components.map(item => {
      if (!item || typeof item.id !== "string" || ids.has(item.id) || !definitions[item.type]) throw new Error("存在重复 ID 或未知元件");
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || ![0, 90, 180, 270].includes(item.rotation)) throw new Error("元件位置或角度无效");
      if (typeof item.ref !== "string" || !item.ref.trim() || typeof item.value !== "string") throw new Error("元件参数无效");
      ids.add(item.id);
      const clean = { id: item.id, type: item.type, x: item.x, y: item.y, rotation: item.rotation, ref: item.ref, value: item.value };
      definitions[item.type].fields.forEach(([key]) => {
        if (key !== "value") clean[key] = String(item[key] ?? definitions[item.type].defaults[key] ?? "");
      });
      return clean;
    });
    const componentMap = new Map(components.map(item => [item.id, item]));
    const wireIds = new Set();
    const wires = input.wires.map(wire => {
      if (!wire || typeof wire.id !== "string" || wireIds.has(wire.id)) throw new Error("导线 ID 无效");
      for (const end of [wire.from, wire.to]) {
        const componentInstance = end && componentMap.get(end.component);
        if (!componentInstance || !definitions[componentInstance.type].pins.some(pin => pin.id === end.pin)) throw new Error("导线连接了不存在的引脚");
      }
      if (wire.from.component === wire.to.component && wire.from.pin === wire.to.pin) throw new Error("导线不能连接同一引脚");
      wireIds.add(wire.id);
      const cleanWire = {
        id: wire.id,
        from: { component: wire.from.component, pin: wire.from.pin },
        to: { component: wire.to.component, pin: wire.to.pin }
      };
      if (typeof wire.net === "string" && wire.net.trim()) cleanWire.net = wire.net.trim().slice(0, 80);
      if (wire.manual && ["x", "y"].includes(wire.manual.axis) && Number.isFinite(wire.manual.value)) {
        cleanWire.manual = { axis: wire.manual.axis, value: wire.manual.value };
      }
      return cleanWire;
    });
    return { version: 1, name: input.name.trim(), components, wires };
  }

  function check(state) {
    if (!state.components.length) return [{ message: "画布为空，请先添加元件。" }];
    const issues = [];
    const connected = new Set();
    state.wires.forEach(wire => {
      connected.add(wire.from.component + ":" + wire.from.pin);
      connected.add(wire.to.component + ":" + wire.to.pin);
    });
    state.components.forEach(componentInstance => definitions[componentInstance.type].pins.forEach(pin => {
      if (!connected.has(componentInstance.id + ":" + pin.id)) {
        issues.push({ component: componentInstance.id, message: componentInstance.ref + " · " + pin.name + " (" + pin.id + ") 未连接" });
      }
    }));
    return issues;
  }

  global.Circuit = { definitions, clone, id: makeId, component, pinPoint, endpoint, route, pathData, wirePath, demo, validate, check };
})(typeof window !== "undefined" ? window : globalThis);
