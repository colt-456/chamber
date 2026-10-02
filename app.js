'use strict';

const $ = id => document.getElementById(id),
      canvas = $('card'),
      ctx = canvas.getContext('2d');

const mono = '"D2Coding", monospace',
      sans = mono;

const FONTS = window.ChamberProfile.FONTS;

const FIELD_META = {
  name: ['이름 / 닉네임', 24, 'YOUR NAME'],
  handle: ['아이디', 40, '@your_id'],
  tagline: ['한 줄 소개', 65, '한 줄 소개를 입력합니다.'],
  contact: ['연락 방법', 65, '연락 방법을 입력합니다.'],
  farewell: ['이별 방법', 65, '이별 방법과 안내를 입력합니다.'],
  genre: ['GENRE', 160, '요즘 버닝 중인 장르를 입력합니다.'],
  info: ['INFO', 220, '자기소개를 입력합니다.'],
  ng: ['NG', 220, '주의 사항을 입력합니다.'],
  galleryTitle: ['이미지 섹션 제목', 40, '좋아하는 것들/페어 등'],
  credit: ['하단 텍스트', 85, '이미지 출처 등 원하는 텍스트를 입력합니다.']
};

const DEFAULT_SIZES = {
  name: 40, handle: 16, tagline: 16, contact: 14, 
  farewell: 13, genre: 14, info: 14, ng: 14, 
  galleryTitle: 14, credit: 12
};

const emptyImage = () => ({
  img: null, src: '', zoom: 1, dx: 0, dy: 0, 
  title: '', caption: '', showCaption: true
});

const THEMES = window.ChamberProfile.THEMES;

let palette;

function colors() {
  const hex = state.bg1.slice(1);
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const light = (rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722) > 155;
  
  return light ? {
    light, ink: '#202838', text: '#354155', muted: '#59677d', 
    dim: '#737e91', line: '#8e9aae', surface: '#d5dce6', 
    panel: '#ffffff48', grid: '#35415510'
  } : {
    light, ink: '#e4f1f5', text: '#b2c7d1', muted: '#7b9ba9', 
    dim: '#4e727f', line: '#335361', surface: '#08141c', 
    panel: '#b0deee06', grid: '#79d9e90b'
  };
}

function applyTheme(id) {
  const t = THEMES.find(t => t.id === id) || THEMES[0];
  Object.assign(state, { theme: t.id, accent: t.accent, bg1: t.bg1, bg2: t.bg2 });
  syncFields();
}

function updateChrome() {
  palette = colors();
  const root = document.documentElement.style;
  root.setProperty('--accent', state.accent);
  root.setProperty('--studio-bg', state.bg2);
  root.setProperty('--studio-panel', state.bg1);
  root.setProperty('--text', palette.ink);
  root.setProperty('--muted', palette.muted);
  root.setProperty('--line', palette.line);
  root.setProperty('--control-bg', palette.light ? '#f7f8fb' : '#070e14');
  root.setProperty('--control-text', palette.ink);
  document.body.classList.toggle('light-theme', palette.light);
}

function renderThemes() {
  const root = $('theme-presets');
  root.replaceChildren();
  
  THEMES.forEach(t => {
    const active = state.theme === t.id && state.accent === t.accent && state.bg1 === t.bg1 && state.bg2 === t.bg2;
    const b = el('button', { 
      class: 'theme-preset' + (active ? ' active' : ''), 
      'aria-pressed': active, 
      'aria-label': t.label + ' 테마 적용' 
    });
    
    b.style.setProperty('--t-accent', t.accent);
    b.style.setProperty('--t-start', t.bg1);
    b.style.setProperty('--t-end', t.bg2);
    
    const preview = el('span', { class: 'theme-mini', 'aria-hidden': 'true' });
    preview.append(el('i'), el('i'), el('i'));
    b.append(preview, el('span', { class: 'theme-name' }, t.name), el('small', {}, t.label));
    b.onclick = () => applyTheme(t.id);
    root.append(b);
  });
}

const initial = () => ({
  name: 'YOUR NAME', handle: '@your_id', tagline: '한 줄 소개 입력.', 
  contact: '연결 방법 또는 메모 입력.', farewell: '재연결 가능 여부 등 입력.', 
  genre: '', info: '자기소개 입력.\n중요한 내용입니다.', 
  ng: 'NG사항 입력.', galleryTitle: '좋아하는 것들/페어 등', credit: '', 
  theme: 'cyan', accent: '#52ded3', bg1: '#081c21', bg2: '#02090d', 
  layout: 'landscape', grid: true, mono: false, font: 'd2', 
  sizes: { ...DEFAULT_SIZES }, edited: {}, 
  avatar: emptyImage(), gallery: [emptyImage(), emptyImage()], stickers: [], 
  groups: [
    { id: 'age', label: 'AGE', single: true, options: ['성인', '미성년', '비공개'], selected: ['비공개'] },
    { id: 'tweet', label: 'TENDENCY', options: ['RT', '마음', '소비', '연성', '탐라대화', '일상', '드림'], selected: ['마음', '일상'] },
    { id: 'leave', label: 'FAREWELL', options: ['블락', '블언블', '뮤트'], selected: ['블언블'], noAdd: true }
  ]
});

let state = initial(), hits = [], W = 1200, H = 760, currentTab = 'style', 
    pendingUpload = null, drag = null, toastTimer;
let activeEdit = null, selectedField = 'info', exporting = false, fontSequence = 0, isGalleryTitle = false;

const coltLogo = new Image();
coltLogo.src = 'colt_logo.svg';
coltLogo.onload = () => { if (typeof draw === 'function') draw(); };

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3000);
}

function tab(name) {
  currentTab = name;
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-pressed', b.dataset.tab === name);
  });
  ['style', 'fonts', 'images', 'stickers'].forEach(t => $('panel-' + t).hidden = t !== name);
}

function setLayout(layout) {
  finishEdit();
  state.layout = layout;
  document.querySelectorAll('[data-layout]').forEach(b => {
    b.classList.toggle('selected', b.dataset.layout === layout);
    b.setAttribute('aria-pressed', b.dataset.layout === layout);
  });
  $('canvas-wrap').classList.toggle('portrait', layout === 'portrait');
  $('layout-label').textContent = layout.toUpperCase();
  draw();
}

