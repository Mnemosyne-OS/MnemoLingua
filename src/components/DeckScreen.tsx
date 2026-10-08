/**
 * DeckScreen.tsx — the deck, its themes, how it was checked, and today's count.
 *
 * Today comes first: what there is to do and the button that starts it. The
 * themes are tiles that switch on and off below it.
 *
 * The check line is not decoration: these decks are checked by automatic
 * passes only, and the screen must say so (doc 138 §3.4b). It never reads
 * "reviewed" until a person's name is in the file. The source line stays
 * visible too: citing the CEFR-J list is its condition of use.
 */
import { useI18n } from '../i18n/useI18n';
import { introKind, type DeckView } from '../lib/deck';
import { KANJIDIC2 } from '../lib/kanjiPack';
import { HSK_LIST } from '../lib/hskPack';
import { strokeSourceFor } from '../lib/strokes';
import { themeIcon } from '../lib/themeIcons';
import type { CardReport, Deck } from '../lib/types';
import { h2, lede, small } from '../styles';

interface Props {
  deck: Deck;
  view: DeckView;
  /** Ticked theme ids; undefined = every theme. */
  ticked: string[] | undefined;
  dueCount: number;
  freshCount: number;
  /** The next day with a review, in days and cards; null when none. */
  next: { inDays: number; cards: number } | null;
  dailyNew: number;
  onDailyNew: (n: number) => void;
  /** False when the saved progress is unreadable: nothing would be recorded,
   *  so a session would end on a summary of answers that were never kept. */
  canSave: boolean;
  reports: CardReport[];
  targetOf: (cardId: string) => string;
  onToggle: (themeId: string) => void;
  /** Ticks exactly these themes; absent = no « all / none » buttons. */
  onSetThemes?: (themeIds: string[]) => void;
  onStart: () => void;
  onPutBack: (cardId: string) => void;
  title: string;
  /** No card of this deck met yet: the « how it works » panel opens itself. */
  firstTime?: boolean;
}

