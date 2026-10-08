import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const host = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('./lib/host', () => ({ readState: host.read, writeState: host.write, hasHost: () => true }));

import App from './App';
import { setLang } from './i18n/useI18n';
import { __setStateForTests } from './lib/store';
import { emptyState, type Card } from './lib/types';
import { serialise } from './lib/store';

beforeEach(() => {
  host.read.mockReset().mockResolvedValue(null);
  host.write.mockReset().mockResolvedValue({ success: true });
  __setStateForTests(emptyState(), false);
});

describe('the translation language', () => {
  // The field report of 2026-10-05: the app ran in English, the cartridge
  // looked for ENGLISH translations of an English deck, and said there were
  // none. The learner's language is not the app's language.
  it('asks for it when the app language is the one being learned', async () => {
    setLang('en');
    render(<App />);
    expect(await screen.findByText('In which language do you want the translations?')).toBeInTheDocument();
    expect(screen.queryByText('This deck has no translations in your language yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Français'));
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    expect(host.write).toHaveBeenCalledWith(expect.objectContaining({ glossLang: 'fr' }));
  });

  it('uses the app language without asking when the deck has it', async () => {
    setLang('fr');
    render(<App />);
    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)")).toBeInTheDocument();
    expect(screen.queryByText('Dans quelle langue veux-tu les traductions ?')).not.toBeInTheDocument();
  });

  it('the app language wins over a choice saved earlier, and no selector is shown', async () => {
    host.read.mockResolvedValue({ state: { ...emptyState(), glossLang: 'es' }, updatedAt: 'x' });
    setLang('fr');
    render(<App />);
    expect(await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)")).toBeInTheDocument();
    expect(screen.queryByText('Español')).not.toBeInTheDocument();
    expect(screen.queryByText('Traductions en :')).not.toBeInTheDocument();
  });

  it('a choice saved earlier still answers when the app is in the language learned', async () => {
    host.read.mockResolvedValue({ state: { ...emptyState(), glossLang: 'es' }, updatedAt: 'x' });
    setLang('en');
    render(<App />);
    expect(await screen.findByText('Today: 0 to review, 10 new')).toBeInTheDocument();
    expect(screen.queryByText('In which language do you want the translations?')).not.toBeInTheDocument();
  });
});

describe('the storage warning', () => {
  it('says how full the cartridge space is once past the warning line', async () => {
    const records: Card[] = [];
    for (let i = 0; i < 7500; i++) {
      for (const d of ['recognise', 'produce']) {
        records.push({ id: `w${i}-noun:${d}`, courseId: 'en-a1', front: '', back: '', box: 3, dueAt: '2027-03-14', reps: 12, lapses: 2, lastSeenAt: null });
      }
    }
    host.read.mockResolvedValue({ state: serialise({ ...emptyState(), records, glossLang: 'fr' }), updatedAt: 'x' });
    setLang('en');
    render(<App />);
    expect(await screen.findByText(/Your progress fills \d+ % of the space/)).toBeInTheDocument();
  });

  it('says nothing about space on a light progress', async () => {
    setLang('fr');
    render(<App />);
    await screen.findByText("Aujourd'hui : 0 à revoir, 10 nouvelle(s)");
    expect(screen.queryByText(/% de la place/)).not.toBeInTheDocument();
  });
});

describe('unreadable progress', () => {
  it('says so, and offers no session that could not be saved', async () => {
    host.read.mockResolvedValue({ state: { version: 9 }, updatedAt: 'x' });
    setLang('en');
    render(<App />);
    expect(await screen.findByText(/Your saved progress is unreadable/)).toBeInTheDocument();
  });
});
