const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

let allCountries = [];

// Fetch and display the currently displayed flag
async function loadCurrentFlag() {
	console.log("Fetching current flag...");
	// Show a quick textual loading indicator
	const currentFlagParagraph = document.getElementById("current-flag");
	currentFlagParagraph.textContent = "Loading current flag...";

	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		const data = await response.json();

		const flagImg = document.getElementById("current-flag-img");
		if (data.error) {
			currentFlagParagraph.textContent = data.error;
			flagImg.style.display = "none";
			return;
		}

		currentFlagParagraph.textContent = data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error loading current flag:", error);
		currentFlagParagraph.textContent =
			"We encountered a problem loading the current flag.";
		document.getElementById("current-flag-img").style.display = "none";
	}
}

// Fetch and display the next flag
async function loadNextFlag() {
	console.log("Fetching next flag...");
	// Show a quick textual loading indicator
	const nextFlagParagraph = document.getElementById("next-flag");
	nextFlagParagraph.textContent = "Loading next flag...";

	try {
		const response = await fetch(`${API_URL}?action=nextFlag`);
		const data = await response.json();

		const flagImg = document.getElementById("next-flag-img");
		if (data.error) {
			nextFlagParagraph.textContent = data.error;
			flagImg.style.display = "none";
			return;
		}

		nextFlagParagraph.textContent = data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error loading next flag:", error);
		nextFlagParagraph.textContent =
			"We encountered a problem loading the next flag.";
		document.getElementById("next-flag-img").style.display = "none";
	}
}

// Update the current flag, letting the server pick next or random
async function updateCurrentFlag() {
	const statusElement = document.getElementById("update-current-status");
	statusElement.textContent = "Submitting..."; // Show request in progress

	try {
		console.log("Updating current flag (server will pick next or random)...");
		const updateResponse = await fetch(`${API_URL}?action=updateFlag`);
		const result = await updateResponse.json();

		if (result.status === "success") {
			statusElement.textContent = "Current flag updated successfully!";
			// Refresh both, because the server will have cleared or changed next flag
			await loadCurrentFlag();
			await loadNextFlag();
		} else {
			statusElement.textContent = `Update failed: ${
				result.error || "Unknown error"
			}`;
		}
	} catch (error) {
		console.error("Error updating current flag:", error);
		statusElement.textContent =
			"We encountered a problem updating the current flag.";
	}
}

// Fetch and display extended information for the currently displayed flag
async function loadCurrentFlagInfo() {
	console.log("Fetching detailed current flag information...");
	// Optionally show a loading indicator on the details
	document.getElementById("official-name").textContent = "Loading...";
	// etc. for each detail if you like

	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		const metadata = data.metadata || {};

		// Update UI with metadata
		updateFlagDetails(metadata);

		// Update flag image
		const flagImg = document.getElementById("flag-img");
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = metadata.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error fetching detailed flag info:", error);
		document.getElementById("flag-img").style.display = "none";
	}
}

// Helper to update extended flag details in the UI
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
		const element = document.getElementById(field);
		if (element) {
			element.textContent = metadata[field.replace("-", "_")] || "N/A";
		}
	});
}

// Set the next flag to display
async function setNextFlag() {
	const nextFlagInput = document.getElementById("next-flag-input");
	const nextFlagStatus = document.getElementById("next-flag-status");

	if (!nextFlagInput || !nextFlagStatus) return;

	const rawInput = nextFlagInput.value.trim();
	if (!rawInput) {
		nextFlagStatus.textContent = "Please enter a valid flag name.";
		return;
	}

	// Convert to lower for case-insensitive matching
	const lowerInput = rawInput.toLowerCase();

	// Find the correct entry in your allCountries array
	// that matches ignoring case
	const matchedCountry = allCountries.find(
		(c) => c.toLowerCase() === lowerInput
	);

	if (!matchedCountry) {
		nextFlagStatus.textContent = "Invalid flag name.";
		return;
	}

	nextFlagStatus.textContent = "Submitting..."; // Indicate a request is in progress

	console.log(`Setting next flag to: ${matchedCountry}`);
	try {
		const response = await fetch(
			`${API_URL}?action=updateNextFlag&nextFlag=${encodeURIComponent(
				matchedCountry
			)}`
		);
		const result = await response.json();

		nextFlagStatus.textContent =
			result.status === "success"
				? "Next flag updated successfully!"
				: `Failed to update next flag: ${result.error || "Unknown error"}`;

		// Refresh the next flag display
		await loadNextFlag();
	} catch (error) {
		console.error("Error setting next flag:", error);
		nextFlagStatus.textContent = "Error updating next flag.";
	}
}

// Load a list of country names from a CSV file
async function loadCountryList(csvFilePath) {
	console.log(`Fetching country list from: ${csvFilePath}`);
	try {
		const response = await fetch(csvFilePath);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		return parseCSV(await response.text());
	} catch (error) {
		console.error("Error fetching country list:", error);
		return [];
	}
}

// Parse a CSV file into an array of strings
function parseCSV(csvText) {
	return csvText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line); // Remove empty lines
}

// Populate a datalist with country suggestions
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

// Initialize the page logic
document.addEventListener("DOMContentLoaded", async () => {
	// Load current and next flags
	await loadCurrentFlag();
	await loadNextFlag();

	// Wire up buttons
	document
		.getElementById("update-current-flag")
		?.addEventListener("click", updateCurrentFlag);
	document
		.getElementById("set-next-flag")
		?.addEventListener("click", setNextFlag);

	// If we have an input for next-flag plus a datalist, load countries from CSV
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

// Utility to show enlarged images
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
