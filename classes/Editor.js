// ─────────────────────────────────────────────────────────────────────────────
// Editor.js
// A PolyLevel-style level editor for Particle Platformer.
//
// Layout:
//   - Top bar: level name field (click to rename + pick background), Save,
//     Test, Load, Exit buttons.
//   - Left palette: a row of category tabs along the top of the panel,
//     each opening a grid of placeable block icons below it.
//   - Click-drag on the canvas places/moves objects on a snapped grid.
//   - Selected placed object shows a small floating toolbar: rotate (only
//     for blocks that support it, e.g. fans) and delete. Grav zones also
//     show an "Adjust" button that opens a slider popup to tune gravity.
//
// Internal format:
//   The editor keeps its own lightweight list of "placed object" records
//   (this.objects), each one easily convertible to/from this project's
//   existing level-id string element format (see decodeLevelId in
//   Var+startUp.js). Saving serialises this.objects straight to that
//   string format and stores it (plus name/background) as a Level-shaped
//   JSON blob in localStorage, under a 'custom_levels' index.
// ─────────────────────────────────────────────────────────────────────────────

class Editor {
  constructor() {
    // ── Grid ──────────────────────────────────────────────────────────────
    // The game's own decodeLevelId() scales x/w by width/40 and y/h by
    // height/40 independently (see the comment directly above it: "one grid
    // space is width/40,height/40") — they're only equal when width===height,
    // which is basically never true for a real viewport. Every placement,
    // drag, and render in this editor has to use the matching axis unit or
    // a level built here will look right in the editor but land in the
    // wrong place (and the wrong cell shape) the moment it's actually
    // played, since gameplay always decodes through that same function.
    this.gridSizeX = width / 40;
    this.gridSizeY = height / 40;

    // ── Level metadata ───────────────────────────────────────────────────
    this.levelName = 'Untitled Level';
    this.background = 'none'; // 'none' | 'snow' | 'forest' | 'ice' | 'volcano' | 'space'
    this.gimmick = 'NIL'; // 'NIL' | 'InfiniteClicks' | 'ChargeSwitch'
    this.editingCustomId = null; // localStorage id of the custom level being edited, or null = new

    // ── Placed objects ────────────────────────────────────────────────────
    // Each object: { cat, type, x, y, w, h, rotation, extra:{...}, _id }
    this.objects = [];
    this._nextObjId = 1;

    // ── Camera / pan ──────────────────────────────────────────────────────
    this.camX = 0;
    this.camY = 0;
    this.isPanning = false;
    this.panStartMouse = null;
    this.panStartCam = null;
    // True right after openBlank()/openCustomLevel() — checked once in
    // update() to perform the actual spawn-centering math, since layout
    // isn't valid yet at the point those methods themselves run.
    this._pendingSpawnCenter = true;

    // ── Palette state ─────────────────────────────────────────────────────
    this.activeTab = 0; // index into this.tabs
    this.tabs = this._buildTabs();
    this.selectedPaletteItem = null; // currently armed-to-place item (ref into tabs[].items)
    this.paletteScrollRow = 0; // vertical scroll offset (in item rows) for tabs with more items than fit on screen

    // ── Placement / dragging ──────────────────────────────────────────────
    // Two-corner placement: every block type except the Start marker is
    // placed by clicking one corner, then clicking the opposite corner —
    // the block spans the box between them. pendingCorner holds the first
    // click {item, gx, gy} while waiting for the second.
    this.pendingCorner = null;
    this.selectedObject = null;    // placed object currently selected on canvas
    this.draggingSelected = false;
    this.dragOffset = { x: 0, y: 0 };

    // ── Moving-platform waypoint chaining ──────────────────────────────────
    this.pendingPathId = null; // when placing a moving platform, the path id waypoints attach to
    this.placingWaypointsFor = null; // object ref currently receiving waypoint clicks

    // ── Popups ────────────────────────────────────────────────────────────
    this.activePopup = null; // {type:'gravity'|'name'|'load', ...}

    // ── Unsaved-changes leveling ─────────────────────────────────────────
    // A snapshot of toDataString()+name+background+gimmick taken right
    // after every load/save, so hasUnsavedChanges() can tell whether the
    // player has actually changed anything since — used to gate the
    // confirm-before-losing-work popups on Exit/Load/(new blank level).
    // Comparing the serialised data string rather than diffing this.objects
    // directly sidesteps needing a deep-equality check across every object
    // shape in the catalogue, and naturally ignores cosmetic state (camera
    // pan, current selection) that doesn't represent real level changes.
    this._lastSavedSnapshot = null;

    // ── UI rects (recomputed each frame in _layout) ────────────────────────
    this.layout = null;

    // ── Hover ─────────────────────────────────────────────────────────────
    this.hoveredTab = -1;
    this.hoveredPaletteItem = -1;

    // Click edge-detection local to the editor (separate concerns from the
    // game's own wasMousePressedLastFrame, reused where convenient)
    this._wasPressed = false;
  }

  // ── Tab / palette catalogue ─────────────────────────────────────────────
  // Each item carries enough info to build a real level-id element and to
  // construct a live preview instance for rendering on the canvas.
  _buildTabs() {
    return [
      {
        name: 'Surfaces',
        items: [
          // Rectangles — "half-blocks": always exactly 0.5 grid spaces in
          // their thin dimension (matching the half-height platforms
          // already used in the built-in campaign levels, e.g.
          // "130z20z20z0.5"), occupying either the near or far half of a
          // single grid cell along that axis — which half is an explicit
          // toggle (see the toolbar's ⇕/⇔ button), not something implied
          // by how the block happened to be dragged out. Not rotatable;
          // only triangles, fans, and bounce pads can be rotated now.
          { label: 'Stone',  cat: '1', type: '0', w: 4, halfBlock: true, col: [200, 200, 200] },
          { label: 'Ice',    cat: '1', type: '1', w: 4, halfBlock: true, col: [5, 232, 224] },
          { label: 'Sand',   cat: '1', type: '2', w: 4, halfBlock: true, col: [232, 122, 5] },
          { label: 'Bouncy', cat: '1', type: '3', w: 4, halfBlock: true, col: [2, 168, 54] },
          { label: 'Honey',  cat: '1', type: '4', w: 4, halfBlock: true, col: [184, 134, 11] },
          // Triangles — same 5 surfaces, placed as a wedge from the start
          // (rotation 90) and rotatable through all 4 wedge orientations.
          { label: 'Stone Tri',  cat: '1', type: '0', w: 4, h: 4, rotatable: true, startRotation: 90, isTriangle: true, col: [200, 200, 200] },
          { label: 'Ice Tri',    cat: '1', type: '1', w: 4, h: 4, rotatable: true, startRotation: 90, isTriangle: true, col: [5, 232, 224] },
          { label: 'Sand Tri',   cat: '1', type: '2', w: 4, h: 4, rotatable: true, startRotation: 90, isTriangle: true, col: [232, 122, 5] },
          { label: 'Bouncy Tri', cat: '1', type: '3', w: 4, h: 4, rotatable: true, startRotation: 90, isTriangle: true, col: [2, 168, 54] },
          { label: 'Honey Tri',  cat: '1', type: '4', w: 4, h: 4, rotatable: true, startRotation: 90, isTriangle: true, col: [184, 134, 11] },
          // Circles — moved here from their own tab, per the same 5 surfaces.
          // Radius is set by the two-corner placement box, then fine-tuned
          // via the Adjust Radius popup like particles/power-ups.
          { label: 'Stone Ball',  cat: '2', type: '0', r: 1.5, radiusAdjustable: true, col: [200, 200, 200] },
          { label: 'Ice Ball',    cat: '2', type: '1', r: 1.5, radiusAdjustable: true, col: [5, 232, 224] },
          { label: 'Sand Ball',   cat: '2', type: '2', r: 1.5, radiusAdjustable: true, col: [232, 122, 5] },
          { label: 'Bouncy Ball', cat: '2', type: '3', r: 1.5, radiusAdjustable: true, col: [2, 168, 54] },
          { label: 'Honey Ball',  cat: '2', type: '4', r: 1.5, radiusAdjustable: true, col: [184, 134, 11] },
        ],
      },
      {
        name: 'Zones',
        items: [
          { label: 'Water',     cat: '4', type: '0', w: 5, h: 4, col: [194, 240, 255], extra: { drag: 10 } },
          { label: 'Low Grav',  cat: '4', type: '1', w: 5, h: 4, col: [55, 74, 250], adjustable: 'gravity', extra: { gravParam: 5 } },
          { label: 'High Grav', cat: '4', type: '2', w: 5, h: 4, col: [252, 96, 237], adjustable: 'gravity', extra: { gravParam: 5 } },
        ],
      },
      {
        name: 'Fans',
        items: [
          { label: 'Fan', cat: '3', type: '0', w: 1.5, h: 1.5, rotatableFree: true, col: [100, 100, 100], extra: { fanAngle: 0 } },
        ],
      },
      {
        name: 'Bounce Pads',
        items: [
          // Rotatable now too — see _rotateObject()'s note on what rotating
          // a bounce pad actually does (it's a launch-direction flag the
          // game's own BouncePad class doesn't read; flagged in the chat).
          { label: 'Stone Pad', cat: '5', type: '0', w: 3, h: 0.6, rotatable: true, col: [200, 200, 200], extra: { strength: 3 } },
          { label: 'Ice Pad',   cat: '5', type: '1', w: 3, h: 0.6, rotatable: true, col: [5, 232, 224], extra: { strength: 3 } },
          { label: 'Sand Pad',  cat: '5', type: '2', w: 3, h: 0.6, rotatable: true, col: [232, 122, 5], extra: { strength: 3 } },
          { label: 'Bouncy Pad', cat: '5', type: '10', w: 3, h: 0.6, rotatable: true, col: [9, 227, 85], extra: { strength: 3 } },
        ],
      },
      {
        name: 'Moving Platforms',
        items: [
          { label: 'Honey Mover', cat: '6', type: '0', w: 4, h: 1, multiStep: 'movingPlatform',
            col: [184, 134, 11], extra: { speed: 4, loop: 0, pauseFrames: 0 } },
        ],
      },
      {
        name: 'Particles',
        items: [
          { label: 'Positive',     cat: '7', type: '0', r: 1, radiusAdjustable: true, col: [30, 120, 255] },
          { label: 'Negative',     cat: '7', type: '1', r: 1, radiusAdjustable: true, col: [220, 50, 50] },
          { label: 'Neutral Attr', cat: '7', type: '2', r: 1, radiusAdjustable: true, col: [200, 200, 200] },
          { label: 'Kill Blue',    cat: '7', type: '3', r: 1, radiusAdjustable: true, col: [30, 120, 255], ring: true },
          { label: 'Kill Red',     cat: '7', type: '4', r: 1, radiusAdjustable: true, col: [220, 50, 50], ring: true },
          { label: 'Kill Grey',    cat: '7', type: '5', r: 1, radiusAdjustable: true, col: [150, 150, 150], ring: true },
        ],
      },
      {
        name: 'Power-Ups',
        items: [
          { label: 'Refresh All',      cat: '8', type: '0', r: 0.75, radiusAdjustable: true, col: [255, 200, 0], extra: { mode: 0 } },
          { label: 'Refresh Recent',   cat: '8', type: '1', r: 0.75, radiusAdjustable: true, col: [0, 220, 220], extra: { mode: 0 } },
          { label: 'Charge Positive',  cat: '8', type: '2', r: 0.75, radiusAdjustable: true, col: [90, 150, 255], extra: { mode: 0 } },
          { label: 'Charge Negative',  cat: '8', type: '3', r: 0.75, radiusAdjustable: true, col: [255, 100, 100], extra: { mode: 0 } },
          { label: 'Charge Neutral',   cat: '8', type: '4', r: 0.75, radiusAdjustable: true, col: [200, 200, 200], extra: { mode: 0 } },
          { label: 'Charge Toggle',    cat: '8', type: '5', r: 0.75, radiusAdjustable: true, col: [140, 255, 120], extra: { mode: 0 } },
        ],
      },
      {
        name: 'Markers',
        items: [
          { label: 'Start',      cat: '0', type: '0', w: 1, h: 1, col: [80, 200, 120], unique: true, singleClick: true },
          { label: 'Checkpoint', cat: '0', type: '1', w: 2, h: 2, col: [255, 220, 0] },
          { label: 'Finish',     cat: '0', type: '2', w: 2, h: 3, col: [178, 34, 34] },
          { label: 'Editor Marker', cat: '0', type: '3', w: 1, h: 1, col: [150, 150, 150], singleClick: true, editorOnly: true },
          { label: 'Sign →',      cat: '0', type: '4', w: 2, h: 3, col: [220, 220, 220] },
          { label: 'Sign ↓',      cat: '0', type: '5', w: 2, h: 3, col: [220, 220, 220] },
          { label: 'Sign ←',      cat: '0', type: '6', w: 2, h: 3, col: [220, 220, 220] },
          { label: 'Sign ↑',      cat: '0', type: '7', w: 2, h: 3, col: [220, 220, 220] },
        ],
      },
    ];
  }

  // ── Loading an existing level's data string into editable objects ───────
  loadFromDataString(dataStr, name, background, gimmick) {
    this.objects = [];
    this._nextObjId = 1;
    this.levelName = name || 'Untitled Level';
    this.background = background || 'none';
    this.gimmick = gimmick || 'NIL';

    const parts = dataStr.trim().split(' ').filter(Boolean);
    // Stage moving-platform pieces like the real game does, then assemble.
    const pendingDefs = {};   // pathId -> {x,y,w,h,speed,loop,pauseFrames, objId}
    const pendingWps = {};    // pathId -> [{order,x,y}]

    for (const el of parts) {
      const cat = el.slice(0, 1);
      const type = el.slice(1, 2);
      const coords = el.slice(2).split('z');
      const gx = Number(coords[0]);
      const gy = Number(coords[1]);

      if (cat === '6') {
        if (type === '0') {
          const gw = Number(coords[2]);
          const gh = Number(coords[3]);
          const speed = Number(coords[4]);
          const pathId = coords[5];
          const loop = coords[6] ? Number(coords[6]) : 0;
          const pauseFrames = coords[7] ? Number(coords[7]) : 0;
          pendingDefs[pathId] = { gx, gy, gw, gh, speed, loop, pauseFrames };
        } else if (type === '1') {
          const pathId = coords[2];
          const order = Number(coords[3]);
          if (!pendingWps[pathId]) pendingWps[pathId] = [];
          pendingWps[pathId].push({ order, gx, gy });
        }
        continue;
      }

      const obj = { _id: this._nextObjId++, cat, type, gx, gy };

      if (cat === '1') {
        obj.gw = Number(coords[2]);
        obj.gh = Number(coords[3]);
        obj.rotation = coords[4] ? Number(coords[4]) * 90 : 0;
        // Rotation is the only signal distinguishing a triangle from a
        // plain rectangle in the data format itself — any loaded platform
        // with non-zero rotation is necessarily a triangle wedge (see
        // Platform.js's calculateTriangleVertices), so it should stay
        // rotatable just like a freshly-placed triangle would be.
        if (obj.rotation) obj.isTriangle = true;
      } else if (cat === '2') {
        obj.gr = Number(coords[2]);
      } else if (cat === '3') {
        obj.gw = Number(coords[2]);
        obj.gh = Number(coords[3]);
        const fX = Number(coords[4]) * 0.1;
        const fY = Number(coords[5]) * 0.1;
        obj.fanAngle = this._fanComponentsToAngle(type, fX, fY);
        // Preserve the original magnitude (0-10 scale before the *0.1 the
        // game applies on decode) so re-saving a loaded fan doesn't reset
        // its strength back to the editor's default.
        obj.fanMagnitude = Math.round(Math.max(Math.abs(Number(coords[4])), Math.abs(Number(coords[5]))));
      } else if (cat === '4') {
        obj.gw = Number(coords[2]);
        obj.gh = Number(coords[3]);
        obj.param = Number(coords[4]);
      } else if (cat === '5') {
        obj.gw = Number(coords[2]);
        obj.gh = Number(coords[3]);
        obj.strength = Number(coords[4]);
        obj.rotation = coords[5] ? Number(coords[5]) * 90 : 0;
      } else if (cat === '7') {
        obj.gr = Number(coords[2]) / 2;
      } else if (cat === '8') {
        obj.mode = coords[2] ? Number(coords[2]) : 0;
        obj.gr = coords[3] ? Number(coords[3]) / 2 : 0.375;
      } else if (cat === '0') {
        if (type === '5' || type === '7') {
          obj.gw = Number(coords[3]) || 1;
          obj.gh = Number(coords[2]) || 1;
        } else {
          obj.gw = Number(coords[2]) || 1;
          obj.gh = Number(coords[3]) || 1;
        }
      }

      this.objects.push(obj);
    }

    // Assemble moving platforms back into editable objects with waypoints attached.
    for (const pathId in pendingDefs) {
      const def = pendingDefs[pathId];
      const wps = (pendingWps[pathId] || []).slice().sort((a, b) => a.order - b.order);
      this.objects.push({
        _id: this._nextObjId++,
        cat: '6', type: '0',
        gx: def.gx, gy: def.gy, gw: def.gw, gh: def.gh,
        speed: def.speed, loop: def.loop, pauseFrames: def.pauseFrames,
        waypoints: wps.map(w => ({ gx: w.gx, gy: w.gy })),
        pathId: pathId,
      });
    }
  }