function syncFields() {
  for (const k of ['accent', 'bg1', 'bg2']) {
    $(k).value = state[k];
    $(k + '-hex').value = state[k].toUpperCase();
  }
  $('grid').checked = state.grid;
  $('mono').checked = state.mono;
  
  updateChrome();
  renderThemes();
  renderFonts();
  setLayout(state.layout);
  renderImages();
  renderStickers();
  syncSize();
}

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'onClick') e.onclick = v;
    else e.setAttribute(k, v);
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

function line(x, y, x2, y2, color = '#343841', width = 1) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rect(x, y, w, h, fill, stroke) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
}

function text(s, x, y, size = 16, color = palette.text, font = mono, weight = 400) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textBaseline = 'top';
  ctx.fillText(String(s), x, y);
}

function fitText(s, x, y, max, size = 16, color = palette.text, font = mono, weight = 400) {
  let n = size;
  ctx.font = `${weight} ${n}px ${font}`;
  while (ctx.measureText(s).width > max && n > 9) {
    n -= .5;
    ctx.font = `${weight} ${n}px ${font}`;
  }
  text(s, x, y, n, color, font, weight);
}

function fontChoice() {
  return FONTS.find(f => f.id === state.font) || FONTS[0];
}

function contentFont() {
  const f = fontChoice();
  return `"${f.family}", "D2Coding", monospace`;
}

function fontSpec(size) {
  if (isGalleryTitle) return `600 ${size}px ${mono}`;
  return `${fontChoice().italic ? 'italic ' : ''}400 ${size}px ${contentFont()}`;
}

function fieldInfo(key) {
  if (key.startsWith('gallery:')) {
    const part = key.split(':')[2];
    return part === 'title' ? ['장르 / 페어명', 30, '장르 / 페어명'] : ['이미지 설명', 50, '설명을 입력합니다.'];
  }
  if (key.startsWith('tagadd:')) return ['성향 태그', 10, '태그 입력'];
  return FIELD_META[key];
}

function valueOf(key) {
  if (key.startsWith('gallery:')) {
    const [, i, k] = key.split(':');
    return state.gallery[Number(i)]?.[k] || '';
  }
  if (key.startsWith('tagadd:')) return '';
  return state[key] || '';
}

function setValue(key, value) {
  if (key.startsWith('gallery:')) {
    const [, i, k] = key.split(':');
    if (state.gallery[Number(i)]) state.gallery[Number(i)][k] = value;
  } else if (!key.startsWith('tagadd:')) {
    state[key] = value;
  }
}

function sizeOf(key) {
  return state.sizes[key] ?? (key.endsWith(':caption') ? 12 : key.endsWith(':title') ? 14 : 14);
}

function linesFor(s, width, size) {
  ctx.font = fontSpec(size);
  const lines = [];
  for (const paragraph of String(s).split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > width && line) {
        lines.push(line);
        line = '';
      }
      line += ch;
    }
    lines.push(line);
  }
  return lines;
}

function fieldHeight(key, width, min = 0) {
  const size = sizeOf(key);
  return Math.max(min, linesFor(valueOf(key) || fieldInfo(key)[2], width, size).length * Math.ceil(size * 1.4));
}

function userField(key, x, y, w, minH = 0, color = palette.text) {
  const size = sizeOf(key), h = fieldHeight(key, w, minH);
  addHit(x - 4, y - 3, w + 8, h + 6, 'field', key);
  
  if (activeEdit?.key === key && !exporting) return h;
  
  let value = valueOf(key);
  if (!value && !exporting) {
    value = fieldInfo(key)[2];
    color = palette.dim;
  }
  
  if (value) {
    ctx.font = fontSpec(size);
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';
    linesFor(value, w, size).forEach((s, i) => {
      ctx.font = fontSpec(size);
      ctx.fillText(s, x, y + i * Math.ceil(size * 1.4));
    });
  }
  return h;
}

function bracket(x, y, w, h, color = state.accent) {
  const n = 13;
  [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([xx, yy, dx, dy]) => {
    line(xx, yy, xx + dx * n, yy, color, 2);
    line(xx, yy, xx, yy + dy * n, color, 2);
  });
}

function addHit(x, y, w, h, kind, target) {
  hits.push({ x, y, w, h, kind, target });
}

function polygon(points, fill, stroke, width = 1) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function frame(x, y, w, h, fill = palette.panel, stroke = palette.line, cut = 13) {
  polygon([
    [x + cut, y], [x + w - 30, y], [x + w - 18, y + 5], [x + w - 6, y + 5], 
    [x + w, y + 11], [x + w, y + h - cut], [x + w - cut, y + h], 
    [x + 24, y + h], [x + 16, y + h - 5], [x, y + h - 5], [x, y + cut]
  ], fill, stroke);
}

function slashes(x, y, n = 5, size = 10, color = state.accent) {
  for (let i = 0; i < n; i++) {
    polygon([
      [x + i * 9, y], 
      [x + i * 9 + 5, y], 
      [x + i * 9 + 5 - size * .55, y + size], 
      [x + i * 9 - size * .55, y + size]
    ], color);
  }
}

function heading(n, s, x, y, w) {
  polygon([[x, y], [x + 24, y], [x + 31, y + 10], [x + 24, y + 22], [x, y + 22]], state.accent);
  text(n, x + 5, y + 4, 11, palette.light ? '#ffffff' : '#07141a', mono, 600);
  fitText(s, x + 41, y + 3, w - 114, 14, palette.ink, mono, 600);
  line(x + 40, y + 27, x + w - 51, y + 27, palette.line);
  line(x + w - 51, y + 27, x + w - 39, y + 17, palette.line);
  line(x + w - 39, y + 17, x + w, y + 17, palette.line);
  slashes(x + w - 37, y + 3, 4, 7);
}

function imageHeight(index, w, base) {
  const item = state.gallery[index];
  if (!item?.showCaption) return base;
  return Math.max(base, fieldHeight(`gallery:${index}:title`, w - 28) + fieldHeight(`gallery:${index}:caption`, w - 28) + 85);
}

