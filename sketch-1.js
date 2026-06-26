
function draw() {
    push()
    gravity = createVector(0, 0.2);

    // ── Level editor (addon) ───────────────────────────────────────────────
    // Handled as its own early branch — the editor draws its full UI itself
    // and isn't part of the normal world-space game rendering pipeline.
    if (state == 6) {
        editor.update();
        editor.show();

        if (mouseIsPressed && !wasMousePressedLastFrame) {
            editor.handleClick();
        }
        if (mouseIsPressed) {
            editor.handleDrag();
        }
        if (!mouseIsPressed && wasMousePressedLastFrame) {
            editor.handleRelease();
        }
        if (editor._requestExit) {
            editor._requestExit = false;
            playBallBounceInAnimation()
            exitEditorToMenu();
        }
        if (editor._requestTest) {
            editor._requestTest = false;
            startTestPlay();
        }

        wasMousePressedLastFrame = mouseIsPressed;
        pop();
        return;
    }
    
    // Check if ball is dead - if so, show death screen instead
    if (ball.isDead) {
        background(255);  // White background for death screen
        strokeWeight(0);

        // showDeathAnimation works entirely in screen-space using coordinates
        // captured at the moment of death — no translate needed here.
        ball.showDeathAnimation();

        // Show death message and controls
        drawDeathScreen();

        pop();
        return;  // Skip normal game rendering
    }
    
    background(255);
    strokeWeight(0)

    // ── Camera update ─────────────────────────────────────────────────────────
    // Must happen before the background draw so parallax levels the current
    // camera position, not last frame's.
    if (state == 3 || state == 4 || state == 7) {
        if (ball.checkChangeCam('x')) {
            cameraLocation.x = ball.position.x;
        }
        if (ball.checkChangeCam('y')) {
            cameraLocation.y = ball.position.y;
        }
    }

    // ── Parallax background (drawn before game translate so it sits behind all objects)
    if ((state == 3 || state == 4 || state == 7) && activeBackground) {
        const parallaxCam = parallaxCamera(cameraLocation);
        activeBackground.update(parallaxCam);
        activeBackground.draw(parallaxCam);
    }

    // the main menu state
    if (state == 0) {
        // draw main menu
        drawMainMenu()
        if (levelSelect.editingName) {
            levelSelect._drawAccountOverlay();
        }
    }
    // ── Level select screen (addon) ────────────────────────────────────────
    else if (state == 5) {
        background(0)
        levelSelect.update()
        levelSelect.show()

        // Delete-confirmation overlay takes input priority over everything
        // else on this screen while it's open — same reasoning as the
        // editingName branch just below it: a stray click shouldn't load a
        // level or change tabs underneath a still-open "are you sure?" box.
        if (levelSelect.confirmDeleteId !== null) {
            const confirmClicked = levelSelect.clickedDeleteConfirmButton()
            if (confirmClicked && !wasMousePressedLastFrame) {
                if (confirmClicked === 'confirm') levelSelect.confirmDelete()
                else levelSelect.cancelDeleteConfirm()
            }
        } else if (!levelSelect.editingName) {
            if (levelSelect.closeClicked() && !wasMousePressedLastFrame) {
                state = 0
                playBallBounceInAnimation()
            }

            // Category tab switch (Campaign / Custom)
            const clickedTab = levelSelect.clickedTab()
            if (clickedTab !== -1 && !wasMousePressedLastFrame) {
                levelSelect.category = levelSelect._layout().tabRects[clickedTab].key
                levelSelect.hoveredIndex = -1
                levelSelect.lastHoveredIndex = 0
            }

            // Delete (x) button on a custom-level row — opens the confirm
            // overlay rather than deleting immediately, since this is
            // permanent and can't be undone.
            const deleteId = levelSelect.clickedCustomDelete()
            if (deleteId && !wasMousePressedLastFrame) {
                levelSelect.openDeleteConfirm(deleteId)
            }

            // Prev/Next page buttons on the custom-level list, when there
            // are more custom levels than fit on one page. Gated by the
            // same press-edge check as every other button here — without
            // it, holding the mouse down would flip every page in one frame.
            const pageNavClicked = levelSelect.clickedCustomPageNav()
            if (pageNavClicked && !wasMousePressedLastFrame) {
                if (pageNavClicked === 'prev') levelSelect.customScrollOffset--
                else if (pageNavClicked === 'next') levelSelect.customScrollOffset++
                levelSelect.hoveredIndex = -1
                levelSelect.lastHoveredIndex = levelSelect.customScrollOffset * levelSelect.rows
            }

            const clicked = levelSelect.clickedSlot()
            if (clicked !== -1 && !wasMousePressedLastFrame && clickedTab === -1 && !deleteId && !pageNavClicked) {
                if (levelSelect.category === 'campaign') {
                    // Reuse the existing state==2 level-loading pipeline so the
                    // chosen slot's underlying level plays exactly like Play used
                    // to. Also reproduces state==2's platforms.pop() — it removes
                    // the single decorative platform the main-menu ball bounces on
                    // (pushed once in setup() via the menu's own loadLevelData
                    // call) so it doesn't linger underneath the chosen level.
                    platforms.pop()
                    activeLevelId = levelSelect._levelIdForSlot(clicked)
                    if (levels[activeLevelId].background === 'snow') {
                        activeBackground = new SnowBackground();
                    } else if (levels[activeLevelId].background === 'forest') {
                        activeBackground = new ForestBackground();
                    } else if (levels[activeLevelId].background === 'ice') {
                        activeBackground = new IceBackground();
                    } else if (levels[activeLevelId].background === 'volcano') {
                        activeBackground = new VolcanoBackground();
                    } else if (levels[activeLevelId].background === 'space') {
                        activeBackground = new SpaceBackground();
                    } else {
                        activeBackground = null;
                    }
                    let idParts = levels[activeLevelId].data.split(' ')
                    loadLevelData(idParts)
                    timer.startWaiting();
                    loadBestTimeToTimer(levels[activeLevelId].data);
                    ball = new Ball(startPos.x, startPos.y, height/40);
                    applyLevelGimmicksToBall(ball);
                    centerCameraOnSpawn();
                    state = 3
                } else {
                    // Custom level — load it the same way, but keyed by its
                    // string localStorage id rather than a numeric campaign
                    // index, so each custom level keeps its own best time/
                    // top5 history (getBestTime/saveBestTime/etc all just
                    // template activeLevelId into a storage key, so a string
                    // id works exactly the same as a numeric one).
                    const customList = levelSelect._customLevels()
                    const chosen = customList[clicked]
                    if (chosen) {
                        clearLevelArrays()
                        activeLevelId = chosen.id
                        // Same levels[activeLevelId] lookup that checkChangeCam() etc.
                        // depend on for every campaign level needs an entry for custom
                        // levels too — see the matching note in startTestPlay().
                        levels[activeLevelId] = new Level(activeLevelId, chosen.data, chosen.gimmick || 'NIL', chosen.background || 'none')
                        if (chosen.background === 'snow') activeBackground = new SnowBackground();
                        else if (chosen.background === 'forest') activeBackground = new ForestBackground();
                        else if (chosen.background === 'ice') activeBackground = new IceBackground();
                        else if (chosen.background === 'volcano') activeBackground = new VolcanoBackground();
                        else if (chosen.background === 'space') activeBackground = new SpaceBackground();
                        else activeBackground = null;
                        let idParts = chosen.data.trim().length ? chosen.data.split(' ') : []
                        loadLevelData(idParts)
                        timer.startWaiting();
                        loadBestTimeToTimer(chosen.data);
                        ball = new Ball(startPos.x, startPos.y, height/40);
                        applyLevelGimmicksToBall(ball);
                        centerCameraOnSpawn();
                        isTestPlay = false;
                        state = 3
                    }
                }
            }
        }
    }

    // the state where the game is played
    else if (state == 3 || state == 7) {
        translate(width / 2 - cameraLocation.x, height / 2 - cameraLocation.y)
        // call stuff to be shown only when the game is active
        doSmth()
    }
    // finish screen state
    else if (state == 4) {
        // Show finish screen in world coordinates first, then reset translation for HUD
        translate(width / 2 - cameraLocation.x, height / 2 - cameraLocation.y)
        doSmth()
    }
    // Only update and show the ball if the timer is running
    if (timer.isRunning()) {
        ball.applyForce(gravity);
        ball.checkEdges()
        ball.update();
    }
    // Show ball only while alive — skip on the death frame onwards
    // so the world-space show() never fights the screen-space death animation.
    // Also hidden specifically on the level select screen (state 5) per the
    // brief — the bounce-in animation is a main-menu thing; once the player
    // opens the level grid the ball shouldn't be visible bouncing behind it.
    // Hidden when authMenu is open to keep it from showing behind the menu.
    if (!ball.isDead && state != 5 && !authMenu.visible) {
        ball.show();
    }
    // advance input timer (prevents bugs)
    ball.timer = millis()
    pop()
    // Snowflakes drawn in screen-space AFTER pop() so they sit in front of
    // every game object and the HUD background, but behind the HUD text.
    if ((state == 3 || state == 4 || state == 7) && (activeBackground=='SnowBackground'||activeBackground=='ForestBackground')) {
        activeBackground.drawSnow();
    }
    // show hud where the camera location is not changed, in order to keep hud in the same place
    if (state == 3) {
        drawGameHud()
    }
    else if (state == 7) {
        drawTestPlayHud()
    }
    else if (state == 4) {
        drawFinishScreen()
    }

    // ── Click edge-detection (addon) ─────────────────────────────────────
    // mouseIsPressed stays true for every frame the button is held, but
    // state-changing clicks (opening the account editor, picking a level)
    // should only fire once per physical click. Leveled here, at the very
    // end of the frame, so every check above this line sees this frame's
    // value before it flips for next frame.
    wasMousePressedLastFrame = mouseIsPressed
}


