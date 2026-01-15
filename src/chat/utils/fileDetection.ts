import { TFile } from "obsidian";
import { INLINE_ATTACHMENT_LIMIT, TEXT_EXTENSIONS } from "../constants";

export const isTextFile = (file: TFile) => {
    const ext = file.extension.toLowerCase();
    if (!ext) {
        return true;
    }
    return TEXT_EXTENSIONS.has(ext);
};

export { INLINE_ATTACHMENT_LIMIT, TEXT_EXTENSIONS };
