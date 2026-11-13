import { describe, expect, it, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createFakeSupabase } from '@cargoclear/core/testing';
import { createTranslator } from '@cargoclear/core';
import Root from '../app/Root.jsx';
import { createDexieAdapter } from '../storage/dexieAdapter.js';

const ru = createTranslator('ru');
const en = createTranslator('en');

function setup(path = '/', { user = false, lang = 'ru' } = {}) {
  localStorage.setItem('cargoclear.lang', lang);
  const fake = createFakeSupabase();
  const account = fake._addUser('alice@example.com', 'password1');
  if (user) fake._setSession(account);
  const utils = render(<MemoryRouter initialEntries={[path]}><Root client={fake} /></MemoryRouter>);
  return { fake, account, ...utils };
}
const type = (label, value) => fireEvent.change(screen.getByLabelText(new RegExp(label, 'i')), { target: { value } });

describe('protected routes and session', () => {
  it('shows the login page instead of private data when signed out', async () => {
    setup('/shipments');
    expect(await screen.findByRole('heading', { name: ru('auth.login.title') })).toBeTruthy();
    expect(screen.queryByText(ru('nav.shipments'))).toBeNull();
    expect(document.querySelector('[data-account-menu]')).toBeNull();
  });

  it('an existing session opens the app directly (session persistence)', async () => {
    setup('/', { user: true });
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
    expect(screen.queryByRole('heading', { name: ru('auth.login.title') })).toBeNull();
  });

  it('logout returns to the login page', async () => {
    setup('/', { user: true });
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('[data-sync="synced"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-account-menu]'));
    fireEvent.click(document.querySelector('[data-logout]'));
    expect(await screen.findByRole('heading', { name: ru('auth.login.title') }, { timeout: 6000 })).toBeTruthy();
  });

  it('an unexpected sign-out (expired session) explains what happened and keeps nothing private on screen', async () => {
    const { fake } = setup('/', { user: true });
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
    act(() => fake._expireSession());
    expect(await screen.findByText(ru('auth.expired.title'))).toBeTruthy();
    expect(document.querySelector('[data-account-menu]')).toBeNull();
  });
});

describe('login', () => {
  it('rejects a wrong password with a translated message and accepts the right one', async () => {
    setup('/');
    await screen.findByRole('heading', { name: ru('auth.login.title') });
    type(ru('auth.email'), 'alice@example.com');
    type(ru('auth.password'), 'wrong-password');
    fireEvent.click(document.querySelector('[data-auth-submit]'));
    expect((await screen.findByRole('alert')).textContent).toBe(ru('auth.err.invalid'));
    type(ru('auth.password'), 'password1');
    fireEvent.click(document.querySelector('[data-auth-submit]'));
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
  });

  it('validates input before calling the server', async () => {
    const { fake } = setup('/');
    await screen.findByRole('heading', { name: ru('auth.login.title') });
    fireEvent.click(document.querySelector('[data-auth-submit]'));
    expect(await screen.findByText(ru('auth.v.email'))).toBeTruthy();
    expect(fake._state.calls.filter((c) => /signIn/.test(String(c.op ?? c))).length).toBe(0);
  });

  it('shows a network error and does not log in when the server is unreachable', async () => {
    const { fake } = setup('/');
    await screen.findByRole('heading', { name: ru('auth.login.title') });
    fake._state.offline = true;
    type(ru('auth.email'), 'alice@example.com');
    type(ru('auth.password'), 'password1');
    fireEvent.click(document.querySelector('[data-auth-submit]'));
    expect((await screen.findByRole('alert')).textContent).toBe(ru('auth.err.network'));
  });

  it('switches the whole page to English', async () => {
    setup('/', { lang: 'en' });
    expect(await screen.findByRole('heading', { name: en('auth.login.title') })).toBeTruthy();
    expect(screen.getByText(en('auth.forgot.cta'))).toBeTruthy();
  });
});

