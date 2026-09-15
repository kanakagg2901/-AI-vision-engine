// P2: Voice Control with Two-Stage Voice Workflow & Auto Permission Request
// 1. Say "Hey Agent <command>" -> Populates text input box
// 2. Say "Execute" -> Runs the agent task hands-free!

window.AegisVoice = {
  recognition: null,
  isListening: false,
  isWakeActivated: false,
  hasCommand: false,

  async requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately after acquiring permission
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.warn("Microphone permission prompt dismissed or denied:", err.name);
      return false;
    }
  },

  async init(onCommandCaptured, onExecuteTriggered, onStatusChange, logConsole) {
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
      this.hasCommand = false;
      if (onStatusChange) onStatusChange('Say "Hey Agent <command>"', true);
      if (logConsole) logConsole("Voice Engine Ready. Say 'Hey Agent <command>', then say 'Execute'.");
    };

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      
      const lowerText = transcript.toLowerCase().trim();
      const wakePhrases = ["hey agent", "ok agent", "hi agent", "hello agent", "agent"];

      // STAGE 2: WAITING FOR VOICE EXECUTION TRIGGER ("EXECUTE" / "RUN")
      if (this.hasCommand) {
        if (lowerText.includes("execute") || lowerText.includes("run") || lowerText.includes("start")) {
          if (onStatusChange) onStatusChange('Executing directive...', true);
          if (logConsole) logConsole('Voice command "Execute" confirmed! Triggering task...');
          this.hasCommand = false;
          if (onExecuteTriggered) onExecuteTriggered();
        }
        return;
      }

      // STAGE 1: WAIT FOR WAKE WORD ("Hey Agent")
      let matchedPhrase = wakePhrases.find(phrase => lowerText.includes(phrase));

      if (matchedPhrase) {
        this.isWakeActivated = true;
        const commandAfterWake = lowerText.split(matchedPhrase)[1]?.trim();

        if (commandAfterWake && commandAfterWake.length > 2) {
          this.hasCommand = true;
          if (onCommandCaptured) onCommandCaptured(commandAfterWake);
          if (onStatusChange) onStatusChange('Command ready! Say "Execute" to run', true);
          if (logConsole) logConsole(`Captured: "${commandAfterWake}". Now say "Execute" to start.`);
        } else {
          if (onStatusChange) onStatusChange('Activated! Speak command...', true);
        }
      } else if (this.isWakeActivated && lowerText.length > 2) {
        this.hasCommand = true;
        if (onCommandCaptured) onCommandCaptured(lowerText);
        if (onStatusChange) onStatusChange('Command ready! Say "Execute" to run', true);
        if (logConsole) logConsole(`Captured: "${lowerText}". Now say "Execute" to start.`);
      }
    };

    this.recognition.onerror = async (event) => {
      if (event.error === 'not-allowed') {
        if (onStatusChange) onStatusChange('Mic Access Blocked', false);
        if (logConsole) logConsole('Mic permission required! Opening permission tab...');
        
        // Open extension page in tab so Chrome displays the native Allow/Block prompt
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
        }
      } else {
        if (logConsole) logConsole(`Voice Error: ${event.error}`);
      }
      this.stop();
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        try { this.recognition.start(); } catch (e) {}
      } else {
        if (onStatusChange) onStatusChange('Click mic or say "Hey Agent"', false);
      }
    };

    // Request Mic permission before starting
    const permitted = await this.requestMicPermission();
    if (permitted) {
      this.start();
    } else {
      if (onStatusChange) onStatusChange('Click mic to grant permission', false);
      if (logConsole) logConsole("Microphone permission needed. Click mic button.");
    }
  },

  async start() {
    if (this.recognition && !this.isListening) {
      this.isWakeActivated = false;
      this.hasCommand = false;
      const permitted = await this.requestMicPermission();
      if (permitted) {
        try { this.recognition.start(); } catch (e) {}
      } else {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
        }
      }
    }
  },

  stop() {
    this.isListening = false;
    this.isWakeActivated = false;
    this.hasCommand = false;
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }
};
