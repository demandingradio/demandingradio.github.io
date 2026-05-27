/*
 * FIELD
 * =====
 * Oval geometry, goal-line detection, and field drawing. The field is laid
 * out in "field units" — coordinates from (0,0) top-left to (WIDTH,HEIGHT)
 * bottom-right. The oval is inscribed inside that rect with PADDING margin.
 *
 *   left goal (Team B attacks)        right goal (Team A attacks)
 *           |                                       |
 *   bbbb GG GG bbbb       center        bbbb GG GG bbbb
 *           |                                       |
 *  (where GG = inner goal posts, bbbb = outer behind posts)
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Field = class {
  constructor(cfg) {
    this.cfg = cfg;
    const F = cfg.FIELD;
    this.w  = F.WIDTH;
    this.h  = F.HEIGHT;
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.rx = (this.w / 2) - F.PADDING;
    this.ry = (this.h / 2) - F.PADDING;
    this.goalLineX = {
      left:  this.cx - this.rx,
      right: this.cx + this.rx,
    };
  }

  // Is (x,y) inside the oval boundary?
  contains(x, y) {
    const dx = (x - this.cx) / this.rx;
    const dy = (y - this.cy) / this.ry;
    return (dx * dx + dy * dy) <= 1;
  }

  // Project a point back inside the oval, respecting a radius r for body size.
  clamp(x, y, r = 0) {
    const rxEff = Math.max(1, this.rx - r);
    const ryEff = Math.max(1, this.ry - r);
    const dx = (x - this.cx) / rxEff;
    const dy = (y - this.cy) / ryEff;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1) return { x, y, hit: false };
    const k = 1 / Math.sqrt(d2);
    return {
      x: this.cx + dx * k * rxEff,
      y: this.cy + dy * k * ryEff,
      hit: true,
    };
  }

  // Did a ball moving from `prev` to `curr` cross the goal line at `end`
  // ('left' or 'right')? Returns one of: 'goal', 'behind', 'out', null.
  // 'out' means it crossed the line but outside the behind posts (i.e. the
  // ball went over the boundary line beside the goal).
  checkGoalCrossing(prev, curr, end) {
    const lineX = this.goalLineX[end];
    const crossed = (end === 'left')
      ? (prev.x >= lineX && curr.x <  lineX)
      : (prev.x <= lineX && curr.x >  lineX);
    if (!crossed) return null;

    const t = (lineX - prev.x) / (curr.x - prev.x);
    const crossY = prev.y + t * (curr.y - prev.y);
    const dy = Math.abs(crossY - this.cy);

    const goalHalf   = this.cfg.FIELD.GOAL_WIDTH / 2;
    const behindHalf = this.cfg.FIELD.BEHIND_WIDTH / 2;

    if (dy <= goalHalf)   return 'goal';
    if (dy <= behindHalf) return 'behind';
    return 'out';
  }

  // Returns the center y of the goal mouth — used by AI and accuracy bar.
  goalCenterY() { return this.cy; }

  // Distance from a point to the center of the given goal mouth.
  distToGoalCenter(x, y, end) {
    const lx = this.goalLineX[end];
    return Math.hypot(x - lx, y - this.cy);
  }

  draw(ctx) {
    const C = this.cfg.COLORS;
    const F = this.cfg.FIELD;

    // Dark backdrop outside oval.
    ctx.fillStyle = '#0d2810';
    ctx.fillRect(0, 0, this.w, this.h);

    // Oval grass.
    ctx.fillStyle = C.GRASS_LIGHT;
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Decorative mow stripes (clipped to oval).
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const stripes = 8;
    const stripeH = this.h / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = (i % 2 === 0) ? C.GRASS_LIGHT : C.GRASS_DARK;
      ctx.fillRect(0, i * stripeH, this.w, stripeH);
    }
    ctx.restore();

    // Boundary line.
    ctx.strokeStyle = C.LINE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(this.cx, this.cy, this.rx, this.ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Center square (simplified — small square inside circle).
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, F.CENTER_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(this.cx - 40, this.cy - 40, 80, 80);

    // Center line through middle (long axis).
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy - this.ry);
    ctx.lineTo(this.cx, this.cy + this.ry);
    ctx.stroke();

    // 50m arcs at each end.
    const arcR = F.FIFTY_ARC_RADIUS;
    ctx.beginPath();
    ctx.arc(this.goalLineX.left,  this.cy, arcR, -Math.PI / 2.2,  Math.PI / 2.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.goalLineX.right, this.cy, arcR, Math.PI - Math.PI / 2.2, Math.PI + Math.PI / 2.2);
    ctx.stroke();

    // Goal squares — narrow rectangles in front of each goal.
    const gSqDepth = 30;
    ctx.strokeRect(this.goalLineX.left,  this.cy - F.GOAL_WIDTH / 2, gSqDepth,  F.GOAL_WIDTH);
    ctx.strokeRect(this.goalLineX.right - gSqDepth, this.cy - F.GOAL_WIDTH / 2, gSqDepth, F.GOAL_WIDTH);

    // Posts.
    this._drawPosts(ctx, this.goalLineX.left,  -1);
    this._drawPosts(ctx, this.goalLineX.right, +1);
  }

  // dir = -1 for left end, +1 for right end (posts extend outward).
  _drawPosts(ctx, x, dir) {
    const C = this.cfg.COLORS;
    const F = this.cfg.FIELD;
    const gh = F.GOAL_WIDTH   / 2;
    const bh = F.BEHIND_WIDTH / 2;
    const depth = F.POST_DEPTH;

    // Draw post "lines" extending outward; top-down stylized.
    const posts = [
      { dy: -bh, color: C.POST_BEHIND },
      { dy: -gh, color: C.POST_GOAL   },
      { dy:  gh, color: C.POST_GOAL   },
      { dy:  bh, color: C.POST_BEHIND },
    ];
    posts.forEach((p) => {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, this.cy + p.dy);
      ctx.lineTo(x + dir * depth, this.cy + p.dy);
      ctx.stroke();

      // little circle base where the post meets the ground (boundary line)
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, this.cy + p.dy, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
};
