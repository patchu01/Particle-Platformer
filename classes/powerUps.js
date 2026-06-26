// ─────────────────────────────────────────────────────────────────────────────
// PowerUp
// Six power-up kinds are supported:
//   kind 'inputsRefresh'   -> refreshes ALL inputs (l/r/u/d) back to full
//   kind 'recentRefresh'   -> refreshes only the most recently used input
//   kind 'chargePositive'  -> sets the ball charge to positive
//   kind 'chargeNegative'  -> sets the ball charge to negative
//   kind 'chargeNeutral'   -> sets the ball charge to neutral
//   kind 'chargeToggle'    -> toggles the ball charge exactly like the K key
//
// Each power-up also has 2 respawn modes, set via the level id:
//   mode 0 -> "respawning": after being picked up, a faint outline of the
//             power-up stays visible where it was, and it reappears
//             (becomes collectable again) 3 seconds later
//   mode 1 -> "single-use": no outline after pickup, never comes back
// ─────────────────────────────────────────────────────────────────────────────

class PowerUp {
    constructor(x, y, r, kind, mode = 0) {
        this.x = x;
        this.y = y;
        this.r = r;
        this.kind = kind;     // 'inputsRefresh' | 'recentRefresh' | 'chargePositive' | 'chargeNegative' | 'chargeNeutral' | 'chargeToggle'
        this.mode = mode;     // 0 = respawning, 1 = single-use

        this.collected = false;     // whether currently picked up (unavailable)
        this.collectedAt = 0;       // millis() timestamp of pickup, used for the 3s respawn timer
        this.respawnDelay = 3000;   // 3 seconds, matches the checkpoint popup duration convention
        this._touching = false;     // internal state for charge entry detection

        // ── Visual styling ───────────────────────────────────────────────
        // InputsRefresh (refresh-all) -> gold/yellow, RecentRefresh (refresh-recent) -> cyan
        if (this.kind === 'inputsRefresh') {
            this.col = color(255, 200, 0);
            this.symbol = '\u21BB'; // clockwise open circle arrow (refresh-all)
        } else if (this.kind === 'recentRefresh') {
            this.col = color(0, 220, 220);
            this.symbol = '\u2191'; // up arrow (refresh single/most-recent)
        } else if (this.kind === 'chargePositive') {
            this.col = color(90, 150, 255);
            this.symbol = '+';
        } else if (this.kind === 'chargeNegative') {
            this.col = color(255, 100, 100);
            this.symbol = '-';
        } else if (this.kind === 'chargeNeutral') {
            this.col = color(200, 200, 200);
            this.symbol = '\u2299'; // circled dot
        } else if (this.kind === 'chargeToggle') {
            this.col = color(140, 255, 120);
            this.symbol = 'K';
        } else {
            this.col = color(255, 255, 255);
            this.symbol = '?';
        }
    }

    // ── Update / respawn timing ────────────────────────────────────────────
    update() {
        // Only respawning-mode power-ups ever become collectable again
        if (this.collected && this.mode === 0) {
            if (millis() - this.collectedAt >= this.respawnDelay) {
                this.collected = false;
            }
        }
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    show() {
        push();
        if (!this.collected) {
            // Full, solid power-up icon
            noStroke();
            fill(this.col);
            circle(this.x, this.y, this.r * 2);

            fill(255);
            textAlign(CENTER, CENTER);
            textSize(this.r);
            text(this.symbol, this.x, this.y);
        } else if (this.mode === 0) {
            // Picked up but will respawn: faint outline only, no fill, no symbol
            noFill();
            stroke(red(this.col), green(this.col), blue(this.col), 90);
            strokeWeight(Math.max(1, this.r * 0.12));
            circle(this.x, this.y, this.r * 2);
        }
        // mode 1 (single-use) draws nothing at all once collected
        pop();
    }

    // ── Collision / pickup ───────────────────────────────────────────────
    checkPickup(ball) {
        let dx = ball.position.x - this.x;
        let dy = ball.position.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        const touching = d < this.r + ball.r;

        if (this.collected) {
            this._touching = touching;
            return;
        }

        if (touching && !this._touching) {
            this.applyEffect(ball);
            const isChargeChanger = this.kind === 'chargePositive' || this.kind === 'chargeNegative' || this.kind === 'chargeNeutral' || this.kind === 'chargeToggle';
            if (this.mode === 1 || !isChargeChanger) {
                this.collected = true;
                this.collectedAt = millis();
            }
        }

        this._touching = touching;
    }

    applyEffect(ball) {
        if (this.kind === 'inputsRefresh') {
            // Refresh all directional inputs back to one use each
            ball.lNum = ball.rNum = ball.uNum = ball.dNum = 1;
        } else if (this.kind === 'recentRefresh') {
            // Refresh only whichever input was most recently used
            switch (ball.lastInputUsed) {
                case 'l':
                    ball.lNum = 1;
                    break;
                case 'r':
                    ball.rNum = 1;
                    break;
                case 'u':
                    ball.uNum = 1;
                    break;
                case 'd':
                    ball.dNum = 1;
                    break;
                default:
                    // No input used yet this run - nothing to refresh
                    break;
            }
        } else if (this.kind === 'chargePositive') {
            ball.charge = 'positive';
        } else if (this.kind === 'chargeNegative') {
            ball.charge = 'negative';
        } else if (this.kind === 'chargeNeutral') {
            ball.charge = 'neutral';
        } else if (this.kind === 'chargeToggle') {
            ball.charge = (ball.charge === 'positive' || ball.charge === 'neutral') ? 'negative' : 'positive';
        }
    }
}
