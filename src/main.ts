import { Plugin, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, AssistantSettingTab, AssistantSettings } from "./settings";
import { ExampleView, VIEW_TYPE_EXAMPLE } from 'chatView';

export default class ObsidianAssistantPlugin extends Plugin {
	settings: AssistantSettings;

	async onload() {
		this.registerView(
			VIEW_TYPE_EXAMPLE,
			(leaf) => new ExampleView(leaf)
		);
		await this.loadSettings();
		this.addSettingTab(new AssistantSettingTab(this.app, this));

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Open assistant view', () => {
			void this.activateView();
		});
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AssistantSettings>
		);
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
		await workspace.revealLeaf(leaf as WorkspaceLeaf);
	}
}
