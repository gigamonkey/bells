files := index.html
files += fonts
files += images
files += manifest.json
files += online-check.txt
files += out.js
files += out.js.map
files += style.css
files += sw.js

VERSION := patch

all: pretty lint

version.js:
	echo "export const version = \"$$(./version.sh)\";" > version.js

build: version.js
	npx esbuild bells.js --sourcemap --bundle --format=esm --outfile=out.js
	@hash="$$(cat out.js style.css index.html manifest.json | shasum | awk '{print $$1}' | cut -c1-12)"; \
	sed "s|__CACHE_NAME__|bells-$$hash|" sw.js.template > sw.js; \
	echo "Generated sw.js with cache_name bells-$$hash"

watch: version.js
	npx esbuild bells.js --watch --sourcemap --bundle --format=esm --outfile=out.js

pretty:
	npx prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js

release-lib:
	cd lib && npm version $(VERSION) --no-git-tag-version
	git add lib/package.json lib/package-lock.json
	git commit -m "v$$(node -p "require('./lib/package.json').version")"
	git tag "v$$(node -p "require('./lib/package.json').version")"
	git push --follow-tags

release-bhs-calendars:
	cd bhs-calendars && npm version $(VERSION) --no-git-tag-version
	git add bhs-calendars/package.json
	git commit -m "calendars-v$$(node -p "require('./bhs-calendars/package.json').version")"
	git tag "calendars-v$$(node -p "require('./bhs-calendars/package.json').version")"
	git push --follow-tags

serve:
	cd server && node index.js

publish: build
	./publish.sh $(files)

live:
	npx live-server --host=0.0.0.0
