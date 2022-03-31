all: pretty lint

pretty:
	prettier -w --print-width 120 *.js
	tidy -i -q -w 80 -m *.html

lint:
	npx eslint *.js


publish:
	cp index.html style.css bells.js ~/web/www.gigamonkeys.com/misc/bhs
