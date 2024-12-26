const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

let allCountries = [];

// Fetch and display the currently displayed flag (basic)
async function loadCurrentFlag() {
	console.log("Sending request to:", `${API_URL}?action=currentFlag`);
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		const currentFlagElement = document.getElementById("current-flag");
		const currentFlagImgElement = document.getElementById("current-flag-img");

		currentFlagElement.textContent = data.metadata?.country || "Unknown";
		currentFlagImgElement.src = data.flagUrl.replace(".bmp", ".svg"); // Change to SVG URL
		currentFlagImgElement.alt = data.metadata?.country || "Flag";
	} catch (error) {
		console.error("Error loading current flag:", error);
		document.getElementById("current-flag").textContent =
			"We encountered a problem loading the current flag.";
	}
}

// Fetch and display the next flag
async function loadNextFlag() {
	console.log("Sending request to:", `${API_URL}?action=nextFlag`);
	try {
		const response = await fetch(`${API_URL}?action=nextFlag`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		const nextFlagElement = document.getElementById("next-flag");
		const nextFlagImgElement = document.getElementById("next-flag-img");

		nextFlagElement.textContent = data.metadata?.country || "Unknown";
		nextFlagImgElement.src = data.flagUrl.replace(".bmp", ".svg"); // Change to SVG URL
		nextFlagImgElement.alt = data.metadata?.country || "Flag";
	} catch (error) {
		console.error("Error loading next flag:", error);
		document.getElementById("next-flag").textContent =
			"We encountered a problem loading the next flag.";
	}
}

// Update the current flag to match the next flag
async function updateCurrentFlag() {
	const updateStatus = document.getElementById("update-current-status");
	try {
		const response = await fetch(`${API_URL}?action=nextFlag`);
		if (!response.ok) throw new Error("Failed to fetch next flag");
		const data = await response.json();
		const nextFlag = data.nextFlag;

		const updateResponse = await fetch(
			`${API_URL}?action=updateFlag&currentFlag=${encodeURIComponent(nextFlag)}`
		);
		const result = await updateResponse.json();

		updateStatus.textContent =
			result.status === "success"
				? "Current flag updated successfully!"
				: `Failed to update current flag: ${result.error || "Unknown error"}`;
		if (result.status === "success") {
			await loadCurrentFlag();
		}
	} catch (error) {
		console.error("Error updating current flag:", error);
		updateStatus.textContent =
			"We encountered a problem updating the current flag. Please try again.";
	}
}

// Fetch and display the extended info for the currently displayed flag
async function loadCurrentFlagInfo() {
	console.log("Sending request to:", `${API_URL}?action=currentFlag`);
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		const metadata = data.metadata || {};

		// Basic info
		const nameElem = document.querySelector("header h1");
		const flagImgElem = document.getElementById("flag-img");
		const titleElem = document.getElementById("page-title");
		if (nameElem) nameElem.textContent = metadata.country || "Unknown";
		if (titleElem) titleElem.textContent = metadata.country || "Loading...";
		if (flagImgElem) {
			flagImgElem.src = data.flagUrl.replace(".bmp", ".svg"); // Change to SVG URL
			flagImgElem.alt = metadata.country || "Flag";
		}

		// Extended details (from data.metadata)
		updateFlagDetails(metadata);
	} catch (error) {
		console.error("Error loading current flag info:", error);
		if (document.querySelector("header h1")) {
			document.querySelector("header h1").textContent = "Error loading data.";
		}
		if (document.getElementById("page-title")) {
			document.getElementById("page-title").textContent = "Error loading data.";
		}
	}
}

// Helper to update flag details
function updateFlagDetails(metadata) {
	const fields = [
		"official-name",
		"population",
		"area",
		"capital",
		"region",
		"subregion",
		"languages",
		"currencies",
		"timezones",
		"borders",
	];

	fields.forEach((field) => {
		const elem = document.getElementById(field);
		if (elem) elem.textContent = metadata[field.replace("-", "_")] || "N/A";
	});
}

