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
  const hitChance  = () => Math.round((Math.pow(14 / 15, ACv() - ACCv() - 1) * 100) * 100) / 100;
  const attackPwr  = () => Math.round((
      Math.pow(1.07, ACCv()) * (DMGv() + STRv() * STRm()) * ASv()
    + (CRv() * CDv() * ASv())
  ) * 10) / 10;
  const defensePwr = () => Math.round(HPv() * Math.pow(1.07, ACv()) * 10) / 10;
  const ttk        = () => Math.round((defensePwr() / attackPwr()) * 100) / 100;

  /* helpers to coerce NaN → 0 */
  function num(inp) { return parseFloat(inp.value) || 0; }
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