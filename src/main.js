// since the weights are mostly only used to make things repeat after x amount of rounds, they are overkill
// would be less work to just wait x rounds and immeditely show what you missed, without updating any weights.
"use strict";
import { bind, isJapanese } from "wanakana";
import {
	CONDITIONAL_UI_TIMINGS,
	getDefaultSettings,
	getVisibleConjugationSettings,
	removeNonConjugationSettings,
	showFurigana,
	showTranslation,
	findMaxScoreIndex,
	applyAllSettingsFilterWords,
	applyNonConjugationSettings,

	optionsMenuInit,
	selectCheckboxesInUi,
	showHideOptionsAndCheckErrors,
	insertSettingsFromUi,
	getDefaultAdditiveSettings,
} from "./settingManagement.js";
import { japaneseWordData, koreanWordData, fullWordData } from "./worddata.js";
import { CONJUGATION_TYPES, PARTS_OF_SPEECH } from "./wordEnums.js";
import {
	toggleDisplayNone,
	createArrayOfArrays,
	toggleBackgroundNone,
} from "./utils.js";

try {
    var conjugator = require('./korean/conjugator.js'),
        assert     = require('assert');
} catch(e) {}

const isTouch = "ontouchstart" in window || navigator.msMaxTouchPoints > 0;
document.getElementById("press-any-key-text").textContent = isTouch
	? "Tap to continue"
	: "Press Enter/Return to continue";

// Stored in state.activeScreen
const SCREENS = Object.freeze({
	question: 0,
	// Incorrect and correct answers are considered the same "results" screen
	results: 1,
	settings: 2,
});

function wordTypeToDisplayText(type) {
	if (type == "u") {
		return "う-verb";
	} else if (type == "ru") {
		return "る-verb";
	} else if (type == "irv" || type == "ira") {
		return "Irregular";
	} else if (type == "i") {
		return "い-adjective";
	} else if (type == "na") {
		return "な-adjective";
	}
}

function conjugationInqueryFormatting(conjugation) {
	let newString = "";

	function createInqueryText(text, emoji) {
		return `<div class="conjugation-inquery"><div class="inquery-emoji">${emoji}</div><div class="inquery-text">${text}</div></div> `;
	}

	if (conjugation.type === CONJUGATION_TYPES.past) {
		newString += createInqueryText(CONJUGATION_TYPES.past, "⌚");
	} else if (
		conjugation.type === CONJUGATION_TYPES.te ||
		conjugation.type === CONJUGATION_TYPES.adverb
	) {
		newString += conjugation.type;
	} else if (conjugation.type === CONJUGATION_TYPES.volitional) {
		newString += createInqueryText(CONJUGATION_TYPES.volitional, "🍻");
	} else if (conjugation.type === CONJUGATION_TYPES.passive) {
		newString += createInqueryText(CONJUGATION_TYPES.passive, "🧘");
	} else if (conjugation.type === CONJUGATION_TYPES.causative) {
		newString += createInqueryText(CONJUGATION_TYPES.causative, "👩‍🏫");
	} else if (conjugation.type === CONJUGATION_TYPES.potential) {
		newString += createInqueryText(CONJUGATION_TYPES.potential, "‍🏋");
	} else if (conjugation.type === CONJUGATION_TYPES.imperative) {
		newString += createInqueryText(CONJUGATION_TYPES.imperative, "📢");
	}

	// This used to also add "Affirmative" text when affirmative was true, but it was a little redundant.
	// Now it only adds "Negative" text when affirmative is false.
	if (conjugation.affirmative === false) {
		newString += createInqueryText("Negative", "🚫");
	} else {
		newString += createInqueryText("Affirmative", "✅");
	}

	if (conjugation.formal === true) {
		newString += createInqueryText("Formal", "👔");
	} else if (conjugation.formal === false) {
		newString += createInqueryText("Informal", "👪");
	}

	if (conjugation.polite === true) {
		newString += createInqueryText("Polite", "👔");
	} else if (conjugation.polite === false) {
		newString += createInqueryText("Plain", "👪");
	}

	return newString;
}

