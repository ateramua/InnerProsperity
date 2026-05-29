class BackupWorkerHost {
  async run(task) {
    // Worker isolation can be introduced here without changing IPC contracts.
    return task();
  }
}

module.exports = BackupWorkerHost;
