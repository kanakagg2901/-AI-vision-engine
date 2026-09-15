// P2: Voice Control with Two-Stage Voice Workflow:
// 1. Say "Hey Agent <command>" -> Populates text input box
// 2. Say "Execute" -> Runs the agent task hands-free!

window.AegisVoice = {
  recognition: null,
  isListening: false,
  isWakeActivated: false,
  hasCommand: false,

  init(onCommandCaptured, onExecuteTriggered, onStatusChange, logConsole) {
    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      if (onStatusChange) onStatusChange("Voice API unavailable in this browser", false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';

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

      if (this.hasCommand) {
        if (lowerText.includes("execute") || lowerText.includes("run") || lowerText.includes("start")) {
          if (onStatusChange) onStatusChange('Executing directive...', true);
          if (logConsole) logConsole('Voice command "Execute" confirmed! Triggering task...');
          this.hasCommand = false;
          if (onExecuteTriggered) onExecuteTriggered();
        }
        return;
      }

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
  },

  start() {
    if (this.recognition && !this.isListening) {
      this.isWakeActivated = false;
      this.hasCommand = false;
      try { this.recognition.start(); } catch (e) {}
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