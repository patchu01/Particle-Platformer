// ─────────────────────────────────────────────────────────────────────────────
// ForestBackground.js
// Parallax forest background for the Level class.
//
// Layer stack (back → front), each one scrolling at its own speed so the
// whole scene reads as real depth rather than a flat painted backdrop:
//   Sky gradient                 parallax X/Y  0.00
//   Far tree-line silhouettes    parallax X    0.08  Y  0.04   (hazy, slow)
//   Thick mid-canopy forest      parallax X    0.30  Y  0.14   (dense wall)
//   Forest floor                 parallax X    0.30  Y  0.14   (same as mid)
//   Drifting leaves              screen-space  (gentle, ambient motion)
// ─────────────────────────────────────────────────────────────────────────────

class ForestBackground {
  constructor() {

    // ── Parallax factors ─────────────────────────────────────────────────────
    this.FX_FAR     = 0.08;
    this.FY_FAR     = 0.04;
    this.FX_THICK   = 0.30;
    this.FY_THICK   = 0.14;

    // ── Screen shake (kept for interface parity with SnowBackground; unused) ──
    this.shakeIntensity = 0;

    // ── Drifting leaves (forest's answer to snowflakes) ──────────────────────
    this.leaves = this._initLeaves();

    // ── Pre-generate deterministic terrain ───────────────────────────────────
    this.farTrees   = this._genFarTrees();
    this.thickTrees = this._genThickTrees();
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

  // ── Convert screen-Y with vertical parallax based on camera Y position ────
  _sy(defaultY, camY, fy) {
    return defaultY + (height / 2 - camY) * fy;
  }

  // ── Linear-interpolate between two [r,g,b] arrays ─────────────────────────
  _lerpRGB(c0, c1, t) {
    return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _initLeaves() {
    const leaves = [];
    for (let i = 0; i < 46; i++) {
      leaves.push({
        x:      this._r(i * 3)     * (windowWidth  + 40) - 20,
        y:      this._r(i * 3 + 1) * (windowHeight * 0.9 + 60) - 30,
        size:   5 + this._r(i * 3 + 2) * 6,
        speed:  0.45 + this._r(i * 5 + 3) * 0.85,
        drift:  (this._r(i * 7 + 1) - 0.5) * 1.3,
        wobble: this._r(i * 11) * Math.PI * 2,
        spin:   (this._r(i * 13) - 0.5) * 0.05,
        angle:  this._r(i * 17) * Math.PI * 2,
        tint:   this._r(i * 19), // 0..1 — blends leaf colour variety
      });
    }
    return leaves;
  }

  // Distant tree-line palette — cool, hazy, desaturated blue-greens, the way
  // a far ridge of trees reads through atmospheric haze.
  static FAR_TREE_PALETTES = [
    [128, 148, 138],
    [118, 140, 142],
    [134, 150, 126],
    [122, 142, 132],
  ];

  _genFarTrees() {
    const out = [];
    for (let i = 0; i < 70; i++) {
      out.push({
        bgX:      -1600 + i * 62 + (this._r(i * 5) - 0.5) * 30,
        hFrac:     0.17 + this._r(i * 7)  * 0.15,
        wFrac:     0.85 + this._r(i * 11) * 0.55,
        palette:   ForestBackground.FAR_TREE_PALETTES[i % ForestBackground.FAR_TREE_PALETTES.length],
        seed:      i * 41 + 7,
      });
    }
    return out;
  }
  // Mid-canopy palette — richer, more saturated greens than the hazy far
  // layer, with some warmer olive/autumn variety so the wall of trees
  // doesn't read as one flat repeated colour.
  static THICK_TREE_PALETTES = [
    [[ 34,  74,  38], [ 54,  98,  56], [ 20,  48,  24]], // deep forest green
    [[ 46,  84,  40], [ 68, 110,  60], [ 28,  56,  26]], // mid leaf green
    [[ 58,  88,  34], [ 82, 114,  52], [ 36,  58,  20]], // olive green
    [[ 40,  78,  52], [ 60, 104,  74], [ 24,  52,  34]], // cool pine green
    [[ 70,  82,  32], [ 96, 108,  48], [ 44,  52,  18]], // warm autumn-olive
  ];

  _genThickTrees() {
    const out = [];
    // Densely packed so neighbouring canopies overlap — "thick trees
    // covering the background" should read as a near-solid wall, not a
    // row of separate, countable trees.
    for (let i = 0; i < 90; i++) {
      out.push({
        bgX:     -1700 + i * 42 + (this._r(i * 9) - 0.5) * 26,
        scale:    0.78 + this._r(i * 13 + 1) * 0.62,
        depthZ:   this._r(i * 23 + 2), // 0 = sits further back (smaller/darker), 1 = further forward
        palette:  ForestBackground.THICK_TREE_PALETTES[i % ForestBackground.THICK_TREE_PALETTES.length],
        seed:     i * 131 + 19,
      });
    }
    // Pre-sorted back-to-front once here (depthZ is static per tree) so
    // draw() doesn't need to re-sort every single frame.
    out.sort((a, b) => a.depthZ - b.depthZ);
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update  (called every frame from sketch-1.js before draw)
  // ─────────────────────────────────────────────────────────────────────────────
  update(cam) {
    for (const lf of this.leaves) {
      lf.y += lf.speed;
      lf.x += lf.drift + Math.sin(frameCount * 0.012 + lf.wobble) * 0.55;
      lf.angle += lf.spin;
      if (lf.y > height + 22) { lf.y = random(-45, -4); lf.x = random(width); }
      if (lf.x < -18)         lf.x = width + 10;
      if (lf.x > width + 18)  lf.x = -10;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw background layers  (called BEFORE the game translate in sketch-1.js)
  // ─────────────────────────────────────────────────────────────────────────────
  draw(cam) {
    push();
    noStroke();

    // ── 1. Sky gradient — bright daylight above, warmer dappled light where
    // it would filter down through a canopy near the horizon ────────────────
    for (let y = 0; y < height; y += 2) {
      const t = y / height;
      stroke(lerp(135, 226, t), lerp(189, 219, t), lerp(220, 178, t));
      strokeWeight(2);
      line(0, y, width, y);
    }
    noStroke();

    // ── 2. Far tree-line silhouettes  (parallax X 0.08, Y 0.04) ──────────────
    // A hazy, low-contrast ridge of distant trees — establishes deep
    // background without competing for attention with the thick mid-canopy.
    const farHorizY = this._sy(height * 0.62, cam.y, this.FY_FAR);

    fill(186, 198, 178);
    rect(0, farHorizY, width, height - farHorizY);

    for (const t of this.farTrees) {
      const sx = this._sx(t.bgX, cam.x, this.FX_FAR);
      const w  = 70 * t.wFrac;
      if (sx + w < -40 || sx - w > width + 40) continue;
      const h = t.hFrac * height;
      this._drawFarTreeBlob(sx, farHorizY, w, h, t.palette, t.seed);
    }

    // Thin atmospheric veil over the whole far tree-line to push it back
    fill(196, 208, 196, 55);
    rect(0, 0, width, farHorizY + 4);

    // ── 3. Forest floor base (sits behind the thick canopy trunks) ───────────
    const floorY = this._sy(height * 0.78, cam.y, this.FY_THICK);
    fill(108, 96, 64);
    rect(0, floorY, width, height - floorY);
    // Mottled ground texture (roots, leaf litter, light patches) scrolling
    // at the same rate as the thick canopy, so the floor isn't a dead flat
    // screen-locked band with nothing on it to show camera motion.
    this._drawFloorTexture(floorY, height - floorY, cam.x, this.FX_THICK, 150);

    // ── 4. Thick mid-canopy forest  (parallax X 0.30, Y 0.14) ────────────────
    // thickTrees is pre-sorted back-to-front by depthZ at generation time
    // (see _genThickTrees), so nearer trunks correctly overlap the ones
    // behind them without re-sorting every frame.
    for (const t of this.thickTrees) {
      const sx = this._sx(t.bgX, cam.x, this.FX_THICK);
      const span = 95 * t.scale;
      if (sx + span < -50 || sx - span > width + 50) continue;
      this._drawThickTree(sx, floorY, t.scale, t.depthZ, t.palette, t.seed);
    }

    pop();
  }

  // ── Scrolling ground texture for the forest floor ──────────────────────────
  // Tiles soft leaf-litter / light-patch marks across the floor band, mapped
  // through the same bgX → screen-X transform as the trees (_sx), so the
  // floor visibly scrolls under the player instead of reading as glued to
  // the screen.
  _drawFloorTexture(baseY, bandH, camX, fx, period) {
    if (bandH <= 0) return;
    const bgLeft  = camX * fx - width / 2;
    const bgRight = camX * fx + width / 2;
    const i0 = Math.floor(bgLeft / period) - 1;
    const i1 = Math.ceil(bgRight / period) + 1;

    for (let i = i0; i <= i1; i++) {
      const bgX = i * period;
      const sx  = this._sx(bgX, camX, fx);
      const rv  = (s) => this._r(i * 41 + s);
      const w   = period * (0.5 + rv(1) * 0.35);
      const h   = Math.min(bandH * 0.7, 8 + rv(2) * 12);
      const cy  = baseY + Math.min(bandH * 0.45, 5 + rv(3) * 12);

      // Dappled light patch (sun filtering through canopy onto the floor)
      fill(168, 152, 96, 70);
      ellipse(sx, cy, w, h);
      // Darker leaf-litter clump beside it for contrast
      fill(72, 60, 38, 90);
      ellipse(sx + w * 0.5, cy + h * 0.35, w * 0.4, h * 0.6);
      // Small twig/root fleck
      fill(50, 40, 24, 110);
      ellipse(sx - w * 0.35, cy - h * 0.2, w * 0.18, h * 0.3);
    }
  }

  // ── Soft, low-detail canopy blob for the distant tree-line — a rounded
  // silhouette with a couple of overlapping lobes, no individual branches.
  // Deliberately simple: it's far away and seen through haze. ───────────────
  _drawFarTreeBlob(cx, gndY, w, h, pal, seed) {
    const rv = (s) => this._r(seed + s);
    fill(pal[0], pal[1], pal[2]);
    const lobes = 3;
    for (let i = 0; i < lobes; i++) {
      const lx = cx + (i - (lobes - 1) / 2) * w * 0.40 + (rv(i * 3) - 0.5) * w * 0.18;
      const lw = w * (0.58 + rv(i * 5 + 1) * 0.28);
      const lh = h * (0.62 + rv(i * 5 + 2) * 0.38);
      const topY = gndY - lh;
      // Soft tapered crown: a triangle-ish polygon with rounded shoulders
      // reads as a treetop far more than a pure ellipse blob does.
      beginShape();
      vertex(lx - lw * 0.5, gndY);
      vertex(lx - lw * 0.5, gndY - lh * 0.45);
      vertex(lx - lw * 0.22, gndY - lh * 0.78);
      vertex(lx, topY);
      vertex(lx + lw * 0.22, gndY - lh * 0.78);
      vertex(lx + lw * 0.5, gndY - lh * 0.45);
      vertex(lx + lw * 0.5, gndY);
      endShape(CLOSE);
    }
    // Slightly lighter highlight lobe (sun from upper-left)
    fill(Math.min(pal[0] + 18, 255), Math.min(pal[1] + 18, 255), Math.min(pal[2] + 14, 255), 130);
    ellipse(cx - w * 0.18, gndY - h * 0.62, w * 0.5, h * 0.4);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw one detailed mid-canopy forest tree — trunk + several rounded
  // overlapping canopy clumps with lit/shadow faces. depthZ darkens/dims
  // trees that sit further back in this same layer for extra depth cueing.
  // ─────────────────────────────────────────────────────────────────────────────
  _drawThickTree(cx, gndY, sc, depthZ, pal, seed) {
    const rv = (s) => this._r(seed + s);
    const [base, lit, shadow] = pal;
    // Trees placed further back in this layer (depthZ near 0) are dimmed
    // and slightly desaturated toward the floor colour, standing in for
    // the ones partly hidden behind closer trunks.
    const dim = lerp(0.62, 1, depthZ);
    const mixB = (c) => Math.round(lerp(150, c, dim));

    push();
    noStroke();

    const lean = (rv(1) - 0.5) * 8 * sc;
    const trunkH  = (38 + rv(2) * 22) * sc;
    const trunkBW = (5.5 + rv(3) * 3.0) * sc;
    const trunkTW = trunkBW * 0.55;

    // ── Trunk ────────────────────────────────────────────────────────────────
    fill(mixB(54), mixB(38), mixB(26));
    beginShape();
    vertex(cx - trunkBW, gndY);
    vertex(cx + trunkBW, gndY);
    vertex(cx + trunkTW + lean * 0.4, gndY - trunkH);
    vertex(cx - trunkTW + lean * 0.4, gndY - trunkH);
    endShape(CLOSE);

    // Lit face (sun upper-left)
    fill(mixB(86), mixB(62), mixB(40), 170);
    beginShape();
    vertex(cx - trunkBW, gndY);
    vertex(cx - trunkBW * 0.15, gndY);
    vertex(cx - trunkTW * 0.15 + lean * 0.4, gndY - trunkH);
    vertex(cx - trunkTW + lean * 0.4, gndY - trunkH);
    endShape(CLOSE);

    // Bark striations
    stroke(mixB(30), mixB(20), mixB(12), 120);
    strokeWeight(0.9);
    for (let g = 0; g < 3; g++) {
      const gx = cx + (rv(10 + g * 3) - 0.5) * trunkBW * 1.3;
      const gyT = gndY - trunkH * (0.4 + rv(11 + g * 3) * 0.5);
      line(gx, gndY - trunkH * 0.06, gx + lean * 0.2, gyT);
    }
    noStroke();

    // A couple of bare branch forks poking out beyond the canopy edge —
    // small detail that sells "tree" rather than "shrub on a stick".
    stroke(mixB(46), mixB(32), mixB(20), 160);
    strokeWeight(1.6 * sc);
    const branchY = gndY - trunkH * 0.92;
    line(cx, branchY, cx - 16 * sc + lean * 0.6, branchY - 14 * sc);
    line(cx, branchY, cx + 14 * sc + lean * 0.6, branchY - 11 * sc);
    noStroke();

    // ── Canopy — 3 to 4 overlapping rounded clumps, not snow-tiered cones ────
    const clumps = 3 + Math.floor(rv(5) * 2);
    const canopyW = (62 + rv(6) * 26) * sc;
    const canopyH = (66 + rv(7) * 24) * sc;
    const topY = gndY - trunkH;

    for (let i = 0; i < clumps; i++) {
      const ang = (i / clumps) * Math.PI * 2 + rv(i * 7 + 20) * 0.8;
      const rad = canopyW * 0.30 * (0.5 + rv(i * 5 + 21) * 0.5);
      const ox = Math.cos(ang) * rad * 0.85 + lean * 0.5;
      const oy = Math.sin(ang) * rad * 0.45 - canopyH * 0.42;
      const cw = canopyW * (0.55 + rv(i * 9 + 22) * 0.35);
      const ch = canopyH * (0.55 + rv(i * 9 + 23) * 0.35);

      fill(mixB(shadow[0]), mixB(shadow[1]), mixB(shadow[2]));
      ellipse(cx + ox, topY + oy, cw, ch);
    }
    // Central main mass, drawn last so it ties the clumps together visually
    fill(mixB(base[0]), mixB(base[1]), mixB(base[2]));
    ellipse(cx + lean * 0.5, topY - canopyH * 0.30, canopyW, canopyH * 0.92);

    // Lit highlight clump (upper-left)
    fill(mixB(lit[0]), mixB(lit[1]), mixB(lit[2]), 200);
    ellipse(cx - canopyW * 0.22 + lean * 0.3, topY - canopyH * 0.46, canopyW * 0.52, canopyH * 0.46);

    // A few darker leaf-clump shadows for texture, kept inside the silhouette
    fill(mixB(shadow[0]), mixB(shadow[1]), mixB(shadow[2]), 110);
    for (let i = 0; i < 4; i++) {
      const sxo = (rv(i * 13 + 30) - 0.5) * canopyW * 0.7;
      const syo = -canopyH * (0.15 + rv(i * 13 + 31) * 0.55);
      ellipse(cx + sxo + lean * 0.4, topY + syo, canopyW * 0.22, canopyH * 0.20);
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

    // ── Drifting leaves — gentle ambient foreground motion, screen-space ────
    for (const lf of this.leaves) {
      push();
      translate(lf.x, lf.y);
      rotate(lf.angle);
      const leafCol = this._lerpRGB([120, 138, 46], [168, 108, 44], lf.tint);
      fill(leafCol[0], leafCol[1], leafCol[2], 215);
      ellipse(0, 0, lf.size, lf.size * 0.62);
      fill(leafCol[0] * 0.8, leafCol[1] * 0.8, leafCol[2] * 0.7, 160);
      ellipse(0, 0, lf.size * 0.3, lf.size * 0.5);
      pop();
    }

    pop();
  }
}
