#!/bin/sh
# Mock CLI script for integration tests
# Simulates AI CLI by creating a file modification in the current directory
echo "export function hello() { return 'world'; }" > generated.ts
echo "Mock CLI executed successfully for: $*"
exit 0
