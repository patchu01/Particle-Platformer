class Checkpoint{
  constructor(x,y,w,h){
    this.x=x
    this.y=y
    this.w=w
    this.h=h
    this.id=checkpoints.length+1
    this.cpCollected=false
    this.timeCollected=0; // Level when this checkpoint was collected
  }
  show(){
    fill('yellow')
    rect(this.x,this.y,this.w,this.h)
  }
  checkCp(){
    if(ball.position.x>this.x-ball.r&&ball.position.x<this.x+this.w+ball.r&&ball.position.y>this.y-ball.r&&ball.position.y<this.y+this.h+ball.r&&this.cpCollected==false){
      this.cpCollected=true
      this.timeCollected = timer.getElapsedTime(); // Record the time
      timer.recordCheckpointTime(); // Level in timer
      cpsCollected++
      recentCp=this.id
      
      // Create checkpoint popup with split difference
      let checkpointIndex = this.id - 1; // 0-indexed
      let currentTime = this.timeCollected;
      let difference = null;
      
      // Check if there's a best split to compare against
      let bestSplits = previousBestSplits ? previousBestSplits : getBestCheckpointSplits(levels[activeLevelId].data);
      if (bestSplits && checkpointIndex < bestSplits.length) {
        difference = currentTime - bestSplits[checkpointIndex];
      }
      
      createCheckpointPopup(this.id, difference);
    }
  }
}