function drawMainMenu() {
    // increment textPos for fade in animation
    if (textPos.y < height / 20) {
        textPos.y += height / 800
    }
    background(0)
    platforms.forEach((p) => {
        p.applyForces(ball)
    })
    for (let i = 3; i > -1; i--) btns[i].show()
    // draw the title text
    textSize(40)
    fill(255, 0, 0, textPos.y / (height / 20) * 250)
    textAlign(CENTER, CENTER)
    text('Particle', width / 2, height / 20 + textPos.y)
    fill(0, 0, 255, textPos.y / (height / 20) * 250)
    text('Platf   rmer', width / 2, height / 8 + textPos.y)
    // lock ball in place
    if (dist(ball.position.y, 0, height / 8 + textPos.y, 0) < 10 && ball.position.x > width / 4) {
        ball.position.y = height / 8 + textPos.y + 5
        ball.acceleration.mult(0, 0)
        ball.velocity.mult(0, 0)
        push()
        translate(ball.position.x - 30, ball.position.y + 30)
        angleMode(DEGREES)
        rotate(-45)
        stroke('grey')
        strokeWeight(1)
        line(-20, 0, 20, 0)
        line(-20, 10, 20, 10)
        line(-20, -10, 20, -10)
        pop()
    }
    // check whether a menu change is happening
    if (btns[0].clickCheck() && !wasMousePressedLastFrame && !authMenu.visible) {
        // Play now opens the level select screen rather than jumping
        // straight into a level — no ball is spawned here; that only
        // happens once a level is actually chosen from the grid.
        state = 5
    }

    // ── Editor button (id 1) — opens the level editor (addon) ─────────────
    if (btns[1].clickCheck() && !wasMousePressedLastFrame && !authMenu.visible) {
        openEditor()
    }

    // ── Account button (id 3) — opens the login/account menu ──────────────
    if (btns[3].clickCheck() && !wasMousePressedLastFrame && !authMenu.visible) {
        authMenu.open()
    }

    // ── Supabase login/account-creation menu (addon) ───────────────────────
    if (!levelSelect.editingName) {
        if (authMenu.clickedLoginButton() && !wasMousePressedLastFrame && !authMenu.visible) {
            authMenu.open()
        }
        if (authMenu.visible) {
            authMenu.draw()
            if (!wasMousePressedLastFrame) {
                if (authMenu.clickedClose()) {
                    authMenu.close()
                    playBallBounceInAnimation()
                } else if (authMenu.clickedLogout()) {
                    logoutPlayer()
                    authMenu.close()
                    playBallBounceInAnimation()
                } else {
                    const tab = authMenu.clickedTab()
                    if (tab) authMenu.setMode(tab)
                    const field = authMenu.clickedField()
                    if (field) authMenu.activeField = field
                    if (authMenu.clickedSubmit()) authMenu.submit()
                }
            }
        }
    }
}


