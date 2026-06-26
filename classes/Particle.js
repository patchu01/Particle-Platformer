// ─────────────────────────────────────────────────────────────────────────────
// Particle
// Multiple particle types with different behaviors:
//
// Attract Particles:
//   - 'positive': attracts negative, repels positive
//   - 'negative': attracts positive, repels negative
//   - 'neutral_attract': attracts any charge
//
// Kill Particles (instant death on contact):
//   - 'kill_negative': kills positive players only (red outline)
//   - 'kill_positive': kills negative players only (blue outline)
//   - 'kill_neutral': kills any player (grey outline)
//
// Visual coding for attract:
//   Positive charge  →  blue  (#1E78FF)
//   Negative charge  →  red   (#E03232)
//   Neutral attract  →  grey  (#CCCCCC)
//
// Kill particles have neon effect: black circle + colored outline + symbol
// ─────────────────────────────────────────────────────────────────────────────

class Particle {
    constructor(x, y, r, type = 'positive') {
        this.x = x;
        this.y = y;
        this.r = r;
        this.type = type;   // particle behavior type

        // Determine if this is a kill particle
        this.isKill = this.type.startsWith('kill_');

        // Mass = π × r²  (proportional to 2-D cross-sectional area).
        this.mass = Math.PI * r * r;
    }

    // ── Rendering ────────────────────────────────────────────────────────────

    show() {
        push();

        if (this.isKill) {
            this.drawKillParticle();
        } else {
            this.drawAttractParticle();
        }

        pop();
    }

    drawAttractParticle() {
        noStroke();

        // Colour palette
        let bodyCol, auraCol, symbolCol;
        if (this.type === 'positive') {
            bodyCol = color(30,  120, 255);        // bright blue
            auraCol = color(30,  120, 255, 18);    // faint blue aura
            symbolCol = 255;
        } else if (this.type === 'negative') {
            bodyCol = color(220,  50,  50);        // bright red
            auraCol = color(220,  50,  50, 18);    // faint red aura
            symbolCol = 255;
        } else {
            // neutral_attract - grey
            bodyCol = color(200, 200, 200);        // grey
            auraCol = color(200, 200, 200, 18);    // faint grey aura
            symbolCol = 255;
        }

        // Influence aura  (radius where pull/push ≈ game gravity)
        let influenceR = Math.sqrt(this.mass / 0.2);
        fill(auraCol);
        circle(this.x, this.y, influenceR * 2);

        // Solid particle body
        fill(bodyCol);
        circle(this.x, this.y, this.r * 2);

        // Charge symbol  (+  or  −  or  ⊙)  centred inside the circle
        fill(symbolCol);
        textAlign(CENTER, CENTER);
        textSize(this.r * 0.85);
        if (this.type === 'positive') {
            text('+', this.x, this.y);
        } else if (this.type === 'negative') {
            text('-', this.x, this.y);
        } else {
            text('⊙', this.x, this.y);  // circled dot for neutral
        }
    }

    drawKillParticle() {
        // Neon effect: black body with colored outline and symbol
        
        // Determine outline color and symbol based on type
        let outlineCol, symbolCol;
        let symbol = '';
        
        if (this.type === 'kill_positive') {
            outlineCol = color(30,  120, 255);      // blue for kills negative
            symbolCol = color(30,  120, 255);
            symbol = '+';  // plus
        } else if (this.type === 'kill_negative') {
            outlineCol = color(220,  50,  50);      // red for kills positive
            symbolCol = color(220,  50,  50);
            symbol = '-';  // minus
        } else {
            // kill_neutral - grey
            outlineCol = color(150, 150, 150);  // grey for kills neutral
            symbolCol = color(150, 150, 150);
            symbol = '!';  // warning symbol
        }

        // Black body with thick colored outline
        fill(0);
        stroke(outlineCol);
        strokeWeight(this.r * 40 / height);
        circle(this.x, this.y, this.r * 2);

        // Symbol outline (thinner stroke)
        noFill();
        stroke(symbolCol);
        strokeWeight(this.r * 40 / height);
        textAlign(CENTER, CENTER);
        textSize(this.r);
        
        // Draw symbol in neon style
        fill(0);
        stroke(symbolCol);
        strokeWeight(this.r * 40 / height);
        text(symbol, this.x, this.y);
    }

