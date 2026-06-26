// ─────────────────────────────────────────────────────────────────────────────
// AuthMenu.js
// Addon: a login / account-creation overlay for the main menu, built the same
// way LevelSelectScreen's username-editor overlay is — pure p5 canvas drawing,
// polled input via mouseIsPressed, keyboard typing routed through keyPressed().
//
// This file never edits supabase.js. It only calls the functions it already
// exports (loginPlayer, registerPlayer, logoutPlayer) and reads the global
// state variables it already maintains (currentPlayer). The one thing
// supabase.js doesn't expose is *which* outcome a call resolved to — those
// functions only report that via console.log/console.error inside their own
// .then() — so the small bridge below briefly listens on the console for the
// exact line supabase.js logs, then hands the result back as a callback.
// ─────────────────────────────────────────────────────────────────────────────

// ── Bridge: turns loginPlayer()/registerPlayer()'s console-only outcome into
// a normal callback, without modifying either function. ─────────────────────
function _authListenForOutcome(matchers, onDone, timeoutMs = 15000) {
  const originalError = console.error;
  const originalLog = console.log;
  let finished = false;
  let timeoutId = null;

  function restore() {
    console.error = originalError;
    console.log = originalLog;
    if (timeoutId) clearTimeout(timeoutId);
  }

  console.error = function (...args) {
    if (!finished && args[0] === matchers.errorPrefix) {
      finished = true;
      restore();
      onDone({ success: false, message: args[1] });
    }
    originalError.apply(console, args);
  };

  console.log = function (...args) {
    if (!finished && args[0] === matchers.successPrefix) {
      finished = true;
      restore();
      onDone({ success: true });
    }
    originalLog.apply(console, args);
  };

  timeoutId = setTimeout(() => {
    if (!finished) {
      finished = true;
      restore();
      onDone({ success: false, message: 'No response from server. Please try again.' });
    }
  }, timeoutMs);
}

// Calls supabase.js's own loginPlayer()/registerPlayer() and reports back
// whether they succeeded, by matching the exact strings those functions
// already pass to console.log/console.error on success/failure.
function authLogin(email, password, callback) {
  _authListenForOutcome(
    { errorPrefix: 'Login error:', successPrefix: 'Logged in successfully! Welcome,' },
    callback
  );
  loginPlayer(email, password);
}

function authRegister(email, password, displayName, callback) {
  _authListenForOutcome(
    { errorPrefix: 'Registration error:', successPrefix: 'Account created! Logged in as:' },
    callback
  );
  registerPlayer(email, password, displayName);
}

// ── The overlay itself ───────────────────────────────────────────────────────
class AuthMenu {
  constructor() {
    this.visible = false;
    this.mode = 'login'; // 'login' | 'signup'
    this.activeField = 'email'; // 'name' | 'email' | 'password'
    this.nameDraft = '';
    this.emailDraft = '';
    this.passwordDraft = '';
    this.message = null; // {text, success: true|false|null}
    this.pending = false;
    this._logoutRect = null;

    // Palette borrowed from Btn.js / LevelSelectScreen so this addon matches
    // the rest of the game instead of looking bolted-on.
    this.COL_PANEL = [223, 232, 224];
    this.COL_TEXT = [18, 50, 44];
    this.COL_ACCENT = [86, 167, 134];   // same green as the Play button
    this.COL_WARN = [254, 95, 85];      // same red as the Editor button
    this.COL_GOLD = [253, 162, 0];      // same orange as the Account button
  }

  // ── Open / close ───────────────────────────────────────────────────────────
  open() {
    this.visible = true;
    this.mode = 'login';
    this.activeField = 'email';
    this.emailDraft = '';
    this.passwordDraft = '';
    this.nameDraft = '';
    this.message = null;
    this.pending = false;
  }

  close() {
    this.visible = false;
  }

  setMode(mode) {
    if (this.mode === mode || this.pending) return;
    this.mode = mode;
    this.activeField = mode === 'signup' ? 'name' : 'email';
    this.message = null;
  }

