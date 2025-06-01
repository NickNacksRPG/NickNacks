/* add-expressions.js  –  Offense Calculator formulas (no :has()) */
(function () {
  /* ---------------- name each input ---------------- */
  const vars = [
    'ACC', 'DMG', 'AS',          // row 1
    'CR',  'CD',                 // row 2
    'STR', 'STRmult',            // row 3
    'HP',  'AC'                  // row 4
  ];

  document
    .querySelectorAll('.mb-input-wrapper input')
    .forEach((inp, i) => { if (vars[i]) inp.dataset.bind = vars[i]; });

  /* ---------------- attach expressions -------------- */
  const views = Array.from(document.querySelectorAll('.mb-view-wrapper'));

  if (views[0]) {
    views[0].dataset.expr =
      'round(pow(14/15, AC - ACC - 1) * 100, 2)';
  }

  if (views[1]) {
    views[1].dataset.expr =
      'round(pow(1.07, ACC) * (DMG + STR * STRmult) * AS + (CR * CD * AS), 1)';
    views[1].dataset.bind = 'attackpower';
  }

  if (views[2]) {
    views[2].dataset.expr = 'round(HP * pow(1.07, AC), 1)';
    views[2].dataset.bind = 'defensepower';
  }

  if (views[3]) {
    views[3].dataset.expr = 'round(defensepower / attackpower, 2)';
  }
})();