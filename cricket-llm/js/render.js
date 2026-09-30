/*
 * RENDER
 * ======
 * One frame = cached static world + flattened shadows + a depth-sorted queue
 * of dynamic primitives (limbs, bat, ball, stumps, markers).
 */
(function () {
  const CLLM = window.CLLM;
  const { World, Figure } = CLLM;

  class Renderer {
    constructor(canvas, cam) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cam = cam;
      this.dpr = 1;
      this.shadowCanvas = document.createElement('canvas');
      this.sctx = this.shadowCanvas.getContext('2d');
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth, h = window.innerHeight;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.shadowCanvas.width = this.canvas.width;
      this.shadowCanvas.height = this.canvas.height;
      this.cam.setViewport(w, h);
    }

    // scene = { figures:[Figure], ball, stumps:[{z, state}], extra:(queue, cam)=>void, overlay:(ctx)=>void }
    frame(scene) {
      const ctx = this.ctx, cam = this.cam, dpr = this.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // camera shake
      let sx = 0, sy = 0;
      if (cam.shake > 0.001) {
        sx = (Math.random() - 0.5) * cam.shake * 10;
        sy = (Math.random() - 0.5) * cam.shake * 10;
      }
      ctx.save();
      ctx.translate(sx, sy);
      World.drawStatic(ctx, cam, dpr);

      const queue = [];
      const shadows = [];
      if (scene.under) scene.under(ctx, cam);
      for (const st of scene.stumps || []) World.queueStumps(queue, cam, st.z, st.state);
      for (const f of scene.figures || []) if (f && f.J) f.queue(queue, cam, shadows);
      if (scene.ball) scene.ball.queue(queue, cam, scene.ballOpts);
      if (scene.extra) scene.extra(queue, cam);

      // Shadows: draw opaque into a layer, then composite once so overlaps
      // don't double-darken.
      if (shadows.length && this.shadowCanvas.width > 0 && this.shadowCanvas.height > 0) {   // (a hidden, zero-size window has nothing to draw into)
        const s = this.sctx;
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, this.shadowCanvas.width, this.shadowCanvas.height);
        s.setTransform(dpr, 0, 0, dpr, 0, 0);
        s.lineCap = 'round';
        s.strokeStyle = '#0a190a';
        for (const sh of shadows) {
          const seg = cam.segment(sh.p0, sh.p1);
          if (!seg) continue;
          s.beginPath(); s.moveTo(seg[0].x, seg[0].y); s.lineTo(seg[1].x, seg[1].y);
          s.lineWidth = Math.max(1, sh.w * (seg[0].s + seg[1].s) * 0.5);
          s.stroke();
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.24;
        ctx.drawImage(this.shadowCanvas, sx * dpr, sy * dpr);
        ctx.restore();
      }

      queue.sort((a, b) => b.z - a.z);
      for (const q of queue) q.draw(ctx);
      ctx.restore();
      if (scene.overlay) scene.overlay(ctx, cam);
    }
  }

  CLLM.Renderer = Renderer;
})();
