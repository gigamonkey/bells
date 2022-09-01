all: pretty lint

pretty:
	prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js


publish:
	./publish.sh index.html style.css bells.js bells-qr.png
