import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import Login from '@/pages/Login';
import ProtectedRoute from '@/components/ProtectedRoute';
import {ClientFollowUpsPage} from '@/pages/contacts/components/ClientFollowUpsPage';
import {PilotBoundary} from './boundaries';
import '@/index.css';
const client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
createRoot(document.getElementById('root')!).render(<BrowserRouter><QueryClientProvider client={client}><PilotBoundary><Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<ProtectedRoute />}><Route path="/contacts" element={<ClientFollowUpsPage />} /></Route>
</Routes></PilotBoundary></QueryClientProvider></BrowserRouter>);
