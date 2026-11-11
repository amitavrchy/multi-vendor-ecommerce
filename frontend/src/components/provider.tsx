'use client';
import {createContext,useCallback,useContext,useEffect,useState,ReactNode} from 'react';
import {io} from 'socket.io-client';
import {api,json} from '@/lib/api';
import {CartItem,User} from '@/lib/types';
type Store={user:User|null;ready:boolean;cart:CartItem[];wishlist:string[];refresh:()=>Promise<void>;toast:(message:string)=>void;add:(variantId:string,qty?:number)=>Promise<void>;toggleWish:(id:string)=>void;logout:()=>Promise<void>};
const Context=createContext<Store>(null!);
export const useStore=()=>useContext(Context);
export function Provider({children}:{children:ReactNode}){
  const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[cart,setCart]=useState<CartItem[]>([]),[wishlist,setWishlist]=useState<string[]>([]),[message,setMessage]=useState('');
  const toast=useCallback((m:string)=>setMessage(m),[]);
  useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),4500);return()=>clearTimeout(t);},[message]);
  const refresh=useCallback(async()=>{try{const u=await api<User>('/auth/me');setUser(u);const c=await api<{items:CartItem[]}>('/cart');setCart(c.items);}catch{setUser(null);setCart([]);}finally{setReady(true);}},[]);
  useEffect(()=>{void refresh();try{setWishlist(JSON.parse(localStorage.getItem('bazaar-wishlist')||'[]'));}catch{/* invalid local storage is reset */}},[refresh]);
  useEffect(()=>{if(!user)return;const s=io(process.env.NEXT_PUBLIC_SOCKET_URL||'http://localhost:4000',{withCredentials:true});s.on('order.status_changed',()=>{toast('Your order has an update');window.dispatchEvent(new Event('orders-updated'));});s.on('order.new',()=>{toast('A new order just arrived');window.dispatchEvent(new Event('orders-updated'));});return()=>{s.disconnect();};},[user,toast]);
  const add=async(variantId:string,qty=1)=>{if(!user){toast('Sign in to add items to your bag');window.location.href=`/login?next=${encodeURIComponent(window.location.pathname)}`;return;}try{const old=cart.find(i=>i.variant.id===variantId);await api('/cart/items',json({variantId,qty:(old?.qty||0)+qty}));await refresh();toast('Added to your bag');}catch(e){toast((e as Error).message);}};
  const toggleWish=(id:string)=>setWishlist(old=>{const next=old.includes(id)?old.filter(x=>x!==id):[...old,id];try{localStorage.setItem('bazaar-wishlist',JSON.stringify(next));}catch{toast('Your browser could not save this wishlist');}return next;});
  const logout=async()=>{await api('/auth/logout',json({}));setUser(null);setCart([]);window.location.href='/';};
  return <Context.Provider value={{user,ready,cart,wishlist,refresh,toast,add,toggleWish,logout}}>{children}<div className={`toast ${message?'visible':''}`} role="status" aria-live="polite">{message}</div></Context.Provider>;
}
