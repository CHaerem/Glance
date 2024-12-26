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
   Fetch and display both current and next flags
------------------------------------ */
async function loadBothFlags() {
	console.log("Fetching both current and next flags...");
	try {
		const response = await fetch(`${API_URL}?action=bothFlags`);
		const data = await response.json();

		// Handle Current Flag
		const currentFlagEl = document.getElementById("current-flag");
		const currentFlagImg = document.getElementById("current-flag-img");

		if (data.current && data.current.friendlyName) {
			currentFlagEl.textContent = data.current.friendlyName;
			currentFlagImg.src = data.current.flagUrl
				? data.current.flagUrl.replace(".bmp", ".svg")
				: "";
			currentFlagImg.alt = data.current.metadata?.country || "Flag";
			currentFlagImg.style.display = data.current.flagUrl ? "" : "none";
		} else if (data.current && data.current.error) {
			currentFlagEl.textContent = data.current.error;
			currentFlagImg.style.display = "none";
		} else {
			currentFlagEl.textContent = "No current flag set.";
			currentFlagImg.style.display = "none";
		}

		// Handle Next Flag
		const nextFlagEl = document.getElementById("next-flag");
		const nextFlagImg = document.getElementById("next-flag-img");

		if (data.next && data.next.friendlyName) {
			nextFlagEl.textContent = data.next.friendlyName;
			nextFlagImg.src = data.next.flagUrl
				? data.next.flagUrl.replace(".bmp", ".svg")
				: "";
			nextFlagImg.alt = data.next.metadata?.country || "Flag";
			nextFlagImg.style.display = data.next.flagUrl ? "" : "none";
		} else if (data.next && data.next.error) {
			nextFlagEl.textContent = data.next.error;
			nextFlagImg.style.display = "none";
		} else {
			nextFlagEl.textContent = "No next flag set.";
			nextFlagImg.style.display = "none";
		}
	} catch (error) {
		console.error("Error fetching both flags:", error);
		showToast("Failed to load flags. Please try again later.", "error");
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
			// Refresh both flags
			await loadBothFlags();
		} else {
			showToast(`Update failed: ${result.error || "Unknown error"}`, "error");
		}
	} catch (error) {
		console.error("Error updating current flag:", error);
		showToast("We encountered a problem updating the current flag.", "error");
	}
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
			// Refresh both flags
			await loadBothFlags();
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

	// Create wrapper for input and icon
	const inputWrapper = document.createElement("div");
	inputWrapper.className = "input-with-flag";
	input.parentNode.insertBefore(inputWrapper, input);
	inputWrapper.appendChild(input);

	// Create flag icon element
	const selectedFlagIcon = document.createElement("img");
	selectedFlagIcon.className = "selected-flag-icon";
	selectedFlagIcon.style.display = "none";
	inputWrapper.appendChild(selectedFlagIcon);

	const suggestionsContainer = document.createElement("div");
	suggestionsContainer.id = "suggestions-container";
	inputWrapper.appendChild(suggestionsContainer);

	// Update flag icon when input changes
	function updateSelectedFlag(countryName) {
		if (countryName && countries.includes(countryName)) {
			const flagFilename = countryName.toLowerCase().replace(/\s+/g, "_");
			selectedFlagIcon.src = `flags/${flagFilename}.svg`;
			selectedFlagIcon.style.display = "block";
		} else {
			selectedFlagIcon.style.display = "none";
		}
	}

	// Hide datalist as we'll use custom suggestions
	datalist.style.display = "none";

	input.addEventListener("input", () => {
		const value = input.value.toLowerCase();
		suggestionsContainer.innerHTML = "";
		updateSelectedFlag(input.value.trim());

		const matches = countries
			.filter((country) => country.toLowerCase().startsWith(value))
			.slice(0, 10); // Limit to 10 suggestions

		if (matches.length > 0 && value) {
			suggestionsContainer.style.display = "block";
			matches.forEach((match) => {
				const suggestion = document.createElement("div");
				suggestion.className = "suggestion-item";

				// Convert spaces to underscores for the filename
				const flagFilename = match.toLowerCase().replace(/\s+/g, "_");
				const flagUrl = `flags/${flagFilename}.svg`;

				suggestion.innerHTML = `
                    <img src="${flagUrl}" alt="" class="suggestion-flag">
                    <span>${match}</span>
                `;

				suggestion.addEventListener("click", () => {
					input.value = match;
					updateSelectedFlag(match);
					suggestionsContainer.style.display = "none";
				});

				suggestionsContainer.appendChild(suggestion);
			});
		} else {
			suggestionsContainer.style.display = "none";
		}
	});

	// Close suggestions when clicking outside
	document.addEventListener("click", (e) => {
		if (!suggestionsContainer.contains(e.target) && e.target !== input) {
			suggestionsContainer.style.display = "none";
		}
	});
}

/* ---------------------------------------
   Initialize page logic on DOMContentLoaded
---------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
	// Load both current and next flags
	await loadBothFlags();

	// Attach click listeners for enlarged images
	const currentFlagImg = document.getElementById("current-flag-img");
	const nextFlagImg = document.getElementById("next-flag-img");

	currentFlagImg?.addEventListener("click", () => {
		if (currentFlagImg.src) showEnlargedImage(currentFlagImg.src);
	});
	nextFlagImg?.addEventListener("click", () => {
		if (nextFlagImg.src) showEnlargedImage(nextFlagImg.src);
	});

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
