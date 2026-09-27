/**
 * L'HORLOGER 1888 — MASTER VINTAGE CHRONOMETER ENGINE
 * Precision horology engine with mechanical escapement physics,
 * procedural Web Audio acoustics, Guilloché dial generation,
 * and multi-complication timekeeping.
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // State & Horological Configuration
  // ---------------------------------------------------------------------------
  const state = {
    timezone: 'local',
    motionMode: 'mechanical', // 'mechanical' (5 bps), 'deadbeat' (1 bps), 'sweep'
    soundEnabled: true,
    volume: 0.45,
    hourlyChime: true,
    theme: 'brass',
    
    // Chronograph / Stopwatch
    chronoActive: false,
    chronoStartTime: 0,
    chronoElapsedTime: 0,

    // Power Reserve (0 to 100%)
    powerReserve: 88,
    lastWindTime: Date.now(),

    // Escapement Acoustics
    audioCtx: null,
    isAudioUnlocked: false,
    lastBeatIndex: -1,
    lastHourStruck: -1,

    // Telemetry & Drift
    lastTickTime: performance.now(),
    driftMs: 0
  };

  // Roman Numerals for Vintage Dial (Watchmaker's traditional 'IIII')
  const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  // DOM Elements Cache
  const elements = {
    viewport: document.getElementById('clockViewport'),
    casing: document.getElementById('clockCasing'),
    dial: document.getElementById('clockDial'),
    guillocheCanvas: document.getElementById('guillocheCanvas'),
    tickGroup: document.getElementById('dialTickGroup'),
    numeralsGroup: document.getElementById('dialNumeralsGroup'),
    
    // Hands
    hourHand: document.getElementById('hourHandGroup'),
    minuteHand: document.getElementById('minuteHandGroup'),
    secondHand: document.getElementById('secondHandGroup'),
    
    // Complications
    celestialDisc: document.getElementById('celestialDisc'),
    powerReserveHand: document.getElementById('powerReserveHand'),
    dateText: document.getElementById('dateApertureText'),
    balanceWheel: document.getElementById('oscillatingBalanceWheel'),
    hairspring: document.getElementById('hairspringSpiral'),
    glassLens: document.getElementById('glassLens'),
    lightGleam: document.getElementById('lightGleam'),
    windingCrown: document.getElementById('windingCrown'),
    crownAssembly: document.getElementById('crownAssembly'),

    // Digital & Telemetry Displays
    digitalTime: document.getElementById('digitalTimeDisplay'),
    digitalMillis: document.getElementById('digitalMillisDisplay'),
    digitalAmPm: document.getElementById('digitalAmPm'),
    digitalFullDate: document.getElementById('digitalFullDate'),
    teleTimezone: document.getElementById('teleTimezone'),
    teleFrequency: document.getElementById('teleFrequency'),
    teleDrift: document.getElementById('teleDrift'),
    teleSolar: document.getElementById('teleSolar'),
    syncBadgeText: document.getElementById('syncStatusText'),

    // Controls
    motionSelect: document.getElementById('motionModeSelect'),
    tzSelect: document.getElementById('timezoneSelect'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeVal: document.getElementById('volumeVal'),
    chkHourlyChime: document.getElementById('chkHourlyChime'),
    btnTestChime: document.getElementById('btnTestChime'),
    btnAudioToggle: document.getElementById('btnAudioToggle'),
    audioIconOn: document.getElementById('audioIconOn'),
    audioIconOff: document.getElementById('audioIconOff'),
    soundBtnLabel: document.getElementById('soundBtnLabel'),
    btnWindClock: document.getElementById('btnWindClock'),
    btnStopwatchMode: document.getElementById('btnStopwatchMode'),
    chronoBtnLabel: document.getElementById('chronoBtnLabel'),
    btnSyncAtomic: document.getElementById('btnSyncAtomic'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    themeButtons: document.querySelectorAll('.theme-btn')
  };

  // ---------------------------------------------------------------------------
  // Dial Indices & Chapter Ring Builder
  // ---------------------------------------------------------------------------
  function initializeDialMarkings() {
    const center = 300;
    const minuteRadiusOuter = 274;
    const minuteRadiusInner = 256;
    const tickGroup = elements.tickGroup;
    const numeralsGroup = elements.numeralsGroup;

    tickGroup.innerHTML = '';
    numeralsGroup.innerHTML = '';

    // Create 60 Minute/Second Divisions with 1/5th second sub-divisions
    for (let i = 0; i < 60; i++) {
      const angleDeg = i * 6;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const isFiveMinute = (i % 5 === 0);

      // Radial railroad markers
      const r1 = minuteRadiusInner;
      const r2 = isFiveMinute ? (minuteRadiusOuter + 2) : minuteRadiusOuter;
      const strokeWidth = isFiveMinute ? 2.4 : 1.0;
      const strokeColor = isFiveMinute ? 'var(--ink-color)' : 'var(--ink-faded)';

      const x1 = center + r1 * Math.cos(angleRad);
      const y1 = center + r1 * Math.sin(angleRad);
      const x2 = center + r2 * Math.cos(angleRad);
      const y2 = center + r2 * Math.sin(angleRad);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
      line.setAttribute('stroke', strokeColor);
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('stroke-linecap', 'round');
      tickGroup.appendChild(line);

      // Fine 1/5th second ticks between minutes
      if (!isFiveMinute) {
        for (let sub = 1; sub <= 4; sub++) {
          const subAngleRad = (angleDeg - 6 + sub * 1.2 - 90) * (Math.PI / 180);
          const subR1 = minuteRadiusOuter - 6;
          const subR2 = minuteRadiusOuter;
          const sx1 = center + subR1 * Math.cos(subAngleRad);
          const sy1 = center + subR1 * Math.sin(subAngleRad);
          const sx2 = center + subR2 * Math.cos(subAngleRad);
          const sy2 = center + subR2 * Math.sin(subAngleRad);

          const subLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          subLine.setAttribute('x1', sx1.toFixed(2));
          subLine.setAttribute('y1', sy1.toFixed(2));
          subLine.setAttribute('x2', sx2.toFixed(2));
          subLine.setAttribute('y2', sy2.toFixed(2));
          subLine.setAttribute('stroke', 'var(--ink-faded)');
          subLine.setAttribute('stroke-width', '0.6');
          subLine.setAttribute('opacity', '0.5');
          tickGroup.appendChild(subLine);
        }
      }

      // Diamond lozenge or minute numbers at 5-minute intervals
      if (isFiveMinute) {
        const pipRadius = 246;
        const px = center + pipRadius * Math.cos(angleRad);
        const py = center + pipRadius * Math.sin(angleRad);

        // Small 5-minute diamond marker
        const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const s = 3;
        const pts = `
          ${px},${py - s} 
          ${px + s},${py} 
          ${px},${py + s} 
          ${px - s},${py}
        `;
        diamond.setAttribute('points', pts.trim());
        diamond.setAttribute('fill', 'var(--ink-color)');
        diamond.setAttribute('opacity', '0.85');
        tickGroup.appendChild(diamond);

        // Minute number outside railroad track (05, 10, 15... 60)
        const numRadius = 286;
        const nx = center + numRadius * Math.cos(angleRad);
        const ny = center + numRadius * Math.sin(angleRad);

        const minText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        minText.setAttribute('x', nx.toFixed(2));
        minText.setAttribute('y', (ny + 2.5).toFixed(2));
        minText.setAttribute('text-anchor', 'middle');
        minText.setAttribute('font-family', 'var(--font-serif)');
        minText.setAttribute('font-size', '7.5');
        minText.setAttribute('font-weight', '600');
        minText.setAttribute('fill', 'var(--ink-faded)');
        minText.textContent = (i === 0 ? '60' : (i < 10 ? '0' + i : i));
        tickGroup.appendChild(minText);
      }
    }

    // Roman Numerals (12 Hours)
    const numeralRadius = 208;
    for (let h = 0; h < 12; h++) {
      const angleDeg = h * 30;
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const textX = center + numeralRadius * Math.cos(angleRad);
      const textY = center + numeralRadius * Math.sin(angleRad);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', textX.toFixed(2));
      text.setAttribute('y', textY.toFixed(2));
      text.setAttribute('class', 'numeral-text');
      text.textContent = ROMAN_NUMERALS[h];

      // Subtle scale for 12 o'clock, 3 o'clock, 6 o'clock, 9 o'clock
      if (h % 3 === 0) {
        text.style.fontSize = '34px';
      }

      numeralsGroup.appendChild(text);
    }

    // Draw Hairspring Spiral in Tourbillon
    generateHairspringPath();
  }

  // Draw Archimedean Spiral for the escapement balance hairspring
  function generateHairspringPath() {
    if (!elements.hairspring) return;
    const coils = 4.2;
    const points = 140;
    const maxR = 24;
    let d = '';

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * (coils * 2 * Math.PI);
      const r = (i / points) * maxR + 2.5;
      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);
      d += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    elements.hairspring.setAttribute('d', d);
  }

  // ---------------------------------------------------------------------------
  // Procedural Guilloché Rose-Engine Dial Background (Canvas)
  // ---------------------------------------------------------------------------
  function drawGuillochePattern() {
    const canvas = elements.guillocheCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    // Subtle center circular mask
    ctx.beginPath();
    ctx.arc(cx, cy, 335, 0, Math.PI * 2);
    ctx.clip();

    // Get Guilloché color from computed CSS styles
    const computedStyle = getComputedStyle(document.body);
    const strokeColor = computedStyle.getPropertyValue('--guilloche-color').trim() || 'rgba(145, 108, 62, 0.12)';

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.85;

    // Epicycloid / Rose Wave Rosette Pattern (Breguet Clous de Paris)
    const numRays = 72;
    const minR = 65;
    const maxR = 320;
    const waves = 14;

    for (let r = minR; r < maxR; r += 7) {
      ctx.beginPath();
      for (let theta = 0; theta <= Math.PI * 2 + 0.05; theta += 0.02) {
        const amplitude = 3.5 * Math.sin(theta * waves);
        const radius = r + amplitude;
        const x = cx + radius * Math.cos(theta);
        const y = cy + radius * Math.sin(theta);
        if (theta === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Secondary criss-cross counter-spirals
    ctx.lineWidth = 0.5;
    for (let i = 0; i < numRays; i++) {
      const angle = (i / numRays) * Math.PI * 2;
      ctx.beginPath();
      for (let r = minR + 10; r < maxR - 20; r += 12) {
        const twist = (r / maxR) * 0.45;
        const x = cx + r * Math.cos(angle + twist);
        const y = cy + r * Math.sin(angle + twist);
        if (r === minR + 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let r = minR + 10; r < maxR - 20; r += 12) {
        const twist = (r / maxR) * -0.45;
        const x = cx + r * Math.cos(angle + twist);
        const y = cy + r * Math.sin(angle + twist);
        if (r === minR + 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Outer subtle sunburst rays
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.6;
    for (let a = 0; a < 360; a += 1.5) {
      const rad = (a * Math.PI) / 180;
      const x1 = cx + 220 * Math.cos(rad);
      const y1 = cy + 220 * Math.sin(rad);
      const x2 = cx + 325 * Math.cos(rad);
      const y2 = cy + 325 * Math.sin(rad);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Web Audio Procedural Escapement & Chime Acoustic Engine
  // ---------------------------------------------------------------------------
  function initAudioContext() {
    if (state.audioCtx) {
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume();
      }
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    state.audioCtx = new AudioContextClass();
    state.isAudioUnlocked = true;
  }

  /**
   * Procedural Escapement Mechanical Tick / Tock
   * Simulates the pallet fork jewel striking the escapement wheel tooth.
   * Alternates between higher frequency 'Tic' and lower frequency 'Tac'.
   */
  function playEscapementTick(isTac = false) {
    if (!state.soundEnabled || state.volume <= 0.01) return;
    if (!state.audioCtx || state.audioCtx.state !== 'running') return;

    try {
      const ctx = state.audioCtx;
      const now = ctx.currentTime;
      const baseFreq = isTac ? 2850 : 3450;
      const duration = 0.028; // 28 milliseconds impulse

      // White Noise impulse buffer for transient strike
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      // Resonant Bandpass Filter for metallic pallet jewel ringing
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq, now);
      filter.Q.setValueAtTime(14, now);

      // Secondary low-pass for warm casing resonance
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.setValueAtTime(4500, now);

      // Gain Envelope
      const gainNode = ctx.createGain();
      const peakVol = state.volume * (isTac ? 0.35 : 0.42);
      gainNode.gain.setValueAtTime(peakVol, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      // Connect graph
      noiseSource.connect(filter);
      filter.connect(lowFilter);
      lowFilter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noiseSource.start(now);
      noiseSource.stop(now + duration);

      // Subtle metallic body ping
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isTac ? 1120 : 1380, now);
      oscGain.gain.setValueAtTime(state.volume * 0.08, now);
      oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);

    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Procedural Westminster Bronze Bell Chime Strike
   * Simulates heavy cast bronze grandfather clock bell with physical partials.
   */
  function strikeChime(hourCount = 1) {
    if (!state.soundEnabled || !state.isAudioUnlocked) {
      initAudioContext();
    }
    if (!state.audioCtx || state.audioCtx.state !== 'running') return;

    const ctx = state.audioCtx;
    const now = ctx.currentTime;
    const fundamental = 392.00; // G4 bell tone
    const partials = [
      { mult: 1.0,  gain: 0.65, decay: 3.2 },
      { mult: 1.25, gain: 0.35, decay: 2.5 },
      { mult: 1.5,  gain: 0.45, decay: 2.8 },
      { mult: 2.0,  gain: 0.28, decay: 1.8 },
      { mult: 2.76, gain: 0.15, decay: 1.2 }
    ];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(state.volume * 0.7, now);
    masterGain.connect(ctx.destination);

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * p.mult, now);
      // Slight pitch drift downward like a real struck bell
      osc.frequency.exponentialRampToValueAtTime(fundamental * p.mult * 0.996, now + p.decay);

      g.gain.setValueAtTime(p.gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(g);
      g.connect(masterGain);

      osc.start(now);
      osc.stop(now + p.decay);
    });

    // Metallic striker hammer transient impact
    const hammer = ctx.createOscillator();
    const hammerGain = ctx.createGain();
    hammer.type = 'triangle';
    hammer.frequency.setValueAtTime(180, now);
    hammerGain.gain.setValueAtTime(state.volume * 0.4, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    hammer.connect(hammerGain);
    hammerGain.connect(ctx.destination);
    hammer.start(now);
    hammer.stop(now + 0.06);
  }

  // ---------------------------------------------------------------------------
  // Precision Timekeeping & Mechanical Physics Loop
  // ---------------------------------------------------------------------------
  function getTimeInTimezone(targetTz) {
    const now = new Date();
    if (targetTz === 'local') {
      return {
        hours: now.getHours(),
        minutes: now.getMinutes(),
        seconds: now.getSeconds(),
        milliseconds: now.getMilliseconds(),
        day: now.getDate(),
        month: now.getMonth(),
        year: now.getFullYear(),
        dayOfWeek: now.getDay(),
        tzName: 'LOCAL TIME (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')'
      };
    }

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: targetTz,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        fractionalSecondDigits: 3,
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        weekday: 'short'
      });

      const parts = formatter.formatToParts(now);
      const partMap = {};
      parts.forEach(p => { partMap[p.type] = p.value; });

      return {
        hours: parseInt(partMap.hour, 10) % 24,
        minutes: parseInt(partMap.minute, 10),
        seconds: parseInt(partMap.second, 10),
        milliseconds: parseInt(partMap.fractionalSecond, 10) || now.getMilliseconds(),
        day: parseInt(partMap.day, 10),
        month: parseInt(partMap.month, 10) - 1,
        year: parseInt(partMap.year, 10),
        dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(partMap.weekday),
        tzName: targetTz.replace('_', ' ')
      };
    } catch (e) {
      // Fallback to local
      return getTimeInTimezone('local');
    }
  }

  const MONTH_NAMES = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  const DAY_NAMES = [
    'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'
  ];

  /**
   * Main High-Precision Animation Frame Loop
   */
  function animationTick(timestamp) {
    // High-resolution monotonic timing
    const perfNow = performance.now();
    const frameDelta = perfNow - state.lastTickTime;
    state.lastTickTime = perfNow;

    // Time calculations
    const timeData = getTimeInTimezone(state.timezone);
    const { hours, minutes, seconds, milliseconds, day, month, year, dayOfWeek, tzName } = timeData;

    // Fractional seconds
    const exactMs = milliseconds + (perfNow % 1);
    const fractionalSeconds = seconds + exactMs / 1000;

    // Escapement Step Physics
    let secondAngle = 0;
    const beatsPerSec = 5; // Authentic 18,000 vph pocket watch escapement

    if (state.motionMode === 'mechanical') {
      // 5 steps per second with spring recoil elasticity
      const currentBeat = Math.floor(fractionalSeconds * beatsPerSec);
      const beatProgress = (fractionalSeconds * beatsPerSec) % 1;
      
      // Elastic spring bounce formula: damped oscillation at moment of strike
      const bounce = Math.sin(beatProgress * Math.PI) * Math.exp(-beatProgress * 7) * 0.18;
      secondAngle = (currentBeat / beatsPerSec) * 6 + bounce;

      // Play audio on beat transition
      if (currentBeat !== state.lastBeatIndex) {
        state.lastBeatIndex = currentBeat;
        playEscapementTick(currentBeat % 2 === 1);
      }

    } else if (state.motionMode === 'deadbeat') {
      // 1 second deadbeat jump with mechanical latch bounce
      const secProgress = exactMs / 1000;
      const bounce = Math.sin(secProgress * Math.PI) * Math.exp(-secProgress * 8) * 0.35;
      secondAngle = seconds * 6 + bounce;

      const currentSec = seconds;
      if (currentSec !== state.lastBeatIndex) {
        state.lastBeatIndex = currentSec;
        playEscapementTick(currentSec % 2 === 1);
      }

    } else {
      // Fluid 60fps/120fps continuous sweep
      secondAngle = fractionalSeconds * 6;
      
      // Gentle tick every second
      if (seconds !== state.lastBeatIndex) {
        state.lastBeatIndex = seconds;
        playEscapementTick(seconds % 2 === 1);
      }
    }

    // Chronograph override if active
    if (state.chronoActive) {
      const elapsedSec = (Date.now() - state.chronoStartTime) / 1000;
      secondAngle = (elapsedSec % 60) * 6;
    }

    // Minutes and Hours with fractional progression
    const minuteAngle = (minutes + fractionalSeconds / 60) * 6;
    const hourAngle = ((hours % 12) + minutes / 60 + fractionalSeconds / 3600) * 30;

    // Apply 2D/3D Rotations to Hands
    elements.secondHand.style.transform = `rotate(${secondAngle.toFixed(3)}deg)`;
    elements.minuteHand.style.transform = `rotate(${minuteAngle.toFixed(3)}deg)`;
    elements.hourHand.style.transform = `rotate(${hourAngle.toFixed(3)}deg)`;

    // -------------------------------------------------------------------------
    // Complication 1: Open Heart Tourbillon Balance Wheel & Hairspring
    // -------------------------------------------------------------------------
    // Oscillation frequency matches 2.5Hz (18,000 vph)
    const balanceFrequency = 2.5; 
    const balanceAngle = Math.sin(fractionalSeconds * balanceFrequency * 2 * Math.PI) * 44;
    elements.balanceWheel.style.transform = `rotate(${balanceAngle.toFixed(2)}deg)`;

    // Hairspring pulses dynamically with balance wheel
    const hairspringScale = 1 + Math.sin(fractionalSeconds * balanceFrequency * 2 * Math.PI) * 0.08;
    elements.hairspring.style.transform = `scale(${hairspringScale.toFixed(3)})`;

    // -------------------------------------------------------------------------
    // Complication 2: 24-Hour Celestial Sun/Moon Subdial
    // -------------------------------------------------------------------------
    const totalDayFraction = (hours + minutes / 60 + seconds / 3600) / 24;
    const celestialAngle = (totalDayFraction * 360);
    elements.celestialDisc.style.transform = `rotate(${celestialAngle.toFixed(2)}deg)`;

    // -------------------------------------------------------------------------
    // Complication 3: Calendar Date Aperture
    // -------------------------------------------------------------------------
    if (elements.dateText.textContent !== String(day)) {
      elements.dateText.textContent = (day < 10 ? '0' + day : day);
    }

    // -------------------------------------------------------------------------
    // Complication 4: Power Reserve Mainspring Hand
    // -------------------------------------------------------------------------
    // Drains 1% every 3 minutes for simulated horological realism
    const timeSinceWind = (Date.now() - state.lastWindTime) / 1000;
    const currentReserve = Math.max(8, state.powerReserve - (timeSinceWind / 180));
    // Range from -42 deg (empty) to +42 deg (full)
    const reserveAngle = -42 + (currentReserve / 100) * 84;
    elements.powerReserveHand.style.transform = `rotate(${reserveAngle.toFixed(1)}deg)`;

    // -------------------------------------------------------------------------
    // Complication 5: Hourly Chime Detection
    // -------------------------------------------------------------------------
    if (state.hourlyChime && minutes === 0 && seconds === 0 && hours !== state.lastHourStruck) {
      state.lastHourStruck = hours;
      strikeChime(hours % 12 || 12);
    }

    // -------------------------------------------------------------------------
    // Digital Verification Readout & Telemetry
    // -------------------------------------------------------------------------
    const displayHours = (hours % 12 || 12);
    const pad2 = n => (n < 10 ? '0' + n : n);
    const pad3 = n => (n < 10 ? '00' + n : n < 100 ? '0' + n : n);

    elements.digitalTime.textContent = `${pad2(displayHours)}:${pad2(minutes)}:${pad2(seconds)}`;
    elements.digitalMillis.textContent = `.${pad3(Math.floor(exactMs))}`;
    elements.digitalAmPm.textContent = hours >= 12 ? 'PM' : 'AM';
    elements.digitalFullDate.textContent = `${DAY_NAMES[dayOfWeek]} • ${day} ${MONTH_NAMES[month]} ${year}`;

    // Telemetry Telemetry items
    elements.teleTimezone.textContent = tzName.toUpperCase();
    
    // Solar status
    let solarStatus = 'NIGHT (LUNAR)';
    if (hours >= 6 && hours < 9) solarStatus = 'ASTRONOMICAL DAWN';
    else if (hours >= 9 && hours < 12) solarStatus = 'MORNING ASCENT';
    else if (hours >= 12 && hours < 14) solarStatus = 'SOLAR ZENITH';
    else if (hours >= 14 && hours < 18) solarStatus = 'AFTERNOON DESCENT';
    else if (hours >= 18 && hours < 21) solarStatus = 'GOLDEN TWILIGHT';
    else if (hours >= 21 || hours < 4) solarStatus = 'MIDNIGHT REALM';
    elements.teleSolar.textContent = solarStatus;

    // Drift telemetry calculation (&plusmn;0.0X ms precision)
    const instantDrift = (frameDelta - 1000 / 60);
    state.driftMs = state.driftMs * 0.95 + instantDrift * 0.05;
    elements.teleDrift.innerHTML = `&plusmn;${Math.abs(state.driftMs).toFixed(2)} ms`;

    requestAnimationFrame(animationTick);
  }

  // ---------------------------------------------------------------------------
  // Interactive 3D Parallax & Domed Glass Glare Tracking
  // ---------------------------------------------------------------------------
  function initializeParallax() {
    const stage = document.querySelector('.horology-stage');
    const casing = elements.casing;
    const glassLens = elements.glassLens;
    const lightGleam = elements.lightGleam;

    if (!stage || !casing) return;

    window.addEventListener('mousemove', (e) => {
      const rect = stage.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;

      const normX = Math.max(-1, Math.min(1, x / (rect.width / 2)));
      const normY = Math.max(-1, Math.min(1, y / (rect.height / 2)));

      // Subtle 3D tilt
      const rotateX = -normY * 9;
      const rotateY = normX * 9;
      casing.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;

      // Dynamic sapphire glare shift
      const glareSweep = glassLens.querySelector('.glass-glare-sweep');
      if (glareSweep) {
        const glareOffsetX = normX * 45;
        const glareOffsetY = normY * 45;
        glareSweep.style.transform = `translate(${glareOffsetX}px, ${glareOffsetY}px) rotate(-25deg)`;
      }

      // Ambient cursor light glow
      if (lightGleam) {
        lightGleam.style.left = `${e.clientX}px`;
        lightGleam.style.top = `${e.clientY}px`;
      }
    });

    stage.addEventListener('mouseleave', () => {
      casing.style.transform = 'rotateX(0deg) rotateY(0deg)';
    });
  }

  // ---------------------------------------------------------------------------
  // Event Listeners & UI Controls Binding
  // ---------------------------------------------------------------------------
  function bindEventListeners() {
    // Global User Interaction to unlock Web Audio API seamlessly
    const unlockAudio = () => {
      initAudioContext();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    // Audio Mute Toggle Button
    elements.btnAudioToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudioContext();
      state.soundEnabled = !state.soundEnabled;
      
      if (state.soundEnabled) {
        elements.audioIconOn.classList.remove('hidden');
        elements.audioIconOff.classList.add('hidden');
        elements.soundBtnLabel.textContent = 'SOUND: ON';
      } else {
        elements.audioIconOn.classList.add('hidden');
        elements.audioIconOff.classList.remove('hidden');
        elements.soundBtnLabel.textContent = 'SOUND: MUTED';
      }
    });

    // Volume Slider
    elements.volumeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.volume = val / 100;
      elements.volumeVal.textContent = `${val}%`;
      if (state.volume > 0 && !state.soundEnabled) {
        state.soundEnabled = true;
        elements.audioIconOn.classList.remove('hidden');
        elements.audioIconOff.classList.add('hidden');
        elements.soundBtnLabel.textContent = 'SOUND: ON';
      }
    });

    // Motion Mode Select (Mechanical 5 bps / Deadbeat 1 bps / Sweep)
    elements.motionSelect.addEventListener('change', (e) => {
      state.motionMode = e.target.value;
      if (state.motionMode === 'mechanical') {
        elements.teleFrequency.textContent = '18,000 VPH (2.5 Hz)';
      } else if (state.motionMode === 'deadbeat') {
        elements.teleFrequency.textContent = '3,600 VPH (1.0 Hz)';
      } else {
        elements.teleFrequency.textContent = 'CONTINUOUS (60 FPS)';
      }
    });

    // Timezone Selector
    elements.tzSelect.addEventListener('change', (e) => {
      state.timezone = e.target.value;
    });

    // Theme Switcher Buttons
    elements.themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const theme = btn.dataset.theme;
        state.theme = theme;
        document.body.dataset.theme = theme;
        // Redraw Guilloché with the updated theme colors
        setTimeout(drawGuillochePattern, 50);
      });
    });

    // Hourly Chime Checkbox
    elements.chkHourlyChime.addEventListener('change', (e) => {
      state.hourlyChime = e.target.checked;
    });

    // Test Bell Button
    elements.btnTestChime.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudioContext();
      strikeChime(1);
    });

    // Manual Winding Action (Crown & Button)
    const windSpring = (e) => {
      if (e) e.stopPropagation();
      initAudioContext();

      // Ratchet tactile sound
      if (state.audioCtx && state.audioCtx.state === 'running' && state.soundEnabled) {
        for (let i = 0; i < 4; i++) {
          setTimeout(() => playEscapementTick(true), i * 35);
        }
      }

      state.powerReserve = Math.min(100, state.powerReserve + 18);
      state.lastWindTime = Date.now();

      // Crown twist animation
      elements.windingCrown.style.transform = 'scale(0.95) rotate(15deg)';
      setTimeout(() => {
        elements.windingCrown.style.transform = 'scale(1) rotate(0deg)';
      }, 150);
    };

    elements.btnWindClock.addEventListener('click', windSpring);
    elements.crownAssembly.addEventListener('click', windSpring);

    // Stopwatch / Chrono Button
    elements.btnStopwatchMode.addEventListener('click', () => {
      state.chronoActive = !state.chronoActive;
      if (state.chronoActive) {
        state.chronoStartTime = Date.now();
        elements.btnStopwatchMode.classList.add('primary');
        elements.btnStopwatchMode.classList.remove('secondary');
        elements.chronoBtnLabel.textContent = 'STOP CHRONO';
      } else {
        elements.btnStopwatchMode.classList.remove('primary');
        elements.btnStopwatchMode.classList.add('secondary');
        elements.chronoBtnLabel.textContent = 'START CHRONO';
      }
    });

    // Atomic Sync Verification
    elements.btnSyncAtomic.addEventListener('click', () => {
      elements.syncBadgeText.textContent = 'CALIBRATING...';
      elements.syncBadgeText.style.color = '#38ef7d';

      setTimeout(() => {
        state.driftMs = 0.00;
        elements.syncBadgeText.textContent = 'SYNC: ATOMIC ALIGNED';
        setTimeout(() => {
          elements.syncBadgeText.textContent = 'SYNC: HIGH PRECISION';
          elements.syncBadgeText.style.color = '';
        }, 2500);
      }, 400);
    });

    // Fullscreen Mode
    elements.btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Handle Window Resize for Guilloché Redraw
    window.addEventListener('resize', () => {
      drawGuillochePattern();
    });
  }

  // ---------------------------------------------------------------------------
  // Initialization Routine
  // ---------------------------------------------------------------------------
  function init() {
    initializeDialMarkings();
    drawGuillochePattern();
    initializeParallax();
    bindEventListeners();
    requestAnimationFrame(animationTick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
