import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { validateEnv } from './lib/env';
import './index.css';

// ---------------------------------------------------------------------------
// React 18 DOM crash workaround (NotFoundError: removeChild on Node).
//
// Third-party scripts (Google AdSense's sodar2.js fraud iframe, the Chrome
// Translate API, Notion clipper, password managers, etc.) mutate or re-parent
// DOM nodes inside React's tree. When React then reconciles and tries to
// `removeChild` / `insertBefore`, the parent no longer matches and the entire
// app crashes through the error boundary on back-button navigation.
//
// Standard mitigation (see facebook/react#11538): patch the two offenders so
// they silently no-op when the parent has been swapped out instead of throwing.
// React re-renders on the next tick so the visible tree stays correct.
// ---------------------------------------------------------------------------
if (typeof Node === 'function' && Node.prototype) {
  const origRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      return child;
    }
    return origRemove.apply(this, arguments);
  };
  const origInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    return origInsert.apply(this, arguments);
  };
}

// Validate environment variables on startup
validateEnv();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
