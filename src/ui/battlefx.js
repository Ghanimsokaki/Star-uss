/**
 * Battle feedback drawn over the 3D view: red alert, floating damage numbers,
 * a DESTROYED stamp, and arrows pointing at whoever is shooting you.
 *
 * All DOM + CSS animations (see style.css "battle fx"), so they cost nothing
 * on the GPU and stay crisp at any render resolution.
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();

/** World position → CSS pixels, or null when behind the camera. */
export function toScreen(pos, camera, w = window.innerWidth, h = window.innerHeight) {
  _v.copy(pos).project(camera);
  if (_v.z > 1) return null;
  return { x: (_v.x + 1) / 2 * w, y: (1 - _v.y) / 2 * h };
}

function spawn(container, html, cls, x, y, life) {
  const n = document.createElement('div');
  n.className = `bfx ${cls}`;
  n.innerHTML = html;
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  container.appendChild(n);
  setTimeout(() => n.remove(), life);
  return n;
}

/** A number that pops off a ship and drifts up. kind: 'hull' | 'shield' | 'crit'. */
export function floatNumber(container, camera, pos, value, kind = 'hull') {
  const p = toScreen(pos, camera);
  if (!p || !container) return;
  const jitter = (Math.random() - 0.5) * 40;
  spawn(container, String(Math.round(value)), `bfx-num ${kind}`, p.x + jitter, p.y - 20, 950);
}

/** The kill confirmation: a stamped DESTROYED plus the payout. */
export function destroyedStamp(container, camera, pos, name, reward) {
  const p = toScreen(pos, camera) || { x: window.innerWidth / 2, y: window.innerHeight * 0.4 };
  spawn(container, `<b>DESTROYED</b><span>${name}</span>${reward ? `<em>${reward}</em>` : ''}`, 'bfx-stamp', p.x, p.y, 1700);
}

/**
 * A red wedge on the screen edge pointing toward the shooter.
 * Works for threats behind you too (it flips to the bottom edge).
 */
export function hitArrow(container, camera, from) {
  if (!container) return;
  _v.copy(from).applyMatrix4(camera.matrixWorldInverse);   // camera space: x right, y up, -z ahead
  let sx = _v.x, sy = _v.y;
  // behind you: push the arrow toward the bottom edge
  if (_v.z > 0) sy = -Math.abs(sy) - Math.abs(_v.z) * 0.5;
  const deg = Math.atan2(sx, sy) * (180 / Math.PI);          // 0° = straight up the screen
  const n = spawn(container, '', 'bfx-arrow', window.innerWidth / 2, window.innerHeight / 2, 900);
  n.style.setProperty('--a', `${deg}deg`);
}

/** Full-screen RED ALERT sweep with pulsing edges. */
export function redAlert(container, text = 'RED ALERT', sub = 'All hands to battle stations') {
  if (!container) return;
  container.querySelector('.bfx-alert')?.remove();
  const n = spawn(container, `<div class="ra-band"><b>${text}</b><span>${sub}</span></div>`, 'bfx-alert', 0, 0, 3200);
  n.style.left = '0'; n.style.top = '0';
}

/** A short jolt on an element (status panel on a hull hit). */
export function jolt(node) {
  if (!node) return;
  node.classList.remove('bfx-jolt');
  void node.offsetWidth;
  node.classList.add('bfx-jolt');
}
