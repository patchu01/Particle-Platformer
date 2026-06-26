// ─────────────────────────────────────────────────────────────────────────────
// SpaceBackground.js
// Parallax deep-space background for the Level class.
//
// Unlike every other biome here, space has no ground and no single light
// source — it's a vast, mostly-empty void. The composition reflects that:
// no floor, no "sun" direction to shade things by, just depth built from
// scattered points of light at very different parallax speeds.
//
// Layer stack (back → front), each one scrolling at its own speed:
//   Void gradient                 parallax X/Y  0.00
//   Distant nebula clouds         parallax X    0.04  Y  0.02   (hazy, slow,
//                                                                 soft colour)
//   Star field                    parallax X    0.12  Y  0.06   (the
//                                                                 biome's
//                                                                 signature)
//   Drifting foreground dust      screen-space  (twinkling close-up motes)
// ─────────────────────────────────────────────────────────────────────────────

class SpaceBackground {
  constructor() {

    // ── Parallax factors ─────────────────────────────────────────────────────
    this.FX_NEBULA  = 0.04;
    this.FY_NEBULA  = 0.02;
    this.FX_STARS   = 0.12;
    this.FY_STARS   = 0.06;

    // ── Screen shake (kept for interface parity with SnowBackground; unused) ──
    this.shakeIntensity = 0;

    // ── Foreground dust motes (this biome's answer to snowflakes/leaves) ─────
    this.dust = this._initDust();

    // ── Pre-generate deterministic terrain ───────────────────────────────────
    this.nebulae = this._genNebulae();
    this.stars   = this._genStars();

    // Animation clock for twinkling
    this._t = 0;
  }

