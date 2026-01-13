import { App, PluginSettingTab, Setting } from "obsidian";
import ObsidianAssistantPlugin from "./main";

export interface AssistantSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: AssistantSettings = {
	mySetting: 'default'
}

export class AssistantSettingTab extends PluginSettingTab {
	plugin: ObsidianAssistantPlugin;

	constructor(app: App, plugin: ObsidianAssistantPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
