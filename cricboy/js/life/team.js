/* Cricboy life events: the dressing room and life around the team. Data only; the format is described in js/life.js. */
CB.addLife([
  // ---- teammates and the squad
  { id: 'tm-snorer', icon: '😴', title: 'The roommate snores', who: 'any',
    text: 'Your roommate {mate} snores like a ride-on mower going up a hill. It is 2am and there\'s a game the day after tomorrow.',
    options: [
      { t: 'Earplugs and a pillow over your head', fx: { energy: -1, attr: { MEN: 0.5 } }, out: 'You learn to sleep through anything. A useful skill on tour.' },
      { t: 'Ask the team manager for a swap', fx: { rest: 1, bias: -0.3 }, out: 'New roommate, silent as a monk. {mate} is a bit hurt, and tells everyone.' },
      { t: 'Record it for the group chat', roll: [{ p: 0.6, fx: { bias: 0.3, attr: { MEN: 0.3 } }, out: 'The squad cries laughing. {mate} buys you earplugs as a peace offering.' }, { p: 0.4, fx: { form: -1 }, out: '{mate} retaliates. Your phone is now set to Portuguese.' }] }] },
  { id: 'tm-oldpro', icon: '🧔', title: 'Want some advice, kid?', who: 'any', age: [17, 22],
    text: '{mate} has played 140 first-class games and seen everything twice. After training he sits down next to you: "Want some advice, kid?"',
    options: [
      { t: '"Yes please"', fx: { attr: { MEN: 0.8 }, cap: { MEN: 0.5 }, energy: -1 }, out: '"Never trust a dry pitch or a quiet captain." An hour later, it all makes sense.' },
      { t: 'Ask about his worst season', fx: { attr: { MEN: 0.5 }, bias: 0.3 }, out: 'He laughs for a long time. Then he tells you exactly how he got out of it.' },
      { t: '"I\'m right, thanks"', roll: [{ p: 0.4, fx: { form: 1 }, out: 'He shrugs. Confidence is its own kind of advice.' }, { p: 0.6, fx: { bias: -0.4 }, out: 'Word gets around that the new kid knows everything. Training gets quieter.' }] }] },
  { id: 'tm-mentor', icon: '🐣', title: 'The kid with questions', who: 'any', age: [31, 45],
    text: 'An 18-year-old has latched onto you. He asks about grips, diet, sleep, rent and tax, usually in the middle of your warm-up.',
    options: [
      { t: 'Take him under your wing', fx: { energy: -1, attr: { MEN: 0.6 }, bias: 0.5 }, out: 'He thanks you in his debut interview. The coaches notice who taught him.' },
      { t: 'Weekly coffee. Guard your warm-up', fx: { attr: { MEN: 0.4 } }, out: 'Tuesdays at ten. Boundaries are healthy.' },
      { t: 'Teach him the hard way', roll: [{ p: 0.5, fx: { attr: { FLD: 0.6 }, bias: 0.3 }, out: 'Fielding drills until dark. He keeps up. So, just, do you.' }, { p: 0.5, fx: { energy: -1, attr: { MEN: -0.3 } }, out: 'He beats you in every drill. Humbling. He is very nice about it.' }] }] },
  { id: 'tm-spotrival', icon: '⚔️', title: 'Same net, same spot', who: 'any',
    text: '{mate} plays your role and wants your place. The coach has put you both in the same net session. Everyone is pretending not to watch.',
    options: [
      { t: 'Go flat out. Make a statement', roll: [{ p: 0.55, fx: { bias: 0.8, energy: -1 }, out: 'You win the session clearly. The coach scribbles something down.' }, { p: 0.45, fx: { form: -1 }, out: 'He wins it. You go home and stare at the ceiling.' }] },
      { t: 'Help him with a tip', fx: { attr: { MEN: 0.8 } }, out: 'He looks confused, then grateful, then slightly better. Hmm.' },
      { t: 'Do your own work, ignore him', fx: { attr: { MAIN: 0.5 } }, out: 'Head down, process, process. Nothing flashy. Nothing lost.' }] },
  { id: 'tm-slumpmate', icon: '🌧️', title: 'A mate in a hole', who: 'any',
    text: '{mate} hasn\'t had a good game in six weeks. He\'s stopped coming to team dinners and barely says a word at training.',
    options: [
      { t: 'Take him for a coffee and ask', fx: { energy: -1, attr: { MEN: 0.8 }, bias: 0.3 }, out: 'He opens up. Next day he books in with the team psych. You both feel lighter.' },
      { t: 'Quietly let the team doctor know', fx: { attr: { MEN: 0.5 } }, out: 'The doctor checks in on him. A week later {mate} thanks you for noticing.' },
      { t: 'Give him space', roll: [{ p: 0.5, fx: {}, out: 'He comes good on his own. Lucky.' }, { p: 0.5, fx: { form: -1 }, out: 'He gets worse before he gets better. You wish you\'d said something.' }] }] },
  { id: 'tm-prank', icon: '🧊', title: 'Keys on ice', who: 'any',
    text: 'Somebody has frozen your car keys into a block of ice and left it in the team fridge. The prime suspect is whistling.',
    options: [
      { t: 'Plot an elaborate revenge', roll: [{ p: 0.5, fx: { bias: 0.4, form: 1 }, out: 'You fill his car with 600 plastic balls. Prank of the season.' }, { p: 0.5, fx: { bias: -0.5 }, out: 'Wrong car. It belongs to the chief executive.' }] },
      { t: 'Thaw them and say nothing', fx: { attr: { MEN: 0.5 } }, out: 'Completely unbothered. It drives the prankster mad.' },
      { t: 'Recruit {mate2} for a joint op', fx: { bias: 0.3, energy: -1 }, out: 'A two-man job, executed at dawn. His car is now full of balloons. Flawless.' }] },
  { id: 'tm-nickname', icon: '🏷️', title: 'You are now "Dusty"', who: 'any', age: [17, 25],
    text: 'The squad has decided your nickname is Dusty. Nobody will explain why. It\'s already on your locker in permanent marker.',
    options: [
      { t: 'Embrace it', fx: { bias: 0.3, attr: { MEN: 0.3 } }, out: 'You answer to Dusty now. Even your mum has started.' },
      { t: 'Lobby for something cooler', roll: [{ p: 0.3, fx: { fame: 1 }, out: 'It works. You are "The Hammer", and the crowd picks it up.' }, { p: 0.7, fx: { bias: -0.3 }, out: 'You are now "Dusty the Hammer". Somehow worse.' }] },
      { t: 'Demand to know why', fx: {}, out: 'There was a dust storm on your first day. That is the whole story.' }] },
  { id: 'tm-santa', icon: '🎅', title: 'Secret Santa', who: 'any', lv: ['seconds', 'shield', 'test'],
    text: 'You\'ve drawn {coach} in the squad Secret Santa. The limit is twenty dollars. The man has everything except a sense of humour.',
    options: [
      { t: 'A framed photo of his worst haircut', roll: [{ p: 0.5, fx: { bias: 0.5 }, out: 'He laughs for the first time on record. It goes up on his office wall.' }, { p: 0.5, fx: { bias: -0.5 }, out: 'Silence. A long silence. You run extra laps in January.' }] },
      { t: 'A nice notebook. Safe', fx: { bias: 0.3 }, out: 'He writes your name on the first page. Hopefully it\'s a good list.' },
      { t: 'Regift something from your kit bag', fx: { rest: 1 }, out: 'Zero effort. He unwraps a used thigh pad and, worryingly, keeps it.' }] },
  { id: 'tm-busroute', icon: '🥧', title: 'Same route, same pie', who: 'any', need: 'big',
    text: 'After your big day, the dressing room rules that tomorrow must be identical: same breakfast, same bus seat, same detour past the same servo.',
    options: [
      { t: 'Honour the ritual to the letter', roll: [{ p: 0.5, fx: { form: 1, bias: 0.3 }, out: 'Same pie, same seat, same result. The ritual lives on.' }, { p: 0.5, fx: { energy: -1 }, out: 'The detour adds forty minutes. Your warm-up is a jog from the car park.' }] },
      { t: 'Rituals are for the weak', fx: { attr: { MEN: 0.6 }, bias: -0.3 }, out: 'You order something different for breakfast. Gasps. The room sulks.' },
      { t: 'Add a new step to the ritual', fx: { form: 1, energy: -1 }, out: 'Now it also includes a lap of the hotel car park. Everyone hates you.' }] },
  { id: 'tm-charm', icon: '🪙', title: 'The lucky penny is gone', who: 'any',
    text: 'Your grandad\'s old penny lives in your left pocket every game. Twenty minutes before the start, it isn\'t there.',
    options: [
      { t: 'Tear the dressing room apart', roll: [{ p: 0.6, fx: { form: 1, energy: -1 }, out: 'Found in {mate}\'s shoe. Don\'t ask. Warm-up missed, luck restored.' }, { p: 0.4, fx: { form: -1 }, out: 'No penny. Just a rattled head and a missed warm-up.' }] },
      { t: 'Let it go. You make your own luck', fx: { attr: { MEN: 1 } }, out: 'A strange calm settles. Grandad would have said the same.' },
      { t: 'Borrow a coin from the umpire', fx: { fame: 1, attr: { MEN: 0.3 } }, out: 'He hands over a coin and a raised eyebrow. A legend begins.' }] },

  // ---- opponents and umpires
  { id: 'tm-sledge', icon: '🎙️', title: 'Nature documentary', who: 'any',
    text: '{rival} has spent the whole session narrating your every move in a hushed nature-documentary voice. His teammates are in tears.',
    options: [
      { t: 'Narrate him back', roll: [{ p: 0.5, fx: { form: 1, fame: 1 }, out: 'Your impression is better. Even the umpire snorts.' }, { p: 0.5, fx: { form: -1 }, out: 'You fluff the bit. He narrates that too.' }] },
      { t: 'Block it out completely', fx: { attr: { MEN: 0.8 } }, out: 'A wall of focus. He gives up after lunch.' },
      { t: 'Laugh. It\'s honestly good', fx: { form: 1, bias: -0.3 }, out: 'You crack up, and loosen up. Your captain is less amused.' }] },
  { id: 'tm-claim', icon: '🖐️', title: 'Did it carry?', who: 'any',
    text: 'You dive forward and come up with the ball. Everyone is celebrating. You honestly aren\'t sure it carried.',
    options: [
      { t: 'Tell the umpire you\'re not sure', fx: { fame: 1, attr: { MEN: 0.5 } }, out: 'Not out. The batter nods at you. You feel clean all the way to stumps.' },
      { t: 'Claim it', roll: [{ p: 0.5, fx: { form: 1 }, out: 'Given. The footage is inconclusive. You sleep fine. Mostly.' }, { p: 0.5, fx: { fame: -1, bias: -0.4 }, out: 'A spectator\'s phone footage is not inconclusive. Oof.' }] },
      { t: 'Let the umpires decide', fx: { attr: { FLD: 0.4 } }, out: 'They confer: not out. You resolve to get there a step quicker.' }] },
  { id: 'tm-umpsorry', icon: '☝️', title: 'The umpire says sorry', who: 'any', lv: ['shield', 'test', 'county'],
    text: 'A howler went against you today. After stumps the umpire knocks on the dressing-room door: he\'s seen the replay and wants to apologise.',
    options: [
      { t: 'Shake his hand. It happens', fx: { attr: { MEN: 0.8 } }, out: 'Grace under fire. He tells the other umpires you\'re one of the good ones.' },
      { t: 'Tell him exactly what it cost you', roll: [{ p: 0.5, fx: { form: 1 }, out: 'Cathartic. He nods. You both move on.' }, { p: 0.5, fx: { bias: -0.6 }, out: 'He reports your "tone". A stern letter arrives.' }] },
      { t: 'Joke: "You owe me a coffee"', fx: { fame: 1, attr: { MEN: 0.3 } }, out: 'Next game he brings one out at drinks. The cameras love it.' }] },
  { id: 'tm-rivalkind', icon: '🤝', title: 'A knock from next door', who: 'any',
    text: 'After a rough day, {rival} wanders into your dressing room with two cold drinks. "Saw something in your {skill}. Want to hear it?"',
    options: [
      { t: 'Sit down and listen', fx: { attr: { MAIN: 0.8 }, bias: -0.3 }, out: 'Gold. {coach} is a little put out that it came from the other team.' },
      { t: 'Thank him and politely pass', fx: { attr: { MEN: 0.4 } }, out: 'Pride intact. Curiosity eating you alive.' },
      { t: 'Pump him for his team\'s plans', roll: [{ p: 0.4, fx: { form: 1 }, out: 'He lets slip their plans for next game. Thank you very much.' }, { p: 0.6, fx: { bias: -0.3 }, out: 'He clocks it, finishes his drink and leaves. Poor form.' }] }] },

  // ---- travel
  { id: 'tm-delay', icon: '🛫', title: 'Delayed. Again', who: 'any', lv: ['seconds', 'shield', 'test'],
    text: 'The team flight is delayed six hours. Twenty restless cricketers, one departure gate and a single working power point.',
    options: [
      { t: 'Run a squad card tournament', fx: { bias: 0.4, energy: -1 }, out: 'Fierce. You lose the final to the physio, who turns out to be a shark.' },
      { t: 'Nap on the carpet', fx: { rest: 1 }, out: 'You wake up at a different gate. Refreshed, though.' },
      { t: 'Hunt down a gym', fx: { attr: { FIT: 0.6 }, energy: -1 }, out: 'A hotel gym across the road. Forty minutes, then a sprint back for boarding.' }] },
  { id: 'tm-beagle', icon: '🐕', title: 'The beagle found it', who: 'any', lv: ['test', 'county'],
    text: 'Home through customs after a long trip, and the biosecurity beagle sits down firmly beside your kit coffin. You forgot the apple. The squad is watching.',
    options: [
      { t: 'Own up straight away', fx: { attr: { MEN: 0.5 } }, out: 'A stern word and a bin. The beagle gets a treat. Everyone wins except the apple.' },
      { t: 'Try to explain your way out', roll: [{ p: 0.4, fx: { attr: { MEN: 0.3 } }, out: 'A warning. You walk off quickly before anyone changes their mind.' }, { p: 0.6, fx: { bias: -0.3, fame: -1 }, out: 'A fine, and a fan filmed the lot. "Cricketer v beagle" is a big hit online.' }] },
      { t: 'Report yourself to the fines committee', fx: { bias: 0.3 }, out: 'You fine yourself before anyone else can. The committee respects a pre-emptive strike.' }] },
  { id: 'tm-lockdown', icon: '☔', title: 'Rain, rain, room service', who: 'any',
    text: 'Three days of rain are forecast and training is off. The team is stuck inside the hotel. Somebody keeps ordering chips to your room.',
    options: [
      { t: 'Host a squad trivia night', fx: { bias: 0.4, energy: -1 }, out: 'Your round on famous run-ups is a smash. It finishes at 1am.' },
      { t: 'Hotel gym, twice a day', fx: { attr: { FIT: 0.8 }, energy: -1 }, out: 'You and a treadmill. Close friends now.' },
      { t: 'Sleep. Just sleep', fx: { rest: 1 }, out: 'Fourteen hours. Your body sends a thank-you card.' }] },

  // ---- training ground
  { id: 'tm-slipsdrill', icon: '🥶', title: 'Slips at 7am', who: 'any',
    text: 'The fielding coach wants a slips session at 7am. It\'s eight degrees, the ball is a rock and your hands are already numb.',
    options: [
      { t: 'Dive at everything', roll: [{ p: 0.75, fx: { attr: { FLD: 1 } }, out: 'Bruised, frozen and sharper than ever.' }, { p: 0.25, fx: { inj: 1 }, out: 'Split webbing. Three stitches and one game on the sidelines.' }] },
      { t: 'Steady, soft hands', fx: { attr: { FLD: 0.5 } }, out: 'Clean and tidy, not heroic. Your fingers survive.' },
      { t: 'Volunteer to hit the catches instead', fx: { bias: 0.3, energy: 1 }, out: 'Hands saved, coach impressed. Sneaky.' }] },
  { id: 'tm-catchcomp', icon: '🏆', title: 'Last man standing', who: 'any',
    text: 'End-of-training catching comp: drop one and you\'re out. The winner skips kit duty for a month. It\'s down to you and {mate}.',
    options: [
      { t: 'Go for the win', roll: [{ p: 0.5, fx: { attr: { FLD: 0.6 }, rest: 1 }, out: 'One-handed, falling backwards. Champion. Kit duty is for mortals.' }, { p: 0.5, fx: { attr: { FLD: 0.3 }, energy: -1 }, out: 'You spill a sitter. A month of lugging the drinks cooler.' }] },
      { t: 'Let him win. He needs it', fx: { attr: { MEN: 0.5 }, bias: 0.3 }, out: 'He knows. He knows you know. A quiet bond is formed.' },
      { t: 'Call it a tie and share the prize', fx: { energy: 1 }, out: 'Two weeks each. Diplomacy.' }] },
  { id: 'tm-warmupsoccer', icon: '⚽', title: 'Warm-up soccer', who: 'any',
    text: 'The warm-up game of soccer is getting tasty. {mate} has just slide-tackled the assistant coach. The ball is rolling to you.',
    options: [
      { t: 'Go in hard', roll: [{ p: 0.6, fx: { bias: 0.4, attr: { FIT: 0.3 } }, out: 'Top-corner screamer. You celebrate like you\'ve won a Test.' }, { p: 0.4, fx: { inj: 1 }, out: 'Rolled ankle. In a warm-up. The physio is beyond words.' }] },
      { t: 'Pass it and jog', fx: { rest: 1 }, out: 'Cricketers playing soccer: a known disaster. You stay intact.' },
      { t: 'Appoint yourself referee', fx: { attr: { MEN: 0.4 }, bias: 0.3 }, out: 'Your red card for {mate} is the talk of the lunch break.' }] },

  // ---- dressing-room culture
  { id: 'tm-kitman', icon: '🧺', title: 'Never cross the kit man', who: 'any', lv: ['shield', 'test'],
    text: 'You dumped a wet towel on the kit man\'s freshly folded pile. He saw. He says nothing. He is writing in a little book.',
    options: [
      { t: 'Apologise with his favourite pastry', fx: { form: 1, energy: -1 }, out: 'A vanilla slice and a full grovel. Your gear is laid out perfectly for weeks.' },
      { t: 'It\'s a towel. Move on', roll: [{ p: 0.4, fx: {}, out: 'He lets it go. Or he\'s playing a very long game.' }, { p: 0.6, fx: { form: -1 }, out: 'Your whites come back pink. All of them.' }] },
      { t: 'Refold the whole pile yourself', fx: { attr: { MEN: 0.4 } }, out: 'Your folding is a disgrace, but he respects the effort.' }] },
  { id: 'tm-chicken', icon: '🐔', title: 'The rubber chicken', who: 'any', need: 'quiet',
    text: 'After a quiet game, the dressing room awards you the rubber chicken. You must carry it everywhere until someone has a worse day.',
    options: [
      { t: 'Carry it with pride', fx: { bias: 0.4, attr: { MEN: 0.5 }, energy: -1 }, out: 'You name it Gerald. Gerald comes to dinner. The room loves you for it.' },
      { t: 'Slip it into {mate}\'s bag', roll: [{ p: 0.5, fx: { form: 1 }, out: 'He doesn\'t notice for two days. Chicken passed. Weight lifted.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'Caught. The penalty is a second chicken.' }] },
      { t: 'Stare at it. Get angry', fx: { form: 1, attr: { MEN: -0.3 } }, out: 'It sits on your hotel desk, judging you. You will make it pay.' }] },
  { id: 'tm-famous', icon: '✍️', title: 'Sign this for my nephew', who: 'any', need: 'fame',
    text: 'Now you\'re well known, teammates keep leaving things on your seat to sign: bats, caps, a nephew\'s plaster cast. There\'s a pile.',
    options: [
      { t: 'Sign everything, personalised', fx: { energy: -1, bias: 0.3 }, out: 'Two hours, one cramped hand, a dozen delighted families.' },
      { t: 'Set a limit: five a week', fx: { attr: { MEN: 0.4 } }, out: 'A fair rule. Grumbled at, then respected.' },
      { t: 'Gold coin per item for the team fund', roll: [{ p: 0.6, fx: { bias: 0.4 }, out: 'Two hundred dollars for the end-of-season party. Hero.' }, { p: 0.4, fx: { bias: -0.3 }, out: '"Too big for us now?" The rooms go a bit frosty.' }] }] },

  // ---- the batting group, the bowling group, the keepers
  { id: 'tm-dontmove', icon: '🚽', title: 'Nobody move', who: 'bat',
    text: 'A partnership is building and the batting group\'s rule is iron: nobody moves seats. You\'re padded up, next in, and you desperately need the loo.',
    options: [
      { t: 'Hold on. For the team', roll: [{ p: 0.6, fx: { attr: { CON: 0.6 } }, out: 'The stand goes another hour. Your concentration is now elite.' }, { p: 0.4, fx: { form: { bat: 0.06, n: 1 } }, out: 'A wicket falls. You walk out in genuine distress.' }] },
      { t: 'Sneak out and back', roll: [{ p: 0.5, fx: { rest: 1 }, out: 'Nobody noticed. The partnership survives. Relief all round.' }, { p: 0.5, fx: { bias: -0.3 }, out: 'A wicket falls the second you stand up. You will never live it down.' }] },
      { t: 'Superstitions are rubbish. Go', fx: { form: { bat: -0.04, n: 1 }, bias: -0.3 }, out: 'Relief. Nothing happens. You still get blamed for something.' }] },
  { id: 'tm-goldenbunny', icon: '🐰', title: 'The Golden Bunny', who: 'bowl',
    text: 'The bowling group\'s batting comp: six balls each from the machine. The lowest score takes home the Golden Bunny, a spray-painted toy rabbit.',
    options: [
      { t: 'Take it seriously, pads and all', fx: { attr: { MEN: 0.4 }, energy: -1 }, out: 'Full routine, thigh guard and all. Six off six. Enough to dodge the Bunny. Barely.' },
      { t: 'Slog everything', roll: [{ p: 0.3, fx: { form: 1 }, out: 'Three sixes into the car park. A new legend is born.' }, { p: 0.7, fx: { attr: { MEN: -0.3 } }, out: 'Six swings, six misses. The machine somehow looks smug.' }] },
      { t: 'Volunteer to feed the machine', fx: { attr: { MEN: 0.4 } }, out: 'Ringmaster, not contestant. Nobody can give you the Bunny. Clever.' }] },
  { id: 'tm-keepnoise', icon: '📣', title: 'More noise behind the stumps', who: 'keep',
    text: 'The captain wants more chat from his keeper: energy, encouragement, the odd word for the batter. You are naturally quiet.',
    options: [
      { t: 'Become the voice of the team', roll: [{ p: 0.6, fx: { bias: 0.6, attr: { KEEP: 0.3 } }, out: '"Bowling, mate!" every ball. The bowlers feel ten feet tall.' }, { p: 0.4, fx: { attr: { KEEP: -0.4 } }, out: 'All talk, then two fumbled takes. Hands first, mouth second.' }] },
      { t: 'Stay quiet. Lead with the gloves', fx: { attr: { KEEP: 0.8 } }, out: 'Clean takes speak loudly. The captain grudgingly agrees.' },
      { t: 'Delegate the chat to first slip', fx: { attr: { MEN: 0.4 }, bias: -0.3 }, out: 'First slip is delighted. The captain notices you outsourced it.' }] },
  { id: 'tm-keepgloves', icon: '🧤', title: 'The old keeper\'s inners', who: 'keep',
    text: 'A retiring keeper you idolised gives you his old inner gloves. Stiff, grey, fifteen summers of sweat. "There are catches in them, son."',
    options: [
      { t: 'Wear them next game', roll: [{ p: 0.6, fx: { form: 1, attr: { KEEP: 0.4 } }, out: 'Every take sticks. Magic, or just confidence. Who cares.' }, { p: 0.4, fx: { attr: { KEEP: -0.3 } }, out: 'They fall apart at drinks. An over of bare fingers. Ouch.' }] },
      { t: 'Frame them in your locker', fx: { attr: { MEN: 0.6 } }, out: 'A daily reminder of where the job can take you.' },
      { t: 'Ask for an hour of drills instead', fx: { attr: { KEEP: 0.8 }, cap: { KEEP: 0.5 }, energy: -1 }, out: 'Standing up to the bowling machine for an hour. Worth more than any gloves.' }] },
  { id: 'tm-twomeetings', icon: '🔀', title: 'Two meetings at once', who: 'ar',
    text: 'The batting group and the bowling group have both booked their meetings for 2pm. As the all-rounder, both expect you.',
    options: [
      { t: 'Go to the batters\' meeting', fx: { attr: { BAT: 0.6 } }, out: 'Forty minutes on the short ball. The bowlers call you a traitor.' },
      { t: 'Go to the bowlers\' meeting', fx: { attr: { BOWL: 0.6 } }, out: 'A plan for every batter in the comp. The batters sulk.' },
      { t: 'Half of each', roll: [{ p: 0.5, fx: { attr: { BAT: 0.3, BOWL: 0.3 } }, out: 'Somehow you caught the useful half of both.' }, { p: 0.5, fx: { energy: -1 }, out: 'You got the jokes from one and the apologies from the other.' }] }] },
  { id: 'tm-icequeue', icon: '🛁', title: 'The ice-bath pecking order', who: 'pace', age: [17, 25],
    text: 'Four fast bowlers, one ice bath, a strict seniority order. You\'re the junior quick. By your turn the ice is soup and the sun is down.',
    options: [
      { t: 'Wait your turn', fx: { bias: 0.3, energy: -1 }, out: 'Lukewarm and lonely. The senior quicks approve of your patience.' },
      { t: 'Hop in with the senior quick', roll: [{ p: 0.5, fx: { rest: 1, attr: { MEN: 0.3 } }, out: 'He grunts, shuffles over, and tells you about the old days. Cold and educational.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'He gets out. Slowly. Without a word. You have broken a law.' }] },
      { t: 'Wheelie bin of ice in the car park', fx: { rest: 1 }, out: 'Your own private ice bath. The groundsman would like his bin back.' }] },
  { id: 'tm-spincrossword', icon: '🧩', title: 'Spinners do the crossword', who: 'spin',
    text: 'In every dressing room, the spinners do the crossword. The old finger-spinner hands you the pen: "Your turn to lead, son."',
    options: [
      { t: 'Take the pen', fx: { attr: { MEN: 0.5, CRA: 0.4 } }, out: 'Patience, guile, seven across. It\'s all one skill, he swears.' },
      { t: 'Hand it back. You\'d rather bowl', fx: { attr: { ACC: 0.6 }, energy: -1 }, out: 'An hour of bowling at a hanky on a length. He shrugs and fills in 3 down.' },
      { t: 'Race him to finish it', roll: [{ p: 0.4, fx: { attr: { MEN: 0.8 } }, out: 'Done before lunch. He looks at you like a proud father.' }, { p: 0.6, fx: { form: -1 }, out: 'Stuck on 14 down. It haunts you through the whole session.' }] }] },

  // ---- Second XI life
  { id: 'tm-countrybus', icon: '🚌', title: 'Five hours to a country oval', who: 'any', lv: ['seconds'],
    text: 'The Second XI is bussing five hours to play in a country town. The bus has no air-con, one working speaker and a toilet nobody dares open.',
    options: [
      { t: 'Back seat with the loud boys', roll: [{ p: 0.6, fx: { bias: 0.4 }, out: 'You learn every song and every story. You\'re one of them now.' }, { p: 0.4, fx: { energy: -1 }, out: 'Five hours of noise. You arrive with a headache and three new nicknames.' }] },
      { t: 'Front seat, headphones, sleep', fx: { rest: 1 }, out: 'You wake as the bus pulls in. Fresh, and slightly antisocial.' },
      { t: 'Sit with the coach, talk tactics', fx: { attr: { MEN: 0.5 }, bias: 0.3, energy: -1 }, out: '{coach} draws field settings on a chip packet for three hours.' }] },
  { id: 'tm-rookieclean', icon: '🧹', title: 'Rookies clean the rooms', who: 'any', lv: ['seconds'],
    text: 'Tradition says the rookies clean the dressing room after play: tape balls, banana peels, one mysterious sock. You are a rookie.',
    options: [
      { t: 'Do it properly, every day', fx: { bias: 0.4, energy: -1 }, out: 'The senior players notice the spotless floor. Small things.' },
      { t: 'Draw up a rookie roster', roll: [{ p: 0.6, fx: { attr: { MEN: 0.6 } }, out: 'A colour-coded roster. "Leadership material," says the coach.' }, { p: 0.4, fx: { bias: -0.3 }, out: 'You rostered yourself all the easy days. Everyone noticed.' }] },
      { t: 'Slip away early and hope', fx: { rest: 1, bias: -0.4 }, out: 'Home by six. By seven, your locker is full of banana peels.' }] },
  { id: 'tm-initiation', icon: '🎤', title: 'Sing for your seat', who: 'any', lv: ['seconds'], age: [17, 22],
    text: 'New players must sing a song of their choice on the team bus. You\'re up next. The bus has gone very quiet.',
    options: [
      { t: 'A power ballad, actions included', roll: [{ p: 0.5, fx: { bias: 0.5, attr: { MEN: 0.3 } }, out: 'Standing ovation from the back seat. You\'re in.' }, { p: 0.5, fx: { attr: { MEN: -0.3 } }, out: 'You forget the second verse and hum the rest. They will never forget.' }] },
      { t: 'Mumble the national anthem', fx: { attr: { MEN: 0.3 } }, out: 'Safe, patriotic, boring. Booed with affection.' },
      { t: 'Drag {mate} up for a duet', fx: { bias: 0.3, energy: -1 }, out: 'He knows all the harmonies. Suspicious, but it works.' }] },
  { id: 'tm-backseat', icon: '💺', title: 'That is not your seat', who: 'any', lv: ['seconds', 'shield'], age: [17, 21],
    text: 'You\'ve sat on the back seat of the team bus. A silence falls. The back seat belongs to players with fifty games or more.',
    options: [
      { t: 'Hold your ground', roll: [{ p: 0.3, fx: { bias: 0.4, form: 1 }, out: 'Bold. They let you stay one trip, for the sheer cheek of it.' }, { p: 0.7, fx: { bias: -0.4 }, out: 'You are carried, gently but firmly, to the front.' }] },
      { t: 'Apologise and move to the front', fx: { attr: { MEN: 0.3 } }, out: 'Knowing your place is its own kind of wisdom.' },
      { t: 'Offer to earn it: carry their bags', fx: { energy: -1, bias: 0.3 }, out: 'A week of bag-carrying. One senior pro now calls you "the intern".' }] },
  { id: 'tm-sentdown', icon: '😤', title: 'A Shield star sent down', who: 'any', lv: ['seconds'],
    text: '{mate} has been sent down from the Shield side to find some form. He\'s in your Second XI rooms, sulking under a towel.',
    options: [
      { t: 'Ask him for {skill} tips', roll: [{ p: 0.6, fx: { attr: { MAIN: 0.8 } }, out: 'Once he warms up, he can\'t stop teaching. Gold.' }, { p: 0.4, fx: { form: -1 }, out: '"Not now, kid." A bit crushing.' }] },
      { t: 'Leave him be', fx: { attr: { MEN: 0.3 } }, out: 'He emerges on day two and nods at you. Respect, of a sort.' },
      { t: 'Try to outshine him', fx: { form: 1, bias: 0.3, energy: -1 }, out: 'The selectors came to watch him. They also watched you.' }] },
  { id: 'tm-groupchat', icon: '💬', title: '400 unread messages', who: 'any', lv: ['seconds'], need: 'quiet',
    text: 'The Second XI group chat has 400 unread messages. Skimming, they are all about one dropped catch. Yours.',
    options: [
      { t: 'Own it with a self-roasting meme', roll: [{ p: 0.6, fx: { bias: 0.3, attr: { MEN: 0.4 } }, out: 'Gold. The chat moves on to {mate}\'s haircut.' }, { p: 0.4, fx: { form: -1 }, out: 'Your meme is worse than the drop. The chat agrees, at length.' }] },
      { t: 'Mute it for a week', fx: { rest: 1, bias: -0.3 }, out: 'Peace. You also miss two changes to the training time.' },
      { t: 'Extra catching at dawn', fx: { attr: { FLD: 0.8 }, energy: -1 }, out: 'Two hundred catches. Next time, it sticks.' }] },
  { id: 'tm-classroom', icon: '🏫', title: 'Changing in a classroom', who: 'any', lv: ['seconds'],
    text: 'This Second XI game is at a school ground. The dressing room is a Year 4 classroom: tiny chairs, a class goldfish, spelling words on the board.',
    options: [
      { t: 'Leave a signed note for the kids', fx: { fame: 1 }, out: 'Monday morning, 28 kids find a note and a cricket ball. The school newsletter goes berserk.' },
      { t: 'Feed the goldfish every session', fx: { form: 1 }, out: 'The goldfish is now the team mascot. You have a good game. Coincidence? No.' },
      { t: 'Use the whiteboard for team plans', roll: [{ p: 0.6, fx: { bias: 0.3, attr: { MEN: 0.3 } }, out: 'Your field diagrams impress the coach. You leave the spelling words up for luck.' }, { p: 0.4, fx: { bias: -0.3 }, out: 'You used permanent marker. The principal rings the state association.' }] }] },
  { id: 'tm-handmedown', icon: '👕', title: 'Somebody else\'s shirt', who: 'any', lv: ['seconds'],
    text: 'Second XI kit is hand-me-down. Your playing shirt has another man\'s name stitched inside the collar. He wore it in 1994.',
    options: [
      { t: 'Wear it with pride', roll: [{ p: 0.5, fx: { form: 1 }, out: 'You look him up: a solid state player. The shirt feels lucky.' }, { p: 0.5, fx: {}, out: 'You look him up: four games, no highlights. Just a shirt, then.' }] },
      { t: 'Buy your own shirt', fx: { form: 1, energy: -1 }, out: 'Crisp, new and ninety dollars. You feel like a real cricketer. Your wallet doesn\'t.' },
      { t: 'Track him down for advice', fx: { attr: { MEN: 0.6 }, energy: -1 }, out: 'He\'s a plumber now. He talks for an hour, mostly about pipes. Some of it helps.' }] },
  { id: 'tm-onecoach', icon: '🧑‍🏫', title: 'The coach does everything', who: 'any', lv: ['seconds'],
    text: 'The Second XI coach also drives the van, runs warm-ups, gives throwdowns, fills the ice baths and picks the team. He looks very tired.',
    options: [
      { t: 'Offer to run the ice baths', fx: { energy: -1, bias: 0.5 }, out: 'He nearly hugs you. He mentions it to the Shield coach.' },
      { t: 'Learn to give decent throwdowns', fx: { attr: { FLD: 0.6 }, energy: -1 }, out: 'You become the team\'s throwdown guy. Sore shoulder, sharper arm.' },
      { t: 'Keep your head down and play', fx: { attr: { MAIN: 0.3 } }, out: 'Your job is to play. You play.' }] },
  { id: 'tm-netbody', icon: '🥅', title: 'Bodies needed in the nets', who: 'any', lv: ['seconds'],
    text: 'The Shield squad is short of bodies in the nets and the call goes out to the Second XI. You get there first. The first XI is watching.',
    options: [
      { t: 'Go hard and get noticed', roll: [{ p: 0.5, fx: { bias: 0.8 }, out: 'The Shield captain asks your name. Then writes it down.' }, { p: 0.5, fx: { form: -1, bias: -0.3 }, out: 'Nerves. Today you are mostly a training cone.' }] },
      { t: 'Do the job, stay quiet', fx: { attr: { MAIN: 0.5 }, energy: -1 }, out: 'An hour in the deep end. You belong. Nearly.' },
      { t: 'Skip it for your own session', fx: { attr: { FIT: 0.4 } }, out: 'Sensible. Also, a missed audition.' }] },
  { id: 'tm-induction', icon: '📑', title: 'Rookie induction day', who: 'any', lv: ['seconds'], age: [17, 21],
    text: 'Rookie induction day: eight hours of seminars on tax, nutrition, anti-doping, social media and the code of conduct, in a room with no windows.',
    options: [
      { t: 'Front row, take notes', fx: { attr: { MEN: 0.6 }, energy: -1 }, out: 'You now understand super. Teammates start asking you about super.' },
      { t: 'Back row, coast through', roll: [{ p: 0.6, fx: { rest: 1 }, out: 'A peaceful snooze through nutrition. Nobody noticed.' }, { p: 0.4, fx: { bias: -0.4 }, out: 'There was a quiz at the end. You came last, by a lot.' }] },
      { t: 'Ask every question you can think of', fx: { bias: 0.3, energy: -1 }, out: 'The integrity officer loves you. The other rookies do not.' }] },
  { id: 'tm-buddy', icon: '🤷', title: 'Your buddy forgot', who: 'any', lv: ['seconds'], age: [17, 22],
    text: 'Every rookie gets a senior "buddy" from the Shield squad. Yours is {mate}. Three weeks in, he still calls you by the wrong name.',
    options: [
      { t: 'Turn up at his net session anyway', roll: [{ p: 0.6, fx: { attr: { MAIN: 0.6 }, bias: 0.3 }, out: 'He laughs, learns your name, and actually helps. Good bloke after all.' }, { p: 0.4, fx: { energy: -1 }, out: 'He thinks you\'re a net bowler. Two hours later, you are one.' }] },
      { t: 'Find your own mentor', fx: { attr: { MEN: 0.5 } }, out: 'The assistant coach adopts you instead. Better fit anyway.' }] },
  { id: 'tm-drinksrookie', icon: '🥤', title: 'Drinks for the big boys', who: 'any', lv: ['seconds'],
    text: 'You\'re carrying the drinks for the Shield side at {ground}, waiting for your chance. Nobody in the XI knows your name yet.',
    options: [
      { t: 'Be the best drinks waiter ever', fx: { bias: 0.5, energy: -1 }, out: 'Ice cold, bang on time, everyone\'s order remembered. Noted.' },
      { t: 'Watch every ball and take notes', fx: { attr: { MEN: 0.7 } }, out: 'A notebook full of how first-class cricket actually works.' },
      { t: 'Chat to the players at drinks', roll: [{ p: 0.5, fx: { bias: 0.3, attr: { MAIN: 0.3 } }, out: 'The captain likes you and tells you a thing or two.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'Too much chat. The captain tells you to clear off.' }] }] },

  // ---- the Shield dressing room
  { id: 'tm-capnumber', icon: '🧢', title: 'Your first-class cap', who: 'any', lv: ['shield'], age: [17, 26],
    text: 'Your first-class cap got lost in debut-day chaos, so it\'s being presented tonight at team dinner. Tradition: you choose who hands it over.',
    options: [
      { t: 'Your old junior coach', fx: { attr: { MEN: 0.8 }, energy: -1 }, out: 'He drives eleven hours to be there. Nobody at the table has dry eyes.' },
      { t: 'The state\'s greatest living player', roll: [{ p: 0.6, fx: { bias: 0.6, fame: 1 }, out: 'He says yes, and remembers your junior stats. Unreal.' }, { p: 0.4, fx: { attr: { MEN: -0.3 } }, out: 'He gets your name wrong twice, then leaves before dessert.' }] },
      { t: '{mate}, who helped you most', fx: { bias: 0.3, attr: { MEN: 0.4 } }, out: 'A two-minute speech, mostly about your hair. Perfect.' }] },
  { id: 'tm-finescomm', icon: '⚖️', title: 'The fines committee', who: 'any',
    text: 'You\'ve been elected to the fines committee. Your powers: fines for bad shoes, phones at dinner and "general vibes". Power is intoxicating.',
    options: [
      { t: 'Rule with an iron fist', roll: [{ p: 0.5, fx: { bias: 0.5 }, out: 'A fiver for the coach\'s socks. Instant legend.' }, { p: 0.5, fx: { bias: -0.5 }, out: 'You fine the captain twice. He fines you back. For life.' }] },
      { t: 'Fair, consistent, boring', fx: { attr: { MEN: 0.4 } }, out: 'Nobody loves you. Nobody hates you. Justice, served lukewarm.' },
      { t: 'Fine yourself first, for credibility', fx: { attr: { MEN: 0.3 }, bias: 0.3 }, out: 'Twenty bucks for your own hat. The room respects the bit.' }] },
  { id: 'tm-songlead', icon: '🎶', title: 'Someone has to lead the song', who: 'any', lv: ['shield', 'test'], age: [31, 45],
    text: 'The team has won, the circle is forming, and {mate}, who leads the song, is off getting a scan. Every eye turns to the senior man: you.',
    options: [
      { t: 'Stand on the table and belt it out', roll: [{ p: 0.6, fx: { bias: 0.5, attr: { MEN: 0.3 } }, out: 'Loud, proud and only slightly wrong. The room goes berserk.' }, { p: 0.4, fx: { attr: { MEN: -0.3 } }, out: 'Wrong key, wrong verse. They kindly finish it for you.' }] },
      { t: 'Ring {mate} and put him on speaker', fx: { bias: 0.3 }, out: 'He leads it from the scan room. The radiographer joins in.' },
      { t: 'Defer to the longest-serving player', fx: { attr: { MEN: 0.3 } }, out: 'Tradition respected. You sing along at the back, where you shine.' }] },
  { id: 'tm-farewell', icon: '👋', title: 'A teammate\'s last game', who: 'any', lv: ['shield', 'test'], age: [31, 45],
    text: '{mate} is playing his last game after fifteen years. You\'ve played alongside him longest, so the team wants you to speak in the rooms afterwards.',
    options: [
      { t: 'Give the speech', roll: [{ p: 0.6, fx: { bias: 0.4, attr: { MEN: 0.5 } }, out: 'Funny, then not funny, then funny again. He hugs you for a full minute.' }, { p: 0.4, fx: { form: -1 }, out: 'You\'re in tears before the first sentence. So is everyone. An emotional hangover follows.' }] },
      { t: 'Organise a guard of honour', fx: { fame: 1, energy: -1 }, out: 'Both teams line up as he walks out. The photo makes the back page.' },
      { t: 'Let the captain handle it', fx: {}, out: 'He does fine. You raise a glass at the back.' }] },
  { id: 'tm-noplan', icon: '📋', title: 'Not in the plan', who: 'any', lv: ['shield', 'test'],
    text: 'The captain and coach held a plans meeting for the next game. Everyone was there except you. You find out from the whiteboard.',
    options: [
      { t: 'Ask them straight: why?', roll: [{ p: 0.6, fx: { bias: 0.5, attr: { MEN: 0.3 } }, out: 'An honest mistake: the invite went to an old email. You\'re in the next one.' }, { p: 0.4, fx: { form: -1 }, out: '"It\'s about the group, not you." Which is somehow worse.' }] },
      { t: 'Read the whiteboard and adapt', fx: { attr: { MAIN: 0.4 } }, out: 'You learn the plan anyway. Nobody needs to know.' },
      { t: 'Sulk for two days', fx: { form: -1, rest: 1 }, out: 'You feel better. You are also behind on everything.' }] },
  { id: 'tm-twelfthmsg', icon: '🧃', title: 'A message with the drinks', who: 'any', lv: ['shield', 'test'],
    text: 'You\'re twelfth man. The captain sends you out with the drinks and a message for the bowler: "Tell him he\'s bowling rubbish."',
    options: [
      { t: 'Deliver it word for word', roll: [{ p: 0.5, fx: { bias: 0.4 }, out: 'He takes a wicket next ball. The captain winks at you.' }, { p: 0.5, fx: { bias: -0.3 }, out: 'He bowls a beamer and glares at you, not the captain.' }] },
      { t: 'Translate: "Skip says a bit fuller"', fx: { attr: { MEN: 0.5 } }, out: 'Diplomacy at a drinks break. A future in management.' },
      { t: 'Sprint out and back, all hustle', fx: { attr: { FIT: 0.5 }, energy: -1 }, out: 'Drinks delivered at a sprint, message delivered breathless. Fitter, not clearer.' }] },
  { id: 'tm-hisspot', icon: '🔁', title: 'He was dropped for you', who: 'any', lv: ['shield', 'test'],
    text: '{mate} was dropped to make room for you. He\'s a good mate. He is also in the hotel room next door, and very quiet.',
    options: [
      { t: 'Knock on his door', roll: [{ p: 0.7, fx: { attr: { MEN: 0.6 }, bias: 0.3 }, out: '"Go and make it count." Classy. You will.' }, { p: 0.3, fx: { form: -1 }, out: 'Not the time. A stiff conversation through a half-open door.' }] },
      { t: 'Give him a few days of space', fx: { attr: { MEN: 0.3 } }, out: 'He comes around by Friday and shouts you a coffee.' },
      { t: 'Use it. Make the spot yours', fx: { form: 1, bias: -0.3 }, out: 'Ruthless and effective. The rooms notice the edge.' }] },
  { id: 'tm-longmeeting', icon: '🗂️', title: 'The three-hour meeting', who: 'any', lv: ['shield', 'test'],
    text: 'The team meeting enters its third hour. There\'s a second whiteboard now, and a consultant asking what "brave cricket" means to you.',
    options: [
      { t: 'Give a thoughtful answer', roll: [{ p: 0.5, fx: { bias: 0.5 }, out: 'The coach writes it on the board in capitals. Influence!' }, { p: 0.5, fx: { energy: -1 }, out: 'Your answer sparks a forty-minute tangent. The room will not forgive you.' }] },
      { t: 'Nod and survive', fx: { attr: { MEN: 0.3 } }, out: 'You master the engaged-looking stare. A lifelong skill.' },
      { t: 'Suggest a walk-and-talk outside', fx: { rest: 1 }, out: 'Fresh air for everyone. "Brave cricket" is now "brave walking".' }] },
  { id: 'tm-shortleg', icon: '⛑️', title: 'Who\'s going to short leg?', who: 'any', lv: ['seconds', 'shield'], age: [17, 25],
    text: 'The spinner wants a short leg. Short leg is traditionally fielded by the youngest player in the side. Everyone turns to look at you.',
    options: [
      { t: 'Helmet on. Get in there', roll: [{ p: 0.65, fx: { attr: { FLD: 1 }, bias: 0.4 }, out: 'A reflex catch off the pad. The spinner kisses your helmet.' }, { p: 0.35, fx: { inj: 1, attr: { FLD: 0.3 } }, out: 'A pull shot to the shin pad, then the forearm. You miss a game.' }] },
      { t: 'Nominate the second-youngest', fx: { bias: -0.3, rest: 1 }, out: 'He goes in. You watch him flinch from the safety of mid-on.' },
      { t: 'Go in, but stand a bit wider', fx: { attr: { FLD: 0.4 } }, out: 'Safer, slightly useless. The spinner sighs.' }] },
  { id: 'tm-bootcamp', icon: '🏋️', title: 'Week of Hell', who: 'any', lv: ['seconds', 'shield'],
    text: 'Pre-season starts with the strength coach\'s "Week of Hell": sand dunes at 6am, boxing at noon, pool sessions at dusk. He is smiling.',
    options: [
      { t: 'Win every session', roll: [{ p: 0.6, fx: { attr: { FIT: 1.2 }, bias: 0.4 }, out: 'Top of every leaderboard. The strength coach gives you a nod. Rare.' }, { p: 0.4, fx: { inj: 1, attr: { FIT: 0.4 } }, out: 'Day four, dune nine: your {niggle} goes. Gone for a game.' }] },
      { t: 'Pace yourself, finish everything', fx: { attr: { FIT: 0.7 }, energy: -1 }, out: 'Middle of the pack every day, intact on Friday. Smart.' },
      { t: 'Hide behind the big fast bowlers', fx: { attr: { FIT: 0.3 }, bias: -0.3 }, out: 'You\'re found behind a fast bowler on day two. He was hiding too.' }] },
  { id: 'tm-bushcamp', icon: '🏕️', title: 'No phones in the bush', who: 'any', lv: ['shield', 'test'],
    text: 'Team-bonding camp: three days in the bush with ex-army instructors. No phones, no cricket, one tin of baked beans each.',
    options: [
      { t: 'All in. Lead your group', fx: { attr: { MEN: 0.8, FIT: 0.4 }, energy: -1 }, out: 'You navigate the night hike by the stars. Mostly. Leadership material.' },
      { t: 'Smuggle in a phone', roll: [{ p: 0.4, fx: { rest: 1 }, out: 'Undetected. Highlights in a sleeping bag. Bliss.' }, { p: 0.6, fx: { bias: -0.6 }, out: 'Confiscated by a man called Sarge. You carry the water for the rest of camp.' }] },
      { t: 'Do the minimum, enjoy the stars', fx: { attr: { MEN: 0.4 } }, out: 'You learn three constellations and none of the knots.' }] },
  { id: 'tm-culture', icon: '🗣️', title: 'What are we missing?', who: 'any',
    text: 'The captain takes you aside: "Honestly, what\'s missing from this team?" He seems to actually want an answer.',
    options: [
      { t: '"We don\'t train hard enough"', roll: [{ p: 0.5, fx: { bias: 0.6, attr: { MEN: 0.3 } }, out: 'He agrees. Training doubles. Some teammates blame you.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'He takes it personally. A frosty week.' }] },
      { t: '"More barbecues"', fx: { bias: 0.3 }, out: 'He laughs. There\'s a barbecue on Sunday. Morale is up.' },
      { t: '"It\'s pretty good, skip"', fx: {}, out: 'He nods, and asks someone else.' }] },
  { id: 'tm-hearing', icon: '🧑‍⚖️', title: 'Reported', who: 'any', lv: ['shield', 'test', 'county'],
    text: 'Words were exchanged on the field, and the umpires have reported you. The hearing with the match referee is at 6pm.',
    options: [
      { t: 'Apologise. No excuses', fx: { bias: 0.3, fame: -1 }, out: 'A reprimand and nothing more. The referee thanks you for your honesty.' },
      { t: 'Fight it: he started it', roll: [{ p: 0.4, fx: { attr: { MEN: 0.4 } }, out: 'The stump mic backs you up. Charge dropped.' }, { p: 0.6, fx: { bias: -0.8, fame: -1 }, out: 'The stump mic does not back you up. A fine and a stern letter.' }] },
      { t: 'Let the team manager do the talking', fx: { attr: { MEN: 0.3 }, bias: -0.3 }, out: 'Smooth, procedural, slightly cowardly. A small fine.' }] },
  { id: 'tm-squadtv', icon: '📺', title: 'Squad on the TV', who: 'any', lv: ['shield'], need: 'uncapped',
    text: 'The Test squad is announced on the dressing-room TV. The room goes quiet as the names scroll. Yours isn\'t one of them. {mate}\'s is.',
    options: [
      { t: 'Congratulate him first', fx: { attr: { MEN: 0.6 }, bias: 0.3 }, out: 'You mean it, mostly. The coach sees it.' },
      { t: 'Ask a selector what\'s missing', roll: [{ p: 0.6, fx: { bias: 0.5, attr: { MAIN: 0.4 } }, out: 'Clear feedback, a clear target. You know what to work on.' }, { p: 0.4, fx: { form: -1 }, out: '"Keep doing what you\'re doing." Useless.' }] },
      { t: 'Straight to the nets', fx: { form: 1, energy: -1 }, out: 'An angry hour in the nets. You feel lighter. The net looks battered.' }] },
  { id: 'tm-physioqueue', icon: '💆', title: 'The rub-down queue', who: 'any', lv: ['shield', 'county'],
    text: 'One physio, fourteen sore cricketers, forty minutes until the bus. The queue for a rub-down has its own politics.',
    options: [
      { t: 'Wait your turn', fx: { attr: { MEN: 0.3 }, bias: 0.3 }, out: 'Five minutes and a pat on the back. Fair and square.' },
      { t: 'Invent an emergency', roll: [{ p: 0.5, fx: { rest: 1 }, out: 'Straight to the front. A glorious twenty minutes.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'The physio sees straight through it. Back of the queue, with a lecture.' }] },
      { t: 'Learn to do your own soft tissue', fx: { attr: { FIT: 0.5 }, energy: -1 }, out: 'A foam roller and a tennis ball. You are your own physio now.' }] },
  { id: 'tm-vicecap', icon: '🎖️', title: 'Vice-captain?', who: 'any', lv: ['shield'], age: [22, 45],
    text: '{coach} asks if you\'d like to be vice-captain. More meetings, more responsibility, and the toss when the skipper is away.',
    options: [
      { t: 'Yes, absolutely', fx: { bias: 0.6, energy: -1 }, out: 'Your first meeting is about the team\'s coffee machine. Leadership.' },
      { t: 'Not yet. Focus on my {skill}', fx: { attr: { MAIN: 0.5 } }, out: 'Respected. The coach says the door stays open.' },
      { t: 'Only if I control the music', roll: [{ p: 0.5, fx: { bias: 0.4 }, out: 'He laughs. Deal. Vice-captain and dressing-room DJ.' }, { p: 0.5, fx: { bias: -0.3 }, out: 'He doesn\'t laugh. The job goes to {mate}.' }] }] },
  { id: 'tm-upgrade', icon: '✈️', title: 'One upgrade, two claims', who: 'any', lv: ['shield', 'test'], need: 'big',
    text: 'The airline gives the squad one business-class upgrade. Tradition says player of the match gets it. That\'s you. But {mate} is two metres tall with a bad back.',
    options: [
      { t: 'Take it. You earned it', fx: { rest: 1 }, out: 'Fully flat. Warm nuts. You wake up a new person.' },
      { t: 'Give it to {mate}', fx: { bias: 0.4, attr: { MEN: 0.3 } }, out: 'He nearly cries. You sit next to a baby who does cry. Karma, surely.' },
      { t: 'Toss a coin for it', roll: [{ p: 0.5, fx: { rest: 1, attr: { MEN: 0.3 } }, out: 'Heads. Guilt-free legroom.' }, { p: 0.5, fx: { bias: 0.3 }, out: 'Tails. You look noble anyway.' }] }] },
  { id: 'tm-wellington', icon: '🌬️', title: 'Fielding in a gale', who: 'any', lv: ['shield'], age: [18, 25],
    text: 'On an A-tour of New Zealand, the Wellington wind is gusting at 70km/h. You\'re in the deep, and a top edge is climbing into it.',
    options: [
      { t: 'Track it all the way', roll: [{ p: 0.5, fx: { attr: { FLD: 0.8 }, bias: 0.5 }, out: 'It drifts twenty metres. You drift with it. Caught! The tour selector applauds.' }, { p: 0.5, fx: { attr: { FLD: 0.4 }, form: -1 }, out: 'It drifts twenty metres. You drift ten. Lesson learned.' }] },
      { t: 'Let it bounce, save the boundary', fx: { attr: { MEN: 0.3 }, bias: -0.3 }, out: 'Sensible. The bowler disagrees, loudly, into the wind.' }] },
  { id: 'tm-walk', icon: '🚶', title: 'Walk or wait?', who: 'bat', lv: ['seconds', 'shield', 'county'],
    text: 'You feathered one through to the keeper. You felt it. The umpire hasn\'t moved and the appeal was half-hearted. There are no reviews here.',
    options: [
      { t: 'Walk', fx: { fame: 1, attr: { MEN: 0.4 } }, out: 'The fielders applaud you off. Your average does not.' },
      { t: 'Stand your ground', roll: [{ p: 0.6, fx: { form: { bat: -0.04, n: 1 } }, out: 'Not out. You get on with it. The keeper gets on at you.' }, { p: 0.4, fx: { fame: -1, bias: -0.3 }, out: 'Someone on the hill filmed it. Awkward week.' }] },
      { t: 'Look at the sky, say nothing', fx: { attr: { CON: 0.4 }, bias: -0.3 }, out: 'A long, slightly guilty look at a cloud. Then back to work.' }] },
  { id: 'tm-pastplayers', icon: '🍷', title: 'Past players\' lunch', who: 'any', lv: ['shield'],
    text: 'The past players\' lunch. A man who played eleven games in 1978 explains, at length, that it was much harder in his day.',
    options: [
      { t: 'Agree, and ask for stories', fx: { attr: { MEN: 0.5 }, energy: -1 }, out: 'Uncovered pitches, no helmets, forty dollars a game. Fair enough, actually.' },
      { t: 'Politely disagree', roll: [{ p: 0.5, fx: { fame: 1 }, out: 'A great debate. The whole table takes sides. You\'re invited back.' }, { p: 0.5, fx: { bias: -0.3 }, out: 'He\'s on the board. He has a long memory.' }] },
      { t: 'Excuse yourself to the buffet', fx: { rest: 1 }, out: 'A smooth escape. The waiters have heard the story too.' }] },

  // ---- the Test dressing room and touring
  { id: 'tm-presentcap', icon: '🟢', title: 'Presenting the baggy green', who: 'any', lv: ['test'], need: 'capped',
    text: '{mate} makes his Test debut tomorrow and has asked you to present his baggy green. The whole squad will be in the huddle at dawn.',
    options: [
      { t: 'Write the speech of your life', fx: { bias: 0.4, attr: { MEN: 0.5 }, energy: -1 }, out: 'Rewritten until 3am. His first club, his mum, his haircut at fifteen. Not a dry eye.' },
      { t: 'Speak from the heart, no notes', roll: [{ p: 0.5, fx: { fame: 1, bias: 0.3 }, out: 'Thirty seconds, perfect. The clip goes everywhere.' }, { p: 0.5, fx: { form: -1 }, out: 'You freeze, then say "congratulations" four times. He hugs you anyway.' }] },
      { t: 'Keep it short. It\'s his moment', fx: { attr: { MEN: 0.4 } }, out: '"It\'s yours forever. Enjoy every minute." That\'s all he needed.' }] },
  { id: 'tm-baggyfirst', icon: '🥵', title: 'Baggy green, first session', who: 'any', lv: ['test'], need: 'capped',
    text: 'Team tradition: everyone wears the baggy green in the field for the first session of a Test. It\'s 39 degrees and the cap is a woollen oven.',
    options: [
      { t: 'Wear it all day, proudly', roll: [{ p: 0.6, fx: { fame: 1, attr: { MEN: 0.4 } }, out: 'Sweat-stained and glorious. The old players in the stands approve.' }, { p: 0.4, fx: { energy: -1, form: -1 }, out: 'Light-headed by tea. Pride has a melting point.' }] },
      { t: 'First session, then the sunhat', fx: { attr: { MEN: 0.3 } }, out: 'Tradition honoured, brain intact. Sensible.' },
      { t: 'Sunhat from ball one', fx: { rest: 1, bias: -0.3 }, out: 'Cool head, cold looks. The senior players mutter.' }] },
  { id: 'tm-anthem', icon: '🎺', title: 'Shaking during the anthem', who: 'any', lv: ['test'],
    text: 'Lined up for the anthems before a Test. The debutant beside you is shaking so hard his cap is wobbling. The camera is panning down the line.',
    options: [
      { t: 'Arm around his shoulders', fx: { fame: 1, bias: 0.3 }, out: 'The broadcast lingers on it. Mums across the country approve.' },
      { t: 'Sing loud enough for both of you', roll: [{ p: 0.5, fx: { form: 1 }, out: 'He laughs mid-verse and settles. So do you.' }, { p: 0.5, fx: { fame: 1, form: -1 }, out: 'You hit a note that doesn\'t exist. It\'s a meme by lunch.' }] },
      { t: 'Eyes front. Your own game first', fx: { form: 1, attr: { MEN: -0.3 } }, out: 'Locked in. You feel a bit cold about it later.' }] },
  { id: 'tm-theirrooms', icon: '🍺', title: 'A drink in their rooms', who: 'any', lv: ['test'],
    text: 'Series over. The {nation} players invite your team into their dressing room for a drink. There\'s some history between you and {rival}.',
    options: [
      { t: 'Go, and find {rival}', roll: [{ p: 0.6, fx: { attr: { MEN: 0.6 }, fame: 1 }, out: 'You swap shirts and stories. Turns out he\'s a top bloke. Annoying.' }, { p: 0.4, fx: { bias: -0.3 }, out: 'Old wounds, fresh words. Teammates steer you out by the elbow.' }] },
      { t: 'Go, but stick with your own team', fx: { bias: 0.3 }, out: 'One drink, good handshakes, home by ten.' },
      { t: 'Collect signed shirts for charity', fx: { fame: 1, energy: -1 }, out: 'Forty signatures from both sides. A children\'s hospital auction does very nicely.' }] },
  { id: 'tm-homedinner', icon: '🍲', title: 'Dinner at the liaison\'s house', who: 'any', lv: ['test'],
    text: 'On tour, the team\'s local liaison officer invites a few players home to meet his family. His mother has been cooking since dawn. The team doctor looks nervous.',
    options: [
      { t: 'Go, and eat everything offered', roll: [{ p: 0.7, fx: { attr: { MEN: 1 } }, out: 'The best meal of the tour. His mum sends you home with leftovers. Family now.' }, { p: 0.3, fx: { inj: 1 }, out: 'Your stomach was not ready. You miss a game. You regret nothing.' }] },
      { t: 'Go, but eat carefully', fx: { attr: { MEN: 0.5 } }, out: 'Polite portions. His grandmother is not fooled, but forgives you.' },
      { t: 'Politely decline, stay in', fx: { rest: 1 }, out: 'Room service and an early night. The others come back glowing.' }] },
  { id: 'tm-restday', icon: '🗺️', title: 'Rest day on tour', who: 'any', lv: ['test'],
    text: 'A free day between Tests. The options: a guided walk through the old city, golf with the senior players, or your hotel bed.',
    options: [
      { t: 'The old city walk', fx: { attr: { MEN: 0.7 }, energy: -1 }, out: 'Twelve kilometres of history, markets and one very persistent guide. Mind wiped clean.' },
      { t: 'Golf with the senior players', roll: [{ p: 0.6, fx: { bias: 0.4 }, out: 'You lose twelve balls but win the group over. Great company, terrible swing.' }, { p: 0.4, fx: { bias: -0.3, energy: -1 }, out: 'A wayward drive hits the captain\'s buggy. It\'s a long back nine.' }] },
      { t: 'Bed. Room service. Bed', fx: { rest: 2 }, out: 'You see nothing of the country. Your legs see heaven.' }] },
  { id: 'tm-heatroom', icon: '🔥', title: 'The heat chamber', who: 'any', lv: ['test'],
    text: 'With a subcontinent tour coming, sports science has built a heat chamber: 45 degrees, 80% humidity, one exercise bike. Sessions are "optional".',
    options: [
      { t: 'Every session, no complaints', fx: { attr: { FIT: 1 }, energy: -1 }, out: 'You sweat out a small swimming pool. Ready for anything.' },
      { t: 'Go for the chamber record', roll: [{ p: 0.6, fx: { attr: { FIT: 1.2 }, bias: 0.3 }, out: 'Fifty-one minutes. Your name goes on the door.' }, { p: 0.4, fx: { inj: 1 }, out: 'You wake up on the floor with a fan pointed at you. Rested by order.' }] },
      { t: '"Optional" means optional', fx: { rest: 1, bias: -0.3 }, out: 'The sports scientists write something on a clipboard.' }] },
  { id: 'tm-ashestally', icon: '🏺', title: 'The Ashes tally', who: 'any', lv: ['test'],
    text: 'A veteran keeps a tally inside the lid of his kit coffin: one mark for every Ashes Test he\'s won. With an Ashes series looming, he hands you the marker.',
    options: [
      { t: 'Draw your first mark in advance', roll: [{ p: 0.4, fx: { form: 1, fame: 1 }, out: 'Bold. Someone leaks a photo. The English papers go berserk.' }, { p: 0.6, fx: { bias: -0.3 }, out: '"Never count them before they\'re won, son." He wipes it off.' }] },
      { t: 'Ask him what it takes to win one', fx: { attr: { MEN: 0.8 }, energy: -1 }, out: '"Patience, nerve, and never read the papers." He talks until 1am.' },
      { t: '"I\'ll start mine when I\'ve earned it"', fx: { bias: 0.3 }, out: 'The right answer. He tells the captain.' }] },
  { id: 'tm-xmas', icon: '🎄', title: 'Christmas at the team hotel', who: 'any', lv: ['test'],
    text: 'Christmas Day in the middle of a Test series. Lunch with the squad and families at the team hotel, then training. The pudding looks dangerous.',
    options: [
      { t: 'Second helping of pudding', fx: { form: -1, attr: { MEN: 0.5 } }, out: 'Christmas spirit: high. The afternoon session: regrettable.' },
      { t: 'Skip lunch for extra training', fx: { attr: { MAIN: 0.5 }, bias: 0.3, energy: -1 }, out: 'Alone in the nets on Christmas Day. The coach is impressed and a bit worried.' },
      { t: 'Backyard cricket with the kids', fx: { attr: { MEN: 0.6 }, fame: 1 }, out: 'A five-year-old bowls you with a tennis ball. The photo is everywhere.' }] },
  { id: 'tm-signingtable', icon: '🖊️', title: 'The signing table', who: 'any', lv: ['test'],
    text: 'Every morning of a Test, sixty bats, shirts and posters wait in the rooms for the squad to sign. You\'re last in line and the warm-up starts in ten.',
    options: [
      { t: 'Sign every one properly', fx: { fame: 1, energy: -1 }, out: 'Neat, legible, all sixty. You jog to the warm-up still signing the air.' },
      { t: 'Scribble and run', fx: { form: 1, fame: -1 }, out: 'Warm-up on time. Your signature is now a straight line with a hiccup.' },
      { t: 'Sign them during the team meeting', roll: [{ p: 0.5, fx: { rest: 1 }, out: 'Multitasking. Nobody notices. Efficient.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'The coach notices. You sign his clipboard by accident.' }] }] },
  { id: 'tm-cardschool', icon: '🃏', title: 'The card school', who: 'any', lv: ['test'],
    text: 'The Test team\'s card game has run on every tour for a decade, with a ledger to prove it. A chair has opened up. Loser carries the drinks cooler.',
    options: [
      { t: 'Pull up the chair', roll: [{ p: 0.5, fx: { bias: 0.4, attr: { MEN: 0.4 } }, out: 'You hold your nerve on the last hand. Your name goes in the ledger.' }, { p: 0.5, fx: { energy: -1 }, out: 'Thrashed. You carry the cooler to the bus all week.' }] },
      { t: 'Watch and learn the house rules', fx: { attr: { MEN: 0.4 } }, out: 'There are 41 house rules. One involves a hat.' },
      { t: 'Early night instead', fx: { rest: 1 }, out: 'Sensible. They\'re shouting through the wall until midnight.' }] },
  { id: 'tm-hero', icon: '🌟', title: 'Your childhood hero', who: 'any', lv: ['test'],
    text: 'The {nation} squad includes a veteran whose poster was on your bedroom wall. He\'s practising at the next net, and he just nodded at you.',
    options: [
      { t: 'Go and say hello', roll: [{ p: 0.6, fx: { attr: { MEN: 0.6 } }, out: 'He\'s lovely. He even knows your stats. You float for a week.' }, { p: 0.4, fx: { form: -1 }, out: 'You call him "sir", then trip over a stump. He is very kind about it.' }] },
      { t: 'Ask him how he prepares', fx: { attr: { MAIN: 0.6 }, bias: -0.3 }, out: 'Ten minutes of gold. {coach} wonders whose side you\'re on.' },
      { t: 'Play it cool. He\'s the opposition', fx: { form: 1 }, out: 'A nod back, nothing more. You have a job to do.' }] },
  { id: 'tm-homesick', icon: '🏠', title: 'Seven weeks from home', who: 'any', lv: ['test', 'county'],
    text: 'Seven weeks into a long trip. You miss your own bed, your dog and the bad coffee at your local. It has started to show.',
    options: [
      { t: 'Talk to the team psych', fx: { attr: { MEN: 1 }, form: 1 }, out: 'One honest chat and a plan. The fog lifts within days.' },
      { t: 'Call home every night', fx: { attr: { MEN: 0.5 }, energy: -1 }, out: 'Time zones mean 2am calls. Worth it to hear the dog bark.' },
      { t: 'Bottle it up and push on', roll: [{ p: 0.4, fx: {}, out: 'You get through it. Just.' }, { p: 0.6, fx: { form: -1, attr: { MEN: -0.4 } }, out: 'It leaks into your cricket. Talking to someone would have helped.' }] }] },

  // ---- the overseas pro in county cricket
  { id: 'tm-twopegs', icon: '🚪', title: 'The capped players\' room', who: 'any', lv: ['county'],
    text: 'At {countyground}, capped players and uncapped youngsters change in separate rooms. As the overseas pro, you get a peg in the capped room on day one.',
    options: [
      { t: 'Take the peg. Enjoy it', fx: { rest: 1 }, out: 'Leather armchairs and a proper kettle. The youngsters peer in like it\'s a museum.' },
      { t: 'Ask to change with the youngsters', roll: [{ p: 0.6, fx: { attr: { MEN: 0.5 }, fame: 1 }, out: 'The kids are thrilled. The local paper calls you "refreshingly Australian".' }, { p: 0.4, fx: { form: -1 }, out: 'The capped players take it as a snub. A frosty slips cordon.' }] },
      { t: 'Split your time between both', fx: { attr: { MEN: 0.4 }, energy: -1 }, out: 'Tea with the old pros, banter with the kids. A diplomat in whites.' }] },
  { id: 'tm-warmale', icon: '🍺', title: 'Room-temperature ale', who: 'any', lv: ['county'],
    text: 'After stumps both teams share a drink in the home dressing room. The beer is warm, flat and brown. Everyone is watching your face.',
    options: [
      { t: 'Sip it and declare it "lovely"', fx: { attr: { MEN: 0.4 } }, out: 'A convincing lie. The county lads adopt you on the spot.' },
      { t: 'Ask for ice', roll: [{ p: 0.4, fx: { fame: 1 }, out: 'Outrage, then laughter. It becomes your thing.' }, { p: 0.6, fx: { form: -1 }, out: 'A senior pro has to sit down. Your request is minuted.' }] },
      { t: 'Stick to tea', fx: { rest: 1 }, out: 'Oddly English of you. Early night.' }] },
  { id: 'tm-cakerota', icon: '🍰', title: 'The cake rota', who: 'any', lv: ['county'],
    text: 'Tea at {countyground} is sacred, and the players take turns bringing a cake. This week the rota just says: "Our Aussie."',
    options: [
      { t: 'Bake lamingtons from scratch', roll: [{ p: 0.6, fx: { fame: 1, attr: { MEN: 0.4 } }, out: 'The lamingtons cause a sensation. The scorer asks for the recipe.' }, { p: 0.4, fx: { energy: -1 }, out: 'Coconut everywhere, including your kit. They\'re eaten out of politeness.' }] },
      { t: 'Buy one from the village bakery', fx: { attr: { MEN: 0.3 } }, out: 'A sponge with jam. Safe, respectable, very English.' },
      { t: 'Bring meat pies instead', fx: { form: 1, fame: -1 }, out: 'The dressing room is delighted. The members write to the club newsletter. Twice.' }] },
  { id: 'tm-raindelay', icon: '♟️', title: 'Third rain delay', who: 'any', lv: ['county'],
    text: 'Third rain delay of the day. The covers are on, and the dressing room has split into the chess table and the snooze corner.',
    options: [
      { t: 'Join the chess table', fx: { attr: { MEN: 0.6 } }, out: 'The twelfth man beats you in eleven moves. Patience: humbled, then improved.' },
      { t: 'Physio bench, eyes shut', fx: { rest: 1 }, out: 'Two hours of deep sleep. The rain never stops. Neither do you.' },
      { t: 'Drag someone to the indoor nets', roll: [{ p: 0.6, fx: { attr: { MAIN: 0.6 } }, out: 'Two quality hours while everyone else naps.' }, { p: 0.4, fx: { energy: -1 }, out: 'The rain stops just as you get warm. Play resumes. You\'re knackered.' }] }] },
  { id: 'tm-motorway', icon: '🛣️', title: 'Motorway at midnight', who: 'any', lv: ['county'],
    text: 'The game finished at 6:30pm. The next one starts at 11am tomorrow, 300 miles north. You have a club car and a satnav with opinions.',
    options: [
      { t: 'Drive straight through tonight', roll: [{ p: 0.6, fx: { form: 1 }, out: 'In at 2am, up at 7, weirdly buzzing. Very county cricket.' }, { p: 0.4, fx: { form: -1, energy: -1 }, out: 'Roadworks, a diversion and a midnight tour of a town you can\'t pronounce.' }] },
      { t: 'Car-share with a county teammate', fx: { attr: { MEN: 0.5 }, energy: -1 }, out: 'Four hours of county cricket explained between motorway services.' },
      { t: 'Sleep first, leave at 5am', fx: { rest: 1, form: -1 }, out: 'A proper sleep, then a mad dash. You arrive with ten minutes to warm up.' }] },
  { id: 'tm-skippy', icon: '🦘', title: 'They call you Skippy', who: 'any', lv: ['county'],
    text: 'The county lads have christened you "Skippy" and replay every Australian Ashes loss on the dressing-room telly. Every single one.',
    options: [
      { t: 'Bring up the overall Ashes record', roll: [{ p: 0.5, fx: { form: 1, attr: { MEN: 0.3 } }, out: 'The room goes quiet. You\'ve won the week.' }, { p: 0.5, fx: { form: -1 }, out: 'They have a comeback for everything. It\'s going to be a long summer.' }] },
      { t: 'Laugh along and shout a round', fx: { attr: { MEN: 0.5 }, energy: -1 }, out: '"Skippy" is now said with real affection. Mostly.' },
      { t: 'Let your cricket answer', fx: { form: 1, attr: { MEN: -0.3 } }, out: 'You stew quietly, then play angry. It works, for now.' }] },
  { id: 'tm-honours', icon: '🏛️', title: 'Names in gold leaf', who: 'any', lv: ['county'],
    text: 'The {countyground} dressing room has honours boards back to 1890: every hundred and every five-for, in gold leaf. There\'s space at the bottom.',
    options: [
      { t: 'Touch the boards for luck', fx: { form: 1, attr: { MEN: 0.3 } }, out: 'Cool wood, gold letters, a shiver down the spine. You walk out ten feet tall.' },
      { t: 'Picture your name up there', roll: [{ p: 0.5, fx: { cap: { MEN: 1 } }, out: 'A new ambition settles in quietly. It doesn\'t leave.' }, { p: 0.5, fx: { form: -1 }, out: 'You get so lost in the daydream you miss the warm-up.' }] },
      { t: 'Treat it like any other room', fx: { attr: { MEN: 0.6 } }, out: 'It\'s 22 yards out there. It\'s always 22 yards.' }] },
  { id: 'tm-covers', icon: '⛈️', title: 'All hands on the covers', who: 'any', lv: ['county'],
    text: 'A black cloud is racing over {countyground} and the ground staff are two men short. The groundsman is waving frantically at the dressing room.',
    options: [
      { t: 'Sprint out and heave', roll: [{ p: 0.75, fx: { attr: { FIT: 0.5 }, fame: 1 }, out: 'Covers on with seconds to spare. The members give you a standing ovation.' }, { p: 0.25, fx: { inj: 1 }, out: 'You slip on the wet outfield. The groundsman is grateful. Your knee is not.' }] },
      { t: 'Send the young pros out', fx: { attr: { MEN: 0.4 } }, out: 'Command from the balcony. The covers go on, and your knees stay dry.' }] },
  { id: 'tm-member', icon: '🧓', title: 'The member on the bench', who: 'any', lv: ['county'],
    text: 'An elderly member watches every ball from the same bench, pencil in hand. After play he hands you a page of notes on your {skill}.',
    options: [
      { t: 'Read them carefully', roll: [{ p: 0.5, fx: { attr: { MAIN: 0.8 } }, out: 'Note seven is genius. Notes one to six are about your haircut.' }, { p: 0.5, fx: { attr: { MEN: 0.3 } }, out: 'All twelve notes are about your haircut. Sweet, though.' }] },
      { t: 'Buy him a tea and talk it through', fx: { attr: { MAIN: 0.4, MEN: 0.4 }, energy: -1 }, out: 'He saw this ground\'s first floodlit game. You lose all track of time.' }] },
  { id: 'tm-april', icon: '❄️', title: 'April in England', who: 'any', lv: ['county'],
    text: 'Opening round of the county season. It\'s six degrees, the wind is straight off the Arctic and there\'s sleet. The locals are in short sleeves.',
    options: [
      { t: 'Three jumpers and a beanie', fx: { rest: 1 }, out: 'You look like a laundry pile. A warm laundry pile.' },
      { t: 'Short sleeves. Show them', roll: [{ p: 0.4, fx: { fame: 1, attr: { MEN: 0.4 } }, out: 'The county lads are deeply impressed. You can\'t feel your arms.' }, { p: 0.6, fx: { form: -1 }, out: 'Blue by lunch. The physio wraps you in a foil blanket.' }] },
      { t: 'Hand warmers in every pocket', fx: { attr: { FLD: 0.4 } }, out: 'Warm hands, safe hands. You take a sharp catch and feel smug.' }] },
  { id: 'tm-sundayroast', icon: '🍗', title: 'Sunday roast', who: 'any', lv: ['county'],
    text: 'A county teammate invites you home for Sunday roast with his family. There\'s gravy in a jug, and his dad wants to discuss the 1989 Ashes.',
    options: [
      { t: 'Go, eat, talk cricket for hours', fx: { attr: { MEN: 0.7 }, energy: -1 }, out: 'Yorkshire pudding, crumble and a family you\'ll visit every summer from now on.' },
      { t: 'Go, but leave early for training', fx: { attr: { MEN: 0.3, MAIN: 0.3 } }, out: 'Half a roast and a solid hour in the nets. A polite compromise.' },
      { t: 'Politely decline. Rest day', fx: { rest: 1 }, out: 'A day on the couch in your digs. The wallpaper is very floral.' }] },
  { id: 'tm-talkingump', icon: '🗯️', title: 'The chatty umpire', who: 'any', lv: ['county'],
    text: 'The umpire at your end played county cricket in the 80s and tells you about it every single over. All of it. In great detail.',
    options: [
      { t: 'Engage. He knows things', roll: [{ p: 0.6, fx: { attr: { MEN: 0.5, MAIN: 0.3 } }, out: 'Between the stories, a gem about reading this pitch. Useful.' }, { p: 0.4, fx: { form: -1 }, out: 'You lose concentration somewhere around his benefit year.' }] },
      { t: 'Nod politely, stay in your bubble', fx: { attr: { MEN: 0.4 } }, out: 'The polite nod is an elite skill. You barely hear a word.' },
      { t: 'Ask him to save it for tea', fx: { form: 1, energy: -1 }, out: 'He\'s delighted. Tea becomes a twenty-minute lecture, but the cricket is peaceful.' }] },
  { id: 'tm-lastcounty', icon: '🎁', title: 'Farewell, overseas man', who: 'any', lv: ['county'],
    text: 'Your county stint is ending. Tradition says the departing overseas pro makes a speech standing on the physio bench. The whole squad is waiting.',
    options: [
      { t: 'A speech full of jokes about tea', roll: [{ p: 0.6, fx: { fame: 1, attr: { MEN: 0.4 } }, out: 'They\'re in tears laughing. You\'re invited back next summer.' }, { p: 0.4, fx: { attr: { MEN: -0.3 } }, out: 'The tea jokes land badly. The woman who makes the tea was in the room.' }] },
      { t: 'Short and sincere', fx: { attr: { MEN: 0.5 } }, out: '"Thanks for having me." The captain shakes your hand for a very long time.' },
      { t: 'Leave a signed shirt for the academy', fx: { fame: 1 }, out: 'Framed in the academy room. You\'ll be a legend there for decades.' }] },
  { id: 'tm-dukes', icon: '🔴', title: 'How the county shines it', who: 'bowl', lv: ['county'],
    text: 'The {county} seamers have a sacred method for shining the Dukes ball, and a sacred rule about who is allowed to touch it. You are new.',
    options: [
      { t: 'Learn their method properly', fx: { attr: { CRA: 0.8 }, energy: -1 }, out: 'One side only, never the lacquer, never the sunscreen hand. It swings for longer now.' },
      { t: 'Show them the Aussie way', roll: [{ p: 0.4, fx: { attr: { CRA: 0.5 }, fame: 1 }, out: 'They adopt it. You are now an honorary seamer of {county}.' }, { p: 0.6, fx: { form: -1 }, out: 'The ball goes soft by over 30. Every eye in the slips turns to you.' }] },
      { t: 'Keep your hands off it', fx: { attr: { ACC: 0.4 } }, out: 'You just bowl it. Polishing is somebody else\'s religion.' }] },

  // ---- captaincy
  { id: 'tm-capspeech', icon: '📢', title: 'The pre-match speech', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'As captain, the room expects a few words before play. The coach has given you the floor. Twelve faces, one long silence.',
    options: [
      { t: 'Rousing, fist-pumping, loud', roll: [{ p: 0.5, fx: { form: 1, bias: 0.4 }, out: 'The room roars. Someone punches a locker. Fired up.' }, { p: 0.5, fx: { bias: -0.3 }, out: 'You knock over the tea urn mid-crescendo. It ends there.' }] },
      { t: 'Short: "Enjoy it, back each other"', fx: { attr: { MEN: 0.5 } }, out: 'Calm and clear. The young blokes relax.' },
      { t: 'Hand the floor to a senior player', fx: { attr: { MEN: 0.3 }, bias: -0.3 }, out: 'Generous, and also a bit of a dodge. The selectors notice.' }] },
  { id: 'tm-captell', icon: '📉', title: 'You have to tell him', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: '{mate} is being left out, and as captain the job of telling him falls to you. He\'s one of your closest mates in the team.',
    options: [
      { t: 'Face to face, honest reasons', fx: { bias: 0.5, attr: { MEN: 0.5 }, energy: -1 }, out: 'Hard, honest, done. He\'s gutted, but thanks you for not ducking it.' },
      { t: 'Let the coach do it', fx: { bias: -0.3 }, out: 'He hears it from the coach and wonders where you were.' },
      { t: 'Soften it: "Probably just one game"', roll: [{ p: 0.5, fx: { attr: { MEN: 0.3 } }, out: 'He\'s back in a fortnight. The white lie survives.' }, { p: 0.5, fx: { bias: -0.6 }, out: 'He\'s out for five games. He reminds you of "one game" daily.' }] }] },
  { id: 'tm-capcurfew', icon: '🌙', title: 'Curfew breakers', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'Two young players were spotted strolling back into the hotel at 3am, two nights before a game. As captain, what happens next is your call.',
    options: [
      { t: 'Stand them down for the game', roll: [{ p: 0.6, fx: { bias: 0.6, attr: { MEN: 0.4 } }, out: 'A hard line. Standards go up, and so does respect.' }, { p: 0.4, fx: { bias: -0.4 }, out: 'You lose the game a man short on talent. The coach questions the call.' }] },
      { t: 'Fine them and move on', fx: { bias: 0.3 }, out: 'A fair middle path. They pay up with sheepish grins.' },
      { t: 'A quiet word, kept in-house', fx: { attr: { MEN: 0.4 } }, out: 'They\'re grateful and early to everything for a month. Whether it holds is another matter.' }] },
  { id: 'tm-capvcoach', icon: '🧑‍💼', title: 'Captain versus coach', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'The coach wants an extra batter. Your gut says an extra bowler. The team sheet is due in an hour and neither of you is budging.',
    options: [
      { t: 'Back your gut', roll: [{ p: 0.5, fx: { bias: 0.7, attr: { MEN: 0.4 } }, out: 'The extra bowler takes four. Captain\'s call, vindicated.' }, { p: 0.5, fx: { bias: -0.7 }, out: 'You\'re a batter short when it matters. A long debrief.' }] },
      { t: 'Defer to the coach', fx: { bias: 0.3, attr: { MEN: -0.3 } }, out: 'Harmony restored. The nagging feeling stays.' },
      { t: 'Call a senior players\' vote', fx: { attr: { MEN: 0.4 }, energy: -1 }, out: 'Democracy picks the bowler. Everyone owns the decision.' }] },
  { id: 'tm-captoss', icon: '🤞', title: 'Seven tosses lost', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'You\'ve lost seven tosses in a row. The dressing room has theories: wrong hand, wrong call, wrong socks. Something has to change.',
    options: [
      { t: 'Send the vice-captain out to toss', fx: { form: 1, bias: -0.3 }, out: 'He wins it first go. Streak broken, though the selectors wonder who\'s in charge.' },
      { t: 'Keep calling heads. It\'s due', roll: [{ p: 0.5, fx: { form: 1, bias: 0.3 }, out: 'Heads! The dressing room erupts like you\'ve won the match.' }, { p: 0.5, fx: { form: -1 }, out: 'Tails. Eight in a row. The streak has its own nickname now.' }] },
      { t: 'Laugh it off. Tosses don\'t matter', fx: { attr: { MEN: 0.6 } }, out: '"We\'ll win it either way." Slowly, the room starts to believe it.' }] },
  { id: 'tm-capdebut', icon: '🐥', title: 'A terrified debutant', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'A debutant in your side hasn\'t eaten breakfast, has retied his laces nine times and has gone slightly grey. You\'re the captain.',
    options: [
      { t: 'Walk a lap with him, talk rubbish', fx: { attr: { MEN: 0.6 }, bias: 0.3, energy: -1 }, out: 'Ten minutes on fishing and terrible movies. He walks out smiling.' },
      { t: 'Give him a job early to settle him', roll: [{ p: 0.6, fx: { bias: 0.5 }, out: 'He nails it. You look like a genius.' }, { p: 0.4, fx: { form: -1 }, out: 'Too early. He\'s rattled, and so is your plan.' }] },
      { t: 'Leave him to the coaches', fx: { form: 1 }, out: 'You focus on your own prep. He finds his feet, slowly.' }] },
  { id: 'tm-caponemore', icon: '☀️', title: '"One more over, skip"', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'Your strike bowler has bowled eleven overs straight in the heat. He\'s red-faced, cooked, and begging you for one more.',
    options: [
      { t: 'Give him one more', roll: [{ p: 0.4, fx: { bias: 0.5, fame: 1 }, out: 'Wicket! Your hunch makes the highlights.' }, { p: 0.6, fx: { bias: -0.5 }, out: 'He limps off with a side strain. The physio is pointedly silent.' }] },
      { t: 'Take him off. He\'ll thank you', fx: { attr: { MEN: 0.5 } }, out: 'He sulks at fine leg. He also bowls beautifully after tea.' },
      { t: 'Ask the slips cordon', fx: { attr: { MEN: 0.3 }, bias: 0.3 }, out: 'The slips say "cooked". A shared call, no drama.' }] },
  { id: 'tm-capweight', icon: '🎒', title: 'The armband is heavy', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'Captaincy is eating into your own game. You\'re thinking about field placings in the shower and team plans at 3am.',
    options: [
      { t: 'Talk to the team psych about it', fx: { attr: { MEN: 1 } }, out: 'A plan: switch off at the hotel door. It helps, a lot.' },
      { t: 'Share the load with the vice-captain', fx: { rest: 1, bias: -0.3 }, out: 'Lighter shoulders. A few people say you\'re stepping back.' },
      { t: 'Push through it', roll: [{ p: 0.4, fx: { form: 1 }, out: 'You find the rhythm. It gets easier.' }, { p: 0.6, fx: { form: -1, attr: { MEN: -0.4 } }, out: 'It gets heavier. Asking for help would have been easier.' }] }] },
  { id: 'tm-capculture', icon: '🍻', title: 'The senior players want a night', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'The senior players want a team night out after the game. The coach wants a curfew. Both sides want their captain to back them.',
    options: [
      { t: 'Back the players', roll: [{ p: 0.6, fx: { form: 1, bias: -0.3 }, out: 'A great night, everyone home by midnight. The group is tighter.' }, { p: 0.4, fx: { bias: -0.7 }, out: 'One player ends up in a fountain. The coach does not forget.' }] },
      { t: 'Back the coach', fx: { bias: 0.4, attr: { MEN: -0.3 } }, out: 'Early nights all round. The senior players go quiet on you.' },
      { t: 'Broker a team dinner, 10pm finish', fx: { attr: { MEN: 0.5 }, energy: -1 }, out: 'Nobody gets exactly what they wanted. That\'s captaincy.' }] },
  { id: 'tm-capdeclare', icon: '💯', title: 'Declare, or wait for his ton?', who: 'any', lv: ['shield', 'test'], need: 'capt',
    text: 'You want to declare and bowl tonight. {mate} is on 91. The whole dressing room is watching to see if you\'ll wait for his hundred.',
    options: [
      { t: 'Declare now. Team first', roll: [{ p: 0.6, fx: { bias: 0.6 }, out: 'Two wickets before stumps. {mate} shakes your hand. Eventually.' }, { p: 0.4, fx: { bias: 0.3, form: -1 }, out: 'No wickets tonight, and {mate} is not speaking to you.' }] },
      { t: 'Give him two overs', roll: [{ p: 0.5, fx: { attr: { MEN: 0.4 } }, out: 'He gets there with a four. You declare. Everybody wins.' }, { p: 0.5, fx: { bias: -0.4 }, out: 'He blocks out two overs on 95. The selectors take notes.' }] },
      { t: 'Wait as long as it takes', fx: { bias: -0.4, attr: { MEN: 0.4 } }, out: 'He gets his ton and owes you forever. The selectors are less sentimental.' }] },
]);
