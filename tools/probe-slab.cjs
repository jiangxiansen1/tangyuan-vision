/**
 * Is the particle slab big enough to cover the viewport?
 *
 * The field mounted, the shader compiled, the box is right — and the browser still
 * read 0 lit pixels. Before changing anything, work out where the particles actually
 * land on screen.
 *
 * Camera: fov 58 deg vertical, at z = +30 looking down -Z.
 * Slab:   x in [-34, 34], y in [-20, 20], z in [-6, -60].
 */

const DEG = Math.PI / 180;
const fov = 58;
const camZ = 30;
const aspect = 1430 / 1000; // the measured viewport

console.log('  viewport aspect        :', aspect.toFixed(3));
console.log('');

// Half-height of the visible frustum at a given distance in front of the camera.
function halfHeightAt(distance) {
  return Math.tan((fov * DEG) / 2) * distance;
}

for (const z of [0, -6, -20, -40, -54]) {
  const dist = camZ - z; // camera at +30, object at z
  const hh = halfHeightAt(dist);
  const hw = hh * aspect;
  console.log(
    `  at z=${String(z).padStart(3)} (dist ${String(dist).padStart(2)})  ` +
      `visible x ±${hw.toFixed(1).padStart(6)}  y ±${hh.toFixed(1).padStart(5)}`
  );
}

console.log('');
const frontZ = -6;
const frontDist = camZ - frontZ;
const frontHH = halfHeightAt(frontDist);
const frontHW = frontHH * aspect;
console.log(`  the NEAREST particles (z=${frontZ}) live on a plane visible to x ±${frontHW.toFixed(1)}, y ±${frontHH.toFixed(1)}`);
console.log(`  the slab spans                        x ±34.0, y ±20.0`);
console.log('');

if (34 < frontHW || 20 < frontHH) {
  console.log('  => the slab is NARROWER than the visible plane at that depth,');
  console.log('     so a band around the viewport edge has no particles at all.');
  console.log('     The probe sampled 96x96 from the canvas TOP-LEFT, which is exactly');
  console.log('     that empty band. It reported "0 lit pixels" for a field that was');
  console.log('     rendering correctly in the middle.');
} else {
  console.log('  => the slab covers the full visible plane.');
}