// ── HUD ───────────────────────────────────────────────────────────────────────
function drawGameHud() {
    // draw input overlay buttons
    for (let i = 7; i > 3; i--) btns[i].show()

    // Show the timer (death screen is separate)
    timer.show();
    
    // Show best time with difference if it exists
    let bestTime = getBestTime(levels[activeLevelId].data);
    let currentTime = timer.getElapsedTime();
    if (bestTime !== null && timer.isRunning()) {
        let timeDiff = getOverallTimeDifference(levels[activeLevelId].data, currentTime);
        let [r, g, b] = getDifferenceColor(timeDiff);
        fill(r, g, b);
        textSize(14);
        textAlign(LEFT, TOP);
        let sign = timeDiff > 0 ? '+' : '';
        text(`Best: ${bestTime.toFixed(2)}s (${sign}${timeDiff.toFixed(2)}s)`, 10, 40);
    }

    // Gravity readout
    if (levels[activeLevelId] && levels[activeLevelId].background === 'space') {
        fill(255);
    } else {
        fill(0);
    }
    textSize(16);
    textAlign(LEFT, TOP);
    text('Gravity: ' + gravity.y, 10, 60);

    // ── Charge indicator ──────────────────────────────────────────────────
    // Coloured dot + label showing current ball charge, and toggle hint

  let tempText=''
  let chargeYOffset = 95;
  
  //change colours of circle and change sign inside circle
    if(ball.charge=='positive'){
      tempText='+';
      fill(color(30, 120, 255))
      //draw circle display for ball
      circle(22, chargeYOffset, 22);
    }
  
    else if(ball.charge=='negative'){
      tempText='-';
      fill(color(220, 50, 50))
      //draw circle display for ball
      circle(22, chargeYOffset, 22);
    }
  
    else{
      fill('grey')
      //draw circle display for ball
      circle(22, chargeYOffset, 22);
    }
    
    //draw sign inside circle 
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14);
    fill(255)
    text(tempText, 22, chargeYOffset)
  
    
    // Charge label
    textAlign(LEFT, CENTER)
    if(ball.charge=='positive'){
      fill(color(30, 120, 255))
      //write current charge of ball
      text('Positive', 38, chargeYOffset)
    }
  
    else if(ball.charge=='negative'){
      fill(color(220, 50, 50))
      //write current charge of ball
      text('Negative', 38, chargeYOffset)
    }
  
    else{
      fill('grey')
      //write current charge of ball
      text('Neutral', 38, chargeYOffset)
    }

        // Toggle hint (only show when player can switch charge)
        if (ball && ball.canSwitchCharge) {
            if (levels[activeLevelId] && levels[activeLevelId].background === 'space') {
                fill(255);
            } else {
                fill(120);
            }
            textSize(12);
            textAlign(LEFT, TOP);
            text('[K] switch charge', 10, chargeYOffset + 20);
        }
    
    // Respawn hint (only show if checkpoint collected)
    if (recentCp > 0) {
        text('[SPACE] respawn at checkpoint', 10, chargeYOffset + 35);
    }
    
    // Draw checkpoint collection popup
    drawCheckpointPopup();
}

