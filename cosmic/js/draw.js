/*
 * DRAW — a thin love.graphics-compatible wrapper over Canvas 2D.
 * ============================================================
 * The original game is written against LÖVE's immediate-mode graphics
 * (setColor with 0..1 floats, circle/rectangle/line/printf, push/translate/
 * rotate/pop). Reproducing that API here lets the rendering code port across
 * almost line-for-line.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Gfx = {
  ctx: null,
  _font: '16px',
  _family: '"Segoe UI", system-ui, Tahoma, sans-serif',

  init(ctx) {
    this.ctx = ctx;
    this.setColor(1, 1, 1, 1);
    this.setLineWidth(1);
    this.setFont(12);
    ctx.textBaseline = 'top';   // LÖVE print() origin is the text's top-left
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  },

  // LÖVE colours are 0..1 floats; a may be omitted (defaults to 1).
  setColor(r, g, b, a) {
    const R = (r * 255) | 0, G = (g * 255) | 0, B = (b * 255) | 0;
    const A = a === undefined ? 1 : a;
    const s = `rgba(${R},${G},${B},${A})`;
    this.ctx.fillStyle = s;
    this.ctx.strokeStyle = s;
  },

  setLineWidth(w) { this.ctx.lineWidth = w; },

  // size in px; pass bold=true for headings.
  setFont(size, bold) {
    this._font = (bold ? 'bold ' : '') + size + 'px';
    this.ctx.font = this._font + ' ' + this._family;
  },

  clear(r, g, b) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${(r*255)|0},${(g*255)|0},${(b*255)|0})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  },

  circle(mode, x, y, radius) {
    const ctx = this.ctx;
    if (radius <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (mode === 'fill') ctx.fill(); else ctx.stroke();
  },

  arc(mode, x, y, radius, a1, a2) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, radius, a1, a2);
    if (mode === 'fill') { ctx.lineTo(x, y); ctx.fill(); } else ctx.stroke();
  },

  // rectangle(mode, x, y, w, h [, rx]) — rx gives rounded corners.
  rectangle(mode, x, y, w, h, rx) {
    const ctx = this.ctx;
    if (rx) {
      const r = Math.min(rx, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y,     x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x,     y + h, r);
      ctx.arcTo(x,     y + h, x,     y,     r);
      ctx.arcTo(x,     y,     x + w, y,     r);
      ctx.closePath();
      if (mode === 'fill') ctx.fill(); else ctx.stroke();
    } else {
      if (mode === 'fill') ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    }
  },

  // line(x1,y1,x2,y2,...) or line([x1,y1,x2,y2,...])
  line() {
    const ctx = this.ctx;
    const pts = (arguments.length === 1 && Array.isArray(arguments[0]))
      ? arguments[0] : arguments;
    if (pts.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  },

  // polygon(mode, [x1,y1,x2,y2,...])  — flat point array
  polygon(mode, pts) {
    const ctx = this.ctx;
    if (pts.length < 6) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (mode === 'fill') ctx.fill(); else ctx.stroke();
  },

  print(text, x, y) {
    this.ctx.textAlign = 'left';
    this.ctx.fillText(text, x, y);
  },

  // printf(text, x, y, limit, align) — aligned within [x, x+limit].
  printf(text, x, y, limit, align) {
    const ctx = this.ctx;
    if (align === 'center') { ctx.textAlign = 'center'; ctx.fillText(text, x + limit / 2, y); }
    else if (align === 'right') { ctx.textAlign = 'right'; ctx.fillText(text, x + limit, y); }
    else { ctx.textAlign = 'left'; ctx.fillText(text, x, y); }
  },

  // measure text width (for layout)
  textWidth(text) { return this.ctx.measureText(text).width; },

  push()      { this.ctx.save(); },
  pop()       { this.ctx.restore(); },
  translate(x, y) { this.ctx.translate(x, y); },
  rotate(a)   { this.ctx.rotate(a); },
  scale(x, y) { this.ctx.scale(x, y === undefined ? x : y); },
};
