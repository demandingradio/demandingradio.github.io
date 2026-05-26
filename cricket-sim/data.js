/* Cricket Sim — static data: nations, names, bowling types, grounds, tiers */

window.CricketData = (function () {

  // The 12 ICC Full Members (Test playing nations).
  const NATIONS = [
    { code: 'AUS', name: 'Australia',    short: 'Aus',  rating: 9 },
    { code: 'ENG', name: 'England',      short: 'Eng',  rating: 9 },
    { code: 'IND', name: 'India',        short: 'Ind',  rating: 10 },
    { code: 'NZL', name: 'New Zealand',  short: 'NZ',   rating: 8 },
    { code: 'PAK', name: 'Pakistan',     short: 'Pak',  rating: 8 },
    { code: 'RSA', name: 'South Africa', short: 'SA',   rating: 8 },
    { code: 'SRI', name: 'Sri Lanka',    short: 'SL',   rating: 7 },
    { code: 'WIN', name: 'West Indies',  short: 'WI',   rating: 7 },
    { code: 'BAN', name: 'Bangladesh',   short: 'Ban',  rating: 6 },
    { code: 'ZIM', name: 'Zimbabwe',     short: 'Zim',  rating: 5 },
    { code: 'IRE', name: 'Ireland',      short: 'Ire',  rating: 5 },
    { code: 'AFG', name: 'Afghanistan',  short: 'Afg',  rating: 5 }
  ];

  // First-name and surname pools per nation. Not exhaustive — meant to feel
  // plausible. Names are common cricketing surnames + plausible first names.
  const NAMES = {
    AUS: {
      first: ['Tom','Matt','Steve','Mitchell','Glenn','Pat','Josh','David','Cameron','Marnus','Travis','Usman','Nathan','Adam','Brett','Justin','Ricky','Michael','Jack','Sam','Andrew','Aaron','Ben','Damien','Greg','Mark','Shane','Brad','Chris','James','Dean'],
      last: ['Smith','Jones','Warner','Cummins','Starc','Hazlewood','Lyon','Head','Labuschagne','Khawaja','Maxwell','Finch','Carey','Ponting','Hayden','Langer','Gilchrist','Hussey','Clarke','Watson','Symonds','Bichel','Lehmann','Border','Waugh','Taylor','Bevan','Hogg','MacGill','Bailey']
    },
    ENG: {
      first: ['Joe','Ben','Jonny','Harry','Zak','Ollie','Mark','Stuart','James','Chris','Jos','Moeen','Adil','Sam','Jack','Dom','Jonny','Rory','Dawid','Keaton','Alastair','Andrew','Kevin','Ian','Graham','Michael','Nasser','Marcus','Robert','Phil','Liam'],
      last: ['Root','Stokes','Bairstow','Brook','Crawley','Pope','Wood','Broad','Anderson','Buttler','Ali','Rashid','Curran','Leach','Bashir','Sibley','Bairstow','Burns','Malan','Jennings','Cook','Strauss','Pietersen','Bell','Gooch','Atherton','Hussain','Trescothick','Key','Mustard','Plunkett']
    },
    IND: {
      first: ['Virat','Rohit','Cheteshwar','Ajinkya','KL','Rishabh','Ravichandran','Ravindra','Mohammed','Jasprit','Shubman','Hardik','Suryakumar','Ishan','Yashasvi','Sachin','Rahul','Sourav','VVS','Anil','Harbhajan','Zaheer','Gautam','Yuvraj','Ishant','Umesh','Wriddhiman','Pragyan','Shikhar','Murali','Karun'],
      last: ['Kohli','Sharma','Pujara','Rahane','Rahul','Pant','Ashwin','Jadeja','Shami','Bumrah','Gill','Pandya','Yadav','Kishan','Jaiswal','Tendulkar','Dravid','Ganguly','Laxman','Kumble','Singh','Khan','Gambhir','Vijay','Karthik','Ojha','Saha','Dhawan','Vihari','Iyer','Nair']
    },
    NZL: {
      first: ['Kane','Tom','Devon','Daryl','Tim','Trent','Kyle','Neil','Mitchell','Glenn','Henry','Will','Matt','Brendon','Ross','Martin','Stephen','Daniel','Chris','Jacob','Ish','Tom','BJ','Hamish','Jeetan','Nathan','Colin','Doug','Shane','Andre'],
      last: ['Williamson','Latham','Conway','Mitchell','Southee','Boult','Jamieson','Wagner','Santner','Phillips','Nicholls','Young','Henry','McCullum','Taylor','Crowe','Fleming','Vettori','Cairns','Astle','Sodhi','Watling','Watling','Marshall','Patel','Astle','Munro','Bracewell','Bond','Adams']
    },
    PAK: {
      first: ['Babar','Mohammad','Shaheen','Naseem','Hasan','Shadab','Imam','Abdullah','Saud','Salman','Haris','Fakhar','Yasir','Asad','Misbah','Younis','Inzamam','Saeed','Wasim','Waqar','Saqlain','Mushtaq','Shahid','Shoaib','Umar','Azhar','Sarfaraz','Ahmed','Faheem','Iftikhar','Khurram'],
      last: ['Azam','Rizwan','Afridi','Shah','Ali','Khan','ul-Haq','Shafique','Aslam','Agha','Rauf','Zaman','Hameed','Shafiq','ul-Haq','Khan','ul-Haq','Anwar','Akram','Younis','Mushtaq','Ahmed','Afridi','Akhtar','Akmal','Mahmood','Khan','Sohail','Abbas','Ashraf','Manzoor']
    },
    RSA: {
      first: ['Temba','Aiden','Dean','Heinrich','Rassie','Kagiso','Anrich','Marco','Keshav','Quinton','Wiaan','Lungi','Tabraiz','Reeza','Tristan','Jacques','AB','Hashim','Dale','Morne','Vernon','Faf','JP','Graeme','Mark','Allan','Daryll','Herschelle','Lance','Jonty','Gary'],
      last: ['Bavuma','Markram','Elgar','Klaasen','van der Dussen','Rabada','Nortje','Jansen','Maharaj','de Kock','Mulder','Ngidi','Shamsi','Hendricks','Stubbs','Kallis','de Villiers','Amla','Steyn','Morkel','Philander','du Plessis','Duminy','Smith','Boucher','Donald','Cullinan','Gibbs','Klusener','Rhodes','Kirsten']
    },
    SRI: {
      first: ['Dimuth','Dinesh','Angelo','Dhananjaya','Pathum','Charith','Kusal','Niroshan','Lasith','Wanindu','Prabath','Asitha','Lahiru','Ramesh','Mahela','Kumar','Tillakaratne','Sanath','Aravinda','Arjuna','Marvan','Muttiah','Chaminda','Rangana','Suranga','Thilan','Upul','Dilshan','Jeevan','Avishka','Pramod'],
      last: ['Karunaratne','Chandimal','Mathews','de Silva','Nissanka','Asalanka','Mendis','Dickwella','Embuldeniya','Hasaranga','Jayasuriya','Fernando','Kumara','Mendis','Jayawardene','Sangakkara','Dilshan','Jayasuriya','de Silva','Ranatunga','Atapattu','Muralitharan','Vaas','Herath','Eranga','Samaraweera','Tharanga','Dilshan','Mendis','Fernando','Nissanka']
    },
    WIN: {
      first: ['Kraigg','Tagenarine','Jermaine','Alick','Roston','Joshua','Jason','Alzarri','Kemar','Shamarh','Nicholas','Kyle','Shai','Brandon','Mikyle','Brian','Chris','Shivnarine','Curtly','Courtney','Viv','Gordon','Desmond','Richie','Malcolm','Carl','Garry','Michael','Marlon','Dwayne','Sherwin'],
      last: ['Brathwaite','Chanderpaul','Blackwood','Athanaze','Chase','Da Silva','Holder','Joseph','Roach','Brooks','Pooran','Mayers','Hope','King','Louis','Lara','Gayle','Chanderpaul','Ambrose','Walsh','Richards','Greenidge','Haynes','Richardson','Marshall','Hooper','Sobers','Holding','Samuels','Bravo','Campbell']
    },
    BAN: {
      first: ['Najmul','Mominul','Mushfiqur','Litton','Shakib','Mehidy','Taijul','Ebadot','Khaled','Taskin','Mahmudul','Mahmudullah','Tamim','Liton','Nayeem','Habibul','Mohammad','Khaled','Mashrafe','Aminul','Rajin','Mohammad','Anamul','Imrul','Soumya','Nasir','Sabbir','Mosaddek','Sadman','Abu','Yasir'],
      last: ['Hossain','Haque','Rahim','Das','Al Hasan','Hasan Miraz','Islam','Hossain','Ahmed','Ahmed','Hasan','Riyad','Iqbal','Das','Hasan','Bashar','Ashraful','Mahmud','Mortaza','Islam','Saleh','Rafique','Haque','Kayes','Sarkar','Hossain','Rahman','Hossain','Islam','Jayed','Ali']
    },
    ZIM: {
      first: ['Craig','Sean','Wessly','Sikandar','Brendan','Innocent','Wesley','Blessing','Donald','Tendai','Andy','Heath','Murray','Graeme','Alistair','Andy','Eddo','Travis','Sean','Hamilton','Tatenda','Vusi','Solomon','Charles','Brian','Prosper','Ryan','Regis','Milton','Elton','Greg'],
      last: ['Ervine','Williams','Madhevere','Raza','Taylor','Kaia','Madhevere','Muzarabani','Tiripano','Chatara','Flower','Streak','Goodwin','Cremer','Campbell','Whittall','Brandes','Friend','Williams','Masakadza','Taibu','Sibanda','Mire','Coventry','Murphy','Utseya','Burl','Chakabva','Shumba','Chigumbura','Lamb']
    },
    IRE: {
      first: ['Andrew','Paul','Andy','Harry','Curtis','Lorcan','Mark','Josh','Andy','Barry','Simi','Craig','Peter','William','Kevin','Niall','Trent','Boyd','Stuart','George','Tim','Eoin','Ed','John','Alex','James','Stephen','Tim','Phil','Gary','Robert'],
      last: ['Balbirnie','Stirling','McBrine','Tector','Campher','Tucker','Adair','Little','McBrine','McCarthy','Singh','Young','Chase','Porterfield','OBrien','OBrien','Johnston','Rankin','Thompson','Dockrell','Murtagh','Morgan','Joyce','Mooney','Cusack','Shannon','Doheny','Stanton','Eaglestone','Wilson','White']
    },
    AFG: {
      first: ['Hashmatullah','Rahmat','Ibrahim','Asghar','Mohammad','Najibullah','Karim','Afsar','Rashid','Mujeeb','Naveen','Fareed','Yamin','Ikram','Hazratullah','Riaz','Nasir','Samiullah','Noor','Allah','Shahidullah','Nawroz','Gulbadin','Dawlat','Sayed','Aftab','Sharafuddin','Wafadar','Qais','Zia','Munir'],
      last: ['Shahidi','Shah','Zadran','Stanikzai','Nabi','Zadran','Janat','Zazai','Khan','ur Rahman','ul-Haq','Ahmad','Ahmadzai','Alikhil','Zazai','Hassan','Jamal','Shinwari','Ali','Mohammadi','Kamal','Mangal','Naib','Zadran','Shirzad','Alam','Ashraf','Momand','Ahmad','ur-Rehman','Ahmad']
    }
  };

  // Batting position groups — d10 secondary determines a bowler's batting position.
  const BATTING_POSITIONS = [
    { id: 'opener',  label: 'Opener (1-2)',          range: [1, 2] },
    { id: 'top',     label: 'Top order (3)',         range: [3, 3] },
    { id: 'middle',  label: 'Middle order (4-5)',    range: [4, 5] },
    { id: 'lower',   label: 'Lower middle (6-7)',    range: [6, 7] },
    { id: 'allr',    label: 'Bowling all-rounder (7-8)', range: [7, 8] },
    { id: 'tail',    label: 'Tail (9-11)',           range: [9, 11] }
  ];

  // Bowling types — each has a bowling load profile.
  // overs per spell, % of bowling workload, economy mod, wicket mod
  const BOWLING_TYPES = [
    { id: 'rfast',  label: 'Right-arm fast',           pace: true,  spin: false, economyMod: 1.00, wicketMod: 1.05, overload: 14 },
    { id: 'rfm',    label: 'Right-arm fast-medium',    pace: true,  spin: false, economyMod: 0.97, wicketMod: 1.00, overload: 16 },
    { id: 'rm',     label: 'Right-arm medium',         pace: true,  spin: false, economyMod: 0.95, wicketMod: 0.92, overload: 18 },
    { id: 'lfast',  label: 'Left-arm fast',            pace: true,  spin: false, economyMod: 1.02, wicketMod: 1.08, overload: 14 },
    { id: 'lfm',    label: 'Left-arm fast-medium',     pace: true,  spin: false, economyMod: 0.98, wicketMod: 1.02, overload: 16 },
    { id: 'off',    label: 'Off-spin',                 pace: false, spin: true,  economyMod: 0.93, wicketMod: 0.95, overload: 24 },
    { id: 'leg',    label: 'Leg-spin',                 pace: false, spin: true,  economyMod: 1.03, wicketMod: 1.06, overload: 22 },
    { id: 'slao',   label: 'Left-arm orthodox spin',   pace: false, spin: true,  economyMod: 0.92, wicketMod: 0.96, overload: 24 },
    { id: 'slws',   label: 'Left-arm wrist spin',      pace: false, spin: true,  economyMod: 1.06, wicketMod: 1.08, overload: 20 }
  ];

  // Famous Test grounds per nation. Used as venues during simulation.
  const GROUNDS = {
    AUS: ['MCG, Melbourne','SCG, Sydney','Adelaide Oval','Gabba, Brisbane','WACA, Perth','Optus Stadium, Perth','Bellerive Oval, Hobart'],
    ENG: ['Lord\'s, London','The Oval, London','Old Trafford, Manchester','Edgbaston, Birmingham','Headingley, Leeds','Trent Bridge, Nottingham','Riverside, Durham'],
    IND: ['Eden Gardens, Kolkata','Wankhede, Mumbai','M. Chinnaswamy, Bengaluru','Chepauk, Chennai','Arun Jaitley, Delhi','Rajiv Gandhi, Hyderabad','Sawai Mansingh, Jaipur'],
    NZL: ['Basin Reserve, Wellington','Hagley Oval, Christchurch','Eden Park, Auckland','Seddon Park, Hamilton','Bay Oval, Mount Maunganui'],
    PAK: ['Gaddafi Stadium, Lahore','National Stadium, Karachi','Rawalpindi Cricket Stadium','Multan Cricket Stadium'],
    RSA: ['Newlands, Cape Town','Wanderers, Johannesburg','Centurion, Pretoria','Kingsmead, Durban','St George\'s, Port Elizabeth'],
    SRI: ['SSC, Colombo','Galle International','P. Sara Oval, Colombo','Pallekele, Kandy'],
    WIN: ['Kensington Oval, Bridgetown','Sabina Park, Kingston','Queens Park, Trinidad','Bourda, Guyana','Antigua Recreation Ground'],
    BAN: ['Sher-e-Bangla, Mirpur','Zahur Ahmed, Chittagong','Sylhet International'],
    ZIM: ['Harare Sports Club','Queens Sports Club, Bulawayo'],
    IRE: ['Stormont, Belfast','Malahide, Dublin'],
    AFG: ['Greater Noida (home venue)','Sharjah (home venue)']
  };

  // d20 → batting average target (mean of career batting avg). Cricket avgs:
  // 20 → 56 (Tendulkar/Lara), 18-19 → 48-52, 15-17 → 42-47, 12-14 → 34-40,
  // 10-11 → 28-32, 5-9 → 18-26, 1-4 → 10-16
  const BAT_TARGET_AVG = {
    20: 56, 19: 51, 18: 47, 17: 44, 16: 41, 15: 38, 14: 35, 13: 32,
    12: 30, 11: 28, 10: 26, 9: 24, 8: 22, 7: 20, 6: 18, 5: 16, 4: 14, 3: 12, 2: 11, 1: 10
  };

  // d20 → bowling average target. 20 → 21 (McGrath/Murali), 1 → 70+
  const BOWL_TARGET_AVG = {
    20: 21, 19: 23, 18: 25, 17: 27, 16: 28, 15: 30, 14: 31, 13: 32,
    12: 34, 11: 36, 10: 38, 9: 40, 8: 42, 7: 45, 6: 48, 5: 52, 4: 58, 3: 64, 2: 72, 1: 82
  };

  // d20 → bowling strike rate (balls/wkt)
  const BOWL_TARGET_SR = {
    20: 50, 19: 52, 18: 55, 17: 57, 16: 60, 15: 62, 14: 64, 13: 66,
    12: 68, 11: 70, 10: 72, 9: 74, 8: 76, 7: 80, 6: 84, 5: 90, 4: 95, 3: 105, 2: 115, 1: 130
  };

  // Secondary d10 -> capability in the "off" discipline (capped at d10/2 effective d20)
  // i.e. d10 of 10 ≈ d20 of ~10 in the off discipline
  function secondaryToD20(d10) {
    // 1->1, 2->2, 3->3, 4->4, 5->5, 6->6, 7->7, 8->8, 9->9, 10->10
    return d10;
  }

  function batTierLabel(d) {
    if (d >= 20) return 'Generational great (avg ~55+)';
    if (d >= 18) return 'World-class (avg ~48)';
    if (d >= 15) return 'Quality Test batter (avg ~40+)';
    if (d >= 12) return 'Solid middle order (avg ~33)';
    if (d >= 10) return 'Squad fringe batter (avg ~28)';
    if (d >= 6)  return 'Struggling Test batter (avg ~20)';
    return 'Tail-ender (avg ~12)';
  }

  function bowlTierLabel(d) {
    if (d >= 20) return 'All-time strike bowler (avg ~21)';
    if (d >= 18) return 'World-class wicket-taker (avg ~24)';
    if (d >= 15) return 'Quality Test bowler (avg ~30)';
    if (d >= 12) return 'Honest workhorse (avg ~33)';
    if (d >= 10) return 'Fringe Test bowler (avg ~38)';
    if (d >= 6)  return 'Filler / part-timer (avg ~45)';
    return 'Innocuous (avg ~60+)';
  }

  function batTierLabelSecondary(d) {
    if (d >= 10) return 'Capable all-rounder';
    if (d >= 7)  return 'Useful with the bat';
    if (d >= 4)  return 'Slogging tail-ender';
    return 'Pure number 11';
  }

  function bowlTierLabelSecondary(d) {
    if (d >= 10) return 'Genuine all-rounder';
    if (d >= 7)  return 'Handy 5th bowler';
    if (d >= 4)  return 'Occasional / part-time';
    return 'Never bowls';
  }

  function tierClass(d, max) {
    const pct = d / max;
    if (pct >= 0.95) return 'xl-tier-elite';
    if (pct >= 0.80) return 'xl-tier-great';
    if (pct >= 0.65) return 'xl-tier-good';
    if (pct >= 0.45) return 'xl-tier-ok';
    if (pct >= 0.25) return 'xl-tier-poor';
    return 'xl-tier-woeful';
  }

  function getNation(code) { return NATIONS.find(n => n.code === code); }
  function getBowlingType(id) { return BOWLING_TYPES.find(b => b.id === id); }
  function getBattingPosition(id) { return BATTING_POSITIONS.find(p => p.id === id); }

  // Random name from a nation. Avoids dup first+last where possible by random picks.
  function randomName(nationCode) {
    const pool = NAMES[nationCode] || NAMES.AUS;
    const first = pool.first[Math.floor(Math.random() * pool.first.length)];
    const last  = pool.last[Math.floor(Math.random() * pool.last.length)];
    return first + ' ' + last;
  }

  function randomGround(nationCode) {
    const pool = GROUNDS[nationCode] || GROUNDS.AUS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  return {
    NATIONS,
    NAMES,
    BATTING_POSITIONS,
    BOWLING_TYPES,
    GROUNDS,
    BAT_TARGET_AVG,
    BOWL_TARGET_AVG,
    BOWL_TARGET_SR,
    secondaryToD20,
    batTierLabel,
    bowlTierLabel,
    batTierLabelSecondary,
    bowlTierLabelSecondary,
    tierClass,
    getNation,
    getBowlingType,
    getBattingPosition,
    randomName,
    randomGround
  };
})();
