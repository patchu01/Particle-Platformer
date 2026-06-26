// ─────────────────────────────────────────────────────────────────────────────
// SnowBackground.js
// Parallax snow-mountain background for the Level class.
//
// Layer stack (back → front):
//   Sky gradient              parallax X/Y  0.00
//   Far mountains             parallax X    0.10  Y  0.05
//   Near mountains            parallax X    0.22  Y  0.10
//   Snow-covered pine trees   parallax X    0.35  Y  0.18
//   Stone bridge + levels     parallax X    0.55  Y  0.40
//   Train (on bridge, every 20 s)
//   Smoke particles           screen-space
//   Snowflakes                screen-space  (drawn last, in front of everything)
// ─────────────────────────────────────────────────────────────────────────────

class SnowBackground {
  constructor() {

    // ── Parallax factors ─────────────────────────────────────────────────────
    this.FX_FAR   = 0.10;
    this.FY_FAR   = 0.05;
    this.FX_NEAR  = 0.22;
    this.FY_NEAR  = 0.10;
    this.FX_TREE  = 0.35;
    this.FY_TREE  = 0.18;
    this.FX_BRDG  = 0.55;
    this.FY_BRDG  = 0.40;

    // ── Bridge / level geometry ───────────────────────────────────────────────
    this.ARCH_SPAN   = 215;   // px between arch-pillar centres
    this.PILLAR_W    = 40;    // pillar width
    this.ARCH_H      = 72;    // arch opening height below deck
    this.DECK_H      = 26;    // deck slab thickness
    this.PILLAR_H    = 180;   // pillar total height below deck
    this.TRACK_SEP   = 48;    // visual separation between the two rails


    // ── Screen shake ─────────────────────────────────────────────────────────
    this.shakeIntensity = 0;
    this.MAX_SHAKE      = 7.5;

    // ── Smoke particles ───────────────────────────────────────────────────────
    this.smoke = [];

    // ── Snowflakes ────────────────────────────────────────────────────────────
    this.flakes = this._initFlakes();

    // ── Pre-generate deterministic terrain ───────────────────────────────────
    this.farMtns  = this._genFarMtns();
    this.nearMtns = this._genNearMtns();
    this.trees    = this._genTrees();

    // Cached bridge screen-Y (set each draw; used in update)
    this._brgScrY = height * 0.82;
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

  // ── Bridge screen-Y (vertical parallax with camera height) ────────────────
  // When the player is high (cam.y small), bridge moves toward bottom of screen.
  _bridgeScreenY(cam) {
    const defaultY = height * 0.82;
    return defaultY + (height / 2 - cam.y) * this.FY_BRDG;
  }

  // ── Generic screen-Y with vertical parallax based on camera Y position ─────
  _sy(defaultY, camY, fy) {
    return defaultY + (height / 2 - camY) * fy;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _initFlakes() {
    const flakes = [];
    for (let i = 0; i < 210; i++) {
      flakes.push({
        x:       this._r(i * 3)       * (windowWidth  + 40) - 20,
        y:       this._r(i * 3 + 1)   * (windowHeight * 0.9 + 60) - 30,
        size:    1.8 + this._r(i * 3 + 2) * 6.8,
        speed:   0.6 + this._r(i * 5 + 3) * 2.1,
        drift:   (this._r(i * 7 + 1) - 0.5) * 0.95,
        wobble:  this._r(i * 11) * Math.PI * 2,
        alpha:   135 + this._r(i * 13) * 120,
        crystal: this._r(i * 17) > 0.60,
      });
    }
    return flakes;
  }

  // Japanese-ridgeline rock palettes — each a [base, lit, shadow] RGB triple.
  // Mixes cool blue-grey alpine stone with warmer brown-violet volcanic rock,
  // the way distant Japanese ranges (Hida/Kiso, Fuji foothills) layer in haze.
  static FAR_ROCK_PALETTES = [
    [[ 96, 110, 132], [118, 132, 154], [ 70,  83, 104]], // cool slate-blue
    [[104, 100, 118], [128, 124, 142], [ 78,  74,  92]], // muted violet-grey
    [[112,  99,  92], [136, 123, 114], [ 84,  72,  66]], // warm ash-brown
    [[ 90, 108, 120], [112, 130, 142], [ 64,  82,  94]], // teal-grey stone
    [[118, 104,  98], [142, 128, 120], [ 90,  76,  70]], // rust-tinged rock
  ];
  static NEAR_ROCK_PALETTES = [
    [[ 58,  72,  96], [ 80,  96, 118], [ 36,  48,  68]], // deep cobalt slate
    [[ 70,  64,  82], [ 94,  88, 106], [ 46,  40,  58]], // plum-grey granite
    [[ 76,  60,  54], [100,  82,  74], [ 50,  36,  32]], // volcanic umber
    [[ 54,  78,  80], [ 76, 100, 102], [ 32,  54,  56]], // pine-shadow teal
    [[ 82,  68,  60], [106,  90,  80], [ 56,  44,  38]], // weathered brown-rock
  ];

  _genFarMtns() {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const isFuji = (i === 7 || i === 17); // a couple of broad iconic cones in the range
      out.push({
        bgX:       -1800 + i * 310 + (this._r(i * 5)     - 0.5) * 110,
        hFrac:      0.19 + this._r(i * 7)     * 0.20,
        w:           260 + this._r(i * 11)    * 190,
        snowRatio:  0.34 + this._r(i * 13)    * 0.26,
        palette:    SnowBackground.FAR_ROCK_PALETTES[i % SnowBackground.FAR_ROCK_PALETTES.length],
        jagSeed:    i * 31 + 4,
        ridgeSeed:  i * 53 + 17,
        snowSeed:   i * 71 + 9,
        fuji:       isFuji,
      });
    }
    return out;
  }

  _genNearMtns() {
    const out = [];
    for (let i = 0; i < 24; i++) {
      out.push({
        bgX:       -1500 + i * 265 + (this._r(i * 3 + 1) - 0.5) * 85,
        hFrac:      0.13 + this._r(i * 9)     * 0.16,
        w:           185 + this._r(i * 7 + 2) * 150,
        snowRatio:  0.42 + this._r(i * 5 + 3) * 0.32,
        palette:    SnowBackground.NEAR_ROCK_PALETTES[i % SnowBackground.NEAR_ROCK_PALETTES.length],
        jagSeed:    i * 37 + 11,
        ridgeSeed:  i * 59 + 23,
        snowSeed:   i * 79 + 13,
      });
    }
    return out;
  }

  _genTrees() {
    const out = [];
    for (let i = 0; i < 35; i++) {
      out.push({
        bgX:   -1200 + i * 190 + (this._r(i * 17) - 0.5) * 65,
        scale:  0.60 + this._r(i * 19 + 1) * 0.75,
        seed:   i * 117 + 200,   // stable per-tree variation seed
      });
    }
    return out;
  }

  // ── Build a jagged ridgeline silhouette for one mountain ──────────────────
  // Returns an array of {x, y} points from left-base → ...ridge... → right-base,
  // all relative to (0,0) = left-base-on-horizon. y is negative (upward).
  // `fuji` flattens the jaggedness near the apex into one clean broad cone.
  _buildRidge(w, peakH, seed, fuji) {
    const pts = [];
    pts.push({ x: 0, y: 0 });

    if (fuji) {
      // Broad, gently concave volcanic cone — Fuji's signature silhouette.
      const apex = w * (0.46 + this._r(seed + 1) * 0.08);
      pts.push({ x: apex * 0.18, y: -peakH * 0.30 });
      pts.push({ x: apex * 0.46, y: -peakH * 0.74 });
      pts.push({ x: apex,        y: -peakH });
      pts.push({ x: apex + (w - apex) * 0.50, y: -peakH * 0.68 });
      pts.push({ x: apex + (w - apex) * 0.80, y: -peakH * 0.27 });
      pts.push({ x: w, y: 0 });
      return pts;
    }

    // Craggy alpine ridge: walk left→right at FIXED x steps (so the line
    // never doubles back), height following a peak-shaped envelope plus
    // mild local jitter — reads as one jagged mountain, not noise.
    const segs = 13; // fixed step count keeps spacing predictable & smooth
    const apexFrac = 0.34 + this._r(seed + 2) * 0.32; // where the tallest point sits
    let prevH = 0;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const envelope = t < apexFrac
        ? Math.pow(t / apexFrac, 0.75)
        : Math.pow((1 - t) / (1 - apexFrac), 0.85);
      // Local jitter is damped near the base (t≈0/1) so flanks meet the
      // horizon cleanly, and limited in delta from the previous point so
      // the silhouette can't whipsaw into spikes.
      const damp = Math.sin(Math.PI * t); // 0 at edges, 1 at mid
      const jaggle = (this._r(seed + s * 13) - 0.5) * 0.22 * damp;
      let localH = Math.max(0, envelope + jaggle) * peakH;
      // Clamp how much height can jump between adjacent points.
      const maxStep = peakH * 0.30;
      localH = Math.max(prevH - maxStep, Math.min(prevH + maxStep, localH));
      prevH = localH;
      const x = t * w; // fixed spacing — guarantees monotonic, even steps
      pts.push({ x, y: -localH });
    }
    pts.push({ x: w, y: 0 });
    return pts;
  }

