/* calc-offense.js  –  live Offense-Calculator maths */
document.addEventListener('DOMContentLoaded', () => {
  /* grab the nine numeric inputs in table order */
  const inputs = Array.from(
    document.querySelectorAll('.mb-input-wrapper input[type="number"]')
  );

  if (inputs.length < 9) {
    console.warn('[calc-offense] inputs not found – table changed?');
    return;
  }

  const [
    ACC, DMG, AS,        // row 1
    CR,  CD,             // row 2
    STR, STRmult,        // row 3
    HP,  AC              // row 4
  ] = inputs;

  /* locate the four result <div class="mb-view-wrapper"> elements */
  const views = Array.from(
    document.querySelectorAll('.mb-view-wrapper.mb-view-type-math')
  );

  if (views.length < 4) {
    console.warn('[calc-offense] result wrappers not found.');
    return;
  }
  const [hitEl, atkEl, defEl, ttkEl] = views;

  /* ----- maths -------------------------------------------------- */
  const hitChance = () => {
    const acc = ACCv();
    const ac = ACv();
    if (acc === null || ac === null) return "?";
    return Math.round((Math.pow(14 / 15, ac - acc - 1) * 100) * 100) / 100;
  };

  const attackPwr = () => {
    const acc = ACCv();
    const dmg = DMGv();
    const str = STRv();
    const strm = STRm();
    const as = ASv();
    const cr = CRv();
    const cd = CDv();
    if (acc === null || dmg === null || str === null || strm === null || as === null || cr === null || cd === null) return "?";
    return Math.round((
      Math.pow(1.07, acc) * (dmg + str * strm) * as
      + (cr * cd * as)
    ) * 10) / 10;
  };

  const defensePwr = () => {
    const hp = HPv();
    const ac = ACv();
    if (hp === null || ac === null) return "?";
    return Math.round(hp * Math.pow(1.07, ac) * 10) / 10;
  };

  const ttk = () => {
    const def = defensePwr();
    const atk = attackPwr();
    if (def === "?" || atk === "?") return "?";
    return Math.round((def / atk) * 100) / 100;
  };

  /* helpers to handle empty inputs */
  function num(inp) {
    const val = inp.value;
    if (val === "") return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }

  const [
    ACCv, DMGv, ASv, CRv, CDv, STRv, STRm, HPv, ACv
  ] = [ACC,DMG,AS,CR,CD,STR,STRmult,HP,AC].map(i => () => num(i));

  /* glue it together */
  function recalc () {
    hitEl.textContent = hitChance();
    atkEl.textContent = attackPwr();
    defEl.textContent = defensePwr();
    ttkEl.textContent = ttk();
  }

  inputs.forEach(i => i.addEventListener('input', recalc));
  recalc();                     // initial render
});