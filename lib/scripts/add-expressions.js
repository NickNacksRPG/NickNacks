/* add-expressions.js  –  robust Offense Calculator formulas */
(function () {
  /* input rows in visual order */
  const varNames = [
    'ACC','DMG','AS',          // first table row
    'CR','CD',                // second
    'STR','STRmult',          // third
    'HP','AC'                 // fourth
  ];

  document
    .querySelectorAll('table tbody tr')
    .forEach((row, i) => {
      const inp = row.querySelector('input');
      if (inp && varNames[i]) inp.dataset.bind = varNames[i];
    });

  /* result rows are the four <strong> lines under the table */
  const results = Array.from(
    document.querySelectorAll('.markdown-preview-sizer strong')
  ).filter(strong => strong.querySelector('.mb-view-wrapper'));

  if (results[0])
    results[0].querySelector('.mb-view-wrapper').dataset.expr =
      'round(pow(14/15, AC - ACC - 1) * 100, 2)';

  if (results[1]) {
    const el = results[1].querySelector('.mb-view-wrapper');
    el.dataset.expr =
      'round(pow(1.07, ACC) * (DMG + STR * STRmult) * AS + (CR * CD * AS), 1)';
    el.dataset.bind = 'attackpower';
  }

  if (results[2]) {
    const el = results[2].querySelector('.mb-view-wrapper');
    el.dataset.expr = 'round(HP * pow(1.07, AC), 1)';
    el.dataset.bind = 'defensepower';
  }

  if (results[3])
    results[3].querySelector('.mb-view-wrapper').dataset.expr =
      'round(defensepower / attackpower, 2)';
})();