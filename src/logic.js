// Orbit Courier rules: a parcel ship flung through real gravity. No drawing happens here, so it can be tested.
import { Rng, dist } from "./gamekit.js";

export const W = 390, H = 640, G = 1400, DT = 1 / 60;
export const LEVELS = 40, MAX_POWER = 340, MAX_TIME = 30;
export const SECTORS = ["Inner Ring", "Rust Belt", "Twin Suns", "The Shoals"];
const PLANET_COLORS = ["#60a5fa", "#f472b6", "#fbbf24", "#34d399", "#a78bfa", "#fb923c"];

function layout(i, attempt) {
  const rng = new Rng(4242 + i * 101 + attempt * 7919);
  const sector = Math.min(SECTORS.length - 1, Math.floor(i / 10));
  const count = 1 + Math.min(4, Math.floor(i / 6)) + (rng.chance(0.4) ? 1 : 0);
  const planets = [];
  const start = { x: rng.range(80, 310), y: 590 };
  const dock = { x: rng.range(70, 320), y: rng.range(70, 130), r: 26 };
  let guard = 0;
  while (planets.length < count && guard++ < 300) {
    const r = rng.range(20, 40);
    const p = { x: rng.range(50, 340), y: rng.range(190, 480), r, mass: r * r * (sector === 2 ? 1.5 : 1), color: rng.pick(PLANET_COLORS) };
    if (planets.every((q) => dist(p.x, p.y, q.x, q.y) > p.r + q.r + 46) && dist(p.x, p.y, dock.x, dock.y) > p.r + 70) planets.push(p);
  }
  const rocks = [];
  const fields = sector >= 1 ? 3 + i % 7 : i >= 4 ? 2 : 0;
  guard = 0;
  while (rocks.length < fields && guard++ < 300) {
    const k = { x: rng.range(24, 366), y: rng.range(140, 540), r: rng.range(7, 13) };
    if (planets.every((q) => dist(k.x, k.y, q.x, q.y) > q.r + k.r + 22) && dist(k.x, k.y, dock.x, dock.y) > 62 && dist(k.x, k.y, start.x, start.y) > 80) rocks.push(k);
  }
  const moons = [];
  if (i >= 15) {
    for (const p of planets) if (rng.chance(0.4)) moons.push({ host: p, orbit: p.r + 34, speed: rng.range(0.5, 1) * (rng.chance(0.5) ? 1 : -1), phase: rng.range(0, 6.28), r: 8 });
  }
  return { index: i, sector, planets, start, dock, rocks, moons, gates: [], crates: [] };
}

/** The most curved launch that docks. Crates and gates are then placed along it, so three stars are always possible. */
function bestRoute(level) {
  let best = null;
  for (let p = 120; p <= MAX_POWER; p += 30) {
    for (let a = -3.1; a < -0.04; a += 0.03) {
      const f = new Flight(level, a, p);
      const path = [];
      while (f.state === "flying") { f.step(); path.push([f.x, f.y]); }
      if (f.state !== "docked" || path.length < 60) continue;
      let len = 0;
      for (let k = 1; k < path.length; k++) len += dist(path[k - 1][0], path[k - 1][1], path[k][0], path[k][1]);
      const bend = len / dist(level.start.x, level.start.y, level.dock.x, level.dock.y);
      if (!best || bend > best.bend) best = { angle: a, power: p, bend, path };
    }
  }
  return best;
}

const memo = new Map();

/** Level i: planets, a dock, hazards and pickups. Generated from a seed, so it never changes. */
export function makeLevel(i) {
  if (memo.has(i)) return memo.get(i);
  let level = null, route = null;
  for (let attempt = 0; attempt < 40 && !route; attempt++) {
    level = layout(i, attempt);
    if (attempt > 20) level.rocks = [];
    route = bestRoute(level);
  }
  const at = (f) => route.path[Math.floor(route.path.length * f)];
  const [ax, ay] = at(0.35), [bx, by] = at(0.68);
  level.crates = [{ x: ax, y: ay, r: 11 }, { x: bx, y: by, r: 11 }];
  if (i >= 22) {
    const [gx, gy] = at(0.5), [hx, hy] = at(0.84);
    level.gates = [{ x: gx, y: gy, r: 20 }, { x: hx, y: hy, r: 20 }];
  }
  level.route = { angle: route.angle, power: route.power };
  memo.set(i, level);
  return level;
}

