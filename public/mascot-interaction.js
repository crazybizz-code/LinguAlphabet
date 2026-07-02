/**
 * ═════════════════════════════════════════════════════════════════
 * linguAlphabet Mascot Interaction Manager — JavaScript Controller
 * ═════════════════════════════════════════════════════════════════
 */

class MascotInteractionManager {
  /**
   * @param {HTMLElement} [containerElement] Optional mascot wrapper element
   */
  constructor(containerElement = null) {
    this.container = containerElement || document.getElementById('mascot-container');
    if (!this.container) {
      // Fallback: try to find by ID
      this.container = document.querySelector('.mascot-container');
    }
    
    this.mascotSvg = this.container ? this.container.querySelector('svg') : null;
    this.currentState = 'idle';
    this.history = [];
    this.resetTimeout = null;

    // Config defaults
    this.config = {
      enableSound: true,
      enableParticles: true,
      autoResetDelay: 3000,
      soundVolume: 0.5
    };

    // Initialize elements
    this.initElements();
    this.attachClickListener();
    this.setState('idle');
  }

  /**
   * Configure mascot options
   * @param {Object} options 
   */
  configure(options = {}) {
    this.config = { ...this.config, ...options };
  }

  /**
   * Locate SVGs sub-elements for expression updates
   */
  initElements() {
    if (!this.container) return;
    this.mouth = this.container.querySelector('#tuto-mouth');
    this.browL = this.container.querySelector('#tuto-brow-left');
    this.browR = this.container.querySelector('#tuto-brow-right');
    this.headphones = this.container.querySelector('#tuto-headphones');
    
    // Create Speech/Thought bubble dynamically if it doesn't exist
    this.thoughtBubble = this.container.querySelector('.torty-thought-bubble');
    if (!this.thoughtBubble) {
      this.thoughtBubble = document.createElement('div');
      this.thoughtBubble.className = 'torty-thought-bubble';
      this.container.appendChild(this.thoughtBubble);
    }
  }

  /**
   * Get current state
   * @returns {string}
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get state history
   * @returns {string[]}
   */
  getHistory() {
    return this.history;
  }

  /**
   * Clear history logs
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Reset mascot to default Idle state
   */
  reset() {
    this.setState('idle');
  }

  /**
   * Set mascot state directly (updating class tags & SVG features)
   * @param {string} state 'idle' | 'thinking' | 'correct' | 'wrong' | 'loading' | 'levelup'
   */
  setState(state) {
    if (!this.container) return;

    // Log history
    this.history.push({ state, time: new Date() });
    if (this.history.length > 20) this.history.shift();

    // Cancel active auto-resets
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }

    // Clean old state classes
    this.container.classList.remove(
      'mascot-state-idle',
      'mascot-state-thinking',
      'mascot-state-correct',
      'mascot-state-wrong',
      'mascot-state-loading',
      'mascot-state-levelup'
    );

    // Apply class
    this.container.classList.add(`mascot-state-${state}`);
    this.currentState = state;

    // Reset default SVG paths
    if (this.browL) this.browL.setAttribute('d', 'M38,23 Q44,21 48,24');
    if (this.browR) this.browR.setAttribute('d', 'M62,23 Q56,21 52,24');
    if (this.mouth) this.mouth.setAttribute('d', 'M46,39 Q50,42 54,39');
    
    // Hide thought bubble unless thinking/loading
    if (state !== 'thinking' && state !== 'loading') {
      this.thoughtBubble.classList.remove('active');
    }

