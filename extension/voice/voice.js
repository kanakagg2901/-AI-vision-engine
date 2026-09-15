window.AegisVoice = (function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let listening = false;
  let awake = false;
  let transcript = '';

  let onCommand = () => {};
  let onExecute = () => {};
  let onStatus = () => {};
  let onLog = () => {};

  const WAKE_WORD = /\bhey,?\s*(agent|aegis)\b/i;
  const EXECUTE_WORD = /\bexecute\b|\bgo ahead\b|\brun it\b/i;

  function stripControlWords(text) {
    return text
      .replace(WAKE_WORD, ' ')
      .replace(EXECUTE_WORD, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function ensureMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      onLog(`Microphone blocked (${err.name}). Opening a full tab to grant access.`);
      // Chrome will not show the mic prompt inside a small popup once dismissed.
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
      return false;
    }
  }

  function build() {
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      listening = true;
      onStatus('Listening — say "Hey Agent", then "Execute"', true);
    };

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          transcript += ` ${chunk}`;
        } else {
          interim += chunk;
        }
      }

      const combined = `${transcript} ${interim}`.trim();

      if (!awake && WAKE_WORD.test(combined)) {
        awake = true;
        onLog('Wake word detected. Keep talking, then say "Execute".');
      }

      if (awake) {
        // Stream the whole directive continuously; never lock after a few words.
        const cleaned = stripControlWords(combined);
        if (cleaned) onCommand(cleaned);
      }

      // Only fire on a finalised "execute", so a partial word can't trigger it.
      const finalText = transcript.trim();
      if (awake && EXECUTE_WORD.test(finalText)) {
        const directive = stripControlWords(finalText);
        transcript = '';
        awake = false;
        if (directive) onCommand(directive);
        onExecute();
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      onLog(`Speech recognition error: ${event.error}`);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listening = false;
        onStatus('Microphone permission needed', false);
      }
    };

    rec.onend = () => {
      if (listening) {
        // Chrome ends the stream periodically; restart to stay continuous.
        try {
          rec.start();
        } catch (e) {
          listening = false;
          onStatus('Click mic or say "Hey Agent"', false);
        }
      } else {
        onStatus('Click mic or say "Hey Agent"', false);
      }
    };

    return rec;
  }

  return {
    init(commandCb, executeCb, statusCb, logCb) {
      onCommand = commandCb || onCommand;
      onExecute = executeCb || onExecute;
      onStatus = statusCb || onStatus;
      onLog = logCb || onLog;

      if (!SpeechRecognition) {
        onStatus('Voice not supported in this browser', false);
        onLog('Web Speech API unavailable; use the text box instead.');
      }
    },

    async start() {
      if (!SpeechRecognition) return;
      if (!(await ensureMicPermission())) return;
      if (!recognition) recognition = build();
      transcript = '';
      awake = false;
      listening = true;
      try {
        recognition.start();
      } catch (e) {
        // start() throws if already running; harmless.
      }
    },

    stop() {
      listening = false;
      awake = false;
      transcript = '';
      if (recognition) {
        try { recognition.stop(); } catch (e) { /* noop */ }
      }
      onStatus('Click mic or say "Hey Agent"', false);
    }
  };
})();