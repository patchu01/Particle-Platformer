class Platform {
    constructor(x, y, len, h, type, rotation = 0) {
        this.x = x;
        this.y = y;
        this.len = len;  // width
        this.h = h;      // height
        this.type = type;
        this.rotation = rotation || 0; // rotation in radians
        this.bounce = 0;
        
        // Set properties based on platform type
        if (this.type == 10) {
            this.col = color(200);
            this.frictionCoefficient = 0.05;
        }
        else if (this.type == 11) {
            this.col = color(5, 232, 224);
            this.frictionCoefficient = 0.005;
        }
        else if (this.type == 12) {
            this.col = color(232, 122, 5);
            this.frictionCoefficient = 0.15;
        }
        else if (this.type == 13) {
            this.col = color(2, 168, 54);
            this.frictionCoefficient = 0.075;
            this.bounce = 1;
        }
        else if (this.type == 14) {
            this.col = color(184, 134, 11); // Honey color
            this.frictionCoefficient = 0.1;
            this.bounce = 0;
            this.isSticky = true;
            this.stuckBall = null;
            this.stuckSide = null; // 'top', 'bottom', 'left', 'right', or edge name for triangles
        }
        
        // Pre-calculate triangle vertices if rotated
        if (this.rotation !== 0) {
            this.calculateTriangleVertices();
        }
    }

    /**
     * Calculate triangle vertices when rotated
     * Right-angled triangle with width=len and height=h
     * Vertices: top-left (x,y), top-right (x+w,y), bottom-left (x,y+h)
     */
    calculateTriangleVertices() {

      this.v1=this.v2=this.v3=createVector(0,0)
        
        
        // Rotate around origin and translate to world position
        if(this.rotation === 90) {
            this.v2 = { x: this.x, y: this.y }; // Top-left corner(always the origin)
            this.v3 = { x: this.x, y: this.y + this.h}; // Bottom-left corner
            this.v1 = { x: this.x + this.len, y: this.y}; // Top-right corner
        } else if(this.rotation === 180) {
            this.v1 = { x: this.x, y: this.y }; // Top-left origin
            this.v2 = { x: this.x + this.len, y: this.y }; // Top-right
            this.v3 = { x: this.x + this.len, y: this.y + this.h }; // Bottom-right
        } else if(this.rotation === 270) {
            this.v3 = { x: this.x +this.len, y: this.y }; // Top-right
            this.v2 = { x: this.x + this.len, y: this.y +this.h }; // Bottom-right
            this.v1 = { x: this.x, y: this.y + this.h }; // Bottom-left
        }
        else if(this.rotation === 360) {
            this.v3 = { x: this.x, y: this.y }; // Top-left origin
            this.v2 = { x: this.x, y: this.y + this.h }; // Bottom-left
            this.v1 = { x: this.x + this.len, y: this.y + this.h }; // Bottom-right
        }
    }

    show() {
        fill(this.col);
        
        if (this.rotation === 0) {
            // Regular rectangle
            rect(this.x, this.y, this.len, this.h);
        } else {
            // Draw triangle
            triangle(this.v1.x, this.v1.y, this.v2.x, this.v2.y, this.v3.x, this.v3.y);
        }
    }

    // Check if ball is on top of platform (for top collision)
    isBallOnTop(ball) {
        if (this.rotation === 0) {
            return (
                ball.position.x > this.x &&
                ball.position.x < this.x + this.len &&
                ball.position.y + ball.r >= this.y &&
                ball.position.y + ball.r / 2 <= this.y + this.h &&
                ball.velocity.y >= 0
            );
        }
        // For rotated triangles, use angular collision
        return this.checkTriangleCollision(ball);
    }

    /**
     * Check if point is inside triangle
     */
    pointInTriangle(px, py, x1, y1, x2, y2, x3, y3) {
        let d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
        let d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
        let d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
        
        let hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        let hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        
        return !(hasNeg && hasPos);
    }

    /**
     * Find closest point on line segment to a point
     */
    closestPointOnSegment(px, py, x1, y1, x2, y2) {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
        return {
            x: x1 + t * dx,
            y: y1 + t * dy
        };
    }

    /**
     * Triangle collision detection
     */
    checkTriangleCollision(ball) {
        let v1 = this.v1;
        let v2 = this.v2;
        let v3 = this.v3;
        
        // Check distance to all three edges
        let closest1 = this.closestPointOnSegment(ball.position.x, ball.position.y, v1.x, v1.y, v2.x, v2.y);
        let closest2 = this.closestPointOnSegment(ball.position.x, ball.position.y, v2.x, v2.y, v3.x, v3.y);
        let closest3 = this.closestPointOnSegment(ball.position.x, ball.position.y, v3.x, v3.y, v1.x, v1.y);
        
        let dist1 = distance(ball.position.x, ball.position.y, closest1.x, closest1.y);
        let dist2 = distance(ball.position.x, ball.position.y, closest2.x, closest2.y);
        let dist3 = distance(ball.position.x, ball.position.y, closest3.x, closest3.y);
        
        // Check if colliding with any edge
        if (dist1 <= ball.r || dist2 <= ball.r || dist3 <= ball.r) {
            return true;
        }
        return false;
    }

    /**
     * Apply collision response for triangles
     * For a right-angled triangle:
     * - Side 1 (v1-v2): use normal collision (horizontal/rotated horizontal)
     * - Side 3 (v3-v1): use normal collision (vertical/rotated vertical)
     * - Side 2 (v2-v3): use angular collision (hypotenuse)
     */
    applyTriangleCollision(ball) {
        let v1 = this.v1;
        let v2 = this.v2;
        let v3 = this.v3;
        
        // Find which edge we're closest to
        let closest1 = this.closestPointOnSegment(ball.position.x, ball.position.y, v1.x, v1.y, v2.x, v2.y);
        let closest2 = this.closestPointOnSegment(ball.position.x, ball.position.y, v2.x, v2.y, v3.x, v3.y);
        let closest3 = this.closestPointOnSegment(ball.position.x, ball.position.y, v3.x, v3.y, v1.x, v1.y);
        
        let dist1 = distance(ball.position.x, ball.position.y, closest1.x, closest1.y);
        let dist2 = distance(ball.position.x, ball.position.y, closest2.x, closest2.y);
        let dist3 = distance(ball.position.x, ball.position.y, closest3.x, closest3.y);
        
        let minDist = min(dist1, dist2, dist3);
        let closestEdge = 1;  // Default to edge 1
        
        if (minDist === dist2) closestEdge = 2;  // Hypotenuse
        if (minDist === dist3) closestEdge = 3;  // Vertical side
        
        // Only collide if within collision distance
        if (minDist > ball.r) return;
        
        // Get closest point and calculate normal
        let closest = (closestEdge === 1) ? closest1 : (closestEdge === 2) ? closest2 : closest3;
        let dx = ball.position.x - closest.x;
        let dy = ball.position.y - closest.y;
        let normal = createVector(dx, dy).normalize();
        
        // Check for sticky release on triangles
        if (this.isSticky) {
            let inputLeft = keyIsDown(LEFT_ARROW) || keyIsDown(65);
            let inputRight = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
            let inputUp = keyIsDown(UP_ARROW) || keyIsDown(87);
            let inputDown = keyIsDown(DOWN_ARROW) || keyIsDown(83);
            
            // Check if input is opposite to normal direction
            let shouldRelease = false;
            if ((normal.x > 0 && inputRight) || (normal.x < 0 && inputLeft)) shouldRelease = true;
            if ((normal.y > 0 && inputDown) || (normal.y < 0 && inputUp)) shouldRelease = true;
            
            if (shouldRelease) {
                this.stuckBall = null;
                this.stuckSide = null;
                return; // Release from sticky surface
            }
            
            this.stuckBall = ball;
            this.stuckSide = 'edge' + closestEdge;
            
            // Set movement constraints based on normal direction
            // Block movement perpendicular to the surface, allow parallel movement
            let absNx = Math.abs(normal.x);
            let absNy = Math.abs(normal.y);
            
            // If normal is more horizontal, block vertical movement
            if (absNx > absNy) {
                ball.canMoveX = false;
            } else {
                // If normal is more vertical, block horizontal movement
                ball.canMoveY = false;
            }
            ball.stuckToPlatform = this;
        }
        
        // Apply proper friction based on velocity decomposition
        let vDotN = ball.velocity.x * normal.x + ball.velocity.y * normal.y;
        
        if (vDotN < 0) {
            let vNx = vDotN * normal.x;
            let vNy = vDotN * normal.y;
            let vTx = ball.velocity.x - vNx;
            let vTy = ball.velocity.y - vNy;
            
            // Apply friction to tangential component and bounce to normal component
            const mu = this.frictionCoefficient;
            let e = this.bounce === 0 ? 0 : 0.9; // Restitution
            
            ball.velocity.x = (-e * vNx) + ((1 - mu) * vTx);
            ball.velocity.y = (-e * vNy) + ((1 - mu) * vTy);
        }
        
        // Resolve penetration
        let penetration = ball.r - minDist;
        ball.position.x += normal.x * penetration;
        ball.position.y += normal.y * penetration;
        
        // Reset jump counters
        if (ball.lNum < 1) ball.lNum = 1;
        if (ball.rNum < 1) ball.rNum = 1;
        if (ball.uNum < 1) ball.uNum = 1;
        if (ball.dNum < 1) ball.dNum = 1;
    }

    applyForces(ball) {
        if (this.rotation === 0) {
            // Dimension-based collision gating:
            //   hasTopBottom — true when the platform is wide enough to land on / hit from below.
            //                  Threshold: len >= (canvas width / 40) * 0.75
            //   hasBottomSide — true when the platform is tall enough to collide on bottom/sides.
            //                   Threshold: h >= (canvas height / 40) * 0.75
            let hasTopBottom = this.len >= (width  / 40) * 0.75;
            let hasBottomSide = this.h  >= (height / 40) * 0.75;

            if (hasTopBottom && this.checkTopCollision(ball)) {
                this.applyCollision(ball, 'top');
            } else if (hasTopBottom && hasBottomSide && this.checkBottomCollision(ball)) {
                this.applyCollision(ball, 'bottom');
            } else if (hasBottomSide && this.checkSideCollision(ball) === 'left') {
                this.applyCollision(ball, 'left');
            } else if (hasBottomSide && this.checkSideCollision(ball) === 'right') {
                this.applyCollision(ball, 'right');
            }
        } else {
            // Triangle collision (unaffected by dimension gating)
            if (this.checkTriangleCollision(ball)) {
                this.applyTriangleCollision(ball);
            }
        }
    }

    /**
     * Check top surface collision (horizontal platforms)
     */
    checkTopCollision(ball) {
        if (this.rotation === 0) {
            if (ball.position.x > this.x && ball.position.x < this.x + this.len &&
                ball.position.y + ball.r >= this.y &&
                ball.position.y + ball.r / 2 <= this.y + this.h &&
                ball.velocity.y >= 0) {
                // Check for sticky release
                if (this.isSticky) {
                    let inputUp = keyIsDown(UP_ARROW) || keyIsDown(87);
                    if (inputUp) {
                        this.stuckBall = null;
                        this.stuckSide = null;
                        return false; // Release from sticky surface
                    }
                    this.stuckBall = ball;
                    this.stuckSide = 'top';
                    // Allow vertical movement, block horizontal
                    ball.canMoveY = false;
                    ball.stuckToPlatform = this;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Check side collision (vertical walls)
     */
    checkSideCollision(ball) {
        if (this.rotation === 0) {
            // Check left side
            if (ball.position.x + ball.r >= this.x &&
                ball.position.x - ball.r <= this.x &&
                ball.position.y > this.y &&
                ball.position.y < this.y + this.h &&
                ball.velocity.x > 0) {
                // Check for sticky release
                if (this.isSticky) {
                    let inputLeft = keyIsDown(LEFT_ARROW) || keyIsDown(65);
                    if (inputLeft) {
                        this.stuckBall = null;
                        this.stuckSide = null;
                        return false; // Release from sticky surface
                    }
                    this.stuckBall = ball;
                    this.stuckSide = 'left';
                    // Allow horizontal movement, block vertical
                    ball.canMoveX = false;
                    ball.stuckToPlatform = this;
                }
                return 'left';
            }
            // Check right side
            if (ball.position.x - ball.r <= this.x + this.len &&
                ball.position.x + ball.r >= this.x + this.len &&
                ball.position.y > this.y &&
                ball.position.y < this.y + this.h &&
                ball.velocity.x < 0) {
                // Check for sticky release
                if (this.isSticky) {
                    let inputRight = keyIsDown(RIGHT_ARROW) || keyIsDown(68);
                    if (inputRight) {
                        this.stuckBall = null;
                        this.stuckSide = null;
                        return false; // Release from sticky surface
                    }
                    this.stuckBall = ball;
                    this.stuckSide = 'right';
                    // Allow horizontal movement, block vertical
                    ball.canMoveX = false;
                    ball.stuckToPlatform = this;
                }
                return 'right';
            }
        }
        return false;
    }

    /**
     * Check bottom collision (ceiling)
     */
    checkBottomCollision(ball) {
        if (this.rotation === 0) {
            if (ball.position.x > this.x &&
                ball.position.x < this.x + this.len &&
                ball.position.y - ball.r <= this.y + this.h &&
                ball.position.y + ball.r / 2 >= this.y + this.h &&
                ball.velocity.y < 0) {
                // Check for sticky release
                if (this.isSticky) {
                    let inputDown = keyIsDown(DOWN_ARROW) || keyIsDown(83);
                    if (inputDown) {
                        this.stuckBall = null;
                        this.stuckSide = null;
                        return false; // Release from sticky surface
                    }
                    this.stuckBall = ball;
                    this.stuckSide = 'bottom';
                    // Allow vertical movement, block horizontal
                    ball.canMoveY = false;
                    ball.stuckToPlatform = this;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Apply collision response and forces
     */
    applyCollision(ball, collisionType) {
        // Apply friction (works for both sticky and regular platforms)
        let friction = ball.velocity.copy();
        friction.normalize();
        friction.mult(-this.frictionCoefficient);
        ball.applyForce(friction);
        
        // Reset jump counters
        if (ball.lNum < 1) ball.lNum = 1;
        if (ball.rNum < 1) ball.rNum = 1;
        if (ball.uNum < 1) ball.uNum = 1;
        if (ball.dNum < 1) ball.dNum = 1;
        
        // For sticky platforms: zero the velocity component pushing into the surface
        // and snap position. The parallel component is left intact so the ball glides.
        if (this.isSticky) {
            if (collisionType === 'top' || collisionType === 'topDiagonal') {
                ball.velocity.y = 0;
                ball.position.y = this.y - ball.r;
            } else if (collisionType === 'bottom') {
                ball.velocity.y = 0;
                ball.position.y = this.y + this.h + ball.r;
            } else if (collisionType === 'left') {
                ball.velocity.x = 0;
                ball.position.x = this.x - ball.r;
            } else if (collisionType === 'right') {
                ball.velocity.x = 0;
                ball.position.x = this.x + this.len + ball.r;
            }
            return;
        }
        
        // Apply bounce if applicable
        if (this.bounce != 0) {
            ball.velocity.x -= ball.velocity.x / 50 * (10 - this.bounce);
            ball.velocity.y -= ball.velocity.y / 50 * (10 - this.bounce);
        }
        
        // Handle collision based on type
        if (collisionType === 'top' || collisionType === 'topDiagonal') {
            if (this.bounce === 0) {
                ball.velocity.y = 0;
            } else {
                ball.velocity.y = ball.velocity.y * -1;
            }
            // Snap to platform surface
            ball.position.y = this.y - ball.r;
        } else if (collisionType === 'bottom') {
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
}

/**
 * Helper function for distance calculation
 */
function distance(x1, y1, x2, y2) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    return sqrt(dx * dx + dy * dy);
} 