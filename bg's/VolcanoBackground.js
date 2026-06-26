// ─────────────────────────────────────────────────────────────────────────────
// VolcanoBackground.js
// Parallax "inside the volcano" background for the Level class.
//
// Unlike the open-horizon biomes (snow / forest / ice), this one is meant to
// feel ENCLOSED — the player is deep inside a magma chamber, not looking out
// at a skyline. That flips two of the usual conventions:
//   • No sky — the top of the screen is dark cavern void/rock, lit only by
//     the warm glow rising from the lava floor below.
//   • Light comes from BELOW (the lava), not the upper-left "sun" used by
//     every other biome — rock formations are lit on their underside/inner
//     edge facing the glow, with their tops in shadow.
//
// Layer stack (back → front), each one scrolling at its own speed:
//   Cavern void + ambient glow    parallax X/Y  0.00
//   Far cave-wall silhouettes     parallax X    0.09  Y  0.05   (hazy, slow)
//   Near jagged rock formations   parallax X    0.30  Y  0.15   (glowing
//   + lava floor                                                 cracks, the
//                                                                 biome's
//                                                                 signature)
//   Rising embers                 screen-space  (drift UPWARD, not down)
//   Foreground fire jets          screen-space  (drawn LAST, in front of
//                                  the player — flickering flame silhouettes
//                                  anchored at the very bottom edge of frame)
// ─────────────────────────────────────────────────────────────────────────────

