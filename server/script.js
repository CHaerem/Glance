const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

let allCountries = [];

// Fetch and display the currently displayed flag
async function loadCurrentFlag() {
	console.log("Fetching current flag...");
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		const data = await response.json();

		const flagImg = document.getElementById("current-flag-img");
		if (data.error) {
			document.getElementById("current-flag").textContent = data.error;
			flagImg.style.display = "none"; // Hide the image
			return;
		}

		document.getElementById("current-flag").textContent =
			data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = ""; // Show the image if hidden
	} catch (error) {
		console.error("Error loading current flag:", error);
		document.getElementById("current-flag").textContent =
			"We encountered a problem loading the current flag.";
		document.getElementById("current-flag-img").style.display = "none"; // Hide the image
	}
}

// Fetch and display the next flag
async function loadNextFlag() {
	console.log("Fetching next flag...");
	try {
		const response = await fetch(`${API_URL}?action=nextFlag`);
		const data = await response.json();

		const flagImg = document.getElementById("next-flag-img");
		if (data.error) {
			document.getElementById("next-flag").textContent = data.error;
			flagImg.style.display = "none"; // Hide the image
			return;
		}

		document.getElementById("next-flag").textContent =
			data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = ""; // Show the image if hidden
	} catch (error) {
		console.error("Error loading next flag:", error);
		document.getElementById("next-flag").textContent =
			"We encountered a problem loading the next flag.";
		document.getElementById("next-flag-img").style.display = "none"; // Hide the image
	}
}

// Update the current flag with the next flag
async function updateCurrentFlag() {
	const statusElement = document.getElementById("update-current-status");
	try {
		console.log("Fetching next flag to update current flag...");
		const response = await fetch(`${API_URL}?action=nextFlag`);
		const data = await response.json();

		if (data.error) {
			statusElement.textContent = data.error;
			return;
		}

		const updateResponse = await fetch(
			`${API_URL}?action=updateFlag&currentFlag=${encodeURIComponent(
				data.nextFlag
			)}`
		);
		const result = await updateResponse.json();

		statusElement.textContent =
			result.status === "success"
				? "Current flag updated successfully!"
				: `Update failed: ${result.error || "Unknown error"}`;
		if (result.status === "success") {
			await loadCurrentFlag();
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
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		const metadata = data.metadata || {};

		// Update UI with metadata
		updateFlagDetails(metadata);

		// Update flag image
		const flagImg = document.getElementById("flag-img");
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = metadata.country || "Flag";
		flagImg.style.display = ""; // Show the image if hidden
	} catch (error) {
		console.error("Error fetching detailed flag info:", error);
		document.getElementById("flag-img").style.display = "none"; // Hide the image
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
		if (element)
			element.textContent = metadata[field.replace("-", "_")] || "N/A";
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

	console.log(`Setting next flag to: ${userInput}`);
	try {
		const response = await fetch(
			`${API_URL}?action=updateNextFlag&nextFlag=${encodeURIComponent(
				userInput
			)}`
		);
		const result = await response.json();

		nextFlagStatus.textContent =
			result.status === "success"
				? "Next flag updated successfully!"
				: `Failed to update next flag: ${result.error || "Unknown error"}`;
		await loadNextFlag(); // Refresh the next flag display
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
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
	await loadCurrentFlag();
	await loadNextFlag();

	document
		.getElementById("update-current-flag")
		?.addEventListener("click", updateCurrentFlag);
	document
		.getElementById("set-next-flag")
		?.addEventListener("click", setNextFlag);

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
