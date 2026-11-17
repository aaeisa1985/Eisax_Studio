const { app, BrowserWindow, dialog, ipcMain, utilityProcess, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
app.setAppUserModelId('com.eisax.studio');
let mainWindow, server, origin, port;
const files = new Map();
const desktopToken = crypto.randomBytes(32).toString('hex');
const serverFetch = (url, options = {}) => fetch(url, { ...options, headers: { ...options.headers, 'x-eisax-desktop': desktopToken } });
let pendingOpen = process.argv.find(p => /\.(docx|pptx)$/i.test(p));
const smoke = process.argv.includes('--smoke');
if (smoke) app.setPath('userData', path.resolve(__dirname, '..', '.data', 'desktop-smoke'));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();

function validSender(event) {
  if (!origin || !event.senderFrame || new URL(event.senderFrame.url).origin !== origin || event.senderFrame !== event.sender.mainFrame) throw Error('untrusted_sender');
}
function safeId(id) { if (!/^[0-9a-f-]{36}$/i.test(id)) throw Error('invalid_project'); return id; }
async function freePort() {
  const config = path.join(app.getPath('userData'), 'local-port.json');
  let stored = 0;
  try { stored = JSON.parse(await fs.readFile(config, 'utf8')).port; } catch {}
  if (!Number.isInteger(stored) || stored < 1024 || stored > 65535) stored = 0;
  const chosen = await new Promise((resolve, reject) => { const socket = net.createServer(); socket.once('error', () => reject(Error('The local Studio port is busy. Close the other Studio process and retry.'))); socket.listen(stored, '127.0.0.1', () => { const value = socket.address().port; socket.close(() => resolve(value)); }); });
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(config, JSON.stringify({ port: chosen }));
  return chosen;
}
async function importFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.docx', '.pptx'].includes(ext)) throw Error('unsupported_file');
  const stat = await fs.stat(filePath); if (stat.size > 20 * 1024 * 1024) throw Error('file_too_large');
  const bytes = await fs.readFile(filePath);
  const form = new FormData(); form.append('file', new Blob([bytes]), path.basename(filePath));
  const response = await serverFetch(`${origin}/api/projects/import`, { method: 'POST', body: form });
  const result = await response.json(); if (!response.ok || !result.ok) throw Error(result.error || 'import_failed');
  // The source is preserved; first Save asks for a working copy destination.
  files.set(result.projectId, { source: filePath });
  app.addRecentDocument(filePath);
  await mainWindow.loadURL(`${origin}/projects/${result.projectId}`);
  return { ok: true };
}
async function pdfBytes(id) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await printWindow.loadURL(`${origin}/projects/${id}/print`);
    await printWindow.webContents.executeJavaScript(`Promise.all([document.fonts.ready,...Array.from(document.images,i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r}))])`);
    return await printWindow.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  } finally { printWindow.destroy(); }
}
app.on('second-instance', (_e, argv) => { const file = argv.find(p => /\.(docx|pptx)$/i.test(p)); if (file && mainWindow) importFile(file).catch(e => dialog.showErrorBox('Open file', e.message)); else if (file) pendingOpen = file; mainWindow?.show(); });
app.on('open-file', (event, file) => { event.preventDefault(); if (origin) importFile(file).catch(e => dialog.showErrorBox('Open file', e.message)); else pendingOpen = file; });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => server?.kill());

