import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  UserPlus,
  X,
} from 'lucide-react';
import FlowMathMark from '../components/FlowMathMark.jsx';

export default function FlowAuthDialog({
  auth,
  dialogRef,
  emailInputRef,
  onClose,
  onEmailAuth,
  onEmailChange,
  onGoogleLogin,
  onModeChange,
  onPasswordChange,
  onPasswordConfirmChange,
  onTogglePasswordVisibility,
  passwordConfirmInputRef,
  passwordInputRef,
  translate,
}) {
  const {
    busy,
    email,
    error,
    errorField,
    mode,
    password,
    passwordConfirm,
    passwordVisible,
  } = auth;

  return (
    <div
      aria-describedby="flow-auth-description"
      aria-labelledby="flow-auth-title"
      aria-modal="true"
      className="flow-auth-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <form
        className="flow-auth-panel"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onEmailAuth(mode);
        }}
        ref={dialogRef}
      >
        <div className="flow-auth-head">
          <div className="flow-auth-brand">
            <FlowMathMark className="flow-auth-mark" />
            <span>Flow Math</span>
          </div>
          <button
            aria-label={translate('flowHomeLoginCancel')}
            className="flow-auth-close"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flow-auth-intro">
          <h2 id="flow-auth-title">
            {translate(mode === 'signup' ? 'flowAuthSignupTitle' : 'flowAuthLoginTitle')}
          </h2>
          <p id="flow-auth-description">
            {translate(mode === 'signup' ? 'flowAuthSignupLead' : 'flowAuthLoginLead')}
          </p>
        </div>

        <div
          aria-label={translate('flowAuthModeLabel')}
          className="flow-auth-mode-switch"
          role="group"
        >
          {['login', 'signup'].map((nextMode) => (
            <button
              aria-pressed={mode === nextMode}
              className={mode === nextMode ? 'active' : ''}
              disabled={busy}
              key={nextMode}
              onClick={() => onModeChange(nextMode)}
              type="button"
            >
              {translate(nextMode === 'signup' ? 'flowAuthSignupTab' : 'flowAuthLoginTab')}
            </button>
          ))}
        </div>

        <button
          className="flow-auth-google"
          disabled={busy}
          onClick={onGoogleLogin}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="flow-auth-google-mark"
            viewBox="0 0 24 24"
          >
            <path
              d="M21.35 12.18c0-.64-.06-1.25-.16-1.84H12v3.48h5.25a4.49 4.49 0 0 1-1.95 2.94v2.26h3.16c1.85-1.7 2.89-4.2 2.89-6.84Z"
              fill="#4285F4"
            />
            <path
              d="M12 21.72c2.64 0 4.86-.87 6.48-2.37l-3.16-2.45c-.88.59-2 .94-3.32.94-2.55 0-4.71-1.72-5.48-4.03H3.25v2.53A9.79 9.79 0 0 0 12 21.72Z"
              fill="#34A853"
            />
            <path
              d="M6.52 13.81A5.9 5.9 0 0 1 6.21 12c0-.63.11-1.24.31-1.81V7.66H3.25A9.74 9.74 0 0 0 2.21 12c0 1.57.38 3.05 1.04 4.34l3.27-2.53Z"
              fill="#FBBC05"
            />
            <path
              d="M12 6.16c1.44 0 2.72.49 3.73 1.46l2.81-2.81A9.43 9.43 0 0 0 12 2.28a9.79 9.79 0 0 0-8.75 5.38l3.27 2.53C7.29 7.88 9.45 6.16 12 6.16Z"
              fill="#EA4335"
            />
          </svg>
          <span>{translate('flowHomeLoginGoogle')}</span>
        </button>

        <div className="flow-auth-divider">
          <span>{translate('flowAuthOrEmail')}</span>
        </div>

        <div className="flow-auth-fields">
          <label className="flow-auth-field" htmlFor="flow-auth-email">
            <span>{translate('flowAuthEmailLabel')}</span>
            <div className={errorField === 'email' ? 'flow-auth-input invalid' : 'flow-auth-input'}>
              <Mail aria-hidden="true" size={17} />
              <input
                aria-describedby={errorField === 'email' ? 'flow-auth-email-error' : undefined}
                aria-invalid={errorField === 'email'}
                autoComplete="email"
                id="flow-auth-email"
                inputMode="email"
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="name@example.com"
                ref={emailInputRef}
                type="email"
                value={email}
              />
            </div>
            {error && errorField === 'email' && (
              <small
                aria-live="polite"
                className="flow-auth-field-error"
                id="flow-auth-email-error"
                role="alert"
              >
                {error}
              </small>
            )}
          </label>

          <label className="flow-auth-field" htmlFor="flow-auth-password">
            <span>{translate('flowAuthPasswordLabel')}</span>
            <div className={errorField === 'password' ? 'flow-auth-input invalid' : 'flow-auth-input'}>
              <Lock aria-hidden="true" size={17} />
              <input
                aria-describedby={
                  errorField === 'password' ? 'flow-auth-password-error' : undefined
                }
                aria-invalid={errorField === 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                id="flow-auth-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder={translate('flowHomePasswordPlaceholder')}
                ref={passwordInputRef}
                type={passwordVisible ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={translate(
                  passwordVisible ? 'flowAuthHidePassword' : 'flowAuthShowPassword'
                )}
                className="flow-auth-password-toggle"
                onClick={onTogglePasswordVisibility}
                type="button"
              >
                {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {error && errorField === 'password' && (
              <small
                aria-live="polite"
                className="flow-auth-field-error"
                id="flow-auth-password-error"
                role="alert"
              >
                {error}
              </small>
            )}
          </label>

          {mode === 'signup' && (
            <label className="flow-auth-field" htmlFor="flow-auth-password-confirm">
              <span>{translate('flowAuthPasswordConfirmLabel')}</span>
              <div className={errorField === 'confirm' ? 'flow-auth-input invalid' : 'flow-auth-input'}>
                <Lock aria-hidden="true" size={17} />
                <input
                  aria-describedby={
                    errorField === 'confirm' ? 'flow-auth-password-confirm-error' : undefined
                  }
                  aria-invalid={errorField === 'confirm'}
                  autoComplete="new-password"
                  id="flow-auth-password-confirm"
                  onChange={(event) => onPasswordConfirmChange(event.target.value)}
                  placeholder={translate('flowAuthPasswordConfirmPlaceholder')}
                  ref={passwordConfirmInputRef}
                  type={passwordVisible ? 'text' : 'password'}
                  value={passwordConfirm}
                />
              </div>
              {error && errorField === 'confirm' ? (
                <small
                  aria-live="polite"
                  className="flow-auth-field-error"
                  id="flow-auth-password-confirm-error"
                  role="alert"
                >
                  {error}
                </small>
              ) : (
                <small>{translate('flowAuthPasswordHint')}</small>
              )}
            </label>
          )}
        </div>

        {error && errorField === 'form' && (
          <p aria-live="polite" className="flow-auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="flow-auth-submit" disabled={busy} type="submit">
          {busy ? (
            <>
              <span aria-hidden="true" className="flow-auth-spinner" />
              <span>{translate('flowAuthProcessing')}</span>
            </>
          ) : (
            <>
              {mode === 'signup' ? <UserPlus size={17} /> : <LogIn size={17} />}
              <span>
                {translate(mode === 'signup' ? 'flowHomeEmailSignup' : 'flowHomeEmailLogin')}
              </span>
            </>
          )}
        </button>

        <p className="flow-auth-security">
          <Lock aria-hidden="true" size={13} />
          <span>{translate('flowAuthSecurityNote')}</span>
        </p>
      </form>
    </div>
  );
}
