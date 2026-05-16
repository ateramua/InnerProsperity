import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  publicDir: 'public',
  outDir: '.output',
  manifest: {
    name: 'IntentFlow Companion',
    short_name: 'IntentFlow',
    description: 'A secure browser companion for IntentFlow desktop finance workflows.',
    version: '0.1.0',
    minimum_chrome_version: '116',
    action: {
      default_title: 'IntentFlow',
      default_popup: 'popup.html',
      default_icon: {
        '128': '/icons/icon-128.svg'
      }
    },
    icons: {
      '128': '/icons/icon-128.svg'
    },
    options_page: 'options.html',
    side_panel: {
      default_path: 'sidepanel.html'
    },
    permissions: [
      'alarms',
      'contextMenus',
      'notifications',
      'scripting',
      'sidePanel',
      'storage'
    ],
    optional_permissions: ['nativeMessaging'],
    host_permissions: ['https://*.intentflow.app/*'],
    commands: {
      'open-intentflow': {
        suggested_key: {
          default: 'Alt+I',
          mac: 'Command+Shift+I'
        },
        description: 'Open IntentFlow quick actions'
      },
      'quick-capture': {
        suggested_key: {
          default: 'Alt+Shift+I',
          mac: 'Command+Shift+Y'
        },
        description: 'Capture the current page into IntentFlow'
      }
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'; frame-ancestors 'none'"
    },
    web_accessible_resources: [
      {
        resources: ['icons/*'],
        matches: ['<all_urls>']
      }
    ],
    browser_specific_settings: {
      gecko: {
        id: 'intentflow-companion@intentflow.local',
        strict_min_version: '109.0'
      }
    },
    data_collection_permissions: {
      required: ['none']
    }
  }
});
