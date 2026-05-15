/**
 * Property Map two-tone system: base / layout = PM.bg, layered / foreground surfaces = PM.fg.
 * Text on dark fg panels uses PM.text (never black).
 */
const PM = {
  bg: '#0047AB',
  fg: '#001a40',
  overlay: 'rgba(0, 26, 64, 0.55)',
  border: 'rgba(255, 255, 255, 0.28)',
  text: '#F0F9FF',
  textMuted: 'rgba(240, 249, 255, 0.78)',
  /** Inset fields on fg panels */
  well: 'rgba(0, 71, 171, 0.55)',
  shadow: '0 24px 48px rgba(0, 26, 64, 0.45)',
};

export default PM;