    // State specific expressions
    switch (state) {
      case 'thinking':
        if (this.mouth) this.mouth.setAttribute('d', 'M48,39 L52,39'); // flat lips
        if (this.browR) this.browR.setAttribute('d', 'M62,21 Q56,18 52,22'); // raised eyebrow
        break;

      case 'correct':
        if (this.mouth) this.mouth.setAttribute('d', 'M45,39 Q50,45 55,39'); // happy smile
        break;

      case 'wrong':
        if (this.browL) this.browL.setAttribute('d', 'M38,25 Q44,28 48,25'); 
        if (this.browR) this.browR.setAttribute('d', 'M62,25 Q56,28 52,25'); // sad eyebrows
        if (this.mouth) this.mouth.setAttribute('d', 'M46,42 Q50,38 54,42'); // frown frown
        break;

      case 'loading':
        if (this.mouth) this.mouth.setAttribute('d', 'M48,39 L52,39');
        break;

      case 'levelup':
        if (this.mouth) this.mouth.setAttribute('d', 'M45,39 Q50,46 55,39'); // wide mouth joy
        break;

      case 'idle':
      default:
        break;
    }
  }

  // ═══════════════════════════════════════════
  // USER ACTIONS API
  // ═══════════════════════════════════════════

  /**
   * Triggered when a new quiz question appears
   */
  onQuestionShow() {
    this.setState('thinking');
    this.showThoughtBubble('Let me think...');
    this.playSound('thinking');
  }

  /**
   * Correct Answer celebration
   * @param {number} [xpAmount] XP award amount (default 50)
   */
  onCorrectAnswer(xpAmount = 50) {
    this.setState('correct');
    this.playSound('success');
    
    if (this.config.enableParticles) {
      this.triggerConfetti();
    }
    if (xpAmount > 0) {
      this.showXPPopup(xpAmount);
    }
    
    this.showThoughtBubble('Correct! Keep it up! 🎉');

    // Auto reset back to thinking or idle
    this.resetTimeout = setTimeout(() => {
      this.setState('idle');
    }, this.config.autoResetDelay);
  }

  /**
   * Wrong Answer sympathy
   */
  onWrongAnswer() {
    this.setState('wrong');
    this.playSound('wrong');
    this.showEncouragement("Don't worry, try again! 🐢");

    this.resetTimeout = setTimeout(() => {
      this.setState('idle');
    }, this.config.autoResetDelay);
  }

  /**
   * Set mascot to loading/processing state
   */
  onLoading() {
    this.setState('loading');
    this.showThoughtBubble('Processing AI... 💡');
    this.playSound('thinking');
  }

  /**
   * Quiz Completed - Achievement unlock!
   * @param {string} badgeId
   * @param {string} badgeName
   */
  onQuizComplete(badgeId, badgeName) {
    this.setState('levelup');
    this.playSound('achievement');
    
    if (this.config.enableParticles) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => this.triggerConfetti(), i * 400);
      }
    }

    this.showBadgePopup(badgeId, badgeName);
    this.showThoughtBubble('WE DID IT! LEVEL UP! 🏆');

    this.resetTimeout = setTimeout(() => {
      this.setState('idle');
    }, 4500);
  }

  /**
   * Triggers wink on Hint
   */
  onHintGiven() {
    this.playSound('hint');
    this.showThoughtBubble('Here is a hint! 💡');
    
    // Quick eye wink animation
    const eyeR = this.container.querySelector('#torty-head ellipse:nth-of-type(4)');
    if (eyeR) {
      eyeR.style.transition = 'transform 0.15s ease';
      eyeR.style.transform = 'scaleY(0.1)';
      setTimeout(() => {
        eyeR.style.transform = 'scaleY(1)';
      }, 300);
    }
  }

  /**
   * Streak increment visual effect
   * @param {number} count 
   */
  onStreakUpdate(count) {
    this.playSound('streak');
    this.showStreakAnimation(count);
    this.showThoughtBubble(`${count} Days Streak! 🔥`);
  }

  /**
   * Interactive click responses
   */
  onMascotClick() {
    const reactions = ['wave', 'spin', 'dance'];
    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
    
    this.playSound('hint');
    
    if (randomReaction === 'wave') {
      this.showThoughtBubble("Hi there! Ready to learn? 👋");
      // Wave arms keyframe hook
      const arm = this.container.querySelector('#torty-waving-arm');
      if (arm) {
        arm.style.transition = 'transform 0.5s ease';
        arm.style.transform = 'rotate(-30deg)';
        setTimeout(() => arm.style.transform = '', 600);
      }
    } else if (randomReaction === 'spin') {
      this.showThoughtBubble("Wooo! 🌀");
      this.container.style.transition = 'transform 0.8s ease-in-out';
      this.container.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        this.container.style.transition = '';
        this.container.style.transform = '';
      }, 900);
    } else {
      this.showThoughtBubble("Learning is my workout! 🏃");
      this.container.style.transition = 'transform 0.3s ease';
      this.container.style.transform = 'scale(1.15) translateY(-15px)';
      setTimeout(() => {
        this.container.style.transform = '';
      }, 400);
    }
  }

  // ═══════════════════════════════════════════
  // DISPLAY / POPUP COMPONENT CREATORS
  // ═══════════════════════════════════════════

  /**
   * Dynamic thought bubble text updater
   * @param {string} text 
   */
  showThoughtBubble(text) {
    if (!this.thoughtBubble) return;
    this.thoughtBubble.innerHTML = text;
    this.thoughtBubble.classList.add('active');
    
    // Position bubble above head
    this.thoughtBubble.style.bottom = '300px';
    this.thoughtBubble.style.left = '35px';

    // Hide bubble after 3.5 seconds
    if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
    this.bubbleTimeout = setTimeout(() => {
      this.thoughtBubble.classList.remove('active');
    }, 3500);
  }

  /**
   * Spawns floating "+XP" text
   * @param {number} amount 
   */
  showXPPopup(amount) {
    const xpEl = document.createElement('div');
    xpEl.className = 'torty-xp-popup';
    xpEl.textContent = `+${amount} XP`;
    // Place near center of Torty
    xpEl.style.left = '160px';
    xpEl.style.top = '140px';
    this.container.appendChild(xpEl);
    
    setTimeout(() => xpEl.remove(), 1600);
  }

  /**
   * Spawns encouragement text
   * @param {string} text 
   */
  showEncouragement(text) {
    this.showThoughtBubble(text);
  }

  /**
   * Spawns flying badge icon
   * @param {string} id 
   * @param {string} name 
   */
  showBadgePopup(id, name) {
    const badge = document.createElement('div');
    badge.className = 'torty-badge-popup';
    badge.innerHTML = `🏆 <strong style="color:#ea580c">${name}</strong> Unlocked!`;
    badge.style.left = '80px';
    badge.style.top = '120px';
    this.container.appendChild(badge);

    setTimeout(() => badge.remove(), 3500);
  }

  /**
   * Streak fire pop animation
   * @param {number} count 
   */
  showStreakAnimation(count) {
    const fire = document.createElement('div');
    fire.className = 'torty-streak-fire';
    fire.innerHTML = `🔥 ${count}`;
    fire.style.left = '180px';
    fire.style.top = '90px';
    this.container.appendChild(fire);

    setTimeout(() => fire.remove(), 1500);
  }

  // ═══════════════════════════════════════════
  // CONFETTI & SOUND SYNTHESIS
  // ═══════════════════════════════════════════

  /**
   * Burst confetti particles
   */
  triggerConfetti() {
    const colors = ['#ff8c42', '#ff6b6b', '#10b981', '#6366f1', '#f59e0b', '#3b82f6'];
    const particleCount = 20;

    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.className = 'torty-confetti-particle';
      
      // Random properties
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      // Radial layout around center
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 50;
      const startX = 200 + Math.cos(angle) * 20;
      const startY = 220 + Math.sin(angle) * 15;
      
      p.style.left = `${startX}px`;
      p.style.top = `${startY}px`;
      
      // Stagger fall destination
      const destX = Math.cos(angle) * radius;
      p.style.setProperty('--dest-x', `${destX}px`);

      this.container.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }

  /**
   * Play synthesizer audio cues using Web Audio API
   * @param {string} type 'success' | 'wrong' | 'thinking' | 'achievement' | 'hint' | 'streak'
   */
  playSound(type) {
    if (!this.config.enableSound) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.config.soundVolume * 0.4, now + 0.05);

      switch (type) {
        case 'success':
          // Arpeggio
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
          osc.frequency.setValueAtTime(1046.50, now + 0.36); // C6
          gain.gain.setValueAtTime(this.config.soundVolume * 0.4, now + 0.36);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
          osc.start(now);
          osc.stop(now + 0.75);
          break;

        case 'wrong':
          // Sad descending tone
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(293.66, now); // D4
          osc.frequency.linearRampToValueAtTime(196.00, now + 0.4); // G3
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          osc.start(now);
          osc.stop(now + 0.5);
          break;

        case 'thinking':
          // Soft short chime
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now); // A4
          osc.frequency.linearRampToValueAtTime(554.37, now + 0.25); // C#5
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.32);
          break;

        case 'achievement':
          // Grand fanfare chord
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(392.00, now); // G4
          osc.frequency.setValueAtTime(523.25, now + 0.1); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
          osc.frequency.setValueAtTime(1318.51, now + 0.4); // E6
          gain.gain.setValueAtTime(this.config.soundVolume * 0.5, now + 0.4);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
          osc.start(now);
          osc.stop(now + 1.25);
          break;

        case 'hint':
          // Playful sweep
          osc.type = 'sine';
          osc.frequency.setValueAtTime(700, now);
          osc.frequency.exponentialRampToValueAtTime(950, now + 0.25);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.32);
          break;

        case 'streak':
          // Happy double sound
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(698.46, now + 0.15); // F5
          osc.frequency.setValueAtTime(587.33, now + 0.3); // D5
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
          osc.start(now);
          osc.stop(now + 0.5);
          break;

        default:
          break;
      }
    } catch (e) {
      console.warn("Audio Synthesis context was blocked or failed", e);
    }
  }

  /**
   * Bind click event handler to the mascot container
   */
  attachClickListener() {
    if (!this.container) return;
    this.container.addEventListener('click', (e) => {
      // Prevent clicking overlays triggering this
      if (e.target.closest('.torty-thought-bubble') || e.target.closest('.torty-badge-popup')) return;
      this.onMascotClick();
    });
  }
}
