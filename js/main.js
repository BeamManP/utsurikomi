import { Renderer } from './renderer.js';
import { solveCamera, toColumnMajor } from './camera.js';
import { drawContent } from './content.js';
import { defaults, buildPanel, isContentKey, TABS } from './controls.js';
import { detectLang, makeT } from './i18n.js';

const PRESETS = ['ojisan', 'bakemono', 'bijo', 'anime', 'cat', 'yurei', 'samurai', 'alien'];
// プリセットの絵でスマホが写っている位置（左下 0,0）。カメラの真後ろに来るよう合わせる
const PHONE_POS = [0.5, 0.4];
const LONG_SIDE = 2048;

const $ = (sel) => document.querySelector(sel);
const canvas = $('#view');
const stage = $('#stage');
const fileInput = $('#file');
const reflFileInput = $('#reflFile');
const wallFileInput = $('#wallFile');
const toast = $('#toast');

let lang = detectLang();
const t = makeT(() => lang);
let state = defaults();
let userImage = null;
let userRefl = null;          // 自分で読み込んだ写り込み
let wallImage = null;         // 自分で読み込んだ壁紙
let prevWallPat = null;
let seed = Math.random() * 1000;
let contentDirty = true;
let currentTab = TABS[0].id;
let panel;

const contentCanvas = document.createElement('canvas');
let renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  console.error(e);
  document.body.classList.add('no-webgl');
  $('#fatal').textContent = t('msg.noWebgl');
}

// ---------- 写り込みの選択 ----------
const reflCache = new Map();
function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

async function applyReflection() {
  if (!renderer) return;
  if (state.refl === 'none') renderer.setReflection(null);
  else if (state.refl === 'upload') renderer.setReflection(userRefl);
  else {
    let im = reflCache.get(state.refl);
    if (!im) {
      im = await loadImage(`reflections/${state.refl}.jpg`);
      reflCache.set(state.refl, im);
    }
    renderer.setReflection(im);
  }
  requestRender();
}

function buildReflPicker() {
  const wrap = document.createElement('div');
  wrap.className = 'refl-grid';
  const items = ['none', ...PRESETS, 'upload'];
  for (const id of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `refl-item refl-${id}`;
    b.dataset.refl = id;
    if (PRESETS.includes(id)) {
      const img = document.createElement('img');
      img.src = `reflections/thumbs/${id}.jpg`;
      img.alt = '';
      b.appendChild(img);
    } else if (id === 'upload' && userRefl) {
      const img = document.createElement('img');
      img.src = userRefl.src;
      img.alt = '';
      b.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'refl-icon';
      icon.textContent = id === 'none' ? '∅' : '+';
      b.appendChild(icon);
    }
    const cap = document.createElement('span');
    cap.className = 'refl-cap';
    cap.textContent = t(`refl.${id}`);
    b.appendChild(cap);
    b.setAttribute('aria-pressed', String(state.refl === id));
    b.addEventListener('click', () => {
      if (id === 'upload' && !userRefl) { reflFileInput.click(); return; }
      if (id === 'upload' && state.refl === 'upload') { reflFileInput.click(); return; }
      state.refl = id;
      wrap.querySelectorAll('.refl-item').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.refl === id)));
      applyReflection();
    });
    wrap.appendChild(b);
  }
  return wrap;
}

// ---------- パネル ----------
function rebuild() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $('#langBtn').textContent = lang === 'ja' ? 'EN' : '日本語';
  panel = buildPanel($('#panel'), $('#tabs'), state, t, onChange, buildReflPicker(), currentTab, (id) => { currentTab = id; });
  contentDirty = true;
  requestRender();
}

function onChange(key) {
  if (key === 'wallPat') {
    // 「自分の画像」は、まだ無い時か、選ばれている所をもう一度押した時にファイルを選ばせる
    if (state.wallPat === 'wallImage' && (!wallImage || prevWallPat === 'wallImage')) wallFileInput.click();
    prevWallPat = state.wallPat;
  }
  if (isContentKey(key)) contentDirty = true;
  requestRender();
}

