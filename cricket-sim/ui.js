/* Cricket Sim — UI controller: setup, tabs, rendering */

(function () {
  const D = window.CricketData;
  const E = window.CricketEngine;
  const S = window.CricketCareers;

  // Module state
  let currentCareer = null;
  let primaryRoll = null;
  let secondaryRoll = null;
  let activeSheet = 'setup';
  const rendered = new Set();

  // ===== DOM helpers =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') e.className = props[k];
        else if (k === 'style') e.style.cssText = props[k];
        else if (k === 'html') e.innerHTML = props[k];
        else if (k === 'text') e.textContent = props[k];
        else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), props[k]);
        else if (k === 'dataset') {
          for (const dk in props[k]) e.dataset[dk] = props[k][dk];
        } else e.setAttribute(k, props[k]);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function setStatus(text, recordText) {
    const status = $('#xl-status');
    if (status) status.textContent = text;
    if (recordText !== undefined) {
      const rec = $('#xl-status-record');
      if (rec) rec.textContent = recordText;
    }
  }

  function toast(text, duration) {
    const t = el('div', { class: 'xl-toast', text });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration || 1800);
  }

  // ===== Setup screen =====

  function populateNations() {
    const sel = $('#su-nation');
    if (!sel) return;
    sel.innerHTML = '';
    D.NATIONS.forEach((n, i) => {
      const opt = el('option', { value: n.code }, n.name);
      sel.appendChild(opt);
    });
    // Default to Australia
    sel.value = 'AUS';
  }

  function updateStyleDropdown() {
    const role = $('#su-role').value;
    const styleSel = $('#su-style');
    const styleLabel = $('#su-style-label');
    styleSel.innerHTML = '';

    if (role === 'batter') {
      styleLabel.textContent = 'Batting Position:';
      D.BATTING_POSITIONS.forEach(p => {
        styleSel.appendChild(el('option', { value: p.id }, p.label));
      });
      $('#su-primary-label').textContent = 'Batting skill (d20):';
      $('#su-secondary-label').textContent = 'Bowling secondary (d10):';
    } else {
      styleLabel.textContent = 'Bowling Type:';
      D.BOWLING_TYPES.forEach(t => {
        styleSel.appendChild(el('option', { value: t.id }, t.label));
      });
      $('#su-primary-label').textContent = 'Bowling skill (d20):';
      $('#su-secondary-label').textContent = 'Batting secondary (d10):';
    }
  }

  function rollDice(max) {
    return Math.floor(Math.random() * max) + 1;
  }

  function animateRoll(buttonId, resultId, tierId, max, onDone) {
    const btn = $('#' + buttonId);
    const result = $('#' + resultId);
    const tierEl = $('#' + tierId);
    btn.disabled = true;
    let ticks = 0;
    const maxTicks = 14 + Math.floor(Math.random() * 6);
    result.classList.remove(...Array.from(result.classList).filter(c => c.startsWith('xl-tier-')));
    tierEl.textContent = '';
    const interval = setInterval(() => {
      const r = rollDice(max);
      result.textContent = r + ' / ' + max;
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(interval);
        btn.disabled = false;
        onDone(r);
      }
    }, 50);
  }

  function applyPrimaryRoll(value) {
    primaryRoll = value;
    const result = $('#su-primary-result');
    const tierEl = $('#su-primary-tier');
    const role = $('#su-role').value;
    result.textContent = value + ' / 20';
    const tierCls = D.tierClass(value, 20);
    result.className = 'xl-cell xl-cell-result';
    tierEl.className = 'xl-cell xl-cell-tier ' + tierCls;
    tierEl.textContent = role === 'batter' ? D.batTierLabel(value) : D.bowlTierLabel(value);
    checkGenerateReady();
  }

  function applySecondaryRoll(value) {
    secondaryRoll = value;
    const result = $('#su-secondary-result');
    const tierEl = $('#su-secondary-tier');
    const role = $('#su-role').value;
    result.textContent = value + ' / 10';
    const tierCls = D.tierClass(value, 10);
    result.className = 'xl-cell xl-cell-result';
    tierEl.className = 'xl-cell xl-cell-tier ' + tierCls;
    tierEl.textContent = role === 'batter' ? D.bowlTierLabelSecondary(value) : D.batTierLabelSecondary(value);
    checkGenerateReady();
  }

  function checkGenerateReady() {
    const ready = primaryRoll != null && secondaryRoll != null;
    $('#su-generate').disabled = !ready;
    if (ready) {
      $('#su-help').textContent = "Ready to generate. Click GENERATE CAREER to roll a fantastical Test career.";
    }
  }

  function resetRolls() {
    primaryRoll = null;
    secondaryRoll = null;
    $('#su-primary-result').textContent = '—';
    $('#su-primary-result').className = 'xl-cell xl-cell-result';
    $('#su-primary-tier').textContent = '';
    $('#su-primary-tier').className = 'xl-cell xl-cell-tier';
    $('#su-secondary-result').textContent = '—';
    $('#su-secondary-result').className = 'xl-cell xl-cell-result';
    $('#su-secondary-tier').textContent = '';
    $('#su-secondary-tier').className = 'xl-cell xl-cell-tier';
    $('#su-generate').disabled = true;
  }

  function bindSetup() {
    populateNations();
    $('#su-role').addEventListener('change', () => {
      updateStyleDropdown();
      // Re-evaluate tier labels for current rolls under new role
      if (primaryRoll != null) applyPrimaryRoll(primaryRoll);
      if (secondaryRoll != null) applySecondaryRoll(secondaryRoll);
    });
    updateStyleDropdown();

    $('#su-roll-primary').addEventListener('click', () => {
      animateRoll('su-roll-primary', 'su-primary-result', 'su-primary-tier', 20, applyPrimaryRoll);
    });
    $('#su-roll-secondary').addEventListener('click', () => {
      animateRoll('su-roll-secondary', 'su-secondary-result', 'su-secondary-tier', 10, applySecondaryRoll);
    });

    $('#su-generate').addEventListener('click', generateCareer);
  }

  // ===== Career generation =====

  function generateCareer() {
    if (primaryRoll == null || secondaryRoll == null) return;
    const setup = {
      name: $('#su-name').value || '',
      nation: $('#su-nation').value,
      role: $('#su-role').value,
      styleId: $('#su-style').value,
      primaryRoll,
      secondaryRoll
    };

    setStatus('Generating career...');
    toast('Simulating Test career — please wait...');

    // Defer to next tick so toast renders first
    setTimeout(() => {
      try {
        const career = E.generateCareer(setup);
        S.add(career);
        loadCareer(career);
        setStatus('Ready', career.hero.shortName + ' • ' + career.matches.length + ' Tests');
        toast('Career generated: ' + career.matches.length + ' Tests, batting avg ' + career.summary.battingAvg.toFixed(2));
      } catch (e) {
        console.error(e);
        toast('Error generating career: ' + e.message);
        setStatus('Error');
      }
    }, 30);
  }

  function loadCareer(career) {
    currentCareer = career;
    rendered.clear();
    // Re-render summary and switch to it
    renderSummary(career);
    rendered.add('summary');
    switchSheet('summary');
    // Update title bar text
    const titleText = $('#xl-title-text');
    if (titleText) titleText.textContent = 'Microsoft Excel - ' + career.hero.shortName + '.xls';
  }

  // ===== Tab switching =====

  function bindTabs() {
    $$('.xl-tab').forEach(t => {
      t.addEventListener('click', () => {
        const sheet = t.dataset.sheet;
        switchSheet(sheet);
      });
    });
    $('#scorecard-close').addEventListener('click', closeScorecard);
    $('#scorecard-modal').addEventListener('click', (e) => {
      if (e.target.id === 'scorecard-modal') closeScorecard();
    });
  }

  function switchSheet(sheet) {
    activeSheet = sheet;
    $$('.xl-sheet').forEach(s => s.classList.remove('active'));
    $$('.xl-tab').forEach(t => t.classList.toggle('active', t.dataset.sheet === sheet));
    const target = $('#sheet-' + sheet);
    if (target) target.classList.add('active');

    // Update formula bar
    const nameBox = $('#xl-name-box');
    const formula = $('#xl-formula-input');
    if (nameBox) nameBox.textContent = sheet.charAt(0).toUpperCase() + sheet.slice(1) + '!A1';
    if (formula) {
      const labels = {
        setup: 'Cricket Career Generator',
        summary: currentCareer ? '=CAREER_SUMMARY(' + currentCareer.hero.shortName + ')' : 'No career loaded',
        batting: currentCareer ? '=BATTING_RECORDS(' + currentCareer.hero.shortName + ')' : 'No career loaded',
        bowling: currentCareer ? '=BOWLING_RECORDS(' + currentCareer.hero.shortName + ')' : 'No career loaded',
        matches: currentCareer ? '=MATCH_LOG(' + currentCareer.hero.shortName + ')' : 'No career loaded',
        graphs: currentCareer ? '=CAREER_CHARTS(' + currentCareer.hero.shortName + ')' : 'No career loaded',
        careers: '=SAVED_CAREERS()'
      };
      formula.textContent = labels[sheet] || '';
    }

    // Lazy render
    if (sheet !== 'setup' && sheet !== 'careers' && !currentCareer) return;
    if (sheet === 'careers') renderCareers();
    else if (!rendered.has(sheet)) {
      if (sheet === 'summary')  renderSummary(currentCareer);
      if (sheet === 'batting')  renderBatting(currentCareer);
      if (sheet === 'bowling')  renderBowling(currentCareer);
      if (sheet === 'matches')  renderMatches(currentCareer);
      if (sheet === 'graphs')   renderGraphs(currentCareer);
      rendered.add(sheet);
    } else if (sheet === 'graphs') {
      // Graphs need re-render on tab activation (canvas sizing)
      renderGraphs(currentCareer);
    }
  }

  // ===== Render helpers =====

  function fmt(num, dp) {
    if (num == null) return '-';
    if (isNaN(num)) return '-';
    return Number(num).toFixed(dp != null ? dp : 0);
  }

  function fmtOvers(o) {
    // o stored as float overs.balls, e.g. 32.4 means 32 overs 4 balls
    const whole = Math.floor(o);
    const balls = Math.round((o - whole) * 10);
    return whole + (balls > 0 ? '.' + balls : '');
  }

  function renderSummary(career) {
    const c = career;
    const s = c.summary;
    const hero = c.hero;
    const nation = D.getNation(hero.nation);
    const positionLabel = c.setup.role === 'batter'
      ? (D.getBattingPosition(c.setup.styleId) || {}).label
      : (D.getBowlingType(c.setup.styleId) || {}).label;

    const root = $('#sheet-summary');
    root.innerHTML = '';

    // Header block
    const header = el('div', { class: 'xl-summary-block' });
    header.appendChild(el('h2', null, hero.name));
    const meta = el('div', { class: 'xl-meta' });
    meta.innerHTML =
      '<b>' + nation.name + '</b> &nbsp;|&nbsp; ' +
      (c.setup.role === 'batter' ? 'Batter' : 'Bowler') + ' &nbsp;|&nbsp; ' +
      positionLabel + '<br>' +
      'Debut: ' + c.startYear + ' &nbsp;|&nbsp; Retired: ' + c.retiredYear +
      ' &nbsp;|&nbsp; Span: ' + (c.retiredYear - c.startYear + 1) + ' years<br>' +
      '<i>' + c.retiredReason + '</i><br>' +
      'Rolls: d20 = <b>' + c.setup.primaryRoll + '</b>, d10 = <b>' + c.setup.secondaryRoll + '</b>';
    header.appendChild(meta);
    root.appendChild(header);

    // Big number cards
    const cards = el('div', { class: 'xl-stat-grid', style: 'margin: 0 12px 12px;' });
    const isBatter = c.setup.role === 'batter';

    // Batting stats
    const battingCards = [
      { label: 'Matches', value: s.matches, sub: '' },
      { label: 'Innings', value: s.battingInnings, sub: s.notOuts + ' not out' },
      { label: 'Runs', value: s.runs.toLocaleString(), sub: '' },
      { label: 'Average', value: fmt(s.battingAvg, 2), sub: 'SR ' + fmt(s.strikeRate, 1) },
      { label: 'High Score', value: s.high + (s.highNotOut ? '*' : ''), sub: '' },
      { label: 'Hundreds', value: s.hundreds, sub: s.fifties + ' fifties' },
      { label: 'Double / Triple', value: s.doubles + ' / ' + s.triples, sub: '' },
      { label: 'Ducks', value: s.ducks, sub: '' }
    ];
    battingCards.forEach(cd => {
      cards.appendChild(el('div', { class: 'xl-stat' },
        el('div', { class: 'xl-stat-label' }, cd.label),
        el('div', { class: 'xl-stat-value' }, String(cd.value)),
        el('div', { class: 'xl-stat-sub' }, cd.sub)
      ));
    });
    root.appendChild(el('div', { class: 'xl-section-header' }, 'BATTING CAREER'));
    root.appendChild(cards);

    // Bowling stats (only show if relevant)
    if (s.wickets > 0 || c.setup.role === 'bowler') {
      root.appendChild(el('div', { class: 'xl-section-header' }, 'BOWLING CAREER'));
      const bowlCards = el('div', { class: 'xl-stat-grid', style: 'margin: 0 12px 12px;' });
      const bowlData = [
        { label: 'Innings', value: s.bowlingInnings },
        { label: 'Wickets', value: s.wickets, sub: s.fiveWInn + ' five-fers' },
        { label: 'Average', value: s.bowlingAvg ? fmt(s.bowlingAvg, 2) : '-', sub: 'SR ' + (s.bowlStrikeRate ? fmt(s.bowlStrikeRate, 1) : '-') },
        { label: 'Economy', value: fmt(s.economy, 2) },
        { label: 'Best (Inn)', value: s.bestBowlingInn },
        { label: 'Best (Match)', value: s.bestBowlingMatch, sub: s.tenWMatch + ' ten-fers' },
        { label: 'Maidens', value: s.maidens },
        { label: 'Overs', value: fmt(s.oversBowled, 1) }
      ];
      bowlData.forEach(cd => {
        bowlCards.appendChild(el('div', { class: 'xl-stat' },
          el('div', { class: 'xl-stat-label' }, cd.label),
          el('div', { class: 'xl-stat-value' }, String(cd.value)),
          el('div', { class: 'xl-stat-sub' }, cd.sub || '')
        ));
      });
      root.appendChild(bowlCards);
    }

    // Team record
    root.appendChild(el('div', { class: 'xl-section-header' }, 'TEAM RECORD'));
    const teamCards = el('div', { class: 'xl-stat-grid', style: 'margin: 0 12px 12px; grid-template-columns: repeat(4, 1fr);' });
    [
      { label: 'Won', value: s.wins },
      { label: 'Lost', value: s.losses },
      { label: 'Drawn', value: s.draws },
      { label: 'Tied', value: s.ties }
    ].forEach(cd => {
      teamCards.appendChild(el('div', { class: 'xl-stat' },
        el('div', { class: 'xl-stat-label' }, cd.label),
        el('div', { class: 'xl-stat-value' }, String(cd.value)),
        el('div', { class: 'xl-stat-sub' }, '')
      ));
    });
    root.appendChild(teamCards);

    setStatus('Ready', hero.shortName + ' • ' + s.matches + ' Tests');
  }

  // Batting innings table
  function renderBatting(career) {
    const root = $('#sheet-batting');
    root.innerHTML = '';

    const allInnings = [];
    career.matches.forEach(m => {
      m.heroBatting.forEach((b, i) => {
        allInnings.push({
          matchNum: m.matchNum,
          year: m.year,
          opp: D.getNation(m.oppNation).short,
          venue: m.venue,
          home: m.isHome,
          innNo: b.inningsIdx + 1,
          ...b,
          match: m
        });
      });
    });

    // Sort by match num desc (most recent first)
    allInnings.sort((a, b) => b.matchNum - a.matchNum || a.inningsIdx - b.inningsIdx);

    const cols = [
      { label: '#',    cls: 'xl-row-num-h' },
      { label: 'Match',cls: 'xl-num' },
      { label: 'Yr',   cls: 'xl-num' },
      { label: 'Vs',   cls: 'xl-center' },
      { label: 'Venue',cls: '' },
      { label: 'Inn',  cls: 'xl-center' },
      { label: 'Runs', cls: 'xl-num' },
      { label: 'B',    cls: 'xl-num' },
      { label: '4s',   cls: 'xl-num' },
      { label: '6s',   cls: 'xl-num' },
      { label: 'SR',   cls: 'xl-num' },
      { label: 'How Out', cls: '' }
    ];

    const table = el('table', { class: 'xl-data-grid' });
    const thead = el('thead');
    const trh = el('tr');
    cols.forEach(c => trh.appendChild(el('th', { class: c.cls }, c.label)));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el('tbody');
    allInnings.forEach((inn, idx) => {
      const sr = inn.balls > 0 ? (inn.runs * 100 / inn.balls).toFixed(1) : '-';
      const isMilestone = inn.runs >= 100;
      const tr = el('tr', { class: 'clickable' + (isMilestone ? ' xl-milestone' : '') });
      tr.addEventListener('click', () => openScorecard(inn.match));
      tr.appendChild(el('td', { class: 'xl-row-num' }, String(idx + 1)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.matchNum)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.year)));
      tr.appendChild(el('td', { class: 'xl-center' }, (inn.home ? 'v ' : '@ ') + inn.opp));
      tr.appendChild(el('td', null, inn.venue));
      tr.appendChild(el('td', { class: 'xl-center' }, String(inn.innNo)));
      tr.appendChild(el('td', { class: 'xl-num xl-bold' }, inn.runs + (inn.out ? '' : '*')));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.balls)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.fours)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.sixes)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(sr)));
      tr.appendChild(el('td', null, inn.howOut));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(el('div', { class: 'xl-section-header' },
      'BATTING — ' + allInnings.length + ' innings (click a row for the full scorecard)'));
    root.appendChild(table);
  }

  // Bowling innings table
  function renderBowling(career) {
    const root = $('#sheet-bowling');
    root.innerHTML = '';

    const allInnings = [];
    career.matches.forEach(m => {
      m.heroBowling.forEach((b) => {
        allInnings.push({
          matchNum: m.matchNum,
          year: m.year,
          opp: D.getNation(m.oppNation).short,
          venue: m.venue,
          home: m.isHome,
          innNo: b.inningsIdx + 1,
          ...b,
          match: m
        });
      });
    });

    if (allInnings.length === 0) {
      root.appendChild(el('div', { class: 'xl-empty' }, 'No bowling innings — this player doesn\'t bowl.'));
      return;
    }

    allInnings.sort((a, b) => b.matchNum - a.matchNum || a.inningsIdx - b.inningsIdx);

    const cols = ['#','Match','Yr','Vs','Venue','Inn','O','M','R','W','Econ'];
    const table = el('table', { class: 'xl-data-grid' });
    const thead = el('thead');
    const trh = el('tr');
    cols.forEach((c, i) => trh.appendChild(el('th', { class: (i === 0 ? 'xl-row-num-h' : (i >= 6 ? 'xl-num' : (i === 3 || i === 5 ? 'xl-center' : ''))) }, c)));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el('tbody');
    allInnings.forEach((inn, idx) => {
      const econ = inn.overs > 0 ? (inn.runs / inn.overs).toFixed(2) : '-';
      const isFiver = inn.wickets >= 5;
      const tr = el('tr', { class: 'clickable' + (isFiver ? ' xl-milestone' : '') });
      tr.addEventListener('click', () => openScorecard(inn.match));
      tr.appendChild(el('td', { class: 'xl-row-num' }, String(idx + 1)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.matchNum)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.year)));
      tr.appendChild(el('td', { class: 'xl-center' }, (inn.home ? 'v ' : '@ ') + inn.opp));
      tr.appendChild(el('td', null, inn.venue));
      tr.appendChild(el('td', { class: 'xl-center' }, String(inn.innNo)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.overs)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.maidens)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(inn.runs)));
      tr.appendChild(el('td', { class: 'xl-num xl-bold' }, String(inn.wickets)));
      tr.appendChild(el('td', { class: 'xl-num' }, econ));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(el('div', { class: 'xl-section-header' },
      'BOWLING — ' + allInnings.length + ' innings (click a row for the full scorecard)'));
    root.appendChild(table);
  }

  // Match log
  function renderMatches(career) {
    const root = $('#sheet-matches');
    root.innerHTML = '';

    const matches = career.matches.slice().reverse();
    const cols = ['#','Yr','Vs','Venue','Toss','Result','Bat','Bowl'];

    const table = el('table', { class: 'xl-data-grid' });
    const thead = el('thead');
    const trh = el('tr');
    cols.forEach((c, i) => trh.appendChild(el('th', { class: (i === 0 ? 'xl-row-num-h' : (i === 1 ? 'xl-num' : (i === 2 ? 'xl-center' : ''))) }, c)));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el('tbody');
    matches.forEach((m, idx) => {
      const heroBatStr = m.heroBatting.map(b => b.runs + (b.out ? '' : '*')).join(' & ') || '-';
      const heroBowlStr = m.heroBowling.map(b => b.wickets + '/' + b.runs).join(' & ') || '-';
      const resCls = m.resultCode === 'win' ? 'xl-good' : m.resultCode === 'loss' ? 'xl-bad' : '';
      const tr = el('tr', { class: 'clickable' });
      tr.addEventListener('click', () => openScorecard(m));
      tr.appendChild(el('td', { class: 'xl-row-num' }, String(m.matchNum)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(m.year)));
      tr.appendChild(el('td', { class: 'xl-center' }, (m.isHome ? 'v ' : '@ ') + D.getNation(m.oppNation).short));
      tr.appendChild(el('td', null, m.venue));
      tr.appendChild(el('td', null, D.getNation(m.tossWinner).short + ' (' + m.tossDecision + ')'));
      tr.appendChild(el('td', { class: resCls }, m.result));
      tr.appendChild(el('td', { class: 'xl-num' }, heroBatStr));
      tr.appendChild(el('td', { class: 'xl-num' }, heroBowlStr));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(el('div', { class: 'xl-section-header' },
      'MATCH LOG — ' + matches.length + ' Tests (click for full scorecard)'));
    root.appendChild(table);
  }

  // ===== Scorecard modal =====

  function openScorecard(match) {
    const modal = $('#scorecard-modal');
    const body = $('#scorecard-body');
    const title = $('#scorecard-title');
    const heroNation = D.getNation(match.heroNation);
    const oppNation = D.getNation(match.oppNation);
    title.textContent = heroNation.short + ' vs ' + oppNation.short + ' — ' + match.year + ' — ' + match.venue;

    body.innerHTML = '';

    // Header
    const header = el('div', { class: 'xl-sc-header' });
    header.appendChild(el('h2', null, heroNation.name + ' vs ' + oppNation.name));
    header.appendChild(el('div', null,
      'Match #' + match.matchNum + ' • ' + match.year + ' • ' + match.venue + (match.isHome ? ' (home)' : ' (away)')));
    header.appendChild(el('div', null,
      'Toss: ' + D.getNation(match.tossWinner).short + ' (' + match.tossDecision + ' first)' +
      (match.followOn ? ' • Follow-on enforced' : '')));
    body.appendChild(header);

    // Result
    body.appendChild(el('div', { class: 'xl-sc-result' }, 'Result: ' + match.result));

    // Innings
    match.innings.forEach((inn, idx) => {
      const innBlock = el('div', { class: 'xl-sc-innings' });
      const battingName = D.getNation(inn.battingTeam).name;
      const innTitle = el('div', { class: 'xl-sc-innings-title' },
        el('div', null, battingName + ' — ' + (idx < 2 ? '1st innings' : '2nd innings') + (inn.declared ? ' (declared)' : '') + (inn.followedOn ? ' (followed on)' : '')),
        el('div', null, inn.total + (inn.wickets < 10 || inn.declared ? '/' + inn.wickets : ' all out') + ' (' + fmtOvers(inn.overs) + ' ov)')
      );
      innBlock.appendChild(innTitle);

      // Batting table
      const batTable = el('table');
      const batThead = el('thead');
      const batTrh = el('tr');
      ['Batter','How Out','R','B','4s','6s','SR'].forEach(h => {
        batTrh.appendChild(el('th', { class: ['R','B','4s','6s','SR'].includes(h) ? 'xl-num' : '' }, h));
      });
      batThead.appendChild(batTrh);
      batTable.appendChild(batThead);

      const batTbody = el('tbody');
      inn.batting.forEach(b => {
        const sr = b.balls > 0 ? (b.runs * 100 / b.balls).toFixed(1) : '-';
        const tr = el('tr', { class: b.isHero ? 'xl-player-row' : '' });
        tr.appendChild(el('td', null, b.name + (b.isKeeper ? ' †' : '')));
        tr.appendChild(el('td', null, b.howOut));
        tr.appendChild(el('td', { class: 'xl-num' }, b.runs + (b.out ? '' : '*')));
        tr.appendChild(el('td', { class: 'xl-num' }, String(b.balls)));
        tr.appendChild(el('td', { class: 'xl-num' }, String(b.fours)));
        tr.appendChild(el('td', { class: 'xl-num' }, String(b.sixes)));
        tr.appendChild(el('td', { class: 'xl-num' }, sr));
        batTbody.appendChild(tr);
      });
      batTable.appendChild(batTbody);
      innBlock.appendChild(batTable);

      innBlock.appendChild(el('div', { class: 'xl-sc-extras' }, 'Extras: ' + inn.extras));
      innBlock.appendChild(el('div', { class: 'xl-sc-total' }, 'Total: ' + inn.total + (inn.wickets < 10 || inn.declared ? '/' + inn.wickets : ' all out') + ' (' + fmtOvers(inn.overs) + ' overs)'));

      // Fall of wickets
      if (inn.fallOfWickets && inn.fallOfWickets.length > 0) {
        const fowText = inn.fallOfWickets.map(f => f.score + '-' + f.wkt + ' (' + f.batter + ', ' + f.overs + ')').join(', ');
        innBlock.appendChild(el('div', { class: 'xl-sc-fow' }, 'Fall of wickets: ' + fowText));
      }

      // Bowling table
      if (inn.bowling && inn.bowling.length > 0) {
        const bowlTable = el('table', { style: 'margin-top: 6px;' });
        const bThead = el('thead');
        const bTrh = el('tr');
        ['Bowler','O','M','R','W','Econ'].forEach(h => {
          bTrh.appendChild(el('th', { class: ['O','M','R','W','Econ'].includes(h) ? 'xl-num' : '' }, h));
        });
        bThead.appendChild(bTrh);
        bowlTable.appendChild(bThead);

        const bTbody = el('tbody');
        inn.bowling.forEach(b => {
          const econ = b.overs > 0 ? (b.runs / b.overs).toFixed(2) : '-';
          const tr = el('tr', { class: b.isHero ? 'xl-player-row' : '' });
          tr.appendChild(el('td', null, b.name));
          tr.appendChild(el('td', { class: 'xl-num' }, String(b.overs)));
          tr.appendChild(el('td', { class: 'xl-num' }, String(b.maidens)));
          tr.appendChild(el('td', { class: 'xl-num' }, String(b.runs)));
          tr.appendChild(el('td', { class: 'xl-num xl-bold' }, String(b.wickets)));
          tr.appendChild(el('td', { class: 'xl-num' }, econ));
          bTbody.appendChild(tr);
        });
        bowlTable.appendChild(bTbody);
        innBlock.appendChild(bowlTable);
      }

      body.appendChild(innBlock);
    });

    modal.removeAttribute('hidden');
  }

  function closeScorecard() {
    $('#scorecard-modal').setAttribute('hidden', '');
  }

  // ===== Graphs =====

  function renderGraphs(career) {
    const root = $('#sheet-graphs');
    root.innerHTML = '';
    const wrap = el('div', { class: 'xl-graphs-wrap' });

    // Build cumulative arrays from heroBatting / heroBowling
    const battingPoints = [];   // {n, runs, avg, cumRuns}
    const bowlingPoints = [];   // {n, wickets, avg, cumWkts}

    let cumRuns = 0, cumOuts = 0, cumInn = 0;
    career.matches.forEach(m => {
      m.heroBatting.forEach(b => {
        cumInn++;
        cumRuns += b.runs;
        if (b.out) cumOuts++;
        const avg = cumOuts > 0 ? cumRuns / cumOuts : cumRuns;
        battingPoints.push({ n: cumInn, runs: b.runs, cumRuns, avg });
      });
    });

    let cumWkts = 0, cumRC = 0, cumOvers = 0, cumBwlInn = 0;
    career.matches.forEach(m => {
      m.heroBowling.forEach(w => {
        cumBwlInn++;
        cumWkts += w.wickets;
        cumRC += w.runs;
        cumOvers += w.overs;
        const avg = cumWkts > 0 ? cumRC / cumWkts : null;
        bowlingPoints.push({ n: cumBwlInn, wkts: w.wickets, cumWkts, avg });
      });
    });

    wrap.appendChild(buildGraph('Cumulative Runs', battingPoints, p => p.cumRuns, 'runs'));
    wrap.appendChild(buildGraph('Running Batting Average', battingPoints, p => p.avg, 'avg'));
    if (bowlingPoints.length > 0) {
      wrap.appendChild(buildGraph('Cumulative Wickets', bowlingPoints, p => p.cumWkts, 'wickets'));
      wrap.appendChild(buildGraph('Running Bowling Average', bowlingPoints, p => p.avg, 'avg (lower is better)'));
    }
    root.appendChild(wrap);
  }

  function buildGraph(title, points, yFn, yLabel) {
    const block = el('div', { class: 'xl-graph-block' });
    block.appendChild(el('h3', null, title));

    if (points.length === 0) {
      block.appendChild(el('div', { class: 'xl-empty' }, 'No data'));
      return block;
    }

    const canvas = el('canvas');
    canvas.width = 720;
    canvas.height = 200;
    block.appendChild(canvas);

    setTimeout(() => drawLineChart(canvas, points, yFn, yLabel), 0);
    return block;
  }

  function drawLineChart(canvas, points, yFn, yLabel) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const padL = 50, padR = 16, padT = 12, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Compute extents
    const yVals = points.map(yFn).filter(v => v != null && !isNaN(v));
    if (yVals.length === 0) return;
    const yMin = 0;
    const yMax = Math.max(...yVals) * 1.1 || 1;
    const xMax = points[points.length - 1].n;

    // Grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = padT + (plotH * i / 5);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#404040';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#404040';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const v = yMin + (yMax - yMin) * (i / 5);
      const y = padT + plotH - (plotH * i / 5);
      ctx.fillText(v >= 100 ? v.toFixed(0) : v.toFixed(1), padL - 4, y + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const xTicks = 6;
    for (let i = 0; i <= xTicks; i++) {
      const xVal = (xMax * i / xTicks);
      const x = padL + (plotW * i / xTicks);
      ctx.fillText(Math.round(xVal), x, padT + plotH + 14);
    }

    // Axis labels
    ctx.textAlign = 'center';
    ctx.fillText('innings →', padL + plotW / 2, H - 4);

    // Line
    ctx.strokeStyle = '#000080';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    points.forEach(p => {
      const v = yFn(p);
      if (v == null || isNaN(v)) return;
      const x = padL + (p.n / xMax) * plotW;
      const y = padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // ===== Careers tab =====

  function renderCareers() {
    const root = $('#sheet-careers');
    root.innerHTML = '';
    const careers = S.load().slice().reverse();

    if (careers.length === 0) {
      root.appendChild(el('div', { class: 'xl-empty' }, 'No saved careers yet. Generate one in the Setup tab.'));
      return;
    }

    const cols = ['#','Name','Nation','Role','Tests','Runs','Bat Avg','Wkts','Bowl Avg','High','BB','Generated','Actions'];
    const table = el('table', { class: 'xl-data-grid' });
    const thead = el('thead');
    const trh = el('tr');
    cols.forEach((c, i) => trh.appendChild(el('th', { class: i === 0 ? 'xl-row-num-h' : '' }, c)));
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el('tbody');
    careers.forEach((c, idx) => {
      const s = c.summary;
      const nation = D.getNation(c.hero.nation);
      const dateStr = new Date(c.generatedAt).toLocaleDateString();
      const tr = el('tr');
      if (currentCareer && currentCareer.id === c.id) tr.style.backgroundColor = '#ffffcc';
      tr.appendChild(el('td', { class: 'xl-row-num' }, String(idx + 1)));
      tr.appendChild(el('td', { class: 'xl-bold' }, c.hero.name));
      tr.appendChild(el('td', null, nation.short));
      tr.appendChild(el('td', null, c.setup.role === 'batter' ? 'Bat' : 'Bowl'));
      tr.appendChild(el('td', { class: 'xl-num' }, String(s.matches)));
      tr.appendChild(el('td', { class: 'xl-num' }, s.runs.toLocaleString()));
      tr.appendChild(el('td', { class: 'xl-num' }, fmt(s.battingAvg, 2)));
      tr.appendChild(el('td', { class: 'xl-num' }, String(s.wickets)));
      tr.appendChild(el('td', { class: 'xl-num' }, s.bowlingAvg ? fmt(s.bowlingAvg, 2) : '-'));
      tr.appendChild(el('td', { class: 'xl-num' }, s.high + (s.highNotOut ? '*' : '')));
      tr.appendChild(el('td', { class: 'xl-num' }, s.bestBowlingInn));
      tr.appendChild(el('td', null, dateStr));
      const actions = el('td');
      actions.appendChild(el('button', {
        class: 'xl-mini-btn',
        onclick: (e) => { e.stopPropagation(); loadCareer(c); switchSheet('summary'); }
      }, 'Open'));
      actions.appendChild(document.createTextNode(' '));
      actions.appendChild(el('button', {
        class: 'xl-mini-btn',
        onclick: (e) => {
          e.stopPropagation();
          if (confirm('Delete career: ' + c.hero.name + '?')) {
            S.remove(c.id);
            if (currentCareer && currentCareer.id === c.id) {
              currentCareer = null;
              rendered.clear();
              $('#xl-title-text').textContent = 'Microsoft Excel - Career.xls';
              setStatus('Ready', 'No career loaded');
            }
            renderCareers();
          }
        }
      }, 'Delete'));
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    root.appendChild(el('div', { class: 'xl-section-header' },
      'SAVED CAREERS — ' + careers.length + (careers.length === 1 ? ' career' : ' careers')));
    root.appendChild(table);
  }

  // ===== Init =====

  function init() {
    bindSetup();
    bindTabs();

    // Load most recent career if any
    const all = S.load();
    if (all.length > 0) {
      loadCareer(all[all.length - 1]);
      // Stay on setup tab — show that previous career exists
      switchSheet('setup');
      setStatus('Ready', all[all.length - 1].hero.shortName + ' • ' + all[all.length - 1].matches.length + ' Tests (loaded)');
    } else {
      setStatus('Ready', 'No career loaded');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
