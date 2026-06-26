class Sign {
  constructor(x, y, w, h, rotation = 0) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.rotation = rotation; // degrees
  }

  // Signs are visual only — no collision or game effects
  show() {
    const normalizedRot = ((this.rotation % 180) + 180) % 180;
    let displayW = this.w;
    let displayH = this.h;
    if (normalizedRot === 90) {
      [displayW, displayH] = [this.h, this.w];
    }

    push();
    translate(this.x + this.w / 2, this.y + this.h / 2);
    // Invert rotation to match editor/type ordering (positive types map clockwise)
    rotate(this.rotation);
    rectMode(CENTER);
    noStroke();
    fill(220);
    rect(0, 0, Math.max(6, displayW * 0.28), Math.max(6, displayH * 0.18), 4);
    fill(180);
    triangle(displayW * 0.22, 0, -displayW * 0.02, -displayH * 0.22, -displayW * 0.02, displayH * 0.22);
    pop();
  }
}