// ── Test-play HUD (editor addon) ───────────────────────────────────────────
// A trimmed-down HUD for state 7 — same charge indicator and timer as real
// play, but no best-time/checkpoint-split comparisons (test runs don't keep
// any history) and a clear banner + reminder that ESC returns to the editor
// rather than the main menu.
function drawTestPlayHud() {
    timer.show();

    fill(0);
    textSize(16);
    textAlign(LEFT, TOP);
    text('Gravity: ' + gravity.y, 10, 40);

    let tempText = '';
    let chargeYOffset = 75;
    if (ball.charge == 'positive') {
        tempText = '+';
        fill(color(30, 120, 255));
        circle(22, chargeYOffset, 22);
    } else if (ball.charge == 'negative') {
        tempText = '-';
        fill(color(220, 50, 50));
        circle(22, chargeYOffset, 22);
    } else {
        fill('grey');
        circle(22, chargeYOffset, 22);
    }
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14);
    fill(255);
    text(tempText, 22, chargeYOffset);

    textAlign(LEFT, CENTER);
    if (ball.charge == 'positive') { fill(color(30, 120, 255)); text('Positive', 38, chargeYOffset); }
    else if (ball.charge == 'negative') { fill(color(220, 50, 50)); text('Negative', 38, chargeYOffset); }
    else { fill('grey'); text('Neutral', 38, chargeYOffset); }

        // Toggle hint (only show when player can switch charge)
        if (ball && ball.canSwitchCharge) {
            if (levels[activeLevelId] && levels[activeLevelId].background === 'space') {
                fill(255);
            } else {
                fill(120);
            }
            textSize(12);
            textAlign(LEFT, TOP);
            text('[K] switch charge', 10, chargeYOffset + 20);
        }
    if (recentCp > 0) {
        text('[SPACE] respawn at checkpoint', 10, chargeYOffset + 35);
    }

    // ── Test-mode banner ───────────────────────────────────────────────────
    push();
    fill(253, 162, 0);
    textAlign(CENTER, TOP);
    textSize(18);
    textStyle(BOLD);
    text('TEST MODE — times are not saved', width / 2, 12);
    fill(220);
    textSize(13);
    textStyle(NORMAL);
    text('[R] Restart Level     [ESC] Back to Editor', width / 2, 36);
    pop();

    drawCheckpointPopup();
}