  // ── Keyboard input (called from sketch-1.js's keyPressed) ──────────────────
  handleKey(k, keyCode) {
    if (!this.visible) return;
    if (keyCode === ESCAPE) {
      this.close();
      return;
    }
    if (currentPlayer || this.pending) return; // nothing to type in those views

    if (keyCode === TAB) {
      const order = this.mode === 'signup' ? ['name', 'email', 'password'] : ['email', 'password'];
      const idx = order.indexOf(this.activeField);
      this.activeField = order[(idx + 1) % order.length];
      return;
    }
    if (keyCode === ENTER || keyCode === RETURN) {
      this.submit();
      return;
    }
    if (keyCode === BACKSPACE) {
      const key = this.activeField + 'Draft';
      this[key] = this[key].slice(0, -1);
      return;
    }
    if (k && k.length === 1) {
      const key = this.activeField + 'Draft';
      const maxLen = this.activeField === 'email' ? 60 : (this.activeField === 'name' ? 24 : 72);
      if (this[key].length < maxLen) {
        this[key] += k;
      }
    }
  }

  // ── Submission ───────────────────────────────────────────────────────────
  submit() {
    if (this.pending || currentPlayer) return;
    const email = this.emailDraft.trim();
    const password = this.passwordDraft;

    if (!email || !password) {
      this.message = { text: 'Enter an email and password.', success: false };
      return;
    }
    if (this.mode === 'signup' && !this.nameDraft.trim()) {
      this.message = { text: 'Enter a display name.', success: false };
      return;
    }

    this.pending = true;
    this.message = { text: this.mode === 'login' ? 'Logging in...' : 'Creating account...', success: null };

    if (this.mode === 'login') {
      authLogin(email, password, (result) => this._handleResult(result, 'Login successful!', 'Incorrect password.'));
    } else {
      authRegister(email, password, this.nameDraft.trim(), (result) =>
        this._handleResult(result, 'Account creation successful!', null)
      );
    }
  }

  _handleResult(result, successText, failureOverride) {
    this.pending = false;
    if (result.success) {
      this.message = { text: successText, success: true };
      // Exit the menu on success, per spec.
      this.visible = false;
    } else {
      // Stay open on failure, per spec. Login failures are reported as an
      // incorrect password (Supabase deliberately doesn't distinguish a bad
      // email from a bad password in its own error message); other failures
      // (e.g. signup on an already-registered email) show the server's
      // actual reason since there's no single catch-all phrase for those.
      const text = failureOverride || result.message || 'Something went wrong. Please try again.';
      this.message = { text, success: false };
    }
  }

  // ── Layout (single source of truth for both draw() and click hit-testing) ──
  _fieldsConfig() {
    const fields = [
      { key: 'email', label: 'EMAIL' },
      { key: 'password', label: 'PASSWORD', mask: true }
    ];
    if (this.mode === 'signup') {
      fields.unshift({ key: 'name', label: 'DISPLAY NAME' });
    }
    return fields;
  }

  _layout() {
    const fields = this._fieldsConfig();
    const boxW = Math.min(width * 0.36, 440);
    const headerH = boxW * 0.16;
    const tabsH = boxW * 0.14;
    const fieldBlockH = boxW * 0.24;
    const buttonH = boxW * 0.16;
    const messageH = boxW * 0.16;
    const hintH = boxW * 0.10;
    const padding = boxW * 0.08;

    const boxH = headerH + tabsH + fields.length * fieldBlockH + buttonH + messageH + hintH;
    const boxX = width / 2 - boxW / 2;
    const boxY = height / 2 - boxH / 2;

    let cursorY = boxY + headerH;
    const tabsRect = { x: boxX + padding / 2, y: cursorY, w: boxW - padding, h: tabsH };
    cursorY += tabsH;

    const fieldRects = {};
    const fieldsOrder = [];
    for (const f of fields) {
      const inputY = cursorY + fieldBlockH * 0.46;
      const inputH = fieldBlockH * 0.46;
      fieldRects[f.key] = {
        key: f.key,
        label: f.label,
        mask: !!f.mask,
        x: boxX + padding,
        y: inputY,
        w: boxW - padding * 2,
        h: inputH,
        labelY: cursorY + fieldBlockH * 0.08
      };
      fieldsOrder.push(f.key);
      cursorY += fieldBlockH;
    }

    const buttonRect = { x: boxX + padding, y: cursorY + boxW * 0.02, w: boxW - padding * 2, h: buttonH };
    cursorY += buttonH + boxW * 0.02;

    const messageRect = { x: boxX + padding, y: cursorY, w: boxW - padding * 2, h: messageH };
    cursorY += messageH;

    const closeSize = boxW * 0.07;
    const closeRect = { x: boxX + boxW - closeSize - boxW * 0.04, y: boxY + boxW * 0.04, w: closeSize, h: closeSize };

    return { boxX, boxY, boxW, boxH, padding, tabsRect, fieldRects, fieldsOrder, buttonRect, messageRect, closeRect };
  }

