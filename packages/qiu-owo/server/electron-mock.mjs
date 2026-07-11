// Electron mock for dev mode — provides app, dialog, shell, BrowserWindow, etc.

export const app = {
  getPath: (name) => {
    if (name === 'userData') return process.cwd()
    if (name === 'downloads') return process.env.USERPROFILE + '\\Downloads'
    return process.cwd()
  },
  getVersion: () => '0.1.0-dev',
  getName: () => 'Qiu-owo',
  quit: () => process.exit(0),
  exit: (code) => process.exit(code),
  whenReady: () => Promise.resolve(),
  on: () => {},
  isPackaged: false,
}

export class BrowserWindow {
  constructor() {
    this.webContents = {
      session: { on: () => {} },
      downloadURL: () => {},
    }
  }
  loadURL() {}
  on() {}
  setProgressBar() {}
  isDestroyed() { return false }
  getBounds() { return { x: 0, y: 0, width: 1440, height: 900 } }
  close() {}
  static getAllWindows() { return [] }
}

export const dialog = {
  showMessageBox: async () => ({ response: 0 }),
  showSaveDialog: async () => ({ filePath: null }),
  showErrorBox: () => {},
}

export const shell = {
  openPath: async () => '',
  showItemInFolder: () => {},
}

export const Menu = {
  buildFromTemplate: () => ({}),
  setApplicationMenu: () => {},
}

export const ipcMain = {
  on: () => {},
  handle: () => {},
}

export default { app, BrowserWindow, dialog, shell, Menu, ipcMain }
