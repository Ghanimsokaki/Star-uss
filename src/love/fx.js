/**
 * The 2D layer above the stars: little hearts that burst from a tap, hearts
 * drifting up like lanterns, and the occasional shooting star.
 */

const COLORS = ['#ff4d8d', '#ff7aa8', '#ffb3cc', '#ffd59a', '#ffffff'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function heart(ctx, x, y, size, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 32, size / 32);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-20, -2, -16, -20, 0, -10);
  ctx.bezierCurveTo(16, -20, 20, -2, 0, 12);
  ctx.fill();
  ctx.restore();
}

export class HeartFx {
  constructor(canvas, reduced) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = reduced;
    this.parts = [];
    this.rings = [];
    this.meteors = [];
    this.nextFloat = 2;
    this.nextMeteor = 4;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  burst(x, y, n = this.reduced ? 8 : 18) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 120 + Math.random() * 260;
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 80,
        g: 160,
        size: 8 + Math.random() * 14,
        rot: (Math.random() - 0.5) * 0.8,
        vr: (Math.random() - 0.5) * 3,
        life: 0,
        max: 1.4 + Math.random() * 0.9,
        color: pick(COLORS),
      });
    }
    this.rings.push({ x, y, life: 0 });
  }

  /** a shower of hearts for the final reveal */
  celebrate() {
    const n = this.reduced ? 20 : 60;
    for (let i = 0; i < n; i++) {
      setTimeout(() => this.float(true), i * 60);
    }
  }

  float(fast = false) {
    this.parts.push({
      x: Math.random() * this.w,
      y: this.h + 30,
      vx: (Math.random() - 0.5) * 20,
      vy: -(fast ? 160 + Math.random() * 180 : 30 + Math.random() * 40),
      g: 0,
      size: 10 + Math.random() * (fast ? 22 : 16),
      rot: (Math.random() - 0.5) * 0.5,
      vr: (Math.random() - 0.5) * 0.6,
      wob: Math.random() * 6,
      life: 0,
      max: fast ? 5 : 14,
      color: pick(COLORS),
    });
  }

  meteor() {
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? Math.random() * this.w * 0.5 : this.w * (0.5 + Math.random() * 0.5);
    const y = Math.random() * this.h * 0.35;
    const sp = 700 + Math.random() * 400;
    const a = fromLeft ? 0.45 : Math.PI - 0.45;
    this.meteors.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.9 });
  }

  update(dt, started) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);

    if (started) {
      this.nextFloat -= dt;
      if (this.nextFloat <= 0) {
        this.float();
        this.nextFloat = this.reduced ? 3 : 0.9 + Math.random() * 1.2;
      }
      if (!this.reduced) {
        this.nextMeteor -= dt;
        if (this.nextMeteor <= 0) {
          this.meteor();
          this.nextMeteor = 5 + Math.random() * 7;
        }
      }
    }

    // shooting stars
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const k = 1 - m.life / m.max;
      if (k <= 0) { this.meteors.splice(i, 1); continue; }
      const tail = 0.12;
      const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
      grad.addColorStop(0, `rgba(255,240,245,${0.9 * k})`);
      grad.addColorStop(1, 'rgba(255,120,170,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail);
      ctx.stroke();
    }

    // tap rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const k = r.life / 0.9;
      if (k >= 1) { this.rings.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(255,179,204,${0.6 * (1 - k)})`;
      ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 10 + k * 90, 0, Math.PI * 2);
      ctx.stroke();
    }

    // hearts
    ctx.shadowBlur = 14;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      if (p.life >= p.max || p.y < -60) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += (p.vx + (p.wob !== undefined ? Math.sin(p.life * 1.6 + p.wob) * 22 : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const fadeIn = Math.min(1, p.life * 4);
      const fadeOut = Math.min(1, (p.max - p.life) * 1.5);
      ctx.globalAlpha = Math.max(0, fadeIn * fadeOut) * 0.9;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      heart(ctx, p.x, p.y, p.size, p.rot);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}
