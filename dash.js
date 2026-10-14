(() => {
  'use strict';
  const vectors={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}};
  function attempt(player,state,code){
    const vector=vectors[code];
    if(!vector||state?.dashEnabled$?.value!==true||state?.canDash$?.value!==true||player?.isDashing||typeof player?.dash!=='function')return false;
    player.dash(vector);
    return player.isDashing===true||state.canDash$.value===false;
  }
  globalThis.DVDash={attempt};
})();