function imageBox(item, x, y, w, h, key, number) {
  rect(x, y, w, h, palette.surface, palette.line);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();
  
  if (item.img) {
    const ratio = Math.max(w / item.img.width, h / item.img.height) * item.zoom, 
          iw = item.img.width * ratio, 
          ih = item.img.height * ratio;
    const dx = Math.max(-(iw - w) / 2, Math.min((iw - w) / 2, item.dx * w)), 
          dy = Math.max(-(ih - h) / 2, Math.min((ih - h) / 2, item.dy * h));
          
    if (state.mono) ctx.filter = 'grayscale(1)';
    ctx.drawImage(item.img, x + (w - iw) / 2 + dx, y + (h - ih) / 2 + dy, iw, ih);
    ctx.filter = 'none';
  } else {
    line(x, y, x + w, y + h, palette.line);
    line(x + w, y, x, y + h, palette.line);
    rect(x + w / 2 - 28, y + h / 2 - 28, 56, 56, palette.surface);
    line(x + w / 2 - 9, y + h / 2, x + w / 2 + 9, y + h / 2, palette.muted);
    line(x + w / 2, y + h / 2 - 9, x + w / 2, y + h / 2 + 9, palette.muted);
    ctx.textAlign = 'center';
    text(key === 'avatar' ? ' Profile Image' : 'IMG Upload', x + w / 2, y + h / 2 + 33, 14, palette.muted);
    ctx.textAlign = 'left';
    text(number || 'ID / 001', x + 13, y + 12, 11, palette.dim, mono);
  }
  
  ctx.restore();
  frame(x - 5, y - 5, w + 10, h + 10, null, state.accent, 12);
  line(x + 15, y - 7, x + w * .52, y - 7, state.accent, 2);
  slashes(x + w - 44, y + h + 3, 4, 5);
  addHit(x, y, w, h, 'image', key);
  
  if (key !== 'avatar' && item.showCaption) {
    const tk = `gallery:${key}:title`, 
          ck = `gallery:${key}:caption`, 
          th = fieldHeight(tk, w - 28), 
          ch = fieldHeight(ck, w - 28), 
          gh = th + ch + 24, 
          top = y + h - gh;
          
    const gradient = ctx.createLinearGradient(0, top - 12, 0, y + h);
    gradient.addColorStop(0, '#090b0e00');
    gradient.addColorStop(.25, '#090b0edb');
    gradient.addColorStop(1, '#090b0ef2');
    
    rect(x, top - 12, w, gh + 12, gradient);
    userField(tk, x + 14, top + 8, w - 28, 0, '#f1f5f8');
    userField(ck, x + 14, top + th + 12, w - 28, 0, '#bac9d2');
  }
}

function tagLayout(g, max) {
  const points = [];
  let xx = 0, yy = 25;
  for (const value of g.options) {
    ctx.font = `400 14px ${mono}`;
    const tw = ctx.measureText(value).width + 24;
    if (xx + tw > max) {
      xx = 0;
      yy += 37;
    }
    points.push({ value, x: xx, y: yy, w: tw });
    xx += tw + 7;
  }
  if (!g.single && !g.noAdd) {
    if (xx + 28 > max) {
      xx = 0;
      yy += 37;
    }
    points.push({ add: true, x: xx, y: yy, w: 28 });
  }
  return { points, height: yy + 45 };
}

function drawTags(g, x, y, max) {
  text(g.label, x, y, 14, state.accent, mono, 600);
  const layout = tagLayout(g, max);
  
  layout.points.forEach(p => {
    const xx = x + p.x, yy = y + p.y, tw = p.w, selected = g.selected.includes(p.value);
    
    polygon([
      [xx + 6, yy], [xx + tw, yy], [xx + tw, yy + 22], 
      [xx + tw - 6, yy + 28], [xx, yy + 28], [xx, yy + 6]
    ], selected ? state.accent + '28' : palette.surface, selected ? state.accent : palette.line);
    
    text(
      p.add ? '＋' : p.value, 
      xx + (p.add ? 6 : 12), yy + 5, 14, 
      selected ? state.accent : palette.muted, 
      mono
    );
    
    addHit(xx, yy, tw, 28, p.add ? 'tagadd' : 'tag', p.add ? `tagadd:${g.id}` : { group: g.id, value: p.value });
  });
  
  return y + layout.height;
}

