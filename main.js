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
