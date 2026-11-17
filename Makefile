SHELL := /bin/bash
APP_HOME ?= $(or $(HERDR_APP_HOME),$(HOME)/.config/herdr-app)

.DEFAULT_GOAL := help
.PHONY: help install uninstall test check

help:
	@echo "make install    copy every */mods/* into $(APP_HOME), bind keys, seed the config (re-run to update)"
	@echo "make uninstall  remove the mods (to the Trash) and their keys; the config stays"
	@echo "make test       Python and JS unit tests (fingers)"
	@echo "make check      herdr-app check on the installed mods"

install:
	@scripts/install.sh

uninstall:
	@scripts/uninstall.sh

test:
	/usr/bin/python3 -I fingers/tests/test_fingers.py
	node --test fingers/tests/fuzzy.test.mjs fingers/tests/editor.test.mjs

check:
	@for m in */mods/*/; do herdr-app check "$(APP_HOME)/mods/$$(basename $$m)"; done
