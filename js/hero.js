// Hero motion. The animations themselves live in css/main.css; this script:
//   1. splits the heading into letters for the masked letter-by-letter reveal,
//   2. feeds the cursor position (--mx / --my) to the parallax layers,
//   3. pauses idle loops while the hero is off-screen,
//   4. loads the gravity chips (Matter.js) on mouse devices.
(function () {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const panel = hero.querySelector('.hero__panel');
  const art = hero.querySelector('.hero__art');
  const heading = hero.querySelector('h1');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. Split heading into .word > .char spans ---------- */
  if (heading) {
    if (!reduceMotion) splitHeading(heading);
    heading.classList.add('is-split');
  }

  function splitHeading(el) {
    // Screen readers get the plain sentence; the letter spans are hidden from them.
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let index = 0;

    // Walk text nodes so inline elements like <em> keep their styling.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(' '));
          return;
        }
        const word = document.createElement('span');
        word.className = 'word';
        word.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'char';
          c.textContent = ch;
          c.style.setProperty('--i', index++);
          word.appendChild(c);
        }
        frag.appendChild(word);
      });
      node.replaceWith(frag);
    });
  }

  /* ---------- 4. Pause idle loops off-screen ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      hero.classList.toggle('is-offscreen', !entry.isIntersecting);
    }).observe(hero);
  }

  if (reduceMotion || !finePointer || !panel || !art) return;

  /* ---------- 5. Gravity chips (mouse devices only, loaded in the background) ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  loadScript('js/vendor/matter.min.js')
    .then(() => loadScript('js/hero-physics.js'))
    .catch(() => { /* chips simply keep their idle bob */ });

  /* ---------- 2. Cursor parallax ---------- */
  const RANGE = 14;   // max shift in px for a layer with depth 1
  const EASE = 0.08;  // how quickly layers catch up with the cursor (0..1)
  let targetX = 0, targetY = 0, px = 0, py = 0;

  /* ---------- Parallax loop (runs only while layers are catching up) ---------- */
  // (The ink trail now lives in js/ink-trail.js and covers the whole page.)
  let frame = 0;
  function tick() {
    px += (targetX - px) * EASE;
    py += (targetY - py) * EASE;
    panel.style.setProperty('--mx', px.toFixed(2));
    panel.style.setProperty('--my', py.toFixed(2));
    const moving = Math.abs(targetX - px) > 0.05 || Math.abs(targetY - py) > 0.05;
    frame = moving ? requestAnimationFrame(tick) : 0;
  }
  function start() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  hero.addEventListener('pointermove', (event) => {
    const rect = panel.getBoundingClientRect();
    targetX = (((event.clientX - rect.left) / rect.width) * 2 - 1) * RANGE;
    targetY = (((event.clientY - rect.top) / rect.height) * 2 - 1) * RANGE;
    start();
  });

  hero.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    start();
  });
})();
