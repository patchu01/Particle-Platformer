// ─────────────────────────────────────────────────────────────────────────────
// LevelSelectScreen.js
// Addon: a 25-slot level-select screen styled after Levelmania's medals menu
// (dark teal→green diagonal panel, off-white rows skewed into parallelograms,
// a white-bordered preview card on the right). Pure p5 canvas drawing,
// matching the rest of this project's style (procedural shapes, no external
// image assets, polled input via mouseIsPressed like Btn.js).
//
// Opened by the main menu's Play button (state 5) instead of jumping
// straight into a level — no ball is spawned until a slot is actually
// clicked, which then hands off into the existing state==3 gameplay flow.
//
// Storage:
//   localStorage 'pp_username'                — the player's chosen name
//   localStorage 'top5_<levelKey>'             — JSON array of up to 5
//                                                 {name, time} entries, sorted
//                                                 ascending (fastest first).
//                                                 Used as an instant local
//                                                 fallback/cache; the real
//                                                 top 5 shown to the player
//                                                 comes from Supabase (see
//                                                 remoteLeaderboards below).
//   localStorage 'bestTime_<levelKey>'         — already used elsewhere in
//                                                 this project; read here too
//                                                 so "your best" always shows
//                                                 the true PB even if it
//                                                 predates the top-5 feature.
//                                                 The player's personal best
//                                                 stays local-only — only the
//                                                 top-5 board is global.
//
//   <levelKey> above is NOT a level ID — every level (built-in or
//   custom/editor-made) is identified by a hash of its own data string
//   (see hashLevelData()/levelKeyFor() in Var+startUp.js), so progress and
//   leaderboards never break if the built-in levels[] array is reordered.
// ─────────────────────────────────────────────────────────────────────────────

class LevelSelectScreen {
  constructor() {
    // ── Levelmania-ish palette ────────────────────────────────────────────
    this.COL_PANEL_DARK   = [10, 46, 42];     // deep teal, top-left of panel
    this.COL_PANEL_LIGHT  = [33, 150, 110];   // brighter green, bottom-right
    this.COL_ROW_BG       = [223, 232, 224];  // off-white/mint row background
    this.COL_ROW_BG_BEST  = [12, 30, 26];     // dark "selected" row (slot 01 in ref)
    this.COL_TEXT_DARK    = [18, 50, 44];
    this.COL_TEXT_LIGHT   = [255, 255, 255];
    this.COL_CARD_BORDER  = [255, 255, 255];
    this.COL_GOLD         = [233, 180, 60];
    this.COL_SILVER       = [192, 198, 204];
    this.COL_BRONZE       = [176, 116, 64];
    this.COL_NONE_RING    = [70, 110, 96];

    // ── Layout constants (recomputed each frame from current width/height) ─
    this.cols = 5;
    this.rows = 5;
    this.slotCount = this.cols * this.rows;

    // Currently hovered slot index (0-based), or -1 if none
    this.hoveredIndex = -1;

    // Last hovered slot index to preserve preview when mouse leaves buttons
    this.lastHoveredIndex = 0;

    // Cache of real rendered level snapshots, keyed by levelId — populated
    // once by generateThumbnails() at startup, after the menu's own level
    // state is established. Each entry is a full-canvas-sized p5.Image
    // (background + platforms + particles + hazards, no ball) capturing
    // exactly what the player sees the instant they spawn into that level.
    this.thumbnails = {};
    this.customThumbnails = {};

    // Global (Supabase) top-5 leaderboard cache, keyed by levelKeyFor(data).
    // Each entry: { entries: [{name, time}], loading: bool, fetchedAt: ms }.
    // Populated lazily by _ensureRemoteLeaderboard() whenever a level's
    // preview card is shown, and refreshed periodically/after a submission
    // so the board catches up with other players' runs without the player
    // needing to do anything. Local localStorage top5 (see getLocalTop5())
    // is the fallback shown while a level's first fetch is in flight, or if
    // Supabase is unreachable.
    this.remoteLeaderboards = {};

    // Username editing overlay state
    this.editingName = false;
    this.nameDraft = '';

    // Delete-confirmation overlay state — set when the player clicks a
    // custom level's ✕ button, so deletion only actually happens after an
    // explicit confirm rather than on the first click (deleting a saved
    // level is permanent and unrecoverable).
    this.confirmDeleteId = null;
    this.confirmDeleteName = '';

    // ── Category tabs (addon) ──────────────────────────────────────────────
    // PolyLevel-style row of tabs above the level grid switching between the
    // built-in levels and the player's own editor-made levels. 'campaign' is
    // the original 25-slot grid this class always had; 'custom' lists every
    // level saved via the Editor's Save button (see Editor.js / 'custom_levels').
    this.category = 'campaign'; // 'campaign' | 'custom'
    this.customScrollOffset = 0; // for paging if there are more custom levels than fit on screen

    this._loadUsername();
  }

  // ── Username persistence ──────────────────────────────────────────────
  _loadUsername() {
    const stored = localStorage.getItem('pp_username');
    this.username = stored && stored.length > 0 ? stored : 'Player';
  }

  _saveUsername(name) {
    const trimmed = (name || '').trim().slice(0, 16);
    if (trimmed.length === 0) return;
    this.username = trimmed;
    localStorage.setItem('pp_username', trimmed);
  }

  openAccountEditor() {
    this.nameDraft = this.username;
    this.editingName = true;
  }

  // Called from sketch-1.js's keyPressed() while the editor overlay is open.
  // p5 has no native text field, so backspace/enter/escape and printable
  // characters are handled manually here.
  handleNameKey(k, keyCode) {
    if (!this.editingName) return;
    if (keyCode === ENTER || keyCode === RETURN) {
      this._saveUsername(this.nameDraft);
      this.editingName = false;
    } else if (keyCode === ESCAPE) {
      this.editingName = false;
    } else if (keyCode === BACKSPACE) {
      this.nameDraft = this.nameDraft.slice(0, -1);
    } else if (k && k.length === 1 && this.nameDraft.length < 16) {
      // Printable single character (letters, numbers, punctuation)
      this.nameDraft += k;
    }
  }

  // ── Top-5 + personal-best storage ─────────────────────────────────────
  // levelData is the level's raw data string (Level.data) — NOT a level ID.
  // Every lookup here hashes it via levelKeyFor() to get a storage key, so
  // built-in and custom levels share one identity scheme and nothing breaks
  // if the built-in levels[] array is reordered.
  _top5Key(levelData) {
    return `top5_${levelKeyFor(levelData)}`;
  }

