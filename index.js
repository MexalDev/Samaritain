(() => {
  "use strict";

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