function changeVerbBoxFontColor(color) {
	let ps = document.getElementById("verb-box").getElementsByTagName("p");
	for (let p of Array.from(ps)) {
		p.style.color = color;
	}
}

function loadNewWord(wordList) {
	let word = pickRandomWord(wordList);
	updateCurrentWord(word);
	changeVerbBoxFontColor("rgb(232, 232, 232)");
	return word;
}

function updateCurrentWord(word) {
	// Caution: verb-box is controlled using a combination of the background-none class and setting style.background directly.
	// The background-none class is useful for other CSS selectors to grab onto,
	// while the style.background is useful for setting variable bg colors.
	toggleBackgroundNone(document.getElementById("verb-box"), true);
	// The <rt> element had different padding on different browsers.
	// Rather than attacking it with CSS, just replace it with a span we have control over.
	const verbHtml = word.wordJSON.hangeul
		.replaceAll("<rt>", '<span class="rt">')
		.replaceAll("</rt>", "</span>");
	document.getElementById("verb-text").innerHTML = verbHtml;
	document.getElementById("translation").textContent = word.wordJSON.eng;
	// Set verb-type to a non-breaking space to preserve vertical height
	document.getElementById("verb-type").textContent = "\u00A0";
	document.getElementById("conjugation-inquery-text").innerHTML =
		conjugationInqueryFormatting(word.conjugation);
}

function getConjugation(
	wordJSON,
	partOfSpeech,
	conjugationType,
	validBaseWordSpellings,
	affirmative,
	polite
) {
	const validConjugatedAnswers = [];
	const conjugationFunction =
		conjugationFunctions[partOfSpeech][conjugationType];

	validBaseWordSpellings?.forEach((baseWord) => {
		validConjugatedAnswers.push(
			conjugationFunction(baseWord, wordJSON.type, affirmative, polite)
		);
	});

	return new Conjugation(
		// conjugationFunction may return a string or array, so flatten to get rid of nested arrays
		validConjugatedAnswers.flat(),
		conjugationType,
		affirmative,
		polite
	);
}

function getAllConjugations(wordJSON) {
	const allConjugations = [];
	const partOfSpeech = getPartOfSpeech(wordJSON);

	// Get all valid spellings for the base word
	// For example ["あがる", "上がる", "上る"]
	let validBaseWordSpellings = [
		toHiragana(wordJSON.kanji),
		toKanjiPlusHiragana(wordJSON.kanji),
	];
	if (wordJSON.altOkurigana?.length) {
		validBaseWordSpellings = validBaseWordSpellings.concat(
			wordJSON.altOkurigana
		);
	}

	// Present and past have standard variations for verbs and adjectives
	const typesWithStandardVariations = [
		CONJUGATION_TYPES.present,
		CONJUGATION_TYPES.past,
	];

	if (partOfSpeech === PARTS_OF_SPEECH.verb) {
		typesWithStandardVariations.push(CONJUGATION_TYPES.passive);
		typesWithStandardVariations.push(CONJUGATION_TYPES.causative);
		// わかる does not have a potential form
		if (toHiragana(wordJSON.kanji) !== "わかる") {
			typesWithStandardVariations.push(CONJUGATION_TYPES.potential);
		}
	}

	typesWithStandardVariations.forEach((conjugationType) => {
		allConjugations.push(
			getStandardVariationConjugations(
				wordJSON,
				partOfSpeech,
				conjugationType,
				validBaseWordSpellings
			)
		);
	});

	if (partOfSpeech === PARTS_OF_SPEECH.verb) {
		// te
		allConjugations.push(
			getConjugation(
				wordJSON,
				partOfSpeech,
				CONJUGATION_TYPES.te,
				validBaseWordSpellings,
				null,
				null
			)
		);
		// volitional
		[true, false].forEach((polite) => {
			allConjugations.push(
				getConjugation(
					wordJSON,
					partOfSpeech,
					CONJUGATION_TYPES.volitional,
					validBaseWordSpellings,
					null,
					polite
				)
			);
		});
		// imperative
		allConjugations.push(
			getConjugation(
				wordJSON,
				partOfSpeech,
				CONJUGATION_TYPES.imperative,
				validBaseWordSpellings,
				null,
				null
			)
		);
	} else if (partOfSpeech === PARTS_OF_SPEECH.adjective) {
		// Add adverb
		allConjugations.push(
			getConjugation(
				wordJSON,
				partOfSpeech,
				CONJUGATION_TYPES.adverb,
				validBaseWordSpellings,
				null,
				null
			)
		);
	}

	// allConjugations contains either Conjugations or arrays of Conjugations.
	// Flatten to make into one array.
	return allConjugations.flat();
}

