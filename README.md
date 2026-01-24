# Marathon Calendar

## Crawler System

The crawler module is responsible for retrieving data from various sources for the marathon calendar. It supports different types of crawlers defined in the `crawler/types.ts`. These types include:

- `Type1`: Description of Type1.
- `Type2`: Description of Type2.

## Schema Extensions

New schema extensions have been added in `shared/schema-extensions.ts` for enhanced data tracking, change detection, and logging, including:

- **DataTracking**: This extension provides functionalities for tracking changes in data over time.
- **ChangeDetection**: An extension that allows detection of any changes in the data, ensuring consistency and accuracy.
- **Logging**: Improved logging utilities for tracking operations and errors.

## Usage Instructions

To use the crawler system:
1. Import the required modules from `crawler/types.ts`.
2. Initialize the desired crawler type with appropriate parameters.
3. Call the crawler functions to fetch and process data.

Refer to the specific documentation for each type for further details on their usage.