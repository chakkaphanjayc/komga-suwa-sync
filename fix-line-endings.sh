#!/bin/bash

# =================================================================
# Fix Line Endings Script
# =================================================================
# This script fixes Windows line endings (CRLF) that can cause issues on Linux
# Run with: ./fix-line-endings.sh

set -e

echo "Fixing line endings for shell scripts..."

# Fix all .sh files
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} \;

echo "Line endings fixed!"
echo ""
echo "You can now run:"
echo "  ./simple-deploy.sh production"
