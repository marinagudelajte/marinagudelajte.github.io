// Ink trail: a thin navy pen line follows the cursor anywhere on the page, tapers
// towards its tail and fades out. Mouse devices only, off for reduced motion.
// One fixed full-viewport canvas; the draw loop runs only while ink is visible.
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const LIFE = 700;          // ms a point of the line stays visible
  const INK = '8, 8, 75';            // --navy as rgb, on light backgrounds
  const INK_LIGHT = '208, 224, 242'; // --sky as rgb, over [data-ink="light"] (dark) areas
  const NEW_STROKE_GAP = 120; // ms without movement starts a new line

  const canvas = document.createElement('canvas');
  canvas.className = 'ink-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  let points = [];
  let frame = 0;
  let lastTime = 0;

  function draw(now) {
    points = points.filter((p) => now - p.t < LIFE);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (b.newStroke) continue;
      const life = 1 - (now - b.t) / LIFE;   // 1 = fresh, 0 = gone
      const next = points[i + 1];
      const cont = next && !next.newStroke;
      // smooth curve: midpoint before b → through b → midpoint after b
      ctx.strokeStyle = `rgba(${b.ink}, ${(life * 0.85).toFixed(3)})`;
      ctx.lineWidth = 0.75 + life * 2.5;     // tapers towards the tail
      ctx.beginPath();
      ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      ctx.quadraticCurveTo(b.x, b.y, cont ? (b.x + next.x) / 2 : b.x, cont ? (b.y + next.y) / 2 : b.y);
      ctx.stroke();
    }
    frame = points.length ? requestAnimationFrame(draw) : 0;
  }

  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const now = performance.now();
    // light ink over dark sections, so the line stays visible
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const ink = under && under.closest('[data-ink="light"]') ? INK_LIGHT : INK;
    points.push({ x: event.clientX, y: event.clientY, t: now, ink, newStroke: now - lastTime > NEW_STROKE_GAP });
    lastTime = now;
    if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });

  // the cursor left the window: let the line fade, and start fresh next time
  document.addEventListener('pointerleave', () => { lastTime = 0; });
})();
