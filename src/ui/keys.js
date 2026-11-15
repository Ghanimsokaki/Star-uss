/**
 * Scene keyboard shortcuts — so everything a mouse, trackpad or thumb can do
 * also works from the keyboard.
 *
 * bindKeys({ 'arrowleft': fn, 'enter': fn, ... }) → unbind()
 * Keys are matched on `event.key.toLowerCase()`. Handlers are skipped while
 * the player is typing in a field or a dialog is open (dialogs own the
 * keyboard then: Tab, Enter and Esc work on their buttons).
 */
import { hasModal } from './dom.js';

export function isTyping(e) {
  const t = e.target;
  return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
}

export function bindKeys(map, { allowInModal = false } = {}) {
  const onKey = (e) => {
    if (isTyping(e)) return;
    if (!allowInModal && hasModal()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const fn = map[e.key.toLowerCase()];
    if (!fn) return;
    // don't steal Enter/Space from a focused button: let it press the button
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.tagName === 'BUTTON') return;
    const handled = fn(e);
    if (handled !== false) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/**
 * Orbit an OrbitControls camera around its target by an angle (radians).
 * Works without touching the controls' private API.
 */
export function orbitBy(controls, camera, dTheta = 0, dPhi = 0) {
  const off = camera.position.clone().sub(controls.target);
  const r = off.length();
  let theta = Math.atan2(off.x, off.z);
  let phi = Math.acos(Math.max(-1, Math.min(1, off.y / r)));
  theta += dTheta;
  phi = Math.max(controls.minPolarAngle + 0.01, Math.min(controls.maxPolarAngle - 0.01, phi + dPhi));
  off.set(r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta));
  camera.position.copy(controls.target).add(off);
  controls.update();
}

export function zoomBy(controls, camera, f) {
  const off = camera.position.clone().sub(controls.target);
  const d = Math.max(controls.minDistance, Math.min(controls.maxDistance, off.length() * f));
  camera.position.copy(controls.target).add(off.setLength(d));
  controls.update();
}

/** Every control, per screen — shown by the ? overlay. */
export const CONTROLS = {
  everywhere: [
    ['?  or  F1', 'This list of controls'],
    ['F2', 'Talk to the ship\u2019s computer'],
    ['J / G / H / M', 'Earth · Galaxy map · Shipyard · Mission log'],
    ['U', 'Hide or show every panel'],
    ['[  /  ]', 'Open the left / right side panel'],
    ['Tab · Enter · Esc', 'Move between buttons · press · close a dialog'],
  ],
  system: [
    ['W / S', 'Thrust forward / reverse'],
    ['A / D  ·  ← →', 'Turn left / right'],
    ['Space / Shift', 'Climb / descend'],
    ['↑ ↓', 'Pitch the nose'],
    ['K  or  left click', 'Fire phasers'],
    ['F  or  right click', 'Photon torpedo'],
    ['E', 'Ship ability'],
    ['B', 'Boost'],
    ['Q / Tab', 'Next target'],
    ['R', 'Scan the nearest planet or anomaly'],
    ['P', 'Autopilot'],
    ['Z / C · X', 'Cruise speed up / down · all stop'],
    ['L', 'Land on the nearest planet'],
    ['T', 'Warp (opens the galaxy map)'],
    ['I', 'Go below decks — walk inside the ship'],
    ['[  /  ]  ·  -  /  =', 'Swing the camera around the ship · zoom'],
    ['N', 'Camera back behind the ship'],
    ['O', 'Free camera'],
    ['V', 'Weapons assist on / off'],
  ],
  interior: [
    ['W A S D', 'Walk'],
    ['Shift', 'Run'],
    ['← → ↑ ↓  or drag', 'Look around'],
    ['Hold E', 'Repair a sparking station'],
    ['E at the turbolift · I · Esc', 'Back to flight'],
  ],
  galaxy: [
    ['← →  or  A / D', 'Previous / next star'],
    ['↑ ↓  or  W / S', 'Zoom in / out'],
    ['Q / E', 'Turn the map'],
    ['Enter', 'Engage warp (or launch, if you are already there)'],
    ['C', 'Back to your current system'],
    ['L', 'Launch into the current system'],
  ],
  earth: [
    ['1 – 7', 'Choose a district to build'],
    ['Enter', 'Build it where the centre of the screen points'],
    ['Esc', 'Cancel building'],
    ['Arrows  or  W A S D', 'Spin the globe'],
    ['+ / -', 'Zoom'],
    ['N', 'Fly to the next district'],
    ['R', 'Auto-rotate on / off'],
    ['Y', 'Globe layers and sun'],
    ['L', 'Launch your starship'],
  ],
  hangar: [
    ['↑ ↓', 'Previous / next ship'],
    ['Enter', 'Commission or take command of it'],
    ['← →  or  A / D', 'Turn the ship'],
    ['1 – 4', 'Stats · Upgrades · Livery · Research'],
    ['N', 'Design your own ship (Esc closes the designer)'],
  ],
  planet: [
    ['W A S D', 'Walk'],
    ['Space', 'Jump — much higher on low-gravity moons'],
    ['Shift', 'Run'],
    ['E', 'Talk to someone nearby'],
    ['R', 'Scan a glowing deposit'],
    ['L', 'Lift off back to orbit'],
  ],
};
