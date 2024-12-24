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

// Load current flag metadata for info.html
async function loadFlagInfo() {
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) throw new Error("Failed to fetch flag info");
		const data = await response.json();

		// Populate flag info page
		document.getElementById("country-name").textContent =
			data.metadata?.country || "Unknown";
		document.getElementById("flag-img").src = data.flagUrl;
		document.getElementById("flag-img").alt = data.metadata?.country || "Flag";
		document.getElementById("flag-info").innerHTML = `
      <p><strong>Official Name:</strong> ${
				data.metadata?.official_name || "Unknown"
			}</p>
      <p><strong>Population:</strong> ${
				data.metadata?.population?.toLocaleString() || "Unknown"
			}</p>
      <p><strong>Area:</strong> ${
				data.metadata?.area?.toLocaleString() || "Unknown"
			} km²</p>
      <p><strong>Capital:</strong> ${data.metadata?.capital || "Unknown"}</p>
    `;
	} catch (error) {
		console.error("Error loading flag info:", error);
		document.getElementById("flag-info").textContent =
			"We encountered a problem loading the flag details. Please try again.";
	}
}

// Initialize page logic
document.addEventListener("DOMContentLoaded", () => {
	if (document.getElementById("current-flag")) {
		loadCurrentFlag();
	}
	if (document.getElementById("set-next-flag")) {
		document
			.getElementById("set-next-flag")
			.addEventListener("click", setNextFlag);
	}
	if (document.getElementById("flag-info")) {
		loadFlagInfo();
	}
});
