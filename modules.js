(() => {
  'use strict';
  function discover(base,resources=[],nodes=[]){
    const root=new URL('../',base),names=new Set();
    for(const raw of [...resources.map(r=>typeof r==='string'?r:r?.name),...nodes.map(n=>n?.getAttribute?.('src')??n?.getAttribute?.('href'))]){
      if(typeof raw!=='string')continue;
      try{const url=new URL(raw,base);if(url.origin!==root.origin||url.pathname.slice(0,url.pathname.lastIndexOf('/')+1)!==root.pathname)continue;const name=url.pathname.split('/').at(-1);if(/^game-[A-Z0-9]+\.js$/i.test(name))names.add(name);}catch(error){}
    }
    return [...names];
  }
  globalThis.DVModules={discover};
})();