if (lock) app.whenReady().then(async () => {
  port = await freePort(); origin = `http://127.0.0.1:${port}`;
  const root = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.resolve(__dirname, '..', '.next', 'standalone');
  const osEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|HOME|LANG)$/i.test(key)));
  server = utilityProcess.fork(path.join(root, 'server.js'), [], { cwd: root, env: { ...osEnv, NODE_ENV: 'production', EISAX_LOCAL_MODE: 'true', EISAX_DESKTOP_TOKEN: desktopToken, EISAX_DATA_DIR: path.join(app.getPath('userData'), 'files'), PORT: String(port), HOSTNAME: '127.0.0.1' }, stdio: 'pipe' });
  server.stderr?.on('data', data => process.stderr.write(data));
  let ready = false;
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  if (!ready) throw Error('Local server did not start. Run npm run desktop:prepare first.');
  mainWindow = new BrowserWindow({ show: !smoke, width: 1360, height: 900, title: 'EISAX Studio', icon: path.join(root, 'public/icons/icon-192.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await mainWindow.webContents.session.cookies.set({ url: origin, name: 'eisax_desktop', value: desktopToken, httpOnly: true, sameSite: 'strict' });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  const notifyFullscreen = () => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('office:fullscreen-changed', mainWindow.isFullScreen());
  };
  mainWindow.on('enter-full-screen', notifyFullscreen);
  mainWindow.on('leave-full-screen', notifyFullscreen);
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'View / عرض', submenu: [
      { label: 'Fullscreen / ملء الشاشة', accelerator: 'F11', click: () => mainWindow.setFullScreen(!mainWindow.isFullScreen()) },
      { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
    ] },
  ]));
  ipcMain.handle('office:fullscreen', (event, value) => {
    validSender(event);
    if (typeof value === 'boolean') mainWindow.setFullScreen(value);
    return mainWindow.isFullScreen();
  });
  ipcMain.handle('office:open', async event => {
    validSender(event);
    const choice = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Office', extensions: ['docx', 'pptx'] }] });
    if (choice.canceled) return { canceled: true };
    try { return await importFile(choice.filePaths[0]); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('office:save', async (event, args) => {
    validSender(event); const id = safeId(args.projectId);
    if (!['docx','pptx','pdf'].includes(args.format)) throw Error('invalid_format');
    const format = args.format;
    const known = files.get(id) || {};
    let target = format !== 'pdf' && !args.saveAs ? known.target : undefined;
    if (!target) {
      const title = String(args.title || 'Document').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').slice(0,100) || 'Document';
      const choice = await dialog.showSaveDialog(mainWindow, { defaultPath: `${title}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
      if (choice.canceled || !choice.filePath) return { canceled: true };
      target = choice.filePath;
    }
    try {
      if (known.source && path.resolve(known.source) === path.resolve(target)) {
        const confirm = await dialog.showMessageBox(mainWindow, { type: 'warning', buttons: ['Cancel / إلغاء', 'Replace original / استبدال الأصل'], defaultId: 0, cancelId: 0, message: 'Replace the original file? / استبدال الملف الأصلي؟', detail: 'Unsupported Office features may be omitted. قد تُفقد ميزات Office غير المدعومة.' });
        if (confirm.response !== 1) return { canceled: true };
      }
      let bytes;
      if (format === 'pdf') bytes = await pdfBytes(id);
      else { const response = await serverFetch(`${origin}/api/projects/${id}/export/${format}`); if (!response.ok) throw Error('export_failed'); bytes = Buffer.from(await response.arrayBuffer()); }
      const temp = `${target}.${crypto.randomUUID()}.tmp`;
      try { await fs.writeFile(temp, bytes, { flag: 'wx' }); await fs.rename(temp, target); } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
      if (format !== 'pdf') files.set(id, { ...known, target });
      app.addRecentDocument(target);
      return { ok: true, name: path.basename(target) };
    } catch (e) { return { error: e.message }; }
  });
  if (pendingOpen) await importFile(pendingOpen); else await mainWindow.loadURL(`${origin}/dashboard`);
  if (smoke) {
    if (!pendingOpen) throw Error('--smoke requires an Office fixture path');
    const id = new URL(mainWindow.webContents.getURL()).pathname.split('/')[2];
    const anonymous = await fetch(`${origin}/api/projects/${id}/original`);
    if (anonymous.status !== 401) throw Error('Desktop authentication check failed');
    const pdf = await pdfBytes(id);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw Error('Invalid PDF');
    await fs.writeFile(path.join(app.getPath('userData'), 'smoke.pdf'), pdf);
    console.log(JSON.stringify({ desktopServer: true, import: true, privateServer: true, pdfBytes: pdf.length }));
    app.quit();
  }
}).catch(error => { if (smoke) { console.error(error); app.exit(1); } else { dialog.showErrorBox('EISAX Studio', error.message); app.quit(); } });
