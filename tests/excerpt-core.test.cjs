const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../excerpt-core.js");
const context = {
  font: "",
  measureText(text) {
    return { width: Array.from(text).length * 14 };
  },
};
function state(text, pageMode = "auto") {
  return {
    blocks: core.parse(text),
    title: "테스트",
    creator: "작가",
    character: "인물",
    platform: "플랫폼",
    source: "작품",
    speakers: {},
    styles: { narration: { color: "#aaaaaa" }, dialogue: { color: "#ffffff" } },
    config: {
      width: 800,
      height: 650,
      padding: 56,
      fontSize: 24,
      fontFamily: "sans-serif",
      lineHeight: 1.8,
      widthScale: 1,
      letterSpacing: 0,
      paragraphGap: 20,
      narrationGap: 8,
      dialogueGap: 0,
      pageMode,
      format: "novel",
      ink: "#ffffff",
    },
  };
}
function textOf(pages) {
  return pages
    .flat()
    .flatMap((row) => row.glyphs.map((g) => g.text))
    .join("");
}
test("separates starred narration, quoted dialogue, named speakers, and unmarked defaults", () => {
  const blocks = core.parse(
    "*밤이었다.*\n하린: 안녕\n“잘 지냈어?”\n표시 없는 문장",
    "narration",
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["narration", "dialogue", "dialogue", "narration"],
  );
  assert.equal(blocks[1].speaker, "하린");
  assert.equal(blocks[1].text, "안녕");
  assert.equal(blocks[0].text, "밤이었다.");
  assert.equal(core.parse("https://example.com")[0].speaker, "");
});
test("mixed narration and quotes, multiline stars and unmatched punctuation preserve content", () => {
  const blocks = core.parse(
    "앞 문장 “대사” 뒷 문장\n*여러 줄\n지문*\n*닫히지 않은 별표",
    "narration",
  );
  assert.deepEqual(
    blocks.map((b) => b.text),
    ["앞 문장", "“대사”", "뒷 문장", "여러 줄", "지문", "*닫히지 않은 별표"],
  );
  assert.equal(blocks[1].type, "dialogue");
});
test("wrapping keeps grapheme clusters and honors inline mark ranges", () => {
  const text = "가족👨‍👩‍👧‍👦e\u0301문장";
  const lines = core.wrap(
    context,
    text,
    40,
    state("").config,
    { color: "#fff" },
    [{ start: 0, end: 2, style: { bold: true } }],
  );
  assert.equal(
    lines
      .flatMap((l) => l.glyphs)
      .map((g) => g.text)
      .join(""),
    text,
  );
  assert.ok(lines.flatMap((l) => l.glyphs).some((g) => g.text === "👨‍👩‍👧‍👦"));
  assert.ok(lines[0].glyphs[0].style.bold);
});
test("every mode preserves all characters and keeps rows above the footer", () => {
  for (const format of ["novel", "chat"])
    for (const mode of ["auto", "fixed", "four"]) {
      const s = state(
        Array.from(
          { length: 80 },
          (_, i) =>
            `인물${i % 2}: ${"기억하고 싶은 한글 대사입니다. ".repeat(6)}`,
        ).join("\n"),
        mode,
      );
      s.config.format = format;
      const output = core.layout(context, s);
      assert.equal(textOf(output.pages), s.blocks.map((b) => b.text).join(""));
      if (mode === "four") assert.equal(output.pages.length, 4);
      if (mode === "fixed") assert.equal(output.height, s.config.height);
      for (const page of output.pages)
        assert.ok(
          page.reduce((n, r) => n + r.height, 0) <=
            output.height - output.header - output.footer + 0.01,
        );
    }
});
test("four-page partition remains lossless across irregular paragraph heights", () => {
  for (let count = 0; count < 120; count++) {
    const rows = Array.from({ length: count }, (_, i) => ({
      id: i,
      height: 20 + ((i * 17) % 121),
    }));
    const capacity = Math.max(
      150,
      Math.ceil(rows.reduce((n, r) => n + r.height, 0) / 3),
    );
    const pages = core.splitFour(rows, capacity);
    assert.equal(pages.length, 4);
    assert.deepEqual(pages.flat(), rows);
    pages.forEach((p) =>
      assert.ok(p.reduce((n, r) => n + r.height, 0) <= capacity),
    );
  }
});
test("invalid space reports an actionable error rather than clipping", () => {
  const s = state("안녕하세요", "fixed");
  s.config.height = 320;
  s.config.padding = 180;
  assert.throws(() => core.layout(context, s), /공간|여백|높이/);
});
test("speaker and block overrides take priority over the type style", () => {
  const s = state("하린: 안녕");
  s.speakers.하린 = { bold: true, color: "#ff0000" };
  s.blocks[0].style.color = "#00ff00";
  assert.deepEqual(core.blockStyle(s.blocks[0], s), {
    bold: true,
    color: "#00ff00",
  });
});

