/**
 * App.tsx — MnemoLingua: the shipped decks (one tab each), reviewed with
 * spaced repetition (doc 138).
 *
 * Three states before anything else (CLAUDE.md rule 11): reading the progress,
 * failing to read it, and an unreadable saved state, which is shown and makes
 * the store read-only rather than starting over on top of it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DECK_METAS, loadDeck, type DeckMeta, type LoadedDeck } from './decks';
import { DeckScreen } from './components/DeckScreen';
import { Session } from './components/Session';
import { StrokeSetup } from './components/StrokeSetup';
import { useI18n } from './i18n/useI18n';
import { glossLangs, indexDeck, resolveGlossLang, viewDeck } from './lib/deck';
import { hasHost } from './lib/host';
import { log } from './lib/log';
import { strokeSourceFor } from './lib/strokes';
import { useWritingData } from './lib/useWritingData';
import { cardsDueTomorrow, nextReview, playableRecordsOf } from './lib/progress';
import {
  applyAnswer, buildQueue, freshCards, introduce, reportCard, reportedIds,
  setDailyNew, setGlossLang, setThemes, toggleTheme, withdrawReport, type QueueItem,
} from './lib/session';
import { BUDGET_WARN, budgetUsed, droppedOnLoad, getState, load, mutate, subscribe, type LoadOutcome, type SaveOutcome } from './lib/store';
import type { Deck, GlossLang } from './lib/types';
import { errorBox, lede, noticeBox } from './styles';

/** The languages shipped, in deck order (the first deck's language first). */
const LANGUAGES = [...new Set(DECK_METAS.map((m) => m.lang))];

type Phase = { kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'ready'; outcome: LoadOutcome };

/** A level deck is named by its level, a topic deck by its own key. */
function deckTitle(deck: { id: string; level?: string | undefined }, t: (k: string, v?: Record<string, string | number>) => string): string {
  return deck.level ? t('deck.level', { level: deck.level }) : t(`deckName.${deck.id}`);
}

