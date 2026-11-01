import assert from "node:assert/strict";
import test from "node:test";
import { dist } from "../src/gamekit.js";
import { Flight, LEVELS, MAX_TIME, gravity, makeLevel, moonPos, preview } from "../src/logic.js";

const flat = () => ({ planets: [], moons: [], rocks: [], crates: [], gates: [], start: { x: 195, y: 590 }, dock: { x: 195, y: 100, r: 26 } });
const run = (f) => { while (f.state === "flying") f.step(); return f; };

test("levels never change and are all different", () => {
  assert.deepEqual(makeLevel(9), makeLevel(9));
  assert.notDeepEqual(makeLevel(9).planets, makeLevel(10).planets);
});

test("nothing is generated on top of a planet", () => {
  for (let i = 0; i < LEVELS; i++) {
    const lv = makeLevel(i);
    assert.ok(lv.planets.length >= 1, `level ${i}`);
    for (const p of lv.planets) {
      assert.ok(dist(p.x, p.y, lv.dock.x, lv.dock.y) > p.r + lv.dock.r, "dock clear");
      assert.ok(dist(p.x, p.y, lv.start.x, lv.start.y) > p.r + 20, "pad clear");
      for (const k of lv.rocks) assert.ok(dist(p.x, p.y, k.x, k.y) > p.r + k.r, "rock clear");
      for (const k of [...lv.crates, ...lv.gates]) assert.ok(dist(p.x, p.y, k.x, k.y) > p.r, "pickup reachable");
    }
  }
});

test("gravity points at the planet and weakens with distance", () => {
  const lv = { planets: [{ x: 100, y: 100, r: 20, mass: 400 }], moons: [] };
  const [ax, ay] = gravity(lv, 200, 100);
  assert.ok(ax < 0);
  assert.ok(Math.abs(ay) < 1e-9);
  const near = Math.hypot(...gravity(lv, 150, 100)), far = Math.hypot(...gravity(lv, 300, 100));
  assert.ok(Math.abs(near / far - 16) < 0.01, "inverse square");
});

test("empty space means a straight line", () => {
  const f = new Flight(flat(), -Math.PI / 2, 200);
  for (let i = 0; i < 60; i++) f.step();
  assert.ok(Math.abs(f.x - 195) < 1e-6);
  assert.ok(Math.abs(f.y - 390) < 1);
});

test("a direct shot docks and a clean one earns its stars", () => {
  const f = run(new Flight(flat(), -Math.PI / 2, 200));
  assert.equal(f.state, "docked");
  assert.equal(f.stars(), 3);
  assert.ok(f.score() > 0);
});

test("a burn costs a star and fuel, and fuel runs out", () => {
  const f = new Flight(flat(), -Math.PI / 2, 200);
  const v = Math.hypot(f.vx, f.vy);
  assert.ok(f.thrust(1));
  assert.ok(Math.abs(Math.hypot(f.vx, f.vy) - v - 26) < 1e-9);
  assert.equal(f.fuel, 96);
  run(f);
  assert.equal(f.stars(), 2);
  const g = new Flight(flat(), -Math.PI / 2, 200);
  g.fuel = 3;
  assert.equal(g.thrust(1), false);
});

test("planets and asteroids destroy the ship", () => {
  const a = flat();
  a.planets.push({ x: 195, y: 300, r: 30, mass: 100 });
  assert.equal(run(new Flight(a, -Math.PI / 2, 300)).state, "crashed");
  const b = flat();
  b.rocks.push({ x: 195, y: 300, r: 10 });
  assert.equal(run(new Flight(b, -Math.PI / 2, 300)).why, "Hit an asteroid");
});

test("flying off the map or too slowly ends the flight", () => {
  assert.equal(run(new Flight(flat(), Math.PI / 2, 300)).state, "lost");
  const f = run(new Flight(flat(), -Math.PI / 2, 0.01));
  assert.equal(f.state, "lost");
  assert.ok(f.t >= MAX_TIME);
});

test("gates must be passed before the dock will accept the ship", () => {
  const lv = flat();
  lv.gates.push({ x: 40, y: 300, r: 20 });
  assert.equal(run(new Flight(lv, -Math.PI / 2, 200)).state, "missed");
  lv.gates[0].x = 195;
  assert.equal(run(new Flight(lv, -Math.PI / 2, 200)).state, "docked");
});

test("a crate on the route counts", () => {
  const lv = flat();
  lv.crates.push({ x: 195, y: 300, r: 11 });
  const f = run(new Flight(lv, -Math.PI / 2, 200));
  assert.equal(f.crates.size, 1);
  assert.equal(f.stars(), 3);
});

test("a stable circular orbit keeps its radius, so energy does not leak", () => {
  const p = { x: 195, y: 320, r: 20, mass: 1600 };
  const lv = { ...flat(), planets: [p], dock: { x: -999, y: -999, r: 1 }, start: { x: 195 + 90, y: 320 } };
  const a = Math.hypot(...gravity(lv, lv.start.x, lv.start.y));
  const f = new Flight(lv, Math.PI / 2, Math.sqrt(a * 90));
  let lo = 1e9, hi = 0;
  for (let i = 0; i < 1500 && f.state === "flying"; i++) {
    f.step();
    const d = dist(f.x, f.y, p.x, p.y);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  assert.equal(f.state, "flying");
  assert.ok(hi - lo < 3, `radius varied by ${hi - lo}`);
});

test("moons follow their orbit", () => {
  const m = { host: { x: 100, y: 100 }, orbit: 50, speed: 1, phase: 0, r: 8 };
  assert.deepEqual(moonPos(m, 0), { x: 150, y: 100 });
  assert.ok(Math.abs(dist(100, 100, moonPos(m, 2).x, moonPos(m, 2).y) - 50) < 1e-9);
});

test("the aim line matches the real flight", () => {
  const lv = makeLevel(3);
  const pts = preview(lv, -1.2, 240);
  const f = new Flight(lv, -1.2, 240);
  for (let i = 0; i < 9; i++) f.step();
  assert.ok(pts.length > 2);
  const [x, y] = pts[2];
  assert.ok(Math.abs(x - f.x) < 1e-9 && Math.abs(y - f.y) < 1e-9);
});

test("every delivery has a clean route that earns all three stars", () => {
  for (let i = 0; i < LEVELS; i++) {
    const lv = makeLevel(i);
    const f = run(new Flight(lv, lv.route.angle, lv.route.power));
    assert.equal(f.state, "docked", `level ${i + 1}`);
    assert.equal(f.crates.size, lv.crates.length, `level ${i + 1} crates`);
    assert.equal(f.gates.size, lv.gates.length, `level ${i + 1} gates`);
    assert.equal(f.stars(), 3, `level ${i + 1}`);
    for (const k of [...lv.crates, ...lv.gates]) assert.ok(k.x > 20 && k.x < 370 && k.y > 50 && k.y < 625, `level ${i + 1} stays on screen`);
  }
});

test("later levels really do need curves", () => {
  const curved = [];
  for (let i = 10; i < LEVELS; i++) {
    const lv = makeLevel(i);
    const f = new Flight(lv, lv.route.angle, lv.route.power);
    const sx = lv.start.x, sy = lv.start.y;
    let off = 0;
    while (f.state === "flying") {
      f.step();
      const dx = lv.dock.x - sx, dy = lv.dock.y - sy;
      off = Math.max(off, Math.abs((f.x - sx) * dy - (f.y - sy) * dx) / Math.hypot(dx, dy));
    }
    curved.push(off);
  }
  assert.ok(curved.filter((v) => v > 30).length >= 20, curved.map(Math.round).join(" "));
});
