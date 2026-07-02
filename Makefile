files := index.html
files += fonts
files += images
files += manifest.json
files += online-check.txt
files += out.js
files += out.js.map
files += style.css
files += sw.js

# Bump level passed to `npm version` by the release-* targets. Defaults to a
# patch bump; override on the command line, e.g.:
#   make release-lib VERSION=minor
#   make release-bhs-calendars VERSION=major
# Accepts any `npm version` argument: major | minor | patch | premajor |
# preminor | prepatch | prerelease, or an explicit version like 1.4.2.
VERSION := patch

all: pretty lint

version.js:
	echo "export const version = \"$$(./version.sh)\";" > version.js

build: version.js
	node build.mjs

watch: version.js
	node build.mjs --watch

pretty:
	npx prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js

# Run all three library test suites, including the cross-implementation
# golden tests in libs/golden/.
test-libs:
	cd libs/ts && npm test
	cd libs/python && python3 -m pytest
	cd libs/java && mvn -q test

# Regenerate libs/golden/expected/ from the TypeScript reference
# implementation. Review the diff before committing — a change in expected/
# is a semantic change to the library. See libs/golden/README.md.
golden-generate:
	cd libs/ts && npm run golden:generate
	git status --short libs/golden/expected/

# Copy the canonical bhs-calendars JSON (repo-root bhs-calendars/, the npm
# package source) into the Python and Java data packages. These copies are
# gitignored build inputs, not committed — the build/test/release flows (and CI)
# materialize them from the single source so they can never drift. Run this
# before building or testing those packages locally. The `*-*.json` glob matches
# the year files and skips package.json.
sync-py-calendars:
	mkdir -p libs/python-calendars/bhs_calendars/data
	rm -f libs/python-calendars/bhs_calendars/data/*.json
	cp bhs-calendars/*-*.json libs/python-calendars/bhs_calendars/data/

sync-java-calendars:
	mkdir -p libs/java-bhs-calendars/src/main/resources/bhs-calendars
	rm -f libs/java-bhs-calendars/src/main/resources/bhs-calendars/*.json
	cp bhs-calendars/*-*.json libs/java-bhs-calendars/src/main/resources/bhs-calendars/
	cd libs/java-bhs-calendars/src/main/resources/bhs-calendars && ls *.json | LC_ALL=C sort > index.txt

sync-calendars: sync-py-calendars sync-java-calendars

# The three ports of each library share a version. `npm version` bumps the
# TypeScript/npm port and computes the new number; scripts/set-version.py then
# propagates that concrete version to the Python and Java ports. The library and
# the bhs-calendars data package version independently of each other.
release-lib:
	cd libs/ts && npm version $(VERSION) --no-git-tag-version
	python3 scripts/set-version.py lib "$$(node -p "require('./libs/ts/package.json').version")"
	git add libs/ts/package.json libs/ts/package-lock.json libs/python/pyproject.toml libs/java/pom.xml libs/java-bhs-calendars/pom.xml
	git commit -m "v$$(node -p "require('./libs/ts/package.json').version")"
	tag="v$$(node -p "require('./libs/ts/package.json').version")" && git tag -a -m "$$tag" "$$tag"
	git push --follow-tags

# Validate the canonical calendar source with the same TS validator the publish
# workflow gates on. Fails (non-zero) on any invalid calendar. The bundled copies
# are verbatim, build-time copies of these files, so validating the source covers
# what gets published. The `*-YYYY-YYYY.json` glob skips package.json.
validate-calendars:
	cd libs/ts && npm install && npm run build
	node libs/ts/dist/bin/validate.js bhs-calendars/*-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9].json

# Validate the source, then bump versions and commit. The bundled data copies are
# gitignored and regenerated from the source at build time (CI runs the sync), so
# only the source data and version files are committed here.
release-bhs-calendars:
	$(MAKE) validate-calendars
	cd bhs-calendars && npm version $(VERSION) --no-git-tag-version
	python3 scripts/set-version.py calendars "$$(node -p "require('./bhs-calendars/package.json').version")"
	git add bhs-calendars/package.json bhs-calendars/*-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9].json \
		libs/python-calendars/pyproject.toml libs/java-bhs-calendars/pom.xml
	git commit -m "calendars-v$$(node -p "require('./bhs-calendars/package.json').version")"
	tag="calendars-v$$(node -p "require('./bhs-calendars/package.json').version")" && git tag -a -m "$$tag" "$$tag"
	git push --follow-tags

local-deps:
	npm i ./libs/ts
	npm i ./bhs-calendars

real-deps:
	npm i @peterseibel/bells@latest
	npm i @peterseibel/bhs-calendars@latest

serve:
	cd server && node index.js

publish: build
	./publish.sh $(files)

live:
	npx live-server --host=0.0.0.0
