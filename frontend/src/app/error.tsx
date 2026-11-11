'use client';
import {ErrorBox} from '@/components/ui';
export default function Error({reset}:{reset:()=>void}){return <div className="container page"><ErrorBox message="This page could not load. Please try again." retry={reset}/></div>;}
