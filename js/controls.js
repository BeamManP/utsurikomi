// 操作パネルの定義と組み立て。定義をここに足せば UI も初期値も付いてくる。

export const TABS = [
  {
    id: 'reflection',
    items: [
      { type: 'reflPicker' },
      { key: 'reflStr', min: 0, max: 1.5, step: 0.01, def: 0.42 },
      { key: 'reflBlur', min: 0, max: 7, step: 0.1, def: 2.0 },
      { key: 'reflScale', min: 0.4, max: 2.5, step: 0.01, def: 1 },
      { key: 'reflX', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'reflY', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'reflFlip', type: 'toggle', def: false },
      { key: 'glass', type: 'select', options: ['glossy', 'matte'], def: 'glossy' },
      { key: 'glare', min: 0, max: 1, step: 0.01, def: 0.12 },
      { key: 'glareX', min: -1.2, max: 1.2, step: 0.01, def: 0.6 },
      { key: 'glareY', min: -1, max: 1, step: 0.01, def: 0.55 },
    ],
  },
  {
    id: 'angle',
    items: [
      { key: 'photoAspect', type: 'select', options: ['4:3', '16:9', '1:1', '3:4', '9:16'], raw: true, def: '4:3' },
      { key: 'yaw', min: -40, max: 40, step: 0.5, def: 3, unit: '°' },
      { key: 'pitch', min: -35, max: 35, step: 0.5, def: 2, unit: '°' },
      { key: 'roll', min: -20, max: 20, step: 0.1, def: -1.5, unit: '°' },
      { key: 'zoom', min: 0.6, max: 2.6, step: 0.01, def: 1.2 },
      { key: 'shiftX', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'shiftY', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'lens', min: 0, max: 0.15, step: 0.005, def: 0.03 },
    ],
  },
  {
    id: 'screen',
    items: [
      { key: 'screenAspect', type: 'select', options: ['16:9', '16:10', '3:2', '4:3'], raw: true, def: '16:9', content: true },
      { key: 'fit', type: 'select', options: ['cover', 'contain'], def: 'cover', content: true },
      { key: 'imgZoom', min: 0.5, max: 4, step: 0.01, def: 1, content: true },
      { key: 'imgX', min: -1, max: 1, step: 0.01, def: 0, content: true },
      { key: 'imgY', min: -1, max: 1, step: 0.01, def: 0, content: true },
      { key: 'taskbar', type: 'select', options: ['none', 'dark', 'light'], def: 'dark', content: true },
      { key: 'bright', min: 0.3, max: 1.6, step: 0.01, def: 0.95 },
      { key: 'black', min: 0, max: 0.35, step: 0.005, def: 0.07 },
      { key: 'temp', min: -1, max: 1, step: 0.01, def: 0.3 },
      { key: 'angleFall', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'glow', min: 0, max: 1.5, step: 0.01, def: 0.3 },
      { key: 'focus', min: 0, max: 4, step: 0.05, def: 0.5 },
    ],
  },
  {
    id: 'moire',
    items: [
      { key: 'moire', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'density', min: 600, max: 3840, step: 10, def: 1920 },
    ],
  },
  {
    id: 'frame',
    items: [
      { key: 'frame', type: 'select', options: ['laptop', 'monitor', 'frameNone'], def: 'laptop' },
      { key: 'bezel', type: 'select', options: ['black', 'silver', 'white'], def: 'black' },
    ],
  },
  {
    id: 'wall',
    items: [
      { key: 'wallPat', type: 'select', options: ['plain', 'stripe', 'brick', 'wood', 'concrete', 'dots', 'tile', 'wallImage'], def: 'plain' },
      { key: 'wallCol', type: 'color', def: '#d9d3c5' },
      { key: 'wallCol2', type: 'color', def: '#a99f8c' },
      { key: 'wallScale', min: 0.3, max: 3, step: 0.01, def: 1 },
      { key: 'wallDist', min: 0.1, max: 4, step: 0.05, def: 1.2 },
      { key: 'wallBlur', min: 0, max: 3, step: 0.01, def: 1 },
      { key: 'room', min: 0, max: 1, step: 0.01, def: 0.3 },
    ],
  },
  {
    id: 'camera',
    items: [
      { key: 'ev', min: -2, max: 2, step: 0.05, def: 0 },
      { key: 'noise', min: 0, max: 0.4, step: 0.005, def: 0.07 },
      { key: 'sharp', min: 0, max: 2, step: 0.01, def: 0.6 },
      { key: 'ca', min: 0, max: 0.012, step: 0.0005, def: 0.003 },
      { key: 'vig', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'jpeg', min: 40, max: 100, step: 1, def: 88 },
    ],
  },
];

