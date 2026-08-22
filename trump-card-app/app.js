(function () {
  'use strict';

  var SUITS = [
    { key: 'spade', color: 'black' },
    { key: 'heart', color: 'red' },
    { key: 'diamond', color: 'red' },
    { key: 'club', color: 'black' }
  ];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // Which court portrait (from the embedded <symbol id="portrait-*">
  // defs, traced from David Bellot's SVG-cards, LGPL-2.1) each suit's
  // king/queen/jack uses, and that portrait's natural size.
  var COURT_PORTRAIT = {
    spade: { K: 'king_1', Q: 'queen_2', J: 'jack_3' },
    heart: { K: 'king_2', Q: 'queen_1', J: 'jack_2' },
    club: { K: 'king_3', Q: 'queen_3', J: 'jack_4' },
    diamond: { K: 'king_4', Q: 'queen_4', J: 'jack_1' }
  };
  var PORTRAIT_SIZE = {
    king_1: [119.7, 198.6], king_2: [117.0, 183.5], king_3: [117.4, 185.1], king_4: [120.9, 188.6],
    queen_1: [119.1, 192.0], queen_2: [123.8, 181.3], queen_3: [119.7, 188.0], queen_4: [127.5, 180.0],
    jack_1: [114.3, 175.4], jack_2: [116.9, 180.6], jack_3: [113.6, 175.4], jack_4: [117.3, 193.5]
  };

  // Pip positions on a 5-row x 3-col (left/center/right) grid, per numeric rank.
  var PIP_LAYOUTS = {
    'A': [],
    '2': ['c1', 'c5'],
    '3': ['c1', 'c3', 'c5'],
    '4': ['l1', 'r1', 'l5', 'r5'],
    '5': ['l1', 'r1', 'c3', 'l5', 'r5'],
    '6': ['l1', 'r1', 'l3', 'r3', 'l5', 'r5'],
    '7': ['l1', 'r1', 'c2', 'l3', 'r3', 'l5', 'r5'],
    '8': ['l1', 'r1', 'c2', 'l3', 'r3', 'c4', 'l5', 'r5'],
    '9': ['l1', 'r1', 'l2', 'r2', 'c3', 'l4', 'r4', 'l5', 'r5'],
    '10': ['l1', 'r1', 'l2', 'r2', 'l3', 'r3', 'l4', 'r4', 'l5', 'r5']
  };

  var deck = [];
  var position = -1;

  var cardEl = document.getElementById('card');
  var counterEl = document.getElementById('counter');
  var hintEl = document.getElementById('hint');
  var nextBtn = document.getElementById('nextBtn');
  var resetBtn = document.getElementById('resetBtn');

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function suitIcon(suitKey, extraClass) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', extraClass ? 'suit-icon ' + extraClass : 'suit-icon');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#icon-' + suitKey);
    svg.appendChild(use);
    return svg;
  }

  function courtPortrait(suitKey, rank) {
    var id = COURT_PORTRAIT[suitKey][rank];
    var size = PORTRAIT_SIZE[id];
    var w = size[0], h = size[1];

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'court-portrait');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + (2 * h));
    svg.setAttribute('aria-hidden', 'true');

    var useTop = document.createElementNS(SVG_NS, 'use');
    useTop.setAttribute('href', '#portrait-' + id);
    useTop.setAttribute('x', '0');
    useTop.setAttribute('y', '0');
    useTop.setAttribute('width', String(w));
    useTop.setAttribute('height', String(h));

    var useBottom = document.createElementNS(SVG_NS, 'use');
    useBottom.setAttribute('href', '#portrait-' + id);
    useBottom.setAttribute('x', '0');
    useBottom.setAttribute('y', '0');
    useBottom.setAttribute('width', String(w));
    useBottom.setAttribute('height', String(h));
    useBottom.setAttribute('transform', 'rotate(180 ' + (w / 2) + ' ' + h + ')');

    svg.appendChild(useTop);
    svg.appendChild(useBottom);
    return svg;
  }

  function buildDeck() {
    var cards = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        cards.push({ rank: RANKS[r], suit: SUITS[s] });
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

  function startNewGame() {
    deck = shuffle(buildDeck());
    position = 0;
    nextBtn.disabled = false;
    nextBtn.textContent = '다음 카드';
    render();
  }

  function renderPips(rank, suit) {
    var container = cardEl.querySelector('.pips');
    container.innerHTML = '';
    container.className = 'pips';

    if (rank === 'A') {
      container.classList.add('pips-ace');
      container.appendChild(suitIcon(suit.key, 'suit-icon-big'));
      return;
    }

    if (rank === 'J' || rank === 'Q' || rank === 'K') {
      container.classList.add('pips-face');
      var box = document.createElement('div');
      box.className = 'face-box';
      box.appendChild(courtPortrait(suit.key, rank));
      container.appendChild(box);
      return;
    }

    var layout = PIP_LAYOUTS[rank] || [];
    layout.forEach(function (spot) {
      var col = spot.charAt(0); // l, c, r
      var row = spot.charAt(1); // 1-5
      var extra = 'pip pip-col-' + col + ' pip-row-' + row + (row === '4' || row === '5' ? ' pip-flip' : '');
      container.appendChild(suitIcon(suit.key, extra));
    });
  }

  function render() {
    if (position < 0 || position >= deck.length) return;
    var current = deck[position];

    cardEl.classList.remove('flash');
    cardEl.setAttribute('data-color', current.suit.color);

    cardEl.querySelectorAll('.corner .rank').forEach(function (el) {
      el.textContent = current.rank;
    });
    cardEl.querySelectorAll('.corner .suit').forEach(function (el) {
      el.innerHTML = '';
      el.appendChild(suitIcon(current.suit.key, 'corner-suit-icon'));
    });

    renderPips(current.rank, current.suit);

    counterEl.textContent = (position + 1) + ' / ' + deck.length;

    // restart the enter animation
    void cardEl.offsetWidth;
    cardEl.classList.add('flash');

    if (position === deck.length - 1) {
      hintEl.textContent = '마지막 카드예요. 다시 섞으면 새로 시작해요.';
      nextBtn.textContent = '카드 다 봤어요';
      nextBtn.disabled = true;
    } else {
      hintEl.textContent = '';
      nextBtn.textContent = '다음 카드';
      nextBtn.disabled = false;
    }
  }

  nextBtn.addEventListener('click', function () {
    if (position < deck.length - 1) {
      position++;
      render();
    }
  });

  resetBtn.addEventListener('click', startNewGame);

  startNewGame();
})();
