import os
import json
import requests
from PIL import Image
from io import BytesIO
import cairosvg
from collections import Counter

# Directory paths
FLAGS_DIR = "server/flags"
INFO_DIR = "server/info"

# Base URL for the REST Countries API
REST_COUNTRIES_API = "https://restcountries.com/v3.1/all"

# Ensure directories exist
os.makedirs(FLAGS_DIR, exist_ok=True)
os.makedirs(INFO_DIR, exist_ok=True)

def fetch_and_save_flags():
    try:
        # Fetch all country data
        print("Fetching data from REST Countries API...")
        response = requests.get(REST_COUNTRIES_API, verify=False)
        response.raise_for_status()
        countries = response.json()

        index_data = []
        screen_width = 800  # E-Ink display width
        screen_height = 480  # E-Ink display height

        for country in countries:
            try:
                # Extract relevant data
                country_name = country.get("name", {}).get("common", "Unknown")
                official_name = country.get("name", {}).get("official", "Unknown")
                flag_url = country.get("flags", {}).get("svg", "")
                population = country.get("population", 0)
                area = country.get("area", 0)
                capital = country.get("capital", ["Unknown"])[0]
                region = country.get("region", "Unknown")
                subregion = country.get("subregion", "Unknown")
                languages = ", ".join(country.get("languages", {}).values())
                currencies = ", ".join(
                    f"{details.get('name')} ({code})"
                    for code, details in country.get("currencies", {}).items()
                )
                timezone = ", ".join(country.get("timezones", []))
                borders = ", ".join(country.get("borders", []))

                # Create a safe identifier for each country
                country_id = country_name.lower().replace(" ", "_")

                # Check if the flag is already fetched and verify resolution
                bmp_path = os.path.join(FLAGS_DIR, f"{country_id}.bmp")
                flag_needs_update = False

                if os.path.exists(bmp_path):
                    try:
                        with Image.open(bmp_path) as img:
                            width, height = img.size
                            pixels = img.getdata()

                            # Check if the resolution matches
                            if width != screen_width or height != screen_height:
                                print(f"Flag for {country_name} has incorrect resolution ({width}x{height}). Updating...")
                                flag_needs_update = True
                            else:
                                # Check if the flag content fills the canvas
                                pixel_counts = Counter(pixels)
                                background_color = (255, 255, 255)  # Assuming white background
                                non_background_pixels = sum(count for color, count in pixel_counts.items() if color != background_color)

                                if non_background_pixels / (width * height) < 0.5:
                                    print(f"Flag for {country_name} appears too small on the canvas. Updating...")
                                    flag_needs_update = True
                                else:
                                    print(f"Flag for {country_name} already exists with correct resolution and content. Skipping...")
                    except Exception as e:
                        print(f"Failed to validate existing flag for {country_name}: {e}. Updating...")
                        flag_needs_update = True
                else:
                    flag_needs_update = True

                if flag_needs_update:
                    # Fetch and process flag
                    print(f"Fetching flag for {country_name}...")
                    flag_response = requests.get(flag_url, verify=False)
                    flag_response.raise_for_status()

                    if flag_url.endswith(".svg"):
                        png_data = cairosvg.svg2png(
                            bytestring=flag_response.content,
                            output_width=screen_width,
                            output_height=screen_height
                        )
                        img = Image.open(BytesIO(png_data))
                    else:
                        img = Image.open(BytesIO(flag_response.content))

                    img.thumbnail((screen_width, screen_height), Image.LANCZOS)

                    canvas = Image.new("RGB", (screen_width, screen_height), (255, 255, 255))
                    x_offset = (screen_width - img.width) // 2
                    y_offset = (screen_height - img.height) // 2
                    canvas.paste(img, (x_offset, y_offset))
                    canvas.save(bmp_path, format="BMP")

                # Save metadata as JSON
                metadata = {
                    "country": country_name,
                    "official_name": official_name,
                    "population": population,
                    "area": area,
                    "capital": capital,
                    "region": region,
                    "subregion": subregion,
                    "languages": languages,
                    "currencies": currencies,
                    "timezones": timezone,
                    "borders": borders
                }
                json_path = os.path.join(INFO_DIR, f"{country_id}.json")
                with open(json_path, "w") as json_file:
                    json.dump(metadata, json_file, indent=4)

                index_data.append(f"{country_id}.json")
                print(f"Successfully processed {country_name}!")

            except Exception as e:
                print(f"Failed to process {country.get('name', {}).get('common', 'Unknown')}: {e}")

        index_path = os.path.join(INFO_DIR, "index.json")
        with open(index_path, "w") as index_file:
            json.dump(index_data, index_file, indent=4)
        print("index.json created successfully!")

    except Exception as e:
        print(f"Failed to fetch data from REST Countries API: {e}")

if __name__ == "__main__":
    fetch_and_save_flags()