function draw(forExport = false) {
  exporting = forExport === true;
  palette = colors();
  const p = state.layout === 'portrait';
  W = p ? 800 : 1200;
  
  const margin = 46, 
        avatarW = p ? 278 : 268, 
        avatarH = p ? 286 : 300, 
        tx = p ? 359 : 348, 
        tagW = p ? 395 : 296;
        
  const nameH = fieldHeight('name', W - 92), 
        handleY = 80 + nameH + 12, 
        dividerY = handleY + fieldHeight('handle', W - 92) + 24, 
        bodyY = dividerY + 41;
        
  const taglineY = bodyY + avatarH + 20, 
        taglineH = fieldHeight('tagline', avatarW), 
        contactY = taglineY + taglineH + 10, 
        contactH = fieldHeight('contact', avatarW);
        
  const tagH = state.groups.reduce((n, g) => n + tagLayout(g, tagW).height, 0), 
        farewellY = bodyY + tagH, 
        genreY = farewellY + fieldHeight('farewell', tagW) + 18, 
        genreH = fieldHeight('genre', tagW - 28, 44) + 28;
        
  const upperBottom = Math.max(contactY + contactH, genreY + 24 + genreH), 
        notesY = upperBottom + 32, 
        noteW = p ? 338 : 288;
        
  const noteH = Math.max(100, fieldHeight('info', noteW - 32) + 28, fieldHeight('ng', noteW - 32) + 28), 
        notesBottom = notesY + 40 + noteH;
        
  const gx = p ? 46 : 706, 
        gw = p ? 708 : 448, 
        gy = p ? notesBottom + 35 : bodyY - 7, 
        cardW = (gw - 23) / 2;
        
  const rowHeights = [];
  for (let i = 0; i < state.gallery.length; i += 2) {
    rowHeights.push(Math.max(imageHeight(i, cardW, p ? 201 : 222), imageHeight(i + 1, cardW, p ? 201 : 222)));
  }
  
  // 03 섹션 제목 폰트 고정을 위한 임시 변경
  const prevFont1 = state.font;
  state.font = 'd2'; 
  isGalleryTitle = true;
  const galleryTitleH = fieldHeight('galleryTitle', gw - 48), 
        galleryStart = gy + Math.max(51, galleryTitleH + 20);
  isGalleryTitle = false;
  state.font = prevFont1; // 폰트 원상 복구
        
  const galleryBottom = galleryStart + rowHeights.reduce((n, h) => n + h + 25, 0) - 25;
  
  const creditX = p ? 292 : 630, 
        creditW = W - creditX - 46, 
        footerH = Math.max(75, fieldHeight('credit', creditW) + 48);
        
  H = Math.max(notesBottom + footerH + 25, galleryBottom + footerH + 25, p ? 1000 : 800);
  canvas.width = W * 2;
  canvas.height = H * 2;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  hits = [];
  
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, state.bg1);
  bg.addColorStop(1, state.bg2);
  rect(0, 0, W, H, bg);
  
  if (state.grid) {
    for (let x = 0; x < W; x += 32) line(x, 0, x, H, palette.grid);
    for (let y = 0; y < H; y += 32) line(0, y, W, y, palette.grid);
    for (let x = 64; x < W; x += 128) {
      for (let y = 64; y < H; y += 128) {
        line(x - 2, y, x + 2, y, palette.line, .5);
        line(x, y - 2, x, y + 2, palette.line, .5);
      }
    }
  }
  
  polygon([
    [32, 8], [W - 124, 8], [W - 106, 19], [W - 33, 19], 
    [W - 8, 44], [W - 8, H - 52], [W - 34, H - 26], 
    [W - 182, H - 26], [W - 196, H - 12], [43, H - 12], 
    [12, H - 43], [12, 28]
  ], null, state.accent, 1.5);
  
  polygon([
    [37, 17], [W - 130, 17], [W - 111, 29], [W - 39, 29], 
    [W - 19, 49], [W - 19, H - 57], [W - 39, H - 37], 
    [W - 187, H - 37], [W - 202, H - 23], [48, H - 23], 
    [23, H - 48], [23, 34]
  ], null, palette.line);
  
  polygon([[39, 8], [223, 8], [211, 16], [32, 16]], state.accent);
  polygon([[W - 165, H - 12], [W - 61, H - 12], [W - 40, H - 25], [W - 151, H - 25]], state.accent);
  slashes(258, 8, 7, 7);
  
  line(14, 164, 23, 173, state.accent, 3);
  line(14, 173, 14, 278, state.accent, 3);
  line(W - 14, H - 245, W - 14, H - 130, state.accent, 3);
  
  for (let y = 320; y < H - 140; y += 22) {
    line(13, y, 18, y, palette.dim);
    line(W - 18, y, W - 13, y, palette.dim);
  }
  
  for (const [x, y] of [[30, 35], [W - 30, 49], [36, H - 46], [W - 32, H - 52]]) {
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  text('SYS. PROFILE / 001', 46, 40, 11, palette.muted);
  userField('name', 46, 80, W - 92, 0, palette.ink);
  userField('handle', 48, handleY, W - 96, 0, state.accent);
  
  polygon([
    [43, dividerY], [245, dividerY], [257, dividerY - 8], [W - 181, dividerY - 8], 
    [W - 169, dividerY + 3], [W - 43, dividerY + 3], [W - 43, dividerY + 9], 
    [W - 174, dividerY + 9], [W - 188, dividerY - 1], [262, dividerY - 1], 
    [250, dividerY + 8], [43, dividerY + 8]
  ], state.accent + '25', palette.line);
  
  line(44, dividerY + 1, 230, dividerY + 1, state.accent, 2);
  slashes(W - 152, dividerY - 6, 9, 7);
  
  imageBox(state.avatar, 46, bodyY, avatarW, avatarH, 'avatar');
  userField('tagline', 46, taglineY, avatarW, 0, palette.ink);
  userField('contact', 46, contactY, avatarW, 0, palette.muted);
  
  let ty = bodyY;
  state.groups.forEach(g => { ty = drawTags(g, tx, ty, tagW) });
  
  userField('farewell', tx, farewellY, tagW, 0, palette.muted);
  text('GENRE', tx, genreY, 14, state.accent, mono, 600);
  frame(tx, genreY + 24, tagW, genreH, palette.panel, palette.line, 9);
  line(tx, genreY + 40, tx, genreY + 58, state.accent, 2);
  userField('genre', tx + 14, genreY + 38, tagW - 28, genreH - 28);
  
  [[46, 'info', '01', 'INFO'], [p ? 416 : 356, 'ng', '02', 'NG / NOTICE']].forEach(([x, key, n, title]) => {
    heading(n, title, x, notesY, noteW);
    frame(x, notesY + 40, noteW, noteH, palette.panel, palette.line);
    line(x + 2, notesY + 57, x + 2, notesY + 85, state.accent, 2);
    userField(key, x + 16, notesY + 54, noteW - 32, noteH - 28);
  });
  
  // 03 섹션 제목 폰트 고정을 위한 임시 변경
  const prevFont2 = state.font;
  state.font = 'd2'; 

  isGalleryTitle = true;
  const titleHeight = fieldHeight('galleryTitle', gw - 48);
  polygon([[gx, gy], [gx + 24, gy], [gx + 31, gy + 10], [gx + 24, gy + 22], [gx, gy + 22]], state.accent);
  text('03', gx + 5, gy + 4, 11, palette.light ? '#fff' : '#07141a');
  
  // Gallery headings stay single line within the available band; very large text grows it.
  userField('galleryTitle', gx + 42, gy, gw - 48, 0, palette.ink);
  line(gx + 42, gy + Math.max(28, titleHeight + 4), gx + gw, gy + Math.max(28, titleHeight + 4), palette.line);
  isGalleryTitle = false;
  
  state.font = prevFont2; // 폰트 원상 복구
  
  let imageY = galleryStart;
  state.gallery.forEach((item, i) => {
    if (i > 0 && i % 2 === 0) imageY += rowHeights[Math.floor(i / 2) - 1] + 25;
    imageBox(item, gx + (i % 2) * (cardW + 23), imageY, cardW, rowHeights[Math.floor(i / 2)], i, 'FRAME / ' + String(i + 1).padStart(2, '0'));
  });
  
  if (!p) {
    line(676, bodyY - 7, 676, H - 93, palette.line);
    line(672, bodyY - 7, 680, bodyY - 7, state.accent, 2);
    line(672, H - 93, 680, H - 93, state.accent, 2);
  }
  
  line(47, H - footerH, 196, H - footerH, palette.line);
  line(196, H - footerH, 205, H - footerH + 8, palette.line);
  line(205, H - footerH + 8, W - 48, H - footerH + 8, palette.line);
  slashes(48, H - footerH + 13, 5, 9);
  text('SYS. PROFILE', 110, H - footerH + 25, 10, palette.muted);
  
  userField('credit', creditX, H - footerH + 22, creditW, 0, palette.muted);
  
  state.stickers.forEach((s, i) => {
    const sw = s.size, 
          sh = sw * s.img.height / s.img.width, 
          sx = s.x * W, 
          sy = s.y * H;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(s.rotation * Math.PI / 180);
    ctx.drawImage(s.img, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
    addHit(sx - sw / 2, sy - sh / 2, sw, sh, 'sticker', i);
  });
  
  ctx.textAlign = 'right';
  text('CREATED BY @COLT', W - 48, 45, 10, palette.muted);
  ctx.textAlign = 'left';

  // 로고 그리기 로직 추가
  if (coltLogo.complete && coltLogo.naturalWidth > 0) {
    const logoW = 45; // 로고 가로 크기 지정
    const logoH = logoW * (coltLogo.naturalHeight / coltLogo.naturalWidth);
    const logoX = W - 48 - logoW; // 우측 여백 정렬
    const logoY = 80; // 텍스트 바로 아래 배치

    // 포인트 컬러로 색상을 변경하기 위한 임시 캔버스 활용
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = logoW;
    tmpCanvas.height = logoH;
    const tCtx = tmpCanvas.getContext('2d');
    
    tCtx.drawImage(coltLogo, 0, 0, logoW, logoH);
    tCtx.globalCompositeOperation = 'source-in';
    tCtx.fillStyle = state.accent; // 현재 설정된 포인트 컬러
    tCtx.fillRect(0, 0, logoW, logoH);

    ctx.drawImage(tmpCanvas, logoX, logoY);
  }
  
  $('dimensions').textContent = `${W} × ${H} PX`;
  $('scale-label').textContent = `PNG · ${W * 2} × ${H * 2}`;
  
  if (!exporting) {
    syncHotspots();
    positionEditor();
  }
}

function chooseUpload(target) {
  pendingUpload = target;
  $('file-input').value = '';$('file-input').click();
}

async function receiveUpload(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    toast('PNG, JPG, WEBP 이미지를 선택해 주세요.');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast('10MB 이하의 이미지를 선택해 주세요.');
    return;
  }
  
  const target = pendingUpload;
  try {
    const source = URL.createObjectURL(file), img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = source;
    });
    
    if (img.width * img.height > 50000000) {
      URL.revokeObjectURL(source);
      throw Error('too large');
    }
    
    if (target === 'sticker') {
      if (state.stickers.length >= 15) {
        URL.revokeObjectURL(source);
        toast('스티커는 15개까지 추가할 수 있습니다.');
        return;
      }
      state.stickers.push({ img, src: source, x: .75, y: .25, size: 130, rotation: 0 });
      renderStickers();
    } else {
      const item = target === 'avatar' ? state.avatar : state.gallery[target];
      if (!item) {
        URL.revokeObjectURL(source);
        return;
      }
      if (item.src) URL.revokeObjectURL(item.src);
      Object.assign(item, { img, src: source, zoom: 1, dx: 0, dy: 0 });
      renderImages();
    }
    
    draw();
    toast('이미지가 추가되었습니다.');
  } catch (e) {
    toast('이미지를 읽지 못했습니다. 다른 이미지를 선택해 주세요.');
  }
}

