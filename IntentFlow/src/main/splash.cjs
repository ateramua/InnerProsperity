const { BrowserWindow } = require('electron');
const path = require('path');

let splashWindow = null;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  return splashWindow;
}

function closeSplashWindow() {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

module.exports = { createSplashWindow, closeSplashWindow };
