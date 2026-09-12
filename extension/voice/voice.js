// P2: Voice Control with Strict Wake-Word Activation ("Hey Agent")
// Ignores all speech UNTIL the wake phrase "Hey Agent" is spoken!

window.AegisVoice = {
  recognition: null,
  isListening: false,
  isWakeActivated: false, // Strict flag: false until "Hey Agent" is heard

  init(onCommandCaptured, onStatusChange, logConsole) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      if (onStatusChange) onStatusChange("Voice API unavailable in this browser", false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN'; // Indian English accent support

    this.recognition.onstart = () => {
      this.isListening = true;
      this.isWakeActivated = false;
      if (onStatusChange) onStatusChange('Waiting for wake phrase... (Say "Hey Agent")', true);
      if (logConsole) logConsole("Voice Engine Standby. Say 'Hey Agent' to activate.");
    };

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      
      const lowerText = transcript.toLowerCase().trim();
      const wakePhrases = ["hey agent", "ok agent", "hi agent", "hello agent", "agent"];

      // -------------------------------------------------------------
      // STAGE 1: WAIT FOR STRICT WAKE-WORD ("Hey Agent")
      // -------------------------------------------------------------
      if (!this.isWakeActivated) {
        let matchedPhrase = wakePhrases.find(phrase => lowerText.includes(phrase));

        if (matchedPhrase) {
          this.isWakeActivated = true; // Unlock activation!
          const commandAfterWake = lowerText.split(matchedPhrase)[1]?.trim();

          if (onStatusChange) onStatusChange('Activated! Speak command...', true);
          if (logConsole) logConsole(`Wake Word "Hey Agent" Detected! Listening for command...`);

          // If user said "Hey Agent fill registration form" in a single sentence
          if (commandAfterWake && commandAfterWake.length > 2) {
            if (onCommandCaptured) onCommandCaptured(commandAfterWake, true);
            this.stop();
          }
        } else {
          // Ignore all speech prior to saying "Hey Agent"
          if (logConsole) logConsole(`[Ignored audio - Wake phrase needed]: "${transcript}"`);
        }
      } 
      // -------------------------------------------------------------
      // STAGE 2: AFTER WAKE-WORD IS ACTIVATED -> CAPTURE COMMAND
      // -------------------------------------------------------------
      else {
        if (lowerText.length > 2) {
          if (onCommandCaptured) onCommandCaptured(lowerText, true);
          this.stop();
        }
      }
    };

    this.recognition.onerror = (event) => {
      if (logConsole) logConsole(`Voice Error: ${event.error}`);
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try { this.recognition.start(); } catch (e) {}
      } else {
        if (onStatusChange) onStatusChange('Click mic or say "Hey Agent"', false);
      }
    };

    this.start();
  },

  start() {
    if (this.recognition && !this.isListening) {
      this.isWakeActivated = false;
      try { this.recognition.start(); } catch (e) {}
    }
  },

  stop() {
    this.isListening = false;
    this.isWakeActivated = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }
};