// ---------- 描画 ----------
let pending = false;
function requestRender() {
  if (pending || !renderer) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

function outputSize() {
  const [a, b] = state.photoAspect.split(':').map(Number);
  return a >= b ? [LONG_SIDE, Math.round((LONG_SIDE * b) / a)] : [Math.round((LONG_SIDE * a) / b), LONG_SIDE];
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const WALL_PATS = ['plain', 'stripe', 'brick', 'wood', 'concrete', 'dots', 'tile', 'wallImage'];

const BEZEL = {
  black: { bezel: [0.03, 0.03, 0.035], deck: [0.05, 0.05, 0.055] },
  silver: { bezel: [0.42, 0.43, 0.45], deck: [0.5, 0.51, 0.53] },
  white: { bezel: [0.8, 0.8, 0.81], deck: [0.72, 0.72, 0.73] },
};
const MARGINS = { laptop: [0.035, 0.075, 0.09, 0.035], monitor: [0.018, 0.018, 0.065, 0.012], frameNone: [0, 0, 0, 0] };

function tint(tmp) {
  // + で青白く（夜の部屋でスマホが白を合わせ損ねた感じ）、− で黄ばむ
  return tmp >= 0 ? [1 - 0.22 * tmp, 1 - 0.06 * tmp, 1 + 0.05 * tmp] : [1, 1 + 0.08 * tmp, 1 + 0.35 * tmp];
}

function render() {
  const s = state;
  if (contentDirty) {
    drawContent(contentCanvas, userImage, s, lang, t);
    renderer.setContent(contentCanvas);
    contentDirty = false;
  }
  const A = contentCanvas.width / contentCanvas.height;
  const [w, h] = outputSize();
  const long = Math.max(w, h);
  const qScale = [w / long, h / long];

  const cam = solveCamera(s, A);
  const matte = s.glass === 'matte';
  const reflAspect = renderer.reflAspect;
  // 写り込んだ人は「カメラ→画面→人」で 2 倍の距離にいる
  // 写り込みの絵の板：撮影者はカメラの位置にいて、絵の真ん中（スマホ）がカメラの真後ろに来る。
  // 大きさは世界の単位（画面の高さ = 1）で、板は撮影者の顔あたりの奥行きに置く
  const reflW = s.reflScale * 8;
  const reflSize = [reflW, reflW / reflAspect];
  const reflAnchor = [cam.cam[0] + s.reflX * 3, cam.cam[1] + s.reflY * 3];

  const frameIdx = { frameNone: 0, laptop: 1, monitor: 2 }[s.frame];
  const bz = BEZEL[s.bezel];

  const u = {
    uQScale: qScale,
    uHinv: toColumnMajor(cam.Hinv),
    uLensK: s.lens,
    uCam: cam.cam,
    uA: A,
    uResPx: [s.density, s.density / A],
    uMoire: s.moire,
    uFocus: s.focus,
    uBright: s.bright,
    uBlack: s.black,
    uTint: tint(s.temp),
    uAngleFall: s.angleFall,
    uGlow: s.glow,
    uFrame: frameIdx,
    uBezelM: MARGINS[s.frame],
    uBezelCol: bz.bezel,
    uDeckCol: bz.deck,
    uRoom: s.room,
    uHinvWall: toColumnMajor(cam.HinvWall),
    uWallPat: WALL_PATS.indexOf(s.wallPat),
    uWallCol: hexToRgb(s.wallCol),
    uWallCol2: hexToRgb(s.wallCol2),
    uWallScale: s.wallScale,
    // ぼけの円は「画面との奥行きの差 ÷ 画面までの距離」に比例する
    uWallBlurW: (s.wallBlur * 0.08 * s.wallDist) / cam.D,
    uReflAnchor: reflAnchor,
    uReflSize: reflSize,
    uReflDepth: 1.5,
    uReflPhone: s.refl === 'upload' ? [0.5, 0.5] : PHONE_POS,
    uReflFlip: s.reflFlip ? -1 : 1,
    uReflStr: matte ? s.reflStr * 0.55 : s.reflStr,
    uReflBlur: matte ? s.reflBlur + 2.5 : s.reflBlur,
    uHaze: matte ? s.reflStr * 0.18 : 0,
    uGlare: matte ? s.glare * 0.6 : s.glare,
    uGlarePos: [s.glareX, s.glareY * 0.75],
    uGlareSize: matte ? 0.55 : 0.28,
    uEV: s.ev,
  };
  renderer.render(w, h, u, { ca: s.ca, sharp: s.sharp, noise: s.noise, vig: s.vig, seed });
  stage.style.setProperty('--r', String(w / h));
}

// ---------- 入力画像 ----------
async function setUserImageFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    userImage = await loadImage(url);
    contentDirty = true;
    document.body.classList.add('has-image');
    requestRender();
  } catch (_) {
    showToast(t('msg.badImage'));
  }
}

async function setReflFromFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  try {
    userRefl = await loadImage(url);
    state.refl = 'upload';
    rebuild();
    applyReflection();
  } catch (_) {
    showToast(t('msg.badImage'));
  }
}

fileInput.addEventListener('change', () => { setUserImageFromFile(fileInput.files[0]); fileInput.value = ''; });
reflFileInput.addEventListener('change', () => { setReflFromFile(reflFileInput.files[0]); reflFileInput.value = ''; });
wallFileInput.addEventListener('change', async () => {
  const file = wallFileInput.files[0];
  wallFileInput.value = '';
  if (!file || !file.type.startsWith('image/')) return;
  try {
    wallImage = await loadImage(URL.createObjectURL(file));
    renderer.setWall(wallImage);
    state.wallPat = 'wallImage';
    prevWallPat = 'wallImage';
    panel.sync();
    requestRender();
  } catch (_) {
    showToast(t('msg.badImage'));
  }
});
$('#openBtn').addEventListener('click', () => fileInput.click());

