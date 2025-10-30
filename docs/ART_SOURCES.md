# Art Sources

Documentation of museum APIs integrated into Glance for art discovery.

## Currently Implemented Sources

### 1. Metropolitan Museum of Art
- **Status**: ✅ Active
- **Collection Size**: 470,000+ artworks
- **API Key**: Not required
- **License**: CC0 (public domain)
- **Endpoint**: `https://collectionapi.metmuseum.org/public/collection/v1`
- **Documentation**: https://metmuseum.github.io/
- **Notes**: One of the largest open access collections, excellent image quality

### 2. Art Institute of Chicago (ARTIC)
- **Status**: ✅ Active
- **Collection Size**: 120,000+ artworks
- **API Key**: Not required
- **License**: CC0 (public domain)
- **Endpoint**: `https://api.artic.edu/api/v1`
- **Documentation**: https://www.artic.edu/open-access/public-api
- **Notes**: IIIF image API, great Impressionist and Modern art collection

### 3. Cleveland Museum of Art
- **Status**: ✅ Active
- **Collection Size**: 64,000+ artworks (37,000+ with images)
- **API Key**: Not required
- **License**: CC0 (public domain)
- **Endpoint**: `https://openaccess-api.clevelandart.org/api`
- **Documentation**: https://openaccess-api.clevelandart.org/
- **Notes**: Strong European paintings collection

### 4. Rijksmuseum
- **Status**: ✅ Active
- **Collection Size**: 800,000+ objects
- **API Key**: Required (currently hardcoded: `0fiuZFh4`)
- **License**: CC0 for public domain works
- **Endpoint**: `https://www.rijksmuseum.nl/api/en/collection`
- **Documentation**: https://data.rijksmuseum.nl/
- **Notes**: Dutch Golden Age masterpieces, Rembrandt, Vermeer

### 5. Wikimedia Commons
- **Status**: ✅ Active
- **Collection Size**: Millions of images
- **API Key**: Not required
- **License**: Various (primarily CC)
- **Endpoint**: `https://commons.wikimedia.org/w/api.php`
- **Documentation**: https://www.mediawiki.org/wiki/API
- **Notes**: Category-based search, good for famous artists

## Planned Additions

### Harvard Art Museums
- **Collection Size**: 250,000+ objects
- **API Key**: Required (free registration)
- **License**: Mixed (check per object)
- **Endpoint**: `https://api.harvardartmuseums.org/`
- **Documentation**: https://harvardartmuseums.org/collections/api
- **Value**: Comprehensive academic collection, strong Asian and European art
- **Registration**: https://docs.google.com/forms/d/e/1FAIpQLSfkmEBqH76HLMMiCC-GPPnhcvHC9aJS86E32dOd0Z8MpY2rvQ/viewform

### Smithsonian Open Access
- **Collection Size**: 11+ million records
- **API Key**: Required (free registration via api.data.gov)
- **License**: CC0 for open access items
- **Endpoint**: `https://api.si.edu/openaccess/api/v1.0`
- **Documentation**: https://www.si.edu/openaccess/devtools
- **Value**: Massive collection across 19 museums, American art focus
- **Registration**: https://api.data.gov/signup/

### Victoria & Albert Museum (V&A)
- **Collection Size**: 1+ million records (500,000+ images)
- **API Key**: Not required for non-commercial
- **License**: Free for personal/educational use
- **Endpoint**: `https://api.vam.ac.uk/v2`
- **Documentation**: https://developers.vam.ac.uk/
- **Value**: Design, decorative arts, fashion, British collections
- **Note**: Commercial use requires license

### Cooper Hewitt (Smithsonian Design Museum)
- **Collection Size**: 215,000+ items
- **API Key**: Required (free registration)
- **License**: CC0 for public domain works
- **Endpoint**: `https://api.collection.cooperhewitt.org/rest/`
- **Documentation**: https://collection.cooperhewitt.org/api/
- **Value**: Design-focused collection, furniture, posters, textiles
- **Note**: GraphQL API available

## Source Selection Criteria

When evaluating new art sources, we consider:

1. **Open Access**: Free API with no commercial restrictions
2. **Image Quality**: High-resolution images available
3. **Collection Quality**: Authentic artworks, not reproductions
4. **API Reliability**: Stable, documented, maintained
5. **Search Capability**: Good search and filtering options
6. **License**: CC0 or similar permissive licensing
7. **Coverage**: Unique artworks not duplicated in other sources

## Implementation Notes

### API Key Management
- Store API keys in `.env` file
- Never commit keys to repository
- Support fallback if API key is missing
- Rate limit requests appropriately

### Caching Strategy
- Cache results for 5 minutes in memory
- Reduces API load and improves response time
- Cache key format: `{source}-{query}-{targetCount}`

### Search Parallelization
- Query all sources simultaneously using `Promise.all()`
- Combine results with smart ranking algorithm
- Deduplicate similar artworks across sources

### Ranking Algorithm
Current scoring (from highest to lowest):
1. Exact artist match: +10 points
2. Title match: +5 points
3. Department/category match: +3 points
4. Source diversity bonus
5. Image quality indicators

## Future Enhancements

- [ ] Add more European museums (Louvre, Uffizi, etc.)
- [ ] Support museum-specific advanced filters
- [ ] Track source performance and reliability
- [ ] Add user preference for source weighting
- [ ] Implement source-specific optimizations
- [ ] Cache popular queries in Redis for production
- [ ] Add source badges in UI to show artwork origin
