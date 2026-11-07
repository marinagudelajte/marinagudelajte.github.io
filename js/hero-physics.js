// Gravity labels: pills drop from where they are, collide, tumble and pile up on a floor.
// Each one can be grabbed and thrown. Used for the hero chips and the About work labels.
// Loaded by hero.js only on mouse devices without reduced motion, after
// js/vendor/matter.min.js (Matter.js, MIT).
(function () {
  if (!window.Matter) return;
  const { Engine, Bodies, Body, Composite, Constraint, Sleeping } = Matter;

  const WALL = 200;        // thickness of the invisible walls

  /* ---------- Hero: drop once the chips' pop-in has finished ---------- */
  const art = document.querySelector('.hero__art');
  if (art) {
    const chips = Array.from(art.querySelectorAll('.chip'));
    if (chips.length) {
      setTimeout(() => dropLabels(art, chips, 18), Math.max(0, 1700 - performance.now()));
    }
  }

  /* ---------- About: drop after the window's entrance, while the work panel is showing ---------- */
  const about = document.querySelector('.about');
  const panel = about && about.querySelector('.about-panel--day');
  if (panel) {
    const list = panel.querySelector('.about__skills');
    const labels = list ? Array.from(list.children) : [];
    let waiting = false;
    const tryStart = () => {
      if (waiting || !about.classList.contains('is-in') || !panel.classList.contains('is-active')) return;
      waiting = true;
      observer.disconnect();
      setTimeout(() => {
        // one column (narrow window): the photo is below the text, so the labels would land on it
        if (getComputedStyle(panel).gridTemplateColumns.trim().split(/\s+/).length < 2) return;
        list.style.height = `${list.offsetHeight}px`;   // the labels leave the flow: keep their space
        dropLabels(panel, labels, 16);
      }, 1800);
    };
    const observer = new MutationObserver(tryStart);
    observer.observe(about, { attributes: true, attributeFilter: ['class'] });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    if (labels.length) tryStart();
  }

  // box: the element the labels live in; floorInset: px above the box's bottom edge
  function dropLabels(box, chips, floorInset) {
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;

    let W = box.clientWidth;
    let H = box.clientHeight;
    const boxRect = box.getBoundingClientRect();

    // One body per label, starting exactly where (and at the angle) it is now.
    const items = chips.map((el) => {
      const r = el.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const angle = (parseFloat(getComputedStyle(el).rotate) || 0) * Math.PI / 180;
      const body = Bodies.rectangle(
        r.left + r.width / 2 - boxRect.left,
        r.top + r.height / 2 - boxRect.top,
        w, h,
        {
          angle,
          chamfer: { radius: h / 2 - 1 },  // pill shape
          restitution: 0.25,
          friction: 0.5,
          frictionAir: 0.015,
          density: 0.002,
        }
      );
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
      return { el, body, w, h };
    });

    // Invisible floor and two tall side walls. Re-created whenever the box changes size.
    let walls = [];
    function placeWalls() {
      if (walls.length) Composite.remove(engine.world, walls);
      const tall = H * 4;
      walls = [
        Bodies.rectangle(W / 2, H - floorInset + WALL / 2, W + WALL * 2, WALL, { isStatic: true }),
        Bodies.rectangle(-WALL / 2, H - tall / 2, WALL, tall, { isStatic: true }),
        Bodies.rectangle(W + WALL / 2, H - tall / 2, WALL, tall, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
    }
    placeWalls();
    Composite.add(engine.world, items.map((i) => i.body));

    function sync() {
      for (const { el, body, w, h } of items) {
        const { x, y } = body.position;
        el.style.transform = `translate(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px) rotate(${body.angle.toFixed(4)}rad)`;
      }
    }

    // Hand the labels over from CSS to physics in the same frame (no visible jump).
    sync();
    box.classList.add('is-physics');

    /* ---------- Loop: runs only while something moves ---------- */
    let frame = 0;
    let drag = null;
    function loop() {
      Engine.update(engine, 1000 / 60);
      sync();
      const settled = items.every((i) => i.body.isSleeping);
      frame = settled && !drag ? 0 : requestAnimationFrame(loop);
    }
    function wake() {
      items.forEach((i) => Sleeping.set(i.body, false));
      if (!frame) frame = requestAnimationFrame(loop);
    }
    wake();

    /* ---------- Grab and throw ---------- */
    function localPoint(event) {
      const r = box.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    }

    items.forEach((item) => {
      item.el.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        try { item.el.setPointerCapture(event.pointerId); } catch (e) { /* not capturable: drag still works while over the label */ }
        const p = localPoint(event);
        const constraint = Constraint.create({
          pointA: p,
          bodyB: item.body,
          pointB: { x: p.x - item.body.position.x, y: p.y - item.body.position.y },
          stiffness: 0.2,
          damping: 0.1,
          length: 0,
        });
        Composite.add(engine.world, constraint);
        drag = { item, constraint };
        item.el.classList.add('is-dragging');
        wake();
      });

      item.el.addEventListener('pointermove', (event) => {
        if (!drag || drag.item !== item) return;
        drag.constraint.pointA = localPoint(event);
      });

      const release = () => {
        if (!drag || drag.item !== item) return;
        Composite.remove(engine.world, drag.constraint);
        item.el.classList.remove('is-dragging');
        drag = null;
        wake();
      };
      item.el.addEventListener('pointerup', release);
      item.el.addEventListener('pointercancel', release);
      item.el.addEventListener('lostpointercapture', release);
    });

    /* ---------- Keep the box in sync with the layout ---------- */
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => {
        if (box.clientWidth === W && box.clientHeight === H) return;
        W = box.clientWidth;
        H = box.clientHeight;
        placeWalls();
        // pull any label that ended up outside back into the box
        items.forEach(({ body, w }) => {
          const x = Math.min(Math.max(body.position.x, w / 2), W - w / 2);
          const y = Math.min(body.position.y, H - floorInset - 20);
          Body.setPosition(body, { x, y });
        });
        wake();
      }).observe(box);
    }
  }
})();