function range(label, min, max, value, oninput, step = 1) {
  const l = el('label', {}, label), 
        out = el('output', {}, String(value)), 
        r = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
        
  r.oninput = () => {
    out.value = r.value;
    oninput(Number(r.value));
    draw();
  };
  l.append(out, r);
  return l;
}

function imageTools(parent, item, key) {
  parent.append(range('이미지 확대', 1, 3, item.zoom, v => item.zoom = v, .05));
  const reset = el('button', { class: 'outline full' }, '위치·확대 초기화');
  reset.onclick = () => {
    item.zoom = 1;
    item.dx = item.dy = 0;
    renderImages();
    draw();
  };
  parent.append(reset);
  
  const remove = el('button', { class: 'quiet full' }, '업로드 이미지 제거');
  remove.onclick = () => {
    if (item.src) URL.revokeObjectURL(item.src);
    Object.assign(item, { img: null, src: '', zoom: 1, dx: 0, dy: 0 });
    renderImages();
    draw();
  };
  parent.append(remove);
}

function renderImages() {
  const avatar = $('avatar-tools');
  avatar.replaceChildren();
  avatar.hidden = !state.avatar.img;
  if (state.avatar.img) imageTools(avatar, state.avatar, 'avatar');
  
  $('upload-avatar').textContent = state.avatar.img ? '프로필 이미지 변경' : '＋ 프로필 이미지 업로드';
  $('image-count').textContent = `${state.gallery.length} / 8`;
  
  const root = $('gallery-controls');
  root.replaceChildren();
  
  state.gallery.forEach((item, i) => {
    const box = el('div', { class: 'image-item' }), 
          head = el('div', { class: 'item-head' });
          
    head.append(el('span', {}, 'FRAME / ' + String(i + 1).padStart(2, '0')));
    
    const actions = el('div');
    for (const [symbol, delta] of [['↑', -1], ['↓', 1]]) {
      const b = el('button', { 'aria-label': delta < 0 ? '앞으로 이동' : '뒤로 이동' }, symbol);
      b.disabled = i + delta < 0 || i + delta >= state.gallery.length;
      b.onclick = () => {
        finishEdit();
        [state.gallery[i], state.gallery[i + delta]] = [state.gallery[i + delta], state.gallery[i]];
        
        for (const part of ['title', 'caption']) {
          for (const map of ['sizes', 'edited']) {
            const a = `gallery:${i}:${part}`, 
                  b = `gallery:${i + delta}:${part}`;
            [state[map][a], state[map][b]] = [state[map][b], state[map][a]];
          }
        }
        renderImages();
        draw();
      };
      actions.append(b);
    }
    
    const remove = el('button', { 'aria-label': '이미지 칸 삭제' }, '×');
    remove.onclick = () => {
      finishEdit();
      if (item.src) URL.revokeObjectURL(item.src);
      state.gallery.splice(i, 1);
      
      for (const map of ['sizes', 'edited']) {
        for (let j = i; j < state.gallery.length; j++) {
          for (const part of ['title', 'caption']) {
            state[map][`gallery:${j}:${part}`] = state[map][`gallery:${j + 1}:${part}`];
          }
        }
        for (const part of ['title', 'caption']) {
          delete state[map][`gallery:${state.gallery.length}:${part}`];
        }
      }
      
      selectedField = 'info';
      syncSize();
      renderImages();
      draw();
    };
    
    actions.append(remove);
    head.append(actions);
    box.append(head);
    
    if (item.src) box.append(el('img', { src: item.src, alt: '이미지 ' + (i + 1) }));
    
    const upload = el('button', { class: 'outline' }, item.img ? '이미지 변경' : '＋ 이미지 업로드');
    upload.onclick = () => chooseUpload(i);
    box.append(upload);
    
    const edit = el('button', { class: 'outline' }, '미리보기에서 캡션 편집');
    edit.onclick = () => {
      item.showCaption = true;
      draw();
      beginEdit(`gallery:${i}:title`);
    };
    box.append(edit);
    
    const l = el('label', { class: 'check' }), 
          check = el('input', { type: 'checkbox' });
          
    check.checked = item.showCaption;
    check.onchange = () => {
      finishEdit();
      item.showCaption = check.checked;
      draw();
    };
    
    l.append(check, document.createTextNode('캡션 표시'));
    box.append(l);
    
    if (item.img) imageTools(box, item, i);
    root.append(box);
  });
  
  $('add-image').disabled = state.gallery.length >= 8;
}