test("corner credits reserve both bands, retain custom styles, and can be hidden", () => {
  const s = state("ALPHA: " + "본문 ".repeat(100), "fixed");
  s.metadata = Object.fromEntries(
    ["title", "creator", "character", "platform", "source"].map((key, i) =>
      [key, { position: ["tl", "tr", "bl", "br", "hidden"][i], inherit: false,
        size: 16, color: "#ff0000", fontFamily: "test-font", label: false }])
  );
  const result = core.layout(context, s);
  for (const position of ["tl", "tr", "bl", "br"]) {
    assert.equal(result.metadata[position].length, 1);
    const item = result.metadata[position][0];
    assert.equal(item.config.fontSize, 16);
    assert.equal(item.style.color, "#ff0000");
    assert.ok(item.lines.every(line => line.width <= (s.config.width - 2*s.config.padding - 24)/2));
  }
  assert.ok(!Object.values(result.metadata).flat().some(item => item.key === "source"));
  assert.ok(result.header > s.config.padding && result.footer > s.config.padding);
  assert.equal(textOf(result.pages), s.blocks.map(b => b.text).join(""));
  for (const m of Object.values(s.metadata)) m.position = "hidden";
  const hidden = core.layout(context, s);
  assert.equal(hidden.header, s.config.padding);
  assert.equal(hidden.footer, s.config.padding);
  assert.equal(Object.values(hidden.metadata).flat().length, 0);
});

test("avatar space is reserved only for enabled chat speakers with an image", () => {
  const s = state("ALPHA: " + "문장 ".repeat(120));
  s.config.format = "chat";
  s.config.showAvatars = true;
  s.speakerImages = { ALPHA: {width: 100, height: 100} };
  const withAvatar = core.layout(context, s);
  assert.ok(withAvatar.pages.flat().every(row => row.avatar === 48));
  s.config.showAvatars = false;
  const without = core.layout(context, s);
  assert.ok(without.pages.flat().every(row => row.avatar === 0));
  assert.ok(withAvatar.pages[0][0].textWidth < without.pages[0][0].textWidth);
  assert.equal(textOf(withAvatar.pages), textOf(without.pages));
});


test("alignment respects available width and leaves the final justified line unchanged", () => {
  const line = {width:30,last:false,glyphs:[{text:"가",index:0,advance:10},{text:" ",index:1,advance:10},{text:"나",index:2,advance:10}]};
  assert.equal(core.alignLine(line,100,"center").offset,35);
  assert.equal(core.alignLine(line,100,"right").offset,70);
  const justified = core.alignLine(line,100,"justify").line;
  assert.equal(justified.glyphs.reduce((n,g)=>n+g.advance,0),100);
  assert.equal(justified.glyphs[1].advance,80);
  assert.equal(core.alignLine({...line,last:true},100,"justify").line.width,30);
  assert.equal(line.glyphs[1].advance,10);
});
test("editing geometry preserves blank lines and UTF-16 text positions", () => {
  const c = state("x").config;
  const lines = core.wrap(context,"가😀\n\n나\n",600,c,{});
  assert.deepEqual(lines.map(l=>l.start),[0,4,5,7]);
  assert.deepEqual(lines[0].glyphs.map(g=>g.index),[0,1]);
  assert.equal(lines.length,4);
});
