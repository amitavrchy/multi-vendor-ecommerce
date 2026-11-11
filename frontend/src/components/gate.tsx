'use client';
import {ReactNode} from 'react';
import {useStore} from './provider';
import {Empty,Loading} from './ui';
export function Gate({children,roles}:{children:ReactNode;roles?:string[]}){const {user,ready}=useStore();if(!ready)return <Loading/>;if(!user)return <Empty title="Your Bazaar starts here" text="Sign in to see your account, bag and orders." href="/login" label="Sign in"/>;if(roles&&!roles.includes(user.role))return <Empty title="This space is for another role" text="Visit your account to find the right place." href="/account" label="My account"/>;return children;}
