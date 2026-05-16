#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOST_NAME = 'com.intentflow.desktop';
const projectRoot = path.resolve(__dirname, '..');
const hostPath = path.join(projectRoot, 'scripts', 'extension-native-host.cjs');

function parseList(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath, payload) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`✅ Wrote ${filePath}`);
}

function getChromeManifest(extensionIds) {
    return {
        name: HOST_NAME,
        description: 'IntentFlow desktop bridge',
        path: hostPath,
        type: 'stdio',
        allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
    };
}

function getFirefoxManifest(extensionIds) {
    return {
        name: HOST_NAME,
        description: 'IntentFlow desktop bridge',
        path: hostPath,
        type: 'stdio',
        allowed_extensions: extensionIds,
    };
}

function getMacTargets(homeDir) {
    return {
        chrome: [
            path.join(homeDir, 'Library/Application Support/Google/Chrome/NativeMessagingHosts', `${HOST_NAME}.json`),
            path.join(homeDir, 'Library/Application Support/Chromium/NativeMessagingHosts', `${HOST_NAME}.json`),
            path.join(homeDir, 'Library/Application Support/Microsoft Edge/NativeMessagingHosts', `${HOST_NAME}.json`),
            path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts', `${HOST_NAME}.json`),
            path.join(homeDir, 'Library/Application Support/Arc/User Data/NativeMessagingHosts', `${HOST_NAME}.json`),
        ],
        firefox: [
            path.join(homeDir, 'Library/Application Support/Mozilla/NativeMessagingHosts', `${HOST_NAME}.json`),
        ],
    };
}

function main() {
    if (process.platform !== 'darwin') {
        console.error('This installer currently supports macOS. Add Windows/Linux registry/manifest targets before release.');
        process.exit(1);
    }

    if (!fs.existsSync(hostPath)) {
        console.error(`Native host script not found: ${hostPath}`);
        process.exit(1);
    }

    fs.chmodSync(hostPath, 0o755);

    const chromeIds = parseList(process.env.INTENTFLOW_CHROME_EXTENSION_IDS);
    const firefoxIds = parseList(process.env.INTENTFLOW_FIREFOX_EXTENSION_IDS || 'intentflow-companion@intentflow.local');

    if (!chromeIds.length) {
        console.warn(
            '⚠️ INTENTFLOW_CHROME_EXTENSION_IDS is empty. Load the extension once, copy its browser extension ID, then rerun this installer.'
        );
    }

    const targets = getMacTargets(os.homedir());
    if (chromeIds.length) {
        const chromeManifest = getChromeManifest(chromeIds);
        targets.chrome.forEach((target) => writeJson(target, chromeManifest));
    }

    const firefoxManifest = getFirefoxManifest(firefoxIds);
    targets.firefox.forEach((target) => writeJson(target, firefoxManifest));

    console.log('\nNative messaging host installation complete.');
}

main();
