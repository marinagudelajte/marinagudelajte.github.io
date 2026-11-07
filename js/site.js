// Small page-wide behaviours.

// Split a heading's text into .word > .char spans for the masked letter reveal (skipping
// any SVG inside it), keeping inline elements like <em>. Screen readers get the plain sentence.
function splitLetters(heading) {
  heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let i = 0;
  nodes.forEach((node) => {
    if (!node.textContent.trim()) return;
    const frag = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
      const word = document.createElement('span');
      word.className = 'word';
      word.setAttribute('aria-hidden', 'true');
      for (const ch of part) {
        const c = document.createElement('span');
        c.className = 'char';
        c.textContent = ch;
        c.style.setProperty('--i', i++);
        word.appendChild(c);
      }
      frag.appendChild(word);
    });
    node.replaceWith(frag);
  });
}

// Case pages: letter reveal in the head; the scrolling tile lets go when the mouse leaves,
// so the wheel scrolls the page again.
(function () {
  const title = document.querySelector('.case-head h1');
  if (title && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) splitLetters(title);
  document.querySelectorAll('.case-scroll__view').forEach((view) => {
    view.addEventListener('pointerleave', () => view.blur());
  });
})();

// Case pages: picture tiles and the results block rise in as they scroll into view.
(function () {
  const items = document.querySelectorAll('.case-shot, .case-results');
  if (!items.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Set here, by the script itself: if it never runs, nothing stays hidden.
  document.documentElement.classList.add('case-reveal');
  const io = new IntersectionObserver((entries) => {
    // tiles entering together (one row) follow each other
    entries.filter((e) => e.isIntersecting).forEach((entry, i) => {
      entry.target.style.transitionDelay = `${i * 90}ms`;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
})();

// Case pages: muted videos play only while they are on screen. With reduced motion they
// stay on their still picture and get controls instead.
(function () {
  const videos = document.querySelectorAll('video[data-autoplay]');
  if (!videos.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
    videos.forEach((v) => { v.controls = true; });
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.play().catch(() => { entry.target.controls = true; });
      else entry.target.pause();
    });
  }, { threshold: 0.25 });
  videos.forEach((v) => io.observe(v));
})();

// Case pages: videos with sound start muted (autoplay never makes a sound); only one can be
// heard at a time, so turning the sound on in one mutes the others.
(function () {
  const videos = document.querySelectorAll('video[data-solo]');
  videos.forEach((video) => video.addEventListener('volumechange', () => {
    if (video.muted) return;
    videos.forEach((other) => { if (other !== video) other.muted = true; });
  }));
})();

// Copy-to-clipboard buttons ([data-copy]) with a small "copied" toast.
(function () {
  const toast = document.querySelector('.toast');
  let hideTimer = 0;

  function showToast(message) {
    if (!toast) return;
    clearTimeout(hideTimer);
    toast.textContent = message;
    // next frame, so the fade-in transition runs even when the text just appeared
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    hideTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      hideTimer = setTimeout(() => { toast.textContent = ''; }, 500);
    }, 2200);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // older browsers / blocked clipboard: fall back to a hidden textarea
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      area.remove();
      return ok;
    }
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy;
      const ok = await copy(text);
      showToast(ok ? 'Email copied' : `Copy this: ${text}`);
    });
  });

  // Email links open the visitor's mail app with the address filled in (mailto).
  // Some devices have no mail app set up and then nothing happens at all. A mail app
  // takes the focus away from this page, so if the page keeps it, copy the address.
  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    link.addEventListener('click', () => {
      const address = link.getAttribute('href').replace('mailto:', '').split('?')[0];
      let left = false;
      const markLeft = () => { left = true; };
      window.addEventListener('blur', markLeft, { once: true });
      document.addEventListener('visibilitychange', markLeft, { once: true });
      setTimeout(async () => {
        window.removeEventListener('blur', markLeft);
        document.removeEventListener('visibilitychange', markLeft);
        if (left) return;
        const ok = await copy(address);
        showToast(ok ? 'No mail app opened. Email copied' : `Write to: ${address}`);
      }, 1200);
    });
  });
})();

