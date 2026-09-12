
window.P3ScreenReader = {

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

  extractInteractiveElements() {
    const rawElements = Array.from(document.querySelectorAll(this.INTERACTIVE_SELECTORS));
    const interactiveList = [];
    let tagId = 1;

    rawElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && 
                        window.getComputedStyle(el).visibility !== 'hidden' &&
                        window.getComputedStyle(el).display !== 'none';

      if (isVisible) {
        el.dataset.somId = tagId;

        interactiveList.push({
          id: tagId,
          tagName: el.tagName.toLowerCase(),
          type: el.type || null,
          placeholder: el.placeholder || '',
          innerText: (el.innerText || el.ariaLabel || el.value || '').trim().substring(0, 50),
          boundingBox: {
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
            height: rect.height
          },
          domRef: el
        });

        tagId++;
      }
    });

    console.log(`[Aegis Perception] Identified ${interactiveList.length} interactive viewport nodes.`);
    return interactiveList;
  }
};
