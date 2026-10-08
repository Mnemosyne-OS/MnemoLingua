import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Session } from './Session';
import type { QueueItem } from '../lib/session';
import { setLang } from '../i18n/useI18n';

function item(id: string, direction: 'recognise' | 'produce'): QueueItem {
  return {
    card: { id, kind: 'phrase', target: `EN ${id}`, gloss: { fr: `FR ${id}` }, check: 'two-pass' },
    direction,
    record: { id: `${id}:${direction}`, courseId: 'd', front: '', back: '', box: 1, dueAt: '2026-10-05', reps: 0, lapses: 0, lastSeenAt: null },
  };
}

function mount(queue: QueueItem[]) {
  setLang('en');
  const onAnswer = vi.fn();
  const onReport = vi.fn();
  render(<Session queue={queue} lang="fr" learningName="English" targetLang="en" tomorrow={() => 4} onAnswer={onAnswer} onReport={onReport} onLeave={() => undefined} />);
  return { onAnswer, onReport };
}

describe('Session', () => {
  it('asks recognise with the English, and produce with the learner language', () => {
    mount([item('a', 'recognise'), item('a', 'produce')]);
    expect(screen.getByText('EN a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    expect(screen.getByText('FR a')).toBeInTheDocument();
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('FR a')).toBeInTheDocument();
    expect(screen.queryByText('EN a')).not.toBeInTheDocument();
  });

  it('brings a missed card back at the end of the same sitting', () => {
    const { onAnswer } = mount([item('a', 'recognise'), item('b', 'recognise')]);
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText("I didn't know"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ direction: 'recognise' }), false);
    expect(screen.getByText('EN b')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('EN a')).toBeInTheDocument();
  });

  it('a reported card leaves the sitting in both directions', () => {
    const { onReport } = mount([item('a', 'recognise'), item('b', 'recognise'), item('a', 'produce')]);
    fireEvent.click(screen.getByText('This card is wrong'));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(screen.getByText('EN b')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('Session finished')).toBeInTheDocument();
    expect(screen.getByText('Tomorrow: 4 card(s) to review.')).toBeInTheDocument();
  });
});

describe('the produce side of a word card', () => {
  function word(target: string, example: string): QueueItem {
    return {
      card: { id: target, kind: 'word', target, pos: 'determiner', gloss: { fr: 'un, une' }, check: 'two-pass', example: { target: example, gloss: { fr: "J'ai un chien." } } },
      direction: 'produce',
      record: { id: `${target}:produce`, courseId: 'd', front: '', back: '', box: 1, dueAt: '2026-10-05', reps: 0, lapses: 0, lastSeenAt: null },
    };
  }

  it('shows the example with the word blanked, so « un, une » asks for one answer', () => {
    mount([word('a', 'I have a dog.')]);
    expect(screen.getByText('I have ___ dog.')).toBeInTheDocument();
  });

  it('falls back to the translated example when the word is not found in it', () => {
    mount([word('lose', 'I lost my keys.')]);
    expect(screen.getByText("J'ai un chien.")).toBeInTheDocument();
    expect(screen.queryByText(/___/)).not.toBeInTheDocument();
  });

  it('takes the blank away once the answer shows the whole sentence', () => {
    mount([word('a', 'I have a dog.')]);
    fireEvent.click(screen.getByText('Show the answer'));
    expect(screen.queryByText('I have ___ dog.')).not.toBeInTheDocument();
    expect(screen.getByText('I have a dog.')).toBeInTheDocument();
  });

  it('never blanks anything on the recognise side', () => {
    mount([{ ...word('a', 'I have a dog.'), direction: 'recognise' }]);
    expect(screen.queryByText('I have ___ dog.')).not.toBeInTheDocument();
  });

  it('hides the situation sentence behind the eye, and never shows its translation before the answer', () => {
    mount([{ ...word('a', 'I have a dog.'), direction: 'recognise' }]);
    expect(screen.queryByText('I have a dog.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the sentence'));
    expect(screen.getByText('I have a dog.')).toBeInTheDocument();
    expect(screen.queryByText("J'ai un chien.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    expect(screen.getAllByText('I have a dog.')).toHaveLength(1);
    expect(screen.getByText("J'ai un chien.")).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('Space shows the answer, 2 counts it known, 1 counts it missed', () => {
    const { onAnswer } = mount([item('a', 'recognise'), item('b', 'recognise')]);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(screen.getByText('FR a')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '2' });
    expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 'a' }) }), true);
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).toHaveBeenLastCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 'b' }) }), false);
  });
});

describe('points', () => {
  it('a known card is worth 1, half when the sentence was opened, a missed one 0', () => {
    const rec = (id: string): QueueItem => ({
      ...item(id, 'recognise'),
      card: { ...item(id, 'recognise').card, example: { target: `Sentence ${id}.`, gloss: { fr: `Phrase ${id}.` } } },
    });
    mount([rec('a'), rec('b'), rec('c')]);
    fireEvent.click(screen.getByText('Show the sentence'));
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('0.5 pt(s)')).toBeInTheDocument();
    // The eye of the previous card does not carry over to the next one.
    expect(screen.getByText('Show the sentence')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('1.5 pt(s)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText("I didn't know"));
    fireEvent.click(screen.getByText('Show the answer'));
    fireEvent.click(screen.getByText('I knew it'));
    expect(screen.getByText('Score: 2.5 out of 4')).toBeInTheDocument();
  });
});
