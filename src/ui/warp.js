/**
 * Full-screen warp jump effect.
 * Mounted on <body> (not #ui) so it survives the scene swap mid-jump.
 */
export function playWarp({ title = 'Warp', sub = '', duration = 2200, onMid = null } = {}) {
  const streaks = Array.from({ length: 160 }, () => {
    const a = (Math.random() * Math.PI * 2).toFixed(3);
    const d = (8 + Math.random() * 60).toFixed(1);
    const delay = (Math.random() * 0.5).toFixed(2);
    const dur = (0.35 + Math.random() * 0.5).toFixed(2);
    const len = (20 + Math.random() * 70).toFixed(0);
    return `<i style="--a:${a}rad;--d:${d};--delay:${delay}s;--dur:${dur}s;--len:${len}"></i>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'warp-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="warp-tunnel">${streaks}</div>
    <div class="warp-core"></div>
    <div class="warp-flash"></div>
    <div class="warp-copy">
      <div class="warp-kicker">Engaging warp drive</div>
      <div class="warp-title">${title}</div>
      <div class="warp-sub">${sub}</div>
      <div class="warp-progress"><i></i></div>
    </div>`;
  document.body.appendChild(overlay);
  const fill = overlay.querySelector('.warp-progress i');
  const core = overlay.querySelector('.warp-core');
  requestAnimationFrame(() => {
    overlay.classList.add('go');
    if (fill) fill.style.width = '100%';
  });

  const mid = Math.max(320, duration * 0.52);
  setTimeout(() => {
    overlay.classList.add('flash');
    try { onMid?.(); } catch (e) { console.error(e); }
  }, mid);
  setTimeout(() => {
    if (core) core.style.opacity = '0';
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 620);
  }, duration);
  return overlay;
}