// ── Checkpoint Popup ──────────────────────────────────────────────────────────
function drawCheckpointPopup() {
    if (!cpPopup) return;
    
    let elapsedTime = millis() - cpPopup.startTime;
    
    // If popup duration has passed, clear it
    if (elapsedTime > cpPopup.duration) {
        cpPopup = null;
        return;
    }
    
    // Calculate fade effect (0 to 1 and back to 0)
    let progress = elapsedTime / cpPopup.duration;
    let alpha;
    
    // Fade in first 20%, stay visible, fade out last 30%
    if (progress < 0.2) {
        alpha = map(progress, 0, 0.2, 0, 255);
    } else if (progress > 0.7) {
        alpha = map(progress, 0.7, 1, 255, 0);
    } else {
        alpha = 255;
    }
    
    // Draw popup at center top of screen
    push();
    let popupX = width / 2;
    let popupY = 80;
    
    // Draw semi-transparent background box
    fill(0, 0, 0, alpha * 0.7);
    rect(popupX - 100, popupY - 25, 200, 50);
    
    // Draw text with color based on difference
    textAlign(CENTER, CENTER);
    textSize(18);
    textStyle(BOLD);
    
    let displayText = `CP${cpPopup.checkpointNumber}`;
    
    if (cpPopup.difference !== null) {
        let [r, g, b] = getDifferenceColor(cpPopup.difference);
        fill(r, g, b, alpha);
        let sign = cpPopup.difference > 0 ? '+' : '';
        displayText += `: ${sign}${cpPopup.difference.toFixed(2)}s`;
    } else {
        fill(200, 200, 200, alpha);
        displayText += `: First run`;
    }
    
    text(displayText, popupX, popupY);
    
    pop();
}

// ── Finish Screen ─────────────────────────────────────────────────────────────
function drawFinishScreen() {
    // Darken the background to show finish screen overlay
    fill(0, 0, 0, 200);
    rect(0, 0, width, height);
    
    // Display finish text
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(48);
    textStyle(BOLD);
    text(isTestPlay ? 'TRACK COMPLETE!' : 'LEVEL COMPLETE!', width / 2, height / 2 - 80);
    
    // Display time
    let finalTime = timer.getElapsedTime();
    textSize(32);
    text(`Time: ${finalTime.toFixed(2)}s`, width / 2, height / 2);

    // Test-play runs never touch best-time/top-5/splits storage, so the
    // comparison UI below is skipped entirely — there's nothing real to
    // compare against, and showing stale numbers from a different level's
    if (isTestPlay) {
        fill(253, 162, 0);
        textSize(16);
        textStyle(NORMAL);
        text('Time not saved in test play', width / 2, height / 2 + 50);

        fill(200);
        textSize(16);
        text('[R] Restart Level     [ESC] Back to Editor', width / 2, height / 2 + 220);
        return;
    }
    
    // Display best time if it exists
    let bestTime = getBestTime(levels[activeLevelId].data);
    if (bestTime !== null) {
        textSize(24);
        fill(255, 200, 0);
        // Compare rounded values to avoid floating point precision issues
        if (bestTime.toFixed(2) === finalTime.toFixed(2)) {
            text('NEW PERSONAL BEST!', width / 2, height / 2 + 60);
        } else {
            text(`Best Time: ${bestTime.toFixed(2)}s`, width / 2, height / 2 + 60);
        }
    }
    
    // Display checkpoint splits with color-coded differences
    let checkpointTimes = timer.getCheckpointTimes();
    let comparisonSplits = previousBestSplits ? previousBestSplits : getBestCheckpointSplits(levels[activeLevelId].data);
    
    if (checkpointTimes && checkpointTimes.length > 0) {
        textSize(14);
        textStyle(NORMAL);
        let yOffset = height / 2 + 110;
        
        for (let i = 0; i < checkpointTimes.length; i++) {
            let cpTime = checkpointTimes[i];
            let diff = null;
            
            // Calculate difference using previous best splits if available, otherwise use current best splits
            if (comparisonSplits && i < comparisonSplits.length) {
                diff = cpTime - comparisonSplits[i];
            }
            
            // Determine color based on difference
            if (diff === null) {
                fill(200, 200, 200); // Grey - no previous split
                text(`CP${i + 1}: ${cpTime.toFixed(2)}s`, width / 2, yOffset);
            } else {
                let [r, g, b] = getDifferenceColor(diff);
                fill(r, g, b);
                let sign = diff > 0 ? '+' : '';
                text(`CP${i + 1}: ${cpTime.toFixed(2)}s (${sign}${diff.toFixed(2)}s)`, width / 2, yOffset);
            }
            yOffset += 20;
        }
    }
    
    // Display overall time difference
    if (previousBestTime !== null) {
        // Use previous best time for comparison (in case this is a new PB)
        let timeDiff = finalTime - previousBestTime;
        let [r, g, b] = getDifferenceColor(timeDiff);
        fill(r, g, b);
        textSize(14);
        textStyle(NORMAL);
        let sign = timeDiff > 0 ? '+' : '';
        let cpYOffset = (checkpointTimes && checkpointTimes.length > 0) ? height / 2 + 110 + (checkpointTimes.length * 20) : height / 2 + 110;
        text(`Overall Difference: ${sign}${timeDiff.toFixed(2)}s`, width / 2, cpYOffset + 20);
    }
    
    // Display hints
    fill(200);
    textSize(16);
    textStyle(NORMAL);
    text('[R] Restart Level     [ESC] Exit to Menu', width / 2, height / 2 + 220);
}