class VolcanoBackground {
  constructor() {

    // ── Parallax factors ─────────────────────────────────────────────────────
    this.FX_FAR   = 0.09;
    this.FY_FAR   = 0.05;
    this.FX_NEAR  = 0.30;
    this.FY_NEAR  = 0.15;

    // ── Screen shake (kept for interface parity with SnowBackground; unused) ──
    this.shakeIntensity = 0;

    // ── Rising embers (this biome's answer to snowflakes/leaves/glitter) ─────
    this.embers = this._initEmbers();

    // ── Foreground fire jets — small flickering flames anchored at the very
    // bottom of the screen, as if the camera is right at the edge of the
    // lava and gas vents are licking up into frame. Drawn last, in front of
    // the player. ─────────────────────────────────────────────────────────────
    this.fires = this._initFires();

    // ── Pre-generate deterministic terrain ───────────────────────────────────
    this.farWalls   = this._genFarWalls();
    this.nearRocks  = this._genNearRocks();

    // Animation clock for pulsing lava glow
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

  // ── Convert screen-Y with vertical parallax based on camera Y position ─────
  _sy(defaultY, camY, fy) {
    return defaultY + (height / 2 - camY) * fy;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init helpers
  // ─────────────────────────────────────────────────────────────────────────────

  _initEmbers() {
    const out = [];
    for (let i = 0; i < 44; i++) {
      out.push({
        x:      this._r(i * 3)     * (windowWidth  + 40) - 20,
        y:      this._r(i * 3 + 1) * (windowHeight * 0.9 + 60) - 30,
        size:   1.6 + this._r(i * 3 + 2) * 2.6,
        speed:  0.30 + this._r(i * 5 + 3) * 0.65,
        drift:  (this._r(i * 7 + 1) - 0.5) * 0.8,
        flicker: this._r(i * 11) * Math.PI * 2,
      });
    }
    return out;
  }

  _initFires() {
    const out = [];
    // Sparse — these are big and close, meant to lick up from the very
    // bottom edge of frame like occasional gas-fed flame jets, framing the
    // view rather than walling it off. Sizes vary a lot so most are modest
    // and only an occasional one is a tall attention-grabbing jet.
    const count = 4;
    for (let i = 0; i < count; i++) {
      const big = i % 3 === 0;
      out.push({
        x:        (i + 0.5) * (1 / count) * (windowWidth + 160) - 80 + (this._r(i * 9) - 0.5) * 90,
        baseSize: big ? (85 + this._r(i * 13 + 1) * 45) : (40 + this._r(i * 13 + 1) * 35),
        sway:     this._r(i * 17 + 2) * Math.PI * 2,
        swaySpeed: 0.018 + this._r(i * 19 + 3) * 0.014,
        flickerSeed: this._r(i * 23 + 4) * 1000,
      });
    }
    return out;
  }

  // Far cave-wall palette — dark, hazy, with a faint warm undertone from the
  // distant lava glow (never fully black, or it would vanish into the void).
  static FAR_WALL_PALETTES = [
    [46, 28, 30],
    [40, 24, 26],
    [50, 32, 30],
  ];

  _genFarWalls() {
    const out = [];
    for (let i = 0; i < 60; i++) {
      const fromTop = i % 2 === 0; // alternate hanging down / rising up
      out.push({
        bgX:     -1700 + i * 58 + (this._r(i * 5) - 0.5) * 28,
        hFrac:    0.14 + this._r(i * 7) * 0.20,
        wScale:   0.7 + this._r(i * 11) * 0.6,
        fromTop:  fromTop,
        palette:  VolcanoBackground.FAR_WALL_PALETTES[i % VolcanoBackground.FAR_WALL_PALETTES.length],
        seed:     i * 41 + 7,
      });
    }
    return out;
  }
  // Near rock palette — dark cooling basalt with glowing internal veins.
  // Each entry is [baseRock, litUnderside, deepShadow, veinGlow].
  static NEAR_ROCK_PALETTES = [
    [[54, 34, 30], [168, 92, 46], [26, 16, 16], [255, 140, 40]],
    [[48, 30, 32], [156, 84, 52], [22, 14, 16], [255, 120, 50]],
    [[58, 36, 28], [174, 98, 44], [28, 17, 14], [255, 160, 60]],
    [[44, 28, 30], [150, 80, 50], [20, 13, 15], [255, 110, 36]],
  ];

  _genNearRocks() {
    const out = [];
    // Mix of stalagmite clusters rising from the lava (most common) and
    // stalactite clusters hanging from the cavern ceiling (less common),
    // each a tall "mother" formation with a few shorter satellites — same
    // clustering principle as the ice biome's spikes, but lit from below.
    for (let i = 0; i < 24; i++) {
      const clusterX = -1900 + i * 158 + (this._r(i * 5) - 0.5) * 50;
      const isGiant = i % 3 === 0;
      const hangs = i % 4 === 1; // occasional ceiling stalactite cluster
      out.push({
        bgX:        clusterX,
        scale:      isGiant ? (1.5 + this._r(i * 7) * 0.6) : (0.55 + this._r(i * 7) * 0.4),
        satellites: 2 + Math.floor(this._r(i * 11) * 3),
        hangs:      hangs,
        palette:    VolcanoBackground.NEAR_ROCK_PALETTES[i % VolcanoBackground.NEAR_ROCK_PALETTES.length],
        depthZ:     this._r(i * 23 + 2),
        seed:       i * 131 + 19,
      });
    }
    out.sort((a, b) => a.depthZ - b.depthZ);
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Update  (called every frame from sketch-1.js before draw)
  // ─────────────────────────────────────────────────────────────────────────────
  update(cam) {
    this._t += 0.02;
    for (const e of this.embers) {
      // Embers RISE — opposite vertical direction from snow/leaves/glitter.
      e.y -= e.speed;
      e.x += e.drift + Math.sin(frameCount * 0.02 + e.flicker) * 0.4;
      e.flicker += 0.1;
      if (e.y < -20)        { e.y = height + random(4, 30); e.x = random(width); }
      if (e.x < -10)         e.x = width + 5;
      if (e.x > width + 10)  e.x = -5;
    }
    for (const f of this.fires) {
      f.sway += f.swaySpeed;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw background layers  (called BEFORE the game translate in sketch-1.js)
  // ─────────────────────────────────────────────────────────────────────────────
  draw(cam) {
    push();
    noStroke();

    // ── 1. Cavern void — dark above, warming toward a deep ember-red glow
    // near the bottom where the lava floor lights it from below ──────────────
    for (let y = 0; y < height; y += 2) {
      const t = y / height;
      stroke(lerp(16, 86, t * t), lerp(12, 30, t * t), lerp(18, 26, t * t));
      strokeWeight(2);
      line(0, y, width, y);
    }
    noStroke();

    // ── Drifting smoke / heat-haze wisps — soft, slow-moving translucent
    // blobs in the upper cavern air. Real volcanic chambers are never
    // perfectly clear; a little ambient haze sells the depth and heat far
    // more than a flat gradient alone. ───────────────────────────────────────
    for (let i = 0; i < 7; i++) {
      const seedw = i * 311 + 9100;
      const driftX = (this._t * 6 + this._r(seedw) * width * 3) % (width + 300) - 150;
      const wx = driftX;
      const wy = height * (0.06 + this._r(seedw + 1) * 0.34);
      const ww = 160 + this._r(seedw + 2) * 180;
      fill(70, 40, 36, 16);
      ellipse(wx, wy, ww, ww * 0.4);
      fill(60, 34, 32, 12);
      ellipse(wx + ww * 0.3, wy + 10, ww * 0.7, ww * 0.3);
    }

    // ── Radiant light bloom cast UP from the lava onto the cavern air —
    // aligned to the actual open vent pools below (the only places real
    // molten rock is directly exposed now that the floor is mostly dark
    // crust), and noticeably softer/smaller than before since there's much
    // less glowing surface to cast light from. Built from several
    // concentric layers fading outward (a manual radial gradient — canvas
    // has no true radial fill available here) so the glow dissolves into
    // the dark instead of showing a hard ellipse edge. ───────────────────────
    const floorYForGlow = this._sy(height * 0.80, cam.y, this.FY_NEAR);
    const floorHForGlow = height - floorYForGlow;
    for (const v of this._getLavaVents(floorYForGlow, floorHForGlow, cam.x)) {
      const pulse = 0.55 + 0.45 * Math.sin(this._t * 1.5 + v.seed * 3.7);
      const reach = height * (0.16 + pulse * 0.05);
      const rings = 5;
      for (let k = rings; k >= 1; k--) {
        const t = k / rings;
        const rw = reach * 0.9 * t;
        const rh = reach * 1.3 * t;
        const alpha = (1 - t) * (1 - t) * 26 * pulse;
        fill(255, 120, 45, alpha);
        ellipse(v.x, v.y - rh * 0.25, rw, rh);
      }
    }
    noStroke();

    // ── 2. Far cave-wall silhouettes (parallax X 0.09, Y 0.05) ───────────────
    const farMidY = this._sy(height * 0.58, cam.y, this.FY_FAR);
    // Subtle vertical gradient instead of one flat fill — real cave rock
    // never reads as a single uniform colour, even at a middle distance.
    for (let y = farMidY; y < height; y += 3) {
      const t = (y - farMidY) / (height - farMidY);
      stroke(lerp(46, 62, t), lerp(26, 34, t), lerp(24, 30, t));
      strokeWeight(3);
      line(0, y, width, y);
    }
    noStroke();
    // Soft mottled rock texture — irregular patches of slightly lighter/
    // darker stone breaking up the gradient so the mid-distance wall reads
    // as rough rock rather than a smooth painted backdrop. Tiled in
    // bg-world space and mapped through _sx with the far-wall parallax
    // factor, so the texture actually scrolls with the wall instead of
    // sitting fixed to the screen.
    {
      const period = 73;
      const bgLeft  = cam.x * this.FX_FAR - width / 2;
      const bgRight = cam.x * this.FX_FAR + width / 2;
      const i0 = Math.floor(bgLeft / period) - 1;
      const i1 = Math.ceil(bgRight / period) + 1;
      for (let i = i0; i <= i1; i++) {
        const bx = i * period;
        const seedb = i + 8200;
        const bxp = this._sx(bx, cam.x, this.FX_FAR) + (this._r(seedb) - 0.5) * 40;
        const byp = farMidY + (height - farMidY) * (0.15 + this._r(seedb + 1) * 0.75);
        const bw = 50 + this._r(seedb + 2) * 60;
        const lighter = this._r(seedb + 3) > 0.5;
        fill(lighter ? 70 : 36, lighter ? 42 : 22, lighter ? 36 : 20, 70);
        ellipse(bxp, byp, bw, bw * 0.55);
      }
    }

    for (const w of this.farWalls) {
      const sx = this._sx(w.bgX, cam.x, this.FX_FAR);
      const span = 34 * w.wScale;
      if (sx + span < -30 || sx - span > width + 30) continue;
      this._drawFarWall(sx, farMidY, w);
    }

    // Haze veil pushing the far layer back, tinted by the ambient glow
    fill(40, 18, 18, 70);
    rect(0, 0, width, farMidY + 6);

    // ── 3. Lava floor — the glowing, animated heart of this biome ────────────
    const floorY = this._sy(height * 0.80, cam.y, this.FY_NEAR);
    this._drawLavaFloor(floorY, cam.x);

    // ── 4. Near jagged rock formations (parallax X 0.30, Y 0.15) ─────────────
    // Stalagmites anchor at the lava floor; stalactites anchor near the top
    // of the screen (the cavern ceiling) and hang downward instead.
    const ceilingY = -20;
    for (const r of this.nearRocks) {
      const sx = this._sx(r.bgX, cam.x, this.FX_NEAR);
      const span = 130 * r.scale;
      if (sx + span < -60 || sx - span > width + 60) continue;
      this._drawRockCluster(sx, r.hangs ? ceilingY : floorY, r);
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

    // ── Rising embers — small glowing flecks drifting UP from the lava,
    // the inverse motion of every other biome's falling particles, with a
    // soft halo and flicker so they read as hot cinders, not dust. ──────────
    for (const e of this.embers) {
      const flick = 0.55 + 0.45 * Math.sin(e.flicker);
      fill(255, 140, 50, 70 * flick);
      ellipse(e.x, e.y, e.size * 2.6, e.size * 2.6);
      fill(255, 200, 110, 220 * flick);
      ellipse(e.x, e.y, e.size, e.size);
    }

    // ── Foreground fire jets — big flickering flames right at the bottom
    // edge of the screen, as if gas vents are licking up right where the
    // camera is standing. Drawn LAST so they sit in front of everything,
    // including the player, the same "very foreground" device the forest
    // biome uses for its close-up tree silhouettes. ──────────────────────────
    for (const f of this.fires) {
      this._drawFireJet(f);
    }

    pop();
  }

  // ── A single flickering flame — a jittered, tapering silhouette built
  // from three layered colours (deep red outer lick, orange body, pale
  // yellow-white core), continuously reshaped frame to frame so it reads
  // as living fire rather than a static painted icon. ──────────────────────
  _drawFireJet(f) {
    const baseY = height + 6;
    const sway = Math.sin(f.sway) * f.baseSize * 0.12;
    const stretch = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(f.sway * 1.7 + f.flickerSeed));
    const h = f.baseSize * 1.7 * stretch;
    const w = f.baseSize * 0.62;
    const tipX = f.x + sway;

    // Small flicker-driven jitter per tongue, regenerated each call from a
    // time-based seed so the outline never repeats identically frame to
    // frame, the way real flame edges never hold still.
    const jitter = (off, mag) => (this._r(f.flickerSeed + off + Math.floor(this._t * 14)) - 0.5) * mag;

    const buildTongue = (scaleW, scaleH, offY) => {
      const tw = w * scaleW;
      const th = h * scaleH;
      const tx = f.x + sway * scaleH;
      const ty = baseY - offY;
      return [
        [tx, ty - th + jitter(1, tw * 0.3)],
        [tx + tw * 0.42 + jitter(2, tw * 0.2), ty - th * 0.62],
        [tx + tw * 0.5 + jitter(3, tw * 0.18), ty - th * 0.22],
        [tx + tw * 0.46, ty],
        [tx - tw * 0.46, ty],
        [tx - tw * 0.5 + jitter(4, tw * 0.18), ty - th * 0.22],
        [tx - tw * 0.42 + jitter(5, tw * 0.2), ty - th * 0.62],
      ];
    };

    noStroke();
    // Outer lick — deep red-orange, widest and tallest, soft translucent
    fill(220, 60, 24, 150);
    let pts = buildTongue(1.0, 1.0, 0);
    beginShape();
    for (const p of pts) vertex(p[0], p[1]);
    endShape(CLOSE);

    // Mid body — bright orange
    fill(255, 120, 30, 210);
    pts = buildTongue(0.72, 0.82, 2);
    beginShape();
    for (const p of pts) vertex(p[0], p[1]);
    endShape(CLOSE);

    // Inner core — hot yellow-white, shortest, only near the base
    fill(255, 224, 140, 235);
    pts = buildTongue(0.40, 0.46, 2);
    beginShape();
    for (const p of pts) vertex(p[0], p[1]);
    endShape(CLOSE);

    // Faint soft glow bleeding onto whatever is behind the flame's base
    fill(255, 130, 40, 40);
    ellipse(tipX, baseY - 4, w * 1.6, h * 0.18);
  }

  // ── Simple jagged cave-wall silhouette for the distant, hazy layer — half
  // the clusters hang from above (cavern ceiling outcrops), half rise from
  // the floor, so the scene reads as an enclosed tunnel rather than an open
  // horizon. Now with a touch of shading (a darker far-side half and a warm
  // tint near the end facing the lava glow) so it doesn't read as one flat
  // painted triangle. ───────────────────────────────────────────────────────
  _drawFarWall(cx, midY, w) {
    const rv = (off) => this._r(w.seed + off);
    const h = w.hFrac * height;
    const wid = 34 * w.wScale;
    const lean = (rv(2) - 0.5) * wid * 0.5;
    const pal = w.palette;
    const darker = [pal[0] * 0.72, pal[1] * 0.72, pal[2] * 0.78];
    const warm   = [Math.min(pal[0] + 30, 90), Math.min(pal[1] + 14, 50), Math.min(pal[2] + 8, 46)];

    if (w.fromTop) {
      const tipY = midY - height * 0.40 + h;
      const baseY = midY - height * 0.40;
      const midX1 = cx + wid * (0.18 + rv(3) * 0.10);
      const midY1 = baseY + h * (0.45 - rv(4) * 0.15);
      const midX2 = cx - wid * (0.18 + rv(5) * 0.10);
      const midY2 = baseY + h * (0.50 - rv(6) * 0.15);
      fill(pal[0], pal[1], pal[2]);
      beginShape();
      vertex(cx + lean, tipY);
      vertex(midX1, midY1);
      vertex(cx + wid * 0.5, baseY);
      vertex(cx - wid * 0.5, baseY);
      vertex(midX2, midY2);
      endShape(CLOSE);
      // Shadow half (the side facing away from the implied glow direction)
      fill(darker[0], darker[1], darker[2]);
      beginShape();
      vertex(cx + lean, tipY);
      vertex(midX1, midY1);
      vertex(cx + wid * 0.5, baseY);
      vertex(cx + lean, baseY);
      endShape(CLOSE);
      // Warm tint right at the base/tip nearest the lava glow below
      fill(warm[0], warm[1], warm[2], 90);
      ellipse(cx + lean, tipY, wid * 0.7, h * 0.12);
    } else {
      const topY = midY - h;
      const midX1 = cx + wid * (0.18 + rv(3) * 0.10);
      const midY1 = midY - h * (0.55 + rv(4) * 0.15);
      const midX2 = cx - wid * (0.18 + rv(5) * 0.10);
      const midY2_ = midY - h * (0.50 + rv(6) * 0.15);
      fill(pal[0], pal[1], pal[2]);
      beginShape();
      vertex(cx + lean, topY);
      vertex(midX1, midY1);
      vertex(cx + wid * 0.5, midY);
      vertex(cx - wid * 0.5, midY);
      vertex(midX2, midY2_);
      endShape(CLOSE);
      // Shadow half
      fill(darker[0], darker[1], darker[2]);
      beginShape();
      vertex(cx + lean, topY);
      vertex(midX1, midY1);
      vertex(cx + wid * 0.5, midY);
      vertex(cx + lean, midY);
      endShape(CLOSE);
      // Warm tint at the base nearest the lava glow below
      fill(warm[0], warm[1], warm[2], 90);
      ellipse(cx, midY, wid * 0.9, h * 0.10);
    }
  }

  // ── Lava floor: a solid, dark, hardened crust covering the ENTIRE
  // ground, textured like rough cooled basalt — with the molten lava
  // beneath only visible through a network of glowing branching cracks
  // (plus a couple of small open vent pools where the crust has broken
  // away further). The crust is the dominant surface; the glow is the
  // exception breaking through it, not the other way around. ─────────────
  _drawLavaFloor(floorY, camX) {
    const floorH = height - floorY;

    // ── Base crust — dark, cooled basalt rock, not molten at all. A subtle
    // two-tone gradient and mottling give it some rock-like texture without
    // making it glow. ─────────────────────────────────────────────────────
    fill(34, 22, 20);
    rect(0, floorY, width, floorH);
    fill(44, 28, 24);
    rect(0, floorY, width, floorH * 0.45);



    // ── A couple of small open vent pools — places where the crust has
    // broken away enough to show real exposed molten lava, not just a
    // crack line. Sparse: these are the exception, not the rule. ───────────
    const vents = this._getLavaVents(floorY, floorH, camX);
    for (const v of vents) {
      const pulse = 0.55 + 0.45 * Math.sin(this._t * 1.5 + v.seed * 3.7);
      // Soft glow bleeding onto the crust around the pool
      fill(255, 110, 40, 70 * pulse);
      ellipse(v.x, v.y, v.w * 2.2, v.w * 1.3);
      fill(255, 140, 50, 110 * pulse);
      ellipse(v.x, v.y, v.w * 1.4, v.w * 0.82);
      // The pool itself — dark crust rim, molten core
      fill(20, 11, 10);
      ellipse(v.x, v.y, v.w * 1.15, v.w * 0.68);
      fill(220, 80 + pulse * 50, 30, 235);
      ellipse(v.x, v.y, v.w * 0.85, v.w * 0.50);
      fill(255, 230, 170, 220 * pulse);
      ellipse(v.x, v.y, v.w * 0.30, v.w * 0.18);
    }

    // ── Glowing crack network — branching fissures cut into the crust,
    // each with a soft outer bloom (light bleeding onto the surrounding
    // rock) and a bright incandescent core, animated with a gentle flicker
    // so the light feels alive rather than painted on. ──────────────────────
    for (const branch of this._getCrackNetwork(floorY, floorH, camX)) {
      const flick = 0.6 + 0.4 * Math.sin(this._t * 2.0 + branch.seed * 4.3);
      stroke(255, 110, 35, 55 * flick);
      strokeWeight(9);
      this._strokePolyline(branch.pts);
      stroke(255, 140, 45, 110 * flick);
      strokeWeight(4.5);
      this._strokePolyline(branch.pts);
      stroke(255, 215, 140, 200 * flick);
      strokeWeight(1.6);
      this._strokePolyline(branch.pts);
    }
    noStroke();

    // ── Top edge of the crust — a thin warm rim where it meets the cavern
    // air, hinting at residual heat without making the crust itself glow ───
    const pulse = 0.5 + 0.5 * Math.sin(this._t * 1.3);
    fill(120, 50, 30, 160 + pulse * 40);
    rect(0, floorY, width, 4 + pulse * 2);
  }

  // ── Draw a multi-segment line from an array of [x,y] points (small
  // helper since p5's line() only takes a single segment). ────────────────
  _strokePolyline(pts) {
    for (let i = 0; i < pts.length - 1; i++) {
      line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    }
  }

  // ── World-space generators mapped through _sx every frame ────────────────
  // Both the vent pools and the crack network are tiled by a fixed bg-world
  // period and keyed by integer tile index (the same pattern _genFarMtns /
  // _genTrees use), so their world positions never change — only their
  // SCREEN position does, via _sx(bgX, camX, FX_NEAR). This is what makes
  // them scroll under the player instead of sitting glued to the screen the
  // way the old screen-space-cached version did.
  _getLavaVents(floorY, floorH, camX) {
    const period = 230;
    const f = this.FX_NEAR;
    const bgLeft  = camX * f - width / 2;
    const bgRight = camX * f + width / 2;
    const i0 = Math.floor(bgLeft / period) - 1;
    const i1 = Math.ceil(bgRight / period) + 1;
    const vents = [];
    for (let i = i0; i <= i1; i++) {
      const seed = i + 6100;
      if (this._r(seed + 1) < 0.35) continue; // most slots stay empty
      const bgX = i * period + (this._r(seed) - 0.5) * 90;
      vents.push({
        x: this._sx(bgX, camX, f),
        y: floorY + floorH * (0.3 + this._r(seed + 2) * 0.5),
        w: 16 + this._r(seed + 3) * 14,
        seed,
      });
    }
    return vents;
  }

  // ── Branching crack network — a handful of jagged "trunk" fissures
  // running across the crust, each occasionally splitting into a shorter
  // branch, built as connected jittered line segments (the same lightning-
  // bolt construction real ground cracks and the snow biome's silhouettes
  // both rely on for an organic, hand-cut look). Trunks are tiled in
  // bg-world space and their points mapped through _sx, so the whole
  // network scrolls with the floor instead of being painted on the screen. ─
  _getCrackNetwork(floorY, floorH, camX) {
    const period = 180;
    const f = this.FX_NEAR;
    const bgLeft  = camX * f - width / 2;
    const bgRight = camX * f + width / 2;
    const i0 = Math.floor(bgLeft / period) - 1;
    const i1 = Math.ceil(bgRight / period) + 1;

    const branches = [];
    for (let i = i0; i <= i1; i++) {
      const seed = i * 211 + 7000;
      const startBgX = i * period + period / 2 + (this._r(seed) - 0.5) * 80;
      const startX = this._sx(startBgX, camX, f);
      const startY = floorY + floorH * (0.05 + this._r(seed + 1) * 0.15);
      const segs = 5 + Math.floor(this._r(seed + 2) * 3);
      const pts = [[startX, startY]];
      let x = startX, y = startY;
      for (let s = 0; s < segs; s++) {
        x += (this._r(seed + 10 + s * 3) - 0.5) * 70;
        y += floorH / segs * (0.7 + this._r(seed + 11 + s * 3) * 0.5);
        pts.push([x, y]);
      }
      branches.push({ pts, seed });

      // Occasional short branch splitting off partway down the trunk
      if (this._r(seed + 5) > 0.4) {
        const splitIdx = 1 + Math.floor(this._r(seed + 6) * (pts.length - 2));
        const [bx, by] = pts[splitIdx];
        const bsegs = 2 + Math.floor(this._r(seed + 7) * 2);
        const bpts = [[bx, by]];
        let bx2 = bx, by2 = by;
        const dir = this._r(seed + 8) > 0.5 ? 1 : -1;
        for (let s = 0; s < bsegs; s++) {
          bx2 += dir * (18 + this._r(seed + 20 + s * 3) * 30);
          by2 += (this._r(seed + 21 + s * 3) - 0.5) * 30 + floorH * 0.08;
          bpts.push([bx2, by2]);
        }
        branches.push({ pts: bpts, seed: seed + 999 });
      }
    }
    return branches;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Draw one rock cluster: a tall jagged "mother" formation plus a few
  // shorter satellites — either rising from the lava floor (stalagmite) or
  // hanging from the cavern ceiling (stalactite). Lit from BELOW by the lava
  // glow rather than the upper-left "sun" every other biome uses.
  // ─────────────────────────────────────────────────────────────────────────────
  _drawRockCluster(cx, gndY, r) {
    push();
    noStroke();

    const dim = lerp(0.6, 1, r.depthZ);
    const [base, lit, shadow, glow] = r.palette;
    const mixC = (c) => Math.round(lerp(34, c, dim));

    for (let i = 0; i < r.satellites; i++) {
      const off = (i - (r.satellites - 1) / 2) * 36 + (this._r(r.seed + i * 5) - 0.5) * 16;
      const satScale = r.scale * (0.32 + this._r(r.seed + i * 7) * 0.22);
      this._drawSingleRock(cx + off, gndY, satScale, r.seed + i * 53 + 200, r.hangs,
        mixC(base[0]), mixC(base[1]), mixC(base[2]),
        mixC(lit[0]), mixC(lit[1]), mixC(lit[2]),
        mixC(shadow[0]), mixC(shadow[1]), mixC(shadow[2]),
        glow);
    }

    this._drawSingleRock(cx, gndY, r.scale, r.seed, r.hangs,
      mixC(base[0]), mixC(base[1]), mixC(base[2]),
      mixC(lit[0]), mixC(lit[1]), mixC(lit[2]),
      mixC(shadow[0]), mixC(shadow[1]), mixC(shadow[2]),
      glow);

    pop();
  }

  // ── A single jagged rock formation — stalagmite (rises from gndY) or
  // stalactite (hangs from the cavern ceiling above). Shaded with the lit
  // facet on the BOTTOM-facing side (toward the lava glow) instead of the
  // upper-left, plus 1-2 glowing magma veins running through the rock. ─────
  _drawSingleRock(cx, gndY, sc, seed, hangs, bR, bG, bB, lR, lG, lB, shR, shG, shB, glow) {
    const rv = (off) => this._r(seed + off);
    const h = (100 + rv(1) * 64) * sc;
    const w = (34 + rv(2) * 14) * sc;
    const lean = (rv(3) - 0.5) * w * 0.7;

    // For a stalactite, "gndY" passed in is actually the ceiling anchor and
    // the shape grows downward (tipY is below baseY); for a stalagmite it
    // grows upward from the floor, same as the ice biome's spikes.
    const baseY = gndY;
    const tipY  = hangs ? gndY + h : gndY - h;
    const tipX  = cx + lean;
    const dir   = hangs ? 1 : -1; // sign helper so the same formula works both ways

    const nz = (off, mag) => (rv(off) - 0.5) * mag;
    const pts = [
      [tipX, tipY],
      [cx + w * (0.30 + nz(10, 0.12)), gndY + dir * h * (0.78 + nz(11, 0.06))],
      [cx + w * (0.46 + nz(12, 0.10)), gndY + dir * h * (0.58 + nz(13, 0.08))],
      [cx + w * (0.34 + nz(14, 0.14)), gndY + dir * h * (0.40 + nz(15, 0.08))],
      [cx + w * (0.52 + nz(16, 0.10)), gndY + dir * h * (0.20 + nz(17, 0.06))],
      [cx + w * 0.5, baseY],
      [cx - w * 0.5, baseY],
      [cx - w * (0.52 + nz(18, 0.10)), gndY + dir * h * (0.20 + nz(19, 0.06))],
      [cx - w * (0.34 + nz(20, 0.14)), gndY + dir * h * (0.40 + nz(21, 0.08))],
      [cx - w * (0.46 + nz(22, 0.10)), gndY + dir * h * (0.58 + nz(23, 0.08))],
      [cx - w * (0.30 + nz(24, 0.12)), gndY + dir * h * (0.78 + nz(25, 0.06))],
    ];

    // Warm rim-glow where the formation meets the lava / lit zone — drawn
    // BEFORE the silhouette so it sits behind/around the base like ambient
    // bounce-light, the strongest single cue that light is coming from here.
    // Pulses gently in sync with the lava floor's own glow animation so the
    // whole scene reads as lit by one living light source, not two.
    const rimPulse = 0.8 + 0.2 * Math.sin(this._t * 1.3 + seed * 0.7);
    fill(glow[0], glow[1], glow[2], 110 * rimPulse);
    ellipse(cx, baseY, w * 2.0, 34 * sc);
    fill(glow[0], glow[1], glow[2], 70 * rimPulse);
    ellipse(cx, baseY, w * 2.8, 50 * sc);

    // Base silhouette
    fill(bR, bG, bB);
    beginShape();
    for (const p of pts) vertex(p[0], p[1]);
    endShape(CLOSE);

    // Lit facet — on a stalagmite the glow comes from the floor, so the
    // BASE/lower half is strongly lit and the tip fades to shadow; a
    // hanging stalactite is lit on its tip (closest to the lava below) and
    // dark near the ceiling. Covers roughly the lower/near half now, not a
    // thin sliver, so the bottom-lit read is unmistakable.
    fill(lR, lG, lB, 235);
    if (hangs) {
      beginShape();
      vertex(tipX, tipY);
      vertex(cx + w * (0.30 + nz(10, 0.12)), gndY + dir * h * (0.78 + nz(11, 0.06)));
      vertex(cx + w * (0.34 + nz(14, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(15, 0.08)));
      vertex(cx - w * (0.34 + nz(20, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(21, 0.08)));
      vertex(cx - w * (0.34 + nz(20, 0.14)), gndY + dir * h * (0.40 + nz(21, 0.08)));
      vertex(cx - w * (0.46 + nz(22, 0.10)), gndY + dir * h * (0.58 + nz(23, 0.08)));
      endShape(CLOSE);
    } else {
      beginShape();
      vertex(cx + w * (0.34 + nz(14, 0.14)), gndY + dir * h * (0.40 + nz(15, 0.08)));
      vertex(cx + w * (0.52 + nz(16, 0.10)), gndY + dir * h * (0.20 + nz(17, 0.06)));
      vertex(cx + w * 0.5, baseY);
      vertex(cx - w * 0.5, baseY);
      vertex(cx - w * (0.52 + nz(18, 0.10)), gndY + dir * h * (0.20 + nz(19, 0.06)));
      vertex(cx - w * (0.34 + nz(20, 0.14)), gndY + dir * h * (0.40 + nz(21, 0.08)));
      endShape(CLOSE);
    }

    // Shadow facet — the portion furthest from the lava glow (upper half)
    fill(shR, shG, shB, 215);
    if (hangs) {
      beginShape();
      vertex(cx + w * (0.34 + nz(14, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(15, 0.08)));
      vertex(cx + w * (0.52 + nz(16, 0.10)), gndY + dir * h * (0.20 + nz(17, 0.06)));
      vertex(cx + w * 0.5, baseY);
      vertex(cx - w * 0.5, baseY);
      vertex(cx - w * (0.52 + nz(18, 0.10)), gndY + dir * h * (0.20 + nz(19, 0.06)));
      vertex(cx - w * (0.34 + nz(20, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(21, 0.08)));
      endShape(CLOSE);
    } else {
      beginShape();
      vertex(tipX, tipY);
      vertex(cx + w * (0.30 + nz(10, 0.12)), gndY + dir * h * (0.78 + nz(11, 0.06)));
      vertex(cx + w * (0.34 + nz(14, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(15, 0.08)));
      vertex(cx - w * (0.34 + nz(20, 0.14)) * 0.6, gndY + dir * h * (0.40 + nz(21, 0.08)));
      vertex(cx - w * (0.34 + nz(20, 0.14)), gndY + dir * h * (0.40 + nz(21, 0.08)));
      vertex(cx - w * (0.46 + nz(22, 0.10)), gndY + dir * h * (0.58 + nz(23, 0.08)));
      endShape(CLOSE);
    }

    // ── Surface texture mottling — small rough flecks of slightly darker/
    // lighter tone scattered over the body, breaking up the two perfectly
    // flat facets so the rock reads as pitted volcanic stone rather than a
    // smooth painted icon. Flecks are clipped to roughly the rock's own
    // silhouette width at each height band so they don't spill outside it. ──
    const fleckCount = 9 + Math.floor(rv(40) * 5);
    for (let f = 0; f < fleckCount; f++) {
      const ft = rv(41 + f * 3);              // 0 = base, 1 = tip
      const rowY = hangs ? baseY + dir * h * ft : baseY - h * ft;
      // Width of the silhouette at this height fraction narrows linearly
      // toward the tip — approximate using the base half-width tapering.
      const rowHalfW = w * 0.5 * (1 - ft * 0.62);
      const fx = cx + (rv(42 + f * 3) - 0.5) * rowHalfW * 1.5;
      const dark = rv(43 + f * 3) > 0.5;
      const fsize = (3 + rv(44 + f * 3) * 5) * sc;
      fill(dark ? shR : lR, dark ? shG : lG, dark ? shB : lB, dark ? 70 : 50);
      ellipse(fx, rowY, fsize, fsize * 0.7);
    }

    // ── Columnar fracture lines — basalt's signature joint cracks, a couple
    // of straight dark hairlines running roughly along the rock's long
    // axis with a small zigzag offset, distinct from the glowing magma vein.
    const frac1X = cx + (rv(50) - 0.5) * w * 0.55;
    const frac1MidX = frac1X + (rv(51) - 0.5) * w * 0.25;
    stroke(shR * 0.6, shG * 0.6, shB * 0.6, 120);
    strokeWeight(1 * sc);
    line(frac1X, baseY + dir * h * 0.05, frac1MidX, baseY + dir * h * 0.45);
    line(frac1MidX, baseY + dir * h * 0.45, frac1X + (rv(52) - 0.5) * w * 0.3, baseY + dir * h * 0.8);
    noStroke();

    // Glowing magma vein running through the rock — a soft wide under-glow
    // (so the light reads as bleeding through the crack from inside the
    // rock) with a thin bright core on top, anchored near the lava-facing
    // end and fading out toward the far tip.
    const veinNearY = hangs ? tipY : baseY;
    const veinFarY  = hangs ? baseY - h * 0.30 : tipY + h * 0.30;
    const veinX1 = cx + (rv(30) - 0.5) * w * 0.4;
    const veinX2 = cx + (rv(31) - 0.5) * w * 0.5;
    const veinMidX = (veinX1 + veinX2) / 2 + (rv(32) - 0.5) * w * 0.3;
    const veinMidY = (veinNearY + veinFarY) / 2;
    stroke(glow[0], glow[1], glow[2], 130);
    strokeWeight(7 * sc);
    line(veinX1, veinNearY, veinMidX, veinMidY);
    line(veinMidX, veinMidY, veinX2, veinFarY);
    stroke(255, 200, 130, 200);
    strokeWeight(2.6 * sc);
    line(veinX1, veinNearY, veinMidX, veinMidY);
    line(veinMidX, veinMidY, veinX2, veinFarY);
    stroke(255, 240, 210, 230);
    strokeWeight(1 * sc);
    line(veinX1, veinNearY, veinMidX, veinMidY);
    line(veinMidX, veinMidY, veinX2, veinFarY);
    noStroke();
  }
}