function getAllKoreanConjugations(wordJSON) {
	const allConjugations = [];

	// PRESENT TENSE
	// -- informal
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_present_informal_low(wordJSON.hangeul)],	// valid answers
			CONJUGATION_TYPES.present,											// conjugation_types
			true,																// affirmative
			false,																// informal
			false																// plain
		)
	)
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_present_informal_high(wordJSON.hangeul)],	// valid answers
			CONJUGATION_TYPES.present,											// conjugation_types
			true,																// affirmative
			false,																// informal
			true																// polite
		)
	)
	// -- formal
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_present_formal_low(wordJSON.hangeul)],	// valid answers
			CONJUGATION_TYPES.present,											// conjugation_types
			true,																// affirmative
			true,																// formal
			false
		)
	)
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_present_formal_high(wordJSON.hangeul)],
			CONJUGATION_TYPES.present,
			true,
			true,
			true
		)
	)

	// PAST TENSE
	// -- informal
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_past_informal_low(wordJSON.hangeul)],		// valid answers
			CONJUGATION_TYPES.past,											// conjugation_types
			true,																// affirmative
			false,
			false// formal
		)
	)
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_past_informal_high(wordJSON.hangeul)],		// valid answers
			CONJUGATION_TYPES.past,											// conjugation_types
			true,																// affirmative
			false,
			true
		)
	)
	// -- formal
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_past_formal_low(wordJSON.hangeul)],
			CONJUGATION_TYPES.past,
			true,
			true,
			false
		)
	)
	allConjugations.push(
		new Conjugation(
			[conjugator.declarative_past_formal_high(wordJSON.hangeul)],
			CONJUGATION_TYPES.past,
			true,
			true,
			true
		)
	)


	return allConjugations.flat();
}

class Conjugation {
	// conjugationType is CONJUGATION_TYPES enum
	constructor(validAnswers, conjugationType, affirmative, formal, polite) {
		this.validAnswers = validAnswers;
		this.type = conjugationType;
		this.affirmative = affirmative;
		this.formal = formal;
		this.polite = polite
	}
}

class Word {
	// conjugation is Conjugation class object
	constructor(wordJSON, conjugation) {
		this.wordJSON = wordJSON;
		this.conjugation = conjugation;

		// Probability is updated directly by external functions
		this.probability = 0;
		// wasRecentlyIncorrect is used when calculating probability
		this.wasRecentlyIncorrect = false;
	}
}

class WordRecentlySeen {
	constructor(word, wasCorrect) {
		this.word = word;
		this.wasCorrect = wasCorrect;
	}
}

function findMinProb(currentWords) {
	let min = 2;
	for (let i = 0; i < currentWords.length; i++) {
		for (let j = 0; j < currentWords[i].length; j++) {
			min =
				currentWords[i][j].probability < min &&
				currentWords[i][j].probability != 0
					? currentWords[i][j].probability
					: min;
		}
	}
	return min;
}

function findMaxProb(currentWords) {
	let max = 0;
	for (let i = 0; i < currentWords.length; i++) {
		for (let j = 0; j < currentWords[i].length; j++) {
			max =
				currentWords[i][j].probability > max
					? currentWords[i][j].probability
					: max;
		}
	}
	return max;
}

