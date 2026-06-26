class WaterZone {
    constructor(x, y, w, h, dragCoefficient) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.dragCoefficient = dragCoefficient;
    }

    show() {
        fill(194, 240, 255, 160);
        rect(this.x, this.y, this.w, this.h);
    }

    contains(ball) {
        //+1 and -1to prevent rounding glitches
        return (
            ball.position.x-ball.r >= this.x-1 &&
            ball.position.x+ball.r <= this.x + this.w +1 &&
            ball.position.y + ball.r >= this.y-1&& ball.position.y-ball.r<=this.y+this.h+1
        );
    }

    applyDrag(ball) {
        let speed = ball.velocity.mag();
        let drag = ball.velocity.copy();
        drag.normalize();
        drag.mult(-this.dragCoefficient * speed * speed);
        ball.applyForce(drag);
    }
} 