/* Shared layout drives both the preview and PNG, without remote rendering services. */
(function (root) {
  "use strict";
  const segmenter =
    typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter("ko", { granularity: "grapheme" })
      : null;
  const graphemes = (text) =>
    segmenter
      ? Array.from(segmenter.segment(text), (s) => ({
          text: s.segment,
          index: s.index,
        }))
      : (() => {
          let index = 0;
          return Array.from(text, (text) => {
            const result = { text, index };
            index += text.length;
            return result;
          });
        })();
  function parse(text, plainType = "dialogue") {
    const blocks = [];
    let serial = 0;
    const add = (text, type, speaker = "") => {
      if (text.trim())
        blocks.push({
          id: `b${++serial}`,
          text: text.trim(),
          type,
          speaker,
          style: {},
          marks: [],
        });
    };
    const normalized = text.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
    // Star-wrapped narration may span multiple lines. Unmatched punctuation is preserved.
    const tokens = normalized.split(/(\*{1,2}[^*]+\*{1,2})/g);
    for (const token of tokens) {
      if (/^\*{1,2}[^*]+\*{1,2}$/.test(token)) {
        token
          .replace(/^\*{1,2}|\*{1,2}$/g, "")
          .split(/\n+/)
          .forEach((line) => add(line, "narration"));
        continue;
      }
      for (const line of token.split(/\n+/)) {
        if (!line.trim()) continue;
        const named = line.trim().match(/^([^:：\n]{1,24})[:：]\s*(.+)$/);
        if (
          named &&
          !/^(https?|ftp)$/i.test(named[1]) &&
          !/^\d+$/.test(named[1])
        ) {
          add(named[2], "dialogue", named[1].trim());
          continue;
        }
        const parts = line.split(/(“[^”]+”|「[^」]+」|『[^』]+』|"[^"\n]+")/g);
        parts.forEach((part) =>
          add(
            part,
            /^(“|「|『|")/.test(part) && /[”」』"]$/.test(part)
              ? "dialogue"
              : plainType,
          ),
        );
      }
    }
    return blocks;
  }
  function font(style, config) {
    return `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${config.fontSize}px ${config.fontFamily}`;
  }
  function blockStyle(block, state) {
    return {
      ...state.styles[block.type],
      ...(block.speaker ? state.speakers[block.speaker] : {}),
      ...block.style,
    };
  }
  function wrap(ctx, text, width, config, base, marks = []) {
    const lines = [];
    let glyphs = [],
      used = 0;
    const push = () => {
      lines.push({ glyphs, width: Math.max(0, used - config.letterSpacing) });
      glyphs = [];
      used = 0;
    };
    for (const part of graphemes(text)) {
      if (part.text === "\n") {
        push();
        continue;
      }
      const style = { ...base };
      for (const mark of marks)
        if (part.index >= mark.start && part.index < mark.end)
          Object.assign(style, mark.style);
      ctx.font = font(style, config);
      const advance = Math.max(
        1,
        ctx.measureText(part.text).width * config.widthScale +
          config.letterSpacing,
      );
      if (used + advance - config.letterSpacing > width && glyphs.length)
        push();
      glyphs.push({ text: part.text, advance, style });
      used += advance;
    }
    if (glyphs.length || !lines.length) push();
    return lines;
  }
  function splitRows(rows, capacity) {
    const pages = [];
    let current = [],
      height = 0;
    for (const row of rows) {
      if (row.height > capacity)
        throw new Error(
          "페이지 높이가 한 줄보다 작습니다. 높이를 늘리거나 여백·글자 크기를 줄여 주세요.",
        );
      if (current.length && height + row.height > capacity) {
        pages.push(current);
        current = [];
        height = 0;
      }
      current.push(row);
      height += row.height;
    }
    if (current.length || !pages.length) pages.push(current);
    return pages;
  }
  function splitFour(rows, capacity) {
    // Choose a balanced boundary only if all remaining rows still fit the remaining pages.
    const pages = [];
    let cursor = 0;
    for (let page = 0; page < 3; page++) {
      const remaining = rows.slice(cursor);
      const target = remaining.reduce((n, r) => n + r.height, 0) / (4 - page);
      let used = 0,
        take = 0;
      while (
        take < remaining.length &&
        used + remaining[take].height <= capacity
      ) {
        used += remaining[take++].height;
        if (
          used >= target &&
          splitRows(remaining.slice(take), capacity).length <= 3 - page
        )
          break;
      }
      pages.push(remaining.slice(0, take));
      cursor += take;
    }
    pages.push(rows.slice(cursor));
    return pages;
  }
  function layout(ctx, state) {
    const c = state.config;
    const contentWidth = c.width - c.padding * 2;
    if (contentWidth < Math.max(100, c.fontSize * 3))
      throw new Error(
        "가로 여백이 너무 넓습니다. 너비를 늘리거나 여백을 줄여 주세요.",
      );
    const small = { ...c, fontSize: 13, widthScale: 1, letterSpacing: 0 };
    const title = state.title
      ? wrap(
          ctx,
          state.title,
          contentWidth,
          { ...small, fontSize: 22 },
          { color: c.ink, bold: true },
        )
      : [];
    const credits = [
      ["제작자", state.creator],
      ["캐릭터", state.character],
      ["플랫폼", state.platform],
      ["출처", state.source],
    ]
      .filter(([, value]) => value.trim())
      .flatMap(([key, value]) =>
        wrap(ctx, `${key} · ${value}`, contentWidth, small, { color: c.ink }),
      );
    const header = c.padding + 28 + title.length * 31 + (title.length ? 20 : 0);
    const footer =
      c.padding + 28 + credits.length * 21 + (credits.length ? 14 : 0);
    const rows = [];
    for (const block of state.blocks) {
      const style = blockStyle(block, state);
      const chat = c.format === "chat" && block.type === "dialogue";
      const textWidth = contentWidth * (chat ? 0.86 : 1) - (chat ? 36 : 0);
      const lines = wrap(ctx, block.text, textWidth, c, style, block.marks);
      lines.forEach((line, index) => {
        const first = index === 0,
          last = index === lines.length - 1;
        const top = first ? (chat ? 14 : 0) + (block.speaker ? 21 : 0) : 0;
        const bottom = last
          ? (chat ? 14 : 0) +
            c.paragraphGap +
            (block.type === "narration" ? c.narrationGap : c.dialogueGap)
          : 0;
        rows.push({
          ...line,
          blockId: block.id,
          type: block.type,
          speaker: block.speaker,
          style,
          chat,
          first,
          last,
          top,
          bottom,
          height: c.fontSize * c.lineHeight + top + bottom,
          textWidth,
        });
      });
    }
    const overhead = header + footer;
    const maxHeight = 12000;
    if (overhead > maxHeight - 200)
      throw new Error("제목 또는 출처가 너무 깁니다. 길이를 줄여 주세요.");
    const total = rows.reduce((n, row) => n + row.height, 0);
    let pageHeight, pages;
    if (c.pageMode === "auto") {
      pageHeight = Math.min(
        maxHeight,
        Math.max(320, Math.ceil(total + overhead)),
      );
      pages = splitRows(rows, pageHeight - overhead);
    } else if (c.pageMode === "four") {
      let low = Math.max(1, ...rows.map((row) => row.height)),
        high = maxHeight - overhead;
      if (splitRows(rows, high).length > 4)
        throw new Error(
          "4장에 담기에는 내용이 너무 깁니다. 너비를 늘리거나 글자 크기를 줄여 주세요.",
        );
      for (let i = 0; i < 24; i++) {
        const middle = (low + high) / 2;
        if (splitRows(rows, middle).length <= 4) high = middle;
        else low = middle;
      }
      pageHeight = Math.ceil(Math.max(c.height, high + overhead));
      if (pageHeight > maxHeight)
        throw new Error("출력 높이는 12,000px 이하로 설정해 주세요.");
      pages = splitFour(rows, pageHeight - overhead);
    } else {
      pageHeight = c.height;
      if (pageHeight - overhead < c.fontSize * c.lineHeight + 50)
        throw new Error(
          "본문 공간이 부족합니다. 높이를 늘리거나 여백·제목·출처를 줄여 주세요.",
        );
      pages = splitRows(rows, pageHeight - overhead);
    }
    if (pages.length > 100)
      throw new Error(
        "100장을 초과했습니다. 페이지 높이를 늘리거나 내용을 나누어 주세요.",
      );
    return {
      pages,
      width: c.width,
      height: pageHeight,
      header,
      footer,
      title,
      credits,
      small,
      totalRows: rows.length,
    };
  }
  function drawLine(ctx, line, x, y, config) {
    for (const glyph of line.glyphs) {
      const style = glyph.style;
      if (style.highlight) {
        ctx.fillStyle = style.highlight;
        ctx.fillRect(
          x - 1,
          y - config.fontSize * 0.83,
          glyph.advance + 1,
          config.fontSize * 1.15,
        );
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(config.widthScale, 1);
      ctx.font = font(style, config);
      ctx.fillStyle = style.color;
      ctx.fillText(glyph.text, 0, 0);
      ctx.restore();
      if (style.strike) {
        ctx.fillStyle = style.color;
        ctx.fillRect(
          x,
          y - config.fontSize * 0.32,
          glyph.advance,
          Math.max(1, config.fontSize / 18),
        );
      }
      x += glyph.advance;
    }
  }
  function draw(canvas, state, result, pageIndex) {
    const c = state.config;
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = c.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (state.backgroundImage) {
      const img = state.backgroundImage;
      const ratio = Math.max(
        canvas.width / img.width,
        canvas.height / img.height,
      );
      ctx.save();
      ctx.globalAlpha = c.imageOpacity;
      ctx.filter = `brightness(${c.imageBrightness}%)`;
      ctx.drawImage(
        img,
        (canvas.width - img.width * ratio) / 2,
        (canvas.height - img.height * ratio) / 2,
        img.width * ratio,
        img.height * ratio,
      );
      ctx.restore();
    }
    if (c.grid) {
      ctx.save();
      ctx.strokeStyle = c.accent;
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 32) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += 32) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.4;
    ctx.strokeRect(18.5, 18.5, canvas.width - 37, canvas.height - 37);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.accent;
    ctx.fillRect(18, 18, 42, 3);
    ctx.font = `11px ${c.fontFamily}`;
    ctx.fillText("TXT.EXTRACT / CHAMBER", c.padding, c.padding + 8);
    result.title.forEach((line, i) =>
      drawLine(ctx, line, c.padding, c.padding + 49 + i * 31, {
        ...result.small,
        fontSize: 22,
      }),
    );
    let y = result.header;
    const rows = result.pages[pageIndex];
    const speakerNames = [
      ...new Set(state.blocks.map((b) => b.speaker).filter(Boolean)),
    ];
    for (let i = 0; i < rows.length;) {
      const row = rows[i];
      let end = i + 1;
      while (end < rows.length && rows[end].blockId === row.blockId) end++;
      const group = rows.slice(i, end);
      const groupHeight = group.reduce((sum, item) => sum + item.height, 0);
      const alignRight =
        row.style.align === "right" ||
        (row.style.align !== "left" &&
          row.speaker &&
          speakerNames.indexOf(row.speaker) % 2 === 1);
      const bubbleWidth = Math.min(
        row.textWidth + 36,
        Math.max(
          90,
          ...group.map((r) => r.width + 38),
          row.speaker.length * 13 + 36,
        ),
      );
      const left =
        c.padding +
        (row.chat && alignRight ? c.width - c.padding * 2 - bubbleWidth : 0);
      if (row.chat) {
        ctx.fillStyle = row.style.bubble || c.bubble;
        const gap = group[group.length - 1].last
          ? c.paragraphGap + c.dialogueGap
          : 0;
        ctx.beginPath();
        ctx.roundRect(left, y, bubbleWidth, Math.max(1, groupHeight - gap), 12);
        ctx.fill();
      }
      for (const item of group) {
        const x = row.chat ? left + 18 : c.padding;
        if (item.first && item.speaker) {
          ctx.font = `bold 12px ${c.fontFamily}`;
          ctx.fillStyle = c.accent;
          ctx.fillText(item.speaker, x, y + (row.chat ? 25 : 12));
        }
        drawLine(ctx, item, x, y + item.top + c.fontSize * 0.92, c);
        y += item.height;
      }
      i = end;
    }
    const footY = canvas.height - result.footer;
    ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(c.padding, footY + 8);
    ctx.lineTo(canvas.width - c.padding, footY + 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    result.credits.forEach((line, i) =>
      drawLine(ctx, line, c.padding, footY + 33 + i * 21, result.small),
    );
    ctx.fillStyle = c.accent;
    ctx.font = `10px ${c.fontFamily}`;
    const baseline = canvas.height - c.padding + 8;
    ctx.fillText("MADE BY @COLT", c.padding, baseline);
    ctx.textAlign = "right";
    ctx.fillText(
      `${String(pageIndex + 1).padStart(2, "0")} / ${String(result.pages.length).padStart(2, "0")}`,
      canvas.width - c.padding,
      baseline,
    );
    ctx.textAlign = "left";
  }
  root.ExcerptCore = {
    parse,
    wrap,
    layout,
    draw,
    splitRows,
    splitFour,
    blockStyle,
    graphemes,
  };
  if (typeof module !== "undefined") module.exports = root.ExcerptCore;
})(typeof window !== "undefined" ? window : globalThis);
