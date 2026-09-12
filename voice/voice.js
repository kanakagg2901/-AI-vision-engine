// P2: Voice Control & Hands-Free Wake-Word Module ("Hey Agent")

window.AegisVoice = {
  recognition: null,
  isListening: false,

  init(onCommandCaptured, onStatusChange, logConsole) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      if (onStatusChange) onStatusChange("Voice API unavailable in this browser");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN'; // Indian English accent support

    this.recognition.onstart = () => {
      this.isListening = true;
      if (onStatusChange) onStatusChange('Auto-Listening... (Speak command directly)', true);
      if (logConsole) logConsole("Voice engine active. Speak your command!");
    };

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      
      const lowerText = transcript.toLowerCase().trim();
      if (logConsole) logConsole(`Live audio input: "${transcript}"`);

      const wakePhrases = ["hey agent", "ok agent", "hi agent", "hello agent", "agent"];
      let matchedPhrase = wakePhrases.find(phrase => lowerText.includes(phrase));

      if (matchedPhrase) {
        const command = lowerText.split(matchedPhrase)[1]?.trim() || lowerText.trim();
        if (command.length > 2) {
          if (onCommandCaptured) onCommandCaptured(command);
          this.stop();
        }
      } else if (lowerText.length > 3) {
        if (onCommandCaptured) onCommandCaptured(transcript, false);
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
        if (onStatusChange) onStatusChange('Click mic to re-enable voice', false);
      }
    };

    this.start();
  },

  start() {
    if (this.recognition && !this.isListening) {
      try { this.recognition.start(); } catch (e) {}
    }
  },

  stop() {
    this.isListening = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }
};
