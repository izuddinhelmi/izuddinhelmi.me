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
  // A slide's video plays with sound only while it's the active slide and the Lab is on screen.
  // Browsers keep sound off until the visitor has clicked, tapped or pressed a key somewhere.
  const videos = slides.map((s) => s.querySelector('video'));
  let active = 0, labOnScreen = false, interacted = false, wantsSound = true;
  const soundBtns = slides.map((s) => s.querySelector('.lab__sound'));
  const voice = () => videos.forEach((v, j) => {
    if (!v) return;
    const on = interacted && wantsSound && labOnScreen && j === active;
    v.muted = !on;
    if (on) { v.volume = 0.6; v.play().catch(() => {}); }
    const btn = soundBtns[j];
    if (btn) {
      btn.setAttribute('aria-pressed', String(!v.muted));
      btn.setAttribute('aria-label', v.muted ? 'Turn sound on' : 'Turn sound off');
    }
  });
  // The speaker button turns that video's sound on or off (its click also counts as the unlock gesture)
  soundBtns.forEach((btn, j) => btn?.addEventListener('click', () => {
    const v = videos[j];
    interacted = true;
    wantsSound = v.muted;
    if (wantsSound) { active = j; labOnScreen = true; }
    voice();
  }));
  ['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, (e) => {
    if (e.target.closest?.('.lab__sound')) return; // the speaker button handles its own click
    if (!interacted) { interacted = true; voice(); }
  }, { capture: true, passive: true }));
  new IntersectionObserver(([e]) => { labOnScreen = e.isIntersecting; voice(); }, { threshold: 0.5 })
    .observe(track);

  const sync = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const i = atEnd ? slides.length - 1 : current();
    if (count) count.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
    if (prevBtn) prevBtn.disabled = track.scrollLeft <= 2;
    if (nextBtn) nextBtn.disabled = atEnd;
    if (i !== active) { active = i; voice(); }
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

// Lab videos load only when their card scrolls into view, and pause while it's off screen (phones get the 720p copy)
const phone = window.matchMedia('(max-width: 700px)');
const lazyVideos = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
  if (!isIntersecting) { v.pause(); return; }
  if (!v.getAttribute('src')) v.src = (phone.matches && v.dataset.srcPhone) || v.dataset.src;
  v.play().catch(() => {});
}), { threshold: 0.1 });
document.querySelectorAll('video[data-src]').forEach((v) => lazyVideos.observe(v));

// TaubatApp traction, live from taubat.app (cached there for about a minute).
// The numbers in the HTML are the fallback if the request fails or is slow.
const stats = document.querySelector('.lab__stats');
if (stats) {
  const compact = (n, plus) => n >= 1000
    ? `${(Math.floor(n / 100) / 10).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k${plus ? '+' : ''}`
    : `${n}${plus ? '+' : ''}`;
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5000);
  fetch('https://www.taubat.app/api/v1/traction', { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(({ downloads, daily_users: daily }) => {
      if (!Number.isFinite(downloads) || !Number.isFinite(daily) || downloads <= 0 || daily <= 0) return;
      stats.querySelector('[data-stat="downloads"]').textContent = compact(downloads, true);
      stats.querySelector('[data-stat="daily_users"]').textContent = compact(daily, false);
      stats.setAttribute('aria-label', `TaubatApp: ${downloads.toLocaleString('en')} downloads, ${daily.toLocaleString('en')} daily users`);
    })
    .catch(() => {});
}

// Floating phones: give each its own drift, speed and starting point so they never move in step
document.querySelectorAll('.lab__frame--phones .phone').forEach((phone) => {
  const dur = 4.5 + Math.random() * 3.5; // seconds per rise or fall
  phone.style.setProperty('--dur', `${dur.toFixed(2)}s`);
  phone.style.setProperty('--delay', `${(-Math.random() * dur * 2).toFixed(2)}s`);
  phone.style.setProperty('--float', `${(11 + Math.random() * 6).toFixed(1)}px`);
});
// ...and arrive one by one once their screenshots have loaded and the card is on screen
document.querySelectorAll('.lab__frame--phones').forEach((frame) => {
  const imgs = [...frame.querySelectorAll('img')];
  const loaded = Promise.all(imgs.map((img) => (img.complete ? null : img.decode().catch(() => {}))));
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    loaded.then(() => frame.classList.add('is-in'));
  }, { threshold: 0.15 }).observe(frame);
});

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
  let ctx = null, buffer = null, decoding = null;
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
    // Decode once: decodeAudioData detaches the ArrayBuffer, so a second call would throw
    decoding = decoding || raw.then((ab) => ab && ctx.decodeAudioData(ab)).then((b) => { if (b) buffer = b; }).catch(() => {});
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
  // Plays when a card lands (scrolling down) and when it lifts off again (scrolling up)
  const check = () => {
    let changed = false;
    cards.forEach((card, i) => {
      if (i === 0) return; // the first card doesn't slide over anything
      const top = parseFloat(getComputedStyle(card).top) || 0;
      const isLanded = card.getBoundingClientRect().top <= top + 1;
      if (isLanded !== landed[i]) changed = true;
      landed[i] = isLanded;
    });
    if (changed) play(); // once per frame, even if a fast scroll moves several cards
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
