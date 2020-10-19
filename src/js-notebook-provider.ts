import * as vscode from 'vscode';
import { dirname } from 'path';

const nel = require('nel');

/** TODO: Look into whether we can replace 'nel' with built-in 'repl'
 *        if the feature set we use is small enough.
 *  As of now, using 'nel' since it does the rich mime output part by itself
 *  So we don't have to worry about it
**/

export const providerOptions = {
    transientMetadata: {
        runnable: true,
        editable: true,
        custom: true,
    },
    transientOutputs: true
};

function generateNotebookMetaSingleLine(s: string): string {
    return `/*--< ${s} >--*/`
}

function generateNotebookMetaMultiLine(s: string): string {
    const lines = s.split(/\r?\n/g);
    const metaLines = lines.map(x => ' * ' + x);
    const firstLine = '/**\n';
    const lastLine = '**/\n';
    return firstLine + metaLines.join('\n') + lastLine;
}

function wrapWithNewLines(s: string): string {
    return `\n\n${s}\n\n`;
}

const cellDelimiter = generateNotebookMetaSingleLine("CELL DELIM");

export function jsNotebookToCells(content: string): vscode.NotebookCellData[] {
    const cellContents = content.split(cellDelimiter).map(x => x.trim());
    return cellContents.map(x => <vscode.NotebookCellData>{
        cellKind: vscode.CellKind.Code,
        language: "javascript",
        metadata: { editable: true, runnable: true },
        outputs: [],
        source: x
    })
}

export function cellsToJsNotebook(cells: ReadonlyArray<vscode.NotebookCell>): string {
    return cells.map(x => x.document.getText()).join(wrapWithNewLines(cellDelimiter))
}

interface NelSessionExecutionOutput {
    display_id?: string
    mime: {
        [key: string]: any
    }
}

class JSKernel implements vscode.NotebookKernel {

    nelSession: any

    constructor(path: string) {
        this.nelSession = new nel.Session({ cwd: dirname(path) });
    }

    label: string = "JS Notebook Kernel";

    async executeInNelSession(code: string): Promise<NelSessionExecutionOutput> {
        const session = this.nelSession;

        return new Promise((resolve, reject) => {
            session.execute(code, {
                onSuccess: (res: any) => resolve(res),
                onError: (res: any) => reject(res)
            })
        })
    }

    async executeCell(document: vscode.NotebookDocument, cell: vscode.NotebookCell): Promise<void> {
    
        try {
            cell.metadata.runState = vscode.NotebookCellRunState.Running;
            const start = +new Date();
            cell.metadata.runStartTime = start;
            // cell.metadata.executionOrder = ++this.runIndex;

            const cellContents = cell.document.getText();
            // const output = eval(cellContents);

            const output = await this.executeInNelSession(cellContents);


            const cellOutput = <vscode.CellDisplayOutput>{
				outputKind: vscode.CellOutputKind.Rich,
				data: output.mime
            }
            
            cell.outputs = [cellOutput];
            cell.metadata.runState = vscode.NotebookCellRunState.Success;
            cell.metadata.lastRunDuration = +new Date() - start;
        } catch (e) {
            const { ename, evalue, traceback } = e.error;
            cell.outputs = [
                {
                    outputKind: vscode.CellOutputKind.Error,
                    ename,
                    evalue,
                    traceback
                }
            ];
            cell.metadata.runState = vscode.NotebookCellRunState.Error;
            cell.metadata.lastRunDuration = undefined;
        }

    }

    executeAllCells(document: vscode.NotebookDocument): void {
        document.cells.forEach(c => this.executeCell(document, c))
    }

    cancelCellExecution(document: vscode.NotebookDocument, cell: vscode.NotebookCell): void {
        // throw new Error('Method not implemented.');
    }

    cancelAllCellsExecution(document: vscode.NotebookDocument): void {
        // throw new Error('Method not implemented.');
    }
}

class JSKernelProvider implements vscode.NotebookKernelProvider<JSKernel> {

    notebookKernels: WeakMap<vscode.NotebookDocument, JSKernel> = new WeakMap();

    onDidChangeKernels?: vscode.Event<vscode.NotebookDocument | undefined> | undefined;
    provideKernels(document: vscode.NotebookDocument, token: vscode.CancellationToken): vscode.ProviderResult<JSKernel[]> {
        if (!this.notebookKernels.has(document)) {
            this.notebookKernels.set(document, new JSKernel(document.uri.fsPath))
        }
        return [this.notebookKernels.get(document)!]
    }

}

export const defaultJSKernelProvider = new JSKernelProvider();

export class JSProvider implements vscode.NotebookContentProvider {
    options?: vscode.NotebookDocumentContentOptions = providerOptions;

    onDidChangeNotebookContentOptions?: vscode.Event<vscode.NotebookDocumentContentOptions> | undefined;

    async resolveNotebook(document: vscode.NotebookDocument, webview: vscode.NotebookCommunication): Promise<void> { }

    async backupNotebook(document: vscode.NotebookDocument, context: vscode.NotebookDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.NotebookDocumentBackup> {
        await this.saveNotebookAs(context.destination, document, cancellation);
        return {
            id: context.destination.toString(),
            delete: () => vscode.workspace.fs.delete(context.destination)
        };
    }

    async openNotebook(uri: vscode.Uri, openContext: vscode.NotebookDocumentOpenContext): Promise<vscode.NotebookData> {
        if (openContext.backupId) {
            uri = vscode.Uri.parse(openContext.backupId);
        }

        const languages = ['javascript'];
        const metadata: vscode.NotebookDocumentMetadata = { editable: true, cellEditable: true, cellHasExecutionOrder: false, cellRunnable: true, runnable: true };
        const content = Buffer.from(await vscode.workspace.fs.readFile(uri))
            .toString('utf8');

        const cells = jsNotebookToCells(content);

        return {
            languages,
            metadata,
            cells
        };
    }

    async saveNotebook(document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const stringOutput = cellsToJsNotebook(document.cells);
        await vscode.workspace.fs.writeFile(document.uri, Buffer.from(stringOutput));
    }

    async saveNotebookAs(targetResource: vscode.Uri, document: vscode.NotebookDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const stringOutput = cellsToJsNotebook(document.cells);
        await vscode.workspace.fs.writeFile(targetResource, Buffer.from(stringOutput));
    }

    private _onDidChangeNotebook = new vscode.EventEmitter<vscode.NotebookDocumentEditEvent>();
    readonly onDidChangeNotebook = this._onDidChangeNotebook.event;
}
