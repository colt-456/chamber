(function () {
  "use strict";
  const $ = (id) => document.getElementById(id),
    core = window.ExcerptCore;
  const canvas = $("excerpt-canvas"),
    measure = document.createElement("canvas").getContext("2d");
  const defaultConfig = {
    format: "novel",
    fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
    fontSize: 24,
    lineHeight: 1.8,
    widthScale: 1,
    letterSpacing: 0,
    paragraphGap: 20,
    narrationGap: 8,
    dialogueGap: 0,
    padding: 56,
    background: "#081c21",
    accent: "#52ded3",
    ink: "#dfedee",
    bubble: "#12313b",
    grid: true,
    imageOpacity: 0.5,
    imageBrightness: 100,
    pageMode: "auto",
    width: 800,
    height: 1000,
  };
  const defaultStyles = {
    narration: {
      color: "#afc4cc",
      bold: false,
      italic: false,
      strike: false,
      highlight: "",
      align: "auto",
    },
    dialogue: {
      color: "#edf6f6",
      bold: false,
      italic: false,
      strike: false,
      highlight: "",
      align: "auto",
    },
  };
  let state = {
    config: { ...defaultConfig },
    styles: structuredClone(defaultStyles),
    speakers: {},
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
  let selection = { start: 0, end: 0 },
    exportSequence = 0;
  const SAMPLE =
    "*늦은 밤, 관제실에는 낮은 기계음만 남아 있었다.*\n하린: “이 신호, 아직 살아 있어.”\n*서윤은 꺼져 가던 모니터 위로 손을 뻗었다.*\n서윤: 누군가 우리를 기다리고 있다는 뜻이겠지.\n하린: 그럼 답해야지. 여기에 있다고.\n*작은 빛 하나가 어둠 속에서 천천히 깜박였다.*";
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
    $("zoom-label").textContent = `${Math.round(ratio * 100)}%`;
  }
  function setExportEnabled(enabled) {
    ["export-current", "export-all", "quick-export"].forEach(
      (id) => ($(id).disabled = !enabled || busy),
    );
  }
  function render() {
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
      message("내용을 입력해 주세요.");
      return;
    }
    try {
      result = core.layout(measure, state);
      page = Math.min(page, result.pages.length - 1);
      core.draw(canvas, state, result, page);
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
      else input.value = value;
    });
    document
      .querySelectorAll("[data-format]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.format === state.config.format),
        ),
      );
    for (const field of ["title", "creator", "character", "platform", "source"])
      $(field).value = state[field];
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
        ? "내용 길이에 맞춰 세로 길이를 자동으로 계산합니다."
        : state.config.pageMode === "four"
          ? "총 4장으로 나눕니다. 짧은 내용은 빈 페이지가 생길 수 있습니다."
          : "지정한 너비와 높이를 유지하며 필요한 만큼 페이지를 만듭니다.";
  }
  document.querySelectorAll("[data-panel]").forEach(
    (button) =>
      (button.onclick = () => {
        document
          .querySelectorAll("[data-panel]")
          .forEach((b) =>
            b.setAttribute("aria-selected", String(b === button)),
          );
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
      state.config[input.dataset.config] = value;
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
          message("웹폰트를 불러오지 못해 기본 글꼴로 표시합니다.", true);
        }
      }
    }),
  );
  document
    .querySelectorAll("input[type=number][data-config]")
    .forEach((input) =>
      input.addEventListener(
        "change",
        () => (input.value = state.config[input.dataset.config]),
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
    const raw = $("raw-text").value.slice(0, 30000);
    const blocks = core.parse(raw, $("plain-type").value);
    if (blocks.length > 1500) {
      message(
        "문단은 최대 1,500개까지 사용할 수 있습니다. 내용을 나누어 주세요.",
        true,
      );
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
    if (!state.title) state.title = "어둠 속의 작은 신호";
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
    ["bold", "italic", "strike"].forEach(
      (key) => ($(`style-${key}`).checked = !!style[key]),
    );
    $("style-highlight-on").checked = !!style.highlight;
    $("style-highlight").value = style.highlight || "#526124";
    $("style-align").value = style.align || "auto";
    $("target-note").textContent =
      $("style-target").value === "selected"
        ? "선택한 문단에만 적용됩니다."
        : "선택한 유형 또는 인물의 모든 문단에 적용됩니다.";
  }
  $("style-target").onchange = syncStyle;
  [
    "color",
    "bubble",
    "bold",
    "italic",
    "strike",
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
        target[key] = ["bold", "italic", "strike"].includes(key)
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
    block.text = $("block-text").value.slice(0, 30000 - otherLength);
    $("block-text").value = block.text;
    block.marks = [];
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
    button.onclick = () => {
      const block = currentBlock();
      if (!block) return;
      const key = button.dataset.mark,
        value = key === "highlight" ? $("mark-color").value : true;
      const { start, end } = selection;
      if (end > start)
        block.marks.push({ start, end, style: { [key]: value } });
      else
        block.style[key] =
          key === "highlight"
            ? block.style.highlight
              ? ""
              : value
            : !core.blockStyle(block, state)[key];
      if (block.marks.length > 500) block.marks.shift();
      syncStyle();
      schedule();
    };
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
      return message("최대 1,500개 문단까지 추가할 수 있습니다.", true);
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
  const themes = {
    signal: ["#081c21", "#52ded3", "#dfedee", "#afc4cc", "#edf6f6", "#12313b"],
    paper: ["#f3eee5", "#8b7050", "#342e28", "#655e52", "#342e28", "#e7dfd2"],
    midnight: [
      "#171729",
      "#aaa8ef",
      "#eeecff",
      "#bdbbd8",
      "#eeecff",
      "#2c2c48",
    ],
    rose: ["#f7e9ed", "#a0506e", "#553542", "#886675", "#553542", "#ecd4df"],
  };
  document.querySelectorAll("[data-theme]").forEach(
    (button) =>
      (button.onclick = () => {
        const [background, accent, ink, narration, dialogue, bubble] =
          themes[button.dataset.theme];
        Object.assign(state.config, { background, accent, ink, bubble });
        state.styles.narration.color = narration;
        state.styles.dialogue.color = dialogue;
        delete state.styles.dialogue.bubble;
        syncConfig();
        syncStyle();
        schedule();
      }),
  );
  async function decodeImage(data) {
    const img = new Image();
    img.src = data;
    await img.decode();
    if (img.width * img.height > 40000000)
      throw new Error("이미지는 4천만 픽셀 이하로 첨부해 주세요.");
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
        throw new Error("15MB 이하의 PNG, JPG, WEBP 이미지를 선택해 주세요.");
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
      message(error.message || "이미지를 읽지 못했습니다.", true);
    }
    $("background-file").value = "";
  };
  $("remove-background").onclick = () => {
    loadSequence++;
    state.backgroundImage = null;
    state.backgroundData = "";
    $("image-name").textContent = "배경 이미지 없음";
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
  new ResizeObserver(fitCanvas).observe($("preview-scroll"));
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
            : reject(
                new Error(
                  "PNG 생성에 실패했습니다. 크기를 줄여 다시 시도해 주세요.",
                ),
              ),
        "image/png",
      ),
    );
  }
  // Uncompressed ZIP keeps already-compressed PNGs intact, without a CDN dependency.
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function zip(files) {
    const chunks = [],
      directory = [];
    let offset = 0,
      directorySize = 0;
    for (const file of files) {
      const bytes = new Uint8Array(await file.blob.arrayBuffer()),
        name = new TextEncoder().encode(file.name),
        crc = crc32(bytes);
      const header = new Uint8Array(30 + name.length),
        h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x800, true);
      h.setUint16(12, 33, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, bytes.length, true);
      h.setUint32(22, bytes.length, true);
      h.setUint16(26, name.length, true);
      header.set(name, 30);
      const central = new Uint8Array(46 + name.length),
        d = new DataView(central.buffer);
      d.setUint32(0, 0x02014b50, true);
      d.setUint16(4, 20, true);
      d.setUint16(6, 20, true);
      d.setUint16(8, 0x800, true);
      d.setUint16(14, 33, true);
      d.setUint32(16, crc, true);
      d.setUint32(20, bytes.length, true);
      d.setUint32(24, bytes.length, true);
      d.setUint16(28, name.length, true);
      d.setUint32(42, offset, true);
      central.set(name, 46);
      chunks.push(header, file.blob);
      directory.push(central);
      offset += header.length + bytes.length;
      directorySize += central.length;
    }
    const end = new Uint8Array(22),
      view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, directorySize, true);
    view.setUint32(16, offset, true);
    return new Blob([...chunks, ...directory, end], {
      type: "application/zip",
    });
  }
  async function exportImages(all) {
    if (busy || !state.blocks.length) return;
    render();
    if (!result) return;
    busy = true;
    setExportEnabled(false);
    const snapshot = {
      ...structuredClone({ ...state, backgroundImage: null }),
      backgroundImage: state.backgroundImage,
    };
    const filename = safeName(),
      currentPage = page,
      run = ++exportSequence;
    try {
      message("글꼴과 PNG를 준비하고 있습니다…");
      await document.fonts.load(
        `${snapshot.config.fontSize}px ${snapshot.config.fontFamily}`,
        "가나다 ABC",
      );
      await document.fonts.load(
        `bold ${snapshot.config.fontSize}px ${snapshot.config.fontFamily}`,
        "가나다 ABC",
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
        const files = [];
        let byteCount = 0;
        for (let i = 0; i < output.pages.length; i++) {
          message(`PNG 생성 중 · ${i + 1} / ${output.pages.length}`);
          core.draw(target, snapshot, output, i);
          const blob = await toPNG(target);
          byteCount += blob.size;
          if (byteCount > 200 * 1024 * 1024)
            throw new Error(
              "전체 파일이 200MB를 넘습니다. 현재 페이지별로 저장하거나 크기를 줄여 주세요.",
            );
          files.push({
            name: `${filename}_${String(i + 1).padStart(2, "0")}.png`,
            blob,
          });
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        download(
          await zip(files),
          `${filename}_${output.pages.length}pages.zip`,
        );
      }
      target.width = 1;
      target.height = 1;
      if (run === exportSequence)
        message("저장 파일을 준비했습니다. 브라우저 다운로드를 확인해 주세요.");
    } catch (error) {
      message(
        error.message || "저장에 실패했습니다. 다시 시도해 주세요.",
        true,
      );
    } finally {
      busy = false;
      setExportEnabled(!!result);
    }
  }
  $("export-current").onclick = () => exportImages(false);
  $("quick-export").onclick = () => exportImages(false);
  $("export-all").onclick = () => exportImages(true);
  function projectData() {
    const { backgroundImage, ...data } = state;
    return {
      version: 1,
      ...data,
      rawText: $("raw-text").value,
      plainType: $("plain-type").value,
    };
  }
  $("save-project").onclick = () =>
    download(
      new Blob([JSON.stringify(projectData(), null, 2)], {
        type: "application/json",
      }),
      `${safeName()}.json`,
    );
  const color = (value) =>
    typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
  function cleanStyle(style) {
    const clean = {};
    if (!style || typeof style !== "object") return clean;
    for (const key of ["color", "bubble", "highlight"])
      if (color(style[key]) || (key === "highlight" && style[key] === ""))
        clean[key] = style[key];
    for (const key of ["bold", "italic", "strike"])
      if (typeof style[key] === "boolean") clean[key] = style[key];
    if (["left", "right", "auto"].includes(style.align))
      clean.align = style.align;
    return clean;
  }
  async function validateProject(data) {
    if (
      data.version !== 1 ||
      !Array.isArray(data.blocks) ||
      data.blocks.length > 1500
    )
      throw new Error("지원하지 않는 편집 파일입니다.");
    let total = 0;
    const blocks = data.blocks.map((b, index) => {
      if (!b || typeof b.text !== "string")
        throw new Error("문단 데이터가 올바르지 않습니다.");
      total += b.text.length;
      const marks = Array.isArray(b.marks)
        ? b.marks
            .slice(0, 500)
            .filter(
              (m) =>
                m &&
                Number.isInteger(m.start) &&
                Number.isInteger(m.end) &&
                m.start >= 0 &&
                m.end <= b.text.length &&
                m.end > m.start,
            )
            .map((m) => ({
              start: m.start,
              end: m.end,
              style: cleanStyle(m.style),
            }))
        : [];
      return {
        id: `b${index + 1}`,
        text: b.text,
        type: b.type === "narration" ? "narration" : "dialogue",
        speaker: typeof b.speaker === "string" ? b.speaker.slice(0, 24) : "",
        style: cleanStyle(b.style),
        marks,
      };
    });
    if (total > 30000)
      throw new Error("발췌 내용은 최대 30,000자까지 사용할 수 있습니다.");
    const config = { ...defaultConfig },
      inputConfig = data.config || {};
    document.querySelectorAll("[data-config]").forEach((input) => {
      const key = input.dataset.config,
        value = inputConfig[key];
      if (input.type === "number" || input.type === "range") {
        if (typeof value === "number" && Number.isFinite(value))
          config[key] = Math.min(+input.max, Math.max(+input.min, value));
      } else if (input.type === "color") {
        if (color(value)) config[key] = value;
      } else if (input.type === "checkbox") {
        if (typeof value === "boolean") config[key] = value;
      } else if (
        Array.from(input.options).some((option) => option.value === value)
      )
        config[key] = value;
    });
    config.width = Math.round(config.width);
    config.height = Math.round(config.height);
    if (inputConfig.format === "chat") config.format = "chat";
    if (color(inputConfig.bubble)) config.bubble = inputConfig.bubble;
    const imported = {
      config,
      blocks,
      styles: {
        narration: {
          ...defaultStyles.narration,
          ...cleanStyle(data.styles?.narration),
        },
        dialogue: {
          ...defaultStyles.dialogue,
          ...cleanStyle(data.styles?.dialogue),
        },
      },
      speakers: Object.create(null),
      backgroundImage: null,
      backgroundData: "",
    };
    for (const key of ["title", "creator", "character", "platform", "source"])
      imported[key] =
        typeof data[key] === "string"
          ? data[key].slice(0, key === "source" ? 300 : 100)
          : "";
    for (const name of new Set(blocks.map((b) => b.speaker).filter(Boolean)))
      if (data.speakers && Object.hasOwn(data.speakers, name))
        imported.speakers[name] = cleanStyle(data.speakers[name]);
    if (data.backgroundData) {
      if (
        typeof data.backgroundData !== "string" ||
        data.backgroundData.length > 40 * 1024 * 1024 ||
        !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(
          data.backgroundData,
        )
      )
        throw new Error("배경 이미지 데이터가 올바르지 않습니다.");
      const decoded = await decodeImage(data.backgroundData);
      imported.backgroundImage = decoded.image;
      imported.backgroundData = decoded.data;
    }
    if (blocks.length) core.layout(measure, imported);
    return imported;
  }
  $("load-project").onchange = async () => {
    const file = $("load-project").files[0];
    if (!file) return;
    const sequence = ++loadSequence;
    try {
      if (file.size > 45 * 1024 * 1024)
        throw new Error("편집 파일은 45MB 이하로 불러와 주세요.");
      const data = JSON.parse(await file.text()),
        imported = await validateProject(data);
      if (sequence !== loadSequence) return;
      state = imported;
      selected = state.blocks[0]?.id || null;
      page = 0;
      $("raw-text").value =
        typeof data.rawText === "string"
          ? data.rawText.slice(0, 30000)
          : state.blocks.map((b) => b.text).join("\n");
      $("plain-type").value =
        data.plainType === "narration" ? "narration" : "dialogue";
      $("image-name").textContent = state.backgroundImage
        ? "편집 파일의 배경 이미지"
        : "배경 이미지 없음";
      updateCount();
      syncConfig();
      renderBlocks();
      renderStyleTargets();
      render();
      await document.fonts.load(
        `${state.config.fontSize}px ${state.config.fontFamily}`,
        "가나다 ABC",
      );
      schedule();
    } catch (error) {
      message(`파일을 불러오지 못했습니다. ${error.message}`, true);
    }
    $("load-project").value = "";
  };
  document.fonts.addEventListener("loadingdone", schedule);
  syncConfig();
  renderBlocks();
  renderStyleTargets();
  render();
})();