export default function App(): JSX.Element {
  const { t, lang } = useI18n();
  const state = useSyncExternalStore(subscribe, getState);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [learnLang, setLearnLang] = useState<string | null>(LANGUAGES[0] ?? null);
  const [deckId, setDeckId] = useState<string | null>(DECK_METAS[0]?.id ?? null);
  const chooseLanguage = (l: string): void => {
    setLearnLang(l);
    setDeckId(DECK_METAS.find((m) => m.lang === l)?.id ?? null);
  };
  const [decks, setDecks] = useState<Record<string, LoadedDeck | 'loading'>>({});
  const loaded = deckId ? decks[deckId] : undefined;
  const fileDeck: Deck | null = loaded && loaded !== 'loading' ? loaded.deck : null;
  // A pack deck becomes a deck only once its dictionary is here (doc 138 §15).
  const writing = useWritingData(fileDeck);
  const DECK = writing.deck;
  const { strokes, cacheProblem } = writing;

  // A deck is loaded the first time its tab is opened, then kept.
  // 🪤 The effect depends on the tab ONLY: depending on `decks`, which it
  // writes, looped forever (the test worker ran out of memory). What is
  // already requested is tracked in a ref, which no render reads.
  const requested = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const retryDeck = (): void => {
    if (deckId) setDecks((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== deckId)));
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    const meta: DeckMeta | undefined = DECK_METAS.find((m) => m.id === deckId);
    if (!meta || requested.current.has(meta.id)) return;
    requested.current.add(meta.id);
    setDecks((d) => ({ ...d, [meta.id]: 'loading' }));
    // The result is stored even if the learner has moved to another tab: it
    // is the same deck, and coming back must not load it twice.
    void loadDeck(meta).then((result) => {
      // A failure is not remembered as « asked »: the retry button below must
      // be able to ask again.
      if (!result.deck) requested.current.delete(meta.id);
      setDecks((d) => ({ ...d, [meta.id]: result }));
    });
  }, [deckId, attempt]);

  useEffect(() => {
    if (!hasHost()) return;
    let alive = true;
    load()
      .then((outcome) => { if (alive) setPhase({ kind: 'ready', outcome }); })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        log.error('store', 'state.get failed', { error });
        if (alive) setPhase({ kind: 'failed', error });
      });
    return () => { alive = false; };
  }, []);


  const report = useCallback((p: Promise<SaveOutcome>) => {
    p.then((o) => setSaveError(o.ok ? null : (o.error ?? 'unknown'))).catch((err: unknown) => {
      setSaveError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const reported = useMemo(() => (DECK ? reportedIds(state, DECK.id) : new Set<string>()), [state, DECK]);
  const ticked = DECK ? state.themes[DECK.id] : undefined;
  // The translation language is the learner's, not the app's (types.ts).
  const glossLang = DECK ? resolveGlossLang(DECK, state.glossLang, lang) : null;
  const view = useMemo(
    () => (DECK && glossLang ? viewDeck(DECK, glossLang, { themes: ticked, reportedIds: reported }) : null),
    [DECK, glossLang, ticked, reported],
  );
  const byId = useMemo(() => (DECK ? indexDeck(DECK) : new Map()), [DECK]);

  const header = (
    <header className="ml-brand">
      <span className="ml-logo" aria-hidden="true">🗣️</span>
      <div>
        <h1 className="ml-title">{t('app.name')}</h1>
        <p className="ml-sub">{t('app.learning', { lang: t(`lang.${learnLang ?? DECK?.lang ?? 'en'}`) })}</p>
      </div>
    </header>
  );

  // The notices come with EVERY screen once the progress was read: an
  // unreadable progress was hidden behind the translation-language question
  // (found by a test, 2026-10-06).
  const notices = phase.kind === 'ready' ? (
    <>
      {phase.outcome === 'unreadable' && <div style={errorBox}>{t('load.unreadable')}</div>}
      {saveError && <div style={errorBox}>{t('load.saveFailed', { error: saveError })}</div>}
      {cacheProblem && <div style={noticeBox}>{t('setup.notKept', { error: cacheProblem })}</div>}
      {droppedOnLoad() > 0 && <div style={noticeBox}>{t('load.dropped', { n: droppedOnLoad() })}</div>}
      {budgetUsed() >= BUDGET_WARN && (
        <div style={noticeBox}>{t('load.budget', { pct: Math.round(budgetUsed() * 100) })}</div>
      )}
    </>
  ) : null;

  const wrap = (content: JSX.Element): JSX.Element => (
    <div className="ml-root"><main className="ml-column">{header}{notices}{content}</main></div>
  );

  if (!hasHost()) {
    return wrap(
      <div style={noticeBox}>
        <strong>{t('host.missing')}</strong>
        <p style={lede}>{t('host.missingBody')}</p>
      </div>,
    );
  }
  const langDecks = DECK_METAS.filter((m) => m.lang === learnLang);
  const languagePicker = LANGUAGES.length > 1 && !queue ? (
    <nav className="ml-seg ml-seg-lang" aria-label={t('app.languages')} style={{ alignSelf: 'flex-start' }}>
      {LANGUAGES.map((l) => (
        <button key={l} className="ml-seg-btn" aria-pressed={l === learnLang} onClick={() => chooseLanguage(l)}>
          {t(`langName.${l}`)}
        </button>
      ))}
    </nav>
  ) : null;
  const deckTabs = langDecks.length > 1 && !queue ? (
    <nav className="ml-seg" style={{ alignSelf: 'flex-start' }}>
      {langDecks.map((m) => (
        <button
          key={m.id}
          className="ml-seg-btn"
          aria-pressed={m.id === deckId}
          onClick={() => setDeckId(m.id)}
        >
          {deckTitle(m, t)}
        </button>
      ))}
    </nav>
  ) : null;
  const tabs = languagePicker || deckTabs ? <>{languagePicker}{deckTabs}</> : null;

  if (phase.kind === 'loading') return wrap(<p style={lede}>{t('load.reading')}</p>);
  if (phase.kind === 'failed') return wrap(<div style={errorBox}>{t('load.failed', { error: phase.error })}</div>);
  if (DECK_METAS.length === 0) return wrap(<div style={errorBox}>{t('deck.noDecks')}</div>);
  if (writing.gate.kind === 'checking') return wrap(<>{tabs}<p style={lede}>{t('setup.checking')}</p></>);
  if (writing.gate.kind === 'setup' && fileDeck) {
    return wrap(
      <>
        {tabs}
        <StrokeSetup
          total={writing.gate.strokesMissing}
          needsPack={writing.gate.needsPack}
          pack={fileDeck.pack}
          source={strokeSourceFor(fileDeck.lang)}
          phase={writing.gate.phase}
          onDownload={writing.download}
          onCancel={writing.cancel}
          title={deckTitle(fileDeck, t)}
        />
      </>,
    );
  }
  if (!DECK) {
    return wrap(
      <>
        {tabs}
        {loaded && loaded !== 'loading' ? (
          <div style={errorBox}>
            <p style={{ margin: 0 }}>{t('deck.brokenDeck')}</p>
            <button className="ml-btn" style={{ marginTop: '12px' }} onClick={retryDeck}>{t('deck.retry')}</button>
          </div>
        ) : <p style={lede}>{t('load.deck')}</p>}
      </>,
    );
  }

  const deck = DECK;
  const choices = glossLangs(deck);
  const choose = (l: GlossLang): void => report(mutate((s) => setGlossLang(s, l)));

  if (!glossLang || !view) {
    // The tabs stay: the question is about THIS deck, and the learner may
    // have come for another language (found by a test, 2026-10-07).
    return wrap(
      <>
      {tabs}
      <section className="ml-glass ml-hero" style={{ alignItems: 'flex-start' }}>
        <p style={{ ...lede, fontSize: '17px' }}>{t('deck.chooseGloss')}</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {choices.map((l) => (
            <button key={l} className="ml-btn ml-btn-primary" onClick={() => choose(l)}>{t(`glossName.${l}`)}</button>
          ))}
        </div>
      </section>
      </>,
    );
  }

  const now = new Date();
  const fresh = freshCards(state, deck, view, now);
  const due = buildQueue(state, deck, view, now);
  const playableRecords = playableRecordsOf(state, deck, glossLang);
  const dueCardCount = new Set(due.map((i) => i.card.id)).size;

  const start = (): void => {
    report(mutate((s) => introduce(s, deck, fresh, now)));
    const after = getState();
    const nextView = viewDeck(deck, glossLang, { themes: after.themes[deck.id], reportedIds: reportedIds(after, deck.id) });
    setQueue(buildQueue(after, deck, nextView, now));
  };

  const content = queue ? (
    <Session
      queue={queue}
      lang={glossLang}
      learningName={t(`lang.${deck.lang}`)}
      targetLang={deck.lang}
      tomorrow={() => cardsDueTomorrow(playableRecordsOf(getState(), deck, glossLang), new Date())}
      onAnswer={(item, correct) => report(mutate((s) => applyAnswer(s, item.record.id, correct, new Date())))}
      onReport={(item) => report(mutate((s) => reportCard(s, deck.id, item.card.id, new Date())))}
      onLeave={() => setQueue(null)}
      strokesOf={(c) => strokes[c]}
    />
  ) : (
    <DeckScreen
      deck={deck}
      view={view}
      ticked={ticked}
      dueCount={dueCardCount}
      freshCount={fresh.length}
      next={nextReview(playableRecords, now)}
      dailyNew={state.dailyNew}
      onDailyNew={(n) => report(mutate((s) => setDailyNew(s, n)))}
      canSave={phase.outcome !== 'unreadable'}
      reports={state.reports.filter((r) => r.deckId === deck.id)}
      targetOf={(id) => {
        const c = byId.get(id);
        // A glyph is drawn, never typed in a font (doc 138 §13.1): its reading.
        return c ? (c.kind === 'glyph' ? c.gloss[glossLang] ?? c.id : c.target) : id;
      }}
      onToggle={(themeId) => report(mutate((s) => toggleTheme(s, deck, themeId)))}
      onSetThemes={(ids) => report(mutate((s) => setThemes(s, deck, ids)))}
      onStart={start}
      onPutBack={(cardId) => report(mutate((s) => withdrawReport(s, deck.id, cardId)))}
      title={deckTitle(deck, t)}
      firstTime={playableRecords.length === 0}
    />
  );

  return wrap(
    <>
      {tabs}
      {content}
    </>,
  );
}
