let ball;
let gameFont
let levels=[]
// Active parallax background instance (SnowBackground, ForestBackground, IceBackground, VolcanoBackground, SpaceBackground, or null)
let activeBackground = null;
let platforms = [];
let waterZones = [];
let finishes=[]
let checkpoints=[]
let signs = []
let gravZones=[]
let bouncePads=[]
let particles=[]
let circlePlatforms = []; // Circular platforms with particle-like collision
let powerUps = []; // Power-ups that refresh depleted directional inputs
let movingPlatforms = []; // Honey-surface platforms that travel along a path
let gravity
let timer;
let fans = []; // Array to hold fan objects
let mobile=false
let state=0
let startPos;
let btns=[]//array to hold btns
//allow program to check what level the player is currently playing
//NOTE: activeLevelId is still used as the in-memory key into the levels[]
//object so the right Level instance can be looked up for rendering/physics
//(levels[activeLevelId].w/.h/.data etc). It is NOT used anymore to identify
//a level for anything that gets *saved* (best times, top-5 boards, splits,
//Supabase) — see hashLevelData()/levelKeyFor() below, which derive a stable
//identity straight from a level's data string instead. That means saved
//progress/leaderboards survive the built-in levels[] array being
//reordered or having levels inserted, and custom (editor-made) levels and
//campaign levels share one identity scheme.
let activeLevelId=0

// ── Level identity (data-based, not ID-based) ─────────────────────────────
/**
 * Deterministic, fast, non-cryptographic hash (32-bit FNV-1a) of a level's
 * raw data string. Two levels with identical data always hash identically,
 * and the result is short enough to use as a localStorage key suffix or a
 * Supabase primary key — this is the "level key" used everywhere progress
 * used to be saved under a numeric/array level ID.
 */
