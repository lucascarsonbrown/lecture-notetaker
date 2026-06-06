function vttToPlainText(vttText) {
  return vttText
    .split(/\r?\n/)
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t === "WEBVTT") return false;
      if (/^\d+$/.test(t)) return false;
      if (t.includes("-->")) return false;
      return true;
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getTranscript() {
  const resources = performance.getEntriesByType("resource");
  const capEntry = resources.find(r => r.name.includes("caption_proxy") || r.name.endsWith(".vtt"));

  if (!capEntry) {
    throw new Error(
      "No captions found. Toggle CC on, scrub the video a bit, then try again."
    );
  }

  const resp = await fetch(capEntry.name);
  if (!resp.ok) {
    throw new Error(`Failed to fetch captions: ${resp.status} ${resp.statusText}`);
  }

  const vttText = await resp.text();
  const plain = vttToPlainText(vttText);

  if (!plain) {
    throw new Error("Captions were fetched but produced empty text.");
  }

  return plain;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_TRANSCRIPT") {
    (async () => {
      try {
        const transcript = await getTranscript();
        sendResponse({ ok: true, transcript });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }
});
