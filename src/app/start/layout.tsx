import type { ReactNode } from 'react';

// Landing beacon for the ad funnel's true entrance count.
//
// The existing 'start:need-check' beacon only fires from a React useEffect —
// i.e. AFTER the (heavy) app bundle downloads and hydrates. Anyone who opens
// the page but bounces during that load — very common in the slow Instagram/
// Facebook in-app browser where ad traffic lands — was invisible to the funnel.
//
// This inline script runs the moment the HTML is parsed, before the bundle
// loads, and records a 'start:landed' event for EVERY page-open (matching
// Meta's Landing Page Views). It reuses the same cr_anon cookie as lib/funnel
// so 'landed' and every later step share one visitor id, and it uses
// sendBeacon so the event still sends even if the user leaves immediately.
// Now the entrance drop-off (opened → reached screen 1) is measurable, not a
// blind spot.
const LANDED_BEACON = `(function(){try{
if(/[?&]demo=1/.test(location.search))return;
var m=document.cookie.match(/(?:^|; )cr_anon=([^;]+)/);
var id=m?decodeURIComponent(m[1]):null;
if(!id){id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():'a'+Date.now()+Math.random().toString(36).slice(2,8);
document.cookie='cr_anon='+id+'; path=/; max-age=7776000; samesite=lax';}
var b=JSON.stringify({anon:id,step:'start:landed'});
if(navigator.sendBeacon){navigator.sendBeacon('/api/funnel',new Blob([b],{type:'application/json'}));}
else{fetch('/api/funnel',{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true}).catch(function(){});}
}catch(e){}})();`;

export default function StartLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Runs before the React bundle — see note above. */}
      <script dangerouslySetInnerHTML={{ __html: LANDED_BEACON }} />
      {children}
    </>
  );
}
