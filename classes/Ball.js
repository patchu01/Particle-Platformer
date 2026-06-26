class Ball {
    constructor(x, y, r) {
        this.position = createVector(x, y);
        this.velocity = createVector(0, 0);
        this.acceleration = createVector(0, 0);
        this.r = r;
        this.mass = r * 0.4/3;
        this.accChange = 5;
        // timer for input waiting
        this.timer = millis();
        // timers for reference (one for each input)
        this.lRef = millis();
        this.rRef = millis();
        this.uRef = millis();
        this.dRef = millis();
        // number of times each input can be used once ball off ground
        this.lNum = this.rNum = this.uNum = this.dNum = 1;
        this.timerDiff = 500;
        // levels which direction ('l'/'r'/'u'/'d') was most recently used, for the
        // "refresh most recent input" power-up
        this.lastInputUsed = null;

        // ── Charge ────────────────────────────────────────────────────────
        // 'positive' -> blue,  'negative' -> red 'neutral' -> grey
        // Press K to toggle during gameplay when ChargeSwitch gimmick is active.
        this.charge = 'neutral';
        this.canSwitchCharge = false;

        // ── Movement Constraints (for sticky platforms) ──────────────────
        this.canMoveX = true;  // Can move horizontally
        this.canMoveY = true;  // Can move vertically
        this.stuckToPlatform = null;  // Reference to platform ball is stuck to

        // ── Death State ────────────────────────────────────────────────────
        this.isDead = false;           // Whether the ball is in death state
        this.deathAnimationStart = 0;  // Time when death started
        this.deathAnimationDuration = 1400; // Duration of death animation in ms
        this.deathScreenX = 0;         // Screen X at moment of death
        this.deathScreenY = 0;         // Screen Y at moment of death
    }

    applyForce(force) {
        // Allow forces to be different when the ball changes size using the size portals
        let f = force.copy().div(this.mass / (Math.min(width / 30, height / 30) / 10));
        this.acceleration.add(f);
    }

    // Check if the ball is within an area for the program to change the camera location
    checkChangeCam(axis) {
        if (axis == 'x') {
            return (this.position.x < levels[activeLevelId].w - width / 2 && this.position.x > width / 2);
        } else if (axis == 'y') {
            return (this.position.y < levels[activeLevelId].h - height / 2 && this.position.y > height / 2);
        }
    }

    checkEdges() {
        let resetInputs = false;
        if (this.position.x > levels[activeLevelId].w - this.r) {
            if (this.position.x > levels[activeLevelId].w - this.r + 1) {
                this.position.x = levels[activeLevelId].w - this.r;
            }
            this.velocity.set(this.velocity.x * -1, this.velocity.y);
            this.velocity.mult(0.9, 0.9);
            resetInputs = true;
        }
        if (this.position.x < this.r) {
            if (this.position.x < this.r - 1) {
                this.position.x = this.r;
            }
            this.velocity.set(-1 * this.velocity.x, this.velocity.y);
            this.velocity.mult(0.9, 0.9);
            resetInputs = true;
        }
        if (this.position.y > levels[activeLevelId].h - this.r) {
            if (this.position.y > levels[activeLevelId].h - this.r + 1) {
                this.position.y = levels[activeLevelId].h - this.r;
            }
            this.velocity.set(this.velocity.x, -1 * this.velocity.y);
            this.velocity.mult(0.9, 0.9);
            resetInputs = true;
        }
        if (this.position.y < this.r) {
            if (this.position.y < this.r - 1) {
                this.position.y = this.r;
            }
            this.velocity.set(this.velocity.x, -1 * this.velocity.y);
            this.velocity.mult(0.9, 0.9);
            resetInputs = true;
        }
        if (resetInputs) {
            if (this.lNum < 10) this.lNum = 1;
            if (this.rNum < 10) this.rNum = 1;
            if (this.uNum < 10) this.uNum = 1;
            if (this.dNum < 10) this.dNum = 1;
        }
    }

    update() {
        if (mobile == false) {
            if ((keyIsDown(RIGHT_ARROW) || keyIsDown(68)) && this.timer - this.rRef > this.timerDiff && this.rNum > 0) {
                timer.beginCounting();
                this.acceleration.x += this.accChange;
                this.rRef = millis();
                this.rNum--;
                this.lastInputUsed = 'r';
            } else if ((keyIsDown(LEFT_ARROW) || keyIsDown(65)) && this.timer - this.lRef > this.timerDiff && this.lNum > 0) {
                timer.beginCounting();
                this.acceleration.x -= this.accChange;
                this.lRef = millis();
                this.lNum--;
                this.lastInputUsed = 'l';
            } else if ((keyIsDown(UP_ARROW) || keyIsDown(87)) && this.timer - this.uRef > this.timerDiff && this.uNum > 0) {
                timer.beginCounting();
                this.acceleration.y -= this.accChange;
                this.uRef = millis();
                this.uNum--;
                this.lastInputUsed = 'u';
            } else if ((keyIsDown(DOWN_ARROW) || keyIsDown(83)) && this.timer - this.dRef > this.timerDiff && this.dNum > 0) {
                timer.beginCounting();
                this.acceleration.y += this.accChange;
                this.dRef = millis();
                this.dNum--;
                this.lastInputUsed = 'd';
            }
        } else {
            if (btns[5].clickCheck() && this.timer - this.rRef > this.timerDiff && this.rNum > 0) {
                timer.beginCounting();
                this.acceleration.x += this.accChange;
                this.rRef = millis();
                this.rNum--;
                this.lastInputUsed = 'r';
            } else if (btns[4].clickCheck() && this.timer - this.lRef > this.timerDiff && this.lNum > 0) {
                timer.beginCounting();
                this.acceleration.x -= this.accChange;
                this.lRef = millis();
                this.lNum--;
                this.lastInputUsed = 'l';
            } else if (btns[6].clickCheck() && this.timer - this.uRef > this.timerDiff && this.uNum > 0) {
                timer.beginCounting();
                this.acceleration.y -= this.accChange;
                this.uRef = millis();
                this.uNum--;
                this.lastInputUsed = 'u';
            } else if (btns[7].clickCheck() && this.timer - this.dRef > this.timerDiff && this.dNum > 0) {
                timer.beginCounting();
                this.acceleration.y += this.accChange;
                this.dRef = millis();
                this.dNum--;
                this.lastInputUsed = 'd';
            }
        }
        this.velocity.add(this.acceleration);
        
        // ── Apply movement constraints ────────────────────────────────────
        // Zero the velocity component perpendicular to the surface being touched.
        // This applies to both regular and sticky platforms: on sticky surfaces
        // canMoveY is false when on top (prevents sinking) while canMoveX stays
        // true so the ball can glide freely. Release is handled in the collision
        // check (pressing the opposite direction skips the collision entirely).
        if (!this.canMoveX) {
            this.velocity.x = 0;
        }
        if (!this.canMoveY) {
            this.velocity.y = 0;
        }
        
        // Allow window size to scale without giving advantage/disadvantage
        this.position.add(this.velocity.x * width / 800, this.velocity.y * height / 600);
        this.acceleration.mult(0);
    }

    show() {
        // Ball colour reflects its current charge
        if (this.charge === 'positive') {
            fill(30, 120, 255);   // Blue = positive
        }
      else if(this.charge === 'neutral'){
        fill('grey')     //Grey = neutral
      }
        else {
            fill(220, 50, 50);    // Red  = negative
        }
        noStroke();
        circle(this.position.x, this.position.y, this.r * 2);
    }

    /**
     * Trigger death animation when ball hits a kill particle
     */
    die() {
        if (!this.isDead) {
            this.isDead = true;
            this.deathAnimationStart = millis();
            // Screen position = world position mapped through the same
            // translate(width/2 - cameraLocation.x, height/2 - cameraLocation.y)
            // that the rest of the frame uses. cameraLocation was already
            // snapped to the ball at the top of this draw() call, so this
            // matches exactly where ball.show() would have drawn the ball.
            this.deathScreenX = this.position.x - cameraLocation.x + width  / 2;
            this.deathScreenY = this.position.y - cameraLocation.y + height / 2;
            timer.pause()
        }
    }

    /**
     * Get progress of death animation (0 to 1)
     */
    getDeathAnimationProgress() {
        if (!this.isDead) return 0;
        const elapsed = millis() - this.deathAnimationStart;
        return Math.min(elapsed / this.deathAnimationDuration, 1.0);
    }

    /**
     * Check if death animation is finished
     */
    isDeathAnimationFinished() {
        return this.isDead && this.getDeathAnimationProgress() >= 1.0;
    }

    /**
     * Death animation:
     *  1. A thin black streak flashes across from the bottom-left corner,
     *     passing through the ball in the first ~12% of the timeline.
     *  2. The two halves immediately obey physics: gravity accelerates them
     *     downward, each gets a small outward kick and a gentle spin, and
     *     they fall off the bottom of the screen.
     */
    showDeathAnimation() {
        if (!this.isDead) return;

        const p  = this.getDeathAnimationProgress(); // 0 to 1
        const bx = this.deathScreenX;
        const by = this.deathScreenY;
        const r  = this.r;

        // ── Slash geometry ────────────────────────────────────────────────
        const originX = 0;
        const originY = height;
        const dx   = bx - originX;
        const dy   = by - originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const nx   = dx / dist;   // unit vector along slash
        const ny   = dy / dist;
        const perpX = -ny;        // perpendicular (90 deg CCW)
        const perpY =  nx;
        const slashAngle = Math.atan2(ny, nx);

        // ── Streak: flashes from origin through ball in first STREAK_END ──
        const STREAK_END  = 0.12;
        const totalTravel = dist + r * 5;
        const streakT     = Math.min(p / STREAK_END, 1.0);
        const headDist    = streakT * totalTravel;
        const tailLen     = Math.max(r * 5, 60);
        const tailDist    = Math.max(0, headDist - tailLen);

        // ── Physics time: begins when streak reaches the ball ─────────────
        // cutStartP = progress when the streak head first touches the ball
        const cutStartP = ((dist - r) / totalTravel) * STREAK_END;
        const t = Math.max(0, p - cutStartP); // physics clock

        // ── Physics ───────────────────────────────────────────────────────
        // Both halves fall straight down under gravity.
        // A small perpendicular drift opens the cut visually.
        // Spin is kept slow so the semicircle shape stays readable.
        const G        = height * 5.0;          // gravity (px / t²)
        const driftSpd = r * 2.0;               // separation speed (px / t)
        const spinRate = 0.45 * Math.PI;        // ~80° total — stays clearly a semicircle

        const dropY = 0.5 * G * t * t;
        const drift = driftSpd * t;

        push();
        fill(0);
        noStroke();

        if (t <= 0) {
            // Intact ball before the slice arrives
            circle(bx, by, r * 2);
        } else {
            // Half A — one side of the cut, drifts in +perp direction
            push();
            translate(bx + perpX * drift, by + perpY * drift + dropY);
            rotate(slashAngle + spinRate * t);
            arc(0, 0, r * 2, r * 2, 0, PI, PIE);
            pop();

            // Half B — other side, drifts in -perp direction
            push();
            translate(bx - perpX * drift, by - perpY * drift + dropY);
            rotate(slashAngle + PI - spinRate * t);
            arc(0, 0, r * 2, r * 2, 0, PI, PIE);
            pop();
        }

        // ── Streak line (only while it is traveling) ──────────────────────
        if (p < STREAK_END) {
            strokeCap(ROUND);
            stroke(0);
            strokeWeight(r * 0.45);
            line(
                originX + nx * tailDist, originY + ny * tailDist,
                originX + nx * headDist, originY + ny * headDist
            );
        }

        // ── UI:  death msg + keybind hints ───────────────────────────
        // Counter fades in while halves are still falling, then ticks up.
        // Keybind hints fade in after the tick.
        const COUNTER_IN  = 0.35;   // counter label starts fading in
        const TICK_P      = 0.55;   // number clicks over to new count
        const HINTS_IN    = 0.62;   // keybind hints start fading in

        if (p >= COUNTER_IN) {
            // counter (see die() above), so showing it here would always
            // read "0" — replaced with a simple "TEST RUN" label instead.
            const fadeIn     = Math.min(1, (p - COUNTER_IN) / 0.10);
            const baseAlpha  = fadeIn * 255;

            if (typeof isTestPlay !== 'undefined' && isTestPlay) {
                fill(253, 162, 0, baseAlpha);
                textAlign(CENTER, CENTER);
                noStroke();
                textSize(28);
                text('TEST RUN', width / 2, height / 2 + 10);
            } else {
                // Show death message
                fill(253, 162, 0, baseAlpha);
                textAlign(CENTER, CENTER);
                noStroke();
                textSize(28);
                text('You died skill issue', width / 2, height / 2 + 10);
            }

            // Keybind hints fade in after the tick settles
            if (p >= HINTS_IN) {
                const hintFade  = Math.min(1, (p - HINTS_IN) / (1.0 - HINTS_IN));
                const hintAlpha = hintFade * 190;
                fill(120, 120, 120, hintAlpha);
                textSize(14);
                text((typeof isTestPlay !== 'undefined' && isTestPlay) ? '[R]  Restart Level' : '[R]  Reset Level', width / 2, height * 0.75);
                let hintY = height * 0.75 + 28;
                if (recentCp > 0) {
                    text('[SPACE]  Respawn at Checkpoint', width / 2, hintY);
                    hintY += 28;
                }
                if (typeof isTestPlay !== 'undefined' && isTestPlay) {
                    text('[ESC]  Back to Editor', width / 2, hintY);
                } else {
                    text('[ESC]  Exit to Menu', width / 2, hintY);
                }
            }
        }

        pop();
    }
}
