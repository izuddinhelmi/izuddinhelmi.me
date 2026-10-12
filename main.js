// Kuala Lumpur local time in the footer
const klTime = document.getElementById('kl-time');
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' });
const tick = () => { if (klTime) klTime.textContent = fmt.format(new Date()); };
tick();
setInterval(tick, 30_000);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Lab showcase: prev/next buttons, counter, and mouse drag-to-scroll
const track = document.querySelector('.lab__track');
if (track) {
  const slides = [...track.children];
  const count = document.querySelector('.lab__count');
  const [prevBtn, nextBtn] = document.querySelectorAll('.lab__btn');
  const pad = (n) => String(n).padStart(2, '0');
  const step = () => slides[0].getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
  const current = () => Math.min(slides.length - 1, Math.round(track.scrollLeft / step()));
  const sync = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const i = atEnd ? slides.length - 1 : current();
    if (count) count.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
    if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
    if (nextBtn) nextBtn.disabled = atEnd;
  };
  const behavior = reduceMotion ? 'auto' : 'smooth';
  [prevBtn, nextBtn].forEach((btn) => btn?.addEventListener('click', () => {
    track.scrollTo({ left: (current() + Number(btn.dataset.dir)) * step(), behavior });
  }));
  track.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  sync();

  // Drag with a mouse; touch and trackpads already scroll natively
  let startX = 0, startLeft = 0, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    startX = e.clientX; startLeft = track.scrollLeft; moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) { moved = true; track.classList.add('is-dragging'); }
      if (moved) track.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      if (moved) {
        track.classList.remove('is-dragging');
        track.scrollTo({ left: current() * step(), behavior });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  });
  // Swallow the click that ends a drag so it doesn't open the project
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); moved = false; } }, true);
}

// Stacked cards: as the next card slides over, shrink and dim the one underneath
const cards = [...document.querySelectorAll('.card')];
if (!reduceMotion && cards.length > 1) {
  let ticking = false;
  const update = () => {
    ticking = false;
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      const top = parseFloat(getComputedStyle(card).top) || 0;
      const nextTop = parseFloat(getComputedStyle(next).top) || 0;
      const start = top + card.offsetHeight; // next card just entering under this one
      const end = nextTop;                    // next card fully stacked
      const y = next.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, (start - y) / (start - end)));
      card.style.transform = `scale(${1 - 0.06 * p})`;
      card.style.filter = `brightness(${1 - 0.22 * p})`;
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

// Paper "slide" sound each time a career card lands in its stacked position.
// Browsers only allow audio after a click, tap or key press, so we unlock on the very first one
// anywhere on the page, and show a small "Turn on sound" pill while Career is on screen.
if (cards.length) {
  const sfxUrl = 'assets/sfx/paper-slide.mp3';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, buffer = null;
  const raw = fetch(sfxUrl).then((r) => r.arrayBuffer()).catch(() => null); // preload now
  const pill = document.querySelector('.sound-pill');
  const gestures = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend'];
  const ready = () => ctx && ctx.state === 'running';

  const play = () => {
    if (!ready() || !buffer) return;
    const src = ctx.createBufferSource(); const gain = ctx.createGain();
    gain.gain.value = 0.3; src.buffer = buffer; src.connect(gain).connect(ctx.destination); src.start();
  };

  // Must run synchronously inside the gesture (iOS Safari needs a sound started right there)
  const unlock = () => {
    if (!AC) return;
    try {
      ctx = ctx || new AC();
      ctx.resume();
      const silent = ctx.createBufferSource(); silent.buffer = ctx.createBuffer(1, 1, 22050);
      silent.connect(ctx.destination); silent.start(0);
    } catch (e) { return; }
    if (!buffer) raw.then((ab) => ab && ctx.decodeAudioData(ab)).then((b) => { if (b) buffer = b; });
    setTimeout(() => {
      if (ready()) { gestures.forEach((t) => window.removeEventListener(t, unlock, true)); if (pill) pill.hidden = true; }
    }, 50);
  };
  gestures.forEach((t) => window.addEventListener(t, unlock, { capture: true, passive: true }));

  if (pill) {
    pill.addEventListener('click', () => { setTimeout(() => { play(); pill.hidden = true; }, 120); });
    const career = document.getElementById('career');
    new IntersectionObserver(([e]) => { pill.hidden = !e.isIntersecting || ready(); }, { threshold: 0.05 }).observe(career);
  }

  const landed = cards.map(() => false);
  const check = () => {
    cards.forEach((card, i) => {
      if (i === 0) return; // the first card doesn't slide over anything
      const top = parseFloat(getComputedStyle(card).top) || 0;
      const isLanded = card.getBoundingClientRect().top <= top + 1;
      if (isLanded && !landed[i]) play();
      landed[i] = isLanded;
    });
  };
  window.addEventListener('scroll', check, { passive: true });
  check();
}

// "Case study" cursor disc over project cards (fine pointers only)
const cursor = document.querySelector('.cursor');
if (cursor && window.matchMedia('(pointer: fine)').matches && !reduceMotion) {
  window.addEventListener('pointermove', (e) => {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  }, { passive: true });
  cards.forEach((card) => {
    card.addEventListener('pointerenter', () => cursor.classList.add('is-on'));
    card.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
    card.querySelectorAll('a').forEach((a) => {
      a.addEventListener('pointerenter', () => cursor.classList.remove('is-on'));
      a.addEventListener('pointerleave', () => cursor.classList.add('is-on'));
    });
  });
}
