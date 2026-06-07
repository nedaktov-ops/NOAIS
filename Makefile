# NOAIS Makefile — local test/lint/validate/backup targets.
# No npm. Pure Node 18+ + bash + jq + chromium.

# Resolve to the repo root regardless of where `make` is invoked from.
ROOT := $(shell git rev-parse --show-toplevel)

# Test runner: tests/run.js
TEST_RUNNER := node tests/run.js
HEADLESS := bash tests/headless-integration.sh

# Find all .js files under extension/ for lint.
JS_FILES := $(shell find extension -name '*.js' 2>/dev/null)
HTML_FILES := $(shell find extension -name '*.html' 2>/dev/null)

.PHONY: help test test-headless test-all lint validate backup clean

help:
	@echo "NOAIS make targets:"
	@echo "  make test          - run Node test suite (tests/run.js)"
	@echo "  make test-headless - run headless Chromium integration test"
	@echo "  make test-all      - run both"
	@echo "  make lint          - jq + node --check on all JS/HTML"
	@echo "  make validate      - lint + test-all"
	@echo "  make backup VERSION=vX.Y - copy repo to ~/NOAIS-backups/"
	@echo "  make clean         - remove /tmp test artefacts"

test:
	@$(TEST_RUNNER)

test-headless:
	@$(HEADLESS)

test-all: test test-headless

lint:
	@echo "  jq empty extension/manifest.json"
	@jq empty extension/manifest.json
	@echo "  node --check on all extension JS"
	@for f in $(JS_FILES); do node --check "$$f" || exit 1; done
	@echo "  readability check on all extension HTML"
	@for f in $(HTML_FILES); do node -e "require('fs').readFileSync('$$f', 'utf8')" || exit 1; done
	@echo "  lint: OK"

validate: lint test-all

backup:
	@if [ -z "$(VERSION)" ]; then \
		echo "  usage: make backup VERSION=vX.Y"; \
		exit 2; \
	fi
	@TS=`date +%s`; \
	DEST=/home/nedaktov/NOAIS-backups/NOAIS-$(VERSION)-$$TS; \
	cp -r $(ROOT) $$DEST; \
	echo "  backup created: $$DEST"
	@du -sh /home/nedaktov/NOAIS-backups/NOAIS-$(VERSION)-*

clean:
	@rm -f /tmp/noais-stderr*.log /tmp/noais-*.log
	@echo "  cleaned /tmp test artefacts"