  // ── Seeded deterministic pseudo-random [0,1) ─────────────────────────────
  _r(s) {
    const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ── Convert bg-world X → screen X for a given parallax factor ─────────────
  _sx(bgX, camX, fx) {
    return bgX - camX * fx + width / 2;
  }

  // ── Linear-interpolate between two [r,g,b] arrays ─────────────────────────
  _lerpRGB(c0, c1, t) {
    return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _initDust() {
    const out = [];
    for (let i = 0; i < 40; i++) {
      out.push({
        x:      this._r(i * 3)     * (windowWidth  + 40) - 20,
        y:      this._r(i * 3 + 1) * (windowHeight * 0.9 + 60) - 30,
        size:   1.2 + this._r(i * 3 + 2) * 2.0,
        drift:  (this._r(i * 7 + 1) - 0.5) * 0.35,
        vdrift: (this._r(i * 9 + 1) - 0.5) * 0.25,
        twinkle: this._r(i * 11) * Math.PI * 2,
      });
    }
    return out;
  }

  // Nebula palette — soft, saturated cosmic colours, used at low opacity so
  // they read as translucent gas clouds rather than solid shapes.
  static NEBULA_PALETTES = [
    [138, 64, 168],   // violet
    [64, 108, 168],   // soft blue
    [168, 64, 110],   // magenta-pink
    [54, 140, 140],   // teal
  ];

  _genNebulae() {
    const out = [];
    for (let i = 0; i < 9; i++) {
      out.push({
        bgX:     -2200 + i * 520 + (this._r(i * 5) - 0.5) * 200,
        y:       height * (0.10 + this._r(i * 7) * 0.55),
        w:       260 + this._r(i * 11) * 260,
        palette: SpaceBackground.NEBULA_PALETTES[i % SpaceBackground.NEBULA_PALETTES.length],
        seed:    i * 71 + 13,
      });
    }
    return out;
  }

  _genStars() {
    const out = [];
    for (let i = 0; i < 180; i++) {
      const big = this._r(i * 13 + 4) > 0.88; // rare brighter "feature" stars
      out.push({
        bgX:      -2200 + this._r(i * 3) * 4600,
        y:        this._r(i * 5 + 1) * height,
        size:     big ? (2.2 + this._r(i * 7) * 2.0) : (0.8 + this._r(i * 7) * 1.3),
        baseAlpha: big ? 230 : (120 + this._r(i * 9) * 110),
        twinkleSeed: this._r(i * 11) * 1000,
        twinkleSpeed: 0.4 + this._r(i * 13) * 1.1,
        tint:     this._r(i * 17), // 0..1, blends white→pale blue/gold
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update  (called every frame from sketch-1.js before draw)
  // ─────────────────────────────────────────────────────────────────────────────
  update(cam) {
    this._t += 0.02;
    for (const d of this.dust) {
      d.x += d.drift;
      d.y += d.vdrift;
      d.twinkle += 0.06;
      if (d.x < -10)        d.x = width + 5;
      if (d.x > width + 10)  d.x = -5;
      if (d.y < -10)        d.y = height + 5;
      if (d.y > height + 10) d.y = -5;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw background layers  (called BEFORE the game translate in sketch-1.js)
  // ─────────────────────────────────────────────────────────────────────────────
  draw(cam) {
    push();
    noStroke();

    // ── 1. Void gradient — deep black at the top, fading to a dark navy/
    // purple near the bottom, the way long-exposure space photography never
    // reads as pure flat black ────────────────────────────────────────────
    for (let y = 0; y < height; y += 2) {
      const t = y / height;
      stroke(lerp(4, 18, t), lerp(4, 14, t), lerp(10, 34, t));
      strokeWeight(2);
      line(0, y, width, y);
    }
    noStroke();

    // ── 2. Distant nebula clouds (parallax X 0.04, Y 0.02) ───────────────────
    for (const n of this.nebulae) {
      const sx = this._sx(n.bgX, cam.x, this.FX_NEBULA);
      if (sx + n.w < -100 || sx - n.w > width + 100) continue;
      this._drawNebula(sx, n.y, n.w, n.palette, n.seed);
    }

    // ── 3. Star field (parallax X 0.12, Y 0.06) — the biome's signature ──────
    for (const s of this.stars) {
      const sx = this._sx(s.bgX, cam.x, this.FX_STARS);
      if (sx < -5 || sx > width + 5) continue;
      const tw = 0.55 + 0.45 * Math.sin(this._t * s.twinkleSpeed + s.twinkleSeed);
      const col = this._lerpRGB([255, 255, 255], s.tint > 0.5 ? [180, 210, 255] : [255, 230, 190], Math.abs(s.tint - 0.5) * 2);
      fill(col[0], col[1], col[2], s.baseAlpha * tw);
      ellipse(sx, s.y, s.size, s.size);
      if (s.size > 1.8) {
        // Bigger feature stars get a faint 4-point glint
        stroke(col[0], col[1], col[2], 90 * tw);
        strokeWeight(0.7);
        line(sx - s.size * 1.8, s.y, sx + s.size * 1.8, s.y);
        line(sx, s.y - s.size * 1.8, sx, s.y + s.size * 1.8);
        noStroke();
      }
    }

    pop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen-space layer drawn AFTER pop() in sketch-1.js — sits in front of
  // every game object, same slot SnowBackground uses for falling snow.
  // ─────────────────────────────────────────────────────────────────────────────
  drawSnow() {
    push();
    noStroke();

    // ── Drifting foreground dust — tiny twinkling motes drifting gently in
    // every direction (space has no consistent "down", unlike snow/embers),
    // the closest layer so they read as dust right in front of the camera. ──
    for (const d of this.dust) {
      const tw = 0.5 + 0.5 * Math.sin(d.twinkle);
      fill(255, 255, 255, 60 + 130 * tw);
      ellipse(d.x, d.y, d.size, d.size);
    }

    pop();
  }

  // ── A soft cosmic gas cloud — several overlapping irregular blobs at low
  // opacity, layered light-to-dark from the inside out (a manual radial
  // gradient, the same concentric-ring trick used for the volcano biome's
  // light bloom) so it dissolves into the void instead of showing a hard
  // edge. ─────────────────────────────────────────────────────────────────
  _drawNebula(cx, cy, w, pal, seed) {
    const rv = (off) => this._r(seed + off);
    const lobes = 4;
    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + rv(i * 3) * 1.4;
      const dist = w * 0.18 * rv(i * 5 + 1);
      const lx = cx + Math.cos(ang) * dist;
      const ly = cy + Math.sin(ang) * dist * 0.5;
      const lw = w * (0.45 + rv(i * 7 + 2) * 0.35);
      const rings = 5;
      for (let k = rings; k >= 1; k--) {
        const t = k / rings;
        const rw = lw * t;
        const alpha = (1 - t) * (1 - t) * 30;
        fill(pal[0], pal[1], pal[2], alpha);
        ellipse(lx, ly, rw, rw * 0.6);
      }
    }
    // A few brighter "star-forming" flecks scattered through the cloud
    for (let s = 0; s < 5; s++) {
      const fx = cx + (rv(s * 11 + 30) - 0.5) * w * 0.7;
      const fy = cy + (rv(s * 11 + 31) - 0.5) * w * 0.35;
      fill(255, 255, 255, 90 + rv(s * 11 + 32) * 60);
      ellipse(fx, fy, 1.6 + rv(s * 11 + 33) * 1.8, 1.6 + rv(s * 11 + 33) * 1.8);
    }
  }
}
