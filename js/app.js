// =====================
// ELEMENT REFERENCES
// =====================
const speakBtn = document.getElementById("speakBtn");
const statusEl = document.getElementById("status");
const originalTranscriptEl = document.getElementById("originalTranscript");
const transcriptEl = document.getElementById("transcript");
const cleanedTranscriptEl = document.getElementById("cleanedTranscript");
const suggestionsEl = document.getElementById("suggestions");
const repeatsEl = document.getElementById("repeats");

const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const saveBtn = document.getElementById("saveBtn");
const latencyEl = document.getElementById("latency");

const dictationToggle = document.getElementById("dictationToggle");
const autocorrectToggle = document.getElementById("autocorrectToggle");
const toneSelect = document.getElementById("toneSelect");

// =============================
// RULE-BASED TEXT CLEANING (NO ML)
// =============================
const fillerWords = [
  "um",
  "umm",
  "uh",
  "uhh",
  "ah",
  "er",
  "you know",
  "like",
  "matlab",
  "actually",
  "basically",
  "literally",
  "hmm",
  "mm",
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeFillers(text) {
  for (let f of fillerWords) {
    const re = new RegExp(`\\b${escapeRegExp(f)}\\b`, "gi");
    text = text.replace(re, "");
  }
  return text.replace(/\s+/g, " ").trim();
}

function removeRepeatedPhrases(text, maxGram = 4) {
  let words = text.split(/\s+/);
  for (let L = maxGram; L >= 2; L--) {
    for (let i = 0; i + 2 * L <= words.length; i++) {
      let match = true;
      for (let k = 0; k < L; k++) {
        if (words[i + k].toLowerCase() !== words[i + L + k].toLowerCase()) {
          match = false;
          break;
        }
      }
      if (match) words.splice(i + L, L);
    }
  }
  return words.join(" ");
}

function autoPunctuate(text) {
  let parts = text.split(/\s+(?=(?:and|but|so|because)\b)/i);
  let out = "";
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    p = p.charAt(0).toUpperCase() + p.slice(1);
    if (!/[.!?]$/.test(p)) p += ".";
    out += p + " ";
  }
  return out.trim();
}

