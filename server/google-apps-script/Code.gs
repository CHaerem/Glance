const GITHUB_BASE_URL = "https://chaerem.github.io/Glance";

function doGet(e) {
	const action = e.parameter.action;
	const flagId = e.parameter.flagId;

	if (action === "info" && flagId) {
		return fetchFlagInfo(flagId);
	} else if (action === "nextFlag") {
		return fetchNextFlag();
	} else if (action === "flags" && flagId) {
		return fetchFlagImage(flagId);
	} else if (action === "currentFlag") {
		return fetchCurrentFlag();
	} else if (action === "updateFlag") {
		const currentFlag = e.parameter.currentFlag;
		if (!currentFlag) {
			return ContentService.createTextOutput(
				JSON.stringify({ error: "currentFlag is missing" })
			).setMimeType(ContentService.MimeType.JSON);
		}
		const response = updateCurrentFlag({ currentFlag });
		return ContentService.createTextOutput(response.getContent()).setMimeType(
			ContentService.MimeType.JSON
		);
	} else {
		return ContentService.createTextOutput(
			JSON.stringify({ error: "Invalid action" })
		).setMimeType(ContentService.MimeType.JSON);
	}
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
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");
	const nextFlag = sheet.getRange("B2").getValue() || "random";

	const flagInfoResponse = fetchFlagInfo(nextFlag);
	const flagMetadata = JSON.parse(flagInfoResponse.getContent());
	const flagUrl = `${GITHUB_BASE_URL}/flags/${nextFlag}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({ nextFlag, metadata: flagMetadata, flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

// Fetch the GitHub Pages URL for the flag image
function fetchFlagImage(flagId) {
	const flagUrl = `${GITHUB_BASE_URL}/flags/${flagId}.bmp`;

	return ContentService.createTextOutput(
		JSON.stringify({ flagUrl })
	).setMimeType(ContentService.MimeType.JSON);
}

// Fetch the currently displayed flag
function fetchCurrentFlag() {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");
	const currentFlag = sheet.getRange("A2").getValue();

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

// Update the current flag
function updateCurrentFlag(data) {
	const sheet =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DisplayConfig");

	if (data.currentFlag) {
		sheet.getRange("A2").setValue(data.currentFlag);
		sheet.getRange("B2").setValue(""); // Clear the next flag

		return ContentService.createTextOutput(
			JSON.stringify({ status: "success" })
		).setMimeType(ContentService.MimeType.JSON);
	}

	return ContentService.createTextOutput(
		JSON.stringify({ status: "error", message: "Missing currentFlag" })
	).setMimeType(ContentService.MimeType.JSON);
}

// Test Functions

function testDoGet() {
	const e = {
		parameter: {
			action: "info",
			flagId: "norway",
		},
	};
	const response = doGet(e);
	Logger.log(response.getContent());
}

function testFetchNextFlag() {
	const e = {
		parameter: {
			action: "nextFlag",
		},
	};
	const response = doGet(e);
	Logger.log(response.getContent());
}

function testFetchFlagImage() {
	const e = {
		parameter: {
			action: "flags",
			flagId: "norway",
		},
	};
	const response = doGet(e);
	Logger.log(response.getContent());
}

function testFetchCurrentFlag() {
	const e = {
		parameter: {
			action: "currentFlag",
		},
	};
	const response = doGet(e);
	Logger.log(response.getContent());
}

function testUpdateFlag() {
	const e = {
		parameter: {
			action: "updateFlag",
			currentFlag: "sweden",
		},
	};
	const response = doGet(e);
	Logger.log(response.getContent());
}

function superTest() {
	Logger.log("Starting Super Test...");

	try {
		Logger.log("Running testDoGet...");
		testDoGet();
		Logger.log("Test: Fetch Flag Info (doGet) - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Flag Info (doGet) - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchNextFlag...");
		testFetchNextFlag();
		Logger.log("Test: Fetch Next Flag (doGet) - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Next Flag (doGet) - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchFlagImage...");
		testFetchFlagImage();
		Logger.log("Test: Fetch Flag Image (doGet) - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Flag Image (doGet) - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testFetchCurrentFlag...");
		testFetchCurrentFlag();
		Logger.log("Test: Fetch Current Flag (doGet) - Passed");
	} catch (error) {
		Logger.log("Test: Fetch Current Flag (doGet) - Failed");
		Logger.log("Error: " + error.message);
	}

	try {
		Logger.log("Running testUpdateFlag...");
		testUpdateFlag();
		Logger.log("Test: Update Flag (doGet) - Passed");
	} catch (error) {
		Logger.log("Test: Update Flag (doGet) - Failed");
		Logger.log("Error: " + error.message);
	}

	Logger.log("Super Test Completed.");
}
