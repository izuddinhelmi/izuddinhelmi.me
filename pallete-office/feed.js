// Pallet Office showcase: the Taubat.app team at work, scripted so it runs on any static host.
// The activity is modelled on what real Taubat.app sessions streamed into the office. Nothing
// here is live: no server, no hooks, no data leaves the page.
(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const levelFor = (xp) => Math.min(100, Math.floor(Math.sqrt(xp)) + 1);

  const SPECIES = {
    garchomp: { id: 445, name: 'Garchomp', type: 'dragon' },
    pikachu: { id: 25, name: 'Pikachu', type: 'electric' },
    charizard: { id: 6, name: 'Charizard', type: 'fire' },
    tyranitar: { id: 248, name: 'Tyranitar', type: 'rock' },
    bulbasaur: { id: 1, name: 'Bulbasaur', type: 'grass' },
    squirtle: { id: 7, name: 'Squirtle', type: 'water', swims: true },
  };
  // Helpers are the parent's own pre-evolutions.
  const BABIES = { garchomp: [[443, 'Gible'], [444, 'Gabite']], pikachu: [[172, 'Pichu']],
    charizard: [[4, 'Charmander'], [5, 'Charmeleon']], tyranitar: [[246, 'Larvitar'], [247, 'Pupitar']] };

  // Each task is a few real-looking steps. `end` is the moment it finishes on; `ask` waits for you
  // at the Pokémon Center first; `helpers` sends baby Pokémon to help.
  const TEAM = [
    { key: 'dashboard', project: 'Dashboard', room: 'taubat-product', line: 'garchomp', xp: 1140, tasks: [
      { title: 'Weekly active users chart', steps: [['editing', 'Editing RetentionChart.tsx'], ['running', 'Run the dashboard tests']], end: 'test-pass' },
      { title: 'Slow streak queries', helpers: [['Explore', [['reading', 'Reading queries/streaks.sql'], ['reading', 'Searching for N+1 queries']]],
        ['code-reviewer', [['reading', 'Reviewing api/users.ts'], ['reading', 'Reading the index usage report']]]],
        steps: [['editing', 'Editing streaks.sql'], ['running', 'Commit the faster streak query']], end: 'commit' },
      { title: 'Crash triage', steps: [['web', 'Checking Sentry for new issues'], ['reading', 'Reading the v2.4.1 crash report'], ['editing', 'Editing ErrorBoundary.tsx']], end: 'push' },
    ] },
    { key: 'landing', project: 'Landing Page', room: 'taubat-product', line: 'pikachu', xp: 623, tasks: [
      { title: 'Ramadan hero', steps: [['editing', 'Editing hero section copy'], ['editing', 'Editing index.html'], ['running', 'Run the Lighthouse audit']], end: 'test-pass' },
      { title: 'Publish', ask: 'Needs your OK: Deploy to production', steps: [['running', 'Push to main']], end: 'push' },
      { title: 'Memorize page', helpers: [['Explore', [['web', 'Checking every link on the page'], ['reading', 'Reading memorize.html']]]],
        steps: [['editing', 'Editing the memorize page layout'], ['running', 'Optimise the OG images']], end: 'commit' },
    ] },
    { key: 'ios', project: 'iOS', room: 'taubat-product', line: 'charizard', xp: 2370, tasks: [
      { title: 'Streak screen', helpers: [['Plan', [['planning', 'Planning the streak screen'], ['reading', 'Reading StreakStore.swift']]],
        ['Explore', [['web', 'Downloading the chosen Mobbin reference screens'], ['reading', 'Reading PrayerWidget.swift']]]],
        steps: [['editing', 'Editing StreakView.swift'], ['running', 'Build the iOS app']], end: 'commit' },
      { title: 'Qibla compass', steps: [['reading', 'Reading QiblaCompassView.swift'], ['running', 'Create an iPhone 17 simulator'], ['running', 'Run the XCTest suite']], end: 'test-pass' },
      { title: 'Release', steps: [['running', 'Show the largest simulators by name'], ['running', 'Archive build 2.5 (41)']], end: 'push' },
    ] },
    { key: 'android', project: 'Android', room: 'taubat-product', line: 'tyranitar', xp: 1585, tasks: [
      { title: 'Prayer alerts', steps: [['reading', 'Reading build.gradle.kts'], ['editing', 'Editing PrayerTimesScreen.kt'], ['running', 'Run the Gradle unit tests']], end: 'test-fail' },
      { title: 'Fix alerts', helpers: [['Explore', [['reading', 'Reading AlarmScheduler.kt'], ['reading', 'Searching for exact-alarm permission']]],
        ['general-purpose', [['editing', 'Editing NotificationChannels.kt'], ['running', 'Run the alarm tests']]]],
        steps: [['editing', 'Editing AlarmScheduler.kt'], ['running', 'Run the Gradle unit tests']], end: 'test-pass' },
      { title: 'Ship', steps: [['running', 'Assemble the release bundle'], ['running', 'Open a pull request']], end: 'pr' },
    ] },
    { key: 'support', project: 'Support', room: 'taubat-growth', line: 'bulbasaur', xp: 395, tasks: [
      { title: 'Inbox', steps: [['reading', 'Reading 14 new support emails'], ['editing', 'Drafting a reply about prayer alerts']], ask: 'Has a question for you: offer a refund?' },
      { title: 'Help centre', steps: [['web', 'Searching the help centre'], ['editing', 'Updating the notifications FAQ'], ['editing', 'Tagging 9 tickets as alert bugs']] },
    ] },
    { key: 'marketing', project: 'Marketing', room: 'taubat-growth', line: 'squirtle', xp: 896, tasks: [
      { title: 'Ramadan campaign', steps: [['web', 'Reading App Store reviews'], ['planning', 'Planning the Ramadan campaign'], ['editing', 'Drafting the launch email']] },
      { title: 'Social', ask: 'Needs your OK: Schedule 3 posts', steps: [['editing', 'Writing Threads posts for v2.5'], ['running', 'Resize the App Store screenshots']] },
    ] },
  ];

  // Real sessions run for a while before you look: give everyone a little history.
  const HISTORY = [
    ['ios', 'got the tests passing ✅', 'ship', 24], ['landing', 'pushed to the remote 🚀', 'ship', 19],
    ['dashboard', 'finished and is waiting for you', 'done', 15], ['android', 'committed some work 🎉', 'ship', 11],
    ['support', 'arrived at the office', 'join', 8], ['marketing', 'arrived at the office', 'join', 6],
  ];

  const MOMENT_LOG = {
    commit: ['committed some work 🎉', 'ship'], push: ['pushed to the remote 🚀', 'ship'], pr: ['opened a pull request 🎉', 'ship'],
    'test-pass': ['got the tests passing ✅', 'ship'], 'test-fail': ['saw some tests fail', 'error'],
  };

  const listeners = {};
  const emit = (type, data) => { for (const fn of listeners[type] ?? []) fn({ data: JSON.stringify(data) }); };
  const agents = new Map();
  const log = [];

  function view(a) {
    const s = a.species;
    return { id: a.id, parentId: a.parentId ?? null, offDuty: false, project: a.project, projectKey: a.projectKey, demo: false,
      label: a.label ?? null, provider: 'claude', shiny: false, species: { ...s, swims: !!s.swims, line: a.line },
      level: levelFor(a.xp), xp: a.xp, state: a.state, activity: a.activity, detail: a.detail, progressText: null,
      tool: null, since: a.since, updated: Date.now(), status: a.status ?? null, load: a.load ?? 0, needsYou: !!a.needsYou,
      todos: a.todos ?? null, recent: a.recent, counts: {} };
  }
  const publish = (a) => agents.has(a.id) && emit('agent', view(a));
  function say(a, text, kind) {
    const entry = { t: Date.now(), id: a.id, who: a.species.name, project: a.project, text, kind };
    log.unshift(entry); log.length = Math.min(log.length, 80);
    emit('log', entry);
  }
  function set(a, state, detail, extra = {}) {
    const activity = state === 'thinking' ? a.activity : state;
    if (a.state !== state) a.since = Date.now();
    Object.assign(a, { state, activity, detail, ...extra });
    if (detail && !['thinking', 'done', 'sleeping'].includes(state)) a.recent = [{ t: Date.now(), text: detail }, ...a.recent].slice(0, 10);
    publish(a);
  }
  const gain = (a, xp) => {
    const before = levelFor(a.xp);
    a.xp += xp;
    if (levelFor(a.xp) > before) say(a, `grew to Lv ${levelFor(a.xp)}!`, 'level');
  };
  function moment(a, kind) {
    emit('moment', { id: a.id, kind });
    if (MOMENT_LOG[kind]) say(a, ...MOMENT_LOG[kind]);
    a.status = kind === 'test-fail' ? 'hurt' : null;
  }

  async function helper(parent, [type, steps], n) {
    const [id, name] = BABIES[parent.line][n % BABIES[parent.line].length];
    const h = { id: `${parent.id}:${type}-${Date.now().toString(36)}-${n}`, parentId: parent.id, project: parent.project,
      projectKey: parent.projectKey, line: parent.line, label: type, species: { id, name, type: parent.species.type, swims: parent.species.swims },
      xp: 0, state: 'thinking', activity: 'reading', detail: null, since: Date.now(), recent: [] };
    agents.set(h.id, h);
    publish(h);
    say(h, `came to help (${type})`, 'join');
    await sleep(rand(1500, 2500));
    for (const [state, detail] of steps) { set(h, state, detail); await sleep(rand(3500, 5500)); }
    set(h, 'leaving', 'Reporting back');
    say(h, 'reported back', 'leave');
    gain(parent, 2);
    await sleep(2600);
    agents.delete(h.id);
    emit('remove', { id: h.id, handoff: false });
  }

  async function work(a, task, first) {
    a.todos = { done: 0, total: task.steps.length + (task.helpers ? 1 : 0) };
    if (!first) { set(a, 'thinking', null); await sleep(rand(1200, 2000)); } // the page opens mid-task
    let helping = Promise.resolve();
    if (task.helpers) {
      set(a, 'delegating', `Briefing ${task.helpers.length === 1 ? 'a helper' : `${task.helpers.length} helpers`}: ${task.title.toLowerCase()}`);
      await sleep(1200);
      helping = Promise.all(task.helpers.map((h, i) => sleep(i * 900).then(() => helper(a, h, i))));
      await sleep(rand(6000, 8000)); // stays with its helpers while they get going
      a.todos.done++;
    }
    for (const [state, detail] of task.steps) {
      set(a, state, detail, { load: (a.load ?? 0) + 6 });
      gain(a, 1);
      await sleep(rand(3500, 5000));
      a.todos.done++;
    }
    await helping;
    if (task.ask) {
      set(a, 'waiting', task.ask, { needsYou: true });
      say(a, task.ask.startsWith('Has a question') ? 'has a question for you' : `needs your OK: ${task.ask.split(': ')[1]}`, 'attention');
      await sleep(rand(7000, 9000));
      a.needsYou = false;
      emit('moment', { id: a.id, kind: 'heal' }); // you answered
    }
    if (task.end) moment(a, task.end);
    await sleep(1600);
  }

  async function run(a) {
    for (let round = 0; ; round++) {
      for (const [i, task] of a.tasks.entries()) {
        await work(a, task, round === 0 && i === 0);
        // Finished: back to you, then a breather in the chill area.
        set(a, 'done', null, { todos: null, load: 0 });
        say(a, 'finished and is waiting for you', 'done');
        gain(a, 5);
        await sleep(rand(5000, 9000));
        if (Math.random() < 0.3) { set(a, 'sleeping', 'Asleep until you need it'); await sleep(rand(6000, 12000)); }
      }
    }
  }

  function start() {
    const t0 = Date.now();
    for (const t of TEAM) {
      // Everyone is already busy with their first step when the page opens.
      const [state, detail] = t.tasks[0].helpers ? ['planning', `Planning: ${t.tasks[0].title.toLowerCase()}`] : t.tasks[0].steps[0];
      const a = { ...t, id: `showcase-${t.key}`, projectKey: `${t.room}/${t.key}`, species: SPECIES[t.line],
        state, activity: state, detail, since: t0 - rand(60_000, 900_000), recent: [{ t: t0 - 30_000, text: detail }] };
      agents.set(a.id, a);
    }
    for (const [key, text, kind, minsAgo] of HISTORY) {
      const a = agents.get(`showcase-${key}`);
      log.unshift({ t: t0 - minsAgo * 60_000, id: a.id, who: a.species.name, project: a.project, text, kind });
    }
    emit('open', {});
    emit('snapshot', { agents: [...agents.values()].map(view), log: [...log], lines: [], demo: false });
    for (const a of agents.values()) run(a);
  }

  window.PALLET_STATIC = {
    feed() {
      setTimeout(start, 0);
      return { addEventListener: (type, fn) => (listeners[type] ??= []).push(fn) };
    },
    sprite: (id, shiny) => `sprites/${id}${shiny ? 's' : ''}.gif`,
    cry: (id) => `cries/${id}.ogg`,
    rooms: {
      taubat: { name: 'Taubat.app Product', match: 'taubatproduct' },
      keluar: { name: 'Taubat.app Growth', match: 'taubatgrowth' },
    },
  };
})();
