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

  function definition(componentInstance) {
    if (global.SpectreImport && Array.isArray(componentInstance?.dynamicPins)) return global.SpectreImport.definition(componentInstance, definitions);
    return definitions[componentInstance?.type];
  }

  function pinPoint(componentInstance, pinId) {
    const pin = definition(componentInstance)?.pins.find(item => item.id === pinId);
    if (!pin) throw new Error("无效引脚");
    const radians = (componentInstance.rotation || 0) * Math.PI / 180;
    const cos = Math.round(Math.cos(radians));
    const sin = Math.round(Math.sin(radians));
    const rotatedX = pin.x * cos - pin.y * sin;
    const rotatedY = pin.x * sin + pin.y * cos;
    return {
      x: componentInstance.x + (componentInstance.mirrorX ? -rotatedX : rotatedX),
      y: componentInstance.y + (componentInstance.mirrorY ? -rotatedY : rotatedY)
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

  function channelRoute(state, wire, channel) {
    const startItem = state.components.find(item => item.id === wire.from.component), endItem = state.components.find(item => item.id === wire.to.component);
    const start = endpoint(state, wire.from), end = endpoint(state, wire.to);
    const startEscape = escapePoint(startItem, start, end), endEscape = escapePoint(endItem, end, start);
    return simplify(channel.axis === "y"
      ? [start, startEscape, { x: startEscape.x, y: channel.value }, { x: endEscape.x, y: channel.value }, endEscape, end]
      : [start, startEscape, { x: channel.value, y: startEscape.y }, { x: channel.value, y: endEscape.y }, endEscape, end]);
  }

  const compactRoute = points => points.filter((point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  function candidateRoute(state, wire) {
    const start = endpoint(state, wire.from), end = endpoint(state, wire.to);
    return compactRoute(wire.manual
      ? route(start, end, wire.manual)
      : Array.isArray(wire.waypoints) && wire.waypoints.length
        ? [start, ...wire.waypoints, end]
        : wire.auto ? channelRoute(state, wire, wire.auto) : route(start, end));
  }
  function wireRoute(state, wire) {
    const candidate = candidateRoute(state, wire);
    const orthogonal = candidate.every((point, index) => !index || point.x === candidate[index - 1].x || point.y === candidate[index - 1].y);
    const respectsDefaultDirection = wire.manual || routeRespectsEndpointNormals(state, wire, candidate);
    if (orthogonal && respectsDefaultDirection && !routeCrossesComponents(state, wire, candidate)) return candidate;
    return findOrthogonalPath(state, wire, new Map(), "current-wire");
  }
  const pathData = points => points.map((point, index) => (index ? "L" : "M") + point.x + " " + point.y).join(" ");
  const wirePath = (state, wire) => pathData(wireRoute(state, wire));
  function previewRoute(state, end, target) {
    const item = state.components.find(component => component.id === end.component);
    if (!item) return [];
    const start = endpoint(state, end), escape = escapePoint(item, start, target);
    return simplify(escape.x !== start.x
      ? [start, escape, { x: escape.x, y: target.y }, target]
      : [start, escape, { x: target.x, y: escape.y }, target]);
  }

  const snap = value => Math.round(value / 20) * 20;
  function componentBounds(item, clearance) {
    const d = definition(item) || definitions.generic;
    let width = Number(d.width) || 144, height = Number(d.height) || 140;
    const radians = (item.rotation || 0) * Math.PI / 180;
    const cos = Math.round(Math.cos(radians)), sin = Math.round(Math.sin(radians));
    const sourceX = Number(d.boundsX) || 0, sourceY = Number(d.boundsY) || 0;
    const rotatedX = sourceX * cos - sourceY * sin, rotatedY = sourceX * sin + sourceY * cos;
    const offsetX = item.mirrorX ? -rotatedX : rotatedX, offsetY = item.mirrorY ? -rotatedY : rotatedY;
    if ((item.rotation || 0) % 180) [width, height] = [height, width];
    const pad = clearance || 0;
    return { id: item.id, left: item.x + offsetX - width / 2 - pad, right: item.x + offsetX + width / 2 + pad, top: item.y + offsetY - height / 2 - pad, bottom: item.y + offsetY + height / 2 + pad, width, height };
  }

  function segmentCrossesInterior(a, b, box) {
    if (a.x === b.x) return a.x > box.left && a.x < box.right && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.bottom;
    if (a.y === b.y) return a.y > box.top && a.y < box.bottom && Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < box.right;
    return true;
  }

  function routeCrossesComponents(state, wire, points, clearance = 0) {
    for (let index = 1; index < points.length; index++) {
      for (const item of state.components) {
        if (item.id === wire.from.component && index === 1) continue;
        if (item.id === wire.to.component && index === points.length - 1) continue;
        if (segmentCrossesInterior(points[index - 1], points[index], componentBounds(item, clearance))) return true;
      }
    }
    return false;
  }

  class MinHeap {
    constructor() { this.values = []; }
    push(value) {
      const values = this.values; values.push(value); let index = values.length - 1;
      while (index) { const parent = (index - 1) >> 1; if (values[parent].f <= value.f) break; values[index] = values[parent]; index = parent; }
      values[index] = value;
    }
    pop() {
      const values = this.values, first = values[0], last = values.pop();
      if (!values.length) return first;
      let index = 0;
      while (true) {
        let child = index * 2 + 1; if (child >= values.length) break;
        if (child + 1 < values.length && values[child + 1].f < values[child].f) child++;
        if (values[child].f >= last.f) break;
        values[index] = values[child]; index = child;
      }
      values[index] = last; return first;
    }
    get length() { return this.values.length; }
  }

  const pointKey = point => point.x + "," + point.y;
  const stateKey = (point, direction) => point.x + "," + point.y + "," + direction;
  function edgeKey(a, b) {
    return a.x < b.x || (a.x === b.x && a.y <= b.y)
      ? a.x + "," + a.y + ":" + b.x + "," + b.y
      : b.x + "," + b.y + ":" + a.x + "," + a.y;
  }
  const routingOccupancy = () => ({ edges: new Map(), bends: new Map(), segments: [], horizontal: new Map(), vertical: new Map() });
  const addOwner = (map, key, net) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(net);
  };
  const hasOtherOwner = (map, key, net) => map.has(key) && [...map.get(key)].some(owner => owner !== net);
  const isBend = (before, point, after) => (before.x === point.x) !== (point.x === after.x);
  const pointOnSegment = (point, a, b) => a.x === b.x
    ? point.x === a.x && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)
    : point.y === a.y && point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x);
  const segmentsOverlap = (a, b, c, d) => a.y === b.y && c.y === d.y && a.y === c.y
    ? Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
    : a.x === b.x && c.x === d.x && a.x === c.x && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));

  function indexedSegments(occupancy, a, b) {
    if (a.y === b.y && occupancy.horizontal) return occupancy.horizontal.get(a.y) || [];
    if (a.x === b.x && occupancy.vertical) return occupancy.vertical.get(a.x) || [];
    return occupancy.segments;
  }

  function segmentsAtPoint(occupancy, point) {
    if (!occupancy.horizontal || !occupancy.vertical) return occupancy.segments;
    return [...(occupancy.horizontal.get(point.y) || []), ...(occupancy.vertical.get(point.x) || [])];
  }

  function hasAmbiguousCorner(points, occupancy, net) {
    for (let index = 1; index < points.length - 1; index++) {
      if (isBend(points[index - 1], points[index], points[index + 1]) && segmentsAtPoint(occupancy, points[index]).some(segment => segment.net !== net && pointOnSegment(points[index], segment.a, segment.b))) return true;
    }
    for (const [key, owners] of occupancy.bends) {
      if (![...owners].some(owner => owner !== net)) continue;
      const [x, y] = key.split(",").map(Number), point = { x, y };
      if (points.some((end, index) => index > 0 && pointOnSegment(point, points[index - 1], end))) return true;
    }
    return false;
  }

  function conflictsWithRouting(points, occupancy, net) {
    if (hasAmbiguousCorner(points, occupancy, net)) return true;
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index];
      if (indexedSegments(occupancy, a, b).some(segment => segment.net !== net && segmentsOverlap(a, b, segment.a, segment.b))) return true;
    }
    return false;
  }
  function escapePoint(item, point, other) {
    const box = componentBounds(item, 20), dx = point.x - item.x, dy = point.y - item.y;
    if (Math.abs(dx) >= Math.abs(dy) && dx) return { x: snap(dx > 0 ? box.right : box.left), y: snap(point.y) };
    if (dy) return { x: snap(point.x), y: snap(dy > 0 ? box.bottom : box.top) };
    if (Math.abs(other.x - point.x) >= Math.abs(other.y - point.y)) return { x: snap(other.x > point.x ? box.right : box.left), y: snap(point.y) };
    return { x: snap(point.x), y: snap(other.y > point.y ? box.bottom : box.top) };
  }
  function routeRespectsEndpointNormals(state, wire, points) {
    if (!Array.isArray(points) || points.length < 2) return false;
    const startItem = state.components.find(item => item.id === wire.from.component), endItem = state.components.find(item => item.id === wire.to.component);
    if (!startItem || !endItem) return false;
    const start = endpoint(state, wire.from), end = endpoint(state, wire.to);
    const startEscape = escapePoint(startItem, start, end), endEscape = escapePoint(endItem, end, start);
    const followsOutward = (pin, adjacent, escape) => {
      const expectedX = Math.sign(escape.x - pin.x), expectedY = Math.sign(escape.y - pin.y);
      const actualX = Math.sign(adjacent.x - pin.x), actualY = Math.sign(adjacent.y - pin.y);
      return expectedX ? adjacent.y === pin.y && actualX === expectedX : adjacent.x === pin.x && actualY === expectedY;
    };
    return followsOutward(start, points[1], startEscape) && followsOutward(end, points[points.length - 2], endEscape);
  }
  function simplify(points) {
    const compact = compactRoute(points);
    return compact.filter((point, index) => {
      if (!index || index === compact.length - 1) return true;
      const before = compact[index - 1], after = compact[index + 1];
      return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y));
    });
  }

  function fallbackDetour(start, end, obstacles, occupancy, routeNet) {
    const top = snap(Math.min(...obstacles.map(box => box.top), start.y, end.y) - 40);
    const bottom = snap(Math.max(...obstacles.map(box => box.bottom), start.y, end.y) + 40);
    const left = snap(Math.min(...obstacles.map(box => box.left), start.x, end.x) - 40);
    const right = snap(Math.max(...obstacles.map(box => box.right), start.x, end.x) + 40);
    const candidates = [
      [start, { x: end.x, y: start.y }, end],
      [start, { x: start.x, y: end.y }, end],
      [start, { x: start.x, y: top }, { x: end.x, y: top }, end],
      [start, { x: start.x, y: bottom }, { x: end.x, y: bottom }, end],
      [start, { x: left, y: start.y }, { x: left, y: end.y }, end],
      [start, { x: right, y: start.y }, { x: right, y: end.y }, end]
    ].map(simplify).filter(points => points.every((point, index) => !index || !obstacles.some(box => segmentCrossesInterior(points[index - 1], point, box))) && !conflictsWithRouting(points, occupancy, routeNet));
    candidates.sort((a, b) => {
      const score = points => points.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0) + Math.max(0, points.length - 2) * 280;
      return score(a) - score(b);
    });
    return candidates[0] || null;
  }

  function findOrthogonalPath(next, wire, occupied, routeNet) {
    const occupancy = occupied?.edges ? occupied : { edges: occupied || new Map(), bends: new Map(), segments: [], horizontal: new Map(), vertical: new Map() };
    const startItem = next.components.find(item => item.id === wire.from.component), endItem = next.components.find(item => item.id === wire.to.component);
    const start = endpoint(next, wire.from), end = endpoint(next, wire.to);
    const startEscape = escapePoint(startItem, start, end), endEscape = escapePoint(endItem, end, start);
    const obstacles = next.components.map(item => componentBounds(item, item.id === startItem.id || item.id === endItem.id ? 0 : 20));
    const allX = obstacles.flatMap(box => [box.left, box.right]).concat([startEscape.x, endEscape.x]);
    const allY = obstacles.flatMap(box => [box.top, box.bottom]).concat([startEscape.y, endEscape.y]);
    const routingMargin = 160 + Math.min(1600, next.wires.length * 40);
    const bounds = { left: snap(Math.min(...allX) - routingMargin), right: snap(Math.max(...allX) + routingMargin), top: snap(Math.min(...allY) - routingMargin), bottom: snap(Math.max(...allY) + routingMargin) };
    const allowed = new Set([pointKey(startEscape), pointKey(endEscape)]), blockedPoints = new Set();
    obstacles.forEach(box => {
      for (let x = Math.floor(box.left / 20) * 20; x <= box.right; x += 20) {
        if (x <= box.left || x >= box.right) continue;
        for (let y = Math.floor(box.top / 20) * 20; y <= box.bottom; y += 20) {
          if (y > box.top && y < box.bottom) blockedPoints.add(pointKey({ x, y }));
        }
      }
    });
    const blocked = point => !allowed.has(pointKey(point)) && blockedPoints.has(pointKey(point));
    const directions = [{ x: 20, y: 0, id: "r" }, { x: -20, y: 0, id: "l" }, { x: 0, y: 20, id: "d" }, { x: 0, y: -20, id: "u" }];
    const heap = new MinHeap(), costs = new Map(), parents = new Map(), nodes = new Map();
    const firstKey = stateKey(startEscape, "-"); costs.set(firstKey, 0); nodes.set(firstKey, startEscape);
    heap.push({ point: startEscape, direction: "-", g: 0, f: (Math.abs(endEscape.x - startEscape.x) + Math.abs(endEscape.y - startEscape.y)) / 20, key: firstKey });
    let goal = null, expansions = 0;
    while (heap.length && expansions++ < 150000) {
      const current = heap.pop();
      if (current.g !== costs.get(current.key)) continue;
      if (current.point.x === endEscape.x && current.point.y === endEscape.y) { goal = current.key; break; }
      for (const direction of directions) {
        const point = { x: current.point.x + direction.x, y: current.point.y + direction.y };
        if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom || blocked(point)) continue;
        const occupiedNet = occupancy.edges.get(edgeKey(current.point, point));
        if (occupiedNet !== undefined && occupiedNet !== routeNet) continue;
        if (indexedSegments(occupancy, current.point, point).some(segment => segment.net !== routeNet && segmentsOverlap(current.point, point, segment.a, segment.b))) continue;
        const changesDirection = current.direction !== "-" && current.direction !== direction.id;
        if (hasOtherOwner(occupancy.bends, pointKey(point), routeNet)) continue;
        if (changesDirection && segmentsAtPoint(occupancy, current.point).some(segment => segment.net !== routeNet && pointOnSegment(current.point, segment.a, segment.b))) continue;
        const bend = changesDirection ? 14 : 0;
        const reuse = occupiedNet === routeNet ? -0.55 : 0;
        const nearObstacle = directions.some(offset => blocked({ x: point.x + offset.x, y: point.y + offset.y })) ? 0.2 : 0;
        const g = current.g + 1 + bend + reuse + nearObstacle, key = stateKey(point, direction.id);
        if (g >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, g); parents.set(key, current.key); nodes.set(key, point);
        const h = (Math.abs(endEscape.x - point.x) + Math.abs(endEscape.y - point.y)) / 20;
        heap.push({ point, direction: direction.id, g, f: g + h, key });
      }
    }
    if (!goal) {
      const detour = fallbackDetour(startEscape, endEscape, obstacles, occupancy, routeNet);
      return detour ? simplify([start, ...detour, end]) : simplify([start, startEscape]);
    }
    const gridPath = [];
    for (let key = goal; key; key = parents.get(key)) gridPath.push(nodes.get(key));
    gridPath.reverse();
    const result = simplify([start, startEscape, ...gridPath, endEscape, end]);
    if (hasAmbiguousCorner(result, occupancy, routeNet)) {
      const detour = fallbackDetour(startEscape, endEscape, obstacles, occupancy, routeNet);
      return detour ? simplify([start, ...detour, end]) : simplify([start, startEscape]);
    }
    return result;
  }

  function registerOccupied(points, net, occupied) {
    const occupancy = occupied?.edges ? occupied : { edges: occupied, bends: new Map(), segments: [], horizontal: new Map(), vertical: new Map() };
    const compact = simplify(points);
    compact.slice(1, -1).forEach((point, index) => {
      if (isBend(compact[index], point, compact[index + 2])) addOwner(occupancy.bends, pointKey(point), net);
    });
    for (let index = 1; index < compact.length; index++) {
      const a = compact[index - 1], b = compact[index];
      const segment = { a, b, net };
      occupancy.segments.push(segment);
      const segmentIndex = a.y === b.y ? occupancy.horizontal : occupancy.vertical;
      if (segmentIndex) {
        const coordinate = a.y === b.y ? a.y : a.x;
        if (!segmentIndex.has(coordinate)) segmentIndex.set(coordinate, []);
        segmentIndex.get(coordinate).push(segment);
      }
      const distance = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (distance % 20) continue;
      const dx = Math.sign(b.x - a.x) * 20, dy = Math.sign(b.y - a.y) * 20;
      let point = { x: a.x, y: a.y }, guard = 0;
      while ((point.x !== b.x || point.y !== b.y) && guard++ < 10000) {
        const next = { x: point.x + dx, y: point.y + dy };
        occupancy.edges.set(edgeKey(point, next), net || "");
        point = next;
      }
    }
  }

  function routingNetKeys(wires, mergeNamedNets = true) {
    const parent = wires.map((_, index) => index);
    const find = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    const endpointOwner = new Map(), namedOwner = new Map();
    wires.forEach((wire, index) => {
      [wire.from, wire.to].forEach(end => {
        const key = end.component + ":" + end.pin;
        if (endpointOwner.has(key)) union(index, endpointOwner.get(key)); else endpointOwner.set(key, index);
      });
      if (mergeNamedNets && wire.net) {
        if (namedOwner.has(wire.net)) union(index, namedOwner.get(wire.net)); else namedOwner.set(wire.net, index);
      }
    });
    return new Map(wires.map((wire, index) => [wire.id, "network:" + find(index)]));
  }

  function sharedNetworkChannels(state, wires) {
    // A shared drawing trunk is only valid for wires that meet at an actual
    // endpoint. Equal net labels still identify one electrical net, but local
    // GND/VDD symbols must not be pulled into one long geometric bus.
    const keys = routingNetKeys(wires, false), groups = new Map(), channels = new Map();
    wires.forEach(wire => {
      const key = keys.get(wire.id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(wire);
    });
    groups.forEach(group => {
      if (group.length < 2) return;
      const unique = new Map();
      group.forEach(wire => [wire.from, wire.to].forEach(end => unique.set(end.component + ":" + end.pin, end)));
      if (unique.size < 3) return;
      const terminals = [...unique.values()].map(end => {
        const item = state.components.find(component => component.id === end.component);
        return { end, item, point: endpoint(state, end) };
      }).filter(entry => entry.item);
      if (terminals.length < 3) return;
      const center = {
        x: terminals.reduce((sum, entry) => sum + entry.point.x, 0) / terminals.length,
        y: terminals.reduce((sum, entry) => sum + entry.point.y, 0) / terminals.length
      };
      terminals.forEach(entry => {
        const escape = escapePoint(entry.item, entry.point, center);
        entry.normal = { x: Math.sign(escape.x - entry.point.x), y: Math.sign(escape.y - entry.point.y) };
      });
      const xs = terminals.map(entry => entry.point.x), ys = terminals.map(entry => entry.point.y);
      const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? "y" : "x";
      const facing = terminals.filter(entry => axis === "y" ? entry.normal.x : entry.normal.y);
      const values = (facing.length ? facing : terminals).map(entry => axis === "y" ? entry.point.y : entry.point.x).sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)], counts = new Map();
      values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
      const value = snap([...counts].sort((a, b) => b[1] - a[1] || Math.abs(a[0] - median) - Math.abs(b[0] - median) || a[0] - b[0])[0][0]);
      group.forEach(wire => channels.set(wire.id, { axis, value }));
    });
    return channels;
  }

  function routeIsComplete(state, wire, points) {
    if (!Array.isArray(points) || points.length < 2) return false;
    const start = endpoint(state, wire.from), end = endpoint(state, wire.to);
    const first = points[0], last = points[points.length - 1];
    return first.x === start.x && first.y === start.y && last.x === end.x && last.y === end.y;
  }

  function routeBatch(state, ordered, useCandidates) {
    const routeNets = routingNetKeys(state.wires), queue = [ordered.slice()], queued = new Set(), maxAttempts = Math.min(2, ordered.length * 2 + 1);
    let best = { routes: new Map(), complete: -1 }, attempts = 0;
    while (queue.length && attempts++ < maxAttempts) {
      const sequence = queue.shift(), signature = sequence.map(item => item.wire.id).join("|");
      if (queued.has(signature)) continue;
      queued.add(signature);
      const occupied = routingOccupancy(), routes = new Map(), failed = [];
      state.wires.forEach(wire => {
        const startItem = state.components.find(item => item.id === wire.from.component), endItem = state.components.find(item => item.id === wire.to.component);
        const start = endpoint(state, wire.from), end = endpoint(state, wire.to);
        const startEscape = escapePoint(startItem, start, end), endEscape = escapePoint(endItem, end, start);
        registerOccupied([start, startEscape], routeNets.get(wire.id), occupied);
        registerOccupied([endEscape, end], routeNets.get(wire.id), occupied);
      });
      sequence.forEach(({ wire }) => {
        const routeNet = routeNets.get(wire.id), candidate = useCandidates ? candidateRoute(state, wire) : null;
        const orthogonal = candidate?.every((point, index) => !index || point.x === candidate[index - 1].x || point.y === candidate[index - 1].y);
        const respectsDefaultDirection = wire.manual || routeRespectsEndpointNormals(state, wire, candidate);
        const points = candidate && orthogonal && respectsDefaultDirection && !routeCrossesComponents(state, wire, candidate) && !conflictsWithRouting(candidate, occupied, routeNet)
          ? candidate
          : findOrthogonalPath(state, wire, occupied, routeNet);
        routes.set(wire.id, points);
        if (routeIsComplete(state, wire, points)) registerOccupied(points, routeNet, occupied);
        else failed.push(wire);
      });
      const complete = ordered.length - failed.length;
      if (complete > best.complete) best = { routes, complete };
      if (!failed.length) return routes;
      queue.push([...failed.map(wire => ({ wire })), ...sequence.filter(item => !failed.some(wire => wire.id === item.wire.id))]);
      failed.forEach(wire => queue.push([{ wire }, ...sequence.filter(item => item.wire.id !== wire.id)]));
    }
    return best.routes;
  }

  function wireRoutes(state) {
    const ordered = state.wires.map((wire, index) => ({ wire, index, priority: wire.manual ? 0 : Array.isArray(wire.waypoints) && wire.waypoints.length ? 1 : 2 }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index);
    return routeBatch(state, ordered, true);
  }

  function organize(input) {
    const next = clone(input);
    if (!next.components.length) return next;
    const orderedWires = next.wires.slice().sort((a, b) => String(a.net || "").localeCompare(String(b.net || "")) ||
      Math.abs(endpoint(next, b.from).x - endpoint(next, b.to).x) + Math.abs(endpoint(next, b.from).y - endpoint(next, b.to).y) -
      Math.abs(endpoint(next, a.from).x - endpoint(next, a.to).x) - Math.abs(endpoint(next, a.from).y - endpoint(next, a.to).y));
    const channels = sharedNetworkChannels(next, orderedWires);
    orderedWires.forEach(wire => {
      delete wire.manual; delete wire.auto; delete wire.waypoints;
      const channel = channels.get(wire.id);
      if (channel) wire.auto = channel;
    });
    const routes = routeBatch(next, orderedWires.map((wire, index) => ({ wire, index })), true);
    const incomplete = orderedWires.filter(wire => !routeIsComplete(next, wire, routes.get(wire.id)));
    if (incomplete.length) throw new Error("无法生成完整路径：" + incomplete.map(wire => {
      const from = next.components.find(item => item.id === wire.from.component)?.ref + "." + wire.from.pin;
      const to = next.components.find(item => item.id === wire.to.component)?.ref + "." + wire.to.pin;
      return from + "→" + to;
    }).join(", "));
    orderedWires.forEach(wire => {
      const points = routes.get(wire.id);
      delete wire.auto;
      wire.waypoints = points.slice(1, -1);
    });
    return validate(next);
  }

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
    if (input.components.length > 20000 || input.wires.length > 80000) throw new Error("工程过大");
    const ids = new Set();
    const components = input.components.map(item => {
      if (!item || typeof item.id !== "string" || ids.has(item.id) || !definitions[item.type]) throw new Error("存在重复 ID 或未知元件");
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y) || ![0, 90, 180, 270].includes(item.rotation)) throw new Error("元件位置或角度无效");
      if (typeof item.ref !== "string" || !item.ref.trim() || typeof item.value !== "string") throw new Error("元件参数无效");
      ids.add(item.id);
      const clean = { id: item.id, type: item.type, x: item.x, y: item.y, rotation: item.rotation, ref: item.ref, value: item.value };
      if (item.mirrorX === true) clean.mirrorX = true;
      if (item.mirrorY === true) clean.mirrorY = true;
      ["master", "symbol", "mappingConfidence", "parametersRaw", "sourceInstanceId"].forEach(key => { if (typeof item[key] === "string") clean[key] = item[key]; });
      if (Array.isArray(item.dynamicPins)) clean.dynamicPins = item.dynamicPins.map(String);
      if (Array.isArray(item.nodes)) clean.nodes = item.nodes.map(String);
      if (item.parameters && typeof item.parameters === "object") clean.parameters = clone(item.parameters);
      if (item.source && typeof item.source === "object") clean.source = clone(item.source);
      if (item.boundaryPort === true && Number.isInteger(item.boundaryPortIndex) && item.boundaryPortIndex >= 0) {
        clean.boundaryPort = true;
        clean.boundaryPortIndex = item.boundaryPortIndex;
      }
      if (item.group === true) { clean.group = true; clean.memberIds = Array.isArray(item.memberIds) ? item.memberIds.map(String) : []; clean.memberCount = clean.memberIds.length; }
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
        if (!componentInstance || !definition(componentInstance)?.pins.some(pin => pin.id === end.pin)) throw new Error("导线连接了不存在的引脚");
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
      if (wire.auto && ["x", "y"].includes(wire.auto.axis) && Number.isFinite(wire.auto.value)) {
        cleanWire.auto = { axis: wire.auto.axis, value: wire.auto.value };
      }
      if (Array.isArray(wire.waypoints)) {
        if (wire.waypoints.length > 4096 || wire.waypoints.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) throw new Error("导线路径无效");
        cleanWire.waypoints = wire.waypoints.map(point => ({ x: point.x, y: point.y }));
      }
      if (wire.imported === true) cleanWire.imported = true;
      if (wire.showLabel === true) cleanWire.showLabel = true;
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
    state.components.forEach(componentInstance => (definition(componentInstance)?.pins || []).forEach(pin => {
      if (!connected.has(componentInstance.id + ":" + pin.id)) {
        issues.push({ component: componentInstance.id, message: componentInstance.ref + " · " + pin.name + " (" + pin.id + ") 未连接" });
      }
    }));
    return issues;
  }

  global.Circuit = { definitions, definition, clone, id: makeId, component, pinPoint, endpoint, route, previewRoute, wireRoute, wireRoutes, organize, componentBounds, pathData, wirePath, demo, validate, check };
})(typeof window !== "undefined" ? window : globalThis);
