import { App, Editor, MarkdownView, Modal, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, SampleSettingTab } from "./settings";
import { ExampleView, VIEW_TYPE_EXAMPLE } from 'chatView';

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new ExampleView(leaf)
		);
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (evt: MouseEvent) => {
			this.activateView();
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_EXAMPLE);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0] as WorkspaceLeaf;
		} else {
			// Our view could not be found in the workspace, create a new leaf
			// in the right sidebar for it
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: VIEW_TYPE_EXAMPLE, active: true });
		}

		// "Reveal" the leaf in case it is in a collapsed sidebar
		workspace.revealLeaf(leaf as WorkspaceLeaf);
	}
}

