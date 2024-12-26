const API_URL =
	"https://script.google.com/macros/s/AKfycbxDNyBtpCBSw9JTbFVYW5WR3xFYFd6TONTHQbtybg0ggTfxs95l38Wgg45YlB1i5W3-/exec";

/* ----------------------------------
   Utility: Show Toast Notification
   (if you still want to use them here)
------------------------------------ */
function showToast(message, type = "info") {
	let toastContainer = document.getElementById("toast-container");
	if (!toastContainer) {
		toastContainer = document.createElement("div");
		toastContainer.id = "toast-container";
		document.body.appendChild(toastContainer);
	}
	const toast = document.createElement("div");
	toast.classList.add("toast", `toast-${type}`);
	toast.textContent = message;
	toastContainer.appendChild(toast);

	setTimeout(() => toast.classList.add("fade"), 2000);
	setTimeout(() => {
		if (toastContainer.contains(toast)) {
			toastContainer.removeChild(toast);
		}
	}, 3000);
}

/* ---------------------------------------
   Fetch detailed info for the current flag
---------------------------------------- */
async function loadCurrentFlagInfo() {
	console.log("Fetching detailed current flag information...");
	try {
		const response = await fetch(`${API_URL}?action=currentFlag`);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		if (data.error) {
			showToast(`Error: ${data.error}`, "error");
			return;
		}
		const metadata = data.metadata || {};

		// Update UI fields
		updateFlagDetails(metadata);

		// Update the large flag image
		const flagImg = document.getElementById("flag-img");
		flagImg.src = data.flagUrl.replace(".bmp", ".svg");
		flagImg.alt = metadata.country || "Flag";
		flagImg.style.display = "";
	} catch (error) {
		console.error("Error fetching detailed flag info:", error);
		showToast("Error fetching flag info.", "error");
	}
}

/* ---------------------------
   Update extended flag details
---------------------------- */
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

/* ---------------------------------------
   On page load, fetch the current flag info
   and attach enlarge on click
---------------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
	await loadCurrentFlagInfo();

	// Attach enlarge click
	const flagImg = document.getElementById("flag-img");
	flagImg?.addEventListener("click", () => {
		if (flagImg.src) showEnlargedImage(flagImg.src);
	});
});
