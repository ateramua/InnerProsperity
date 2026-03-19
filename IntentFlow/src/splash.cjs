// src/splash.cjs
// Simple splash screen module to prevent crashes

function createSplashWindow() {
    console.log('🖼️ Splash window would be created here');
    return null;
}

function closeSplashWindow() {
    console.log('🖼️ Splash window would be closed here');
}

module.exports = {
    createSplashWindow,
    closeSplashWindow
};