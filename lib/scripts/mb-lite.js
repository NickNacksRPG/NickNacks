/* mb-lite.js  –  lightweight runtime for calculator pages
   ───────────────────────────────────────────────────────── */

   (function () {
    if (!window.math) {
      console.error('[mb-lite] math.js not found');
      return;
    }
  
    /* persistent user-editable state */
    const LS = 'mb-lite';
    const state = JSON.parse(localStorage.getItem(LS) || '{}');
  
    /* bind <input> elements */
    document
      .querySelectorAll('.mb-input-wrapper input, .mb-input-wrapper textarea')
      .forEach(inp => {
        const name = inp.dataset.bind || inp.name;
        if (!name) return;
  
        /* restore prior value */
        if (state[name] !== undefined) inp.value = state[name];
  
        inp.addEventListener('input', () => {
          const v = inp.type === 'number' ? Number(inp.value) : inp.value;
          state[name] = v;
          localStorage.setItem(LS, JSON.stringify(state));
          recompute();
        });
      });
  
    /* bind <span>/<div class="mb-view …"> elements */
    const views = Array.from(document.querySelectorAll('.mb-view-wrapper, .mb-view'))
      .map(el => ({
        el,
        expr: el.dataset.expr || el.textContent.trim(),
        bind: el.dataset.bind || ''          // optional attackpower/defensepower
      }));
  
    function recompute() {
      const scope = { ...state, math };
  
      for (const v of views) {
        try {
          const val = math.evaluate(v.expr, scope);
          v.el.textContent = val;
          if (v.bind) scope[v.bind] = val;   // expose to later formulas
        } catch {
          v.el.textContent = '⚠︎';
        }
      }
    }
  
    recompute();
  })();