function normalizeProbabilities(currentWords) {
	let totalProbability = 0;
	// get total of probabilities
	for (let i = 0; i < currentWords.length; i++) {
		for (let j = 0; j < currentWords[i].length; j++) {
			totalProbability += currentWords[i][j].probability;
		}
	}

	// normalize
	for (let i = 0; i < currentWords.length; i++) {
		for (let j = 0; j < currentWords[i].length; j++) {
			currentWords[i][j].probability /= totalProbability;
		}
	}
}

function setAllProbabilitiesToValue(currentWords, value) {
	for (let i = 0; i < currentWords.length; i++) {
		for (let j = 0; j < currentWords[i].length; j++) {
			currentWords[i][j].probability = value;
		}
	}
}

// Sets all of the probabilities to the same normalized value
function equalizeProbabilities(currentWords) {
	setAllProbabilitiesToValue(currentWords, 1);

	// Now that all of the probabilities are equal,
	// normalize them so together they all add up to 1.
	normalizeProbabilities(currentWords);
}

function updateProbabilites(
	currentWords,
	wordsRecentlySeenQueue,
	currentWord,
	currentWordWasCorrect
) {
	const roundsToWait = 2;

	// If the number of current verb + adjective conjugations is less than roundsToWait + 1,
	// the pool of conjugations is too small for our wordsRecentlySeenQueue to work.
	if (currentWords[0].length + currentWords[1].length < roundsToWait + 1) {
		// Set all probabilities except the current word to be equal to avoid getting the same question twice
		setAllProbabilitiesToValue(currentWords, 1);
		currentWord.probability = 0;
		normalizeProbabilities(currentWords);
		return;
	}

	// Lower probability of running into words in the same group
	if (currentWord.wordJSON.group) {
		const currentConjugation = currentWord.conjugation;
		const group = currentWord.wordJSON.group;

		currentWords[
			getPartOfSpeech(currentWord.wordJSON) === PARTS_OF_SPEECH.verb ? 0 : 1
		]
			.filter((word) => {
				const conjugation = word.conjugation;
				// Only alter probabilities of the exact same conjugation for other words in the group
				return (
					word.wordJSON.group === group &&
					word !== currentWord &&
					conjugation.type === currentConjugation.type &&
					conjugation.affirmative === currentConjugation.affirmative &&
					conjugation.polite === currentConjugation.polite
				);
			})
			.forEach((word) => {
				// Have to be careful with lowering this too much, because it can affect findMinProb for other conjugations.
				// Also, lowering it by a lot will make all of these words appear in a cluster after all the other words have been seen.
				// Note that this is happening whether currentWordWasCorrect is true or false,
				// so if someone got currentWord wrong many times it would tank the probabilities in this forEach over time.
				word.probability /= 3;
			});
	}

	// We wait "roundsToWait" rounds to set the probability of questions.
	// This allows us to have a few rounds immediately after a question where it's guaranteed to not appear again,
	// followed by the ability to set a high probability for the question to show up immediately after that waiting period (if the answer was incorrect).
	if (wordsRecentlySeenQueue.length >= roundsToWait) {
		let dequeuedWord = wordsRecentlySeenQueue.shift();
		// Using findMinProb isn't a good solution because if you get one correct it's going to shrink the min prob a lot and affect future questions you get right or wrong.
		// In the future there should probably be a static probability given to corrects, incorrects, and unseens, where that probability slowly grows the longer the word hasn't been seen.
		let currentMinProb = findMinProb(currentWords);
		const correctProbModifier = 0.5;
		const incorrectProbModifier = 0.85;

		let newProbability;

		if (dequeuedWord.wasCorrect && !dequeuedWord.word.wasRecentlyIncorrect) {
			newProbability = currentMinProb * correctProbModifier;
		} else if (
			dequeuedWord.wasCorrect &&
			dequeuedWord.word.wasRecentlyIncorrect
		) {
			newProbability = currentMinProb * incorrectProbModifier;
			dequeuedWord.word.wasRecentlyIncorrect = false;
		} else if (!dequeuedWord.wasCorrect) {
			// Set to an arbitrary high number to (nearly) guarantee this question is asked next.
			newProbability = 10;
		}

		dequeuedWord.word.probability = newProbability;
	}

	// Keep track of misses so when the user finally gets it right,
	// we can still give it a higher probability of appearing again than
	// questions they got right on the first try.
	if (!currentWordWasCorrect) {
		currentWord.wasRecentlyIncorrect = true;
	}

	wordsRecentlySeenQueue.push(
		new WordRecentlySeen(currentWord, currentWordWasCorrect)
	);
	// Make sure the user will not see the current question until at least "roundsToWait" number of rounds
	currentWord.probability = 0;

	normalizeProbabilities(currentWords);
}

