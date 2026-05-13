# Encrypted Database Import / Export Guide

This guide explains how to use IntentFlow's encrypted database backup and restore feature.

## Overview

IntentFlow supports secure encrypted backups of your local database. Backups are stored as `.enc` files and protected with a password you choose.

- Export creates an encrypted copy of your database.
- Import restores your database from a previously created encrypted backup.
- Backups are local only and not sent to any cloud service.

## Accessing the Backup Controls

1. Open IntentFlow.
2. Go to `Settings`.
3. Select the `Backup` tab.

## Exporting an Encrypted Backup

1. In the `Backup` tab, enter a strong backup password.
   - Use at least 8 characters.
   - Avoid easy or reused passwords.
2. Click `Export Backup`.
3. Choose a secure location on your computer to save the file.
4. IntentFlow will create a `.enc` backup file.

### What happens during export

- IntentFlow creates a database snapshot.
- The snapshot is encrypted using AES-256-GCM.
- The encrypted backup is saved to the chosen file path.
- A success message is shown after export.

## Importing an Encrypted Backup

1. Open the `Backup` tab in `Settings`.
2. Enter the same password you used when creating the backup.
3. Click `Import Backup`.
4. Confirm that you want to replace the current database.
5. Select the `.enc` backup file.

### Important restore notes

- Importing a backup will replace your current IntentFlow database.
- IntentFlow preserves a rollback copy of the current database before restoring.
- If the password is incorrect or the file is corrupted, the restore will fail safely.

## Recommended Best Practices

- Store your backup file in a secure location, such as an encrypted folder or external drive.
- Keep the password safe and never share it publicly.
- Create backups before large data changes.
- Test restores occasionally to confirm your backups are valid.

## Troubleshooting

- If the export fails, check disk space and permissions in the destination folder.
- If the import fails, verify that the file is a valid IntentFlow `.enc` backup and that the password is correct.
- If you see `Electron API not available`, make sure you are running the desktop version of IntentFlow and not viewing the app in a browser.

## UI Tips

- The sidebar can now be collapsed to reveal more of the PropertyMap page.
- On the PropertyMap landing screen, you can scroll vertically and horizontally to access full content.
