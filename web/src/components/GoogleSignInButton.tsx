import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme: 'outline';
              size: 'large';
              text: string;
              shape: 'rectangular';
              width: number;
            },
          ) => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with';
}

export default function GoogleSignInButton({
  onCredential,
  text = 'signin_with',
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId || !buttonRef.current) return;

    const element = buttonRef.current;
    let observer: ResizeObserver | undefined;
    const renderButton = () => {
      if (!window.google) return;
      const width = Math.floor(element.getBoundingClientRect().width);
      if (width < 120) return;
      element.replaceChildren();
      window.google.accounts.id.renderButton(element, {
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        width: Math.min(width, 400),
      });
    };
    const initialize = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => onCredential(response.credential),
      });
      renderButton();
      observer = new ResizeObserver(renderButton);
      observer.observe(element);
    };

    if (window.google) {
      initialize();
      return () => observer?.disconnect();
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (existing) {
      existing.addEventListener('load', initialize);
      return () => {
        existing.removeEventListener('load', initialize);
        observer?.disconnect();
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = initialize;
    document.head.appendChild(script);
    return () => {
      script.onload = null;
      observer?.disconnect();
    };
  }, [onCredential, text]);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) return null;

  return (
    <div className="google-signin-section">
      <div className="auth-divider"><span>Or continue with</span></div>
      <div ref={buttonRef} className="google-signin-button" />
    </div>
  );
}