// returns 2D array [verbarray, adjarray]
function createWordList(JSONWords) {
	let wordList = createArrayOfArrays(JSONWords.length);

	for (let i = 0; i < JSONWords.length; i++) {
		for (let j = 0; j < JSONWords[i].length; j++) {
			let conjugations = getAllKoreanConjugations(JSONWords[i][j]);
			for (let k = 0; k < conjugations.length; k++) {
				wordList[i].push(new Word(JSONWords[i][j], conjugations[k]));
			}
		}
	}
	return wordList;
}

function pickRandomWord(wordList) {
	let random = Math.random();

	try {
		for (let i = 0; i < wordList.length; i++) {
			for (let j = 0; j < wordList[i].length; j++) {
				if (random < wordList[i][j].probability) {
					return wordList[i][j];
				}
				random -= wordList[i][j].probability;
			}
		}
		throw "no random word chosen";
	} catch (err) {
		console.error(err);
		return wordList[0][0];
	}
}

function addToScore(amount = 1, maxScoreObjects, maxScoreIndex) {
	if (amount == 0) {
		return;
	}
	let max = document.getElementById("max-streak-text");
	let current = document.getElementById("current-streak-text");

	if (parseInt(max.textContent) <= parseInt(current.textContent)) {
		let newAmount = parseInt(max.textContent) + amount;
		max.textContent = newAmount;
		if (
			!document
				.getElementById("max-streak")
				.classList.contains("display-none")
		) {
			max.classList.add("grow-animation");
		}

		maxScoreObjects[maxScoreIndex].score = newAmount;
		localStorage.setItem("maxScoreObjects", JSON.stringify(maxScoreObjects));
	}

	current.textContent = parseInt(current.textContent) + amount;
	if (
		!document
			.getElementById("current-streak")
			.classList.contains("display-none")
	) {
		current.classList.add("grow-animation");
	}
}

function typeToWordBoxColor(type) {
	switch (type) {
		case "u":
			return "rgb(255, 125, 0)";
		case "ru":
			return "rgb(5, 80, 245)";
		case "irv":
			return "gray";
		case "ira":
			return "gray";
		case "i":
			return "rgb(0, 180, 240)";
		case "na":
			return "rgb(143, 73, 40)";
	}
}

function updateStatusBoxes(word, entryText) {
	let statusBox = document.getElementById("status-box");
	toggleDisplayNone(statusBox, false);

	if (word.conjugation.validAnswers.some((e) => e == entryText)) {
		statusBox.style.background = "green";
		const subConjugationForm = getSubConjugationForm(word, entryText);
		document.getElementById("status-text").innerHTML = `Correct${
			subConjugationForm != null
				? '<span class="sub-conjugation-indicator">(' +
				  subConjugationForm +
				  ")</span>"
				: ""
		}<br>${entryText} ○`;
	} else {
		document.getElementById("verb-box").style.background = typeToWordBoxColor(
			word.wordJSON.type
		);
		toggleBackgroundNone(document.getElementById("verb-box"), false);
		changeVerbBoxFontColor("white");
		document.getElementById("verb-type").textContent = wordTypeToDisplayText(
			word.wordJSON.type
		);

		statusBox.style.background = "rgb(218, 5, 5)";
		// Assuming validAnswers[0] is the hiragana answer
		document.getElementById("status-text").innerHTML =
			(entryText == "" ? "_" : entryText) +
			" ×<br>" +
			word.conjugation.validAnswers[0] +
			" ○";
	}
}