  // ── Corner "Login" button shown on the main menu ────────────────────────────
  _loginButtonRect() {
    const w = Math.min(width * 0.16, 170);
    const h = Math.min(height * 0.06, 46);
    const x = width - w - 24;
    const y = 24;
    return { x, y, w, h };
  }

  drawLoginButton() {
    const r = this._loginButtonRect();
    push();
    rectMode(CORNER);
    noFill();
    const col = currentPlayer ? this.COL_ACCENT : this.COL_GOLD;
    stroke(col[0], col[1], col[2]);
    strokeWeight(1.5);
    rect(r.x, r.y, r.w, r.h, 10);
    noStroke();
    fill(col[0], col[1], col[2]);
    textAlign(CENTER, CENTER);
    textSize(Math.min(r.h * 0.4, 16));
    const label = currentPlayer ? ('Hi, ' + currentPlayer.name) : 'Account';
    text(label, r.x + r.w / 2, r.y + r.h / 2 - 1);
    pop();
  }

  clickedLoginButton() {
    const r = this._loginButtonRect();
    return mouseIsPressed && mouseX > r.x && mouseX < r.x + r.w && mouseY > r.y && mouseY < r.y + r.h;
  }

  // ── Click hit-testing for the overlay itself ────────────────────────────────
  clickedClose() {
    if (!this.visible) return false;
    const r = this._layout().closeRect;
    const pad = 6;
    return mouseIsPressed && mouseX > r.x - pad && mouseX < r.x + r.w + pad && mouseY > r.y - pad && mouseY < r.y + r.h + pad;
  }

  clickedLogout() {
    if (!this.visible || !currentPlayer || !this._logoutRect) return false;
    const r = this._logoutRect;
    const pad = 6;
    return mouseIsPressed && mouseX > r.x - pad && mouseX < r.x + r.w + pad && mouseY > r.y - pad && mouseY < r.y + r.h + pad;
  }

  clickedTab() {
    if (!this.visible || currentPlayer) return null;
    const t = this._layout().tabsRect;
    const pad = 4;
    if (mouseIsPressed && mouseX > t.x - pad && mouseX < t.x + t.w + pad && mouseY > t.y - pad && mouseY < t.y + t.h + pad) {
      return mouseX < t.x + t.w / 2 ? 'login' : 'signup';
    }
    return null;
  }

  clickedField() {
    if (!this.visible || currentPlayer) return null;
    const L = this._layout();
    const pad = 4;
    for (const key of L.fieldsOrder) {
      const f = L.fieldRects[key];
      if (mouseIsPressed && mouseX > f.x - pad && mouseX < f.x + f.w + pad && mouseY > f.y - pad && mouseY < f.y + f.h + pad) return key;
    }
    return null;
  }

  clickedSubmit() {
    if (!this.visible || currentPlayer || this.pending) return false;
    const b = this._layout().buttonRect;
    const pad = 4;
    return mouseIsPressed && mouseX > b.x - pad && mouseX < b.x + b.w + pad && mouseY > b.y - pad && mouseY < b.y + b.h + pad;
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  draw() {
    if (!this.visible) return;
    const L = this._layout();

    push();
    textFont(gameFont);

    // Dim the menu behind the overlay
    noStroke();
    fill(0, 0, 0, 170);
    rect(0, 0, width, height);

    // Panel
    fill(this.COL_PANEL[0], this.COL_PANEL[1], this.COL_PANEL[2]);
    rect(L.boxX, L.boxY, L.boxW, L.boxH, 12);

    // Close (X)
    stroke(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2]);
    strokeWeight(2);
    line(L.closeRect.x, L.closeRect.y, L.closeRect.x + L.closeRect.w, L.closeRect.y + L.closeRect.h);
    line(L.closeRect.x + L.closeRect.w, L.closeRect.y, L.closeRect.x, L.closeRect.y + L.closeRect.h);
    noStroke();

    if (currentPlayer) {
      this._drawLoggedInView(L);
      pop();
      return;
    }
    this._logoutRect = null;

    // Tabs
    const tabW = L.tabsRect.w / 2;
    textAlign(CENTER, CENTER);
    textSize(L.boxW * 0.05);

    fill(this.mode === 'login' ? color(this.COL_ACCENT[0], this.COL_ACCENT[1], this.COL_ACCENT[2]) : color(0, 0, 0, 30));
    rect(L.tabsRect.x, L.tabsRect.y, tabW, L.tabsRect.h, 6);
    fill(this.mode === 'login' ? 255 : 90);
    text('Log In', L.tabsRect.x + tabW / 2, L.tabsRect.y + L.tabsRect.h / 2);

    fill(this.mode === 'signup' ? color(this.COL_ACCENT[0], this.COL_ACCENT[1], this.COL_ACCENT[2]) : color(0, 0, 0, 30));
    rect(L.tabsRect.x + tabW, L.tabsRect.y, tabW, L.tabsRect.h, 6);
    fill(this.mode === 'signup' ? 255 : 90);
    text('Sign Up', L.tabsRect.x + tabW + tabW / 2, L.tabsRect.y + L.tabsRect.h / 2);

    // Fields
    const blink = Math.floor(frameCount / 30) % 2 === 0 ? '|' : '';
    for (const key of L.fieldsOrder) {
      const f = L.fieldRects[key];

      fill(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2]);
      textAlign(LEFT, BOTTOM);
      textSize(L.boxW * 0.04);
      text(f.label, f.x, f.labelY + L.boxW * 0.045);

      fill(255);
      stroke(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2], this.activeField === key ? 255 : 70);
      strokeWeight(this.activeField === key ? 2 : 1.5);
      rect(f.x, f.y, f.w, f.h, 6);
      noStroke();

