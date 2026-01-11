#!/bin/sh
# Downloads DejaVu fonts to fonts/ folder
# Usage: ./download-fonts.sh

cd "$(dirname "$0")"

# Create a fonts folder
mkdir -p ../fonts
cd ../fonts/

# Download the zip file
curl -L -o dejavu-fonts-ttf-2.37.zip https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip

# Extract the zip file
unzip dejavu-fonts-ttf-2.37.zip

mkdir -p dejavu
# Move the ttf files to the fonts folder
mv dejavu-fonts-ttf-2.37/ttf/*.ttf ./dejavu/

# Remove the zip file and the extracted folder
rm -rf dejavu-fonts-ttf-2.37.zip dejavu-fonts-ttf-2.37/