export const moonPos = (m, t) => ({ x: m.host.x + Math.cos(m.phase + m.speed * t) * m.orbit, y: m.host.y + Math.sin(m.phase + m.speed * t) * m.orbit });

export function gravity(level, x, y, t = 0) {
  let ax = 0, ay = 0;
  const pull = (px, py, mass) => {
    const dx = px - x, dy = py - y;
    const d2 = Math.max(dx * dx + dy * dy, 400);
    const f = (G * mass) / d2;
    const d = Math.sqrt(d2);
    ax += (f * dx) / d;
    ay += (f * dy) / d;
  };
  for (const p of level.planets) pull(p.x, p.y, p.mass);
  for (const m of level.moons) { const q = moonPos(m, t); pull(q.x, q.y, 120); }
  return [ax, ay];
}

/** One flight, advanced in fixed steps so that the aim line and the real flight agree exactly. */
export class Flight {
  constructor(level, angle, power) {
    this.level = level;
    this.x = level.start.x;
    this.y = level.start.y;
    this.vx = Math.cos(angle) * power;
    this.vy = Math.sin(angle) * power;
    this.t = 0;
    this.state = "flying";
    this.burn = 0;
    this.fuel = 100;
    this.crates = new Set();
    this.gates = new Set();
    this.trail = [];
    this.why = "";
  }
  /** Spend fuel on a short push in the direction of travel, or against it. */
  thrust(sign) {
    if (this.fuel < 4 || this.state !== "flying") return false;
    const v = Math.hypot(this.vx, this.vy) || 1;
    this.vx += (this.vx / v) * 26 * sign;
    this.vy += (this.vy / v) * 26 * sign;
    this.fuel -= 4;
    this.burn++;
    return true;
  }
  step() {
    if (this.state !== "flying") return;
    const lv = this.level;
    // Velocity Verlet keeps orbits from gaining energy.
    const [ax, ay] = gravity(lv, this.x, this.y, this.t);
    this.x += this.vx * DT + 0.5 * ax * DT * DT;
    this.y += this.vy * DT + 0.5 * ay * DT * DT;
    const [bx, by] = gravity(lv, this.x, this.y, this.t + DT);
    this.vx += ((ax + bx) / 2) * DT;
    this.vy += ((ay + by) / 2) * DT;
    this.t += DT;
    if (Math.floor(this.t * 60) % 3 === 0) this.trail.push([this.x, this.y]);
    if (this.trail.length > 240) this.trail.shift();
    for (const p of lv.planets) if (dist(this.x, this.y, p.x, p.y) < p.r + 6) return this.end("crashed", "Crashed into a planet");
    for (const k of lv.rocks) if (dist(this.x, this.y, k.x, k.y) < k.r + 6) return this.end("crashed", "Hit an asteroid");
    for (const m of lv.moons) { const q = moonPos(m, this.t); if (dist(this.x, this.y, q.x, q.y) < m.r + 6) return this.end("crashed", "Hit a moon"); }
    lv.crates.forEach((c, n) => { if (dist(this.x, this.y, c.x, c.y) < c.r + 10) this.crates.add(n); });
    lv.gates.forEach((g, n) => { if (dist(this.x, this.y, g.x, g.y) < g.r + 6) this.gates.add(n); });
    if (dist(this.x, this.y, lv.dock.x, lv.dock.y) < lv.dock.r + 6) {
      if (this.gates.size < lv.gates.length) return this.end("missed", "Pass through every gate first");
      return this.end("docked", "Delivered");
    }
    if (this.x < -80 || this.x > W + 80 || this.y < -80 || this.y > H + 80) return this.end("lost", "Drifted into deep space");
    if (this.t > MAX_TIME) return this.end("lost", "Out of air");
  }
  end(state, why) { this.state = state; this.why = why; }
  stars() {
    if (this.state !== "docked") return 0;
    return 1 + (this.crates.size === this.level.crates.length ? 1 : 0) + (this.burn === 0 ? 1 : 0);
  }
  score() {
    if (this.state !== "docked") return 0;
    return 500 + this.crates.size * 250 + Math.round(this.fuel) * 3 + Math.max(0, 300 - Math.round(this.t * 30));
  }
}

/** Where a launch would go: only the first part, so a good shot still takes skill. */
export function preview(level, angle, power, seconds = 0.9) {
  const f = new Flight(level, angle, power);
  const pts = [];
  for (let i = 0; i < seconds * 60 && f.state === "flying"; i++) {
    f.step();
    if (i % 4 === 0) pts.push([f.x, f.y]);
  }
  return pts;
}