// If this valid answer is in a non-standard form worth pointing out to the user,
// return a string containing that form's name.
// This applies to conjugation types that allow multiple correct answers for the same question,
// where the user may enter a correct answer without realizing why it was correct.
function getSubConjugationForm(word, validAnswer) {
	// const kanjiWord = toKanjiPlusHiragana(word.wordJSON.kanji);
	// const hiraganaWord = toHiragana(word.wordJSON.kanji);

	// // Check for potential "れる" short form
	// if (
	// 	word.conjugation.type === CONJUGATION_TYPES.potential &&
	// 	(word.wordJSON.type === "ru" || kanjiWord === "来る")
	// ) {
	// 	const shortFormStems = [];

	// 	shortFormStems.push(dropFinalLetter(kanjiWord) + "れ");
	// 	if (word.wordJSON.type === "ru") {
	// 		shortFormStems.push(dropFinalLetter(hiraganaWord) + "れ");
	// 	} else if (kanjiWord === "来る") {
	// 		shortFormStems.push("これ");
	// 	}

	// 	if (shortFormStems.some((stem) => validAnswer.startsWith(stem))) {
	// 		return "ら-omitted short form";
	// 	}
	// }

	return null;
}

// stored in array in local storage
export class MaxScoreObject {
	constructor(score, settings) {
		this.score = score;
		this.settings = settings;
	}
}

// Array index 0 = verbs, 1 = adjectives
// Stored in an array instead of object to make parsing faster. Upon reflection this was not worth it.
function initApp() {
	wordData = koreanWordData;
	console.log(wordData)
	new ConjugationApp([wordData.verbs, wordData.adjectives]);
}

class ConjugationApp {
	constructor(words) {
		const mainInput = document.getElementById("main-text-input");
		bind(mainInput);

		this.initState(words);

		mainInput.addEventListener("keydown", (e) => this.inputKeyPress(e));
		document
			.getElementById("options-button")
			.addEventListener("click", (e) => this.settingsButtonClicked(e));
		document
			.getElementById("options-form")
			.addEventListener("submit", (e) => this.backButtonClicked(e));

		document
			.getElementById("current-streak-text")
			.addEventListener("animationend", (e) => {
				document
					.getElementById("current-streak-text")
					.classList.remove(e.animationName);
			});
		document
			.getElementById("max-streak-text")
			.addEventListener("animationend", (e) => {
				document
					.getElementById("max-streak-text")
					.classList.remove(e.animationName);
			});

		document
			.getElementById("status-box")
			.addEventListener("animationend", (e) => {
				document
					.getElementById("status-box")
					.classList.remove(e.animationName);
			});

		document
			.getElementById("input-tooltip")
			.addEventListener("animationend", (e) => {
				document
					.getElementById("input-tooltip")
					.classList.remove(e.animationName);
			});

		document.addEventListener("keydown", this.onKeyDown.bind(this));
		document.addEventListener("touchend", this.onTouchEnd.bind(this));

		optionsMenuInit();
	}

