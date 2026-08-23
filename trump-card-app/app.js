(function () {
  'use strict';

  var SUITS = ['spade', 'heart', 'diamond', 'club'];
  var RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  var ROOM_PARAM = 'room';
  var DEFAULT_HOST_NAME = '방장';
  var DEFAULT_GUEST_NAME = '참가자';

  var RANK_LABELS = {
    '1': 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '10', jack: 'J', queen: 'Q', king: 'K',
  };
  // Each rule is a short name (shown big) plus an optional description
  // (shown small, up to two lines) — both host-editable, broadcast like
  // everything else in `state`.
  var DEFAULT_RULES = {
    '1': { name: '엄지왕', desc: '엄지로 하는 눈치게임\n3바퀴를 돌 동안 미션을 완수해야한다' },
    '2': { name: '지목', desc: '지목당한 사람이 마신다' },
    '3': { name: '나 마셔', desc: '' },
    '4': { name: '여자 마셔', desc: '' },
    '5': { name: '손병호게임', desc: '' },
    '6': { name: '남자 마셔', desc: '' },
    '7': { name: '눈치게임', desc: '' },
    '8': { name: '파트너 지정', desc: '파트너를 지정하고 당한 사람은 8번 카드를 뽑은 사람이 술을 마실 때 같이 마신다' },
    '9': { name: '카테고리', desc: '카테고리를 지정하면 시계 방향으로 대답을 해야한다 (카테고리 음료수 : 게토레이.. 포카리.. 등)' },
    '10': { name: '룰 메이커', desc: '잔 내려놓을 시에 박수 등 룰을 만든다' },
    jack: { name: '전사람 마셔', desc: '' },
    queen: { name: '퀘스천 또는 랜덤게임', desc: '' },
    king: { name: '킹잔 채우기, 4번째 킹은 킹잔 마시기', desc: '' },
  };

  function cloneRules() {
    var copy = {};
    RANKS.forEach(function (r) {
      copy[r] = { name: DEFAULT_RULES[r].name, desc: DEFAULT_RULES[r].desc };
    });
    return copy;
  }

  function rankOf(cardId) {
    return cardId.slice(cardId.indexOf('_') + 1);
  }

  var idleView = document.getElementById('idleView');
  var lobbyView = document.getElementById('lobbyView');
  var playView = document.getElementById('playView');
  var startRoomBtn = document.getElementById('startRoomBtn');

  var qrBox = document.getElementById('qrBox');
  var qrUrl = document.getElementById('qrUrl');
  var qrCopyBtn = document.getElementById('qrCopyBtn');
  var nicknameInput = document.getElementById('nicknameInput');
  var participantsCountEl = document.getElementById('participantsCount');
  var participantsListEl = document.getElementById('participantsList');
  var joinNoteEl = document.getElementById('joinNote');
  var joinBtn = document.getElementById('joinBtn');
  var launchBtn = document.getElementById('launchBtn');

  var cardEl = document.getElementById('card');
  var cardUse = document.getElementById('cardUse');
  var counterEl = document.getElementById('counter');
  var hintEl = document.getElementById('hint');
  var ruleOverlayEl = document.getElementById('ruleOverlay');
  var ruleOverlayTextEl = document.getElementById('ruleOverlayText');
  var ruleOverlayDescEl = document.getElementById('ruleOverlayDesc');
  var ruleOverlayHintEl = document.getElementById('ruleOverlayHint');
  var ruleTimerSelect = document.getElementById('ruleTimerSelect');
  var nextBtn = document.getElementById('nextBtn');
  var resetBtn = document.getElementById('resetBtn');
  var controlsFooter = document.querySelector('.controls');

  var rulesBtn = document.getElementById('rulesBtn');
  var rulesModal = document.getElementById('rulesModal');
  var rulesModalTitle = document.getElementById('rulesModalTitle');
  var rulesCloseBtn = document.getElementById('rulesCloseBtn');
  var rulesListEl = document.getElementById('rulesList');

  // ---------- networking state ----------
  // The host phone holds the one authoritative copy of `state` and
  // broadcasts it to everyone on every change; a joining phone only ever
  // renders whatever `state` the host last sent it. No shared document,
  // no external backend — just a direct P2P data channel per participant,
  // with the host as the hub.
  var isHost = false;
  var peer = null;
  var hostConn = null; // client's connection to the host
  var clientConns = []; // host's [{conn, uid}] for connected participants
  var nextUid = 0;
  var myUid = null; // this device's own participant uid, once joined
  var qrDrawn = false;
  var lastRuleShownSeq = -1; // state.dealSeq value we've already popped the rule overlay for

  // ---------- rule popup sound (a plain synthesized tone, so there's no
  // audio asset to fetch/cache; mobile browsers block audio until a user
  // gesture happens, so we lazily create/unlock the AudioContext on the
  // very first tap anywhere in the app) ----------
  var audioCtx = null;
  function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }
  document.addEventListener('click', function unlockAudioOnce() {
    var ctx = ensureAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    document.removeEventListener('click', unlockAudioOnce);
  }, { once: true });

  function playRuleSound() {
    var ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      /* sound is a nice-to-have; never let it break the game */
    }
  }

  var state = {
    phase: 'idle', // 'idle' | 'lobby' | 'playing'
    participants: [], // [{uid, name}], in display AND turn order
    turnUid: null, // whose turn it is to deal; null = no one has joined yet
    deck: [],
    position: -1,
    rules: cloneRules(), // rank -> rule text; host-editable, broadcast like everything else
    ruleOverlayDuration: 5, // seconds before the rule popup auto-closes; 0 = tap-only, host-editable
    dealSeq: 0, // bumped on every new card becoming current (deal or reshuffle) — a
    // reshuffle drops position back to 0, so tracking "have we shown this
    // position's rule yet" by position alone misses back-to-back reshuffles
    // that both land on position 0; this counter is unambiguous either way.
    revealed: true, // false right after a fresh deck starts — the first card
    // shows face-down until the turn holder flips it; every card dealt
    // after that reveals immediately, same as before.
  };

  // ---------- rendering: purely derived from `state` (+ isHost/myUid for
  // which controls this device gets to see) ----------

  function render() {
    idleView.hidden = state.phase !== 'idle';
    lobbyView.hidden = state.phase !== 'lobby';
    playView.hidden = state.phase !== 'playing';

    if (state.phase === 'lobby') {
      counterEl.textContent = '대기 중';
      renderParticipants();
      launchBtn.hidden = !isHost;
    } else if (state.phase === 'idle') {
      counterEl.textContent = '대기 중';
    } else if (state.phase === 'playing') {
      renderCard(false);
    }

    if (rulesModal && !rulesModal.hidden) renderRulesModal();

    updateControlsVisibility();
  }

  // With no one in `state.participants` yet, the host plays solo and keeps
  // full control (nothing to hand a turn to). Otherwise a turn belongs to
  // whichever participant is next in line — including the host, if they
  // joined their own room.
  function isMyTurn() {
    if (state.participants.length === 0) return isHost;
    return myUid !== null && myUid === state.turnUid;
  }

  // nextBtn is DISABLED between turns, never removed from layout — turns
  // pass constantly during normal play, and hiding/showing it (or the
  // whole footer) on every pass shifted the card up and down each time.
  // resetBtn's hidden state is host-only and never changes mid-session, so
  // it's safe to actually remove from layout.
  function updateControlsVisibility() {
    if (!controlsFooter) return;
    controlsFooter.hidden = state.phase !== 'playing';
    resetBtn.hidden = !isHost;
    var atLastCard = state.revealed && state.position === state.deck.length - 1;
    nextBtn.disabled = !isMyTurn() || atLastCard;

    if (rulesBtn) {
      rulesBtn.hidden = state.phase !== 'playing';
      rulesBtn.textContent = isHost ? '룰 수정' : '룰 확인';
    }

    if (ruleTimerSelect) {
      var showTimerSelect = state.phase === 'playing' && isHost;
      ruleTimerSelect.hidden = !showTimerSelect;
      if (showTimerSelect) ruleTimerSelect.value = String(state.ruleOverlayDuration);
    }
  }

  function renderParticipants() {
    var list = state.participants;
    participantsCountEl.textContent = '참가 인원: ' + list.length + '명';
    participantsListEl.innerHTML = '';
    list.forEach(function (p, i) {
      var li = document.createElement('li');
      li.setAttribute('data-uid', p.uid);

      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(i + 1);
      li.appendChild(badge);

      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = p.name;
      li.appendChild(label);

      // With only one participant there's nothing to reorder.
      if (list.length > 1) {
        var moveGroup = document.createElement('span');
        moveGroup.className = 'move-buttons';

        var upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'move-up';
        upBtn.setAttribute('aria-label', '위로 이동');
        upBtn.textContent = '▲';
        upBtn.disabled = i === 0;

        var downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'move-down';
        downBtn.setAttribute('aria-label', '아래로 이동');
        downBtn.textContent = '▼';
        downBtn.disabled = i === list.length - 1;

        moveGroup.appendChild(upBtn);
        moveGroup.appendChild(downBtn);
        li.appendChild(moveGroup);
      }

      participantsListEl.appendChild(li);
    });
    updateJoinUI();
  }

  // Joining is automatic (see startHost/startClient) — nobody can end up a
  // permanent spectator just because they missed a button. This button is
  // just a way to fix up the auto-assigned name afterward.
  function updateJoinUI() {
    var idx = myUid === null ? -1 : state.participants.findIndex(function (p) { return p.uid === myUid; });
    if (idx >= 0) {
      joinNoteEl.textContent = '당신은 ' + (idx + 1) + '번째 참가자예요.';
    } else {
      joinNoteEl.textContent = '연결 중...';
    }
  }

  function turnHintText() {
    if (isMyTurn()) return '당신의 차례예요! 다음 카드를 넘겨보세요.';
    if (state.turnUid === null) return '';
    var idx = state.participants.findIndex(function (p) { return p.uid === state.turnUid; });
    if (idx < 0) return '';
    return (idx + 1) + '번 ' + state.participants[idx].name + '님의 차례예요.';
  }

  function renderCard(animate) {
    if (state.position < 0 || state.position >= state.deck.length) return;
    cardUse.setAttribute('href', state.revealed ? '#' + state.deck[state.position] : '#cardback');
    counterEl.textContent = (state.position + 1) + ' / ' + state.deck.length;
    if (state.revealed) maybeShowRuleForCurrentCard();

    if (animate) {
      cardEl.classList.remove('flash');
      void cardEl.offsetWidth;
      cardEl.classList.add('flash');
    }

    if (!state.revealed) {
      if (isMyTurn()) {
        hintEl.textContent = '카드를 뒤집어보세요!';
      } else {
        var flipIdx = state.participants.findIndex(function (p) { return p.uid === state.turnUid; });
        hintEl.textContent = flipIdx >= 0 ? (flipIdx + 1) + '번 ' + state.participants[flipIdx].name + '님이 카드를 뒤집을 차례예요.' : '';
      }
      nextBtn.textContent = '카드 뒤집기';
    } else if (state.position === state.deck.length - 1) {
      hintEl.textContent = isHost ? '마지막 카드예요. 다시 섞으면 새로 시작해요.' : '마지막 카드예요.';
      nextBtn.textContent = '카드 다 봤어요';
    } else {
      hintEl.textContent = turnHintText();
      nextBtn.textContent = '다음 카드';
    }

    updateControlsVisibility();
  }

  var ruleOverlayTimer = null;
  var ruleOverlayInterval = null;

  function clearRuleOverlayTimers() {
    if (ruleOverlayTimer) {
      clearTimeout(ruleOverlayTimer);
      ruleOverlayTimer = null;
    }
    if (ruleOverlayInterval) {
      clearInterval(ruleOverlayInterval);
      ruleOverlayInterval = null;
    }
  }

  // rule is { name, desc }; duration is in seconds, 0 (or unset) means
  // tap-only, no auto-close.
  function showRuleOverlay(rule) {
    if (!ruleOverlayEl || !rule || !rule.name) return;
    ruleOverlayTextEl.textContent = rule.name;
    if (ruleOverlayDescEl) {
      ruleOverlayDescEl.textContent = rule.desc || '';
      ruleOverlayDescEl.hidden = !rule.desc;
    }
    ruleOverlayEl.hidden = false;
    playRuleSound();
    clearRuleOverlayTimers();

    var duration = state.ruleOverlayDuration || 0;
    if (duration <= 0) {
      if (ruleOverlayHintEl) ruleOverlayHintEl.textContent = '터치하면 닫혀요';
      return;
    }

    var remaining = duration;
    if (ruleOverlayHintEl) ruleOverlayHintEl.textContent = remaining + '초 후 자동으로 닫혀요';
    ruleOverlayInterval = window.setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        hideRuleOverlay();
        return;
      }
      if (ruleOverlayHintEl) ruleOverlayHintEl.textContent = remaining + '초 후 자동으로 닫혀요';
    }, 1000);
    ruleOverlayTimer = window.setTimeout(hideRuleOverlay, duration * 1000);
  }

  function hideRuleOverlay() {
    if (ruleOverlayEl) ruleOverlayEl.hidden = true;
    clearRuleOverlayTimers();
  }

  // Pops the big rule overlay once per newly-dealt card (keyed on deck
  // position, not on renderCard's `animate` flag) — that way it fires the
  // same way whether this device dealt the card itself or just received it
  // via a state broadcast.
  function maybeShowRuleForCurrentCard() {
    var card = state.deck[state.position];
    if (!card || state.dealSeq === lastRuleShownSeq) return;
    lastRuleShownSeq = state.dealSeq;
    showRuleOverlay(state.rules[rankOf(card)]);
  }

  function renderRulesModal() {
    if (!rulesListEl) return;
    rulesModalTitle.textContent = isHost ? '룰 수정' : '룰 확인';
    rulesListEl.innerHTML = '';
    RANKS.forEach(function (rank) {
      var rule = state.rules[rank] || { name: '', desc: '' };
      var li = document.createElement('li');

      var head = document.createElement('div');
      head.className = 'rule-row-head';

      var badge = document.createElement('span');
      badge.className = 'rule-rank';
      badge.textContent = RANK_LABELS[rank];
      head.appendChild(badge);

      if (isHost) {
        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'rule-input rule-name-input';
        nameInput.placeholder = '룰 이름';
        nameInput.maxLength = 20;
        nameInput.value = rule.name || '';
        nameInput.addEventListener('change', function () {
          rule.name = sanitizeRuleName(nameInput.value);
          nameInput.value = rule.name;
          broadcastState();
        });
        head.appendChild(nameInput);
        li.appendChild(head);

        var descInput = document.createElement('textarea');
        descInput.className = 'rule-input rule-desc-input';
        descInput.placeholder = '설명 (선택, 두 줄까지)';
        descInput.rows = 2;
        descInput.value = rule.desc || '';
        descInput.addEventListener('change', function () {
          rule.desc = sanitizeRuleDesc(descInput.value);
          descInput.value = rule.desc;
          broadcastState();
        });
        li.appendChild(descInput);
      } else {
        var nameText = document.createElement('span');
        nameText.className = 'rule-text rule-name-text';
        nameText.textContent = rule.name || '';
        head.appendChild(nameText);
        li.appendChild(head);

        if (rule.desc) {
          var descText = document.createElement('div');
          descText.className = 'rule-text rule-desc-text';
          descText.textContent = rule.desc;
          li.appendChild(descText);
        }
      }

      rulesListEl.appendChild(li);
    });
  }

  // ---------- QR / share link ----------

  function buildJoinUrl(roomId) {
    return window.location.origin + window.location.pathname + '?' + ROOM_PARAM + '=' + encodeURIComponent(roomId);
  }

  function drawQr(url) {
    if (qrDrawn || typeof qrcode !== 'function') return;
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    qrUrl.textContent = url;
    qrDrawn = true;
  }

  if (qrCopyBtn) {
    qrCopyBtn.addEventListener('click', function () {
      var url = qrUrl.textContent || window.location.href;
      var done = function () {
        qrCopyBtn.textContent = '복사됐어요';
        window.setTimeout(function () {
          qrCopyBtn.textContent = '링크 복사';
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        done();
      }
    });
  }

  function sanitizeName(raw, fallback) {
    var name = String(raw || '').trim().slice(0, 12);
    return name || fallback;
  }

  function sanitizeRuleName(raw) {
    return String(raw || '').trim().slice(0, 20);
  }

  // Allows an internal line break (e.g. a two-line description like the A
  // rule's) but caps it at two lines and a sane overall length.
  function sanitizeRuleDesc(raw) {
    var text = String(raw || '').replace(/\r\n/g, '\n').trim();
    return text.split('\n').slice(0, 2).join('\n').slice(0, 80);
  }

  // ---------- card game (host-authoritative; only the host ever calls
  // these — everyone else just renders whatever state the host sends) ----------

  function buildDeck() {
    var cards = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        cards.push(SUITS[s] + '_' + RANKS[r]);
      }
    }
    return cards;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function hostStartNewGame() {
    state.deck = shuffle(buildDeck());
    state.position = 0;
    state.turnUid = state.participants.length > 0 ? state.participants[0].uid : null;
    state.dealSeq += 1;
    state.revealed = false;
    renderCard(true);
    broadcastState();
  }

  // The turn holder flips the first card of a fresh deck face-up. Position
  // and turn don't move — this is purely the reveal step; the usual
  // 다음 카드 flow takes over unchanged from here.
  function hostRevealCard() {
    if (state.revealed) return;
    state.revealed = true;
    renderCard(true);
    broadcastState();
  }

  function hostAdvanceTurn() {
    if (state.participants.length === 0) return;
    var idx = state.participants.findIndex(function (p) { return p.uid === state.turnUid; });
    var nextIdx = idx < 0 ? 0 : (idx + 1) % state.participants.length;
    state.turnUid = state.participants[nextIdx].uid;
  }

  function hostAdvance() {
    if (state.position < 0) {
      hostStartNewGame();
      return;
    }
    if (state.position < state.deck.length - 1) {
      state.position += 1;
      state.dealSeq += 1;
      hostAdvanceTurn();
      renderCard(true);
      broadcastState();
    }
  }

  function hostMoveParticipant(uid, dir) {
    var idx = state.participants.findIndex(function (p) { return p.uid === uid; });
    if (idx < 0) return;
    var swapWith = idx + (dir < 0 ? -1 : 1);
    if (swapWith < 0 || swapWith >= state.participants.length) return;
    var tmp = state.participants[idx];
    state.participants[idx] = state.participants[swapWith];
    state.participants[swapWith] = tmp;
    renderParticipants();
    broadcastState();
  }

  // ---------- networking: host ----------

  function broadcastState() {
    if (!isHost) return;
    var payload = JSON.stringify({ type: 'state', state: state });
    clientConns.forEach(function (c) {
      if (c.conn.open) {
        try {
          c.conn.send(payload);
        } catch (e) {
          /* a dead connection; its own close handler will clean it up */
        }
      }
    });
  }

  function hostHandleMessage(conn, msg) {
    if (msg.type === 'join') {
      var existing = clientConns.filter(function (c) { return c.conn === conn; })[0];
      if (existing) {
        // Already in the room — this is a nickname update, not a new join.
        var existingP = state.participants.filter(function (p) { return p.uid === existing.uid; })[0];
        if (existingP) {
          existingP.name = sanitizeName(msg.name, existingP.name);
          renderParticipants();
          broadcastState();
        }
        return;
      }
      var uid = String(nextUid++);
      var name = sanitizeName(msg.name, DEFAULT_GUEST_NAME + (state.participants.length + 1));
      clientConns.push({ conn: conn, uid: uid });
      state.participants.push({ uid: uid, name: name });
      if (state.turnUid === null) state.turnUid = uid;
      conn.send(JSON.stringify({ type: 'welcome', uid: uid }));
      renderParticipants();
      broadcastState();
    } else if (msg.type === 'move') {
      hostMoveParticipant(msg.uid, msg.dir);
    } else if (msg.type === 'next') {
      var entry = clientConns.filter(function (c) { return c.conn === conn; })[0];
      if (!entry || entry.uid !== state.turnUid) return; // only the current turn-holder may deal
      hostAdvance();
    } else if (msg.type === 'reveal') {
      var revealEntry = clientConns.filter(function (c) { return c.conn === conn; })[0];
      if (!revealEntry || revealEntry.uid !== state.turnUid) return; // only the current turn-holder may flip
      hostRevealCard();
    }
  }

  function hostRemoveConn(conn) {
    var entry = clientConns.filter(function (c) { return c.conn === conn; })[0];
    clientConns = clientConns.filter(function (c) { return c.conn !== conn; });
    if (!entry) return;
    var oldIdx = state.participants.findIndex(function (p) { return p.uid === entry.uid; });
    state.participants = state.participants.filter(function (p) { return p.uid !== entry.uid; });
    if (state.turnUid === entry.uid) {
      if (state.participants.length === 0) {
        state.turnUid = null;
      } else {
        state.turnUid = state.participants[oldIdx % state.participants.length].uid;
      }
    }
    renderParticipants();
    broadcastState();
  }

  function startHost() {
    if (typeof Peer !== 'function') {
      startSoloPlay();
      return;
    }
    isHost = true;
    nicknameInput.value = DEFAULT_HOST_NAME;
    peer = new Peer();
    peer.on('open', function (id) {
      state.phase = 'lobby';
      myUid = String(nextUid++);
      state.participants.push({ uid: myUid, name: sanitizeName(nicknameInput.value, DEFAULT_HOST_NAME) });
      state.turnUid = myUid;
      drawQr(buildJoinUrl(id));
      render();
    });
    peer.on('connection', function (conn) {
      conn.on('data', function (raw) {
        var msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          return;
        }
        hostHandleMessage(conn, msg);
      });
      conn.on('close', function () {
        hostRemoveConn(conn);
      });
    });
    peer.on('error', function () {
      hintEl.textContent = '연결에 문제가 생겼어요. 새로고침 후 다시 시도해주세요.';
    });
  }

  // No multiplayer runtime available at all (script failed to load,
  // fully offline): skip the lobby, just deal cards locally.
  function startSoloPlay() {
    isHost = true;
    state.phase = 'playing';
    hostStartNewGame();
    render();
  }

  // ---------- networking: client ----------

  function sendToHost(msg) {
    if (hostConn && hostConn.open) {
      try {
        hostConn.send(JSON.stringify(msg));
      } catch (e) {
        /* connection is likely dead; its close handler will surface that */
      }
    }
  }

  function startClient(roomId) {
    if (typeof Peer !== 'function') {
      joinNoteEl.textContent = '실시간 연결 기능을 불러오지 못했어요. 인터넷 연결을 확인해주세요.';
      return;
    }
    isHost = false;
    state.phase = 'lobby';
    drawQr(buildJoinUrl(roomId));
    render();

    peer = new Peer();
    peer.on('open', function () {
      hostConn = peer.connect(roomId, { reliable: true });
      hostConn.on('open', function () {
        sendToHost({ type: 'join', name: nicknameInput.value });
      });
      hostConn.on('data', function (raw) {
        var msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          return;
        }
        if (msg.type === 'welcome') {
          myUid = msg.uid;
          updateJoinUI();
        } else if (msg.type === 'state') {
          state = msg.state;
          render();
        }
      });
      hostConn.on('close', function () {
        joinNoteEl.textContent = '방장과 연결이 끊어졌어요.';
        joinBtn.disabled = true;
      });
    });
    peer.on('error', function () {
      joinNoteEl.textContent = '방에 연결하지 못했어요. 링크를 다시 확인해주세요.';
    });
  }

  // ---------- button wiring ----------

  startRoomBtn.addEventListener('click', startHost);

  launchBtn.addEventListener('click', function () {
    if (!isHost) return;
    state.phase = 'playing';
    render();
    hostStartNewGame();
  });

  // Joining already happened automatically (see startHost/startClient); this
  // button just re-applies whatever is currently typed as this device's name.
  joinBtn.addEventListener('click', function () {
    if (myUid === null) return; // not connected yet
    if (isHost) {
      var p = state.participants.filter(function (p) { return p.uid === myUid; })[0];
      if (p) {
        p.name = sanitizeName(nicknameInput.value, p.name);
        renderParticipants();
        broadcastState();
      }
    } else {
      sendToHost({ type: 'join', name: nicknameInput.value });
    }
  });

  // Delegated on the static <ol> (present since page load) rather than
  // bound per-button, since the list is fully rebuilt on every render.
  participantsListEl.addEventListener('click', function (evt) {
    var btn = evt.target.closest && evt.target.closest('.move-up, .move-down');
    if (!btn) return;
    var li = btn.closest('li');
    if (!li) return;
    var uid = li.getAttribute('data-uid');
    var dir = btn.classList.contains('move-up') ? -1 : 1;
    if (isHost) {
      hostMoveParticipant(uid, dir);
    } else {
      sendToHost({ type: 'move', uid: uid, dir: dir });
    }
  });

  nextBtn.addEventListener('click', function () {
    if (!isMyTurn()) return;
    if (!state.revealed) {
      if (isHost) {
        hostRevealCard();
      } else {
        sendToHost({ type: 'reveal' });
      }
      return;
    }
    if (isHost) {
      hostAdvance();
    } else {
      sendToHost({ type: 'next' });
    }
  });

  resetBtn.addEventListener('click', function () {
    if (!isHost) return;
    hostStartNewGame();
  });

  if (rulesBtn) {
    rulesBtn.addEventListener('click', function () {
      renderRulesModal();
      rulesModal.hidden = false;
    });
  }

  if (rulesCloseBtn) {
    rulesCloseBtn.addEventListener('click', function () {
      rulesModal.hidden = true;
    });
  }

  if (ruleOverlayEl) {
    ruleOverlayEl.addEventListener('click', hideRuleOverlay);
  }

  if (ruleTimerSelect) {
    ruleTimerSelect.addEventListener('change', function () {
      if (!isHost) return;
      state.ruleOverlayDuration = parseInt(ruleTimerSelect.value, 10) || 0;
      broadcastState();
    });
  }

  // ---------- entry point ----------

  (function init() {
    var roomId = new URLSearchParams(window.location.search).get(ROOM_PARAM);
    if (roomId) {
      startClient(roomId);
    }
  })();
})();
