class Timer {
    constructor() {
        this.startTime = 0;
        this.endTime = 0;
        this.running = false;
        this.hasStarted = false;
        this.bestTime = Infinity;
        this.checkpointTimes = []; // Array to level times at each checkpoint
        this.pausedTime = 0;  // Elapsed time when paused
        this.pauseStartTime = 0;  // Time when pause began
    }

    start() {
        this.startTime = millis();
        this.running = true;
        this.hasStarted = true;
        this.endTime = 0; // Reset end time in case of restart
        this.checkpointTimes = []; // Reset checkpoint times
        this.pausedTime = 0;  // Reset paused time
    }

    startWaiting() {
        // Timer is active but waiting for first input
        this.hasStarted = false;
        this.running = false;
        this.startTime = 0;
        this.endTime = 0;
        this.pausedTime = 0;
    }

    beginCounting() {
        // Transition from waiting to actually counting
        if (!this.running && this.hasStarted === false) {
            this.start();
        }
    }

    stop() {
        if (this.running) {
            this.endTime = millis();
            this.running = false;
        }
    }

    /**
     * Pause the timer and save elapsed time
     */
    pause() {
        if (this.running) {
            this.pausedTime = this.getElapsedTime();
            this.pauseStartTime = millis();
            this.running = false;
        }
    }

    /**
     * Resume the timer from pause, adjusting for time lost during pause
     */
    resume() {
        if (!this.running && this.pausedTime > 0) {
            // Adjust startTime so that future getElapsedTime calls continue from pausedTime
            this.startTime = millis() - (this.pausedTime * 1000);
            this.endTime = 0;  // Reset end time
            this.running = true;
        }
    }

    reset() {
        this.startTime = 0;
        this.endTime = 0;
        this.running = false;
        this.hasStarted = false;
        this.checkpointTimes = []; // Reset checkpoint times
        this.pausedTime = 0;
    }

    recordCheckpointTime() {
        if (this.running) {
            this.checkpointTimes.push(this.getElapsedTime());
        }
    }

    getCheckpointTimes() {
        return this.checkpointTimes;
    }

    isRunning() {
        return this.running;
    }

    hasTimerStarted() {
        return this.hasStarted;
    }

    getElapsedTime() {
        if (this.running) {
            return (millis() - this.startTime) / 1000;
        } else if (this.endTime > 0) {
            return (this.endTime - this.startTime) / 1000;
        } else if (this.pausedTime > 0) {
            return this.pausedTime;
        } else {
            return 0;
        }
    }

    /**
     * Get the time when the player died (paused time)
     */
    getDeathTime() {
        return this.pausedTime;
    }

    // Set best time
    setBestTime(time) {
        if (time < this.bestTime) {
            this.bestTime = time;
        }
    }

    // Get best time
    getBestTime() {
        return this.bestTime === Infinity ? null : this.bestTime;
    }

    hasBestTime() {
        return this.bestTime !== Infinity;
    }

    show() {
        let elapsed = this.getElapsedTime();
        if (levels[activeLevelId] && levels[activeLevelId].background === 'space') {
            fill(255);
        } else {
            fill(0);
        }
        textSize(16);
        textStyle(NORMAL);

        if (this.running) {
            text(`Time: ${elapsed.toFixed(2)}s`, 10, 20);
        } else if (this.endTime > 0) {
            textStyle(BOLD);
            text(`Final Time: ${elapsed.toFixed(2)}s`, 10, 20);
        } else {
            text(`Time: 0.00s`, 10, 20); 
        }
        textStyle(NORMAL);
    }
} 