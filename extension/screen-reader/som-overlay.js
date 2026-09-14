
(function () {
  let somContainer = null;

  function getOverlayContainer() {
    if (!somContainer) {
      somContainer = document.createElement('div');
      somContainer.id = 'som-overlay-container';
      somContainer.style.position = 'absolute';
      somContainer.style.top = '0';
      somContainer.style.left = '0';
      somContainer.style.width = '100%';
      somContainer.style.height = '100%';
      somContainer.style.pointerEvents = 'none';
      somContainer.style.zIndex = '2147483647';
      document.body.appendChild(somContainer);
    }
    return somContainer;
  }

  function clearOverlay() {
    if (somContainer) {
      somContainer.innerHTML = '';
    }
  }

  function renderSoMOverlay() {
    clearOverlay();
    const container = getOverlayContainer();

    const elements = window.P3DomExtractor.extractInteractiveElements();

    elements.forEach((item) => {
      const badge = document.createElement('div');
      badge.className = 'aegis-som-badge';
      badge.innerText = item.id;
      Object.assign(badge.style, {
        position: 'absolute',
        top: `${item.boundingBox.top}px`,
        left: `${item.boundingBox.left}px`,
        background: 'linear-gradient(135deg, #d97706 0%, #fbbf24 100%)',
        color: '#0c0714',
        fontSize: '11px',
        fontFamily: '-apple-system, sans-serif',
        fontWeight: '800',
        padding: '2px 6px',
        borderRadius: '4px',
        border: '1px solid #ffffff',
        boxShadow: '0 2px 10px rgba(251, 191, 36, 0.5)',
        zIndex: '2147483647',
        pointerEvents: 'none'
      });

      container.appendChild(badge);
    });

    return elements.length;
  }

  function executeElementAction(actionType, targetId, textValue) {
    const targetElement = document.querySelector(`[data-som-id="${targetId}"]`);
    if (!targetElement) {
      console.error(`[Aegis Executor] Target element [${targetId}] not found!`);
      return false;
    }

    if (actionType === 'click') {
      targetElement.click();
      targetElement.focus();
      console.log(`[Aegis Executor] Clicked element [${targetId}]`);
    } else if (actionType === 'type') {
      targetElement.focus();
      targetElement.value = textValue;
      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`[Aegis Executor] Typed "${textValue}" into element [${targetId}]`);
    }
    return true;
  }

  function executeScroll(direction, amountPx) {
    const delta = (amountPx || 400) * (direction === 'up' ? -1 : 1);
    window.scrollBy({ top: delta, behavior: 'smooth' });
    console.log(`[Aegis Executor] Scrolled ${direction} by ${amountPx || 400}px`);
    return true;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "RUN_SOM_PERCEPTION") {
      const count = renderSoMOverlay();
      sendResponse({ success: true, elementCount: count });
    }

    if (request.action === "CLEAR_SOM") {
      clearOverlay();
      sendResponse({ success: true });
    }

    if (request.action === "EXECUTE_SOM_ACTION") {
      let result;
      if (request.actionType === 'scroll') {
        result = executeScroll(request.direction, request.amount);
      } else {
        // agent-loop.js sends element_id as "el_<n>" (schema-adapter.js prefix);
        // dom-extractor.js only ever wrote the bare numeric id to data-som-id.
        const bareId = String(request.targetId).replace(/^el_/, '');
        result = executeElementAction(request.actionType, bareId, request.textValue);
      }
      sendResponse({ success: result });
    }

    // ---- New: queries needed by extension/agent/agent-loop.js ----
    // These were the missing glue points — the DOM-extraction logic already
    // existed in dom-extractor.js, it just had no message handler exposing
    // it outside the RUN_SOM_PERCEPTION overlay-rendering path.
    if (request.action === "GET_INTERACTIVE_ELEMENTS") {
      try {
        const elements = window.P3DomExtractor.extractInteractiveElements();
        // strip domRef (a live DOM node) before it crosses the messaging
        // boundary — chrome.runtime messages must be JSON-serializable
        const serializable = elements.map(({ domRef, ...rest }) => rest);
        sendResponse({ success: true, elements: serializable });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    }

    if (request.action === "GET_VIEWPORT_SIZE") {
      sendResponse({ innerWidth: window.innerWidth, innerHeight: window.innerHeight });
    }

    if (request.action === "GET_URL_DOMAIN") {
      sendResponse({ domain: window.location.hostname });
    }
  });

  console.log("[P3 SoM Engine] Royal Imperial Perception content script initialized.");
})();
