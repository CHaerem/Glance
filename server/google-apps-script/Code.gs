const GITHUB_BASE_URL = "https://chaerem.github.io/Glance";

let cachedData = null; // Cache for Google Sheet data

/**
 * Convert a user-friendly name like "United States"
 * into a slug "united_states" for JSON / flag files.
 */
function toFlagSlug(name) {
	if (!name) return "";
	return name.trim().toLowerCase().replace(/\s+/g, "_");
}

function doGet(e) {
	const action = e.parameter.action;

	// Load data from the Google Sheet if not already cached
	if (!cachedData) cachedData = loadSheetData();

	if (action === "info" && e.parameter.flagId) {
		// e.parameter.flagId is the friendly name, e.g. "United States"
		return fetchFlagInfo(e.parameter.flagId);
	} else if (action === "nextFlag") {
		return fetchNextFlag();
	} else if (action === "flags" && e.parameter.flagId) {
		// e.parameter.flagId is the friendly name, e.g. "United States"
		return fetchFlagImage(e.parameter.flagId);
	} else if (action === "currentFlag") {
		return fetchCurrentFlag();
	} else if (action === "updateFlag") {
		// Server picks nextFlag or a random one, no param needed
		return updateCurrentFlag();
	} else if (action === "updateNextFlag") {
		const nextFlag = e.parameter.nextFlag;
		if (!nextFlag) {
			return ContentService.createTextOutput(
				JSON.stringify({ error: "nextFlag is missing" })
			).setMimeType(ContentService.MimeType.JSON);
		}
		return updateNextFlag({ nextFlag });
	} else {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "Invalid action" })
		).setMimeType(ContentService.MimeType.JSON);
	}
}

/**
 * Load all data from the "DisplayConfig" sheet (row 2, columns A & B).
 * A2 = currentFlag (friendly name), B2 = nextFlag (friendly name)
 */
function loadSheetData() {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");
	const data = sheet.getRange("A2:B2").getValues()[0];
	return { currentFlag: data[0], nextFlag: data[1] };
}

/**
 * Reads all friendly flags from the "Countries" sheet (column A).
 * For example, row 2 might have "United States", row 3 "Norway", etc.
 */
function getAllFlagsFromSheet() {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Countries");
	if (!sheet) return [];

	// Read all rows in column A
	const values = sheet.getRange("A1:A").getValues();
	// values is a 2D array like [[header], ["United States"], ["Norway"], ...]

	// If row 1 is a header, skip index=0
	return values.map((row) => row[0]).filter((flag, index) => flag && index > 0);
}

/** Pick a random friendly name from the "Countries" sheet. */
function pickRandomFlag() {
	const allFlags = getAllFlagsFromSheet();
	if (!allFlags.length) return "";
	const randomIndex = Math.floor(Math.random() * allFlags.length);
	return allFlags[randomIndex];
}

/**
 * Fetch metadata for a specific friendly name.
 * We convert friendlyName -> slug for the JSON file.
 * Then we overwrite metadata.country with the friendly name for display.
 */
function fetchFlagInfo(friendlyName) {
	const slug = toFlagSlug(friendlyName);
	const infoUrl = `${GITHUB_BASE_URL}/info/${slug}.json`;

	try {
		const response = UrlFetchApp.fetch(infoUrl);
		const metadata = JSON.parse(response.getContentText());
		// Overwrite or ensure "country" is the friendly name
		metadata.country = friendlyName;

		return ContentService.createTextOutput(
			JSON.stringify(metadata)
		).setMimeType(ContentService.MimeType.JSON);
	} catch (error) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "Metadata not found" })
		).setMimeType(ContentService.MimeType.JSON);
	}
}

/**
 * Provide the next flag with metadata and the correct slug-based image URL.
 */
function fetchNextFlag() {
	const { nextFlag } = cachedData || {};
	if (!nextFlag) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "No next flag set" })
		).setMimeType(ContentService.MimeType.JSON);
	}

	// Grab metadata for nextFlag (friendly name)
	const flagInfoResponse = fetchFlagInfo(nextFlag);
	const flagMetadata = JSON.parse(flagInfoResponse.getContent());

	// Generate slug-based image URL
	const slug = toFlagSlug(nextFlag);
	const flagUrl = `${GITHUB_BASE_URL}/flags/${slug}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({
			nextFlag,
			metadata: flagMetadata,
			flagUrl,
		})
	).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Fetch the currently displayed friendly name, metadata, and slug-based image URL.
 */
function fetchCurrentFlag() {
	const { currentFlag } = cachedData || {};
	if (!currentFlag) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "No current flag set" })
		).setMimeType(ContentService.MimeType.JSON);
	}

	// Grab metadata for currentFlag
	const infoResponse = fetchFlagInfo(currentFlag);
	const flagMetadata = JSON.parse(infoResponse.getContent());

	// Generate slug-based image URL
	const slug = toFlagSlug(currentFlag);
	const flagUrl = `${GITHUB_BASE_URL}/flags/${slug}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({
			currentFlag,
			metadata: flagMetadata,
			flagUrl,
		})
	).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Return the GitHub Pages URL for the flag image, given a friendly name.
 */
