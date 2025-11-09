#!/bin/bash
# Setup script for backlight permissions on serverpi
# This allows the Docker container to control the LCD backlight without running as root

set -e

echo "Setting up backlight permissions for Docker container..."

# Create udev rule to make backlight writable by video group
echo "Creating udev rule..."
sudo tee /etc/udev/rules.d/99-backlight.rules > /dev/null << 'EOF'
# Allow members of video group to control backlight brightness
# This is used by the Glance server running in Docker to dim the touchscreen
SUBSYSTEM=="backlight", ACTION=="add", RUN+="/bin/chgrp video /sys/class/backlight/%k/brightness", RUN+="/bin/chmod g+w /sys/class/backlight/%k/brightness"
EOF

echo "Reloading udev rules..."
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=backlight

# Check if backlight device exists and apply permissions immediately
if [ -d /sys/class/backlight ]; then
    echo "Applying permissions to existing backlight devices..."
    for brightness in /sys/class/backlight/*/brightness; do
        if [ -f "$brightness" ]; then
            sudo chgrp video "$brightness"
            sudo chmod g+w "$brightness"
            echo "✓ Set permissions on $brightness"
        fi
    done
else
    echo "⚠ No backlight devices found. Permissions will be applied when device is detected."
fi

echo ""
echo "✅ Backlight permissions configured successfully!"
echo ""
echo "The video group (GID 44) can now control backlight brightness."
echo "The Docker container will run as a non-root user with video group access."
