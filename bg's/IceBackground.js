// ─────────────────────────────────────────────────────────────────────────────
// IceBackground.js
// Parallax "ice spikes" background for the Level class — captures the cold,
// stark, crystalline-spire atmosphere of a frozen tundra dotted with towering
// ice spikes, WITHOUT using cubic/voxel shapes. Every spike here is an
// irregular faceted polygon (jagged, asymmetric, hand-cut looking), matching
// the rest of this project's organic-silhouette art style.
//
// Layer stack (back → front), each one scrolling at its own speed:
//   Sky gradient                 parallax X/Y  0.00
//   Far spike silhouettes        parallax X    0.10  Y  0.05   (hazy, slow)
//   Near ice spikes + packed-ice  parallax X    0.32  Y  0.16   (the biome's
//   ground patches                                               signature feature)
//   Drifting ice glitter         screen-space  (sharp, sparse, ambient)
// ─────────────────────────────────────────────────────────────────────────────

class IceBackground {
  constructor() {

    // ── Parallax factors ─────────────────────────────────────────────────────
    this.FX_FAR    = 0.10;
    this.FY_FAR    = 0.05;
    this.FX_NEAR   = 0.32;
    this.FY_NEAR   = 0.16;

    // ── Screen shake (kept for interface parity with SnowBackground; unused) ──
    this.shakeIntensity = 0;

    // ── Drifting ice glitter (this biome's answer to snowflakes/leaves) ──────
    this.glitter = this._initGlitter();

    // ── Pre-generate deterministic terrain ───────────────────────────────────
    this.farSpikes  = this._genFarSpikes();
    this.nearSpikes = this._genNearSpikes();
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

  // ── Convert screen-Y with vertical parallax based on camera Y position ─────
  _sy(defaultY, camY, fy) {
    return defaultY + (height / 2 - camY) * fy;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _initGlitter() {
    const out = [];
    for (let i = 0; i < 50; i++) {
      out.push({
        x:      this._r(i * 3)     * (windowWidth  + 40) - 20,
        y:      this._r(i * 3 + 1) * (windowHeight * 0.9 + 60) - 30,
        size:   1.4 + this._r(i * 3 + 2) * 2.2,
        speed:  0.35 + this._r(i * 5 + 3) * 0.6,
        drift:  (this._r(i * 7 + 1) - 0.5) * 0.7,
        twinkle: this._r(i * 11) * Math.PI * 2,
      });
    }
    return out;
  }

  // Far spike palette — hazier, cooler, lower contrast than the near layer.
  static FAR_SPIKE_PALETTES = [
    [196, 212, 220],
    [188, 206, 218],
    [206, 218, 226],
  ];

  _genFarSpikes() {
    const out = [];
    for (let i = 0; i < 60; i++) {
      out.push({
        bgX:     -1700 + i * 58 + (this._r(i * 5) - 0.5) * 28,
        hFrac:    0.10 + this._r(i * 7) * 0.16,
        wScale:   0.7 + this._r(i * 11) * 0.6,
        palette:  IceBackground.FAR_SPIKE_PALETTES[i % IceBackground.FAR_SPIKE_PALETTES.length],
        seed:     i * 41 + 7,
      });
    }
    return out;
  }
  // Near ice-spike palette — pale, cold, faintly cyan crystal tones. Each
  // entry is [baseFace, litFace, shadowFace, coreGlow].
  static NEAR_SPIKE_PALETTES = [
    [[214, 232, 238], [240, 250, 252], [168, 196, 208], [186, 224, 232]],
    [[202, 226, 236], [232, 246, 250], [156, 188, 204], [176, 218, 230]],
    [[208, 228, 238], [238, 248, 252], [162, 194, 210], [182, 222, 234]],
    [[196, 220, 234], [228, 244, 250], [148, 182, 202], [168, 212, 228]],
  ];

  _genNearSpikes() {
    const out = [];
    // Ice Spikes biome reads as sparse but towering — a few giant spires
    // with small satellite spikes clustered around their base, rather than
    // a uniform repeating row. Each cluster gets 1 tall "mother" spike plus
    // 2-4 short ones.
    for (let i = 0; i < 26; i++) {
      const clusterX = -1900 + i * 148 + (this._r(i * 5) - 0.5) * 50;
      const isGiant = i % 3 === 0; // every third cluster gets a towering spike
      out.push({
        bgX:      clusterX,
        tallScale: isGiant ? (1.55 + this._r(i * 7) * 0.55) : (0.55 + this._r(i * 7) * 0.35),
        satellites: 2 + Math.floor(this._r(i * 11) * 3),
        palette:  IceBackground.NEAR_SPIKE_PALETTES[i % IceBackground.NEAR_SPIKE_PALETTES.length],
        depthZ:   this._r(i * 23 + 2),
        seed:     i * 131 + 19,
      });
    }
    out.sort((a, b) => a.depthZ - b.depthZ);
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update  (called every frame from sketch-1.js before draw)
  // ─────────────────────────────────────────────────────────────────────────────
  update(cam) {
    for (const g of this.glitter) {
      g.y += g.speed;
      g.x += g.drift;
      g.twinkle += 0.08;
      if (g.y > height + 10) { g.y = random(-20, -4); g.x = random(width); }
      if (g.x < -10)         g.x = width + 5;
      if (g.x > width + 10)  g.x = -5;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw background layers  (called BEFORE the game translate in sketch-1.js)
  // ─────────────────────────────────────────────────────────────────────────────
  draw(cam) {
    push();
    noStroke();

    // ── 1. Sky gradient — cold, pale, slightly desaturated tundra sky ────────
    for (let y = 0; y < height; y += 2) {
      const t = y / height;
      stroke(lerp(176, 226, t), lerp(202, 233, t), lerp(218, 240, t));
      strokeWeight(2);
      line(0, y, width, y);
    }
    noStroke();

    // ── 2. Far spike silhouettes (parallax X 0.10, Y 0.05) ────────────────────
    const farHorizY = this._sy(height * 0.64, cam.y, this.FY_FAR);
    fill(206, 222, 230);
    rect(0, farHorizY, width, height - farHorizY);

    for (const s of this.farSpikes) {
      const sx = this._sx(s.bgX, cam.x, this.FX_FAR);
      const w = 34 * s.wScale;
      if (sx + w < -30 || sx - w > width + 30) continue;
      this._drawFarSpike(sx, farHorizY, s);
    }

    fill(212, 226, 232, 60);
    rect(0, 0, width, farHorizY + 4);

    // ── 3. Snow / ice floor ───────────────────────────────────────────────────
    const floorY = this._sy(height * 0.80, cam.y, this.FY_NEAR);
    fill(232, 240, 244);
    rect(0, floorY, width, height - floorY);
    // Cracked-ice / packed-snow texture, scrolling with the near-spike
    // parallax layer so the floor isn't a flat screen-locked band.
    this._drawIceFloorTexture(floorY, height - floorY, cam.x, this.FX_NEAR, 170);

    // ── 4. Near ice spikes (parallax X 0.32, Y 0.16) — the signature layer ───
    for (const s of this.nearSpikes) {
      const sx = this._sx(s.bgX, cam.x, this.FX_NEAR);
      const span = 130 * s.tallScale;
      if (sx + span < -60 || sx - span > width + 60) continue;
      this._drawSpikeCluster(sx, floorY, s);
    }

    pop();
  }

  // ── Scrolling crack/sheen texture for the ice floor ─────────────────────────
  // Tiles thin crack-lines and bright ice-sheen patches across the floor
  // band, mapped through the same bgX → screen-X transform as the spikes
  // (_sx), so the floor visibly scrolls with the camera instead of sitting
  // glued to the screen.
  _drawIceFloorTexture(baseY, bandH, camX, fx, period) {
    if (bandH <= 0) return;
    const bgLeft  = camX * fx - width / 2;
    const bgRight = camX * fx + width / 2;
    const i0 = Math.floor(bgLeft / period) - 1;
    const i1 = Math.ceil(bgRight / period) + 1;

    for (let i = i0; i <= i1; i++) {
      const bgX = i * period;
      const sx  = this._sx(bgX, camX, fx);
      const rv  = (s) => this._r(i * 53 + s);
      const cy  = baseY + Math.min(bandH * 0.5, 6 + rv(1) * 12);

      // Bright ice-sheen patch
      noStroke();
      fill(255, 255, 255, 110);
      ellipse(sx, cy, period * 0.4, Math.min(bandH * 0.5, 7 + rv(2) * 8));

      // Thin angular crack line through the patch
      stroke(170, 196, 210, 150);
      strokeWeight(1.2);
      const crackLen = period * (0.22 + rv(3) * 0.18);
      const ang = (rv(4) - 0.5) * 0.9;
      line(
        sx - crackLen / 2, cy + Math.sin(ang) * 4,
        sx + crackLen / 2, cy - Math.sin(ang) * 4
      );
      noStroke();

      // Cool shadow fleck just past the sheen
      fill(150, 178, 196, 70);
      ellipse(sx + period * 0.28, cy + bandH * 0.18, period * 0.15, 6 + rv(5) * 5);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Screen-space layer drawn AFTER pop() in sketch-1.js — sits in front of
  // every game object, same slot SnowBackground uses for falling snow.
  // ─────────────────────────────────────────────────────────────────────────────
  drawSnow() {
    push();
    noStroke();

    // ── Drifting ice glitter — sharp little twinkling flecks rather than
    // soft round snowflakes, to keep the "crystalline" feel of this biome ────
    for (const g of this.glitter) {
      const tw = 0.55 + 0.45 * Math.sin(g.twinkle);
      fill(255, 255, 255, 150 + 100 * tw);
      push();
      translate(g.x, g.y);
      // Tiny 4-point sparkle shape — two crossed slivers — reads as a glint
      // of light off an ice crystal, not a snowflake.
      rotate(g.twinkle * 0.3);
      const sz = g.size * (0.7 + 0.5 * tw);
      beginShape();
      vertex(0, -sz);
      vertex(sz * 0.28, 0);
      vertex(0, sz);
      vertex(-sz * 0.28, 0);
      endShape(CLOSE);
      beginShape();
      vertex(-sz, 0);
      vertex(0, sz * 0.28);
      vertex(sz, 0);
      vertex(0, -sz * 0.28);
      endShape(CLOSE);
      pop();
    }

    pop();
  }

  // ── Simple jagged ice-spike silhouette for the distant, hazy layer — a
  // single asymmetric tapered spire with a couple of notches in its outline.
  // No internal facet shading: it's far away and should read as one flat
  // hazy shape, the same restraint SnowBackground uses for far mountains. ───
  _drawFarSpike(cx, gndY, s) {
    const rv = (off) => this._r(s.seed + off);
    const h = s.hFrac * height;
    const w = 34 * s.wScale;
    const lean = (rv(2) - 0.5) * w * 0.5;
    const topX = cx + lean;
    const topY = gndY - h;

    fill(s.palette[0], s.palette[1], s.palette[2]);
    // Jagged outline: apex, then an irregular notch partway down each side,
    // then the wide base — reads as a rough ice spire, not a smooth triangle.
    beginShape();
    vertex(topX, topY);
    vertex(cx + w * (0.18 + rv(3) * 0.10), gndY - h * (0.55 + rv(4) * 0.15));
    vertex(cx + w * 0.5, gndY);
    vertex(cx - w * 0.5, gndY);
    vertex(cx - w * (0.18 + rv(5) * 0.10), gndY - h * (0.50 + rv(6) * 0.15));
    endShape(CLOSE);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw one ice-spike cluster: a tall, jagged, multi-facet "mother" spire
  // plus a few shorter satellite spikes at its base — the signature look of
  // the Ice Spikes biome, rebuilt entirely from irregular hand-cut polygons
  // (no cubes, no smooth cones).
  // ─────────────────────────────────────────────────────────────────────────────
  _drawSpikeCluster(cx, gndY, s) {
    push();
    noStroke();

    // Depth dimming for clusters placed further back within this same layer
    const dim = lerp(0.74, 1, s.depthZ);
    const [base, lit, shadow, glow] = s.palette;
    const mixC = (c) => Math.round(lerp(206, c, dim));

    // Satellite spikes drawn first so the tall mother spike overlaps them
    for (let i = 0; i < s.satellites; i++) {
      const off = (i - (s.satellites - 1) / 2) * 34 + (this._r(s.seed + i * 5) - 0.5) * 16;
      const satScale = s.tallScale * (0.30 + this._r(s.seed + i * 7) * 0.22);
      this._drawSingleSpike(cx + off, gndY, satScale, s.seed + i * 53 + 200,
        mixC(base[0]), mixC(base[1]), mixC(base[2]),
        mixC(lit[0]), mixC(lit[1]), mixC(lit[2]),
        mixC(shadow[0]), mixC(shadow[1]), mixC(shadow[2]));
    }

    // The tall mother spike
    this._drawSingleSpike(cx, gndY, s.tallScale, s.seed,
      mixC(base[0]), mixC(base[1]), mixC(base[2]),
      mixC(lit[0]), mixC(lit[1]), mixC(lit[2]),
      mixC(shadow[0]), mixC(shadow[1]), mixC(shadow[2]));

    // Faint internal cold glow near the base of the mother spike, as if
    // light is passing through the translucent ice — a small but very
    // "ice" detail no cube render can fake.
    fill(glow[0], glow[1], glow[2], 90);
    ellipse(cx, gndY - 22 * s.tallScale, 26 * s.tallScale, 40 * s.tallScale);

    pop();
  }

  // ── A single faceted ice spike: jagged asymmetric outline + 3 vertical
  // facet panels shaded lit/base/shadow left-to-right (sun upper-left). ─────
  _drawSingleSpike(cx, gndY, sc, seed, bR, bG, bB, lR, lG, lB, shR, shG, shB) {
    const rv = (off) => this._r(seed + off);
    const h = (96 + rv(1) * 60) * sc;
    const w = (24 + rv(2) * 10) * sc;
    const lean = (rv(3) - 0.5) * w * 0.9;
    const topX = cx + lean;
    const topY = gndY - h;

    // Jagged silhouette: apex, an off-centre secondary peak, two irregular
    // notches down each flank, then the base. Every vertex gets a small
    // random nudge so no two spikes share the exact same outline.
    const nz = (off, mag) => (rv(off) - 0.5) * mag;
    const pts = [
      [topX, topY],
      [cx + w * (0.30 + nz(10, 0.12)), gndY - h * (0.78 + nz(11, 0.06))],
      [cx + w * (0.46 + nz(12, 0.10)), gndY - h * (0.58 + nz(13, 0.08))],
      [cx + w * (0.34 + nz(14, 0.14)), gndY - h * (0.40 + nz(15, 0.08))],
      [cx + w * (0.52 + nz(16, 0.10)), gndY - h * (0.20 + nz(17, 0.06))],
      [cx + w * 0.5, gndY],
      [cx - w * 0.5, gndY],
      [cx - w * (0.52 + nz(18, 0.10)), gndY - h * (0.20 + nz(19, 0.06))],
      [cx - w * (0.34 + nz(20, 0.14)), gndY - h * (0.40 + nz(21, 0.08))],
      [cx - w * (0.46 + nz(22, 0.10)), gndY - h * (0.58 + nz(23, 0.08))],
      [cx - w * (0.30 + nz(24, 0.12)), gndY - h * (0.78 + nz(25, 0.06))],
    ];

    // Base silhouette fill
    fill(bR, bG, bB);
    beginShape();
    for (const p of pts) vertex(p[0], p[1]);
    endShape(CLOSE);

    // Lit facet (upper-left third) — a brighter panel suggesting a cut ice
    // face catching the light.
    fill(lR, lG, lB, 215);
    beginShape();
    vertex(topX, topY);
    vertex(cx + w * (0.30 + nz(10, 0.12)) * 0.3, gndY - h * (0.78 + nz(11, 0.06)));
    vertex(cx - w * (0.34 + nz(20, 0.14)) * 0.5, gndY - h * (0.40 + nz(21, 0.08)));
    vertex(cx - w * (0.46 + nz(22, 0.10)), gndY - h * (0.58 + nz(23, 0.08)));
    vertex(cx - w * (0.30 + nz(24, 0.12)), gndY - h * (0.78 + nz(25, 0.06)));
    endShape(CLOSE);

    // Shadow facet (lower-right third) — a cooler, darker panel
    fill(shR, shG, shB, 200);
    beginShape();
    vertex(cx + w * (0.34 + nz(14, 0.14)), gndY - h * (0.40 + nz(15, 0.08)));
    vertex(cx + w * (0.52 + nz(16, 0.10)), gndY - h * (0.20 + nz(17, 0.06)));
    vertex(cx + w * 0.5, gndY);
    vertex(cx + w * 0.08, gndY);
    endShape(CLOSE);

    // Thin bright edge-highlight tracing the lit side silhouette — gives
    // the impression of a sharp, light-catching ice edge.
    stroke(255, 255, 255, 130);
    strokeWeight(Math.max(1, 1.1 * sc));
    line(topX, topY, cx + w * (0.30 + nz(10, 0.12)) * 0.3, gndY - h * (0.78 + nz(11, 0.06)));
    noStroke();
  }
}