function hashLevelData(levelData) {
  const str = String(levelData == null ? '' : levelData);
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV-1a 32-bit prime
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * The canonical "level key" derived from level DATA (not an ID). Every
 * function in this project that used to take a levelId for saving/loading
 * progress now takes the level's data string directly and calls this
 * internally to get a storage-safe key.
 */
function levelKeyFor(levelData) {
  return 'lvl_' + hashLevelData(levelData);
}
let cpsCollected=0
//to respawn
let recentCp=0
//allow for levels bigger than screen dimensions, camera focuses on center of screen (on ball)
let cameraLocation,textPos;
//level previous best time for current run (before new PB is saved)
let previousBestTime=null;
//level previous best checkpoint splits for current run (before new PB is saved)
let previousBestSplits=null;
//checkpoint collection popup system
let cpPopup = null; // {checkpointNumber, difference, startTime}
// ── Level select screen addon ────────────────────────────────────────────
let levelSelect; // LevelSelectScreen instance, created in setup()
let wasMousePressedLastFrame = false; // click edge-detection for state 5 / account editor

// ── Level editor addon ────────────────────────────────────────────────────
let editor; // Editor instance, created in setup()

// ── Supabase login/account-creation menu addon ─────────────────────────────
let authMenu; // AuthMenu instance, created in setup()
// When test-playing a level from the editor (state 7), remembers where to
// return to (and with what data) once the player exits/finishes/dies.
let testPlayReturn = null;

function preload(){
  //load the main font
  gameFont= loadFont('https://cdn.jsdelivr.net/fontsource/fonts/elms-sans@latest/latin-600-normal.ttf')
}
function setup() {
    createCanvas(1440, 700);
  // ── Level editor addon ───────────────────────────────────────────────
  // The editor uses right-click-drag to pan the canvas (see Editor.js'
  // startPan()/mousePressed() in sketch-1.js) — without suppressing the
  // browser's own context menu here, right-clicking would pop that menu
  // open instead of starting the pan. contextMenu isn't an actual p5.js
  // event hook (despite looking like it should be), so this needs the
  // real DOM listener instead.
  let canvasElt = document.querySelector('canvas');
  if (canvasElt) {
    canvasElt.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  //set camera location to center of screen
  cameraLocation=createVector(width/2, height/2)
  //create textPos for menu fade in
  textPos=createVector(width/2,0)
  //set font
  textFont(gameFont)
  //set startPos outside the level to cause the bounce in the menu
  startPos=createVector(width/16, height/12)
  let agent = window.navigator.userAgent;
  if (
    agent.match(/Android/i) ||
    agent.match(/iPhone/i) ||
    agent.match(/iPad/i)
  ) {
    mobile = true
  }
    //create btns: x,y,type,id 
    btns.push(new Btn(width/2,height*0.37, 'rectCenter',btns.length))
    btns.push(new Btn(width/2,height*0.52, 'rectCenter',btns.length))
    btns.push(new Btn(width/2,height*0.67, 'rectCenter',btns.length))
    btns.push(new Btn(width/2,height*0.82, 'rectCenter',btns.length))
  if(mobile){
    btns.push(new Btn(width/6-Math.min(width/8,height/8,160),height*0.7, 'rectCenter',btns.length))
    btns.push(new Btn(width/6+Math.min(width/8,height/8,160),height*0.7, 'rectCenter',btns.length))
    btns.push(new Btn(width/6*5,height*0.7-Math.min(width/8,height/8,160), 'rectCenter',btns.length))
    btns.push(new Btn(width/6*5,height*0.7+Math.min(width/8,height/8,160),'rectCenter',btns.length))
  }
  else{
    btns.push(new Btn(width/6*5-Math.min(width/16,height/16,80),height*0.2, 'rectCenter',btns.length))
    btns.push(new Btn(width/6*5+Math.min(width/16,height/16,80),height*0.2, 'rectCenter',btns.length))
    btns.push(new Btn(width/6*5,height*0.2-Math.min(width/16,height/16,80), 'rectCenter',btns.length))
    btns.push(new Btn(width/6*5,height*0.2,'rectCenter',btns.length))
  }    
    // Create timer
    timer = new Timer();
    timer.start();
  //spawn ball at startPos
  ball = new Ball(startPos.x,startPos.y,height/40);
  ball.applyForce(createVector(10,10))
  populateLevels()
  // Level select screen addon — instantiated after populateLevels() so it
  // can immediately resolve real level data (background themes, etc).
  levelSelect = new LevelSelectScreen();
  //create lvl for menu
  let idParts=levels[activeLevelId].data.split(' ')
  loadLevelData(idParts)
  // Render and cache a real first-frame snapshot of every level the level
  // select screen can open, now that the menu's own baseline state (the
  // arrays/camera/ball it actually needs to keep) is fully established.
  levelSelect.generateThumbnails()

  // ── Level editor addon ───────────────────────────────────────────────
  editor = new Editor();

  // ── Supabase login/account-creation menu addon ─────────────────────────
  authMenu = new AuthMenu();
  initSupabase();
}

//add levels to levels class
function populateLevels(){
  //menu lvl
 levels.push(new Level(levels.length,'000z15 130z20z20z0.5','NIL','none'))
  //forest 01
  levels.push(new Level(levels.length,'000z76z1z1 100z77z27z1 0122z72z5z5 1327z59z0.5z19 100z71.5z24z0.5 1027z59z25z1 0249z55z3z4 4117z72z10z5z1.9686948853615536 1019z59z8z10z3 100z0z1z0.5 100z78z1z0.5 7518z65z3','NIL','forest'))
  //forest 02
  levels.push(new Level(levels.length,'0020z87z1z1 100z78z11z1 1019z88z9z0.5 1313z88z5z0.5 0319z89z1z1 1031z77z0.5z12 128z79z5z9z4 020z77z1z1 1019z79z9z0.5 0310z0z1z1 6028z88z3z1z1zp0z0z50 6128z79zp0z1','NIL','forest'))
  //forest 03
  levels.push(new Level(levels.length,'0046z75z1z1 4145z65z8z11z5 1045z76z8z0.5 1354z70z7z0.5 1364z52z0.5z13 1045z64z8z1 4237z53z8z16z0 1045z65z0.5z11 1421z44z10z2z1 511z49z8z1z3 130.5z30z0.5z20 0345z77z1z1 032z0z1z1 131z21z12z1 0267z87z12z5 119z49z13z1 011z22z12z1 109z31z10z1 0654z57z7z4 0420z24z10z4','NIL','forest'))
  //ice 04
  levels.push(new Level(levels.length,'0026z57z1z1 1325z58z13z0.5 1030z49z5z0.5 1030z39.5z5z0.5 1030z40z1z9 1034z40z1z9 0131z40z3z9 0230z38z5z2 0326z0z1z1 030z57z1z1 0355z57z1z1 0329z93z1z1 1024.5z33z0.5z25 1038z33z0.5z25 1025z33z13z1','NIL','ice'))
  //ice 05
  levels.push(new Level(levels.length,'0016z53z1z1 1013z46z8z0.5 1013z46z0.5z8 1013z54z9z0.5 4120z51z2z3z10 030z0z1z1 0313z55z1z1 2310z48z2 1324z42z1z12 1126z18z14z8z3 1334z15z6z11 1015z42z9z1 1025z42z3z1 4122z19z5z16z5 0123z36z3z6 0128z11z3z8 0218z43z3z3 1022z19z9z1 6019z13z3z1z4.965401785714285zp0z0z60 6119z31zp0z1','ChargeSwitch','ice'))
  //ice 06
  levels.push(new Level(levels.length,'007z17z1z1 117z18z8z0.5 119z14z6z4z3 130z3z0.5z16 1014z0z13z11z2 1324z15z10z0.5 011z3z1z16 2337z6.5z2.75 0234z20z2z2 1024z15z0.5z13 6015z14z5z1z4zp0z0z60 612z14zp0z1','NIL','ice'))
  //volcano 07
  levels.push(new Level(levels.length,'008z52z1z1 031z0z1z1 034z75z1z1 7523z56z7 428z20z8z24z0 1016z20z10z0.5 759z66z14 138z14z18z1 1027z14z9z1 1027z20z9z0.5 1326z20z1z0.5 0134z7z2z7 428z5z18z9z5 020z5z8z1 600z55z5z2z5.0222387566137545zp0z0z20 6112z55zp0z1 6112z48zp0z2 6031z13z3z1z4zp1z0z40 6129z13zp1z1','NIL','volcano'))
  //volcano 08
  levels.push(new Level(levels.length,'002z29z1z1 803z26z0z1 104z24z4z0.5 033z6z1z1 120z30z7z0.5 414z8z4z16z10 1018z0z0.5z10 0120z8z3z2 7515z41z5 7527z27z5 108z8z10z1 104z8z4z1 103z8z1z12 108z12z1z12 4213z9z12z23z4.974120082815737 0213z33z4z11 138z12z5z0.5 108z9z5z1 6013z12z5z1z4zp0z1z40 6113z26zp0z1 6121z26zp0z2 6121z12zp0z3 6113z12zp0z4','NIL','volcano'))
  //volcano 09
  levels.push(new Level(levels.length,'001z26z1z1 100z18z0.5z9 100z18z6z0.5 106.5z18z0.5z10 106z18z14z0.5 107z27z13z0.5 1032.5z18z0.5z9 1019z27z7z0.5 1019z18z7z0.5 100z27z9z0.5 1026z27z7z0.5 1026z18z7z0.5 2337z28.5z2.25 0234z0z5z7 605z27z6z1z4zp0z0z30 6119z27zp0z1','NIL','volcano'))
  //space 10
  levels.push(new Level(levels.length,'0235z33z4z5 0135z20z4z5 2430z20z5 140z38z40z0.5 1420z25z20z4z2 400z26z40z14z1 4140z0z20z40z0 420z0z20z40z0 5020z20z15z1z3 7010z20z4 7130z20z4','NIL','space'))
  //space 11
  levels.push(new Level(levels.length,'0010z53z1z1 106z54z9z0.5 8310z53z1z2 7314.5z54z2 1015z54z10z0.5 030z0z1z1 7419z51.5z6 0312z55z1z1 7027z47z5 1025z54z6z0.5 1031z46z7z0.5 8430z48z0z1 1031z46z0.5z9 8533z46z0z1 8235z46z0z1 1031z41z7z1 7337.5z44z3 0238z41z1z6','NIL','space'))
  //space 12
  levels.push(new Level(levels.length,'001z89z1z1 503z90z9z1z3 100z90z3z0.5 704z36z4 108z79z0.5z11 832z89z1z2 032z0z1z1 033z91z1z1 1014z37z11z1 0114z32z2z5 7124z32z4 1062z34z7z0.5 8215z36z1z3 0420z23z10z4 0267z28z2z6','NIL','space'))
  //space 13
  levels.push(new Level(levels.length,'101z96z8z0.5 715z89z4 033z14z1z1 101z80z8z0.5 034z97z1z1 108.5z80z0.5z16 702z66z4 108z65z11z0.5 7534.5z65z5 7530.5z44.5z6 135z47z7z8z4 104z38z11z0.5 015z31z3z7 8012.5z34.5z0z1 108.5z65z0.5z15 100z96z1z0.5 1012z55z6z7z2 4210z55z9z10z0 002z95z1z1 1034z0z0.5z6 1029.5z0z0.5z6 1030z0z4z0.5 0230z1z4z4 1329z26z7z9z3 7126z23z8 6019z65z5z1z4zp0z0z40 6130z65zp0z1 6130z50zp0z2 6120z50zp0z3 6014z33z3z1z4.027591765873014zp1z0z30 6122z33zp1z1','ChargeSwitch','space'))
}

// ── Moving platform path staging ─────────────────────────────────────────────
// Moving platforms are described across multiple level elements (one "60"
// definition element plus several "61" waypoint elements that share a
// pathId), so they can't be built in a single decodeLevelId call the way
// every other piece can. Each element just stages its data here; once the
// whole level string has been decoded, finalizeMovingPlatforms() assembles
// the staged data into real MovingPlatform instances.
let pendingMovingPlatforms = {}; // pathId -> {w,h,speed,loop,pauseFrames}
let pendingWaypoints = {};       // pathId -> array of {order,x,y}

/**
 * Decode every element in a level's data string, then build any moving
 * platforms that were staged along the way. Use this instead of calling
 * decodeLevelId in a bare loop whenever a level is (re)loaded.
 */
function loadLevelData(idParts) {
  pendingMovingPlatforms = {};
  pendingWaypoints = {};
  for (let element of idParts) {
    //element arranged 2 digit id of block(first is large catergory, second is specific)+xGrid+z+yGrid+z+ extra stuff like width(grid space)+z+height+z or drag coeff
    //function in var + startUp cos makes sense
    decodeLevelId(element)
  }
  finalizeMovingPlatforms();
}

/**
 * Build MovingPlatform instances from the staged definitions/waypoints,
 * once an entire level's data string has been decoded.
 */
function finalizeMovingPlatforms() {
  for (let pathId in pendingMovingPlatforms) {
    let def = pendingMovingPlatforms[pathId];
    let wps = (pendingWaypoints[pathId] || []).slice().sort((a, b) => a.order - b.order);
    // Waypoints array always starts with the platform's own starting position,
    // followed by every staged waypoint in order.
    let waypoints = [{ x: def.x, y: def.y }, ...wps.map(w => ({ x: w.x, y: w.y }))];
    movingPlatforms.push(new MovingPlatform(def.w, def.h, def.speed, waypoints, def.loop, def.pauseFrames));
  }
}

function decodeLevelId(element){
  //one grid space is width/40,height/40
  //create var to identify the exact block
  let category=element.slice(0,1)
  let type=element.slice(1,2)
  //create array of number values(non-id) for simpler code
  let coords=element.slice(2,element.length).split('z')
  let x=Number(coords[0])*width/40
  let y=Number(coords[1])*height/40
  let w=Number(coords[2])*width/40
  let h=Number(coords[3])*height/40
  // Rotation: coords[4] * 90 degrees (1 = 90°, 2 = 180°, 3 = 270°, etc.)
  let rotation = coords[4] ? Number(coords[4]) * 90 : 0;
  
  //identify what element to create
  if(category=='1'){
    platforms.push(new Platform(x,y,w,h,Number(category+type),rotation))
  }
  else if(category=='2'){
    // Category 2 is for circular platforms
    // coords[2] is the radius (in grid spaces)
    let r = Number(coords[2])*width/40;
    circlePlatforms.push(new CirclePlatform(x,y,r,Number(category+type)))
  }
  else if(category=='3'){
    let fX=Number(coords[4])*0.1
    let fY=Number(coords[5])*0.1
    //change numbers to negative here to save space on online storage
    //types represent 8 cardinal directions starting with North(0) and ending with North-West(7)
    if(type==0||type==1||type==7){
      fY=fY*-1
    }
    if(type>4){
      fX=fX*-1
    }
    fans.push(new Fan(x,y,w,h,fX,fY))
  }
  else if(category=='4'){
    if(type=='0'){
      let drag=Number(coords[4])/400
      waterZones.push(new WaterZone(x,y,w,h,drag))
    }
    else if(type=='1'||type=='2'){
      //type 2 means increase gravity
      let gravMult=Number(coords[4])
      //prevent gravMult from being 0 set 
      if(gravMult==0){
        if(type=='2'){
          //make jumping nearly impossible
          gravMult=50
        }
        else{
          //make it 0 gravity
          gravMult=10
        }
      }
      //switch gravmult to change the increasing/decreasing gravity so that as gravMult (input) increases, the difference between it(output) and normal gravity increases
      gravMult = type=='2' ? 1+gravMult/10 : 1-(gravMult)/10;
      gravZones.push(new GravZone(x,y,w,h,gravMult))
    }
  }
  else if(category=='5'){
    let strength=Number(coords[4])+1
    //in this case, the type denotes the surface of the bouncepad
    //coords[5] (optional, defaults to 0) is rotation*90 degrees, same
    //encoding as platforms' rotation field — 0=up,1=right,2=down,3=left
    let padRotation = coords[5] ? Number(coords[5])*90 : 0;
    bouncePads.push(new BouncePad(x,y,w,h,type,strength,padRotation))
 }
  else if(category=='6'){
    //moving platforms: described across multiple elements that share a pathId,
    //assembled into a MovingPlatform by finalizeMovingPlatforms() once the whole
    //level string has been decoded (see staging note above decodeLevelId)
    if(type=='0'){
      //platform definition: xGrid z yGrid z wGrid z hGrid z speed z pathId z loopFlag(optional,0/1) z pauseFrames(optional)
      //x,y = starting position, w,h = size (already computed above)
      let speed=Number(coords[4])*width/400
      let pathId=coords[5]
      let loop=coords[6]?Number(coords[6])==1:false
      let pauseFrames=coords[7]?Number(coords[7]):0
      pendingMovingPlatforms[pathId]={x,y,w,h,speed,loop,pauseFrames}
    }
    else if(type=='1'){
      //waypoint: xGrid z yGrid z pathId z order
      //x,y = waypoint position (already computed above)
      let pathId=coords[2]
      let order=Number(coords[3])
      if(!pendingWaypoints[pathId]){
        pendingWaypoints[pathId]=[]
      }
      pendingWaypoints[pathId].push({order,x,y})
    }
 }
  else if(category=='7'){
    // Particle: coords[0]=xGrid, coords[1]=yGrid, coords[2]=radiusGrid
    // Radius is scaled by height/40 so the circle remains round regardless
    // of the screen's aspect ratio.
    // type '0' = positive charge (blue), type '1' = negative charge (red)
    // type '2' = neutral attract (grey), type '3' = kill positive/blue (kills negative)
    // type '4' = kill negative/red (kills positive), type '5' = kill neutral (kills all)
    let r = Number(coords[2])/2*height/40;
    let particleType = 'positive';  // default
    
    if (type === '0') {
      particleType = 'positive';
    } else if (type === '1') {
      particleType = 'negative';
    } else if (type === '2') {
      particleType = 'neutral_attract';
    } else if (type === '3') {
      particleType = 'kill_positive';
    } else if (type === '4') {
      particleType = 'kill_negative';
    } else if (type === '5') {
      particleType = 'kill_neutral';
    }
    
    particles.push(new Particle(x, y, r, particleType))
  }
  else if(category=='8'){
    //powerUps here
    //coords[0]=xGrid, coords[1]=yGrid, coords[2]=mode, coords[3]=radiusGrid(optional, defaults to 0.75 grid spaces)
    //mode 0 = respawning (faint outline after pickup, comes back after 3s)
    //mode 1 = single-use (no outline after pickup, never comes back)
    let puMode=coords[2]?Number(coords[2]):0
    let puR=coords[3]?Number(coords[3])/2*width/40:0.75/2*width/40
    if(type=='0'){
      //refreshes all inputs(works if at least 1 is not ready)
      powerUps.push(new PowerUp(x,y,puR,'inputsRefresh',puMode))
    }
    else if(type=='1'){
      //refreshes most recently clicked input
      powerUps.push(new PowerUp(x,y,puR,'recentRefresh',puMode))
    }
    else if(type=='2'){
      powerUps.push(new PowerUp(x,y,puR,'chargePositive',puMode))
    }
    else if(type=='3'){
      powerUps.push(new PowerUp(x,y,puR,'chargeNegative',puMode))
    }
    else if(type=='4'){
      powerUps.push(new PowerUp(x,y,puR,'chargeNeutral',puMode))
    }
    else if(type=='5'){
      powerUps.push(new PowerUp(x,y,puR,'chargeToggle',puMode))
    }
  }
  else if(category=='0'){
    if(type=='0'){
      startPos.set(x,y)
    }
    else if(type=='1'){
      checkpoints.push(new Checkpoint(x,y,w,h))
  }
    else if(type=='2'){
      // regular finish with collision
      finishes.push(new Finish(x,y,w,h))
    }
    else if(type>='4' && type<='7'){
      // directional signage arrows (types 4..7) used for direction only
      const rotIndex = Number(type) - 4; // 0..3
      signs.push(new Sign(x, y, w, h, rotIndex * 90));
    }
  }
}

// ── Best Time Management Functions ───────────────────────────────────────────
/**
 * Save the best time for a level to local storage. The player's personal
 * best is still leveled exactly the same way as before (local, per-browser);
 * only WHICH key it's filed under has changed, from a numeric/array level
 * ID to a hash of the level's own data.
 */
function saveBestTime(levelData, time) {
  const key = `bestTime_${levelKeyFor(levelData)}`;
  const currentBest = localStorage.getItem(key);
  
  // Store the previous best time globally before updating
  previousBestTime = currentBest ? parseFloat(currentBest) : null;
  
  if (!currentBest || parseFloat(currentBest) > time) {
    localStorage.setItem(key, time.toFixed(2));
    console.log(`New best time for level ${levelKeyFor(levelData)}: ${time.toFixed(2)}s`);
    return true;
  }
  return false;
}

/**
 * Get the best time for a level from local storage
 * */
function getBestTime(levelData) {
  const key = `bestTime_${levelKeyFor(levelData)}`;
  const bestTime = localStorage.getItem(key);
  return bestTime ? parseFloat(bestTime) : null;
}

/**
 * Load best time into the timer when level starts
 */
function loadBestTimeToTimer(levelData) {
  const bestTime = getBestTime(levelData);
  if (bestTime !== null) {
    timer.setBestTime(bestTime);
  }
  // Reset previous best time and splits for the new run
  previousBestTime = null;
  previousBestSplits = null;
}

/**
 * Centers cameraLocation on the current level's spawn point (startPos),
 * clamped so the viewport never shows area outside [0, level.w] x
 * [0, level.h] — mirroring the same "center on spawn, but never past the
 * level's own edges" rule the Editor's centerOnSpawn()/_clampCameraAxis()
 * implement for the editing view. checkChangeCam()/checkEdges() in Ball.js
 * already enforce this same 0-to-level-bound assumption for camera *follow*
 * during play; this just makes the very first frame consistent with that
 * instead of using a fixed width/2,height/2 that only looks right by
 * coincidence when spawn happens to sit near the screen's center.
 * If the level is smaller than the viewport along an axis, centers on the
 * level's own midpoint along that axis instead of pinning to one edge.
 */
function centerCameraOnSpawn() {
  const lvl = levels[activeLevelId];
  if (!lvl) { cameraLocation.set(startPos.x, startPos.y); return; }

  function clampAxis(spawnPos, levelSize, viewportSize) {
    if (levelSize <= viewportSize) {
      return levelSize / 2;
    }
    const half = viewportSize / 2;
    return Math.max(half, Math.min(spawnPos, levelSize - half));
  }

  cameraLocation.set(
    clampAxis(startPos.x, lvl.w, width),
    clampAxis(startPos.y, lvl.h, height)
  );
}

function parallaxCamera(cam) {
  const offsetX = (typeof startPos !== 'undefined' && startPos) ? startPos.x : 0;
  const offsetY = (typeof startPos !== 'undefined' && startPos) ? startPos.y : 0;
  return { x: cam.x - offsetX, y: cam.y - offsetY };
}

/**
 * Reset the current level
 */
function resetLevel() {
  // Clear all game objects
  platforms = [];
  waterZones = [];
  finishes = [];
  signs = [];
  checkpoints = [];
  gravZones = [];
  bouncePads = [];
  particles = [];
  circlePlatforms = [];
  powerUps = [];
  movingPlatforms = [];
  // Reset checkpoint collection
  cpsCollected = 0;
  recentCp = 0;
  
  // Reset ball to start position
  ball = new Ball(startPos.x, startPos.y, height/40);
  applyLevelGimmicksToBall(ball);

  // Center the camera on spawn, clamped to the level's own bounds.
  centerCameraOnSpawn();

  // Reset timer to waiting mode
  timer.reset();
  timer.startWaiting();
  
  // Reload best time
  loadBestTimeToTimer(activeLevelId);
  
  // Reload level objects
  let idParts = levels[activeLevelId].data.split(' ');
  loadLevelData(idParts);
}

/**
 * Exit the current level and return to the main menu (state 0).
 * Mirrors resetLevel()'s cleanup so no platforms/hazards/etc. from the
 * level being left leak into the menu scene or the next level loaded —
 * the same arrays resetLevel() clears, plus activeBackground (the level
 * select screen's own slot click also sets this when entering a level,
 * so it has to be cleared symmetrically on the way out) and a reload of
 * the menu's own decorative level (id 0).
 */
function exitToMenu() {
  // Clear all game objects (same set resetLevel() clears, plus fans —
  // loadLevelData() only ever pushes into these arrays, never clears them,
  // so any fan from the level being left would otherwise still be sitting
  // in the array when the menu's own (fan-less) level loads back in)
  platforms = [];
  waterZones = [];
  finishes = [];
  signs = [];
  checkpoints = [];
  gravZones = [];
  bouncePads = [];
  particles = [];
  circlePlatforms = [];
  powerUps = [];
  movingPlatforms = [];
  fans = [];
  cpsCollected = 0;
  recentCp = 0;

  // Drop the level's parallax background — the menu has none
  activeBackground = null;

  // Stop the run timer entirely rather than leaving it waiting
  timer.reset();

  // Back to the menu's own tiny placeholder level
  activeLevelId = 0;
  let idParts = levels[activeLevelId].data.split(' ');
  loadLevelData(idParts);

  state = 0;
}

// ── Level editor: enter / exit / test-play ───────────────────────────────

// Persistent flag (unlike `state`, which moves to 3/4/5 during play) marking
// whether the current run is a throwaway test-play session launched from
// the editor's Test button — checked by finishes.js (skip best-time saves)
// and keyPressed()'s R/ESC handling (return to editor instead of menu).
let isTestPlay = false;

/**
 * Clears every gameplay array. Shared by resetLevel()/exitToMenu() above
 * and the editor entry points below, so there's one definition of "what
 * counts as level state" instead of three slightly different copies.
 */
function clearLevelArrays() {
  platforms = [];
  waterZones = [];
  finishes = [];
  signs = [];
  checkpoints = [];
  gravZones = [];
  bouncePads = [];
  particles = [];
  circlePlatforms = [];
  powerUps = [];
  movingPlatforms = [];
  fans = [];
}

/**
 * Opens the level editor (state 6) from the main menu. Starts on a blank
 * level — loading an existing custom level happens via the editor's own
 * Load button.
 */
function openEditor() {
  clearLevelArrays();
  activeBackground = null;
  timer.reset();
  editor.openBlank();
  state = 6;
}

/**
 * Leaves the editor and returns to the main menu, mirroring exitToMenu()'s
 * own cleanup so nothing the editor was previewing leaks into the menu.
 */
function exitEditorToMenu() {
  clearLevelArrays();
  cpsCollected = 0;
  recentCp = 0;
  activeBackground = null;
  platforms = [];
  waterZones = [];
  finishes = [];
  signs = [];
  checkpoints = [];
  gravZones = [];
  bouncePads = [];
  particles = [];
  circlePlatforms = [];
  powerUps = [];
  movingPlatforms = [];
  fans = [];
  cpsCollected = 0;
  recentCp = 0;

  // Drop the level's parallax background — the menu has none
  activeBackground = null;

  // Stop the run timer entirely rather than leaving it waiting
  timer.reset();

  // Back to the menu's own tiny placeholder level
  activeLevelId = 0;
  let idParts = levels[activeLevelId].data.split(' ');
  loadLevelData(idParts);

  playBallBounceInAnimation()

  state = 0;
}

/**
 * Builds a throwaway Level-shaped data string from the editor's current
 * objects and loads it into the live game arrays for test-play (state 7).
 * Test-play deliberately never touches bestTime/top5 storage —
 * finishes.js's normal save calls are skipped by checking state==7 there.
 */
function startTestPlay() {
  testPlayReturn = { camX: editor.camX, camY: editor.camY };
  isTestPlay = true;

  clearLevelArrays();
  const dataStr = editor.toDataString();
  const bg = editor.background;
  if (bg === 'snow') activeBackground = new SnowBackground();
  else if (bg === 'forest') activeBackground = new ForestBackground();
  else if (bg === 'ice') activeBackground = new IceBackground();
  else if (bg === 'volcano') activeBackground = new VolcanoBackground();
  else if (bg === 'space') activeBackground = new SpaceBackground();
  else activeBackground = null;

  cpsCollected = 0;
  recentCp = 0;
  activeLevelId = '__testplay__';
  // checkChangeCam() and similar gameplay code index into levels[activeLevelId]
  // for the level's pixel bounds — every campaign level has an entry there,
  // so a throwaway test-play level needs one too, or the camera-follow
  // logic crashes the instant it reads levels[activeLevelId].w/.h. Array
  // string-keys don't affect levels.length or numeric iteration elsewhere,
  // so this is safe to set without disturbing the campaign list.
  levels[activeLevelId] = new Level(activeLevelId, dataStr, editor.gimmick || 'NIL', bg);
  loadLevelData(dataStr.trim().length ? dataStr.split(' ') : []);

  // Guard against a level with no Start marker (e.g. the player deleted it)
  // leaving startPos pointing at whatever the last-loaded level set it to —
  // fall back to a safe default near the top-left of the grid instead.
  const hasStart = editor.objects.some(o => o.cat === '0' && o.type === '0');
  if (!hasStart) {
    startPos.set(2 * editor.gridSizeX, 30 * editor.gridSizeY);
  }

  ball = new Ball(startPos.x, startPos.y, height/40);
  applyLevelGimmicksToBall(ball);
  centerCameraOnSpawn();
  timer.reset();
  timer.startWaiting();
  state = 7;
}

function applyLevelGimmicksToBall(ball, lvl = levels[activeLevelId]) {
  if (!ball || !lvl) return;
  const gimmicks = (lvl.gimmick || 'NIL').split(' ').filter(Boolean).filter(g => g !== 'NIL');
  if (gimmicks.includes('InfiniteClicks')) {
    ball.lNum = ball.rNum = ball.uNum = ball.dNum = 100000;
  }
  ball.canSwitchCharge = gimmicks.includes('ChargeSwitch');
}

// Reset ball position and velocity to trigger bounce-in animation
function playBallBounceInAnimation() {
  if (ball) {
    ball = new Ball(startPos.x,startPos.y,height/40);
    ball.velocity.set(0, 0);
    ball.acceleration.set(0, 0);
    ball.applyForce(createVector(13.8, 10));
    timer.start()
  }
}

/**
 * Ends test-play and returns to the editor (state 6), restoring the
 * editor's own camera position exactly as the player left it.
 */
function endTestPlay() {
  clearLevelArrays();
  activeBackground = null;
  cpsCollected = 0;
  recentCp = 0;
  timer.reset();
  isTestPlay = false;
  if (testPlayReturn) {
    editor.camX = testPlayReturn.camX;
    editor.camY = testPlayReturn.camY;
    testPlayReturn = null;
  }
  state = 6;
}

/**
 * Respawn the ball at the most recently collected checkpoint
 * Positioned at center X and bottom Y of the checkpoint
 */
function respawnFromCheckpoint() {
  // Only respawn if a checkpoint has been collected
  if (recentCp <= 0) {
    console.log('No checkpoint collected yet');
    return false;
  }
  
  // Find the checkpoint with matching ID
  let targetCheckpoint = null;
  for (let cp of checkpoints) {
    if (cp.id === recentCp) {
      targetCheckpoint = cp;
      break;
    }
  }
  
  // If checkpoint not found, abort
  if (targetCheckpoint === null) {
    console.log('Checkpoint not found');
    return false;
  }
  
  // Position ball at center X and bottom Y of checkpoint
  ball.position.x = targetCheckpoint.x + targetCheckpoint.w / 2;
  ball.position.y = targetCheckpoint.y + targetCheckpoint.h-ball.r;
  
  // Reset velocities and accelerations
  ball.velocity.set(0, 0);
  ball.acceleration.set(0, 0);
  
  // Reset death state
  ball.isDead = false;

  // Restore all power-ups on checkpoint respawn, even single-use ones.
  for (const pu of powerUps) {
    pu.collected = false;
    pu.collectedAt = 0;
  }
  
  // Resume the timer (properly accounts for pause duration)
  timer.resume();
  
  console.log(`Respawned at checkpoint ${recentCp}`);
  return true;
}

/**
 * Save checkpoint splits to local storage
 */
function saveCheckpointSplits(levelData, checkpointTimes, isNewPB = false) {
  const key = `splits_${levelKeyFor(levelData)}`;
  
  // Only update checkpoint splits if this is a new overall personal best
  if (!isNewPB) {
    return;
  }
  
  // Store previous splits before updating
  const currentSplits = localStorage.getItem(key);
  previousBestSplits = currentSplits ? JSON.parse(currentSplits) : null;
  
  localStorage.setItem(key, JSON.stringify(checkpointTimes));
}

/**
 * Get best checkpoint splits for a level from local storage
 */
function getBestCheckpointSplits(levelData) {
  const key = `splits_${levelKeyFor(levelData)}`;
  const splits = localStorage.getItem(key);
  return splits ? JSON.parse(splits) : null;
}

/**
 * Get the time difference between current and best split times
 */
function getCheckpointDifferences(levelData, currentTimes) {
  const bestSplits = getBestCheckpointSplits(levelData);
  
  if (!bestSplits || bestSplits.length === 0) {
    return null; // No previous splits to compare
  }
  
  return currentTimes.map((time, index) => {
    if (index < bestSplits.length) {
      return time - bestSplits[index];
    }
    return 0;
  });
}
/**
 * Get overall time difference between current and best time
 */
function getOverallTimeDifference(levelData, currentTime) {
  const bestTime = getBestTime(levelData);
  if (bestTime === null) {
    return null;
  }
  return currentTime - bestTime;
}

/**
 * Get color based on time difference
 */
function getDifferenceColor(difference) {
  if (Math.abs(difference) < 0.01) {
    return [200, 200, 200]; // Grey - same
  } else if (difference > 0) {
    return [255, 100, 100]; // Red - slower
  } else {
    return [100, 255, 100]; // Green - faster
  }
}

/**
 * Create a checkpoint collection popup showing the split difference
 */
function createCheckpointPopup(checkpointNumber, difference) {
  cpPopup = {
    checkpointNumber: checkpointNumber,
    difference: difference,
    startTime: millis(),
    duration: 3000 // 3 seconds in milliseconds
  };
}