function renderStickers() {
  const root = $('sticker-controls');
  root.replaceChildren();
  
  state.stickers.forEach((s, i) => {
    const box = el('div', { class: 'sticker-item' }), 
          head = el('div', { class: 'item-head' });
          
    head.append(el('span', {}, 'STICKER / ' + String(i + 1).padStart(2, '0')));
    
    const remove = el('button', { 'aria-label': '스티커 삭제' }, '×');
    remove.onclick = () => {
      URL.revokeObjectURL(s.src);
      state.stickers.splice(i, 1);
      renderStickers();
      draw();
    };
    
    head.append(remove);
    box.append(head);
    box.append(
      range('크기', 40, 500, s.size, v => s.size = v), 
      range('가로 위치 (%)', 0, 100, Math.round(s.x * 100), v => s.x = v / 100), 
      range('세로 위치 (%)', 0, 100, Math.round(s.y * 100), v => s.y = v / 100), 
      range('회전 (°)', -180, 180, s.rotation, v => s.rotation = v)
    );
    root.append(box);
  });
}

function point(e) {
  const r = canvas.getBoundingClientRect();
  return { 
    x: (e.clientX - r.left) * W / r.width, 
    y: (e.clientY - r.top) * H / r.height 
  };
}

function hit(p) {
  return [...hits].reverse().find(h => p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h);
}

function beginCanvasDrag(e) {
  const p = point(e), h = hit(p);
  if (!h) return;
  
  const item = h.kind === 'sticker' 
    ? state.stickers[h.target] 
    : h.kind === 'image' 
      ? (h.target === 'avatar' ? state.avatar : state.gallery[h.target]) 
      : null;
      
  drag = { h, start: p, last: p, moved: false, item };
  
  if (item && (h.kind === 'sticker' || item.img)) {
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }
}

canvas.addEventListener('pointerdown', beginCanvasDrag);

canvas.addEventListener('pointermove', e => {
  const p = point(e);
  if (!drag) {
    const h = hit(p);
    canvas.style.cursor = h ? (h.kind === 'image' || h.kind === 'sticker' ? 'grab' : 'pointer') : 'default';
    return;
  }
  
  const d = drag;
  const dx = p.x - d.last.x, dy = p.y - d.last.y;
  
  if (Math.abs(p.x - d.start.x) + Math.abs(p.y - d.start.y) > 5) d.moved = true;
  
  if (d.moved && d.item) {
    if (d.h.kind === 'sticker') {
      d.item.x = Math.max(0, Math.min(1, d.item.x + dx / W));
      d.item.y = Math.max(0, Math.min(1, d.item.y + dy / H));
    } else if (d.item.img) {
      const r = Math.max(d.h.w / d.item.img.width, d.h.h / d.item.img.height) * d.item.zoom;
      const mx = (d.item.img.width * r / d.h.w - 1) / 2, 
            my = (d.item.img.height * r / d.h.h - 1) / 2;
      d.item.dx = Math.max(-mx, Math.min(mx, d.item.dx + dx / d.h.w));
      d.item.dy = Math.max(-my, Math.min(my, d.item.dy + dy / d.h.h));
    }
    draw();
  }
  d.last = p;
});

canvas.addEventListener('pointerup', e => {
  if (!drag) return;
  const { h, moved } = drag;
  
  if (!moved) {
    if (h.kind === 'image') {
      tab('images');
      chooseUpload(h.target);
    } else if (h.kind === 'sticker') {
      tab('stickers');
    } else if (h.kind === 'field') {
      beginEdit(h.target);
    } else if (h.kind === 'tag') {
      const g = state.groups.find(x => x.id === h.target.group), 
            v = h.target.value;
      g.selected = g.single 
        ? (g.selected.includes(v) ? [] : [v]) 
        : g.selected.includes(v) ? g.selected.filter(t => t !== v) : [...g.selected, v];
      draw();
    }
  }
  
  if (h.kind === 'sticker') renderStickers();
  
  drag = null;
  canvas.style.cursor = 'default';
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
});