      const rawValue = this[key + 'Draft'];
      const shown = f.mask ? '\u2022'.repeat(rawValue.length) : rawValue;
      fill(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2]);
      textAlign(LEFT, CENTER);
      textSize(L.boxW * 0.05);
      text(shown + (this.activeField === key ? blink : ''), f.x + L.boxW * 0.03, f.y + f.h / 2);
    }

    // Submit button
    const btnCol = this.pending ? [150, 150, 150] : this.COL_ACCENT;
    fill(btnCol[0], btnCol[1], btnCol[2]);
    rect(L.buttonRect.x, L.buttonRect.y, L.buttonRect.w, L.buttonRect.h, 8);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(L.boxW * 0.055);
    text(
      this.pending ? '...' : (this.mode === 'login' ? 'Log In' : 'Create Account'),
      L.buttonRect.x + L.buttonRect.w / 2,
      L.buttonRect.y + L.buttonRect.h / 2 - 2
    );

    // Message
    if (this.message) {
      const col = this.message.success === true ? [60, 160, 90] : (this.message.success === false ? [200, 60, 60] : [90, 90, 90]);
      fill(col[0], col[1], col[2]);
      textAlign(CENTER, TOP);
      textSize(L.boxW * 0.042);
      text(this.message.text, width / 2, L.messageRect.y, L.boxW * 0.9);
    }

    // Hint + mode switch
    fill(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2], 150);
    textAlign(CENTER, TOP);
    textSize(L.boxW * 0.032);
    const switchHint = this.mode === 'login' ? 'New here? Click Sign Up above.' : 'Already have an account? Click Log In above.';
    text(switchHint + '   (Esc to close)', width / 2, L.boxY + L.boxH - L.boxW * 0.07, L.boxW * 0.92);

    pop();
  }

  _drawLoggedInView(L) {
    fill(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2]);
    textAlign(CENTER, TOP);
    textSize(L.boxW * 0.065);
    text('LOGGED IN', width / 2, L.boxY + L.boxH * 0.14);

    textSize(L.boxW * 0.055);
    text(currentPlayer.name, width / 2, L.boxY + L.boxH * 0.30);

    fill(90);
    textSize(L.boxW * 0.04);
    text(currentPlayer.email, width / 2, L.boxY + L.boxH * 0.40);

    const lbW = L.boxW * 0.55;
    const lbH = L.boxW * 0.15;
    const lbX = width / 2 - lbW / 2;
    const lbY = L.boxY + L.boxH * 0.55;
    this._logoutRect = { x: lbX, y: lbY, w: lbW, h: lbH };

    fill(this.COL_WARN[0], this.COL_WARN[1], this.COL_WARN[2]);
    rect(lbX, lbY, lbW, lbH, 8);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(L.boxW * 0.05);
    text('Log Out', lbX + lbW / 2, lbY + lbH / 2 - 2);

    fill(this.COL_TEXT[0], this.COL_TEXT[1], this.COL_TEXT[2], 150);
    textAlign(CENTER, TOP);
    textSize(L.boxW * 0.032);
    text('Esc to close', width / 2, L.boxY + L.boxH - L.boxW * 0.07);
  }
}
