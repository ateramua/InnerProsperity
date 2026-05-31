'use strict';

const { Menu } = require('electron');

/** Standard Edit submenu — enables Cmd/Ctrl+C/V/X/A via Electron menu roles. */
const EDIT_MENU_TEMPLATE = Object.freeze([
  { role: 'undo' },
  { role: 'redo' },
  { type: 'separator' },
  { role: 'cut' },
  { role: 'copy' },
  { role: 'paste' },
  { role: 'pasteAndMatchStyle' },
  { role: 'delete' },
  { type: 'separator' },
  { role: 'selectAll' },
]);

function getEditMenuTemplate() {
  return EDIT_MENU_TEMPLATE.map((item) => ({ ...item }));
}

/**
 * Right-click copy/paste on inputs, textareas, and selected text.
 * Call once per BrowserWindow webContents (e.g. in createWindow).
 */
function attachEditableContextMenu(webContents) {
  if (!webContents || webContents.isDestroyed()) return;

  webContents.on('context-menu', (_event, params) => {
    const { editFlags } = params;
    const hasClipboardAction =
      editFlags.canCut || editFlags.canCopy || editFlags.canPaste || editFlags.canSelectAll;

    if (!hasClipboardAction && !params.isEditable) return;

    const template = [
      { role: 'cut', enabled: editFlags.canCut },
      { role: 'copy', enabled: editFlags.canCopy },
      { role: 'paste', enabled: editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: editFlags.canSelectAll },
    ];

    Menu.buildFromTemplate(template).popup({
      window: webContents.getOwnerBrowserWindow() || undefined,
    });
  });
}

module.exports = {
  getEditMenuTemplate,
  attachEditableContextMenu,
};
