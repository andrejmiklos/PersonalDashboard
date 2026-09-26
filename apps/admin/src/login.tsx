import { useState } from 'preact/hooks';
import { checkToken, type LoginResult } from './auth';
import { useI18n } from './i18n';

export function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Exclude<LoginResult, 'ok'> | null>(null);

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    const candidate = token.trim();
    if (candidate === '' || busy) return;
    setBusy(true);
    setFailure(null);
    const result = await checkToken(candidate);
    setBusy(false);
    if (result === 'ok') onLogin(candidate);
    else setFailure(result);
  }

  return (
    <main class="login">
      <h1>{t('admin.title')}</h1>
      <p class="muted">{t('admin.login.hint')}</p>
      <form onSubmit={submit}>
        <input
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('admin.login.placeholder')}
          aria-label={t('admin.login.placeholder')}
          value={token}
          onInput={(event) => setToken(event.currentTarget.value)}
        />
        <button type="submit" class="primary" disabled={busy || token.trim() === ''}>
          {busy ? t('admin.login.checking') : t('admin.login.submit')}
        </button>
        {failure && (
          <p class="error" role="alert">
            {t(failure === 'invalid' ? 'admin.login.invalid' : 'admin.login.failed')}
          </p>
        )}
      </form>
    </main>
  );
}
