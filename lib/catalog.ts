import dictionary from "../data/dictionary.json";
import type { Entry } from "./types";
export const entries: Entry[] = dictionary;
export function searchText(entry: Entry) {
    return `${entry.acceptedEnglish.join(", ")}. ${entry.description}`;
}
export function normalize(text: string) {
    return text.normalize("NFC").trim().toLocaleLowerCase("en");
}
