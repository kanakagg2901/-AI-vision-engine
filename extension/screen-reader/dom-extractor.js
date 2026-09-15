window.P3DomExtractor = {

  INTERACTIVE_SELECTORS: [
    'button',
    'input',
    'textarea',
    'select',
    'a[href]',
    'img',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="textbox"]'
  ].join(','),

  getElementLabel(el) {
    // 1. Explicit aria-label
    if (el.getAttribute('aria-label')) {
      return el.getAttribute('aria-label').trim();
    }

    // 2. Associated <label for="...">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) {
        return label.innerText.trim();
      }
    }

    // 3. Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) {
      return parentLabel.innerText
        .replace(el.value || '', '')
        .trim();
    }

    // 4. Placeholder
    if (el.placeholder) {
      return el.placeholder.trim();
    }

    // 5. name attribute
    if (el.name) {
      return el.name.trim();
    }

    // 6. id attribute
    if (el.id) {
      return el.id.trim();
    }

    // 7. Existing visible text/value/alt
    return (
      el.innerText ||
      el.value ||
      el.alt ||
      ''
    ).trim();
  },

  extractInteractiveElements() {

    const rawElements = Array.from(
      document.querySelectorAll(this.INTERACTIVE_SELECTORS)
    );

    const interactiveList = [];
    let tagId = 1;

    rawElements.forEach((el) => {

      const rect = el.getBoundingClientRect();

      const style = window.getComputedStyle(el);

      const isVisible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none';

      if (!isVisible) return;

      el.dataset.somId = tagId;

      const label = this.getElementLabel(el);

      interactiveList.push({

        id: tagId,

        tagName: el.tagName.toLowerCase(),

        type: el.type || null,

        placeholder: el.placeholder || '',

        innerText: label.substring(0, 80),

        boundingBox: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        },

        domRef: el
      });

      tagId++;
    });

    console.log(
      `[P3 DOM Extractor] Identified ${interactiveList.length} interactive viewport nodes.`
    );

    console.table(
      interactiveList.map(el => ({
        id: el.id,
        tag: el.tagName,
        type: el.type,
        label: el.innerText
      }))
    );

    return interactiveList;
  }
};