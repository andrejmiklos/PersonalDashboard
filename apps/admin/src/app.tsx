import { useState } from 'preact/hooks';
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

  return <I18nProvider>{token ? <Shell onLogout={logout} /> : <Login onLogin={login} />}</I18nProvider>;
}
