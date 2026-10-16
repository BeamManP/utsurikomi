// PC 画面に映す絵を 2D キャンバスに描く（入力画像のトリミング＋タスクバー）。

const W = 1920;

export function screenAspect(key) {
  return { '16:9': 16 / 9, '16:10': 16 / 10, '3:2': 3 / 2, '4:3': 4 / 3 }[key] || 16 / 9;
}

export function drawContent(canvas, img, s, lang, t) {
  const A = screenAspect(s.screenAspect);
  const H = Math.round(W / A);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);

  const barH = s.taskbar === 'none' ? 0 : Math.round(H * 0.045);
  const areaH = H - (s.taskbar === 'none' ? 0 : barH);

  if (img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const base = s.fit === 'contain' ? Math.min(W / iw, areaH / ih) : Math.max(W / iw, areaH / ih);
    const k = base * s.imgZoom;
    const dw = iw * k, dh = ih * k;
    const x = (W - dw) / 2 + s.imgX * (Math.abs(W - dw) / 2 + W * 0.25);
    const y = (areaH - dh) / 2 + s.imgY * (Math.abs(areaH - dh) / 2 + areaH * 0.25);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, x, y, dw, dh);
  } else {
    drawPlaceholder(g, W, areaH, t);
  }

  if (barH) drawTaskbar(g, W, H, barH, s.taskbar === 'light', lang);
  return A;
}

function drawPlaceholder(g, w, h, t) {
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0d2b52');
  grad.addColorStop(0.55, '#3a1f6b');
  grad.addColorStop(1, '#0a0f24');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // ぼんやりした光の帯
  for (let i = 0; i < 3; i++) {
    const rg = g.createRadialGradient(w * (0.25 + i * 0.3), h * (0.3 + 0.2 * (i % 2)), 0, w * (0.25 + i * 0.3), h * (0.3 + 0.2 * (i % 2)), h * 0.6);
    rg.addColorStop(0, `hsla(${200 + i * 50},90%,60%,0.35)`);
    rg.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${Math.round(h * 0.11)}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.fillText(t('placeholder.title'), w / 2, h * 0.44);
  g.font = `500 ${Math.round(h * 0.045)}px system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(t('placeholder.sub'), w / 2, h * 0.58);
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawTaskbar(g, W, H, bh, light, lang) {
  const y0 = H - bh;
  g.fillStyle = light ? 'rgba(236,238,244,0.96)' : 'rgba(22,24,32,0.96)';
  g.fillRect(0, y0, W, bh);
  g.fillStyle = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
  g.fillRect(0, y0, W, 1);

  const fg = light ? '#1b1d24' : '#f2f3f7';
  const cy = y0 + bh / 2;
  const s = bh * 0.56;

  // 中央のアイコン列（どこかの OS に似すぎない、ただの色付き角丸）
  const colors = ['#5aa0ff', '#ffd25a', '#4cd28b', '#ff6b6b', '#b38cff', '#39c6d6', '#ff9a3d'];
  const gap = bh * 0.9;
  const startX = W / 2 - ((colors.length - 1) * gap) / 2;
  colors.forEach((c, i) => {
    const x = startX + i * gap;
    g.fillStyle = c;
    roundRect(g, x - s / 2, cy - s / 2, s, s, s * 0.24);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(g, x - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.18, s * 0.08);
    g.fill();
    if (i === 1 || i === 3) {
      g.fillStyle = light ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.55)';
      roundRect(g, x - s * 0.18, y0 + bh - bh * 0.1, s * 0.36, bh * 0.05, bh * 0.03);
      g.fill();
    }
  });

  // 左：天気
  g.fillStyle = '#ffcc4d';
  g.beginPath();
  g.arc(bh * 0.7, cy, bh * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `500 ${Math.round(bh * 0.3)}px system-ui, "Segoe UI", "Hiragino Sans", sans-serif`;
  g.fillText(lang === 'ja' ? '23°C  晴れ' : '73°F  Sunny', bh * 1.1, cy);

  // 右：時計と日付
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const Y = now.getFullYear(), M = now.getMonth() + 1, D = now.getDate();
  const date = lang === 'ja' ? `${Y}/${String(M).padStart(2, '0')}/${String(D).padStart(2, '0')}` : `${M}/${D}/${Y}`;
  g.textAlign = 'right';
  g.font = `500 ${Math.round(bh * 0.27)}px system-ui, "Segoe UI", sans-serif`;
  g.fillText(`${hh}:${mm}`, W - bh * 0.5, cy - bh * 0.17);
  g.fillText(date, W - bh * 0.5, cy + bh * 0.19);

  // 右：Wi-Fi・スピーカー・電池（線画）
  const ix = W - bh * 3.3;
  g.strokeStyle = fg;
  g.lineWidth = Math.max(1.5, bh * 0.05);
  g.lineCap = 'round';
  for (let i = 1; i <= 3; i++) {
    g.beginPath();
    g.arc(ix, cy + bh * 0.14, bh * 0.09 * i, -Math.PI * 0.75, -Math.PI * 0.25);
    g.stroke();
  }
  const sx = ix + bh * 0.6;
  g.beginPath();
  g.moveTo(sx - bh * 0.1, cy - bh * 0.07); g.lineTo(sx - bh * 0.02, cy - bh * 0.07);
  g.lineTo(sx + bh * 0.08, cy - bh * 0.15); g.lineTo(sx + bh * 0.08, cy + bh * 0.15);
  g.lineTo(sx - bh * 0.02, cy + bh * 0.07); g.lineTo(sx - bh * 0.1, cy + bh * 0.07); g.closePath();
  g.stroke();
  const bx = ix + bh * 1.15;
  roundRect(g, bx - bh * 0.14, cy - bh * 0.09, bh * 0.28, bh * 0.18, bh * 0.03);
  g.stroke();
  g.fillStyle = fg;
  g.fillRect(bx - bh * 0.1, cy - bh * 0.05, bh * 0.14, bh * 0.1);
}
