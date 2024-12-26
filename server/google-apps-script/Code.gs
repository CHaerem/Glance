const GITHUB_BASE_URL = "https://chaerem.github.io/Glance";

let cachedData = null; // Cache for Google Sheet data

function doGet(e) {
	const action = e.parameter.action;

	// Load data from the Google Sheet if not already cached
	if (!cachedData) cachedData = loadSheetData();

	if (action === "info" && e.parameter.flagId) {
		return fetchFlagInfo(e.parameter.flagId);
	} else if (action === "nextFlag") {
		return fetchNextFlag();
	} else if (action === "flags" && e.parameter.flagId) {
		return fetchFlagImage(e.parameter.flagId);
	} else if (action === "currentFlag") {
		return fetchCurrentFlag();
	} else if (action === "updateFlag") {
		const currentFlag = e.parameter.currentFlag;
		if (!currentFlag) {
			return ContentService.createTextOutput(
				JSON.stringify({ error: "currentFlag is missing" })
			).setMimeType(ContentService.MimeType.JSON);
		}
		return updateCurrentFlag({ currentFlag });
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

// Load all data from the Google Sheet at once
function loadSheetData() {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");
	const data = sheet.getRange("A2:B2").getValues()[0];
	return { currentFlag: data[0], nextFlag: data[1] };
}

// Fetch metadata for a specific flag
function fetchFlagInfo(flagId) {
	const infoUrl = `${GITHUB_BASE_URL}/info/${flagId}.json`;

	try {
		const response = UrlFetchApp.fetch(infoUrl);
		const metadata = JSON.parse(response.getContentText());
		return ContentService.createTextOutput(
			JSON.stringify(metadata)
		).setMimeType(ContentService.MimeType.JSON);
	} catch (error) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "Metadata not found" })
		).setMimeType(ContentService.MimeType.JSON);
	}
}

// Provide the next flag with metadata and image URL
function fetchNextFlag() {
	const { nextFlag } = cachedData || {};
	if (!nextFlag) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "No next flag set" })
		).setMimeType(ContentService.MimeType.JSON);
	}

	const flagInfoResponse = fetchFlagInfo(nextFlag);
	const flagMetadata = JSON.parse(flagInfoResponse.getContent());
	const flagUrl = `${GITHUB_BASE_URL}/flags/${nextFlag}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({ nextFlag, metadata: flagMetadata, flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

// Fetch the currently displayed flag
function fetchCurrentFlag() {
	const { currentFlag } = cachedData || {};
	if (!currentFlag) {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "No current flag set" })
		).setMimeType(ContentService.MimeType.JSON);
	}

	const flagInfoResponse = fetchFlagInfo(currentFlag);
	const flagMetadata = JSON.parse(flagInfoResponse.getContent());
	const flagUrl = `${GITHUB_BASE_URL}/flags/${currentFlag}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({ currentFlag, metadata: flagMetadata, flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

// Fetch the GitHub Pages URL for the flag image
function fetchFlagImage(flagId) {
	const flagUrl = `${GITHUB_BASE_URL}/flags/${flagId}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({ flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

// Update the current flag
function updateCurrentFlag(data) {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");

	if (data.currentFlag) {
		sheet.getRange("A2").setValue(data.currentFlag);
		sheet.getRange("B2").setValue(""); // Clear the next flag

		// Ensure cachedData is initialized
		if (!cachedData) cachedData = loadSheetData();

		cachedData.currentFlag = data.currentFlag;
		cachedData.nextFlag = ""; // Sync cache

		return ContentService.createTextOutput(
			JSON.stringify({ status: "success", currentFlag: data.currentFlag })
		).setMimeType(ContentService.MimeType.JSON);
	}

	return ContentService.createTextOutput(
		JSON.stringify({ status: "error", message: "Missing currentFlag" })
	).setMimeType(ContentService.MimeType.JSON);
}

// Update the next flag
function updateNextFlag(data) {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");

	if (data.nextFlag) {
		sheet.getRange("B2").setValue(data.nextFlag); // Set the next flag

		// Ensure cachedData is initialized
		if (!cachedData) cachedData = loadSheetData();

		cachedData.nextFlag = data.nextFlag; // Sync cache

		return ContentService.createTextOutput(
			JSON.stringify({ status: "success", nextFlag: data.nextFlag })
		).setMimeType(ContentService.MimeType.JSON);
	}

	return ContentService.createTextOutput(
		JSON.stringify({ status: "error", message: "Missing nextFlag" })
	).setMimeType(ContentService.MimeType.JSON);
}

// Test Functions
function testFetchFlagInfo() {
	const response = fetchFlagInfo("norway");
	Logger.log("testFetchFlagInfo Response: " + response.getContent());
}

function testFetchNextFlag() {
	const response = fetchNextFlag();
	Logger.log("testFetchNextFlag Response: " + response.getContent());
}

function testFetchFlagImage() {
	const response = fetchFlagImage("norway");
	Logger.log("testFetchFlagImage Response: " + response.getContent());
}

function testFetchCurrentFlag() {
	const response = fetchCurrentFlag();
	Logger.log("testFetchCurrentFlag Response: " + response.getContent());
}

function testUpdateCurrentFlag() {
	const data = { currentFlag: "sweden" };
	const response = updateCurrentFlag(data);
	Logger.log("testUpdateCurrentFlag Response: " + response.getContent());
}

function testUpdateNextFlag() {
	const data = { nextFlag: "denmark" };
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
