class BouncePad {
    constructor(x, y, len, h, type, strength, rotation = 0) {
        this.x = x;
        this.y = y;
      //the y value of the bouncePad when it is unactivated
        this.neutralY=y
        this.len = len;
      //height
        this.h = h;
      //the height of the bouncePad when it is unactivated
      this.neutralH=h
      //the x value of the bouncePad when it is unactivated (used by the
      //left/right facing animation, mirroring neutralY/neutralH above)
      this.neutralX=x
      this.neutralLen=len
      this.type=type
      //change the yeet force of the pad
      this.strength=strength*5
      //see if bouncepad should be doing animation
      this.active=false
      //timer used to change height of the bouncepad
      this.timer=0
      //which way the pad launches the ball: 0=up, 90=right, 180=down, 270=left
      //(snapped to 90-degree increments, matching the editor's rotate control)
      this.rotation=((Math.round((rotation||0)/90)*90)%360+360)%360
      //unit vector pointing the way the pad fires the ball, derived from rotation
      if(this.rotation===90){this.dir=createVector(1,0)}
      else if(this.rotation===180){this.dir=createVector(0,1)}
      else if(this.rotation===270){this.dir=createVector(-1,0)}
      else{this.dir=createVector(0,-1)}
      if(this.type>9){
        this.col=color(9, 227, 85)
        this.bounce=this.type-10
      }
      else{
        this.bounce=0
      }
      if(this.type==0||this.type==10){
        this.col=color(200)
        this.frictionCoefficient = 0.05;
      }
      else if(this.type==11||this.type==1){
        this.col=color(5, 232, 224)
        this.frictionCoefficient = 0.005;
      }
      else if(this.type==12||this.type==2){
        this.col=color(232, 122, 5)
        this.frictionCoefficient = 0.1;
      }
}

    show() {
      if(this.active==true){
        this.timer++
        // The pad visually compresses along whichever axis it launches on
        // (vertical pads squash in height, horizontal pads squash in width),
        // then springs back out the same way the original up-only version did.
        let horizontal = this.rotation===90 || this.rotation===270;
        if(this.timer<21){
          //slight press down
          if(horizontal){this.len-=width/1600} else {this.h-=height/1600}
        }
        else if(this.timer<31){
          //push up
          if(horizontal){this.len+=width/400} else {this.h+=height/400}
        }
        else if(this.timer<51){
          //return to original position
          if(horizontal){this.len-=width/1600} else {this.h-=height/1600}
        }
        else{
          this.timer=0
          this.active=false
        }
        //update this.x/this.y here when bouncepad is going through animation to decrease lag
        if(this.rotation===180){
          // Down-facing pad: the launching edge is the top, so it's the
          // bottom edge (y+h) that stays fixed while h grows/shrinks.
          this.y=this.neutralY
        } else if(this.rotation===90){
          // Right-facing pad: launching edge is the left, so the right
          // edge (x+len) stays fixed while len grows/shrinks.
          this.x=this.neutralX+this.neutralLen-this.len
        } else if(this.rotation===270){
          // Left-facing pad: launching edge is the right, so the left
          // edge (x) stays fixed while len grows/shrinks.
          this.x=this.neutralX
        } else {
          this.y=this.neutralY+this.neutralH-this.h
        }
      }
        push()
        fill(this.col);
        rect(this.x,this.y,this.len, this.h);
        rectMode(CENTER)
        translate(this.x+this.len/2, this.y+this.h/2)
        rotate(this.rotation)
        fill(255)
        rect(0,this.h/8*1.75, this.h/8,this.h/8*3.5)
        triangle(-this.h/4,0,this.h/4,0,0,-this.h/32*15)
        pop()
    }

    // Despite the name (kept so existing call sites don't need to change),
    // this now checks whichever edge the pad actually faces, based on
    // this.rotation — top for an up-facing pad, right edge for a
    // right-facing pad, and so on.
    isBallOnTop(ball) {
      let onPad;
      if(this.rotation===90){
        // Right-facing: ball approaches from the right, moving left.
        onPad = ball.position.y > this.y &&
              ball.position.y < this.y + this.h &&
              ball.position.x - ball.r <= this.x + this.len &&
              ball.position.x >= this.x &&
              ball.velocity.x <= 0;
      } else if(this.rotation===180){
        // Down-facing: ball approaches from below, moving up.
        onPad = ball.position.x > this.x &&
              ball.position.x < this.x + this.len &&
              ball.position.y - ball.r <= this.y + this.h &&
              ball.position.y >= this.y &&
              ball.velocity.y <= 0;
      } else if(this.rotation===270){
        // Left-facing: ball approaches from the left, moving right.
        onPad = ball.position.y > this.y &&
              ball.position.y < this.y + this.h &&
              ball.position.x + ball.r >= this.x &&
              ball.position.x <= this.x + this.len &&
              ball.velocity.x >= 0;
      } else {
        // Up-facing (default/original behaviour).
        onPad = ball.position.x > this.x &&
              ball.position.x < this.x + this.len &&
              ball.position.y + ball.r >= this.y &&
              ball.position.y <= this.y + this.h &&
              ball.velocity.y >= 0;
      }
      if(onPad){
        this.active=true
        return(true)
      }
      else{
        return(false)
      }
    }

  
    applyForces(ball) {
        // Apply friction using the stored coefficient
        let friction = ball.velocity.copy();
        friction.normalize();
        friction.mult(-this.frictionCoefficient);
        ball.applyForce(friction);
      if(this.h==this.neutralH+width/20)
      //reset jumps for ball when it hits ground
      if(ball.lNum<1){
        ball.lNum=1
      }
      if(ball.rNum<1){
        ball.rNum=1
      }
      if(ball.uNum<1){
        ball.uNum=1
      }
      if(ball.dNum<1){
        ball.dNum=1
      }
      // This generalises the old "ball.velocity.y = ball.velocity.y*-1"
      // flip (and the bounce-strength damping applied just before it) to
      // whichever axis this pad actually launches along, while keeping
      // the same damping math on both velocity components.
      if (this.bounce!=0){
        ball.velocity.x-=ball.velocity.x/50*(10-this.bounce)
        ball.velocity.y-=ball.velocity.y/50*(10-this.bounce)
        let along = ball.velocity.dot(this.dir);
        ball.velocity.x -= 2*along*this.dir.x;
        ball.velocity.y -= 2*along*this.dir.y;
      }
      else{
        // Zero out motion into the pad, same as the original "ball.velocity.y=0".
        let along = ball.velocity.dot(this.dir);
        ball.velocity.x -= along*this.dir.x;
        ball.velocity.y -= along*this.dir.y;
      }
        // Snap to the pad's launching edge and stop motion into it
        if(this.rotation===90){ ball.position.x = this.x+this.len+ball.r; }
        else if(this.rotation===180){ ball.position.y = this.y+this.h+ball.r; }
        else if(this.rotation===270){ ball.position.x = this.x-ball.r; }
        else { ball.position.y = this.y-ball.r; }
  if(this.timer>20&&this.timer<32){
    let yeet=p5.Vector.mult(this.dir, this.strength)
    ball.applyForce(yeet)
  }
}
} 