  // ── Sample ridge height (positive number) at any x via interpolation ─────
  _ridgeHeightAt(ridge, x) {
    for (let i = 0; i < ridge.length - 1; i++) {
      if (x >= ridge[i].x && x <= ridge[i + 1].x) {
        const span = Math.max(1e-6, ridge[i + 1].x - ridge[i].x);
        const t = (x - ridge[i].x) / span;
        return -(ridge[i].y + (ridge[i + 1].y - ridge[i].y) * t);
      }
    }
    return 0;
  }

  // ── Draw atmospheric haze clipped to the mountain's own silhouette ───────
  // Walks the ridge in fixed x-steps and, for each thin vertical strip,
  // fills only from the rock's local top down by `hazeDepth`, so haze never
  // spills into the open sky around a jagged peak the way a bounding-box
  // rectangle would.
  _drawSilhouetteHaze(sx, baseY, w, ridge, peakH, baseCol, maxAlpha) {
    const cols = 40;
    const hazeDepth = peakH * 0.55; // how far down from each column's peak the haze reaches
    for (let i = 0; i < cols; i++) {
      const t0 = i / cols, t1 = (i + 1) / cols;
      const xMid = ((t0 + t1) / 2) * w;
      const localH = this._ridgeHeightAt(ridge, xMid);
      if (localH < 3) continue;
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const f = s / steps;
        const a = maxAlpha * (1 - f); // strongest right at the peak, fading down
        fill(baseCol[0], baseCol[1], baseCol[2], a);
        const stripTop = localH - (localH * Math.min(1, hazeDepth / peakH)) * (f);
        const stripBot = localH - (localH * Math.min(1, hazeDepth / peakH)) * (f + 1 / steps);
        rect(sx + t0 * w, baseY - stripTop, (t1 - t0) * w + 0.5, stripTop - stripBot + 0.5);
      }
    }
  }

  // ── Draw one textured, lifelike mountain at screen position (sx, baseY) ──
  // pal = [base, lit, shadow] RGB triples. ridge = array from _buildRidge.
  _drawMountainBody(sx, baseY, w, ridge, pal, shadeBias) {
    const [base, lit, shadow] = pal;

    let apexI = 0;
    for (let i = 1; i < ridge.length; i++) if (ridge[i].y < ridge[apexI].y) apexI = i;
    const apexX = ridge[apexI].x;

    // ── Base rock fill (shadow side) — full silhouette ─────────────────────
    fill(shadow[0], shadow[1], shadow[2]);
    beginShape();
    for (const p of ridge) vertex(sx + p.x, baseY + p.y);
    endShape(CLOSE);

    // ── Lit face — sun from upper-left, so the left flank up to the apex is bright
    fill(lit[0], lit[1], lit[2], 235);
    beginShape();
    vertex(sx, baseY);
    for (const p of ridge) { if (p.x <= apexX) vertex(sx + p.x, baseY + p.y); }
    vertex(sx + apexX, baseY + ridge[apexI].y);
    endShape();

    // ── Rock striations: vertical erosion grooves down the lit face ────────
    stroke(shadow[0], shadow[1], shadow[2], 130);
    strokeWeight(1.4);
    noFill();
    const grooves = 7 + Math.floor(this._r(shadeBias + 3) * 5);
    for (let g = 0; g < grooves; g++) {
      const gx = w * (0.05 + this._r(shadeBias + g * 9) * 0.90);
      const topY = -this._ridgeHeightAt(ridge, gx);
      if (topY > -8) continue; // skip grooves on near-flat ground
      const startFrac = 0.08 + this._r(shadeBias + g * 5) * 0.10;
      const grooveLen = (-topY) * (0.50 + this._r(shadeBias + g * 5) * 0.38);
      const wobble = (this._r(shadeBias + g * 17) - 0.5) * 7;
      const y0 = topY * startFrac;
      const y1 = y0 + grooveLen;
      line(sx + gx, baseY + y0, sx + gx + wobble, baseY + Math.min(y1, -1));
      // A second, finer companion line beside the main groove for depth.
      stroke(lit[0], lit[1], lit[2], 70);
      strokeWeight(0.9);
      line(sx + gx + 2.2, baseY + y0 + 2, sx + gx + wobble + 2.2, baseY + Math.min(y1, -1) + 2);
      stroke(shadow[0], shadow[1], shadow[2], 130);
      strokeWeight(1.4);
    }
    noStroke();

    // ── Facet shading: small triangular rock-plane patches at varying tone,
    // breaking up flat color fields so the face reads as faceted stone
    // rather than one smooth gradient. Clipped to each column's local
    // ridge height so patches never poke above the silhouette.
    const facets = 10 + Math.floor(this._r(shadeBias + 61) * 6);
    for (let fI = 0; fI < facets; fI++) {
      const fx = w * this._r(shadeBias + fI * 14 + 5);
      const localH = this._ridgeHeightAt(ridge, fx);
      if (localH < 14) continue;
      const fy = -localH * (0.15 + this._r(shadeBias + fI * 7 + 2) * 0.7);
      const fSize = 9 + this._r(shadeBias + fI * 11 + 3) * 16;
      const darker = this._r(shadeBias + fI * 5) > 0.5;
      const tone = darker ? shadow : lit;
      const toneA = darker ? 55 : 45;
      fill(tone[0], tone[1], tone[2], toneA);
      triangle(
        sx + fx, baseY + fy,
        sx + fx + fSize, baseY + fy + fSize * 0.6,
        sx + fx - fSize * 0.5, baseY + fy + fSize
      );
    }

    // ── Subtle horizontal strata bands (sedimentary layering) ──────────────
    // Each band is built as a short polyline that hugs the ridge's actual
    // width at that height (sampled per-column), never spanning past rock
    // into open sky the way a full-width rect would on a jagged silhouette.
    fill(shadow[0], shadow[1], shadow[2], 38);
    const bands = 2 + Math.floor(this._r(shadeBias + 41) * 2);
    const peakH = -ridge[apexI].y;
    for (let b = 0; b < bands; b++) {
      const frac = 0.28 + (b / bands) * 0.55 + this._r(shadeBias + b * 6) * 0.06;
      const bandY = -peakH * frac;
      // Find every x where the ridge height crosses this band's height,
      // and fill only the spans where the rock is actually present.
      const cols = 24;
      for (let c = 0; c < cols; c++) {
        const cx0 = (c / cols) * w, cx1 = ((c + 1) / cols) * w;
        const h0 = this._ridgeHeightAt(ridge, cx0);
        const h1 = this._ridgeHeightAt(ridge, cx1);
        if (-bandY > Math.max(h0, h1)) continue; // band is above the rock here — skip
        rect(sx + cx0, baseY + bandY, cx1 - cx0 + 0.5, 2.2);
      }
    }

    // ── Soft ambient-occlusion wash on the shadow (right) side of the apex ──
    // Re-fills just the shadow-side portion of the ridge polygon itself
    // (apex → right base, closed along the baseline), so the wash can never
    // extend beyond the mountain's own silhouette into the sky.
    fill(shadow[0], shadow[1], shadow[2], 55);
    beginShape();
    vertex(sx + apexX, baseY + ridge[apexI].y);
    for (const p of ridge) { if (p.x >= apexX) vertex(sx + p.x, baseY + p.y); }
    vertex(sx + w, baseY);
    endShape(CLOSE);
  }

  // ── Draw snow clinging unevenly to upper slopes, following ridge terrain ─
  // Uses a smooth undulating snowline (sum of a couple sine waves, seeded)
  // instead of independent random points, so the boundary always reads as
  // one continuous, naturally wavy edge with no spiky artifacts.
  _drawMountainSnow(sx, baseY, w, ridge, snowRatio, snowFillCol, snowShadow, snowSeed) {
    let apexI = 0;
    for (let i = 1; i < ridge.length; i++) if (ridge[i].y < ridge[apexI].y) apexI = i;
    const peakH = -ridge[apexI].y;
    if (peakH < 4) return;
    const baseSnowH = peakH * snowRatio; // how far down from the peak snow generally reaches

    const ph1 = this._r(snowSeed) * Math.PI * 2;
    const ph2 = this._r(snowSeed + 1) * Math.PI * 2;
    const freq1 = 2.2 + this._r(snowSeed + 2) * 1.6;
    const freq2 = 4.5 + this._r(snowSeed + 3) * 2.5;

    // Smooth per-x snow boundary height (distance below the ridge at that x,
    // measuring down from THAT column's own terrain height — so snow levels
    // gullies and ridges rather than a flat world-space line).
    const snowDepthAt = (t) => {
      const wave = Math.sin(t * Math.PI * freq1 + ph1) * 0.5
                 + Math.sin(t * Math.PI * freq2 + ph2) * 0.22;
      return Math.max(2, baseSnowH * (0.62 + wave * 0.38));
    };

    fill(snowFillCol);
    beginShape();
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = t * w;
      const terrainH = this._ridgeHeightAt(ridge, x);
      const depth = snowDepthAt(t);
      const snowTopH = Math.min(terrainH, peakH); // can't poke above the rock
      const snowBotH = Math.max(0, terrainH - depth);
      if (snowTopH <= snowBotH) continue; // this column has no snow (too low)
      // We only need the upper boundary; the lower boundary is built on the
      // way back (right→left) so the whole thing closes as one clean loop.
      vertex(sx + x, baseY - snowTopH);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N;
      const x = t * w;
      const terrainH = this._ridgeHeightAt(ridge, x);
      const depth = snowDepthAt(t);
      const snowBotH = Math.max(0, terrainH - depth);
      vertex(sx + x, baseY - snowBotH);
    }
    endShape(CLOSE);

    // ── Streak shadows: subtle darker-white slivers marking gully folds ────
    fill(snowShadow[0], snowShadow[1], snowShadow[2], 140);
    const streaks = 3 + Math.floor(this._r(snowSeed + 9) * 3);
    for (let s = 0; s < streaks; s++) {
      const t = (s + 0.5) / streaks;
      const x = t * w;
      const terrainH = this._ridgeHeightAt(ridge, x);
      const depth = snowDepthAt(t);
      const snowTopH = Math.min(terrainH, peakH);
      const snowBotH = Math.max(0, terrainH - depth);
      if (snowTopH - snowBotH < 8) continue;
      const sw = (w / streaks) * 0.16;
      rect(sx + x - sw / 2, baseY - snowTopH + (snowTopH - snowBotH) * 0.15, sw, (snowTopH - snowBotH) * 0.7);
    }

    // Bright rim-light right at the topmost snow edge (catches the sun).
    let apexI2 = 0;
    for (let i = 1; i < ridge.length; i++) if (ridge[i].y < ridge[apexI2].y) apexI2 = i;
    fill(255, 255, 255, 150);
    ellipse(sx + ridge[apexI2].x, baseY + ridge[apexI2].y, 6, 5);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update  (called every frame from sketch-1.js before draw)
  // ─────────────────────────────────────────────────────────────────────────────
  update(cam) {
    this.shakeIntensity = Math.max(0, this.shakeIntensity - 1.4);

    // ── Smoke particles ───────────────────────────────────────────────────────
    for (const s of this.smoke) {
      s.x += s.vx + (Math.random() - 0.5) * 0.12;
      s.y += s.vy;
      s.a -= 3.5;
      s.r += 0.38;
    }
    this.smoke = this.smoke.filter(s => s.a > 0);

    // ── Snowflakes ────────────────────────────────────────────────────────────
    for (const fl of this.flakes) {
      fl.y += fl.speed;
      fl.x += fl.drift + Math.sin(frameCount * 0.013 + fl.wobble) * 0.42;
      if (fl.y > height + 22) { fl.y = random(-45, -4); fl.x = random(width); }
      if (fl.x < -18)          fl.x = width  + 10;
      if (fl.x > width + 18)   fl.x = -10;
    }
  }

  // ── Scrolling snow-drift texture for a flat ground band ───────────────────
  // Tiles a repeating set of soft dune/footprint-like shapes across a ground
  // band, mapped through the SAME bgX → screen-X parallax transform used by
  // every other layer (_sx). Without this, a flat-colour ground rect carries
  // no visual landmarks, so even though it's "in the world" it reads as
  // glued to the screen when the camera pans — there's nothing on it whose
  // position could be seen to change. period = spacing between drift crests
  // in bg-world px; rowSeed keeps the two ground bands looking different.
  _drawSnowDrifts(baseY, bandH, camX, fx, period, rowSeed) {
    if (bandH <= 0) return;
    const bgLeft  = camX * fx - width / 2;
    const bgRight = camX * fx + width / 2;
    const i0 = Math.floor(bgLeft / period) - 1;
    const i1 = Math.ceil(bgRight / period) + 1;

    for (let i = i0; i <= i1; i++) {
      const bgX   = i * period;
      const sx    = this._sx(bgX, camX, fx);
      const rv    = (s) => this._r(rowSeed * 997 + i * 31 + s);
      const driftW = period * (0.55 + rv(1) * 0.3);
      const driftH = Math.min(bandH * 0.85, 10 + rv(2) * 16);
      const cy     = baseY + Math.min(bandH * 0.4, 6 + rv(3) * 10);

      // Soft raised drift — a low, wide ellipse that catches a faint highlight
      // on its sun-facing side, so it has visible shading, not just an outline.
      fill(255, 255, 255, 90);
      ellipse(sx, cy, driftW, driftH);
      fill(170, 190, 215, 70);
      ellipse(sx + driftW * 0.16, cy + driftH * 0.18, driftW * 0.7, driftH * 0.55);
      fill(255, 255, 255, 130);
      ellipse(sx - driftW * 0.18, cy - driftH * 0.12, driftW * 0.34, driftH * 0.4);

      // A couple of small wind-scoured shadow flecks beside the drift
      fill(165, 185, 210, 55);
      ellipse(sx + driftW * 0.55, cy + driftH * 0.3, driftW * 0.22, driftH * 0.3);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw background layers  (called BEFORE the game translate in sketch-1.js)
  // ─────────────────────────────────────────────────────────────────────────────
  draw(cam) {
    push();
    noStroke();

    // ── 1. Sky gradient ───────────────────────────────────────────────────────
    for (let y = 0; y < height; y += 2) {
      const t = y / height;
      stroke(lerp(78, 182, t), lerp(114, 207, t), lerp(165, 228, t));
      strokeWeight(2);
      line(0, y, width, y);
    }
    // Soft haze band near horizon
    noStroke();
    for (let y = height * 0.65; y < height * 0.80; y++) {
      const t2 = (y - height * 0.65) / (height * 0.15);
      stroke(208, 222, 238, t2 * 42);
      line(0, y, width, y);
    }
    noStroke();

    // ── 2. Far mountains  (parallax X 0.10, Y 0.05) ───────────────────────────
    const horizY = this._sy(height * 0.81, cam.y, this.FY_FAR);

    // Snow plain at far horizon
    fill(204, 220, 240);
    rect(0, horizY, width, height - horizY);

    for (const m of this.farMtns) {
      const sx = this._sx(m.bgX, cam.x, this.FX_FAR);
      if (sx + m.w < -80 || sx > width + 80) continue;

      const mH    = m.hFrac * height;
      const ridge = this._buildRidge(m.w, mH, m.jagSeed, m.fuji);

      this._drawMountainBody(sx, horizY, m.w, ridge, m.palette, m.ridgeSeed);
      this._drawMountainSnow(
        sx, horizY, m.w, ridge, m.snowRatio,
        color(222, 235, 248, 235), [200, 218, 238], m.snowSeed
      );

      // Atmospheric haze — distant peaks recede into pale blue-grey mist,
      // clipped to the rock's own silhouette so it never bleeds into sky.
      this._drawSilhouetteHaze(sx, horizY, m.w, ridge, mH, [204, 220, 240], 70);
    }

    // ── 3. Near mountains  (parallax X 0.22, Y 0.10) ─────────────────────────
    const nearHorizY = this._sy(height * 0.76, cam.y, this.FY_NEAR);

    fill(196, 213, 232);
    rect(0, nearHorizY, width, horizY - nearHorizY);

    for (const m of this.nearMtns) {
      const sx = this._sx(m.bgX, cam.x, this.FX_NEAR);
      if (sx + m.w < -80 || sx > width + 80) continue;

      const mH    = m.hFrac * height;
      const ridge = this._buildRidge(m.w, mH, m.jagSeed, false);

      this._drawMountainBody(sx, nearHorizY, m.w, ridge, m.palette, m.ridgeSeed);
      this._drawMountainSnow(
        sx, nearHorizY, m.w, ridge, m.snowRatio,
        color(232, 243, 253, 245), [214, 230, 248], m.snowSeed
      );

      // Lighter haze than far range — near mountains stay crisper, still
      // clipped to the rock silhouette rather than a bounding box.
      this._drawSilhouetteHaze(sx, nearHorizY, m.w, ridge, mH, [196, 213, 232], 42);
    }

    // Snow ground below near mountains — base fill plus drifts that scroll
    // with the near-mountain parallax layer, so the band isn't a dead flat
    // screen-locked rect.
    fill(200, 217, 235);
    rect(0, nearHorizY, width, height - nearHorizY);
    this._drawSnowDrifts(nearHorizY, height - nearHorizY, cam.x, this.FX_NEAR, 340, 1);

    // ── 4. Snow-covered pine trees  (parallax X 0.35, Y 0.18) ────────────────
    const treeGndY = this._sy(height * 0.72, cam.y, this.FY_TREE);

    fill(194, 210, 229);
    rect(0, treeGndY, width, height - treeGndY);
    // Foreground snow texture — this band sits closest to the player, so it
    // needs the most visible motion cue as the camera moves horizontally.
    this._drawSnowDrifts(treeGndY, height - treeGndY, cam.x, this.FX_TREE, 210, 2);

    for (const t of this.trees) {
      const sx = this._sx(t.bgX, cam.x, this.FX_TREE);
      if (sx + 90 * t.scale < -40 || sx - 90 * t.scale > width + 40) continue;
      this._drawTree(sx, treeGndY, t.scale, t.seed);
    }

    // ── 5. Bridge  (parallax X 0.55, Y 0.40) ─────────────────────────────────
    const bY = this._bridgeScreenY(cam);
    this._brgScrY = bY;  // cache for update()

    if (bY > 5 && bY < height + 60) {
      this._drawBridge(bY, cam);

      // Smoke particles (screen-space, so no coordinate transform needed)
      noStroke();
      for (const s of this.smoke) {
        fill(190, 193, 198, s.a);
        ellipse(s.x, s.y, s.r);
        fill(208, 210, 214, s.a * 0.38);
        ellipse(s.x, s.y, s.r * 1.65);
      }
    }

    pop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw a realistic snow-covered Japanese pine tree
  // Each tree uses a stable seed for consistent appearance as it scrolls.
  // ─────────────────────────────────────────────────────────────────────────────
  _drawTree(cx, gndY, sc, treeSeed) {
    push();
    noStroke();

    // Per-tree deterministic variation (uses stable seed, NOT screen-X)
    const rv = (s) => this._r(treeSeed + s);

    // Subtle wind lean — horizontal drift at full canopy height
    const lean = (rv(1) - 0.5) * 10 * sc;

    // ── Trunk ────────────────────────────────────────────────────────────────
    const trunkH  = (24 + rv(2) * 12) * sc;
    const trunkBW = (5.0 + rv(3) * 2.0) * sc;   // base half-width
    const trunkTW = trunkBW * 0.40;               // top  half-width (tapered)

    // Dark trunk body (trapezoid — wider at base)
    fill(52, 32, 12);
    beginShape();
    vertex(cx - trunkBW,                    gndY);
    vertex(cx + trunkBW,                    gndY);
    vertex(cx + trunkTW + lean * 0.35,      gndY - trunkH);
    vertex(cx - trunkTW + lean * 0.35,      gndY - trunkH);
    endShape(CLOSE);

    // Sun-lit left face
    fill(88, 58, 24, 165);
    beginShape();
    vertex(cx - trunkBW,                        gndY);
    vertex(cx - trunkBW * 0.18,                 gndY);
    vertex(cx - trunkTW * 0.18 + lean * 0.35,   gndY - trunkH);
    vertex(cx - trunkTW         + lean * 0.35,   gndY - trunkH);
    endShape(CLOSE);

    // Bark striations (vertical grooves)
    stroke(36, 20, 6, 125);
    strokeWeight(0.8);
    for (let g = 0; g < 3; g++) {
      const gx  = cx + (rv(10 + g * 3) - 0.5) * trunkBW * 1.3;
      const gyT = gndY - trunkH * (0.42 + rv(11 + g * 3) * 0.48);
      line(gx, gndY - trunkH * 0.08, gx + lean * 0.2, gyT);
    }
    noStroke();

    // ── Canopy tiers ─────────────────────────────────────────────────────────
    // 5–6 overlapping layers, each drawn as a 7-point polygon so branch tips
    // droop naturally under snow weight instead of snapping to a clean triangle.
    const numTiers = 5 + Math.floor(rv(5) * 2);   // 5 or 6
    const canopyH  = (85 + rv(6) * 22) * sc;

    // Per-tree colour tint: cool blue-green ↔ warmer olive-green
    const warmth = rv(7);
    const nR = Math.round(12 + warmth * 12);   // needle shadow R
    const nG = Math.round(46 + warmth * 18);   // needle shadow G
    const nB = Math.round(20 + warmth * 10);   // needle shadow B
    const lR = Math.round(25 + warmth * 18);   // lit face R
    const lG = Math.round(66 + warmth * 24);   // lit face G
    const lB = Math.round(32 + warmth * 14);   // lit face B

    for (let i = 0; i < numTiers; i++) {
      const tFrac  = i       / numTiers;
      const tFrac1 = (i + 1) / numTiers;

      const leanOff = lean * tFrac * 0.55;
      const mx      = cx + leanOff;            // centre shifts with lean

      const botY  = gndY - trunkH - tFrac  * canopyH;
      const topY  = gndY - trunkH - tFrac1 * canopyH;
      const tierH = botY - topY;               // positive

      // Half-widths (slight L/R asymmetry per tier)
      const baseHW = (34 - tFrac * 23) * sc;
      const hwL    = baseHW * (0.90 + rv(i * 11 + 20) * 0.20);
      const hwR    = baseHW * (0.90 + rv(i * 11 + 21) * 0.20);

      // Branch-tip droop — branches sag under accumulated snow
      const dropL = (2.0 + rv(i * 7 + 30) * 5.0) * sc;
      const dropR = (2.0 + rv(i * 7 + 31) * 5.0) * sc;

      // ── Needle body (7-point polygon — organic, not a flat triangle) ────────
      fill(nR, nG, nB);
      beginShape();
      vertex(mx - hwL,        botY + dropL);        // left tip  (drooped)
      vertex(mx - hwL * 0.55, botY - tierH * 0.07); // left shoulder
      vertex(mx,              topY);                 // apex
      vertex(mx + hwR * 0.55, botY - tierH * 0.07); // right shoulder
      vertex(mx + hwR,        botY + dropR);         // right tip (drooped)
      vertex(mx + hwR * 0.62, botY - tierH * 0.12); // right inner
      vertex(mx - hwL * 0.62, botY - tierH * 0.12); // left inner
      endShape(CLOSE);

      // ── Lit inner face (sunlight from upper-left) ────────────────────────
      fill(lR, lG, lB, 195);
      const iHW   = (hwL + hwR) * 0.5 * 0.48;
      const ibotY = botY - tierH * 0.22;
      triangle(mx - iHW, ibotY, mx + iHW * 0.72, ibotY, mx, topY + tierH * 0.05);

      // ── Snow accumulation (irregular polygon — not a smooth triangle) ───────
      const snHW   = (hwL + hwR) * 0.5 * 0.73;
      const snBotY = botY - tierH * 0.37;
      const snTopY = topY + tierH * 0.04;

      fill(228, 242, 254, 215);
      beginShape();
      vertex(mx,                              snTopY);
      vertex(mx - snHW * 0.30,               snTopY + tierH * 0.22);
      vertex(mx - snHW * 0.68,               snBotY + rv(i * 31)       * 3.5 * sc);
      vertex(mx - snHW,                       snBotY);
      vertex(mx - snHW * 0.82,               snBotY + (3 + rv(i * 37) * 5.0) * sc);
      vertex(mx,                              snBotY + (1 + rv(i * 41) * 2.5) * sc);
      vertex(mx + snHW * 0.80,               snBotY + (3 + rv(i * 47) * 5.0) * sc);
      vertex(mx + snHW,                       snBotY);
      vertex(mx + snHW * 0.66,               snBotY + rv(i * 53)       * 3.5 * sc);
      vertex(mx + snHW * 0.29,               snTopY + tierH * 0.20);
      endShape(CLOSE);

      // Bright highlight at snow-cap apex (catches direct sun)
      fill(252, 255, 255, 160);
      ellipse(mx + lean * tFrac * 0.12, snTopY + tierH * 0.08, snHW * 0.22, tierH * 0.13);


    }

    pop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw the stone bridge with arches, railing, and snow
  // ─────────────────────────────────────────────────────────────────────────────
  _drawBridge(bY, cam) {
    const f   = this.FX_BRDG;
    const sp  = this.ARCH_SPAN;
    const pw  = this.PILLAR_W;
    const ah  = this.ARCH_H;
    const dh  = this.DECK_H;
    const ph  = this.PILLAR_H;

    // Sun from upper-left, same convention as _drawMountainBody — the left
    // face of every pillar/voussoir reads lit, the right face shadow.
    const stoneBase  = [150, 138, 124];   // weathered granite, slightly warm
    const stoneLight = [180, 168, 152];   // sun-struck face
    const stoneDark  = [104,  94,  82];   // shadow face / mortar recess
    const stoneDeep  = [ 74,  66,  58];   // deepest recess (under arch, AO)
    const mossCol    = [104, 116,  86];   // damp moss/lichen staining, low on piers
    const snowCol    = [226, 238, 251];

    // Determine which arch indices span the screen
    const bgLeft = cam.x * f - width / 2;
    const bgRght = cam.x * f + width / 2;
    const i0 = Math.floor(bgLeft / sp) - 1;
    const i1 = Math.ceil (bgRght / sp) + 1;

    noStroke();

    // Sky/ground colour the arch openings reveal, sampled at this depth so
    // the "view through" the arch matches the actual background gradient.
    const skyT  = constrain(bY / height, 0, 1);
    const skyR  = lerp(78,  182, skyT);
    const skyG  = lerp(114, 207, skyT);
    const skyB  = lerp(165, 228, skyT);
    const gndR  = lerp(skyR, 200, 0.55);
    const gndG  = lerp(skyG, 217, 0.55);
    const gndB  = lerp(skyB, 235, 0.55);

    // ── Base footing — wider stone plinth the piers rise from ────────────────
    // Real masonry piers flare out at the waterline/ground into a broader
    // footing to spread load; without this the piers look like they're
    // floating columns rather than load-bearing structure.
    fill(stoneDeep[0], stoneDeep[1], stoneDeep[2]);
    rect(0, bY + ph - 14, width, 34);

    // ── Full pier wall below the deck (base coat) ────────────────────────────
    fill(stoneBase[0], stoneBase[1], stoneBase[2]);
    rect(0, bY, width, ph + 20);

    // ── Per-column vertical light/shadow gradient on the wall face ──────────
    // Breaks up the flat fill into a soft left-lit / right-shadow sweep so
    // the masonry reads as a curved/weathered surface, not a paint swatch.
    for (let i = i0; i <= i1; i++) {
      const sx = this._sx(i * sp, cam.x, f);
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const t = b / (bands - 1);           // 0 left .. 1 right across one span
        const shade = Math.sin(t * Math.PI); // brightest mid-left, darker at both edges
        const rr = lerp(stoneDark[0], stoneLight[0], 0.25 + shade * 0.5);
        const gg = lerp(stoneDark[1], stoneLight[1], 0.25 + shade * 0.5);
        const bb = lerp(stoneDark[2], stoneLight[2], 0.25 + shade * 0.5);
        fill(rr, gg, bb, 70);
        rect(sx + (t * sp) - sp / (bands * 1.6), bY, sp / (bands * 0.85), ph + 20);
      }
    }

    // ── Arch openings: AO-shaded reveal, not a flat colour block ─────────────
    for (let i = i0; i <= i1; i++) {
      const pillarScrX = this._sx(i * sp, cam.x, f);
      const openX = pillarScrX + pw;
      const openW = sp - pw;
      const midX  = openX + openW / 2;
      const archTopY  = bY + 2;
      const archCurH  = ah * 0.38;
      const rectTopY  = bY + archCurH;
      const rectH     = (bY + ah) - rectTopY + 2;

      // Rectangular lower body of the opening (the "through" view)
      fill(gndR, gndG, gndB);
      rect(openX, rectTopY, openW, rectH);

      // Rounded arch ceiling — half-ellipse gradient from sky → ground
      for (let row = 0; row < archCurH; row++) {
        const t2 = row / archCurH;
        const rr = lerp(skyR, gndR, t2);
        const gg = lerp(skyG, gndG, t2);
        const bb = lerp(skyB, gndB, t2);
        const hw = openW / 2 * Math.sqrt(Math.max(0, 1 - ((row / archCurH) ** 2)));
        stroke(rr, gg, bb);
        strokeWeight(1);
        line(midX - hw, archTopY + row, midX + hw, archTopY + row);
      }
      noStroke();

      // Ambient-occlusion: the underside of the arch and the corners where
      // reveal meets wall sit in shadow — darken a soft band hugging the
      // inside edge of the whole opening (top curve + both side walls).
      fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 95);
      // top curve AO sliver
      for (let row = 0; row < archCurH * 0.4; row++) {
        const hw = openW / 2 * Math.sqrt(Math.max(0, 1 - ((row / archCurH) ** 2)));
        rect(midX - hw, archTopY + row, 5, 2);
        rect(midX + hw - 5, archTopY + row, 5, 2);
      }
      rect(openX, rectTopY, 6, rectH);              // left reveal shadow
      rect(openX + openW - 6, rectTopY, 6, rectH);  // right reveal shadow
      // Faint cool bounce-light at the base of the opening (sky reflecting up)
      fill(gndR + 10, gndG + 10, gndB + 6, 70);
      rect(openX + 8, bY + ah - 7, openW - 16, 7);
    }

    // ── Stone voussoir ring around each arch (individual wedge blocks) ───────
    // Traces the SAME half-ellipse as the ceiling gradient above (semi-axes
    // openW/2 horizontal, archCurH vertical) so the ring sits flush against
    // the arch curve instead of drifting off it.
    for (let i = i0; i <= i1; i++) {
      const pillarScrX = this._sx(i * sp, cam.x, f);
      const openX = pillarScrX + pw;
      const openW = sp - pw;
      const midX  = openX + openW / 2;
      const archCurH = ah * 0.38;
      const archTopY = bY + 2;
      const ringT  = 7;     // ring thickness in px, measured outward from the opening edge
      const segs   = 9;     // odd count centres a keystone wedge at the apex

      // Point on the ellipse boundary at parametric angle a (0=right haunch,
      // PI/2=apex, PI=left haunch), scaled by `scale` (1 = opening's own
      // edge, >1 = ring's outer edge).
      const ellipsePt = (a, scale) => ({
        x: midX + Math.cos(a) * (openW / 2) * scale,
        y: archTopY + archCurH - Math.sin(a) * archCurH * scale,
      });

      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * PI;
        const a1 = ((s + 1) / segs) * PI;
        const isKey = s === Math.floor(segs / 2);
        const wedgeTone = isKey
          ? stoneLight
          : (s % 2 === 0 ? stoneBase : stoneDark);
        fill(wedgeTone[0], wedgeTone[1], wedgeTone[2]);
        noStroke();
        const outerScale = 1 + ringT / (openW / 2);
        const pOut0 = ellipsePt(a0, outerScale);
        const pOut1 = ellipsePt(a1, outerScale);
        const pIn1  = ellipsePt(a1, 1);
        const pIn0  = ellipsePt(a0, 1);
        beginShape();
        vertex(pOut0.x, pOut0.y);
        vertex(pOut1.x, pOut1.y);
        vertex(pIn1.x,  pIn1.y);
        vertex(pIn0.x,  pIn0.y);
        endShape(CLOSE);
        // Mortar seam between wedges
        stroke(stoneDeep[0], stoneDeep[1], stoneDeep[2], 150);
        strokeWeight(1);
        line(pIn0.x, pIn0.y, pOut0.x, pOut0.y);
        noStroke();
      }
    }

    // ── Irregular ashlar masonry on pillar faces ──────────────────────────────
    // Replaces the perfectly uniform brick grid with coursed stone blocks of
    // varying width/height and per-block tonal noise, plus damp staining low
    // on the pier and a soft corner shadow for cylindrical/3D volume.
    for (let i = i0; i <= i1; i++) {
      const sx   = this._sx(i * sp, cam.x, f);
      const seed = i * 97 + 11;
      let ry = bY;
      let row = 0;
      while (ry < bY + ph + 20) {
        const brkH = 11 + this._r(seed + row * 3) * 6;
        const off  = (row % 2) * (6 + this._r(seed + row) * 6);
        let bx = sx + 2 - off;
        let col = 0;
        while (bx < sx + pw - 1) {
          const brkW = 11 + this._r(seed + row * 17 + col * 7) * 9;
          const w2   = Math.min(brkW, sx + pw - 2 - bx);
          if (w2 > 1.5) {
            // Per-block tone jitter around the base stone colour
            const j = (this._r(seed + row * 31 + col * 13) - 0.5) * 26;
            let rr = constrain(stoneBase[0] + j, 60, 200);
            let gg = constrain(stoneBase[1] + j, 60, 190);
            let bb = constrain(stoneBase[2] + j, 50, 175);
            // Depth-based weathering: blocks get darker/damper near the base
            const depthT = constrain((ry - bY) / (ph + 20), 0, 1);
            rr = lerp(rr, mossCol[0], Math.max(0, depthT - 0.55) * 0.5);
            gg = lerp(gg, mossCol[1], Math.max(0, depthT - 0.55) * 0.5);
            bb = lerp(bb, mossCol[2], Math.max(0, depthT - 0.55) * 0.5);
            fill(rr, gg, bb);
            rect(bx, ry + 1, Math.max(1, w2 - 1.5), brkH - 2);
            // Highlight sliver (top edge catches light) + mortar shadow (bottom)
            fill(stoneLight[0], stoneLight[1], stoneLight[2], 70);
            rect(bx, ry, Math.max(1, w2 - 1.5), 1.5);
            fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 90);
            rect(bx, ry + brkH - 2, Math.max(1, w2 - 1.5), 1.5);
          }
          bx += brkW;
          col++;
        }
        ry += brkH;
        row++;
      }
      // Soft AO down the right edge of the pillar — gives it cylindrical/
      // load-bearing volume instead of a flat painted-on texture.
      fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 60);
      rect(sx + pw - 9, bY, 9, ph + 20);
      fill(stoneLight[0], stoneLight[1], stoneLight[2], 45);
      rect(sx, bY, 6, ph + 20);

      // Damp vertical streaks running down from the deck — weathering from
      // meltwater runoff, a small but very "real bridge" detail.
      const streaks = 2 + Math.floor(this._r(seed + 500) * 2);
      for (let st = 0; st < streaks; st++) {
        const stx = sx + 6 + this._r(seed + 600 + st) * (pw - 12);
        const stTopFrac = this._r(seed + 700 + st) * 0.15;
        fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 38);
        rect(stx, bY + ph * stTopFrac, 3, ph * (0.85 - stTopFrac));
      }
    }

    // ── Footing highlight / shadow for the buttress flare ────────────────────
    fill(stoneDark[0], stoneDark[1], stoneDark[2], 160);
    rect(0, bY + ph - 14, width, 6);
    fill(0, 0, 0, 50);
    rect(0, bY + ph + 16, width, 4); // contact shadow where footing meets ground

    // ── Deck slab (stone, not flat wood-brown) ────────────────────────────────
    fill(stoneBase[0], stoneBase[1], stoneBase[2]);
    rect(0, bY - dh, width, dh);
    // Left-lit / right-shadow sweep across the slab face, same light logic
    fill(stoneLight[0], stoneLight[1], stoneLight[2], 60);
    rect(0, bY - dh, width, dh * 0.4);
    fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 70);
    rect(0, bY - dh * 0.25, width, dh * 0.25);

    // Deck coursing joints (slightly irregular spacing/weight, not a ruler line)
    for (let i = i0; i <= i1; i++) {
      const sx = this._sx((i + 0.5) * sp, cam.x, f) + (this._r(i * 41) - 0.5) * 4;
      stroke(stoneDeep[0], stoneDeep[1], stoneDeep[2], 130);
      strokeWeight(1 + this._r(i * 29) * 0.8);
      line(sx, bY - dh, sx, bY);
    }
    noStroke();

    // Bottom-of-deck shadow (cast onto the pier tops / arch ring below)
    fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 200);
    rect(0, bY - 4, width, 6);

    // ── Stone balustrade / railing — real coping-stone depth ─────────────────
    const railTopY = bY - dh - 35;
    // Lower rail bar (mid-rail), with light/shadow on its two visible faces
    fill(stoneBase[0], stoneBase[1], stoneBase[2]);
    rect(0, bY - dh - 18, width, 5);
    fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 110);
    rect(0, bY - dh - 14, width, 2);

    // Balusters — slightly uneven width/spacing and per-post tonal jitter,
    // plus a contact shadow where each post meets the lower rail.
    for (let i = i0; i <= i1; i++) {
      for (let p = 0; p < 3; p++) {
        const seed = i * 53 + p * 7;
        const jitter = (this._r(seed) - 0.5) * 6;
        const px = this._sx(i * sp + (sp / 3) * p, cam.x, f) + jitter;
        const pj = (this._r(seed + 1) - 0.5) * 16;
        fill(constrain(stoneBase[0] + pj, 90, 200), constrain(stoneBase[1] + pj, 85, 190), constrain(stoneBase[2] + pj, 75, 175));
        rect(px - 4, railTopY, 7, 35);
        // Lit left edge / shadow right edge per baluster
        fill(stoneLight[0], stoneLight[1], stoneLight[2], 90);
        rect(px - 4, railTopY, 2, 35);
        fill(stoneDeep[0], stoneDeep[1], stoneDeep[2], 100);
        rect(px + 1, railTopY, 2, 35);
        fill(stoneDark[0], stoneDark[1], stoneDark[2]);
        rect(px - 4, railTopY, 7, 3); // cap shadow
        // Contact shadow on the deck/rail where post meets surface below
        fill(0, 0, 0, 45);
        ellipse(px, railTopY + 36, 11, 4);
      }
    }

    // Top coping rail — drawn after balusters so it caps them, with a
    // protruding lip (overhang) that casts a thin shadow onto the posts.
    fill(stoneBase[0], stoneBase[1], stoneBase[2]);
    rect(0, railTopY, width, 7);
    fill(stoneLight[0], stoneLight[1], stoneLight[2], 110);
    rect(0, railTopY, width, 2);            // sunlit top edge of coping
    fill(0, 0, 0, 55);
    rect(0, railTopY + 7, width, 2);        // shadow cast by the coping lip

    // ── Snow on deck and top railing ───────────────────────────────────────
    fill(snowCol[0], snowCol[1], snowCol[2]);
    rect(0, bY - dh, width, 9);          // deck snow layer
    rect(0, railTopY, width, 6);         // railing cap snow

    // Snow bumps on deck (uneven drift, slight blue shadow under each bump)
    for (let bx = -40; bx < width + 65; bx += 58) {
      const bh = 6 + this._r(bx / 58 + 800) * 8;
      fill(190, 206, 226, 90);
      ellipse(bx + 29, bY - dh + 6, 70, bh * 0.7); // soft shadow under drift
      fill(238, 248, 255, 205);
      ellipse(bx + 29, bY - dh + 4, 68, bh);
    }

    // ── Railway levels ────────────────────────────────────────────────────────
    this._drawLevels(bY - dh, cam, f);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw railway levels (sleepers + two rails with slight depth separation)
  // ─────────────────────────────────────────────────────────────────────────────
  _drawLevels(deckTopY, cam, f) {
    const tieSpace  = 27;
    const sep       = this.TRACK_SEP;    // px between the two visible rails
    const frontRailY = deckTopY - 3;     // "near" rail (lower on screen)
    const backRailY  = deckTopY - 3 - sep; // "far" rail (higher on screen)

    const bgLeft = cam.x * f - width / 2;
    const i0 = Math.floor(bgLeft / tieSpace) - 1;
    const i1 = Math.ceil((cam.x * f + width / 2) / tieSpace) + 1;

    // ── Sleepers (wooden crossties) ───────────────────────────────────────────
    for (let i = i0; i <= i1; i++) {
      const tieScrX = this._sx(i * tieSpace, cam.x, f);
      fill(98, 70, 42);
      rect(tieScrX - 28, backRailY - 2, 56, frontRailY - backRailY + 9); // body
      fill(72, 50, 28);
      rect(tieScrX - 27, frontRailY + 5, 54, 2); // bottom shadow
    }

    // ── Rails (front = lower, back = upper — slight depth perspective) ────────
    fill(82, 80, 75);
    rect(0, frontRailY - 5, width, 5); // front rail
    rect(0, backRailY  - 4, width, 4); // back rail (thinner = farther)

    // Rail-head highlights
    fill(108, 106, 102);
    rect(0, frontRailY - 5, width, 2);
    rect(0, backRailY  - 4, width, 2);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw the train (locomotive + 4 cars, travelling left → right)
  // txScrX = screen-X of locomotive left edge;  levelY = deck top
  // ─────────────────────────────────────────────────────────────────────────────
  _drawTrain(txScrX, levelY) {
    const carW    = 112;
    const carH    = 66;
    const locW    = 148;
    const locH    = 74;
    const gap     = 9;
    const wheelR  = 13;
    const trainBY = levelY + 5; // wheel-centre / axle Y

    push();
    noStroke();

    // Soft contact shadow on the deck running the full length under the
    // train — without this every car looks like it's hovering over the rail.
    fill(0, 0, 0, 70);
    ellipse(txScrX - 2 * (carW + gap), trainBY + wheelR + 3, 4 * (carW + gap) + locW + 40, 10);

    // ═══════════════ Locomotive ═══════════════
    const lx = txScrX;
    const ly = trainBY - locH;
    const boilerX = lx + locW * 0.41;
    const boilerW = locW * 0.59 - 9;

    // Main body / firebox (rear under-cab block)
    fill(34, 34, 45);
    rect(lx, ly, locW, locH, 3, 3, 0, 0);

    // ── Boiler — cylindrical shading instead of a flat tone ────────────────
    // A horizontal-band gradient (light on top curve, mid, shadow underneath)
    // is what sells a barrel shape in 2D side profile.
    const boilerTopY = ly + 9;
    const boilerH    = locH - 9;
    const bands = 10;
    for (let bnd = 0; bnd < bands; bnd++) {
      const t = bnd / (bands - 1);
      // brightest a bit above centre (sun from upper-left), darkest at the very bottom
      const shade = Math.max(0, Math.sin((t * 0.82 + 0.06) * Math.PI));
      const rr = lerp(30, 86, shade);
      const gg = lerp(30, 86, shade);
      const bb = lerp(42, 102, shade);
      fill(rr, gg, bb);
      rect(boilerX, boilerTopY + (boilerH / bands) * bnd, boilerW, boilerH / bands + 1);
    }
    // Boiler band rings (riveted segment joints — a hallmark steam-loco detail)
    stroke(20, 20, 28, 200); strokeWeight(1.5);
    for (let bd = 1; bd <= 3; bd++) {
      const bxr = boilerX + (boilerW / 4) * bd;
      line(bxr, boilerTopY + 2, bxr, boilerTopY + boilerH - 2);
    }
    noStroke();

    // Steam dome + sand dome on top of the boiler — small humps that read
    // immediately as "steam engine" and were entirely missing before.
    // Drawn noticeably lighter than the boiler top so they read as raised
    // 3D forms catching the light, not flat silhouettes glued on.
    fill(64, 64, 80);
    ellipse(boilerX + boilerW * 0.28, boilerTopY, 20, 16);
    rect(boilerX + boilerW * 0.28 - 10, boilerTopY - 7, 20, 10, 5, 5, 0, 0);
    fill(78, 78, 96);
    ellipse(boilerX + boilerW * 0.6, boilerTopY + 2, 15, 11);
    rect(boilerX + boilerW * 0.6 - 7.5, boilerTopY - 4, 15, 7, 4, 4, 0, 0);
    // Highlight slivers on both domes (upper-left light) + base shadow rim
    fill(120, 120, 140, 190);
    ellipse(boilerX + boilerW * 0.28 - 4, boilerTopY - 4, 9, 5);
    ellipse(boilerX + boilerW * 0.6 - 3, boilerTopY - 2, 6, 4);
    fill(24, 24, 32, 130);
    ellipse(boilerX + boilerW * 0.28, boilerTopY + 5, 20, 5);
    ellipse(boilerX + boilerW * 0.6, boilerTopY + 6, 15, 4);
    // Rivet dots along the top band line (subtle, just enough texture) —
    // drawn after the domes so they only show where actually visible.
    fill(15, 15, 22, 160);
    for (let rv = 0; rv < 6; rv++) {
      const rvx = boilerX + 5 + rv * (boilerW - 10) / 5;
      if (Math.abs(rvx - (boilerX + boilerW * 0.28)) > 12 && Math.abs(rvx - (boilerX + boilerW * 0.6)) > 10) {
        circle(rvx, boilerTopY + 2, 2.2);
      }
    }

    // Front nose / smokebox door — slightly domed plate with a rim highlight
    fill(24, 24, 34);
    rect(lx + locW - 11, ly + 4, 11, locH - 4, 0, 3, 3, 0);
    fill(50, 50, 64, 180);
    ellipse(lx + locW - 6, ly + locH * 0.35, 9, 9);
    noFill();
    stroke(15, 15, 22);
    strokeWeight(1.5);
    circle(lx + locW - 6, ly + locH * 0.35, 9); // door rim/hinge ring
    noStroke();

    // Headlight + glow
    fill(255, 248, 195, 225);
    circle(lx + locW - 4, ly + locH * 0.35, 16);
    fill(255, 255, 210, 75);
    circle(lx + locW - 4, ly + locH * 0.35, 28);
    fill(255, 255, 255, 200);
    circle(lx + locW - 7, ly + locH * 0.31, 5); // bulb glint

    // Buffer beam + coupler hook at the very front
    fill(58, 18, 18);
    rect(lx + locW - 3, ly + locH - 9, 6, 13);
    fill(20, 20, 26);
    rect(lx + locW + 1, trainBY - 8, 6, 5, 1);

    // Cab (rear) — slightly lighter than the firebox so it reads as a
    // separate cab structure, with a visible roof overhang.
    fill(46, 46, 58);
    rect(lx, ly - 5, locW * 0.42, locH * 0.73 + 5, 2, 2, 0, 0);
    fill(34, 34, 44);
    rect(lx - 2, ly - 7, locW * 0.42 + 4, 6, 3); // roof overhang lip
    fill(58, 58, 72, 150);
    rect(lx, ly - 5, locW * 0.42, 3); // sunlit roof edge

    // Cab windows — proper frame + two-tone glass + gleam
    fill(20, 20, 28);
    rect(lx + 6, ly + 1, 30, 24, 2);   // window frame recess (rear)
    rect(lx + 37, ly + 1, 21, 24, 2);  // window frame recess (front)
    fill(96, 148, 196);
    rect(lx + 8, ly + 3, 26, 20, 2);
    rect(lx + 39, ly + 3, 17, 20, 2);
    fill(152, 198, 238, 200);
    rect(lx + 8, ly + 3, 26, 11, 2);   // sky-bright upper half of glass
    rect(lx + 39, ly + 3, 17, 11, 2);
    fill(220, 238, 255, 150);
    rect(lx + 9, ly + 4, 8, 5, 1);     // gleam
    // Window mullion
    fill(28, 28, 38);
    rect(lx + 35, ly + 1, 3, 24);

    // Cab handrail
    stroke(18, 18, 26); strokeWeight(1.5);
    line(lx + 2, ly + locH * 0.73, lx + locW * 0.40, ly + locH * 0.73);
    noStroke();

    // Chimney stack — slight taper + rim highlight + base shadow collar
    fill(20, 20, 30);
    rect(lx + locW * 0.10, ly - 25, 15, 25, 1, 1, 0, 0);
    fill(40, 40, 52);
    rect(lx + locW * 0.10 + 1, ly - 25, 5, 25); // lit left face
    fill(46, 46, 58);
    ellipse(lx + locW * 0.10 + 7.5, ly - 27, 22, 7); // cap (rim)
    fill(16, 16, 22);
    ellipse(lx + locW * 0.10 + 7.5, ly - 25, 14, 4); // dark bore opening
    fill(30, 30, 42, 170);
    ellipse(lx + locW * 0.10 + 7.5, ly - 7, 19, 5); // base collar shadow on boiler

    // Running board along boiler, with a thin shadow line beneath it
    fill(62, 62, 75);
    rect(boilerX, trainBY - 17, boilerW, 5);
    fill(20, 20, 28, 140);
    rect(boilerX, trainBY - 12, boilerW, 2);

    // Cylinder block + piston rod (small but unmistakably "steam engine")
    fill(28, 28, 38);
    rect(lx + locW * 0.50, trainBY - 9, 22, 13, 2);
    fill(70, 70, 84);
    rect(lx + locW * 0.50 + 2, trainBY - 7, 18, 3); // top highlight
    stroke(60, 60, 74); strokeWeight(2.5);
    line(lx + locW * 0.50 - 9, trainBY - 2, lx + locW * 0.50, trainBY - 2); // piston rod
    noStroke();

    // ── Driving wheels — spoked, with crank pins and a properly anchored
    // connecting rod + side rod (previously a single floating diagonal line) ──
    const dwX = [lx + locW * 0.56, lx + locW * 0.70, lx + locW * 0.84];
    const crankAngle = (frameCount * 0.18) % TWO_PI; // wheels appear to actually turn
    for (const wx of dwX) {
      fill(14, 14, 20);
      circle(wx, trainBY + 2, 30);
      fill(34, 34, 44);
      circle(wx, trainBY + 2, 26); // inner tyre rim shading
      fill(14, 14, 20);
      circle(wx, trainBY + 2, 22);
      // Spokes
      stroke(46, 46, 58); strokeWeight(2.2);
      for (let sp2 = 0; sp2 < 5; sp2++) {
        const a = crankAngle + (TWO_PI / 5) * sp2;
        line(wx, trainBY + 2, wx + Math.cos(a) * 10, trainBY + 2 + Math.sin(a) * 10);
      }
      noStroke();
      fill(80, 80, 96);
      circle(wx, trainBY + 2, 11); // hub
      fill(40, 40, 52);
      circle(wx, trainBY + 2, 5);  // axle cap
      // Crank pin (where the rod attaches) — orbits with the wheel
      const pinX = wx + Math.cos(crankAngle) * 10;
      const pinY = trainBY + 2 + Math.sin(crankAngle) * 10;
      fill(20, 20, 28);
      circle(pinX, pinY, 5);
      // Highlight catching upper-left light
      fill(64, 64, 80, 130);
      circle(wx - 6, trainBY - 4, 8);
    }
    // Side rod (connects all three crank pins, drawn through their current
    // positions so it stays mechanically attached to the spinning wheels)
    stroke(56, 56, 70); strokeWeight(3);
    const pin0 = { x: dwX[0] + Math.cos(crankAngle) * 10, y: trainBY + 2 + Math.sin(crankAngle) * 10 };
    const pin2 = { x: dwX[2] + Math.cos(crankAngle) * 10, y: trainBY + 2 + Math.sin(crankAngle) * 10 };
    const pin1 = { x: dwX[1] + Math.cos(crankAngle) * 10, y: trainBY + 2 + Math.sin(crankAngle) * 10 };
    line(pin0.x, pin0.y, pin1.x, pin1.y);
    line(pin1.x, pin1.y, pin2.x, pin2.y);
    strokeWeight(1.5);
    stroke(80, 80, 96, 180);
    line(pin0.x, pin0.y - 1, pin2.x, pin2.y - 1); // highlight along the rod's top edge
    noStroke();

    // Small pilot wheel
    fill(14, 14, 20);
    circle(lx + locW * 0.91, trainBY + 2, 21);
    fill(38, 38, 50);
    circle(lx + locW * 0.91, trainBY + 2, 14);
    fill(68, 68, 84);
    circle(lx + locW * 0.91, trainBY + 2, 7);

    // Pilot / cowcatcher at the very front, angled slats
    stroke(24, 24, 32); strokeWeight(2.5);
    const pilotBaseX = lx + locW + 2, pilotBaseY = trainBY + 9;
    for (let pl = -2; pl <= 2; pl++) {
      line(pilotBaseX + pl * 4, pilotBaseY, pilotBaseX - 6, pilotBaseY + 8);
    }
    noStroke();

    // Undercarriage shadow strip beneath the loco (grounds it to the rail)
    fill(0, 0, 0, 90);
    rect(lx, trainBY + wheelR - 2, locW + 4, 4);

    // ═══════════════ Passenger / freight cars ═══════════════
    const carPalette = [
      [156, 37,  37],   // crimson
      [40,  62, 152],   // royal blue
      [126, 86,  34],   // golden brown
      [45,  94,  45],   // forest green
    ];

    for (let c = 0; c < 4; c++) {
      const cx = txScrX - (c + 1) * (carW + gap);
      const cy = trainBY - carH;
      const [r, g, b] = carPalette[c];

      // ── Body — vertical banded shading for a rounded/cylindrical read,
      // instead of one flat fill with a stripe top and bottom ─────────────
      const cBands = 8;
      for (let bnd = 0; bnd < cBands; bnd++) {
        const t = bnd / (cBands - 1);
        const shade = Math.max(0, Math.sin((t * 0.85 + 0.05) * Math.PI));
        const rr = lerp(Math.max(r - 38, 0), Math.min(r + 34, 255), shade);
        const gg = lerp(Math.max(g - 38, 0), Math.min(g + 34, 255), shade);
        const bb = lerp(Math.max(b - 38, 0), Math.min(b + 34, 255), shade);
        fill(rr, gg, bb);
        rect(cx, cy + (carH / cBands) * bnd, carW, carH / cBands + 1);
      }
      // Re-cap the rounded top/bottom corners cleanly over the bands
      fill(Math.min(r + 34, 255), Math.min(g + 34, 255), Math.min(b + 34, 255));
      rect(cx, cy, carW, 6, 2, 2, 0, 0);

      // Roof — slightly domed cap line + centre ridge highlight
      fill(Math.max(r - 50, 10), Math.max(g - 50, 10), Math.max(b - 50, 10));
      rect(cx + 2, cy - 3, carW - 4, 5, 3, 3, 0, 0);
      fill(Math.min(r + 50, 255), Math.min(g + 50, 255), Math.min(b + 50, 255), 160);
      rect(cx + 6, cy - 3, carW - 12, 2, 1);

      // Body panel seam rivets (2 vertical seams per car)
      fill(0, 0, 0, 70);
      for (const sx2 of [cx + carW * 0.32, cx + carW * 0.68]) {
        for (let rv = 0; rv < 4; rv++) {
          circle(sx2, cy + 10 + rv * 14, 2);
        }
      }

      // Bottom shadow strip (chassis skirt)
      fill(Math.max(r - 45, 0), Math.max(g - 45, 0), Math.max(b - 45, 0));
      rect(cx, cy + carH - 9, carW, 9);
      fill(0, 0, 0, 60);
      rect(cx, cy + carH - 9, carW, 2);

      // Windows (4 per car) — frame recess + two-tone glass + crisper gleam
      for (let w = 0; w < 4; w++) {
        const wx2 = cx + 9 + w * 25;
        fill(20, 20, 26);
        rect(wx2 - 1, cy + 15, 21, 19, 2); // frame recess
        fill(118, 168, 206);
        rect(wx2, cy + 16, 19, 17, 2);
        fill(178, 214, 240, 210);
        rect(wx2, cy + 16, 19, 8, 2);      // bright upper half (sky reflection)
        fill(216, 236, 252, 160);
        rect(wx2 + 1, cy + 17, 6, 5, 1);   // gleam
        fill(20, 20, 26, 120);
        rect(wx2, cy + 30, 19, 1.5);       // sill shadow
      }

      // Coupler between cars (and between first car and loco) — add a
      // hanging chain-link hint so it doesn't look like a floating tab.
      fill(48, 48, 56);
      rect(cx + carW - 1, trainBY - 14, gap + 2, 7, 1);
      fill(20, 20, 26);
      circle(cx + carW + gap / 2, trainBY - 6, 4);
      if (c === 0) {
        rect(txScrX - gap - 1, trainBY - 14, gap + 2, 7, 1);
        circle(txScrX - gap / 2, trainBY - 6, 4);
      }

      // Buffers (small sprung discs at each end, classic rolling-stock detail)
      fill(34, 34, 40);
      circle(cx + 4, trainBY - 11, 8);
      circle(cx + carW - 4, trainBY - 11, 8);
      fill(58, 58, 66);
      circle(cx + 4, trainBY - 11, 4);
      circle(cx + carW - 4, trainBY - 11, 4);

      // Underframe beam (the structural chassis the body sits on)
      fill(26, 26, 32);
      rect(cx + 2, trainBY - 16, carW - 4, 4);

      // Leaf-spring suspension above each wheel pair
      for (const wxp of [cx + 15, cx + carW - 15]) {
        stroke(20, 20, 26); strokeWeight(2);
        noFill();
        // gentle arc suggesting a leaf spring sitting on the axle box
        beginShape();
        vertex(wxp - 9, trainBY - 8);
        vertex(wxp,     trainBY - 11);
        vertex(wxp + 9, trainBY - 8);
        endShape();
        noStroke();
        fill(30, 30, 36);
        rect(wxp - 5, trainBY - 8, 10, 6, 1); // axle box
      }

      // Bogies (2 wheels per car) — add rim shading + a hint of spokes
      fill(14, 14, 20);
      circle(cx + 15, trainBY + 2, wheelR * 2);
      circle(cx + carW - 15, trainBY + 2, wheelR * 2);
      fill(34, 34, 44);
      circle(cx + 15, trainBY + 2, wheelR * 1.5);
      circle(cx + carW - 15, trainBY + 2, wheelR * 1.5);
      stroke(46, 46, 58); strokeWeight(1.5);
      for (const wxp of [cx + 15, cx + carW - 15]) {
        for (let sp2 = 0; sp2 < 4; sp2++) {
          const a = crankAngle * 0.7 + (TWO_PI / 4) * sp2;
          line(wxp, trainBY + 2, wxp + Math.cos(a) * 7, trainBY + 2 + Math.sin(a) * 7);
        }
      }
      noStroke();
      fill(64, 64, 80);
      circle(cx + 15, trainBY + 2, wheelR * 0.58);
      circle(cx + carW - 15, trainBY + 2, wheelR * 0.58);
      fill(56, 56, 70, 110);
      circle(cx + 15 - 4, trainBY - 3, 7); // wheel highlight, upper-left light
      circle(cx + carW - 15 - 4, trainBY - 3, 7);

      // Undercarriage shadow strip beneath the car
      fill(0, 0, 0, 85);
      rect(cx, trainBY + wheelR - 2, carW, 4);
    }

    pop();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw snowflakes  (called LAST in sketch-1.js — in front of everything)
  // ─────────────────────────────────────────────────────────────────────────────
  drawSnow() {
    push();
    noStroke();

    for (const fl of this.flakes) {
      if (fl.crystal && fl.size > 4.2) {
        this._drawCrystal(fl.x, fl.y, fl.size, fl.alpha);
      } else {
        fill(255, 255, 255, fl.alpha);
        circle(fl.x, fl.y, fl.size);
        fill(215, 232, 255, fl.alpha * 0.32);
        circle(fl.x, fl.y, fl.size * 1.88);
      }
    }

    pop();
  }

  // ── 6-armed ice-crystal snowflake ─────────────────────────────────────────
  _drawCrystal(x, y, size, alpha) {
    push();
    translate(x, y);
    rotate(frameCount * 0.0032 + size * 0.18);

    stroke(255, 255, 255, alpha);
    strokeWeight(1.15);
    noFill();

    const arm    = size * 1.12;
    const branch = arm * 0.37;

    for (let i = 0; i < 6; i++) {
      push();
      rotate((TWO_PI / 6) * i);
      line(0, 0, 0, -arm);
      push(); translate(0, -arm * 0.52); rotate( PI / 5); line(0, 0, 0, -branch); pop();
      push(); translate(0, -arm * 0.52); rotate(-PI / 5); line(0, 0, 0, -branch); pop();
      pop();
    }

    noStroke();
    fill(255, 255, 255, alpha);
    circle(0, 0, size * 0.40);

    pop();
  }
}