  // Local (per-browser) top-5 cache — used as an instant fallback while the
  // real Supabase leaderboard for this level is loading, and as an offline
  // fallback if Supabase is unreachable or the player isn't logged in.
  getLocalTop5(levelData) {
    const raw = localStorage.getItem(this._top5Key(levelData));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  // Kicks off (or reuses) a fetch of the GLOBAL top-5 board for this level
  // from Supabase. Safe to call every frame — it only actually hits the
  // network once per level per refreshMs window. Returns whatever's cached
  // right now (possibly stale/empty); the cache updates itself in place
  // once the fetch resolves, so the next draw() picks up the fresh list.
  _ensureRemoteLeaderboard(levelData, refreshMs = 15000) {
    if (!levelData) return [];
    const key = levelKeyFor(levelData);
    const cache = this.remoteLeaderboards[key];
    const now = Date.now();

    if (!cache || (!cache.loading && now - cache.fetchedAt > refreshMs)) {
      this.remoteLeaderboards[key] = {
        entries: cache ? cache.entries : [],
        loading: true,
        fetchedAt: now,
      };
      if (typeof fetchLevelLeaderboard === 'function') {
        fetchLevelLeaderboard(levelData).then((entries) => {
          this.remoteLeaderboards[key] = { entries, loading: false, fetchedAt: Date.now() };
        }).catch((err) => {
          console.warn('Leaderboard fetch failed, keeping local fallback:', err);
          const stale = this.remoteLeaderboards[key];
          if (stale) stale.loading = false;
        });
      } else {
        // supabase.js not loaded yet (or page is offline) — just mark not-loading
        // so we don't spin forever; getTop5() will fall back to local data.
        this.remoteLeaderboards[key].loading = false;
      }
    }
    return this.remoteLeaderboards[key].entries;
  }

  // Returns the list shown on the "TOP 5" board: the global Supabase
  // leaderboard once it has loaded for this level, falling back to the
  // local per-browser cache (instant, no network) until then.
  getTop5(levelData) {
    const remote = this._ensureRemoteLeaderboard(levelData);
    if (remote && remote.length > 0) return remote;
    return this.getLocalTop5(levelData);
  }

  // Call this whenever a run finishes (alongside the existing saveBestTime
  // call in this project) to keep the top-5 board up to date. Updates the
  // local fallback list immediately (so the board never looks empty/stale
  // right after a run) and pushes the run to the global Supabase
  // leaderboard, then re-fetches that level's board shortly after so other
  // players' best times — and the player's own new rank — show up.
  submitTime(levelData, time) {
    const list = this.getLocalTop5(levelData);
    list.push({ name: this.username, time: time });
    list.sort((a, b) => a.time - b.time);
    const trimmed = list.slice(0, 5);
    localStorage.setItem(this._top5Key(levelData), JSON.stringify(trimmed));

    if (typeof submitLevelScore === 'function') {
      submitLevelScore(levelData, time);
      // Force the next getTop5() call for this level to hit the network
      // again rather than serving the (now stale) cached board.
      const key = levelKeyFor(levelData);
      delete this.remoteLeaderboards[key];
    }

    return trimmed;
  }

  getPersonalBest(levelData) {
    // Personal best is intentionally untouched by the Supabase changes —
    // it's still read straight from this project's existing local best-time
    // store (used by the in-game HUD too), falling back to the top-5
    // board's fastest local entry if that's all that's available.
    if (typeof getBestTime === 'function') {
      const existing = getBestTime(levelData);
      if (existing !== null) return existing;
    }
    const top5 = this.getLocalTop5(levelData);
    return top5.length > 0 ? top5[0].time : null;
  }

  // ── Time formatting — mm:ss.mmm, matching Levelmania's own readout ─────
  _formatTime(seconds) {
    if (seconds === null || seconds === undefined) return '--:--.---';
    const m = Math.floor(seconds / 60);
    const s = seconds - m * 60;
    const sStr = s.toFixed(3).padStart(6, '0');
    return `${String(m).padStart(2, '0')}:${sStr}`;
  }

  // Maps one of the 25 display slots onto one of this project's real,
  // playable levels (levels[1..length-1], skipping the menu level at index
  // 0), cycling round-robin so every slot is clickable and playable even
  // though there are only a handful of real layouts behind them.
  _levelIdForSlot(slotIndex) {
    const playable = (typeof levels !== 'undefined' && levels.length > 1)
      ? levels.length - 1
      : 1;
    return 1 + (slotIndex % playable);
  }

  _levelNameForSlot(slotIndex) {
    const levelId = this._levelIdForSlot(slotIndex);
    const bg = (typeof levels !== 'undefined' && levels[levelId])
      ? levels[levelId].background
      : 'none';
    const label = bg && bg !== 'none'
      ? bg.charAt(0).toUpperCase() + bg.slice(1)
      : 'Level';
    return `${label} ${String(slotIndex + 1).padStart(2, '0')}`;
  }

  // ── Real level snapshots ─────────────────────────────────────────────────
  // Generates one cached image per real playable level, each one an actual
  // render of that level's opening view (parallax background, platforms in
  // their real colours, particles, water/bounce/etc.) — not a stylised
  // stand-in. Runs once at startup; the grid/preview panel just blit the
  // cached image afterward, so normal play is never slowed down by this.
  generateThumbnails() {
    if (typeof levels === 'undefined' || levels.length <= 1) return;
    for (let id = 1; id < levels.length; id++) {
      this.thumbnails[id] = this._renderLevelSnapshot(id);
    }
  }

  // Loads a single level into the SAME global arrays the real game uses
  // (there's no separate "preview" set of platform/particle arrays in this
  // project), renders its first-frame view onto an offscreen buffer sized
  // to the main canvas, captures that as a still image, then fully restores
  // whatever was previously loaded (so generating a thumbnail can never
  // leak into — or get interrupted by — whatever the player is actually
  // doing). The ball itself is intentionally never drawn here.
  _renderLevelSnapshot(levelId) {
    // ── Save everything this touches ───────────────────────────────────
    const saved = {
      platforms, waterZones, finishes, checkpoints, gravZones, bouncePads,
      particles, circlePlatforms, powerUps, movingPlatforms, fans, signs,
      activeBackground, activeLevelId,
      startPos: startPos.copy(),
      cameraLocation: cameraLocation.copy(),
    };

    // ── Clear and load the target level fresh, exactly like resetLevel()/
    // exitToMenu() do before loading a different level ──────────────────
    platforms = []; waterZones = []; finishes = []; checkpoints = []; signs = [];
    gravZones = []; bouncePads = []; particles = []; circlePlatforms = [];
    powerUps = []; movingPlatforms = []; fans = [];

    const bgName = levels[levelId].background;
    if (bgName === 'snow') activeBackground = new SnowBackground();
    else if (bgName === 'forest') activeBackground = new ForestBackground();
    else if (bgName === 'ice') activeBackground = new IceBackground();
    else if (bgName === 'volcano') activeBackground = new VolcanoBackground();
    else if (bgName === 'space') activeBackground = new SpaceBackground();
    else activeBackground = null;

    activeLevelId = levelId;
    loadLevelData(levels[levelId].data.split(' '));
    // loadLevelData sets startPos as a side effect (category 0 type 0) —
    // that's the exact spawn point the player would load into, so it's
    // also where the snapshot's camera should be centered.
    cameraLocation.set(startPos.x, startPos.y);

    // ── Render the real first-frame view onto an offscreen buffer ───────
    // Buffer is full canvas size so every absolute-pixel draw call inside
    // the background classes and Platform/Particle/etc. show() methods
    // (which all reference the global width/height, not buffer-relative
    // coordinates) lines up exactly the way it does on the main canvas.
    const buf = createGraphics(width, height);
    buf.background(255);

    this._drawToBuffer(buf, () => {
      strokeWeight(0);
      if (activeBackground) {
        const parallaxCam = parallaxCamera(cameraLocation);
        activeBackground.update(parallaxCam);
        activeBackground.draw(parallaxCam);
      }
      push();
      translate(width / 2 - cameraLocation.x, height / 2 - cameraLocation.y);
      fans.forEach((f) => f.show());
      platforms.forEach((p) => p.show());
      signs.forEach((s) => s.show());
      circlePlatforms.forEach((cp) => cp.show());
      bouncePads.forEach((b) => b.show());
      movingPlatforms.forEach((mp) => mp.show());
      finishes.forEach((f) => f.show());
      checkpoints.forEach((c) => c.show());
      waterZones.forEach((w) => w.show());
      gravZones.forEach((g) => g.show());
      powerUps.forEach((pu) => pu.show());
      particles.forEach((p) => p.show());
      pop();
    });

    const snapshot = buf.get();
    buf.remove();

    // ── Restore everything exactly as it was ─────────────────────────────
    platforms = saved.platforms; waterZones = saved.waterZones;
    finishes = saved.finishes; checkpoints = saved.checkpoints; signs = saved.signs || [];
    gravZones = saved.gravZones; bouncePads = saved.bouncePads;
    particles = saved.particles; circlePlatforms = saved.circlePlatforms;
    powerUps = saved.powerUps; movingPlatforms = saved.movingPlatforms;
    fans = saved.fans;
    activeBackground = saved.activeBackground;
    activeLevelId = saved.activeLevelId;
    startPos = saved.startPos;
    cameraLocation = saved.cameraLocation;

    return snapshot;
  }

  // p5.Graphics buffers expose their own drawing API (buf.rect, buf.fill,
  // ...), but every show()/draw() method in this project — backgrounds,
  // Platform, Particle, etc. — calls the bare global versions (rect(...),
  // fill(...)) instead of this.rect(...). To reuse that real drawing code
  // unmodified for a snapshot, every primitive it might call is pointed at
  // the buffer's own version for the duration of one callback, then handed
  // back untouched. width/height are also swapped to the buffer's own
  // dimensions (here equal to the main canvas's, since the buffer is
  // created at createGraphics(width, height)) so anything that reads them
  // mid-callback sees consistent values.
  _drawToBuffer(buf, drawFn) {
    const prims = ['fill','noFill','stroke','noStroke','strokeWeight','rect',
      'circle','ellipse','triangle','quad','line','arc','beginShape','endShape',
      'vertex','quadraticVertex','push','pop','translate','rotate','scale','text',
      'textAlign','textSize','textFont','textStyle','image','lerpColor','curveVertex',
      'bezierVertex','rectMode'];
    const realFns = {};
    for (const name of prims) {
      if (typeof window[name] === 'function') {
        realFns[name] = window[name];
        window[name] = buf[name].bind(buf);
      }
    }
    // drawingContext is a raw CanvasRenderingContext2D reference, not a
    // p5 global function — movingPlatforms.js calls it directly
    // (drawingContext.setLineDash(...)) to draw its dashed path-preview
    // line. Swapping it too means that dash state lands on the buffer's
    // own context instead of leaking onto the main canvas's.
    const realDrawingContext = window.drawingContext;
    if (buf.drawingContext) window.drawingContext = buf.drawingContext;
    try {
      drawFn();
    } finally {
      for (const name of prims) {
        if (realFns[name]) window[name] = realFns[name];
      }
      window.drawingContext = realDrawingContext;
    }
  }

  // ── Layout ──────────────────────────────────────────────────────────────
  _layout() {
    const panelX = width * 0.04;
    const panelY = height * 0.06;
    const panelW = width * 0.55;
    const panelH = height * 0.88;

    // Category tab strip — sits above the grid, inside the top of the
    // panel, listing 'Campaign' (built-in levels) and 'Custom' (the
    // player's own editor-made levels, saved via the Editor's Save button).
    const tabBarY = panelY + panelH * 0.02;
    const tabBarH = panelH * 0.08;
    const tabDefs = [
      { key: 'campaign', label: 'CAMPAIGN' },
      { key: 'custom', label: 'CUSTOM' },
    ];
    const tabW = panelW * 0.24;
    const tabGap = panelW * 0.02;
    const tabRects = tabDefs.map((t, i) => ({
      key: t.key, label: t.label,
      x: panelX + panelW * 0.06 + i * (tabW + tabGap),
      y: tabBarY, w: tabW, h: tabBarH,
    }));

    const gridX = panelX + panelW * 0.25;
    const customGridX = panelX + panelW * 0.05;
    const gridY = tabBarY + tabBarH + panelH * 0.07;
    const gridW = panelW * 0.60;
    const gridH = panelH * 0.70;

    const gapX = gridW * 0.018;
    const gapY = gridH * 0.022;
    const slotW = (gridW - gapX * (this.cols - 1)) / this.cols;
    const slotH = (gridH - gapY * (this.rows - 1)) / this.rows;

    const previewX = panelX + panelW + width * 0.04;
    const previewY = panelY + panelH * 0.14;
    const previewW = Math.min(width * 0.28, width * 0.92 - previewX);

    // Diagonal slant applied to every grid slot (Levelmania-style
    // parallelogram rows). Clamped to the actual clearance between the
    // grid's right edge and the panel's right edge — minus a small safety
    // margin — so the slanted top-right corner can never spill past the
    // panel regardless of window aspect ratio (tall/narrow canvases would
    // otherwise overflow if skew were derived purely from slot height).
    const rightMargin = (panelX + panelW) - (gridX + gridW);
    const skew = Math.max(0, Math.min(slotH * 0.55, rightMargin * 0.85));

    return {
      panelX, panelY, panelW, panelH,
      tabRects,
      gridX, customGridX, gridY, gridW, gridH,
      gapX, gapY, slotW, slotH, skew,
      previewX, previewY, previewW,
    };
  }

  // ── Hit testing / hover (polled each frame, same pattern as Btn.js) ────
  update() {
    const L = this._layout();
    const skew = L.skew;
    this.hoveredIndex = -1;
    this.hoveredTab = -1;

    for (let i = 0; i < L.tabRects.length; i++) {
      const r = L.tabRects[i];
      if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
        this.hoveredTab = i;
        break;
      }
    }

    if (this.category === 'campaign') {
      for (let i = 0; i < this.slotCount; i++) {
        const col = i % this.cols;
        const row = Math.floor(i / this.cols);
        const sx = L.gridX + col * (L.slotW + L.gapX) - row * skew;
        const sy = L.gridY + row * (L.slotH + L.gapY);
        if (this._pointInSkewedSlot(mouseX, mouseY, sx, sy, L.slotW, L.slotH, skew)) {
          this.hoveredIndex = i;
          this.lastHoveredIndex = i;  // Update last hovered when a button is hovered
          break;
        }
      }
    } else {
      const fullList = this._customLevels();
      const rowH = L.gridH / this.rows;
      const totalPages = Math.max(1, Math.ceil(fullList.length / this.rows));
      this.customScrollOffset = Math.max(0, Math.min(this.customScrollOffset, totalPages - 1));
      const pageStart = this.customScrollOffset * this.rows;
      const pageLength = Math.min(this.rows, fullList.length - pageStart);
      const sx = L.customGridX;
      const sw = L.gridW;
      for (let row = 0; row < pageLength; row++) {
        const ry = L.gridY + row * rowH;
        const h = rowH * 0.88;
        if (mouseX >= sx && mouseX <= sx + sw && mouseY >= ry && mouseY <= ry + h) {
          this.hoveredIndex = pageStart + row;
          this.lastHoveredIndex = pageStart + row;
          break;
        }
      }
    }
  }