// ── Death Screen ──────────────────────────────────────────────────────────────
function drawDeathScreen() {
    // UI (death msg + keybind hints) is drawn inside
    // ball.showDeathAnimation() so nothing extra is needed here.
}

// ── Right-click-drag panning in the editor (addon) ──────────────────────────
// p5's own mousePressed(event) callback is the only place mouseButton is
// reliably available, so this is the one spot in the project that uses a
// p5 event callback instead of the draw()-loop mouseIsPressed polling
// pattern everything else here follows — needed specifically to tell a
// right-click apart from a left-click.
function mousePressed() {
    if (state == 6 && editor && editor.layout && mouseButton === RIGHT && editor._mouseInCanvas()) {
        editor.startPan();
    }
}

// ── Palette scrolling via mouse wheel (addon) ────────────────────────────────
// Surfaces alone has 15 items now (5 rect + 5 triangle + 5 circle), more
// than fit in the visible palette area, so wheel-scrolling is the fast path
// alongside the small up/down arrow buttons drawn over the panel.
function mouseWheel(event) {
    if (state == 6 && editor && editor.layout) {
        const L = editor.layout;
        if (mouseX < L.paletteW && mouseY >= L.paletteGridY) {
            const dir = event.delta > 0 ? 1 : -1;
            editor.paletteScrollRow = Math.max(0, editor.paletteScrollRow + dir);
            return false; // prevent the page itself from scrolling
        }
    }
}

