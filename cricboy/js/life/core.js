/* Cricboy life events: the original set. Data only; the format is described in js/life.js. */
CB.addLife([
  { id: 'nightout', icon: '🍻', title: 'Team night out', who: 'any',
    text: 'The boys are heading into {city} to celebrate. Your phone keeps buzzing.',
    options: [
      { t: 'Go big', roll: [{ p: 0.55, fx: { bias: 1, fame: 1 }, out: 'Legendary night. The senior players love you now.' }, { p: 0.45, fx: { form: -1, energy: -1 }, out: 'You wake up on a mate\'s couch. Next match is going to hurt.' }] },
      { t: 'One drink, then home', fx: { bias: 0.4 }, out: 'Showed your face, kept your head. Sensible.' },
      { t: 'Stay in, ice bath, early night', fx: { rest: 1, energy: 1 }, out: 'Fresh as a daisy. Slightly boring.' }] },
  { id: 'sponsor', icon: '👟', title: 'Sponsor calling', who: 'any', lv: ['shield', 'test', 'county'],
    text: 'A sports brand wants your face on their posters. The photo shoot is on a training day.',
    options: [
      { t: 'Sign. Smile for the camera', fx: { fame: 2, energy: -1 }, out: 'You\'re on a billboard in {city}. Training suffered a bit.' },
      { t: 'Ask them to shoot on a rest day', roll: [{ p: 0.6, fx: { fame: 1 }, out: 'They agreed. Win-win.' }, { p: 0.4, fx: {}, out: 'They signed someone else.' }] },
      { t: 'Not interested. Cricket first', fx: { attr: { MEN: 0.8 } }, out: 'Your coach noticed. "That\'s the right attitude."' }] },
  { id: 'interview', icon: '🎤', title: 'Microphone in your face', who: 'any', lv: ['shield', 'test', 'county'],
    text: 'A journalist asks if the selectors have got it wrong with the current XI.',
    options: [
      { t: 'Back your mates, say nothing', fx: { bias: 0.6 }, out: 'Bland, safe, and the selectors liked it.' },
      { t: 'Honest: "I deserve a spot"', roll: [{ p: 0.5, fx: { bias: 1.2, fame: 1 }, out: 'Bold. The headline worked in your favour.' }, { p: 0.5, fx: { bias: -1.2, fame: 1 }, out: 'The chairman of selectors was not amused.' }] },
      { t: 'Crack a joke', fx: { fame: 1 }, out: 'It went viral. Nobody remembers the question.' }] },
  { id: 'technique', icon: '🛠️', title: 'Technical overhaul?', who: 'bat', age: [17, 30],
    text: 'The batting coach wants to change your trigger movement. "Short-term pain, long-term gain."',
    options: [
      { t: 'Rebuild it properly', fx: { form: { bat: 0.1, n: 2 }, cap: { DEF: 1.5, PACE: 1 } }, out: 'Feels awful in the nets. But something is there.' },
      { t: 'Small tweak only', fx: { attr: { DEF: 0.8 } }, out: 'A little tidier. No drama.' },
      { t: 'If it ain\'t broke…', fx: { attr: { CON: 0.5 } }, out: 'You trust what got you here.' }] },
  { id: 'action', icon: '🌀', title: 'Remodel your action?', who: 'bowl', age: [17, 31],
    text: 'A biomechanist reckons your action is costing you {weapon}. Rebuilding it means a few rough weeks.',
    options: [
      { t: 'Rebuild it', fx: { form: { bowl: -0.1, n: 2 }, cap: { STK: 2 } }, out: 'Your first spell back was all over the place. Long game.' },
      { t: 'Work on accuracy instead', fx: { attr: { ACC: 1 } }, out: 'Hitting the top of off more often already.' },
      { t: 'Leave it alone', fx: { rest: 1 }, out: 'Fine. Your shoulder thanks you.' }] },
  { id: 'niggle', icon: '🩹', title: 'A niggle', who: 'any',
    text: 'Your {niggle} is tight. The physio says it could be nothing. Could be something.',
    options: [
      { t: 'Rest a game', fx: { inj: 1, rest: 2 }, out: 'You sit one out. Fully fit after.' },
      { t: 'Strap it and play', roll: [{ p: 0.7, fx: {}, out: 'Held up fine.' }, { p: 0.3, fx: { inj: 2 }, out: 'It went. You\'re out for a couple of games.' }] },
      { t: 'Extra rehab sessions', fx: { energy: -1, attr: { FIT: 1 } }, out: 'Hours with the physio. Stronger for it.' }] },
  { id: 'club', icon: '🏟️', title: 'Your old club needs you', who: 'any', lv: ['seconds', 'shield'],
    text: 'Grade cricket this weekend: your junior club is short of players for a big game.',
    options: [
      { t: 'Turn out for them', roll: [{ p: 0.6, fx: { form: 1, fame: 1 }, out: 'You dominate. Confidence high, locals adore you.' }, { p: 0.4, fx: { energy: -1 }, out: 'A shocker on a goat track. Tired legs too.' }] },
      { t: 'Run a clinic for their juniors instead', fx: { fame: 1, attr: { MEN: 0.5 } }, out: 'Thirty kids now want to be you.' },
      { t: 'Rest', fx: { energy: 1 }, out: 'Feet up.' }] },
  { id: 'legend', icon: '🧓', title: 'A legend at training', who: 'any',
    text: 'A former Australian great is at training and offers to spend an hour with you.',
    options: [
      { t: 'Ask about the mental side', fx: { attr: { MEN: 1.2 }, cap: { MEN: 1 } }, out: '"It\'s all between the ears, son." It stuck.' },
      { t: 'Ask about your {skill}', fx: { attr: { MAIN: 1.2 } }, out: 'One tiny tip. It changes everything.' },
      { t: 'Too shy. Watch from a distance', fx: {}, out: 'You regret it on the drive home.' }] },
  { id: 'trolls', icon: '📱', title: 'Social media pile-on', who: 'any', need: 'quiet',
    text: 'After a quiet game, the replies are brutal. Someone made a meme.',
    options: [
      { t: 'Fire back', roll: [{ p: 0.3, fx: { fame: 2 }, out: 'Your comeback was funnier than the meme. Fans love it.' }, { p: 0.7, fx: { bias: -0.8, form: -1 }, out: 'Bad idea. It\'s a story now.' }] },
      { t: 'Delete the app for a week', fx: { attr: { MEN: 1 } }, out: 'Quieter head. Better sleep.' },
      { t: 'Use it as fuel', fx: { form: 1 }, out: 'You\'ve screenshotted it. Wait till next game.' }] },
  { id: 'wedding', icon: '💒', title: 'Family wedding', who: 'any',
    text: 'Your cousin is getting married on the rest day. It\'s a six-hour round trip.',
    options: [
      { t: 'Go. Family first', fx: { energy: -1, attr: { MEN: 0.6 } }, out: 'Grandma cried. You danced. Worth it.' },
      { t: 'Video call in', fx: { bias: 0.3 }, out: 'You missed the cake. Stayed on top of training.' }] },
  { id: 'uni', icon: '🎓', title: 'Exams vs nets', who: 'any', age: [17, 21],
    text: 'Uni exams clash with extra net sessions. Your mum has opinions.',
    options: [
      { t: 'Study. Backup plans matter', fx: { energy: -1, attr: { MEN: 0.8 } }, out: 'Passed. Brain tired.' },
      { t: 'Defer and go all in on cricket', fx: { energy: 1, bias: 0.4 }, out: 'Mum is disappointed. The coach is thrilled.' }] },
  { id: 'job', icon: '🧰', title: 'Part-time job', who: 'any', lv: ['seconds'], age: [17, 24],
    text: 'Second XI money doesn\'t pay rent. {mate} offers you shifts on his landscaping crew.',
    options: [
      { t: 'Take the shifts', fx: { energy: -1, attr: { FIT: 1.2 } }, out: 'Hard yakka. Your shoulders are huge now.' },
      { t: 'Live on noodles, train full-time', fx: { energy: 1 }, out: 'Two-minute noodles, again. But you\'re training every day.' }] },
  { id: 'beep', icon: '⏱️', title: 'Fitness test', who: 'any',
    text: 'The dreaded yo-yo test is on Monday. Selectors look at the numbers.',
    options: [
      { t: 'Train like a maniac all weekend', roll: [{ p: 0.7, fx: { bias: 0.8, attr: { FIT: 0.8 } }, out: 'Top three in the squad. Noted.' }, { p: 0.3, fx: { inj: 1 }, out: 'Pulled a hammy in the final shuttle.' }] },
      { t: 'Steady prep', fx: { attr: { FIT: 0.5 } }, out: 'Middle of the pack. Nobody noticed. That\'s fine.' }] },
  { id: 'rival', icon: '🗯️', title: 'A rival mouths off', who: 'bat', lv: ['shield', 'test', 'county'],
    text: '{rival} told a podcast you "can\'t handle the short ball". You play {opp} again soon.',
    options: [
      { t: 'Let the bat do the talking', fx: { form: 1, attr: { CON: 0.5 } }, out: 'Laser focus.' },
      { t: 'Hit back in the papers', roll: [{ p: 0.5, fx: { fame: 2 }, out: 'The rivalry is now a thing. Ratings!' }, { p: 0.5, fx: { form: -1 }, out: 'You\'ve made it personal. Now you have to deliver.' }] },
      { t: 'Laugh it off', fx: { attr: { MEN: 0.5 } }, out: 'Water off a duck\'s back.' }] },
  { id: 'rivalbowl', icon: '🗯️', title: 'Trash talk', who: 'bowl', lv: ['shield', 'test', 'county'],
    text: '{rival} told a podcast you\'re "a net bowler with a nice haircut". You bowl at him again soon.',
    options: [
      { t: 'Let the ball do the talking', fx: { form: 1, attr: { ACC: 0.5 } }, out: 'You\'ve circled the date.' },
      { t: 'Hit back in the papers', roll: [{ p: 0.5, fx: { fame: 2 }, out: 'The rivalry is now a thing. Ratings!' }, { p: 0.5, fx: { form: -1 }, out: 'You\'ve made it personal. Now you have to deliver.' }] },
      { t: 'Laugh it off', fx: { attr: { MEN: 0.5 } }, out: 'Water off a duck\'s back.' }] },
  { id: 'charity', icon: '🎗️', title: 'Charity match', who: 'any', lv: ['shield', 'test', 'county'],
    text: 'A children\'s hospital fundraiser wants you to play in fancy dress.',
    options: [
      { t: 'Absolutely. Bring the costume', fx: { fame: 2, energy: -1 }, out: 'You played as a banana. Raised $40k.' },
      { t: 'Donate signed gear instead', fx: { fame: 1 }, out: 'Kind and low-key.' }] },
  { id: 'newbat', icon: '🪵', title: 'A new bat', who: 'bat',
    text: 'Your favourite bat has cracked. The new one feels heavier and pings off the middle.',
    options: [
      { t: 'Use it straight away', fx: { attr: { ATT: 0.8 } }, out: 'The ball flies. You feel unstoppable.' },
      { t: 'Glue the old one, keep it for match days', fx: { attr: { CON: 0.6 } }, out: 'Superstition wins. Feels right.' }] },
  { id: 't20', icon: '💰', title: 'Overseas T20 offer', who: 'any', lv: ['shield', 'test'], age: [21, 40],
    text: 'A franchise league in the Gulf offers good money for a fortnight. It clashes with training camp.',
    options: [
      { t: 'Take the money', fx: { fame: 1, bias: -1, attr: { MAIN: 0.5 } }, out: 'Fun, flashy, and your red-ball coach is grumpy.' },
      { t: 'Decline. Red ball is the dream', fx: { bias: 1 }, out: 'The selectors were quietly impressed.' }] },
  { id: 'meditate', icon: '🧘', title: 'The team psychologist', who: 'any',
    text: 'The squad psych suggests daily visualisation sessions.',
    options: [
      { t: 'Commit to it', fx: { attr: { MEN: 1.2 } }, out: 'Calmer in the middle already.' },
      { t: 'Not my thing', fx: {}, out: 'Fair enough.' }] },
  { id: 'icebath', icon: '🧊', title: 'Recovery protocol', who: 'any', age: [24, 45],
    text: 'Sports science want you on a new recovery program: ice baths, sleep tracking, no late nights.',
    options: [
      { t: 'Full buy-in', fx: { attr: { FIT: 1 }, rest: 1 }, out: 'Your body feels five years younger.' },
      { t: 'Half-hearted', fx: { attr: { FIT: 0.3 } }, out: 'Some ice baths. Some late nights.' }] },
  { id: 'mystery', icon: '🎭', title: 'A mystery spinner in the nets', who: 'bat',
    text: 'A teenager with a weird action is bowling in the nets. Nobody can read him.',
    options: [
      { t: 'Face him for an hour', fx: { attr: { SPIN: 1.2 } }, out: 'Bamboozled at first. Then you started picking him.' },
      { t: 'Stick to your routine', fx: { attr: { DEF: 0.4 } }, out: 'Routine is king.' }] },
  { id: 'foodpoison', icon: '🤢', title: 'Dodgy prawns', who: 'any',
    text: 'Team dinner. The prawns were questionable. You feel awful the morning of travel.',
    options: [
      { t: 'Tough it out', fx: { form: -1 }, out: 'Grim. You got through it.' },
      { t: 'Tell the doctor', roll: [{ p: 0.5, fx: { inj: 1 }, out: 'Doctor\'s orders: you sit out a game.' }, { p: 0.5, fx: { rest: 1 }, out: 'A drip and a nap. Good as new.' }] }] },
  { id: 'contract', icon: '✍️', title: 'Contract talks', who: 'any', lv: ['shield', 'test'], age: [22, 40],
    text: '{state} offer you a new deal. Your manager says hold out for more.',
    options: [
      { t: 'Sign on the spot', fx: { bias: 0.8 }, out: 'Loyal. The state appreciates it.' },
      { t: 'Hold out', roll: [{ p: 0.6, fx: { fame: 1 }, out: 'You got the bump. Some resentment in the rooms.' }, { p: 0.4, fx: { bias: -1 }, out: 'Talks dragged on. Selectors noticed the distraction.' }] }] },
  { id: 'camp', icon: '⛺', title: 'National camp invite', who: 'any', lv: ['shield'], need: 'uncapped',
    text: 'You\'re invited to the national high-performance camp in Brisbane.',
    options: [
      { t: 'Go and soak it up', fx: { bias: 1.2, attr: { MEN: 0.6 }, energy: -1 }, out: 'Training alongside Test players. Eye-opening.' },
      { t: 'Ask to defer (you\'re in form)', fx: { form: 1 }, out: 'Kept your rhythm. Not everyone liked it.' }] },
  { id: 'doghouse', icon: '🐶', title: 'Late to the bus', who: 'any',
    text: 'Your alarm didn\'t go off. The team bus left five minutes ago.',
    options: [
      { t: 'Own it, apologise to the group', fx: { bias: 0.2 }, out: 'Push-ups for the squad. Forgiven.' },
      { t: 'Blame the hotel', fx: { bias: -0.8 }, out: 'Nobody believes you. The fines committee is thrilled.' }] },
  { id: 'heat', icon: '🌡️', title: 'Heatwave', who: 'any', lv: ['seconds', 'shield', 'test'],
    text: 'It\'s going to be 41 degrees. The physio suggests extra hydration work and lighter training.',
    options: [
      { t: 'Follow the plan', fx: { rest: 1 }, out: 'You stay cool. Others cramp.' },
      { t: 'Train through it, toughen up', fx: { attr: { FIT: 0.9 }, energy: -1 }, out: 'Brutal. Stronger for it.' }] },
]);
