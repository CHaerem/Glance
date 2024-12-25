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
		currentFlagImgElement.src = data.flagUrl;
		currentFlagImgElement.alt = data.metadata?.country || "Flag";
	} catch (error) {
		console.error("Error loading current flag:", error);
		document.getElementById("current-flag").textContent =
			"We encountered a problem loading the current flag.";
	}
}

// Fetch and display the *extended info* for the currently displayed flag
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
			flagImgElem.src = data.flagUrl;
			flagImgElem.alt = metadata.country || "Flag";
		}

		// Extended details (from data.metadata)
		if (document.getElementById("official-name")) {
			document.getElementById("official-name").textContent =
				metadata.official_name || "N/A";
		}
		if (document.getElementById("population")) {
			document.getElementById("population").textContent =
				metadata.population?.toLocaleString() || "N/A";
		}
		if (document.getElementById("area")) {
			document.getElementById("area").textContent =
				metadata.area?.toLocaleString() || "N/A";
		}
		if (document.getElementById("capital")) {
			document.getElementById("capital").textContent =
				metadata.capital || "N/A";
		}
		if (document.getElementById("region")) {
			document.getElementById("region").textContent = metadata.region || "N/A";
		}
		if (document.getElementById("subregion")) {
			document.getElementById("subregion").textContent =
				metadata.subregion || "N/A";
		}
		if (document.getElementById("languages")) {
			document.getElementById("languages").textContent =
				metadata.languages || "N/A";
		}
		if (document.getElementById("currencies")) {
			document.getElementById("currencies").textContent =
				metadata.currencies || "N/A";
		}
		if (document.getElementById("timezones")) {
			document.getElementById("timezones").textContent =
				metadata.timezones || "N/A";
		}
		if (document.getElementById("borders")) {
			document.getElementById("borders").textContent =
				metadata.borders || "N/A";
		}
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
	console.log(
		"Sending request to:",
		`${API_URL}?action=updateFlag&currentFlag=${encodeURIComponent(
			nextFlagForRequest
		)}`
	);
	try {
		const response = await fetch(
			`${API_URL}?action=updateFlag&currentFlag=${encodeURIComponent(
				nextFlagForRequest
			)}`
		);
		if (!response.ok) throw new Error("Failed to set next flag");
		const result = await response.json();

		nextFlagStatus.textContent =
			result.status === "success"
				? "Next flag updated successfully!"
				: `Failed to update the next flag: ${result.error || "Unknown error"}`;
		if (result.status === "success") {
			location.reload();
		}
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
	// If there's an element with ID "current-flag", assume we're on the main page:
	if (document.getElementById("current-flag")) {
		await loadCurrentFlag();
	}

	// If there's a button to set the next flag, wire it up:
	if (document.getElementById("set-next-flag")) {
		document
			.getElementById("set-next-flag")
			.addEventListener("click", setNextFlag);
	}

	// If there's a datalist for countries, load them:
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

	// If there's an element with ID "country-name", assume we're on the info page:
	if (document.getElementById("country-name")) {
		await loadCurrentFlagInfo();
	}
});
