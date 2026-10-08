/**
 * StrokeSetup.tsx — the way into a writing deck: what it is, then the
 * download the LEARNER makes (doc 138 §13). Nothing is fetched before the
 * button is pressed, and the screen names the source, its licence and the
 * size before asking.
 *
 * 🎭 Each state says what it is: never fetched, fetching (with the count),
 * some files failed (named, retry only those), and « downloaded but this
 * computer could not keep them » — a different next step from a failure.
 */
import { useI18n } from '../i18n/useI18n';
import { openExternal } from '../lib/host';
import { log } from '../lib/log';
import { HSK_LIST } from '../lib/hskPack';
import { KANJIDIC2 } from '../lib/kanjiPack';
import type { StrokeSource } from '../lib/strokes';
import type { DeckPack } from '../lib/types';
import { T, h2, lede, small } from '../styles';

export type SetupPhase =
  | { kind: 'intro' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'failed'; failed: { char: string; error: string }[] }
  /** The dictionary of a pack deck is being fetched and read. */
  | { kind: 'packing' }
  | { kind: 'packFailed'; error: string };


/** The welcome screen of a writing deck; nothing is fetched until its button. */
export function StrokeSetup({ total, needsPack = false, pack, source, phase, onDownload, onCancel, title }: {
  /** Characters whose strokes are still to download; null while unknown
   *  (a pack deck learns its kanji from the dictionary). */
  total: number | null;
  /** The dictionary of a pack deck is still to download. */
  needsPack?: boolean;
  /** Which data the pack deck is made from: decides what the screen names. */
  pack?: DeckPack | undefined;
  /** Where the strokes come from (KanjiVG, hanzi-writer-data). */
  source: StrokeSource;
  phase: SetupPhase;
  onDownload: () => void;
  onCancel: () => void;
  title: string;
}): JSX.Element {
  const { t } = useI18n();
  const hsk = pack?.source === 'hsk';
  const kb = (n: number): number => Math.max(1, Math.round(n * source.kbPerFile));
  const open = (url: string): void => {
    openExternal(url).catch((err: unknown) => log.error('setup', 'link did not open', { url, error: String(err) }));
  };

  return (
    <section className="ml-glass ml-hero" style={{ gap: '24px' }}>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="ml-setup-glyph" aria-hidden="true">✍️</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '240px' }}>
          <h2 style={{ ...h2, fontSize: '27px' }}>{t(needsPack ? (hsk ? 'setup.titleHsk' : 'setup.titlePack') : 'setup.title', { deck: title })}</h2>
          <p style={lede}>{t(needsPack ? (hsk ? 'setup.ledeHsk' : 'setup.ledePack') : 'setup.lede')}</p>
        </div>
      </div>

      <ol className="ml-steps">
        <li>{t('setup.step1')}</li>
        <li>{t('setup.step2')}</li>
        <li>{t('setup.step3')}</li>
      </ol>

      {needsPack && hsk && (
        <div className="ml-glass" style={{ padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{t('setup.hskWhat', { name: HSK_LIST.name, author: HSK_LIST.author, kb: HSK_LIST.sizeKb })}</p>
          <p style={small}>{t('setup.hskLevel')}</p>
          <p style={small}>{t('setup.hskEnglish', { from: HSK_LIST.meaningsFrom })}</p>
          <p style={small}>
            {t('setup.hskLicence', { licence: HSK_LIST.licence, from: HSK_LIST.meaningsFrom, meaningsLicence: HSK_LIST.meaningsLicence })}{' '}
            <button className="ml-link" onClick={() => open(HSK_LIST.home)}>{HSK_LIST.home}</button>
          </p>
        </div>
      )}

      {needsPack && !hsk && (
        <div className="ml-glass" style={{ padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>{t('setup.packWhat', { name: KANJIDIC2.name, author: KANJIDIC2.author, kb: KANJIDIC2.sizeKb })}</p>
          <p style={small}>{t('setup.packLevel')}</p>
          <p style={small}>
            {t('setup.packLicence', { licence: KANJIDIC2.licence })}{' '}
            <button className="ml-link" onClick={() => open(KANJIDIC2.licenceUrl)}>{KANJIDIC2.licence}</button>{' · '}
            <button className="ml-link" onClick={() => open(KANJIDIC2.home)}>{KANJIDIC2.home}</button>
          </p>
        </div>
      )}

      <div className="ml-glass" style={{ padding: '16px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          {total === null
            ? t('setup.strokesWhatPack', { name: source.name })
            : needsPack
              ? t('setup.strokesWhat', { name: source.name, n: total, kb: kb(total) })
              : t('setup.what', { n: total, kb: kb(total) })}
        </p>
        <p style={small}>
          {t('setup.source', { name: source.name, author: source.author, tag: source.tag })}{' '}
          <button className="ml-link" onClick={() => open(source.home)}>{source.home}</button>
        </p>
        <p style={small}>
          {t('setup.licence', { licence: source.licence })}{' '}
          <button className="ml-link" onClick={() => open(source.licenceUrl)}>{source.licence}</button>
        </p>
        <p style={small}>{t('setup.where')}</p>
      </div>

      {phase.kind === 'packing' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span role="status" style={small}>{t(hsk ? 'setup.packingHsk' : 'setup.packing')}</span>
          <button className="ml-btn ml-btn-ghost" onClick={onCancel}>{t('setup.cancel')}</button>
        </div>
      ) : phase.kind === 'downloading' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="ml-progress" aria-hidden="true">
            <span style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 0}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span role="status" style={small}>{t('setup.progress', { done: phase.done, total: phase.total })}</span>
            <button className="ml-btn ml-btn-ghost" onClick={onCancel}>{t('setup.cancel')}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
          {phase.kind === 'packFailed' && (
            <p role="alert" style={{ ...small, color: T.bad }}>{t(hsk ? 'setup.hskFailed' : 'setup.packFailed', { error: phase.error })}</p>
          )}
          {phase.kind === 'failed' && (
            <p role="alert" style={{ ...small, color: T.bad }}>
              {t('setup.failed', { n: phase.failed.length, list: phase.failed.slice(0, 6).map((f) => `${f.char} (${f.error})`).join(', ') })}
            </p>
          )}
          <button className="ml-btn ml-btn-primary" onClick={onDownload}>
            {phase.kind === 'failed' && total !== null ? t('setup.retry', { n: total }) : t(needsPack ? (hsk ? 'setup.downloadHsk' : 'setup.downloadPack') : 'setup.download')}
          </button>
        </div>
      )}
    </section>
  );
}
