const flagList = document.getElementById("flag-list");
const flagImg = document.getElementById("flag-img");
const flagDetails = document.getElementById("flag-details");
const backButton = document.getElementById("back-button");

const FLAGS_DIR = "./flags/";
const INFO_DIR = "./info/";

// Load and display the list of flags
async function loadFlagList() {
	try {
		const response = await fetch(`${INFO_DIR}index.json`);
		if (!response.ok) {
			throw new Error("Network response was not ok");
		}
		const flagFiles = await response.json();

		flagList.innerHTML = "";
		for (const file of flagFiles) {
			const countryId = file.replace(".json", "");
			const metadata = await fetch(`${INFO_DIR}${file}`)
				.then((res) => {
					if (!res.ok) throw new Error(`Failed to fetch metadata for ${file}`);
					return res.json();
				})
				.catch((error) => {
					console.error(error);
					return { country: "Unknown", official_name: "Unknown" }; // Default metadata
				});

			const flagItem = document.createElement("div");
			flagItem.className = "flag-item";
			flagItem.innerHTML = `
                <p>${metadata.country}</p>
                <img src="${FLAGS_DIR}${countryId}.bmp" alt="${metadata.country}">
            `;
			flagItem.addEventListener("click", () =>
				showFlagDetails(countryId, metadata)
			);
			flagList.appendChild(flagItem);
		}
	} catch (error) {
		console.error("Error loading flag list:", error);
	}
}

// Display a single flag's details
function showFlagDetails(countryId, metadata) {
	flagDetails.style.display = "block";
	flagList.style.display = "none";

	flagImg.src = `${FLAGS_DIR}${countryId}.bmp`;
	flagImg.alt = metadata.country;

	// Populate flag info
	const flagInfo = document.getElementById("flag-info");
	flagInfo.innerHTML = `
		<h2>${metadata.country}</h2>
		<p><strong>Official Name:</strong> ${metadata.official_name}</p>
		<p><strong>Population:</strong> ${metadata.population.toLocaleString()}</p>
		<p><strong>Area:</strong> ${metadata.area.toLocaleString()} km²</p>
		<p><strong>Capital:</strong> ${metadata.capital}</p>
		<p><strong>Region:</strong> ${metadata.region}</p>
		<p><strong>Subregion:</strong> ${metadata.subregion}</p>
		<p><strong>Languages:</strong> ${metadata.languages}</p>
		<p><strong>Currencies:</strong> ${metadata.currencies}</p>
		<p><strong>Timezones:</strong> ${metadata.timezones}</p>
		<p><strong>Borders:</strong> ${metadata.borders}</p>
	`;
}

backButton.addEventListener("click", () => {
	flagDetails.style.display = "none";
	flagList.style.display = "block";
});

// Call the function to load the flag list
loadFlagList();