// ── Key press handler ─────────────────────────────────────────────────────────
function keyPressed() {
    // ── Supabase login/account-creation menu (addon) — swallow every key
    // while it's open, same reasoning as the username editor below.
    if (authMenu && authMenu.visible) {
        authMenu.handleKey(key, keyCode);
        return;
    }

    // ── Username editor (addon) — swallow every key while it's open so
    // typing a name never also triggers the game's own shortcuts (k/r/space)
    if (levelSelect && levelSelect.editingName) {
        levelSelect.handleNameKey(key, keyCode);
        return;
    }

    // ── Delete-level confirmation overlay (addon) — Escape cancels it,
    // same as clicking Cancel; every other key is swallowed so it can't
    // also trigger a game shortcut underneath the still-open overlay.
    if (levelSelect && levelSelect.confirmDeleteId !== null) {
        if (keyCode === ESCAPE) levelSelect.cancelDeleteConfirm();
        return;
    }

    // ── Level editor name/background popup — swallow keys the same way ────
    if (state == 6 && editor && editor.activePopup && editor.activePopup.type === 'name') {
        editor.handleNameKey(key, keyCode);
        return;
    }
    // Other editor shortcuts (delete selected object, rotate, escape out of
    // a popup or armed palette tool) while the editor canvas has focus.
    if (state == 6 && editor) {
        editor.handleKey(keyCode);
        return;
    }

    if(state==3 || state==7){
        // Start the timer on first input
        if (!timer.isRunning() && !timer.hasTimerStarted()) {
            timer.start();
        }
    }
  //ensure game is being played
    // K  →  toggle ball charge between positive (blue) and negative (red)
  //place this here to prevent repeated switching in 1 click
    if ((key =='k'||key=='K') && (state==3||state==7)) {
        if (ball && ball.canSwitchCharge) {
            ball.charge = (ball.charge === 'positive' || ball.charge === 'neutral') ? 'negative' : 'positive';
        }
    }
    
    // R  →  reset the current level (allowed anytime, or after death animation)
    // In test-play (state 7) this restarts the same throwaway level instead
    // of touching the real level pipeline, and never re-enters state 3.
    if ((key == 'r' || key == 'R') && (state == 3 || state == 4 || state == 7 || ball.isDeathAnimationFinished())) {
        if (isTestPlay) {
            startTestPlay();
        } else {
            resetLevel();
            state = 3;
        }
    }
    
    // SPACE  →  respawn from latest checkpoint (allowed in state 3/7 or after death animation)
    if (key == ' ' && (state == 3 || state == 7 || ball.isDeathAnimationFinished())) {
        respawnFromCheckpoint();
    }

    // ESC  →  exit the level. Normally returns to the main menu; during a
    // test-play run (state 7, or the death/finish screen that followed one)
    // it returns to the editor instead, per the editor's own Test button.
    if (keyCode === ESCAPE && (state == 3 || state == 4 || state == 7 || ball.isDeathAnimationFinished())) {
        if (isTestPlay) {
            endTestPlay();
        } else {
            exitToMenu();
        }
    }
}


// ── Game logic ────────────────────────────────────────────────────────────────
function doSmth() {
    // Reset ball movement constraints each frame
    ball.canMoveX = true;
    ball.canMoveY = true;
    ball.stuckToPlatform = null;
    
    for (let waterZone of waterZones) {
        waterZone.show();
        if (waterZone.contains(ball)) {
            waterZone.applyDrag(ball);
            gravity.mult(waterZone.dragCoefficient * 300)
        }
    }

    for (let gravZone of gravZones) {
        gravZone.show();
        if (gravZone.contains(ball)) {
            gravity.mult(gravZone.gravMult)
        }
    }

    // Advance moving platforms along their paths before drawing/colliding,
    // so everything this frame reflects their current position.
    movingPlatforms.forEach((mp) => mp.move());

    // Loop through the platforms and fans and show them
    fans.forEach((f) => f.show());
    platforms.forEach((p) => p.show());
    circlePlatforms.forEach((cp) => cp.show());
    bouncePads.forEach((b) => b.show());
    movingPlatforms.forEach((mp) => mp.show());
    signs.forEach((s) => s.show());
    finishes.forEach((f) => f.show());
    checkpoints.forEach((c) => c.show());
    powerUps.forEach((pu) => {
        pu.update();
        pu.show();
    });

    // Apply forces from platforms
    platforms.forEach((p) => {
        p.applyForces(ball)
    })

    // Handle circular platform collisions
    circlePlatforms.forEach((cp) => {
        cp.checkCollision(ball);
        cp.applyForces(ball);
    });

    // Apply forces from bouncepads
    bouncePads.forEach((b) => {
        if (b.isBallOnTop(ball)) {
            gravity.y = 0.2
            b.applyForces(ball);
        }
    })

    // Apply forces from moving (honey-surface) platforms - includes carrying
    // the ball along with the platform and launching it on turns/stops
    movingPlatforms.forEach((mp) => {
        mp.applyForces(ball);
    })

    // Apply forces from fans
    fans.forEach((f) => {
        f.applyForce(ball, platforms);
    });

    finishes.forEach((f) => f.checkFin());
    checkpoints.forEach((c) => c.checkCp());
    powerUps.forEach((pu) => pu.checkPickup(ball));

    // Loop through particles and carry out functions
    particles.forEach((p) => p.show());
    particles.forEach((p) => p.checkCollision(ball));
    particles.forEach((p) => p.applyGravity(ball));
}