canvas.addEventListener('pointercancel', () => {
  drag = null;
  canvas.style.cursor = 'default';
});

canvas.addEventListener('wheel', e => {
  const h = hit(point(e));
  if (!h || !['image', 'sticker'].includes(h.kind)) return;
  
  const item = h.kind === 'sticker' 
    ? state.stickers[h.target] 
    : h.target === 'avatar' 
      ? state.avatar : state.gallery[h.target];
      
  if (!item.img) return;
  
  e.preventDefault();
  if (h.kind === 'sticker') {
    item.size = Math.max(40, Math.min(500, item.size - e.deltaY * .15));
    renderStickers();
  } else {
    item.zoom = Math.max(1, Math.min(3, item.zoom - e.deltaY * .002));
    renderImages();
  }
  draw();
}, { passive: false });

function syncHotspots() {
  const root = $('field-hotspots');
  root.replaceChildren();
  
  hits.filter(h => ['field', 'tag', 'tagadd', 'sticker'].includes(h.kind)).forEach(h => {
    const key = h.target;
    const label = h.kind === 'tag' 
      ? `${key.value} 선택` 
      : h.kind === 'tagadd' 
        ? '성향 태그 추가' 
        : h.kind === 'sticker' 
          ? '스티커 이동' 
          : `${fieldInfo(key)[0]} 편집`;
          
    const b = el('button', { 
      class: 'field-hit' + (activeEdit?.key === key ? ' editing' : ''), 
      'aria-label': label, 
      'data-kind': h.kind 
    });
    
    if (h.kind === 'field') {
      b.dataset.field = key;
      b.title = fieldInfo(key)[0] + ' · 클릭하여 편집';
      b.setAttribute('aria-description', valueOf(key) || fieldInfo(key)[2]);
    }
    
    if (h.kind === 'tag') {
      const g = state.groups.find(g => g.id === key.group);
      b.setAttribute('aria-pressed', g.selected.includes(key.value));
    }
    
    Object.assign(b.style, { 
      left: h.x / W * 100 + '%', 
      top: h.y / H * 100 + '%', 
      width: h.w / W * 100 + '%', 
      height: h.h / H * 100 + '%' 
    });
    
    const activate = () => {
      if (h.kind === 'sticker') {
        tab('stickers');
        return;
      }
      if (h.kind === 'tag') {
        finishEdit();
        const g = state.groups.find(g => g.id === key.group), 
              v = key.value;
        g.selected = g.single 
          ? (g.selected.includes(v) ? [] : [v]) 
          : g.selected.includes(v) ? g.selected.filter(t => t !== v) : [...g.selected, v];
        draw();
      } else {
        beginEdit(key);
      }
    };
    
    b.onpointerdown = e => {
      e.preventDefault();
      if (h.kind === 'sticker') beginCanvasDrag(e);
      else activate();
    };
    
    b.onclick = e => {
      if (e.detail === 0) activate();
    };
    
    root.append(b);
  });
}

function syncSize() {
  $('selected-field-name').textContent = fieldInfo(selectedField)[0];$('font-size').value = sizeOf(selectedField);
}

function beginEdit(key) {
  finishEdit();
  const h = hits.find(h => h.target === key);
  if (!h) return;
  
  const isTag = key.startsWith('tagadd:');
  if (isTag) {
    const g = state.groups.find(g => g.id === key.split(':')[1]);
    if (g.options.length >= 12) {
      toast('태그는 그룹당 12개까지 추가할 수 있습니다.');
      return;
    }
  }
  
  const previous = valueOf(key), wasEdited = !!state.edited[key];
  activeEdit = { key, previous, wasEdited, initialHit: { ...h } };
  
  if (!isTag) {
    selectedField = key;
    syncSize();
    if (!wasEdited) setValue(key, '');
  }
  
  const input = $('inline-editor');
  input.value = isTag ? '' : valueOf(key);
  input.removeAttribute('maxLength');
  input.setAttribute('aria-label', fieldInfo(key)[0] + ' 직접 편집');
  input.hidden = false;
  
  $('editing-hint').textContent = '영역 바깥 클릭으로 완료 · Esc로 취소';
  draw();
  
  requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    input.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
}

function positionEditor() {
  if (!activeEdit) return;
  const h = hits.find(h => h.target === activeEdit.key) || activeEdit.initialHit, 
        scale = canvas.clientWidth / W, 
        area = $('inline-editor');
        
  const isTag = activeEdit.key.startsWith('tagadd:');
  const size = isTag ? 14 : sizeOf(activeEdit.key), 
        screenSize = Math.max(16, size * scale);
        
  Object.assign(area.style, {
    left: Math.min(h.x * scale, canvas.clientWidth - 170) + 'px',
    top: Math.max(0, h.y * scale) + 'px',
    width: Math.max(160, h.w * scale) + 'px',
    height: Math.max(38, h.h * scale + 8) + 'px',
    fontFamily: activeEdit.key === 'galleryTitle' ? mono : contentFont(),
    fontStyle: activeEdit.key === 'galleryTitle' ? 'normal' : (fontChoice().italic ? 'italic' : 'normal'),
    fontSize: screenSize + 'px'
  });
  
  area.style.height = Math.max(38, h.h * scale + 8, Math.min(area.scrollHeight, 240)) + 'px';
}

function finishEdit(cancel = false) {
  if (!activeEdit) return;
  const edit = activeEdit, input = $('inline-editor');
  activeEdit = null;
  
  if (cancel) {
    setValue(edit.key, edit.previous);
    state.edited[edit.key] = edit.wasEdited;
  } else if (edit.key.startsWith('tagadd:')) {
    const g = state.groups.find(g => g.id === edit.key.split(':')[1]), 
          value = input.value.trim();
    if (value && !g.options.includes(value) && g.options.length < 12) {
      g.options.push(value);
      g.selected.push(value);
      (g.custom ??= []).push(value);
    }
  } else {
    setValue(edit.key, input.value);
    state.edited[edit.key] = true;
  }
  
  input.hidden = true;
  $('editing-hint').textContent = '텍스트를 누르면 그 자리에서 편집합니다.';
  draw();
}

$('inline-editor').addEventListener('input', e => {
  if (!activeEdit) return;
  setValue(activeEdit.key, e.target.value);
  draw();
});

