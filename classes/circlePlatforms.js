class CirclePlatform {
    constructor(x, y, r, type) {
        this.x = x;
        this.y = y;
        this.r = r; // radius
        this.type = type;
        
        // Set properties based on platform type
        // Type 20, 21, 22: Stick to upper half
        // Type 23: Bounce off
        // Type 24: Gravitational field sticking
        if (this.type == 20) {
            this.col = color(200);
            this.frictionCoefficient = 0.05;
            this.behavior = 'stick-upper';
        }
        else if (this.type == 21) {
            this.col = color(5, 232, 224);
            this.frictionCoefficient = 0.005;
            this.behavior = 'stick-upper';
        }
        else if (this.type == 22) {
            this.col = color(232, 122, 5);
            this.frictionCoefficient = 0.15;
            this.behavior = 'stick-upper';
        }
        else if (this.type == 23) {
            this.col = color(2, 168, 54);
            this.frictionCoefficient = 0.075;
            this.behavior = 'bounce';
            this.restitution = 1.0; // Full bounce
        }
        else if (this.type == 24) {
            this.col = color(184, 134, 11); // Honey color (dark goldenrod)
            this.frictionCoefficient = 0.05;
            this.behavior = 'gravity-stick';
            // ── Gravitational field parameters ────────────────────────────
            // The field exists just outside the surface and pulls the ball
            // inward, creating a natural sticking effect with no constraints.
            this.gravFieldStrength = 0.5;  // Force magnitude (inward, per frame)
            this.gravFieldDepth   = 0.5;  // Zone width, measured in ball-radii beyond surface
        }
    }

    show() {
        fill(this.col);
        noStroke();
        circle(this.x, this.y, this.r * 2);
    }

    // ── Collision detection & response ────────────────────────────────────────
    checkCollision(ball) {
        let dx = ball.position.x - this.x;
        let dy = ball.position.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        let contactDist = this.r + ball.r;

        if (d < contactDist && d > 0) {
            // Outward unit normal (from circle centre toward ball)
            let nx = dx / d;
            let ny = dy / d;

            // ── Decide whether to collide ─────────────────────────────────
            let shouldCollide = false;
            if (this.behavior === 'gravity-stick' || this.behavior === 'stick-all') {
                shouldCollide = true;
            } else if (this.behavior === 'stick-upper') {
                // Only collide when ball is above centre or falling
                shouldCollide = (dy < 0) || (ball.velocity.y > 0);
            } else if (this.behavior === 'bounce') {
                shouldCollide = true;
            }

            if (!shouldCollide) return;

            // ── Velocity decomposition ────────────────────────────────────
            let vDotN = ball.velocity.x * nx + ball.velocity.y * ny;

            if (vDotN < 0) {
                // Separate normal and tangential components
                let vNx = vDotN * nx;
                let vNy = vDotN * ny;
                let vTx = ball.velocity.x - vNx;
                let vTy = ball.velocity.y - vNy;

                // Restitution: 0 for sticking types, non-zero for bounce
                let e = (this.behavior === 'bounce') ? (this.restitution || 0.78) : 0;
                const mu = this.frictionCoefficient || 0.05;

                ball.velocity.x = (-e * vNx) + ((1 - mu) * vTx);
                ball.velocity.y = (-e * vNy) + ((1 - mu) * vTy);
            }

            // ── Positional correction (push ball out of overlap) ──────────
            let overlap = contactDist - d;
            ball.position.x += nx * overlap;
            ball.position.y += ny * overlap;

            // ── Reset jump counters ───────────────────────────────────────
            if (ball.lNum < 1) ball.lNum = 1;
            if (ball.rNum < 1) ball.rNum = 1;
            if (ball.uNum < 1) ball.uNum = 1;
            if (ball.dNum < 1) ball.dNum = 1;
        }
    }

    // ── Per-frame forces ──────────────────────────────────────────────────────
    applyForces(ball) {
        if (this.behavior !== 'gravity-stick') return;

        let dx = ball.position.x - this.x;
        let dy = ball.position.y - this.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        let contactDist = this.r + ball.r;
        let fieldEdge   = contactDist + ball.r * this.gravFieldDepth;

        // Only act in the zone just outside the surface
        if (d <= contactDist || d >= fieldEdge) return;

        // Outward unit normal
        let nx = dx / d;
        let ny = dy / d;

        // Linear falloff: full strength at the surface, zero at the field edge
        let t = 1 - (d - contactDist) / (ball.r * this.gravFieldDepth);
        let forceMag = this.gravFieldStrength * t;

        // Pull the ball inward (opposite to outward normal)
        ball.applyForce(createVector(-nx * forceMag, -ny * forceMag));

        // Being inside the gravitational field counts as grounded
        if (ball.lNum < 1) ball.lNum = 1;
        if (ball.rNum < 1) ball.rNum = 1;
        if (ball.uNum < 1) ball.uNum = 1;
        if (ball.dNum < 1) ball.dNum = 1;
    }
}
