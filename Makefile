SHELL := /bin/bash
APP_HOME ?= $(or $(HERDR_APP_HOME),$(HOME)/.config/herdr-app)

.DEFAULT_GOAL := help
.PHONY: help install uninstall test check shot

help:
	@echo "make install    copy the mods into $(APP_HOME), bind keys, seed the config"
	@echo "make uninstall  remove the mods (to the Trash) and their keys; the config stays"
	@echo "make test       Python and JS unit tests (fingers)"
	@echo "make check      herdr-app check on the installed mods"
	@echo "make shot       save the window to docs/fingers-native/preview.png"

install:
	@scripts/install.sh

uninstall:
	@scripts/uninstall.sh

test:
	/usr/bin/python3 -I tests/test_fingers.py
	node --test tests/fuzzy.test.mjs tests/editor.test.mjs

check:
	@for m in mods/*/; do herdr-app check "$(APP_HOME)/mods/$$(basename $$m)"; done

shot:
	herdr-app shot "$(CURDIR)/docs/fingers-native/preview.png"
