// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { providerOptions, JSProvider, defaultJSKernelProvider } from './js-notebook-provider'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-js-notebook" is now active!');

	let notebookDisposable = vscode.notebook.registerNotebookContentProvider('js-notebook', new JSProvider(), providerOptions)

	context.subscriptions.push(notebookDisposable);

	let kernelDisposable = vscode.notebook.registerNotebookKernelProvider({ 'viewType': 'js-notebook' }, defaultJSKernelProvider)
	context.subscriptions.push(kernelDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
