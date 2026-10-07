(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.ExcerptCore,
    profile = window.ChamberProfile;
  const fontFamily = (f) => `"${f.family}", "D2Coding", monospace`;
  const canvas = $("excerpt-canvas"),
    measure = document.createElement("canvas").getContext("2d");
  const defaultConfig = {
    format: "novel",
    fontFamily: fontFamily(profile.FONTS[0]),
    fontItalic: false,
    fontSize: 16, // 12pt at 96 CSS pixels per inch.
    lineHeight: 1.8,
    widthScale: 1,
    letterSpacing: 0,
    paragraphGap: 20,
    narrationGap: 8,
    dialogueGap: 0,
    padding: 56,
    theme: "sirius",
    background: "#0a1322",
    backgroundEnd: "#03060c",
    accent: "#b8d7ff",
    ink: "#e4f1f5",
    bubble: "#14233b",
    bubbleShape: "sf",
    showAvatars: false,
    frameStyle: "hud",
    pageNumbers: false,
    grid: true,
    imageOpacity: 0.5,
    imageBrightness: 100,
    pageMode: "auto",
    width: 800,
    height: 1000,
  };
  const defaultStyles = {
    narration: {
      color: "#b2c7d1",
      bold: false,
      italic: false,
      strike: false,
      highlight: "",
      align: "auto",
    },
    dialogue: {
      color: "#e4f1f5",
      bold: false,
      italic: false,
      strike: false,
      highlight: "",
      align: "auto",
    },
  };
  const customFonts = [];
  const allFonts = () => [...profile.FONTS, ...customFonts];
  const defaultMetadata = () =>
    Object.fromEntries(
      ["title", "creator", "character", "platform", "source"].map((key) => [
        key,
        {
          position: key === "title" ? "tl" : key === "platform" ? "br" : "bl",
          inherit: true,
          label: false,
          bold: true,
          size: 14,
          color: "#e4f1f5",
          fontFamily: fontFamily(profile.FONTS[0]),
          fontItalic: false,
        },
      ]),
    );
  let state = {
    config: { ...defaultConfig },
    styles: structuredClone(defaultStyles),
    speakers: {},
    speakerImages: Object.create(null),
    speakerData: Object.create(null),
    metadata: defaultMetadata(),
    blocks: [],
    title: "",
    creator: "",
    character: "",
    platform: "",
    source: "",
    backgroundImage: null,
    backgroundData: "",
  };
  let selected = null,
    page = 0,
    result = null,
    zoom = null,
    drawTimer,
    busy = false,
    loadSequence = 0;
  let previewHits = [], previewEditing = null;
  let selection = { start: 0, end: 0 },
    exportSequence = 0;
  const SAMPLE =
    "*관제실 단말에 미확인 신호가 포착됐다.*\nALPHA: 신호 확인. 좌표 전송한다.\n*BRAVO는 수신 좌표를 지도에 대조했다.*\nBRAVO: 목표 구역 일치. 진입 명령 대기.\nALPHA: 진입 승인. 통신 유지하라.\n*두 개의 식별 신호가 작전 구역으로 이동했다.*";
  function message(text, error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
  }
  function currentBlock() {
    return state.blocks.find((b) => b.id === selected);
  }
  function schedule() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(render, 90);
  }
  function fitCanvas() {
    if (!result) return;
    const available = Math.max(
      160,
      $("preview-scroll").clientWidth - (innerWidth <= 700 ? 34 : 82),
    );
    const ratio = zoom || Math.min(1, available / result.width);
    canvas.style.width = `${Math.round(result.width * ratio)}px`;
    canvas.style.height = "auto";
    positionPreviewEditor();
    $("zoom-label").textContent = `${Math.round(ratio * 100)}%`;
  }
  function setExportEnabled(enabled) {
    ["export-current", "export-all", "quick-export"].forEach(
      (id) => ($(id).disabled = !enabled || busy),
    );
  }
  function render() {
    recordHistory();
    clearTimeout(drawTimer);
    $("empty-state").hidden = state.blocks.length > 0;
    $("canvas-holder").hidden = !state.blocks.length;
    $("format-label").textContent =
      state.config.format === "novel" ? "NOVEL" : "CHAT";
    if (!state.blocks.length) {
      result = null;
      setExportEnabled(false);
      $("previous-page").disabled = true;
      $("next-page").disabled = true;
      $("page-number").textContent = "00 / 00";
      $("dimensions").textContent = `${state.config.width} × — PX`;
      message("TEXT INPUT / STANDBY");
      return;
    }
    try {
      result = core.layout(measure, state);
      page = Math.min(page, result.pages.length - 1);
      if (previewEditing && document.activeElement === $("preview-text-editor")) {
        const offset = $("preview-text-editor").selectionEnd;
        let caretPage = -1;
        result.pages.forEach((rows, index) => {
          if (rows.some(row => row.blockId === previewEditing && row.glyphs.some(g => g.index <= offset))) caretPage = index;
        });
        if (caretPage >= 0) page = caretPage;
      }
      previewHits = core.draw(canvas, state, result, page);
      renderPreviewHits();
      fitCanvas();
      $("dimensions").textContent =
        `${result.width} × ${result.height} PX · ${result.pages.length} PAGE${result.pages.length > 1 ? "S" : ""}`;
      $("page-number").textContent =
        `${String(page + 1).padStart(2, "0")} / ${String(result.pages.length).padStart(2, "0")}`;
      $("previous-page").disabled = page === 0;
      $("next-page").disabled = page === result.pages.length - 1;
      setExportEnabled(true);
      message(
        `${state.blocks.length}개 문단 · ${result.pages.length}장${state.config.pageMode === "four" && result.height > state.config.height ? " · 내용에 맞춰 높이 확장" : ""}`,
      );
    } catch (error) {
      result = null;
      $("canvas-holder").hidden = true;
      setExportEnabled(false);
      message(error.message, true);
    }
  }
  function syncConfig() {
    document.querySelectorAll("[data-config]").forEach((input) => {
      const value = state.config[input.dataset.config];
      if (input.type === "checkbox") input.checked = value;
      else
        input.value =
          input.dataset.unit === "pt" ? +(value * 0.75).toFixed(2) : value;
    });
    document.querySelectorAll("[data-format]").forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.format === state.config.format),
      );
      b.classList.toggle("selected", b.dataset.format === state.config.format);
    });
    for (const field of ["title", "creator", "character", "platform", "source"])
      $(field).value = state[field];
    renderFonts();
    renderThemes();
    updateChrome();
    syncMetadata();
    updateOutputs();
  }
  function updateOutputs() {
    for (const [key, value] of Object.entries({
      widthScale: `${Math.round(state.config.widthScale * 100)}%`,
      letterSpacing: `${state.config.letterSpacing}px`,
      imageOpacity: `${Math.round(state.config.imageOpacity * 100)}%`,
      imageBrightness: `${state.config.imageBrightness}%`,
    }))
      $(`${key}-value`).textContent = value;
    $("page-height").disabled = state.config.pageMode === "auto";
    $("page-mode-note").textContent =
      state.config.pageMode === "auto"
        ? "AUTO / 본문 길이 기준 높이 산출."
        : state.config.pageMode === "four"
          ? "4-PAGE / 총 4장 분할. 짧은 입력은 빈 페이지 포함."
          : "FIXED / 지정 규격 유지. 초과 데이터는 다음 페이지로 이월.";
  }
  document.querySelectorAll("[data-panel]").forEach(
    (button) =>
      (button.onclick = () => {
        document.querySelectorAll("[data-panel]").forEach((b) => {
          b.setAttribute("aria-pressed", String(b === button));
          b.classList.toggle("active", b === button);
        });
        document
          .querySelectorAll(".panel")
          .forEach(
            (panel) =>
              (panel.hidden = panel.id !== `panel-${button.dataset.panel}`),
          );
      }),
  );
  document.querySelectorAll("[data-config]").forEach((input) =>
    input.addEventListener("input", async () => {
      if (busy) return;
      let value;
      if (input.type === "checkbox") value = input.checked;
      else if (input.type === "number" || input.type === "range") {
        if (input.value === "" || !Number.isFinite(input.valueAsNumber)) return;
        value = Math.min(
          Number(input.max),
          Math.max(Number(input.min), input.valueAsNumber),
        );
      } else value = input.value;
      if (input.dataset.unit === "pt") value = (value * 4) / 3;
      state.config[input.dataset.config] = value;
      if (input.dataset.config === "bubble") {
        delete state.styles.dialogue.bubble;
        syncStyle();
      }
      updateChrome();
      renderThemes();
      updateOutputs();
      schedule();
      if (input.dataset.config === "fontFamily") {
        try {
          await document.fonts.load(
            `${state.config.fontSize}px ${value}`,
            "가나다 ABC",
          );
          schedule();
        } catch {
          message("FONT / LOAD FAILED · 대체 글꼴 적용.", true);
        }
      }
    }),
  );
  document
    .querySelectorAll("input[type=number][data-config]")
    .forEach((input) =>
      input.addEventListener(
        "change",
        () =>
          (input.value =
            input.dataset.unit === "pt"
              ? +(state.config[input.dataset.config] * 0.75).toFixed(2)
              : state.config[input.dataset.config]),
      ),
    );
  document.querySelectorAll("[data-format]").forEach(
    (button) =>
      (button.onclick = () => {
        state.config.format = button.dataset.format;
        syncConfig();
        schedule();
      }),
  );
  document.querySelectorAll("[data-size]").forEach(
    (button) =>
      (button.onclick = () => {
        [state.config.width, state.config.height] = button.dataset.size
          .split(",")
          .map(Number);
        if (state.config.pageMode === "auto") state.config.pageMode = "fixed";
        syncConfig();
        schedule();
      }),
  );
  function updateCount() {
    $("char-count").textContent =
      `${$("raw-text").value.length.toLocaleString()} / 30,000`;
  }
  function applyText() {
    closePreviewEditor();
    const raw = $("raw-text").value.slice(0, 30000);
    const blocks = core.parse(raw, $("plain-type").value);
    if (blocks.length > 1500) {
      message("문단 한도 1,500개 초과. 입력 데이터를 분할하십시오.", true);
      return;
    }
    state.blocks = blocks;
    state.speakers = {};
    selected = state.blocks[0]?.id || null;
    page = 0;
    updateCount();
    renderBlocks();
    renderStyleTargets();
    render();
  }
  $("parse").onclick = applyText;
  $("raw-text").addEventListener("input", updateCount);
  $("raw-text").addEventListener("paste", () => setTimeout(applyText, 0));
  function sample() {
    $("raw-text").value = SAMPLE;
    if (!state.title) state.title = "MISSION LOG / 001";
    syncConfig();
    applyText();
  }
  $("sample").onclick = sample;
  $("empty-sample").onclick = sample;
  function renderBlocks() {
    $("block-count").textContent = state.blocks.length;
    const fragment = document.createDocumentFragment();
    state.blocks.forEach((block, index) => {
      const button = document.createElement("button");
      button.className = "block-item";
      button.dataset.id = block.id;
      button.setAttribute("aria-pressed", String(block.id === selected));
      const type = document.createElement("span");
      type.textContent = `${String(index + 1).padStart(2, "0")} ${block.type === "narration" ? "지문" : block.speaker || "대사"}`;
      const content = document.createElement("small");
      content.textContent = block.text;
      button.append(type, content);
      button.onclick = () => {
        selected = block.id;
        renderBlocks();
        renderStyleTargets();
      };
      fragment.append(button);
    });
    $("block-list").replaceChildren(fragment);
    const block = currentBlock();
    $("block-editor").hidden = !block;
    if (block) {
      $("block-type").value = block.type;
      $("block-speaker").value = block.speaker;
      $("block-text").value = block.text;
    }
    selection = { start: 0, end: 0 };
  }
  function renderStyleTargets() {
    const previous = $("style-target").value;
    const entries = [
      ["narration", "모든 지문"],
      ["dialogue", "모든 대사"],
    ];
    const names = [
      ...new Set(state.blocks.map((b) => b.speaker).filter(Boolean)),
    ];
    names.forEach((name) =>
      entries.push([`speaker:${name}`, `인물 · ${name}`]),
    );
    if (currentBlock()) entries.push(["selected", "선택한 문단만"]);
    $("style-target").replaceChildren(
      ...entries.map(([value, text]) => new Option(text, value)),
    );
    if (entries.some(([value]) => value === previous))
      $("style-target").value = previous;
    $("speaker-list").replaceChildren(
      ...names.map((name) => new Option(name, name)),
    );
    const selectedSpeaker = $("avatar-speaker").value;
    $("avatar-speaker").replaceChildren(
      new Option(names.length ? "인물 선택" : "인물명 지정 필요", ""),
      ...names.map((name) => new Option(name, name)),
    );
    if (names.includes(selectedSpeaker))
      $("avatar-speaker").value = selectedSpeaker;
    syncStyle();
  }
  function targetStyle(create = false) {
    const target = $("style-target").value;
    if (target === "selected") return currentBlock()?.style || {};
    if (target.startsWith("speaker:")) {
      const name = target.slice(8);
      if (create && !Object.hasOwn(state.speakers, name))
        Object.defineProperty(state.speakers, name, {
          value: {},
          enumerable: true,
          configurable: true,
          writable: true,
        });
      return Object.hasOwn(state.speakers, name) ? state.speakers[name] : {};
    }
    return state.styles[target];
  }
  function resolvedStyle() {
    const target = $("style-target").value;
    if (target === "selected") return core.blockStyle(currentBlock(), state);
    if (target.startsWith("speaker:"))
      return { ...state.styles.dialogue, ...targetStyle() };
    return targetStyle();
  }
  function syncStyle() {
    const style = resolvedStyle();
    $("style-color").value = style.color;
    $("style-bubble").value = style.bubble || state.config.bubble;
    ["bold", "italic", "strike", "underline"].forEach(
      (key) => ($(`style-${key}`).checked = !!style[key]),
    );
    $("style-highlight-on").checked = !!style.highlight;
    $("style-highlight").value = style.highlight || "#526124";
    $("style-align").value = style.align || "auto";
    $("preview-align").value = currentBlock() ? core.blockStyle(currentBlock(), state).textAlign || "left" : "left";
    $("target-note").textContent =
      $("style-target").value === "selected"
        ? "선택 문단 적용."
        : "선택 유형·인물 전체 적용.";
  }
  $("style-target").onchange = syncStyle;
  [
    "color",
    "bubble",
    "bold",
    "italic",
    "strike",
    "underline",
    "align",
    "highlight",
    "highlight-on",
  ].forEach((key) =>
    $(`style-${key}`).addEventListener("input", () => {
      const target = targetStyle(true);
      if (key.startsWith("highlight"))
        target.highlight = $("style-highlight-on").checked
          ? $("style-highlight").value
          : "";
      else
        target[key] = ["bold", "italic", "strike", "underline"].includes(key)
          ? $(`style-${key}`).checked
          : $(`style-${key}`).value;
      schedule();
    }),
  );
  $("reset-overrides").onclick = () => {
    const target = $("style-target").value;
    const blocks = state.blocks.filter((block) =>
      target === "selected"
        ? block.id === selected
        : target.startsWith("speaker:")
          ? block.speaker === target.slice(8)
          : block.type === target,
    );
    blocks.forEach((block) => {
      block.style = {};
      block.marks = [];
    });
    if (target === "dialogue" || target === "narration")
      blocks.forEach((block) => {
        if (block.speaker) delete state.speakers[block.speaker];
      });
    syncStyle();
    schedule();
  };
  $("block-type").onchange = () => {
    const block = currentBlock();
    if (!block) return;
    block.type = $("block-type").value;
    if (block.type === "narration") block.speaker = "";
    renderBlocks();
    renderStyleTargets();
    schedule();
  };
  $("block-speaker").onchange = () => {
    const block = currentBlock();
    if (!block) return;
    block.speaker = $("block-speaker").value.trim();
    if (block.speaker) block.type = "dialogue";
    renderBlocks();
    renderStyleTargets();
    schedule();
  };
  $("block-text").addEventListener("input", () => {
    const block = currentBlock();
    if (!block) return;
    const otherLength = state.blocks.reduce(
      (total, b) => total + (b.id === selected ? 0 : b.text.length),
      0,
    );
    const nextText = $("block-text").value.slice(0, 30000 - otherLength);
    remapMarks(block, nextText);
    block.text = nextText;
    $("block-text").value = block.text;
    const item = Array.from($("block-list").children).find(
      (item) => item.dataset.id === selected,
    );
    if (item) item.querySelector("small").textContent = block.text;
    schedule();
  });
  ["select", "keyup", "mouseup", "touchend"].forEach((event) =>
    $("block-text").addEventListener(
      event,
      () =>
        (selection = {
          start: $("block-text").selectionStart,
          end: $("block-text").selectionEnd,
        }),
    ),
  );
  document.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.onclick = () => applySelectionStyle(button.dataset.mark,
      button.dataset.mark === "highlight" ? $("mark-color").value : undefined);
  });
  $("clear-marks").onclick = () => {
    const block = currentBlock();
    if (block) {
      block.marks = [];
      block.style = {};
      syncStyle();
      schedule();
    }
  };
  $("delete-block").onclick = () => {
    state.blocks = state.blocks.filter((b) => b.id !== selected);
    selected = state.blocks[0]?.id || null;
    renderBlocks();
    renderStyleTargets();
    render();
  };
  $("add-block").onclick = () => {
    if (state.blocks.length >= 1500)
      return message("문단 추가 한도 1,500개 도달.", true);
    const block = {
      id: `new-${Date.now()}`,
      type: "dialogue",
      speaker: "",
      text: "",
      style: {},
      marks: [],
    };
    state.blocks.splice(
      state.blocks.findIndex((b) => b.id === selected) + 1,
      0,
      block,
    );
    selected = block.id;
    renderBlocks();
    renderStyleTargets();
    schedule();
    $("block-text").focus();
  };
  ["title", "creator", "character", "platform", "source"].forEach((key) =>
    $(key).addEventListener("input", () => {
      state[key] = $(key).value;
      schedule();
    }),
  );
  function updateChrome() {
    const p = state.config.theme === "sirius"
        ? {light:false, ink:"#e5efff", muted:"#859bb8", line:"#304561"}
        : profile.palette(state.config.background),
      c = state.config;
    const variables = {
      "--accent": c.accent,
      "--studio-bg": c.backgroundEnd,
      "--studio-panel": c.background,
      "--text": p.ink,
      "--muted": p.muted,
      "--line": p.line,
      "--control-bg": p.light ? "#f7f8fb" : "#070e14",
      "--control-text": p.ink,
    };
    Object.entries(variables).forEach(([key, value]) =>
      document.documentElement.style.setProperty(key, value),
    );
    document.body.classList.toggle("light-theme", p.light);
  }
  function renderThemes() {
    $("theme-presets").replaceChildren(
      ...profile.THEMES.map((theme) => {
        const b = document.createElement("button");
        const active =
          state.config.theme === theme.id &&
          state.config.background === theme.bg1 &&
          state.config.backgroundEnd === theme.bg2 &&
          state.config.accent === theme.accent;
        b.className = "theme-preset" + (active ? " active" : "");
        b.dataset.theme = theme.id;
        b.setAttribute("aria-pressed", String(active));
        b.setAttribute("aria-label", theme.label + " 테마 적용");
        b.style.setProperty("--t-accent", theme.accent);
        b.style.setProperty("--t-start", theme.bg1);
        b.style.setProperty("--t-end", theme.bg2);
        const mini = document.createElement("span");
        mini.className = "theme-mini";
        mini.setAttribute("aria-hidden", "true");
        mini.append(
          ...Array.from({ length: 3 }, () => document.createElement("i")),
        );
        const name = document.createElement("span");
        name.className = "theme-name";
        name.textContent = theme.name;
        const label = document.createElement("small");
        label.textContent = theme.label;
        b.append(mini, name, label);
        b.onclick = () => {
          const p = profile.palette(theme.bg1);
          Object.assign(state.config, {
            theme: theme.id,
            background: theme.bg1,
            backgroundEnd: theme.bg2,
            accent: theme.accent,
            ink: p.ink,
            bubble: p.surface,
          });
          state.styles.narration.color = p.text;
          state.styles.dialogue.color = p.ink;
          delete state.styles.narration.bubble;
          delete state.styles.dialogue.bubble;
          syncConfig();
          syncStyle();
          schedule();
        };
        return b;
      }),
    );
  }
  let fontRequest = 0;
  async function loadFont(config = state.config) {
    const request = ++fontRequest;
    $("font-status").textContent = "FONT / LOADING";
    try {
      await document.fonts.load(
        `${config.fontItalic ? "italic " : ""}${config.fontSize}px ${config.fontFamily}`,
        "한글 Aa 012",
      );
      if (request === fontRequest) {
        $("font-status").textContent = "FONT / READY";
        schedule();
      }
    } catch {
      if (request === fontRequest)
        $("font-status").textContent = "FONT / LOAD FAILED · 대체 글꼴 적용";
    }
  }
  function renderFonts() {
    $("font-options").replaceChildren(
      ...allFonts().map((f) => {
        const b = document.createElement("button"),
          active = state.config.fontFamily === fontFamily(f);
        b.className = "font-option" + (active ? " active" : "");
        b.dataset.font = f.id;
        b.setAttribute("aria-pressed", String(active));
        const label = document.createElement("strong");
        label.textContent = f.label;
        const sample = document.createElement("small");
        sample.textContent = f.sample;
        sample.style.fontFamily = fontFamily(f);
        if (f.italic) sample.style.fontStyle = "italic";
        b.append(label, sample);
        b.onclick = () => {
          state.config.fontFamily = fontFamily(f);
          state.config.fontItalic = !!f.italic;
          syncMetadata();
          renderFonts();
          schedule();
          loadFont();
        };
        return b;
      }),
    );
  }
  function syncMetadata() {
    const m = state.metadata[$("meta-target").value];
    $("meta-position").value = m.position;
    $("meta-inherit").checked = m.inherit;
    $("meta-custom").hidden = m.inherit;
    $("meta-color").value = m.color;
    $("meta-size").value = +(m.size * 0.75).toFixed(2);
    $("meta-bold").checked = m.bold;
    $("meta-label").checked = m.label;
    $("meta-font").replaceChildren(
      ...allFonts().map((f) => new Option(f.label, fontFamily(f))),
    );
    $("meta-font").value = m.fontFamily;
  }
  $("meta-target").onchange = syncMetadata;
  for (const key of [
    "position",
    "inherit",
    "color",
    "size",
    "bold",
    "label",
    "font",
  ])
    $("meta-" + key).addEventListener("input", () => {
      const m = state.metadata[$("meta-target").value],
        el = $("meta-" + key);
      if (["inherit", "bold", "label"].includes(key)) m[key] = el.checked;
      else if (key === "size") {
        if (!Number.isFinite(el.valueAsNumber)) return;
        m.size = (Math.min(36, Math.max(6, el.valueAsNumber)) * 4) / 3;
      } else if (key === "font") {
        const f = allFonts().find((f) => fontFamily(f) === el.value);
        if (f) {
          m.fontFamily = fontFamily(f);
          m.fontItalic = !!f.italic;
          loadFont({ ...state.config, ...m, fontSize: m.size });
        }
      } else m[key] = el.value;
      $("meta-custom").hidden = m.inherit;
      schedule();
    });
  function renderCustomFonts() {
    const previous = $("custom-font-list").value;
    $("custom-font-list").replaceChildren(
      new Option(
        customFonts.length ? "등록 폰트 선택" : "등록된 폰트 없음",
        "",
      ),
      ...customFonts.map((f) => new Option(f.label, f.id)),
    );
    if (customFonts.some((f) => f.id === previous))
      $("custom-font-list").value = previous;
    $("remove-custom-font").disabled = !$("custom-font-list").value;
    renderFonts();
    syncMetadata();
  }
  async function registerFont(data, label, id = crypto.randomUUID()) {
    if (!(data instanceof ArrayBuffer) || data.byteLength > 15 * 1024 * 1024)
      throw new Error("글꼴 파일 한도 15MB 초과.");
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("글꼴 식별자 오류.");
    const existing = customFonts.find((f) => f.id === id);
    if (existing) return existing;
    if (customFonts.length >= 20) throw new Error("등록 글꼴 한도 20개 도달.");
    const family = "ChamberUser_" + id.replaceAll("-", ""),
      face = new FontFace(family, data);
    await face.load();
    document.fonts.add(face);
    const item = {
      id,
      label: String(label).slice(0, 80),
      family,
      sample: "USER FONT",
      data,
      face,
    };
    customFonts.push(item);
    return item;
  }
  $("custom-font-file").onchange = async () => {
    const file = $("custom-font-file").files[0];
    if (!file) return;
    try {
      if (
        !/\.(woff2?|ttf|otf)$/i.test(file.name) ||
        file.size > 15 * 1024 * 1024
      )
        throw new Error("지원 규격: WOFF / WOFF2 / TTF / OTF, 15MB 이하.");
      const f = await registerFont(
        await file.arrayBuffer(),
        file.name.replace(/\.[^.]+$/, ""),
      );
      state.config.fontFamily = fontFamily(f);
      state.config.fontItalic = false;
      renderCustomFonts();
      $("custom-font-list").value = f.id;
      $("remove-custom-font").disabled = false;
      $("custom-font-status").textContent =
        `USER FONT / ${f.label} · 등록 완료.`;
      schedule();
    } catch (error) {
      $("custom-font-status").textContent = "등록 실패. " + error.message;
    }
    $("custom-font-file").value = "";
  };
  $("custom-font-list").onchange = () =>
    ($("remove-custom-font").disabled = !$("custom-font-list").value);
  $("remove-custom-font").onclick = () => {
    const i = customFonts.findIndex(
      (f) => f.id === $("custom-font-list").value,
    );
    if (i < 0) return;
    const f = customFonts[i];
    document.fonts.delete(f.face);
    customFonts.splice(i, 1);
    if (state.config.fontFamily === fontFamily(f)) {
      state.config.fontFamily = fontFamily(profile.FONTS[0]);
      state.config.fontItalic = false;
    }
    Object.values(state.metadata).forEach((m) => {
      if (m.fontFamily === fontFamily(f)) {
        m.fontFamily = fontFamily(profile.FONTS[0]);
        m.fontItalic = false;
      }
    });
    renderCustomFonts();
    schedule();
    $("custom-font-status").textContent =
      "USER FONT / 해제 완료. 저장된 프리셋은 별도 보관.";
  };
  $("help").onclick = () => $("help-dialog").showModal();
  document
    .querySelectorAll(".dialog-close")
    .forEach((b) => (b.onclick = () => $("help-dialog").close()));
  let avatarSequence = 0;
  $("avatar-file").onchange = async () => {
    const file = $("avatar-file").files[0],
      name = $("avatar-speaker").value;
    if (!file) return;
    const request = ++avatarSequence;
    try {
      if (!name) throw new Error("대사 인물을 먼저 선택하십시오.");
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw new Error("지원 이미지 규격: PNG / JPG / WEBP, 15MB 이하.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const decoded = await decodeImage(data);
      if (request !== avatarSequence) return;
      state.speakerImages[name] = decoded.image;
      state.speakerData[name] = decoded.data;
      state.config.showAvatars = true;
      syncConfig();
      schedule();
      $("avatar-status").textContent = `${name} / IMAGE READY`;
    } catch (error) {
      $("avatar-status").textContent = error.message;
    }
    $("avatar-file").value = "";
  };
  $("avatar-speaker").onchange = () => {
    $("avatar-status").textContent = state.speakerImages[
      $("avatar-speaker").value
    ]
      ? "IMAGE / READY"
      : "IMAGE / NOT LOADED";
  };
  $("remove-avatar").onclick = () => {
    const name = $("avatar-speaker").value;
    avatarSequence++;
    delete state.speakerImages[name];
    delete state.speakerData[name];
    $("avatar-status").textContent = "IMAGE / REMOVED";
    schedule();
  };
  async function decodeImage(data) {
    const img = new Image();
    img.src = data;
    await img.decode();
    if (img.width * img.height > 40000000)
      throw new Error("이미지 해상도 초과. 4천만 픽셀 이하로 조정하십시오.");
    const ratio = Math.min(1, 2400 / Math.max(img.width, img.height));
    if (ratio < 1) {
      const reduced = document.createElement("canvas");
      reduced.width = Math.round(img.width * ratio);
      reduced.height = Math.round(img.height * ratio);
      reduced
        .getContext("2d")
        .drawImage(img, 0, 0, reduced.width, reduced.height);
      data = reduced.toDataURL("image/png");
      const resized = new Image();
      resized.src = data;
      await resized.decode();
      return { image: resized, data };
    }
    return { image: img, data };
  }
  $("background-file").onchange = async () => {
    const file = $("background-file").files[0];
    if (!file) return;
    const sequence = ++loadSequence;
    try {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw new Error("첨부 규격: PNG / JPG / WEBP, 15MB 이하.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const decoded = await decodeImage(data);
      if (sequence !== loadSequence) return;
      state.backgroundData = decoded.data;
      state.backgroundImage = decoded.image;
      $("image-name").textContent = file.name;
      render();
    } catch (error) {
      message(error.message || "IMAGE / DECODE FAILED.", true);
    }
    $("background-file").value = "";
  };
  $("remove-background").onclick = () => {
    loadSequence++;
    state.backgroundImage = null;
    state.backgroundData = "";
    $("image-name").textContent = "IMAGE LAYER / NOT LOADED";
    schedule();
  };
  $("previous-page").onclick = () => {
    page = Math.max(0, page - 1);
    render();
    $("preview-scroll").scrollTop = 0;
  };
  $("next-page").onclick = () => {
    if (result) page = Math.min(result.pages.length - 1, page + 1);
    render();
    $("preview-scroll").scrollTop = 0;
  };
  $("zoom-in").onclick = () => {
    zoom = Math.min(2, (zoom || canvas.clientWidth / canvas.width) + 0.15);
    fitCanvas();
  };
  $("zoom-out").onclick = () => {
    zoom = Math.max(0.15, (zoom || canvas.clientWidth / canvas.width) - 0.15);
    fitCanvas();
  };
  $("zoom-fit").onclick = () => {
    zoom = null;
    fitCanvas();
  };
  new ResizeObserver(() => {
    fitCanvas();
    if (previewEditing) requestAnimationFrame(() => {
      if (previewEditing) $("preview-text-editor").scrollIntoView({block: "nearest"});
    });
  }).observe($("preview-scroll"));
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  const safeName = () =>
    `CHAMBER_${(state.title || "excerpt").replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 50)}`;
  function toPNG(target) {
    return new Promise((resolve, reject) =>
      target.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("PNG 출력 실패. 규격 축소 후 재시도하십시오.")),
        "image/png",
      ),
    );
  }
  const downloadURLs = [];
  function clearDownloads() {
    downloadURLs.forEach((url) => URL.revokeObjectURL(url));
    downloadURLs.length = 0;
    $("download-list").replaceChildren();
    $("download-results").hidden = true;
  }
  function addDownload(blob, name, index) {
    const url = URL.createObjectURL(blob);
    downloadURLs.push(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.textContent = `PAGE ${String(index + 1).padStart(2, "0")} / PNG ↓`;
    $("download-list").append(link);
    $("download-results").hidden = false;
    link.click();
  }
  async function exportImages(all) {
    if (busy || !state.blocks.length) return;
    render();
    if (!result) return;
    busy = true;
    setExportEnabled(false);
    const snapshot = {
      ...structuredClone({
        ...state,
        backgroundImage: null,
        speakerImages: null,
      }),
      backgroundImage: state.backgroundImage,
      speakerImages: { ...state.speakerImages },
    };
    const filename = safeName(),
      currentPage = page,
      run = ++exportSequence;
    try {
      message("PNG OUTPUT / PREPARING");
      await document.fonts.load(
        `${snapshot.config.fontItalic ? "italic " : ""}${snapshot.config.fontSize}px ${snapshot.config.fontFamily}`,
        "가나다 ABC",
      );
      await document.fonts.load(
        `${snapshot.config.fontItalic ? "italic " : ""}bold ${snapshot.config.fontSize}px ${snapshot.config.fontFamily}`,
        "가나다 ABC",
      );
      for (const m of Object.values(snapshot.metadata))
        if (!m.inherit)
          await document.fonts.load(
            `${m.fontItalic ? "italic " : ""}${m.bold ? "bold " : ""}${m.size}px ${m.fontFamily}`,
            "한글 Aa 012",
          );
      await document.fonts.ready;
      const output = core.layout(measure, snapshot),
        target = document.createElement("canvas");
      if (!all) {
        core.draw(
          target,
          snapshot,
          output,
          Math.min(currentPage, output.pages.length - 1),
        );
        download(
          await toPNG(target),
          `${filename}_${String(currentPage + 1).padStart(2, "0")}.png`,
        );
      } else {
        clearDownloads();
        let byteCount = 0;
        for (let i = 0; i < output.pages.length; i++) {
          message(`PNG OUTPUT / ${i + 1} OF ${output.pages.length}`);
          core.draw(target, snapshot, output, i);
          const blob = await toPNG(target);
          byteCount += blob.size;
          if (byteCount > 200 * 1024 * 1024)
            throw new Error(
              "출력 한도 200MB 초과. 남은 페이지는 현재 페이지 저장으로 출력하십시오.",
            );
          addDownload(
            blob,
            `${filename}_${String(i + 1).padStart(2, "0")}.png`,
            i,
          );
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      target.width = 1;
      target.height = 1;
      if (run === exportSequence)
        message(
          all
            ? "PNG 출력 요청 완료. 차단된 파일은 OUTPUT 목록에서 개별 저장하십시오."
            : "PNG 출력 요청 완료.",
        );
    } catch (error) {
      message(error.message || "PNG OUTPUT / FAILED. 재시도하십시오.", true);
    } finally {
      busy = false;
      setExportEnabled(!!result);
    }
  }
  $("export-current").onclick = () => exportImages(false);
  $("quick-export").onclick = () => exportImages(false);
  $("export-all").onclick = () => exportImages(true);
  // User presets store presentation settings only. No excerpt text or attribution is persisted.
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("chamber-extract-presets", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("presets", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("프리셋 저장소 사용 중. 다른 탭을 종료하십시오."));
  });
  async function presetTransaction(mode, action) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("presets", mode),
        request = action(tx.objectStore("presets"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("저장 중단"));
    });
  }
  function presetMessage(text, error = false) {
    $("preset-status").textContent = text;
    $("preset-status").classList.toggle("error", error);
  }
  function presetFailure(error) {
    presetMessage(
      "프리셋 처리 실패. 저장 공간 또는 브라우저 저장 권한 확인. " +
        (error?.message || ""),
      true,
    );
  }
  function presetData(id, name) {
    return {
      id,
      name,
      version: 1,
      updated: Date.now(),
      config: structuredClone(state.config),
      styles: structuredClone(state.styles),
      backgroundData: state.backgroundData,
      metadata: structuredClone(state.metadata),
      customFonts: customFonts
        .filter(
          (f) =>
            state.config.fontFamily === fontFamily(f) ||
            Object.values(state.metadata).some(
              (m) => !m.inherit && m.fontFamily === fontFamily(f),
            ),
        )
        .map(({ id, label, data }) => ({ id, label, data })),
    };
  }
  async function refreshPresets(selectId = $("saved-presets").value) {
    const presets = await presetTransaction("readonly", (store) =>
      store.getAll(),
    );
    presets.sort((a, b) => b.updated - a.updated);
    $("saved-presets").replaceChildren(
      new Option(presets.length ? "프리셋 선택" : "저장된 프리셋 없음", ""),
      ...presets.map((p) => new Option(p.name, p.id)),
    );
    if (presets.some((p) => p.id === selectId))
      $("saved-presets").value = selectId;
    presetSelection();
  }
  function presetSelection() {
    const chosen = !!$("saved-presets").value;
    ["load-preset", "overwrite-preset", "delete-preset"].forEach(
      (id) => ($(id).disabled = !chosen),
    );
    if (chosen)
      $("preset-name").value =
        $("saved-presets").selectedOptions[0].textContent;
  }
  $("saved-presets").onchange = presetSelection;
  let presetBusy = false;
  async function withPreset(action) {
    if (presetBusy) return;
    presetBusy = true;
    ["save-preset", "load-preset", "overwrite-preset", "delete-preset"].forEach(
      (id) => ($(id).disabled = true),
    );
    try {
      await action();
    } catch (error) {
      presetFailure(error);
    } finally {
      presetBusy = false;
      $("save-preset").disabled = false;
      presetSelection();
    }
  }
  async function savePreset(overwrite) {
    const name = $("preset-name").value.trim();
    if (!name) {
      presetMessage("프리셋 명칭을 입력하십시오.", true);
      return;
    }
    const id = overwrite ? $("saved-presets").value : crypto.randomUUID();
    if (!id) return;
    await presetTransaction("readwrite", (store) =>
      store.put(presetData(id, name)),
    );
    await refreshPresets(id);
    presetMessage(`PRESET / ${name} · 저장 완료. 원문·출처 제외.`);
  }
  $("save-preset").onclick = () => withPreset(() => savePreset(false));
  $("overwrite-preset").onclick = () => withPreset(() => savePreset(true));
  const color = (value) =>
    typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
  function cleanStyle(style) {
    const clean = {};
    if (!style || typeof style !== "object") return clean;
    for (const key of ["color", "bubble", "highlight"])
      if (color(style[key]) || (key === "highlight" && style[key] === ""))
        clean[key] = style[key];
    for (const key of ["bold", "italic", "strike", "underline"])
      if (typeof style[key] === "boolean") clean[key] = style[key];
    if (["left", "center", "right", "justify"].includes(style.textAlign)) clean.textAlign = style.textAlign;
    if (["auto", "left", "right"].includes(style.align))
      clean.align = style.align;
    return clean;
  }
  function cleanPresetConfig(input) {
    const config = { ...defaultConfig };
    document.querySelectorAll("[data-config]").forEach((el) => {
      const key = el.dataset.config,
        value = input?.[key];
      if (el.type === "number" || el.type === "range") {
        const factor = el.dataset.unit === "pt" ? 4 / 3 : 1;
        if (Number.isFinite(value))
          config[key] = Math.min(
            +el.max * factor,
            Math.max(+el.min * factor, value),
          );
      } else if (el.type === "color") {
        if (color(value)) config[key] = value;
      } else if (el.type === "checkbox") {
        if (typeof value === "boolean") config[key] = value;
      } else if (
        Array.from(el.options).some((option) => option.value === value)
      )
        config[key] = value;
    });
    const f =
      allFonts().find((f) => fontFamily(f) === input?.fontFamily) ||
      profile.FONTS[0];
    config.fontFamily = fontFamily(f);
    config.fontItalic = !!f.italic;
    config.format = input?.format === "chat" ? "chat" : "novel";
    config.theme = profile.THEMES.some((t) => t.id === input?.theme)
      ? input.theme
      : "sirius";
    if (color(input?.bubble)) config.bubble = input.bubble;
    config.width = Math.round(config.width);
    config.height = Math.round(config.height);
    return config;
  }
  $("load-preset").onclick = () =>
    withPreset(async () => {
      const id = $("saved-presets").value;
      if (!id) return;
      const preset = await presetTransaction("readonly", (store) =>
        store.get(id),
      );
      if (!preset || preset.version !== 1)
        throw new Error("프리셋 형식 불일치.");
      for (const saved of (preset.customFonts || []).slice(0, 20))
        await registerFont(saved.data, saved.label, saved.id);
      const metadata = defaultMetadata();
      for (const [key, m] of Object.entries(metadata)) {
        const input = preset.metadata?.[key];
        if (!input) continue;
        if (["tl", "tr", "bl", "br", "hidden"].includes(input.position))
          m.position = input.position;
        for (const k of ["inherit", "bold", "label"])
          if (typeof input[k] === "boolean") m[k] = input[k];
        if (color(input.color)) m.color = input.color;
        if (Number.isFinite(input.size))
          m.size = Math.min(48, Math.max(8, input.size));
        const f = allFonts().find((f) => fontFamily(f) === input.fontFamily);
        if (f) {
          m.fontFamily = fontFamily(f);
          m.fontItalic = !!f.italic;
        }
      }
      const config = cleanPresetConfig(preset.config);
      const styles = {
        narration: {
          ...defaultStyles.narration,
          ...cleanStyle(preset.styles?.narration),
        },
        dialogue: {
          ...defaultStyles.dialogue,
          ...cleanStyle(preset.styles?.dialogue),
        },
      };
      const sequence = ++loadSequence;
      let backgroundImage = null,
        backgroundData = "";
      if (preset.backgroundData) {
        if (
          typeof preset.backgroundData !== "string" ||
          preset.backgroundData.length > 40 * 1024 * 1024 ||
          !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
            preset.backgroundData,
          )
        )
          throw new Error("배경 데이터 손상.");
        const decoded = await decodeImage(preset.backgroundData);
        backgroundImage = decoded.image;
        backgroundData = decoded.data;
      }
      if (sequence !== loadSequence) return;
      Object.assign(state, {
        config,
        styles,
        metadata,
        backgroundImage,
        backgroundData,
      });
      renderCustomFonts();
      $("image-name").textContent = backgroundImage
        ? "PRESET / IMAGE LOADED"
        : "IMAGE LAYER / NOT LOADED";
      syncConfig();
      syncStyle();
      render();
      loadFont();
      presetMessage(
        `PRESET / ${preset.name} · 적용 완료. 원문·출처 유지. 개별 서식 우선.`,
      );
    });
  $("delete-preset").onclick = () =>
    withPreset(async () => {
      const id = $("saved-presets").value;
      if (!id) return;
      await presetTransaction("readwrite", (store) => store.delete(id));
      await refreshPresets("");
      $("preset-name").value = "";
      presetMessage("PRESET / 삭제 완료.");
    });
  function remapMarks(block, next) {
    const old = block.text;
    let start = 0, end = old.length, nextEnd = next.length;
    while (start < end && start < nextEnd && old[start] === next[start]) start++;
    while (end > start && nextEnd > start && old[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
    const shift = nextEnd - end;
    block.marks = block.marks.flatMap(mark => {
      if (mark.end <= start) return [mark];
      if (mark.start >= end) return [{...mark, start: mark.start + shift, end: mark.end + shift}];
      // Preserve the surviving portions of a marked span across a text replacement.
      const a = Math.min(mark.start, start), b = mark.end > end ? mark.end + shift : nextEnd;
      return b > a ? [{...mark, start: a, end: b}] : [];
    });
  }
  function applySelectionStyle(key, value) {
    const block = currentBlock();
    if (!block) return message("미리보기 또는 TEXT에서 문단을 선택하십시오.", true);
    recordHistory();
    const {start, end} = selection;
    if (value === undefined) {
      const style = {...core.blockStyle(block, state)};
      block.marks.forEach(m => { if (start >= m.start && start < m.end) Object.assign(style, m.style); });
      value = !style[key];
    }
    if (end > start) block.marks.push({start, end, style: {[key]: value}});
    else block.style[key] = key === "highlight" && block.style[key] === value ? "" : value;
    if (block.marks.length > 500) block.marks.shift();
    syncStyle();
    render();
  }
  function closePreviewEditor() {
    if (!previewEditing) return;
    previewEditing = null;
    $("preview-selection").replaceChildren();
    $("preview-editor-wrap").hidden = true;
    document.dispatchEvent(new CustomEvent("excerpt:preview-edit", {detail: false}));
  }
  function positionPreviewEditor() {
    if (!previewEditing || !result) return;
    const hit = previewHits.find(h => h.blockId === previewEditing);
    if (!hit) return closePreviewEditor();
    const ratio = canvas.clientWidth / result.width;
    const wrap = $("preview-editor-wrap"), input = $("preview-text-editor");
    wrap.style.left = `${hit.x * ratio}px`;
    wrap.style.top = `${hit.y * ratio}px`;
    wrap.style.width = `${hit.width * ratio}px`;
    wrap.style.height = `${hit.height * ratio}px`;
    input.style.fontFamily = state.config.fontFamily;
    input.style.fontSize = `${state.config.fontSize * ratio}px`;
    input.style.lineHeight = state.config.lineHeight;
    paintPreviewSelection();
  }
  function paintPreviewSelection() {
    const layer = $("preview-selection");
    layer.replaceChildren();
    if (!previewEditing || !result) return;
    const hit = previewHits.find(h => h.blockId === previewEditing);
    if (!hit) return;
    const ratio = canvas.clientWidth / result.width;
    const {start, end} = selection;
    let caret = null;
    function rect(x,y,w,h,kind) {
      const node = document.createElement("i");
      node.className = kind;
      Object.assign(node.style, {left:`${x*ratio}px`,top:`${y*ratio}px`,width:`${Math.max(1,w*ratio)}px`,height:`${h*ratio}px`});
      layer.append(node);
    }
    for (const line of hit.lines) {
      let x = line.x;
      for (const g of line.glyphs) {
        if (g.index < end && g.index + g.text.length > start)
          rect(x,line.y,g.advance,state.config.fontSize*1.2,"preview-selection-range");
        if (g.index <= start) caret = {x:x+(start>g.index?g.advance:0), y:line.y};
        x += g.advance;
      }
      if (!line.glyphs.length && line.start <= start) caret = {x:line.x,y:line.y};
    }
    if (start === end && caret) rect(caret.x,caret.y,1.5/ratio,state.config.fontSize*1.2,"preview-caret");
  }
  function previewOffset(event) {
    const hit = previewHits.find(h => h.blockId === previewEditing);
    if (!hit?.lines.length) return 0;
    const box = canvas.getBoundingClientRect(), ratio = canvas.clientWidth / result.width;
    const x = (event.clientX-box.left)/ratio, y = (event.clientY-box.top)/ratio;
    const line = hit.lines.reduce((best,l) => Math.abs(l.y+l.height/2-y)<Math.abs(best.y+best.height/2-y)?l:best);
    let left = line.x;
    for (const g of line.glyphs) {
      if (x < left + g.advance/2) return g.index;
      left += g.advance;
    }
    const last = line.glyphs.at(-1);
    return last ? last.index + last.text.length : line.start;
  }

  function openPreviewEditor(hit) {
    selected = hit.blockId;
    renderBlocks();
    renderStyleTargets();
    previewEditing = selected;
    const input = $("preview-text-editor");
    input.value = currentBlock().text;
    $("preview-editor-wrap").hidden = false;
    document.dispatchEvent(new CustomEvent("excerpt:preview-edit", {detail: true}));
    positionPreviewEditor();
    input.focus({preventScroll: true});
    input.setSelectionRange(hit.start, hit.start);
    selection = {start: hit.start, end: hit.start};
    paintPreviewSelection();
    input.scrollIntoView({block: "nearest"});
    recordHistory();
  }
  function renderPreviewHits() {
    $("preview-hits").replaceChildren(...previewHits.map(hit => {
      const b = document.createElement("button");
      b.className = "preview-hit";
      b.setAttribute("aria-label", `문단 직접 편집: ${state.blocks.find(x => x.id === hit.blockId)?.text.slice(0, 35) || "빈 문단"}`);
      Object.assign(b.style, {left: `${hit.x / result.width * 100}%`, top: `${hit.y / result.height * 100}%`,
        width: `${hit.width / result.width * 100}%`, height: `${hit.height / result.height * 100}%`});
      b.onclick = event => {
        openPreviewEditor(hit);
        if (event.detail) {
          const offset = previewOffset(event);
          previewInput.setSelectionRange(offset, offset);
          selection = {start:offset,end:offset};
          paintPreviewSelection();
        }
      };
      return b;
    }));
    if (previewEditing && previewEditing !== selected) closePreviewEditor();
    positionPreviewEditor();
  }
  const previewInput = $("preview-text-editor");
  for (const event of ["select", "keyup", "mouseup", "touchend"])
    previewInput.addEventListener(event, () => { selection = {start: previewInput.selectionStart, end: previewInput.selectionEnd}; paintPreviewSelection(); });
  previewInput.addEventListener("beforeinput", recordHistory);
  previewInput.addEventListener("input", () => {
    const block = currentBlock();
    if (!block || previewEditing !== block.id) return;
    const other = state.blocks.reduce((n,b) => n + (b.id === block.id ? 0 : b.text.length), 0);
    const next = previewInput.value.slice(0, 30000 - other);
    remapMarks(block, next);
    block.text = next;
    if (previewInput.value !== next) previewInput.value = next;
    $("block-text").value = next;
    selection = {start: previewInput.selectionStart, end: previewInput.selectionEnd};
    const item = [...$("block-list").children].find(b => b.dataset.id === selected);
    if (item) item.querySelector("small").textContent = next;
    render();
    requestAnimationFrame(() => $("preview-selection").querySelector(".preview-caret")?.scrollIntoView({block:"nearest", inline:"nearest"}));
  });
  let pointerAnchor = null;
  previewInput.addEventListener("pointerdown", event => {
    event.preventDefault();
    previewInput.focus({preventScroll:true});
    pointerAnchor = previewOffset(event);
    previewInput.setPointerCapture(event.pointerId);
    selection = {start:pointerAnchor,end:pointerAnchor};
    previewInput.setSelectionRange(pointerAnchor,pointerAnchor);
    paintPreviewSelection();
  });
  previewInput.addEventListener("pointermove", event => {
    if (pointerAnchor === null) return;
    const offset = previewOffset(event);
    selection = {start:Math.min(pointerAnchor,offset),end:Math.max(pointerAnchor,offset)};
    previewInput.setSelectionRange(selection.start,selection.end);
    paintPreviewSelection();
  });
  for (const type of ["pointerup","pointercancel"]) previewInput.addEventListener(type, () => {pointerAnchor=null;});
  previewInput.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); closePreviewEditor(); } });
  $("finish-preview-edit").onclick = closePreviewEditor;
  document.addEventListener("pointerdown", e => {
    if (previewEditing && !e.target.closest("#preview-editor-wrap, #preview-format, #find-dialog, .inline-toolbar, .preview-hit")) closePreviewEditor();
  });
  document.querySelectorAll("[data-preview-mark]").forEach(b => {
    b.addEventListener("pointerdown", e => e.preventDefault());
    b.onclick = () => applySelectionStyle(b.dataset.previewMark,
      b.dataset.previewMark === "highlight" ? $("preview-highlight-color").value : undefined);
  });
  $("preview-text-color").addEventListener("input", e => applySelectionStyle("color", e.target.value));
  $("clear-raw").onclick = () => { $("raw-text").value = ""; applyText(); message("발췌 내용 삭제 완료."); };
  $("paste-raw").onclick = async () => {
    const before = $("raw-text").value;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return message("클립보드에 텍스트가 없습니다.", true);
      if (text.length > 30000) return message("30,000자 초과. 클립보드 내용을 줄이십시오. 기존 내용 유지.", true);
      if ($("raw-text").value !== before) return message("입력 내용 변경 감지. 덮어쓰기 버튼을 다시 누르십시오.", true);
      if (core.parse(text, $("plain-type").value).length > 1500) return message("문단 한도 초과. 기존 내용 유지.", true);
      $("raw-text").value = text;
      applyText();
      message("클립보드 내용으로 교체 완료.");
    } catch {
      message("클립보드 읽기 불가. 브라우저 권한을 허용하거나 입력란에서 직접 붙여넣으십시오. 기존 내용 유지.", true);
    }
  };

  const undoStack = [], redoStack = [];
  let historyCurrent = null, restoringHistory = false;
  function historySnapshot() {
    const {backgroundImage, speakerImages, backgroundData, speakerData, ...data} = state;
    return {data:structuredClone(data), backgroundImage, backgroundData, speakerData:{...speakerData}, speakerImages:{...speakerImages}, raw:$("raw-text").value, selected, selection:{...selection}, page};
  }
  function recordHistory() {
    if (restoringHistory) return;
    const next = historySnapshot();
    const key = JSON.stringify([next.data,next.raw]);
    if (historyCurrent?.key === key && historyCurrent.backgroundData === next.backgroundData && JSON.stringify(historyCurrent.speakerData) === JSON.stringify(next.speakerData)) {
      Object.assign(historyCurrent,{selected,selection:{...selection},page});
      return;
    }
    if (historyCurrent) undoStack.push(historyCurrent);
    if (undoStack.length > 60) undoStack.shift();
    historyCurrent = {...next,key};
    redoStack.length = 0;
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $("edit-undo").disabled = !undoStack.length;
    $("edit-redo").disabled = !redoStack.length;
  }
  function moveHistory(redo) {
    recordHistory();
    const from = redo ? redoStack : undoStack, to = redo ? undoStack : redoStack;
    if (!from.length) return;
    const wasEditing = !!previewEditing;
    closePreviewEditor();
    to.push(historyCurrent);
    historyCurrent = from.pop();
    const saved = historyCurrent;
    restoringHistory = true;
    state = {...structuredClone(saved.data),backgroundData:saved.backgroundData,speakerData:{...saved.speakerData},backgroundImage:saved.backgroundImage,speakerImages:{...saved.speakerImages}};
    selected = saved.selected;
    selection = {...saved.selection}; page = saved.page;
    $("raw-text").value = saved.raw;
    syncConfig(); renderBlocks(); renderStyleTargets(); updateCount(); render();
    if (wasEditing) {
      const hit = previewHits.find(h=>h.blockId===selected);
      if (hit) {
        openPreviewEditor(hit);
        const end = Math.min(saved.selection.end,currentBlock().text.length);
        selection = {start:Math.min(saved.selection.start,end),end};
        previewInput.setSelectionRange(selection.start,end);
        paintPreviewSelection();
      }
    }
    restoringHistory = false;
    updateHistoryButtons();
  }
  for (const id of ["edit-undo","edit-redo"]) $(id).addEventListener("pointerdown",e=>e.preventDefault());
  $("edit-undo").onclick = () => moveHistory(false);
  $("edit-redo").onclick = () => moveHistory(true);
  document.addEventListener("keydown", e => {
    if (e.isComposing || !(e.ctrlKey || e.metaKey) || $("find-dialog").contains(e.target)) return;
    if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") {
      e.preventDefault(); moveHistory(e.shiftKey || e.key.toLowerCase() === "y");
    }
  });
  $("preview-align").onchange = e => {
    const block = currentBlock();
    if (!block) return message("정렬할 문단을 선택하십시오.",true);
    recordHistory();
    block.style.textAlign = e.target.value;
    render();
  };
  let foundMatch = null;
  function matches() {
    const query = $("find-query").value, found = [];
    if (!query) return found;
    for (const block of state.blocks) {
      let start = 0;
      while ((start = block.text.indexOf(query,start)) !== -1) {
        found.push({id:block.id,start,end:start+query.length}); start += query.length;
      }
    }
    return found;
  }
  function findNext() {
    const list = matches();
    if (!list.length) {foundMatch=null; $("find-status").textContent="일치하는 본문 없음."; return;}
    const previous = list.findIndex(m=>m.id===foundMatch?.id && m.start===foundMatch.start);
    const index = (previous+1)%list.length;
    foundMatch = list[index]; selected = foundMatch.id;
    closePreviewEditor();
    page = result.pages.findIndex(rows=>rows.some(r=>r.blockId===selected && r.glyphs.some(g=>g.index>=foundMatch.start && g.index<foundMatch.end)));
    page = Math.max(0,page); render();
    const hit = previewHits.find(h=>h.blockId===selected);
    if (hit) {
      openPreviewEditor(hit); selection={start:foundMatch.start,end:foundMatch.end};
      previewInput.setSelectionRange(selection.start,selection.end); paintPreviewSelection();
      $("find-next").focus({preventScroll:true});
    }
    $("find-status").textContent=`${index+1} / ${list.length}개 일치`;
  }
  function replaceMatches(all) {
    let list = matches();
    if (!all) list = list.filter(m=>m.id===foundMatch?.id && m.start===foundMatch.start).slice(0,1);
    if (!list.length) {findNext(); return;}
    const replacement = $("replace-query").value;
    const total = state.blocks.reduce((n,b)=>n+b.text.length,0) + list.reduce((n,m)=>n+replacement.length-(m.end-m.start),0);
    if (total>30000) {$("find-status").textContent="30,000자 한도 초과. 기존 내용 유지."; return;}
    recordHistory(); closePreviewEditor();
    for (const m of [...list].reverse()) {
      const block = state.blocks.find(b=>b.id===m.id);
      const next = block.text.slice(0,m.start)+replacement+block.text.slice(m.end);
      remapMarks(block,next); block.text=next;
    }
    foundMatch=null;
    renderBlocks(); renderStyleTargets(); render();
    $("find-status").textContent=`${list.length}개 치환 완료 · 남은 일치 ${matches().length}개`;
  }
  $("find-open").onclick = () => {$("find-dialog").show(); $("find-query").focus();};
  $("find-close").onclick = () => $("find-dialog").close();
  $("find-query").oninput = () => {foundMatch=null; $("find-status").textContent=`${matches().length}개 일치`;};
  $("find-next").onclick = findNext;
  $("replace-one").onclick = () => replaceMatches(false);
  $("replace-all").onclick = () => replaceMatches(true);
  document.fonts.addEventListener("loadingdone", schedule);
  syncConfig();
  renderBlocks();
  renderStyleTargets();
  render();
  loadFont();
  refreshPresets().catch(presetFailure);
})();
