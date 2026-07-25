import React from 'react';
import ReactDOM from 'react-dom/client';
import { PostHogProvider } from '@posthog/react';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import App from './App.jsx';
import FlowAppReady from './app/FlowAppReady.jsx';
import { registerFlowMathServiceWorker } from './app/registerServiceWorker.js';
import './styles.css';

const posthogOptions = {
  api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://edge.flow-math.com',
  defaults: '2026-05-30',
  person_profiles: 'always',
  ui_host: 'https://us.posthog.com',
};

const posthogProjectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const app = posthogProjectToken ? (
  <PostHogProvider apiKey={posthogProjectToken} options={posthogOptions}>
    <App />
  </PostHogProvider>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FlowAppReady>{app}</FlowAppReady>
  </React.StrictMode>
);

registerFlowMathServiceWorker();