	loadMainView() {
		this.state.activeScreen = SCREENS.question;
		document.getElementById("main-view").classList.add("question-screen");
		document.getElementById("main-view").classList.remove("results-screen");

		document
			.getElementById("input-tooltip")
			.classList.remove("tooltip-fade-animation");

		toggleDisplayNone(document.getElementById("press-any-key-text"), true);
		toggleDisplayNone(document.getElementById("status-box"), true);

		if (this.state.currentStreak0OnReset) {
			document.getElementById("current-streak-text").textContent = "0";
			this.state.currentStreak0OnReset = false;
		}

		if (this.state.loadWordOnReset) {
			this.state.currentWord = loadNewWord(this.state.currentWordList);
			this.state.loadWordOnReset = false;
		}

		// Furigana and translation may need to be hidden during the question screen
		showFurigana(
			this.state.settings.furigana,
			this.state.settings.furiganaTiming ===
				CONDITIONAL_UI_TIMINGS.onlyAfterAnswering
		);
		showTranslation(
			this.state.settings.translation,
			this.state.settings.translationTiming ===
				CONDITIONAL_UI_TIMINGS.onlyAfterAnswering
		);

		const mainInput = document.getElementById("main-text-input");
		mainInput.disabled = false;
		mainInput.value = "";
		if (!isTouch) {
			mainInput.focus();
		}
	}

	// Handle generic keydown events that aren't targeting a specific element
	onKeyDown(e) {
		let keyCode = e.keyCode ? e.keyCode : e.which;
		if (
			this.state.activeScreen === SCREENS.results &&
			keyCode == "13" &&
			document.activeElement.id !== "options-button"
		) {
			this.loadMainView();
		}
	}

	// Handle generic touchend events that aren't targeting a specific element
	onTouchEnd(e) {
		if (
			this.state.activeScreen === SCREENS.results &&
			e.target != document.getElementById("options-button")
		) {
			this.loadMainView();
		}
	}

	inputKeyPress(e) {
		let keyCode = e.keyCode ? e.keyCode : e.which;
		if (keyCode == "13") {
			e.stopPropagation();

			const mainInput = document.getElementById("main-text-input");
			let inputValue = mainInput.value;

			// const finalChar = inputValue[inputValue.length - 1];
			// switch (finalChar) {
			// 	// Set hanging n to ん
			// 	case "n":
			// 		inputValue = inputValue.replace(/n$/, "ん");
			// 		break;
			// 	// Remove hanging 。
			// 	case "。":
			// 		inputValue = inputValue.replace(/。$/, "");
			// }

			// if (!isJapanese(inputValue)) {
			// 	document
			// 		.getElementById("input-tooltip")
			// 		.classList.add("tooltip-fade-animation");
			// 	return;
			// } else {
			// 	document
			// 		.getElementById("input-tooltip")
			// 		.classList.remove("tooltip-fade-animation");
			// }

			this.state.activeScreen = SCREENS.results;
			document
				.getElementById("main-view")
				.classList.remove("question-screen");
			document.getElementById("main-view").classList.add("results-screen");

			mainInput.blur();
			updateStatusBoxes(this.state.currentWord, inputValue);
			// If the furigana or translation were made transparent during the question, make them visible now
			showFurigana(this.state.settings.furigana, false);
			showTranslation(this.state.settings.translation, false);

			// update probabilities before next word is chosen so don't choose same word
			const inputWasCorrect =
				this.state.currentWord.conjugation.validAnswers.some(
					(e) => e == inputValue
				);

			updateProbabilites(
				this.state.currentWordList,
				this.state.wordsRecentlySeenQueue,
				this.state.currentWord,
				inputWasCorrect
			);

			if (inputWasCorrect) {
				addToScore(1, this.state.maxScoreObjects, this.state.maxScoreIndex);
				this.state.currentStreak0OnReset = false;
			} else {
				this.state.currentStreak0OnReset = true;
			}
			this.state.loadWordOnReset = true;

			mainInput.disabled = true;
			toggleDisplayNone(
				document.getElementById("press-any-key-text"),
				false
			);

			mainInput.value = "";
		}
	}

	settingsButtonClicked(e) {
		this.state.activeScreen = SCREENS.settings;

		selectCheckboxesInUi(this.state.settings);
		showHideOptionsAndCheckErrors();

		toggleDisplayNone(document.getElementById("main-view"), true);
		toggleDisplayNone(document.getElementById("options-view"), false);
		toggleDisplayNone(document.getElementById("donation-section"), false);
	}

