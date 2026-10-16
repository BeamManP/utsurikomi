// スマホで画面を撮る時の幾何。
// 単位は「画面の高さ = 1」。画面は z = 0 の平面にあり、中心が原点、+z がこちら側。
// 画像座標 q は出力の長辺を [-1, 1] にとる（スマホのレンズは長辺で画角が決まるため）。

const F = 2.0; // 長辺の画角 約 53°（スマホの標準カメラ相当）

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

// 3x3（行優先）の逆行列
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
  ];
}

// 行優先 → WebGL の列優先
export const toColumnMajor = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/**
 * @param {object} s  yaw/pitch/roll（度）, zoom, shiftX, shiftY
 * @param {number} A  画面の横縦比
 */
export function solveCamera(s, A) {
  const yaw = (s.yaw * Math.PI) / 180;
  const pitch = (s.pitch * Math.PI) / 180;
  const roll = (s.roll * Math.PI) / 180;
  const D = F / s.zoom;

  // 狙う点（画面上）と、そこからの方向でカメラを置く
  const T = [s.shiftX * A * 0.5, s.shiftY * 0.5, 0];
  const C = [
    T[0] + D * Math.sin(yaw) * Math.cos(pitch),
    T[1] + D * Math.sin(pitch),
    T[2] + D * Math.cos(yaw) * Math.cos(pitch),
  ];
  const f = norm(sub(T, C));
  let r = norm(cross(f, [0, 1, 0]));
  let u = cross(r, f);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  [r, u] = [
    [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr],
    [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr],
  ];

  const R = [...r, ...u, ...f];
  // 平面上の座標 (a,b,1) → 画像の同次座標。M は P - C = M (a,b,1) の行列（列 = dP/da, dP/db, 定数項）
  const project = (M) => {
    const RM = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      RM[i * 3 + j] = R[i * 3] * M[j] + R[i * 3 + 1] * M[3 + j] + R[i * 3 + 2] * M[6 + j];
    }
    return [F * RM[0], F * RM[1], F * RM[2], F * RM[3], F * RM[4], F * RM[5], RM[6], RM[7], RM[8]];
  };

  // 画面：画面座標 (u,v)（左上 0,0）
  const H = project([
    A, 0, -A / 2 - C[0],
    0, -1, 0.5 - C[1],
    0, 0, -C[2],
  ]);
  // 壁：画面の wallDist 奥にある平行な面。座標は世界の (x, y) そのもの
  const wd = s.wallDist ?? 1.2;
  const Hwall = project([
    1, 0, -C[0],
    0, 1, -C[1],
    0, 0, -wd - C[2],
  ]);

  // 鏡に自分が写る点 ＝ カメラから画面へ下ろした垂線の足
  const foot = [C[0], C[1], 0];
  const fc = sub(foot, C);
  const fx = dot(fc, r), fy = dot(fc, u), fz = dot(fc, f);
  const mirror = [(F * fx) / fz, (F * fy) / fz];

  return { Hinv: inv3(H), HinvWall: inv3(Hwall), cam: C, D, F, mirror };
}