export function DeckScreen(p: Props): JSX.Element {
  const { t } = useI18n();
  const title = p.title;
  const allIds = p.deck.themes.map((th) => th.id);
  const ticked = new Set(p.ticked ?? allIds);
  const canStart = p.dueCount + p.freshCount > 0;
  const nothingTicked = ticked.size === 0;
  const glossless = p.view.playable.length === 0 && p.view.noGloss > 0 && !nothingTicked;
  const onCount = allIds.filter((id) => ticked.has(id)).length;
  const cards = p.deck.themes.flatMap((th) => th.cards);
  // A hand table no pass ran over must not read « checked by passes ».
  const fromReference = cards.length > 0 && cards.every((c) => c.check === 'reference');
  // The strokes are on every card once downloaded: their credit stays on
  // screen, not only on the setup screen seen once (CC BY-SA).
  const drawsStrokes = cards.some((c) => c.kind === 'glyph');
  const intro = introKind(p.deck);

  return (
    // Two columns when the window is wide (today and settings on the side, the
    // themes beside them), one column otherwise (app.css .ml-deck).
    <div className="ml-deck">
      <div className="ml-deck-side">
      <section className="ml-glass ml-hero">
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
            <h2 style={{ ...h2, fontSize: '27px', letterSpacing: '-0.01em' }}>{title}</h2>
            <p style={small}>
              {p.deck.reviewedBy && p.deck.reviewedAt
                ? t('deck.reviewed', { name: p.deck.reviewedBy, date: p.deck.reviewedAt })
                : fromReference
                  ? (p.deck.pack ? t('deck.packChecked', { name: p.deck.pack.source === 'hsk' ? HSK_LIST.name : KANJIDIC2.name }) : t('deck.reference', { date: p.deck.checkedAt }))
                  : t('deck.checked', { date: p.deck.checkedAt })}
            </p>
          </div>
        </div>

        {!p.canSave ? null : glossless ? (
          <p style={lede}>{t('deck.noGlossAll')}</p>
        ) : nothingTicked ? (
          <p style={lede}>{t('deck.nothingAtAll')}</p>
        ) : canStart ? (
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="ml-stats" aria-hidden="true">
                <div className="ml-stat"><span className="ml-stat-n">{p.dueCount}</span><span className="ml-stat-l">{t('deck.statDue')}</span></div>
                <div className="ml-stat"><span className="ml-stat-n">{p.freshCount}</span><span className="ml-stat-l">{t('deck.statFresh')}</span></div>
              </div>
              <p style={small}>{t('deck.today', { due: p.dueCount, fresh: p.freshCount })}</p>
            </div>
            <button className="ml-btn ml-btn-primary" onClick={p.onStart}>{t('deck.start')}</button>
          </div>
        ) : (
          <p style={lede}>
            {t('deck.nothingToday')}
            {p.next && ` ${t('deck.nextIn', { days: p.next.inDays, n: p.next.cards })}`}
          </p>
        )}
      </section>

      {intro && (
        // A writing deck is not self-explaining: pinyin and tones, kana as
        // syllables, a kanji's two readings (Tony, 2026-10-07: « faudrait une
        // explication »). Open the first time, folded once cards are met.
        <details className="ml-glass ml-panel ml-intro" open={p.firstTime}>
          <summary style={{ cursor: 'pointer', fontSize: '17px', fontWeight: 600 }}>{t('intro.title')}</summary>
          {[1, 2, 3].map((n) => <p key={n} style={{ margin: 0, fontSize: '15px', lineHeight: 1.6 }}>{t(`intro.${intro}${n}`)}</p>)}
        </details>
      )}

      <section className="ml-glass ml-panel" style={{ gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{t('deck.dailyNew', { n: p.dailyNew })}</span>
          <div className="ml-seg ml-seg-sm">
            {[...new Set([5, 10, 15, 20, 30, p.dailyNew])].sort((a, b) => a - b).map((n) => (
              <button key={n} className="ml-seg-btn" aria-pressed={n === p.dailyNew} onClick={() => p.onDailyNew(n)}>{n}</button>
            ))}
          </div>
        </div>
        {p.deck.source && <p style={small}>{t('deck.source', { name: p.deck.source.name, url: p.deck.source.url })}</p>}
        {p.deck.pack?.source === 'kanjidic2' && <p style={small}>{t('deck.packSource', { name: KANJIDIC2.name, author: KANJIDIC2.author, licence: KANJIDIC2.licence })}</p>}
        {p.deck.pack?.source === 'hsk' && <p style={small}>{t('deck.hskSource', { name: HSK_LIST.name, licence: HSK_LIST.licence })}</p>}
        {drawsStrokes && <p style={small}>{t('deck.strokesSource', { name: strokeSourceFor(p.deck.lang).name, author: strokeSourceFor(p.deck.lang).author, licence: strokeSourceFor(p.deck.lang).licence, tag: strokeSourceFor(p.deck.lang).tag })}</p>}
        {p.view.withheld > 0 && <p style={small}>{t('deck.withheld', { n: p.view.withheld })}</p>}
        {p.view.noGloss > 0 && !glossless && <p style={small}>{t('deck.noGloss', { n: p.view.noGloss })}</p>}
        {p.reports.length > 0 && (
          <details>
            <summary style={{ ...small, cursor: 'pointer' }}>{t('deck.reports', { n: p.reports.length })}</summary>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {p.reports.map((r) => (
                <li key={r.cardId} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span lang={p.deck.lang} style={{ flex: 1 }}>{p.targetOf(r.cardId)}</span>
                  <button className="ml-btn ml-btn-ghost" onClick={() => p.onPutBack(r.cardId)}>{t('deck.putBack')}</button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
      </div>

      <div className="ml-deck-main">
      <section className="ml-glass ml-panel" aria-labelledby="ml-themes">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
            <h3 id="ml-themes" style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>{t('deck.themes')}</h3>
            <span style={small}>{t('deck.themesOn', { on: onCount, total: allIds.length })}</span>
          </div>
          {p.onSetThemes && (
            <div className="ml-seg ml-seg-sm">
              <button className="ml-seg-btn" aria-pressed={onCount === allIds.length} onClick={() => p.onSetThemes?.(allIds)}>
                {t('deck.allThemes')}
              </button>
              <button className="ml-seg-btn" aria-pressed={onCount === 0} onClick={() => p.onSetThemes?.([])}>
                {t('deck.noThemes')}
              </button>
            </div>
          )}
        </div>
        <div className="ml-tiles">
          {p.deck.themes.map((theme) => {
            const on = ticked.has(theme.id);
            return (
              <button key={theme.id} className="ml-tile" aria-pressed={on} onClick={() => p.onToggle(theme.id)}>
                <span className="ml-tile-top">
                  <span className="ml-tile-icon" aria-hidden="true">{themeIcon(theme.id)}</span>
                  <span className="ml-switch" aria-hidden="true" />
                </span>
                <span className="ml-tile-name">{t(`theme.${theme.id}`)}</span>
                <span className="ml-tile-count">{t('deck.themeCount', { n: theme.cards.filter((c) => c.check !== 'to-review').length })}</span>
              </button>
            );
          })}
        </div>
      </section>

      </div>
    </div>
  );
}
