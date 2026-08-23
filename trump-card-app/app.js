(function () {
  'use strict';

  var SUITS = ['spade', 'heart', 'diamond', 'club'];
  var RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  var ROOM_PARAM = 'room';

  var idleView = document.getElementById('idleView');
  var lobbyView = document.getElementById('lobbyView');
  var playView = document.getElementById('playView');
  var startRoomBtn = document.getElementById('startRoomBtn');

  var qrBox = document.getElementById('qrBox');
  var qrUrl = document.getElementById('qrUrl');
  var qrCopyBtn = document.getElementById('qrCopyBtn');
  var participantsCountEl = document.getElementById('participantsCount');
  var participantsListEl = document.getElementById('participantsList');
  var joinNoteEl = document.getElementById('joinNote');
  var joinBtn = document.getElementById('joinBtn');
  var launchBtn = document.getElementById('launchBtn');

  var cardEl = document.getElementById('card');
  var cardUse = document.getElementById('cardUse');
  var counterEl = document.getElementById('counter');
  var hintEl = document.getElementById('hint');
  var nextBtn = document.getElementById('nextBtn');
  var resetBtn = document.getElementById('resetBtn');
  var controlsFooter = document.querySelector('.controls');

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
  var joinRequested = false;
  var qrDrawn = false;

  var state = {
    phase: 'idle', // 'idle' | 'lobby' | 'playing'
    participants: [], // [{uid}], in display order
    deck: [],
    position: -1,
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

    if (controlsFooter) controlsFooter.hidden = !isHost;
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
      label.textContent = (i + 1) + '번 참가자';
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

  function updateJoinUI() {
    var idx = myUid === null ? -1 : state.participants.findIndex(function (p) { return p.uid === myUid; });
    if (idx >= 0) {
      joinBtn.disabled = true;
      joinBtn.textContent = '참가 완료';
      joinNoteEl.textContent = '당신은 ' + (idx + 1) + '번째 참가자예요.';
    } else if (joinRequested) {
      joinBtn.disabled = true;
      joinBtn.textContent = '참가 중...';
    } else {
      joinBtn.disabled = false;
      joinBtn.textContent = '참가하기';
      joinNoteEl.textContent = '';
    }
  }

  function renderCard(animate) {
    if (state.position < 0 || state.position >= state.deck.length) return;
    cardUse.setAttribute('href', '#' + state.deck[state.position]);
    counterEl.textContent = (state.position + 1) + ' / ' + state.deck.length;

    if (animate) {
      cardEl.classList.remove('flash');
      void cardEl.offsetWidth;
      cardEl.classList.add('flash');
    }

    if (state.position === state.deck.length - 1) {
      hintEl.textContent = isHost ? '마지막 카드예요. 다시 섞으면 새로 시작해요.' : '마지막 카드예요.';
      nextBtn.textContent = '카드 다 봤어요';
      nextBtn.disabled = true;
    } else {
      hintEl.textContent = isHost ? '' : '방장이 다음 카드를 넘기고 있어요.';
      nextBtn.textContent = '다음 카드';
      nextBtn.disabled = false;
    }
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
    renderCard(true);
    broadcastState();
  }

  function hostAdvance() {
    if (state.position < 0) {
      hostStartNewGame();
      return;
    }
    if (state.position < state.deck.length - 1) {
      state.position += 1;
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
      var already = clientConns.some(function (c) { return c.conn === conn; });
      if (already) return;
      var uid = String(nextUid++);
      clientConns.push({ conn: conn, uid: uid });
      state.participants.push({ uid: uid });
      conn.send(JSON.stringify({ type: 'welcome', uid: uid }));
      renderParticipants();
      broadcastState();
    } else if (msg.type === 'move') {
      hostMoveParticipant(msg.uid, msg.dir);
    }
  }

  function hostRemoveConn(conn) {
    var entry = clientConns.filter(function (c) { return c.conn === conn; })[0];
    clientConns = clientConns.filter(function (c) { return c.conn !== conn; });
    if (entry) {
      state.participants = state.participants.filter(function (p) { return p.uid !== entry.uid; });
      renderParticipants();
      broadcastState();
    }
  }

  function startHost() {
    if (typeof Peer !== 'function') {
      startSoloPlay();
      return;
    }
    isHost = true;
    peer = new Peer();
    peer.on('open', function (id) {
      state.phase = 'lobby';
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
      hostConn.on('data', function (raw) {
        var msg;
        try {
          msg = JSON.parse(raw);
        } catch (e) {
          return;
        }
        if (msg.type === 'welcome') {
          myUid = msg.uid;
          joinRequested = false;
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

  joinBtn.addEventListener('click', function () {
    if (myUid !== null || joinRequested) return;
    if (isHost) {
      myUid = String(nextUid++);
      state.participants.push({ uid: myUid });
      renderParticipants();
      broadcastState();
    } else {
      joinRequested = true;
      updateJoinUI();
      sendToHost({ type: 'join' });
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
    if (!isHost) return;
    hostAdvance();
  });

  resetBtn.addEventListener('click', function () {
    if (!isHost) return;
    hostStartNewGame();
  });

  // ---------- entry point ----------

  (function init() {
    var roomId = new URLSearchParams(window.location.search).get(ROOM_PARAM);
    if (roomId) {
      startClient(roomId);
    }
  })();
})();
