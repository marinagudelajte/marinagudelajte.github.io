// E-learning case. Both pieces play only while on screen; with reduced motion they stay still.
//
// 1. Click-through demo: a cursor plays through four slides of the hard skills template, on a loop.
//    Each slide (.demo__scene) has three pictures: at rest, pointer over the button (.demo__hover),
//    after the click (.demo__result). data-x / data-y: where the cursor goes, in % of the slide.
//    data-click: what the click does — reveal (the result unrolls downwards, a tab panel),
//    flip (the card turns over), fade (the result fades in), tip (a tooltip grows).
// 2. Slide stack: six theory slides land on top of each other, one by one, then start over.
//
// Every step ends by writing its end state into the layer's own style, and a scene is wiped
// back to its first picture before it is shown again. So each loop starts exactly like the first.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = getComputedStyle(document.documentElement);
  const EASE_OUT = root.getPropertyValue('--ease-out').trim() || 'ease-out';
  const EASE_IN_OUT = root.getPropertyValue('--ease-in-out').trim() || 'ease-in-out';
  const MOVED = ['opacity', 'transform', 'clip-path', 'visibility', 'z-index'];

  // Waits that stop while the element is off screen.
  function visibility(el) {
    let visible = false;
    let wake = null;
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && wake) { wake(); wake = null; }
    }, { threshold: 0.3 }).observe(el);
    const whenVisible = () => (visible ? Promise.resolve() : new Promise((r) => { wake = r; }));
    return async (ms) => { await whenVisible(); await new Promise((r) => setTimeout(r, ms)); await whenVisible(); };
  }

  // Animate, then keep the last frame as the element's own style.
  async function to(el, frames, options) {
    const run = el.animate(frames, options);
    await run.finished;
    Object.assign(el.style, frames[frames.length - 1]);
    run.cancel();
  }
  // Back to the stylesheet: no running animations, no styles left by earlier steps.
  function wipe(el) {
    [el, ...el.querySelectorAll('*')].forEach((node) => {
      node.getAnimations().forEach((a) => a.cancel());
      MOVED.forEach((prop) => node.style.removeProperty(prop));
    });
  }

  // ---------- 1. click-through demo ----------
  (function () {
    const figure = document.querySelector('[data-demo]');
    if (!figure) return;
    const stage = figure.querySelector('.demo');
    if (reduce || !('animate' in stage)) { stage.classList.add('is-static'); return; }

    const hold = visibility(stage);
    const scenes = [...stage.querySelectorAll('.demo__scene')];
    const cursor = stage.querySelector('.demo__cursor');
    const ripple = stage.querySelector('.demo__ripple');

    let at = { x: 0.78, y: 0.86 };
    const px = (p) => {
      const r = stage.getBoundingClientRect();
      return `translate(${(p.x * r.width).toFixed(1)}px, ${(p.y * r.height).toFixed(1)}px)`;
    };
    cursor.style.transform = px(at);
    async function moveTo(x, y, duration = 900) {
      const from = px(at);
      at = { x, y };
      await to(cursor, [{ transform: from }, { transform: px(at) }], { duration, easing: EASE_IN_OUT });
    }
    async function click() {
      ripple.style.transform = px(at);
      ripple.firstElementChild.animate([{ transform: 'scale(0.3)', opacity: 0.7 }, { transform: 'scale(1)', opacity: 0 }],
        { duration: 450, easing: EASE_OUT });
      await cursor.firstElementChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: EASE_OUT }).finished;
    }

    let current = 0;
    async function show(n) {
      const next = scenes[n];
      const prev = scenes[current];
      wipe(next);                       // the scene arrives at rest, whatever happened to it last time
      next.style.zIndex = 2;
      await to(next, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease' });
      next.classList.add('is-on');
      prev.classList.remove('is-on');
      wipe(next);
      wipe(prev);
      current = n;
    }

    async function run(scene) {
      const $ = (sel) => scene.querySelector(sel);
      await moveTo(scene.dataset.x / 100, scene.dataset.y / 100);
      await to($('.demo__hover'), [{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease' });
      await hold(600);
      await click();
      switch (scene.dataset.click) {
        case 'reveal':
          await to($('.demo__result'), [{ clipPath: 'inset(0 0 54% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 700, easing: EASE_OUT });
          break;
        case 'flip': {
          $('.demo__flip').style.visibility = 'visible';
          moveTo(0.5, 0.86, 700);         // the cursor steps aside so the card can be read
          await to($('.demo__card'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 800, easing: EASE_IN_OUT });
          break;
        }
        case 'fade':
          await to($('.demo__result'), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE_OUT });
          break;
        case 'tip':
          to($('.demo__result'), [{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease' });
          await to($('.demo__tip'), [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 250, easing: EASE_OUT });
          break;
        default:
          break;
      }
      await hold(1900);
    }

    (async function loop() {
      await hold(600);
      for (;;) {
        for (let i = 0; i < scenes.length; i++) {
          await run(scenes[i]);
          await show((i + 1) % scenes.length);
        }
      }
    })();
    window.addEventListener('resize', () => { cursor.style.transform = px(at); });
  })();

  // ---------- 2. slide stack ----------
  (function () {
    const figure = document.querySelector('[data-stack]');
    if (!figure || reduce) return;
    const stack = figure.querySelector('.stack');
    if (!('animate' in stack)) return;
    const hold = visibility(stack);
    const slides = [...stack.querySelectorAll('.stack__slide')];
    const turn = (el) => getComputedStyle(el).getPropertyValue('--r').trim() || '0deg';

    (async function loop() {
      for (;;) {
        for (let i = 1; i < slides.length; i++) {
          await hold(1800);
          const r = turn(slides[i]);
          // lands from the lower right, a little more turned, and settles into place
          await to(slides[i], [
            { opacity: 0, transform: `translate(6%, 8%) rotate(calc(${r} + 5deg))` },
            { opacity: 1, transform: `translate(0, 0) rotate(${r})` },
          ], { duration: 700, easing: EASE_OUT });
        }
        await hold(2400);
        // the pile clears away together, the first slide stays underneath
        await Promise.all(slides.slice(1).map((s) => to(s, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: 'ease' })));
        slides.slice(1).forEach(wipe);
      }
    })();
  })();
})();
