class Btn{
  constructor(x,y,type,id){
    this.id=id
    this.x=x
    this.y=y
    this.type=type
    if(this.id<4){
      this.w=Math.min(width * 0.3, 400)
      this.h=Math.min(height * 0.07, 80)
    }
    else if(this.id<8){
      if(mobile){
        this.w=Math.min(width/8,height/8,160)
        this.h=this.w
      }
      else{
        this.w=Math.min(width/16,height/16,80)
        this.h=this.w
      }
    }
    this.cornerRound=1
    if(this.id==0){
      this.txt='Play'
      this.col=color(86, 167, 134)
      this.sWeight=1.5
}
    else if(this.id==1){
      this.txt='Editor'
      this.col=color(254, 95, 85)
      this.sWeight=1.5
    }
    else if(this.id==2){
      this.txt='Help'
      this.col=color(0, 156, 253)
      this.sWeight=1.5
    }
    else if(this.id==3){
      this.txt='Account'
      this.col=color(253, 162, 0)
      this.sWeight=1.5
    }
    else if(this.id==8){
      this.txt='Campaign'
      this.col=color(0,0,0,99)
    }
    else if(this.id==9){
      this.txt='Community levels'
      this.col=color(0,0,0,99)
    }
    else if(this.id==10){
      this.txt='Your levels'
      this.col=color(0,0,0,99)
    }
    else if(this.id>3&&this.id<8){
      this.txt=""
      this.col=color(0,0,0,99)
      this.sWeight=3
    }
  }
  clickCheck(){
    if(mouseX<this.x+this.w/2&&mouseX>this.x-this.w/2&&mouseY<this.y+this.h/2&&mouseY>this.y-this.h/2){
      if(mouseIsPressed){
         return(true) 
      }
      else{
        return(false)
      }
      if(this.id<4){
        this.updateHover(true)
      }
    }
    else{
      return(false)
      if(this.id<4){
        this.updateHover(false)
      }
    }
  }
  show(){
    if(this.type=='rectCenter'){
      push()
      rectMode(CENTER)
      if(this.id<4){
        strokeWeight(0)
        textSize(20)
        fill(this.col)
        textAlign(CENTER,CENTER)
        //draw text inside the btn
        text(this.txt,this.x,this.y-3)
        stroke(this.col)
        noFill()
        strokeWeight(this.sWeight)
        rect(this.x,this.y,this.w,this.h,12)
      }
      else{
        fill(this.col)
        stroke(255)
      }
      if(this.id>3&&this.id<8){
        //show timer for inputs on buttons
        let percentageTimer=0
        if(this.id==5){
          percentageTimer=(ball.timer-ball.rRef)/ball.timerDiff
        }
        else if(this.id==4){
          percentageTimer=(ball.timer-ball.lRef)/ball.timerDiff
        }
        else if(this.id==6){
          percentageTimer=(ball.timer-ball.uRef)/ball.timerDiff
        }
        else if(this.id==7){
          percentageTimer=(ball.timer-ball.dRef)/ball.timerDiff
        }
        strokeWeight(0)
        if((this.id==4&&ball.lNum>0)||(this.id==5&&ball.rNum>0)|| (this.id==6&&ball.uNum>0)||(this.id==7&&ball.dNum>0)){
        if(percentageTimer>1){
          percentageTimer=1
        }
        rect(this.x,this.y+this.h*((1-percentageTimer)/2),this.w,this.h*percentageTimer)
          noFill()
      strokeWeight(this.sWeight)
        rect(this.x,this.y,this.w,this.h)
        }
      }
      pop()
    }
  }
}