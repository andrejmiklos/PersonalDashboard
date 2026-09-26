import { useMemo, useState } from 'preact/hooks';
import { createApi } from './api';
import { readToken, storeToken } from './auth';
import { I18nProvider } from './i18n';
import { Login } from './login';
import { Shell } from './shell';
import { safeLocalStorage } from './storage';

const storage = safeLocalStorage();

export function App() {
  const [token, setToken] = useState(() => readToken(storage));

  function login(next: string): void {
    storeToken(storage, next);
    setToken(next);
  }
  function logout(): void {
    storeToken(storage, null);
    setToken(null);
  }

  // A token the server no longer accepts (revoked) ends the session.
  const api = useMemo(() => (token === null ? null : createApi(token, logout)), [token]);

  return (
    <I18nProvider>{api ? <Shell api={api} onLogout={logout} /> : <Login onLogin={login} />}</I18nProvider>
  );
}
