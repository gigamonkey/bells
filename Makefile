files := index.html
files += style.css
files += manifest.json
files += sw.js
files += out.js
files += out.js.map
files += images/bells-qr.png
files += icons

all: pretty lint

version.js:
	echo "export const version = \"$$(./version.sh)\";" > version.js

build: version.js
	./node_modules/.bin/esbuild.exe bells.js --sourcemap --bundle --format=esm --outfile=out.js

watch: version.js
	./node_modules/.bin/esbuild.exe bells.js --watch --sourcemap --bundle --format=esm --outfile=out.js

pretty:
	npx prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js

release-lib:
	cd lib && npm version patch --no-git-tag-version
	git add lib/package.json lib/package-lock.json
	git commit -m "v$$(node -p "require('./lib/package.json').version")"
	git tag "v$$(node -p "require('./lib/package.json').version")"
	git push --follow-tags

serve:
	cd server && node index.js

publish:
	./publish.sh $(files)

serve:
	npx live-server
# 	npx http-server