    // ── Force ────────────────────────────────────────────────────────────────

    /**
     * Applies attraction/repulsion for attract particles.
     * Kill particles don't apply forces.
     */
    applyGravity(ball) {
        if (this.isKill) return;  // Kill particles don't attract/repel

        const G = 1.0;

        // Vector from ball toward particle centre
        let dx = this.x - ball.position.x;
        let dy = this.y - ball.position.y;
        let d  = Math.sqrt(dx * dx + dy * dy);

        // Soft clamp: prevents infinite force at zero distance
        let dMin = this.r + ball.r;
        if (d < dMin) d = dMin;

        // Force magnitude
        let forceMag = (G * this.mass) / (d * d);

        let chargeSign = 0;

        if (this.type === 'neutral_attract') {
            // Always attracts
            chargeSign = 1;
        } else {
            // Charged particles: opposite charges attract, same charges repel
            chargeSign = (this.type !== ball.charge) ? 1 : -1;
            
            // Ball is neutral - no force
            chargeSign = ball.charge === 'neutral' ? 0 : chargeSign;
        }

        // Unit vector scaled by magnitude and charge sign
        let forceVec = createVector(
            (dx / d) * forceMag * chargeSign,
            (dy / d) * forceMag * chargeSign
        );

        ball.applyForce(forceVec);
    }

    // ── Collision ────────────────────────────────────────────────────────────

    /**
     * Detects collision with ball.
     * For attract particles: bounce response.
     * For kill particles: trigger death.
     */
    checkCollision(ball) {
        let dx = ball.position.x - this.x;
        let dy = ball.position.y - this.y;
        let d  = Math.sqrt(dx * dx + dy * dy);
        let contactDist = this.r + ball.r;

        if (d < contactDist && d > 0) {
            if (this.isKill) {
                // Check if this particle kills the player
                this.checkKillCondition(ball);
            } else {
                // Bounce response for attract particles
                this.bounceResponse(ball, dx, dy, d);
            }
        }
    }

    /**
     * Check if ball should be killed based on particle type and ball charge
     */
    checkKillCondition(ball) {
        let shouldKill = false;

        if (this.type === 'kill_neutral') {
            shouldKill = true;  // Kills all
        } else if (this.type === 'kill_positive') {
            shouldKill = ball.charge === 'negative';  // Kills negative only
        } else if (this.type === 'kill_negative') {
            shouldKill = ball.charge === 'positive';  // Kills positive only
        }

        if (shouldKill) {
            ball.die();  // Trigger death animation
        }
    }

    /**
     * Impulse-based bounce response for attract particles
     */
    bounceResponse(ball, dx, dy, d) {
        // ── 1. Outward unit normal ────────────────────────────────────
        let nx = dx / d;
        let ny = dy / d;

        // ── 2. Decompose velocity ─────────────────────────────────────
        let vDotN = ball.velocity.x * nx + ball.velocity.y * ny;

        if (vDotN < 0) {
            let vNx = vDotN * nx;
            let vNy = vDotN * ny;
            let vTx = ball.velocity.x - vNx;
            let vTy = ball.velocity.y - vNy;

            // ── 3 & 4. Restitution + friction ─────────────────────────
            const e  = 0.78;
            const mu = 0.05;

            ball.velocity.x = (-e * vNx) + ((1 - mu) * vTx);
            ball.velocity.y = (-e * vNy) + ((1 - mu) * vTy);
            //reset ball inputs
            if (ball.lNum < 1) ball.lNum = 1;
            if (ball.rNum < 1) ball.rNum = 1;
            if (ball.uNum < 1) ball.uNum = 1;
            if (ball.dNum < 1) ball.dNum = 1;
        }

        // ── 5. Positional correction ──────────────────────────────────
        let contactDist = this.r + ball.r;
        let overlap = contactDist - d;
        ball.position.x += nx * overlap;
        ball.position.y += ny * overlap;
    }
}
