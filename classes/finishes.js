class Finish{
  constructor(x,y,w,h){
    this.x=x
    this.y=y
    this.w=w
    this.h=h
  }
  checkFin(){
    if(ball.position.x>this.x-ball.r&&ball.position.x<this.x+this.w+ball.r&&ball.position.y>this.y-ball.r&&ball.position.y<this.y+this.h+ball.r){
      //check that all cp's are collected b4 allowing finish
      if (timer.isRunning()&&cpsCollected==checkpoints.length) {
            timer.stop();
            let finalTime = timer.getElapsedTime();
            // Test-play runs from the level editor never touch best-time/
            // top-5/splits storage — they're throwaway runs used only to
            // feel out the level, per the editor's Test button.
            if (!isTestPlay) {
                // Save best time to local storage — keyed by the level's
                // own data (a hash of it), not the numeric/array level ID.
                let levelData = levels[activeLevelId].data;
                let isNewPB = saveBestTime(levelData, finalTime);
                // Addon: also record this run on the level-select screen's
                // Top 5 board (keeps its own separate small history per level)
                // and push it to the global Supabase leaderboard.
                if (typeof levelSelect !== 'undefined' && levelSelect) {
                    levelSelect.submitTime(levelData, finalTime);
                }
                // Save checkpoint splits
                let checkpointTimes = timer.getCheckpointTimes();
                saveCheckpointSplits(levelData, checkpointTimes, isNewPB);
            }
            // Set finish state
            state = 4;
        }
    }
  }
  show(){
    // Draw the finish
    fill("firebrick");
    rect(this.x,this.y,this.w,this.h); 
  }
}