// Works: a full-screen curtain over the works screen opens horizontally on scroll.
(function () {
  const section = document.querySelector('.works');
  const doors = document.querySelector('.doors');
  if (!section || !doors) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('no-reveal');
    return;
  }

  /* Torn edge only where the curtain opens (the inner vertical edge).
     Seeded random, so the tear has the same shape on every visit. */
  function seeded(seed) {
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }
  function tear(door, side, seed) {
    const rnd = seeded(seed);
    const w = door.offsetWidth;
    const h = door.offsetHeight;
    const X = (x) => (side === 'right' ? x : w - x);   // the torn edge is on the right of the left half
    const pts = [[X(0), 0]];
    for (let y = 0; y <= h; y += 10 + rnd() * 12) pts.push([X(w - rnd() * 22), y]);
    pts.push([X(w - rnd() * 22), h], [X(0), h]);
    door.style.clipPath = 'polygon(' + pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',') + ')';
  }
  const left = doors.querySelector('.door--left');
  const right = doors.querySelector('.door--right');
  function tearAll() { tear(left, 'right', 7); tear(right, 'left', 19); }
  tearAll();

  /* Progress: closed until the curtain fills the whole screen (section top at the top);
     fully open after 70% of a screen more scrolling (the curtain is pinned meanwhile). */
  const START = 0;
  const END = -0.7;
  let ticking = false;
  function update() {
    ticking = false;
    const top = section.getBoundingClientRect().top;
    const vh = window.innerHeight;
    const raw = Math.min(Math.max((vh * START - top) / (vh * (START - END)), 0), 1);
    const p = raw * raw * (3 - 2 * raw);                // smoothstep: soft start and end
    doors.style.setProperty('--p', p.toFixed(4));
    doors.classList.toggle('is-open', p >= 0.999);
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { tearAll(); onScroll(); });
  update();

  // Arriving from a case page (home page #works): land with the curtain already open.
  if (location.hash === '#works') {
    window.addEventListener('load', () => {
      const y = section.getBoundingClientRect().top + window.scrollY - window.innerHeight * END;
      window.scrollTo({ top: y, behavior: 'instant' });
    });
  }

  // "Works" / "See works" links: land where the curtain is already open.
  document.querySelectorAll('a[href="#works"]').forEach((a) => {
    a.addEventListener('click', (event) => {
      event.preventDefault();
      const y = section.getBoundingClientRect().top + window.scrollY - window.innerHeight * END;
      window.scrollTo({ top: y, behavior: 'smooth' });
      history.replaceState(null, '', '#works');
    });
  });
})();
// Links to About and the contacts jump straight there: smooth scrolling would first
// run through the curtain and the whole card stack.
(function () {
  ['about', 'contact'].forEach((id) => {
    const target = document.getElementById(id);
    if (!target) return;
    // arriving from a case page (home page #about): land there at once as well
    if (location.hash === `#${id}`) {
      window.addEventListener('load', () => target.scrollIntoView({ behavior: 'instant' }));
    }
    document.querySelectorAll(`a[href="#${id}"]`).forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'instant' });
        target.focus({ preventScroll: true });   // keyboard users continue from here
        if (id === 'contact') {
          // the visitor is on the block now: start its entrance and the underline right away
          target.classList.add('is-in');
          target.querySelectorAll('.hand-underline').forEach((el) => el.classList.add('is-drawn'));
        }
        history.pushState(null, '', `#${id}`);
      });
    });
  });
})();

// About: the sun and moon buttons switch the window between work and hobbies.
(function () {
  const win = document.querySelector('.about-window');
  if (!win) return;
  const modes = Array.from(win.querySelectorAll('.about-mode'));
  const panels = { day: win.querySelector('.about-panel--day'), night: win.querySelector('.about-panel--night') };

  modes.forEach((button) => button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    win.dataset.mode = mode;
    modes.forEach((b) => b.setAttribute('aria-pressed', b === button));
    Object.entries(panels).forEach(([name, panel]) => panel.classList.toggle('is-active', name === mode));
  }));
})();

// About: the window's entrance starts when it scrolls into view.
(function () {
  const about = document.querySelector('.about');
  const win = about && about.querySelector('.about-window');
  if (!win) return;
  const start = () => about.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); }
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });   // low: on phones the window is taller than the screen
  io.observe(win);
})();

// Finale ("Let's talk"): the same entrance as the hero, started when the block shows up.
(function () {
  const finale = document.querySelector('.finale');
  const heading = finale && finale.querySelector('.finale__cta h2');
  if (!finale || !heading) return;

  splitLetters(heading);

  const start = () => finale.classList.add('is-in');
  if (!('IntersectionObserver' in window)) { start(); return; }
  // Start only when the heading itself is well inside the screen (not when the top
  // of the dark block first peeks in), so the whole entrance is actually seen.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { start(); io.disconnect(); }
  }, { threshold: 0.6, rootMargin: '0px 0px -20% 0px' });
  io.observe(heading);
})();

// Hand-drawn underlines draw themselves in when they scroll into view.
(function () {
  const lines = document.querySelectorAll('.hand-underline');
  if (!lines.length) return;

  if (!('IntersectionObserver' in window)) {
    lines.forEach((el) => el.classList.add('is-drawn'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-drawn');
      io.unobserve(entry.target); // draw once
    });
  }, { threshold: 0.8 });

  lines.forEach((el) => io.observe(el));
})();