  // Recovers a fan's stored 8-direction type code + magnitude pair back into
  // a continuous angle (radians) for free rotation in the editor.
  _fanComponentsToAngle(type, fX, fY) {
    // type 0..7 = N, NE, E, SE, S, SW, W, NW (matches decodeLevelId's sign logic)
    const dirs = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];
    const t = Number(type);
    const d = dirs[t] || [1, 0];
    return Math.atan2(d[1] * Math.abs(fY || 1), d[0] * Math.abs(fX || 1));
  }

  // Computes how far the level's leftmost/topmost edge sits from grid
  // (0,0) — the offset toDataString() subtracts from every coordinate
  // before saving. The live game's own wall-collision and camera-follow
  // logic (checkEdges/checkChangeCam in Ball.js) hard-assumes a level's
  // blocks start right at the origin, the same way Level.js only ever
  // levels the *maximum* extent and assumes 0 for the minimum — so a
  // level built by clicking around anywhere on the editor's pannable
  // canvas needs this normalization or it would have a confusing dead
  // zone of "wall" space between the real origin and where the level
  // actually starts.
  _computeOriginOffset() {
    const bounds = this._computeLevelBounds();
    if (!bounds) return { ox: 0, oy: 0 };
    // Round to whole grid cells so every object's snapped position stays
    // exactly grid-aligned after the shift (objects are already placed on
    // integer grid coordinates, but bounds.minX/minY are in pixels and
    // could include a fractional-grid-cell margin from a non-rect object's
    // own radius, so floor rather than round to be sure nothing that was
    // at gx=0 internally ends up shifted to a small negative number from
    // rounding the wrong way).
    const ox = Math.floor(bounds.minX / this.gridSizeX);
    const oy = Math.floor(bounds.minY / this.gridSizeY);
    return { ox, oy };
  }

  // ── Serialising editor objects back into the game's level-id string ─────
  toDataString() {
    const elements = [];
    let pathCounter = 0;
    const { ox, oy } = this._computeOriginOffset();

    for (const obj of this.objects) {
      if (obj.editorOnly) continue;
      // Every coordinate gets shifted by the level's own origin offset so
      // the leftmost/topmost block always lands at grid (0,0) in the saved
      // data — see _computeOriginOffset()'s note on why this matters.
      const sgx = obj.gx - ox, sgy = obj.gy - oy;

      if (obj.cat === '6') {
        const pathId = 'p' + (pathCounter++);
        const speed = obj.speed != null ? obj.speed : 4;
        const loop = obj.loop ? 1 : 0;
        const pause = obj.pauseFrames || 0;
        elements.push(`60${sgx}z${sgy}z${obj.gw}z${obj.gh}z${speed}z${pathId}z${loop}z${pause}`);
        (obj.waypoints || []).forEach((wp, i) => {
          elements.push(`61${wp.gx - ox}z${wp.gy - oy}z${pathId}z${i + 1}`);
        });
        continue;
      }

      if (obj.cat === '1') {
        const rot = obj.rotation ? Math.round(obj.rotation / 90) : 0;
        elements.push(`1${obj.type}${sgx}z${sgy}z${obj.gw}z${obj.gh}` + (rot ? `z${rot}` : ''));
      } else if (obj.cat === '2') {
        elements.push(`2${obj.type}${sgx}z${sgy}z${obj.gr}`);
      } else if (obj.cat === '3') {
        const { type, fX, fY } = this._fanAngleToComponents(obj.fanAngle || 0, obj.fanMagnitude || 8);
        elements.push(`3${type}${sgx}z${sgy}z${obj.gw}z${obj.gh}z${fX}z${fY}`);
      } else if (obj.cat === '4') {
        elements.push(`4${obj.type}${sgx}z${sgy}z${obj.gw}z${obj.gh}z${obj.param}`);
      } else if (obj.cat === '5') {
        const padRot = obj.rotation ? Math.round(obj.rotation / 90) % 4 : 0;
        elements.push(`5${obj.type}${sgx}z${sgy}z${obj.gw}z${obj.gh}z${obj.strength}` + (padRot ? `z${padRot}` : ''));
      } else if (obj.cat === '7') {
        elements.push(`7${obj.type}${sgx}z${sgy}z${Math.round(obj.gr * 2)}`);
      } else if (obj.cat === '8') {
        elements.push(`8${obj.type}${sgx}z${sgy}z${obj.mode}z${Math.round(obj.gr * 2)}`);
      } else if (obj.cat === '0') {
        if (obj.type === '5' || obj.type === '7') {
          elements.push(`0${obj.type}${sgx}z${sgy}z${obj.gh || 1}z${obj.gw || 1}`);
        } else {
          elements.push(`0${obj.type}${sgx}z${sgy}z${obj.gw || 1}z${obj.gh || 1}`);
        }
      }
    }
    return elements.join(' ');
  }

  // Converts a continuous angle (radians) back to the nearest of the 8
  // direction type codes + integer 0-10 magnitude components the game's
  // decodeLevelId expects (fX/fY are stored *10, sign baked into type).
  _fanAngleToComponents(angle, magnitude = 8) {
    const dirs = [
      [0, -1], [1, -1], [1, 0], [1, 1],
      [0, 1], [-1, 1], [-1, 0], [-1, -1],
    ];
    let best = 0, bestDot = -Infinity;
    const ax = Math.cos(angle), ay = Math.sin(angle);
    for (let i = 0; i < dirs.length; i++) {
      const [dx, dy] = dirs[i];
      const mag = Math.sqrt(dx * dx + dy * dy) || 1;
      const dot = (ax * dx + ay * dy) / mag;
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    return { type: best, fX: magnitude, fY: magnitude };
  }

  // ── Open / activate ──────────────────────────────────────────────────────
  // Starts a fresh blank level.
  openBlank() {
    this.objects = [];
    this._nextObjId = 1;
    this.levelName = 'Untitled Level';
    this.background = 'none';
    this.gimmick = 'NIL';
    this.editingCustomId = null;
    this.camX = 0;
    this.camY = 0;
    // layout isn't valid yet at this point (it's only computed once per
    // frame in update(), which runs after this), so the actual spawn-
    // centering math happens there instead, gated by this flag.
    this._pendingSpawnCenter = true;
    this.selectedObject = null;
    this.activePopup = null;
    this.placingWaypointsFor = null;
    this.selectedPaletteItem = null;
    this.pendingCorner = null;
    // Seed a start marker so new levels always have a spawn point.
    this.objects.push({ _id: this._nextObjId++, cat: '0', type: '0', gx: 2, gy: 30, gw: 1, gh: 1 });
    this._takeSnapshot();
  }

  // Loads a custom level (by its localStorage id) into the editor for editing.
  openCustomLevel(customId) {
    const all = this._loadCustomLevels();
    const lvl = all.find(l => l.id === customId);
    if (!lvl) { this.openBlank(); return; }
    this.loadFromDataString(lvl.data, lvl.name, lvl.background, lvl.gimmick);
    this.editingCustomId = customId;
    this.camX = 0;
    this.camY = 0;
    this._pendingSpawnCenter = true;
    this.selectedObject = null;
    this.activePopup = null;
    this.placingWaypointsFor = null;
    this.selectedPaletteItem = null;
    this.pendingCorner = null;
    this._takeSnapshot();
  }

  // ── localStorage custom-level persistence ────────────────────────────────
  _loadCustomLevels() {
    try {
      const raw = localStorage.getItem('custom_levels');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  _saveCustomLevels(list) {
    localStorage.setItem('custom_levels', JSON.stringify(list));
  }

  save() {
    const all = this._loadCustomLevels();
    const data = this.toDataString();
    if (this.editingCustomId !== null) {
      const idx = all.findIndex(l => l.id === this.editingCustomId);
      if (idx !== -1) {
        all[idx] = { ...all[idx], name: this.levelName, data, background: this.background, gimmick: this.gimmick, updatedAt: Date.now() };
      } else {
        all.push({ id: this.editingCustomId, name: this.levelName, data, background: this.background, gimmick: this.gimmick, createdAt: Date.now(), updatedAt: Date.now() });
      }
    } else {
      const newId = 'custom_' + Date.now();
      this.editingCustomId = newId;
      all.push({ id: newId, name: this.levelName, data, background: this.background, gimmick: this.gimmick, createdAt: Date.now(), updatedAt: Date.now() });
    }
    this._saveCustomLevels(all);
    this._takeSnapshot();
    return true;
  }

  deleteCustomLevel(customId) {
    const all = this._loadCustomLevels().filter(l => l.id !== customId);
    this._saveCustomLevels(all);
  }

  // ── Unsaved-changes leveling ─────────────────────────────────────────────
  // Records what "saved" currently looks like, so a later call to
  // hasUnsavedChanges() can tell whether the player has changed anything
  // since the last save/load. Called right after openBlank(), 
  // openCustomLevel(), and save() — i.e. every point where the editor's
  // current state and its on-disk (localStorage) state are known to match.
  _takeSnapshot() {
    this._lastSavedSnapshot = this.toDataString() + '||' + this.levelName + '||' + this.background + '||' + this.gimmick;
  }

  // True if anything has changed since the last save/load — i.e. Save
  // would actually write something different than what's already stored.
  hasUnsavedChanges() {
    if (this._lastSavedSnapshot === null) return false;
    const current = this.toDataString() + '||' + this.levelName + '||' + this.background + '||' + this.gimmick;
    return current !== this._lastSavedSnapshot;
  }

  // ── Grid <-> world helpers ────────────────────────────────────────────────
  worldToGrid(px, py) {
    return {
      gx: Math.round(px / this.gridSizeX),
      gy: Math.round(py / this.gridSizeY),
    };
  }

  // Finer-grained snap used only for circular ("Ball"/CirclePlatform, cat
  // '2') objects: width/40,height/40 is one full grid space, so dividing
  // by 80 instead of 40 below snaps to half a grid space along each axis —
  // letting circles be positioned more precisely than the standard
  // whole-grid-cell placement every other block type uses.
  worldToGridFine(px, py) {
    const halfX = this.gridSizeX / 2, halfY = this.gridSizeY / 2;
    return {
      gx: Math.round(px / halfX) * 0.5,
      gy: Math.round(py / halfY) * 0.5,
    };
  }

  gridToWorld(gx, gy) {
    return { x: gx * this.gridSizeX, y: gy * this.gridSizeY };
  }

  // Converts a screen-space mouse coordinate into world coordinates given
  // the editor's own camera (pan) offset and the canvas-area rect.
  screenToWorld(sx, sy) {
    const L = this.layout;
    return {
      x: sx - L.canvasX + this.camX,
      y: sy - L.canvasY + this.camY,
    };
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  _layout() {
    const topBarH = height * 0.09;
    const paletteW = Math.min(width * 0.24, 320);
    const tabBarH = height * 0.05;

    const layout = {
      topBarH,
      paletteW,
      tabBarH,
      canvasX: paletteW,
      canvasY: topBarH,
      canvasW: width - paletteW,
      canvasH: height - topBarH,
    };

    // Top bar buttons (left -> right): name field, then right-aligned
    // Exit / Import / Load / Test / Export / Save group. Import sits next
    // to Load (both "bring a level in") and Export sits next to Save
    // (both "get this level's data out") so the two pairs read naturally.
    const btnH = topBarH * 0.62;
    const btnY = topBarH / 2 - btnH / 2;
    const btnGap = width * 0.012;
    const btnW = Math.min(width * 0.09, 130);

    layout.saveBtn = { x: width - btnW - btnGap, y: btnY, w: btnW, h: btnH };
    layout.exportBtn = { x: layout.saveBtn.x - btnW - btnGap, y: btnY, w: btnW, h: btnH };
    layout.testBtn = { x: layout.exportBtn.x - btnW - btnGap, y: btnY, w: btnW, h: btnH };
    layout.loadBtn = { x: layout.testBtn.x - btnW - btnGap, y: btnY, w: btnW, h: btnH };
    layout.importBtn = { x: layout.loadBtn.x - btnW - btnGap, y: btnY, w: btnW, h: btnH };
    layout.exitBtn = { x: layout.importBtn.x - btnW - btnGap, y: btnY, w: btnW, h: btnH };

    layout.nameField = {
      x: btnGap, y: btnY,
      w: layout.exitBtn.x - btnGap * 2,
      h: btnH,
    };

    // Palette tab strip (vertical list of tab labels along the very top of
    // the left palette panel — PolyLevel groups categories as a row of
    // tabs, we stack them as a compact top row that can wrap).
    const tabH = tabBarH;
    layout.tabRects = [];
    const perRow = 3;
    const tabW = paletteW / perRow;
    for (let i = 0; i < this.tabs.length; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      layout.tabRects.push({
        x: col * tabW, y: topBarH + row * tabH, w: tabW, h: tabH,
      });
    }
    const tabRows = Math.ceil(this.tabs.length / perRow);
    layout.tabAreaH = tabRows * tabH;

    // Palette item grid (below tabs)
    layout.paletteGridY = topBarH + layout.tabAreaH;
    layout.paletteGridH = height - layout.paletteGridY;
    const itemCols = 2;
    const itemPad = paletteW * 0.06;
    // Each of itemCols columns gets an equal share of the width left over
    // after itemCols+1 gaps of padding (left edge, between columns, right
    // edge) are subtracted — dividing by itemCols here is required, or the
    // second column overflows straight out of the palette panel.
    const itemW = (paletteW - itemPad * (itemCols + 1)) / itemCols;
    const itemH = itemW * 0.62;
    layout.itemCols = itemCols;
    layout.itemPad = itemPad;
    layout.itemW = itemW;
    layout.itemH = itemH;

    return layout;
  }

  // ── Main update/draw entry point (called once per frame from sketch) ────
  update() {
    this.layout = this._layout();
    if (this._pendingSpawnCenter) {
      this.centerOnSpawn();
      this._pendingSpawnCenter = false;
    }
  }

  show() {
    const L = this.layout;
    push();
    // Whole-screen base
    background(24, 28, 30);

    this._drawCanvasArea();
    this._drawPalette();
    this._drawTopBar();

    if (this.activePopup) this._drawPopup();
    pop();
  }

  // ── Canvas (level editing surface) ──────────────────────────────────────
  _drawCanvasArea() {
    const L = this.layout;
    push();
    // Clip-ish: just fill the bg for the canvas region, then translate.
    fill(40, 46, 50);
    rect(L.canvasX, L.canvasY, L.canvasW, L.canvasH);

    push();
    translate(L.canvasX - this.camX, L.canvasY - this.camY);

    this._drawGridLines();

    // Draw placed objects, grouped so visuals layer sensibly (zones under
    // platforms under fans/markers, similar to doSmth()'s draw order).
    const order = ['4', '2', '1', '5', '6', '3', '7', '8', '0'];
    for (const cat of order) {
      for (const obj of this.objects) {
        if (obj.cat === cat) this._drawObject(obj);
      }
    }

    // Moving-platform path preview + waypoint placement crosshair
    if (this.placingWaypointsFor) {
      this._drawWaypointGhost();
    }

    // Ghost preview for an item armed from the palette, following the mouse
    if (this.selectedPaletteItem && !this.placingWaypointsFor && this._mouseInCanvas()) {
      this._drawGhostAtMouse();
    }
    // Pin-marker at the first-clicked corner, kept visible independent of
    // mouse position/canvas-hover state so it doesn't flicker if the mouse
    // briefly leaves the canvas while lining up the second corner.
    if (this.pendingCorner) {
      this._drawPendingCornerMarker();
    }

    // Selection highlight + floating toolbar
    if (this.selectedObject) {
      this._drawSelectionOutline(this.selectedObject);
    }

    pop(); // undo translate
    pop();

    // Small persistent hint, bottom-right of the canvas — the panning
    // gesture and keyboard shortcuts have no other on-screen affordance,
    // so without this there's no way to discover them. Shortened and
    // shrunk on narrow canvases so it never overflows into the palette.
    push();
    fill(255, 255, 255, 110);
    textAlign(RIGHT, BOTTOM);
    textFont(gameFont);
    noStroke();
    const isNarrow = L.canvasW < 420;
    const isVeryNarrow = L.canvasW < 260;
    if (!isVeryNarrow) {
      textSize(isNarrow ? 10 : 12);
      const hintText = isNarrow ? 'Drag empty space to pan' : 'Drag empty space to pan  ·  [R] rotate  ·  [Del] delete';
      text(hintText, L.canvasX + L.canvasW - 10, L.canvasY + L.canvasH - 8);
    }
    pop();

    // "Center View" button, bottom-left — recovers a player who panned far
    // away from their level and can no longer see any of it to navigate
    // back by dragging. Recenters on the average position of every placed
    // object (falling back to the world origin if the level is empty).
    this._drawCenterViewButton(L);

    // Selected object's floating toolbar is drawn in screen space (after
    // the translate pop) so its buttons keep fixed visual size regardless
    // of zoom/pan, and so their click-rects don't need camera math.
    // Skipped while actively placing waypoints — the "Finish Path" banner
    // below takes over as the relevant action for that object instead.
    if (this.selectedObject && !this.placingWaypointsFor) {
      this._drawObjectToolbar(this.selectedObject);
    }

    if (this.placingWaypointsFor) {
      this._drawWaypointBanner();
    } else if (this.selectedPaletteItem && !this.selectedPaletteItem.singleClick) {
      this._drawCornerPlacementBanner();
    }
  }

  // Hint banner for the two-corner placement flow — without this there's
  // no on-screen explanation of why a single click doesn't immediately
  // place anything for most block types now.
  _drawCornerPlacementBanner() {
    const L = this.layout;
    const bw = Math.min(L.canvasW * 0.6, 460);
    const bh = 36;
    const bx = L.canvasX + L.canvasW / 2 - bw / 2;
    const by = L.canvasY + 14;
    const msg = this.pendingCorner
      ? 'Click the opposite corner to finish placing'
      : 'Click one corner, then click the opposite corner';

    push();
    fill(20, 22, 24, 215);
    stroke(255, 255, 255, 90);
    strokeWeight(1);
    rect(bx, by, bw, bh, 8);
    noStroke();
    fill(230);
    textAlign(CENTER, CENTER);
    textFont(gameFont);
    textSize(13);
    text(msg, bx + bw / 2, by + bh / 2);
    pop();
  }

  // On-screen hint + explicit exit button while laying down a moving
  // platform's path — without this, the only way to stop adding waypoints
  // is the (undiscoverable) ESC key.
  _drawWaypointBanner() {
    const L = this.layout;
    const bw = Math.min(L.canvasW * 0.5, 420);
    const bh = 44;
    const bx = L.canvasX + L.canvasW / 2 - bw / 2;
    const by = L.canvasY + 14;

    push();
    fill(20, 22, 24, 235);
    stroke(255, 220, 120);
    strokeWeight(1.5);
    rect(bx, by, bw, bh, 8);
    noStroke();
    fill(255, 220, 120);
    textAlign(LEFT, CENTER);
    textFont(gameFont);
    textSize(14);
    text('Click to add waypoints to the path', bx + 14, by + bh / 2);

    const btn = { x: bx + bw - 118, y: by + 6, w: 106, h: bh - 12 };
    this._waypointDoneBtn = btn;
    const hovering = mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h;
    fill(hovering ? color(220, 180, 90) : color(255, 220, 120));
    rect(btn.x, btn.y, btn.w, btn.h, 6);
    fill(20, 22, 24);
    textAlign(CENTER, CENTER);
    textSize(13);
    text('Finish Path', btn.x + btn.w / 2, btn.y + btn.h / 2);
    pop();
  }

  _mouseInCanvas() {
    const L = this.layout;
    return mouseX >= L.canvasX && mouseX <= L.canvasX + L.canvasW &&
           mouseY >= L.canvasY && mouseY <= L.canvasY + L.canvasH;
  }

  _drawGridLines() {
    const L = this.layout;
    const gx = this.gridSizeX, gy = this.gridSizeY;
    stroke(255, 255, 255, 18);
    strokeWeight(1);
    const startX = Math.floor(this.camX / gx) * gx - gx;
    const endX = this.camX + L.canvasW + gx;
    const startY = Math.floor(this.camY / gy) * gy - gy;
    const endY = this.camY + L.canvasH + gy;
    for (let x = startX; x <= endX; x += gx) {
      line(x, startY, x, endY);
    }
    for (let y = startY; y <= endY; y += gy) {
      line(startX, y, endX, y);
    }
    noStroke();
  }

  // ── Drawing a single placed object using a lightweight stand-in of the
  // real game visuals (full physics classes aren't needed for editing) ────
  // Every measurement below deliberately mirrors decodeLevelId()'s exact
  // per-field axis choice (see the constructor's note on gridSizeX/Y) —
  // x/w always gridSizeX, y/h always gridSizeY, and radii use whichever
  // axis that category's own decode branch happens to multiply by.
  _drawObject(obj) {
    const gx = this.gridSizeX, gy = this.gridSizeY;
    const x = obj.gx * gx, y = obj.gy * gy;
    push();
    noStroke();

    if (obj.cat === '1') {
      const w = obj.gw * gx, h = obj.gh * gy;
      const col = this._surfaceColor('1', obj.type);
      fill(col[0], col[1], col[2]);
      if (!obj.rotation) {
        rect(x, y, w, h);
      } else {
        this._drawRotatedTriangle(x, y, w, h, obj.rotation);
      }
    } else if (obj.cat === '2') {
      // CirclePlatform's radius is scaled by width/40 in decodeLevelId
      // regardless of which axis it visually spans.
      const r = obj.gr * gx;
      const col = this._surfaceColor('2', obj.type);
      fill(col[0], col[1], col[2]);
      circle(x, y, r * 2);
    } else if (obj.cat === '3') {
      const w = obj.gw * gx, h = obj.gh * gy;
      fill(100);
      rect(x, y, w, h);
      push();
      translate(x + w / 2, y + h / 2);
      rotate(obj.fanAngle || 0);
      fill(150, 150, 250);
      translate(gx * 0.5, 0);
      triangle(-8, -5, -8, 5, 8, 0);
      pop();
    } else if (obj.cat === '4') {
      const w = obj.gw * gx, h = obj.gh * gy;
      if (obj.type === '0') fill(194, 240, 255, 160);
      else if (obj.type === '1') fill(55, 74, 250, 99);
      else fill(252, 96, 237, 99);
      rect(x, y, w, h);
    } else if (obj.cat === '5') {
      const w = obj.gw * gx, h = obj.gh * gy;
      const col = this._padColor(obj.type);
      fill(col[0], col[1], col[2]);
      rect(x, y, w, h);
      // Orientation indicator — matches the direction the pad will
      // actually launch the ball in gameplay/test-play (see BouncePad's
      // this.dir, derived from this same rotation value).
      if (obj.rotation) {
        push();
        translate(x + w / 2, y + h / 2);
        rotate(obj.rotation || 0);
        stroke(255, 255, 255, 200);
        strokeWeight(2);
        const arrowLen = Math.min(w, h) * 0.6;
        line(0, arrowLen / 2, 0, -arrowLen / 2);
        line(0, -arrowLen / 2, -4, -arrowLen / 2 + 6);
        line(0, -arrowLen / 2, 4, -arrowLen / 2 + 6);
        noStroke();
        pop();
      }
    } else if (obj.cat === '6') {
      const w = obj.gw * gx, h = obj.gh * gy;
      fill(184, 134, 11);
      rect(x, y, w, h);
      this._drawMovingPlatformPath(obj);
    } else if (obj.cat === '7') {
      // Particle radius is scaled by height/40 in decodeLevelId.
      const r = obj.gr * gy;
      const col = this._particleColor(obj.type);
      if (Number(obj.type) >= 3) {
        noFill();
        stroke(col[0], col[1], col[2]);
        strokeWeight(2);
        circle(x, y, r * 2);
        noStroke();
      } else {
        fill(col[0], col[1], col[2]);
        circle(x, y, r * 2);
      }
    } else if (obj.cat === '8') {
      // PowerUp radius is scaled by width/40 in decodeLevelId.
      const r = obj.gr * gx;
      let col;
      if (obj.type === '0') {
        col = [255, 200, 0];
      } else if (obj.type === '1') {
        col = [0, 220, 220];
      } else if (obj.type === '2') {
        col = [90, 150, 255];
      } else if (obj.type === '3') {
        col = [255, 100, 100];
      } else if (obj.type === '4') {
        col = [200, 200, 200];
      } else if (obj.type === '5') {
        col = [140, 255, 120];
      } else {
        col = [255, 255, 255];
      }
      fill(col[0], col[1], col[2]);
      circle(x, y, r * 2);
    } else if (obj.cat === '0') {
      const w = (obj.gw || 1) * gx, h = (obj.gh || 1) * gy;
      if (obj.type === '0') {
        fill(80, 200, 120);
        rect(x, y, w, h);
      } else if (obj.type === '1') {
        fill(255, 220, 0);
        rect(x, y, w, h);
      } else if (obj.type === '2') {
        fill(178, 34, 34);
        rect(x, y, w, h);
      } else if (obj.type === '3') {
        // Editor-only placement marker: visible in the editor but ignored
        // entirely by gameplay, so it is safe to use as a top/bottom guide.
        noFill();
        stroke(150, 150, 150, 180);
        strokeWeight(2);
        rect(x + 1, y + 1, w-2, h-2, 8);
        noStroke();
      } else if (['4','5','6','7'].includes(obj.type)) {
        // Directional signage preview in editor
        const rotIndex = Number(obj.type) - 4; // 0..3
        let previewW = w;
        let previewH = h;
        if (obj.type === '5' || obj.type === '7') {
          [previewW, previewH] = [h, w];
        }
        push();
        translate(x + w / 2, y + h / 2);
        // Invert rotation to match Sign drawing convention
        rotate(rotIndex * 90);
        rectMode(CENTER);
        noStroke();
        fill(220);
        rect(0, 0, Math.max(6, previewW * 0.28), Math.max(6, previewH * 0.18), 4);
        fill(180);
        triangle(previewW * 0.22, 0, -previewW * 0.02, -previewH * 0.22, -previewW * 0.02, previewH * 0.22);
        pop();
      }
    }
    pop();
  }

  _drawRotatedTriangle(x, y, w, h, rotation) {
    let v1, v2, v3;
    if (rotation === 90) {
      v2 = { x, y }; v3 = { x, y: y + h }; v1 = { x: x + w, y };
    } else if (rotation === 180) {
      v1 = { x, y }; v2 = { x: x + w, y }; v3 = { x: x + w, y: y + h };
    } else if (rotation === 270) {
      v3 = { x: x + w, y }; v2 = { x: x + w, y: y + h }; v1 = { x, y: y + h };
    } else {
      v3 = { x, y }; v2 = { x, y: y + h }; v1 = { x: x + w, y: y + h };
    }
    triangle(v1.x, v1.y, v2.x, v2.y, v3.x, v3.y);
  }

  _drawMovingPlatformPath(obj) {
    const gx = this.gridSizeX, gy = this.gridSizeY;
    const pts = [{ gx: obj.gx, gy: obj.gy }, ...(obj.waypoints || [])];
    if (pts.length < 2) return;
    push();
    stroke(255, 220, 120, 180);
    strokeWeight(2);
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([6, 6]);
    for (let i = 0; i < pts.length - 1; i++) {
      line(pts[i].gx * gx, pts[i].gy * gy, pts[i + 1].gx * gx, pts[i + 1].gy * gy);
    }
    if (obj.loop && pts.length > 2) {
      line(pts[pts.length - 1].gx * gx, pts[pts.length - 1].gy * gy, pts[0].gx * gx, pts[0].gy * gy);
    }
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([]);
    noStroke();
    fill(255, 220, 120);
    for (let i = 1; i < pts.length; i++) {
      circle(pts[i].gx * gx, pts[i].gy * gy, 8);
    }
    pop();
  }

  _surfaceColor(cat, type) {
    const map = {
      0: [200, 200, 200], 1: [5, 232, 224], 2: [232, 122, 5],
      3: [2, 168, 54], 4: [184, 134, 11],
    };
    return map[Number(type)] || [200, 200, 200];
  }

  _padColor(type) {
    const map = { 0: [200, 200, 200], 1: [5, 232, 224], 2: [232, 122, 5], 10: [9, 227, 85], 11: [9, 227, 85], 12: [9, 227, 85] };
    return map[Number(type)] || [200, 200, 200];
  }

  _particleColor(type) {
    const map = {
      0: [30, 120, 255], 1: [220, 50, 50], 2: [200, 200, 200],
      3: [30, 120, 255], 4: [220, 50, 50], 5: [150, 150, 150],
    };
    return map[Number(type)] || [200, 200, 200];
  }

  // ── Palette panel (tabs + item grid) ─────────────────────────────────────
  _drawPalette() {
    const L = this.layout;
    push();
    fill(18, 20, 22);
    rect(0, 0, L.paletteW, height);

    // Tabs
    this.hoveredTab = -1;
    for (let i = 0; i < this.tabs.length; i++) {
      const r = L.tabRects[i];
      const isActive = i === this.activeTab;
      const hovering = mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
      if (hovering) this.hoveredTab = i;

      fill(isActive ? color(86, 167, 134) : hovering ? color(45, 50, 53) : color(30, 33, 35));
      rect(r.x, r.y, r.w - 1, r.h - 1);
      fill(isActive ? 255 : 200);
      noStroke();
      textAlign(CENTER, CENTER);
      textSize(Math.min(r.w * 0.16, 13));
      textFont(gameFont);
      text(this.tabs[i].name, r.x + r.w / 2, r.y + r.h / 2);
    }

    // Divider under tabs
    stroke(0, 0, 0, 120);
    strokeWeight(1);
    line(0, L.paletteGridY, L.paletteW, L.paletteGridY);
    noStroke();

    // Item grid for active tab
    this._drawPaletteItems();
    pop();
  }

  _drawPaletteItems() {
    const L = this.layout;
    const items = this.tabs[this.activeTab].items;
    this.hoveredPaletteItem = -1;

    const rowsTotal = Math.ceil(items.length / L.itemCols);
    const rowH = L.itemH + L.itemPad;
    const rowsVisible = Math.max(1, Math.floor((L.paletteGridH - L.itemPad) / rowH));
    const maxScroll = Math.max(0, rowsTotal - rowsVisible);
    // Clamp here (rather than only where it's changed) since switching tabs
    // can leave a scroll offset that's no longer valid for the new tab's
    // (possibly shorter) item list.
    this.paletteScrollRow = Math.max(0, Math.min(this.paletteScrollRow || 0, maxScroll));
    const scrollPx = this.paletteScrollRow * rowH;

    // Clip drawing to the item-grid area so rows scrolled partway off the
    // top/bottom don't bleed into the tab bar or top bar above.
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(0, L.paletteGridY, L.paletteW, L.paletteGridH);
    drawingContext.clip();

    for (let i = 0; i < items.length; i++) {
      const col = i % L.itemCols;
      const row = Math.floor(i / L.itemCols);
      const x = L.itemPad + col * (L.itemW + L.itemPad);
      const y = L.paletteGridY + L.itemPad + row * (L.itemH + L.itemPad) - scrollPx;
      if (y + L.itemH < L.paletteGridY || y > L.paletteGridY + L.paletteGridH) continue; // off-screen, skip
      const item = items[i];

      const hovering = mouseX >= x && mouseX <= x + L.itemW && mouseY >= y && mouseY <= y + L.itemH &&
                        mouseY >= L.paletteGridY && mouseY <= L.paletteGridY + L.paletteGridH;
      if (hovering) this.hoveredPaletteItem = i;
      const isSelected = this.selectedPaletteItem === item;

      push();
      fill(isSelected ? color(86, 167, 134, 230) : hovering ? color(50, 55, 58) : color(36, 40, 42));
      stroke(isSelected ? color(180, 255, 220) : 0, isSelected ? 255 : 0, 0, isSelected ? 255 : 0);
      strokeWeight(isSelected ? 2 : 0);
      rect(x, y, L.itemW, L.itemH, 6);
      noStroke();

      // Icon swatch — circle for radius-based items, triangle for the
      // triangle-platform variants, rounded rect for everything else.
      const swatchSize = Math.min(L.itemW, L.itemH) * 0.42;
      const col1 = item.col || [180, 180, 180];
      fill(col1[0], col1[1], col1[2]);
      const cx = x + L.itemW / 2, cy = y + L.itemH * 0.38;
      if (item.isTriangle) {
        triangle(cx - swatchSize * 0.6, cy + swatchSize * 0.5,
                 cx + swatchSize * 0.6, cy + swatchSize * 0.5,
                 cx + swatchSize * 0.6, cy - swatchSize * 0.5);
      } else if (item.r !== undefined) {
        circle(cx, cy, swatchSize);
      } else {
        rectMode(CENTER);
        rect(cx, cy, swatchSize * 1.3, swatchSize * 0.85, 3);
        rectMode(CORNER);
      }

      fill(230);
      textAlign(CENTER, CENTER);
      textSize(Math.min(L.itemW * 0.13, 12));
      textFont(gameFont);
      text(item.label, x + L.itemW / 2, y + L.itemH * 0.82);
      pop();
    }

    drawingContext.restore();
    pop();

    // Scroll buttons — only drawn when the list is actually taller than
    // the visible area, same "don't show nav nobody needs" rule used for
    // the level-select screen's custom-level pagination.
    if (maxScroll > 0) {
      this._drawPaletteScrollButtons(L, maxScroll);
    } else {
      this._paletteScrollBtns = null;
    }
  }

  _drawPaletteScrollButtons(L, maxScroll) {
    const btnSize = 26;
    const upBtn = { x: L.paletteW - btnSize - 6, y: L.paletteGridY + 6, w: btnSize, h: btnSize };
    const downBtn = { x: L.paletteW - btnSize - 6, y: L.paletteGridY + L.paletteGridH - btnSize - 6, w: btnSize, h: btnSize };
    this._paletteScrollBtns = { upBtn, downBtn, maxScroll };

    const canUp = this.paletteScrollRow > 0;
    const canDown = this.paletteScrollRow < maxScroll;
    for (const [r, enabled, label] of [[upBtn, canUp, '▲'], [downBtn, canDown, '▼']]) {
      const hovering = enabled && mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
      push();
      fill(enabled ? (hovering ? color(70, 75, 78, 235) : color(40, 44, 46, 220)) : color(30, 32, 34, 150));
      stroke(enabled ? 255 : 120, enabled ? 255 : 120, enabled ? 255 : 120, enabled ? 90 : 60);
      strokeWeight(1);
      rect(r.x, r.y, r.w, r.h, 5);
      noStroke();
      fill(enabled ? 230 : 120);
      textAlign(CENTER, CENTER);
      textSize(12);
      text(label, r.x + r.w / 2, r.y + r.h / 2 - 1);
      pop();
    }
  }

  // ── Top bar ───────────────────────────────────────────────────────────────
  _drawTopBar() {
    const L = this.layout;
    push();
    fill(14, 16, 18);
    rect(L.paletteW, 0, width - L.paletteW, L.topBarH);

    // Name field
    const nf = L.nameField;
    const hoveringName = mouseX >= nf.x && mouseX <= nf.x + nf.w && mouseY >= nf.y && mouseY <= nf.y + nf.h;
    fill(hoveringName ? color(40, 45, 47) : color(30, 33, 35));
    rect(nf.x, nf.y, nf.w, nf.h, 8);
    fill(255);
    textAlign(LEFT, CENTER);
    textSize(Math.min(nf.h * 0.4, 18));
    textFont(gameFont);
    let nameDisplay = this.levelName;
    if (this.background && this.background !== 'none') {
      nameDisplay += `   ·   ${this.background[0].toUpperCase()}${this.background.slice(1)} bg`;
    }
    if (this.gimmick && this.gimmick !== 'NIL') {
      const gimmickLabels = {
        InfiniteClicks: 'Infinite Clicks',
        ChargeSwitch: 'Charge Switch',
      };
      const tokens = (this.gimmick || 'NIL').split(' ').filter(Boolean).filter(t => t !== 'NIL');
      if (tokens.length > 0) {
        nameDisplay += `   ·   ${tokens.map(t => gimmickLabels[t] || t).join(', ')}`;
      }
    }
    text(nameDisplay, nf.x + nf.w * 0.025, nf.y + nf.h / 2);
    fill(150);
    textAlign(RIGHT, CENTER);
    textSize(Math.min(nf.h * 0.28, 13));
    text('click to rename / set background', nf.x + nf.w * 0.98, nf.y + nf.h / 2);

    this._drawTopButton(L.exitBtn, 'Exit', color(254, 95, 85));
    this._drawTopButton(L.importBtn, 'Import', color(0, 156, 253));
    this._drawTopButton(L.loadBtn, 'Load', color(0, 156, 253));
    this._drawTopButton(L.testBtn, 'Test', color(253, 162, 0));
    this._drawTopButton(L.exportBtn, 'Export', color(86, 167, 134));
    this._drawTopButton(L.saveBtn, 'Save', color(86, 167, 134));

    // Brief "Saved!" confirmation under the Save button — without this the
    // player has no feedback that clicking Save actually did anything.
    if (this._flashSaved) {
      const elapsed = millis() - this._flashSaved;
      const FLASH_MS = 1400;
      if (elapsed < FLASH_MS) {
        const alpha = elapsed < FLASH_MS - 300 ? 255 : map(elapsed, FLASH_MS - 300, FLASH_MS, 255, 0);
        fill(86, 167, 134, alpha);
        textAlign(CENTER, TOP);
        textSize(Math.min(L.saveBtn.h * 0.32, 13));
        text('Saved!', L.saveBtn.x + L.saveBtn.w / 2, L.saveBtn.y + L.saveBtn.h + 4);
      } else {
        this._flashSaved = null;
      }
    }

    pop();
  }

  _drawTopButton(r, label, col) {
    const hovering = mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
    push();
    noFill();
    stroke(col);
    strokeWeight(hovering ? 2.5 : 1.5);
    rect(r.x, r.y, r.w, r.h, 8);
    noStroke();
    fill(col);
    textAlign(CENTER, CENTER);
    textSize(Math.min(r.h * 0.4, 16));
    textFont(gameFont);
    text(label, r.x + r.w / 2, r.y + r.h / 2);
    pop();
  }

  // ── Ghost / ad-hoc preview while an item is armed for placement ─────────
  // Before the first corner is clicked: a small marker at the snapped grid
  // cell showing where that first click will land. After it (pendingCorner
  // set): a live box from that corner to the current mouse position, since
  // every block except Start is now placed by dragging out two corners.
  _drawGhostAtMouse() {
    const item = this.selectedPaletteItem;
    const w = this.screenToWorld(mouseX, mouseY);
    const snapped = this.worldToGrid(w.x, w.y);
    const gx = this.gridSizeX, gy = this.gridSizeY;
    const col = item.col || [200, 200, 200];

    if (item.singleClick) {
      // Start marker — single click, so show its actual placed footprint
      // directly rather than the two-corner crosshair/box flow below.
      push();
      noStroke();
      fill(col[0], col[1], col[2], 140);
      rect(snapped.gx * gx, snapped.gy * gy, (item.w || 1) * gx, (item.h || 1) * gy);
      pop();
      return;
    }

    if (!this.pendingCorner) {
      // Phase 1: no corner placed yet — show a small crosshair/dot marker,
      // not the full default-size shape, since the actual size is decided
      // by the second click and showing a misleadingly large/small shape
      // here would suggest a fixed size that two-corner placement doesn't have.
      push();
      noFill();
      stroke(col[0], col[1], col[2], 220);
      strokeWeight(2);
      const markerSize = Math.min(gx, gy) * 0.4;
      line(snapped.gx * gx - markerSize, snapped.gy * gy, snapped.gx * gx + markerSize, snapped.gy * gy);
      line(snapped.gx * gx, snapped.gy * gy - markerSize, snapped.gx * gx, snapped.gy * gy + markerSize);
      noStroke();
      fill(col[0], col[1], col[2], 160);
      circle(snapped.gx * gx, snapped.gy * gy, markerSize * 0.6);
      pop();
      return;
    }

    // Phase 2: live box from the first corner to the current mouse position.
    const c = this.pendingCorner;
    const minGx = Math.min(c.gx, snapped.gx), maxGx = Math.max(c.gx, snapped.gx);
    const minGy = Math.min(c.gy, snapped.gy), maxGy = Math.max(c.gy, snapped.gy);
    const spanGx = Math.max(1, maxGx - minGx);
    const spanGy = Math.max(1, maxGy - minGy);

    push();
    noStroke();
    fill(col[0], col[1], col[2], 100);
    let boxGx = minGx, boxGy = minGy, boxGw = spanGx, boxGh = spanGy;
    if (item.r === undefined && item.halfBlock) {
      // Half-block-style item — preview the actual half-cell box the new
      // orientation-detecting placement will produce (see _placeNewObject()),
      // not the full dragged span, since that's what really gets placed.
      const horizontal = spanGx >= spanGy;
      if (horizontal) {
        boxGh = 0.5; // near/top half of the row clicked, same default as placement
      } else {
        boxGw = 0.5; // near/left half of the column clicked
      }
    }
    if (item.r !== undefined) {
      const derivedR = Math.max(0.5, Math.min(10, ((spanGx / 2) + (spanGy / 2)) / 2));
      const rAxis = item.cat === '7' ? gy : gx;
      const ccx = (minGx + spanGx / 2) * gx, ccy = (minGy + spanGy / 2) * gy;
      circle(ccx, ccy, derivedR * rAxis * 2);
    } else {
      rect(boxGx * gx, boxGy * gy, boxGw * gx, boxGh * gy);
    }
    stroke(col[0], col[1], col[2], 230);
    strokeWeight(1.5);
    noFill();
    if (item.r !== undefined) {
      rect(minGx * gx, minGy * gy, spanGx * gx, spanGy * gy);
    } else {
      rect(boxGx * gx, boxGy * gy, boxGw * gx, boxGh * gy);
    }
    pop();
  }

  // First-corner marker shown while waiting for the second click — drawn
  // separately from the live box above so it stays visible even while the
  // box itself is rendering (a small dot pinned at the actual corner).
  _drawPendingCornerMarker() {
    if (!this.pendingCorner) return;
    const gx = this.gridSizeX, gy = this.gridSizeY;
    const c = this.pendingCorner;
    push();
    noStroke();
    fill(255, 255, 255, 230);
    circle(c.gx * gx, c.gy * gy, 8);
    pop();
  }

  _drawWaypointGhost() {
    const obj = this.placingWaypointsFor;
    const gx = this.gridSizeX, gy = this.gridSizeY;
    const last = (obj.waypoints && obj.waypoints.length)
      ? obj.waypoints[obj.waypoints.length - 1]
      : { gx: obj.gx, gy: obj.gy };
    const w = this.screenToWorld(mouseX, mouseY);
    const snapped = this.worldToGrid(w.x, w.y);
    push();
    stroke(255, 220, 120, 200);
    strokeWeight(2);
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([5, 5]);
    line(last.gx * gx, last.gy * gy, snapped.gx * gx, snapped.gy * gy);
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([]);
    noStroke();
    fill(255, 220, 120, 200);
    circle(snapped.gx * gx, snapped.gy * gy, 10);
    pop();
  }

  // ── Selection outline + floating per-object toolbar ──────────────────────
  _drawSelectionOutline(obj) {
    const b = this._objectBounds(obj);
    push();
    noFill();
    stroke(255, 255, 255, 230);
    strokeWeight(2);
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([4, 3]);
    rect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    if (drawingContext && drawingContext.setLineDash) drawingContext.setLineDash([]);
    pop();
  }

  // Returns a screen-space rect for an object's floating toolbar (rotate /
  // adjust gravity / delete), anchored just above its world bounds.
  _toolbarRectFor(obj) {
    const L = this.layout;
    const b = this._objectBounds(obj);
    const screenX = b.x - this.camX + L.canvasX;
    const screenY = b.y - this.camY + L.canvasY;
    const btnSize = 30;
    // Rotation is available on triangle platforms, fans, and bounce pads —
    // plain rectangles, circles, zones, particles, and power-ups don't
    // rotate at all. All three rotate in 90-degree increments.
    const showRotate = (obj.cat === '1' && obj.isTriangle) || obj.cat === '3' || obj.cat === '5';
    const showAdjust = obj.cat === '4' && obj.type !== '0';
    const showConfig = obj.cat === '6';
    // Radius-adjust applies to circles, particles, and power-ups — the new
    // slider popup mirroring the moving-platform config popup, per the brief.
    const showRadiusAdjust = obj.cat === '2' || obj.cat === '7' || obj.cat === '8';
    // Half-blocks (plain rectangle surfaces) get a toggle for which half
    // of their single thin-axis grid cell they occupy — see _placeNewObject()'s
    // note on why this is an explicit toggle rather than derived from drag.
    const showHalfBlockToggle = obj.cat === '1' && obj.halfBlockSide !== undefined;
    let count = 1; // delete always shown
    if (showRotate) count++;
    if (showAdjust) count++;
    if (showConfig) count++;
    if (showRadiusAdjust) count++;
    if (showHalfBlockToggle) count++;
    const toolbarW = btnSize * count + 6 * (count - 1);
    const tx = Math.min(Math.max(screenX, L.canvasX), L.canvasX + L.canvasW - toolbarW);
    const ty = Math.max(screenY - btnSize - 10, L.canvasY + 4);
    return { x: tx, y: ty, btnSize, showRotate, showAdjust, showConfig, showRadiusAdjust, showHalfBlockToggle };
  }

  _drawObjectToolbar(obj) {
    const t = this._toolbarRectFor(obj);
    let cx = t.x;
    push();
    if (t.showRotate) {
      this._drawToolbarButton(cx, t.y, t.btnSize, '⟳', color(0, 156, 253));
      cx += t.btnSize + 6;
    }
    if (t.showAdjust) {
      this._drawToolbarButton(cx, t.y, t.btnSize, '≡', color(253, 162, 0));
      cx += t.btnSize + 6;
    }
    if (t.showConfig) {
      this._drawToolbarButton(cx, t.y, t.btnSize, '⚙', color(0, 156, 253));
      cx += t.btnSize + 6;
    }
    if (t.showRadiusAdjust) {
      this._drawToolbarButton(cx, t.y, t.btnSize, '◎', color(253, 162, 0));
      cx += t.btnSize + 6;
    }
    if (t.showHalfBlockToggle) {
      this._drawToolbarButton(cx, t.y, t.btnSize, obj.isHorizontalHalfBlock ? '⇕' : '⇔', color(2, 168, 54));
      cx += t.btnSize + 6;
    }
    this._drawToolbarButton(cx, t.y, t.btnSize, '✕', color(254, 95, 85));
    pop();
  }

  _drawToolbarButton(x, y, size, label, col) {
    const hovering = mouseX >= x && mouseX <= x + size && mouseY >= y && mouseY <= y + size;
    push();
    fill(hovering ? color(red(col), green(col), blue(col), 255) : color(20, 22, 24, 230));
    stroke(col);
    strokeWeight(1.5);
    rect(x, y, size, size, 6);
    fill(hovering ? 20 : col);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(size * 0.55);
    text(label, x + size / 2, y + size / 2 - 1);
    pop();
  }

  // "Center View" button — see the call site in _drawCanvasArea for why
  // this exists. Recenters the camera on the average position of every
  // placed object so the player always lands back somewhere meaningful,
  // not just back at the arbitrary (0,0) world origin.
  _drawCenterViewButton(L) {
    const isNarrow = L.canvasW < 420;
    const bw = isNarrow ? 36 : 96, bh = isNarrow ? 30 : 30;
    const bx = L.canvasX + 10;
    const by = L.canvasY + L.canvasH - bh - 10;
    this._centerViewBtn = { x: bx, y: by, w: bw, h: bh };
    const hovering = mouseX >= bx && mouseX <= bx + bw && mouseY >= by && mouseY <= by + bh;
    push();
    fill(hovering ? color(50, 55, 58, 230) : color(20, 22, 24, 200));
    stroke(255, 255, 255, 90);
    strokeWeight(1);
    rect(bx, by, bw, bh, 6);
    noStroke();
    fill(220);
    textAlign(CENTER, CENTER);
    textFont(gameFont);
    textSize(isNarrow ? 16 : 12);
    text(isNarrow ? '⌖' : '⌖ Center View', bx + bw / 2, by + bh / 2);
    pop();
  }

  // Recenters camX/camY on the average grid position of every placed
  // object, or the world origin if the level is currently empty.
  centerViewOnLevel() {
    const L = this.layout;
    if (!this.objects.length) {
      this.camX = 0;
      this.camY = 0;
      return;
    }
    let sumX = 0, sumY = 0;
    for (const obj of this.objects) {
      sumX += obj.gx;
      sumY += obj.gy;
    }
    const avgX = (sumX / this.objects.length) * this.gridSizeX;
    const avgY = (sumY / this.objects.length) * this.gridSizeY;
    this.camX = avgX - L.canvasW / 2;
    this.camY = avgY - L.canvasH / 2;
  }

  // Computes the level's true world-space bounding box — the topmost and
  // leftmost edges of the topmost/leftmost blocks, and the bottom/right
  // edges of the bottom/rightmost blocks, mirroring the live game's own
  // Level class (which only levels the max edge, always assuming a (0,0)
  // origin) but extended to also level the min edge, since the editor
  // lets blocks be placed anywhere, including at negative coordinates.
  // Returns null if the level has no objects to bound.
  // Skips any object (or waypoint) whose computed bounds contain NaN —
  // Math.min/Math.max poison their *entire* result to NaN the instant any
  // single argument is NaN, so one malformed object (e.g. from a garbled
  // Import paste — see _validateLevelCode()'s note on tolerating bad input)
  // would otherwise corrupt the bounds, and therefore the origin-shift
  // offset, for every other valid object in the level too.
  _computeLevelBounds() {
    if (!this.objects.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let sawValid = false;
    for (const obj of this.objects) {
      if (obj.editorOnly) continue;
      const b = this._objectBounds(obj);
      if ([b.x, b.y, b.w, b.h].some(v => isNaN(v))) continue;
      sawValid = true;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
      // Moving-platform waypoints extend the path well beyond the
      // platform's own resting footprint — without including them here,
      // panning/clamping could cut off part of a long path.
      if (obj.cat === '6' && obj.waypoints) {
        for (const wp of obj.waypoints) {
          const wx = wp.gx * this.gridSizeX, wy = wp.gy * this.gridSizeY;
          if (isNaN(wx) || isNaN(wy)) continue;
          minX = Math.min(minX, wx);
          minY = Math.min(minY, wy);
          maxX = Math.max(maxX, wx);
          maxY = Math.max(maxY, wy);
        }
      }
    }
    if (!sawValid) return null;
    return { minX, minY, maxX, maxY };
  }

  // Centers the camera on the Start marker, the same way a fresh test-play
  // or real playthrough would open on spawn — but clamped so the view
  // never shows area outside the level's own bounding box (computed by
  // _computeLevelBounds()) unless the whole level is smaller than the
  // viewport, in which case it's centered on the level's own midpoint
  // instead so it isn't pinned awkwardly against one edge.
  centerOnSpawn() {
    const L = this.layout;
    if (!L) return; // layout isn't ready yet on the very first frame
    const start = this.objects.find(o => o.cat === '0' && o.type === '0');
    const spawnX = start ? start.gx * this.gridSizeX : 0;
    const spawnY = start ? start.gy * this.gridSizeY : 0;

    let camX = spawnX - L.canvasW / 2;
    let camY = spawnY - L.canvasH / 2;

    const bounds = this._computeLevelBounds();
    if (bounds) {
      camX = this._clampCameraAxis(camX, bounds.minX, bounds.maxX, L.canvasW);
      camY = this._clampCameraAxis(camY, bounds.minY, bounds.maxY, L.canvasH);
    }

    this.camX = camX;
    this.camY = camY;
  }

  // Clamps a single camera axis so the visible [cam, cam+viewportSize]
  // window never extends past [minBound, maxBound]. If the level is
  // narrower/shorter than the viewport along this axis, centers on the
  // level's own midpoint instead — there's no valid clamp that keeps the
  // view entirely inside bounds smaller than the viewport itself, so
  // showing the level centered (with equal letterboxed margin both sides)
  // is the closest sensible behavior, rather than snapping to one edge.
  _clampCameraAxis(cam, minBound, maxBound, viewportSize) {
    const span = maxBound - minBound;
    if (span <= viewportSize) {
      return minBound - (viewportSize - span) / 2;
    }
    return Math.max(minBound, Math.min(cam, maxBound - viewportSize));
  }

  // World-space bounding box for a placed object (used for selection outline
  // and toolbar anchoring). Radius axis matches decodeLevelId's own choice
  // per category (see the constructor's note) — circles/power-ups use
  // gridSizeX, particles use gridSizeY.
  _objectBounds(obj) {
    const gx = this.gridSizeX, gy = this.gridSizeY;
    if (obj.gr !== undefined) {
      const rAxis = obj.cat === '7' ? gy : gx;
      const r = obj.gr * rAxis;
      return { x: obj.gx * gx - r, y: obj.gy * gy - r, w: r * 2, h: r * 2 };
    }
    const w = (obj.gw || 1) * gx, h = (obj.gh || 1) * gy;
    return { x: obj.gx * gx, y: obj.gy * gy, w, h };
  }

  // ── Popups ────────────────────────────────────────────────────────────────
  _drawPopup() {
    push();
    fill(0, 0, 0, 160);
    rect(0, 0, width, height);

    if (this.activePopup.type === 'gravity') this._drawGravityPopup();
    else if (this.activePopup.type === 'radiusAdjust') this._drawRadiusAdjustPopup();
    else if (this.activePopup.type === 'name') this._drawNamePopup();
    else if (this.activePopup.type === 'load') this._drawLoadPopup();
    else if (this.activePopup.type === 'movingPlatformConfig') this._drawMovingPlatformPopup();
    else if (this.activePopup.type === 'export') this._drawExportPopup();
    else if (this.activePopup.type === 'importResult') this._drawImportResultPopup();
    else if (this.activePopup.type === 'confirmExit') {
      this._drawConfirmPopup({
        title: 'Exit Without Saving?',
        message: 'You have unsaved changes. If you exit now, they will be lost.',
        confirmLabel: 'Exit Anyway',
        cancelLabel: 'Keep Editing',
      });
    } else if (this.activePopup.type === 'confirmLoad') {
      this._drawConfirmPopup({
        title: 'Load Without Saving?',
        message: 'You have unsaved changes. Loading another level will discard them.',
        confirmLabel: 'Load Anyway',
        cancelLabel: 'Cancel',
      });
    } else if (this.activePopup.type === 'confirmDeleteLevel') {
      this._drawConfirmPopup({
        title: 'Delete Level?',
        message: `"${this.activePopup.levelName || 'Untitled Level'}" will be permanently deleted. This can't be undone.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        confirmColor: color(254, 95, 85),
      });
    }

    pop();
  }

  _popupBox(wFrac, hFrac) {
    const w = Math.max(width * wFrac, 460);
    const h = Math.max(height * hFrac, 320);
    return { x: width / 2 - w / 2, y: height / 2 - h / 2, w, h };
  }

  _drawGravityPopup() {
    const box = this._popupBox(0.3, 0.26);
    const obj = this.activePopup.obj;
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.07);
    const label = obj.type === '1' ? 'Low Gravity Strength' : 'High Gravity Strength';
    text(label, box.x + box.w * 0.07, box.y + box.h * 0.10);

    // Slider level
    const levelX = box.x + box.w * 0.08;
    const levelY = box.y + box.h * 0.45;
    const levelW = box.w * 0.84;
    const minV = 0, maxV = 10;
    const val = obj.param != null ? obj.param : 5;
    const t = (val - minV) / (maxV - minV);

    stroke(18, 50, 44, 120);
    strokeWeight(4);
    line(levelX, levelY, levelX + levelW, levelY);
    noStroke();
    fill(86, 167, 134);
    const handleX = levelX + t * levelW;
    circle(handleX, levelY, box.w * 0.07);

    this.activePopup._sliderRect = { x: levelX, y: levelY, w: levelW, minV, maxV };

    fill(18, 50, 44);
    textAlign(CENTER, TOP);
    textSize(box.w * 0.06);
    text(val.toFixed(1), levelX + t * levelW, levelY + box.h * 0.08);

    fill(18, 50, 44, 160);
    textAlign(CENTER, TOP);
    textSize(box.w * 0.045);
    text('Drag the handle to adjust the \ngravity effect strength.', box.x + box.w * 0.5, box.y + box.h * 0.62);

    // Close / Done button
    const doneBtn = { x: box.x + box.w / 2 - box.w * 0.18, y: box.y + box.h * 0.80, w: box.w * 0.36, h: box.h * 0.14 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(70, 140, 110) : color(86, 167, 134));
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.45);
    text('Done', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  // Radius slider popup for circles, particles, and power-ups — mirrors
  // the gravity popup's layout exactly, just with a 0.5–10 grid-space
  // range (per the brief) instead of the 0–10 gravity-strength range.
  _drawRadiusAdjustPopup() {
    const box = this._popupBox(0.3, 0.26);
    const obj = this.activePopup.obj;
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.07);
    const catLabel = obj.cat === '2' ? 'Circle Radius' : obj.cat === '7' ? 'Particle Radius' : 'Power-Up Radius';
    text(catLabel, box.x + box.w * 0.07, box.y + box.h * 0.10);

    // Slider level
    const hasModeControls = obj.cat === '8';
    const isChargeChanger = obj.cat === '8' && (obj.type === '2' || obj.type === '3' || obj.type === '4' || obj.type === '5');
    const levelX = box.x + box.w * 0.08;
    const levelY = box.y + box.h * (hasModeControls ? 0.34 : 0.44);
    const levelW = box.w * 0.84;
    const minV = 0.5, maxV = 10;
    const val = obj.gr != null ? Math.max(minV, Math.min(maxV, obj.gr)) : minV;
    const t = (val - minV) / (maxV - minV);

    stroke(18, 50, 44, 120);
    strokeWeight(4);
    line(levelX, levelY, levelX + levelW, levelY);
    noStroke();
    fill(86, 167, 134);
    const handleX = levelX + t * levelW;
    circle(handleX, levelY, box.w * 0.07);

    this.activePopup._sliderRect = { x: levelX, y: levelY, w: levelW, minV, maxV };

    fill(18, 50, 44);
    textAlign(CENTER, TOP);
    textSize(box.w * 0.06);
    text(val.toFixed(1) + ' gs', levelX + t * levelW, levelY + box.h * 0.08);

    let modeControls = null;
    if (hasModeControls) {
      const modeY = box.y + box.h * 0.60;
      const modeH = box.h * 0.12;
      const modeGap = 10;
      const modeW = (box.w - modeGap * 3) / 2;
      const modeBtnHeight = modeH;
      const modeBtnY = modeY;
      const respawnBtn = { x: box.x + modeGap, y: modeBtnY, w: modeW, h: modeBtnHeight, mode: 0 };
      const singleUseBtn = { x: box.x + modeGap * 2 + modeW, y: modeBtnY, w: modeW, h: modeBtnHeight, mode: 1 };
      this.activePopup._modeBtns = { respawnBtn, singleUseBtn };
      modeControls = { respawnBtn, singleUseBtn };

      fill(18, 50, 44);
      textAlign(LEFT, TOP);
      textSize(box.w * 0.045);
      text('Pickup behavior', box.x + modeGap, modeY - box.h * 0.05);

      const drawModeBtn = (btn, label) => {
        const selected = obj.mode === btn.mode;
        const hovering = mouseX >= btn.x && mouseX <= btn.x + btn.w && mouseY >= btn.y && mouseY <= btn.y + btn.h;
        fill(selected ? color(86, 167, 134) : hovering ? color(220) : color(240));
        stroke(18, 50, 44, selected ? 220 : 120);
        strokeWeight(1.5);
        rect(btn.x, btn.y, btn.w, btn.h, 8);
        noStroke();
        fill(selected ? 255 : 30);
        textAlign(CENTER, CENTER);
        textSize(Math.min(14, btn.h * 0.45));
        text(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
      };

      const foreverLabel = isChargeChanger ? 'Forever' : 'Respawning';
      drawModeBtn(respawnBtn, foreverLabel);
      drawModeBtn(singleUseBtn, 'Single-use');
    }

    // Close / Done button
    const doneBtn = { x: box.x + box.w / 2 - box.w * 0.18, y: box.y + box.h * 0.80, w: box.w * 0.36, h: box.h * 0.14 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(70, 140, 110) : color(86, 167, 134));
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.45);
    text('Done', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  _drawMovingPlatformPopup() {
    const box = this._popupBox(0.32, 0.34);
    const obj = this.activePopup.obj;
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.065);
    text('Moving Platform Settings', box.x + box.w * 0.07, box.y + box.h * 0.07);

    // Speed slider
    const speedLabelY = box.y + box.h * 0.2;
    textSize(box.w * 0.045);
    text('Speed', box.x + box.w * 0.07, speedLabelY);
    const levelX = box.x + box.w * 0.08;
    const levelY = box.y + box.h * 0.32;
    const levelW = box.w * 0.84;
    const minV = 1, maxV = 12;
    const val = obj.speed != null ? obj.speed : 4;
    const t = (val - minV) / (maxV - minV);
    stroke(18, 50, 44, 120);
    strokeWeight(4);
    line(levelX, levelY, levelX + levelW, levelY);
    noStroke();
    fill(86, 167, 134);
    circle(levelX + t * levelW, levelY, box.w * 0.06);
    this.activePopup._speedSliderRect = { x: levelX, y: levelY, w: levelW, minV, maxV };
    fill(18, 50, 44);
    textAlign(CENTER, TOP);
    textSize(box.w * 0.05);
    text(val.toFixed(1), levelX + t * levelW, levelY + box.h * 0.05);

    // Pause frames slider
    const pauseLabelY = box.y + box.h * 0.48;
    textAlign(LEFT, TOP);
    text('Pause at each point (frames)', box.x + box.w * 0.07, pauseLabelY);
    const levelY2 = box.y + box.h * 0.60;
    const minV2 = 0, maxV2 = 120;
    const val2 = obj.pauseFrames || 0;
    const t2 = (val2 - minV2) / (maxV2 - minV2);
    stroke(18, 50, 44, 120);
    strokeWeight(4);
    line(levelX, levelY2, levelX + levelW, levelY2);
    noStroke();
    fill(86, 167, 134);
    circle(levelX + t2 * levelW, levelY2, box.w * 0.06);
    this.activePopup._pauseSliderRect = { x: levelX, y: levelY2, w: levelW, minV: minV2, maxV: maxV2 };
    fill(18, 50, 44);
    textAlign(CENTER, TOP);
    textSize(box.w * 0.05);
    text(Math.round(val2), levelX + t2 * levelW, levelY2 + box.h * 0.05);

    // Loop toggle
    const loopBtn = { x: box.x + box.w * 0.07, y: box.y + box.h * 0.74, w: box.w * 0.4, h: box.h * 0.12 };
    this.activePopup._loopBtn = loopBtn;
    const hoveringLoop = mouseX >= loopBtn.x && mouseX <= loopBtn.x + loopBtn.w && mouseY >= loopBtn.y && mouseY <= loopBtn.y + loopBtn.h;
    fill(obj.loop ? color(86, 167, 134) : hoveringLoop ? color(200, 205, 200) : color(255));
    stroke(18, 50, 44, 100);
    strokeWeight(1.5);
    rect(loopBtn.x, loopBtn.y, loopBtn.w, loopBtn.h, 6);
    noStroke();
    fill(obj.loop ? 255 : 18, obj.loop ? 255 : 50, obj.loop ? 255 : 44);
    textAlign(CENTER, CENTER);
    textSize(loopBtn.h * 0.4);
    text(obj.loop ? 'Looping: ON' : 'Looping: OFF', loopBtn.x + loopBtn.w / 2, loopBtn.y + loopBtn.h / 2);

    // Add waypoint button
    const addBtn = { x: box.x + box.w * 0.52, y: box.y + box.h * 0.74, w: box.w * 0.41, h: box.h * 0.12 };
    this.activePopup._addWaypointBtn = addBtn;
    const hoveringAdd = mouseX >= addBtn.x && mouseX <= addBtn.x + addBtn.w && mouseY >= addBtn.y && mouseY <= addBtn.y + addBtn.h;
    fill(hoveringAdd ? color(0, 130, 220) : color(0, 156, 253));
    rect(addBtn.x, addBtn.y, addBtn.w, addBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(addBtn.h * 0.38);
    text('+ Add Waypoint', addBtn.x + addBtn.w / 2, addBtn.y + addBtn.h / 2);

    // Done button
    const doneBtn = { x: box.x + box.w / 2 - box.w * 0.18, y: box.y + box.h * 0.90, w: box.w * 0.36, h: box.h * 0.09 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(70, 140, 110) : color(86, 167, 134));
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.5);
    text('Done', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  _drawNamePopup() {
    const box = this._popupBox(0.34, 0.7);
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.07);
    text('Level Name', box.x + box.w * 0.07, box.y + box.h * 0.06);

    const fieldY = box.y + box.h * 0.18;
    const fieldH = box.h * 0.12;
    fill(255);
    stroke(18, 50, 44, 80);
    strokeWeight(1.5);
    rect(box.x + box.w * 0.07, fieldY, box.w * 0.86, fieldH, 6);
    noStroke();
    fill(18, 50, 44);
    textAlign(LEFT, CENTER);
    textSize(box.w * 0.055);
    const blink = Math.floor(frameCount / 30) % 2 === 0 ? '|' : '';
    text((this.activePopup.nameDraft || '') + blink, box.x + box.w * 0.10, fieldY + fieldH / 2);

    fill(18, 50, 44, 200);
    textAlign(LEFT, TOP);
    textSize(box.w * 0.05);
    text('Background', box.x + box.w * 0.07, box.y + box.h * 0.32);

    const bgOptions = ['none', 'snow', 'forest', 'ice', 'volcano', 'space'];
    const bgCols = 3;
    const bgPad = box.w * 0.03;
    const bgW = (box.w * 0.86 - bgPad * (bgCols - 1)) / bgCols;
    const bgH = box.h * 0.1;
    this.activePopup._bgRects = [];
    for (let i = 0; i < bgOptions.length; i++) {
      const col = i % bgCols, row = Math.floor(i / bgCols);
      const bx = box.x + box.w * 0.07 + col * (bgW + bgPad);
      const by = box.y + box.h * 0.4 + row * (bgH + bgPad);
      const isSel = this.activePopup.backgroundDraft === bgOptions[i];
      const hovering = mouseX >= bx && mouseX <= bx + bgW && mouseY >= by && mouseY <= by + bgH;
      this.activePopup._bgRects.push({ x: bx, y: by, w: bgW, h: bgH, value: bgOptions[i] });
      fill(isSel ? color(86, 167, 134) : hovering ? color(200, 210, 202) : color(255));
      stroke(18, 50, 44, 100);
      strokeWeight(1.2);
      rect(bx, by, bgW, bgH, 5);
      noStroke();
      fill(isSel ? 255 : 18, isSel ? 255 : 50, isSel ? 255 : 44);
      textAlign(CENTER, CENTER);
      textSize(bgH * 0.34);
      text(bgOptions[i][0].toUpperCase() + bgOptions[i].slice(1), bx + bgW / 2, by + bgH / 2);
    }

    fill(18, 50, 44, 200);
    textAlign(LEFT, TOP);
    textSize(box.w * 0.05);
    text('Gimmick', box.x + box.w * 0.07, box.y + box.h * 0.65);

    const gimmickOptions = [
      { value: 'InfiniteClicks', label: 'Infinite Clicks' },
      { value: 'ChargeSwitch', label: 'Charge Switch' },
    ];
    const gimmickW = (box.w * 0.86 - bgPad) / 2;
    const gimmickH = box.h * 0.1;
    this.activePopup._gimmickRects = [];
    const gimmickTokens = (this.activePopup.gimmickDraft || 'NIL').split(' ').filter(Boolean).filter(t => t !== 'NIL');
    for (let i = 0; i < gimmickOptions.length; i++) {
      const gx = box.x + box.w * 0.07 + i * (gimmickW + bgPad);
      const gy = box.y + box.h * 0.74;
      const isSel = gimmickTokens.includes(gimmickOptions[i].value);
      const hovering = mouseX >= gx && mouseX <= gx + gimmickW && mouseY >= gy && mouseY <= gy + gimmickH;
      this.activePopup._gimmickRects.push({ x: gx, y: gy, w: gimmickW, h: gimmickH, value: gimmickOptions[i].value });
      fill(isSel ? color(86, 167, 134) : hovering ? color(200, 210, 202) : color(255));
      stroke(18, 50, 44, 100);
      strokeWeight(1.2);
      rect(gx, gy, gimmickW, gimmickH, 5);
      noStroke();
      fill(isSel ? 255 : 18, isSel ? 255 : 50, isSel ? 255 : 44);
      textAlign(CENTER, CENTER);
      textSize(gimmickH * 0.32);
      text(gimmickOptions[i].label, gx + gimmickW / 2, gy + gimmickH / 2);
    }

    const doneBtn = { x: box.x + box.w / 2 - box.w * 0.18, y: box.y + box.h * 0.86, w: box.w * 0.36, h: box.h * 0.1 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(70, 140, 110) : color(86, 167, 134));
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.5);
    text('Done', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  _drawExportPopup() {
    const box = this._popupBox(0.56, 0.46);
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.04);
    text('Export Level Code', box.x + box.w * 0.06, box.y + box.h * 0.03);

    fill(18, 50, 44, 170);
    textSize(box.w * 0.026);
    text('Copy this code to share the level',
         box.x + box.w * 0.06, box.y + box.h * 0.135);

    // The code itself is rendered directly on canvas, word-wrapped into the
    // field box below — there's no real text-selection here (a canvas has
    // none), which is exactly why the Copy button uses the Clipboard API
    // directly rather than relying on the player selecting text manually.
    const fieldRect = { x: box.x + box.w * 0.06, y: box.y + box.h * 0.21, w: box.w * 0.88, h: box.h * 0.46 };
    fill(255);
    stroke(18, 50, 44, 80);
    strokeWeight(1.5);
    rect(fieldRect.x, fieldRect.y, fieldRect.w, fieldRect.h, 6);
    noStroke();

    fill(40, 44, 46);
    textAlign(LEFT, TOP);
    textFont('monospace');
    const codeFontSize = Math.max(9, Math.min(13, box.w * 0.022));
    textSize(codeFontSize);
    this._drawWrappedMonospace(this.activePopup.code, fieldRect.x + 8, fieldRect.y + 8, fieldRect.w - 16, fieldRect.h - 16, codeFontSize);
    textFont(gameFont);

    fill(18, 50, 44, 150);
    textAlign(LEFT, TOP);
    textSize(box.w * 0.022);
    text(`${this.activePopup.code.length.toLocaleString()} characters`, box.x + box.w * 0.06, fieldRect.y + fieldRect.h + box.h * 0.02);

    // Copy button — navigator.clipboard.writeText() works directly from
    // this click handler without needing any focused/visible input element
    // at all, which is why this doesn't need a real DOM text field.
    const copyBtn = { x: box.x + box.w * 0.06, y: box.y + box.h * 0.84, w: box.w * 0.4, h: box.h * 0.105 };
    this.activePopup._copyBtn = copyBtn;
    const hoveringCopy = mouseX >= copyBtn.x && mouseX <= copyBtn.x + copyBtn.w && mouseY >= copyBtn.y && mouseY <= copyBtn.y + copyBtn.h;
    fill(hoveringCopy ? color(70, 140, 110) : color(86, 167, 134));
    rect(copyBtn.x, copyBtn.y, copyBtn.w, copyBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(copyBtn.h * 0.4);
    text(this.activePopup.copiedFlash ? 'Copied!' : 'Copy to Clipboard', copyBtn.x + copyBtn.w / 2, copyBtn.y + copyBtn.h / 2);

    const doneBtn = { x: box.x + box.w * 0.54, y: box.y + box.h * 0.84, w: box.w * 0.4, h: box.h * 0.105 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(230, 230, 230) : color(245, 245, 245));
    stroke(18, 50, 44, 100);
    strokeWeight(1.2);
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    noStroke();
    fill(18, 50, 44);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.4);
    text('Done', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  // Word-wraps a long monospace string into a fixed-width box, breaking on
  // whatever fits per line (level codes have no real "words" — they're
  // space-separated tokens, but tokens can themselves be longer than one
  // line, so this wraps by character count rather than by token boundary).
  _drawWrappedMonospace(str, x, y, maxW, maxH, fontSize) {
    const charW = fontSize * 0.6; // monospace approximation, close enough for wrapping
    const charsPerLine = Math.max(8, Math.floor(maxW / charW));
    const lineH = fontSize * 1.3;
    const maxLines = Math.max(1, Math.floor(maxH / lineH));
    let line = 0;
    for (let i = 0; i < str.length && line < maxLines; i += charsPerLine) {
      const isLast = line === maxLines - 1 && i + charsPerLine < str.length;
      const chunk = str.slice(i, i + charsPerLine);
      text(isLast ? chunk.slice(0, -1) + '…' : chunk, x, y + line * lineH);
      line++;
    }
  }

  // Shared two-button confirm/cancel popup, used for the "this will lose
  // unsaved work" / "this is permanent" guards (Exit, Load, Delete Level).
  // opts: { title, message, confirmLabel, cancelLabel, confirmColor }
  _drawConfirmPopup(opts) {
    push();
    strokeWeight(0);
    const box = this._popupBox(0.36, 0.26);
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(CENTER, TOP);
    textFont(gameFont);
    textSize(box.w * 0.06);
    text(opts.title, box.x + box.w / 2, box.y + box.h * 0.1);

    fill(18, 50, 44, 200);
    textAlign(CENTER, CENTER);
    textSize(box.w * 0.042);
    const msgBoxW = box.w * 0.86, msgBoxH = box.h * 0.36;
    text(opts.message, box.x + box.w / 2 - msgBoxW / 2, box.y + box.h * 0.32, msgBoxW, msgBoxH);

    const btnW = box.w * 0.4, btnH = box.h * 0.16, btnGap = box.w * 0.04;
    const cancelBtn = { x: box.x + box.w / 2 - btnW - btnGap / 2, y: box.y + box.h * 0.78, w: btnW, h: btnH };
    const confirmBtn = { x: box.x + box.w / 2 + btnGap / 2, y: box.y + box.h * 0.78, w: btnW, h: btnH };
    this.activePopup._cancelBtn = cancelBtn;
    this.activePopup._confirmBtn = confirmBtn;

    const hoveringCancel = this._inRect(cancelBtn);
    fill(hoveringCancel ? color(160, 175, 165) : color(190, 200, 193));
    rect(cancelBtn.x, cancelBtn.y, cancelBtn.w, cancelBtn.h, 6);
    fill(18, 50, 44);
    textAlign(CENTER, CENTER);
    textSize(cancelBtn.h * 0.4);
    text(opts.cancelLabel, cancelBtn.x + cancelBtn.w / 2, cancelBtn.y + cancelBtn.h / 2);

    const baseConfirmColor = opts.confirmColor || color(86, 167, 134);
    const hoveringConfirm = this._inRect(confirmBtn);
    fill(hoveringConfirm ? color(red(baseConfirmColor) * 0.82, green(baseConfirmColor) * 0.82, blue(baseConfirmColor) * 0.82) : baseConfirmColor);
    rect(confirmBtn.x, confirmBtn.y, confirmBtn.w, confirmBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(confirmBtn.h * 0.4);
    text(opts.confirmLabel, confirmBtn.x + confirmBtn.w / 2, confirmBtn.y + confirmBtn.h / 2);
    pop();
  }

  // Small confirmation/error popup shown after an Import attempt — Import
  // itself is a synchronous window.prompt() call (see openImportPopup()),
  // so this is the only part of that flow that's an actual canvas popup.
  _drawImportResultPopup() {
    const box = this._popupBox(0.4, 0.2);
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(this.activePopup.success ? color(18, 50, 44) : color(180, 50, 40));
    textAlign(CENTER, CENTER);
    textFont(gameFont);
    textSize(box.w * 0.055);
    // text()'s box-mode (width+height) wrapping has a documented p5.js
    // layout bug when only width is supplied without height — always
    // pass both, even though height here is just "however tall the
    // message area is", to stay on the well-defined code path.
    const msgBoxW = box.w * 0.86, msgBoxH = box.h * 0.4;
    text(this.activePopup.message, box.x + box.w / 2 - msgBoxW / 2, box.y + box.h * 0.22, msgBoxW, msgBoxH);

    const doneBtn = { x: box.x + box.w / 2 - box.w * 0.18, y: box.y + box.h * 0.74, w: box.w * 0.36, h: box.h * 0.16 };
    this.activePopup._doneBtn = doneBtn;
    const hoveringDone = mouseX >= doneBtn.x && mouseX <= doneBtn.x + doneBtn.w && mouseY >= doneBtn.y && mouseY <= doneBtn.y + doneBtn.h;
    fill(hoveringDone ? color(70, 140, 110) : color(86, 167, 134));
    rect(doneBtn.x, doneBtn.y, doneBtn.w, doneBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(doneBtn.h * 0.45);
    text('OK', doneBtn.x + doneBtn.w / 2, doneBtn.y + doneBtn.h / 2);
  }

  _drawLoadPopup() {
    push()
    strokeWeight(0)
    const box = this._popupBox(0.46, 0.66);
    fill(223, 232, 224);
    rect(box.x, box.y, box.w, box.h, 10);

    fill(18, 50, 44);
    textAlign(LEFT, TOP);
    textFont(gameFont);
    textSize(box.w * 0.05);
    text('Load Custom Level', box.x + box.w * 0.05, box.y + box.h * 0.05);

    const list = this._loadCustomLevels();
    this.activePopup._rowRects = [];
    const rowH = box.h * 0.11;
    const rowY0 = box.y + box.h * 0.16;
    const rowPad = box.h * 0.015;
    const rowsPerPage = 5;
    const totalPages = Math.max(1, Math.ceil(list.length / rowsPerPage));
    const page = Math.max(0, Math.min(this.activePopup.page || 0, totalPages - 1));
    const pageStart = page * rowsPerPage;
    const pageItems = list.slice(pageStart, pageStart + rowsPerPage);

    if (list.length === 0) {
      fill(18, 50, 44, 160);
      textAlign(CENTER, CENTER);
      textSize(box.w * 0.04);
      text('No custom levels saved yet.', box.x + box.w / 2, box.y + box.h * 0.4);
    }

    for (let i = 0; i < pageItems.length; i++) {
      const ry = rowY0 + i * (rowH + rowPad);
      const lvl = pageItems[i];
      const rowRect = { x: box.x + box.w * 0.05, y: ry, w: box.w * 0.9, h: rowH, id: lvl.id, name: lvl.name };
      const hovering = mouseX >= rowRect.x && mouseX <= rowRect.x + rowRect.w && mouseY >= rowRect.y && mouseY <= rowRect.y + rowRect.h;

      fill(hovering ? color(200, 210, 202) : color(255));
      rect(rowRect.x, rowRect.y, rowRect.w, rowRect.h, 5);

      fill(18, 50, 44);
      textAlign(LEFT, CENTER);
      textSize(rowH * 0.32);
      text(lvl.name || 'Untitled Level', rowRect.x + rowRect.w * 0.03, ry + rowH / 2);

      // Delete (x) button on the row's right edge
      const delSize = rowH * 0.6;
      const delRect = { x: rowRect.x + rowRect.w - delSize - 8, y: ry + (rowH - delSize) / 2, w: delSize, h: delSize, id: lvl.id };
      const hoveringDel = mouseX >= delRect.x && mouseX <= delRect.x + delRect.w && mouseY >= delRect.y && mouseY <= delRect.y + delRect.h;
      fill(hoveringDel ? color(254, 95, 85) : color(254, 95, 85, 160));
      rect(delRect.x, delRect.y, delRect.w, delRect.h, 4);
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(delSize * 0.6);
      text('✕', delRect.x + delRect.w / 2, delRect.y + delRect.h / 2 - 1);

      rowRect._delRect = delRect;
      this.activePopup._rowRects.push(rowRect);
    }

    if (totalPages > 1) {
      const navH = box.h * 0.060;
      const navY = box.y + box.h * 0.82;
      const btnW = box.w * 0.12;
      const prevRect = { x: box.x + box.w * 0.07, y: navY, w: btnW, h: navH };
      const nextRect = { x: box.x + box.w - box.w * 0.07 - btnW, y: navY, w: btnW, h: navH };
      this.activePopup._pageNav = { prevRect, nextRect, totalPages };
      const canPrev = page > 0;
      const canNext = page < totalPages - 1;
      const hoverPrev = canPrev && mouseX >= prevRect.x && mouseX <= prevRect.x + prevRect.w && mouseY >= prevRect.y && mouseY <= prevRect.y + prevRect.h;
      const hoverNext = canNext && mouseX >= nextRect.x && mouseX <= nextRect.x + nextRect.w && mouseY >= nextRect.y && mouseY <= nextRect.y + nextRect.h;
      const btnCol = hoverPrev || hoverNext ? color(86, 167, 134) : color(70, 140, 110);
      const disabledCol = color(120);
      const textCol = color(255);

      fill(canPrev ? (hoverPrev ? color(120, 190, 150) : color(86, 167, 134)) : disabledCol);
      rect(prevRect.x, prevRect.y, prevRect.w, prevRect.h, navH * 0.3);
      fill(canPrev ? textCol : color(160));
      textAlign(CENTER, CENTER);
      textSize(navH * 0.45);
      text('◀ Prev', prevRect.x + prevRect.w / 2, prevRect.y + prevRect.h / 2);

      fill(canNext ? (hoverNext ? color(120, 190, 150) : color(86, 167, 134)) : disabledCol);
      rect(nextRect.x, nextRect.y, nextRect.w, nextRect.h, navH * 0.3);
      fill(canNext ? textCol : color(160));
      text('Next ▶', nextRect.x + nextRect.w / 2, nextRect.y + nextRect.h / 2);

      fill(18, 50, 44);
      textSize(navH * 0.4);
      textAlign(CENTER, CENTER);
      text(`${page + 1} / ${totalPages}`, box.x + box.w / 2, navY + navH / 2);
    } else {
      this.activePopup._pageNav = null;
    }

    const closeBtn = { x: box.x + box.w / 2 - box.w * 0.15, y: box.y + box.h * 0.93, w: box.w * 0.3, h: box.h * 0.06 };
    this.activePopup._closeBtn = closeBtn;
    const hoveringClose = mouseX >= closeBtn.x && mouseX <= closeBtn.x + closeBtn.w && mouseY >= closeBtn.y && mouseY <= closeBtn.y + closeBtn.h;
    fill(hoveringClose ? color(70, 140, 110) : color(86, 167, 134));
    rect(closeBtn.x, closeBtn.y, closeBtn.w, closeBtn.h, 6);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(closeBtn.h * 0.5);
    text('Cancel', closeBtn.x + closeBtn.w / 2, closeBtn.y + closeBtn.h / 2);
    pop()
  }

  // ── Input handling ────────────────────────────────────────────────────────
  // Called once per mouse-press edge from sketch-1.js (guarded the same way
  // the rest of this project guards clicks, via wasMousePressedLastFrame).
  handleClick() {
    if (this.activePopup) {
      this._handlePopupClick();
      return;
    }

    // "Finish Path" button on the waypoint-placement banner — checked before
    // anything else so it always wins over a click that happens to land in
    // the same screen area as a waypoint placement would.
    if (this.placingWaypointsFor && this._waypointDoneBtn && this._inRect(this._waypointDoneBtn)) {
      this.placingWaypointsFor = null;
      return;
    }

    // "Center View" button — always reachable regardless of what else is
    // armed/selected, since its whole purpose is recovering from a bad pan.
    if (this._centerViewBtn && this._inRect(this._centerViewBtn)) {
      this.centerViewOnLevel();
      return;
    }

    const L = this.layout;

    // Top bar buttons
    if (this._inRect(L.exitBtn)) {
      if (this.hasUnsavedChanges()) {
        this.activePopup = { type: 'confirmExit' };
      } else {
        this._requestExit = true;
      }
      return;
    }
    if (this._inRect(L.importBtn)) { this.openImportPopup(); return; }
    if (this._inRect(L.loadBtn)) { this.openLoadPopup(); return; }
    if (this._inRect(L.testBtn)) { this._requestTest = true; return; }
    if (this._inRect(L.exportBtn)) { this.openExportPopup(); return; }
    if (this._inRect(L.saveBtn)) { this.save(); this._flashSaved = millis(); return; }
    if (this._inRect(L.nameField)) { this.openNamePopup(); return; }

    // Palette tabs
    if (mouseY < L.paletteGridY && mouseX < L.paletteW) {
      for (let i = 0; i < L.tabRects.length; i++) {
        if (this._inRect(L.tabRects[i])) {
          this.activeTab = i;
          this.selectedPaletteItem = null;
          this.pendingCorner = null;
          this.paletteScrollRow = 0;
          return;
        }
      }
      return;
    }

    // Palette scroll buttons (only present when the active tab's items
    // don't all fit on screen at once — see _drawPaletteScrollButtons)
    if (this._paletteScrollBtns) {
      if (this._inRect(this._paletteScrollBtns.upBtn)) {
        this.paletteScrollRow = Math.max(0, this.paletteScrollRow - 1);
        return;
      }
      if (this._inRect(this._paletteScrollBtns.downBtn)) {
        this.paletteScrollRow = Math.min(this._paletteScrollBtns.maxScroll, this.paletteScrollRow + 1);
        return;
      }
    }

    // Palette items
    if (mouseX < L.paletteW && mouseY >= L.paletteGridY) {
      if (this.hoveredPaletteItem !== -1) {
        const item = this.tabs[this.activeTab].items[this.hoveredPaletteItem];
        this.selectedPaletteItem = (this.selectedPaletteItem === item) ? null : item;
        this.selectedObject = null;
        this.pendingCorner = null;
      }
      return;
    }

    // Canvas area
    if (this._mouseInCanvas()) {
      this._handleCanvasClick();
    }
  }

  _inRect(r) {
    return mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h;
  }

  _handleCanvasClick() {
    const world = this.screenToWorld(mouseX, mouseY);
    const snapped = this.worldToGrid(world.x, world.y);
    // Circular ("Ball") objects place on a finer half-grid (width/80,
    // height/80) than the standard whole-grid-cell snap every other block
    // uses — see worldToGridFine()'s note. Only swap in the fine snap when
    // a cat '2' item is actually what's about to be placed, so waypoint
    // placement, toolbar clicks, and every other block type keep their
    // normal whole-grid snap untouched.
    const placingCircle = this.selectedPaletteItem && this.selectedPaletteItem.cat === '2';
    const placementSnapped = placingCircle ? this.worldToGridFine(world.x, world.y) : snapped;

    // If currently placing waypoints for a moving platform, each click adds
    // a waypoint; right-click/escape elsewhere finishes (handled in keyPressed).
    if (this.placingWaypointsFor) {
      if (!this.placingWaypointsFor.waypoints) this.placingWaypointsFor.waypoints = [];
      this.placingWaypointsFor.waypoints.push({ gx: snapped.gx, gy: snapped.gy });
      return;
    }

    // If an object toolbar button was clicked, handle it first.
    if (this.selectedObject) {
      const t = this._toolbarRectFor(this.selectedObject);
      let cx = t.x;
      if (t.showRotate) {
        if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
          this._rotateObject(this.selectedObject);
          return;
        }
        cx += t.btnSize + 6;
      }
      if (t.showAdjust) {
        if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
          this.activePopup = { type: 'gravity', obj: this.selectedObject };
          return;
        }
        cx += t.btnSize + 6;
      }
      if (t.showConfig) {
        if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
          this.activePopup = { type: 'movingPlatformConfig', obj: this.selectedObject };
          return;
        }
        cx += t.btnSize + 6;
      }
      if (t.showRadiusAdjust) {
        if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
          this.activePopup = { type: 'radiusAdjust', obj: this.selectedObject };
          return;
        }
        cx += t.btnSize + 6;
      }
      if (t.showHalfBlockToggle) {
        if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
          this._toggleHalfBlockSide(this.selectedObject);
          return;
        }
        cx += t.btnSize + 6;
      }
      if (mouseX >= cx && mouseX <= cx + t.btnSize && mouseY >= t.y && mouseY <= t.y + t.btnSize) {
        this._deleteObject(this.selectedObject);
        return;
      }
    }

    // Placing a new object from the palette. Every block except the Start
    // marker (singleClick: true) is placed by clicking one corner, then
    // clicking the opposite corner — the block spans the box between them.
    if (this.selectedPaletteItem) {
      const item = this.selectedPaletteItem;
      if (item.singleClick) {
        this._placeNewObject(item, placementSnapped, placementSnapped);
        return;
      }
      if (!this.pendingCorner) {
        // First click — remember this corner, wait for the second.
        this.pendingCorner = { item, gx: placementSnapped.gx, gy: placementSnapped.gy };
        return;
      }
      // Second click — build the object spanning both corners, then reset.
      this._placeNewObject(item, this.pendingCorner, placementSnapped);
      this.pendingCorner = null;
      return;
    }

    // Otherwise, try to select an existing object at this point.
    const hit = this._objectAtWorldPoint(world.x, world.y);
    if (hit) {
      this.selectedObject = hit;
      this.draggingSelected = true;
      // Offset is measured from the object's own anchor point (gx,gy in
      // world space), NOT from _objectBounds()'s top-left corner. For a
      // plain rect (cat 1 with no halfBlockSide) those are the same point,
      // which is why this bug never showed up there — but for anything
      // whose anchor isn't its bounding-box corner, they aren't:
      //   - Circles/particles/power-ups (obj.gr !== undefined) anchor at
      //     their CENTER, while the bounding box's corner sits a full
      //     radius up-and-left of that.
      //   - 'far'-side half-blocks anchor at a half-integer grid coordinate
      //     (e.g. gx=5.5), which Math.round() in worldToGrid() can't
      //     round-trip — it always rounds .5 up to the next whole cell.
      // Computing the offset from bounds.x/y and later reconstructing the
      // anchor via worldToGrid(world - offset) silently assumed those two
      // points were identical, so simply clicking (with zero actual mouse
      // movement) re-derived a different, wrong anchor and the object
      // visibly jumped on the very first drag frame. Anchoring the offset
      // to (gx*gridX, gy*gridY) directly sidesteps both cases: dragging
      // with no movement now reconstructs the exact original position.
      this.dragOffset = { x: world.x - hit.gx * this.gridSizeX, y: world.y - hit.gy * this.gridSizeY };

      // Double-click-ish: clicking a moving platform that's selected again
      // opens its config popup (speed/loop/pause/waypoints) rather than
      // immediately dragging, since these need precise multi-field setup.
      if (hit.cat === '6' && this._lastSelectedId === hit._id && millis() - (this._lastSelectClickTime || 0) < 400) {
        this.activePopup = { type: 'movingPlatformConfig', obj: hit };
        this.draggingSelected = false;
      }
      this._lastSelectedId = hit._id;
      this._lastSelectClickTime = millis();
    } else {
      this.selectedObject = null;
      this._lastSelectedId = null;
      // Empty space, nothing armed — left-click-drag pans the canvas too,
      // not just right-click. This is what makes panning reachable on
      // touch devices, which have no right-click gesture at all.
      this.startPan();
    }
  }

  // Builds a placed object spanning two grid-snapped corners. cornerA/B are
  // {gx, gy} pairs — order doesn't matter, the box is normalized here. For
  // radius-based categories (circles, particles, power-ups) the box's size
  // is converted into a radius instead of a width/height, clamped to the
  // same 0.5–10 grid-space range as the radius-adjust popup's slider.
  _placeNewObject(item, cornerA, cornerB) {
    const minGx = Math.min(cornerA.gx, cornerB.gx);
    const minGy = Math.min(cornerA.gy, cornerB.gy);
    const maxGx = Math.max(cornerA.gx, cornerB.gx);
    const maxGy = Math.max(cornerA.gy, cornerB.gy);
    // A click-click with no drag (both corners identical) would otherwise
    // produce a zero-size block — enforce a 1x1 grid-cell minimum instead,
    // so a quick double-click still places something visible rather than
    // nothing at all.
    const spanGx = Math.max(1, maxGx - minGx);
    const spanGy = Math.max(1, maxGy - minGy);

    const obj = { _id: this._nextObjId++, cat: item.cat, type: item.type, gx: minGx, gy: minGy };

    if (item.r !== undefined) {
      // Radius-based placement: derive a radius from the drawn box (average
      // of half-width/half-height so dragging diagonally feels proportional
      // either way), clamped to the 0.5–10 grid-space range. A same-point
      // click-click falls back to the item's default radius instead of the
      // degenerate 0.5 minimum, so a quick single click still places a
      // sensibly-sized pickup rather than a near-invisible speck.
      if (cornerA.gx === cornerB.gx && cornerA.gy === cornerB.gy) {
        obj.gr = item.r;
        obj.gx = cornerA.gx;
        obj.gy = cornerA.gy;
      } else {
        const derivedR = ((spanGx / 2) + (spanGy / 2)) / 2;
        obj.gr = Math.max(0.5, Math.min(10, derivedR));
        obj.gx = minGx + spanGx / 2;
        obj.gy = minGy + spanGy / 2;
        // Circles (cat '2') only ever place on width/80,height/80 (half-
        // grid) increments — but averaging two half-grid-snapped corners
        // here can land on a quarter-grid value (e.g. corners 2.5 and 5
        // average to 3.75), so re-snap the derived center back onto that
        // same half-grid for this category specifically. Other radius
        // categories (particles, power-ups) still place on the standard
        // whole grid, where this re-snap is a no-op.
        if (item.cat === '2') {
          obj.gx = Math.round(obj.gx * 2) / 2;
          obj.gy = Math.round(obj.gy * 2) / 2;
        }
      }
    } else if (item.halfBlock) {
      // Half-block: the drag determines orientation (horizontal if wider
      // than tall, vertical if taller than wide) and the span along that
      // long axis, but the *thin* axis is always exactly 0.5 grid spaces,
      // snapped to one specific half of a single grid cell rather than
      // derived from however far the player happened to drag vertically/
      // horizontally. That derivation is what caused the original bug:
      // clicking two corners on the same row still hit the 1-cell drag
      // minimum, centering the block at a fractional offset (e.g. y=10.25
      // instead of the clicked y=10) that didn't match either grid half.
      // halfBlockSide ('near' | 'far') controls which half it occupies —
      // exposed as an explicit toggle on the toolbar (⇕ for horizontal
      // blocks, ⇔ for vertical) rather than being implied by the drag.
      const horizontal = spanGx >= spanGy;
      obj.isHorizontalHalfBlock = horizontal;
      obj.halfBlockSide = 'near'; // near = top (horizontal) or left (vertical)
      if (horizontal) {
        obj.gw = spanGx;
        obj.gh = 0.5;
        obj.gy = minGy; // near = top half of the row clicked
      } else {
        obj.gw = 0.5;
        obj.gh = spanGy;
        obj.gx = minGx; // near = left half of the column clicked
      }
    } else {
      obj.gw = spanGx;
      obj.gh = spanGy;
    }

    if (item.rotatable) obj.rotation = item.startRotation || 0;
    if (item.isTriangle) obj.isTriangle = true;
    if (item.rotatableFree) obj.fanAngle = 0;
    if (item.adjustable === 'gravity') obj.param = (item.extra && item.extra.gravParam) || 5;
    if (item.cat === '4' && item.type === '0') obj.param = (item.extra && item.extra.drag) || 10;
    if (item.cat === '5') obj.strength = (item.extra && item.extra.strength) || 3;
    if (item.cat === '8') {
      obj.mode = (item.extra && item.extra.mode) || 0;
    }

    if (item.cat === '0' && item.type === '0') {
      // Start marker is unique — replace any existing one instead of stacking.
      this.objects = this.objects.filter(o => !(o.cat === '0' && o.type === '0'));
    }

    if (item.multiStep === 'movingPlatform') {
      obj.speed = (item.extra && item.extra.speed) || 4;
      obj.loop = (item.extra && item.extra.loop) || 0;
      obj.pauseFrames = (item.extra && item.extra.pauseFrames) || 0;
      obj.waypoints = [];
      this.objects.push(obj);
      // Immediately enter waypoint-placement mode so the next clicks lay
      // down the path, mirroring PolyLevel's click-to-place path tools.
      this.placingWaypointsFor = obj;
      this.selectedObject = obj;
      this.selectedPaletteItem = null;
      return;
    }

    this.objects.push(obj);
    // Keep the tool armed so multiple copies can be placed in a row,
    // matching the brief's "choose the type then place" flow.
  }

  _rotateObject(obj) {
    if (obj.cat === '1' && obj.isTriangle) {
      // 5 distinct visual states: 0 = plain rectangle, 90/180/270/360 = the
      // four triangle wedge orientations Platform.js itself recognises
      // (see calculateTriangleVertices) — note 360 is its own distinct
      // wedge here, not "back to rectangle", so the cycle has 5 steps.
      // Plain (non-triangle) rectangles never reach this branch — rotation
      // is restricted to triangles, fans, and bounce pads only.
      obj.rotation = ((obj.rotation || 0) + 90) % 450;
    } else if (obj.cat === '3') {
      // Free 45-degree-stepped rotation for fans (8 directions), matching
      // the original 8-direction encoding decodeLevelId expects.
      obj.fanAngle = ((obj.fanAngle || 0) + Math.PI / 4) % (Math.PI * 2);
    } else if (obj.cat === '5') {
      // Bounce pads now rotate in true 90-degree steps (0/90/180/270),
      // and this rotation is wired all the way through toDataString /
      // loadFromDataString / decodeLevelId into BouncePad itself, so it
      // actually changes which way the pad launches the ball, not just
      // how it's drawn in the editor.
      obj.rotation = ((obj.rotation || 0) + 90) % 360;
    }
  }

  // Flips a half-block between the near half (top for horizontal, left for
  // vertical) and the far half (bottom/right) of its single thin-axis grid
  // cell. The thin-axis anchor (gy for horizontal, gx for vertical) shifts
  // by exactly 0.5 grid spaces — half of one full cell — so the block's
  // far edge always lands exactly on the next grid line either way.
  _toggleHalfBlockSide(obj) {
    if (obj.cat !== '1' || obj.halfBlockSide === undefined) return;
    if (obj.halfBlockSide === 'near') {
      obj.halfBlockSide = 'far';
      if (obj.isHorizontalHalfBlock) obj.gy += 0.5;
      else obj.gx += 0.5;
    } else {
      obj.halfBlockSide = 'near';
      if (obj.isHorizontalHalfBlock) obj.gy -= 0.5;
      else obj.gx -= 0.5;
    }
  }

  _deleteObject(obj) {
    this.objects = this.objects.filter(o => o._id !== obj._id);
    if (this.selectedObject === obj) this.selectedObject = null;
  }

  // Finds the top-most placed object whose bounds contain a world point.
  _objectAtWorldPoint(wx, wy) {
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];
      const b = this._objectBounds(obj);
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
        return obj;
      }
    }
    return null;
  }

  // Drag handling — called every frame mouseIsPressed is true, from sketch-1.js.
  handleDrag() {
    if (this.activePopup) {
      this._handlePopupDrag();
      return;
    }
    if (this.draggingSelected && this.selectedObject && this._mouseInCanvas()) {
      const world = this.screenToWorld(mouseX, mouseY);
      // Raw (unsnapped) world position of the object's anchor point, given
      // where the mouse is now and the anchor-relative offset captured back
      // in handleClick(). dragOffset is anchor-relative (not bounds-corner-
      // relative), so with zero mouse movement this reconstructs the exact
      // original anchor position — see the note in _handleCanvasClick's
      // selection branch for why that distinction matters.
      const rawX = world.x - this.dragOffset.x;
      const rawY = world.y - this.dragOffset.y;
      const obj = this.selectedObject;

      if (obj.cat === '1' && obj.halfBlockSide !== undefined) {
        // Half-blocks sit at a half-integer offset (e.g. gy=10.5) along
        // their thin axis when halfBlockSide is 'far'. Math.round() snaps
        // to the nearest *whole* cell, which can never reproduce a .5
        // value — so snapping the thin axis by rounding to a whole cell
        // and then adding 0.5 (the old approach) shifts a stationary 'far'
        // block by up to a full grid cell the instant it's clicked, with
        // no mouse movement at all. Rounding to the nearest half-grid unit
        // directly (round(raw/halfUnit - 0.5) + 0.5) round-trips a 'far'
        // block's exact position when the mouse hasn't moved, while still
        // leveling real drags correctly.
        const thinIsFar = obj.halfBlockSide === 'far';
        if (obj.isHorizontalHalfBlock) {
          obj.gx = Math.round(rawX / this.gridSizeX);
          obj.gy = thinIsFar
            ? Math.round(rawY / this.gridSizeY - 0.5) + 0.5
            : Math.round(rawY / this.gridSizeY);
        } else {
          obj.gx = thinIsFar
            ? Math.round(rawX / this.gridSizeX - 0.5) + 0.5
            : Math.round(rawX / this.gridSizeX);
          obj.gy = Math.round(rawY / this.gridSizeY);
        }
      } else if (obj.cat === '2') {
        // Circular ("Ball"/CirclePlatform) objects drag on the same
        // width/80,height/80 half-grid increments they're placed on (see
        // worldToGridFine()), not the standard whole-grid-cell snap.
        const fine = this.worldToGridFine(rawX, rawY);
        obj.gx = fine.gx;
        obj.gy = fine.gy;
      } else {
        const snapped = this.worldToGrid(rawX, rawY);
        obj.gx = snapped.gx;
        obj.gy = snapped.gy;
      }
    } else if (this.isPanning) {
      this.camX = this.panStartCam.x - (mouseX - this.panStartMouse.x);
      this.camY = this.panStartCam.y - (mouseY - this.panStartMouse.y);
    }
  }

  handleRelease() {
    this.draggingSelected = false;
    this.isPanning = false;
    this._draggingPopupSlider = null;
  }

  // Right-click-drag pans the canvas (see mousePressed() in sketch-1.js).
  // Guarded against popups so a stray right-click while a popup is open
  // doesn't leave isPanning armed in the background for no reason.
  startPan() {
    if (this.activePopup) return;
    this.isPanning = true;
    this.panStartMouse = { x: mouseX, y: mouseY };
    this.panStartCam = { x: this.camX, y: this.camY };
  }

  // ── Popup click handling ─────────────────────────────────────────────────
  _handlePopupClick() {
    const p = this.activePopup;
    if (p.type === 'gravity') {
      if (p._doneBtn && this._inRect(p._doneBtn)) { this.activePopup = null; return; }
      if (p._sliderRect && this._inRect({ x: p._sliderRect.x - 10, y: p._sliderRect.y - 14, w: p._sliderRect.w + 20, h: 28 })) {
        this._dragGravitySlider();
        this._draggingPopupSlider = 'gravity';
      }
    } else if (p.type === 'radiusAdjust') {
      if (p._doneBtn && this._inRect(p._doneBtn)) { this.activePopup = null; return; }
      if (p._modeBtns) {
        if (p._modeBtns.respawnBtn && this._inRect(p._modeBtns.respawnBtn)) {
          p.obj.mode = 0;
          return;
        }
        if (p._modeBtns.singleUseBtn && this._inRect(p._modeBtns.singleUseBtn)) {
          p.obj.mode = 1;
          return;
        }
      }
      if (p._sliderRect && this._inRect({ x: p._sliderRect.x - 10, y: p._sliderRect.y - 14, w: p._sliderRect.w + 20, h: 28 })) {
        this._dragRadiusSlider();
        this._draggingPopupSlider = 'radius';
      }
    } else if (p.type === 'name') {
      if (p._doneBtn && this._inRect(p._doneBtn)) {
        this.levelName = (p.nameDraft || '').trim() || 'Untitled Level';
        this.background = p.backgroundDraft || 'none';
        this.gimmick = p.gimmickDraft || 'NIL';
        this.activePopup = null;
        return;
      }
      if (p._bgRects) {
        for (const r of p._bgRects) {
          if (this._inRect(r)) { p.backgroundDraft = r.value; return; }
        }
      }
      if (p._gimmickRects) {
        for (const r of p._gimmickRects) {
          if (this._inRect(r)) {
            const tokens = (p.gimmickDraft || 'NIL').split(' ').filter(Boolean).filter(t => t !== 'NIL');
            if (tokens.includes(r.value)) {
              p.gimmickDraft = tokens.filter(t => t !== r.value).join(' ') || 'NIL';
            } else {
              tokens.push(r.value);
              p.gimmickDraft = tokens.join(' ');
            }
            return;
          }
        }
      }
    } else if (p.type === 'load') {
      if (p._closeBtn && this._inRect(p._closeBtn)) { this.activePopup = null; return; }
      if (p._pageNav) {
        const { prevRect, nextRect, totalPages } = p._pageNav;
        if (prevRect && this._inRect(prevRect) && (p.page || 0) > 0) {
          p.page = Math.max(0, (p.page || 0) - 1);
          return;
        }
        if (nextRect && this._inRect(nextRect) && (p.page || 0) < totalPages - 1) {
          p.page = Math.min(totalPages - 1, (p.page || 0) + 1);
          return;
        }
      }
      if (p._rowRects) {
        for (const row of p._rowRects) {
          if (row._delRect && this._inRect(row._delRect)) {
            // Deleting a saved level is permanent (removes it from
            // localStorage entirely) regardless of whether the *editor's*
            // current session has unsaved changes, so this always confirms.
            this.activePopup = { type: 'confirmDeleteLevel', levelId: row.id, levelName: row.name, returnTo: 'load' };
            return;
          }
          if (this._inRect(row)) {
            if (this.hasUnsavedChanges()) {
              this.activePopup = { type: 'confirmLoad', levelId: row.id };
            } else {
              this.openCustomLevel(row.id);
              this.activePopup = null;
            }
            return;
          }
        }
      }
    } else if (p.type === 'confirmExit') {
      if (p._confirmBtn && this._inRect(p._confirmBtn)) {
        this.activePopup = null;
        this._requestExit = true;
        return;
      }
      if (p._cancelBtn && this._inRect(p._cancelBtn)) { this.activePopup = null; return; }
    } else if (p.type === 'confirmLoad') {
      if (p._confirmBtn && this._inRect(p._confirmBtn)) {
        this.openCustomLevel(p.levelId);
        this.activePopup = null;
        return;
      }
      if (p._cancelBtn && this._inRect(p._cancelBtn)) {
        // Cancelling backs out to the load list, not all the way out of
        // the popup flow — the player was mid-Load, not mid-something-else.
        this.activePopup = { type: 'load' };
        return;
      }
    } else if (p.type === 'confirmDeleteLevel') {
      if (p._confirmBtn && this._inRect(p._confirmBtn)) {
        this.deleteCustomLevel(p.levelId);
        this.activePopup = p.returnTo === 'load' ? { type: 'load' } : null;
        return;
      }
      if (p._cancelBtn && this._inRect(p._cancelBtn)) {
        this.activePopup = p.returnTo === 'load' ? { type: 'load' } : null;
        return;
      }
    } else if (p.type === 'movingPlatformConfig') {
      if (p._doneBtn && this._inRect(p._doneBtn)) { this.activePopup = null; return; }
      if (p._loopBtn && this._inRect(p._loopBtn)) { p.obj.loop = p.obj.loop ? 0 : 1; return; }
      if (p._addWaypointBtn && this._inRect(p._addWaypointBtn)) {
        this.activePopup = null;
        this.placingWaypointsFor = p.obj;
        return;
      }
      if (p._speedSliderRect && this._inRect({ x: p._speedSliderRect.x - 10, y: p._speedSliderRect.y - 14, w: p._speedSliderRect.w + 20, h: 28 })) {
        this._draggingPopupSlider = 'speed';
        this._dragMovingPlatformSlider('speed');
      }
      if (p._pauseSliderRect && this._inRect({ x: p._pauseSliderRect.x - 10, y: p._pauseSliderRect.y - 14, w: p._pauseSliderRect.w + 20, h: 28 })) {
        this._draggingPopupSlider = 'pause';
        this._dragMovingPlatformSlider('pause');
      }
    } else if (p.type === 'export') {
      if (p._doneBtn && this._inRect(p._doneBtn)) { this.activePopup = null; return; }
      if (p._copyBtn && this._inRect(p._copyBtn)) {
        this._copyExportCode();
        return;
      }
    } else if (p.type === 'importResult') {
      if (p._doneBtn && this._inRect(p._doneBtn)) { this.activePopup = null; return; }
    }
  }

  _handlePopupDrag() {
    if (!this._draggingPopupSlider) return;
    if (this._draggingPopupSlider === 'gravity') this._dragGravitySlider();
    else if (this._draggingPopupSlider === 'radius') this._dragRadiusSlider();
    else if (this._draggingPopupSlider === 'speed') this._dragMovingPlatformSlider('speed');
    else if (this._draggingPopupSlider === 'pause') this._dragMovingPlatformSlider('pause');
  }

  _dragGravitySlider() {
    const p = this.activePopup;
    if (!p._sliderRect) return;
    const r = p._sliderRect;
    const t = Math.max(0, Math.min(1, (mouseX - r.x) / r.w));
    p.obj.param = r.minV + t * (r.maxV - r.minV);
  }

  _dragRadiusSlider() {
    const p = this.activePopup;
    if (!p._sliderRect) return;
    const r = p._sliderRect;
    const t = Math.max(0, Math.min(1, (mouseX - r.x) / r.w));
    p.obj.gr = r.minV + t * (r.maxV - r.minV);
  }

  _dragMovingPlatformSlider(which) {
    const p = this.activePopup;
    const r = which === 'speed' ? p._speedSliderRect : p._pauseSliderRect;
    if (!r) return;
    const t = Math.max(0, Math.min(1, (mouseX - r.x) / r.w));
    const v = r.minV + t * (r.maxV - r.minV);
    if (which === 'speed') p.obj.speed = v;
    else p.obj.pauseFrames = Math.round(v);
  }

  // ── Popups: open helpers ─────────────────────────────────────────────────
  openNamePopup() {
    this.activePopup = {
      type: 'name',
      nameDraft: this.levelName,
      backgroundDraft: this.background,
      gimmickDraft: this.gimmick || 'NIL',
      editingText: true,
    };
  }

  openLoadPopup() {
    this.activePopup = { type: 'load', page: 0 };
  }

  // Shows the current level's data string and a Copy button. Uses
  // navigator.clipboard.writeText() directly from the button's click
  // handler — a standard browser API that needs no visible/focused input
  // element at all, unlike DOM text fields. Deliberately not using
  // createInput()/other p5.dom functions anywhere in this feature: this
  // project's p5.js script tag points at the plain core build (cdnjs
  // .../1.4.0/p5.js), and DOM element functions have historically shipped
  // in a separate p5.dom addon script that isn't loaded here — calling
  // them could throw at runtime instead of working, so this avoids that
  // risk entirely by sticking to plain browser APIs.
  openExportPopup() {
    this.activePopup = { type: 'export', code: this.toDataString(), copiedFlash: false };
  }

  // Lets the player paste a level code and load it into the current
  // editing session (overwriting whatever's currently placed, same as
  // Load does) — separate from the localStorage Save/Load system, for
  // sharing a level's code outside the browser entirely. Uses the
  // browser's native window.prompt() for the actual text entry — a real
  // OS-level text field, so paste just works, without depending on any
  // p5 DOM functions this build may not actually have.
  openImportPopup() {
    const code = window.prompt('Paste the level code to import (this replaces everything currently in the editor):', '');
    if (code === null) return; // player hit Cancel on the native dialog
    const trimmed = code.trim();
    if (!trimmed) {
      this.activePopup = { type: 'importResult', success: false, message: 'No code was entered.' };
      return;
    }
    const validation = this._validateLevelCode(trimmed);
    if (!validation.ok) {
      this.activePopup = { type: 'importResult', success: false, message: validation.error };
      return;
    }
    this.loadFromDataString(trimmed, this.levelName, this.background, this.gimmick);
    this.editingCustomId = null; // imported code is unsaved until the player hits Save
    this.selectedObject = null;
    this.placingWaypointsFor = null;
    this.selectedPaletteItem = null;
    this.pendingCorner = null;
    this._pendingSpawnCenter = true;
    this.activePopup = { type: 'importResult', success: true, message: 'Level imported.' };
  }

  // A lightweight structural check on a pasted code string — not a full
  // re-implementation of decodeLevelId's parsing (that would just be
  // duplicated logic to keep in sync), just enough to catch "this clearly
  // isn't level code at all" (e.g. someone pasted a URL or random text)
  // before loadFromDataString() silently produces a mostly-invisible level
  // full of NaN-positioned phantom objects with no helpful explanation.
  _validateLevelCode(code) {
    const tokens = code.split(' ').filter(Boolean);
    if (tokens.length === 0) {
      return { ok: false, error: 'That doesn\'t look like a level code.' };
    }
    let recognizedCount = 0;
    for (const t of tokens) {
      const cat = t.slice(0, 1);
      const coords = t.slice(2).split('z');
      const gx = Number(coords[0]);
      const gy = Number(coords[1]);
      if ('012345678'.includes(cat) && !isNaN(gx) && !isNaN(gy)) {
        recognizedCount++;
      }
    }
    if (recognizedCount === 0) {
      return { ok: false, error: 'That doesn\'t look like a level code — no recognizable blocks found.' };
    }
    return { ok: true };
  }

  // navigator.clipboard.writeText() is a standard browser API that works
  // directly from this click handler without needing any focused/visible
  // DOM input element — if it's unavailable (very old browser, insecure
  // context) there's no DOM input field to fall back to selecting either,
  // since the export popup is entirely canvas-drawn; the player can still
  // read the wrapped code directly off the popup in that rare case.
  _copyExportCode() {
    const p = this.activePopup;
    if (!p || p.type !== 'export') return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(p.code).then(() => {
        p.copiedFlash = true;
        setTimeout(() => { if (this.activePopup === p) p.copiedFlash = false; }, 1500);
      }).catch(() => {
        p.copiedFlash = false;
      });
    }
  }

  // Called from sketch-1.js keyPressed() while the name popup's text field
  // is conceptually focused (we keep it simple: any time the name popup is
  // open, typing edits the name draft).
  handleNameKey(k, kc) {
    const p = this.activePopup;
    if (!p || p.type !== 'name') return;
    if (kc === ENTER || kc === RETURN) {
      this.levelName = (p.nameDraft || '').trim() || 'Untitled Level';
      this.background = p.backgroundDraft || 'none';
      this.gimmick = p.gimmickDraft || 'NIL';
      this.activePopup = null;
    } else if (kc === ESCAPE) {
      this.activePopup = null;
    } else if (kc === BACKSPACE) {
      p.nameDraft = (p.nameDraft || '').slice(0, -1);
    } else if (k && k.length === 1 && (p.nameDraft || '').length < 28) {
      p.nameDraft = (p.nameDraft || '') + k;
    }
  }

  // ── Keyboard shortcuts while the editor is open ──────────────────────────
  handleKey(keyCode) {
    if (this.activePopup && this.activePopup.type === 'name') return; // text entry handled separately
    if (keyCode === ESCAPE) {
      if (this.placingWaypointsFor) { this.placingWaypointsFor = null; return; }
      if (this.pendingCorner) { this.pendingCorner = null; return; }
      if (this.activePopup) {
        // ESC mirrors each popup's own Cancel button rather than always
        // closing outright — confirmLoad's Cancel returns to the load
        // list (the player was mid-Load), everything else just closes.
        if (this.activePopup.type === 'confirmLoad') { this.activePopup = { type: 'load' }; return; }
        if (this.activePopup.type === 'confirmDeleteLevel') {
          this.activePopup = this.activePopup.returnTo === 'load' ? { type: 'load' } : null;
          return;
        }
        this.activePopup = null;
        return;
      }
      if (this.selectedPaletteItem) { this.selectedPaletteItem = null; return; }
      if (this.selectedObject) { this.selectedObject = null; return; }
    }
    if ((keyCode === DELETE || keyCode === BACKSPACE) && this.selectedObject && !this.activePopup) {
      this._deleteObject(this.selectedObject);
    }
    if (keyCode === 82 /* R */ && this.selectedObject && !this.activePopup) {
      this._rotateObject(this.selectedObject);
    }
  }
}