['dragenter', 'dragover'].forEach((ev) => document.addEventListener(ev, (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
  e.preventDefault();
  if (ev === 'dragleave' && e.relatedTarget) return;
  document.body.classList.remove('dragging');
}));
document.addEventListener('drop', (e) => {
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) setUserImageFromFile(f);
});
document.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (item) setUserImageFromFile(item.getAsFile());
});
stage.addEventListener('click', () => { if (!userImage) fileInput.click(); });

// ---------- 保存・共有 ----------
function fileName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `IMG_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

function makeBlob() {
  render(); // preserveDrawingBuffer があるので直後に読める
  const jpeg = state.jpeg < 100;
  return new Promise((res) => canvas.toBlob(res, jpeg ? 'image/jpeg' : 'image/png', jpeg ? state.jpeg / 100 : undefined))
    .then((blob) => ({ blob, name: fileName(jpeg ? 'jpg' : 'png') }));
}

$('#saveBtn').addEventListener('click', async () => {
  const { blob, name } = await makeBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  showToast(t('msg.saved'));
});

const shareBtn = $('#shareBtn');
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', async () => {
    const { blob, name } = await makeBlob();
    const file = new File([blob], name, { type: blob.type });
    try { await navigator.share({ files: [file] }); } catch (_) { /* 取り消し */ }
  });
}

// ---------- おまかせ・リセット・言語 ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

$('#randomBtn').addEventListener('click', () => {
  Object.assign(state, {
    refl: pick(PRESETS),
    reflStr: rnd(0.5, 1.0),
    reflBlur: rnd(0.8, 2.6),
    reflScale: rnd(0.8, 1.3),
    reflX: rnd(-0.15, 0.15),
    reflY: rnd(-0.15, 0.1),
    glass: Math.random() < 0.8 ? 'glossy' : 'matte',
    glare: rnd(0, 0.35),
    glareX: rnd(-1, 1),
    glareY: rnd(0.2, 0.9),
    yaw: rnd(-12, 12),
    pitch: rnd(-8, 8),
    roll: rnd(-4, 4),
    zoom: rnd(0.95, 1.6),
    shiftX: rnd(-0.15, 0.15),
    shiftY: rnd(-0.12, 0.12),
    moire: rnd(0.1, 0.7),
    density: Math.round(rnd(1200, 2600) / 10) * 10,
    temp: rnd(-0.2, 0.7),
    focus: rnd(0.2, 1.4),
    room: rnd(0.15, 0.5),
    noise: rnd(0.04, 0.14),
    ...randomWall(),
  });
  prevWallPat = state.wallPat;
  seed = Math.random() * 1000;
  panel.sync();
  document.querySelectorAll('.refl-item').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.refl === state.refl)));
  applyReflection();
});

// 部屋の壁らしい組み合わせ（地の色・模様の色）
const WALL_LOOKS = [
  ['plain', '#d9d3c5', '#a99f8c'], ['plain', '#e8e6e1', '#c0bcb2'], ['plain', '#9db4c8', '#6f8aa3'],
  ['stripe', '#e4dccb', '#cbbd9f'], ['stripe', '#f1d7dc', '#e3b4be'],
  ['brick', '#8e4a33', '#cfc6b8'], ['brick', '#e9e6df', '#bdb6aa'],
  ['wood', '#a8774d', '#6e4a2c'], ['wood', '#d8bf98', '#a98b62'],
  ['concrete', '#a7a6a2', '#77756f'],
  ['dots', '#f4efe4', '#e7a7b4'], ['dots', '#24324a', '#d6c38a'],
  ['tile', '#f2f2ef', '#b9b9b4'], ['tile', '#5f8f8a', '#d9dcd6'],
];
function randomWall() {
  const [wallPat, wallCol, wallCol2] = pick(WALL_LOOKS);
  return { wallPat, wallCol, wallCol2, wallScale: rnd(0.7, 1.4), wallDist: rnd(0.6, 2.2) };
}

$('#resetBtn').addEventListener('click', () => {
  state = defaults();
  prevWallPat = state.wallPat;
  rebuild();
  applyReflection();
});

$('#langBtn').addEventListener('click', () => {
  lang = lang === 'ja' ? 'en' : 'ja';
  try { localStorage.setItem('utsurikomi.lang', lang); } catch (_) { /* 保存できなくても切り替えは効く */ }
  rebuild();
});

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// タスクバーの時計を分ごとに進める
setInterval(() => { if (state.taskbar !== 'none') { contentDirty = true; requestRender(); } }, 30000);

if (renderer) {
  rebuild();
  applyReflection();
}
