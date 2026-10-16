// WebGL2 のシェーダー。
// pass1: 画面の射影・画素の格子・枠・写り込み → 中間テクスチャ
// pass2: スマホカメラの癖（色ずれ・シャープ・ノイズ・周辺減光）

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const SCENE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uContent;   // PC 画面に映っている絵（flipY 済み）
uniform sampler2D uRefl;      // 写り込み（flipY 済み）
uniform bool uHasRefl;

uniform vec2 uQScale;         // 出力の長辺を [-1,1] にした時の縦横の半分
uniform mat3 uHinv;           // 画像座標 → 画面座標 (u,v) の逆射影
uniform float uLensK;         // たる型のゆがみ
uniform vec3 uCam;            // カメラ位置（画面の高さ = 1 の単位）
uniform float uA;             // 画面の横縦比

// 画面
uniform vec2 uResPx;          // 画面の画素数（縞の細かさ）
uniform float uMoire;
uniform float uFocus;         // ピントのぼけ（mip バイアス）
uniform float uBright;
uniform float uBlack;
uniform vec3 uTint;
uniform float uAngleFall;
uniform float uGlow;

// 枠
uniform int uFrame;           // 0 = 無し, 1 = ノートPC, 2 = モニター
uniform vec4 uBezelM;         // 左右, 上, 下, 角丸
uniform vec3 uBezelCol;
uniform vec3 uDeckCol;
uniform float uRoom;          // 部屋の明るさ

// 壁（画面より奥の平行な面）
uniform mat3 uHinvWall;       // 画像座標 → 壁の世界座標 (x, y)
uniform int uWallPat;         // 0 無地 1 ストライプ 2 レンガ 3 木 4 コンクリート 5 水玉 6 タイル 7 画像
uniform vec3 uWallCol;
uniform vec3 uWallCol2;
uniform float uWallScale;
uniform float uWallBlurW;     // ぼけの半径（世界の単位）
uniform sampler2D uWallTex;
uniform bool uHasWallTex;
uniform float uWallTexAspect;

// 写り込み
uniform vec2 uReflCenter;
uniform vec2 uReflHalf;
uniform float uReflFlip;
uniform float uReflStr;
uniform float uReflBlur;
uniform float uHaze;          // 非光沢パネルのくもり
uniform float uGlare;
uniform vec2 uGlarePos;
uniform float uGlareSize;

uniform float uEV;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdRBox(vec2 p, vec2 b, float r) { return sdBox(p, b - r) - r; }
float inside(float d) {
  float w = max(fwidth(d), 1e-5);
  return 1.0 - smoothstep(-w, w, d);
}

float h21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; }
  return s;
}

// 壁の模様。p は「模様の大きさ」で割った世界座標（1 = 画面の高さ）
vec3 wallPattern(vec2 p) {
  vec3 a = uWallCol, b = uWallCol2;
  if (uWallPat == 0) {                       // 無地（ビニールクロスの細かい凹凸）
    return a * (0.96 + 0.08 * vn(p * 45.0));
  } else if (uWallPat == 1) {                // ストライプ
    return mix(a, b, step(0.5, fract(p.x * 2.0)));
  } else if (uWallPat == 2) {                // レンガ（0.625 x 0.25・目地は b）
    vec2 bp = p * vec2(1.6, 4.0);
    bp.x += mod(floor(bp.y), 2.0) * 0.5;
    vec2 f = fract(bp);
    vec3 brick = a * (0.82 + 0.3 * h21(floor(bp))) * (0.9 + 0.15 * vn(p * 30.0));
    float mortar = 1.0 - step(0.032, f.x) * step(0.08, f.y);
    return mix(brick, b, mortar);
  } else if (uWallPat == 3) {                // 縦張りの木の板
    float x = p.x * 3.0;
    float id = floor(x);
    float grain = vn(vec2(x * 9.0, p.y * 0.7 + id * 7.0));
    float rings = sin((p.y * 2.2 + grain * 3.0 + h21(vec2(id, 1.0)) * 10.0) * 6.0) * 0.5 + 0.5;
    vec3 plank = mix(a, b, rings * 0.55 + 0.25 * h21(vec2(id, 3.0)));
    float gap = smoothstep(0.0, 0.025, fract(x)) * smoothstep(0.0, 0.025, 1.0 - fract(x));
    return plank * mix(0.4, 1.0, gap);
  } else if (uWallPat == 4) {                // 打ちっぱなしのコンクリート（型枠の継ぎ目と穴）
    vec3 c = mix(b, a, 0.55 + 0.45 * fbm(p * 5.0));
    vec2 cell = vec2(1.8, 0.9);
    vec2 g = (fract(p / cell) - 0.5) * cell;
    vec2 h = (fract(p / (cell * 0.5) + 0.5) - 0.5) * cell * 0.5;
    float hole = smoothstep(0.035, 0.025, length(h));
    float seam = smoothstep(0.012, 0.0, min(abs(abs(g.x) - cell.x * 0.5), abs(abs(g.y) - cell.y * 0.5)));
    return c * (1.0 - 0.45 * hole) * (1.0 - 0.25 * seam);
  } else if (uWallPat == 5) {                // 水玉（互い違い）
    vec2 q = p * 3.0;
    q.x += 0.5 * mod(floor(q.y), 2.0);
    return mix(a, b, smoothstep(0.21, 0.18, length(fract(q) - 0.5)));
  } else if (uWallPat == 6) {                // タイル（目地は b）
    vec2 f = fract(p * 2.5);
    vec3 tile = a * (0.94 + 0.1 * h21(floor(p * 2.5)));
    return mix(tile, b, 1.0 - step(0.045, f.x) * step(0.045, f.y));
  }
  if (!uHasWallTex) return a;                // 画像（縦 2 単位で 1 枚）
  return texture(uWallTex, p * 0.5 / vec2(uWallTexAspect, 1.0)).rgb;
}

