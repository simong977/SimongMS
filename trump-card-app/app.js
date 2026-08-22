(function () {
  'use strict';

  var SUITS = ['spade', 'heart', 'diamond', 'club'];
  var RANKS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

  var deck = [];
  var position = -1;

  var cardUse = document.getElementById('cardUse');
  var counterEl = document.getElementById('counter');
  var hintEl = document.getElementById('hint');
  var nextBtn = document.getElementById('nextBtn');
  var resetBtn = document.getElementById('resetBtn');

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

  function startNewGame() {
    deck = shuffle(buildDeck());
    position = 0;
    nextBtn.disabled = false;
    nextBtn.textContent = '다음 카드';
    render();
  }

  function render() {
    if (position < 0 || position >= deck.length) return;

    cardUse.setAttribute('href', '#' + deck[position]);
    counterEl.textContent = (position + 1) + ' / ' + deck.length;

    var cardEl = document.getElementById('card');
    cardEl.classList.remove('flash');
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
