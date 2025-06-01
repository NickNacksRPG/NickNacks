/* add-expressions.js  –  Offense Calculator formulas (load-safe) */
(function () {
  const varNames = [
    'ACC','DMG','AS',   // row 1
    'CR','CD',          // row 2
    'STR','STRmult',    // row 3
    'HP','AC'           // row 4
  ];

  function attach() {
    const rows = document.querySelectorAll('table tbody tr');
    if (rows.length < 4) return false;             // table not ready yet

    /* bind inputs */
    rows.forEach((row, i) => {
      const inp = row.querySelector('input');
      if (inp && varNames[i]) inp.dataset.bind = varNames[i];
    });

    /* locate result <strong> lines */
    const views = Array.from(
      document.querySelectorAll('.mb-view-wrapper')
    );
    if (views.length < 4) return false;            // results not in DOM yet

    views[0].dataset.expr = 'round(pow(14/15, AC - ACC - 1) * 100, 2)';

    views[1].dataset.expr =
      'round(pow(1.07, ACC) * (DMG + STR * STRmult) * AS + (CR * CD * AS), 1)';
    views[1].dataset.bind = 'attackpower';

    views[2].dataset.expr = 'round(HP * pow(1.07, AC), 1)';
    views[2].dataset.bind = 'defensepower';

    views[3].dataset.expr = 'round(defensepower / attackpower, 2)';

    return true;                                   // success
  }

  /* run after DOM ready, then retry until content is present */
  function init() {
    if (attach()) return;
    const id = setInterval(() => {
      if (attach()) clearInterval(id);
    }, 200); // check every 200 ms
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();