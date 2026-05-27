/*
 * AI
 * ==
 * Dumb-but-functional opponent. The AI controls a single Player. Each tick:
 *   - If it has the ball: run toward its attacking goal; kick when in range.
 *   - If the ball is loose: run toward the ball.
 *   - If a human has the ball: pressure the carrier.
 *
 * Behavior is throttled by REACTION (re-decide that often) to look less
 * mechanical and give humans a chance.
 */
window.FOOTY = window.FOOTY || {};

FOOTY.AI = class {
  constructor(cfg, player, field) {
    this.cfg    = cfg;
    this.player = player;
    this.field  = field;
    this.timer  = 0;
    this.targetX = player.x;
    this.targetY = player.y;
    // Set true on the tick the AI wants to kick — game loop reads & clears.
    this.wantKick = false;
  }

  // Returns a normalized (dx, dy) toward (tx, ty), or zero if already there.
  _dirTo(tx, ty) {
    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return { dx: 0, dy: 0 };
    return { dx: dx / len, dy: dy / len };
  }

  update(dt, ball, humans) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.cfg.AI.REACTION;
      this._decide(ball, humans);
    }
    // Steer toward current target each frame.
    const d = this._dirTo(this.targetX, this.targetY);
    this.player.setAIMove(d.dx, d.dy);

    // If carrying ball and inside kick range of goal, request a kick.
    if (ball.holder === this.player) {
      const goalEnd = this.player.attacks;
      const goalX = this.field.goalLineX[goalEnd];
      const goalY = this.field.goalCenterY();
      const dist = Math.hypot(goalX - this.player.x, goalY - this.player.y);
      if (dist < this.cfg.AI.KICK_RANGE) {
        // Aim slightly toward goal, with random noise.
        const aim = Math.atan2(goalY - this.player.y, goalX - this.player.x);
        const power = Math.min(1, dist / this.cfg.AI.KICK_RANGE);
        this.player.requestKick(power, aim + (Math.random() - 0.5) * 0.18);
      }
    }
  }

  _decide(ball, humans) {
    const me = this.player;

    // Case 1: AI has the ball — head toward its goal.
    if (ball.holder === me) {
      const goalEnd = me.attacks;
      this.targetX = this.field.goalLineX[goalEnd];
      this.targetY = this.field.cy + (Math.random() - 0.5) * 100;
      return;
    }

    // Case 2: A human has the ball — chase the carrier to pressure.
    if (ball.holder && ball.holder !== me) {
      this.targetX = ball.holder.x;
      this.targetY = ball.holder.y;
      return;
    }

    // Case 3: Ball is loose. Predict where it will land/roll to and head there.
    // Cheap prediction: just chase current ball position.
    this.targetX = ball.x;
    this.targetY = ball.y;
  }
};
