cd "C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision"

$msg = @'
feat(home): restore the spatial particle field and extend it with pointer trails

V2 had a particle field in HubBackdrop.tsx (preserved in the v2 backup). That file
was deleted in V3 and the particles went with it. This restores the recoverable part
and adds the behaviour the brief actually asks for.

RECOVERED from V2: one BufferGeometry drawn as points, phase-offset per-particle
drift, a DPR ceiling of 1.75, low-power renderer with the depth buffer off, and full
resource disposal on unmount.

NEW, because V2 only had damped pointer PARALLAX and the brief asks for follow,
trail, direction, gathering and dispersal:
  - pointer attraction with a distance falloff, so nearby motes pull in and distant
    ones barely move (that falloff is what reads as gathering rather than the whole
    field translating)
  - a trail, implemented as the SAME field sampled at a negative time offset along
    the motion direction, so there is no second particle system, no second render
    loop, and no allocation during interaction
  - speed-dependent brightness, so the field visibly notices the pointer
  - a small warm-biased minority of motes, so the field is not monotone

The simulation lives in the vertex shader: each particle's state is derived from
(seed, time, pointer), so the CPU cost per frame is four uniform writes rather than
thousands of writes plus a full GPU upload on the same thread that runs React and
the globe.

TWO REAL DEFECTS FOUND BY MEASURING, EACH OF WHICH MADE THE FIELD RENDER NOTHING:

 1. `contain: strict` on the layer. Strict includes SIZE containment, which makes an
    element ignore its own contents when computing intrinsic size — so the `inset: 0`
    box resolved to zero height and the canvas got a 1430x1 drawing buffer. Measured:
    `size 1430 x 0`, 0 lit pixels. Changed to `contain: layout paint`.

 2. `home.css` gave every `.vhome` child `position: relative`, which overrode the
    field's own `position: absolute` — and a relative element with `inset: 0` has no
    height either. Measured: computed position=relative, box 1290x0. The rule now
    excludes `.cfield` alongside `.vback`, and says why, so the next full-bleed layer
    added to this page does not hit the same invisible failure.

VERIFIED IN A BROWSER:
  .cfield 1430 x 1000, canvas drawing buffer 1430 x 1000, data-field-ready set
  computed pointer-events: none, and elementFromPoint confirms the layer is never
    the hit target anywhere — both core windows remain reachable at their centres
  RENDER COMPARISON (the authoritative evidence that it paints and animates): two
    captures of the same page differ in 7526 pixels, 0.523%, max channel delta 46

  A per-pixel mote detector was also written and is included, but its per-particle
  result is NOT cited as evidence: motes are faint (peak alpha ~0.2 on a near-black
  ground) and the isolation test that keeps glyph edges out rejects dim particles
  too. The probe says so in place, so its output cannot be mistaken for a defect.
'@

git add -A
git commit -q -m $msg
git log --oneline -4
Write-Host ""
git show --stat --oneline HEAD | Select-Object -First 14
