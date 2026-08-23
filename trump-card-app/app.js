(function () {
  'use strict';

  var SUITS = ['spade', 'heart', 'diamond', 'club'];
  var RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  var JOIN_KEY = 'tc_joined_number';

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
  var deckState = document.getElementById('deckState');
  var roomState = document.getElementById('roomState');

  var readOnly = false;
  var qrDrawn = false;

  // ---------- room phase (idle -> lobby -> playing), synced via
  // roomState's data-phase attribute ----------

  function currentPhase() {
    return roomState.getAttribute('data-phase') || 'idle';
  }

  function applyPhase(phase) {
    idleView.hidden = phase !== 'idle';
    lobbyView.hidden = phase !== 'lobby';
    playView.hidden = phase !== 'playing';

    if (phase === 'lobby') {
      counterEl.textContent = '대기 중';
      ensureQrDrawn();
      renderParticipants();
    } else if (phase === 'idle') {
      counterEl.textContent = '대기 중';
    }
  }

  function setPhase(phase) {
    roomState.setAttribute('data-phase', phase);
    applyPhase(phase);
  }

  startRoomBtn.addEventListener('click', function () {
    setPhase('lobby');
  });

  launchBtn.addEventListener('click', function () {
    setPhase('playing');
    startNewGame();
  });

  // ---------- lobby: QR share + participant roll call ----------

  function ensureQrDrawn() {
    if (qrDrawn || typeof qrcode !== 'function') return;
    var qr = qrcode(0, 'M');
    qr.addData(window.location.href);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
    qrUrl.textContent = window.location.href;
    qrDrawn = true;
  }

  if (qrCopyBtn) {
    qrCopyBtn.addEventListener('click', function () {
      var url = window.location.href;
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

  // Each participant's <li> carries a data-uid assigned once at join
  // time — a stable identity that survives reordering. The badge number
  // shown on screen is never stored; it's always recomputed from DOM
  // order, so moving an <li> is enough to renumber everyone.
  function renderParticipants() {
    var items = participantsListEl.children;
    var count = items.length;
    participantsCountEl.textContent = '참가 인원: ' + count + '명';
    for (var i = 0; i < count; i++) {
      var li = items[i];
      var n = i + 1;
      var badge = li.querySelector('.badge');
      var label = li.querySelector('.label');
      var upBtn = li.querySelector('.move-up');
      var downBtn = li.querySelector('.move-down');
      if (badge) badge.textContent = String(n);
      if (label) label.textContent = n + '번 참가자';
      if (upBtn) upBtn.disabled = i === 0;
      if (downBtn) downBtn.disabled = i === count - 1;
    }
    updateJoinUI();
  }

  function myJoinedUid() {
    try {
      return sessionStorage.getItem(JOIN_KEY);
    } catch (e) {
      return null;
    }
  }

  // A stored uid only counts if it still names a real participant — the
  // room can reset (e.g. the read-only reload below) while an old join
  // flag lingers in sessionStorage, and that must not permanently block
  // rejoining.
  function myJoinedLi() {
    var uid = myJoinedUid();
    return uid ? participantsListEl.querySelector('li[data-uid="' + uid + '"]') : null;
  }

  function markJoined(uid) {
    try {
      sessionStorage.setItem(JOIN_KEY, uid);
    } catch (e) {
      /* private mode etc. — join still shows in the shared list */
    }
  }

  function updateJoinUI() {
    var mine = myJoinedLi();
    if (mine) {
      var n = Array.prototype.indexOf.call(participantsListEl.children, mine) + 1;
      joinBtn.disabled = true;
      joinBtn.textContent = '참가 완료';
      joinNoteEl.textContent = '당신은 ' + n + '번째 참가자예요.';
    } else {
      joinBtn.disabled = false;
      joinBtn.textContent = '참가하기';
      joinNoteEl.textContent = '';
    }
  }

  joinBtn.addEventListener('click', function () {
    if (myJoinedLi()) return;
    var uid = String(parseInt(participantsListEl.getAttribute('data-next-uid'), 10) || 0);
    participantsListEl.setAttribute('data-next-uid', String(parseInt(uid, 10) + 1));

    var li = document.createElement('li');
    li.setAttribute('data-uid', uid);

    var badge = document.createElement('span');
    badge.className = 'badge';
    li.appendChild(badge);

    var label = document.createElement('span');
    label.className = 'label';
    li.appendChild(label);

    var moveGroup = document.createElement('span');
    moveGroup.className = 'move-buttons';

    var upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'move-up';
    upBtn.setAttribute('aria-label', '위로 이동');
    upBtn.textContent = '▲';

    var downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'move-down';
    downBtn.setAttribute('aria-label', '아래로 이동');
    downBtn.textContent = '▼';

    moveGroup.appendChild(upBtn);
    moveGroup.appendChild(downBtn);
    li.appendChild(moveGroup);

    participantsListEl.appendChild(li);
    markJoined(uid);
    renderParticipants();
  });

  // Delegated on the static <ol> (present since page load) rather than
  // bound per-button, so reordering keeps working even after a remote
  // participant's join or move causes the list's <li>s to be rebuilt.
  participantsListEl.addEventListener('click', function (evt) {
    var btn = evt.target.closest && evt.target.closest('.move-up, .move-down');
    if (!btn) return;
    var li = btn.closest('li');
    if (!li) return;
    if (btn.classList.contains('move-up')) {
      var prev = li.previousElementSibling;
      if (prev) participantsListEl.insertBefore(li, prev);
    } else {
      var next = li.nextElementSibling;
      if (next) participantsListEl.insertBefore(next, li);
    }
    renderParticipants();
  });

  // ---------- card game (unchanged logic; state lives on deckState's
  // data-* attributes so whoever clicks reads the current state off the
  // page rather than trusting local memory) ----------

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

  function getState() {
    var raw = deckState.getAttribute('data-deck') || '';
    var deck = raw ? raw.split(',') : [];
    var position = parseInt(deckState.getAttribute('data-position'), 10);
    if (isNaN(position)) position = -1;
    return { deck: deck, position: position };
  }

  function setState(deck, position) {
    deckState.setAttribute('data-deck', deck.join(','));
    deckState.setAttribute('data-position', String(position));
  }

  function renderFromState(animate) {
    var s = getState();
    if (s.position < 0 || s.position >= s.deck.length) return;

    cardUse.setAttribute('href', '#' + s.deck[s.position]);
    counterEl.textContent = (s.position + 1) + ' / ' + s.deck.length;

    if (animate) {
      cardEl.classList.remove('flash');
      void cardEl.offsetWidth;
      cardEl.classList.add('flash');
    }

    if (s.position === s.deck.length - 1) {
      hintEl.textContent = '마지막 카드예요. 다시 섞으면 새로 시작해요.';
      nextBtn.textContent = '카드 다 봤어요';
      nextBtn.disabled = true;
    } else {
      hintEl.textContent = '';
      nextBtn.textContent = '다음 카드';
      nextBtn.disabled = false;
    }
  }

  function startNewGame() {
    setState(shuffle(buildDeck()), 0);
    renderFromState(true);
  }

  function advance() {
    var s = getState();
    if (s.position < 0) {
      startNewGame();
      return;
    }
    if (s.position < s.deck.length - 1) {
      setState(s.deck, s.position + 1);
      renderFromState(true);
    }
  }

  nextBtn.addEventListener('click', advance);
  resetBtn.addEventListener('click', startNewGame);

  // ---------- initial render from whatever is already on the page
  // (a friend joining a room already in progress) ----------

  applyPhase(currentPhase());
  if (currentPhase() === 'playing' && getState().position >= 0) {
    renderFromState(false);
  }

  // No multiplayer runtime available (the downloaded file, GitHub
  // Pages): skip the lobby, behave exactly like the old solo app —
  // but only if no one has touched the room yet.
  function fallBackToSoloPlay() {
    if (currentPhase() !== 'idle') return;
    playView.hidden = false;
    idleView.hidden = true;
    hintEl.textContent = '다음 카드를 눌러서 시작해요.';
  }

  (function initMultiplayer() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') {
        fallBackToSoloPlay();
        return;
      }
      window.claude.use('artifact').then(function (artifact) {
        if (!artifact) fallBackToSoloPlay();
      });
    } catch (e) {
      fallBackToSoloPlay();
    }
  })();

  // ---------- reacting to other people's clicks ----------

  function lockToReadOnly() {
    if (readOnly) return;
    readOnly = true;
    nextBtn.disabled = true;
    resetBtn.disabled = true;
    startRoomBtn.disabled = true;
    joinBtn.disabled = true;
    launchBtn.disabled = true;
    window.setTimeout(function () {
      window.location.reload();
    }, 600);
  }

  document.addEventListener('claude:sync-off', lockToReadOnly);

  // Attribute-only changes (phase, deck position) are patched into the
  // DOM for us and just need a re-render; a brand new element (someone
  // else joining) instead re-runs this whole script from the top, which
  // re-derives everything from the page's current state naturally.
  document.addEventListener('claude:edit', function () {
    applyPhase(currentPhase());
    if (currentPhase() === 'playing') {
      renderFromState(true);
    }
  });
})();
