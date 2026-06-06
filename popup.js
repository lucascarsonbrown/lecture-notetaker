const fetchBtn = document.getElementById("fetch-btn");
const copyBtn = document.getElementById("copy-btn");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const wordCountEl = document.getElementById("word-count");
const themeBtn = document.getElementById("theme-btn");

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = "status visible" + (isError ? " error" : "");
}

function hideStatus() {
  statusEl.className = "status";
}

function showTranscript(text) {
  transcriptEl.value = text;
  transcriptEl.className = "transcript-area visible";
  const words = text.trim().split(/\s+/).length;
  wordCountEl.textContent = `${words.toLocaleString()} words`;
  wordCountEl.className = "word-count visible";
  copyBtn.textContent = "Copy Again";
  copyBtn.style.display = "block";
}

// Runs inside the lecture page via scripting.executeScript
function extractTranscript() {
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

  const resources = performance.getEntriesByType("resource");
  const vttEntries = resources.filter(r =>
    r.name.includes("caption_proxy") || r.name.endsWith(".vtt")
  );

  if (vttEntries.length === 0) {
    return {
      ok: false,
      error: `No caption file found. Found ${resources.length} network requests but none were .vtt files. Make sure CC is on and the video has played for a few seconds.`
    };
  }

  // Use the most recently loaded vtt
  const capEntry = vttEntries[vttEntries.length - 1];

  return fetch(capEntry.name)
    .then(resp => {
      if (!resp.ok) {
        return { ok: false, error: `Caption file returned HTTP ${resp.status}. URL: ${capEntry.name}` };
      }
      return resp.text().then(vttText => {
        const plain = vttToPlainText(vttText);
        if (!plain) {
          return { ok: false, error: `Caption file was fetched (${capEntry.name}) but contained no readable text after parsing.` };
        }
        return { ok: true, transcript: plain };
      });
    })
    .catch(err => ({ ok: false, error: `Fetch failed for ${capEntry.name}: ${err.message}` }));
}

fetchBtn.addEventListener("click", async () => {
  fetchBtn.disabled = true;
  copyBtn.style.display = "none";
  transcriptEl.className = "transcript-area";
  wordCountEl.className = "word-count";
  showStatus("Fetching transcript...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const allowedHosts = ["lecturecapture.la.utexas.edu", "tower.la.utexas.edu"];
    if (!allowedHosts.some(h => tab?.url?.includes(h))) {
      throw new Error(
        `Wrong page. This extension only works on lecturecapture.la.utexas.edu or tower.la.utexas.edu. Current page: ${tab?.url ?? "unknown"}`
      );
    }

    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractTranscript,
      });
    } catch (err) {
      throw new Error(`Could not inject script into page: ${err.message}. Try reloading the lecture page.`);
    }

    const result = await results[0].result;

    if (!result?.ok) {
      throw new Error(result?.error ?? "Unknown error from page.");
    }

    await navigator.clipboard.writeText(result.transcript);
    hideStatus();
    showTranscript(result.transcript);
  } catch (err) {
    showStatus(err.message, true);
  } finally {
    fetchBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(transcriptEl.value);
    copyBtn.textContent = "Copied!";
    setTimeout(() => { copyBtn.textContent = "Copy Again"; }, 1500);
  } catch {
    transcriptEl.select();
    document.execCommand("copy");
  }
});

(async () => {
  const { dark } = await chrome.storage.local.get(["dark"]).catch(() => ({}));
  if (dark) {
    document.body.classList.add("dark");
    themeBtn.textContent = "☀️";
  }
})();

themeBtn.addEventListener("click", async () => {
  const isDark = document.body.classList.toggle("dark");
  themeBtn.textContent = isDark ? "☀️" : "🌙";
  await chrome.storage.local.set({ dark: isDark });
});
