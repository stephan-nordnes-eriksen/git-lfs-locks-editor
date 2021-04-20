// @ts-check
const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const path = require('path')
const fixPath = require('fix-path')
fixPath()
const isMac = process.platform === 'darwin'
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win


const template = [
	// { role: 'appMenu' }
	...(process.platform === 'darwin' ? [{
		label: app.getName(),
		submenu: [
			{ role: 'about' },
			{ type: 'separator' },
			{ role: 'services' },
			{ type: 'separator' },
			{ role: 'hide' },
			{ role: 'hideothers' },
			{ role: 'unhide' },
			{ type: 'separator' },
			{ role: 'quit' }
		]
	}] : []),
	// { role: 'fileMenu' }
	{
		label: 'File',
		submenu: [
			isMac ? { role: 'close' } : { role: 'quit' }
		]
	},
	// { role: 'editMenu' }
	{
		label: 'Edit',
		submenu: [
			{ role: 'undo' },
			{ role: 'redo' },
			{ type: 'separator' },
			{ role: 'cut' },
			{ role: 'copy' },
			{ role: 'paste' },
			...(isMac ? [
				{ role: 'pasteAndMatchStyle' },
				{ role: 'delete' },
				{ role: 'selectAll' },
				{ type: 'separator' },
				{
					label: 'Speech',
					submenu: [
						{ role: 'startspeaking' },
						{ role: 'stopspeaking' }
					]
				}
			] : [
					{ role: 'delete' },
					{ type: 'separator' },
					{ role: 'selectAll' }
				])
		]
	},
	// { role: 'viewMenu' }
	{
		label: 'View',
		submenu: [
			{ role: 'reload' },
			{ role: 'forcereload' },
			{ role: 'toggledevtools' },
			{ type: 'separator' },
			{ role: 'resetzoom' },
			{ role: 'zoomin' },
			{ role: 'zoomout' },
			{ type: 'separator' },
			{ role: 'togglefullscreen' }
		]
	},
	// { role: 'windowMenu' }
	{
		label: 'Window',
		submenu: [
			{ role: 'minimize' },
			{ role: 'zoom' },
			...(isMac ? [
				{ type: 'separator' },
				{ role: 'front' },
				{ type: 'separator' },
				{ role: 'window' }
			] : [
					{ role: 'close' }
				])
		]
	},
	{
		role: 'help',
		submenu: [
			{
				label: 'Learn More',
				click: async () => {
					const { shell } = require('electron')
					await shell.openExternal('https://electronjs.org')
				}
			}
		]
	}
]


function createWindow() {
	// Create the browser window.
	win = new BrowserWindow({
		width: 1400,
		height: 800,
		webPreferences: {
			nodeIntegration: true
		},
		// frame: false,
		autoHideMenuBar: true,
		title: 'Git LFS Locks editor',
	})
	const menu = Menu.buildFromTemplate(template)
	Menu.setApplicationMenu(menu)
	// and load the index.html of the app.
	win.loadFile('index.html')
	// win.setMenu(null)
	// Open the DevTools.
	// win.webContents.openDevTools()

	// Emitted when the window is closed.
	win.on('closed', () => {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		win = null
	})
	// win.webContents.openDevTools()
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (!isMac) {
		app.quit()
	}
})

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (win === null) {
		createWindow()
	}
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here
let currentFolderPath

ipcMain.on('shutdown', (event) => {
	win.close()
})
ipcMain.on('ondragstart', (event, filePath) => {
	event.sender.startDrag({
		file: filePath,
		icon: path.resolve('./git-small.png')
	})
})
ipcMain.on('runcommand', (event, command) => {
	remoteLog('running command ' + command)
	exec(command)
	.then(remoteLog)
	.catch(remoteError)
})
ipcMain.on('unlock', (event, lockId) => {
	exec(`git --git-dir="${path.join(currentFolderPath, '.git')}" --work-tree="${currentFolderPath}" lfs unlock -i ${lockId}`)
		.then(() => {
			win.webContents.send('file-unlocked', lockId)
			// executeGitFolderSelected(currentFolderPath)
		})
		.catch(remoteError)
})
ipcMain.on('forceUnlock', (event, lockId) => {
	exec(`git --git-dir="${path.join(currentFolderPath, '.git')}" --work-tree="${currentFolderPath}" lfs unlock -f -i ${lockId}`)
		.then(() => {
			win.webContents.send('file-unlocked', lockId)
			// executeGitFolderSelected(currentFolderPath)
		})
		.catch(remoteError)
})
ipcMain.on('openfile', (event, filePath) => {
	shell.openItem(filePath)
})
function remoteLog(...data) {
	win.webContents.send('log', data)
}
function remoteError(...data) {
	win.webContents.send('error', data)
}
function executeGitFolderSelected(selectedFolder) {
	remoteLog('selectedFolder', selectedFolder)
	currentFolderPath = selectedFolder
	win.webContents.send('folderSelected', currentFolderPath)
	exec(`git --git-dir="${path.join(currentFolderPath, '.git')}" --work-tree="${currentFolderPath}" lfs locks --json`)
		.then(data => {
			remoteLog('gitData', data)
			let result = []
			try {
				result = JSON.parse(data.stdout)
			} catch (error) {
				remoteError('Error', error)
			}
			win.webContents.send('git-data',
				result
					.filter(data => {
						return data
					})
					.map(data => {
						data.path = path.join(currentFolderPath, data.path)
						data.basename = path.basename(data.path)
						return data
					})
			)
		})
		.catch((error) => {
			remoteError(error)
			win.webContents.send('git-data-failed')
		})
}

ipcMain.on('selectedDirectory', (event, filePath) => {
	remoteLog('selectedDir', filePath)
	executeGitFolderSelected(filePath)
})
ipcMain.on('selectDirectory', (event) => {
	dialog.showOpenDialog(win, {
		properties: ['openDirectory']
	})
		.then(filePaths => {
			if (filePaths.filePaths) {
				currentFolderPath = filePaths.filePaths[0]
				executeGitFolderSelected(currentFolderPath)
			}
		})
})
