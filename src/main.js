// Orbit Courier screens: aim by dragging, then steer the flight with short burns.
import { Game, LevelSelect, Result, Scene, Title, backdrop, compose, dot, panel, star, text, TAU, clamp } from "./gamekit.js";
import { Flight, H, LEVELS, MAX_POWER, SECTORS, gravity, makeLevel, moonPos, preview } from "./logic.js";

export const game = new Game({ id: "orbit-courier", title: "Orbit Courier", theme: { accent: "#a78bfa", onAccent: "#150b33", bg: "#080617", bg2: "#17123a", panel: "#231c52" }, defaults: { stars: [], best: [] } });
const data = game.store.data;

const HELP = [
  ["The job", "Fly each parcel from the launch pad to the dock at the top. Drag back from your ship like a slingshot, then let go."],
  ["Gravity", "Planets pull your ship with real inverse-square gravity. Curve around them to reach places no straight shot can."],
  ["In flight", "The two buttons at the bottom fire short burns, speeding you up or slowing you down. Fuel is limited."],
  ["Stars", "One star for delivering. One for collecting every crate. One for a clean flight with no burns.\n\nLater sectors add moons, asteroids and gates that you must pass through before docking."],
];

function art(c, g, t) {
  backdrop(c, g, t);
  dot(c, 195, 360, 44, "#6366f1");
  dot(c, 182, 346, 28, "rgba(255,255,255,.08)");
  const a = t * 1.1;
  dot(c, 195 + Math.cos(a) * 112, 360 + Math.sin(a) * 58, 6, "#fff");
  c.strokeStyle = "rgba(255,255,255,.2)";
  c.beginPath();
  c.ellipse(195, 360, 112, 58, 0, 0, TAU);
  c.stroke();
}

const title = () => new Title(game, { tag: "Gravity delivers", art, help: HELP, play: () => game.go(levels()) });
const levels = () => new LevelSelect(game, {
  title: "Route map",
  count: LEVELS,
  unlocked: (i) => i === 0 || (data.stars[i - 1] || 0) > 0,
  stars: (i) => data.stars[i] || 0,
  pick: (i) => game.go(new Fly(game, i)),
  back: () => game.go(title()),
});

