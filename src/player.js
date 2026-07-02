export class SyncedAudioPlayer {
  constructor() {
    this.currentPodcast = null;
    this.transcript = null;
    this.isPlaying = false;
    this.currentTime = 0; // milliseconds
    this.playbackRate = 1.0;
    this.audioElement = document.createElement('audio');
    this.audioElement.id = 'lingu-alphabet-audio';
    this.audioElement.preload = 'auto';
    this.audioElement.setAttribute('playsinline', '');
    this.audioElement.style.display = 'none';
    this.ensureAudioElement();
    this.wordBoundaryCallback = null;
    this.stateChangeCallback = null;
    this.lastError = null;
    
    // Web Speech Synthesis state
    this.speechSynthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.useTTS = false; // Toggle between actual audio stream and TTS simulation
    
    this.timerInterval = null;

    // Set up HTML5 Audio events
    this.audioElement.addEventListener('timeupdate', () => {
      if (!this.useTTS && this.isPlaying) {
        this.currentTime = this.audioElement.currentTime * 1000;
        if (this.wordBoundaryCallback) {
          this.wordBoundaryCallback(this.currentTime);
        }
      }
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      if (this.stateChangeCallback) {
        this.stateChangeCallback('ended');
      }
    });

    this.audioElement.addEventListener('error', () => {
      this.isPlaying = false;
      this.lastError = new Error('Audio could not be loaded. Check your connection and try again.');
      if (this.stateChangeCallback && !this.useTTS) {
        this.stateChangeCallback('error', this.lastError);
      }
    });

    this.audioElement.addEventListener('loadstart', () => {
      if (this.stateChangeCallback && this.isPlaying) {
        this.stateChangeCallback('buffering');
      }
    });

    this.audioElement.addEventListener('waiting', () => {
      if (this.stateChangeCallback && this.isPlaying) {
        this.stateChangeCallback('buffering');
      }
    });

    this.audioElement.addEventListener('playing', () => {
      if (this.stateChangeCallback && this.isPlaying) {
        this.stateChangeCallback('play');
      }
    });

    this.audioElement.addEventListener('canplay', () => {
      if (this.stateChangeCallback && this.isPlaying) {
        this.stateChangeCallback('play');
      }
    });
  }

  ensureAudioElement() {
    if (!this.audioElement) return;
    if (!this.audioElement.isConnected && document.body) {
      document.body.appendChild(this.audioElement);
    }
  }

  loadPodcast(podcastData, transcriptData) {
    this.pause();
    this.currentPodcast = podcastData;
    this.transcript = transcriptData;
    this.currentTime = 0;

    if (!this.useTTS) {
      this.ensureAudioElement();
      this.lastError = null;

      if (!podcastData?.audioUrl) {
        this.lastError = new Error('No audio URL available for this lesson.');
        if (this.stateChangeCallback) {
          this.stateChangeCallback('error', this.lastError);
        }
        return false;
      }

      this.audioElement.src = podcastData.audioUrl;
      this.audioElement.playbackRate = this.playbackRate;
      this.audioElement.load();
    }

    return true;
  }

  play() {
    if (!this.currentPodcast) return;
    this.ensureAudioElement();
    this.isPlaying = true;

    if (this.useTTS) {
      // Use Web Speech Synthesis API
      this.speechSynthesis.cancel(); // Stop any active speech
      
      const fullText = this.transcript.content
        .map(section => section.text)
        .join(" ");

      this.currentUtterance = new SpeechSynthesisUtterance(fullText);
      this.currentUtterance.rate = this.playbackRate;
      
      // Select appropriate language voice
      const langMap = {
        'English': 'en-US',
        'Spanish': 'es-ES',
        'German': 'de-DE',
        'Russian': 'ru-RU',
        'Uzbek': 'tr-TR', // Uzbek is rarely built-in, fallback to Turkish or generic
        'French': 'fr-FR'
      };
      this.currentUtterance.lang = langMap[this.currentPodcast.language] || 'en-US';

      // Detect word boundaries
      let charIndexOffset = 0;
      this.currentUtterance.onboundary = (event) => {
        if (event.name === 'word') {
          // Estimate current time based on character index (avg 120ms per character)
          this.currentTime = event.charIndex * 60;
          if (this.wordBoundaryCallback) {
            this.wordBoundaryCallback(this.currentTime);
          }
        }
      };

      this.currentUtterance.onend = () => {
        this.isPlaying = false;
        if (this.stateChangeCallback) {
          this.stateChangeCallback('ended');
        }
      };

      this.speechSynthesis.speak(this.currentUtterance);
    } else {
      const startPlayback = () => {
        this.audioElement.playbackRate = this.playbackRate;
        this.audioElement.currentTime = this.currentTime / 1000;

        this.audioElement.play().catch(err => {
          this.isPlaying = false;
          this.lastError = err;
          if (this.stateChangeCallback) {
            this.stateChangeCallback('error', err);
          }
        });
      };

      if (this.lastError && this.currentPodcast?.audioUrl) {
        this.lastError = null;
        this.audioElement.src = this.currentPodcast.audioUrl;
        this.audioElement.load();
      }

      if (this.audioElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        startPlayback();
      } else {
        if (this.stateChangeCallback) {
          this.stateChangeCallback('buffering');
        }
        this.audioElement.addEventListener('canplay', startPlayback, { once: true });
      }
    }

    if (this.stateChangeCallback) {
      this.stateChangeCallback('play');
    }
  }

  pause() {
    this.isPlaying = false;
    
    if (this.useTTS) {
      this.speechSynthesis.pause();
    } else {
      this.audioElement.pause();
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.stateChangeCallback) {
      this.stateChangeCallback('pause');
    }
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
    if (!this.useTTS) {
      this.audioElement.playbackRate = this.playbackRate;
    } else if (this.isPlaying) {
      // TTS rates cannot be modified dynamically, need to restart speech
      this.seek(this.currentTime);
    }
  }

  setVolume(volume) {
    this.audioElement.volume = Math.max(0.0, Math.min(1.0, volume));
  }

  getCurrentWord() {
    if (!this.transcript) return null;
    for (let section of this.transcript.content) {
      const wordTimestamps = section.wordTimestamps || [];
      for (let i = 0; i < wordTimestamps.length; i++) {
        const wt = wordTimestamps[i];
        const nextWt = wordTimestamps[i + 1];
        const endTime = nextWt ? nextWt.timeMs : wt.timeMs + 800; // default duration 800ms
        
        if (wt.timeMs <= this.currentTime && this.currentTime < endTime) {
          return {
            word: wt.word,
            timeMs: wt.timeMs,
            sectionIndex: this.transcript.content.indexOf(section),
            wordIndex: i
          };
        }
      }
    }
    return null;
  }

  seek(timeMs) {
    this.currentTime = Math.max(0, timeMs);
    
    if (this.useTTS) {
      // For Speech Synthesis, seeking is complex since we have to estimate the word character index
      // We will cancel and restart speech from the estimated text offset
      this.speechSynthesis.cancel();
      if (this.isPlaying) {
        this.play();
      }
    } else {
      this.audioElement.currentTime = this.currentTime / 1000;
      if (this.wordBoundaryCallback) {
        this.wordBoundaryCallback(this.currentTime);
      }
    }
  }

  onWordBoundary(callback) {
    this.wordBoundaryCallback = callback;
  }

  onStateChange(callback) {
    this.stateChangeCallback = callback;
  }

  toggleTTS(enable) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.useTTS = enable;
    if (this.currentPodcast) {
      this.loadPodcast(this.currentPodcast, this.transcript);
      if (wasPlaying) {
        this.play();
      }
    }
  }

  // Mock Timer Fallback (for unsupported browser audio environments)
  mockPlayTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    let lastTime = Date.now();
    this.timerInterval = setInterval(() => {
      if (this.isPlaying) {
        const now = Date.now();
        const delta = (now - lastTime) * this.playbackRate;
        this.currentTime += delta;
        lastTime = now;
        
        if (this.wordBoundaryCallback) {
          this.wordBoundaryCallback(this.currentTime);
        }
        
        if (this.currentPodcast && this.currentTime >= this.getTotalDurationMs()) {
          clearInterval(this.timerInterval);
          this.isPlaying = false;
          if (this.stateChangeCallback) {
            this.stateChangeCallback('ended');
          }
        }
      } else {
        clearInterval(this.timerInterval);
      }
    }, 50);
  }

  getTotalDurationMs() {
    if (this.transcript?.duration) return this.transcript.duration;
    if (Number.isFinite(this.audioElement.duration) && this.audioElement.duration > 0) {
      return this.audioElement.duration * 1000;
    }
    return (this.currentPodcast?.duration || 0) * 60 * 1000;
  }
}
