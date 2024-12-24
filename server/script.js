const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

// Fetch and display the currently displayed flag
async function loadCurrentFlag() {
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();

		// Populate the current flag section
		const currentFlagElement = document.getElementById("current-flag");
		const currentFlagImgElement = document.getElementById("current-flag-img");

		currentFlagElement.textContent = data.metadata?.country || "Unknown";
		currentFlagImgElement.src = data.flagUrl;
		currentFlagImgElement.alt = data.metadata?.country || "Flag";
	} catch (error) {
		console.error("Error loading current flag:", error);
		document.getElementById("current-flag").textContent =
			"We encountered a problem loading the current flag.";
	}
}

// Set the next flag to display
async function setNextFlag() {
	const nextFlagInput = document.getElementById("next-flag-input");
	const nextFlagStatus = document.getElementById("next-flag-status");

	if (!nextFlagInput || !nextFlagStatus) return;

	const nextFlag = nextFlagInput.value.trim();
	if (!nextFlag) {
		nextFlagStatus.textContent = "Please enter a valid flag ID.";
		return;
	}

	try {
		const response = await fetch(
			`${API_URL}?action=updateFlag&currentFlag=${encodeURIComponent(nextFlag)}`
		);

		if (!response.ok) throw new Error("Failed to set next flag");

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
	// Load current flag
	if (document.getElementById("current-flag")) {
		loadCurrentFlag();
	}

	// Set next flag
	if (document.getElementById("set-next-flag")) {
		document
			.getElementById("set-next-flag")
			.addEventListener("click", setNextFlag);
	}

	// Load country list and populate suggestions
	const countries = await loadCountryList("Countries_List.csv");
	populateCountrySuggestions(
		"next-flag-input",
		"country-suggestions",
		countries
	);
});
