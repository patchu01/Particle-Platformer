// ─────────────────────────────────────────────────────────────────────────────
// MovingPlatform
// A platform that travels back and forth (or loops) along a path of waypoints.
// Behaves like a honey/sticky surface while the ball rides it (matches the
// Platform type-14 honey behaviour: ball sticks, perpendicular velocity is
// zeroed, parallel velocity is preserved, opposite input releases the ball).
//
// On top of that, the platform "launches" any ball riding it the instant its
// own velocity changes sharply - i.e. when it turns a corner on its path, or
// when it comes to a stop at a waypoint (end of path, or a paused waypoint).
// The launch force is the platform's own travel direction at the moment
// before the change, scaled by how fast it was moving - so a platform
// cruising at full speed flings the ball much harder than one crawling along.
//
// The path itself (the sequence of waypoints the platform walks between) is
// drawn as a dotted guide line so players can read the route in advance.
// ─────────────────────────────────────────────────────────────────────────────

class MovingPlatform {
    constructor(w, h, speed, waypoints, loop = false, pauseFrames = 0) {
        this.len = w;   // matches Platform's "len" naming for width
        this.h = h;
        this.speed = speed;
        this.waypoints = waypoints;
        this.loop = loop;
        this.pauseFrames = pauseFrames;

        // Current top-left position of the platform (mirrors Platform.x/y)
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;
        // Position at the start of this frame, before move() ran - collision
        // is checked against this so a fast-moving platform can't "outrun"
        // a ball that was resting on it last frame.
        this.prevX = this.x;
        this.prevY = this.y;

        // ── Path-following state ───────────────────────────────────────────
        this.targetIndex = waypoints.length > 1 ? 1 : 0; // index of waypoint we're heading to
        this.direction = 1; // 1 = forward along waypoints array, -1 = backward (ping-pong only)
        this.pauseTimer = 0; // counts down while paused at a waypoint

        // Velocity of the platform itself, in px/frame - this is what gets
        // compared frame-to-frame to detect turns/stops for the launch effect.
        this.velocity = createVector(0, 0);
        this.prevVelocity = createVector(0, 0);

        // ── Honey/sticky styling - reuse Platform's honey look ─────────────
        this.col = color(184, 134, 11); // honey color
        this.frictionCoefficient = 0.1;
        this.isSticky = true;
        this.stuckBall = null;
        this.stuckSide = null;

        // ── Launch tuning ───────────────────────────────────────────────────
        // How much of the platform's pre-change speed gets converted into launch force.
        this.launchMultiplier = 1.8;
        // Minimum speed change (px/frame) before a launch is triggered, so tiny
        // float jitter at constant speed doesn't constantly "launch" the ball.
        this.launchThreshold = 0.05;
    }

    // ── Movement along the path ─────────────────────────────────────────────
    move() {
        this.prevVelocity = this.velocity.copy();
        this.prevX = this.x;
        this.prevY = this.y;

        // Hold position while paused at a waypoint
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            this.velocity.set(0, 0);
            return;
        }

        if (this.waypoints.length < 2) {
            this.velocity.set(0, 0);
            return;
        }

