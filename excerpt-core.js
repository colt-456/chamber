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
    return `${style.italic || config.fontItalic ? "italic " : ""}${style.bold ? "700" : "400"} ${config.fontSize}px ${config.fontFamily}`;
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
      glyphs.push({ text: part.text, index: part.index, advance, style });
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
          "본문 영역 부족. 페이지 높이 증가 또는 여백·글자 크기 축소 필요.",
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
      throw new Error("가로 본문 영역 부족. 너비 증가 또는 여백 축소 필요.");
    const metadata = { tl: [], tr: [], bl: [], br: [] };
    const labels = {
      title: "제목",
      creator: "제작자",
      character: "캐릭터",
      platform: "플랫폼",
      source: "출처",
    };
    for (const key of Object.keys(labels)) {
      const value = String(state[key] || "").trim();
      const m = state.metadata?.[key] || {
        position: key === "title" ? "tl" : "bl",
        inherit: true,
        label: key !== "title",
      };
      if (!value || m.position === "hidden") continue;
      const position = ["tl", "tr", "bl", "br"].includes(m.position)
        ? m.position
        : "bl";
      const config = m.inherit
        ? { ...c }
        : {
            ...c,
            fontFamily: m.fontFamily || c.fontFamily,
            fontItalic: !!m.fontItalic,
            fontSize: m.size || 14,
            widthScale: 1,
            letterSpacing: 0,
          };
      const text = (m.label ? labels[key] + " · " : "") + value;
      metadata[position].push({
        key,
        text,
        config,
        style: {
          color: m.inherit ? state.styles.narration.color : m.color || c.ink,
          bold: !!m.bold,
        },
      });
    }
    const heights = {};
    for (const position of Object.keys(metadata)) {
      const both =
        metadata[position[0] + "l"].length &&
        metadata[position[0] + "r"].length;
      const width = both ? (contentWidth - 24) / 2 : contentWidth;
      let height = 0;
      for (const item of metadata[position]) {
        item.lines = wrap(ctx, item.text, width, item.config, item.style);
        item.lineHeight = item.config.fontSize * 1.5;
        item.offset = height;
        height += item.lines.length * item.lineHeight + 10;
      }
      heights[position] = Math.max(0, height - 10);
    }
    const topHeight = Math.max(heights.tl, heights.tr),
      bottomHeight = Math.max(heights.bl, heights.br);
    const header = c.padding + (topHeight ? topHeight + 24 : 0);
    const footer =
      c.padding +
      (bottomHeight ? bottomHeight + 24 : 0) +
      (c.pageNumbers ? 20 : 0);
    const rows = [];
    for (const block of state.blocks) {
      const style = blockStyle(block, state);
      const chat = c.format === "chat" && block.type === "dialogue";
      const avatar =
        chat && c.showAvatars && state.speakerImages?.[block.speaker] ? 48 : 0;
      const textWidth =
        (contentWidth - avatar) * (chat ? 0.86 : 1) - (chat ? 36 : 0);
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
          avatar,
        });
      });
    }
    const overhead = header + footer;
    const maxHeight = 12000;
    if (overhead > maxHeight - 200)
      throw new Error("제목·출처 길이 초과. 입력 축소 필요.");
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
          "4장 출력 한도 초과. 너비 증가 또는 글자 크기 축소 필요.",
        );
      for (let i = 0; i < 24; i++) {
        const middle = (low + high) / 2;
        if (splitRows(rows, middle).length <= 4) high = middle;
        else low = middle;
      }
      pageHeight = Math.ceil(Math.max(c.height, high + overhead));
      if (pageHeight > maxHeight) throw new Error("출력 높이 상한: 12,000px.");
      pages = splitFour(rows, pageHeight - overhead);
    } else {
      pageHeight = c.height;
      if (pageHeight - overhead < c.fontSize * c.lineHeight + 50)
        throw new Error(
          "본문 공간 부족. 높이 증가 또는 여백·제목·출처 축소 필요.",
        );
      pages = splitRows(rows, pageHeight - overhead);
    }
    if (pages.length > 100)
      throw new Error("100장 출력 한도 초과. 높이 증가 또는 입력 분할 필요.");
    return {
      pages,
      width: c.width,
      height: pageHeight,
      header,
      footer,
      metadata,
      metadataHeights: heights,
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
      if (style.underline) {
        ctx.fillStyle = style.color;
        ctx.fillRect(x, y + config.fontSize * 0.14, glyph.advance, Math.max(1, config.fontSize / 18));
      }
      x += glyph.advance;
    }
  }
  function draw(canvas, state, result, pageIndex) {
    const hitAreas = [];
    const c = state.config;
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext("2d");
    const background = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    background.addColorStop(0, c.background);
    background.addColorStop(1, c.backgroundEnd || c.background);
    ctx.fillStyle = background;
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
    if (c.frameStyle !== "none")
      drawHUDFrame(ctx, canvas.width, canvas.height, c.accent);
    for (const [position, items] of Object.entries(result.metadata)) {
      const top =
        position[0] === "t"
          ? c.padding
          : canvas.height -
            c.padding -
            result.metadataHeights[position] -
            (c.pageNumbers ? 20 : 0);
      for (const item of items)
        item.lines.forEach((line, i) => {
          const x =
            position[1] === "r"
              ? canvas.width - c.padding - line.width
              : c.padding;
          drawLine(
            ctx,
            line,
            x,
            top +
              item.offset +
              i * item.lineHeight +
              item.config.fontSize * 0.92,
            item.config,
          );
        });
    }
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
        (row.chat && alignRight
          ? c.width - c.padding * 2 - bubbleWidth - (row.avatar || 0)
          : row.avatar || 0);
      if (row.chat) {
        ctx.fillStyle = row.style.bubble || c.bubble;
        const gap = group[group.length - 1].last
          ? c.paragraphGap + c.dialogueGap
          : 0;
        const panelHeight = Math.max(1, groupHeight - gap);
        if (c.bubbleShape === "round") {
          ctx.beginPath();
          ctx.roundRect(left, y, bubbleWidth, panelHeight, 12);
        } else
          panelPath(
            ctx,
            left,
            y,
            bubbleWidth,
            panelHeight,
            Math.min(10, panelHeight / 3),
          );
        ctx.fill();
        if (c.bubbleShape !== "round") {
          ctx.save();
          ctx.strokeStyle = c.accent;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = c.accent;
          ctx.fillRect(
            alignRight ? left + bubbleWidth - 30 : left + 10,
            y,
            20,
            2,
          );
          ctx.restore();
        }
        if (row.avatar && row.first) {
          const avatar = state.speakerImages?.[row.speaker];
          if (avatar) {
            const ax = alignRight ? c.width - c.padding - 36 : c.padding;
            ctx.save();
            panelPath(ctx, ax, y, 36, 36, 6);
            ctx.clip();
            const side = Math.min(avatar.width, avatar.height);
            ctx.drawImage(
              avatar,
              (avatar.width - side) / 2,
              (avatar.height - side) / 2,
              side,
              side,
              ax,
              y,
              36,
              36,
            );
            ctx.restore();
            panelPath(ctx, ax, y, 36, 36, 6);
            ctx.strokeStyle = c.accent;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      hitAreas.push({ blockId: row.blockId, x: row.chat ? left + 18 : c.padding,
        y: y + row.top, width: row.chat ? bubbleWidth - 36 : row.textWidth,
        height: Math.max(c.fontSize * c.lineHeight, groupHeight - row.top - group[group.length - 1].bottom),
        start: row.glyphs[0]?.index || 0 });
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
    if (c.pageNumbers) {
      ctx.fillStyle = c.ink;
      ctx.font = `10px ${c.fontFamily}`;
      ctx.textAlign = "right";
      ctx.fillText(
        `${pageIndex + 1} / ${result.pages.length}`,
        canvas.width - c.padding,
        canvas.height - c.padding + 8,
      );
      ctx.textAlign = "left";
    }
    return hitAreas;
  }
  function panelPath(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
  }
  function drawHUDFrame(ctx, w, h, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    // Open rails, clipped corners and calibration ticks, with no tool branding.
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.moveTo(20, 75);
    ctx.lineTo(20, 38);
    ctx.lineTo(38, 20);
    ctx.lineTo(w * 0.35, 20);
    ctx.moveTo(w * 0.65, 20);
    ctx.lineTo(w - 32, 20);
    ctx.lineTo(w - 20, 32);
    ctx.lineTo(w - 20, h * 0.3);
    ctx.moveTo(w - 20, h * 0.7);
    ctx.lineTo(w - 20, h - 38);
    ctx.lineTo(w - 38, h - 20);
    ctx.lineTo(w * 0.65, h - 20);
    ctx.moveTo(w * 0.35, h - 20);
    ctx.lineTo(32, h - 20);
    ctx.lineTo(20, h - 32);
    ctx.lineTo(20, h - 75);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 49);
    ctx.lineTo(20, 37);
    ctx.lineTo(37, 20);
    ctx.lineTo(65, 20);
    ctx.moveTo(w - 65, h - 20);
    ctx.lineTo(w - 37, h - 20);
    ctx.lineTo(w - 20, h - 37);
    ctx.lineTo(w - 20, h - 49);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const y = h / 2 + (i - 3) * 8;
      ctx.moveTo(17, y);
      ctx.lineTo(i === 3 ? 27 : 22, y);
      ctx.moveTo(w - 17, y);
      ctx.lineTo(w - (i === 3 ? 27 : 22), y);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 3; i++) ctx.fillRect(w - 66 + i * 10, 20, 6, 2);
    ctx.restore();
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
