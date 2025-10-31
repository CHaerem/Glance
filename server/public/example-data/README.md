# Example Data for Demo/Testing

This directory contains example data files used for:
- GitHub Pages preview/demo of the collection interface
- Local testing without a running backend server
- UI development and testing

## Files

- **my-collection-demo.json** - Combined collection data (generated images + external artworks)
- **history.json** - Example generated/uploaded images (reference only)
- **my-collection.json** - Example external artworks from museums (reference only)

## Usage

The frontend automatically falls back to loading `my-collection-demo.json` when the API is not available (e.g., when viewing on GitHub Pages or when the backend server is not running).

## Thumbnails

Thumbnails are inline SVG images (as data URLs) with colored backgrounds and text labels. This keeps the files small and self-contained for demo purposes.
