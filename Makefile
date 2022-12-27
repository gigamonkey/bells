files := index.html
files += style.css
files += bells.js
files += calendar.js
files += datetime.js
files += bells-qr.png
files += calendars.json

all: pretty lint

pretty:
	prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js


publish:
	./publish.sh index.html style.css bells.js
