const PANEL_ROOT_ID = '__aegis_movable_panel__';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_SCREEN') {
    const tabId = request.tabId;

    const doCapture = (windowId) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError?.message || 'captureVisibleTab returned nothing'
          });
          return;
        }
        sendResponse({ success: true, screenshotUrl: dataUrl });
      });
    };

    if (typeof tabId === 'number') {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          doCapture(null);
        } else {
          doCapture(tab.windowId);
        }
      });
    } else if (sender.tab) {
      doCapture(sender.tab.windowId);
    } else {
      doCapture(null);
    }
    return true;
  }

  if (request.action === 'TOGGLE_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ success: false, error: 'no active tab' });
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: togglePanelInPage,
          args: [PANEL_ROOT_ID, chrome.runtime.getURL('popup/popup.html')]
        },
        () => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ success: true });
          }
        }
      );
    });
    return true;
  }

  return false;
});

// Injected into the page. Builds a draggable container holding an iframe that
// renders the same popup UI, so the panel can be moved anywhere on screen.
function togglePanelInPage(rootId, panelUrl) {
  const existing = document.getElementById(rootId);
  if (existing) {
    existing.remove();
    return;
  }

  const root = document.createElement('div');
  root.id = rootId;
  Object.assign(root.style, {
    position: 'fixed',
    top: '80px',
    right: '32px',
    width: '356px',
    zIndex: '2147483646',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
    border: '1px solid rgba(251,191,36,0.45)',
    background: '#0c0714'
  });

  const handle = document.createElement('div');
  handle.textContent = '⠿  AEGIS — drag to move';
  Object.assign(handle.style, {
    cursor: 'grab',
    padding: '7px 12px',
    font: '600 11px -apple-system, Segoe UI, sans-serif',
    letterSpacing: '0.6px',
    color: '#0c0714',
    background: 'linear-gradient(135deg,#d97706 0%,#fbbf24 100%)',
    userSelect: 'none'
  });

  const closeBtn = document.createElement('span');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    float: 'right',
    fontSize: '15px',
    lineHeight: '11px',
    cursor: 'pointer',
    fontWeight: '800'
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    root.remove();
  });
  handle.appendChild(closeBtn);

  const frame = document.createElement('iframe');
  frame.src = panelUrl;
  frame.setAttribute(
    'allow',
    'publickey-credentials-get *; publickey-credentials-create *; microphone *'
  );
  Object.assign(frame.style, {
    width: '100%',
    height: '620px',
    border: 'none',
    display: 'block',
    background: '#0c0714'
  });

  root.appendChild(handle);
  root.appendChild(frame);
  document.body.appendChild(root);

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    const rect = root.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    root.style.right = 'auto';
    root.style.left = `${rect.left}px`;
    root.style.top = `${rect.top}px`;
    handle.style.cursor = 'grabbing';
    // Block the iframe from swallowing mousemove while dragging.
    frame.style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const maxLeft = window.innerWidth - root.offsetWidth;
    const maxTop = window.innerHeight - 40;
    root.style.left = `${Math.min(Math.max(0, e.clientX - offsetX), maxLeft)}px`;
    root.style.top = `${Math.min(Math.max(0, e.clientY - offsetY), maxTop)}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    frame.style.pointerEvents = 'auto';
  });
}