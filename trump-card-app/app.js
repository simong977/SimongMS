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
  var qrBtn = document.getElementById('qrBtn');
  var qrPanel = document.getElementById('qrPanel');
  var qrBox = document.getElementById('qrBox');
  var qrUrl = document.getElementById('qrUrl');
  var qrCopyBtn = document.getElementById('qrCopyBtn');
  var qrCloseBtn = document.getElementById('qrCloseBtn');

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

  if (getState().position >= 0) {
    renderFromState(false);
  }

  // Share-link QR code, drawn entirely on-device with the vendored
  // qrcode-generator (see qrcode.lib.js / NOTICE.md) — no network call.
  // A friend who scans it or opens the link gets their own copy of the
  // app (each person shuffles independently — this isn't a live shared
  // game, just an easy way to hand someone the link).
  if (qrBtn && qrPanel && qrBox && typeof qrcode === 'function') {
    var qrDrawn = false;
    qrBtn.addEventListener('click', function () {
      if (!qrDrawn) {
        var qr = qrcode(0, 'M');
        qr.addData(window.location.href);
        qr.make();
        qrBox.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
        if (qrUrl) qrUrl.textContent = window.location.href;
        qrDrawn = true;
      }
      qrPanel.hidden = false;
    });
    // Tapping the dimmed backdrop (not the panel itself) closes it too.
    qrPanel.addEventListener('click', function (e) {
      if (e.target === qrPanel) qrPanel.hidden = true;
    });
  }

  if (qrCloseBtn) {
    qrCloseBtn.addEventListener('click', function () {
      qrPanel.hidden = true;
    });
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
})();