  // Returns every level saved from the editor (most recently updated first).
  _customLevels() {
    try {
      const raw = localStorage.getItem('custom_levels');
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed.slice() : [];
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return list;
    } catch (e) {
      return [];
    }
  }

  // Returns the tab index that was just clicked, or -1.
  clickedTab() {
    if (this.hoveredTab === -1) return -1;
    if (mouseIsPressed) return this.hoveredTab;
    return -1;
  }

  // Point-in-parallelogram test matching _drawSkewedSlot's shape: at a
  // given mouseY, the slot's left/right edges have shifted right by an
  // amount that interpolates linearly from `skew` at the top to 0 at the
  // bottom, so we compute that row-relative offset before comparing X.
  _pointInSkewedSlot(px, py, x, y, w, h, skew) {
    if (py < y || py > y + h) return false;
    const t = (py - y) / h; // 0 at top, 1 at bottom
    const rowSkew = skew * (1 - t);
    const left = x + rowSkew;
    const right = x + w + rowSkew;
    return px >= left && px <= right;
  }

  // Returns the slot index that was just clicked, or -1. Call once per
  // mouse-press edge (e.g. guarded by a "was pressed last frame" flag in
  // sketch-1.js) the same way Btn.clickCheck() is polled elsewhere.
  // In the 'custom' category this indexes into _customLevels() instead of
  // the fixed 25-slot campaign grid — sketch-1.js checks this.category to
  // know which list the returned index applies to.
  clickedSlot() {
    if (this.hoveredIndex === -1) return -1;
    if (mouseIsPressed) return this.hoveredIndex;
    return -1;
  }

