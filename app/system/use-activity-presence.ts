import { useEffect,useRef,useSyncExternalStore } from 'react';
import { activityWrite } from './activity-client';

/** The screen tab currently mounted inside a module, e.g. "projects-schedule"; one value for the whole app. */
const subView:{key:string|null;owner:object|null}={key:null,owner:null};
const subViewListeners=new Set<()=>void>();
const setSubView=(key:string|null,owner:object|null)=>{if(subView.key===key&&subView.owner===owner)return;subView.key=key;subView.owner=owner;subViewListeners.forEach(listener=>listener());};
const subscribeSubView=(listener:()=>void)=>{subViewListeners.add(listener);return()=>{subViewListeners.delete(listener);};};
const readSubView=()=>subView.key;
/** A sub-view reports only inside its own module, so a stale key from another screen never leaks into presence. */
export const activityPresenceModule=(module:string,key:string|null)=>key&&key.startsWith(`${module}-`)?key:module;

/** Report a sub-view (keys must be in the presence allowlist) while this component is mounted; null reports nothing. */
export function useActivitySubView(key:string|null){
 useEffect(()=>{
  if(!key)return;
  const owner={};setSubView(key,owner);
  // A newer screen may already own the value; only the owner clears it.
  return()=>{if(subView.owner===owner)setSubView(null,null);};
 },[key]);
}

/** Views whose screens always report a sub-view (keys "<view>-<tab>" in the presence allowlist). */
export const activitySubViewParents:ReadonlySet<string>=new Set(['projects','resources']);
/** How long a page open waits for a lazily loaded screen to register its sub-view before reporting the bare view. */
export const activitySubViewWaitMs=4_000;
/** Milliseconds to hold a page open of `reported`: a bare view that has sub-views waits, so a lazy chunk logs one page, not parent then child. */
export const activityPageOpenDelay=(module:string,reported:string)=>reported===module&&activitySubViewParents.has(module)?activitySubViewWaitMs:0;

/** Visible navigation and trusted interaction only. Polling and idle timers earn no activity. */
export function useActivityPresence(userId:number|undefined,module:string,enabled:boolean){
 const state=useRef({at:0,module:'',user:0,page:''});
 const reported=activityPresenceModule(module,useSyncExternalStore(subscribeSubView,readSubView,()=>null));
 useEffect(()=>{
  if(!enabled||!userId)return;
  let pending=false,timer:ReturnType<typeof setTimeout>|undefined;
  // Child screens set their sub-view in effects that run before this one, so read the live value.
  const current=activityPresenceModule(module,subView.key);
  const opened=()=>state.current.user===userId&&state.current.page===current;
  // The bare view was already reported after the sub-view wait ran out (a slow lazy chunk): its late sub-view continues that page open.
  const continues=()=>state.current.user===userId&&state.current.page===module&&current!==module;
  // page=true only for the first visible report of this view in this window; every other ping sends page=false,
  // so windows on different views share the server session without logging pages for each other.
  const record=(page:boolean)=>{
   if(document.visibilityState!=='visible')return;
   if(page&&continues()){state.current={...state.current,page:current};page=false;}
   const now=Date.now(),last=state.current,opening=page&&!opened();
   if(!opening&&(pending||last.user===userId&&now-last.at<60_000))return;
   state.current={at:now,module:current,user:userId,page:opening?current:last.user===userId?last.page:''};pending=true;
   void activityWrite('presence',{module:current,page:opening}).catch(()=>{state.current.at=0;if(opening&&state.current.page===current)state.current.page='';}).finally(()=>{pending=false;});
  };
  const interaction=(event:Event)=>{if(event.isTrusted)record(false);};
  // A page open skipped while hidden is reported when the window becomes visible, unless it is still waiting for a sub-view.
  const visible=()=>{if(document.visibilityState==='visible')record(timer===undefined);};
  const delay=opened()?0:activityPageOpenDelay(module,current);
  if(delay)timer=setTimeout(()=>{timer=undefined;record(true);},delay);else record(true);
  window.addEventListener('pointerdown',interaction,{passive:true});window.addEventListener('keydown',interaction);window.addEventListener('scroll',interaction,{passive:true});document.addEventListener('visibilitychange',visible);
  return()=>{if(timer!==undefined)clearTimeout(timer);window.removeEventListener('pointerdown',interaction);window.removeEventListener('keydown',interaction);window.removeEventListener('scroll',interaction);document.removeEventListener('visibilitychange',visible);};
 },[enabled,userId,module,reported]);
}