describe('registration and password reset', () => {
  const fill = (v) => {
    type(ru('auth.fullName'), v.fullName);
    type(ru('auth.company'), v.company);
    type(ru('auth.email'), v.email);
    fireEvent.change(document.querySelectorAll('input[type=password]')[0], { target: { value: v.password } });
    fireEvent.change(document.querySelectorAll('input[type=password]')[1], { target: { value: v.confirm } });
  };

  it('requires matching passwords', async () => {
    setup('/register');
    await screen.findByRole('heading', { name: ru('auth.register.title') });
    fill({ fullName: 'Алия Нурлан', company: 'ТОО Логистик', email: 'new@example.com', password: 'password1', confirm: 'password2' });
    fireEvent.click(screen.getByRole('button', { name: ru('auth.register.submit') }));
    expect(await screen.findByText(ru('auth.v.mismatch'))).toBeTruthy();
  });

  it('creates the account and asks to confirm the email when confirmation is enabled', async () => {
    const { fake } = setup('/register');
    fake._state.emailConfirmation = true;
    await screen.findByRole('heading', { name: ru('auth.register.title') });
    fill({ fullName: 'Алия Нурлан', company: 'ТОО Логистик', email: 'new@example.com', password: 'password1', confirm: 'password1' });
    fireEvent.click(screen.getByRole('button', { name: ru('auth.register.submit') }));
    expect(await screen.findByText(ru('auth.confirm.text'))).toBeTruthy();
  });

  it('forgot password gives the same answer for known and unknown addresses', async () => {
    for (const email of ['alice@example.com', 'nobody@example.com']) {
      const { unmount } = setup('/forgot-password');
      await screen.findByRole('heading', { name: ru('auth.forgot.title') });
      type(ru('auth.email'), email);
      fireEvent.click(screen.getByRole('button', { name: ru('auth.forgot.submit') }));
      expect(await screen.findByText(ru('auth.forgot.sent'))).toBeTruthy();
      unmount();
    }
  });

  it('reset page without a recovery link shows an expired-link message', async () => {
    setup('/reset-password');
    expect(await screen.findByText(ru('auth.expired.linkTitle'))).toBeTruthy();
  });

  it('a recovery session opens the new-password form and saves the password', async () => {
    const { fake } = setup('/reset-password');
    await screen.findByText(ru('auth.expired.linkTitle'));
    act(() => { fake._setSession(fake._addUser('r@example.com', 'old-password')); fake._recovery(); });
    const inputs = await waitFor(() => {
      const i = document.querySelectorAll('input[type=password]');
      expect(i.length).toBe(2);
      return i;
    });
    fireEvent.change(inputs[0], { target: { value: 'brand-new-pass' } });
    fireEvent.change(inputs[1], { target: { value: 'brand-new-pass' } });
    fireEvent.click(screen.getByRole('button', { name: ru('auth.reset.submit') }));
    expect(await screen.findByText(ru('auth.reset.done'))).toBeTruthy();
  });
});

describe('cloud mode data handling', () => {
  beforeEach(async () => { await createDexieAdapter('cargoclear-kz').clearAll(); });

  it('never shows demo controls or demo data in a cloud account', async () => {
    setup('/', { user: true });
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
    expect(document.querySelector('[data-launch-demo]')).toBeNull();
    expect(document.querySelector('[data-sync]')).toBeTruthy();
  });

  it('the sync badge reports offline/pending instead of "synchronised" when the cloud is unreachable', async () => {
    const { fake } = setup('/', { user: true });
    fake._state.offline = true;
    await waitFor(() => expect(document.querySelector('[data-account-menu]')).toBeTruthy());
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(['offline', 'pending', 'error']).toContain(document.querySelector('[data-sync]')?.getAttribute('data-sync')));
    expect(document.querySelector('[data-sync="synced"]')).toBeNull();
  });

  it('the guest demo is a separate workspace and says it is not saved to the cloud', async () => {
    setup('/');
    await screen.findByRole('heading', { name: ru('auth.login.title') });
    fireEvent.click(document.querySelector('[data-auth-demo]'));
    expect(await screen.findByText(ru('auth.demo.banner.title'))).toBeTruthy();
    expect(document.querySelector('[data-sync="demo"]')).toBeTruthy();
  });

  it('import: needs explicit confirmation, uploads, verifies, and keeps the local copy', async () => {
    const local = createDexieAdapter('cargoclear-kz');
    const now = '2026-02-01T10:00:00.000Z';
    await local.put('shipments', { id: 'shp_1', name: 'Local shipment', origin: 'A', destination: 'B', weightKg: 10, volumeM3: 1, status: 'active', createdAt: now });
    await local.put('shipments', { id: 'shp_demo', name: 'Demo', origin: 'A', destination: 'B', weightKg: 1, volumeM3: 1, createdAt: now, isDemo: true });
    const { fake } = setup('/migrate', { user: true });
    const start = await waitFor(() => {
      const b = document.querySelector('[data-mig-start]');
      expect(b).toBeTruthy();
      return b;
    });
    expect(start.disabled).toBe(true);
    fireEvent.click(document.querySelector('[data-mig-confirm]'));
    await waitFor(() => expect(document.querySelector('[data-mig-start]').disabled).toBe(false));
    fireEvent.click(document.querySelector('[data-mig-start]'));
    expect(await screen.findByText(ru('mig.verified'), {}, { timeout: 5000 })).toBeTruthy();
    expect(fake._rows('shipments').map((r) => r.data.name)).toEqual(['Local shipment']);
    expect((await local.getAll('shipments')).length).toBe(2); // untouched
    expect(document.querySelector('[data-mig-delete-local]')).toBeTruthy();
  });
});
