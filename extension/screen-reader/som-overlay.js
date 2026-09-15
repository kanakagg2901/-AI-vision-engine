(function () {
  if (window.__aegisSoMLoaded) {
    console.log('[P3 SoM Engine] Already initialized, skipping duplicate injection.');
    return;
  }
  window.__aegisSoMLoaded = true;

  let somContainer = null;
  let lastElements = [];

  function getOverlayContainer() {
    if (!somContainer || !document.body.contains(somContainer)) {
      somContainer = document.createElement('div');
      somContainer.id = 'som-overlay-container';
      Object.assign(somContainer.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '2147483645'
      });
      document.body.appendChild(somContainer);
    }
    return somContainer;
  }

  function clearOverlay() {
    if (somContainer) somContainer.innerHTML = '';
  }

  // Strips anything non-cloneable so the list can cross the messaging boundary.
  function serializable(list) {
    return list.map((item) => ({
      id: item.id,
      tagName: item.tagName,
      role: item.role,
      type: item.type,
      selector: item.selector,
      placeholder: item.placeholder,
      innerText: item.innerText,
      alt: item.alt || '',
      title: item.title || '',
      isPassword: item.isPassword,
      isSensitive: item.isSensitive,
      isUsernameField: item.isUsernameField,
      boundingBox: { ...item.boundingBox },
      viewportBox: { ...item.viewportBox }
    }));
  }

  function renderSoMOverlay() {
    clearOverlay();
    const container = getOverlayContainer();
    const elements = window.P3DomExtractor.extractInteractiveElements();
    lastElements = elements;

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
        zIndex: '2147483645',
        pointerEvents: 'none'
      });
      container.appendChild(badge);
    });

    return serializable(elements);
  }

  function executeElementAction(actionType, targetId, textValue) {
    const rawElement = document.querySelector(`[data-som-id="${targetId}"]`);
    if (!rawElement) {
      console.error(`[Aegis Executor] Target element [${targetId}] not found!`);
      return { success: false, error: `element ${targetId} not found` };
    }

    if (actionType === 'click') {
      // Badges often sit on an inner span/label/img; resolve up to the real control.
      const clickableParent = rawElement.closest(
        'button, a, input[type="submit"], input[type="button"], [role="button"], figure'
      );
      const targetElement = clickableParent || rawElement;

      try {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) { /* older browsers */ }
      try { targetElement.focus(); } catch (e) { /* non-focusable */ }

      const opts = { bubbles: true, cancelable: true, view: window };
      targetElement.dispatchEvent(new PointerEvent('pointerdown', opts));
      targetElement.dispatchEvent(new MouseEvent('mousedown', opts));
      targetElement.dispatchEvent(new PointerEvent('pointerup', opts));
      targetElement.dispatchEvent(new MouseEvent('mouseup', opts));
      targetElement.click();

      console.log(`[Aegis Executor] Clicked element [${targetId}]`);
      return { success: true };
    }

    if (actionType === 'type') {
      const targetElement = rawElement;
      try {
        targetElement.scrollIntoView({ behavior: 'instant', block: 'center' });
      } catch (e) { /* noop */ }
      targetElement.focus();

      const proto =
        targetElement.tagName.toLowerCase() === 'textarea'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(targetElement, textValue);
      } else {
        targetElement.value = textValue;
      }

      targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      targetElement.dispatchEvent(new Event('change', { bubbles: true }));
      targetElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      console.log(`[Aegis Executor] Typed into element [${targetId}]`);
      return { success: true };
    }

    if (actionType === 'submit') {
      const form = rawElement.closest('form');
      if (form) {
        try {
          form.requestSubmit();
        } catch (e) {
          try { form.submit(); } catch (err) { return { success: false, error: 'submit failed' }; }
        }
        return { success: true };
      }
      return { success: false, error: 'no enclosing form' };
    }

    return { success: false, error: `unknown action ${actionType}` };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RUN_SOM_PERCEPTION') {
      const elements = renderSoMOverlay();
      sendResponse({
        success: true,
        elementCount: elements.length,
        elements,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          dpr: window.devicePixelRatio || 1
        }
      });
      return true;
    }

    if (request.action === 'CLEAR_SOM') {
      clearOverlay();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'EXECUTE_SOM_ACTION') {
      const result = executeElementAction(
        request.actionType,
        request.targetId,
        request.textValue
      );
      sendResponse(result);
      return true;
    }

    if (request.action === 'GET_LAST_ELEMENTS') {
      sendResponse({ success: true, elements: serializable(lastElements) });
      return true;
    }

    return false;
  });

  console.log('[P3 SoM Engine] Perception content script initialized.');
})();