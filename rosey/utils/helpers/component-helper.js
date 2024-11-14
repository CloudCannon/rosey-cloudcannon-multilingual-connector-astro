import { formatAndSlugifyMarkdownText } from "./markdown-formatters.js";
const locales = ["es-ES", "de-DE", "fr-FR"];

export function generateRoseyID(data) {
  let text = "";
  if (!data) {
    return "";
  }
  if (typeof data === "object" && data.original) {
    text = data.original;
  }
  if (typeof data === "string") {
    text = data;
  }

  return formatAndSlugifyMarkdownText(text);
}

export function generateRoseyMarkdownID(text) {
  if (!text) {
    return "";
  }

  return `markdown:${formatAndSlugifyMarkdownText(text)}`;
}