function fixCapitalization(text) {
  return text.replace(/(^\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
}

function fixPronounI(text) {
  return text.replace(/\bi\b/g, "I");
}

function removeDoublePunctuation(text) {
  return text.replace(/([.!?])\1+/g, "$1");
}

function fixPunctuationSpacing(text) {
  return text.replace(/\s+([.!?])/g, "$1").replace(/([.!?])(\w)/g, "$1 $2");
}

function mergeShortSentences(text) {
  let sentences = text.split(/(?<=[.!?])\s+/);
  let out = [];
  for (let s of sentences) {
    let words = s
      .trim()
      .replace(/[.!?]$/, "")
      .split(/\s+/)
      .filter(Boolean);
    if (words.length > 0 && out.length > 0 && words.length <= 3) {
      out[out.length - 1] =
        out[out.length - 1].replace(/[.!?]$/, "") + ", " + s.trim();
    } else {
      out.push(s.trim());
    }
  }
  return out.join(" ");
}

function autoParagraph(text) {
  let sentences = text.split(/(?<=[.!?])\s+/);
  let out = "";
  let count = 0;
  for (let s of sentences) {
    out += s.trim() + " ";
    count += s.length;
    if (count > 120) {
      out += "\n\n";
      count = 0;
    }
  }
  return out.trim();
}

function removeSmallRepeats(text) {
  return text.replace(/\b(\w{2,6})\b\s+\b\1\b/gi, "$1");
}

function cleanText(raw) {
  let t = (raw || "").toLowerCase();

  t = removeFillers(t);
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");
  t = removeRepeatedPhrases(t);
  t = autoPunctuate(t);
  t = fixCapitalization(t);
  t = fixPronounI(t);
  t = removeSmallRepeats(t);
  t = removeDoublePunctuation(t);
  t = fixPunctuationSpacing(t);
  t = mergeShortSentences(t);
  t = autoParagraph(t);

  return t.trim();
}

// ===============================
// TONE REWRITE
// ===============================
function applyTone(text, mode) {
  if (!text) return "";
  switch (mode) {
    case "professional":
      return toProfessional(text);
    case "friendly":
      return toFriendly(text);
    case "chat":
      return toChat(text);
    default:
      return text;
  }
}

function toProfessional(text) {
  let t = text;
  const map = [
    [/\bokay\b/gi, "Certainly"],
    [/\bok\b/gi, "Understood"],
    [/\bi think\b/gi, "I believe"],
    [/\bmaybe\b/gi, "perhaps"],
    [/\bcan't\b/gi, "cannot"],
    [/\bwon't\b/gi, "will not"],
    [/\bthanks\b/gi, "Thank you"],
  ];
  for (const [p, r] of map) t = t.replace(p, r);
  return fixCapitalization(t);
}

function toFriendly(text) {
  let t = text;
  const map = [
    [/\bokay\b/gi, "Sure"],
    [/\bhello\b/gi, "Hey"],
    [/\bthanks\b/gi, "Thanks!"],
  ];
  for (const [p, r] of map) t = t.replace(p, r);
  return fixCapitalization(t);
}

function toChat(text) {
  let t = text;
  const map = [
    [/\bthank you\b/gi, "Thanks"],
    [/\bplease\b/gi, "pls"],
  ];
  for (const [p, r] of map) t = t.replace(p, r);
  return fixCapitalization(t);
}

// ===============================
// REPEAT DETECTOR (ORIGINAL TEXT)
// ===============================
function getRepeatedWordSuggestions(originalText) {
  if (!originalText) return "No repeated words found.";

  const words = originalText.toLowerCase().split(/\s+/);
  let list = [];

  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === words[i + 1]) list.push(words[i]);
  }

  if (list.length === 0) return "No repeated words found.";

  return list
    .map((w) => `• Repeated: "${w}" → Suggestion: remove one`)
    .join("\n");
}

function highlightRepeats(text) {
  return text.replace(/\b(\w+)\s+\1\b/gi, `<mark class="repeat">$1 $1</mark>`);
}

function detectRepetitionsSimple(text) {
  const regex = /\b(\w+)\s+\1\b/gi;
  let m,
    found = new Set();
  while ((m = regex.exec(text)) !== null) found.add(m[1].toLowerCase());
  return Array.from(found);
}

// ===============================
// SPEECH RECOGNITION
// ===============================
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  statusEl.textContent = "Speech Recognition not supported.";
  speakBtn.disabled = true;
} else {
  const recog = new SpeechRecognition();
  recog.lang = "en-US";
  recog.interimResults = true;
  recog.continuous = true;

  let finalTranscript = "";
  let originalFinal = "";
  let listening = false;
  let lastStart = 0;

  function updateButtons() {
    const has = cleanedTranscriptEl.textContent.trim().length > 0;
    copyBtn.style.display = has ? "inline-block" : "none";
    downloadBtn.style.display = has ? "inline-block" : "none";
    if (saveBtn) saveBtn.style.display = has ? "inline-block" : "none";
  }

  const dictationMap = [
    ["\\bcomma\\b", ","],
    ["\\bperiod\\b", "."],
    ["\\bquestion mark\\b", "?"],
    ["\\bexclamation mark\\b", "!"],
    ["\\bnew line\\b", "\n"],
    ["\\bnew paragraph\\b", "\n\n"],
  ];

  function applyDictation(t) {
    if (!dictationToggle.checked) return t;
    let out = t;
    for (const [p, r] of dictationMap)
      out = out.replace(new RegExp(p, "ig"), r);
    return out;
  }

  function finalizeSegment(t) {
    t = t.trim();
    if (!t) return "";
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) t += ".";
    return t + " ";
  }

  recog.onresult = (ev) => {
    const latency = Date.now() - lastStart;
    latencyEl.textContent = `Latency: ${latency} ms`;

    let interim = "",
      origInterim = "";

    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) {
        originalFinal += t + " ";
        finalTranscript += finalizeSegment(applyDictation(t));
      } else {
        interim += applyDictation(t);
        origInterim += t;
      }
    }

    const originalText = (originalFinal + origInterim).trim();
    originalTranscriptEl.textContent = originalText || "(listening...)";

    let processed = (finalTranscript + interim).trim();
    transcriptEl.innerHTML = highlightRepeats(processed);

    const cleaned = cleanText(processed);
    const toned = applyTone(cleaned, toneSelect.value);
    cleanedTranscriptEl.textContent = toned;

    suggestionsEl.textContent = getRepeatedWordSuggestions(originalText);

    const r = detectRepetitionsSimple(processed);
    repeatsEl.textContent = r.length
      ? "Repeated detected: " + r.join(", ")
      : "";

    updateButtons();
  };

  recog.onend = () => {
    if (listening) {
      try {
        recog.start();
      } catch (e) {}
      statusEl.textContent = "Listening...";
      return;
    }
    statusEl.textContent = "Idle";
    speakBtn.textContent = "🎙️ Speak";
    speakBtn.classList.remove("listening"); // STOP GLOW
  };

  // ===============================
  // MIC BUTTON CLICK (UI ONLY) ⭐
  // ===============================
  speakBtn.onclick = () => {
    if (!listening) {
      speakBtn.classList.add("listening"); // START GLOW
      speakBtn.textContent = "🛑 Stop";

      finalTranscript = "";
      originalFinal = "";
      originalTranscriptEl.textContent = "";
      transcriptEl.textContent = "";
      cleanedTranscriptEl.textContent = "";
      suggestionsEl.textContent = "";
      repeatsEl.textContent = "";

      lastStart = Date.now();
      recog.start();
      statusEl.textContent = "Listening...";
      listening = true;
    } else {
      speakBtn.classList.remove("listening"); // STOP GLOW
      recog.stop();
      statusEl.textContent = "Stopping...";
      speakBtn.textContent = "🎙️ Speak";
      listening = false;
    }
  };

  copyBtn.onclick = async () => {
    const toned = cleanedTranscriptEl.textContent.trim();
    await navigator.clipboard.writeText(toned);
    statusEl.textContent = "Copied!";
    setTimeout(() => (statusEl.textContent = "Idle"), 1000);
  };

  if (saveBtn) {
    saveBtn.onclick = async () => {
      const original = originalTranscriptEl.textContent.trim();
      const cleaned = cleanedTranscriptEl.textContent.trim();
      try {
        const res = await fetch("/save-transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_transcript: original,
            cleaned_transcript: cleaned,
          }),
        });
        if (res.ok) {
          const j = await res.json();
          statusEl.textContent = "Saved";
          if (window.__loadHistory) window.__loadHistory();
          setTimeout(() => (statusEl.textContent = "Idle"), 1200);
        } else {
          const j = await res.json();
          statusEl.textContent = j.error || "Save failed";
        }
      } catch (e) {
        statusEl.textContent = "Save error";
      }
    };
  }

  downloadBtn.onclick = () => {
    const original = originalTranscriptEl.textContent.trim();
    const processed = transcriptEl.textContent.replace(/<[^>]+>/g, "").trim();
    const cleanedRaw = cleanText(processed);
    const tone = toneSelect.value || "neutral";
    const cleanedToned = applyTone(cleanedRaw, tone);
    const suggestions = suggestionsEl.textContent.trim();

    const text =
      "=== ORIGINAL TRANSCRIPT ===\n" +
      original +
      "\n\n=== PROCESSED TRANSCRIPT ===\n" +
      processed +
      "\n\n=== CLEANED TRANSCRIPT (" +
      tone +
      ") ===\n" +
      cleanedToned +
      "\n\n=== SUGGESTIONS ===\n" +
      suggestions;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  toneSelect.addEventListener("change", () => {
    const processed = transcriptEl.textContent.trim();
    const cleanedRaw = cleanText(processed);
    cleanedTranscriptEl.textContent = applyTone(
      cleanedRaw,
      toneSelect.value || "neutral"
    );
  });

  setInterval(updateButtons, 600);
}
