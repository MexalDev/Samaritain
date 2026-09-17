(() => {
  "use strict";
(() => {
  "use strict";
  const GROQ_API_KEY = "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";
  const GROQ_MODEL = "llama-3.1-8b-instant"; // rapide, largement au-dessus d'1B en qualité, tourne côté serveur Groq
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

  const LANG = "fr-FR";
  const WORD_DELAY_MS = 400;
  const FADE_MS       = 150;

  modelNameEl_init();
  function modelNameEl_init() {}
  const devLog = [];
  function logDev(level, args) {
    try {
      const line = "[" + new Date().toISOString().slice(11, 19) + "] " + level + " " +
        Array.from(args).map(a => {
          if (a == null) return String(a);
          if (typeof a === "object") {
            const m = a.message != null ? a.message : (a.stack ? a.stack.split("\n")[0] : "");
            return m || JSON.stringify(a).slice(0, 200);
          }
          return String(a);
        }).join(" ");
      devLog.push(line);
      if (devLog.length > 300) devLog.shift();
    } catch (e) {}
  }
  ["log", "warn", "error"].forEach(m => {
    const orig = console[m].bind(console);
    console[m] = function() {
      try { logDev(m, arguments); } catch (e) {}
      orig.apply(null, arguments);
    };
  });
  window.addEventListener("error", (e) => { logDev("script", [e.message]); });
  window.addEventListener("unhandledrejection", (e) => { logDev("rejection", [e.reason]); });

  // ---------- DOM ----------
  const textEl      = document.getElementById("text");
  const barEl       = document.getElementById("bar");
  const bodyEl      = document.body;
  const panelEl     = document.getElementById("panel");
  const modelNameEl = document.getElementById("modelName");
  const mainEl      = document.getElementById("main");
  const statusEl    = document.getElementById("status");
  const statusLabelEl = document.querySelector("#status .label");

  modelNameEl.textContent = GROQ_MODEL + " (API)";

  let recognition = null;
  let isBusy = false;
  let statusHideTimer = null;
  let lastTranscript = "";
  let audioPrimed = false;
  let retryIndex = 0;
  const RETRY_DELAYS = [300, 1000, 2000, 3500];

  // ---------- AFFICHAGE ----------
  function measureTextWidth(text) {
    const cs = getComputedStyle(textEl);
    const span = document.createElement("span");
    span.style.position = "absolute";
    span.style.visibility = "hidden";
    span.style.whiteSpace = "pre";
    span.style.fontFamily = cs.fontFamily;
    span.style.fontSize = cs.fontSize;
    span.style.fontWeight = cs.fontWeight;
    span.style.textTransform = cs.textTransform;
    span.style.letterSpacing = cs.letterSpacing;
    span.textContent = text;
    document.body.appendChild(span);
    const w = span.getBoundingClientRect().width;
    span.remove();
    return w;
  }

  function setText(str) {
    const has = !!(str && str.length);
    textEl.textContent = has ? str : "\u00A0";
    textEl.classList.toggle("hidden", !has);
    barEl.style.width = (has ? Math.min(measureTextWidth(str), mainEl.clientWidth) : 30) + "px";
  }

  function setMode(mode) {
    bodyEl.classList.remove("listening", "thinking");
    if (mode === "listening") bodyEl.classList.add("listening");
    if (mode === "thinking") bodyEl.classList.add("thinking");
  }

  function showStatus(txt) {
    if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null; }
    statusEl.classList.remove("show", "hide");
    statusLabelEl.textContent = txt;
    void statusEl.offsetWidth;
    statusEl.classList.add("show");
  }
  function showThinkingStatus() {
    if (statusHideTimer) { clearTimeout(statusHideTimer); statusHideTimer = null; }
    statusEl.classList.remove("show", "hide");
    statusLabelEl.textContent = "calculating response";
    void statusEl.offsetWidth;
    statusEl.classList.add("show");
  }
  function hideStatus() {
    if (!statusEl.classList.contains("show")) return;
    statusEl.classList.add("hide");
    if (statusHideTimer) clearTimeout(statusHideTimer);
    statusHideTimer = setTimeout(() => {
      statusHideTimer = null;
      statusEl.classList.remove("show", "hide");
    }, 500);
  }

  function flashStatus(txt, ms) {
    showStatus(txt);
    if (statusHideTimer) clearTimeout(statusHideTimer);
    statusHideTimer = setTimeout(hideStatus, ms || 2500);
  }

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  function playWordAnim(cls) {
    textEl.classList.remove("word-in", "word-out");
    void textEl.offsetWidth;
    textEl.classList.add(cls);
  }

  async function speakWords(fullText) {
    const words = fullText.trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      textEl.classList.remove("hidden");
      textEl.textContent = words[i];
      barEl.style.width = Math.min(measureTextWidth(words[i]), mainEl.clientWidth) + "px";
      playWordAnim("word-in");
      await sleep(WORD_DELAY_MS);
      if (i < words.length - 1) {
        playWordAnim("word-out");
        await sleep(FADE_MS);
        textEl.textContent = "\u00A0";
      }
    }
  }

  async function boot() {
    const name = "SAMARITAN";
    textEl.classList.remove("hidden");
    for (let i = 1; i <= name.length; i++) {
      textEl.textContent = name.slice(0, i);
      barEl.style.width = Math.min(measureTextWidth(name.slice(0, i)), mainEl.clientWidth) + "px";
      await sleep(70);
    }
    await sleep(300);
  }

  // ---------- FAUX LOADER (cosmétique) ----------
  // Ne charge plus rien de réel — c'est juste l'habillage visuel d'origine, rejoué
  // sur une durée fixe minutée, sans lien avec un téléchargement ou un modèle.
  const loaderEl        = document.getElementById("loader");
  const bootLogEl       = document.getElementById("boot-log");
  const loadingPaneEl   = document.getElementById("loading-pane-container");
  const loadingNameEl   = document.getElementById("loading-name");
  const loadingBarEl    = document.getElementById("loading-bar");
  const connectedEl     = document.getElementById("loading-connected");
  const connectedTextEl = document.getElementById("loading-connected-text");

  const SYS_TOKENS = [
    "x0.0/sirv", "+0.1/ecom", "[eth0]", "[eth1]",
    "feed_1 [ ]", "feed_2 [ ]", "feed_3 [ ]", "feed_4 [ ]", "feed_5 [ ]",
    "feed_6 [ ]", "feed_7 [ ]", "feed_8 [ ]", "feed_9 [ ]"
  ];
  const RESOURCE_SEGMENTS = [
    "resources.comm.archive", "resources.im.users", "resources.im.log", "resources.rin-im",
    "resources.email.users", "resources.email.data", "resources.voip",
    "resources.dsn-messaging", "resources.dsn-subscribers", "resources.web.users",
    "resources.web.content", "resources.video.feeds", "resources.video.archive",
    "resources.video.streams", "resources.audio.calls", "resources.audio.voicemail",
    "resources.files.shares", "resources.files.sync", "resources.ftp.mirrors",
    "resources.irc.logs", "resources.irc.servers", "resources.net.dns",
    "resources.net.http", "resources.net.tor", "resources.grid.compute",
    "resources.grid.storage", "resources.telecom.fiber", "resources.telecom.sat",
    "resources.telecom.gsm", "linking.databases.sigint", "linking.databases.sigint.xxx-",
    "linking.databases.crime", "linking.databases.finance", "nodes.satellite.up-link",
    "nodes.satellite.down-link", "nodes.relay.a-01", "nodes.relay.b-07", "nodes.relay.c-11",
    "feeds.monitor.heartbeat", "feeds.monitor.alerts", "feeds.monitor.geo",
    "security.keys", "security.access.log", "security.cameras", "security.intel"
  ];

  function randomResourceName() {
    const seg = RESOURCE_SEGMENTS[Math.floor(Math.random() * RESOURCE_SEGMENTS.length)];
    const r = Math.random();
    if (r < 0.3) return seg + ".xxx-" + Math.floor(Math.random() * 1000);
    if (r < 0.55) return seg + "." + Math.floor(100 + Math.random() * 900);
    if (r < 0.7) return seg + "-" + String(Math.floor(Math.random() * 100)).padStart(2, "0");
    return seg;
  }
  function randomBootLine() {
    if (Math.random() < 0.3) return SYS_TOKENS[Math.floor(Math.random() * SYS_TOKENS.length)];
    return randomResourceName();
  }

  let logLineCount = 0;
  const STREAM_MAX_LINES = 60;
  const TYPE_INTERVAL = 16;
  let typeTimer = null;
  let pendingText = "";
  let activeLine = null;

  function bootLinePrefix(idx) {
    return "<b style=\"color:#F00\">[[</b>"
      + (idx < 10 ? " x0" : "x") + idx
      + (idx < 10 ? " " : "")
      + "<b style=\"color:#F00\">]</b> ";
  }
  function appendBootLine(line) {
    const span = document.createElement("span");
    span.className = "boot-line";
    span.innerHTML = bootLinePrefix(logLineCount++) + "<span class=\"boot-text\">" + line + "</span>";
    bootLogEl.appendChild(span);
    pruneBootLog();
    bootLogEl.scrollTop = bootLogEl.scrollHeight;
  }
  function startBootLine() {
    activeLine = document.createElement("span");
    activeLine.className = "boot-line";
    activeLine.innerHTML = bootLinePrefix(logLineCount++) + "<span class=\"boot-text\"></span>";
    const cursor = bootLogEl.querySelector(".boot-cursor");
    if (cursor) bootLogEl.insertBefore(activeLine, cursor);
    else bootLogEl.appendChild(activeLine);
    pendingText = randomBootLine();
  }
  function typeNextChar() {
    if (!activeLine) startBootLine();
    if (pendingText) {
      const ch = pendingText.charAt(0);
      pendingText = pendingText.slice(1);
      const text = activeLine.querySelector(".boot-text");
      if (text) text.textContent += ch;
    } else {
      activeLine = null;
      startBootLine();
    }
    pruneBootLog();
    bootLogEl.scrollTop = bootLogEl.scrollHeight;
  }
  function pruneBootLog() {
    while (bootLogEl.querySelectorAll(".boot-line").length > STREAM_MAX_LINES) {
      const first = bootLogEl.querySelector(".boot-line");
      if (first) bootLogEl.removeChild(first);
    }
  }
  function startResourceStream() {
    stopResourceStream();
    bootLogEl.innerHTML = "";
    logLineCount = 0;
    activeLine = null;
    pendingText = "";
    const cursor = document.createElement("span");
    cursor.className = "boot-cursor";
    bootLogEl.appendChild(cursor);
    typeTimer = setInterval(typeNextChar, TYPE_INTERVAL);
  }
  function stopResourceStream() {
    if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
  }

  let lastResPct = -1;
  function bootLoader() {
    stopResourceStream();
    loaderEl.classList.remove("open", "done", "finishing");
    bootLogEl.innerHTML = "";
    logLineCount = 0;
    lastResPct = -1;
    loadingBarEl.style.width = "0%";
    loadingNameEl.textContent = "initialisation…";
    connectedEl.style.display = "none";
    connectedEl.classList.remove("show", "hide");
    loadingPaneEl.style.opacity = "";
    loaderEl.style.display = "flex";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => loaderEl.classList.add("open"));
    });
    startResourceStream();
  }
  function setLoaderProgress(pct) {
    pct = Math.min(100, Math.max(0, pct));
    loadingBarEl.style.width = pct + "%";
    const bucket = Math.floor(pct / 4);
    if (bucket !== lastResPct) {
      lastResPct = bucket;
      loadingNameEl.textContent = randomResourceName();
    }
  }
  async function finishLoader() {
    stopResourceStream();
    const cursor = bootLogEl.querySelector(".boot-cursor");
    if (cursor) cursor.remove();
    for (let i = 0; i < 6; i++) appendBootLine(randomBootLine());
    loadingBarEl.style.width = "100%";
    loadingNameEl.textContent = randomResourceName();
    loaderEl.classList.add("finishing");
    connectedEl.style.display = "block";
    connectedTextEl.textContent = "connection established";
    connectedEl.classList.add("show");
    await sleep(1400);
    connectedEl.classList.remove("show");
    connectedEl.classList.add("hide");
    await sleep(500);
    connectedEl.classList.remove("hide");
    loaderEl.classList.add("done");
    await sleep(1200);
    loaderEl.style.display = "none";
    loaderEl.classList.remove("open", "done");
  }

  async function playFakeLoader() {
    bootLoader();
    // Barre de progression minutée sur ~2,2s, aucun lien avec un vrai téléchargement.
    const DURATION_MS = Math.floor(Math.random()*10000);
    const STEPS = 40;
    for (let i = 0; i <= STEPS; i++) {
      setLoaderProgress((i / STEPS) * 100);
      await sleep(DURATION_MS / STEPS);
    }
    await finishLoader();
  }

  function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showStatus("Reconnaissance vocale non supportée");
      return null;
    }
    const rec = new SpeechRecognition();
    rec.lang = LANG;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const SILENCE_MS = 1600;
    const TOTAL_MS   = 8000;
    let silenceTimer = null;
    let totalTimer   = null;

    function stopRec() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (totalTimer)   { clearTimeout(totalTimer);   totalTimer = null; }
      try { rec.stop(); } catch (e) {}
    }

    rec.onstart = () => {
      isBusy = true;
      lastTranscript = "";
      setMode("listening");
      setText("");
      logDev("info", ["[stt] start"]);
      if (silenceTimer) clearTimeout(silenceTimer);
      if (totalTimer) clearTimeout(totalTimer);
      totalTimer = setTimeout(() => {
        logDev("warn", ["[stt] timeout total"]);
        stopRec();
      }, TOTAL_MS);
    };

    rec.onresult = (event) => {
      let text = "";
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            lastTranscript = res[0].transcript.trim();
            logDev("info", ["[stt] final=" + lastTranscript]);
          } else {
            text += res[0].transcript;
          }
        }
      } catch (e) {
        logDev("warn", ["[stt] result absent", e]);
      }

      if (lastTranscript) {
        setText(lastTranscript);
        retryIndex = 0;
        logDev("info", ["[stt] fin au résultat final"]);
        stopRec();
      } else {
        text = text.trim();
        if (text) setText(text);
        if (silenceTimer) clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => {
          logDev("info", ["[stt] fin par silence"]);
          stopRec();
        }, SILENCE_MS);
      }
    };

    rec.onerror = (e) => {
      logDev("warn", ["[stt] error=" + (e && e.error)]);
      stopRec();
      isBusy = false;
      lastTranscript = "";
      setMode("");
      setText("");
    };

    rec.onend = async () => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (totalTimer) { clearTimeout(totalTimer); totalTimer = null; }
      const transcript = lastTranscript || textEl.textContent.trim();
      lastTranscript = "";
      logDev("info", ["[stt] onend transcript='" + transcript + "'"]);
      if (transcript) {
        await queryModel(transcript);
      } else {
        setMode("");
        setText("");
        isBusy = false;
        if (retryIndex < RETRY_DELAYS.length) {
          const d = RETRY_DELAYS[retryIndex];
          retryIndex++;
          logDev("warn", ["[stt] rien entendu, retry dans " + d + " ms"]);
          setTimeout(() => { startListening(true); }, d);
        } else {
          retryIndex = 0;
          flashStatus("je n'ai rien entendu");
        }
      }
    };

    return rec;
  }

  async function primeAudio() {
    if (audioPrimed) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        audioPrimed = true;
        return;
      }
      await Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          stream.getTracks().forEach(t => t.stop());
          audioPrimed = true;
          logDev("info", ["[stt] micro primé"]);
        }),
        sleep(1500)
      ]);
    } catch (e) {
      logDev("warn", ["[stt] prime micro refusée", e]);
    }
  }

  async function startListening(auto = false) {
    if (isBusy) {
      logDev("warn", ["[stt] bloqué: occupation"]);
      return;
    }
    if (!auto) retryIndex = 0;
    if (!recognition) recognition = initRecognition();
    if (!recognition) return;
    await primeAudio();
    try { recognition.start(); } catch (e) { logDev("warn", ["[stt] start throw", e]); }
  }

  function describeError(e) {
    if (e == null) return String(e);
    if (typeof e === "object") {
      const msg = (e.name ? e.name + ": " : "") + (e.message != null ? e.message : "") + (e.cause ? " cause=" + describeError(e.cause) : "");
      return msg + (e.stack ? " | " + e.stack.split("\n").slice(0, 3).join(" | ") : "");
    }
    return String(e);
  }

  // ---------- LLM VIA API (Groq) ----------
  async function queryModel(promptText) {
    setMode("thinking");
    setText("");
    logDev("info", ["[gen] demande='" + promptText + "'"]);
    showThinkingStatus();

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GROQ_API_KEY
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: "Tu es Samaritain, une IA. Tu dois répondre le plus directement et clairement possible, en une phrase maximum, sujet verbe complément. Ne développe pas, sois le plus direct possible." },
            { role: "user", content: promptText }
          ],
          max_tokens: 60,
          temperature: 0.7
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error("HTTP " + res.status + " " + errText.slice(0, 150));
      }

      const data = await res.json();
      const full = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || "").trim();

      hideStatus();
      setMode("");
      logDev("info", ["[gen] réponse='" + full + "'"]);
      if (full) {
        await speakWords(full);
      } else {
        showStatus("Aucune réponse");
        await sleep(2000);
        hideStatus();
      }
    } catch (err) {
      hideStatus();
      setMode("");
      console.error("[gen] échec de génération :", err);
      logDev("error", ["[gen] fail=" + describeError(err)]);
      showStatus("Erreur: " + describeError(err).slice(0, 48));
      await sleep(4000);
      hideStatus();
    } finally {
      isBusy = false;
    }
  }

  // ---------- INTERACTION ----------
  document.addEventListener("touchstart", () => { if (!isBusy) startListening(); }, { passive: true });
  document.addEventListener("click", () => { if (!isBusy) startListening(); });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!isBusy) startListening();
    }
  });

  let panelClosing = false;
  function closePanel() {
    if (!panelEl.classList.contains("open") || panelClosing) return;
    panelClosing = true;
    panelEl.classList.add("closing");
    setTimeout(() => {
      panelEl.classList.remove("open", "closing");
      panelClosing = false;
    }, 300);
  }
  function togglePanel() {
    if (panelEl.classList.contains("open")) {
      closePanel();
    } else {
      panelEl.classList.add("open");
    }
  }

  document.getElementById("settings").addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });

  const logBtn = document.getElementById("logBtn");
  const logView = document.getElementById("logView");
  const copyLogBtn = document.getElementById("copyLogBtn");
  let logShown = false;
  logBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    logShown = !logShown;
    logView.classList.toggle("show", logShown);
    copyLogBtn.style.display = logShown ? "block" : "none";
    if (logShown) {
      logView.textContent = devLog.join("\n") || "aucune erreur enregistrée";
      logView.scrollTop = logView.scrollHeight;
    }
  });
  copyLogBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(logView.textContent || "");
      }
    } catch (err) {}
  });

  // ---------- INIT ----------
  (async () => {
    await playFakeLoader();
    await boot();
    setMode("");
    setText("");
  })();

  document.getElementById("replayLoaderBtn").addEventListener("click", async (e) => {
    e.stopPropagation();
    closePanel();
    if (isBusy) return;
    setText("");
    await playFakeLoader();
    setMode("");
    setText("");
  });
})();
  // ---------- MODELE LOCAL (dans le navigateur, via Transformers.js) ----------
  // Aucune API, aucune clé, aucun serveur à installer : le modèle est
  // téléchargé une fois par le navigateur (cache), puis tourne en local.
  const LOCAL_MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct"; // ~500M, bon en FR
  let generator = null;      // pipeline transformers.js une fois chargé
  let transformersLib = null;

  async function loadTransformers() {
    if (transformersLib) return transformersLib;
    // Import ESM depuis le CDN jsDelivr (aucune installation locale requise)
    transformersLib = await import(
      "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0"
    );
    return transformersLib;
  }

  async function loadModel(onProgress) {
    if (generator) return generator;
    const { pipeline } = await loadTransformers();
    generator = await pipeline("text-generation", LOCAL_MODEL_ID, {
      dtype: "q4",              // quantifié = plus léger/rapide en local
      progress_callback: (p) => {
        if (onProgress && p && typeof p.progress === "number") {
          onProgress(p.progress); // 0-100
        }
      }
    });
    return generator;
  }

  const LANG = "fr-FR";
  const WORD_DELAY_MS = 400;
  const FADE_MS       = 150;

  // ... (garder tout le reste du fichier original identique : devLog, DOM,
  //      setText/setMode/showStatus, boot(), le faux loader visuel,
  //      initRecognition(), primeAudio(), startListening(), interactions)
  //
  // Seule la fonction queryModel() et l'init changent, ci-dessous :

  // ---------- LLM LOCAL (Transformers.js, dans le navigateur) ----------
  async function queryModel(promptText) {
    setMode("thinking");
    setText("");
    logDev("info", ["[gen] demande='" + promptText + "'"]);
    showThinkingStatus();

    try {
      const gen = await loadModel((pct) => {
        // Optionnel : afficher la progression de téléchargement au 1er lancement
        showStatus("chargement du modèle " + Math.round(pct) + "%");
      });

      const messages = [
        {
          role: "system",
          content: "Tu es Samaritain, une IA. Réponds en français, le plus " +
            "directement et clairement possible, en une phrase maximum, " +
            "sujet verbe complément. Ne développe pas."
        },
        { role: "user", content: promptText }
      ];

      const output = await gen(messages, {
        max_new_tokens: 60,
        temperature: 0.7,
        do_sample: true,
        return_full_text: false
      });

      // La forme exacte dépend de la version de transformers.js ;
      // on gère les deux cas courants.
      let full = "";
      if (Array.isArray(output) && output[0]) {
        const gt = output[0].generated_text;
        if (typeof gt === "string") {
          full = gt;
        } else if (Array.isArray(gt)) {
          const last = gt[gt.length - 1];
          full = (last && last.content) || "";
        }
      }
      full = (full || "").trim();

      hideStatus();
      setMode("");
      logDev("info", ["[gen] réponse='" + full + "'"]);
      if (full) {
        await speakWords(full);
      } else {
        showStatus("Aucune réponse");
        await sleep(2000);
        hideStatus();
      }
    } catch (err) {
      hideStatus();
      setMode("");
      console.error("[gen] échec de génération :", err);
      logDev("error", ["[gen] fail=" + describeError(err)]);
      showStatus("Erreur: " + describeError(err).slice(0, 48));
      await sleep(4000);
      hideStatus();
    } finally {
      isBusy = false;
    }
  }

  // ---------- INIT ----------
  // On lance le (pré-)chargement du modèle en tâche de fond dès le boot,
  // pendant l'animation du faux loader, pour que le premier échange soit rapide.
  (async () => {
    await playFakeLoader();
    await boot();
    setMode("");
    setText("");
    loadModel().catch((e) => logDev("warn", ["[gen] préchargement échoué", e]));
  })();
})();
