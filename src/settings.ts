import { App, PluginSettingTab, Setting } from "obsidian";
import NextProjectTasksPlugin from "./main";

export interface NextProjectTasksSettings {
    projectTag: string;
    individualTaskTag: string;
}

export const DEFAULT_SETTINGS: NextProjectTasksSettings = {
    projectTag: "#projects",
    individualTaskTag: "#individualtasks"
};

export class NextProjectTasksSettingTab extends PluginSettingTab {
    plugin: NextProjectTasksPlugin;

    constructor(app: App, plugin: NextProjectTasksPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Next Project Tasks Settings" });

        new Setting(containerEl)
            .setName("Project Tag")
            .setDesc("Tag to identify project notes (e.g. #projects)")
            .addText(text =>
                text
                    .setPlaceholder("#projects")
                    .setValue(this.plugin.settings.projectTag)
                    .onChange(async (value) => {
                        this.plugin.settings.projectTag = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews?.();
                    })
            );

        new Setting(containerEl)
            .setName("Individual Task Tag")
            .setDesc("Tag to identify notes whose tasks should always appear (e.g. #individualtasks)")
            .addText(text =>
                text
                    .setPlaceholder("#individualtasks")
                    .setValue(this.plugin.settings.individualTaskTag)
                    .onChange(async (value) => {
                        this.plugin.settings.individualTaskTag = value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews?.();
                    })
            );
    }
}
