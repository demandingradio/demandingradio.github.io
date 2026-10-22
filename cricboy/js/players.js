/* Cricboy players: hidden attributes, the mapping from attributes to the engine's fitted effects, fictional name
   pools and the generator for every non-user cricketer in the world.

   Attribute scale (0-100, hidden from the player): 50 = an average Sheffield Shield regular in that skill.
   Batting composite 56 ~ an average Test top-order batter, ~71 ~ the best of the 2000s/2010s (fitted wicket
   effect -0.8), high 90s ~ Bradman. Bowling composite 50 = average frontline Shield bowler, ~70 = elite Test quick. */
(function (G) {
  'use strict';
  const CB = G.CB = G.CB || {};

  CB.BAT_ATTRS = ['DEF', 'ATT', 'PACE', 'SPIN', 'CON', 'RUN'];
  CB.BOWL_ATTRS = ['ACC', 'STK', 'CRA', 'STA'];
  CB.OTHER_ATTRS = ['FLD', 'FIT', 'MEN', 'KEEP'];
  CB.ATTRS = CB.BAT_ATTRS.concat(CB.BOWL_ATTRS, CB.OTHER_ATTRS);

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // fitted class means of the bowling effects (pace, spin): the engine's bowling W/R/B are on that scale
  const MU = { W: [0.2964, 0.506], R: [0.055, -0.0009], B: [-0.0642, -0.1825] };

  // batting survival composite -> wicket logit effect. Steeper at the top (greats are rarer and better than linear),
  // softer at the bottom so tail-enders spread over 0-30 instead of negative ratings.
  function fS(S) { return -0.48 - 0.015 * (S - 50) - 0.0007 * Math.max(0, S - 75) ** 2 + 0.0004 * Math.max(0, 30 - S) ** 2; }
  function fB(Q) { return 0.008 * (Q - 50) + 0.00035 * Math.max(0, Q - 75) ** 2 - 0.0006 * Math.max(0, 35 - Q) ** 2; }
  CB.batComposite = (a, vsSpin) => 0.45 * a.DEF + 0.35 * (vsSpin ? a.SPIN : a.PACE) + 0.20 * a.CON;
  CB.bowlComposite = (a, sub) => sub === 'fast' ? 0.5 * a.STK + 0.25 * a.CRA + 0.25 * a.ACC
    : sub === 'swing' ? 0.3 * a.STK + 0.45 * a.CRA + 0.25 * a.ACC
      : 0.4 * a.STK + 0.35 * a.CRA + 0.25 * a.ACC;

  // engine view of a player (p.e batting/fielding, p.bw bowling) from hidden attributes
  CB.effects = function (p) {
    const a = p.a;
    const att = a.ATT - 50;
    const e = {
      W: fS(CB.batComposite(a, false)) + 0.004 * att,
      Ws: fS(CB.batComposite(a, true)) + 0.004 * att - 0.13,
      R: -0.04 + 0.011 * (0.5 * a.ATT + 0.3 * a.RUN + 0.1 * a.PACE + 0.1 * a.SPIN - 50),
      B: 0.02 + 0.013 * (0.8 * a.ATT + 0.1 * a.PACE + 0.1 * a.SPIN - 50),
      S6: 0.25 + 0.02 * att + (p.power || 0),
      ro: 0.02 * (50 - a.RUN),
      con: -0.004 * (a.CON - 50),
      drop: Math.exp(-(a.FLD - 50) / 35),
      fieldW: Math.max(0.3, 1 + (a.FLD - 50) / 60),
      keepDrop: Math.exp(-(a.KEEP - 50) / 30),
      byeMul: Math.exp(-(a.KEEP - 50) / 40),
    };
    let bw = null;
    if (p.bowls) {
      const t = p.sub === 'finger' || p.sub === 'wrist' ? 1 : 0;
      const Q = CB.bowlComposite(a, p.sub);
      bw = {
        t,
        W: MU.W[t] + fB(Q) + (p.sub === 'wrist' ? 0.03 : 0),
        R: MU.R[t] - 0.010 * (0.7 * a.ACC + 0.3 * a.CRA - 50) + (p.sub === 'wrist' ? 0.03 : 0),
        B: MU.B[t] - 0.011 * (0.6 * a.ACC + 0.4 * a.CRA - 50) + (t ? (p.sub === 'wrist' ? 0.06 : 0) : 0.003 * (a.STK - 50)),
        wd: -0.035 * (a.ACC - 50) + (t ? -0.5 : 0) + (p.sub === 'wrist' ? 0.4 : 0),
        nb: -0.03 * (a.ACC - 50) + (t ? -0.8 : 0.015 * (a.STK - 50)),
        spell: t ? 7 + (a.STA - 50) / 15 : 4.5 + (a.STA - 50) / 25,
        newBall: t ? 0 : (a.CRA - 50) / 25 + (p.sub === 'swing' ? 0.5 : 0) + (a.STK - 50) / 50,
        swing: p.sub === 'swing' ? 0.004 * (a.CRA - 50) : 0,
      };
      bw.q = bw.W - 0.55 * bw.R - 0.45 * bw.B - (MU.W[t] - 0.55 * MU.R[t] - 0.45 * MU.B[t]);
    }
    return { e, bw };
  };
  // refresh the cached engine view (after training/aging/perks)
  CB.refresh = function (p) { const x = CB.effects(p); p.e = x.e; p.bw = x.bw; return p; };

  // ---------------------------------------------------------------- names
  const N = {
    AUS: {
      f: 'Jack Liam Tom Josh Mitch Sam Will Ben Nathan Matt Ryan Cam Jake Harry Oliver Riley Lachlan Callum Hayden Brody Corey Dylan Ethan Fraser Gus Hamish Isaac Jordan Kane Lewis Marcus Nick Oscar Paddy Reece Seb Tyler Xavier Zac Aaron Blake Connor Darcy Elliot Flynn Harvey Jai Kurtis Logan Mason Noah Ollie Rhys Sean Toby Wade Nikhil Usman Daniel Alex Luke Bailey Caleb Declan Fergus Henry Jesse Kieran Max Nate Owen Ronan Tristan Angus Billy Charlie Dom Eli Finn Hugo Jasper Leo Mack Rory Sid Theo Wil Arjun Jayden Kai Lucas Brad Shane Travis Adam Joel Scott Tim',
      l: 'Baxter Bennett Booth Bowden Bramley Brennan Brodie Calder Carmody Carr Cassidy Coates Connell Corbett Coulter Crane Dalton Dawes Delaney Doherty Dunne Eastwood Ellery Ferris Finlay Fitzgerald Gallagher Garnett Gillies Gorman Grady Halloran Hartigan Hassett Healey Hennessy Hogan Holloway Horan Hurley Keane Kelleher Kinsella Lacey Lawler Lennon Lowe Madden Mahony McAlister McBride McCrae McGowan McKenzie McLeod Merrick Molloy Moran Mulcahy Nolan Oakley Paxton Penrose Quinlan Redmond Rendell Ritchie Rourke Ryder Sexton Sheehan Slattery Stanton Sullivan Tierney Toohey Trengove Tully Vance Walsh Wardle Whelan Whitlock Wilde Yates Barclay Cartwright Dempsey Forsyth Galbraith Hendry Ingram Jamieson Kerr Lindsay Munro Ogilvie Pryor Rankin Strachan Tait Urquhart Varga Kovac Nguyen Petrakis Russo Moretti Singh Haddad Novak Abbott Aldridge Ashby Atherton Bannister Beckett Birch Blackwood Bligh Bourke Brack Bryce Buckley Burrows Caddy Cahill Callaghan Carlyle Chilcott Clancy Colley Conroy Cosgrove Costello Coyle Cullen Dangerfield Darby Deane Devlin Dillon Dorsett Drury Duggan Egan Elwood Fagan Fairweather Falzon Fenton Fogarty Foley Furlong Gaffney Garrity Gleeson Goss Grieve Guthrie Hackett Hammond Hanlon Harding Hawker Hayter Hogg Holt Hosking Howitt Hume Hutchins Jarvis Jessop Keogh Kidd Kirwan Lamb Larkin Leahy Lightfoot Lynch Maguire Mahoney Malone Marriott Masters McCaffrey McDermid McGrory McInnes McKinnon Meehan Merritt Milne Mitchelson Monaghan Mooney Mortimer Mulligan Nash Neville Newcombe Noonan Oates Ormsby Parkes Pascoe Pendlebury Phelan Prendergast Quayle Rafferty Reardon Riordan Roper Rowe Rudd Sadler Scanlon Shanahan Sherlock Skene Somerville Speight Spillane Stokesley Sweeney Talbot Tierney Treloar Truscott Tuckwell Upton Vickery Wakefield Waterhouse Whiteley Whitford Willoughby Wyatt Yeoman Zappia',
    },
    ENG: {
      f: 'James Oliver Harry Jack George Ben Joe Alfie Charlie Freddie Ollie Will Tom Sam Dan Jamie Zak Rehan Saqib Ed Hugo Archie Rory Toby Felix Josh Matt Luke Craig Liam Rob Chris Gus Danny Tim Ross Nick Ewan Jordan Ralph',
      l: 'Ashworth Bairstowe Barnfield Blackwell Bramhall Brightwell Clayton Cowley Croft Dawson Dexter Eccles Fairbrother Fenwick Garside Hargreaves Hepworth Holroyd Illingworth Kettleborough Lancaster Leatherbarrow Marsden Midgley Northcott Oldroyd Pennock Pickering Ramsbottom Rowbotham Sidebottom Stainton Sutcliffe Thackeray Thornton Tindall Wainwright Whitaker Woodhouse Yardley Ainsworth Brearley Cartmel Driffield Elsworth',
    },
    IND: {
      f: 'Rohan Arjun Vikram Aditya Karan Siddharth Rahul Abhishek Varun Nikhil Pranav Ishan Yash Akash Mayank Ravi Suresh Dhruv Harsh Kunal Manish Naveen Pratik Rajat Sameer Tanmay Uday Vivek Aniket Devdutt Gaurav Hemant Jayant Kartik Lokesh Mohit Nitin Omkar Parth Rituraj',
      l: 'Sharma Patel Iyer Kumar Reddy Nair Desai Joshi Kulkarni Menon Rao Pandey Mishra Thakur Yadav Chauhan Bhat Saxena Verma Shetty Pillai Bhosale Gaikwad Jadhav Naik Pawar Rathore Shinde Tiwari Trivedi Chopra Malhotra Bajwa Dubey Kamath Hegde Agarwal Banerjee Mukherjee Ghosh',
    },
    PAK: {
      f: 'Ahmed Imran Usman Hassan Faisal Bilal Saad Hamza Zubair Asad Junaid Kamran Noman Saud Abdullah Haris Salman Arsalan Danish Fahad Ghulam Irfan Kashif Mubashir Nauman Omair Qasim Rizwan Sajid Tahir Umar Waqas Yasir Zeeshan Adnan Babar Fawad Shan',
      l: 'Khan Ali Shah Iqbal Malik Butt Qureshi Raza Hussain Akhtar Masood Javed Siddiqui Aslam Tariq Chaudhry Mirza Anwar Bashir Durrani Farooq Ghauri Hafeez Jamil Karim Latif Mahmood Nadeem Rafiq Saleem Yousaf Zaman Abbasi Gondal Niazi',
    },
    SA: {
      f: 'Pieter Ruan Dean Keegan Theunis Sipho Thando Wiaan Ryan Kyle Marco Jason Aiden Heinrich Tristan Dewald Gerhard Hendrik Jacques Kabelo Lizaad Lwazi Mihlali Neil Quinton Rassie Sarel Tumelo Willem Zubayr Andile Bongani Dane',
      l: 'van der Merwe Botha Nkosi Pretorius Smit Erasmus Venter Mokoena du Toit Coetzee Jansen van Wyk Kruger Bezuidenhout Fourie Joubert Louw Malan Naidoo Nel Olivier Potgieter Roux Swart Viljoen Zondi Dlamini Mahlangu Khumalo Snyman Steenkamp',
    },
    NZ: {
      f: 'Tom Will Devon Daryl Matt Blair Jacob Finn Henry Hamish Corey Scott George Ben Dean Logan Mitch Nathan Ollie Rhys Sam Taine Ajaz Ish Kieran Leo Mark',
      l: 'Williams Robinson Phillips Young Wilson Parker Henderson Ngata Tuhiwai Barrett Coffey Duffy Elliott Fraser Gibbs Harrison Hickey Kerr Lister McCullum Neesham Ormond Paterson Rance Stewart Tickner Walker Worker Blundell Somerville',
    },
    SL: {
      f: 'Dinesh Lahiru Pathum Kamindu Asitha Dhananjaya Prabath Nuwan Chamika Sadeera Oshada Ramesh Lasith Kasun Charith Dushmantha Ishan Janith Milan Nishan Praveen Ruwan Suranga Tharindu Vishwa',
      l: 'Perera Fernando Silva Mendis Rajapaksa Gunawardena Bandara Wickramasinghe Dissanayake Kumara Rathnayake Jayawardena Karunaratne Liyanage Madushanka Nissanka Ranasinghe Samarawickrama Thirimanne Udana Weerasinghe Senanayake Amarasinghe',
    },
    WI: {
      f: 'Shai Jason Kemar Joshua Roston Jermaine Tagenarine Kirk Shamar Darren Andre Dwayne Marlon Nkrumah Alick Kavem Mikyle Raymon Justin Keacy Kevlon Jomel Gudakesh Shermon Rahkeem',
      l: 'Joseph Roach Brathwaite Chase Blackwood Bonner Charles Greaves Mayers Thomas King Phillip Hinds Athanaze Carty Seales Motie Louis Cornwall Imlach Reifer Sinclair Warrican Gabriel Lewis Alleyne Bishop Clarke',
    },
    BAN: {
      f: 'Najmul Taijul Shadman Mominul Zakir Nahid Hasan Taskin Ebadot Khaled Mahmudul Nayeem Rishad Shoriful Tanzid Yasir Anamul Mosaddek Nasum Soumya Afif Jaker',
      l: 'Hossain Islam Rahman Hasan Ahmed Miraz Das Joy Ali Karim Uddin Chowdhury Sarkar Talukder Mridha Sheikh Mia Rana Kabir Haque',
    },
    ZIM: {
      f: 'Tendai Blessing Brian Craig Sean Wessly Tafadzwa Richard Victor Brandon Takudzwa Tinashe Wellington Clive Innocent Joylord Nick Prince Tanaka Trevor',
      l: 'Chatara Muzarabani Mavuta Ervine Madhevere Nyauchi Burl Ngarava Chakabva Gumbie Kaia Marumani Masvaure Mutombodzi Ndlovu Shumba Tiripano Bennett Myers Moyo',
    },
  };
  for (const k in N) { N[k].f = N[k].f.split(' '); N[k].l = N[k].l.split(/\s(?=[A-Z])/); }
  // famous names we never want to generate by accident
  const BANNED = new Set(['Ben Stokes', 'Joe Root', 'Mitch Starc', 'Steve Smith', 'Travis Head', 'Usman Khawaja', 'Nathan Lyon', 'Pat Cummins', 'Josh Hazlewood', 'Babar Azam', 'Shan Masood', 'Kane Williamson', 'Tom Latham', 'Daryl Mitchell', 'Ajaz Patel', 'Rohit Sharma', 'Axar Patel', 'Shreyas Iyer', 'Ishant Sharma', 'Harshal Patel', 'Ravi Bishnoi', 'Kuldeep Yadav', 'Umesh Yadav', 'Kemar Roach', 'Jason Holder', 'Shai Hope', 'Kraigg Brathwaite', 'Roston Chase', 'Dean Elgar', 'Kyle Verreynne', 'Marco Jansen', 'Keegan Petersen', 'Pathum Nissanka', 'Kamindu Mendis', 'Dinesh Chandimal', 'Prabath Jayasuriya', 'Taijul Islam', 'Mominul Haque', 'Zakir Hasan', 'Craig Ervine', 'Blessing Muzarabani', 'Sean Williams', 'Shadman Islam', 'Wessly Madhevere', 'Brandon Mavuta', 'Tendai Chatara', 'Richard Ngarava', 'Ryan Burl']);
  CB.genName = function (r, nat, avoid) {
    const P = N[nat] || N.AUS;
    for (let i = 0; i < 40; i++) {
      const f = P.f[Math.floor(r() * P.f.length)], l = P.l[Math.floor(r() * P.l.length)];
      if (BANNED.has(f + ' ' + l) || (avoid && avoid.has(l) && i < 35)) continue;
      if (avoid) avoid.add(l);
      return { first: f, last: l };
    }
    return { first: 'Sam', last: 'Doe' };
  };
  CB.shortName = p => p.first[0] + ' ' + p.last;

  // ---------------------------------------------------------------- generation
  // Role templates. batS/bowlQ are offsets from the level mean; sd in rating points.
  const ROLES = {
    open: { bat: -3, bowl: null, pos: 'top' },
    top: { bat: 1.5, bowl: null, pos: 'top' },
    mid: { bat: -1, bowl: null, pos: 'top' },
    wk: { bat: -9, bowl: null, pos: 'wk' },
    ar: { bat: -8, bowl: -5, pos: 'ar' },
    pace: { bat: null, bowl: 0, pos: 'tail' },
    spin: { bat: null, bowl: 0, pos: 'tail' },
  };
  // level means (batting composite for specialist batters, bowling composite for frontline bowlers)
  CB.LEVEL_MEAN = { club: { bat: 33, bowl: 32 }, seconds: { bat: 41, bowl: 41 }, shield: { bat: 49, bowl: 52 }, test: { bat: 55, bowl: 54 } };

  let NEXT_ID = 1;
  CB.setNextId = n => { NEXT_ID = Math.max(NEXT_ID, n); };
  CB.nextId = () => NEXT_ID++;

  CB.genPlayer = function (r, opt) {
    const role = opt.role, nat = opt.nat || 'AUS';
    const lvl = CB.LEVEL_MEAN[opt.level] || CB.LEVEL_MEAN.shield;
    const T = ROLES[role];
    const g = () => CB.gauss(r);
    const shift = opt.shift || 0, bowlShift = opt.bowlShift != null ? opt.bowlShift : shift;
    const a = {};
    // batting
    let S;
    if (T.bat == null) S = clamp(15 + g() * 9 + shift * 0.3, 0, 42);         // tail-enders
    else S = lvl.bat + T.bat + shift + g() * (opt.sd || 9);
    const style = g();                                                       // grafter (-) <-> dasher (+)
    a.DEF = S + g() * 5 - style * 3;
    a.PACE = S + g() * 6;
    a.SPIN = S + g() * 6 + (nat === 'IND' || nat === 'SL' || nat === 'PAK' || nat === 'BAN' ? 3 : 0);
    // composite must land on S: solve CON
    a.CON = (S - 0.45 * a.DEF - 0.175 * (a.PACE + a.SPIN)) / 0.2;
    a.CON = clamp(a.CON, S - 15, S + 15);
    a.ATT = clamp((T.bat == null ? 58 : role === 'wk' || role === 'ar' ? 54 : 50) + style * 11 + g() * 6, 5, 95);
    a.RUN = clamp(50 + g() * 12 + (T.bat == null ? -8 : 0), 5, 95);
    // bowling
    let bowls = T.bowl != null, sub = null;
    if (role === 'pace' || role === 'ar') sub = r() < 0.5 ? 'fast' : 'swing';
    if (role === 'spin') sub = r() < 0.7 ? 'finger' : 'wrist';
    if (role === 'ar' && r() < 0.35) sub = r() < 0.75 ? 'finger' : 'wrist';
    let Q;
    if (bowls) Q = lvl.bowl + T.bowl + bowlShift + g() * (opt.sd || 8);
    else if (r() < 0.45) { bowls = true; Q = 15 + g() * 6; sub = r() < 0.6 ? (r() < 0.7 ? 'finger' : 'wrist') : 'swing'; } // part-timer
    else Q = 12 + g() * 6;
    const bstyle = g();
    a.ACC = Q + g() * 5 - bstyle * 3;
    a.STK = Q + g() * 6 + bstyle * 3;
    a.CRA = Q + g() * 6;
    a.STA = clamp(50 + g() * 12, 10, 95);
    a.FLD = clamp(50 + g() * 12 + (T.bat == null ? -5 : 2), 5, 95);
    a.FIT = clamp(55 + g() * 12, 10, 95);
    a.MEN = clamp(50 + g() * 12, 10, 95);
    a.KEEP = role === 'wk' ? clamp(55 + g() * 10 + shift * 0.5, 20, 95) : clamp(15 + g() * 8, 0, 40);
    for (const k of CB.ATTRS) a[k] = +clamp(a[k], 0, 100).toFixed(1);
    const nm = CB.genName(r, nat, opt.avoid);
    const p = {
      id: CB.nextId(), first: nm.first, last: nm.last, nat, role, sub, bowls,
      hand: r() < 0.28 ? 'L' : 'R', arm: r() < 0.2 ? 'L' : 'R',
      age: opt.age != null ? opt.age : Math.round(19 + r() * 14),
      a, power: +(g() * 0.45).toFixed(2), injury: +(r() * 0.6 + 0.7).toFixed(2),
      // potential: peak composite the player drifts towards while young
      pot: +(r() * 8).toFixed(1),
    };
    return CB.refresh(p);
  };

  // AI development: a season of age. Young players grow towards their potential, veterans decline (physical first).
  CB.agePlayer = function (p, r) {
    p.age++;
    const A = p.age, a = p.a;
    const growth = A <= 21 ? 2.2 : A <= 24 ? 1.4 : A <= 27 ? 0.6 : 0;
    const skillDecl = A >= 36 ? 3 : A >= 34 ? 1.6 : A >= 32 ? 0.7 : 0;
    const physDecl = A >= 35 ? 3.5 : A >= 33 ? 2.6 : A >= 31 ? 1.4 : A >= 29 ? 0.5 : 0;
    const left = Math.max(0, p.pot);
    const g = Math.min(left, growth * (0.6 + r() * 0.8));
    p.pot = +(left - g).toFixed(1);
    for (const k of CB.ATTRS) {
      const phys = k === 'STK' || k === 'STA' || k === 'FIT' || k === 'RUN' || k === 'FLD';
      let d = g * (k === 'KEEP' && p.role !== 'wk' ? 0 : 1) - (phys ? physDecl : skillDecl) + CB.gauss(r) * 0.8;
      if (k === 'STK' && p.sub === 'fast') d -= physDecl * 0.5;
      a[k] = +clamp(a[k] + d, 0, 100).toFixed(1);
    }
    return CB.refresh(p);
  };
})(typeof window !== 'undefined' ? window : globalThis);