// ピントは画面に合っているので、壁はぼける。円の中を 12 点で平均する
vec3 wallColor(vec2 wp) {
  vec2 p = wp / uWallScale;
  float rad = uWallBlurW / uWallScale + length(fwidth(p)) * 0.6;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 12.0) * rad;
    float ang = fi * 2.39996;
    acc += wallPattern(p + r * vec2(cos(ang), sin(ang)));
  }
  return acc / 12.0;
}

void main() {
  vec2 qd = (vUv * 2.0 - 1.0) * uQScale;            // ゆがんだ後の画像座標
  float r2 = dot(qd, qd);
  vec2 q = qd * (1.0 + uLensK * r2);                // ゆがむ前の座標

  vec3 w = uHinv * vec3(q, 1.0);
  vec2 uv = w.xy / w.z;                              // 画面座標（左上 0,0 / 右下 1,1）
  bool front = w.z > 0.0;
  vec3 P = vec3(uA * (uv.x - 0.5), 0.5 - uv.y, 0.0); // 画面の平面上の点

  // ---- 背景（モニターの奥の壁）
  vec3 ww = uHinvWall * vec3(q, 1.0);
  vec2 wp = ww.xy / ww.z;
  vec3 col = wallColor(wp) * uRoom * mix(0.6, 1.15, vUv.y);

  // ---- 枠
  float side = uBezelM.x, top = uBezelM.y, bot = uBezelM.z, rad = uBezelM.w;
  vec2 outerC = vec2(0.0, (top - bot) * 0.5);
  vec2 outerB = vec2(uA * 0.5 + side, 0.5 + (top + bot) * 0.5);
  float dOuter = sdRBox(P.xy - outerC, outerB, rad);
  float bezelCov = (uFrame == 0 || !front) ? 0.0 : inside(dOuter);

  if (uFrame == 1 && front) {
    // ノートPCの蝶番とキーボード面（同じ平面の続きとして簡略化）
    float yb = -0.5 - bot;
    float hingeCov = inside(sdBox(P.xy - vec2(0.0, yb - 0.018), vec2(uA * 0.5 + side - 0.02, 0.018)));
    vec2 deckB = vec2(uA * 0.5 + side + 0.12, 3.0);
    float deckCov = inside(sdBox(P.xy - vec2(0.0, yb - 0.036 - 3.0), deckB));
    float shade = clamp(1.0 + (P.y - yb) * 0.6, 0.55, 1.0);
    col = mix(col, uDeckCol * uRoom * shade, deckCov);
    col = mix(col, vec3(0.012) * uRoom, hingeCov);
  }

  if (bezelCov > 0.0) {
    float g = 0.85 + 0.25 * (P.y + 0.5);
    vec3 bz = uBezelCol * uRoom * g;
    // 内側のふち
    float rim = smoothstep(0.012, 0.0, abs(dOuter + 0.004));
    bz += rim * 0.05 * uRoom;
    if (uFrame == 1) {
      vec2 camP = vec2(0.0, 0.5 + top * 0.5);
      float dc = length(P.xy - camP);
      float lens = inside(dc - 0.011);
      bz = mix(bz, vec3(0.01), lens);
      bz += vec3(0.09, 0.1, 0.14) * smoothstep(0.004, 0.0, length(P.xy - camP - vec2(0.003, 0.003))) * lens;
    }
    col = mix(col, bz, bezelCov);
  }

  // ---- 画面
  float dScreen = sdBox(P.xy, vec2(uA * 0.5, 0.5));
  float screenCov = front ? inside(dScreen) : 0.0;
  vec3 V = normalize(uCam - P);
  float ct = clamp(V.z, 0.0, 1.0);

  if (screenCov > 0.0) {
    vec2 tuv = vec2(uv.x, 1.0 - uv.y);
    vec3 c = texture(uContent, tuv, uFocus).rgb;
    vec3 g = texture(uContent, tuv, uFocus + 5.5).rgb;
    c += uGlow * max(g - 0.45, 0.0) * 1.6;

    c = uBlack + (1.0 - uBlack) * c;
    c *= uBright * uTint;

    // 視野角：斜めから見ると暗く・浅く・少し青白く
    float L = dot(c, LUMA);
    float off = (1.0 - ct) * uAngleFall;
    c = mix(c, vec3(L) + vec3(0.0, 0.01, 0.04), off * 0.8);
    c *= mix(1.0, pow(ct, 1.6), uAngleFall);

    // 画素の格子（RGB の縦縞＋行のすき間）をカメラの画素で標本化 → モアレ
    vec2 sp = uv * uResPx;
    vec2 dx = dFdx(sp), dy = dFdy(sp);
    vec3 m = vec3(0.0);
    vec2 offs[4] = vec2[4](vec2(-0.125, -0.375), vec2(0.375, -0.125), vec2(0.125, 0.375), vec2(-0.375, 0.125));
    for (int i = 0; i < 4; i++) {
      vec2 s = sp + dx * offs[i].x + dy * offs[i].y;
      vec3 ph = s.x - vec3(0.0, 1.0 / 3.0, 2.0 / 3.0);
      vec3 stripe = 1.0 + cos(6.2831853 * ph);
      float row = 1.0 + 0.55 * cos(6.2831853 * s.y);
      m += stripe * row;
    }
    m *= 0.25;
    float fw = length(dx) + length(dy);
    float amp = uMoire * exp(-fw * fw * 0.05);
    c *= mix(vec3(1.0), m, clamp(amp, 0.0, 1.0));

    col = mix(col, c, screenCov);
  }

  // ---- ガラスの写り込み（画面と、少し弱く枠にも）
  float glass = front ? max(screenCov, bezelCov * 0.45) : 0.0;
  if (glass > 0.0) {
    float fr = 0.04 + 0.96 * pow(1.0 - ct, 5.0);
    float k = uReflStr * (0.85 + 3.0 * fr);
    if (uHasRefl) {
      vec2 rq = (qd - uReflCenter) / uReflHalf;
      rq.x *= uReflFlip;
      vec2 ruv = rq * 0.5 + 0.5;
      vec2 e = smoothstep(vec2(0.0), vec2(0.06), ruv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - ruv);
      vec3 rc = texture(uRefl, clamp(ruv, 0.0, 1.0), uReflBlur).rgb * e.x * e.y;
      col += rc * k * glass;
      col += vec3(dot(rc, LUMA)) * uHaze * glass;
    }
    vec2 gd = (qd - uGlarePos) / vec2(uGlareSize * 1.3, uGlareSize);
    float gl = exp(-dot(gd, gd));
    col += vec3(1.0, 0.97, 0.9) * gl * uGlare * glass * (0.7 + fr);
  }

  // ---- 露出と白飛び
  col *= exp2(uEV);
  vec3 sh = 1.0 - 0.25 * exp(-(col - 0.75) / 0.25);
  col = mix(col, sh, step(vec3(0.75), col));
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const POST_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uCA;
uniform float uSharp;
uniform float uNoise;
uniform float uVig;
uniform float uSeed;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 px = 1.0 / uSize;
  vec2 cc = vUv - 0.5;
  vec3 c;
  c.r = texture(uTex, 0.5 + cc * (1.0 + uCA)).r;
  c.g = texture(uTex, vUv).g;
  c.b = texture(uTex, 0.5 + cc * (1.0 - uCA)).b;

  // スマホのやりすぎシャープ（輪郭のにじみ）
  vec2 r = px * 1.6;
  vec3 blur = (texture(uTex, vUv + vec2(r.x, 0.0)).rgb + texture(uTex, vUv - vec2(r.x, 0.0)).rgb +
               texture(uTex, vUv + vec2(0.0, r.y)).rgb + texture(uTex, vUv - vec2(0.0, r.y)).rgb) * 0.25;
  c += uSharp * (texture(uTex, vUv).rgb - blur);

  // ノイズ：暗いところほど強く、ノイズ除去で少し塊になった感じ
  vec2 fc = gl_FragCoord.xy + uSeed * 97.0;
  float L = clamp(dot(c, LUMA), 0.0, 1.0);
  float k = uNoise * (0.25 + 0.75 * (1.0 - L));
  float fine = hash(fc) - 0.5;
  float blot = vnoise(fc / 2.2) - 0.5;
  vec3 chroma = vec3(vnoise(fc / 3.0 + 11.0), vnoise(fc / 3.0 + 37.0), vnoise(fc / 3.0 + 71.0)) - 0.5;
  c += k * (fine * 0.35 + blot * 0.5 + chroma * 0.45);

  // 周辺減光
  float aspect = uSize.x / uSize.y;
  float d = length(cc * vec2(aspect, 1.0)) / length(vec2(aspect, 1.0) * 0.5);
  c *= 1.0 - uVig * smoothstep(0.35, 1.05, d);

  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
