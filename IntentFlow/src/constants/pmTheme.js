/**
 * Property Map two-tone system: base / layout = PM.bg, layered / foreground surfaces = PM.fg.
 * Text on dark fg panels uses PM.text (never black).
 */
const PM = {
  bg: '#3B82F6',
  fg: '#0047AB',
  overlay: 'rgba(0, 71, 171, 0.55)',
  border: 'rgba(255, 255, 255, 0.28)',
  text: '#F0F9FF',
  textMuted: 'rgba(240, 249, 255, 0.78)',
  /** Inset fields on fg panels */
  well: 'rgba(59, 130, 246, 0.92)',
  shadow: '0 24px 48px rgba(0, 71, 171, 0.35)',
};

module.exports = PM;
