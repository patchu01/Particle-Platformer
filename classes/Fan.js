class Fan {
    constructor(x,y,w,h,fX,fY) {
        this.x = x;
        this.y = y;
        this.w=w
        this.h=h
      // Right if positive/zero, Left if negative
        this.direction = createVector(fX,fY);
    }

    show() {
        push(); // Isolate drawing state
        translate(this.x, this.y);

        // Draw the square base
        fill(100); // Dark grey for the base
        noStroke();
        rect(0, 0,this.w,this.h);

        // Draw the direction arrow (triangle)
        // Position the arrow relative to the center of the appropriate edge of the square
        fill(150, 150, 250); // Light blue color for the fan arrow
        translate(this.w/2,this.h/2); // Move origin to the center of the square

        let angle = this.direction.heading();
        rotate(angle);

        // Adjust triangle size and position to look like an arrow attached to the base
        let arrowSize = 8;
        // Position the triangle slightly ahead of the center, along its direction
        translate(10, 0); // Move forward from the center (square edge)
        triangle(
            -arrowSize, -arrowSize / 1.5, // Back left corner
            -arrowSize, arrowSize / 1.5,  // Back right corner
             arrowSize, 0                 // Tip pointing in the direction
        );

        pop(); // Restore drawing state
    }

    // Check if a platform blocks the wind between the fan and ball
    isPlatformBlocking(ball, platforms) {
        // Get the fan's center
        let fanCenterX = this.x + this.w / 2;
        let fanCenterY = this.y + this.h / 2;
        
        // Check each platform
        for (let platform of platforms) {
            // For horizontal fans (direction primarily in x)
            if (Math.abs(this.direction.x) > Math.abs(this.direction.y)) {
                // Check if platform is between fan and ball horizontally
                if ((this.direction.x > 0 && platform.x > fanCenterX && platform.x < ball.position.x) ||
                    (this.direction.x < 0 && platform.x < fanCenterX && platform.x > ball.position.x)) {
                    // Check if platform is vertically aligned with the wind
                    if (this.y>platform.y&&this.y<platform.y+platform.h){
                        return true;
                    }
                }
            }
            // For vertical fans (direction primarily in y)
            else {
                // Check if platform is between fan and ball vertically
                if ((this.direction.y > 0 && platform.y > fanCenterY && platform.y < ball.position.y) ||
                    (this.direction.y < 0 && platform.y < fanCenterY && platform.y > ball.position.y)) {
                    // Check if platform is horizontally aligned with the wind
                    if (this.x>platform.x&&this.x<platform.x+platform.w) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // Apply force to a ball object
    applyForce(ball, platforms = []) {
        // Decide whether this is a horizontal fan (blows left/right) or a
        // vertical fan (blows up/down) based on which axis its direction
        // points along — same test isPlatformBlocking already uses below.
        const horizontal = Math.abs(this.direction.x) > Math.abs(this.direction.y);

        let aligned, inFront;
        if (horizontal) {
            // Ball must be within 10px of the fan's height (vertically
            // aligned with the wind stream) and on the side the fan faces.
            aligned = dist(ball.position.y, 0, this.y, 0) <= 10;
            inFront = (ball.position.x < this.x && this.direction.x <= 0) ||
                      (ball.position.x > this.x && this.direction.x >= 0);
        } else {
            // Ball must be within 10px of the fan's x-position (horizontally
            // aligned with the wind stream) and above/below per direction.
            aligned = dist(ball.position.x, 0, this.x, 0) <= 10;
            inFront = (ball.position.y < this.y && this.direction.y <= 0) ||
                      (ball.position.y > this.y && this.direction.y >= 0);
        }

        if (aligned && inFront) {
            // Check if a platform is blocking the wind
            if (!this.isPlatformBlocking(ball, platforms)) {
                // The force vector is direction
                let force = this.direction.copy();
                ball.applyForce(force);
            }
        }

        // Maybe add a check for distance? Example:
        // let distance = dist(this.x, this.y, ball.position.x, ball.position.y);
        // let maxDistance = 150; // Only apply force if ball is within 150 pixels
        // if (distance < maxDistance) {
        //     let forceMagnitude = map(distance, 0, maxDistance, this.strength, 0); // Force decreases with distance
        //     let force = this.direction.copy();
        //     force.setMag(forceMagnitude);
        //     ball.applyForce(force);
        // }
    }
}