        let target = this.waypoints[this.targetIndex];
        let dx = target.x - this.x;
        let dy = target.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= this.speed) {
            // Arrived at the waypoint this frame - snap to it.
            this.x = target.x;
            this.y = target.y;
            this.velocity.set(0, 0); // momentarily stationary - this is a "stop" point

            // Begin pausing if configured
            if (this.pauseFrames > 0) {
                this.pauseTimer = this.pauseFrames;
            }

            // Advance to the next waypoint, handling loop vs ping-pong
            this.advanceTarget();
        } else {
            // Move toward the target at constant speed
            let nx = (dx / dist) * this.speed;
            let ny = (dy / dist) * this.speed;
            this.x += nx;
            this.y += ny;
            this.velocity.set(nx, ny);
        }
    }

    advanceTarget() {
        if (this.loop) {
            this.targetIndex = (this.targetIndex + 1) % this.waypoints.length;
        } else {
            // Ping-pong: reverse direction at either end of the path
            if (this.direction === 1) {
                if (this.targetIndex >= this.waypoints.length - 1) {
                    this.direction = -1;
                    this.targetIndex = this.waypoints.length - 2;
                } else {
                    this.targetIndex++;
                }
            } else {
                if (this.targetIndex <= 0) {
                    this.direction = 1;
                    this.targetIndex = Math.min(1, this.waypoints.length - 1);
                } else {
                    this.targetIndex--;
                }
            }
        }
    }

    /**
     * Detects a turn (direction changed) or a stop (came to rest) between last
     * frame and this one, and returns a launch vector if one should be applied,
     * or null if the platform's motion didn't change meaningfully this frame.
     */
    getLaunchVector() {
        let prevSpeed = this.prevVelocity.mag();
        let currSpeed = this.velocity.mag();

        // Nothing was moving before, nothing to launch from
        if (prevSpeed < this.launchThreshold) return null;

        // Detect a stop: was moving, now still
        let stopped = currSpeed < this.launchThreshold;

        // Detect a turn: both moving, but direction changed meaningfully
        let turned = false;
        if (!stopped && currSpeed >= this.launchThreshold) {
            let prevDir = this.prevVelocity.copy().normalize();
            let currDir = this.velocity.copy().normalize();
            let dot = prevDir.x * currDir.x + prevDir.y * currDir.y;
            // dot close to 1 = same direction, close to -1 = reversed, 0 = right angle turn
            if (dot < 0.98) turned = true;
        }

        if (!stopped && !turned) return null;

        // Launch along the direction the platform was travelling just before
        // the change, scaled by how fast it was going.
        let launch = this.prevVelocity.copy().normalize().mult(prevSpeed * this.launchMultiplier);
        return launch;
    }

    // ── Rendering ────────────────────────────────────────────────────────────
    show() {
        this.drawPath();

        fill(this.col);
        noStroke();
        rect(this.x, this.y, this.len, this.h);
    }

    /**
     * Draws the route the platform follows as a dotted guide line, so players
     * can read where it's headed before stepping on it.
     */
    drawPath() {
        if (this.waypoints.length < 2) return;

        push();
        stroke(184, 134, 11, 120);
        strokeWeight(2);
        drawingContext.setLineDash([6, 8]);

        // Anchor the path to the centre of the platform's footprint rather than
        // its top-left corner, so the line passes through the platform visually.
        let offX = this.len / 2;
        let offY = this.h / 2;

        for (let i = 0; i < this.waypoints.length - 1; i++) {
            let a = this.waypoints[i];
            let b = this.waypoints[i + 1];
            line(a.x + offX, a.y + offY, b.x + offX, b.y + offY);
        }
        if (this.loop) {
            let a = this.waypoints[this.waypoints.length - 1];
            let b = this.waypoints[0];
            line(a.x + offX, a.y + offY, b.x + offX, b.y + offY);
        }
        drawingContext.setLineDash([]);

        // Small dots at each waypoint
        noStroke();
        fill(184, 134, 11, 160);
        for (let wp of this.waypoints) {
            circle(wp.x + offX, wp.y + offY, 6);
        }
        pop();
    }

    // ── Collision (4-sided: top carries the ball, bottom/sides bounce it) ────
    // All checks use prevX/prevY so a fast-moving platform can't outrun a ball
    // that was already in contact with it last frame.

    isBallOnTop(ball) {
        return (
            ball.position.x > this.prevX &&
            ball.position.x < this.prevX + this.len &&
            ball.position.y + ball.r >= this.prevY &&
            ball.position.y + ball.r / 2 <= this.prevY + this.h &&
            ball.velocity.y >= 0
        );
    }

    checkBottomCollision(ball) {
        return (
            ball.position.x > this.prevX &&
            ball.position.x < this.prevX + this.len &&
            ball.position.y - ball.r <= this.prevY + this.h &&
            ball.position.y + ball.r / 2 >= this.prevY + this.h &&
            ball.velocity.y < 0
        );
    }

    checkSideCollision(ball) {
        // Left face
        if (
            ball.position.x + ball.r >= this.prevX &&
            ball.position.x - ball.r <= this.prevX &&
            ball.position.y > this.prevY &&
            ball.position.y < this.prevY + this.h &&
            ball.velocity.x > 0
        ) return 'left';

        // Right face
        if (
            ball.position.x - ball.r <= this.prevX + this.len &&
            ball.position.x + ball.r >= this.prevX + this.len &&
            ball.position.y > this.prevY &&
            ball.position.y < this.prevY + this.h &&
            ball.velocity.x < 0
        ) return 'right';

        return false;
    }

    // Simple bounce response used for bottom / side hits on the moving platform.
    _applyBounce(ball, collisionType) {
        let friction = ball.velocity.copy();
        friction.normalize();
        friction.mult(-this.frictionCoefficient);
        ball.applyForce(friction);

        if (ball.lNum < 1) ball.lNum = 1;
        if (ball.rNum < 1) ball.rNum = 1;
        if (ball.uNum < 1) ball.uNum = 1;
        if (ball.dNum < 1) ball.dNum = 1;

        if (collisionType === 'bottom') {
            ball.velocity.y = -ball.velocity.y * 0.9;
            ball.position.y = this.y + this.h + ball.r;
        } else if (collisionType === 'left') {
            ball.velocity.x = -ball.velocity.x * 0.9;
            ball.position.x = this.x - ball.r;
        } else if (collisionType === 'right') {
            ball.velocity.x = -ball.velocity.x * 0.9;
            ball.position.x = this.x + this.len + ball.r;
        }
    }

    applyForces(ball) {
        // ── Side collisions (solid walls — checked before top/bottom) ──────
        let side = this.checkSideCollision(ball);
        if (side) {
            this._applyBounce(ball, side);
            return;
        }

        // ── Bottom collision (ceiling bounce) ──────────────────────────────
        if (this.checkBottomCollision(ball)) {
            this._applyBounce(ball, 'bottom');
            return;
        }

        // ── Top / carrying collision ───────────────────────────────────────
        // A ball already riding stays attached through this frame's move;
        // a fresh ball only attaches if inside the pre-move footprint.
        let wasRiding = this.stuckBall === ball;
        if (!wasRiding && !this.isBallOnTop(ball)) {
            return;
        }

        // Jump input pops the ball off the top surface
        let inputUp = keyIsDown(UP_ARROW) || keyIsDown(87);
        if (inputUp) {
            this.stuckBall = null;
            this.stuckSide = null;
            return;
        }

        this.stuckBall = ball;
        this.stuckSide = 'top';
        ball.canMoveY = false;
        ball.stuckToPlatform = this;

        // Friction
        let friction = ball.velocity.copy();
        friction.normalize();
        friction.mult(-this.frictionCoefficient);
        ball.applyForce(friction);

        // Reset jump counters
        if (ball.lNum < 1) ball.lNum = 1;
        if (ball.rNum < 1) ball.rNum = 1;
        if (ball.uNum < 1) ball.uNum = 1;
        if (ball.dNum < 1) ball.dNum = 1;

        // Zero vertical velocity, snap to surface, carry horizontally by real
        // displacement (not just velocity — they differ on waypoint-snap frames).
        ball.velocity.y = 0;
        ball.position.x += (this.x - this.prevX);
        ball.position.y = this.y - ball.r;

        // Drifted off the edge horizontally — release
        if (ball.position.x < this.x || ball.position.x > this.x + this.len) {
            this.stuckBall = null;
            this.stuckSide = null;
            ball.canMoveY = true;
            return;
        }

        // ── Launch on turn / stop ────────────────────────────────────────
        let launch = this.getLaunchVector();
        if (launch) {
            ball.canMoveY = true;
            this.stuckBall = null;
            this.stuckSide = null;
            ball.applyForce(launch);
        }
    }
}
