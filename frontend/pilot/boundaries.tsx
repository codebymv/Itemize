// Synthetic identity and shell only. Task components and GraphQL transport are real.
import React, {createContext, useContext, useState} from 'react';
import {markAuthenticatedSession, refreshAuthenticatedSession} from '@/lib/api';
const Context = createContext({signedIn: false, organizationId: 20, signIn: () => {}, select: (_id: number) => {}});
export function PilotBoundary({children}: {children: React.ReactNode}) {
  const [signedIn, setSignedIn] = useState(sessionStorage.getItem('pilot-session') === 'yes');
  const [organizationId, select] = useState(20);
  return <Context.Provider value={{signedIn, organizationId, select, signIn: () => {sessionStorage.setItem('pilot-session', 'yes'); localStorage.setItem('itemize_user', '{"id":7}'); markAuthenticatedSession(); setSignedIn(true);}}}>{children}</Context.Provider>;
}
export const useAuthState = () => ({currentUser: useContext(Context).signedIn ? {id: 7} : null, loading: false});
export const useAuthActions = () => {const state = useContext(Context); return {loginWithEmail: async () => state.signIn()};};
export class AuthError extends Error {code = '';}
export const useOrganization = () => ({organizationId: useContext(Context).organizationId, isLoading: false, error: null});
export const useGoogleSignIn = () => () => {};
export const GoogleOAuthGate = ({children}: {children: React.ReactNode}) => <>{children}</>;
export function PageLayout({title, children}: {title: string; children: React.ReactNode}) {
  const state = useContext(Context);
  return <main style={{padding: 16, maxWidth: 900, margin: 'auto'}}><h1>{title}</h1><label>Organization<select aria-label="Organization" value={state.organizationId} onChange={event => state.select(Number(event.target.value))}><option value="20">Synthetic A</option><option value="21">Synthetic B</option></select></label>{children}<button onClick={() => {sessionStorage.removeItem('pilot-session'); void refreshAuthenticatedSession().catch(() => {});}}>Expire synthetic session</button></main>;
}
export default function Background() {return null;}
