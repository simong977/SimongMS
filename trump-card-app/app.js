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
  var DEFAULT_RULES = {
    '1': '엄지왕',
    '2': '지목',
    '3': '나 마셔',
    '4': '여자 마셔',
    '5': '손병호게임',
    '6': '남자 마셔',
    '7': '눈치게임',
    '8': '파트너 지정',
    '9': '카테고리',
    '10': '룰 메이커',
    jack: '전사람',
    queen: '퀘스천 또는 랜덤게임',
    king: '킹잔 채우기, 4번째 킹은 킹잔 마시기',
  };

  function cloneRules() {
    var copy = {};
    RANKS.forEach(function (r) { copy[r] = DEFAULT_RULES[r]; });
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
  var lastRuleShownPosition = -1; // which deck position we've already popped the rule overlay for

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
    var atLastCard = state.position === state.deck.length - 1;
    nextBtn.disabled = !isMyTurn() || atLastCard;

    if (rulesBtn) {
      rulesBtn.hidden = state.phase !== 'playing';
      rulesBtn.textContent = isHost ? '룰 수정' : '룰 확인';
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
    cardUse.setAttribute('href', '#' + state.deck[state.position]);
    counterEl.textContent = (state.position + 1) + ' / ' + state.deck.length;
    maybeShowRuleForCurrentCard();

    if (animate) {
      cardEl.classList.remove('flash');
      void cardEl.offsetWidth;
      cardEl.classList.add('flash');
    }

    if (state.position === state.deck.length - 1) {
      hintEl.textContent = isHost ? '마지막 카드예요. 다시 섞으면 새로 시작해요.' : '마지막 카드예요.';
      nextBtn.textContent = '카드 다 봤어요';
    } else {
      hintEl.textContent = turnHintText();
      nextBtn.textContent = '다음 카드';
    }

    updateControlsVisibility();
  }

  var ruleOverlayTimer = null;

  function showRuleOverlay(text) {
    if (!ruleOverlayEl || !text) return;
    ruleOverlayTextEl.textContent = text;
    ruleOverlayEl.hidden = false;
    playRuleSound();
    if (ruleOverlayTimer) clearTimeout(ruleOverlayTimer);
    ruleOverlayTimer = window.setTimeout(hideRuleOverlay, 5000);
  }

  function hideRuleOverlay() {
    if (ruleOverlayEl) ruleOverlayEl.hidden = true;
    if (ruleOverlayTimer) {
      clearTimeout(ruleOverlayTimer);
      ruleOverlayTimer = null;
    }
  }

  // Pops the big rule overlay once per newly-dealt card (keyed on deck
  // position, not on renderCard's `animate` flag) — that way it fires the
  // same way whether this device dealt the card itself or just received it
  // via a state broadcast.
  function maybeShowRuleForCurrentCard() {
    var card = state.deck[state.position];
    if (!card) return;
    // A reshuffle drops position back down (usually to 0) — anything lower
    // than what we already popped a rule for means a fresh deck, not a
    // repeat of a position we've seen before.
    if (state.position < lastRuleShownPosition) lastRuleShownPosition = -1;
    if (state.position === lastRuleShownPosition) return;
    lastRuleShownPosition = state.position;
    showRuleOverlay(state.rules[rankOf(card)]);
  }

  function renderRulesModal() {
    if (!rulesListEl) return;
    rulesModalTitle.textContent = isHost ? '룰 수정' : '룰 확인';
    rulesListEl.innerHTML = '';
    RANKS.forEach(function (rank) {
      var li = document.createElement('li');

      var badge = document.createElement('span');
      badge.className = 'rule-rank';
      badge.textContent = RANK_LABELS[rank];
      li.appendChild(badge);

      if (isHost) {
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'rule-input';
        input.maxLength = 40;
        input.value = state.rules[rank] || '';
        input.addEventListener('change', function () {
          state.rules[rank] = sanitizeRuleText(input.value);
          input.value = state.rules[rank];
          broadcastState();
        });
        li.appendChild(input);
      } else {
        var span = document.createElement('span');
        span.className = 'rule-text';
        span.textContent = state.rules[rank] || '';
        li.appendChild(span);
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

  function sanitizeRuleText(raw) {
    return String(raw || '').trim().slice(0, 40);
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

  // ---------- entry point ----------

  (function init() {
    var roomId = new URLSearchParams(window.location.search).get(ROOM_PARAM);
    if (roomId) {
      startClient(roomId);
    }
  })();
})();
