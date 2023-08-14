files := index.html
files += style.css
files += out.js
files += out.js.map
files += bells-qr.png
files += calendars.json

all: pretty lint

build:
	./node_modules/.bin/esbuild bells.js --sourcemap --bundle --format=esm --outfile=out.js

watch:
	./node_modules/.bin/esbuild bells.js --watch --sourcemap --bundle --format=esm --outfile=out.js

pretty:
	prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js


publish:
	./publish.sh $(files)
