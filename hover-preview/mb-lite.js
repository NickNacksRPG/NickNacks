/* mb-lite.js  ·  lightweight replacement for the Meta-Bind “Publish” runtime
   ──────────────────────────────────────────────────────────────────────────
   Supports:
     • <div class="mb-input"><input … data-bind="Var"></div>
     • <span class="mb-view" data-expr="ACC + DMG"></span>
   All variables live in `state`, persisted via localStorage.
   MathJS (already injected by your script) provides `math.evaluate`.
*/
(function () {
    if (!window.math) {
      console.error('[mb-lite] math.js must be loaded first');
      return;
    }
  
    /* ---------- persistent state ---------- */
    const LS_KEY = 'mb-lite';
    const state  = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  
    /* ---------- helpers ---------- */
    function save() {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    }
  
    /* ---------- bind inputs ---------- */
    document.querySelectorAll('.mb-input input, .mb-input textarea').forEach(inp => {
      const bind = inp.dataset.bind || inp.name;
      if (!bind) return;
  
      /* restore */
      if (state[bind] !== undefined) inp.value = state[bind];
  
      /* update on change */
      inp.addEventListener('input', () => {
        const v = inp.type === 'number' ? Number(inp.value) : inp.value;
        state[bind] = v;
        save();
        recompute();
      });
    });
  
    /* ---------- bind views ---------- */
    const views = Array.from(document.querySelectorAll('.mb-view')).map(v => ({
      el:   v,
      expr: v.dataset.expr || v.textContent.trim()
    }));
  
    function recompute() {
      const scope = { ...state, math };
      views.forEach(({ el, expr }) => {
        try {
          el.textContent = math.evaluate(expr, scope);
        } catch {
          el.textContent = '⚠︎';
        }
      });
    }
  
    /* initial pass */
    recompute();
  })();