class Fly extends Scene {
  constructor(g, index) { super(g); this.index = index; }
  get oy() { return Math.max(0, (this.g.H - H) / 2 - 10); }
  enter() {
    const g = this.g;
    this.lv = makeLevel(this.index);
    this.flight = null;
    this.aim = null;
    this.tries = (this.tries || 0);
    g.sound.music(compose(this.index + 11, 72, 98));
    this.ui.button(10, 10, 62, 34, "Menu", () => { g.sound.stopMusic(); g.go(levels()); }, { size: 13 });
    this.retryBtn = this.ui.button(318, 10, 62, 34, "Retry", () => this.reset(), { size: 13 });
    this.slow = this.ui.button(30, g.H - 62, 150, 52, "Slow", () => this.burn(-1), { hidden: true, size: 15 });
    this.fast = this.ui.button(210, g.H - 62, 150, 52, "Boost", () => this.burn(1), { hidden: true, style: "primary", size: 15 });
  }
  hidden() { if (this.aim) this.aim = null; }
  burn(sign) {
    if (this.flight?.thrust(sign)) { this.g.sound.tone(sign > 0 ? 220 : 140, 0.2, { type: "sawtooth", vol: 0.1 }); this.g.buzz(15); }
  }
  reset() {
    this.flight = null;
    this.aim = null;
    this.tries++;
    this.slow.hidden = this.fast.hidden = true;
  }
  ship() { return { x: this.lv.start.x, y: this.lv.start.y + this.oy }; }
  down(p) {
    if (this.flight) return;
    const s = this.ship();
    this.aim = { x: s.x, y: s.y, px: p.x, py: p.y, angle: -Math.PI / 2, power: 0 };
    this.move(p);
  }
  move(p) {
    const a = this.aim;
    if (!a) return;
    const dx = a.x - p.x, dy = a.y - p.y;
    a.angle = Math.atan2(dy, dx);
    a.power = clamp(Math.hypot(dx, dy) * 2.6, 0, MAX_POWER);
  }
  up() {
    const a = this.aim;
    this.aim = null;
    if (!a || a.power < 60) return;
    this.flight = new Flight(this.lv, a.angle, a.power);
    this.slow.hidden = this.fast.hidden = false;
    this.g.sound.play("power");
    this.g.buzz(20);
  }
  update() {
    const f = this.flight;
    if (!f || f.state !== "flying") return;
    const had = f.crates.size;
    f.step();
    const g = this.g;
    if (f.crates.size > had) { g.sound.play("coin"); g.fx.float(f.x, f.y + this.oy, "Crate", g.theme.gold); }
    if (f.state === "flying") return;
    if (f.state === "docked") return this.win();
    g.sound.play(f.state === "crashed" ? "boom" : "bad");
    g.fx.burst(f.x, f.y + this.oy, "#fb923c", 30, 170, 0.7);
    if (f.state === "crashed") g.shake(0.3);
    g.buzz(60);
    this.note = f.why;
    this.noteT = 2.2;
    this.reset();
  }
  win() {
    const g = this.g, f = this.flight, i = this.index;
    g.sound.stopMusic();
    const s = f.stars(), score = f.score();
    if (s > (data.stars[i] || 0)) data.stars[i] = s;
    if (score > (data.best[i] || 0)) data.best[i] = score;
    g.store.save();
    const buttons = [];
    if (i + 1 < LEVELS) buttons.push(["Next delivery", () => g.go(new Fly(g, i + 1)), "primary"]);
    buttons.push(["Fly again", () => g.go(new Fly(g, i))], ["Route map", () => g.go(levels())]);
    g.go(new Result(g, { title: "Delivered", stars: s, lines: [`Score ${score}`, `Best ${data.best[i]}`, `${f.crates.size} of ${this.lv.crates.length} crates, ${f.burn} burns`], buttons }));
  }
  draw(c) {
    const g = this.g, lv = this.lv, oy = this.oy, f = this.flight, tm = f ? f.t : this.t * 0.3;
    backdrop(c, g, this.t * 0.2);
    c.save();
    c.translate(0, oy);
    for (let x = 16; x < 390; x += 36) {
      for (let y = 150; y < 560; y += 36) {
        const [ax, ay] = gravity(lv, x, y, tm);
        const m = Math.min(1, Math.hypot(ax, ay) / 180);
        if (m < 0.08) continue;
        c.strokeStyle = `rgba(167,139,250,${m * 0.35})`;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (ax / 180) * 12, y + (ay / 180) * 12);
        c.stroke();
      }
    }
    for (const p of lv.planets) {
      dot(c, p.x, p.y, p.r, p.color);
      dot(c, p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.5, "rgba(255,255,255,.14)");
    }
    for (const m of lv.moons) {
      const q = moonPos(m, tm);
      dot(c, q.x, q.y, m.r, "#cbd5e1");
    }
    for (const k of lv.rocks) dot(c, k.x, k.y, k.r, "#78716c");
    lv.crates.forEach((k, n) => {
      if (f?.crates.has(n)) return;
      panel(c, k.x - 9, k.y - 9, 18, 18, g.theme.gold, 4);
    });
    lv.gates.forEach((k, n) => {
      c.strokeStyle = f?.gates.has(n) ? "#4ade80" : "#fb7185";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(k.x, k.y, k.r, 0, TAU);
      c.stroke();
    });
    const d = lv.dock;
    c.strokeStyle = "#4ade80";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(d.x, d.y, d.r + Math.sin(this.t * 4) * 2, 0, TAU);
    c.stroke();
    dot(c, d.x, d.y, 8, "#4ade80");
    text(c, "DOCK", d.x, d.y + d.r + 12, { size: 10, color: "#86efac" });
    if (f) {
      c.strokeStyle = "rgba(255,255,255,.3)";
      c.lineWidth = 2;
      c.beginPath();
      f.trail.forEach(([x, y], n) => (n ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
      c.save();
      c.translate(f.x, f.y);
      c.rotate(Math.atan2(f.vy, f.vx));
      c.fillStyle = "#fff";
      c.beginPath();
      c.moveTo(11, 0);
      c.lineTo(-8, 6);
      c.lineTo(-8, -6);
      c.closePath();
      c.fill();
      c.restore();
    } else {
      dot(c, lv.start.x, lv.start.y, 9, "#fff");
      text(c, this.aim ? "" : "Drag back to aim", lv.start.x, lv.start.y + 24, { size: 12, color: g.theme.muted });
    }
    if (!f && this.tries >= 3) {
      c.fillStyle = g.theme.gold;
      for (const [x, y] of preview(lv, lv.route.angle, lv.route.power, 1.1)) { c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill(); }
      text(c, "Hint: try this line", lv.start.x, lv.start.y + 40, { size: 12, color: g.theme.gold });
    }
    if (this.aim && this.aim.power >= 60) {
      c.fillStyle = "#fff";
      for (const [x, y] of preview(lv, this.aim.angle, this.aim.power)) { c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill(); }
    }
    c.restore();
    text(c, `Delivery ${this.index + 1}`, g.W / 2, 20, { size: 15, weight: 800 });
    text(c, SECTORS[lv.sector], g.W / 2, 38, { size: 11, color: g.theme.muted });
    if (f) {
      panel(c, 110, g.H - 80, 170, 8, "rgba(255,255,255,.14)", 4);
      panel(c, 110, g.H - 80, Math.max(8, 1.7 * f.fuel), 8, g.theme.accent, 4);
    }
    if (this.noteT > 0) {
      this.noteT -= 1 / 60;
      text(c, this.note, g.W / 2, g.H - 96, { size: 16, weight: 700, color: "#fda4af" });
    }
    if (data.stars[this.index]) for (let s = 0; s < 3; s++) star(c, 90 + s * 16, 28, 6, s < data.stars[this.index] ? g.theme.gold : "rgba(255,255,255,.14)");
  }
}

game.start(title());
