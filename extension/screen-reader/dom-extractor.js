window.P3DomExtractor = {

  INTERACTIVE_SELECTORS: [
    'button',
    'input',
    'textarea',
    'select',
    'a[href]',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="textbox"]'
  ].join(','),

  cssPath(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName
        );
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  },

  roleOf(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'submit' || t === 'button') return 'button';
      if (t === 'checkbox' || t === 'radio') return t;
      return 'input';
    }
    return tag;
  },

  extractInteractiveElements() {
    const rawElements = Array.from(document.querySelectorAll(this.INTERACTIVE_SELECTORS));
    const interactiveList = [];
    let tagId = 1;

    rawElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0';

      if (!isVisible) return;

      el.dataset.somId = tagId;

      const typeAttr = (el.type || '').toLowerCase();
      const nameAttr = (el.name || '').toLowerCase();
      const idAttr = (el.id || '').toLowerCase();
      const autoAttr = (el.autocomplete || '').toLowerCase();

      const isPassword =
        typeAttr === 'password' ||
        nameAttr.includes('pass') ||
        idAttr.includes('pass') ||
        autoAttr.includes('password');

      const isSensitive =
        isPassword ||
        typeAttr === 'creditcard' ||
        nameAttr.includes('cvv') ||
        idAttr.includes('ssn') ||
        idAttr.includes('aadhaar') ||
        autoAttr.includes('cc-');

      // PII Redaction Guard: plain passwords and sensitive values never leave
      // this function in readable form.
      let safeLabel = '';
      if (isPassword) {
        safeLabel = '[REDACTED_PASSWORD]';
      } else if (isSensitive) {
        safeLabel = '[REDACTED_PII]';
      } else {
        safeLabel = (
          el.innerText ||
          el.ariaLabel ||
          el.getAttribute('aria-label') ||
          el.placeholder ||
          el.value ||
          ''
        )
          .trim()
          .substring(0, 50);
      }

      const isUsernameField =
        !isPassword &&
        (el.tagName.toLowerCase() === 'input') &&
        (['text', 'email', 'tel', ''].includes(typeAttr)) &&
        (nameAttr.includes('user') ||
          nameAttr.includes('email') ||
          nameAttr.includes('login') ||
          nameAttr.includes('account') ||
          idAttr.includes('user') ||
          idAttr.includes('email') ||
          idAttr.includes('login') ||
          typeAttr === 'email' ||
          autoAttr.includes('username') ||
          autoAttr.includes('email'));

      interactiveList.push({
        id: tagId,
        tagName: el.tagName.toLowerCase(),
        role: this.roleOf(el),
        type: el.type || null,
        selector: this.cssPath(el),
        placeholder: isPassword ? '••••••••' : (el.placeholder || ''),
        innerText: safeLabel,
        isPassword,
        isSensitive,
        isUsernameField,
        // Absolute page coordinates (used for placing SoM badges).
        boundingBox: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        },
        // Viewport-relative coordinates, in CSS pixels. These are what the
        // screenshot blackout needs, since captureVisibleTab only returns the
        // visible viewport.
        viewportBox: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      });

      tagId++;
    });

    console.log(`[P3 DOM Extractor] Identified ${interactiveList.length} interactive viewport nodes.`);
    return interactiveList;
  }
};