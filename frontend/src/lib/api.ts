'use client';
import {useCallback,useEffect,useState} from 'react';
export async function api<T=unknown>(path:string,options:RequestInit={}):Promise<T>{
  const r=await fetch(`/api${path}`,{...options,credentials:'include',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const data=await r.json().catch(()=>({message:'The server could not be reached'}));
  if(!r.ok)throw new Error(data.message||'Request failed');return data;
}
export const json=(body:unknown,method='POST'):RequestInit=>({method,body:JSON.stringify(body)});
export function useApi<T>(path:string|null){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const refresh=useCallback(async()=>{if(!path){setLoading(false);return;}setError('');setLoading(true);try{setData(await api<T>(path));}catch(e){setError(e instanceof Error?e.message:'Request failed');}finally{setLoading(false);}},[path]);
  useEffect(()=>{let active=true;setLoading(true);setError('');if(!path){setLoading(false);return;}api<T>(path).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[path]);
  return {data,error,loading,refresh,setData};
}