export const ALL_ITEMS = TABS.flatMap((t) => t.items.filter((i) => i.key));

export function defaults() {
  const s = { refl: 'ojisan' };
  for (const it of ALL_ITEMS) s[it.key] = it.def;
  return s;
}

export const isContentKey = (key) => !!ALL_ITEMS.find((i) => i.key === key && i.content);

const fmt = (it, v) => {
  if (it.unit) return `${(+v).toFixed(1)}${it.unit}`;
  if (it.step >= 1) return String(Math.round(v));
  return (+v).toFixed(it.step < 0.01 ? 4 : 2);
};

/**
 * パネルを組み立てる。
 * @returns {{ sync: () => void }} 状態を UI に書き戻す関数
 */
export function buildPanel(root, tabsBar, state, t, onChange, reflPicker, initialTab, onTab) {
  root.innerHTML = '';
  tabsBar.innerHTML = '';
  const syncers = [];

  TABS.forEach((tab, ti) => {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.type = 'button';
    btn.role = 'tab';
    btn.dataset.tab = tab.id;
    btn.textContent = t(`tab.${tab.id}`);
    tabsBar.appendChild(btn);

    const pane = document.createElement('section');
    pane.className = 'pane';
    pane.dataset.tab = tab.id;
    pane.role = 'tabpanel';

    for (const it of tab.items) {
      if (it.type === 'reflPicker') { pane.appendChild(reflPicker); continue; }
      const row = document.createElement('div');
      row.className = `row row-${it.type || 'range'}`;
      const label = document.createElement('label');
      label.textContent = t(`ctl.${it.key}`);
      const id = `ctl-${it.key}`;
      label.htmlFor = id;
      row.appendChild(label);

      if (it.type === 'select') {
        label.removeAttribute('for');
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.role = 'radiogroup';
        const buttons = it.options.map((o) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = it.raw ? o : t(`opt.${o}`);
          b.addEventListener('click', () => { state[it.key] = o; sync(); onChange(it.key); });
          seg.appendChild(b);
          return [o, b];
        });
        const sync = () => buttons.forEach(([o, b]) => b.setAttribute('aria-pressed', String(state[it.key] === o)));
        syncers.push(sync);
        row.appendChild(seg);
      } else if (it.type === 'toggle') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.className = 'switch';
        input.addEventListener('change', () => { state[it.key] = input.checked; onChange(it.key); });
        syncers.push(() => { input.checked = !!state[it.key]; });
        row.appendChild(input);
      } else if (it.type === 'color') {
        const input = document.createElement('input');
        input.type = 'color';
        input.id = id;
        input.addEventListener('input', () => { state[it.key] = input.value; onChange(it.key); });
        syncers.push(() => { input.value = state[it.key]; });
        row.appendChild(input);
      } else {
        const out = document.createElement('output');
        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.min = it.min; input.max = it.max; input.step = it.step;
        input.addEventListener('input', () => { state[it.key] = +input.value; out.textContent = fmt(it, input.value); onChange(it.key); });
        // ダブルクリックでその項目だけ初期値へ
        input.addEventListener('dblclick', () => { state[it.key] = it.def; input.value = it.def; out.textContent = fmt(it, it.def); onChange(it.key); });
        syncers.push(() => { input.value = state[it.key]; out.textContent = fmt(it, state[it.key]); });
        row.appendChild(out);
        row.appendChild(input);
      }
      pane.appendChild(row);
    }
    root.appendChild(pane);
    if (ti === 0) btn.setAttribute('aria-selected', 'true');
  });

  const select = (id) => {
    tabsBar.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    root.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.tab !== id; });
  };
  // 言語切り替えで作り直すので、addEventListener で重ねない
  tabsBar.onclick = (e) => {
    const b = e.target.closest('.tab');
    if (b) { select(b.dataset.tab); onTab?.(b.dataset.tab); }
  };
  select(initialTab || TABS[0].id);

  const sync = () => syncers.forEach((f) => f());
  sync();
  return { sync, select };
}
