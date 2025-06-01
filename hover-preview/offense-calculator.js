document.addEventListener('DOMContentLoaded', () => {
    const inputs = Array.from(document.querySelectorAll('.mb-input-wrapper input'));
    const [accIn, dmgIn, cdIn, asIn, acIn, hpIn, crIn, strIn, strMultIn] = inputs;
  
    function calculateAttackPower(acc, dmg, str, strMult, as, cr, cd) {
      const base     = Math.pow(1.07, acc) * (dmg + str * strMult) * as;
      const critTerm = (cr * cd * as) * 10;
      return Math.round(base + critTerm) / 10;
    }
  
    function calculateDefensePower(hp, ac) {
      return Math.round(hp * Math.pow(1.07, ac) * 10) / 10;
    }
  
    function calculateTTK(defP, atkP) {
      return Math.round((defP / atkP) * 100) / 100;
    }
  
    function updateCalculations() {
      const acc      = parseFloat(accIn.value)     || 0;
      const dmg      = parseFloat(dmgIn.value)     || 0;
      const cd       = parseFloat(cdIn.value)      || 0;
      const as       = parseFloat(asIn.value)      || 0;
      const ac       = parseFloat(acIn.value)      || 0;
      const hp       = parseFloat(hpIn.value)      || 0;
      const cr       = parseFloat(crIn.value)      || 0;
      const str      = parseFloat(strIn.value)     || 0;
      const strMult  = parseFloat(strMultIn.value) || 0;
  
      const atkP = calculateAttackPower(acc, dmg, str, strMult, as, cr, cd);
      const defP = calculateDefensePower(hp, ac);
      const ttk  = calculateTTK(defP, atkP);
  
      const [atkEl, defEl, ttkEl] = document.querySelectorAll('.mb-view-wrapper.mb-view-type-math');
      atkEl.textContent = atkP;
      defEl.textContent = defP;
      ttkEl.textContent = ttk;
    }
  
    inputs.forEach(i => i.addEventListener('input', updateCalculations));
    updateCalculations();
  });