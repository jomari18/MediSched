import {settings} from './config.js';
import {AUTH_STORAGE_KEY,isConfirmed,validatePublicConfig} from './auth-helpers.js';
export async function fetchAccessContext(client){const {data,error}=await client.rpc('get_access_context');if(error){if(['PGRST202','42883'].includes(error.code)){const e=Error('Portal setup is required. Apply the reviewed staff workflow migration (006), then reload.');e.code=error.code;throw e}throw error}if(!data||typeof data.is_staff!=='boolean'||typeof data.display_name!=='string')throw Error('Access could not be verified. Reload or contact the administrator.');return data}
export function createSessionController({client,onState=()=>{},onError=()=>{},shouldHandle=()=>true}){
 let state={epoch:0,user:null,access:null},subscription,disposed=false;
 const publish=s=>{state=s;onState(s)};
 async function refresh(session){const epoch=state.epoch+1;state={...state,epoch};if(disposed)return;
  try{
  if(session?.user?.id&&state.user&&session.user.id!==state.user.id)publish({epoch,user:null,access:null,pending:true});
  if(session===undefined){const response=await client.auth.getSession();if(response.error)throw response.error;session=response.data.session}
  if(epoch!==state.epoch||disposed)return;
  if(!session){publish({epoch,user:null,access:null});return}
  const {data,error}=await client.auth.getUser();if(epoch!==state.epoch||disposed)return;if(error||!isConfirmed(data?.user)){await client.auth.signOut({scope:'local'});if(epoch===state.epoch)publish({epoch,user:null,access:null});return}
   if(state.user&&state.user.id!==data.user.id)publish({epoch,user:null,access:null,pending:true});
   const access=await fetchAccessContext(client);if(epoch!==state.epoch||disposed)return;publish({epoch,user:data.user,access});return state;
  }catch(error){if(epoch===state.epoch&&!disposed){publish({epoch,user:null,access:null,error});onError(error)}throw error}
 }
 return {refresh,snapshot:()=>state,async start(){subscription=client.auth.onAuthStateChange((_event,session)=>{if(!disposed&&shouldHandle())setTimeout(()=>refresh(session).catch(()=>{}),0)}).data.subscription;return refresh()},async signOut(scope='global'){const {error}=await client.auth.signOut({scope});if(error)throw error;publish({epoch:state.epoch+1,user:null,access:null})},dispose(){disposed=true;state={epoch:state.epoch+1,user:null,access:null};subscription?.unsubscribe()}};
}
export async function initializeSession({page,onReady,onClear,onError}){const config=validatePublicConfig(settings);const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.117.3');const client=createClient(config.url,config.publishableKey,{auth:{storageKey:AUTH_STORAGE_KEY,flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});let leaving=false;const controller=createSessionController({client,onState:state=>{if(!state.user){onClear?.(state);if(!state.error&&!state.pending&&page!=='auth'&&!leaving){leaving=true;location.replace('index.html?reason=session-ended')}return}if(page==='staff'&&!state.access.is_staff){onClear?.(state);location.replace('dashboard.html');return}onReady?.({...state,client,controller})},onError});await controller.start();return {client,controller}}
