import { useEffect,useRef } from 'react';
import { activityWrite } from './activity-client';

/** Visible navigation and trusted interaction only. Polling and idle timers earn no activity. */
export function useActivityPresence(userId:number|undefined,module:string,enabled:boolean){
 const state=useRef({at:0,module:'',user:0});
 useEffect(()=>{
  if(!enabled||!userId)return;
  let pending=false;
  const record=(navigation=false)=>{
   if(document.visibilityState!=='visible'||pending)return;
   const now=Date.now(),last=state.current;
   if(last.user===userId&&now-last.at<60_000&&(!navigation||last.module===module))return;
   state.current={at:now,module,user:userId};pending=true;
   void activityWrite('presence',{module}).catch(()=>{state.current.at=0;}).finally(()=>{pending=false;});
  };
  const interaction=(event:Event)=>{if(event.isTrusted)record();};
  const visible=()=>{if(document.visibilityState==='visible')record(true);};
  record(true);
  window.addEventListener('pointerdown',interaction,{passive:true});window.addEventListener('keydown',interaction);window.addEventListener('scroll',interaction,{passive:true});document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('pointerdown',interaction);window.removeEventListener('keydown',interaction);window.removeEventListener('scroll',interaction);document.removeEventListener('visibilitychange',visible);};
 },[enabled,userId,module]);
}
