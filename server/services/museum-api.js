/**
 * Museum API Service
 * Handles searching across multiple museum APIs for artwork
 */

const statistics = require("./statistics");

// Curated Art Collections Database
const CURATED_COLLECTIONS = {
	"renaissance-masters": {
		name: "Renaissance Masters",
		description: "Essential works from the Renaissance masters",
		artworks: [
			{ artist: "Leonardo da Vinci", title: "Mona Lisa", year: "1503-1519", popularity: 100, wikimedia: "Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg" },
			{ artist: "Leonardo da Vinci", title: "The Last Supper", year: "1495-1498", popularity: 95, wikimedia: "The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg" },
			{ artist: "Leonardo da Vinci", title: "Vitruvian Man", year: "1490", popularity: 90, wikimedia: "Da_Vinci_Vitruve_Luc_Viatour.jpg" },
			{ artist: "Leonardo da Vinci", title: "Lady with an Ermine", year: "1489-1491", popularity: 85, wikimedia: "Leonardo_da_Vinci_046.jpg" },
			{ artist: "Michelangelo", title: "The Creation of Adam", year: "1512", popularity: 98, wikimedia: "Michelangelo_-_Creation_of_Adam_(cropped).jpg" },
			{ artist: "Michelangelo", title: "The Last Judgment", year: "1541", popularity: 88, wikimedia: "Last_Judgement_(Michelangelo).jpg" },
			{ artist: "Michelangelo", title: "Doni Tondo", year: "1507", popularity: 70, wikimedia: "Michelangelo_-_Tondo_Doni_-_Google_Art_Project.jpg" },
			{ artist: "Raphael", title: "The School of Athens", year: "1511", popularity: 92, wikimedia: "Raphael_School_of_Athens.jpg" },
			{ artist: "Raphael", title: "Sistine Madonna", year: "1512", popularity: 82, wikimedia: "Raphael_-_Sistine_Madonna_-_WGA18595.jpg" },
			{ artist: "Raphael", title: "The Transfiguration", year: "1520", popularity: 75, wikimedia: "Transfiguration_Raphael.jpg" },
			{ artist: "Botticelli", title: "The Birth of Venus", year: "1485", popularity: 93, wikimedia: "Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg" },
			{ artist: "Botticelli", title: "Primavera", year: "1482", popularity: 86, wikimedia: "Sandro_Botticelli_-_La_Primavera_-_Google_Art_Project.jpg" }
		]
	},
	"dutch-masters": {
		name: "Dutch Masters",
		description: "Golden Age of Dutch painting",
		artworks: [
			{ artist: "Rembrandt", title: "The Night Watch", year: "1642", popularity: 94, wikimedia: "La_ronda_de_noche,_por_Rembrandt_van_Rijn.jpg" },
			{ artist: "Rembrandt", title: "Self-Portrait", year: "1659", popularity: 78, wikimedia: "Rembrandt_van_Rijn_-_Self-Portrait_-_Google_Art_Project.jpg" },
			{ artist: "Rembrandt", title: "The Anatomy Lesson", year: "1632", popularity: 76, wikimedia: "Rembrandt_-_The_Anatomy_Lesson_of_Dr_Nicolaes_Tulp.jpg" },
			{ artist: "Vermeer", title: "Girl with a Pearl Earring", year: "1665", popularity: 96, wikimedia: "Girl_with_a_Pearl_Earring.jpg" },
			{ artist: "Vermeer", title: "The Milkmaid", year: "1658", popularity: 84, wikimedia: "Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg" },
			{ artist: "Vermeer", title: "View of Delft", year: "1661", popularity: 80, wikimedia: "Vermeer-view-of-delft.jpg" }
		]
	},
	"impressionists": {
		name: "Impressionists",
		description: "Light and color of the Impressionist movement",
		artworks: [
			{ artist: "Claude Monet", title: "Water Lilies", year: "1906", popularity: 91, wikimedia: "Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg" },
			{ artist: "Claude Monet", title: "Impression, Sunrise", year: "1872", popularity: 89, wikimedia: "Monet_-_Impression,_Sunrise.jpg" },
			{ artist: "Claude Monet", title: "Woman with a Parasol", year: "1875", popularity: 83, wikimedia: "Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg" },
			{ artist: "Renoir", title: "Dance at Le Moulin de la Galette", year: "1876", popularity: 87, wikimedia: "Auguste_Renoir_-_Dance_at_Le_Moulin_de_la_Galette_-_Google_Art_Project.jpg" },
			{ artist: "Renoir", title: "Luncheon of the Boating Party", year: "1881", popularity: 82, wikimedia: "Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg" },
			{ artist: "Edgar Degas", title: "The Dance Class", year: "1874", popularity: 79, wikimedia: "Edgar_Degas_-_The_Dance_Class_-_Google_Art_Project.jpg" },
			{ artist: "Edgar Degas", title: "L'Absinthe", year: "1876", popularity: 74, wikimedia: "Edgar_Degas_-_In_a_Caf%C3%A9_-_Google_Art_Project_2.jpg" }
		]
	},
	"post-impressionists": {
		name: "Post-Impressionists",
		description: "Bold expressions beyond Impressionism",
		artworks: [
			{ artist: "Vincent van Gogh", title: "The Starry Night", year: "1889", popularity: 99, wikimedia: "Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
			{ artist: "Vincent van Gogh", title: "Sunflowers", year: "1888", popularity: 92, wikimedia: "Vincent_Willem_van_Gogh_128.jpg" },
			{ artist: "Vincent van Gogh", title: "Café Terrace at Night", year: "1888", popularity: 88, wikimedia: "Van_Gogh_-_Terrasse_des_Caf%C3%A9s_an_der_Place_du_Forum_in_Arles_am_Abend1.jpeg" },
			{ artist: "Vincent van Gogh", title: "Bedroom in Arles", year: "1888", popularity: 85, wikimedia: "Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg" },
			{ artist: "Paul Cézanne", title: "Mont Sainte-Victoire", year: "1887", popularity: 81, wikimedia: "Paul_C%C3%A9zanne_-_Mont_Sainte-Victoire_-_Google_Art_Project.jpg" },
			{ artist: "Paul Cézanne", title: "The Card Players", year: "1895", popularity: 77, wikimedia: "Les_Joueurs_de_cartes,_par_Paul_C%C3%A9zanne.jpg" },
			{ artist: "Paul Gauguin", title: "Where Do We Come From?", year: "1897", popularity: 80, wikimedia: "Paul_Gauguin_-_D%27ou_venons-nous.jpg" },
			{ artist: "Paul Gauguin", title: "The Yellow Christ", year: "1889", popularity: 73, wikimedia: "Paul_Gauguin_-_Le_Christ_jaune_(The_Yellow_Christ).jpg" }
		]
	},
	"japanese-masters": {
		name: "Japanese Masters",
		description: "Ukiyo-e woodblock prints",
		artworks: [
			{ artist: "Katsushika Hokusai", title: "The Great Wave off Kanagawa", year: "1831", popularity: 97, wikimedia: "Tsunami_by_hokusai_19th_century.jpg" },
			{ artist: "Katsushika Hokusai", title: "Fine Wind, Clear Morning", year: "1831", popularity: 84, wikimedia: "Red_Fuji_southern_wind_clear_morning.jpg" },
			{ artist: "Katsushika Hokusai", title: "Rainstorm Beneath the Summit", year: "1831", popularity: 78, wikimedia: "Lightnings_below_the_summit.jpg" },
			{ artist: "Utagawa Hiroshige", title: "Plum Estate", year: "1857", popularity: 82, wikimedia: "Hiroshige,_Plum_Park_in_Kameido.jpg" },
			{ artist: "Utagawa Hiroshige", title: "Sudden Shower", year: "1857", popularity: 79, wikimedia: "Hiroshige_-_Sudden_Shower_at_the_Atake_Bridge.jpg" }
		]
	},
	"modern-icons": {
		name: "Modern Icons",
		description: "20th century masterpieces",
		artworks: [
			{ artist: "Pablo Picasso", title: "Guernica", year: "1937", popularity: 94, wikimedia: "Mural_del_Gernika.jpg" },
			{ artist: "Pablo Picasso", title: "Les Demoiselles d'Avignon", year: "1907", popularity: 87, wikimedia: "Les_Demoiselles_d%27Avignon.jpg" },
			{ artist: "Salvador Dalí", title: "The Persistence of Memory", year: "1931", popularity: 93, wikimedia: "The_Persistence_of_Memory.jpg" },
			{ artist: "Gustav Klimt", title: "The Kiss", year: "1908", popularity: 91, wikimedia: "Gustav_Klimt_016.jpg" },
			{ artist: "Gustav Klimt", title: "Portrait of Adele Bloch-Bauer I", year: "1907", popularity: 83, wikimedia: "Gustav_Klimt_046.jpg" },
			{ artist: "Edvard Munch", title: "The Scream", year: "1893", popularity: 95, wikimedia: "Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg" }
		]
	}
};

// Simple in-memory cache for museum API responses
const artSearchCache = new Map();
const ART_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedResult(key) {
	const cached = artSearchCache.get(key);
	if (cached && Date.now() - cached.timestamp < ART_CACHE_TTL) {
		console.log(`Cache hit: ${key}`);
		return cached.data;
	}
	return null;
}

function setCachedResult(key, data) {
	artSearchCache.set(key, {
		data,
		timestamp: Date.now()
	});
	// Limit cache size to 1000 entries
	if (artSearchCache.size > 1000) {
		const firstKey = artSearchCache.keys().next().value;
		artSearchCache.delete(firstKey);
	}
}

/**
 * Get curated collections
 * @returns {Object} The curated collections object
 */
function getCuratedCollections() {
	return CURATED_COLLECTIONS;
}

/**
 * Search for artworks across multiple museum APIs
 * @param {string} query - Search query
 * @param {number} targetCount - Number of results to return
 * @param {number} startOffset - Offset for pagination
 * @returns {Promise<Object>} Search results
 */
async function performArtSearch(query, targetCount = 20, startOffset = 0) {
	const offset = startOffset;

	console.log(`Searching for artworks: "${query}", limit: ${targetCount}, offset: ${offset}`);

	// Art departments to include (paintings, drawings, prints - not decorative objects)
	const artDepartments = [
		"European Paintings",
		"Modern and Contemporary Art",
		"Drawings and Prints",
		"Asian Art",
		"American Paintings and Sculpture",
		"The Robert Lehman Collection",
		"Photographs"
	];

	// Helper function to check if artwork is suitable
	const isOriginalArtwork = (title, classification, objectName, medium) => {
		const lowerTitle = (title || "").toLowerCase();
		const lowerClass = (classification || "").toLowerCase();
		const lowerObject = (objectName || "").toLowerCase();
		const lowerMedium = (medium || "").toLowerCase();

		const allText = `${lowerTitle} ${lowerClass} ${lowerObject} ${lowerMedium}`;

		const hardExcludeTerms = [
			"page from a book",
			"page from an album",
			"photograph of",
			"illustrated book",
			"title page",
			"frontispiece"
		];

		for (const term of hardExcludeTerms) {
			if (allText.includes(term)) {
				console.log(`Filtering out: ${title} (contains "${term}")`);
				return false;
			}
		}

		return true;
	};

	// Helper to search Met Museum
	const searchMet = async () => {
		const cacheKey = `met-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query || "painting")}`;
			console.log(`Searching Met Museum: ${searchUrl}`);

			const searchResponse = await fetch(searchUrl);
			const contentType = searchResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Met API returned non-JSON response (likely rate limited or error)");
				return [];
			}

			const searchData = await searchResponse.json();
			console.log(`Met search found ${searchData.total || 0} total results`);

			if (!searchData.objectIDs || searchData.objectIDs.length === 0) {
				return [];
			}

			const objectIds = searchData.objectIDs.slice(0, targetCount * 10);
			const metArtworks = [];

			for (const objectId of objectIds) {
				if (metArtworks.length >= targetCount) break;

				try {
					const objectUrl = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`;
					const objectResponse = await fetch(objectUrl);

					const objectContentType = objectResponse.headers.get("content-type");
					if (!objectContentType || !objectContentType.includes("application/json")) {
						continue;
					}

					const objectData = await objectResponse.json();
					const hasImage = objectData.primaryImage;
					const isArtDept = artDepartments.includes(objectData.department);
					const isPublicOrMuseumQuality = objectData.isPublicDomain || isArtDept;
					const isOriginal = isOriginalArtwork(
						objectData.title,
						objectData.classification,
						objectData.objectName,
						objectData.medium
					);

					if (hasImage && isPublicOrMuseumQuality && isArtDept && isOriginal) {
						metArtworks.push({
							id: `met-${objectData.objectID}`,
							title: objectData.title || "Untitled",
							artist: objectData.artistDisplayName || "Unknown Artist",
							date: objectData.objectDate || "",
							imageUrl: objectData.primaryImage,
							thumbnailUrl: objectData.primaryImageSmall || objectData.primaryImage,
							department: objectData.department || "",
							culture: objectData.culture || "",
							source: "The Met Museum"
						});
					}
				} catch (error) {
					continue;
				}
			}

			console.log(`Met Museum returned ${metArtworks.length} artworks`);
			setCachedResult(cacheKey, metArtworks);
			return metArtworks;
		} catch (error) {
			console.error("Error searching Met Museum:", error.message);
			return [];
		}
	};

	// Helper to search Art Institute of Chicago
	const searchArtic = async () => {
		const cacheKey = `artic-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const articUrl = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query || "painting")}&limit=${targetCount * 3}&fields=id,title,artist_display,date_display,image_id,is_public_domain,department_title,artwork_type_title,classification_title,medium_display`;
			console.log(`Searching Art Institute of Chicago: ${articUrl}`);

			const articResponse = await fetch(articUrl);
			const contentType = articResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("ARTIC API returned non-JSON response");
				return [];
			}

			const articData = await articResponse.json();
			console.log(`ARTIC search found ${articData.pagination?.total || 0} total results`);

			if (!articData.data || articData.data.length === 0) {
				return [];
			}

			const articArtworks = articData.data
				.filter(artwork => {
					if (!artwork.image_id || !artwork.department_title) {
						return false;
					}
					return isOriginalArtwork(
						artwork.title,
						artwork.classification_title,
						artwork.artwork_type_title,
						artwork.medium_display
					);
				})
				.slice(0, targetCount)
				.map(artwork => ({
					id: `artic-${artwork.id}`,
					title: artwork.title || "Untitled",
					artist: artwork.artist_display || "Unknown Artist",
					date: artwork.date_display || "",
					imageUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/1200,/0/default.jpg`,
					thumbnailUrl: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/400,/0/default.jpg`,
					department: artwork.department_title || "",
					culture: "",
					source: "Art Institute of Chicago"
				}));

			console.log(`ARTIC returned ${articArtworks.length} artworks`);
			setCachedResult(cacheKey, articArtworks);
			return articArtworks;
		} catch (error) {
			console.error("Error searching ARTIC:", error.message);
			return [];
		}
	};

	// Helper to search Cleveland Museum of Art
	const searchCleveland = async () => {
		const cacheKey = `cma-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const cmaUrl = `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query || "painting")}&cc=1&has_image=1&limit=${targetCount * 3}`;
			console.log(`Searching Cleveland Museum: ${cmaUrl}`);

			const cmaResponse = await fetch(cmaUrl);
			const contentType = cmaResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Cleveland API returned non-JSON response");
				return [];
			}

			const cmaData = await cmaResponse.json();
			console.log(`Cleveland search found ${cmaData.info?.total || 0} total results`);

			if (!cmaData.data || cmaData.data.length === 0) {
				return [];
			}

			const cmaArtworks = cmaData.data
				.filter(artwork => {
					if (!artwork.images?.web?.url) return false;
					return isOriginalArtwork(
						artwork.title,
						artwork.type,
						artwork.technique,
						artwork.technique
					);
				})
				.slice(0, targetCount)
				.map(artwork => ({
					id: `cma-${artwork.id}`,
					title: artwork.title || "Untitled",
					artist: artwork.creators?.map(c => c.description).join(", ") || "Unknown Artist",
					date: artwork.creation_date || "",
					imageUrl: artwork.images?.web?.url || "",
					thumbnailUrl: artwork.images?.web?.url || "",
					department: artwork.department || "",
					culture: artwork.culture?.[0] || "",
					source: "Cleveland Museum of Art"
				}));

			console.log(`Cleveland returned ${cmaArtworks.length} artworks`);
			setCachedResult(cacheKey, cmaArtworks);
			return cmaArtworks;
		} catch (error) {
			console.error("Error searching Cleveland Museum:", error.message);
			return [];
		}
	};

	// Helper to search Rijksmuseum
	const searchRijksmuseum = async () => {
		const cacheKey = `rijks-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const rijksUrl = `https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&q=${encodeURIComponent(query || "painting")}&imgonly=true&ps=${targetCount * 2}`;
			console.log(`Searching Rijksmuseum: ${rijksUrl}`);

			const rijksResponse = await fetch(rijksUrl);
			const contentType = rijksResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Rijksmuseum API returned non-JSON response");
				return [];
			}

			const rijksData = await rijksResponse.json();
			console.log(`Rijksmuseum search found ${rijksData.count || 0} total results`);

			if (!rijksData.artObjects || rijksData.artObjects.length === 0) {
				return [];
			}

			const rijksArtworks = rijksData.artObjects
				.filter(artwork => artwork.webImage?.url)
				.slice(0, targetCount)
				.map(artwork => ({
					id: `rijks-${artwork.objectNumber}`,
					title: artwork.title || "Untitled",
					artist: artwork.principalOrFirstMaker || "Unknown Artist",
					date: artwork.longTitle?.match(/\d{4}/)?.[0] || "",
					imageUrl: artwork.webImage?.url || "",
					thumbnailUrl: artwork.headerImage?.url || artwork.webImage?.url || "",
					department: "",
					culture: "",
					source: "Rijksmuseum"
				}));

			console.log(`Rijksmuseum returned ${rijksArtworks.length} artworks`);
			setCachedResult(cacheKey, rijksArtworks);
			return rijksArtworks;
		} catch (error) {
			console.error("Error searching Rijksmuseum:", error.message);
			return [];
		}
	};

	// Helper to search Wikimedia Commons
	const searchWikimedia = async () => {
		const cacheKey = `wikimedia-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const wikimediaUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${query || "painting"} filetype:bitmap`)}&srnamespace=6&srlimit=${targetCount * 3}&format=json&origin=*`;
			console.log(`Searching Wikimedia Commons: ${wikimediaUrl}`);

			const wikimediaResponse = await fetch(wikimediaUrl);
			const contentType = wikimediaResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Wikimedia API returned non-JSON response");
				return [];
			}

			const wikimediaData = await wikimediaResponse.json();
			console.log(`Wikimedia search found ${wikimediaData.query?.search?.length || 0} results`);

			if (!wikimediaData.query?.search || wikimediaData.query.search.length === 0) {
				return [];
			}

			const wikimediaArtworks = [];
			for (const result of wikimediaData.query.search.slice(0, targetCount)) {
				const title = result.title.replace("File:", "");
				if (title.match(/\.(jpg|jpeg|png)$/i)) {
					const artistMatch = title.match(/^([^-]+)/);
					const titleMatch = title.match(/-\s*(.+?)(?:\s*-|\.)/);

					wikimediaArtworks.push({
						id: `wikimedia-${result.pageid}`,
						title: titleMatch?.[1] || title.replace(/\.[^.]+$/, ""),
						artist: artistMatch?.[1]?.trim() || "Unknown Artist",
						date: "",
						imageUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=1200`,
						thumbnailUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=400`,
						department: "",
						culture: "",
						source: "Wikimedia Commons"
					});
				}
			}

			console.log(`Wikimedia returned ${wikimediaArtworks.length} artworks`);
			setCachedResult(cacheKey, wikimediaArtworks);
			return wikimediaArtworks;
		} catch (error) {
			console.error("Error searching Wikimedia:", error.message);
			return [];
		}
	};

	// Helper to search Victoria & Albert Museum
	const searchVictoriaAlbert = async () => {
		const cacheKey = `vam-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const vamUrl = `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(query || "painting")}&images_exist=true&page_size=${targetCount * 2}`;
			console.log(`Searching Victoria & Albert Museum: ${vamUrl}`);

			const vamResponse = await fetch(vamUrl);
			const contentType = vamResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("V&A API returned non-JSON response");
				return [];
			}

			const vamData = await vamResponse.json();
			console.log(`V&A search found ${vamData.info?.record_count || 0} total results`);

			if (!vamData.records || vamData.records.length === 0) {
				return [];
			}

			const vamArtworks = vamData.records
				.filter(artwork => artwork._primaryImageId)
				.slice(0, targetCount)
				.map(artwork => ({
					id: `vam-${artwork.systemNumber}`,
					title: artwork._primaryTitle || "Untitled",
					artist: artwork._primaryMaker?.name || "Unknown Artist",
					date: artwork._primaryDate || "",
					imageUrl: `https://framemark.vam.ac.uk/collections/${artwork._primaryImageId}/full/!1200,1200/0/default.jpg`,
					thumbnailUrl: `https://framemark.vam.ac.uk/collections/${artwork._primaryImageId}/full/!400,400/0/default.jpg`,
					department: "",
					culture: "",
					source: "Victoria & Albert Museum"
				}));

			console.log(`V&A returned ${vamArtworks.length} artworks`);
			setCachedResult(cacheKey, vamArtworks);
			return vamArtworks;
		} catch (error) {
			console.error("Error searching V&A:", error.message);
			return [];
		}
	};

	// Helper to search Harvard Art Museums
	const searchHarvard = async () => {
		const cacheKey = `harvard-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const harvardUrl = `https://api.harvardartmuseums.org/object?apikey=0d2b2e70-e1a4-11ea-8f9e-c3ccf15bc2e2&q=${encodeURIComponent(query || "painting")}&hasimage=1&size=${targetCount * 2}`;
			console.log(`Searching Harvard Art Museums: ${harvardUrl}`);

			const harvardResponse = await fetch(harvardUrl);
			const contentType = harvardResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Harvard API returned non-JSON response");
				return [];
			}

			const harvardData = await harvardResponse.json();
			console.log(`Harvard search found ${harvardData.info?.totalrecords || 0} total results`);

			if (!harvardData.records || harvardData.records.length === 0) {
				return [];
			}

			const harvardArtworks = harvardData.records
				.filter(artwork => artwork.primaryimageurl)
				.slice(0, targetCount)
				.map(artwork => ({
					id: `harvard-${artwork.id}`,
					title: artwork.title || "Untitled",
					artist: artwork.people?.map(p => p.displayname).join(", ") || "Unknown Artist",
					date: artwork.dated || "",
					imageUrl: artwork.primaryimageurl || "",
					thumbnailUrl: artwork.primaryimageurl || "",
					department: artwork.division || "",
					culture: artwork.culture || "",
					source: "Harvard Art Museums"
				}));

			console.log(`Harvard returned ${harvardArtworks.length} artworks`);
			setCachedResult(cacheKey, harvardArtworks);
			return harvardArtworks;
		} catch (error) {
			console.error("Error searching Harvard:", error.message);
			return [];
		}
	};

	// Helper to search Smithsonian
	const searchSmithsonian = async () => {
		const cacheKey = `smithsonian-${query}-${targetCount}`;
		const cached = getCachedResult(cacheKey);
		if (cached) return cached;

		try {
			const smithsonianUrl = `https://api.si.edu/openaccess/api/v1.0/search?q=${encodeURIComponent(query || "painting")}&rows=${targetCount * 2}&api_key=nqVVclBbPSvTQNlHGUTKfwj8xOxnCz7cPf0zQ3Xu`;
			console.log(`Searching Smithsonian: ${smithsonianUrl}`);

			const smithsonianResponse = await fetch(smithsonianUrl);
			const contentType = smithsonianResponse.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				console.error("Smithsonian API returned non-JSON response");
				return [];
			}

			const smithsonianData = await smithsonianResponse.json();
			console.log(`Smithsonian search found ${smithsonianData.response?.rowCount || 0} total results`);

			if (!smithsonianData.response?.rows || smithsonianData.response.rows.length === 0) {
				return [];
			}

			const smithsonianArtworks = smithsonianData.response.rows
				.filter(row => {
					const content = row.content;
					return content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content;
				})
				.slice(0, targetCount)
				.map(row => {
					const content = row.content;
					const title = content.descriptiveNonRepeating?.title?.content || "Untitled";
					const imageUrl = content.descriptiveNonRepeating?.online_media?.media?.[0]?.content || "";

					let artist = "Unknown Artist";
					if (content.freetext?.name) {
						const artistEntry = content.freetext.name.find(n => n.label === "Artist");
						if (artistEntry) artist = artistEntry.content;
					}

					return {
						id: `smithsonian-${row.id}`,
						title,
						artist,
						date: content.freetext?.date?.[0]?.content || "",
						imageUrl,
						thumbnailUrl: imageUrl,
						department: content.freetext?.dataSource?.[0]?.content || "",
						culture: "",
						source: "Smithsonian"
					};
				});

			console.log(`Smithsonian returned ${smithsonianArtworks.length} artworks`);
			setCachedResult(cacheKey, smithsonianArtworks);
			return smithsonianArtworks;
		} catch (error) {
			console.error("Error searching Smithsonian:", error.message);
			return [];
		}
	};

	// Search all sources in parallel with API tracking
	const trackSearch = async (sourceName, searchFunc) => {
		try {
			const results = await searchFunc();
			const success = results && results.length > 0;
			statistics.trackAPICall(sourceName, '/search', success, {
				query: query,
				resultsCount: results?.length || 0
			});
			return results;
		} catch (error) {
			statistics.trackAPICall(sourceName, '/search', false, {
				query: query,
				error: error.message
			});
			return [];
		}
	};

	const [metResults, articResults, cmaResults, rijksResults, wikimediaResults, vamResults, harvardResults, smithsonianResults] = await Promise.all([
		trackSearch('Met Museum', searchMet),
		trackSearch('Art Institute of Chicago', searchArtic),
		trackSearch('Cleveland Museum', searchCleveland),
		trackSearch('Rijksmuseum', searchRijksmuseum),
		trackSearch('Wikimedia Commons', searchWikimedia),
		trackSearch('Victoria & Albert', searchVictoriaAlbert),
		trackSearch('Harvard Art Museums', searchHarvard),
		trackSearch('Smithsonian', searchSmithsonian)
	]);

	// Track source status for user feedback
	const sources = {
		met: { status: metResults.length > 0 ? "ok" : "no_results", count: metResults.length },
		artic: { status: articResults.length > 0 ? "ok" : "no_results", count: articResults.length },
		cleveland: { status: cmaResults.length > 0 ? "ok" : "no_results", count: cmaResults.length },
		rijksmuseum: { status: rijksResults.length > 0 ? "ok" : "no_results", count: rijksResults.length },
		wikimedia: { status: wikimediaResults.length > 0 ? "ok" : "no_results", count: wikimediaResults.length },
		vam: { status: vamResults.length > 0 ? "ok" : "no_results", count: vamResults.length },
		harvard: { status: harvardResults.length > 0 ? "ok" : "no_results", count: harvardResults.length },
		smithsonian: { status: smithsonianResults.length > 0 ? "ok" : "no_results", count: smithsonianResults.length }
	};

	// Ranking function to score artworks
	const scoreArtwork = (artwork) => {
		let score = 0;

		if (artwork._curatedScore !== undefined) {
			return 1000 + artwork._curatedScore;
		}

		const lowerQuery = (query || "").toLowerCase();
		const lowerArtist = (artwork.artist || "").toLowerCase();
		const lowerTitle = (artwork.title || "").toLowerCase();
		const lowerDept = (artwork.department || "").toLowerCase();

		if (lowerArtist.includes(lowerQuery)) score += 10;
		if (lowerTitle.includes(lowerQuery)) score += 5;
		if (lowerDept.includes('painting')) score += 5;
		if (lowerTitle.includes('painting')) score += 3;

		const dateMatch = (artwork.date || "").match(/\d{4}/);
		if (dateMatch) {
			const year = parseInt(dateMatch[0]);
			if (year < 1800) score += 4;
			else if (year < 1900) score += 3;
			else if (year < 1950) score += 2;
		}

		return score;
	};

	// Search curated collections database
	const curatedResults = [];
	const lowerQuery = (query || "").toLowerCase();

	for (const [collectionId, collection] of Object.entries(CURATED_COLLECTIONS)) {
		for (const artwork of collection.artworks) {
			const lowerArtist = artwork.artist.toLowerCase();
			const lowerTitle = artwork.title.toLowerCase();

			if (lowerArtist.includes(lowerQuery) ||
			    lowerTitle.includes(lowerQuery) ||
			    lowerQuery.includes(lowerTitle)) {

				const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${artwork.wikimedia}?width=1200`;
				curatedResults.push({
					title: `${artwork.title} (${artwork.year})`,
					artist: artwork.artist,
					imageUrl: imageUrl,
					thumbnail: imageUrl,
					source: "curated",
					collection: collection.name,
					year: artwork.year,
					popularity: artwork.popularity,
					_curatedScore: artwork.popularity
				});
			}
		}
	}

	if (curatedResults.length > 0) {
		console.log(`Found ${curatedResults.length} curated artworks matching "${query}"`);
	}

	// Merge all results
	const allResults = [
		...curatedResults,
		...metResults,
		...articResults,
		...cmaResults,
		...rijksResults,
		...wikimediaResults,
		...vamResults,
		...harvardResults,
		...smithsonianResults
	];

	// Sort by score
	allResults.forEach(artwork => {
		artwork._score = scoreArtwork(artwork);
	});

	allResults.sort((a, b) => b._score - a._score);

	// Remove internal scoring fields from output
	allResults.forEach(artwork => {
		delete artwork._score;
		delete artwork._curatedScore;
	});

	// Apply offset and limit to sorted results
	const paginatedResults = allResults.slice(offset, offset + targetCount);

	console.log(`Returning ${paginatedResults.length} artworks (Met: ${metResults.length}, ARTIC: ${articResults.length}, CMA: ${cmaResults.length}, Rijks: ${rijksResults.length}, Wikimedia: ${wikimediaResults.length}, V&A: ${vamResults.length}, Harvard: ${harvardResults.length}, Smithsonian: ${smithsonianResults.length})`);

	return {
		results: paginatedResults,
		total: allResults.length,
		hasMore: allResults.length > (offset + targetCount),
		sources: sources
	};
}

module.exports = {
	performArtSearch,
	getCuratedCollections,
	CURATED_COLLECTIONS
};