	backButtonClicked(e) {
		e.preventDefault();

		insertSettingsFromUi(this.state.settings);
		localStorage.setItem("settings", JSON.stringify(this.state.settings));

		const visibleConjugationSettings = getVisibleConjugationSettings();
		let newMaxScoreIndex = findMaxScoreIndex(
			this.state.maxScoreObjects,
			visibleConjugationSettings
		);

		if (newMaxScoreIndex === -1) {
			this.state.maxScoreObjects.push(
				new MaxScoreObject(0, visibleConjugationSettings)
			);
			localStorage.setItem(
				"maxScoreObjects",
				JSON.stringify(this.state.maxScoreObjects)
			);
			newMaxScoreIndex = this.state.maxScoreObjects.length - 1;
		}

		if (newMaxScoreIndex !== this.state.maxScoreIndex) {
			localStorage.setItem("maxScoreIndex", newMaxScoreIndex);
			this.state.maxScoreIndex = newMaxScoreIndex;
			this.state.currentStreak0OnReset = true;
			this.state.loadWordOnReset = true;

			this.applySettingsUpdateWordList();

			// Note that the wordsRecentlySeenQueue is not cleared.
			// This is intentional, so if the new word list happens to include the words you recently missed,
			// they still have the chance of appearing again in a couple of rounds to retry.
			// If currentWordList doesn't contain those words in the queue, they won't be chosen anyways so the queue probability logic silenty fails.
		} else {
			// If none of the conjugation settings were changed, don't reload the word list or reset the probabilities
			applyNonConjugationSettings(this.state.settings);
		}

		document.getElementById("max-streak-text").textContent =
			this.state.maxScoreObjects[this.state.maxScoreIndex].score;

		toggleDisplayNone(document.getElementById("main-view"), false);
		toggleDisplayNone(document.getElementById("options-view"), true);
		toggleDisplayNone(document.getElementById("donation-section"), true);

		this.loadMainView();
	}

	initState(words) {
		this.state = {};
		this.state.completeWordList = createWordList(words);

		if (
			!localStorage.getItem("maxScoreObjects") ||
			!localStorage.getItem("maxScoreIndex") ||
			!localStorage.getItem("settings")
		) {
			this.state.maxScoreIndex = 0;
			localStorage.setItem("maxScoreIndex", this.state.maxScoreIndex);

			this.state.settings = getDefaultSettings();
			localStorage.setItem("settings", JSON.stringify(this.state.settings));

			this.state.maxScoreObjects = [
				new MaxScoreObject(
					0,
					removeNonConjugationSettings(this.state.settings)
				),
			];
			localStorage.setItem(
				"maxScoreObjects",
				JSON.stringify(this.state.maxScoreObjects)
			);
		} else {
			this.state.maxScoreIndex = parseInt(
				localStorage.getItem("maxScoreIndex")
			);
			this.state.settings = Object.assign(
				getDefaultAdditiveSettings(),
				JSON.parse(localStorage.getItem("settings"))
			);
			this.state.maxScoreObjects = JSON.parse(
				localStorage.getItem("maxScoreObjects")
			);
		}

		this.applySettingsUpdateWordList();
		console.log(this.state.currentWordList)

		this.state.currentWord = loadNewWord(this.state.currentWordList);
		this.state.wordsRecentlySeenQueue = [];

		console.log(this.state.currentWord)
		
		this.state.currentStreak0OnReset = false;
		this.state.loadWordOnReset = false;

		document.getElementById("max-streak-text").textContent =
			this.state.maxScoreObjects[this.state.maxScoreIndex].score;

		this.loadMainView();
	}

	applySettingsUpdateWordList() {
		const filteredWords = applyAllSettingsFilterWords(
			this.state.settings,
			this.state.completeWordList
		);
		equalizeProbabilities(filteredWords);
		this.state.currentWordList = filteredWords;
	}
}

initApp();

// Keeping the top container hidden at the beginning prevents 1 frame of malformed UI being shown
toggleDisplayNone(document.getElementById("toppest-container"), false);
if (!isTouch) {
	document.getElementById("main-text-input").focus();
}
