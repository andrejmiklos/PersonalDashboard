import { t, type Locale } from '@dashboard/shared';
import { pairWithCode } from './api';

export interface PairingForm {
  show(locale: Locale): void;
  hide(): void;
}

/**
 * Form for a one-time pairing code (`npm run pair`). On success `onToken` receives the new device
 * token; it is never shown on screen.
 */
export function createPairingForm(parent: HTMLElement, onToken: (token: string) => void): PairingForm {
  const form = document.createElement('form');
  form.className = 'pair';
  form.hidden = true;
  form.autocomplete = 'off';

  const input = document.createElement('input');
  input.className = 'pair-code';
  input.type = 'text';
  input.maxLength = 12;
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocorrect', 'off');

  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'pair-submit';

  const error = document.createElement('p');
  error.className = 'pair-error';

  form.append(input, button, error);
  parent.appendChild(form);

  let locale: Locale = 'sk';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = input.value.trim();
    if (code === '' || button.disabled) return;
    button.disabled = true;
    error.textContent = '';
    void pairWithCode(code).then((result) => {
      button.disabled = false;
      if (result.kind === 'paired') {
        input.value = '';
        onToken(result.token);
        return;
      }
      error.textContent = t(locale, result.kind === 'invalid' ? 'pair.invalid' : 'pair.failed');
    });
  });

  return {
    show(nextLocale) {
      locale = nextLocale;
      input.placeholder = t(locale, 'pair.placeholder');
      button.textContent = t(locale, 'pair.submit');
      form.hidden = false;
    },
    hide() {
      form.hidden = true;
      error.textContent = '';
    },
  };
}