// Set the next flag to display
async function setNextFlag() {
	const nextFlagInput = document.getElementById("next-flag-input");
	const nextFlagStatus = document.getElementById("next-flag-status");

	if (!nextFlagInput || !nextFlagStatus) return;

	const userInput = nextFlagInput.value.trim().toLowerCase();
	if (!userInput) {
		nextFlagStatus.textContent = "Please enter a valid flag ID.";
		return;
	}

	if (!allCountries.map((c) => c.toLowerCase()).includes(userInput)) {
		nextFlagStatus.textContent = "Invalid flag ID.";
		return;
	}

	const nextFlagForRequest = userInput.replace(/\s+/g, "_");
	console.log("Setting next flag to:", nextFlagForRequest);
	try {
		const response = await fetch(
			`${API_URL}?action=updateNextFlag&nextFlag=${encodeURIComponent(
				nextFlagForRequest
			)}`
		);
		const result = await response.json();

		nextFlagStatus.textContent =
			result.status === "success"
				? "Next flag updated successfully!"
				: `Failed to update the next flag: ${result.error || "Unknown error"}`;
	} catch (error) {
		console.error("Error setting next flag:", error);
		nextFlagStatus.textContent =
			"We encountered a problem updating the next flag. Please try again.";
	}
}

// Load the country list from a CSV file
async function loadCountryList(csvFilePath) {
	console.log("Fetching country list from:", csvFilePath);
	try {
		const response = await fetch(csvFilePath);
		if (!response.ok) throw new Error("Failed to load country list");
		const csvText = await response.text();
		return parseCSV(csvText);
	} catch (error) {
		console.error("Error loading country list:", error);
		return [];
	}
}

// Parse CSV into an array of country names
function parseCSV(csvText) {
	return csvText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line); // Remove empty lines
}

// Populate the datalist for country suggestions
function populateCountrySuggestions(inputId, datalistId, countries) {
	const input = document.getElementById(inputId);
	const datalist = document.getElementById(datalistId);
	if (!input || !datalist) return;

	input.addEventListener("input", () => {
		const value = input.value.toLowerCase();
		datalist.innerHTML = ""; // Clear old suggestions
		countries
			.filter((country) => country.toLowerCase().startsWith(value))
			.forEach((match) => {
				const option = document.createElement("option");
				option.value = match;
				datalist.appendChild(option);
			});
	});
}

// Initialize page logic
document.addEventListener("DOMContentLoaded", async () => {
	// Load the current flag
	if (document.getElementById("current-flag")) {
		await loadCurrentFlag();
	}

	// Load the next flag
	if (document.getElementById("next-flag")) {
		await loadNextFlag();
	}

	// Handle updating the current flag
	if (document.getElementById("update-current-flag")) {
		document
			.getElementById("update-current-flag")
			.addEventListener("click", updateCurrentFlag);
	}

	// Set the next flag
	if (document.getElementById("set-next-flag")) {
		document
			.getElementById("set-next-flag")
			.addEventListener("click", setNextFlag);
	}

	// Load the country suggestions
	if (
		document.getElementById("next-flag-input") &&
		document.getElementById("country-suggestions")
	) {
		allCountries = await loadCountryList("Countries_List.csv");
		populateCountrySuggestions(
			"next-flag-input",
			"country-suggestions",
			allCountries
		);
	}
});

function showEnlargedImage(src) {
	const container = document.createElement("div");
	container.classList.add("flag-img-container");

	const img = document.createElement("img");
	img.src = src;
	container.appendChild(img);

	const closeBtn = document.createElement("button");
	closeBtn.classList.add("close-btn");
	closeBtn.innerHTML = "&times;";
	closeBtn.addEventListener("click", () => {
		document.body.removeChild(container);
	});
	container.appendChild(closeBtn);

	container.addEventListener("click", (event) => {
		if (event.target === container) {
			document.body.removeChild(container);
		}
	});

	document.body.appendChild(container);
}