  // Close button lives top-right of the panel, mirroring the reference image.
  _closeButtonRect() {
    const L = this._layout();
    const size = Math.min(width, height) * 0.04;
    return {
      x: L.panelX + L.panelW + width * 0.02,
      y: L.panelY - size * 0.3,
      size,
    };
  }

  closeClicked() {
    const r = this._closeButtonRect();
    const hovering = mouseX >= r.x && mouseX <= r.x + r.size &&
                      mouseY >= r.y && mouseY <= r.y + r.size;
    return hovering && mouseIsPressed;
  }

  // ── Drawing ─────────────────────────────────────────────────────────────
  show() {
    push();
    noStroke();
    this._drawPanelBackground();
    this._drawGrid();
    this._drawPreviewPanel();
    this._drawCloseButton();
    if (this.editingName) this._drawAccountOverlay();
    if (this.confirmDeleteId !== null) this._drawDeleteConfirmOverlay();
    pop();
  }

  _drawPanelBackground() {
    const L = this._layout();
    // Diagonal gradient fill approximating the reference's skewed green
    // panel, built from horizontal strips tinted by a diagonal t value so
    // it reads as a single smooth diagonal sweep rather than a vertical one.
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const r = lerp(this.COL_PANEL_DARK[0], this.COL_PANEL_LIGHT[0], t);
      const g = lerp(this.COL_PANEL_DARK[1], this.COL_PANEL_LIGHT[1], t);
      const b = lerp(this.COL_PANEL_DARK[2], this.COL_PANEL_LIGHT[2], t);
      fill(r, g, b);
      const y0 = (height / steps) * i;
      const y1 = (height / steps) * (i + 1) + 1;
      rect(0, y0, width, y1 - y0);
    }
  }

  _drawGrid() {
    const L = this._layout();
    textAlign(LEFT, CENTER);
    textFont(gameFont);

    this._drawCategoryTabs(L);

    if (this.category === 'campaign') {
      this._drawCampaignGrid(L);
    } else {
      this._drawCustomList(L);
    }
  }

  // ── Category tabs (addon) ──────────────────────────────────────────────
  _drawCategoryTabs(L) {
    for (const r of L.tabRects) {
      const isActive = this.category === r.key;
      const isHovered = this.hoveredTab !== -1 && L.tabRects[this.hoveredTab] === r;
      fill(isActive ? this.COL_ROW_BG[0] : isHovered ? 255 : 0,
           isActive ? this.COL_ROW_BG[1] : isHovered ? 255 : 0,
           isActive ? this.COL_ROW_BG[2] : isHovered ? 255 : 0,
           isActive ? 255 : isHovered ? 60 : 30);
      rect(r.x, r.y, r.w, r.h, r.h * 0.18);

      fill(isActive ? this.COL_TEXT_DARK[0] : this.COL_TEXT_LIGHT[0],
           isActive ? this.COL_TEXT_DARK[1] : this.COL_TEXT_LIGHT[1],
           isActive ? this.COL_TEXT_DARK[2] : this.COL_TEXT_LIGHT[2]);
      textAlign(CENTER, CENTER);
      textSize(r.h * 0.4);
      text(r.label, r.x + r.w / 2, r.y + r.h / 2);
    }
    textAlign(LEFT, CENTER);
  }

  _drawCampaignGrid(L) {
    // How far the right edge of each row shifts upward relative to the
    // left edge, producing the slanted-parallelogram look Levelmania uses
    // for its menu rows. Pre-clamped in _layout() so it can never spill
    // past the panel's edge on any aspect ratio.
    const skew = L.skew;

    for (let i = 0; i < this.slotCount; i++) {
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      // Offset each row by -skew to align the diagonal left edges into a straight line
      const sx = L.gridX + col * (L.slotW + L.gapX) - row * skew;
      const sy = L.gridY + row * (L.slotH + L.gapY);
      const isHovered = i === this.hoveredIndex;

      // Row background — dark "selected" treatment for the hovered slot,
      // mint/off-white otherwise (matches slot 01 in the reference image).
      if (isHovered) {
        fill(this.COL_ROW_BG_BEST[0], this.COL_ROW_BG_BEST[1], this.COL_ROW_BG_BEST[2]);
      } else {
        fill(this.COL_ROW_BG[0], this.COL_ROW_BG[1], this.COL_ROW_BG[2]);
      }
      this._drawSkewedSlot(sx, sy, L.slotW, L.slotH, skew);

      // Slot number — positioned on the left side of the button
      const midX = sx + skew * 0.5;
      const midY = sy + L.slotH / 2;
      fill(isHovered ? this.COL_TEXT_LIGHT[0] : this.COL_TEXT_DARK[0],
           isHovered ? this.COL_TEXT_LIGHT[1] : this.COL_TEXT_DARK[1],
           isHovered ? this.COL_TEXT_LIGHT[2] : this.COL_TEXT_DARK[2]);
      textAlign(LEFT, CENTER);
      textSize(L.slotH * 0.42);
      text(String(i + 1).padStart(2, '0'), midX + L.slotW * 0.12, midY);
    }
  }

  // Custom levels are listed as a simple vertical list (rather than forced
  // into the fixed 5x5 campaign grid) since there are usually only a
  // handful, and each row needs room for its name + a delete button.
  // Paginated via customScrollOffset (in whole pages of this.rows rows)
  // so a player with more custom levels than fit on screen can still reach
  // every one of them, not just the first few.
  _drawCustomList(L) {
    const list = this._customLevels();
    const rowH = L.gridH / this.rows;
    this._customRowRects = [];

    if (list.length === 0) {
      fill(this.COL_TEXT_LIGHT[0], this.COL_TEXT_LIGHT[1], this.COL_TEXT_LIGHT[2], 180);
      textAlign(CENTER, CENTER);
      textSize(L.gridW * 0.035);
      text('No custom levels yet — make one in the Editor!', L.gridX + L.gridW / 2, L.gridY + L.gridH * 0.4);
      textAlign(LEFT, CENTER);
      return;
    }

    const totalPages = Math.max(1, Math.ceil(list.length / this.rows));
    this.customScrollOffset = Math.max(0, Math.min(this.customScrollOffset, totalPages - 1));
    const pageStart = this.customScrollOffset * this.rows;
    const pageItems = list.slice(pageStart, pageStart + this.rows);
    const sx = L.customGridX;
    const sw = L.gridW;

    for (let row = 0; row < pageItems.length; row++) {
      const i = pageStart + row;
      const ry = L.gridY + row * rowH;
      const h = rowH * 0.88;
      const isHovered = i === this.hoveredIndex;

      fill(isHovered ? this.COL_ROW_BG_BEST[0] : this.COL_ROW_BG[0],
           isHovered ? this.COL_ROW_BG_BEST[1] : this.COL_ROW_BG[1],
           isHovered ? this.COL_ROW_BG_BEST[2] : this.COL_ROW_BG[2]);
      rect(sx, ry, sw, h, h * 0.18);

      // Text on the left area of the row
      fill(isHovered ? this.COL_TEXT_LIGHT[0] : this.COL_TEXT_DARK[0],
           isHovered ? this.COL_TEXT_LIGHT[1] : this.COL_TEXT_DARK[1],
           isHovered ? this.COL_TEXT_LIGHT[2] : this.COL_TEXT_DARK[2]);
      textAlign(LEFT, CENTER);
      textSize(h * 0.32);
      text(pageItems[row].name || 'Untitled Level', sx + sw * 0.04, ry + h / 2);

      // Delete button positioned relative to the row's right edge
      const delSize = h * 0.5;
      const delX = sx + sw - delSize - sw * 0.02;
      const delY = ry + (h - delSize) / 2;
      const delRect = { x: delX, y: delY, w: delSize, h: delSize, id: pageItems[row].id };
      const hoveringDel = mouseX >= delRect.x && mouseX <= delRect.x + delRect.w &&
                           mouseY >= delRect.y && mouseY <= delRect.y + delRect.h;
      fill(hoveringDel ? 220 : 200, hoveringDel ? 60 : 90, hoveringDel ? 50 : 70);
      rect(delRect.x, delRect.y, delRect.w, delRect.h, 4);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(delSize * 0.6);
      text('✕', delRect.x + delRect.w / 2, delRect.y + delRect.h / 2 - 1);

      this._customRowRects.push({ x: sx, y: ry, w: sw, h, index: i, id: pageItems[row].id, _delRect: delRect });
    }
    textAlign(LEFT, CENTER);

    if (totalPages > 1) {
      this._drawCustomPageNav(L, totalPages);
    } else {
      this._customPageNav = null;
    }
  }

  _drawCustomPageNav(L, totalPages) {
    const navH = L.gridH * 0.06;
    const navY = L.gridY + L.gridH + L.gridH * 0.015;
    const btnW = L.gridW * 0.12;
    const prevRect = { x: L.customGridX, y: navY, w: btnW, h: navH };
    const nextRect = { x: L.customGridX + L.gridW - btnW, y: navY, w: btnW, h: navH };
    this._customPageNav = { prevRect, nextRect, totalPages };

    const canPrev = this.customScrollOffset > 0;
    const canNext = this.customScrollOffset < totalPages - 1;

    for (const [rect_, enabled, label] of [[prevRect, canPrev, '◀ Prev'], [nextRect, canNext, 'Next ▶']]) {
      const hovering = enabled && mouseX >= rect_.x && mouseX <= rect_.x + rect_.w &&
                       mouseY >= rect_.y && mouseY <= rect_.y + rect_.h;
      fill(enabled ? (hovering ? this.COL_ROW_BG_BEST[0] : this.COL_ROW_BG[0]) : 60,
           enabled ? (hovering ? this.COL_ROW_BG_BEST[1] : this.COL_ROW_BG[1]) : 60,
           enabled ? (hovering ? this.COL_ROW_BG_BEST[2] : this.COL_ROW_BG[2]) : 60,
           enabled ? 255 : 120);
      rect(rect_.x, rect_.y, rect_.w, rect_.h, navH * 0.2);
      fill(enabled ? (hovering ? this.COL_TEXT_LIGHT[0] : this.COL_TEXT_DARK[0]) : 150,
           enabled ? (hovering ? this.COL_TEXT_LIGHT[1] : this.COL_TEXT_DARK[1]) : 150,
           enabled ? (hovering ? this.COL_TEXT_LIGHT[2] : this.COL_TEXT_DARK[2]) : 150);
      textAlign(CENTER, CENTER);
      textSize(navH * 0.4);
      text(label, rect_.x + rect_.w / 2, rect_.y + rect_.h / 2);
    }

    // Page indicator, centered between the two nav buttons
    fill(this.COL_TEXT_LIGHT[0], this.COL_TEXT_LIGHT[1], this.COL_TEXT_LIGHT[2], 200);
    textAlign(CENTER, CENTER);
    textSize(navH * 0.36);
    text(`${this.customScrollOffset + 1} / ${totalPages}`, L.gridX + L.gridW / 2, navY + navH / 2);
    textAlign(LEFT, CENTER);
  }

  // Returns 'prev' / 'next' if that page-nav button is currently being
  // pressed, or null. Mirrors clickedSlot()'s pattern deliberately — it
  // does NOT mutate customScrollOffset itself, since this gets polled
  // every frame the mouse is held down; the caller in sketch-1.js applies
  // the actual page change only on the press edge (guarded the same way
  // every other button on this screen already is), or holding the mouse
  // down on Next would flip through every page in a fraction of a second.
  clickedCustomPageNav() {
    if (this.category !== 'custom' || !this._customPageNav || !mouseIsPressed) return null;
    const { prevRect, nextRect, totalPages } = this._customPageNav;
    if (this.customScrollOffset > 0 &&
        mouseX >= prevRect.x && mouseX <= prevRect.x + prevRect.w &&
        mouseY >= prevRect.y && mouseY <= prevRect.y + prevRect.h) {
      return 'prev';
    }
    if (this.customScrollOffset < totalPages - 1 &&
        mouseX >= nextRect.x && mouseX <= nextRect.x + nextRect.w &&
        mouseY >= nextRect.y && mouseY <= nextRect.y + nextRect.h) {
      return 'next';
    }
    return null;
  }

  // Returns the custom level id whose delete (x) button was just clicked,
  // or null. Mirrors clickedSlot()'s press-edge pattern.
  clickedCustomDelete() {
    if (this.category !== 'custom' || !this._customRowRects || !mouseIsPressed) return null;
    for (const row of this._customRowRects) {
      const d = row._delRect;
      if (mouseX >= d.x && mouseX <= d.x + d.w && mouseY >= d.y && mouseY <= d.y + d.h) {
        return d.id;
      }
    }
    return null;
  }

  deleteCustomLevel(id) {
    try {
      const raw = localStorage.getItem('custom_levels');
      const list = raw ? JSON.parse(raw) : [];
      const filtered = (Array.isArray(list) ? list : []).filter(l => l.id !== id);
      localStorage.setItem('custom_levels', JSON.stringify(filtered));
    } catch (e) { /* ignore */ }
  }

  // ── Delete confirmation overlay ──────────────────────────────────────────
  // Opens the "are you sure?" overlay instead of deleting immediately —
  // looks the name up now (rather than at confirm time) so the message
  // still reads correctly even if the list re-sorts itself in the
  // meantime (_customLevels() re-sorts by updatedAt on every call).
  openDeleteConfirm(id) {
    const lvl = this._customLevels().find(l => l.id === id);
    this.confirmDeleteId = id;
    this.confirmDeleteName = (lvl && lvl.name) || 'Untitled Level';
  }

  cancelDeleteConfirm() {
    this.confirmDeleteId = null;
    this.confirmDeleteName = '';
  }

  confirmDelete() {
    if (this.confirmDeleteId === null) return;
    this.deleteCustomLevel(this.confirmDeleteId);
    this.confirmDeleteId = null;
    this.confirmDeleteName = '';
  }

  // Returns 'confirm' / 'cancel' if that button on the delete-confirmation
  // overlay was just clicked, or null. Mirrors clickedSlot()'s press-edge
  // pattern — checked from sketch-1.js alongside wasMousePressedLastFrame.
  clickedDeleteConfirmButton() {
    if (this.confirmDeleteId === null || !mouseIsPressed) return null;
    if (this._confirmDeleteBtns) {
      const { confirmBtn, cancelBtn } = this._confirmDeleteBtns;
      if (mouseX >= confirmBtn.x && mouseX <= confirmBtn.x + confirmBtn.w &&
          mouseY >= confirmBtn.y && mouseY <= confirmBtn.y + confirmBtn.h) {
        return 'confirm';
      }
      if (mouseX >= cancelBtn.x && mouseX <= cancelBtn.x + cancelBtn.w &&
          mouseY >= cancelBtn.y && mouseY <= cancelBtn.y + cancelBtn.h) {
        return 'cancel';
      }
    }
    return null;
  }

  // Draws one slot as a slanted parallelogram (top edge shifted right
  // relative to the bottom edge) instead of a plain rectangle — the same
  // diagonal-row treatment Levelmania uses across its whole menu, including
  // the medal-tier divider bars above the grid in the reference image.
  // Corners get a small radius by rounding each vertex toward its neighbours
  // a touch, which reads as soft corners without needing per-edge arcs.
  _drawSkewedSlot(x, y, w, h, skew) {
    noStroke();
    const r = h * 0.16; // corner softening amount
    const topL = { x: x + skew, y: y };
    const topR = { x: x + w + skew, y: y };
    const botR = { x: x + w, y: y + h };
    const botL = { x: x, y: y + h };

    const corner = (p, prev, next) => {
      const toPrev = p5.Vector.sub(createVector(prev.x, prev.y), createVector(p.x, p.y)).normalize().mult(r);
      const toNext = p5.Vector.sub(createVector(next.x, next.y), createVector(p.x, p.y)).normalize().mult(r);
      return {
        a: { x: p.x + toPrev.x, y: p.y + toPrev.y },
        b: { x: p.x + toNext.x, y: p.y + toNext.y },
      };
    };

    const cTL = corner(topL, botL, topR);
    const cTR = corner(topR, topL, botR);
    const cBR = corner(botR, topR, botL);
    const cBL = corner(botL, botR, topL);

    beginShape();
    vertex(cTL.b.x, cTL.b.y);
    vertex(cTR.a.x, cTR.a.y);
    quadraticVertex(topR.x, topR.y, cTR.b.x, cTR.b.y);
    vertex(cBR.a.x, cBR.a.y);
    quadraticVertex(botR.x, botR.y, cBR.b.x, cBR.b.y);
    vertex(cBL.a.x, cBL.a.y);
    quadraticVertex(botL.x, botL.y, cBL.b.x, cBL.b.y);
    vertex(cTL.a.x, cTL.a.y);
    quadraticVertex(topL.x, topL.y, cTL.b.x, cTL.b.y);
    endShape(CLOSE);
  }

  // Procedural coin-shaped medal icon: a beveled circle in the tier colour
  // with a lighter highlight ring, echoing the reference image's medal
  // icons without depending on any external image asset.
  _drawMedalCoin(cx, cy, r, tier) {
    if (tier === 0) {
      // No medal yet — a faint empty ring placeholder
      noFill();
      stroke(this.COL_NONE_RING[0], this.COL_NONE_RING[1], this.COL_NONE_RING[2], 130);
      strokeWeight(Math.max(1.5, r * 0.16));
      circle(cx, cy, r * 2);
      noStroke();
      return;
    }
    let base, lit;
    if (tier === 4) { base = [120, 200, 150]; lit = [180, 235, 200]; }      // author/green
    else if (tier === 3) { base = this.COL_GOLD; lit = [255, 222, 140]; }
    else if (tier === 2) { base = this.COL_SILVER; lit = [232, 236, 240]; }
    else { base = this.COL_BRONZE; lit = [210, 158, 110]; }

    noStroke();
    fill(base[0] * 0.62, base[1] * 0.62, base[2] * 0.62);
    circle(cx, cy + r * 0.10, r * 2);
    fill(base[0], base[1], base[2]);
    circle(cx, cy, r * 2);
    fill(lit[0], lit[1], lit[2]);
    circle(cx - r * 0.18, cy - r * 0.18, r * 1.15);
    fill(base[0] * 0.85, base[1] * 0.85, base[2] * 0.85);
    circle(cx, cy, r * 1.1);
    fill(lit[0], lit[1], lit[2], 200);
    circle(cx - r * 0.22, cy - r * 0.22, r * 0.45);
  }

  _drawCloseButton() {
    const r = this._closeButtonRect();
    const hovering = mouseX >= r.x && mouseX <= r.x + r.size &&
                      mouseY >= r.y && mouseY <= r.y + r.size;
    noFill();
    stroke(255, 255, 255, hovering ? 255 : 200);
    strokeWeight(Math.max(2, r.size * 0.12));
    const pad = r.size * 0.28;
    line(r.x + pad, r.y + pad, r.x + r.size - pad, r.y + r.size - pad);
    line(r.x + r.size - pad, r.y + pad, r.x + pad, r.y + r.size - pad);
    noStroke();
  }

  _drawPreviewPanel() {
    if (this.category === 'custom') {
      this._drawCustomPreviewPanel();
      return;
    }

    const L = this._layout();
    const idx = this.hoveredIndex === -1 ? this.lastHoveredIndex : this.hoveredIndex;
    const levelId = this._levelIdForSlot(idx);
    const levelName = this._levelNameForSlot(idx);
    const levelData = (typeof levels !== 'undefined' && levels[levelId]) ? levels[levelId].data : '';
    const top5 = this.getTop5(levelData);
    const best = this.getPersonalBest(levelData);

    const cardW = L.previewW;
    const cardH = cardW * 0.66; // thumbnail card aspect ratio
    const cardX = L.previewX;
    const cardY = L.previewY;
    const radius = cardW * 0.05;

    // ── Thumbnail card: white rounded border, downscaled level backdrop ──
    push();
    noFill();
    stroke(this.COL_CARD_BORDER[0], this.COL_CARD_BORDER[1], this.COL_CARD_BORDER[2]);
    strokeWeight(Math.max(2, cardW * 0.012));
    rect(cardX, cardY, cardW, cardH, radius, radius, radius, radius * 2.2);
    pop();

    // Clip the downsized level art to the card's interior via a manual
    // rect-fill clamp (p5 has no native clip without WEBGL/canvas masks
    // here, so we simply keep every shape within the inset bounds below).
    const innerPad = strokeWeightFor(cardW);
    const ix = cardX + innerPad;
    const iy = cardY + innerPad;
    const iw = cardW - innerPad * 2;
    const ih = cardH - innerPad * 2 - radius * 1.2; // leave room for corner notch

    this._drawCachedSnapshot(ix, iy, iw, ih, levelId);

    // Title bar — "<biome> <slot>" mimicking "SPRING 2022 - 01"
    fill(0, 0, 0, 0);
    noStroke();
    fill(255);
    textFont(gameFont);
    textAlign(LEFT, TOP);
    textSize(cardW * 0.052);
    text(levelName.toUpperCase(), ix + cardW * 0.03, iy + cardH * 0.05);

    // ── Top 5 times list ───────────────────────────────────────────────
    let listY = cardY + cardH + cardH * 0.10;
    const rowH = cardH * 0.155;
    fill(255, 255, 255, 235);
    textAlign(LEFT, CENTER);
    textSize(cardW * 0.045);
    text('TOP 5', cardX, listY);
    listY += rowH * 0.7;

    for (let i = 0; i < 5; i++) {
      const entry = top5[i];
      const rowY = listY + i * rowH;
      fill(this.COL_ROW_BG[0], this.COL_ROW_BG[1], this.COL_ROW_BG[2]);
      rect(cardX, rowY, cardW, rowH * 0.84, rowH * 0.18);

      // Rank-based medal: 1st=gold, 2nd=silver, 3rd=bronze, 4th/5th=no medal
      const rankTier = !entry ? 0 : (i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0);
      this._drawMedalCoin(cardX + rowH * 0.36, rowY + rowH * 0.42, rowH * 0.26, rankTier);

      fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
      textAlign(LEFT, CENTER);
      textSize(cardW * 0.04);
      text(entry ? entry.name : '---', cardX + rowH * 0.7, rowY + rowH * 0.42);

      textAlign(RIGHT, CENTER);
      text(entry ? this._formatTime(entry.time) : '--:--.---',
           cardX + cardW - rowH * 0.18, rowY + rowH * 0.42);
    }

    // ── Personal best — white background row, per the brief ────────────
    const pbY = listY + 5 * rowH + rowH * 0.25;
    fill(255, 255, 255);
    stroke(this.COL_ROW_BG[0] * 0.7, this.COL_ROW_BG[1] * 0.7, this.COL_ROW_BG[2] * 0.7);
    strokeWeight(1.5);
    rect(cardX, pbY, cardW, rowH * 0.9, rowH * 0.18);
    noStroke();

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
    textAlign(LEFT, CENTER);
    textSize(cardW * 0.042);
    text(this.username, cardX + rowH * 0.3, pbY + rowH * 0.45);
    textAlign(RIGHT, CENTER);
    text(this._formatTime(best), cardX + cardW - rowH * 0.18, pbY + rowH * 0.45);
  }

  // Lighter preview card for the 'custom' category — custom levels don't
  // have a pre-rendered thumbnail cache (no decorative biome snapshot to
  // fall back on), so this shows the level's name, chosen background
  // theme, and personal best instead of a rendered level thumbnail.
  _drawCustomPreviewPanel() {
    const L = this._layout();
    const list = this._customLevels();
    const idx = this.hoveredIndex === -1 ? this.lastHoveredIndex : this.hoveredIndex;
    const lvl = list[idx] || list[0];

    const cardW = L.previewW;
    const cardH = cardW * 0.66;
    const cardX = L.previewX;
    const cardY = L.previewY;
    const radius = cardW * 0.05;

    // Card border and background exactly like campaign preview.
    push();
    noFill();
    stroke(this.COL_CARD_BORDER[0], this.COL_CARD_BORDER[1], this.COL_CARD_BORDER[2]);
    strokeWeight(Math.max(2, cardW * 0.012));
    rect(cardX, cardY, cardW, cardH, radius, radius, radius, radius * 2.2);
    pop();

    // Use the same inset calculation as campaign preview for identical dimensions
    const innerPad = strokeWeightFor(cardW);
    const ix = cardX + innerPad;
    const iy = cardY + innerPad;
    const iw = cardW - innerPad * 2;
    const ih = cardH - innerPad * 2 - radius * 1.2;

    if (lvl) {
      this._drawCustomSnapshot(ix, iy, iw, ih, lvl);

      fill(255);
      textFont(gameFont);
      textAlign(LEFT, TOP);
      textSize(cardW * 0.052);
      text((lvl.name || 'Untitled Level').toUpperCase(), ix + cardW * 0.03 - innerPad, iy + cardH * 0.05 - innerPad);

      const bg = lvl.background && lvl.background !== 'none' ? lvl.background : 'none';
      fill(180);
      textSize(cardW * 0.038);
      text(`Background: ${bg[0].toUpperCase()}${bg.slice(1)}`, ix + cardW * 0.03 - innerPad, iy + cardH * 0.08 - innerPad);

      const top5 = this.getTop5(lvl.data);
      const best = this.getPersonalBest(lvl.data);
      let listY = cardY + cardH + cardH * 0.10;
      const rowH = cardH * 0.155;

      fill(255, 255, 255, 235);
      textAlign(LEFT, CENTER);
      textSize(cardW * 0.045);
      text('TOP 5', cardX, listY);
      listY += rowH * 0.7;

      for (let i = 0; i < 5; i++) {
        const entry = top5[i];
        const rowY = listY + i * rowH;
        fill(this.COL_ROW_BG[0], this.COL_ROW_BG[1], this.COL_ROW_BG[2]);
        rect(cardX, rowY, cardW, rowH * 0.84, rowH * 0.18);

        const rankTier = !entry ? 0 : (i === 0 ? 3 : i === 1 ? 2 : i === 2 ? 1 : 0);
        this._drawMedalCoin(cardX + rowH * 0.36, rowY + rowH * 0.42, rowH * 0.26, rankTier);

        fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
        textAlign(LEFT, CENTER);
        textSize(cardW * 0.04);
        text(entry ? entry.name : '---', cardX + rowH * 0.7, rowY + rowH * 0.42);

        textAlign(RIGHT, CENTER);
        text(entry ? this._formatTime(entry.time) : '--:--.---', cardX + cardW - rowH * 0.18, rowY + rowH * 0.42);
      }

      const pbY = listY + 5 * rowH + rowH * 0.25;
      fill(255, 255, 255);
      stroke(this.COL_ROW_BG[0] * 0.7, this.COL_ROW_BG[1] * 0.7, this.COL_ROW_BG[2] * 0.7);
      strokeWeight(1.5);
      rect(cardX, pbY, cardW, rowH * 0.9, rowH * 0.18);
      noStroke();

      fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
      textAlign(LEFT, CENTER);
      textSize(cardW * 0.042);
      text(this.username, cardX + rowH * 0.3, pbY + rowH * 0.45);
      textAlign(RIGHT, CENTER);
      text(this._formatTime(best), cardX + cardW - rowH * 0.18, pbY + rowH * 0.45);
      this._customPreviewNav = null;
    } else {
      fill(30, 34, 36);
      rect(cardX + 3, cardY + 3, cardW - 6, cardH - 6, radius * 0.8);
      fill(255);
      textFont(gameFont);
      textAlign(CENTER, CENTER);
      textSize(cardW * 0.06);
      text('No levels yet', cardX + cardW / 2, cardY + cardH * 0.42);
      fill(200);
      textSize(cardW * 0.04);
      text('Open the Editor from the main menu to make one.', cardX + cardW / 2, cardY + cardH * 0.62);
    }
  }

  // Returns 'prev' / 'next' if preview nav was just clicked, or null.
  clickedCustomPreviewNav() {
    if (this.category !== 'custom' || !this._customPreviewNav || !mouseIsPressed) return null;
    const { prevRect, nextRect } = this._customPreviewNav;
    if (mouseX >= prevRect.x && mouseX <= prevRect.x + prevRect.w &&
        mouseY >= prevRect.y && mouseY <= prevRect.y + prevRect.h) {
      return 'prev';
    }
    if (mouseX >= nextRect.x && mouseX <= nextRect.x + nextRect.w &&
        mouseY >= nextRect.y && mouseY <= nextRect.y + nextRect.h) {
      return 'next';
    }
    return null;
  }

  // Draws the real cached level snapshot (see generateThumbnails() /
  // _renderLevelSnapshot()) into the preview card's inset area. The
  // snapshot is a full-canvas-sized still of the level's actual opening
  _renderCustomLevelSnapshot(lvl) {
    const saved = {
      platforms, waterZones, finishes, checkpoints, gravZones, bouncePads,
      particles, circlePlatforms, powerUps, movingPlatforms, fans, signs,
      activeBackground, activeLevelId,
      startPos: startPos.copy(),
      cameraLocation: cameraLocation.copy(),
    };

    platforms = []; waterZones = []; finishes = []; checkpoints = []; signs = [];
    gravZones = []; bouncePads = []; particles = []; circlePlatforms = [];
    powerUps = []; movingPlatforms = []; fans = [];

    const bgName = lvl.background || 'none';
    if (bgName === 'snow') activeBackground = new SnowBackground();
    else if (bgName === 'forest') activeBackground = new ForestBackground();
    else if (bgName === 'ice') activeBackground = new IceBackground();
    else if (bgName === 'volcano') activeBackground = new VolcanoBackground();
    else if (bgName === 'space') activeBackground = new SpaceBackground();
    else activeBackground = null;

    const previewId = '__custom_preview__';
    const hadPreview = previewId in levels;
    const oldPreviewLevel = levels[previewId];
    levels[previewId] = new Level(previewId, lvl.data, lvl.gimmick || 'NIL', bgName);
    activeLevelId = previewId;
    loadLevelData(lvl.data.trim().length ? lvl.data.split(' ') : []);
    cameraLocation.set(startPos.x, startPos.y);

    const buf = createGraphics(width, height);
    buf.background(255);
    this._drawToBuffer(buf, () => {
      strokeWeight(0);
      if (activeBackground) {
        const parallaxCam = parallaxCamera(cameraLocation);
        activeBackground.update(parallaxCam);
        activeBackground.draw(parallaxCam);
      }
      push();
      translate(width / 2 - cameraLocation.x, height / 2 - cameraLocation.y);
      fans.forEach((f) => f.show());
      platforms.forEach((p) => p.show());
      signs.forEach((s) => s.show());
      circlePlatforms.forEach((cp) => cp.show());
      bouncePads.forEach((b) => b.show());
      movingPlatforms.forEach((mp) => mp.show());
      finishes.forEach((f) => f.show());
      checkpoints.forEach((c) => c.show());
      waterZones.forEach((w) => w.show());
      gravZones.forEach((g) => g.show());
      powerUps.forEach((pu) => pu.show());
      particles.forEach((p) => p.show());
      pop();
    });

    const snapshot = buf.get();
    buf.remove();

    platforms = saved.platforms; waterZones = saved.waterZones;
    finishes = saved.finishes; checkpoints = saved.checkpoints; signs = saved.signs || [];
    gravZones = saved.gravZones; bouncePads = saved.bouncePads;
    particles = saved.particles; circlePlatforms = saved.circlePlatforms;
    powerUps = saved.powerUps; movingPlatforms = saved.movingPlatforms;
    fans = saved.fans;
    activeBackground = saved.activeBackground;
    activeLevelId = saved.activeLevelId;
    startPos = saved.startPos;
    cameraLocation = saved.cameraLocation;

    if (hadPreview) {
      levels[previewId] = oldPreviewLevel;
    } else {
      delete levels[previewId];
    }

    return snapshot;
  }

  _drawCustomSnapshot(x, y, w, h, lvl) {
    if (!lvl) {
      fill(40, 40, 40);
      rect(x, y, w, h);
      return;
    }

    const key = `${lvl.id}:${lvl.updatedAt || 0}`;
    if (!this.customThumbnails[key]) {
      this.customThumbnails[key] = this._renderCustomLevelSnapshot(lvl);
    }
    const img = this.customThumbnails[key];
    if (!img) {
      fill(40, 40, 40);
      rect(x, y, w, h);
      return;
    }

    const cardAspect = w / h;
    const imgAspect = img.width / img.height;
    let cropW, cropH;
    if (imgAspect > cardAspect) {
      cropH = img.height;
      cropW = cropH * cardAspect;
    } else {
      cropW = img.width;
      cropH = cropW / cardAspect;
    }
    const cropX = (img.width - cropW) / 2;
    const cropY = (img.height - cropH) / 2;

    push();
    image(img, x, y, w, h, cropX, cropY, cropW, cropH);
    pop();
  }

  // view, centred on the player's spawn point — so for a small card we
  // center-crop a region matching the card's own aspect ratio out of the
  // middle of that image (rather than squashing the whole wide canvas into
  // a narrow card, which would distort every proportion) and scale that
  // crop up or down to fill the inset box exactly.
  _drawCachedSnapshot(x, y, w, h, levelId) {
    const img = this.thumbnails[levelId];
    if (!img) {
      // Thumbnails are generated once at startup; if one isn't ready yet
      // (e.g. called before generateThumbnails() has run) fall back to a
      // flat neutral panel rather than drawing nothing.
      fill(40, 40, 40);
      rect(x, y, w, h);
      return;
    }

    const cardAspect = w / h;
    const imgAspect = img.width / img.height;
    let cropW, cropH;
    if (imgAspect > cardAspect) {
      // Image is relatively wider than the card — crop its sides off.
      cropH = img.height;
      cropW = cropH * cardAspect;
    } else {
      // Image is relatively taller than the card — crop top/bottom off.
      cropW = img.width;
      cropH = cropW / cardAspect;
    }
    const cropX = (img.width - cropW) / 2;
    const cropY = (img.height - cropH) / 2;

    push();
    image(img, x, y, w, h, cropX, cropY, cropW, cropH);
    pop();
  }

  // ── Account / username editing overlay ─────────────────────────────────
  _drawAccountOverlay() {
    push();
    fill(0, 0, 0, 150);
    rect(0, 0, width, height);

    const boxW = Math.min(width * 0.34, 420);
    const boxH = boxW * 0.46;
    const boxX = width / 2 - boxW / 2;
    const boxY = height / 2 - boxH / 2;

    fill(this.COL_ROW_BG[0], this.COL_ROW_BG[1], this.COL_ROW_BG[2]);
    rect(boxX, boxY, boxW, boxH, 12);

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
    textFont(gameFont);
    textAlign(LEFT, TOP);
    textSize(boxW * 0.07);
    text('USERNAME', boxX + boxW * 0.06, boxY + boxH * 0.10);

    const fieldY = boxY + boxH * 0.42;
    const fieldH = boxH * 0.22;
    fill(255);
    stroke(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2], 80);
    strokeWeight(1.5);
    rect(boxX + boxW * 0.06, fieldY, boxW * 0.88, fieldH, 6);
    noStroke();

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
    textAlign(LEFT, CENTER);
    textSize(boxW * 0.06);
    const blink = Math.floor(frameCount / 30) % 2 === 0 ? '|' : '';
    text(this.nameDraft + blink, boxX + boxW * 0.09, fieldY + fieldH / 2);

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2], 160);
    textAlign(LEFT, TOP);
    textSize(boxW * 0.035);
    text('Enter to save - Esc to cancel', boxX + boxW * 0.06, boxY + boxH * 0.78);
    pop();
  }

  // "Are you sure?" overlay shown before a custom level is actually
  // removed from localStorage — mirrors the Editor's own confirm-popup
  // styling (dark scrim, mint box, two-button row) for visual consistency
  // between the two places a level can be deleted from.
  _drawDeleteConfirmOverlay() {
    push();
    fill(0, 0, 0, 150);
    rect(0, 0, width, height);

    const boxW = Math.min(width * 0.36, 440);
    const boxH = boxW * 0.5;
    const boxX = width / 2 - boxW / 2;
    const boxY = height / 2 - boxH / 2;

    fill(this.COL_ROW_BG[0], this.COL_ROW_BG[1], this.COL_ROW_BG[2]);
    rect(boxX, boxY, boxW, boxH, 12);

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
    textFont(gameFont);
    textAlign(CENTER, TOP);
    textSize(boxW * 0.07);
    text('Delete Level?', boxX + boxW / 2, boxY + boxH * 0.1);

    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2], 200);
    textAlign(CENTER, CENTER);
    textSize(boxW * 0.045);
    const msgBoxW = boxW * 0.84, msgBoxH = boxH * 0.34;
    text(`"${this.confirmDeleteName}" will be permanently deleted. This can't be undone.`,
         boxX + boxW / 2 - msgBoxW / 2, boxY + boxH * 0.32, msgBoxW, msgBoxH);

    const btnW = boxW * 0.4, btnH = boxH * 0.16, btnGap = boxW * 0.04;
    const cancelBtn = { x: boxX + boxW / 2 - btnW - btnGap / 2, y: boxY + boxH * 0.76, w: btnW, h: btnH };
    const confirmBtn = { x: boxX + boxW / 2 + btnGap / 2, y: boxY + boxH * 0.76, w: btnW, h: btnH };
    this._confirmDeleteBtns = { confirmBtn, cancelBtn };

    const hoveringCancel = mouseX >= cancelBtn.x && mouseX <= cancelBtn.x + cancelBtn.w &&
                            mouseY >= cancelBtn.y && mouseY <= cancelBtn.y + cancelBtn.h;
    fill(hoveringCancel ? 160 : 190, hoveringCancel ? 175 : 200, hoveringCancel ? 165 : 193);
    rect(cancelBtn.x, cancelBtn.y, cancelBtn.w, cancelBtn.h, 6);
    fill(this.COL_TEXT_DARK[0], this.COL_TEXT_DARK[1], this.COL_TEXT_DARK[2]);
    textAlign(CENTER, CENTER);
    textSize(cancelBtn.h * 0.4);
    text('Cancel', cancelBtn.x + cancelBtn.w / 2, cancelBtn.y + cancelBtn.h / 2);

    const hoveringConfirm = mouseX >= confirmBtn.x && mouseX <= confirmBtn.x + confirmBtn.w &&
                             mouseY >= confirmBtn.y && mouseY <= confirmBtn.y + confirmBtn.h;
    fill(hoveringConfirm ? 180 : 220, hoveringConfirm ? 49 : 60, hoveringConfirm ? 41 : 50);
    rect(confirmBtn.x, confirmBtn.y, confirmBtn.w, confirmBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(confirmBtn.h * 0.4);
    text('Delete', confirmBtn.x + confirmBtn.w / 2, confirmBtn.y + confirmBtn.h / 2);
    pop();
  }
}

// Small helper kept at module scope (used once above) to derive a
// proportionate inset for the preview card's border thickness.
function strokeWeightFor(cardW) {
  return Math.max(3, cardW * 0.016);
}