function fetchFlagImage(flagId) {
	const slug = toFlagSlug(flagId);
	const flagUrl = `${GITHUB_BASE_URL}/flags/${slug}.bmp`;
	return ContentService.createTextOutput(
		JSON.stringify({ flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update the current flag in the "DisplayConfig" sheet.
 * 1) If nextFlag is set (friendly name), use it as new currentFlag.
 * 2) If nextFlag is empty, pick a random from "Countries".
 * 3) Clear nextFlag after updating.
 */
function updateCurrentFlag() {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");

	if (!cachedData) cachedData = loadSheetData();
	let nextFlag = cachedData.nextFlag; // This is a friendly name or blank

	// If nextFlag is not set, pick a random
	if (!nextFlag) {
		nextFlag = pickRandomFlag();
		if (!nextFlag) {
			return ContentService.createTextOutput(
				JSON.stringify({
					status: "error",
					error: "No flags available in 'Countries' sheet.",
				})
			).setMimeType(ContentService.MimeType.JSON);
		}
	}

	// Write to DisplayConfig: currentFlag = nextFlag, nextFlag = ""
	sheet.getRange("A2").setValue(nextFlag);
	sheet.getRange("B2").setValue("");

	// Update our cache
	cachedData.currentFlag = nextFlag;
	cachedData.nextFlag = "";

	return ContentService.createTextOutput(
		JSON.stringify({ status: "success", currentFlag: nextFlag })
	).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Update the next flag (friendly name) in "DisplayConfig" sheet (cell B2).
 */
function updateNextFlag(data) {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");

	if (data.nextFlag) {
		sheet.getRange("B2").setValue(data.nextFlag); // Set nextFlag

		// Ensure cachedData is up-to-date
		if (!cachedData) cachedData = loadSheetData();
		cachedData.nextFlag = data.nextFlag;

		return ContentService.createTextOutput(
			JSON.stringify({ status: "success", nextFlag: data.nextFlag })
		).setMimeType(ContentService.MimeType.JSON);
	}

	return ContentService.createTextOutput(
		JSON.stringify({ status: "error", message: "Missing nextFlag" })
	).setMimeType(ContentService.MimeType.JSON);
}

/* ==============================
   Test Functions (optional)
   ============================== */
function testFetchFlagInfo() {
	// Example: "United States" in the sheet
	const response = fetchFlagInfo("United States");
	Logger.log("testFetchFlagInfo Response: " + response.getContent());
}

function testFetchNextFlag() {
	const response = fetchNextFlag();
	Logger.log("testFetchNextFlag Response: " + response.getContent());
}

function testFetchFlagImage() {
	const response = fetchFlagImage("Norway");
	Logger.log("testFetchFlagImage Response: " + response.getContent());
}

function testFetchCurrentFlag() {
	const response = fetchCurrentFlag();
	Logger.log("testFetchCurrentFlag Response: " + response.getContent());
}

function testUpdateCurrentFlag() {
	// This picks the existing nextFlag or a random one if nextFlag is empty
	const response = updateCurrentFlag();
	Logger.log("testUpdateCurrentFlag Response: " + response.getContent());
}

function testUpdateNextFlag() {
	// Example: set nextFlag to "Denmark"
	const data = { nextFlag: "Denmark" };
	const response = updateNextFlag(data);
	Logger.log("testUpdateNextFlag Response: " + response.getContent());
}

function superTest() {
	Logger.log("Starting Super Test...");

	try {
		Logger.log("Running testFetchFlagInfo...");
		testFetchFlagInfo();
		Logger.log("Test: Fetch Flag Info - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Flag Info - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchNextFlag...");
		testFetchNextFlag();
		Logger.log("Test: Fetch Next Flag - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Next Flag - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchFlagImage...");
		testFetchFlagImage();
		Logger.log("Test: Fetch Flag Image - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Flag Image - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchCurrentFlag...");
		testFetchCurrentFlag();
		Logger.log("Test: Fetch Current Flag - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Current Flag - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testUpdateCurrentFlag...");
		testUpdateCurrentFlag();
		Logger.log("Test: Update Current Flag - Passed");
	} catch (error) {
		Logger.log("Test: Update Current Flag - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testUpdateNextFlag...");
		testUpdateNextFlag();
		Logger.log("Test: Update Next Flag - Passed");
	} catch (error) {
		Logger.log("Test: Update Next Flag - Failed");
		Logger.log("Error: " + error.message);
	}

	Logger.log("Super Test Completed.");
}
