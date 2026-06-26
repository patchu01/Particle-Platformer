class GravZone {
    constructor(x, y, w, h, gravMult) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.gravMult=gravMult;
    }

    show() {
        if(this.gravMult>1){
          fill(252, 96, 237,99)
        }
      else if(this.gravMult<1){
        fill(55, 74, 250,99);
      }
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
} 