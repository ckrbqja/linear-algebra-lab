const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let googleIdentityScriptPromise = null;

function loadGoogleIdentityServices() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser.'));
  }

  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleIdentityScriptPromise) return googleIdentityScriptPromise;

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID);
    const script = existing ?? document.createElement('script');

    const handleLoad = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google);
      } else {
        googleIdentityScriptPromise = null;
        reject(new Error('Google Identity Services did not initialize.'));
      }
    };
    const handleError = () => {
      googleIdentityScriptPromise = null;
      reject(new Error('Google Identity Services failed to load.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });

    if (!existing) {
      script.id = GOOGLE_IDENTITY_SCRIPT_ID;
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
  });

  return googleIdentityScriptPromise;
}

export async function promptGoogleOneTap({ clientId, nonce, onCredential }) {
  if (!clientId || typeof onCredential !== 'function') return () => {};

  const google = await loadGoogleIdentityServices();
  google.accounts.id.initialize({
    client_id: clientId,
    auto_select: false,
    color_scheme: 'dark',
    context: 'signin',
    itp_support: true,
    nonce,
    callback: (response) => {
      if (response?.credential) onCredential(response.credential);
    },
  });
  google.accounts.id.prompt();

  return () => {
    google.accounts.id.cancel();
  };
}
