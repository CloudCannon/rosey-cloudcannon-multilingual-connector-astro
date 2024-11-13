import fs from "fs";
import YAML from "yaml";
import path from "path";
import dotenv from "dotenv";
import { NodeHtmlMarkdown } from "node-html-markdown";
import {
  isDirectory,
  readFileWithFallback,
  readJsonFromFile,
} from "./helpers/file-helper.js";

const nhm = new NodeHtmlMarkdown(
  /* options (optional) */ {},
  /* customTransformers (optional) */ undefined,
  /* customCodeBlockTranslators (optional) */ undefined
);
dotenv.config();

const inputFilePath = "./rosey/base.json";
const inputURLFilePath = "./rosey/base.urls.json";
const translationFilesDirPath = "./rosey/translations";
const localesDirPath = "./rosey/locales";

const baseURL = process.env.BASEURL;
const locales = process.env.LOCALES?.split(",");

// Loop through locales
for (let i = 0; i < locales.length; i++) {
  const locale = locales[i];

  generateTranslationFilesForLocale(locale).catch((err) => {
    console.error(`❌❌ Encountered an error translating ${locale}:`, err);
  });
}

async function generateTranslationFilesForLocale(locale) {
  // Get the Rosey generated data
  const localePath = path.join(localesDirPath, `${locale}.json`);
  const oldLocaleData = await readJsonFromFile(localePath);
  const inputFileData = await readJsonFromFile(inputFilePath);
  const inputURLFileData = await readJsonFromFile(inputURLFilePath);

  const pages = Object.keys(inputURLFileData.keys);

  const translationsLocalePath = path.join(translationFilesDirPath, locale);

  console.log(`📂📂 ${translationsLocalePath} ensuring folder exists`);
  await fs.promises.mkdir(translationsLocalePath, { recursive: true });

  const translationsFiles = await fs.promises.readdir(translationsLocalePath, {
    recursive: true,
  });

  // Remove translations pages no longer present in the base.json file
  await Promise.all(
    translationsFiles.map(async (fileNameWithExt) => {
      const filePath = path.join(translationsLocalePath, fileNameWithExt);

      if (await isDirectory(filePath)) {
        return;
      }

      const fileNameHTMLFormatted = getTranslationHTMLFilename(fileNameWithExt);

      if (!pages.includes(fileNameHTMLFormatted)) {
        console.log(
          `❌ Deleting ${fileNameHTMLFormatted}(${filePath}), since it doesn't exist in the pages in our base.json`
        );

        await fs.promises.unlink(filePath);
        console.log(`❌ ${fileNameHTMLFormatted} at ${filePath} was deleted`);
      }
    })
  );

  // Loop through the pages present in the base.json
  await Promise.all(
    pages.map(async (page) => {
      // Format the page name
      const pageName = page
        .replace("/index.html", "")
        .replace(".html", "")
        .replace("index", "home");

      // Find the page file path
      const translationFilePath = path.join(
        translationFilesDirPath,
        locale,
        `${pageName}.yaml`
      );

      let cleanedOutputFileData = {};

      // Ensure nested pages have parent folders
      const pageHasParentFolder = pageName.includes("/");
      if (pageHasParentFolder) {
        const parentFolder = pageName.substring(
          0,
          pageName.lastIndexOf("/") + 1
        );
        const parentFolderFilePath = path.join(
          translationFilesDirPath,
          locale,
          parentFolder
        );
        await fs.promises.mkdir(parentFolderFilePath, { recursive: true });
      }

      const translationFileString = await readFileWithFallback(
        translationFilePath,
        "_inputs: {}"
      );
      const translationFileData = await YAML.parse(translationFileString);

      // Create the url key
      if (translationFileData["urlTranslation"]?.length > 0) {
        cleanedOutputFileData["urlTranslation"] =
          translationFileData["urlTranslation"];
      } else {
        cleanedOutputFileData["urlTranslation"] = page;
      }

      initDefaultInputs(cleanedOutputFileData, page, locale);

      Object.keys(inputFileData.keys).forEach((inputKey) => {
        const inputTranslationObj = inputFileData.keys[inputKey];
        // If input doesn't exist on this page exit early
        if (!inputTranslationObj.pages[page]) {
          return;
        }

        // Only add the key to our output data if it still exists in base.json
        // If entry no longer exists in base.json it's content has changed in the visual editor
        if (translationFileData[inputKey]) {
          cleanedOutputFileData[inputKey] = translationFileData[inputKey];
        }

        // If entry doesn't exist in our output file, add it
        if (!cleanedOutputFileData[inputKey]) {
          cleanedOutputFileData[inputKey] = "";
        }

        cleanedOutputFileData["_inputs"][inputKey] = getInputConfig(
          inputKey,
          page,
          inputTranslationObj,
          oldLocaleData
        );

        // Add each entry to page object group depending on whether they are translated or not
        if (cleanedOutputFileData[inputKey]?.length > 0) {
          cleanedOutputFileData["_inputs"]["$"].options.groups[1].inputs.push(
            inputKey
          );
        } else {
          cleanedOutputFileData["_inputs"]["$"].options.groups[0].inputs.push(
            inputKey
          );
        }
      });

      await fs.promises.writeFile(
        translationFilePath,
        YAML.stringify(cleanedOutputFileData)
      );
      console.log("✅✅ " + translationFilePath + " updated succesfully");
    })
  );
}

