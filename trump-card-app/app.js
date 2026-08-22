(function () {
  'use strict';

  var SUITS = ['spade', 'heart', 'diamond', 'club'];
  var RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

  var cardEl = document.getElementById('card');
  var cardUse = document.getElementById('cardUse');
  var counterEl = document.getElementById('counter');
  var hintEl = document.getElementById('hint');
  var nextBtn = document.getElementById('nextBtn');
  var resetBtn = document.getElementById('resetBtn');
  var deckState = document.getElementById('deckState');
  var watchNote = document.getElementById('watchNote');

  var readOnly = false;

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

  // Game state lives on the DOM (deckState's data-* attributes), not in JS
  // variables: on a shared/synced page, whoever clicks reads the current
  // state off the page rather than trusting local memory, so two people
  // sharing control never step on each other, and a friend who just joined
  // sees the game already in progress.
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
      hintEl.textContent = readOnly ? '마지막 카드예요.' : '마지막 카드예요. 다시 섞으면 새로 시작해요.';
      nextBtn.textContent = '카드 다 봤어요';
      nextBtn.disabled = true;
    } else {
      hintEl.textContent = '';
      nextBtn.textContent = '다음 카드';
      nextBtn.disabled = false;
    }
    if (readOnly) {
      nextBtn.disabled = true;
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

  // If this page is already mid-game (a friend joining an in-progress
  // shared card), just show the current state instead of waiting for a click.
  if (getState().position >= 0) {
    renderFromState(false);
  }

  function lockToReadOnly() {
    if (readOnly) return;
    readOnly = true;
    nextBtn.disabled = true;
    resetBtn.disabled = true;
    if (watchNote) {
      watchNote.textContent = '이 화면은 보기 전용이에요. 다른 사람이 카드를 넘기면 여기도 함께 바뀌어요.';
      watchNote.hidden = false;
    }
    // Discard any optimistic local change that didn't actually save, and
    // pick up whatever the real (writer's) state already is.
    window.setTimeout(function () {
      window.location.reload();
    }, 600);
  }

  document.addEventListener('claude:sync-off', lockToReadOnly);

  document.addEventListener('claude:edit', function () {
    renderFromState(true);
  });

  // Multiplayer: on the published Artifact, viewers watching this same
  // link see the card change live as whoever controls it clicks "다음
  // 카드". Everywhere else (the downloaded file, GitHub Pages) this is
  // simply unavailable and the app works exactly as a solo app.
  (function initMultiplayer() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return;
      window.claude.use('artifact').then(function (artifact) {
        if (!artifact || !watchNote) return;
        watchNote.textContent = '이 링크를 열어둔 친구들과 카드를 실시간으로 같이 볼 수 있어요.';
        watchNote.hidden = false;
      });
    } catch (e) {
      /* no multiplayer runtime available */
    }
  })();
})();
