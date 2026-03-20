files := index.html
files += style.css
files += manifest.json
files += sw.js
files += out.js
files += out.js.map
files += bells-qr.png
files += calendars.json
files += icons

all: pretty lint

build:
	./node_modules/.bin/esbuild.exe bells.js --sourcemap --bundle --format=esm --outfile=out.js

watch:
	./node_modules/.bin/esbuild.exe bells.js --watch --sourcemap --bundle --format=esm --outfile=out.js

pretty:
	npx prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js


publish:
	./publish.sh $(files)

serve:
	npx live-server
# 	npx http-server