'use client';
import Link from 'next/link';
import {ReactNode,useState} from 'react';
import {ArrowRight,Check,LoaderCircle,PackageSearch,X} from 'lucide-react';
import {pretty} from '@/lib/types';
export function PageTitle({eyebrow,title,description,action}:{eyebrow?:string;title:string;description?:string;action?:ReactNode}){return <div className="page-title"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{action}</div>;}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin"/> Loading your next good find…</div>;}
export function Empty({title,text,href='/shop',label='Explore the marketplace'}:{title:string;text:string;href?:string;label?:string}){return <div className="empty"><PackageSearch size={44}/><h2>{title}</h2><p>{text}</p><Link className="button" href={href}>{label}<ArrowRight size={18}/></Link></div>;}
export function ErrorBox({message,retry}:{message:string;retry?:()=>void}){return <div className="error-box" role="alert"><p>{message}</p>{retry&&<button className="button secondary" onClick={retry}>Try again</button>}</div>;}
export function Badge({status}:{status:string}){return <span className={`badge ${['ACTIVE','SUCCEEDED','DELIVERED','FULFILLED','PAID','REFUNDED'].includes(status)?'green':['REJECTED','CANCELLED','SUSPENDED','FAILED'].includes(status)?'red':'amber'}`}>{pretty(status)}</span>;}
export function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}){return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}} onKeyDown={e=>{if(e.key==='Escape')close();}}><section role="dialog" aria-modal="true" aria-label={title} className="modal"><div className="section-heading"><h2>{title}</h2><button aria-label="Close dialog" className="icon-button" onClick={close}><X/></button></div>{children}</section></div>;}
export function Action({children,onClick,className='button',disabled=false}:{children:ReactNode;onClick:()=>Promise<unknown>;className?:string;disabled?:boolean}){const [busy,setBusy]=useState(false);return <button disabled={busy||disabled} className={className} onClick={async()=>{setBusy(true);try{await onClick();}finally{setBusy(false);}}}>{busy?<LoaderCircle size={18} className="spin"/>:null}{children}</button>;}
export function CheckItem({children}:{children:ReactNode}){return <span className="check-item"><Check size={16}/>{children}</span>;}
