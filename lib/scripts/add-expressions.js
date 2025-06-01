/* add-expressions.js  –  attaches formulas for Offense Calculator */

(function () {
    /* map the nine inputs to variable names, in document order */
    const inputVars = [
      'ACC', 'DMG', 'AS', 'CR', 'CD', 'STR', 'STRmult', 'HP', 'AC'
    ];
  
    document
      .querySelectorAll('.mb-input-wrapper input')
      .forEach((inp, idx) => {
        if (inputVars[idx]) inp.dataset.bind = inputVars[idx];
      });
  
    /* add formulas to the four result fields */
    const formulas = [
      {
        sel: 'strong:has(.mb-view-wrapper):nth-of-type(1) .mb-view-wrapper',
        expr: 'round(pow(14/15, AC - ACC - 1) * 100, 2)'
      },
      {
        sel: 'strong:has(.mb-view-wrapper):nth-of-type(2) .mb-view-wrapper',
        expr:
          'round(pow(1.07, ACC) * (DMG + STR * STRmult) * AS + (CR * CD * AS), 1)',
        bind: 'attackpower'
      },
      {
        sel: 'strong:has(.mb-view-wrapper):nth-of-type(3) .mb-view-wrapper',
        expr: 'round(HP * pow(1.07, AC), 1)',
        bind: 'defensepower'
      },
      {
        sel: 'strong:has(.mb-view-wrapper):nth-of-type(4) .mb-view-wrapper',
        expr: 'round(defensepower / attackpower, 2)'
      }
    ];
  
    for (const f of formulas) {
      const el = document.querySelector(f.sel);
      if (!el) continue;
      el.dataset.expr = f.expr;
      if (f.bind) el.dataset.bind = f.bind;
    }
  })();