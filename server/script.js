const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

let allCountries = [];

/* ----------------------------------
   Utility: Show Toast Notification
   type = "info" | "success" | "error"
------------------------------------ */
function showToast(message, type = "info") {
	// Create the toast container if it doesn't exist
	let toastContainer = document.getElementById("toast-container");
	if (!toastContainer) {
		toastContainer = document.createElement("div");
		toastContainer.id = "toast-container";
		document.body.appendChild(toastContainer);
	}

	// Create the toast element
	const toast = document.createElement("div");
	toast.classList.add("toast", `toast-${type}`);
	toast.textContent = message;
	toastContainer.appendChild(toast);

	// Fade out after 2s, remove after 3s
	setTimeout(() => toast.classList.add("fade"), 2000);
	setTimeout(() => {
		if (toastContainer.contains(toast)) {
			toastContainer.removeChild(toast);
		}
	}, 3000);
}

/* ----------------------------------
   Fetch and display the current flag
------------------------------------ */
async function loadCurrentFlag() {
	console.log("Fetching current flag...");
	const currentFlagEl = document.getElementById("current-flag");
	const flagImg = document.getElementById("current-flag-img");

	// Optionally, show a quick loading text
	currentFlagEl.textContent = "Loading current flag...";

	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		const data = await response.json();

		if (data.error) {
			currentFlagEl.textContent = data.error;
			flagImg.style.display = "none";
			return;
		}

		currentFlagEl.textContent = data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error loading current flag:", error);
		currentFlagEl.textContent =
			"We encountered a problem loading the current flag.";
		flagImg.style.display = "none";
	}
}

/* --------------------------------
   Fetch and display the next flag
---------------------------------- */
async function loadNextFlag() {
	console.log("Fetching next flag...");
	const nextFlagEl = document.getElementById("next-flag");
	const flagImg = document.getElementById("next-flag-img");

	nextFlagEl.textContent = "Loading next flag...";

	try {
		const response = await fetch(`${API_URL}?action=nextFlag`);
		const data = await response.json();

		if (data.error) {
			nextFlagEl.textContent = data.error;
			flagImg.style.display = "none";
			return;
		}

		nextFlagEl.textContent = data.metadata?.country || "Unknown";
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = data.metadata?.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error loading next flag:", error);
		nextFlagEl.textContent = "We encountered a problem loading the next flag.";
		flagImg.style.display = "none";
	}
}

/* -----------------------------------------
   Update the current flag (server picks next)
------------------------------------------- */
async function updateCurrentFlag() {
	showToast("Submitting update for current flag...", "info");
	try {
		console.log("Updating current flag...");
		const response = await fetch(`${API_URL}?action=updateFlag`);
		const result = await response.json();

		if (result.status === "success") {
			showToast("Current flag updated successfully!", "success");
			// Refresh current & next flags
			await loadCurrentFlag();
			await loadNextFlag();
		} else {
			showToast(`Update failed: ${result.error || "Unknown error"}`, "error");
		}
	} catch (error) {
		console.error("Error updating current flag:", error);
		showToast("We encountered a problem updating the current flag.", "error");
	}
}

/* ---------------------------------------
   Load extended info for the current flag
---------------------------------------- */
async function loadCurrentFlagInfo() {
	console.log("Fetching detailed current flag information...");
	// Optionally set placeholders in UI here, e.g. "Loading..."

	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		const metadata = data.metadata || {};

		updateFlagDetails(metadata);

		const flagImg = document.getElementById("flag-img");
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = metadata.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error fetching detailed flag info:", error);
		document.getElementById("flag-img").style.display = "none";
	}
}

/* ------------------------------------
   Helper: update extended flag details
-------------------------------------- */
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

/* ------------------------------------------
   Set the next flag to display (from input)
-------------------------------------------- */
async function setNextFlag() {
	const nextFlagInput = document.getElementById("next-flag-input");
	if (!nextFlagInput) return;

	const rawInput = nextFlagInput.value.trim();
	if (!rawInput) {
		showToast("Please enter a valid flag name.", "error");
		return;
	}

	// Convert to lower for case-insensitive matching
	const lowerInput = rawInput.toLowerCase();

	// Find the correct entry in your allCountries array
	const matchedCountry = allCountries.find(
		(c) => c.toLowerCase() === lowerInput
	);

	if (!matchedCountry) {
		showToast("Invalid flag name.", "error");
		return;
	}

	showToast("Submitting next flag...", "info");
	try {
		console.log(`Setting next flag to: ${matchedCountry}`);
		const response = await fetch(
			`${API_URL}?action=updateNextFlag&nextFlag=${encodeURIComponent(
				matchedCountry
			)}`
		);
		const result = await response.json();

		if (result.status === "success") {
			showToast("Next flag updated successfully!", "success");
			// Refresh the next flag display
			await loadNextFlag();
		} else {
			showToast(
				`Failed to update next flag: ${result.error || "Unknown error"}`,
				"error"
			);
		}
	} catch (error) {
		console.error("Error setting next flag:", error);
		showToast("Error updating next flag.", "error");
	}
}

/* -------------------------------------------
   Load a list of country names from a CSV file
-------------------------------------------- */
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

/* ------------------------------
   Parse CSV text into an array
------------------------------- */
function parseCSV(csvText) {
	return csvText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line);
}

/* -------------------------------------------
   Populate a <datalist> with country options
-------------------------------------------- */
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

/* ---------------------------------------
   Initialize page logic on DOMContentLoaded
---------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
	// Load current and next flags
	await loadCurrentFlag();
	await loadNextFlag();

	// Connect buttons to functions
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

/* -------------------------
   Show enlarged image logic
-------------------------- */
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