function getPageString(page) {
  return page.replace(".html", "").replace("index", "");
}

function initDefaultInputs(data, page, locale) {
  // Create the inputs obj if there is none
  if (!data["_inputs"]) {
    data["_inputs"] = {};
  }

  // Create the page input object
  if (!data["_inputs"]["$"]) {
    const pageString = getPageString(page);
    data["_inputs"]["$"] = {
      type: "object",
      comment: `[See ${pageString}](${baseURL}${pageString})`,
      options: {
        place_groups_below: false,
        groups: [
          {
            heading: `Still to translate (${locale})`,
            comment: `Text to translate on [${pageString}](${baseURL}${pageString})`,
            inputs: [],
          },
          {
            heading: `Already translated (${locale})`,
            comment: `Text already translated on [${pageString}](${baseURL}${pageString})`,
            inputs: [],
          },
        ],
      },
    };
  }
}

function formatMarkdownForComments(markdown) {
  return (
    markdown
      .trim()
      // Remove all md links
      .replaceAll(/(?:__[*#])|\[(.*?)\]\(.*?\)/gm, /$1/)
      // Remove special chars
      .replaceAll(/[&\/\\#+()$~%"*<>{}]/gm, "")
  );
}

function getInputConfig(inputKey, page, inputTranslationObj) {
  const untranslatedPhrase = inputTranslationObj.original.trim();
  // Turn into markdown
  const untranslatedPhraseMarkdown = nhm.translate(untranslatedPhrase);

  const originalPhraseTidiedForComment = formatMarkdownForComments(
    untranslatedPhraseMarkdown
  );

  const isKeyMarkdown = inputKey.slice(0, 10).includes("markdown:");
  const isInputShortText = untranslatedPhrase.length < 20;

  const inputType = isKeyMarkdown
    ? "markdown"
    : isInputShortText
      ? "text"
      : "textarea";

  const options = isKeyMarkdown
    ? {
        bold: true,
        format: "p h1 h2 h3 h4",
        italic: true,
        link: true,
        undo: true,
        redo: true,
        removeformat: true,
        copyformatting: true,
        blockquote: true,
      }
    : {};

  const locationString = generateLocationString(
    originalPhraseTidiedForComment,
    page
  );

  const isLabelConcat = originalPhraseTidiedForComment.length > 42;

  const formattedLabel = isLabelConcat
    ? `${originalPhraseTidiedForComment.substring(0, 42)}...`
    : originalPhraseTidiedForComment;

  const inputConfig = isLabelConcat
    ? {
        label: formattedLabel,
        hidden: untranslatedPhrase === "" ? true : false,
        type: inputType,
        options: options,
        comment: locationString,
        context: {
          open: false,
          title: "Untranslated Text",
          icon: "translate",
          content: untranslatedPhraseMarkdown,
        },
      }
    : {
        label: formattedLabel,
        hidden: untranslatedPhrase === "" ? true : false,
        type: inputType,
        options: options,
        comment: locationString,
      };

  return inputConfig;
}

function getTranslationHTMLFilename(translationFilename) {
  if (translationFilename === "404.yaml") {
    return "404.html";
  }

  if (translationFilename === "home.yaml") {
    return "index.html";
  }

  return translationFilename.replace(".yaml", "/index.html");
}

function generateLocationString(originalPhrase, page) {
  // Limit each phrase to 3 words
  const urlHighlighterWordLength = 3;
  const originalPhraseArray = originalPhrase.split(/[\n]+/);
  // Get the first and last line of the markdown so we only have complete lines in the highlight url
  const firstPhrase = originalPhraseArray[0];
  const lastPhrase = originalPhraseArray[originalPhraseArray.length - 1];
  const endHighlightArrayAll = lastPhrase.split(" ");

  const startHighlightArrayWithPunctuation = firstPhrase
    .split(" ")
    .slice(0, urlHighlighterWordLength);

  const endHighlightArrayWithPunctuation = endHighlightArrayAll.slice(
    endHighlightArrayAll.length - urlHighlighterWordLength,
    endHighlightArrayAll.length
  );

  // Look at these arrays for any words with a special character after
  // That is our last word in the start or end highlight
  // The phrase stops there in an attempt to still capture the block of text

  const startHighlightArrayWithoutPunctuation = [];
  const endHighlightArrayWithoutPunctuation = [];

  for (let i = 0; i < startHighlightArrayWithPunctuation.length; i++) {
    const word = startHighlightArrayWithPunctuation[i];
    const regexToMatch = /[&#,+()$~%.":*?<>{}]/gm;
    const foundMatches = word.match(regexToMatch);
    if (foundMatches && foundMatches.length > 0) {
      startHighlightArrayWithoutPunctuation.push(
        word.replaceAll(/[&#,+()$~%.":*?<>{}]/gm, "")
      );
      break;
    } else {
      startHighlightArrayWithoutPunctuation.push(word);
    }
  }

  for (let j = 0; j < endHighlightArrayWithPunctuation.length; j++) {
    const word = endHighlightArrayWithPunctuation[j];
    const regexToMatch = /[&#,+()$~%.":*?<>{}]/gm;
    const foundMatches = word.match(regexToMatch);
    if (foundMatches && foundMatches.length > 0) {
      endHighlightArrayWithoutPunctuation.push(
        word.replaceAll(/[&#,+()$~%.":*?<>{}]/gm, "")
      );
      break;
    } else {
      endHighlightArrayWithoutPunctuation.push(word);
    }
  }

  const originalPhraseArrayByWord = originalPhraseArray.join(" ").split(" ");

  // Trim and encode the resulting phrase
  const startHighlight = startHighlightArrayWithoutPunctuation.join(" ").trim();
  const endHighlight = endHighlightArrayWithoutPunctuation.join(" ").trim();

  const encodedStartHighlight = encodeURI(startHighlight);
  const encodedEndHighlight = encodeURI(endHighlight);
  const encodedOriginalPhrase = encodeURI(originalPhraseArray.join(" "));

  const pageString = getPageString(page);
  // Look to see if original phrase is 5 words or shorter
  // if it is fallback to the encoded original phrase for the highlight link
  return originalPhraseArrayByWord.length > urlHighlighterWordLength * 2
    ? `[See on page](${baseURL}${pageString}#:~:text=${encodedStartHighlight},${encodedEndHighlight})`
    : `[See on page](${baseURL}${pageString}#:~:text=${encodedOriginalPhrase})`;
}
