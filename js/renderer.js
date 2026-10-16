// WebGL2 の描画。2パス：シーン → 中間テクスチャ → カメラの癖 → 画面。

import { VERT, SCENE_FRAG, POST_FRAG } from './shaders.js';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}

function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed');
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  const loc = {};
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
    loc[name] = gl.getUniformLocation(p, name);
  }
  return { p, loc };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('webgl2');
    this.gl = gl;
    this.canvas = canvas;
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');

    this.scene = program(gl, SCENE_FRAG);
    this.post = program(gl, POST_FRAG);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.contentTex = this.makeTex();
    this.reflTex = this.makeTex();
    this.hasRefl = false;
    this.reflAspect = 16 / 9;

    this.fbTex = gl.createTexture();
    this.fb = gl.createFramebuffer();
    this.fbSize = [0, 0];
  }

  makeTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  upload(tex, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) {
      const max = gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
  }

  setContent(canvas2d) { this.upload(this.contentTex, canvas2d); }

  setReflection(img) {
    if (!img) { this.hasRefl = false; return; }
    this.upload(this.reflTex, img);
    this.hasRefl = true;
    this.reflAspect = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
  }

  resize(w, h) {
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.fbSize[0] !== w || this.fbSize[1] !== h) {
      gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fbTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fbSize = [w, h];
    }
  }

  /** u: シーン用の値, p: 後処理用の値 */
  render(w, h, u, p) {
    const gl = this.gl;
    this.resize(w, h);
    gl.bindVertexArray(this.vao);

    // pass 1
    const S = this.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, w, h);
    gl.useProgram(S.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.contentTex);
    gl.uniform1i(S.loc.uContent, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.reflTex);
    gl.uniform1i(S.loc.uRefl, 1);
    gl.uniform1i(S.loc.uHasRefl, this.hasRefl ? 1 : 0);
    for (const [name, v] of Object.entries(u)) {
      const l = S.loc[name];
      if (l == null) continue;
      if (name === 'uHinv') gl.uniformMatrix3fv(l, false, v);
      else if (name === 'uFrame') gl.uniform1i(l, v);
      else if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2fv(l, v);
      else if (v.length === 3) gl.uniform3fv(l, v);
      else if (v.length === 4) gl.uniform4fv(l, v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // pass 2
    const Q = this.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(Q.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fbTex);
    gl.uniform1i(Q.loc.uTex, 0);
    gl.uniform2f(Q.loc.uSize, w, h);
    gl.uniform1f(Q.loc.uCA, p.ca);
    gl.uniform1f(Q.loc.uSharp, p.sharp);
    gl.uniform1f(Q.loc.uNoise, p.noise);
    gl.uniform1f(Q.loc.uVig, p.vig);
    gl.uniform1f(Q.loc.uSeed, p.seed);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