$('inline-editor').addEventListener('blur', () => finishEdit());

$('inline-editor').addEventListener('keydown', e => {
  if (e.isComposing) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    finishEdit(true);
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || activeEdit?.key.startsWith('tagadd:'))) {
    e.preventDefault();
    finishEdit();
  }
});

new ResizeObserver(() => positionEditor()).observe($('canvas-wrap'));

function renderFonts() {
  const root = $('font-options');
  root.replaceChildren();
  FONTS.forEach(f => {
    const b = el('button', { 
      class: 'font-option' + (state.font === f.id ? ' active' : ''), 
      'aria-pressed': state.font === f.id, 
      'aria-label': f.label + ' 글꼴' 
    }, undefined);
    
    b.append(el('strong', {}, f.label), el('small', {}, f.sample));
    b.onclick = () => selectFont(f.id);
    root.append(b);
  });
}

const fontLoads = new Map();

function loadFamily(family, italic = false) {
  const key = family + italic;
  if (!fontLoads.has(key)) {
    const task = (async () => {
      let timer;
      try {
        const faces = await Promise.race([
          document.fonts.load(`${italic ? 'italic ' : ''}16px "${family}"`, '가나다 ABC 123'),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('font')), 20000); })
        ]);
        if (!faces.length) throw new Error('font');
      } finally {
        clearTimeout(timer);
      }
    })();
    fontLoads.set(key, task);
    task.catch(() => fontLoads.delete(key));
  }
  return fontLoads.get(key);
}

async function ensureFont() {
  const f = fontChoice();
  await Promise.all([loadFamily('D2Coding'), loadFamily(f.family, !!f.italic)]);
}

async function selectFont(id) {
  const seq = ++fontSequence, previous = state.font;
  state.font = id;
  renderFonts();
  $('font-status').textContent = '글꼴을 불러오는 중입니다.';
  
  try {
    await ensureFont();
    if (seq !== fontSequence) return;
    $('font-status').textContent = id.startsWith('intel') 
      ? 'Intel 계열의 한글은 D2Coding으로 표시됩니다.' 
      : fontChoice().label + ' 적용 완료';
    draw();
  } catch (e) {
    if (seq !== fontSequence) return;
    state.font = previous;
    renderFonts();
    draw();
    $('font-status').textContent = '글꼴을 불러오지 못해 이전 글꼴을 유지합니다.';
  }
}

function setSize(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    syncSize();
    return;
  }
  state.sizes[selectedField] = Math.max(10, Math.min(64, n));
  syncSize();
  draw();
}

$('font-size').oninput = e => {
  const n = Number(e.target.value);
  if (e.target.value !== '' && Number.isInteger(n) && n >= 10 && n <= 64) {
    state.sizes[selectedField] = n;
    draw();
  }
};
$('font-size').onchange = e => setSize(e.target.value);
$('size-minus').onclick = () => setSize(sizeOf(selectedField) - 1);$('size-plus').onclick = () => setSize(sizeOf(selectedField) + 1);

$('apply-size-all').onclick = () => {
  const size = sizeOf(selectedField);
  for (const key of Object.keys(FIELD_META)) state.sizes[key] = size;
  state.gallery.forEach((_, i) => {
    state.sizes[`gallery:${i}:title`] = size;
    state.sizes[`gallery:${i}:caption`] = size;
  });
  draw();
  toast('입력 내용에 ' + size + 'px을 적용했습니다.');
};

for (const key of ['accent', 'bg1', 'bg2']) {
  const set = value => {
    state[key] = value;
    $(key).value = value;
    $(key + '-hex').value = value.toUpperCase();
    updateChrome();
    renderThemes();
    draw();
  };
  $(key).oninput = e => set(e.target.value);$(key + '-hex').onchange = e => {
    let v = e.target.value.trim();
    if (!v.startsWith('#')) v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) set(v);
    else {
      e.target.value = state[key].toUpperCase();
      toast('6자리 HEX 색상이 필요합니다.');
    }
  };
}

for (const key of ['grid', 'mono']) {
  $(key).onchange = e => {
    state[key] = e.target.checked;
    draw();
  };
}

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
document.querySelectorAll('[data-layout]').forEach(b => b.onclick = () => setLayout(b.dataset.layout));

$('upload-avatar').onclick = () => chooseUpload('avatar');
$('upload-sticker').onclick = () => chooseUpload('sticker');$('file-input').onchange = e => receiveUpload(e.target.files[0]);

$('add-image').onclick = () => {
  if (state.gallery.length >= 8) return;
  state.gallery.push(emptyImage());
  renderImages();
  draw();
};

$('reset-colors').onclick = () => {
  applyTheme(state.theme);
  toast('선택한 테마의 기본 색상으로 복원했습니다.');
};

$('help').onclick = () =>$('help-dialog').showModal();
document.querySelectorAll('.dialog-close').forEach(b => b.onclick = () => $('help-dialog').close());

$('reset').onclick = () =>$('reset-dialog').showModal();
$('cancel-reset').onclick = () =>$('reset-dialog').close();

$('confirm-reset').onclick = () => {
  finishEdit();
  [state.avatar, ...state.gallery, ...state.stickers].forEach(i => {
    if (i.src) URL.revokeObjectURL(i.src);
  });
  state = initial();
  selectedField = 'info';
  syncFields();
  selectFont('d2');
  $('reset-dialog').close();
  toast('새 자기소개표 편집을 시작합니다.');
};

$('export').onclick = async () => {
  finishEdit();
  const button = $('export');
  button.disabled = true;
  
  try {
    await ensureFont();
    draw(true);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('export');
    
    const url = URL.createObjectURL(blob), 
          a = el('a', { href: url, download: `SYS_PROFILE_${(state.name || 'profile').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_${state.layout}.png` });
          
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('PNG를 저장했습니다.');
  } catch (e) {
    toast(e.message === 'font' ? '글꼴 로딩을 완료하지 못했습니다. 연결 확인 후 다시 저장할 수 있습니다.' : 'PNG를 저장하지 못했습니다. 다시 시도해 주세요.');
  } finally {
    draw();
    button.disabled = false;
  }
};

syncFields();
selectFont('d2');