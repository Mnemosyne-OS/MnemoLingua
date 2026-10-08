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
import { KANJIDIC2 } from '../lib/kanjiPack';
import { KANJIVG } from '../lib/strokes';
import { T, h2, lede, small } from '../styles';

export type SetupPhase =
  | { kind: 'intro' }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'failed'; failed: { char: string; error: string }[] }
  /** The dictionary of a pack deck is being fetched and read. */
  | { kind: 'packing' }
  | { kind: 'packFailed'; error: string };

/** Measured on the release: about 2.4 KB a file. */
const KB_PER_FILE = 2.4;

/** The welcome screen of a writing deck; nothing is fetched until its button. */
export function StrokeSetup({ total, needsPack = false, phase, onDownload, onCancel, title }: {
  /** Characters whose strokes are still to download; null while unknown
   *  (a pack deck learns its kanji from the dictionary). */
  total: number | null;
  /** The dictionary of a pack deck is still to download. */
  needsPack?: boolean;
  phase: SetupPhase;
  onDownload: () => void;
  onCancel: () => void;
  title: string;
}): JSX.Element {
  const { t } = useI18n();
  const open = (url: string): void => {
    openExternal(url).catch((err: unknown) => log.error('setup', 'link did not open', { url, error: String(err) }));
  };

  return (
    <section className="ml-glass ml-hero" style={{ gap: '24px' }}>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="ml-setup-glyph" aria-hidden="true">✍️</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '240px' }}>
          <h2 style={{ ...h2, fontSize: '27px' }}>{t(needsPack ? 'setup.titlePack' : 'setup.title', { deck: title })}</h2>
          <p style={lede}>{t(needsPack ? 'setup.ledePack' : 'setup.lede')}</p>
        </div>
      </div>

      <ol className="ml-steps">
        <li>{t('setup.step1')}</li>
        <li>{t('setup.step2')}</li>
        <li>{t('setup.step3')}</li>
      </ol>

      {needsPack && (
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
            ? t('setup.strokesWhatPack', { name: KANJIVG.name })
            : needsPack
              ? t('setup.strokesWhat', { name: KANJIVG.name, n: total, kb: Math.max(1, Math.round(total * KB_PER_FILE)) })
              : t('setup.what', { n: total, kb: Math.max(1, Math.round(total * KB_PER_FILE)) })}
        </p>
        <p style={small}>
          {t('setup.source', { name: KANJIVG.name, author: KANJIVG.author, tag: KANJIVG.tag })}{' '}
          <button className="ml-link" onClick={() => open(KANJIVG.home)}>{KANJIVG.home}</button>
        </p>
        <p style={small}>
          {t('setup.licence', { licence: KANJIVG.licence })}{' '}
          <button className="ml-link" onClick={() => open(KANJIVG.licenceUrl)}>{KANJIVG.licence}</button>
        </p>
        <p style={small}>{t('setup.where')}</p>
      </div>

      {phase.kind === 'packing' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span role="status" style={small}>{t('setup.packing')}</span>
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
            <p role="alert" style={{ ...small, color: T.bad }}>{t('setup.packFailed', { error: phase.error })}</p>
          )}
          {phase.kind === 'failed' && (
            <p role="alert" style={{ ...small, color: T.bad }}>
              {t('setup.failed', { n: phase.failed.length, list: phase.failed.slice(0, 6).map((f) => `${f.char} (${f.error})`).join(', ') })}
            </p>
          )}
          <button className="ml-btn ml-btn-primary" onClick={onDownload}>
            {phase.kind === 'failed' && total !== null ? t('setup.retry', { n: total }) : t(needsPack ? 'setup.downloadPack' : 'setup.download')}
          </button>
        </div>
      )}
    </section>
  );
}
