/* Cricboy life: what happens off the field. Random life events between matches (3-5 a season), legacy unlocks that
   carry over between careers, captaincy records, and county-stint offers. Effects are applied to hidden attributes and
   short-term form; the UI only ever shows them as vague chips, never numbers. */
(function (G) {
  'use strict';
  const CB = G.CB = G.CB || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pick = (r, a) => a[Math.floor(r() * a.length)];

  // ---------------------------------------------------------------- legacy unlocks (persist across careers)
  CB.UNLOCKS = [
    { id: 'runmachine', name: 'Run Machine', icon: '🏭', need: '20 Test hundreds', test: p => p.st.test.h100 >= 20,
      desc: 'Born to bat long: +4 batting potential from day one.' },
    { id: 'whisperer', name: 'Wicket Whisperer', icon: '🪄', need: '300 Test wickets', test: p => p.st.test.w >= 300,
      desc: 'The ball talks to you: +4 bowling potential from day one.' },
    { id: 'prodigy', name: 'Attacking Prodigy', icon: '💥', need: '75 Test sixes', test: p => p.st.test.f6 >= 75,
      desc: 'Fearless strokemaker: +10 attacking potential, a head start and extra power.' },
    { id: 'ironman', name: 'Iron Constitution', icon: '🦾', need: '100 Test caps', test: p => p.st.test.m >= 100,
      desc: 'Rarely breaks down: +6 fitness and stamina potential, far fewer injuries.' },
    { id: 'leader', name: 'Born Leader', icon: '👑', need: 'Captain Australia in 25 Tests', test: p => ((p.captRec || {}).test || {}).m >= 25,
      desc: '+8 mental potential, selectors trust you, and the armband comes years sooner.' },
  ];
  const UKEY = 'cricboy.unlocks.v1';
  const hasLS = () => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } };
  CB.getUnlocks = () => { if (!hasLS()) return {}; try { return JSON.parse(localStorage.getItem(UKEY) || '{}'); } catch (e) { return {}; } };
  CB.checkUnlocks = function (W, p) {
    if (!hasLS()) return [];
    const u = CB.getUnlocks(), fresh = [];
    for (const x of CB.UNLOCKS) if (!u[x.id] && x.test(p)) { u[x.id] = { by: p.first + ' ' + p.last, y: W.season.year }; fresh.push(x); }
    if (fresh.length) { try { localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) { } }
    return fresh;
  };
  const bump = (p, keys, cap, now) => { for (const k of keys) { p.caps[k] = clamp(p.caps[k] + cap, 0, 99); p.a[k] = clamp(p.a[k] + now, 0, 99); } };
  CB.applyLegacy = function (p, id) {
    if (!id) return;
    p.legacy = id;
    if (id === 'runmachine') bump(p, ['DEF', 'PACE', 'SPIN', 'CON'], 4, 2);
    if (id === 'whisperer') { bump(p, ['ACC', 'STK', 'CRA'], 4, 2); if (!p.bowls) { p.bowls = true; p.sub = p.sub || 'swing'; } }
    if (id === 'prodigy') { bump(p, ['ATT'], 10, 6); p.power = +(p.power + 0.3).toFixed(2); }
    if (id === 'ironman') { bump(p, ['FIT', 'STA'], 6, 4); p.injury = +(p.injury * 0.7).toFixed(2); }
    if (id === 'leader') { bump(p, ['MEN'], 8, 6); p.bias = 1.5; }
    CB.refresh(p);
  };

  // ---------------------------------------------------------------- captaincy record
  CB.recordCaptaincy = function (W, U, p, ev) {
    if (!U.captain || (U.level !== 'shield' && U.level !== 'test')) return;
    p.captRec = p.captRec || {};
    const c = p.captRec[U.level] || (p.captRec[U.level] = { m: 0, w: 0, d: 0, l: 0 });
    const M = U.M;
    c.m++; if (M.result.draw || M.result.tie) c.d++; else if (M.result.winner === U.ti) c.w++; else c.l++;
    if (c.m === 1) ev.push({ type: 'milestone', key: 'capt-' + U.level, text: U.level === 'test' ? `First Test as Australian captain${p.capTestNo ? ' (no. ' + p.capTestNo + ')' : ''}` : `First match as ${CB.stateById(p.team).name} captain` });
    if (U.level === 'test' && U.slot && W.season.series[U.slot.series]) W.season.series[U.slot.series].ucapt = true;
  };
  // the armband weighs on some and lifts others (mental game)
  CB.captainMod = p => 0.0025 * (55 - p.a.MEN);

  // ---------------------------------------------------------------- life events
  // fx: form {bat, bowl, n} (bat > 0 = harder to bat; bowl > 0 = more wickets) | energy n | attr {K: d} | cap {K: d}
  //     bias d (selectors) | fame d | inj n (miss games) | rest n | perk true
  const BAT = p => ['open', 'top', 'mid', 'wk', 'ar'].includes(p.role);
  const BOWL = p => !!p.bowls && (p.role === 'pace' || p.role === 'spin' || p.role === 'ar');
  const LVL = (W, p) => CB.userLevel(W, p);
  CB.LIFE = [
    { id: 'nightout', icon: '🍻', title: 'Team night out', when: () => true,
      text: () => 'The boys are heading into town to celebrate. Your phone keeps buzzing.',
      options: [
        { t: 'Go big', roll: [{ p: 0.55, fx: { bias: 1, fame: 1 }, out: 'Legendary night. The senior players love you now.' }, { p: 0.45, fx: { form: { bat: 0.08, bowl: -0.06, n: 1 }, energy: -1 }, out: 'You wake up on a mate\'s couch. Next match is going to hurt.' }] },
        { t: 'One drink, then home', fx: { bias: 0.4 }, out: 'Showed your face, kept your head. Sensible.' },
        { t: 'Stay in, ice bath, early night', fx: { rest: 1, energy: 1 }, out: 'Fresh as a daisy. Slightly boring.' }] },
    { id: 'sponsor', icon: '🏏', title: 'Bat sponsor calling', when: (W, p) => LVL(W, p) !== 'seconds' || p.fame >= 2,
      text: () => 'A bat company wants your face on their posters. The photo shoot is on a training day.',
      options: [
        { t: 'Sign. Smile for the camera', fx: { fame: 2, energy: -1 }, out: 'You\'re on a billboard in your home town. Training suffered a bit.' },
        { t: 'Ask them to shoot on a rest day', roll: [{ p: 0.6, fx: { fame: 1 }, out: 'They agreed. Win-win.' }, { p: 0.4, fx: {}, out: 'They signed someone else.' }] },
        { t: 'Not interested. Cricket first', fx: { attr: { MEN: 0.8 } }, out: 'Coach noticed. "That\'s the right attitude."' }] },
    { id: 'interview', icon: '🎤', title: 'Microphone in your face', when: (W, p) => LVL(W, p) !== 'seconds',
      text: () => 'A journalist asks if the selectors have got it wrong with the current XI.',
      options: [
        { t: 'Back your mates, say nothing', fx: { bias: 0.6 }, out: 'Bland, safe, and the selectors liked it.' },
        { t: 'Honest: "I deserve a spot"', roll: [{ p: 0.5, fx: { bias: 1.2, fame: 1 }, out: 'Bold. The headline worked in your favour.' }, { p: 0.5, fx: { bias: -1.2, fame: 1 }, out: 'The chairman of selectors was not amused.' }] },
        { t: 'Crack a joke', fx: { fame: 1 }, out: 'It went viral. Nobody remembers the question.' }] },
    { id: 'technique', icon: '🛠️', title: 'Technical overhaul?', when: (W, p) => BAT(p) && p.age <= 30,
      text: () => 'The batting coach wants to change your trigger movement. "Short-term pain, long-term gain."',
      options: [
        { t: 'Rebuild it properly', fx: { form: { bat: 0.1, n: 2 }, cap: { DEF: 1.5, PACE: 1 } }, out: 'Feels awful in the nets. But something is there.' },
        { t: 'Small tweak only', fx: { attr: { DEF: 0.8 } }, out: 'A little tidier. No drama.' },
        { t: 'If it ain\'t broke…', fx: { attr: { CON: 0.5 } }, out: 'You trust what got you here.' }] },
    { id: 'action', icon: '🌀', title: 'Remodel your action?', when: (W, p) => BOWL(p) && p.age <= 31,
      text: p => 'A biomechanist reckons your action is costing you ' + (CB.isSpinner(p) ? 'revs' : 'pace') + '. Rebuilding it means a few rough weeks.',
      options: [
        { t: 'Rebuild it', fx: { form: { bowl: -0.1, n: 2 }, cap: { STK: 2 } }, out: 'Your first spell back was all over the place. Long game.' },
        { t: 'Work on accuracy instead', fx: { attr: { ACC: 1 } }, out: 'Hitting the top of off more often already.' },
        { t: 'Leave it alone', fx: { rest: 1 }, out: 'Fine. Your shoulder thanks you.' }] },
    { id: 'niggle', icon: '🩹', title: 'A niggle', when: () => true,
      text: p => 'Your ' + (p.bowls && !CB.isSpinner(p) ? 'side' : 'hamstring') + ' is tight. The physio says it could be nothing. Could be something.',
      options: [
        { t: 'Rest a game', fx: { inj: 1, rest: 2 }, out: 'You sit one out. Fully fit after.' },
        { t: 'Strap it and play', roll: [{ p: 0.7, fx: {}, out: 'Held up fine.' }, { p: 0.3, fx: { inj: 2 }, out: 'It went. You\'re out for a couple of games.' }] },
        { t: 'Extra rehab sessions', fx: { energy: -1, attr: { FIT: 1 } }, out: 'Hours with the physio. Stronger for it.' }] },
    { id: 'club', icon: '🏟️', title: 'Your old club needs you', when: (W, p) => LVL(W, p) !== 'test',
      text: () => 'Grade cricket this weekend: your junior club is short of players for a big game.',
      options: [
        { t: 'Turn out for them', roll: [{ p: 0.6, fx: { form: { bat: -0.06, bowl: 0.04, n: 1 }, fame: 1 }, out: 'You smash it. Confidence high, locals adore you.' }, { p: 0.4, fx: { energy: -1 }, out: 'Got a duck on a goat track. Tired legs too.' }] },
        { t: 'Run a clinic for their juniors instead', fx: { fame: 1, attr: { MEN: 0.5 } }, out: 'Thirty kids now want to be you.' },
        { t: 'Rest', fx: { energy: 1 }, out: 'Feet up.' }] },
    { id: 'legend', icon: '🧓', title: 'A legend in the nets', when: () => true,
      text: () => 'A former Australian great is at training and offers to spend an hour with you.',
      options: [
        { t: 'Ask about the mental side', fx: { attr: { MEN: 1.2 }, cap: { MEN: 1 } }, out: '"It\'s all between the ears, son." It stuck.' },
        { t: 'Ask about technique', fx: {}, out: 'One tiny tip. It changes everything.' },
        { t: 'Too shy. Watch from a distance', fx: {}, out: 'You regret it on the drive home.' }] },
    { id: 'trolls', icon: '📱', title: 'Social media pile-on', when: (W, p) => p.lastMatch && p.lastMatch.quiet,
      text: () => 'After a quiet game, the replies are brutal. Someone made a meme.',
      options: [
        { t: 'Fire back', roll: [{ p: 0.3, fx: { fame: 2 }, out: 'Your comeback was funnier than the meme. Fans love it.' }, { p: 0.7, fx: { bias: -0.8, form: { bat: 0.04, n: 1 } }, out: 'Bad idea. It\'s a story now.' }] },
        { t: 'Delete the app for a week', fx: { attr: { MEN: 1 } }, out: 'Quieter head. Better sleep.' },
        { t: 'Use it as fuel', fx: { form: { bat: -0.05, bowl: 0.04, n: 1 } }, out: 'You\'ve screenshotted it. Wait till next game.' }] },
    { id: 'wedding', icon: '💒', title: 'Family wedding', when: () => true,
      text: () => 'Your cousin is getting married on the rest day. It\'s a six-hour round trip.',
      options: [
        { t: 'Go. Family first', fx: { energy: -1, attr: { MEN: 0.6 } }, out: 'Grandma cried. You danced. Worth it.' },
        { t: 'Video call in', fx: { bias: 0.3 }, out: 'You missed the cake. Stayed on top of training.' }] },
    { id: 'uni', icon: '🎓', title: 'Exams vs nets', when: (W, p) => p.age <= 21,
      text: () => 'Uni exams clash with extra net sessions. Your mum has opinions.',
      options: [
        { t: 'Study. Backup plans matter', fx: { energy: -1, attr: { MEN: 0.8 } }, out: 'Passed. Brain tired.' },
        { t: 'Defer and go all in on cricket', fx: { energy: 1, bias: 0.4 }, out: 'Mum is disappointed. The coach is thrilled.' }] },
    { id: 'job', icon: '🧰', title: 'Part-time job', when: (W, p) => LVL(W, p) === 'seconds' && p.age <= 24,
      text: () => 'Second XI money doesn\'t pay rent. A mate offers you shifts on his landscaping crew.',
      options: [
        { t: 'Take the shifts', fx: { energy: -1, attr: { FIT: 1, STA: 0.8 } }, out: 'Hard yakka. Your shoulders are huge now.' },
        { t: 'Live on noodles, train full-time', fx: { energy: 1 }, out: 'Two-minute noodles, again. But you\'re in the nets every day.' }] },
    { id: 'beep', icon: '⏱️', title: 'Pre-season fitness test', when: () => true,
      text: () => 'The dreaded yo-yo test is on Monday. Selectors look at the numbers.',
      options: [
        { t: 'Train like a maniac all weekend', roll: [{ p: 0.7, fx: { bias: 0.8, attr: { FIT: 0.8 } }, out: 'Top three in the squad. Noted.' }, { p: 0.3, fx: { inj: 1 }, out: 'Pulled a hammy in the final shuttle.' }] },
        { t: 'Steady prep', fx: { attr: { FIT: 0.5 } }, out: 'Middle of the pack. Nobody noticed. That\'s fine.' }] },
    { id: 'rival', icon: '🗯️', title: 'A rival mouths off', when: (W, p) => LVL(W, p) !== 'seconds',
      text: () => 'An opponent told a podcast you "can\'t handle the short ball". You play them next.',
      options: [
        { t: 'Let the bat do the talking', fx: { form: { bat: -0.05, bowl: 0.04, n: 1 }, attr: { CON: 0.5 } }, out: 'Laser focus.' },
        { t: 'Hit back in the papers', roll: [{ p: 0.5, fx: { fame: 2 }, out: 'The rivalry is now a thing. Ratings!' }, { p: 0.5, fx: { form: { bat: 0.06, n: 1 } }, out: 'You\'ve made it personal. Now you have to deliver.' }] },
        { t: 'Laugh it off', fx: { attr: { MEN: 0.5 } }, out: 'Water off a duck\'s back.' }] },
    { id: 'charity', icon: '🎗️', title: 'Charity match', when: (W, p) => p.fame >= 1 || LVL(W, p) !== 'seconds',
      text: () => 'A children\'s hospital fundraiser wants you to bat in fancy dress.',
      options: [
        { t: 'Absolutely. Bring the costume', fx: { fame: 2, energy: -1 }, out: 'You batted as a banana. Raised $40k.' },
        { t: 'Donate a signed bat instead', fx: { fame: 1 }, out: 'Kind and low-key.' }] },
    { id: 'newbat', icon: '🪵', title: 'A new bat', when: (W, p) => BAT(p),
      text: () => 'Your favourite bat has cracked. The new one feels heavier and pings off the middle.',
      options: [
        { t: 'Use it straight away', fx: { attr: { ATT: 0.8 } }, out: 'The ball flies. You feel unstoppable.' },
        { t: 'Glue the old one, keep it for match days', fx: { attr: { CON: 0.6 } }, out: 'Superstition wins. Feels right.' }] },
    { id: 't20', icon: '💰', title: 'Overseas T20 offer', when: (W, p) => LVL(W, p) !== 'seconds' && p.age >= 21,
      text: () => 'A franchise league in the Gulf offers good money for a fortnight. It clashes with training camp.',
      options: [
        { t: 'Take the money', fx: { fame: 1, bias: -1, attr: { ATT: 1 } }, out: 'Fun, flashy, and your red-ball coach is grumpy.' },
        { t: 'Decline. Red ball is the dream', fx: { bias: 1 }, out: 'The selectors were quietly impressed.' }] },
    { id: 'meditate', icon: '🧘', title: 'The team psychologist', when: () => true,
      text: () => 'The squad psych suggests daily visualisation sessions.',
      options: [
        { t: 'Commit to it', fx: { attr: { MEN: 1, CON: 0.6 } }, out: 'Calmer at the crease already.' },
        { t: 'Not my thing', fx: {}, out: 'Fair enough.' }] },
    { id: 'icebath', icon: '🧊', title: 'Recovery protocol', when: (W, p) => p.age >= 24,
      text: () => 'Sports science want you on a new recovery program: ice baths, sleep tracking, no late nights.',
      options: [
        { t: 'Full buy-in', fx: { attr: { FIT: 1 }, rest: 1 }, out: 'Your body feels five years younger.' },
        { t: 'Half-hearted', fx: { attr: { FIT: 0.3 } }, out: 'Some ice baths. Some late nights.' }] },
    { id: 'mystery', icon: '🎭', title: 'A mystery spinner in the nets', when: (W, p) => BAT(p),
      text: () => 'A teenager with a weird action is bowling in the nets. Nobody can read him.',
      options: [
        { t: 'Face him for an hour', fx: { attr: { SPIN: 1.2 } }, out: 'Bamboozled at first. Then you started picking him.' },
        { t: 'Stick to your routine', fx: { attr: { DEF: 0.4 } }, out: 'Routine is king.' }] },
    { id: 'tailbat', icon: '🛡️', title: 'Batting homework', when: (W, p) => p.role === 'pace' || p.role === 'spin',
      text: () => 'The coach wants his bowlers to add runs. Extra batting sessions after bowling?',
      options: [
        { t: 'Yes. Every run counts', fx: { attr: { DEF: 1.2, ATT: 0.6 }, energy: -1 }, out: 'You\'re starting to look like a proper No. 8.' },
        { t: 'My job is wickets', fx: { attr: { ACC: 0.5 } }, out: 'Focused. Single-minded.' }] },
    { id: 'foodpoison', icon: '🤢', title: 'Dodgy prawns', when: () => true,
      text: () => 'Team dinner. The prawns were questionable. You feel awful the morning of travel.',
      options: [
        { t: 'Tough it out', fx: { form: { bat: 0.06, bowl: -0.05, n: 1 } }, out: 'Grim. You got through it.' },
        { t: 'Tell the doctor', roll: [{ p: 0.5, fx: { inj: 1 }, out: 'Doctor orders: you sit out a game.' }, { p: 0.5, fx: { rest: 1 }, out: 'A drip and a nap. Good as new.' }] }] },
    { id: 'contract', icon: '✍️', title: 'Contract talks', when: (W, p) => LVL(W, p) !== 'seconds' && p.age >= 22,
      text: p => CB.stateById(p.team).name + ' offer you a new deal. Your manager says hold out for more.',
      options: [
        { t: 'Sign on the spot', fx: { bias: 0.8 }, out: 'Loyal. The state appreciates it.' },
        { t: 'Hold out', roll: [{ p: 0.6, fx: { fame: 1 }, out: 'You got the bump. Some resentment in the rooms.' }, { p: 0.4, fx: { bias: -1 }, out: 'Talks dragged on. Selectors noticed the distraction.' }] }] },
    { id: 'camp', icon: '⛺', title: 'National camp invite', when: (W, p) => LVL(W, p) === 'shield',
      text: () => 'You\'re invited to the national high-performance camp in Brisbane.',
      options: [
        { t: 'Go and soak it up', fx: { bias: 1.2, attr: { MEN: 0.6 }, energy: -1 }, out: 'Facing Test quicks in the nets. Eye-opening.' },
        { t: 'Ask to defer (you\'re in form)', fx: { form: { bat: -0.04, bowl: 0.03, n: 1 } }, out: 'Kept your rhythm. Not everyone liked it.' }] },
    { id: 'doghouse', icon: '🐶', title: 'Late to the bus', when: () => true,
      text: () => 'Your alarm didn\'t go off. The team bus left five minutes ago.',
      options: [
        { t: 'Own it, apologise to the group', fx: { bias: 0.2 }, out: 'Push-ups for the squad. Forgiven.' },
        { t: 'Blame the hotel', fx: { bias: -0.8 }, out: 'Nobody believes you. Fines committee is thrilled.' }] },
    { id: 'heat', icon: '🌡️', title: 'Heatwave', when: () => true,
      text: () => 'It\'s going to be 41 degrees. The physio suggests extra hydration work and lighter training.',
      options: [
        { t: 'Follow the plan', fx: { rest: 1 }, out: 'You stay cool. Others cramp.' },
        { t: 'Train through it, toughen up', fx: { attr: { STA: 0.8 }, energy: -1 }, out: 'Brutal. Stronger for it.' }] },
  ];
  // per-player specials: the technique tip goes to your main discipline
  CB.LIFE.find(e => e.id === 'legend').options[1].fxFor = p => ({ attr: BAT(p) ? { DEF: 1.2 } : { ACC: 1.2 } });

  CB.seasonStartCareer = function (W) {
    const p = W.userId && W.players[W.userId]; if (!p) return;
    const r = CB.rngFor(W);
    p.lifeLeft = 3 + Math.floor(r() * 3);
    p.lifeSeen = [];
    W.season.countyOffered = false;
  };
  // remaining user games this season (rough), for spreading 3-5 events across it
  function remainingGames(W, p) {
    const S = W.season, inTests = W.aus.xi.includes(p.id);
    return S.slots.slice(S.cursor).filter(s => s.type === 'dom' || s.type === 'county' || (s.type === 'test' && inTests)).length + 1;
  }
  CB.maybeLifeEvent = function (W) {
    const p = CB.user(W); if (!p) return null;
    if (p.lifeLeft == null) CB.seasonStartCareer(W);
    if (!p.lifeLeft) return null;
    const r = CB.rngFor(W);
    const prob = Math.min(1, p.lifeLeft / Math.max(1, remainingGames(W, p)) * 1.15);
    if (r() > prob) return null;
    const pool = CB.LIFE.filter(e => !p.lifeSeen.includes(e.id) && (!e.when || e.when(W, p)) && (!p.lifeRecent || !p.lifeRecent.includes(e.id)));
    if (!pool.length) return null;
    const e = pick(r, pool);
    p.lifeLeft--; p.lifeSeen.push(e.id);
    p.lifeRecent = (p.lifeRecent || []).concat(e.id).slice(-8);   // avoid repeating last season's stories
    return { id: e.id, icon: e.icon, title: e.title, text: e.text(p, W), options: e.options.map(o => o.t) };
  };
  CB.resolveLifeEvent = function (W, id, choice) {
    const p = CB.user(W), e = CB.LIFE.find(x => x.id === id), o = e.options[choice], r = CB.rngFor(W);
    let fx = o.fxFor ? o.fxFor(p) : o.fx, out = o.out;
    if (o.roll) { let u = r(); for (const x of o.roll) { u -= x.p; if (u <= 0 || x === o.roll[o.roll.length - 1]) { fx = x.fx; out = x.out; break; } } }
    const chips = CB.applyFx(p, fx || {});
    p.lifeLog = (p.lifeLog || []).concat({ y: W.season.year, t: e.title, c: o.t }).slice(-40);
    return { out, chips };
  };
  CB.applyFx = function (p, fx) {
    const chips = [];
    if (fx.form) {
      p.form = { bat: (fx.form.bat || 0), bowl: (fx.form.bowl || 0), n: fx.form.n || 1 };
      const good = (fx.form.bat || 0) < 0 || (fx.form.bowl || 0) > 0;
      chips.push(good ? `🔥 Confidence up (next ${p.form.n > 1 ? p.form.n + ' games' : 'game'})` : `📉 Off your game (next ${p.form.n > 1 ? p.form.n + ' games' : 'game'})`);
    }
    if (fx.energy) { p.energyBonus = (p.energyBonus || 0) + fx.energy; chips.push(fx.energy > 0 ? '⚡ +1 energy next session' : '🪫 -1 energy next session'); }
    if (fx.attr) for (const [k, d] of Object.entries(fx.attr)) { p.a[k] = clamp(p.a[k] + d, 0, 100); chips.push(chipFor(k, d)); }
    if (fx.cap) for (const [k, d] of Object.entries(fx.cap)) { p.caps[k] = clamp(p.caps[k] + d, 0, 99); chips.push('🌱 New ceiling: ' + nameFor(k, p)); }
    if (fx.bias) { p.bias = clamp((p.bias || 0) + fx.bias, -4, 4); chips.push(fx.bias > 0 ? '📋 Selectors noticed' : '📋 Selectors unimpressed'); }
    if (fx.fame) { p.fame = (p.fame || 0) + fx.fame; chips.push('⭐ Profile up'); }
    if (fx.inj) { p.inj = Math.max(p.inj || 0, fx.inj); p.injName = p.injName || 'precaution'; chips.push(`🩹 Miss ${fx.inj} game${fx.inj > 1 ? 's' : ''}`); }
    if (fx.rest) { p.rest = (p.rest || 0) + fx.rest; chips.push('🛌 Fresher body'); }
    CB.refresh(p);
    return chips.filter(Boolean);
  };
  function nameFor(k, p) { const f = CB.FOCUS.find(x => x.id === k); return f ? CB.focusLabel(f, p).name.toLowerCase() : k; }
  function chipFor(k, d) { const f = CB.FOCUS.find(x => x.id === k); return (f ? f.icon + ' ' + f.name : k) + (d > 0 ? ' ↑' : ' ↓'); }

  // ---------------------------------------------------------------- county stint offers
  // After the Shield season, a state regular who isn't in the Test side may be wanted by a county.
  CB.countyOfferDue = function (W) {
    const p = CB.user(W), S = W.season; if (!p || S.countyOffered || W.county) return null;
    const next = S.slots[S.cursor];
    const shieldLeft = S.slots.slice(S.cursor).some(s => s.type === 'dom');
    if (!next || shieldLeft || next.day < 175) return null;
    if (W.aus.xi.includes(p.id) && S.series.some(s => s.tag === 'winter')) return null;   // touring with Australia
    S.countyOffered = true;
    const played = p.history.filter(h => h.y === S.year && (h.lv === 'shield' || h.lv === 'test')).length;
    if (p.age < 19 || p.age > 35 || played < 3) return null;
    const r = CB.rngFor(W);
    if (r() > 0.7) return null;
    const cs = CB.COUNTIES.slice().sort(() => r() - 0.5).slice(0, 2);
    return { counties: cs.map(c => c.id) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
